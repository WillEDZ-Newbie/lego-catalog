import Foundation

/// Everything a caller can ask the tower to do. Commands are validated
/// against current state; only valid commands become events.
public enum Command: Sendable {
    case createProject(Event.ProjectSeed)
    case start(ProjectID)
    case pause(ProjectID)                    // active -> dormant
    case cancel(ProjectID)
    case archive(ProjectID)
    case complete(ProjectID, override: Override?)
    case reopen(ProjectID)                   // completed -> active
    case reactivate(ProjectID)               // dormant/archived -> active
    case setStage(ProjectID, String)
    case setNextAction(ProjectID, String?)
    case completeAction(ProjectID, NonEmptyText)
    case setPriority(ProjectID, Priority)
    case setOwner(ProjectID, Owner)
    case setDeadline(ProjectID, Date?)
    case addDependency(ProjectID, on: ProjectID, kind: DependencyKind)
    case removeDependency(ProjectID, on: ProjectID)
    case openBlocker(ProjectID, Blocker)
    case resolveBlocker(ProjectID, BlockerID, resolution: NonEmptyText)
    case addMilestone(ProjectID, Milestone)
    case satisfyCriterion(ProjectID, MilestoneID, CriterionID)
    case completeMilestone(ProjectID, MilestoneID, override: Override?)
    case openGate(ProjectID, Gate)
    case resolveGate(ProjectID, GateID, outcome: Gate.Outcome, rationale: NonEmptyText)
    case addRisk(ProjectID, Risk)
    case setRiskStatus(ProjectID, RiskID, Risk.Status)
    case addFileReference(ProjectID, NonEmptyText)
    case recordDecision(Decision)
    case supersedeDecision(DecisionID, with: Decision)
}

/// Why a command was refused. Each case names the obstacle precisely —
/// callers render or branch on these; nothing is a bare string.
public enum Rejection: Error, Equatable, Sendable, CustomStringConvertible {
    case duplicateProject(ProjectID)
    case unknownProject(ProjectID)
    case unknownMilestone(MilestoneID)
    case unknownBlocker(BlockerID)
    case unknownGate(GateID)
    case unknownRisk(RiskID)
    case unknownCriterion(CriterionID)
    case unknownDecision(DecisionID)
    case duplicateEntity(String)
    case illegalTransition(from: Lifecycle, to: Lifecycle)
    case notCompleted(ProjectID)
    case notResting(ProjectID)
    case wouldCreateCycle(path: [ProjectID])
    case dependencyOnSelf(ProjectID)
    case dependencyTargetMissing(ProjectID)
    case completionBlocked(by: [Obstacle])
    case milestoneAlreadyComplete(MilestoneID)
    case gateAlreadyResolved(GateID)
    case blockerAlreadyResolved(BlockerID)
    case decisionNotActive(DecisionID)
    case decisionIDReused(DecisionID)
    case blankOverrideRationale

    public var description: String {
        switch self {
        case .duplicateProject(let id): return "project '\(id)' already exists"
        case .unknownProject(let id): return "no project '\(id)'"
        case .unknownMilestone(let id): return "no milestone '\(id)'"
        case .unknownBlocker(let id): return "no blocker '\(id)'"
        case .unknownGate(let id): return "no gate '\(id)'"
        case .unknownRisk(let id): return "no risk '\(id)'"
        case .unknownCriterion(let id): return "no criterion '\(id)'"
        case .unknownDecision(let id): return "no decision '\(id)'"
        case .duplicateEntity(let d): return "duplicate id: \(d)"
        case .illegalTransition(let f, let t): return "illegal transition \(f.rawValue) -> \(t.rawValue)"
        case .notCompleted(let id): return "'\(id)' is not completed; reopen applies to completed projects only"
        case .notResting(let id): return "'\(id)' is neither dormant nor archived"
        case .wouldCreateCycle(let p): return "would create blocking cycle: " + p.map(\.rawValue).joined(separator: " -> ")
        case .dependencyOnSelf(let id): return "'\(id)' cannot depend on itself"
        case .dependencyTargetMissing(let id): return "dependency target '\(id)' does not exist"
        case .completionBlocked(let obs): return "completion blocked: " + obs.map(\.description).joined(separator: "; ")
        case .milestoneAlreadyComplete(let id): return "milestone '\(id)' already complete"
        case .gateAlreadyResolved(let id): return "gate '\(id)' already resolved"
        case .blockerAlreadyResolved(let id): return "blocker '\(id)' already resolved"
        case .decisionNotActive(let id): return "decision '\(id)' is not active"
        case .decisionIDReused(let id): return "decision id '\(id)' already used"
        case .blankOverrideRationale: return "an override rationale must contain actual text"
        }
    }
}

/// A concrete thing standing between a project (or milestone) and completion.
public enum Obstacle: Equatable, Sendable, CustomStringConvertible {
    case openBlocker(BlockerID)
    case incompleteMilestone(MilestoneID)
    case unsatisfiedCriterion(CriterionID, of: MilestoneID)
    case unapprovedGate(GateID)
    case unsatisfiedPrerequisite(ProjectID)

    public var description: String {
        switch self {
        case .openBlocker(let id): return "open blocker '\(id)'"
        case .incompleteMilestone(let id): return "incomplete required milestone '\(id)'"
        case .unsatisfiedCriterion(let c, let m): return "unsatisfied criterion '\(c)' of milestone '\(m)'"
        case .unapprovedGate(let id): return "unapproved gate '\(id)'"
        case .unsatisfiedPrerequisite(let id): return "incomplete prerequisite project '\(id)'"
        }
    }
}
