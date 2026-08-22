import XCTest
@testable import LifeOSControlTower

final class CodecTests: XCTestCase {

    func testJSONRoundTripPreservesEverything() throws {
        var registry = makeRegistry(
            makeProject("p1", status: .active, priority: .critical, owner: .mixed([.user, .tool(name: "scanner")])),
            makeProject("p2", status: .active))
        try registry.addDependency(ProjectID("p2"), on: ProjectID("p1"), kind: .requires, at: t0)
        try registry.addBlocker(ProjectID("p1"), Blocker(
            id: BlockerID("b"), type: .external, summary: "vendor", owner: .user, createdAt: t0), at: t0)
        try registry.addMilestone(ProjectID("p1"), Milestone(
            id: MilestoneID("m"), title: "one", state: .active,
            acceptanceCriteria: [.init(id: CriterionID("c"), text: "ok")],
            owner: .claude, createdAt: t0), at: t0)
        try registry.addRisk(ProjectID("p1"), Risk(
            id: RiskID("r"), summary: "s", likelihood: .high, impact: .low, owner: .grok), at: t0)
        try registry.openReviewGate(ProjectID("p1"), ReviewGate(
            id: ReviewGateID("g"), title: "arch", kind: .architectureReview,
            reviewer: .chatGPT, requestedAt: t0), at: t0)
        try registry.recordDecision(Decision(
            id: DecisionID("d"), title: "t", decision: "x", rationale: "r",
            date: t0, owner: .user, affectedProjects: [ProjectID("p1")], tags: ["infra"]), at: t0)

        let data = try ControlTowerCodec.export(registry)
        let result = try ControlTowerCodec.importPortfolio(from: data)
        XCTAssertTrue(result.isUsable)
        let imported = result.registry!

        XCTAssertEqual(imported.allProjects, registry.allProjects)
        XCTAssertEqual(imported.decisions, registry.decisions)
        XCTAssertEqual(imported.events, registry.events)
        XCTAssertEqual(imported, registry)
    }

    func testExportIsDeterministic() throws {
        let registry = makeRegistry(makeProject("p1"), makeProject("p2"))
        let a = try ControlTowerCodec.export(registry)
        let b = try ControlTowerCodec.export(registry)
        XCTAssertEqual(a, b)
    }

    func testImportSurfacesDiagnosticsWithoutRepair() throws {
        // Build a payload whose project is completed with an open blocker.
        var registry = ProjectRegistry()
        var bad = makeProject("bad")
        bad.status = .completed
        bad.blockers = [Blocker(id: BlockerID("b"), type: .technical, summary: "s",
                                owner: .user, createdAt: t0)]
        registry.insertUnchecked(bad)
        let data = try ControlTowerCodec.export(registry)

        let result = try ControlTowerCodec.importPortfolio(from: data)
        XCTAssertTrue(result.isUsable)
        XCTAssertFalse(result.isClean)
        XCTAssertTrue(result.diagnostics.contains { $0.code == .completedWithUnresolvedBlocker })
        // no silent repair: the blocker is still open after import
        XCTAssertEqual(result.registry?.project(ProjectID("bad"))?.openBlockers.count, 1)
    }

    func testMalformedJSONRejected() {
        XCTAssertThrowsError(try ControlTowerCodec.importPortfolio(from: Data("[1,2]".utf8)))
        XCTAssertThrowsError(try ControlTowerCodec.importPortfolio(from: Data("not json".utf8)))
        XCTAssertThrowsError(try ControlTowerCodec.importPortfolio(
            from: Data(#"{"schemaVersion":1,"projects":[{"id":"x"}],"decisions":[],"events":[]}"#.utf8)))
    }

    func testUnsupportedFutureVersionRejected() {
        let payload = #"{"schemaVersion":99,"projects":[],"decisions":[],"events":[]}"#
        XCTAssertThrowsError(try ControlTowerCodec.importPortfolio(from: Data(payload.utf8))) {
            guard case .unsupportedSchemaVersion(let found, _)? = $0 as? CodecError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertEqual(found, 99)
        }
    }

    func testDuplicateProjectIDsRejected() throws {
        let project = makeProject("dup")
        let payload = PortfolioExport(projects: [project, project], decisions: [], events: [])
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(payload)
        XCTAssertThrowsError(try ControlTowerCodec.importPortfolio(from: data)) {
            XCTAssertEqual($0 as? CodecError, .duplicateProjectIDs(["dup"]))
        }
    }

    func testV0LegacyMigration() throws {
        // A v0 payload: no schemaVersion, projects lacking risks/reviewGates/
        // milestones/priority/stage — the pre-Control-Tower shape.
        let legacy = """
        {
          "projects": [
            {
              "id": "legacy-1",
              "name": "Legacy Importer",
              "purpose": "Predates risks and review gates.",
              "status": "active",
              "owner": {"user": {}},
              "createdAt": "2025-01-05T00:00:00Z"
            }
          ]
        }
        """
        let result = try ControlTowerCodec.importPortfolio(from: Data(legacy.utf8))
        XCTAssertTrue(result.isUsable)
        let project = result.registry!.project(ProjectID("legacy-1"))
        XCTAssertNotNil(project)
        XCTAssertEqual(project?.schemaVersion, 1)
        XCTAssertEqual(project?.priority, .medium)   // documented default, not invented content
        XCTAssertEqual(project?.risks, [])
        XCTAssertEqual(project?.reviewGates, [])
        XCTAssertEqual(project?.updatedAt, project?.createdAt)
        XCTAssertTrue(result.isClean)
    }

    func testMigrationIsDeterministic() throws {
        let legacy = #"{"projects":[{"id":"x","name":"n","purpose":"p","status":"active","owner":{"user":{}},"createdAt":"2025-01-05T00:00:00Z"}]}"#
        let first = try ControlTowerCodec.importPortfolio(from: Data(legacy.utf8)).registry!
        let second = try ControlTowerCodec.importPortfolio(from: Data(legacy.utf8)).registry!
        XCTAssertEqual(first, second)
    }
}

final class SyntheticPortfolioTests: XCTestCase {

    func testPortfolioSizeAndDeterminism() {
        let a = SyntheticPortfolio.standard(now: t0)
        let b = SyntheticPortfolio.standard(now: t0)
        XCTAssertGreaterThanOrEqual(a.allProjects.count, 75)
        XCTAssertEqual(a, b, "generator must be deterministic")
    }

    func testScenarioCoverage() {
        let registry = SyntheticPortfolio.standard(now: t0)
        let projects = registry.query(includeArchived: true).all
        // every lifecycle status present
        for status in ProjectStatus.allCases where status != .cancelled {
            XCTAssertTrue(projects.contains { $0.status == status }, "missing status \(status)")
        }
        // every priority present
        for priority in Priority.allCases {
            XCTAssertTrue(projects.contains { $0.priority == priority }, "missing priority \(priority)")
        }
        // ownership variety
        XCTAssertTrue(projects.contains { if case .tool = $0.owner { return true }; return false })
        XCTAssertTrue(projects.contains { if case .mixed = $0.owner { return true }; return false })
        // deadlines: some explicit, some none, some overdue
        XCTAssertTrue(projects.contains { $0.deadline != nil })
        XCTAssertTrue(projects.contains { $0.deadline == nil })
        XCTAssertTrue(projects.contains { $0.isOverdue(now: t0) })
        // structured content
        XCTAssertTrue(projects.contains { !$0.blockers.isEmpty })
        XCTAssertTrue(projects.contains { !$0.risks.isEmpty })
        XCTAssertTrue(projects.contains { !$0.milestones.isEmpty })
        XCTAssertTrue(projects.contains { !$0.openReviewGates.isEmpty })
        // decision lineage exists
        XCTAssertEqual(registry.decision(SyntheticPortfolio.Fixture.supersededDecisionOld)?.status, .superseded)
        XCTAssertEqual(registry.decision(SyntheticPortfolio.Fixture.supersededDecisionNew)?.status, .active)
    }

    func testDeliberateCycleFixtureIsDetected() {
        let registry = SyntheticPortfolio.standard(now: t0)
        let cycles = DependencyGraph(registry).detectCycles()
        XCTAssertTrue(cycles.contains { Set($0) == Set([
            SyntheticPortfolio.Fixture.cycleA,
            SyntheticPortfolio.Fixture.cycleB,
            SyntheticPortfolio.Fixture.cycleC]) })
    }

    func testValidatorFindsPlantedInvalidFixture() {
        let registry = SyntheticPortfolio.standard(now: t0)
        let diagnostics = ConflictDetector.validate(registry)
        XCTAssertTrue(diagnostics.contains {
            $0.code == .completedWithUnresolvedBlocker
                && $0.projectID == SyntheticPortfolio.Fixture.completedWithBlocker
        })
        XCTAssertTrue(diagnostics.contains { $0.code == .circularDependency })
    }

    func testDormantIsNotStaleButForgottenActiveIs() {
        let registry = SyntheticPortfolio.standard(now: t0)
        let health = HealthEngine.assessAll(registry, now: t0)
        XCTAssertEqual(health[SyntheticPortfolio.Fixture.dormantOld]?.state, .inactive)
        XCTAssertEqual(health[SyntheticPortfolio.Fixture.staleActive]?.state, .stale)
        XCTAssertFalse(registry.query().stale(now: t0)
            .contains { $0.id == SyntheticPortfolio.Fixture.dormantOld })
    }

    func testPortfolioSmokeAllEnginesRun() {
        let registry = SyntheticPortfolio.standard(now: t0)

        let snapshot = PortfolioAnalyzer.healthSnapshot(registry, now: t0)
        XCTAssertGreaterThanOrEqual(snapshot.totalProjects, 70)
        XCTAssertFalse(snapshot.blocked.isEmpty)
        XCTAssertFalse(snapshot.awaitingReview.isEmpty)
        XCTAssertFalse(snapshot.needsDecision.isEmpty)
        XCTAssertFalse(snapshot.stale.isEmpty)
        XCTAssertFalse(snapshot.criticalDependencyHubs.isEmpty)

        let queue = WorkQueueEngine.rank(registry, now: t0)
        XCTAssertFalse(queue.isEmpty)
        XCTAssertTrue(queue.allSatisfy { !$0.reasons.isEmpty })
        // ordering invariant: buckets never regress
        for pair in zip(queue, queue.dropFirst()) {
            XCTAssertLessThanOrEqual(pair.0.bucket.rawValue, pair.1.bucket.rawValue)
        }

        let workload = WorkloadAnalyzer.report(registry, now: t0)
        XCTAssertFalse(workload.activeCountByOwner.isEmpty)

        // hub fixture gates its five spokes
        let graph = DependencyGraph(registry)
        XCTAssertEqual(graph.affectedDownstream(of: SyntheticPortfolio.Fixture.hub).count, 5)
    }

    func testSyntheticPortfolioRoundTripsThroughJSON() throws {
        let registry = SyntheticPortfolio.standard(now: t0)
        let data = try ControlTowerCodec.export(registry)
        let result = try ControlTowerCodec.importPortfolio(from: data)
        XCTAssertEqual(result.registry, registry)
    }

    func testLongChainPerformanceSanity() {
        // 400-project blocking chain: graph analyses must stay comfortably
        // sub-second (no accidental exponential walks).
        var registry = ProjectRegistry()
        var previous: ProjectID?
        for i in 0..<400 {
            let id = ProjectID(String(format: "chain-%04d", i))
            try! registry.add(makeProject(id.rawValue), at: t0)
            if let previous {
                try! registry.addDependency(id, on: previous, at: t0)
            }
            previous = id
        }
        let started = ProcessInfo.processInfo.systemUptime
        let graph = DependencyGraph(registry)
        XCTAssertEqual(graph.dependencyDepth(of: ProjectID("chain-0399")), 399)
        XCTAssertEqual(graph.longestChain().count, 400)
        XCTAssertEqual(graph.affectedDownstream(of: ProjectID("chain-0000")).count, 399)
        XCTAssertTrue(graph.detectCycles().isEmpty)
        let elapsed = ProcessInfo.processInfo.systemUptime - started
        XCTAssertLessThan(elapsed, 5.0, "graph analysis took \(elapsed)s on a 400-node chain")
    }
}
