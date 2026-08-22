import Foundation

public enum Lifecycle: String, Codable, CaseIterable, Sendable {
    case notStarted, active, dormant, completed, cancelled, archived
    public var isTerminal: Bool { self == .completed || self == .cancelled || self == .archived }
    public var isResting: Bool { self == .dormant || isTerminal }
}

public enum Priority: String, Codable, CaseIterable, Sendable, Comparable {
    case critical, high, medium, low
    public var weight: Int { [Priority.low: 1, .medium: 2, .high: 3, .critical: 4][self]! }
    public static func < (l: Priority, r: Priority) -> Bool { l.weight < r.weight }
}

public enum Owner: Codable, Hashable, Sendable {
    case user, chatGPT, grok, claude
    case tool(name: String)
    case mixed([Owner])
    public var label: String {
        switch self {
        case .user: return "user"
        case .chatGPT: return "chatGPT"
        case .grok: return "grok"
        case .claude: return "claude"
        case .tool(let n): return "tool:\(n)"
        case .mixed(let o): return "mixed(" + o.map(\.label).joined(separator: ",") + ")"
        }
    }
    public func involves(_ other: Owner) -> Bool {
        if self == other { return true }
        if case .mixed(let owners) = self { return owners.contains { $0.involves(other) } }
        return false
    }
}

public enum Level: String, Codable, CaseIterable, Sendable, Comparable {
    case low, medium, high
    public var score: Int { [Level.low: 1, .medium: 2, .high: 3][self]! }
    public static func < (l: Level, r: Level) -> Bool { l.score < r.score }
}

public enum DependencyKind: String, Codable, CaseIterable, Sendable {
    case blocks, requires, informs, reviewOf
    public var isBlocking: Bool { self == .blocks || self == .requires }
}

public struct Dependency: Codable, Hashable, Sendable {
    public var prerequisite: ProjectID
    public var kind: DependencyKind
    public init(on prerequisite: ProjectID, kind: DependencyKind = .blocks) {
        self.prerequisite = prerequisite; self.kind = kind
    }
}

public struct Blocker: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, CaseIterable, Sendable {
        case dependency, decision, technical, access, external, review, unknown
    }
    public var id: BlockerID
    public var kind: Kind
    public var summary: NonEmptyText
    public var owner: Owner
    public var severity: Level
    public var openedAt: Date
    public var resolvedAt: Date?
    public var resolution: NonEmptyText?
    public var isOpen: Bool { resolvedAt == nil }
    public init(id: BlockerID, kind: Kind, summary: NonEmptyText, owner: Owner,
                severity: Level = .medium, openedAt: Date) {
        self.id = id; self.kind = kind; self.summary = summary
        self.owner = owner; self.severity = severity; self.openedAt = openedAt
    }
}

public struct Criterion: Codable, Hashable, Sendable, Identifiable {
    public var id: CriterionID
    public var text: NonEmptyText
    public var isRequired: Bool
    public var satisfiedAt: Date?
    public init(id: CriterionID, text: NonEmptyText, isRequired: Bool = true) {
        self.id = id; self.text = text; self.isRequired = isRequired
    }
}

public struct Milestone: Codable, Hashable, Sendable, Identifiable {
    public var id: MilestoneID
    public var title: NonEmptyText
    public var criteria: [Criterion]
    public var prerequisiteProjects: [ProjectID]
    public var gateID: GateID?
    public var deadline: Date?
    public var requiredForCompletion: Bool
    public var createdAt: Date
    public var completedAt: Date?
    public var isComplete: Bool { completedAt != nil }
    public var unsatisfiedRequiredCriteria: [Criterion] {
        criteria.filter { $0.isRequired && $0.satisfiedAt == nil }
    }
    public init(id: MilestoneID, title: NonEmptyText, criteria: [Criterion] = [],
                prerequisiteProjects: [ProjectID] = [], gateID: GateID? = nil,
                deadline: Date? = nil, requiredForCompletion: Bool = true, createdAt: Date) {
        self.id = id; self.title = title; self.criteria = criteria
        self.prerequisiteProjects = prerequisiteProjects; self.gateID = gateID
        self.deadline = deadline; self.requiredForCompletion = requiredForCompletion
        self.createdAt = createdAt
    }
}

public struct Gate: Codable, Hashable, Sendable, Identifiable {
    public enum Kind: String, Codable, CaseIterable, Sendable {
        case architectureReview, userApproval, toolResult, implementationFix, merge
    }
    public enum Outcome: String, Codable, Sendable { case approved, rejected }
    public struct Verdict: Codable, Hashable, Sendable {
        public var outcome: Outcome
        public var rationale: NonEmptyText
        public var at: Date
        public init(outcome: Outcome, rationale: NonEmptyText, at: Date) {
            self.outcome = outcome; self.rationale = rationale; self.at = at
        }
    }
    public var id: GateID
    public var title: NonEmptyText
    public var kind: Kind
    public var reviewer: Owner
    public var openedAt: Date
    public var verdict: Verdict?
    public var isOpen: Bool { verdict == nil }
    public var isApproved: Bool { verdict?.outcome == .approved }
    public init(id: GateID, title: NonEmptyText, kind: Kind, reviewer: Owner, openedAt: Date) {
        self.id = id; self.title = title; self.kind = kind
        self.reviewer = reviewer; self.openedAt = openedAt
    }
}

public struct Decision: Codable, Hashable, Sendable, Identifiable {
    public var id: DecisionID
    public var title: NonEmptyText
    public var decision: NonEmptyText
    public var rationale: NonEmptyText
    public var owner: Owner
    public var affectedProjects: [ProjectID]
    public var decidedAt: Date
    public var supersedes: DecisionID?
    public var supersededBy: DecisionID?
    public var isActive: Bool { supersededBy == nil }
    public init(id: DecisionID, title: NonEmptyText, decision: NonEmptyText,
                rationale: NonEmptyText, owner: Owner,
                affectedProjects: [ProjectID] = [], decidedAt: Date) {
        self.id = id; self.title = title; self.decision = decision
        self.rationale = rationale; self.owner = owner
        self.affectedProjects = affectedProjects; self.decidedAt = decidedAt
    }
}

public struct Risk: Codable, Hashable, Sendable, Identifiable {
    public enum Status: String, Codable, CaseIterable, Sendable {
        case open, mitigated, accepted, closed
    }
    public var id: RiskID
    public var summary: NonEmptyText
    public var likelihood: Level
    public var impact: Level
    public var owner: Owner
    public var status: Status
    public var severity: Int { likelihood.score * impact.score }
    public var isLive: Bool { status == .open }
    public init(id: RiskID, summary: NonEmptyText, likelihood: Level, impact: Level,
                owner: Owner, status: Status = .open) {
        self.id = id; self.summary = summary; self.likelihood = likelihood
        self.impact = impact; self.owner = owner; self.status = status
    }
}

/// Present state of one project — produced only by folding events.
public struct ProjectSnapshot: Codable, Hashable, Sendable, Identifiable {
    public var id: ProjectID
    public var name: NonEmptyText
    public var purpose: String
    public var lifecycle: Lifecycle
    public var stage: String
    public var priority: Priority
    public var owner: Owner
    public var nextAction: String?
    public var lastAction: String?
    public var deadline: Date?
    public var dependencies: [Dependency]
    public var blockers: [Blocker]
    public var milestones: [Milestone]
    public var gates: [Gate]
    public var risks: [Risk]
    public var fileReferences: [String]
    public var createdAt: Date
    public var updatedAt: Date

    public var openBlockers: [Blocker] { blockers.filter(\.isOpen) }
    public var openGates: [Gate] { gates.filter(\.isOpen) }
    public var liveRisks: [Risk] { risks.filter(\.isLive) }
    public var incompleteRequiredMilestones: [Milestone] {
        milestones.filter { $0.requiredForCompletion && !$0.isComplete }
    }
    public func milestone(_ id: MilestoneID) -> Milestone? { milestones.first { $0.id == id } }
    public func gate(_ id: GateID) -> Gate? { gates.first { $0.id == id } }
}
