import Foundation

/// A strongly typed identifier. Each domain entity gets its own `Identifier`
/// specialisation so that a `ProjectID` can never be passed where a
/// `MilestoneID` is expected — the compiler enforces it.
public struct Identifier<Marker>: RawRepresentable, Hashable, Sendable {
    public let rawValue: String

    public init(rawValue: String) { self.rawValue = rawValue }
    public init(_ rawValue: String) { self.rawValue = rawValue }
}

extension Identifier: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.rawValue = try container.decode(String.self)
    }
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

extension Identifier: CustomStringConvertible {
    public var description: String { rawValue }
}

extension Identifier: Comparable {
    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

// Marker types. These are never instantiated; they only parameterise `Identifier`.
public enum ProjectIDMarker: Sendable {}
public enum MilestoneIDMarker: Sendable {}
public enum BlockerIDMarker: Sendable {}
public enum DecisionIDMarker: Sendable {}
public enum RiskIDMarker: Sendable {}
public enum ReviewGateIDMarker: Sendable {}
public enum EventIDMarker: Sendable {}
public enum CriterionIDMarker: Sendable {}

public typealias ProjectID = Identifier<ProjectIDMarker>
public typealias MilestoneID = Identifier<MilestoneIDMarker>
public typealias BlockerID = Identifier<BlockerIDMarker>
public typealias DecisionID = Identifier<DecisionIDMarker>
public typealias RiskID = Identifier<RiskIDMarker>
public typealias ReviewGateID = Identifier<ReviewGateIDMarker>
public typealias EventID = Identifier<EventIDMarker>
public typealias CriterionID = Identifier<CriterionIDMarker>
