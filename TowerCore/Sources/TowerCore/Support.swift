import Foundation

/// Strongly typed identifier, one specialisation per entity kind.
public struct Identifier<Marker>: RawRepresentable, Hashable, Sendable, Comparable, Codable,
    CustomStringConvertible {
    public let rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public init(_ raw: String) { self.rawValue = raw }
    public init(from decoder: Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer(); try c.encode(rawValue)
    }
    public static func < (l: Self, r: Self) -> Bool { l.rawValue < r.rawValue }
    public var description: String { rawValue }
}

public enum ProjectMarker: Sendable {}
public enum MilestoneMarker: Sendable {}
public enum BlockerMarker: Sendable {}
public enum GateMarker: Sendable {}
public enum DecisionMarker: Sendable {}
public enum RiskMarker: Sendable {}
public enum CriterionMarker: Sendable {}
public enum EventMarker: Sendable {}

public typealias ProjectID = Identifier<ProjectMarker>
public typealias MilestoneID = Identifier<MilestoneMarker>
public typealias BlockerID = Identifier<BlockerMarker>
public typealias GateID = Identifier<GateMarker>
public typealias DecisionID = Identifier<DecisionMarker>
public typealias RiskID = Identifier<RiskMarker>
public typealias CriterionID = Identifier<CriterionMarker>
public typealias EventID = Identifier<EventMarker>

/// Text that provably contains non-whitespace content. Used wherever blank
/// input would corrupt an audit trail (override rationales, gate verdicts):
/// the illegal state — a blank rationale — cannot be constructed at all.
public struct NonEmptyText: Codable, Hashable, Sendable, CustomStringConvertible {
    public let text: String
    public init?(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        self.text = trimmed
    }
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let value = NonEmptyText(raw) else {
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "NonEmptyText cannot be blank"))
        }
        self = value
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer(); try c.encode(text)
    }
    public var description: String { text }
}

/// A deliberate, audited bypass of a completion guard. Constructing one
/// requires a real rationale by type.
public struct Override: Codable, Hashable, Sendable {
    public var rationale: NonEmptyText
    public init(rationale: NonEmptyText) { self.rationale = rationale }
    public init?(_ rationale: String) {
        guard let t = NonEmptyText(rationale) else { return nil }
        self.rationale = t
    }
}
