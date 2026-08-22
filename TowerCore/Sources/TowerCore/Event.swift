import Foundation

/// One immutable fact in the portfolio's history. **Events are the truth;
/// state is a cache** — `TowerState` is always a pure fold over the log.
///
/// Bitemporal: `recordedAt` is when the system learned the fact,
/// `effectiveAt` is when it was true in the world. "What did we know on
/// Tuesday?" and "what was true on Tuesday?" are different queries, and both
/// are answerable.
public struct Event: Codable, Hashable, Sendable, Identifiable {
    public var id: EventID
    public var recordedAt: Date
    public var effectiveAt: Date
    public var payload: Payload

    public enum Payload: Codable, Hashable, Sendable {
        case projectCreated(ProjectSeed)
        case lifecycleChanged(ProjectID, from: Lifecycle, to: Lifecycle, cause: LifecycleCause)
        case stageChanged(ProjectID, to: String)
        case nextActionChanged(ProjectID, to: String?)
        case actionCompleted(ProjectID, action: NonEmptyText)
        case priorityChanged(ProjectID, to: Priority)
        case ownerChanged(ProjectID, to: Owner)
        case deadlineChanged(ProjectID, to: Date?)
        case dependencyAdded(ProjectID, Dependency)
        case dependencyRemoved(ProjectID, Dependency)
        case blockerOpened(ProjectID, Blocker)
        case blockerResolved(ProjectID, BlockerID, resolution: NonEmptyText)
        case milestoneAdded(ProjectID, Milestone)
        case criterionSatisfied(ProjectID, MilestoneID, CriterionID)
        case milestoneCompleted(ProjectID, MilestoneID, override: Override?)
        case gateOpened(ProjectID, Gate)
        case gateResolved(ProjectID, GateID, Gate.Verdict)
        case riskAdded(ProjectID, Risk)
        case riskStatusChanged(ProjectID, RiskID, to: Risk.Status)
        case fileReferenceAdded(ProjectID, reference: NonEmptyText)
        case decisionRecorded(Decision)
        case decisionSuperseded(old: DecisionID, new: Decision)
    }

    /// Why a lifecycle edge was taken — completion guards leave their proof
    /// or their override in the history itself.
    public enum LifecycleCause: Codable, Hashable, Sendable {
        case requested                        // ordinary transition (start, pause, cancel, archive)
        case completionProven                 // completion guards all passed
        case completionOverridden(Override)   // guards bypassed, with audited rationale
        case reopened                         // completed -> active, deliberate
        case reactivated                      // dormant/archived -> active, deliberate
    }

    /// Everything needed to bring a project into existence.
    public struct ProjectSeed: Codable, Hashable, Sendable {
        public var id: ProjectID
        public var name: NonEmptyText
        public var purpose: String
        public var priority: Priority
        public var owner: Owner
        public var stage: String
        public var nextAction: String?
        public var deadline: Date?
        public init(id: ProjectID, name: NonEmptyText, purpose: String = "",
                    priority: Priority = .medium, owner: Owner, stage: String = "",
                    nextAction: String? = nil, deadline: Date? = nil) {
            self.id = id; self.name = name; self.purpose = purpose
            self.priority = priority; self.owner = owner; self.stage = stage
            self.nextAction = nextAction; self.deadline = deadline
        }
    }

    /// The project this event belongs to, if any (decisions are portfolio-level).
    public var subject: ProjectID? {
        switch payload {
        case .projectCreated(let seed): return seed.id
        case .lifecycleChanged(let id, _, _, _), .stageChanged(let id, _),
             .nextActionChanged(let id, _), .actionCompleted(let id, _),
             .priorityChanged(let id, _), .ownerChanged(let id, _),
             .deadlineChanged(let id, _), .dependencyAdded(let id, _),
             .dependencyRemoved(let id, _), .blockerOpened(let id, _),
             .blockerResolved(let id, _, _), .milestoneAdded(let id, _),
             .criterionSatisfied(let id, _, _), .milestoneCompleted(let id, _, _),
             .gateOpened(let id, _), .gateResolved(let id, _, _),
             .riskAdded(let id, _), .riskStatusChanged(let id, _, _),
             .fileReferenceAdded(let id, _):
            return id
        case .decisionRecorded, .decisionSuperseded:
            return nil
        }
    }
}
