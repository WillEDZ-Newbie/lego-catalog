import Foundation

/// One entry in the append-only project timeline. The current `Project`
/// value is present state; events explain how it got there. This is
/// deliberately *not* a full event-sourcing framework — events are emitted
/// alongside state changes for auditability and snapshot comparison.
public struct ProjectEvent: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: Codable, Hashable, Sendable {
        case projectCreated
        case statusChanged(from: ProjectStatus, to: ProjectStatus)
        case stageChanged(from: String, to: String)
        case actionCompleted(action: String)
        case nextActionChanged(from: String?, to: String?)
        case ownerChanged(from: Owner, to: Owner)
        case priorityChanged(from: Priority, to: Priority)
        case dependencyAdded(Dependency)
        case dependencyRemoved(Dependency)
        case blockerAdded(BlockerID)
        case blockerResolved(BlockerID)
        case decisionRecorded(DecisionID)
        case decisionSuperseded(old: DecisionID, new: DecisionID)
        case milestoneAdded(MilestoneID)
        case milestoneStateChanged(MilestoneID, from: Milestone.State, to: Milestone.State)
        case milestoneCompleted(MilestoneID)
        case milestoneCompletionOverridden(MilestoneID, rationale: String)
        case projectCompletionOverridden(rationale: String)
        case reviewRequested(ReviewGateID)
        case reviewResolved(ReviewGateID, outcome: ReviewGate.Resolution.Outcome)
        case riskAdded(RiskID)
        case riskChanged(RiskID, from: Risk.Status, to: Risk.Status)
        case deadlineChanged(from: Date?, to: Date?)
        case projectArchived
        case projectReactivated
    }

    public var id: EventID
    public var projectID: ProjectID
    public var timestamp: Date
    public var kind: Kind

    public init(id: EventID, projectID: ProjectID, timestamp: Date, kind: Kind) {
        self.id = id
        self.projectID = projectID
        self.timestamp = timestamp
        self.kind = kind
    }
}
