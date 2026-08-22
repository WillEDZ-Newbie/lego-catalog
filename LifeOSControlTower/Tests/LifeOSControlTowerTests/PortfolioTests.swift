import XCTest
@testable import LifeOSControlTower

final class QueryTests: XCTestCase {

    private func sampleRegistry() throws -> ProjectRegistry {
        var registry = makeRegistry(
            makeProject("ready", status: .active, priority: .critical, owner: .claude),
            makeProject("upstream", status: .active),
            makeProject("gated", status: .active),
            makeProject("deciding", status: .active),
            makeProject("done", status: .completed),
            makeProject("sleeping", status: .dormant),
            makeProject("filed", status: .archived))
        try registry.addDependency(ProjectID("gated"), on: ProjectID("upstream"), at: t0)
        try registry.openReviewGate(ProjectID("gated"), ReviewGate(
            id: ReviewGateID("g"), title: "r", kind: .userApproval, reviewer: .user, requestedAt: t0), at: t0)
        try registry.addBlocker(ProjectID("deciding"), Blocker(
            id: BlockerID("b"), type: .decision, summary: "choose", owner: .user, createdAt: t0), at: t0)
        try registry.setDeadline(ProjectID("ready"), to: t0.addingTimeInterval(days(5)), at: t0)
        return registry
    }

    func testNamedQueries() throws {
        let registry = try sampleRegistry()
        XCTAssertEqual(registry.query().needingReview().map(\.id), [ProjectID("gated")])
        XCTAssertEqual(registry.query().blocked().map(\.id), [ProjectID("gated")]) // unsatisfied dep
        XCTAssertEqual(registry.query().needingDecision().map(\.id), [ProjectID("deciding")])
        XCTAssertEqual(Set(registry.query().readyToStart().map(\.id)),
                       Set([ProjectID("ready"), ProjectID("upstream")]))
        XCTAssertEqual(registry.query().withPriority(.critical).map(\.id), [ProjectID("ready")])
        XCTAssertEqual(registry.query().ownedBy(.claude).map(\.id), [ProjectID("ready")])
        XCTAssertEqual(registry.query().dependingOn(ProjectID("upstream")).map(\.id), [ProjectID("gated")])
        XCTAssertEqual(registry.query().completed().map(\.id), [ProjectID("done")])
        XCTAssertEqual(registry.query().dormant().map(\.id), [ProjectID("sleeping")])
        XCTAssertEqual(registry.query().dueSoon(within: days(7), now: t0).map(\.id), [ProjectID("ready")])
        XCTAssertEqual(registry.query().dueSoon(within: days(2), now: t0), [])
    }

    func testOverdueAndStaleQueries() throws {
        var registry = makeRegistry(
            makeProject("late", status: .active),
            makeProject("fresh", status: .active))
        try registry.setDeadline(ProjectID("late"), to: t0.addingTimeInterval(days(1)), at: t0)
        let later = t0.addingTimeInterval(days(20))
        XCTAssertEqual(registry.query().overdue(now: later).map(\.id), [ProjectID("late")])
        XCTAssertEqual(Set(registry.query().stale(now: later).map(\.id)),
                       Set([ProjectID("late"), ProjectID("fresh")]))
        XCTAssertEqual(registry.query().stale(now: t0), [])
    }

    func testStageQueries() throws {
        var registry = makeRegistry(makeProject("s", status: .active))
        try registry.setStage(ProjectID("s"), to: "Stabilisation", at: t0)
        XCTAssertEqual(registry.query().inStabilisation().map(\.id), [ProjectID("s")])
    }
}

final class WorkQueueTests: XCTestCase {

    func testExecutableOutranksBlockedRegardlessOfPriority() throws {
        var registry = makeRegistry(
            makeProject("free-low", status: .active, priority: .low),
            makeProject("upstream", status: .active, priority: .low),
            makeProject("blocked-critical", status: .active, priority: .critical))
        try registry.addDependency(ProjectID("blocked-critical"), on: ProjectID("upstream"), at: t0)
        let queue = WorkQueueEngine.rank(registry, now: t0)
        let blockedIndex = queue.firstIndex { $0.projectID == ProjectID("blocked-critical") }!
        let freeIndex = queue.firstIndex { $0.projectID == ProjectID("free-low") }!
        XCTAssertLessThan(freeIndex, blockedIndex)
        XCTAssertEqual(queue[blockedIndex].bucket, .blocked)
    }

    func testUserDecisionUnlockingDownstreamIsPromoted() throws {
        var registry = makeRegistry(
            makeProject("chooser", status: .active, priority: .high),
            makeProject("d1", status: .active), makeProject("d2", status: .active),
            makeProject("solo", status: .active, priority: .low))
        try registry.addBlocker(ProjectID("chooser"), Blocker(
            id: BlockerID("b"), type: .decision, summary: "choose", owner: .user, createdAt: t0), at: t0)
        try registry.addDependency(ProjectID("d1"), on: ProjectID("chooser"), at: t0)
        try registry.addDependency(ProjectID("d2"), on: ProjectID("chooser"), at: t0)
        let queue = WorkQueueEngine.rank(registry, now: t0)
        let chooser = queue.first { $0.projectID == ProjectID("chooser") }!
        XCTAssertEqual(chooser.bucket, .actionable) // promoted: unlocks 2 downstream
        XCTAssertTrue(chooser.reasons.contains { $0.contains("unlocks 2 downstream") })
        // and it outranks the low-priority solo item within the bucket
        let soloIndex = queue.firstIndex { $0.projectID == ProjectID("solo") }!
        let chooserIndex = queue.firstIndex { $0.projectID == ProjectID("chooser") }!
        XCTAssertLessThan(chooserIndex, soloIndex)
    }

    func testPriorityAndDeadlineOrderingWithExplanations() throws {
        var registry = makeRegistry(
            makeProject("crit", status: .active, priority: .critical),
            makeProject("high-due", status: .active, priority: .high),
            makeProject("med", status: .active, priority: .medium),
            makeProject("low", status: .active, priority: .low))
        try registry.setDeadline(ProjectID("high-due"), to: t0.addingTimeInterval(days(2)), at: t0)
        let queue = WorkQueueEngine.rank(registry, now: t0)
        XCTAssertEqual(queue.map(\.projectID),
                       [ProjectID("high-due"), ProjectID("crit"), ProjectID("med"), ProjectID("low")])
        // high-due: 30 (high) + 20 (imminent deadline) = 50 > crit 40
        XCTAssertEqual(queue[0].score, 50)
        XCTAssertEqual(queue[1].score, 40)
        // every entry explains itself
        for entry in queue {
            XCTAssertFalse(entry.reasons.isEmpty, "\(entry.projectID) has no explanation")
        }
        XCTAssertTrue(queue[0].reasons.contains { $0.contains("deadline in") })
    }

    func testPolicyIsConfigurable() throws {
        var registry = makeRegistry(
            makeProject("crit", status: .active, priority: .critical),
            makeProject("due", status: .active, priority: .low))
        try registry.setDeadline(ProjectID("due"), to: t0.addingTimeInterval(days(1)), at: t0)
        var policy = WorkQueuePolicy()
        policy.imminentDeadlinePoints = 90 // deadlines dominate under this policy
        let queue = WorkQueueEngine.rank(registry, now: t0, policy: policy)
        XCTAssertEqual(queue.first?.projectID, ProjectID("due"))
    }

    func testTerminalAndDormantWorkNeverAppears() throws {
        let registry = makeRegistry(
            makeProject("live", status: .active),
            makeProject("done", status: .completed),
            makeProject("iced", status: .dormant),
            makeProject("filed", status: .archived),
            makeProject("dead", status: .cancelled))
        let ids = WorkQueueEngine.rank(registry, now: t0).map(\.projectID)
        XCTAssertEqual(ids, [ProjectID("live")])
    }
}

final class WorkloadAndPortfolioTests: XCTestCase {

    func testWorkloadReport() throws {
        var registry = makeRegistry(
            makeProject("a", status: .active, priority: .critical, owner: .claude),
            makeProject("b", status: .active, owner: .claude),
            makeProject("c", status: .active, priority: .high, owner: .user))
        try registry.openReviewGate(ProjectID("a"), ReviewGate(
            id: ReviewGateID("g"), title: "r", kind: .userApproval, reviewer: .user, requestedAt: t0), at: t0)
        try registry.addBlocker(ProjectID("b"), Blocker(
            id: BlockerID("blk"), type: .access, summary: "creds", owner: .user, createdAt: t0), at: t0)
        try registry.addMilestone(ProjectID("c"), Milestone(
            id: MilestoneID("m"), title: "due", state: .active, owner: .user,
            deadline: t0.addingTimeInterval(days(3)), createdAt: t0), at: t0)

        let report = WorkloadAnalyzer.report(registry, now: t0)
        XCTAssertEqual(report.activeCountByOwner["claude"], 2)
        XCTAssertEqual(report.activeCountByOwner["user"], 1)
        XCTAssertEqual(report.awaitingReviewByReviewer["user"], 1)
        XCTAssertEqual(report.blockedByBlockerOwner["user"], 1)
        XCTAssertEqual(report.criticalHighByOwner["claude"], 1)
        XCTAssertEqual(report.criticalHighByOwner["user"], 1)
        XCTAssertEqual(report.milestonesDueSoon.count, 1)
        XCTAssertEqual(report.milestonesDueSoon[0].milestone, MilestoneID("m"))
        XCTAssertTrue(report.overloadFlags.isEmpty)
    }

    func testOverloadFlagWithConfigurableThreshold() {
        var registry = ProjectRegistry()
        for i in 0..<4 {
            try! registry.add(makeProject("p\(i)", owner: .claude), at: t0)
            try! registry.setStatus(ProjectID("p\(i)"), to: .active, at: t0)
        }
        let report = WorkloadAnalyzer.report(registry, now: t0,
                                             policy: WorkloadPolicy(overloadThreshold: 3))
        XCTAssertEqual(report.overloadFlags.count, 1)
        XCTAssertEqual(report.overloadFlags[0].owner, .claude)
        XCTAssertEqual(report.overloadFlags[0].activeCount, 4)
    }

    func testPortfolioHealthAggregates() throws {
        var registry = makeRegistry(
            makeProject("ready", status: .active),
            makeProject("upstream", status: .active),
            makeProject("blocked", status: .active),
            makeProject("done", status: .completed),
            makeProject("iced", status: .dormant),
            makeProject("filed", status: .archived),
            makeProject("crit", status: .active, priority: .critical))
        try registry.addDependency(ProjectID("blocked"), on: ProjectID("upstream"), at: t0)
        try registry.setDeadline(ProjectID("crit"), to: t0.addingTimeInterval(-days(1)), at: t0)

        let snapshot = PortfolioAnalyzer.healthSnapshot(registry, now: t0)
        XCTAssertEqual(snapshot.totalProjects, 6) // archived excluded
        XCTAssertEqual(Set(snapshot.ready), Set([ProjectID("ready"), ProjectID("upstream")]))
        XCTAssertEqual(snapshot.blocked, [ProjectID("blocked")])
        XCTAssertEqual(snapshot.completed, [ProjectID("done")])
        XCTAssertEqual(snapshot.dormant, [ProjectID("iced")])
        XCTAssertEqual(snapshot.overdue, [ProjectID("crit")])
        XCTAssertEqual(snapshot.atRisk, [ProjectID("crit")])
        XCTAssertEqual(snapshot.criticalProjects, [ProjectID("crit")])
        XCTAssertEqual(snapshot.criticalDependencyHubs.map(\.project), [ProjectID("upstream")])
    }
}

final class ChangeDetectionTests: XCTestCase {

    func testSnapshotDiffReportsMaterialChanges() throws {
        var registry = makeRegistry(
            makeProject("p", status: .active, priority: .medium),
            makeProject("upstream", status: .active))
        let before = registry // value-type snapshot

        try registry.setPriority(ProjectID("p"), to: .critical, at: t0)
        try registry.setOwner(ProjectID("p"), to: .claude, at: t0)
        try registry.setNextAction(ProjectID("p"), to: "Cut the release branch and tag rc1", at: t0)
        try registry.addDependency(ProjectID("p"), on: ProjectID("upstream"), at: t0)
        try registry.addBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b"), type: .technical, summary: "s", owner: .user, createdAt: t0), at: t0)
        try registry.add(makeProject("newcomer"), at: t0)
        try registry.recordDecision(Decision(
            id: DecisionID("d"), title: "t", decision: "x", rationale: "r",
            date: t0, owner: .user, affectedProjects: [ProjectID("p")]), at: t0)

        let records = ChangeDetector.diff(before: before, after: registry, now: t0)
        XCTAssertTrue(records.contains(.projectAdded(ProjectID("newcomer"))))
        XCTAssertTrue(records.contains(.priorityChanged(ProjectID("p"), from: .medium, to: .critical)))
        XCTAssertTrue(records.contains(.ownerChanged(ProjectID("p"), from: .user, to: .claude)))
        XCTAssertTrue(records.contains(.dependencyAdded(ProjectID("p"), Dependency(on: ProjectID("upstream")))))
        XCTAssertTrue(records.contains(.blockerOpened(ProjectID("p"), BlockerID("b"))))
        XCTAssertTrue(records.contains(.decisionAdded(DecisionID("d"))))
        // health changed: ready -> blocked (dependency + blocker)
        XCTAssertTrue(records.contains(.healthChanged(ProjectID("p"), from: .ready, to: .blocked)))
        XCTAssertTrue(records.contains {
            if case .nextActionChanged(ProjectID("p"), _, _) = $0 { return true }
            return false
        })
    }

    func testDiffCatchesResolutionsAndMilestoneProgress() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b"), type: .technical, summary: "s", owner: .user, createdAt: t0), at: t0)
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m"), title: "t", state: .active, owner: .user, createdAt: t0), at: t0)
        try registry.openReviewGate(ProjectID("p"), ReviewGate(
            id: ReviewGateID("g"), title: "r", kind: .merge, reviewer: .user, requestedAt: t0), at: t0)
        let before = registry

        try registry.resolveBlocker(ProjectID("p"), BlockerID("b"),
                                    resolution: .init(summary: "done"), at: t0)
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m"), at: t0)
        try registry.resolveReviewGate(ProjectID("p"), ReviewGateID("g"),
                                       resolution: .init(outcome: .approved, rationale: "ok"), at: t0)

        let records = ChangeDetector.diff(before: before, after: registry, now: t0)
        XCTAssertTrue(records.contains(.blockerResolved(ProjectID("p"), BlockerID("b"))))
        XCTAssertTrue(records.contains(.milestoneProgressed(
            ProjectID("p"), MilestoneID("m"), from: .active, to: .completed)))
        XCTAssertTrue(records.contains(.reviewGateResolved(
            ProjectID("p"), ReviewGateID("g"), outcome: .approved)))
    }

    func testIdenticalSnapshotsProduceNoRecords() {
        let registry = makeRegistry(makeProject("p", status: .active))
        XCTAssertEqual(ChangeDetector.diff(before: registry, after: registry, now: t0), [])
    }
}
