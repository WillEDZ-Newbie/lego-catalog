import Foundation

/// Deterministic, explainable "what deserves attention now?" ranking.
///
/// Design: projects are first placed in coarse **attention buckets**
/// (executable work outranks blocked work, with one documented exception:
/// user-facing decision/review items that unlock downstream work are
/// promoted). Within a bucket, a documented point system orders items and
/// doubles as the display score. Every entry carries its reasons; there is
/// no opaque prioritisation.
public struct WorkQueuePolicy: Sendable {
    /// Points per priority level.
    public var priorityPoints: [Priority: Int]
    /// Points when the deadline has passed.
    public var overduePoints: Int
    /// Points when the deadline is within `imminentWindowDays`.
    public var imminentDeadlinePoints: Int
    public var imminentWindowDays: Double
    /// Points when the deadline is within `nearWindowDays`.
    public var nearDeadlinePoints: Int
    public var nearWindowDays: Double
    /// Points per downstream project unlocked, capped at `downstreamCap`.
    public var pointsPerDownstream: Int
    public var downstreamCap: Int
    /// Points when the project is stale.
    public var stalenessPoints: Int
    /// Points when a live risk meets the health engine's risk threshold.
    public var riskPoints: Int
    /// Decision/review items whose downstream reach is at least this are
    /// promoted into the executable bucket (they unlock other work).
    public var unlockPromotionThreshold: Int

    public init(
        priorityPoints: [Priority: Int] = [.critical: 40, .high: 30, .medium: 20, .low: 10],
        overduePoints: Int = 25,
        imminentDeadlinePoints: Int = 20,
        imminentWindowDays: Double = 3,
        nearDeadlinePoints: Int = 10,
        nearWindowDays: Double = 7,
        pointsPerDownstream: Int = 3,
        downstreamCap: Int = 15,
        stalenessPoints: Int = 5,
        riskPoints: Int = 10,
        unlockPromotionThreshold: Int = 2
    ) {
        self.priorityPoints = priorityPoints
        self.overduePoints = overduePoints
        self.imminentDeadlinePoints = imminentDeadlinePoints
        self.imminentWindowDays = imminentWindowDays
        self.nearDeadlinePoints = nearDeadlinePoints
        self.nearWindowDays = nearWindowDays
        self.pointsPerDownstream = pointsPerDownstream
        self.downstreamCap = downstreamCap
        self.stalenessPoints = stalenessPoints
        self.riskPoints = riskPoints
        self.unlockPromotionThreshold = unlockPromotionThreshold
    }

    public static let `default` = WorkQueuePolicy()
}

/// Coarse ordering tier. Lower raw value = more attention.
public enum AttentionBucket: Int, Codable, Sendable, Comparable {
    /// Executable now (or promoted decision/review unlocking downstream work).
    case actionable = 0
    /// Waiting on a user decision or review.
    case awaitingHuman = 1
    /// Blocked on dependencies/blockers not in the user's hands.
    case blocked = 2

    public static func < (lhs: AttentionBucket, rhs: AttentionBucket) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

public struct WorkQueueEntry: Sendable, Equatable {
    public var projectID: ProjectID
    public var bucket: AttentionBucket
    /// Documented point total (used to order within a bucket; display-friendly).
    public var score: Int
    /// Human-readable evidence for the ranking.
    public var reasons: [String]
    public var health: HealthState
}

public enum WorkQueueEngine {
    /// Ranks all in-play projects. Completed, cancelled, archived and
    /// dormant work never appears.
    public static func rank(
        _ registry: ProjectRegistry,
        now: Date,
        policy: WorkQueuePolicy = .default,
        healthConfig: HealthConfiguration = .default
    ) -> [WorkQueueEntry] {
        let graph = DependencyGraph(registry)
        var entries: [WorkQueueEntry] = []

        for project in registry.allProjects {
            guard !project.status.isTerminal && project.status != .dormant else { continue }
            let health = HealthEngine.assess(project, in: registry, graph: graph, now: now, config: healthConfig)
            var reasons: [String] = []
            var score = 0

            // Bucket by actionability.
            let downstreamCount = graph.affectedDownstream(of: project.id).count
            var bucket: AttentionBucket
            switch health.state {
            case .ready, .active, .stale, .atRisk:
                bucket = .actionable
            case .needsDecision, .waitingForReview:
                bucket = .awaitingHuman
                if downstreamCount >= policy.unlockPromotionThreshold {
                    bucket = .actionable
                    reasons.append("resolving it unlocks \(downstreamCount) downstream project(s)")
                } else {
                    reasons.append(health.state == .needsDecision
                        ? "waiting on a user decision"
                        : "waiting on review")
                }
            case .blocked:
                bucket = .blocked
                reasons.append("blocked: " + health.reasons.map(\.description).joined(separator: "; "))
            case .complete, .inactive:
                continue
            }

            // Documented point components.
            let priorityPts = policy.priorityPoints[project.priority] ?? 0
            score += priorityPts
            reasons.append("\(project.priority.rawValue) priority (+\(priorityPts))")

            if let deadline = project.deadline {
                let remaining = deadline.timeIntervalSince(now)
                if remaining < 0 {
                    score += policy.overduePoints
                    reasons.append("overdue (+\(policy.overduePoints))")
                } else if remaining <= policy.imminentWindowDays * 86_400 {
                    score += policy.imminentDeadlinePoints
                    let days = Int((remaining / 86_400).rounded(.up))
                    reasons.append("deadline in \(days) day(s) (+\(policy.imminentDeadlinePoints))")
                } else if remaining <= policy.nearWindowDays * 86_400 {
                    score += policy.nearDeadlinePoints
                    reasons.append("deadline approaching (+\(policy.nearDeadlinePoints))")
                }
            }

            if downstreamCount > 0 {
                let pts = min(downstreamCount * policy.pointsPerDownstream, policy.downstreamCap)
                score += pts
                reasons.append("\(downstreamCount) downstream project(s) affected (+\(pts))")
            }

            if health.state == .stale {
                score += policy.stalenessPoints
                reasons.append("stale (+\(policy.stalenessPoints))")
            }

            if project.maxOpenRiskSeverity >= healthConfig.riskSeverityThreshold {
                score += policy.riskPoints
                reasons.append("high-severity open risk (+\(policy.riskPoints))")
            }

            entries.append(WorkQueueEntry(
                projectID: project.id,
                bucket: bucket,
                score: score,
                reasons: reasons,
                health: health.state
            ))
        }

        entries.sort { lhs, rhs in
            if lhs.bucket != rhs.bucket { return lhs.bucket < rhs.bucket }
            if lhs.score != rhs.score { return lhs.score > rhs.score }
            return lhs.projectID < rhs.projectID
        }
        return entries
    }
}
