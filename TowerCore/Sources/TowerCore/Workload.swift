#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// Portfolio-level workload analysis: reports load, never reassigns work,
/// never invents capacity.
public struct WorkloadReport: Sendable {
    public struct OverloadFlag: Sendable, Equatable {
        public var ownerLabel: String
        public var activeCount: Int
        public var threshold: Int
    }
    public var activeCountByOwner: [String: Int]
    public var awaitingReviewByReviewer: [String: Int]
    public var blockedByBlockerOwner: [String: Int]
    public var criticalHighByOwner: [String: Int]
    public var milestonesDueSoon: [(project: ProjectID, milestone: MilestoneID, deadline: Date)]
    public var overloadFlags: [OverloadFlag]
}

public struct WorkloadPolicy: Sendable {
    public var overloadThreshold = 8
    public var dueSoonWindowDays: Double = 14
    public init() {}
    public static let `default` = WorkloadPolicy()
}

extension Tower {
    public func workload(at now: Date, policy: WorkloadPolicy = .default) -> WorkloadReport {
        var active: [String: Int] = [:]
        var review: [String: Int] = [:]
        var blocked: [String: Int] = [:]
        var critHigh: [String: Int] = [:]
        var due: [(ProjectID, MilestoneID, Date)] = []

        for p in state.allProjects where p.lifecycle != .archived {
            let inPlay = !p.lifecycle.isTerminal && p.lifecycle != .dormant
            if inPlay {
                active[p.owner.label, default: 0] += 1
                if p.priority == .critical || p.priority == .high {
                    critHigh[p.owner.label, default: 0] += 1
                }
            }
            for g in p.openGates { review[g.reviewer.label, default: 0] += 1 }
            for b in p.openBlockers { blocked[b.owner.label, default: 0] += 1 }
            for m in p.milestones where !m.isComplete {
                if let d = m.deadline, d >= now,
                   d.timeIntervalSince(now) <= policy.dueSoonWindowDays * 86_400 {
                    due.append((p.id, m.id, d))
                }
            }
        }
        due.sort { $0.2 != $1.2 ? $0.2 < $1.2 : $0.0 < $1.0 }
        let flags = active.filter { $0.value >= policy.overloadThreshold }
            .sorted { $0.key < $1.key }
            .map { WorkloadReport.OverloadFlag(ownerLabel: $0.key, activeCount: $0.value,
                                               threshold: policy.overloadThreshold) }
        return WorkloadReport(
            activeCountByOwner: active, awaitingReviewByReviewer: review,
            blockedByBlockerOwner: blocked, criticalHighByOwner: critHigh,
            milestonesDueSoon: due.map { (project: $0.0, milestone: $0.1, deadline: $0.2) },
            overloadFlags: flags)
    }
}
