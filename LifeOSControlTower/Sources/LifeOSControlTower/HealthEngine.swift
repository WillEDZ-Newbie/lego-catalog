import Foundation

/// Deterministic project health evaluation. No scores without reasons:
/// every assessment carries structured evidence.
public enum HealthState: String, Codable, CaseIterable, Sendable {
    case complete
    case needsDecision
    case blocked
    case waitingForReview
    case atRisk
    case stale
    case ready
    case active
    /// Dormant / cancelled / archived work that is deliberately not in play.
    case inactive
}

/// A single piece of evidence supporting a health state.
public enum HealthReason: Sendable, Equatable, CustomStringConvertible {
    case projectCompleted
    case unsatisfiedDependency(ProjectID)
    case openBlocker(BlockerID, Blocker.Kind)
    case openReviewGate(ReviewGateID, ReviewGate.Kind)
    case openDecisionBlocker(BlockerID, owner: Owner)
    case riskAboveThreshold(RiskID, severity: Int, threshold: Int)
    case overdue(deadline: Date)
    case deadlineWithinRiskWindow(deadline: Date)
    case noUpdateSince(Date, thresholdDays: Double)
    case executableNextAction
    case dependenciesSatisfied
    case noOpenBlockers
    case workUnderway
    case notInPlay(ProjectStatus)

    public var description: String {
        switch self {
        case .projectCompleted: return "project is completed"
        case .unsatisfiedDependency(let id): return "blocking dependency '\(id)' incomplete"
        case .openBlocker(let id, let kind): return "open \(kind.rawValue) blocker '\(id)'"
        case .openReviewGate(let id, let kind): return "open \(kind.rawValue) review gate '\(id)'"
        case .openDecisionBlocker(let id, let owner): return "decision blocker '\(id)' awaiting \(owner.label)"
        case .riskAboveThreshold(let id, let sev, let thr): return "risk '\(id)' severity \(sev) >= threshold \(thr)"
        case .overdue(let d): return "deadline \(d) has passed"
        case .deadlineWithinRiskWindow(let d): return "deadline \(d) is inside the risk window"
        case .noUpdateSince(let d, let days): return "no material update since \(d) (threshold \(days) days)"
        case .executableNextAction: return "next action is concrete and executable"
        case .dependenciesSatisfied: return "all blocking dependencies satisfied"
        case .noOpenBlockers: return "no open blockers"
        case .workUnderway: return "work underway"
        case .notInPlay(let s): return "status \(s.rawValue) is not in play"
        }
    }
}

/// Full result of a health evaluation: state plus the evidence behind it.
public struct HealthAssessment: Sendable, Equatable {
    public var projectID: ProjectID
    public var state: HealthState
    public var reasons: [HealthReason]
}

/// Tunable thresholds. Defaults are deliberately conservative and documented.
public struct HealthConfiguration: Sendable {
    /// Days without a material update before non-dormant work is stale.
    public var stalenessThresholdDays: Double
    /// Derived risk severity (1...9) at or above which a project is at risk.
    public var riskSeverityThreshold: Int
    /// Days before an explicit deadline during which deadline risk applies.
    public var deadlineRiskWindowDays: Double

    public init(
        stalenessThresholdDays: Double = 14,
        riskSeverityThreshold: Int = 6,
        deadlineRiskWindowDays: Double = 3
    ) {
        self.stalenessThresholdDays = stalenessThresholdDays
        self.riskSeverityThreshold = riskSeverityThreshold
        self.deadlineRiskWindowDays = deadlineRiskWindowDays
    }

    public static let `default` = HealthConfiguration()
}

public enum HealthEngine {
    /// Evaluates one project. Precedence (first match wins):
    /// complete > inactive > needsDecision > blocked > waitingForReview
    /// > atRisk > stale > ready > active.
    public static func assess(
        _ project: Project,
        in registry: ProjectRegistry,
        graph: DependencyGraph? = nil,
        now: Date,
        config: HealthConfiguration = .default
    ) -> HealthAssessment {
        let graph = graph ?? DependencyGraph(registry)
        let id = project.id

        if project.status == .completed {
            return HealthAssessment(projectID: id, state: .complete, reasons: [.projectCompleted])
        }
        if project.status == .dormant || project.status == .cancelled || project.status == .archived {
            return HealthAssessment(projectID: id, state: .inactive, reasons: [.notInPlay(project.status)])
        }

        // Evidence gathering.
        let unsatisfiedDeps = graph.unsatisfiedBlockingPrerequisites(of: id)
        let openBlockers = project.openBlockers
        let decisionBlockers = openBlockers.filter { $0.type == .decision }
        let otherBlockers = openBlockers.filter { $0.type != .decision }
        let openGates = project.openReviewGates

        if !decisionBlockers.isEmpty {
            return HealthAssessment(
                projectID: id,
                state: .needsDecision,
                reasons: decisionBlockers.map { .openDecisionBlocker($0.id, owner: $0.owner) }
            )
        }
        if !unsatisfiedDeps.isEmpty || !otherBlockers.isEmpty {
            var reasons: [HealthReason] = unsatisfiedDeps.map { .unsatisfiedDependency($0) }
            reasons += otherBlockers.map { .openBlocker($0.id, $0.type) }
            return HealthAssessment(projectID: id, state: .blocked, reasons: reasons)
        }
        if !openGates.isEmpty {
            return HealthAssessment(
                projectID: id,
                state: .waitingForReview,
                reasons: openGates.map { .openReviewGate($0.id, $0.kind) }
            )
        }

        // At risk: live risk above threshold, overdue, or deadline imminent.
        var riskReasons: [HealthReason] = []
        for risk in project.openRisks where risk.severity >= config.riskSeverityThreshold {
            riskReasons.append(.riskAboveThreshold(risk.id, severity: risk.severity, threshold: config.riskSeverityThreshold))
        }
        if let deadline = project.deadline {
            if deadline < now {
                riskReasons.append(.overdue(deadline: deadline))
            } else if deadline.timeIntervalSince(now) <= config.deadlineRiskWindowDays * 86_400 {
                riskReasons.append(.deadlineWithinRiskWindow(deadline: deadline))
            }
        }
        if !riskReasons.isEmpty {
            return HealthAssessment(projectID: id, state: .atRisk, reasons: riskReasons)
        }

        // Stale: only statuses that are supposed to be moving can go stale.
        let sinceUpdate = now.timeIntervalSince(project.updatedAt)
        if sinceUpdate > config.stalenessThresholdDays * 86_400 {
            return HealthAssessment(
                projectID: id,
                state: .stale,
                reasons: [.noUpdateSince(project.updatedAt, thresholdDays: config.stalenessThresholdDays)]
            )
        }

        // Ready: unblocked with an executable next action.
        let actionCheck = NextActionValidator.validate(project, in: registry, graph: graph, now: now)
        if actionCheck.classification == .executable {
            return HealthAssessment(
                projectID: id,
                state: .ready,
                reasons: [.dependenciesSatisfied, .noOpenBlockers, .executableNextAction]
            )
        }

        return HealthAssessment(projectID: id, state: .active, reasons: [.workUnderway])
    }

    /// Assesses every project in the registry (archived included — callers
    /// filter). Shares one graph build across the portfolio.
    public static func assessAll(
        _ registry: ProjectRegistry,
        now: Date,
        config: HealthConfiguration = .default
    ) -> [ProjectID: HealthAssessment] {
        let graph = DependencyGraph(registry)
        var result: [ProjectID: HealthAssessment] = [:]
        for project in registry.allProjects {
            result[project.id] = assess(project, in: registry, graph: graph, now: now, config: config)
        }
        return result
    }
}
