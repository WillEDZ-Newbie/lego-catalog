import XCTest
@testable import LifeOSControlTower

final class MilestoneAndGateTests: XCTestCase {

    private func registryWithMilestone(
        criteria: [Milestone.AcceptanceCriterion],
        gate: ReviewGate? = nil
    ) -> ProjectRegistry {
        var registry = makeRegistry(makeProject("p", status: .active))
        if let gate {
            try! registry.openReviewGate(ProjectID("p"), gate, at: t0)
        }
        try! registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m1"), title: "First",
            state: .active,
            acceptanceCriteria: criteria,
            owner: .claude,
            reviewGateID: gate?.id,
            createdAt: t0
        ), at: t0)
        return registry
    }

    func testMilestoneCompletionEnforcesRequiredCriteria() throws {
        var registry = registryWithMilestone(criteria: [
            .init(id: CriterionID("c1"), text: "tests pass"),
            .init(id: CriterionID("c2"), text: "docs", isRequired: false)
        ])
        XCTAssertThrowsError(try registry.completeMilestone(ProjectID("p"), MilestoneID("m1"), at: t0)) {
            guard case .unsatisfiedAcceptanceCriteria(_, let unsatisfied)? = $0 as? RegistryError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertEqual(unsatisfied, [CriterionID("c1")])
        }
        try registry.satisfyCriterion(ProjectID("p"), milestone: MilestoneID("m1"),
                                      criterion: CriterionID("c1"), at: t0)
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m1"), at: t0.addingTimeInterval(days(1)))
        let m = registry.project(ProjectID("p"))!.milestone(MilestoneID("m1"))!
        XCTAssertEqual(m.state, .completed)
        XCTAssertEqual(m.completedAt, t0.addingTimeInterval(days(1)))
    }

    func testMilestoneOverrideIsExplicitAndAudited() throws {
        var registry = registryWithMilestone(criteria: [
            .init(id: CriterionID("c1"), text: "tests pass")
        ])
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m1"), at: t0,
                                       overrideRationale: "Shipping hotfix; tests tracked separately")
        let kinds = registry.events(for: ProjectID("p")).map(\.kind)
        XCTAssertTrue(kinds.contains(.milestoneCompletionOverridden(
            MilestoneID("m1"), rationale: "Shipping hotfix; tests tracked separately")))
    }

    func testMilestoneGateBlocksCompletionUntilApproved() throws {
        let gate = ReviewGate(id: ReviewGateID("g1"), title: "Sign-off", kind: .userApproval,
                              reviewer: .user, scope: .milestone(MilestoneID("m1")), requestedAt: t0)
        var registry = registryWithMilestone(criteria: [], gate: gate)
        XCTAssertThrowsError(try registry.completeMilestone(ProjectID("p"), MilestoneID("m1"), at: t0)) {
            guard case .unresolvedReviewGate? = $0 as? RegistryError else {
                return XCTFail("wrong error: \($0)")
            }
        }
        try registry.resolveReviewGate(ProjectID("p"), ReviewGateID("g1"),
                                       resolution: .init(outcome: .approved, rationale: "LGTM"), at: t0)
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m1"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p"))?.milestone(MilestoneID("m1"))?.state, .completed)
    }

    func testRejectedGateStillBlocksMilestone() throws {
        let gate = ReviewGate(id: ReviewGateID("g1"), title: "Sign-off", kind: .userApproval,
                              reviewer: .user, scope: .milestone(MilestoneID("m1")), requestedAt: t0)
        var registry = registryWithMilestone(criteria: [], gate: gate)
        try registry.resolveReviewGate(ProjectID("p"), ReviewGateID("g1"),
                                       resolution: .init(outcome: .rejected, rationale: "Needs rework"), at: t0)
        XCTAssertThrowsError(try registry.completeMilestone(ProjectID("p"), MilestoneID("m1"), at: t0))
    }

    func testProjectCompletionRequiresRequiredMilestones() throws {
        var registry = registryWithMilestone(criteria: [])
        XCTAssertThrowsError(try registry.completeProject(ProjectID("p"), at: t0)) {
            guard case .incompleteRequiredMilestones(_, let ms)? = $0 as? RegistryError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertEqual(ms, [MilestoneID("m1")])
        }
        // Deliberate override works and is recorded.
        try registry.completeProject(ProjectID("p"), at: t0, overrideRationale: "descoped milestone")
        XCTAssertEqual(registry.project(ProjectID("p"))?.status, .completed)
        XCTAssertTrue(registry.events(for: ProjectID("p")).contains {
            if case .projectCompletionOverridden = $0.kind { return true }
            return false
        })
    }

    func testReadyAndNextMilestoneQueries() throws {
        var registry = makeRegistry(makeProject("p", status: .active), makeProject("dep", status: .active))
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m1"), title: "One", state: .completed, owner: .claude, createdAt: t0), at: t0)
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m2"), title: "Two", state: .active,
            prerequisites: [.milestone(MilestoneID("m1"))], owner: .claude, createdAt: t0), at: t0)
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m3"), title: "Three", state: .notStarted,
            prerequisites: [.project(ProjectID("dep"))], owner: .claude, createdAt: t0), at: t0)

        XCTAssertEqual(registry.nextMilestone(of: ProjectID("p"))?.id, MilestoneID("m2"))
        // m2 ready (m1 complete); m3 not ready (project dep incomplete).
        XCTAssertEqual(registry.readyMilestones(of: ProjectID("p")).map(\.id), [MilestoneID("m2")])
        try registry.completeProject(ProjectID("dep"), at: t0)
        XCTAssertEqual(registry.readyMilestones(of: ProjectID("p")).map(\.id),
                       [MilestoneID("m2"), MilestoneID("m3")])
    }

    // MARK: Gates

    func testGateStateDerivation() {
        var gate = ReviewGate(id: ReviewGateID("g"), title: "Arch", kind: .architectureReview,
                              reviewer: .chatGPT, requestedAt: t0)
        XCTAssertEqual(gate.state, .awaitingArchitectureReview)
        XCTAssertTrue(gate.isOpen)
        gate.resolution = .init(outcome: .approved, rationale: "sound")
        XCTAssertEqual(gate.state, .approved)
        gate.resolution = .init(outcome: .rejected, rationale: "no")
        XCTAssertEqual(gate.state, .rejected)
        let merge = ReviewGate(id: ReviewGateID("g2"), title: "Merge", kind: .merge,
                               reviewer: .user, requestedAt: t0)
        XCTAssertEqual(merge.state, .readyToMerge)
    }

    func testGateResolutionRecordsOutcomeRationaleAndTimestamps() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        let gate = ReviewGate(id: ReviewGateID("g"), title: "Arch", kind: .architectureReview,
                              reviewer: .chatGPT, requestedAt: t0)
        try registry.openReviewGate(ProjectID("p"), gate, at: t0)
        let later = t0.addingTimeInterval(days(2))
        try registry.resolveReviewGate(ProjectID("p"), ReviewGateID("g"),
                                       resolution: .init(outcome: .approved, rationale: "sound"), at: later)
        let resolved = registry.project(ProjectID("p"))!.reviewGate(ReviewGateID("g"))!
        XCTAssertEqual(resolved.requestedAt, t0)
        XCTAssertEqual(resolved.resolvedAt, later)
        XCTAssertEqual(resolved.resolution?.rationale, "sound")
        // double resolution rejected
        XCTAssertThrowsError(try registry.resolveReviewGate(
            ProjectID("p"), ReviewGateID("g"),
            resolution: .init(outcome: .rejected, rationale: "flip"), at: later))
    }

    func testWorkAwaitingAParticularReviewer() throws {
        var registry = makeRegistry(makeProject("p1", status: .active),
                                    makeProject("p2", status: .active))
        try registry.openReviewGate(ProjectID("p1"), ReviewGate(
            id: ReviewGateID("g1"), title: "A", kind: .userApproval, reviewer: .user, requestedAt: t0), at: t0)
        try registry.openReviewGate(ProjectID("p2"), ReviewGate(
            id: ReviewGateID("g2"), title: "B", kind: .architectureReview, reviewer: .chatGPT, requestedAt: t0), at: t0)
        try registry.openReviewGate(ProjectID("p2"), ReviewGate(
            id: ReviewGateID("g3"), title: "C", kind: .userApproval,
            reviewer: .mixed([.user, .chatGPT]), requestedAt: t0), at: t0)

        let userGates = registry.gatesAwaiting(reviewer: .user)
        XCTAssertEqual(Set(userGates.map(\.gate.id)), Set([ReviewGateID("g1"), ReviewGateID("g3")]))
        let oracleGates = registry.gatesAwaiting(reviewer: .chatGPT)
        XCTAssertEqual(Set(oracleGates.map(\.gate.id)), Set([ReviewGateID("g2"), ReviewGateID("g3")]))
    }
}

final class DecisionTests: XCTestCase {

    func testSupersessionLineage() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        let pid = ProjectID("p")
        try registry.recordDecision(Decision(
            id: DecisionID("d1"), title: "v1", decision: "Use flat files",
            rationale: "simple", date: t0, owner: .user, affectedProjects: [pid]), at: t0)
        try registry.supersedeDecision(DecisionID("d1"), with: Decision(
            id: DecisionID("d2"), title: "v2", decision: "Use index",
            rationale: "scale", date: t0.addingTimeInterval(days(10)), owner: .user,
            affectedProjects: [pid]), at: t0.addingTimeInterval(days(10)))
        try registry.supersedeDecision(DecisionID("d2"), with: Decision(
            id: DecisionID("d3"), title: "v3", decision: "Use database",
            rationale: "queries", date: t0.addingTimeInterval(days(20)), owner: .user,
            affectedProjects: [pid]), at: t0.addingTimeInterval(days(20)))

        XCTAssertEqual(registry.activeDecisions(for: pid).map(\.id), [DecisionID("d3")])
        XCTAssertEqual(registry.supersededDecisions(for: pid).map(\.id),
                       [DecisionID("d1"), DecisionID("d2")])
        // lineage from any member returns the full ordered chain
        for start in ["d1", "d2", "d3"] {
            XCTAssertEqual(registry.decisionLineage(of: DecisionID(start)).map(\.id),
                           [DecisionID("d1"), DecisionID("d2"), DecisionID("d3")])
        }
        // wiring is bidirectional
        XCTAssertEqual(registry.decision(DecisionID("d1"))?.supersededBy, DecisionID("d2"))
        XCTAssertEqual(registry.decision(DecisionID("d2"))?.supersedes, DecisionID("d1"))
    }

    func testCannotSupersedeTwiceOrSupersedeInactive() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.recordDecision(Decision(
            id: DecisionID("d1"), title: "v1", decision: "X", rationale: "r",
            date: t0, owner: .user), at: t0)
        try registry.supersedeDecision(DecisionID("d1"), with: Decision(
            id: DecisionID("d2"), title: "v2", decision: "Y", rationale: "r",
            date: t0, owner: .user), at: t0)
        XCTAssertThrowsError(try registry.supersedeDecision(DecisionID("d1"), with: Decision(
            id: DecisionID("d3"), title: "v3", decision: "Z", rationale: "r",
            date: t0, owner: .user), at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .decisionNotActive(DecisionID("d1")))
        }
        XCTAssertThrowsError(try registry.supersedeDecision(DecisionID("zzz"), with: Decision(
            id: DecisionID("d4"), title: "v4", decision: "W", rationale: "r",
            date: t0, owner: .user), at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .unknownDecision(DecisionID("zzz")))
        }
    }

    func testSupersessionLoopDiagnosed() throws {
        // Corrupt lineage: d1 <-> d2 loop, injected via the import path.
        var registry = ProjectRegistry()
        registry.restoreDecisions([
            Decision(id: DecisionID("d1"), title: "a", decision: "A", rationale: "r",
                     date: t0, owner: .user, supersedes: DecisionID("d2"),
                     supersededBy: DecisionID("d2"), status: .superseded),
            Decision(id: DecisionID("d2"), title: "b", decision: "B", rationale: "r",
                     date: t0, owner: .user, supersedes: DecisionID("d1"),
                     supersededBy: DecisionID("d1"), status: .superseded)
        ])
        let diagnostics = ConflictDetector.validate(registry)
        XCTAssertTrue(diagnostics.contains { $0.code == .decisionSupersessionLoop })
        // lineage query must terminate despite the loop
        XCTAssertEqual(registry.decisionLineage(of: DecisionID("d1")).count, 2)
    }

    func testBothEndsActiveDiagnosed() throws {
        var registry = ProjectRegistry()
        registry.restoreDecisions([
            Decision(id: DecisionID("d1"), title: "a", decision: "A", rationale: "r",
                     date: t0, owner: .user, supersededBy: DecisionID("d2"), status: .active),
            Decision(id: DecisionID("d2"), title: "b", decision: "B", rationale: "r",
                     date: t0, owner: .user, supersedes: DecisionID("d1"), status: .active)
        ])
        let diagnostics = ConflictDetector.validate(registry)
        XCTAssertTrue(diagnostics.contains { $0.code == .activeContradictingDecisions })
    }
}

final class RiskTests: XCTestCase {

    func testSeverityIsDeterministicProduct() {
        let risk = Risk(id: RiskID("r"), summary: "s", likelihood: .high, impact: .medium, owner: .user)
        XCTAssertEqual(risk.severity, 6)
        XCTAssertEqual(Risk(id: RiskID("r2"), summary: "s", likelihood: .low, impact: .low, owner: .user).severity, 1)
        XCTAssertEqual(Risk(id: RiskID("r3"), summary: "s", likelihood: .high, impact: .high, owner: .user).severity, 9)
    }

    func testRiskQueriesAndAggregation() throws {
        var registry = makeRegistry(makeProject("p1", status: .active),
                                    makeProject("p2", status: .active))
        try registry.addRisk(ProjectID("p1"), Risk(
            id: RiskID("r1"), summary: "big", likelihood: .high, impact: .high, owner: .user), at: t0)
        try registry.addRisk(ProjectID("p1"), Risk(
            id: RiskID("r2"), summary: "handled", likelihood: .high, impact: .high,
            owner: .user, status: .mitigated), at: t0)
        XCTAssertEqual(registry.query().withOpenRisks().map(\.id), [ProjectID("p1")])
        XCTAssertEqual(registry.project(ProjectID("p1"))?.maxOpenRiskSeverity, 9)
        XCTAssertEqual(registry.project(ProjectID("p2"))?.maxOpenRiskSeverity, 0)
    }

    func testRiskStatusChangeEmitsEventAndRiskIsNotABlocker() throws {
        var registry = makeRegistry(makeProject("p1", status: .active))
        try registry.addRisk(ProjectID("p1"), Risk(
            id: RiskID("r1"), summary: "s", likelihood: .medium, impact: .medium, owner: .user), at: t0)
        try registry.setRiskStatus(ProjectID("p1"), RiskID("r1"), to: .accepted, at: t0)
        XCTAssertTrue(registry.events(for: ProjectID("p1")).map(\.kind).contains(
            .riskChanged(RiskID("r1"), from: .open, to: .accepted)))
        // a risk alone never blocks
        let health = HealthEngine.assess(registry.project(ProjectID("p1"))!, in: registry, now: t0)
        XCTAssertNotEqual(health.state, .blocked)
    }
}
