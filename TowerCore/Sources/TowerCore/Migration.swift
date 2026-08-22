import Foundation

/// Deterministic schema migration for TowerCore's own export format.
/// Each step lifts raw JSON one version forward; import runs the steps,
/// then decodes, then guarded-replay validates. Deliberately minimal —
/// not a framework.
public enum SchemaSteps {
    public static let supportedVersions = 0...TowerExport.currentSchemaVersion

    /// v0 -> v1: early exports carried a single `at` timestamp per event
    /// (no bitemporal split). Fill both timestamps from it.
    static func migrateV0toV1(_ payload: [String: Any]) -> [String: Any] {
        var out = payload
        var events = out["events"] as? [[String: Any]] ?? []
        for i in events.indices {
            if events[i]["recordedAt"] == nil, let at = events[i]["at"] {
                events[i]["recordedAt"] = at
            }
            if events[i]["effectiveAt"] == nil {
                events[i]["effectiveAt"] = events[i]["recordedAt"]
            }
            events[i]["at"] = nil
        }
        out["events"] = events
        return out
    }

    public static func migrate(_ payload: [String: Any], from version: Int) throws -> [String: Any] {
        var current = payload
        var v = version
        while v < TowerExport.currentSchemaVersion {
            switch v {
            case 0: current = migrateV0toV1(current)
            default: throw TowerCodecError.unsupportedSchemaVersion(v)
            }
            v += 1
        }
        current["schemaVersion"] = TowerExport.currentSchemaVersion
        return current
    }
}
