import Foundation

/// Strongly typed errors thrown by `ProjectRegistry` mutations.
public enum RegistryError: Error, Equatable, Sendable, CustomStringConvertible {
    case duplicateProjectID(ProjectID)
    case unknownProject(ProjectID)
    case unknownMilestone(MilestoneID, in: ProjectID)
    case unknownBlocker(BlockerID, in: ProjectID)
    case unknownReviewGate(ReviewGateID, in: ProjectID)
    case unknownRisk(RiskID, in: ProjectID)
    case unknownDecision(DecisionID)
    case unknownCriterion(CriterionID, in: MilestoneID)
    case invalidStatusTransition(from: ProjectStatus, to: ProjectStatus)
    case dependencyOnSelf(ProjectID)
    case duplicateDependency(ProjectID, on: ProjectID)
    case dependencyTargetMissing(ProjectID)
    case blockerAlreadyResolved(BlockerID)
    case gateAlreadyResolved(ReviewGateID)
    case milestoneAlreadyCompleted(MilestoneID)
    case unsatisfiedAcceptanceCriteria(MilestoneID, unsatisfied: [CriterionID])
    case unresolvedReviewGate(MilestoneID, gate: ReviewGateID)
    case incompleteRequiredMilestones(ProjectID, milestones: [MilestoneID])
    case decisionAlreadySuperseded(DecisionID)
    case decisionNotActive(DecisionID)
    case projectNotArchivedOrDormant(ProjectID)

    public var description: String {
        switch self {
        case .duplicateProjectID(let id): return "A project with id '\(id)' already exists."
        case .unknownProject(let id): return "No project with id '\(id)'."
        case .unknownMilestone(let m, let p): return "No milestone '\(m)' in project '\(p)'."
        case .unknownBlocker(let b, let p): return "No blocker '\(b)' in project '\(p)'."
        case .unknownReviewGate(let g, let p): return "No review gate '\(g)' in project '\(p)'."
        case .unknownRisk(let r, let p): return "No risk '\(r)' in project '\(p)'."
        case .unknownDecision(let d): return "No decision '\(d)'."
        case .unknownCriterion(let c, let m): return "No criterion '\(c)' in milestone '\(m)'."
        case .invalidStatusTransition(let f, let t): return "Illegal status transition \(f.rawValue) -> \(t.rawValue)."
        case .dependencyOnSelf(let id): return "Project '\(id)' cannot depend on itself."
        case .duplicateDependency(let id, let on): return "Project '\(id)' already depends on '\(on)'."
        case .dependencyTargetMissing(let id): return "Dependency target '\(id)' does not exist."
        case .blockerAlreadyResolved(let id): return "Blocker '\(id)' is already resolved."
        case .gateAlreadyResolved(let id): return "Review gate '\(id)' is already resolved."
        case .milestoneAlreadyCompleted(let id): return "Milestone '\(id)' is already completed."
        case .unsatisfiedAcceptanceCriteria(let m, let u):
            return "Milestone '\(m)' has unsatisfied required criteria: \(u.map(\.rawValue).joined(separator: ", "))."
        case .unresolvedReviewGate(let m, let g): return "Milestone '\(m)' is gated by unresolved review '\(g)'."
        case .incompleteRequiredMilestones(let p, let ms):
            return "Project '\(p)' has incomplete required milestones: \(ms.map(\.rawValue).joined(separator: ", "))."
        case .decisionAlreadySuperseded(let d): return "Decision '\(d)' is already superseded."
        case .decisionNotActive(let d): return "Decision '\(d)' is not active."
        case .projectNotArchivedOrDormant(let p): return "Project '\(p)' is neither archived nor dormant."
        }
    }
}
