#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// Deterministic schema migration for TowerCore's own export format, on the
/// package's portable JSONValue tree (no JSONSerialization — works on wasm).
public enum SchemaSteps {
    public static let supportedVersions = 0...TowerExport.currentSchemaVersion

    /// v0 -> v1: early exports carried a single `at` timestamp per event
    /// (no bitemporal split). Fill both timestamps from it.
    static func migrateV0toV1(_ payload: JSONValue) -> JSONValue {
        guard var root = payload.object else { return payload }
        var events = root["events"]?.array ?? []
        for i in events.indices {
            guard var e = events[i].object else { continue }
            if e["recordedAt"] == nil, let at = e["at"] { e["recordedAt"] = at }
            if e["effectiveAt"] == nil, let rec = e["recordedAt"] { e["effectiveAt"] = rec }
            e["at"] = nil
            events[i] = .object(e)
        }
        root["events"] = .array(events)
        return .object(root)
    }

    public static func migrate(_ payload: JSONValue, from version: Int) throws -> JSONValue {
        var current = payload
        var v = version
        while v < TowerExport.currentSchemaVersion {
            switch v {
            case 0: current = migrateV0toV1(current)
            default: throw TowerCodecError.unsupportedSchemaVersion(v)
            }
            v += 1
        }
        guard var root = current.object else { return current }
        root["schemaVersion"] = .number(Double(TowerExport.currentSchemaVersion))
        return .object(root)
    }
}
