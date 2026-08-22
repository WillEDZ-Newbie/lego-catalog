import Foundation

/// Aggregated portfolio snapshot: counts plus the affected project IDs.
public struct PortfolioHealthSnapshot: Sendable, Equatable {
    public var totalProjects: Int
    public var active: [ProjectID]
    public var ready: [ProjectID]
    public var blocked: [ProjectID]
    public var awaitingReview: [ProjectID]
    public var needsDecision: [ProjectID]
    public var stale: [ProjectID]
    public var atRisk: [ProjectID]
    public var overdue: [ProjectID]
    public var completed: [ProjectID]
    public var dormant: [ProjectID]
    public var criticalProjects: [ProjectID]
    /// Projects gating the most downstream work.
    public var criticalDependencyHubs: [(project: ProjectID, downstreamCount: Int)]

    public static func == (lhs: PortfolioHealthSnapshot, rhs: PortfolioHealthSnapshot) -> Bool {
        lhs.totalProjects == rhs.totalProjects
            && lhs.active == rhs.active && lhs.ready == rhs.ready
            && lhs.blocked == rhs.blocked && lhs.awaitingReview == rhs.awaitingReview
            && lhs.needsDecision == rhs.needsDecision && lhs.stale == rhs.stale
            && lhs.atRisk == rhs.atRisk && lhs.overdue == rhs.overdue
            && lhs.completed == rhs.completed && lhs.dormant == rhs.dormant
            && lhs.criticalProjects == rhs.criticalProjects
            && lhs.criticalDependencyHubs.elementsEqual(rhs.criticalDependencyHubs, by: ==)
    }
}

public enum PortfolioAnalyzer {
    /// Builds the portfolio health snapshot. Archived work is excluded
    /// (it is deliberately out of play), completed work is counted.
    public static func healthSnapshot(
        _ registry: ProjectRegistry,
        now: Date,
        config: HealthConfiguration = .default
    ) -> PortfolioHealthSnapshot {
        let graph = DependencyGraph(registry)
        let inPlay = registry.allProjects.filter { $0.status != .archived }
        let health = HealthEngine.assessAll(registry, now: now, config: config)

        func ids(_ state: HealthState) -> [ProjectID] {
            inPlay.filter { health[$0.id]?.state == state }.map(\.id)
        }

        return PortfolioHealthSnapshot(
            totalProjects: inPlay.count,
            active: ids(.active),
            ready: ids(.ready),
            blocked: ids(.blocked),
            awaitingReview: ids(.waitingForReview),
            needsDecision: ids(.needsDecision),
            stale: ids(.stale),
            atRisk: ids(.atRisk),
            overdue: inPlay.filter { $0.isOverdue(now: now) }.map(\.id),
            completed: ids(.complete),
            dormant: inPlay.filter { $0.status == .dormant }.map(\.id),
            criticalProjects: inPlay.filter { $0.priority == .critical && !$0.status.isTerminal }.map(\.id),
            criticalDependencyHubs: graph.criticalHubs(top: 5)
        )
    }
}

// MARK: - Capacity / workload

/// Portfolio-level workload analysis. Reports load; never reassigns work
/// and never invents capacity the user has not declared.
public struct WorkloadReport: Sendable {
    public struct OverloadFlag: Sendable, Equatable {
        public var owner: Owner
        public var activeCount: Int
        public var threshold: Int
    }

    /// Active (non-terminal, non-dormant) project count per owner label.
    public var activeCountByOwner: [String: Int]
    /// Open review gates per reviewer label.
    public var awaitingReviewByReviewer: [String: Int]
    /// Open blockers per blocker-owner label.
    public var blockedByBlockerOwner: [String: Int]
    /// Critical/high-priority in-play work per owner label.
    public var criticalHighByOwner: [String: Int]
    /// Milestones due within the window, with their projects.
    public var milestonesDueSoon: [(project: ProjectID, milestone: MilestoneID, deadline: Date)]
    public var overloadFlags: [OverloadFlag]
}

public struct WorkloadPolicy: Sendable {
    /// Active project count at or above which an owner is flagged.
    public var overloadThreshold: Int
    /// Window for "milestones due soon".
    public var dueSoonWindowDays: Double

    public init(overloadThreshold: Int = 8, dueSoonWindowDays: Double = 14) {
        self.overloadThreshold = overloadThreshold
        self.dueSoonWindowDays = dueSoonWindowDays
    }

    public static let `default` = WorkloadPolicy()
}

public enum WorkloadAnalyzer {
    public static func report(
        _ registry: ProjectRegistry,
        now: Date,
        policy: WorkloadPolicy = .default
    ) -> WorkloadReport {
        var activeByOwner: [String: Int] = [:]
        var activeOwners: [String: Owner] = [:]
        var reviewByReviewer: [String: Int] = [:]
        var blockedByOwner: [String: Int] = [:]
        var criticalHighByOwner: [String: Int] = [:]
        var milestonesDue: [(ProjectID, MilestoneID, Date)] = []

        for p in registry.allProjects where p.status != .archived {
            let inPlay = !p.status.isTerminal && p.status != .dormant
            if inPlay {
                activeByOwner[p.owner.label, default: 0] += 1
                activeOwners[p.owner.label] = p.owner
                if p.priority == .critical || p.priority == .high {
                    criticalHighByOwner[p.owner.label, default: 0] += 1
                }
            }
            for gate in p.openReviewGates {
                reviewByReviewer[gate.reviewer.label, default: 0] += 1
            }
            for blocker in p.openBlockers {
                blockedByOwner[blocker.owner.label, default: 0] += 1
            }
            for m in p.milestones where m.state != .completed {
                if let deadline = m.deadline,
                   deadline >= now,
                   deadline.timeIntervalSince(now) <= policy.dueSoonWindowDays * 86_400 {
                    milestonesDue.append((p.id, m.id, deadline))
                }
            }
        }

        milestonesDue.sort { $0.2 != $1.2 ? $0.2 < $1.2 : $0.0 < $1.0 }

        let flags: [WorkloadReport.OverloadFlag] = activeByOwner
            .filter { $0.value >= policy.overloadThreshold }
            .sorted { $0.key < $1.key }
            .compactMap { label, count in
                guard let owner = activeOwners[label] else { return nil }
                return WorkloadReport.OverloadFlag(
                    owner: owner, activeCount: count, threshold: policy.overloadThreshold)
            }

        return WorkloadReport(
            activeCountByOwner: activeByOwner,
            awaitingReviewByReviewer: reviewByReviewer,
            blockedByBlockerOwner: blockedByOwner,
            criticalHighByOwner: criticalHighByOwner,
            milestonesDueSoon: milestonesDue.map { (project: $0.0, milestone: $0.1, deadline: $0.2) },
            overloadFlags: flags
        )
    }
}
