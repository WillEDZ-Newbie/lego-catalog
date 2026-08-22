import XCTest
@testable import LifeOSControlTower

final class DependencyGraphTests: XCTestCase {

    /// A blocks B blocks C blocks D.
    private func chainRegistry() -> ProjectRegistry {
        var registry = makeRegistry(
            makeProject("A", status: .active), makeProject("B", status: .active),
            makeProject("C", status: .active), makeProject("D", status: .active))
        try! registry.addDependency(ProjectID("B"), on: ProjectID("A"), at: t0)
        try! registry.addDependency(ProjectID("C"), on: ProjectID("B"), at: t0)
        try! registry.addDependency(ProjectID("D"), on: ProjectID("C"), at: t0)
        return registry
    }

    func testAddRemoveDependencyEdges() throws {
        var registry = makeRegistry(makeProject("A"), makeProject("B"))
        try registry.addDependency(ProjectID("B"), on: ProjectID("A"), kind: .requires, at: t0)
        XCTAssertEqual(registry.project(ProjectID("B"))?.dependencies.count, 1)
        // duplicates rejected
        XCTAssertThrowsError(try registry.addDependency(ProjectID("B"), on: ProjectID("A"), kind: .requires, at: t0))
        // self-dependency rejected
        XCTAssertThrowsError(try registry.addDependency(ProjectID("A"), on: ProjectID("A"), at: t0))
        // missing target rejected
        XCTAssertThrowsError(try registry.addDependency(ProjectID("B"), on: ProjectID("zzz"), at: t0))
        try registry.removeDependency(ProjectID("B"), on: ProjectID("A"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("B"))?.dependencies.count, 0)
    }

    func testBlockingSatisfaction() throws {
        var registry = chainRegistry()
        let graph1 = DependencyGraph(registry)
        XCTAssertTrue(graph1.areBlockingDependenciesSatisfied(ProjectID("A")))
        XCTAssertFalse(graph1.areBlockingDependenciesSatisfied(ProjectID("B")))
        try registry.completeProject(ProjectID("A"), at: t0)
        let graph2 = DependencyGraph(registry)
        XCTAssertTrue(graph2.areBlockingDependenciesSatisfied(ProjectID("B")))
        XCTAssertFalse(graph2.areBlockingDependenciesSatisfied(ProjectID("C")))
    }

    func testNonBlockingEdgesNeverBlock() throws {
        var registry = makeRegistry(makeProject("A", status: .active), makeProject("B", status: .active))
        try registry.addDependency(ProjectID("B"), on: ProjectID("A"), kind: .informs, at: t0)
        XCTAssertTrue(DependencyGraph(registry).areBlockingDependenciesSatisfied(ProjectID("B")))
    }

    func testNewlyUnblockedOnlyWhenAllRemainingSatisfied() throws {
        // C depends on both A and B; completing A alone must not unblock C.
        var registry = makeRegistry(
            makeProject("A", status: .active), makeProject("B", status: .active),
            makeProject("C", status: .active))
        try registry.addDependency(ProjectID("C"), on: ProjectID("A"), at: t0)
        try registry.addDependency(ProjectID("C"), on: ProjectID("B"), at: t0)
        XCTAssertEqual(DependencyGraph(registry).newlyUnblocked(afterCompleting: ProjectID("A")), [])
        try registry.completeProject(ProjectID("B"), at: t0)
        XCTAssertEqual(DependencyGraph(registry).newlyUnblocked(afterCompleting: ProjectID("A")),
                       [ProjectID("C")])
    }

    func testAffectedDownstreamPropagation() {
        let graph = DependencyGraph(chainRegistry())
        XCTAssertEqual(graph.affectedDownstream(of: ProjectID("A")),
                       Set([ProjectID("B"), ProjectID("C"), ProjectID("D")]))
        XCTAssertEqual(graph.upstreamImpactSet(of: ProjectID("D")),
                       Set([ProjectID("A"), ProjectID("B"), ProjectID("C")]))
    }

    func testDirectCycleDetection() throws {
        var registry = makeRegistry(makeProject("A"), makeProject("B"))
        try registry.addDependency(ProjectID("A"), on: ProjectID("B"), at: t0)
        try registry.addDependency(ProjectID("B"), on: ProjectID("A"), at: t0)
        let cycles = DependencyGraph(registry).detectCycles()
        XCTAssertEqual(cycles.count, 1)
        XCTAssertEqual(Set(cycles[0]), Set([ProjectID("A"), ProjectID("B")]))
    }

    func testIndirectCycleDetectionReturnsPath() throws {
        var registry = makeRegistry(
            makeProject("A"), makeProject("B"), makeProject("C"), makeProject("solo"))
        // A -> B -> C -> A (edge direction: prerequisite -> dependent)
        try registry.addDependency(ProjectID("B"), on: ProjectID("A"), at: t0)
        try registry.addDependency(ProjectID("C"), on: ProjectID("B"), at: t0)
        try registry.addDependency(ProjectID("A"), on: ProjectID("C"), at: t0)
        let graph = DependencyGraph(registry)
        XCTAssertTrue(graph.hasCycle)
        let cycles = graph.detectCycles()
        XCTAssertEqual(cycles.count, 1)
        let cycle = cycles[0]
        XCTAssertEqual(Set(cycle), Set([ProjectID("A"), ProjectID("B"), ProjectID("C")]))
        // The returned path must be an actual cycle: consecutive edges exist.
        for i in cycle.indices {
            let from = cycle[i]
            let to = cycle[(i + 1) % cycle.count]
            let edgeExists = graph.downstream[from]?.contains { $0.dependent == to } ?? false
            XCTAssertTrue(edgeExists, "missing edge \(from) -> \(to) in reported cycle")
        }
    }

    func testInformationalLoopIsNotACycle() throws {
        var registry = makeRegistry(makeProject("A"), makeProject("B"))
        try registry.addDependency(ProjectID("A"), on: ProjectID("B"), kind: .informs, at: t0)
        try registry.addDependency(ProjectID("B"), on: ProjectID("A"), kind: .informs, at: t0)
        XCTAssertFalse(DependencyGraph(registry).hasCycle)
        XCTAssertEqual(DependencyGraph(registry).detectCycles(includeNonBlocking: true).count, 1)
    }

    func testCriticalHubs() throws {
        var registry = chainRegistry()
        // Hub with 3 direct dependents.
        try! registry.add(makeProject("hub"), at: t0)
        for name in ["s1", "s2", "s3"] {
            try registry.add(makeProject(name), at: t0)
            try registry.addDependency(ProjectID(name), on: ProjectID("hub"), at: t0)
        }
        let hubs = DependencyGraph(registry).criticalHubs(top: 2)
        // A gates B, C, D (3 downstream); hub gates s1, s2, s3 (3 downstream).
        XCTAssertEqual(hubs.count, 2)
        XCTAssertEqual(Set(hubs.map(\.project)), Set([ProjectID("A"), ProjectID("hub")]))
        XCTAssertTrue(hubs.allSatisfy { $0.downstreamCount == 3 })
    }

    func testDepthAndLongestChain() {
        let graph = DependencyGraph(chainRegistry())
        XCTAssertEqual(graph.dependencyDepth(of: ProjectID("A")), 0)
        XCTAssertEqual(graph.dependencyDepth(of: ProjectID("D")), 3)
        XCTAssertEqual(graph.longestChain(),
                       [ProjectID("A"), ProjectID("B"), ProjectID("C"), ProjectID("D")])
    }

    func testBlockageExplanation() throws {
        var registry = chainRegistry()
        try registry.addBlocker(ProjectID("B"), Blocker(
            id: BlockerID("blk-1"), type: .technical, summary: "Broken build",
            owner: .claude, createdAt: t0), at: t0)
        let graph = DependencyGraph(registry)
        let explanation = graph.explainBlockage(of: registry.project(ProjectID("B"))!)
        XCTAssertTrue(explanation.isBlocked)
        XCTAssertEqual(explanation.unsatisfiedDependencies, [ProjectID("A")])
        XCTAssertEqual(explanation.openBlockerIDs, [BlockerID("blk-1")])
        XCTAssertEqual(explanation.openGateIDs, [])

        let free = graph.explainBlockage(of: registry.project(ProjectID("A"))!)
        XCTAssertFalse(free.isBlocked)
    }

    func testBlockerPropagationThroughDownstream() throws {
        // A blocked -> everything downstream of A is in its impact set.
        var registry = chainRegistry()
        try registry.addBlocker(ProjectID("A"), Blocker(
            id: BlockerID("blk-a"), type: .external, summary: "Vendor outage",
            owner: .user, createdAt: t0), at: t0)
        let graph = DependencyGraph(registry)
        let affected = graph.affectedDownstream(of: ProjectID("A"))
        XCTAssertEqual(affected, Set([ProjectID("B"), ProjectID("C"), ProjectID("D")]))
        // And each of those cannot proceed because A is incomplete.
        for id in affected {
            XCTAssertFalse(graph.areBlockingDependenciesSatisfied(id) &&
                           graph.unsatisfiedBlockingPrerequisites(of: id).isEmpty)
        }
    }
}
