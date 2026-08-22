import Foundation

/// A first-class project milestone with acceptance criteria, dependencies,
/// an optional review gate and an optional deadline.
public struct Milestone: Codable, Hashable, Sendable, Identifiable {
    public enum State: String, Codable, CaseIterable, Sendable {
        case notStarted, active, awaitingReview, blocked, completed
    }

    /// One individually satisfiable acceptance criterion.
    public struct AcceptanceCriterion: Codable, Hashable, Sendable, Identifiable {
        public var id: CriterionID
        public var text: String
        public var isRequired: Bool
        public var satisfiedAt: Date?

        public var isSatisfied: Bool { satisfiedAt != nil }

        public init(id: CriterionID, text: String, isRequired: Bool = true, satisfiedAt: Date? = nil) {
            self.id = id
            self.text = text
            self.isRequired = isRequired
            self.satisfiedAt = satisfiedAt
        }
    }

    /// A milestone may depend on a whole project or on another milestone.
    public enum Prerequisite: Codable, Hashable, Sendable {
        case project(ProjectID)
        case milestone(MilestoneID)
    }

    public var id: MilestoneID
    public var title: String
    public var details: String
    public var state: State
    public var acceptanceCriteria: [AcceptanceCriterion]
    public var prerequisites: [Prerequisite]
    public var owner: Owner
    /// Explicit deadline only; the engine never invents one.
    public var deadline: Date?
    /// Gate that must be approved before the milestone may complete.
    public var reviewGateID: ReviewGateID?
    /// Whether this milestone must complete before its project can complete.
    public var isRequiredForProjectCompletion: Bool
    public var createdAt: Date
    public var completedAt: Date?

    public var unsatisfiedRequiredCriteria: [AcceptanceCriterion] {
        acceptanceCriteria.filter { $0.isRequired && !$0.isSatisfied }
    }

    public init(
        id: MilestoneID,
        title: String,
        details: String = "",
        state: State = .notStarted,
        acceptanceCriteria: [AcceptanceCriterion] = [],
        prerequisites: [Prerequisite] = [],
        owner: Owner,
        deadline: Date? = nil,
        reviewGateID: ReviewGateID? = nil,
        isRequiredForProjectCompletion: Bool = true,
        createdAt: Date,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.details = details
        self.state = state
        self.acceptanceCriteria = acceptanceCriteria
        self.prerequisites = prerequisites
        self.owner = owner
        self.deadline = deadline
        self.reviewGateID = reviewGateID
        self.isRequiredForProjectCompletion = isRequiredForProjectCompletion
        self.createdAt = createdAt
        self.completedAt = completedAt
    }
}
