import XCTest
@testable import TowerCore

private func seed(_ id: String, priority: Priority = .medium,
                  owner: Owner = .user, action: String? = "Run the sample import and record failures") -> Event.ProjectSeed {
    .init(id: ProjectID(id), name: NonEmptyText("Project \(id)")!,
          priority: priority, owner: owner, nextAction: action)
}

final class TowerLifecycleTests: XCTestCase {

    func testCreateStartCompleteFlow() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a")), at: t0)
        try tower.execute(.start(ProjectID("a")), at: t0)
        try tower.execute(.complete(ProjectID("a"), override: nil), at: t0)
        XCTAssertEqual(tower.state.project(ProjectID("a"))?.lifecycle, .completed)
        // the proof is in the history
        XCTAssertTrue(tower.events.contains {
            if case .lifecycleChanged(_, _, .completed, .completionProven) = $0.payload { return true }
            return false
        })
    }

    func testCompletionBlockedWithoutOverride() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a")), at: t0)
        try tower.execute(.start(ProjectID("a")), at: t0)
        try tower.execute(.openBlocker(ProjectID("a"), Blocker(
            id: BlockerID("b"), kind: .technical, summary: NonEmptyText("broken")!,
            owner: .user, openedAt: t0)), at: t0)
        XCTAssertThrowsError(try tower.execute(.complete(ProjectID("a"), override: nil), at: t0)) {
            guard case Rejection.completionBlocked(let obstacles)? = $0 as? Rejection else {
                return XCTFail("wrong rejection: \($0)")
            }
            XCTAssertEqual(obstacles, [.openBlocker(BlockerID("b"))])
        }
        // an Override cannot be built from a blank rationale — by type
        XCTAssertNil(Override("   "))
        try tower.execute(.complete(ProjectID("a"),
                                    override: Override("descoped after review")!), at: t0)
        XCTAssertTrue(tower.events.contains {
            if case .lifecycleChanged(_, _, .completed, .completionOverridden(let o)) = $0.payload {
                return o.rationale.text == "descoped after review"
            }
            return false
        })
    }

    func testRestingStatesNeedDeliberateExits() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a")), at: t0)
        try tower.execute(.start(ProjectID("a")), at: t0)
        try tower.execute(.pause(ProjectID("a")), at: t0)
        // dormant: only reactivate leads out
        XCTAssertThrowsError(try tower.execute(.start(ProjectID("a")), at: t0))
        try tower.execute(.reactivate(ProjectID("a")), at: t0)
        try tower.execute(.complete(ProjectID("a"), override: nil), at: t0)
        // completed: only reopen leads out
        XCTAssertThrowsError(try tower.execute(.reactivate(ProjectID("a")), at: t0)) {
            XCTAssertEqual($0 as? Rejection, .notResting(ProjectID("a")))
        }
        try tower.execute(.reopen(ProjectID("a")), at: t0)
        XCTAssertEqual(tower.state.project(ProjectID("a"))?.lifecycle, .active)
    }

    func testBlockingCycleRejectedAtTheDoor() throws {
        var tower = Tower()
        for id in ["a", "b", "c"] {
            try tower.execute(.createProject(seed(id)), at: t0)
        }
        try tower.execute(.addDependency(ProjectID("b"), on: ProjectID("a"), kind: .blocks), at: t0)
        try tower.execute(.addDependency(ProjectID("c"), on: ProjectID("b"), kind: .blocks), at: t0)
        XCTAssertThrowsError(try tower.execute(
            .addDependency(ProjectID("a"), on: ProjectID("c"), kind: .blocks), at: t0)) {
            guard case Rejection.wouldCreateCycle(let path)? = $0 as? Rejection else {
                return XCTFail("wrong rejection: \($0)")
            }
            XCTAssertEqual(path.first, ProjectID("a"))
            XCTAssertEqual(path.last, ProjectID("a"))
        }
        // informational loops are allowed
        XCTAssertNoThrow(try tower.execute(
            .addDependency(ProjectID("a"), on: ProjectID("c"), kind: .informs), at: t0))
    }

    func testMilestoneGuardsAndGate() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a")), at: t0)
        try tower.execute(.start(ProjectID("a")), at: t0)
        try tower.execute(.openGate(ProjectID("a"), Gate(
            id: GateID("g"), title: NonEmptyText("Sign-off")!, kind: .userApproval,
            reviewer: .user, openedAt: t0)), at: t0)
        try tower.execute(.addMilestone(ProjectID("a"), Milestone(
            id: MilestoneID("m"), title: NonEmptyText("First")!,
            criteria: [Criterion(id: CriterionID("c"), text: NonEmptyText("tests pass")!)],
            gateID: GateID("g"), createdAt: t0)), at: t0)

        // dangling gate reference is impossible to create
        XCTAssertThrowsError(try tower.execute(.addMilestone(ProjectID("a"), Milestone(
            id: MilestoneID("m2"), title: NonEmptyText("Ghost-gated")!,
            gateID: GateID("ghost"), createdAt: t0)), at: t0)) {
            XCTAssertEqual($0 as? Rejection, .unknownGate(GateID("ghost")))
        }

        XCTAssertThrowsError(try tower.execute(
            .completeMilestone(ProjectID("a"), MilestoneID("m"), override: nil), at: t0)) {
            guard case Rejection.completionBlocked(let obs)? = $0 as? Rejection else {
                return XCTFail("wrong rejection: \($0)")
            }
            XCTAssertTrue(obs.contains(.unsatisfiedCriterion(CriterionID("c"), of: MilestoneID("m"))))
            XCTAssertTrue(obs.contains(.unapprovedGate(GateID("g"))))
        }
        try tower.execute(.satisfyCriterion(ProjectID("a"), MilestoneID("m"), CriterionID("c")), at: t0)
        try tower.execute(.resolveGate(ProjectID("a"), GateID("g"), outcome: .approved,
                                       rationale: NonEmptyText("looks right")!), at: t0)
        try tower.execute(.completeMilestone(ProjectID("a"), MilestoneID("m"), override: nil), at: t0)
        XCTAssertTrue(tower.state.project(ProjectID("a"))!.milestone(MilestoneID("m"))!.isComplete)
    }

    func testDecisionLineage() throws {
        var tower = Tower()
        func decision(_ id: String, _ text: String) -> Decision {
            Decision(id: DecisionID(id), title: NonEmptyText("t")!,
                     decision: NonEmptyText(text)!, rationale: NonEmptyText("r")!,
                     owner: .user, decidedAt: t0)
        }
        try tower.execute(.recordDecision(decision("d1", "flat files")), at: t0)
        XCTAssertThrowsError(try tower.execute(.recordDecision(decision("d1", "again")), at: t0)) {
            XCTAssertEqual($0 as? Rejection, .decisionIDReused(DecisionID("d1")))
        }
        try tower.execute(.supersedeDecision(DecisionID("d1"), with: decision("d2", "index")), at: t0)
        XCTAssertEqual(tower.state.decisions[DecisionID("d1")]?.supersededBy, DecisionID("d2"))
        XCTAssertEqual(tower.state.decisions[DecisionID("d2")]?.supersedes, DecisionID("d1"))
        XCTAssertThrowsError(try tower.execute(
            .supersedeDecision(DecisionID("d1"), with: decision("d3", "db")), at: t0)) {
            XCTAssertEqual($0 as? Rejection, .decisionNotActive(DecisionID("d1")))
        }
    }
}

final class AssessAndTimeTests: XCTestCase {

    func testAssessOneCallCoherence() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("free", priority: .low)), at: t0)
        try tower.execute(.start(ProjectID("free")), at: t0)
        try tower.execute(.createProject(seed("up")), at: t0)
        try tower.execute(.start(ProjectID("up")), at: t0)
        try tower.execute(.createProject(seed("down", priority: .critical)), at: t0)
        try tower.execute(.start(ProjectID("down")), at: t0)
        try tower.execute(.addDependency(ProjectID("down"), on: ProjectID("up"), kind: .blocks), at: t0)
        try tower.execute(.createProject(seed("vague", priority: .critical, action: "Work on it")), at: t0)
        try tower.execute(.start(ProjectID("vague")), at: t0)

        let a = tower.assess(at: t0)
        XCTAssertEqual(a.projects[ProjectID("free")]?.health, .ready)
        XCTAssertEqual(a.projects[ProjectID("down")]?.health, .blocked)
        XCTAssertEqual(a.projects[ProjectID("vague")]?.actionClass, .vague)

        let order = a.attention.map(\.id)
        // executable low-priority work outranks blocked critical work
        XCTAssertLessThan(order.firstIndex(of: ProjectID("free"))!,
                          order.firstIndex(of: ProjectID("down"))!)
        // vague critical work sits in needsDefinition, below actionable
        let vagueEntry = a.attention.first { $0.id == ProjectID("vague") }!
        XCTAssertEqual(vagueEntry.bucket, .needsDefinition)
        // every ranked item explains itself
        XCTAssertTrue(a.attention.allSatisfy { !$0.evidence.isEmpty })
    }

    func testChangesSinceIsAHistorySlice() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a")), at: t0)
        let cutoff = t0.addingTimeInterval(3600)
        try tower.execute(.start(ProjectID("a")), at: t0.addingTimeInterval(7200))
        let changes = tower.changes(since: cutoff)
        XCTAssertEqual(changes.count, 1)
        if case .lifecycleChanged(_, _, .active, _) = changes[0].payload {} else {
            XCTFail("wrong change: \(changes[0].payload)")
        }
    }

    func testBitemporalBackfill() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a")), at: t0)
        try tower.execute(.start(ProjectID("a")), at: t0)
        // On day 10 we learn a blocker actually started on day 2.
        let day2 = t0.addingTimeInterval(2 * 86_400)
        let day10 = t0.addingTimeInterval(10 * 86_400)
        try tower.execute(.openBlocker(ProjectID("a"), Blocker(
            id: BlockerID("b"), kind: .external, summary: NonEmptyText("vendor outage")!,
            owner: .user, openedAt: day2)), at: day10, effectiveAt: day2)

        // world time: on day 5 the blocker WAS open
        let day5 = t0.addingTimeInterval(5 * 86_400)
        XCTAssertEqual(tower.state(asOf: day5).project(ProjectID("a"))?.openBlockers.count, 1)
        // system time: on day 5 we didn't KNOW about it yet
        XCTAssertEqual(tower.state(recordedBy: day5).project(ProjectID("a"))?.openBlockers.count, 0)
    }

    func testStateAsOfReconstructsThePast() throws {
        var tower = Tower()
        try tower.execute(.createProject(seed("a", priority: .low)), at: t0)
        let day1 = t0.addingTimeInterval(86_400)
        try tower.execute(.setPriority(ProjectID("a"), .critical), at: day1)
        XCTAssertEqual(tower.state(asOf: t0).project(ProjectID("a"))?.priority, .low)
        XCTAssertEqual(tower.state.project(ProjectID("a"))?.priority, .critical)
    }
}
