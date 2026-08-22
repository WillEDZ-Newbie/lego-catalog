import Foundation

/// A structured obstacle preventing progress. Structured enough to drive
/// queries and dependency reasoning; never freeform-only.
public struct Blocker: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, CaseIterable, Sendable {
        case dependency, decision, technical, access, external, review, unknown
    }

    public enum Severity: String, Codable, CaseIterable, Sendable, Comparable {
        case low, medium, high, critical

        public var score: Int {
            switch self {
            case .low: return 1
            case .medium: return 2
            case .high: return 3
            case .critical: return 4
            }
        }
        public static func < (lhs: Severity, rhs: Severity) -> Bool { lhs.score < rhs.score }
    }

    public struct Resolution: Codable, Hashable, Sendable {
        public var summary: String
        public var resolvedBy: Owner?
        public init(summary: String, resolvedBy: Owner? = nil) {
            self.summary = summary
            self.resolvedBy = resolvedBy
        }
    }

    public var id: BlockerID
    public var type: Kind
    public var summary: String
    /// Who can resolve this blocker.
    public var owner: Owner
    /// Upstream projects implicated, if applicable.
    public var blockingProjectIDs: [ProjectID]
    public var createdAt: Date
    public var resolvedAt: Date?
    public var severity: Severity
    public var resolution: Resolution?

    public var isResolved: Bool { resolvedAt != nil }

    public init(
        id: BlockerID,
        type: Kind,
        summary: String,
        owner: Owner,
        blockingProjectIDs: [ProjectID] = [],
        createdAt: Date,
        resolvedAt: Date? = nil,
        severity: Severity = .medium,
        resolution: Resolution? = nil
    ) {
        self.id = id
        self.type = type
        self.summary = summary
        self.owner = owner
        self.blockingProjectIDs = blockingProjectIDs
        self.createdAt = createdAt
        self.resolvedAt = resolvedAt
        self.severity = severity
        self.resolution = resolution
    }
}
