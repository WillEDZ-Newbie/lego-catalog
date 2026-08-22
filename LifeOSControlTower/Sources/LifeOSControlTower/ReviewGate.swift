import Foundation

/// An explicit approval/review checkpoint. LifeOS development deliberately
/// routes work through review gates, so they are first-class domain state.
public struct ReviewGate: Codable, Hashable, Sendable, Identifiable {
    /// What kind of review the gate is waiting on while open.
    public enum Kind: String, Codable, CaseIterable, Sendable {
        case architectureReview
        case userApproval
        case toolResult
        case implementationFix
        case merge
    }

    /// Effective state of the gate, derived from `resolution`.
    public enum State: String, Codable, Sendable {
        case awaitingArchitectureReview
        case awaitingUserApproval
        case awaitingToolResult
        case awaitingImplementationFix
        case readyToMerge
        case approved
        case rejected
    }

    public struct Resolution: Codable, Hashable, Sendable {
        public enum Outcome: String, Codable, Sendable {
            case approved, rejected
        }
        public var outcome: Outcome
        public var rationale: String
        public init(outcome: Outcome, rationale: String) {
            self.outcome = outcome
            self.rationale = rationale
        }
    }

    /// What the gate holds up while open.
    public enum Scope: Codable, Hashable, Sendable {
        /// Blocks the whole project from completing/progressing.
        case project
        /// Blocks a specific milestone.
        case milestone(MilestoneID)
    }

    public var id: ReviewGateID
    public var title: String
    public var kind: Kind
    /// The reviewer responsible for resolving the gate.
    public var reviewer: Owner
    public var scope: Scope
    public var requestedAt: Date
    public var resolvedAt: Date?
    public var resolution: Resolution?

    public var isOpen: Bool { resolution == nil }

    public var state: State {
        if let resolution {
            return resolution.outcome == .approved ? .approved : .rejected
        }
        switch kind {
        case .architectureReview: return .awaitingArchitectureReview
        case .userApproval:       return .awaitingUserApproval
        case .toolResult:         return .awaitingToolResult
        case .implementationFix:  return .awaitingImplementationFix
        case .merge:              return .readyToMerge
        }
    }

    public init(
        id: ReviewGateID,
        title: String,
        kind: Kind,
        reviewer: Owner,
        scope: Scope = .project,
        requestedAt: Date,
        resolvedAt: Date? = nil,
        resolution: Resolution? = nil
    ) {
        self.id = id
        self.title = title
        self.kind = kind
        self.reviewer = reviewer
        self.scope = scope
        self.requestedAt = requestedAt
        self.resolvedAt = resolvedAt
        self.resolution = resolution
    }
}
