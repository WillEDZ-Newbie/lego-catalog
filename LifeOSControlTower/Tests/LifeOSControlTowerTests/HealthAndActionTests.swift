import XCTest
@testable import LifeOSControlTower

final class HealthEngineTests: XCTestCase {

    private func assess(_ registry: ProjectRegistry, _ id: String,
                        now: Date = t0, config: HealthConfiguration = .default) -> HealthAssessment {
        HealthEngine.assess(registry.project(ProjectID(id))!, in: registry, now: now, config: config)
    }

    func testCompleteState() throws {
        let registry = makeRegistry(makeProject("p", status: .completed))
        let health = assess(registry, "p")
        XCTAssertEqual(health.state, .complete)
        XCTAssertEqual(health.reasons, [.projectCompleted])
    }

    func testReadyState() {
        let registry = makeRegistry(makeProject("p", status: .active))
        let health = assess(registry, "p")
        XCTAssertEqual(health.state, .ready)
        XCTAssertFalse(health.reasons.isEmpty)
    }

    func testBlockedByDependency() throws {
        var registry = makeRegistry(makeProject("a", status: .active), makeProject("b", status: .active))
        try registry.addDependency(ProjectID("b"), on: ProjectID("a"), at: t0)
        let health = assess(registry, "b")
        XCTAssertEqual(health.state, .blocked)
        XCTAssertEqual(health.reasons, [.unsatisfiedDependency(ProjectID("a"))])
    }

    func testBlockedByBlocker() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b"), type: .technical, summary: "s", owner: .claude, createdAt: t0), at: t0)
        XCTAssertEqual(assess(registry, "p").state, .blocked)
        // resolving it restores readiness
        try registry.resolveBlocker(ProjectID("p"), BlockerID("b"),
                                    resolution: .init(summary: "fixed"), at: t0)
        XCTAssertEqual(assess(registry, "p").state, .ready)
    }

    func testNeedsDecisionOutranksBlocked() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b1"), type: .decision, summary: "choose", owner: .user, createdAt: t0), at: t0)
        try registry.addBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b2"), type: .technical, summary: "broken", owner: .claude, createdAt: t0), at: t0)
        let health = assess(registry, "p")
        XCTAssertEqual(health.state, .needsDecision)
        XCTAssertEqual(health.reasons, [.openDecisionBlocker(BlockerID("b1"), owner: .user)])
    }

    func testWaitingForReview() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.openReviewGate(ProjectID("p"), ReviewGate(
            id: ReviewGateID("g"), title: "arch", kind: .architectureReview,
            reviewer: .chatGPT, requestedAt: t0), at: t0)
        XCTAssertEqual(assess(registry, "p").state, .waitingForReview)
    }

    func testAtRiskFromRiskScore() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addRisk(ProjectID("p"), Risk(
            id: RiskID("r"), summary: "s", likelihood: .high, impact: .medium, owner: .user), at: t0)
        let health = assess(registry, "p") // severity 6 >= default threshold 6
        XCTAssertEqual(health.state, .atRisk)
        XCTAssertEqual(health.reasons, [.riskAboveThreshold(RiskID("r"), severity: 6, threshold: 6)])
        // configurable threshold
        let relaxed = HealthConfiguration(riskSeverityThreshold: 7)
        XCTAssertEqual(assess(registry, "p", config: relaxed).state, .ready)
    }

    func testAtRiskFromDeadline() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.setDeadline(ProjectID("p"), to: t0.addingTimeInterval(days(2)), at: t0)
        XCTAssertEqual(assess(registry, "p").state, .atRisk)
        var overdueReg = makeRegistry(makeProject("q", status: .active))
        try overdueReg.setDeadline(ProjectID("q"), to: t0.addingTimeInterval(-days(1)), at: t0)
        let overdueHealth = assess(overdueReg, "q")
        XCTAssertEqual(overdueHealth.state, .atRisk)
        XCTAssertEqual(overdueHealth.reasons, [.overdue(deadline: t0.addingTimeInterval(-days(1)))])
    }

    func testStaleDetectionAndExclusions() {
        let registry = makeRegistry(
            makeProject("old-active", status: .active),
            makeProject("old-dormant", status: .dormant),
            makeProject("old-done", status: .completed),
            makeProject("fresh", status: .active))
        let later = t0.addingTimeInterval(days(20)) // default threshold 14

        XCTAssertEqual(assess(registry, "old-active", now: later).state, .stale)
        // dormant and completed are never stale
        XCTAssertEqual(assess(registry, "old-dormant", now: later).state, .inactive)
        XCTAssertEqual(assess(registry, "old-done", now: later).state, .complete)
        // configurable threshold
        let lax = HealthConfiguration(stalenessThresholdDays: 30)
        XCTAssertEqual(assess(registry, "old-active", now: later, config: lax).state, .ready)
    }

    func testActiveFallbackWhenActionNotExecutable() {
        let registry = makeRegistry(makeProject("p", status: .active, nextAction: "Work on stuff"))
        XCTAssertEqual(assess(registry, "p").state, .active)
        XCTAssertEqual(assess(registry, "p").reasons, [.workUnderway])
    }

    func testEveryHealthStateIsReachable() throws {
        // complete / inactive / needsDecision / blocked / waitingForReview /
        // atRisk / stale / ready / active all covered above; assert the enum
        // has no unreachable members beyond those nine.
        XCTAssertEqual(HealthState.allCases.count, 9)
    }
}

final class NextActionValidatorTests: XCTestCase {

    private func validate(_ registry: ProjectRegistry, _ id: String) -> NextActionAssessment {
        NextActionValidator.validate(registry.project(ProjectID(id))!, in: registry, now: t0)
    }

    func testMissing() {
        let registry = makeRegistry(makeProject("p", status: .active, nextAction: nil))
        XCTAssertEqual(validate(registry, "p").classification, .missing)
        let blank = makeRegistry(makeProject("q", status: .active, nextAction: "   "))
        XCTAssertEqual(validate(blank, "q").classification, .missing)
    }

    func testVagueLeadingPhrase() {
        let registry = makeRegistry(makeProject("p", status: .active, nextAction: "Work on Nexus"))
        let result = validate(registry, "p")
        XCTAssertEqual(result.classification, .vague)
        XCTAssertFalse(result.reasons.isEmpty)
    }

    func testVagueTooShort() {
        let registry = makeRegistry(makeProject("p", status: .active, nextAction: "Fix bug"))
        XCTAssertEqual(validate(registry, "p").classification, .vague)
    }

    func testExecutable() {
        let registry = makeRegistry(makeProject(
            "p", status: .active,
            nextAction: "Run Nexus Scanner on a 10,000-file test library and record scan duration"))
        let result = validate(registry, "p")
        XCTAssertEqual(result.classification, .executable)
        XCTAssertTrue(result.missingPrerequisites.isEmpty)
    }

    func testBlockedTakesPrecedenceOverProse() throws {
        var registry = makeRegistry(makeProject("a", status: .active), makeProject(
            "b", status: .active, nextAction: "Run the full import benchmark suite"))
        try registry.addDependency(ProjectID("b"), on: ProjectID("a"), at: t0)
        let result = validate(registry, "b")
        XCTAssertEqual(result.classification, .blocked)
        XCTAssertEqual(result.missingPrerequisites, [ProjectID("a")])
    }

    func testAwaitingReviewAndDecision() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.openReviewGate(ProjectID("p"), ReviewGate(
            id: ReviewGateID("g"), title: "arch", kind: .architectureReview,
            reviewer: .chatGPT, requestedAt: t0), at: t0)
        let reviewResult = validate(registry, "p")
        XCTAssertEqual(reviewResult.classification, .awaitingReview)
        XCTAssertEqual(reviewResult.relatedGateIDs, [ReviewGateID("g")])

        var decisionReg = makeRegistry(makeProject("q", status: .active))
        try decisionReg.addBlocker(ProjectID("q"), Blocker(
            id: BlockerID("b"), type: .decision, summary: "choose", owner: .user, createdAt: t0), at: t0)
        let decisionResult = validate(decisionReg, "q")
        XCTAssertEqual(decisionResult.classification, .awaitingDecision)
        XCTAssertEqual(decisionResult.relatedBlockerIDs, [BlockerID("b")])
    }

    func testPolicyIsConfigurable() {
        let registry = makeRegistry(makeProject("p", status: .active, nextAction: "Ship it now"))
        let strict = NextActionPolicy(vagueLeadingPhrases: ["ship it"], minimumWordCount: 3)
        let result = NextActionValidator.validate(
            registry.project(ProjectID("p"))!, in: registry, now: t0, policy: strict)
        XCTAssertEqual(result.classification, .vague)
    }
}

final class ConflictDetectorTests: XCTestCase {

    func testCompletedWithUnresolvedBlocker() {
        var registry = ProjectRegistry()
        var bad = makeProject("p", status: .completed)
        bad.status = .completed
        bad.blockers = [Blocker(id: BlockerID("b"), type: .technical, summary: "s",
                                owner: .user, createdAt: t0)]
        registry.insertUnchecked(bad)
        let diagnostics = ConflictDetector.validate(registry)
        XCTAssertTrue(diagnostics.contains {
            $0.code == .completedWithUnresolvedBlocker && $0.severity == .error
        })
    }

    func testCompletedWithIncompleteMilestonesNoOverride() {
        var registry = ProjectRegistry()
        var bad = makeProject("p")
        bad.status = .completed
        bad.milestones = [Milestone(id: MilestoneID("m"), title: "t", state: .active,
                                    owner: .user, createdAt: t0)]
        registry.insertUnchecked(bad)
        XCTAssertTrue(ConflictDetector.validate(registry).contains {
            $0.code == .completedWithIncompleteMilestones
        })
    }

    func testOverrideEventSuppressesMilestoneConflict() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m"), title: "t", state: .active, owner: .user, createdAt: t0), at: t0)
        try registry.completeProject(ProjectID("p"), at: t0, overrideRationale: "descoped")
        XCTAssertFalse(ConflictDetector.validate(registry).contains {
            $0.code == .completedWithIncompleteMilestones
        })
    }

    func testMilestoneCompletedWithUnsatisfiedCriteria() {
        var registry = ProjectRegistry()
        var bad = makeProject("p")
        bad.status = .active
        bad.milestones = [Milestone(
            id: MilestoneID("m"), title: "t", state: .completed,
            acceptanceCriteria: [.init(id: CriterionID("c"), text: "req")],
            owner: .user, createdAt: t0, completedAt: t0)]
        registry.insertUnchecked(bad)
        XCTAssertTrue(ConflictDetector.validate(registry).contains {
            $0.code == .milestoneCompletedWithUnsatisfiedCriteria
        })
    }

    func testAwaitingReviewWithoutGate() {
        var registry = ProjectRegistry()
        var bad = makeProject("p")
        bad.status = .active
        bad.milestones = [Milestone(id: MilestoneID("m"), title: "t", state: .awaitingReview,
                                    owner: .user, createdAt: t0)]
        registry.insertUnchecked(bad)
        XCTAssertTrue(ConflictDetector.validate(registry).contains {
            $0.code == .milestoneAwaitingReviewWithoutGate
        })
    }

    func testBlockedMilestoneWithoutEvidence() {
        var registry = ProjectRegistry()
        var bad = makeProject("p")
        bad.status = .active
        bad.milestones = [Milestone(id: MilestoneID("m"), title: "t", state: .blocked,
                                    owner: .user, createdAt: t0)]
        registry.insertUnchecked(bad)
        XCTAssertTrue(ConflictDetector.validate(registry).contains {
            $0.code == .milestoneBlockedWithoutEvidence
        })
    }

    func testDeadlineBeforeCreationAndMilestoneTimeTravel() {
        var registry = ProjectRegistry()
        var bad = makeProject("p")
        bad.deadline = t0.addingTimeInterval(-days(1))
        bad.milestones = [Milestone(id: MilestoneID("m"), title: "t", state: .completed,
                                    owner: .user, createdAt: t0,
                                    completedAt: t0.addingTimeInterval(-days(2)))]
        registry.insertUnchecked(bad)
        let codes = ConflictDetector.validate(registry).map(\.code)
        XCTAssertTrue(codes.contains(.deadlineBeforeCreation))
        XCTAssertTrue(codes.contains(.milestoneCompletedBeforeCreated))
    }

    func testMissingDependencyTarget() {
        var registry = ProjectRegistry()
        var bad = makeProject("p")
        bad.dependencies = [Dependency(on: ProjectID("ghost"))]
        registry.insertUnchecked(bad)
        XCTAssertTrue(ConflictDetector.validate(registry).contains {
            $0.code == .dependencyTargetMissing && $0.severity == .error
        })
    }

    func testCircularDependencyIsReleaseBlocking() throws {
        var registry = makeRegistry(makeProject("a"), makeProject("b"))
        try registry.addDependency(ProjectID("a"), on: ProjectID("b"), at: t0)
        try registry.addDependency(ProjectID("b"), on: ProjectID("a"), at: t0)
        let diagnostic = ConflictDetector.validate(registry).first { $0.code == .circularDependency }
        XCTAssertNotNil(diagnostic)
        XCTAssertEqual(diagnostic?.severity, .releaseBlocking)
        XCTAssertTrue(diagnostic!.message.contains("->"))
    }

    func testCleanRegistryHasNoDiagnostics() throws {
        var registry = makeRegistry(makeProject("a", status: .active), makeProject("b"))
        try registry.addDependency(ProjectID("b"), on: ProjectID("a"), at: t0)
        XCTAssertEqual(ConflictDetector.validate(registry), [])
    }
}
