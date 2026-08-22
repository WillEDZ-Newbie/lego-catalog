#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

// MARK: - Evidence (typed all the way down)

/// A single piece of typed evidence. Rendering to English happens here at
/// the edge; every consumer upstream gets structured values it can act on.
public enum Evidence: Equatable, Sendable, CustomStringConvertible {
    case openBlocker(BlockerID, Blocker.Kind, owner: Owner)
    case unsatisfiedDependency(ProjectID)
    case openGate(GateID, Gate.Kind, reviewer: Owner)
    case decisionPending(BlockerID, owner: Owner)
    case riskAboveThreshold(RiskID, severity: Int, threshold: Int)
    case overdue(deadline: Date)
    case deadlineImminent(deadline: Date)
    case noUpdateSince(Date, thresholdDays: Double)
    case actionExecutable
    case actionMissing
    case actionVague(matchedRule: String)
    case unlocksDownstream(count: Int)
    case priorityWeight(Priority, points: Int)
    case deadlinePoints(Int, why: String)
    case downstreamPoints(Int, count: Int)
    case stalePoints(Int)
    case riskPoints(Int)
    case completed
    case resting(Lifecycle)

    public var description: String {
        switch self {
        case .openBlocker(let id, let kind, let owner):
            return "open \(kind.rawValue) blocker '\(id)' owned by \(owner.label)"
        case .unsatisfiedDependency(let id): return "blocking dependency '\(id)' incomplete"
        case .openGate(let id, let kind, let reviewer):
            return "open \(kind.rawValue) gate '\(id)' awaiting \(reviewer.label)"
        case .decisionPending(let id, let owner):
            return "decision blocker '\(id)' awaiting \(owner.label)"
        case .riskAboveThreshold(let id, let sev, let thr):
            return "risk '\(id)' severity \(sev) ≥ threshold \(thr)"
        case .overdue(let d): return "deadline \(d) has passed"
        case .deadlineImminent(let d): return "deadline \(d) is imminent"
        case .noUpdateSince(let d, let days):
            return "no material update since \(d) (threshold \(Int(days))d)"
        case .actionExecutable: return "next action is concrete and executable"
        case .actionMissing: return "no next action recorded"
        case .actionVague(let rule): return "next action too vague (\(rule))"
        case .unlocksDownstream(let n): return "resolving unlocks \(n) downstream project(s)"
        case .priorityWeight(let p, let pts): return "\(p.rawValue) priority (+\(pts))"
        case .deadlinePoints(let pts, let why): return "\(why) (+\(pts))"
        case .downstreamPoints(let pts, let n): return "\(n) downstream affected (+\(pts))"
        case .stalePoints(let pts): return "stale (+\(pts))"
        case .riskPoints(let pts): return "high-severity open risk (+\(pts))"
        case .completed: return "project is completed"
        case .resting(let l): return "status \(l.rawValue) is not in play"
        }
    }
}

// MARK: - Assessment vocabulary

public enum Health: String, Codable, CaseIterable, Sendable {
    case complete, inactive, needsDecision, blocked, inReview, atRisk, stale, ready, active
}

public enum ActionClass: String, Codable, CaseIterable, Sendable {
    case missing, vague, blocked, awaitingReview, awaitingDecision, executable
}

public enum Bucket: Int, Codable, Sendable, Comparable {
    case actionable = 0, needsDefinition = 1, awaitingHuman = 2, blocked = 3
    public static func < (l: Bucket, r: Bucket) -> Bool { l.rawValue < r.rawValue }
}

public struct ProjectAssessment: Sendable {
    public var id: ProjectID
    public var health: Health
    public var healthEvidence: [Evidence]
    public var actionClass: ActionClass
    public var actionEvidence: [Evidence]
    public var completionObstacles: [Obstacle]
}

public struct AttentionEntry: Sendable {
    public var id: ProjectID
    public var bucket: Bucket
    public var score: Int
    public var evidence: [Evidence]
}

public struct PortfolioAssessment: Sendable {
    public var asOf: Date
    /// Per-project assessment, archived work included (callers filter).
    public var projects: [ProjectID: ProjectAssessment]
    /// Attention queue over in-play work, most deserving first.
    public var attention: [AttentionEntry]
    /// Count of in-play projects per health state.
    public var healthCounts: [Health: Int]
    public var overdue: [ProjectID]
    public var criticalHubs: [(project: ProjectID, downstreamCount: Int)]
    /// Open gates and decision blockers per reviewer/owner label.
    public var waitingOn: [String: Int]
}

// MARK: - Configuration

public struct AssessmentPolicy: Sendable {
    public var stalenessThresholdDays: Double = 14
    public var riskSeverityThreshold: Int = 6
    public var deadlineRiskWindowDays: Double = 3
    public var vagueLeadingPhrases: [String] = [
        "work on", "continue", "keep working", "think about", "look into",
        "explore", "improve", "polish", "handle", "deal with", "progress",
        "make progress", "carry on", "do more"
    ]
    public var minimumActionWords: Int = 3
    public var priorityPoints: [Priority: Int] = [.critical: 40, .high: 30, .medium: 20, .low: 10]
    public var overduePoints = 25
    public var imminentPoints = 20
    public var nearPoints = 10
    public var nearWindowDays: Double = 7
    public var pointsPerDownstream = 3
    public var downstreamCap = 15
    public var stalePoints = 5
    public var riskPoints = 10
    public var unlockPromotionThreshold = 2
    public init() {}
    public static let `default` = AssessmentPolicy()
}

// MARK: - The one façade call

extension Tower {
    /// Assesses the whole portfolio in one pass: health, action quality,
    /// attention ranking, aggregates — mutually consistent because they are
    /// computed from the same snapshot with the same policy.
    public func assess(at now: Date, policy: AssessmentPolicy = .default) -> PortfolioAssessment {
        let graph = Graph(state)
        var perProject: [ProjectID: ProjectAssessment] = [:]
        var attention: [AttentionEntry] = []
        var healthCounts: [Health: Int] = [:]
        var overdue: [ProjectID] = []
        var waitingOn: [String: Int] = [:]

        for p in state.allProjects {
            let assessment = assessProject(p, graph: graph, now: now, policy: policy)
            perProject[p.id] = assessment

            let inPlay = p.lifecycle != .archived
            if inPlay { healthCounts[assessment.health, default: 0] += 1 }
            if inPlay, !p.lifecycle.isTerminal, let d = p.deadline, d < now {
                overdue.append(p.id)
            }
            for gate in p.openGates { waitingOn[gate.reviewer.label, default: 0] += 1 }
            for blocker in p.openBlockers where blocker.kind == .decision {
                waitingOn[blocker.owner.label, default: 0] += 1
            }

            // Attention queue: only work that is in play.
            guard !p.lifecycle.isTerminal && p.lifecycle != .dormant else { continue }
            attention.append(attentionEntry(
                p, assessment: assessment, graph: graph, now: now, policy: policy))
        }

        attention.sort {
            if $0.bucket != $1.bucket { return $0.bucket < $1.bucket }
            if $0.score != $1.score { return $0.score > $1.score }
            return $0.id < $1.id
        }

        return PortfolioAssessment(
            asOf: now, projects: perProject, attention: attention,
            healthCounts: healthCounts, overdue: overdue.sorted(),
            criticalHubs: graph.criticalHubs(top: 5), waitingOn: waitingOn)
    }

    private func assessProject(
        _ p: ProjectSnapshot, graph: Graph, now: Date, policy: AssessmentPolicy
    ) -> ProjectAssessment {
        let obstacles = completionObstacles(of: p)
        let action = classifyAction(p, graph: graph, policy: policy)

        var health = Health.active
        var evidence: [Evidence] = []

        if p.lifecycle == .completed {
            health = .complete; evidence = [.completed]
        } else if p.lifecycle.isResting || p.lifecycle == .cancelled {
            health = .inactive; evidence = [.resting(p.lifecycle)]
        } else {
            let decisionBlockers = p.openBlockers.filter { $0.kind == .decision }
            let otherBlockers = p.openBlockers.filter { $0.kind != .decision }
            let unsatisfied = graph.unsatisfiedBlockingPrerequisites(of: p.id)
            if !decisionBlockers.isEmpty {
                health = .needsDecision
                evidence = decisionBlockers.map { .decisionPending($0.id, owner: $0.owner) }
            } else if !otherBlockers.isEmpty || !unsatisfied.isEmpty {
                health = .blocked
                evidence = unsatisfied.map { .unsatisfiedDependency($0) }
                    + otherBlockers.map { .openBlocker($0.id, $0.kind, owner: $0.owner) }
            } else if !p.openGates.isEmpty {
                health = .inReview
                evidence = p.openGates.map { .openGate($0.id, $0.kind, reviewer: $0.reviewer) }
            } else {
                var riskEvidence: [Evidence] = []
                for risk in p.liveRisks where risk.severity >= policy.riskSeverityThreshold {
                    riskEvidence.append(.riskAboveThreshold(
                        risk.id, severity: risk.severity, threshold: policy.riskSeverityThreshold))
                }
                if let deadline = p.deadline {
                    if deadline < now { riskEvidence.append(.overdue(deadline: deadline)) }
                    else if deadline.timeIntervalSince(now) <= policy.deadlineRiskWindowDays * 86_400 {
                        riskEvidence.append(.deadlineImminent(deadline: deadline))
                    }
                }
                if !riskEvidence.isEmpty {
                    health = .atRisk; evidence = riskEvidence
                } else if now.timeIntervalSince(p.updatedAt) > policy.stalenessThresholdDays * 86_400 {
                    health = .stale
                    evidence = [.noUpdateSince(p.updatedAt, thresholdDays: policy.stalenessThresholdDays)]
                } else if action.0 == .executable {
                    health = .ready; evidence = [.actionExecutable]
                } else {
                    health = .active
                }
            }
        }

        return ProjectAssessment(
            id: p.id, health: health, healthEvidence: evidence,
            actionClass: action.0, actionEvidence: action.1,
            completionObstacles: obstacles)
    }

    private func classifyAction(
        _ p: ProjectSnapshot, graph: Graph, policy: AssessmentPolicy
    ) -> (ActionClass, [Evidence]) {
        let decisionBlockers = p.openBlockers.filter { $0.kind == .decision }
        if !decisionBlockers.isEmpty {
            return (.awaitingDecision, decisionBlockers.map { .decisionPending($0.id, owner: $0.owner) })
        }
        let otherBlockers = p.openBlockers.filter { $0.kind != .decision }
        let unsatisfied = graph.unsatisfiedBlockingPrerequisites(of: p.id)
        if !otherBlockers.isEmpty || !unsatisfied.isEmpty {
            return (.blocked, unsatisfied.map { .unsatisfiedDependency($0) }
                + otherBlockers.map { .openBlocker($0.id, $0.kind, owner: $0.owner) })
        }
        if !p.openGates.isEmpty {
            return (.awaitingReview, p.openGates.map { .openGate($0.id, $0.kind, reviewer: $0.reviewer) })
        }
        guard let raw = p.nextAction?.towerTrimmed,
              !raw.isEmpty else {
            return (.missing, [.actionMissing])
        }
        let lowered = raw.lowercased()
        for phrase in policy.vagueLeadingPhrases where lowered.hasPrefix(phrase) {
            return (.vague, [.actionVague(matchedRule: "starts with '\(phrase)'")])
        }
        if lowered.split(whereSeparator: \.isWhitespace).count < policy.minimumActionWords {
            return (.vague, [.actionVague(matchedRule: "fewer than \(policy.minimumActionWords) words")])
        }
        return (.executable, [.actionExecutable])
    }

    private func attentionEntry(
        _ p: ProjectSnapshot, assessment: ProjectAssessment,
        graph: Graph, now: Date, policy: AssessmentPolicy
    ) -> AttentionEntry {
        var evidence: [Evidence] = []
        var score = 0
        let downstreamCount = graph.affectedDownstream(of: p.id).count

        var bucket: Bucket
        switch assessment.health {
        case .ready, .active, .stale, .atRisk:
            switch assessment.actionClass {
            case .missing:
                bucket = .needsDefinition; evidence.append(.actionMissing)
            case .vague:
                bucket = .needsDefinition; evidence += assessment.actionEvidence
            default:
                bucket = .actionable
            }
        case .needsDecision, .inReview:
            if downstreamCount >= policy.unlockPromotionThreshold {
                bucket = .actionable
                evidence.append(.unlocksDownstream(count: downstreamCount))
            } else {
                bucket = .awaitingHuman
                evidence += assessment.healthEvidence
            }
        case .blocked:
            bucket = .blocked
            evidence += assessment.healthEvidence
        case .complete, .inactive:
            bucket = .blocked // unreachable: terminal/dormant filtered by caller
        }

        let priorityPts = policy.priorityPoints[p.priority] ?? 0
        score += priorityPts
        evidence.append(.priorityWeight(p.priority, points: priorityPts))

        if let deadline = p.deadline {
            let remaining = deadline.timeIntervalSince(now)
            if remaining < 0 {
                score += policy.overduePoints
                evidence.append(.deadlinePoints(policy.overduePoints, why: "overdue"))
            } else if remaining <= policy.deadlineRiskWindowDays * 86_400 {
                score += policy.imminentPoints
                evidence.append(.deadlinePoints(policy.imminentPoints, why: "deadline imminent"))
            } else if remaining <= policy.nearWindowDays * 86_400 {
                score += policy.nearPoints
                evidence.append(.deadlinePoints(policy.nearPoints, why: "deadline approaching"))
            }
        }
        if downstreamCount > 0 {
            let pts = min(downstreamCount * policy.pointsPerDownstream, policy.downstreamCap)
            score += pts
            evidence.append(.downstreamPoints(pts, count: downstreamCount))
        }
        if assessment.health == .stale {
            score += policy.stalePoints
            evidence.append(.stalePoints(policy.stalePoints))
        }
        if p.liveRisks.contains(where: { $0.severity >= policy.riskSeverityThreshold }) {
            score += policy.riskPoints
            evidence.append(.riskPoints(policy.riskPoints))
        }
        return AttentionEntry(id: p.id, bucket: bucket, score: score, evidence: evidence)
    }
}
