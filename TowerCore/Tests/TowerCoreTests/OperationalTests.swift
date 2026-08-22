import XCTest
@testable import TowerCore

final class QueryAndWorkloadTests: XCTestCase {
    func testFluentQueries() {
        let tower = SampleHistory.standard(now: t0)
        let q = tower.query()
        XCTAssertTrue(q.needingDecision().contains { $0.id == ProjectID("crossroads") })
        XCTAssertTrue(q.needingReview().contains { $0.id == ProjectID("manor") })
        XCTAssertTrue(q.blocked().contains { $0.id == ProjectID("spoke-1") })
        XCTAssertTrue(q.readyToStart().contains { $0.id == ProjectID("hub") })
        XCTAssertTrue(q.overdue(now: t0).contains { $0.id == ProjectID("drifter") })
        XCTAssertTrue(q.stale(now: t0).contains { $0.id == ProjectID("forgotten") })
        XCTAssertFalse(q.stale(now: t0).contains { $0.id == ProjectID("sleeper") }, "dormant never stale")
        XCTAssertTrue(q.dependingOn(ProjectID("hub")).count >= 4)
        XCTAssertTrue(q.dependingOn(ProjectID("chain-1"), transitive: true)
            .contains { $0.id == ProjectID("chain-5") })
        // archived excluded by default
        XCTAssertFalse(q.all.contains { $0.id == ProjectID("relic") })
        XCTAssertTrue(tower.query(includeArchived: true).all.contains { $0.id == ProjectID("relic") })
    }

    func testWorkloadReport() {
        let tower = SampleHistory.standard(now: t0)
        let report = tower.workload(at: t0)
        XCTAssertGreaterThan(report.activeCountByOwner["claude"] ?? 0, 0)
        XCTAssertEqual(report.awaitingReviewByReviewer["user"], 1)      // gate-signoff
        XCTAssertGreaterThanOrEqual(report.blockedByBlockerOwner["user"] ?? 0, 1) // blk-decision
        XCTAssertTrue(report.milestonesDueSoon.contains { $0.milestone == MilestoneID("ms-first") })
        let strict = tower.workload(at: t0, policy: {
            var p = WorkloadPolicy(); p.overloadThreshold = 1; return p }())
        XCTAssertFalse(strict.overloadFlags.isEmpty)
    }
}

final class SampleHistoryTests: XCTestCase {
    func testDeterministicAndSubstantial() {
        let a = SampleHistory.standard(now: t0)
        let b = SampleHistory.standard(now: t0)
        XCTAssertEqual(a.state, b.state)
        XCTAssertEqual(a.events, b.events)
        XCTAssertGreaterThanOrEqual(a.state.allProjects.count, 30)
        // full assessment runs over it
        let assessment = a.assess(at: t0)
        XCTAssertFalse(assessment.attention.isEmpty)
    }
}

final class SchemaMigrationTests: XCTestCase {
    func testV0PayloadMigratesForward() throws {
        // a v0 export: events carry a single "at" timestamp
        let v0 = """
        {"schemaVersion":0,"events":[
          {"id":"evt-1","at":"2025-01-05T00:00:00Z","payload":{"projectCreated":{"_0":{
            "id":"p","name":"Legacy","purpose":"","priority":"medium","owner":{"user":{}},"stage":""}}}}
        ]}
        """
        let tower = try Tower.imported(from: Data(v0.utf8))
        let p = tower.state.project(ProjectID("p"))
        XCTAssertNotNil(p)
        XCTAssertEqual(tower.events.first?.effectiveAt, tower.events.first?.recordedAt)
    }
    func testUnsupportedFutureVersionRejected() {
        let future = #"{"schemaVersion":99,"events":[]}"#
        XCTAssertThrowsError(try Tower.imported(from: Data(future.utf8)))
    }
}

final class V1IngestTests: XCTestCase {

    // A v1-shaped export: two clean projects, a blocking CYCLE (a<->b),
    // a project completed despite an open blocker, a dormant project,
    // a milestone with an approved gate, and a decision lineage.
    private let v1JSON = """
    {"schemaVersion":1,
     "projects":[
      {"id":"alpha","name":"Alpha","purpose":"clean","status":"active","currentStage":"build",
       "priority":"high","owner":{"claude":{}},"nextAction":"Run the sample import and log failures",
       "createdAt":"2025-06-01T00:00:00Z","updatedAt":"2025-08-01T00:00:00Z","schemaVersion":1,
       "files":[{"identifier":"alpha-spec.pdf"}],
       "dependencies":[{"prerequisite":"beta","kind":"blocks"}],
       "blockers":[],"milestones":[],"risks":[],"reviewGates":[]},
      {"id":"beta","name":"Beta","purpose":"cycle partner","status":"active","currentStage":"build",
       "priority":"medium","owner":{"mixed":{"_0":[{"user":{}},{"claude":{}}]}},
       "createdAt":"2025-06-01T00:00:00Z","updatedAt":"2025-08-01T00:00:00Z","schemaVersion":1,
       "dependencies":[{"prerequisite":"alpha","kind":"blocks"}],
       "blockers":[],"milestones":[],"risks":[],"reviewGates":[],"files":[]},
      {"id":"baddone","name":"Broken Completion","purpose":"invalid in v1","status":"completed",
       "currentStage":"rollout","priority":"low","owner":{"user":{}},
       "createdAt":"2025-05-01T00:00:00Z","updatedAt":"2025-07-01T00:00:00Z","schemaVersion":1,
       "dependencies":[],"milestones":[],"risks":[],"reviewGates":[],"files":[],
       "blockers":[{"id":"blk-open","type":"technical","summary":"Left unresolved in source.",
                    "owner":{"user":{}},"blockingProjectIDs":[],
                    "createdAt":"2025-06-15T00:00:00Z","severity":"critical"}]},
      {"id":"nap","name":"Napper","purpose":"dormant","status":"dormant","currentStage":"",
       "priority":"medium","owner":{"tool":{"name":"scanner"}},
       "createdAt":"2025-04-01T00:00:00Z","updatedAt":"2025-05-01T00:00:00Z","schemaVersion":1,
       "dependencies":[],"blockers":[],"milestones":[],"risks":[],"reviewGates":[],"files":[]},
      {"id":"gated","name":"Gated Milestones","purpose":"gate demo","status":"active","currentStage":"build",
       "priority":"medium","owner":{"claude":{}},
       "createdAt":"2025-05-01T00:00:00Z","updatedAt":"2025-08-10T00:00:00Z","schemaVersion":1,
       "dependencies":[],"blockers":[],"risks":[],"files":[],
       "reviewGates":[{"id":"g1","title":"Sign-off","kind":"userApproval","reviewer":{"user":{}},
                       "scope":{"milestone":{"_0":"m1"}},"requestedAt":"2025-07-01T00:00:00Z",
                       "resolvedAt":"2025-07-02T00:00:00Z",
                       "resolution":{"outcome":"approved","rationale":"looks right"}}],
       "milestones":[{"id":"m1","title":"First","details":"","state":"completed",
                      "acceptanceCriteria":[{"id":"c1","text":"done","isRequired":true,
                                             "satisfiedAt":"2025-07-01T00:00:00Z"}],
                      "prerequisites":[],"owner":{"claude":{}},"reviewGateID":"g1",
                      "isRequiredForProjectCompletion":true,
                      "createdAt":"2025-06-01T00:00:00Z","completedAt":"2025-07-03T00:00:00Z"}]}
     ],
     "decisions":[
      {"id":"d1","title":"Old way","decision":"Flat files","rationale":"simple",
       "date":"2025-05-01T00:00:00Z","owner":{"user":{}},"affectedProjects":["alpha"],
       "supersededBy":"d2","status":"superseded","tags":[]},
      {"id":"d2","title":"New way","decision":"Indexed","rationale":"scale",
       "date":"2025-06-01T00:00:00Z","owner":{"user":{}},"affectedProjects":["alpha"],
       "supersedes":"d1","status":"active","tags":[]}
     ],
     "events":[]}
    """

    func testIngestIsNonDestructiveAndComplete() throws {
        let source = Data(v1JSON.utf8)
        let sourceCopy = source // value type: byte-for-byte snapshot
        let (tower, report) = try V1Ingest.ingest(v1Data: source, at: t0)

        // the source was never modified
        XCTAssertEqual(source, sourceCopy)
        XCTAssertTrue(report.sourceUntouched)

        XCTAssertEqual(report.projects, 5)
        XCTAssertEqual(tower.state.allProjects.count, 5)

        // clean facts carried over
        XCTAssertEqual(tower.state.project(ProjectID("alpha"))?.lifecycle, .active)
        XCTAssertEqual(tower.state.project(ProjectID("alpha"))?.owner, .claude)
        XCTAssertEqual(tower.state.project(ProjectID("alpha"))?.fileReferences, ["alpha-spec.pdf"])
        XCTAssertEqual(tower.state.project(ProjectID("beta"))?.owner, .mixed([.user, .claude]))
        XCTAssertEqual(tower.state.project(ProjectID("nap"))?.lifecycle, .dormant)

        // the v1 cycle: one edge stays blocking, the closer is demoted to informs
        let graph = Graph(tower.state)
        let ab = graph.blockingPath(from: ProjectID("alpha"), to: ProjectID("beta")) != nil
        let ba = graph.blockingPath(from: ProjectID("beta"), to: ProjectID("alpha")) != nil
        XCTAssertFalse(ab && ba, "a blocking path in both directions would be a cycle")
        let alphaDeps = tower.state.project(ProjectID("alpha"))!.dependencies
        let betaDeps = tower.state.project(ProjectID("beta"))!.dependencies
        let kinds = Set((alphaDeps + betaDeps).map(\.kind))
        XCTAssertTrue(kinds.contains(.blocks) && kinds.contains(.informs),
                      "cycle must be broken by demotion, not deletion")
        XCTAssertTrue(report.adaptations.contains { $0.detail.contains("closes cycle") })

        // completed-despite-blocker becomes an audited override, not silent truth
        XCTAssertEqual(tower.state.project(ProjectID("badone".replacingOccurrences(of: "one", with: "done")))?.lifecycle, .completed)
        let overrideEvent = tower.events.contains {
            if case .lifecycleChanged(ProjectID("badone".replacingOccurrences(of: "one", with: "done")), _, .completed,
                                      .completionOverridden(let o)) = $0.payload {
                return o.rationale.text.contains("migrated from source")
            }
            return false
        }
        XCTAssertTrue(overrideEvent, "v1's invalid completion must be represented as an audited override")
        // severity 'critical' downmapped and recorded
        XCTAssertTrue(report.adaptations.contains { $0.detail.contains("'critical' mapped") })

        // gated milestone completed cleanly (criteria satisfied + gate approved in source)
        XCTAssertTrue(tower.state.project(ProjectID("gated"))!.milestone(MilestoneID("m1"))!.isComplete)
        XCTAssertFalse(report.adaptations.contains { $0.subject == "m1" && $0.detail.contains("override") },
                       "legally-completed source milestone must not need an override")

        // decision lineage rebuilt
        XCTAssertEqual(tower.state.decisions[DecisionID("d1")]?.supersededBy, DecisionID("d2"))
        XCTAssertEqual(tower.state.decisions[DecisionID("d2")]?.supersedes, DecisionID("d1"))

        // bitemporal: facts effective in the past, recorded at ingestion
        XCTAssertTrue(tower.events.allSatisfy { $0.recordedAt == t0 })
        XCTAssertTrue(tower.events.contains { $0.effectiveAt < t0 })

        // and the copy itself is a valid TowerCore history end to end
        let reimported = try Tower.imported(from: tower.export())
        XCTAssertEqual(reimported.state, tower.state)
    }
}
