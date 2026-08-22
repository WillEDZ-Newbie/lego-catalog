import Foundation

// MARK: - Lifecycle status

/// Stored lifecycle *intent* of a project.
///
/// Deliberately narrow: conditions such as "blocked", "awaiting review",
/// "stale" or "at risk" are **derived** by `HealthEngine` from evidence
/// (blockers, dependencies, review gates, timestamps) rather than stored,
/// so status and reality cannot silently disagree. Stage labels such as
/// "stabilisation" belong in `Project.currentStage`.
public enum ProjectStatus: String, Codable, CaseIterable, Sendable {
    case notStarted
    case active
    case dormant
    case completed
    case cancelled
    case archived

    /// Allowed lifecycle transitions. Anything not listed is rejected by the
    /// registry with `RegistryError.invalidStatusTransition`.
    public func canTransition(to target: ProjectStatus) -> Bool {
        guard self != target else { return false }
        switch (self, target) {
        case (.notStarted, .active),
             (.notStarted, .cancelled),
             (.notStarted, .archived),
             (.active, .dormant),
             (.active, .completed),
             (.active, .cancelled),
             (.active, .archived),
             (.dormant, .active),
             (.dormant, .cancelled),
             (.dormant, .archived),
             (.completed, .archived),
             (.completed, .active),      // deliberate reopen
             (.cancelled, .archived),
             (.archived, .active):       // explicit reactivation
            return true
        default:
            return false
        }
    }

    /// Statuses in which a project no longer takes part in day-to-day work.
    public var isTerminal: Bool {
        self == .completed || self == .cancelled || self == .archived
    }
}

// MARK: - Priority

public enum Priority: String, Codable, CaseIterable, Sendable, Comparable {
    case critical, high, medium, low

    /// Ranking weight: higher is more urgent.
    public var weight: Int {
        switch self {
        case .critical: return 4
        case .high:     return 3
        case .medium:   return 2
        case .low:      return 1
        }
    }

    public static func < (lhs: Priority, rhs: Priority) -> Bool {
        lhs.weight < rhs.weight
    }
}

// MARK: - Ownership

/// Who is responsible for the next meaningful step (not who created the work).
public enum Owner: Codable, Hashable, Sendable {
    case user
    case chatGPT
    case grok
    case claude
    case tool(name: String)
    case mixed([Owner])

    /// A short stable display name.
    public var label: String {
        switch self {
        case .user: return "user"
        case .chatGPT: return "chatGPT"
        case .grok: return "grok"
        case .claude: return "claude"
        case .tool(let name): return "tool:\(name)"
        case .mixed(let owners): return "mixed(" + owners.map(\.label).joined(separator: ",") + ")"
        }
    }

    /// Whether `owner` participates in this ownership (directly or inside `.mixed`).
    public func involves(_ owner: Owner) -> Bool {
        if self == owner { return true }
        if case .mixed(let owners) = self {
            return owners.contains { $0.involves(owner) }
        }
        return false
    }

    /// True when a human decision is required from this owner.
    public var involvesUser: Bool { involves(.user) }
}

// MARK: - Dependencies

/// Typed dependency edge kinds.
public enum DependencyKind: String, Codable, CaseIterable, Sendable {
    /// Prerequisite must complete before the dependent can proceed.
    case blocks
    /// Dependent requires the prerequisite's output; also blocking.
    case requires
    /// Informational relationship; never blocks.
    case informs
    /// The dependent reviews the prerequisite; never blocks the dependent.
    case reviewOf

    /// Whether an incomplete prerequisite of this kind prevents progress.
    public var isBlocking: Bool {
        switch self {
        case .blocks, .requires: return true
        case .informs, .reviewOf: return false
        }
    }
}

/// A dependency stored on the *dependent* project pointing at its prerequisite.
public struct Dependency: Codable, Hashable, Sendable {
    public var prerequisite: ProjectID
    public var kind: DependencyKind

    public init(on prerequisite: ProjectID, kind: DependencyKind = .blocks) {
        self.prerequisite = prerequisite
        self.kind = kind
    }
}

// MARK: - File references

/// Reference to an externally managed file or artefact. Identifiers only —
/// this package never touches a filesystem.
public struct FileReference: Codable, Hashable, Sendable {
    public var identifier: String
    public var note: String?

    public init(identifier: String, note: String? = nil) {
        self.identifier = identifier
        self.note = note
    }
}

// MARK: - Severity scales

/// Shared low/medium/high scale used by risks.
public enum Level: String, Codable, CaseIterable, Sendable, Comparable {
    case low, medium, high

    public var score: Int {
        switch self {
        case .low: return 1
        case .medium: return 2
        case .high: return 3
        }
    }

    public static func < (lhs: Level, rhs: Level) -> Bool { lhs.score < rhs.score }
}
