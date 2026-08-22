import Foundation

/// Schema constants for export/import compatibility.
public enum ControlTowerSchema {
    /// Bump when the persisted shape changes; add a migration step alongside.
    public static let currentVersion = 1
}

/// Versioned envelope for a full portfolio export. This is the *only* shape
/// external storage should persist; domain types stay free of storage
/// concerns behind this boundary.
public struct PortfolioExport: Codable, Sendable {
    public var schemaVersion: Int
    public var projects: [Project]
    public var decisions: [Decision]
    public var events: [ProjectEvent]

    public init(schemaVersion: Int = ControlTowerSchema.currentVersion,
                projects: [Project], decisions: [Decision], events: [ProjectEvent]) {
        self.schemaVersion = schemaVersion
        self.projects = projects
        self.decisions = decisions
        self.events = events
    }
}

/// Result of an import: a registry when the payload was usable, plus
/// diagnostics either way. Invalid domain state is never silently repaired.
public struct ImportResult: Sendable {
    public var registry: ProjectRegistry?
    public var diagnostics: [Diagnostic]

    public var isUsable: Bool { registry != nil }
    /// True when the imported data validated with no error-level findings.
    public var isClean: Bool {
        registry != nil && !diagnostics.contains { $0.severity >= .error }
    }
}

public enum CodecError: Error, Equatable, Sendable, CustomStringConvertible {
    case malformedJSON(String)
    case unsupportedSchemaVersion(found: Int, supported: ClosedRange<Int>)
    case duplicateProjectIDs([String])
    case migrationFailed(fromVersion: Int, detail: String)

    public var description: String {
        switch self {
        case .malformedJSON(let d): return "Malformed JSON: \(d)"
        case .unsupportedSchemaVersion(let found, let supported):
            return "Schema version \(found) unsupported (supported: \(supported.lowerBound)...\(supported.upperBound))."
        case .duplicateProjectIDs(let ids): return "Duplicate project ids: \(ids.joined(separator: ", "))."
        case .migrationFailed(let v, let d): return "Migration from v\(v) failed: \(d)"
        }
    }
}

/// JSON boundary for the whole package: export, import, validation and
/// schema migration. Deterministic output (sorted keys, ISO-8601 dates).
public enum ControlTowerCodec {
    public static let supportedVersions = 0...ControlTowerSchema.currentVersion

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    // MARK: Export

    public static func export(_ registry: ProjectRegistry) throws -> Data {
        let payload = PortfolioExport(
            projects: registry.allProjects,
            decisions: registry.decisions.values.sorted { $0.id < $1.id },
            events: registry.events
        )
        return try encoder().encode(payload)
    }

    public static func export(project: Project) throws -> Data {
        try encoder().encode(project)
    }

    // MARK: Import

    /// Decodes, migrates old schema versions forward, rebuilds a registry
    /// and validates it. Returns diagnostics rather than repairing state.
    public static func importPortfolio(from data: Data) throws -> ImportResult {
        // Read the version first so migrations can run on raw JSON.
        guard let raw = try? JSONSerialization.jsonObject(with: data),
              var dict = raw as? [String: Any] else {
            throw CodecError.malformedJSON("top level is not an object")
        }
        let version = dict["schemaVersion"] as? Int ?? 0
        guard supportedVersions.contains(version) else {
            throw CodecError.unsupportedSchemaVersion(found: version, supported: supportedVersions)
        }
        if version < ControlTowerSchema.currentVersion {
            dict = try SchemaMigrator.migrate(dict, from: version)
        }

        let migratedData = try JSONSerialization.data(withJSONObject: dict)
        let payload: PortfolioExport
        do {
            payload = try decoder().decode(PortfolioExport.self, from: migratedData)
        } catch {
            throw CodecError.malformedJSON(String(describing: error))
        }

        // Duplicate IDs are structural corruption: refuse the import.
        var seen = Set<ProjectID>()
        var duplicates: [String] = []
        for project in payload.projects where !seen.insert(project.id).inserted {
            duplicates.append(project.id.rawValue)
        }
        guard duplicates.isEmpty else { throw CodecError.duplicateProjectIDs(duplicates) }

        var registry = ProjectRegistry()
        for project in payload.projects { registry.insertUnchecked(project) }
        registry.restoreDecisions(payload.decisions)
        registry.restoreEvents(payload.events)

        let diagnostics = ConflictDetector.validate(registry)
        return ImportResult(registry: registry, diagnostics: diagnostics)
    }
}

extension ProjectRegistry {
    /// Restores decisions from an import payload (internal: codec only).
    internal mutating func restoreDecisions(_ list: [Decision]) {
        for decision in list { restoreDecisionUnchecked(decision) }
    }

    internal mutating func restoreEvents(_ list: [ProjectEvent]) {
        restoreEventsUnchecked(list)
    }
}

// MARK: - Schema migration

/// Deterministic, testable migration pipeline. Each step lifts raw JSON one
/// version forward; steps compose in order. Kept deliberately simple — this
/// is not a general migration framework.
public enum SchemaMigrator {
    public typealias Step = @Sendable (_ payload: [String: Any]) throws -> [String: Any]

    /// Step at index i migrates version i -> i+1.
    public static let steps: [Step] = [migrateV0toV1]

    public static func migrate(_ payload: [String: Any], from version: Int) throws -> [String: Any] {
        var current = payload
        var v = version
        while v < ControlTowerSchema.currentVersion {
            guard v >= 0 && v < steps.count else {
                throw CodecError.migrationFailed(fromVersion: v, detail: "no migration step registered")
            }
            current = try steps[v](current)
            v += 1
        }
        current["schemaVersion"] = ControlTowerSchema.currentVersion
        return current
    }

    /// v0 -> v1: legacy portfolios predate risks, review gates, milestones,
    /// decision/event registers and per-project schema versions. Fill the
    /// missing collections with empty defaults; never invent content.
    @Sendable
    static func migrateV0toV1(_ payload: [String: Any]) throws -> [String: Any] {
        var out = payload
        var projects = out["projects"] as? [[String: Any]] ?? []
        for index in projects.indices {
            var project = projects[index]
            for key in ["risks", "reviewGates", "milestones", "blockers", "dependencies", "files"]
            where project[key] == nil {
                project[key] = [] as [Any]
            }
            if project["schemaVersion"] == nil { project["schemaVersion"] = 1 }
            if project["currentStage"] == nil { project["currentStage"] = "" }
            if project["priority"] == nil { project["priority"] = Priority.medium.rawValue }
            if project["updatedAt"] == nil, let created = project["createdAt"] {
                project["updatedAt"] = created
            }
            projects[index] = project
        }
        out["projects"] = projects
        if out["decisions"] == nil { out["decisions"] = [] as [Any] }
        if out["events"] == nil { out["events"] = [] as [Any] }
        return out
    }
}
