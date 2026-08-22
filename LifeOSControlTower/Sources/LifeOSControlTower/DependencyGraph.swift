import Foundation

/// Analysis view over the portfolio's dependency edges. Built from a
/// registry snapshot; pure and deterministic.
///
/// Edge direction convention: an edge runs *prerequisite -> dependent*
/// ("A blocks B" is stored on B as a dependency on A, and appears here as
/// an edge A -> B in `downstream`).
public struct DependencyGraph: Sendable {
    /// prerequisite -> dependents (all edge kinds)
    public private(set) var downstream: [ProjectID: [(dependent: ProjectID, kind: DependencyKind)]]
    /// dependent -> prerequisites (all edge kinds)
    public private(set) var upstream: [ProjectID: [Dependency]]
    private let projectIDs: Set<ProjectID>
    private let completed: Set<ProjectID>

    public init(_ registry: ProjectRegistry) {
        var down: [ProjectID: [(ProjectID, DependencyKind)]] = [:]
        var up: [ProjectID: [Dependency]] = [:]
        var ids = Set<ProjectID>()
        var done = Set<ProjectID>()
        for project in registry.allProjects {
            ids.insert(project.id)
            if project.status == .completed { done.insert(project.id) }
            up[project.id] = project.dependencies
            for dep in project.dependencies {
                down[dep.prerequisite, default: []].append((project.id, dep.kind))
            }
        }
        // Deterministic ordering.
        for key in down.keys { down[key]?.sort { $0.0 < $1.0 } }
        self.downstream = down
        self.upstream = up
        self.projectIDs = ids
        self.completed = done
    }

    // MARK: - Satisfaction

    /// Blocking prerequisites (edges of kind `blocks`/`requires`) of a project.
    public func blockingPrerequisites(of id: ProjectID) -> [ProjectID] {
        (upstream[id] ?? []).filter { $0.kind.isBlocking }.map(\.prerequisite)
    }

    /// Blocking prerequisites that are not yet completed.
    public func unsatisfiedBlockingPrerequisites(of id: ProjectID) -> [ProjectID] {
        blockingPrerequisites(of: id).filter { !completed.contains($0) }
    }

    /// True when every blocking prerequisite of the project is completed.
    public func areBlockingDependenciesSatisfied(_ id: ProjectID) -> Bool {
        unsatisfiedBlockingPrerequisites(of: id).isEmpty
    }

    /// Projects that become fully unblocked if `id` completes: dependents of
    /// `id` whose *remaining* blocking prerequisites are all completed.
    public func newlyUnblocked(afterCompleting id: ProjectID) -> [ProjectID] {
        (downstream[id] ?? [])
            .filter { $0.kind.isBlocking }
            .map(\.dependent)
            .filter { dependent in
                unsatisfiedBlockingPrerequisites(of: dependent)
                    .allSatisfy { $0 == id }
            }
            .sorted()
    }

    // MARK: - Impact

    /// All transitive dependents of `id` over blocking edges — the projects
    /// whose progress is affected if `id` stalls.
    public func affectedDownstream(of id: ProjectID) -> Set<ProjectID> {
        reach(from: id, follow: { pid in
            (downstream[pid] ?? []).filter { $0.kind.isBlocking }.map(\.dependent)
        })
    }

    /// All transitive blocking prerequisites of `id`.
    public func upstreamImpactSet(of id: ProjectID) -> Set<ProjectID> {
        reach(from: id, follow: { pid in blockingPrerequisites(of: pid) })
    }

    public func downstreamImpactSet(of id: ProjectID) -> Set<ProjectID> {
        affectedDownstream(of: id)
    }

    private func reach(from id: ProjectID, follow: (ProjectID) -> [ProjectID]) -> Set<ProjectID> {
        var seen = Set<ProjectID>()
        var stack = follow(id)
        while let next = stack.popLast() {
            guard !seen.contains(next) else { continue }
            seen.insert(next)
            stack.append(contentsOf: follow(next))
        }
        seen.remove(id)
        return seen
    }

    // MARK: - Cycles

    /// Detects circular *blocking* dependencies and returns each cycle's
    /// actual path (e.g. [A, B, C] meaning A -> B -> C -> A).
    /// Informational edges (`informs`, `reviewOf`) may legitimately form
    /// loops and are ignored here.
    public func detectCycles(includeNonBlocking: Bool = false) -> [[ProjectID]] {
        var color: [ProjectID: Int] = [:] // 0/absent = white, 1 = grey, 2 = black
        var parent: [ProjectID: ProjectID] = [:]
        var cycles: [[ProjectID]] = []
        var claimed = Set<ProjectID>() // avoid reporting the same cycle twice

        func neighbours(_ id: ProjectID) -> [ProjectID] {
            (downstream[id] ?? [])
                .filter { includeNonBlocking || $0.kind.isBlocking }
                .map(\.dependent)
        }

        func visit(_ start: ProjectID) {
            var stack: [(ProjectID, Int)] = [(start, 0)]
            color[start] = 1
            while let (node, idx) = stack.last {
                let ns = neighbours(node)
                if idx < ns.count {
                    stack[stack.count - 1].1 += 1
                    let next = ns[idx]
                    switch color[next] ?? 0 {
                    case 0:
                        color[next] = 1
                        parent[next] = node
                        stack.append((next, 0))
                    case 1:
                        // Found a cycle: walk back from `node` to `next`.
                        var path = [node]
                        var cursor = node
                        while cursor != next, let par = parent[cursor] {
                            cursor = par
                            path.append(cursor)
                        }
                        let cycle = path.reversed().map { $0 }
                        if claimed.isDisjoint(with: cycle) {
                            claimed.formUnion(cycle)
                            cycles.append(Array(cycle))
                        }
                    default:
                        break
                    }
                } else {
                    color[node] = 2
                    stack.removeLast()
                }
            }
        }

        for id in projectIDs.sorted() where (color[id] ?? 0) == 0 {
            visit(id)
        }
        return cycles
    }

    public var hasCycle: Bool { !detectCycles().isEmpty }

    // MARK: - Structure metrics

    /// Projects ranked by how much downstream work they gate.
    public func criticalHubs(top: Int = 5) -> [(project: ProjectID, downstreamCount: Int)] {
        var counts: [(project: ProjectID, downstreamCount: Int)] = []
        for id in projectIDs {
            let count = affectedDownstream(of: id).count
            if count > 0 { counts.append((project: id, downstreamCount: count)) }
        }
        counts.sort { lhs, rhs in
            if lhs.downstreamCount != rhs.downstreamCount {
                return lhs.downstreamCount > rhs.downstreamCount
            }
            return lhs.project < rhs.project
        }
        return Array(counts.prefix(top))
    }

    /// Longest blocking-prerequisite chain ending at `id` (0 for roots).
    /// Cycle-safe: members of a cycle report the depth reachable without
    /// re-entering the cycle.
    public func dependencyDepth(of id: ProjectID) -> Int {
        var memo: [ProjectID: Int] = [:]
        var visiting = Set<ProjectID>()
        func depth(_ pid: ProjectID) -> Int {
            if let cached = memo[pid] { return cached }
            guard !visiting.contains(pid) else { return 0 }
            visiting.insert(pid)
            let d = blockingPrerequisites(of: pid).map { depth($0) + 1 }.max() ?? 0
            visiting.remove(pid)
            memo[pid] = d
            return d
        }
        return depth(id)
    }

    /// The longest blocking chain in the portfolio, as an ordered path from
    /// its root prerequisite to its final dependent.
    public func longestChain() -> [ProjectID] {
        var memo: [ProjectID: (depth: Int, prev: ProjectID?)] = [:]
        var visiting = Set<ProjectID>()
        func solve(_ pid: ProjectID) -> (Int, ProjectID?) {
            if let cached = memo[pid] { return cached }
            guard !visiting.contains(pid) else { return (0, nil) }
            visiting.insert(pid)
            var best: (Int, ProjectID?) = (0, nil)
            for pre in blockingPrerequisites(of: pid).sorted() {
                let (d, _) = solve(pre)
                if d + 1 > best.0 { best = (d + 1, pre) }
            }
            visiting.remove(pid)
            memo[pid] = best
            return best
        }
        guard let end = projectIDs.sorted().max(by: { solve($0).0 < solve($1).0 }) else { return [] }
        var path = [end]
        var cursor = end
        while let prev = solve(cursor).1 {
            path.insert(prev, at: 0)
            cursor = prev
        }
        return path
    }
}

// MARK: - Blockage explanation

/// Structured answer to "why can this project not proceed?".
public struct BlockageExplanation: Sendable, Equatable {
    public var projectID: ProjectID
    /// Blocking prerequisites not yet completed.
    public var unsatisfiedDependencies: [ProjectID]
    /// Unresolved blockers on the project itself.
    public var openBlockerIDs: [BlockerID]
    /// Unresolved review gates holding the project or its milestones.
    public var openGateIDs: [ReviewGateID]

    public var isBlocked: Bool {
        !unsatisfiedDependencies.isEmpty || !openBlockerIDs.isEmpty || !openGateIDs.isEmpty
    }
}

extension DependencyGraph {
    /// Explains a project's blockage in structured form.
    public func explainBlockage(of project: Project) -> BlockageExplanation {
        BlockageExplanation(
            projectID: project.id,
            unsatisfiedDependencies: unsatisfiedBlockingPrerequisites(of: project.id).sorted(),
            openBlockerIDs: project.openBlockers.map(\.id).sorted(),
            openGateIDs: project.openReviewGates.map(\.id).sorted()
        )
    }
}
