import Foundation

/// The core project model. A value type: copying a registry snapshots the
/// whole portfolio for free, which the change detector relies on.
public struct Project: Codable, Hashable, Sendable, Identifiable {
    public var id: ProjectID
    public var name: String
    /// Why the project exists.
    public var purpose: String
    /// Lifecycle intent. Conditions like blocked/awaiting-review are derived
    /// by `HealthEngine`, never stored here.
    public var status: ProjectStatus
    /// Current stage/milestone label (e.g. "design", "stabilisation").
    public var currentStage: String
    /// Most recent meaningful completed action.
    public var lastAction: String?
    /// One concrete next action, when known.
    public var nextAction: String?
    public var priority: Priority
    /// External file references — identifiers only, never filesystem paths
    /// this package would read.
    public var files: [FileReference]
    /// Typed dependency edges; `prerequisite` is the upstream project.
    public var dependencies: [Dependency]
    /// Who is responsible for the next meaningful step.
    public var owner: Owner
    /// Explicit deadline only; never invented by the engine.
    public var deadline: Date?
    public var blockers: [Blocker]
    public var milestones: [Milestone]
    public var risks: [Risk]
    public var reviewGates: [ReviewGate]
    /// Last material state update (maintained by the registry).
    public var updatedAt: Date
    public var createdAt: Date
    public var schemaVersion: Int

    public init(
        id: ProjectID,
        name: String,
        purpose: String,
        status: ProjectStatus = .notStarted,
        currentStage: String = "",
        lastAction: String? = nil,
        nextAction: String? = nil,
        priority: Priority = .medium,
        files: [FileReference] = [],
        dependencies: [Dependency] = [],
        owner: Owner,
        deadline: Date? = nil,
        blockers: [Blocker] = [],
        milestones: [Milestone] = [],
        risks: [Risk] = [],
        reviewGates: [ReviewGate] = [],
        createdAt: Date,
        updatedAt: Date? = nil,
        schemaVersion: Int = ControlTowerSchema.currentVersion
    ) {
        self.id = id
        self.name = name
        self.purpose = purpose
        self.status = status
        self.currentStage = currentStage
        self.lastAction = lastAction
        self.nextAction = nextAction
        self.priority = priority
        self.files = files
        self.dependencies = dependencies
        self.owner = owner
        self.deadline = deadline
        self.blockers = blockers
        self.milestones = milestones
        self.risks = risks
        self.reviewGates = reviewGates
        self.createdAt = createdAt
        self.updatedAt = updatedAt ?? createdAt
        self.schemaVersion = schemaVersion
    }

    // MARK: Derived conveniences

    public var openBlockers: [Blocker] { blockers.filter { !$0.isResolved } }

    public var openReviewGates: [ReviewGate] { reviewGates.filter(\.isOpen) }

    /// Blocking dependency edges only (`blocks`/`requires`).
    public var blockingDependencies: [Dependency] {
        dependencies.filter { $0.kind.isBlocking }
    }

    public var openRisks: [Risk] { risks.filter(\.isLive) }

    /// Highest live risk severity, 0 when none.
    public var maxOpenRiskSeverity: Int {
        openRisks.map(\.severity).max() ?? 0
    }

    public func milestone(_ id: MilestoneID) -> Milestone? {
        milestones.first { $0.id == id }
    }

    public func reviewGate(_ id: ReviewGateID) -> ReviewGate? {
        reviewGates.first { $0.id == id }
    }

    public func blocker(_ id: BlockerID) -> Blocker? {
        blockers.first { $0.id == id }
    }

    /// Milestones that must be complete before the project may complete.
    public var incompleteRequiredMilestones: [Milestone] {
        milestones.filter { $0.isRequiredForProjectCompletion && $0.state != .completed }
    }

    public func isOverdue(now: Date) -> Bool {
        guard let deadline, !status.isTerminal else { return false }
        return deadline < now
    }
}
