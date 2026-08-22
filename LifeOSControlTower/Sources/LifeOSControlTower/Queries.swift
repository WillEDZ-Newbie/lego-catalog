import Foundation

/// Fluent, predictable portfolio queries. Archived work is excluded by
/// default from every query; pass `includeArchived: true` to see it.
public struct ProjectQuery: Sendable {
    private let registry: ProjectRegistry
    private let includeArchived: Bool

    init(registry: ProjectRegistry, includeArchived: Bool) {
        self.registry = registry
        self.includeArchived = includeArchived
    }

    /// All projects visible to this query, in stable ID order.
    public var all: [Project] {
        registry.allProjects.filter { includeArchived || $0.status != .archived }
    }

    public func filter(_ isIncluded: (Project) -> Bool) -> [Project] {
        all.filter(isIncluded)
    }

    // MARK: Status/priority/owner

    public func withStatus(_ status: ProjectStatus) -> [Project] {
        filter { $0.status == status }
    }

    public func withPriority(_ priority: Priority) -> [Project] {
        filter { $0.priority == priority }
    }

    public func ownedBy(_ owner: Owner) -> [Project] {
        filter { $0.owner.involves(owner) }
    }

    public func completed() -> [Project] { withStatus(.completed) }
    public func dormant() -> [Project] { withStatus(.dormant) }

    public func inStage(_ stage: String) -> [Project] {
        filter { $0.currentStage.caseInsensitiveCompare(stage) == .orderedSame }
    }

    public func inStabilisation() -> [Project] { inStage("stabilisation") }

    // MARK: Evidence-derived

    /// Projects with at least one open review gate.
    public func needingReview() -> [Project] {
        filter { !$0.status.isTerminal && !$0.openReviewGates.isEmpty }
    }

    /// Projects that cannot proceed: unresolved non-decision blocker or
    /// unsatisfied blocking dependency.
    public func blocked() -> [Project] {
        let graph = DependencyGraph(registry)
        return filter { p in
            guard !p.status.isTerminal else { return false }
            let nonDecisionBlockers = p.openBlockers.contains { $0.type != .decision }
            return nonDecisionBlockers || !graph.areBlockingDependenciesSatisfied(p.id)
        }
    }

    /// Projects waiting on an explicit decision blocker.
    public func needingDecision() -> [Project] {
        filter { p in
            !p.status.isTerminal && p.openBlockers.contains { $0.type == .decision }
        }
    }

    /// Not-yet-terminal projects whose blocking dependencies are all
    /// satisfied, with no open blockers or gates.
    public func readyToStart() -> [Project] {
        let graph = DependencyGraph(registry)
        return filter { p in
            (p.status == .notStarted || p.status == .active)
                && p.openBlockers.isEmpty
                && p.openReviewGates.isEmpty
                && graph.areBlockingDependenciesSatisfied(p.id)
        }
    }

    /// Projects that (transitively or directly) depend on the given project.
    public func dependingOn(_ id: ProjectID, transitive: Bool = false) -> [Project] {
        if transitive {
            let graph = DependencyGraph(registry)
            let affected = graph.affectedDownstream(of: id)
            return filter { affected.contains($0.id) }
        }
        return filter { p in p.dependencies.contains { $0.prerequisite == id } }
    }

    // MARK: Time-based

    public func dueSoon(within interval: TimeInterval, now: Date) -> [Project] {
        filter { p in
            guard let deadline = p.deadline, !p.status.isTerminal else { return false }
            return deadline >= now && deadline.timeIntervalSince(now) <= interval
        }
    }

    public func overdue(now: Date) -> [Project] {
        filter { $0.isOverdue(now: now) }
    }

    public func stale(now: Date, config: HealthConfiguration = .default) -> [Project] {
        filter { p in
            guard p.status == .active || p.status == .notStarted else { return false }
            return now.timeIntervalSince(p.updatedAt) > config.stalenessThresholdDays * 86_400
        }
    }

    // MARK: Risk

    public func withOpenRisks() -> [Project] {
        filter { !$0.openRisks.isEmpty }
    }
}

extension ProjectRegistry {
    /// Entry point for the fluent query layer:
    /// `registry.query().blocked()`, `registry.query().withPriority(.critical)` …
    public func query(includeArchived: Bool = false) -> ProjectQuery {
        ProjectQuery(registry: self, includeArchived: includeArchived)
    }
}
