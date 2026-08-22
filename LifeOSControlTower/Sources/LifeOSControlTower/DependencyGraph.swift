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

    /// Detects circular *blocking* dependencies and returns each distinct
    /// elementary cycle\'s actual path (e.g. [A, B, C] meaning A -> B -> C -> A),
    /// including cycles that share nodes. Informational edges (`informs`,
    /// `reviewOf`) may legitimately form loops and are ignored unless
    /// `includeNonBlocking` is set.
    ///
    /// Enumeration runs only inside strongly connected components, so acyclic
    /// portfolios cost one linear pass. `limit` caps the number of reported
    /// cycles (a portfolio with more than that many distinct cycles is
    /// structurally broken regardless of the exact count).
    public func detectCycles(includeNonBlocking: Bool = false, limit: Int = 64) -> [[ProjectID]] {
        var adjacency: [ProjectID: [ProjectID]] = [:]
        for id in projectIDs {
            adjacency[id] = (downstream[id] ?? [])
                .filter { includeNonBlocking || $0.kind.isBlocking }
                .map(\.dependent)
                .sorted()
        }

        var cycles: [[ProjectID]] = []
        for component in stronglyConnectedComponents(adjacency: adjacency) {
            guard cycles.count < limit else { break }
            let members = Set(component)
            let selfLoop = component.count == 1
                && (adjacency[component[0]] ?? []).contains(component[0])
            guard component.count > 1 || selfLoop else { continue }

            // Enumerate elementary cycles inside the component. Each cycle is
            // found exactly once, rooted at its smallest member: the DFS from
            // root `r` may only walk nodes >= r.
            let ordered = component.sorted()
            for root in ordered {
                guard cycles.count < limit else { break }
                var path: [ProjectID] = [root]
                var onPath: Set<ProjectID> = [root]
                var iterators: [[ProjectID]] = [neighbours(of: root, in: members, adjacency: adjacency, atLeast: root)]
                while !iterators.isEmpty {
                    guard cycles.count < limit else { break }
                    if let next = iterators[iterators.count - 1].popLast() {
                        if next == root {
                            cycles.append(path)
                        } else if !onPath.contains(next) {
                            path.append(next)
                            onPath.insert(next)
                            iterators.append(neighbours(of: next, in: members, adjacency: adjacency, atLeast: root))
                        }
                    } else {
                        iterators.removeLast()
                        onPath.remove(path.removeLast())
                    }
                }
            }
        }
        return cycles
    }

    private func neighbours(
        of node: ProjectID,
        in members: Set<ProjectID>,
        adjacency: [ProjectID: [ProjectID]],
        atLeast root: ProjectID
    ) -> [ProjectID] {
        (adjacency[node] ?? []).filter { members.contains($0) && $0 >= root }
    }

    /// Iterative Tarjan strongly-connected-components (no recursion, so deep
    /// chains cannot overflow the stack). Deterministic ordering.
    private func stronglyConnectedComponents(
        adjacency: [ProjectID: [ProjectID]]
    ) -> [[ProjectID]] {
        var index: [ProjectID: Int] = [:]
        var lowlink: [ProjectID: Int] = [:]
        var onStack: Set<ProjectID> = []
        var stack: [ProjectID] = []
        var counter = 0
        var components: [[ProjectID]] = []

        for start in projectIDs.sorted() where index[start] == nil {
            var work: [(node: ProjectID, neighbourIndex: Int)] = [(start, 0)]
            index[start] = counter; lowlink[start] = counter; counter += 1
            stack.append(start); onStack.insert(start)

            while let (node, ni) = work.last {
                let ns = adjacency[node] ?? []
                if ni < ns.count {
                    work[work.count - 1].neighbourIndex += 1
                    let next = ns[ni]
                    if index[next] == nil {
                        index[next] = counter; lowlink[next] = counter; counter += 1
                        stack.append(next); onStack.insert(next)
                        work.append((next, 0))
                    } else if onStack.contains(next) {
                        lowlink[node] = min(lowlink[node]!, index[next]!)
                    }
                } else {
                    work.removeLast()
                    if let (parent, _) = work.last {
                        lowlink[parent] = min(lowlink[parent]!, lowlink[node]!)
                    }
                    if lowlink[node] == index[node] {
                        var component: [ProjectID] = []
                        while let top = stack.popLast() {
                            onStack.remove(top)
                            component.append(top)
                            if top == node { break }
                        }
                        components.append(component)
                    }
                }
            }
        }
        return components
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
