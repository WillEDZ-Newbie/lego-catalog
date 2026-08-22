import Foundation

/// Dependency analysis over a state snapshot. Because `Tower` rejects
/// blocking cycles at the door, the blocking subgraph here is always a DAG —
/// no cycle-detection pass is needed downstream, only path queries.
public struct Graph: Sendable {
    private let downstream: [ProjectID: [(dependent: ProjectID, kind: DependencyKind)]]
    private let upstream: [ProjectID: [Dependency]]
    private let completed: Set<ProjectID>
    private let ids: [ProjectID]

    public init(_ state: TowerState) {
        var down: [ProjectID: [(ProjectID, DependencyKind)]] = [:]
        var up: [ProjectID: [Dependency]] = [:]
        var done = Set<ProjectID>()
        var all: [ProjectID] = []
        for p in state.allProjects {
            all.append(p.id)
            if p.lifecycle == .completed { done.insert(p.id) }
            up[p.id] = p.dependencies
            for dep in p.dependencies {
                down[dep.prerequisite, default: []].append((p.id, dep.kind))
            }
        }
        for key in down.keys { down[key]?.sort { $0.0 < $1.0 } }
        downstream = down
        upstream = up
        completed = done
        ids = all
    }

    public func blockingPrerequisites(of id: ProjectID) -> [ProjectID] {
        (upstream[id] ?? []).filter { $0.kind.isBlocking }.map(\.prerequisite)
    }

    public func unsatisfiedBlockingPrerequisites(of id: ProjectID) -> [ProjectID] {
        blockingPrerequisites(of: id).filter { !completed.contains($0) }.sorted()
    }

    public func isUnblocked(_ id: ProjectID) -> Bool {
        unsatisfiedBlockingPrerequisites(of: id).isEmpty
    }

    /// Transitive dependents over blocking edges.
    public func affectedDownstream(of id: ProjectID) -> Set<ProjectID> {
        var seen = Set<ProjectID>()
        var stack = (downstream[id] ?? []).filter { $0.kind.isBlocking }.map(\.dependent)
        while let next = stack.popLast() {
            guard seen.insert(next).inserted else { continue }
            stack += (downstream[next] ?? []).filter { $0.kind.isBlocking }.map(\.dependent)
        }
        return seen
    }

    /// Projects that become fully unblocked when `id` completes.
    public func newlyUnblocked(afterCompleting id: ProjectID) -> [ProjectID] {
        (downstream[id] ?? [])
            .filter { $0.kind.isBlocking }
            .map(\.dependent)
            .filter { unsatisfiedBlockingPrerequisites(of: $0).allSatisfy { $0 == id } }
            .sorted()
    }

    /// A blocking path from `from` down to `to`, if one exists
    /// (i.e. `to` transitively depends on `from`). Used by the cycle guard.
    public func blockingPath(from: ProjectID, to: ProjectID) -> [ProjectID]? {
        var parent: [ProjectID: ProjectID] = [:]
        var stack = [from]
        var seen: Set<ProjectID> = [from]
        while let cur = stack.popLast() {
            if cur == to {
                var path = [to]
                var walk = to
                while walk != from, let p = parent[walk] { path.insert(p, at: 0); walk = p }
                return path
            }
            for (dep, kind) in downstream[cur] ?? [] where kind.isBlocking {
                if seen.insert(dep).inserted { parent[dep] = cur; stack.append(dep) }
            }
        }
        return nil
    }

    /// Longest blocking chain ending at each project (DAG-safe by construction).
    public func depth(of id: ProjectID) -> Int {
        var memo: [ProjectID: Int] = [:]
        func solve(_ pid: ProjectID) -> Int {
            if let cached = memo[pid] { return cached }
            let d = blockingPrerequisites(of: pid).map { solve($0) + 1 }.max() ?? 0
            memo[pid] = d
            return d
        }
        return solve(id)
    }

    public func criticalHubs(top: Int = 5) -> [(project: ProjectID, downstreamCount: Int)] {
        var counts: [(ProjectID, Int)] = []
        for id in ids {
            let n = affectedDownstream(of: id).count
            if n > 0 { counts.append((id, n)) }
        }
        counts.sort { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0 < $1.0 }
        return counts.prefix(top).map { (project: $0.0, downstreamCount: $0.1) }
    }
}
