import Foundation

/// Fluent query layer mirroring the approved core's shape
/// (`registry.query().blocked()` …). Pure projections over a state
/// snapshot — reading can never mutate (boundaries brief §3.2).
public struct TowerQuery: Sendable {
    private let state: TowerState
    private let includeArchived: Bool
    private let policy: AssessmentPolicy

    init(state: TowerState, includeArchived: Bool, policy: AssessmentPolicy) {
        self.state = state
        self.includeArchived = includeArchived
        self.policy = policy
    }

    public var all: [ProjectSnapshot] {
        state.allProjects.filter { includeArchived || $0.lifecycle != .archived }
    }

    public func filter(_ isIncluded: (ProjectSnapshot) -> Bool) -> [ProjectSnapshot] {
        all.filter(isIncluded)
    }

    public func withLifecycle(_ l: Lifecycle) -> [ProjectSnapshot] { filter { $0.lifecycle == l } }
    public func withPriority(_ p: Priority) -> [ProjectSnapshot] { filter { $0.priority == p } }
    public func ownedBy(_ owner: Owner) -> [ProjectSnapshot] { filter { $0.owner.involves(owner) } }
    public func completed() -> [ProjectSnapshot] { withLifecycle(.completed) }
    public func dormant() -> [ProjectSnapshot] { withLifecycle(.dormant) }
    public func inStage(_ stage: String) -> [ProjectSnapshot] {
        filter { $0.stage.caseInsensitiveCompare(stage) == .orderedSame }
    }

    public func needingReview() -> [ProjectSnapshot] {
        filter { !$0.lifecycle.isTerminal && !$0.openGates.isEmpty }
    }
    public func needingDecision() -> [ProjectSnapshot] {
        filter { p in !p.lifecycle.isTerminal && p.openBlockers.contains { $0.kind == .decision } }
    }
    public func blocked() -> [ProjectSnapshot] {
        let graph = Graph(state)
        return filter { p in
            guard !p.lifecycle.isTerminal else { return false }
            return p.openBlockers.contains { $0.kind != .decision }
                || !graph.isUnblocked(p.id)
        }
    }
    public func readyToStart() -> [ProjectSnapshot] {
        let graph = Graph(state)
        return filter { p in
            (p.lifecycle == .notStarted || p.lifecycle == .active)
                && p.openBlockers.isEmpty && p.openGates.isEmpty
                && graph.isUnblocked(p.id)
        }
    }
    public func dependingOn(_ id: ProjectID, transitive: Bool = false) -> [ProjectSnapshot] {
        if transitive {
            let affected = Graph(state).affectedDownstream(of: id)
            return filter { affected.contains($0.id) }
        }
        return filter { p in p.dependencies.contains { $0.prerequisite == id } }
    }
    public func dueSoon(within interval: TimeInterval, now: Date) -> [ProjectSnapshot] {
        filter { p in
            guard let d = p.deadline, !p.lifecycle.isTerminal else { return false }
            return d >= now && d.timeIntervalSince(now) <= interval
        }
    }
    public func overdue(now: Date) -> [ProjectSnapshot] {
        filter { p in
            guard let d = p.deadline, !p.lifecycle.isTerminal else { return false }
            return d < now
        }
    }
    public func stale(now: Date) -> [ProjectSnapshot] {
        filter { p in
            guard p.lifecycle == .active || p.lifecycle == .notStarted else { return false }
            return now.timeIntervalSince(p.updatedAt) > policy.stalenessThresholdDays * 86_400
        }
    }
    public func withOpenRisks() -> [ProjectSnapshot] { filter { !$0.liveRisks.isEmpty } }
}

extension Tower {
    public func query(includeArchived: Bool = false,
                      policy: AssessmentPolicy = .default) -> TowerQuery {
        TowerQuery(state: state, includeArchived: includeArchived, policy: policy)
    }
}
