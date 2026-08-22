import XCTest
@testable import LifeOSControlTower

/// Regression tests for the invariant/audit hardening pass. One test (or
/// cluster) per correction item, numbered to match the correction brief.
final class HardeningTests: XCTestCase {

    // Fix 1: setStatus must not reach .completed.
    func testSetStatusRejectsCompleted() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        XCTAssertThrowsError(try registry.setStatus(ProjectID("p"), to: .completed, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .completionViaSetStatus(ProjectID("p")))
        }
        // the dedicated door still works
        try registry.completeProject(ProjectID("p"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p"))?.status, .completed)
    }

    // Fix 14 (companion): setStatus must not reach .archived either.
    func testSetStatusRejectsArchivedButArchiveWorks() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        XCTAssertThrowsError(try registry.setStatus(ProjectID("p"), to: .archived, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .archivalViaSetStatus(ProjectID("p")))
        }
        try registry.archive(ProjectID("p"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p"))?.status, .archived)
        XCTAssertTrue(registry.events(for: ProjectID("p")).map(\.kind).contains(.projectArchived))
        // reactivation keeps its guard and audit event
        try registry.reactivate(ProjectID("p"), at: t0)
        XCTAssertTrue(registry.events(for: ProjectID("p")).map(\.kind).contains(.projectReactivated))
    }

    // Fix 2: setMilestoneState must not reach .completed.
    func testSetMilestoneStateRejectsCompleted() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m"), title: "t", state: .active, owner: .user, createdAt: t0), at: t0)
        XCTAssertThrowsError(try registry.setMilestoneState(
            ProjectID("p"), MilestoneID("m"), to: .completed, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .milestoneCompletionViaSetState(MilestoneID("m")))
        }
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p"))?.milestone(MilestoneID("m"))?.state, .completed)
    }

    // Fix 3: completion rejects unresolved blockers unless overridden with rationale.
    func testCompleteProjectRejectsOpenBlockersUnlessOverridden() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b"), type: .technical, summary: "s", owner: .user, createdAt: t0), at: t0)
        XCTAssertThrowsError(try registry.completeProject(ProjectID("p"), at: t0)) {
            XCTAssertEqual($0 as? RegistryError,
                           .unresolvedBlockers(ProjectID("p"), blockers: [BlockerID("b")]))
        }
        try registry.completeProject(ProjectID("p"), at: t0,
                                     overrideRationale: "blocker obsolete after descope")
        XCTAssertEqual(registry.project(ProjectID("p"))?.status, .completed)
        // the override is audited
        XCTAssertTrue(registry.events(for: ProjectID("p")).contains {
            if case .projectCompletionOverridden = $0.kind { return true }
            return false
        })
    }

    // Fix 4: completeMilestone enforces milestone/project prerequisites.
    func testCompleteMilestoneEnforcesPrerequisites() throws {
        var registry = makeRegistry(makeProject("p", status: .active),
                                    makeProject("dep", status: .active))
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m"), title: "t", state: .active,
            prerequisites: [.project(ProjectID("dep"))], owner: .user, createdAt: t0), at: t0)
        XCTAssertThrowsError(try registry.completeMilestone(ProjectID("p"), MilestoneID("m"), at: t0)) {
            XCTAssertEqual($0 as? RegistryError,
                           .unsatisfiedMilestonePrerequisites(MilestoneID("m")))
        }
        // override path is audited
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m"), at: t0,
                                       overrideRationale: "prerequisite made optional")
        XCTAssertTrue(registry.events(for: ProjectID("p")).contains {
            if case .milestoneCompletionOverridden(MilestoneID("m"), _) = $0.kind { return true }
            return false
        })
        // and the normal path works once the prerequisite completes
        var clean = makeRegistry(makeProject("p2", status: .active),
                                 makeProject("dep2", status: .completed))
        try clean.addMilestone(ProjectID("p2"), Milestone(
            id: MilestoneID("m2"), title: "t", state: .active,
            prerequisites: [.project(ProjectID("dep2"))], owner: .user, createdAt: t0), at: t0)
        XCTAssertNoThrow(try clean.completeMilestone(ProjectID("p2"), MilestoneID("m2"), at: t0))
    }

    // Fix 5: a dangling reviewGateID fails completion — even with an override.
    func testMissingReviewGateIsNeverApproval() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m"), title: "t", state: .active, owner: .user,
            reviewGateID: ReviewGateID("ghost"), createdAt: t0), at: t0)
        XCTAssertThrowsError(try registry.completeMilestone(ProjectID("p"), MilestoneID("m"), at: t0)) {
            XCTAssertEqual($0 as? RegistryError,
                           .unknownReviewGate(ReviewGateID("ghost"), in: ProjectID("p")))
        }
        XCTAssertThrowsError(try registry.completeMilestone(
            ProjectID("p"), MilestoneID("m"), at: t0,
            overrideRationale: "override must not bypass corruption")) {
            XCTAssertEqual($0 as? RegistryError,
                           .unknownReviewGate(ReviewGateID("ghost"), in: ProjectID("p")))
        }
    }

    // Fix 6: duplicate IDs rejected on every insertion surface.
    func testDuplicateEntityIDsRejected() throws {
        var registry = makeRegistry(makeProject("p", status: .active),
                                    makeProject("q", status: .active))
        let blocker = Blocker(id: BlockerID("b"), type: .technical, summary: "s",
                              owner: .user, createdAt: t0)
        try registry.addBlocker(ProjectID("p"), blocker, at: t0)
        XCTAssertThrowsError(try registry.addBlocker(ProjectID("p"), blocker, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateBlockerID(BlockerID("b")))
        }

        let milestone = Milestone(id: MilestoneID("m"), title: "t", owner: .user, createdAt: t0)
        try registry.addMilestone(ProjectID("p"), milestone, at: t0)
        XCTAssertThrowsError(try registry.addMilestone(ProjectID("p"), milestone, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateMilestoneID(MilestoneID("m")))
        }
        // milestone IDs are globally unique — a different project cannot reuse one
        XCTAssertThrowsError(try registry.addMilestone(ProjectID("q"), milestone, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateMilestoneID(MilestoneID("m")))
        }

        let gate = ReviewGate(id: ReviewGateID("g"), title: "t", kind: .merge,
                              reviewer: .user, requestedAt: t0)
        try registry.openReviewGate(ProjectID("p"), gate, at: t0)
        XCTAssertThrowsError(try registry.openReviewGate(ProjectID("p"), gate, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateReviewGateID(ReviewGateID("g")))
        }

        let risk = Risk(id: RiskID("r"), summary: "s", likelihood: .low, impact: .low, owner: .user)
        try registry.addRisk(ProjectID("p"), risk, at: t0)
        XCTAssertThrowsError(try registry.addRisk(ProjectID("p"), risk, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateRiskID(RiskID("r")))
        }
    }

    // Fix 7: recordDecision must not overwrite an existing decision.
    func testRecordDecisionRejectsExistingID() throws {
        var registry = ProjectRegistry()
        let decision = Decision(id: DecisionID("d"), title: "t", decision: "x",
                                rationale: "r", date: t0, owner: .user)
        try registry.recordDecision(decision, at: t0)
        var altered = decision
        altered.decision = "y"
        XCTAssertThrowsError(try registry.recordDecision(altered, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateDecisionID(DecisionID("d")))
        }
        XCTAssertEqual(registry.decision(DecisionID("d"))?.decision, "x") // unchanged
    }

    // Fix 8: supersession must not reuse the old ID or any existing ID.
    func testSupersedeDecisionRejectsIDReuse() throws {
        var registry = ProjectRegistry()
        try registry.recordDecision(Decision(id: DecisionID("d1"), title: "t", decision: "x",
                                             rationale: "r", date: t0, owner: .user), at: t0)
        try registry.recordDecision(Decision(id: DecisionID("other"), title: "t", decision: "x",
                                             rationale: "r", date: t0, owner: .user), at: t0)
        // reusing the old ID as the new one
        XCTAssertThrowsError(try registry.supersedeDecision(DecisionID("d1"), with: Decision(
            id: DecisionID("d1"), title: "t", decision: "y", rationale: "r",
            date: t0, owner: .user), at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateDecisionID(DecisionID("d1")))
        }
        // reusing any already-existing ID
        XCTAssertThrowsError(try registry.supersedeDecision(DecisionID("d1"), with: Decision(
            id: DecisionID("other"), title: "t", decision: "y", rationale: "r",
            date: t0, owner: .user), at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .duplicateDecisionID(DecisionID("other")))
        }
        // d1 is untouched by the failed attempts
        XCTAssertEqual(registry.decision(DecisionID("d1"))?.status, .active)
        XCTAssertNil(registry.decision(DecisionID("d1"))?.supersededBy)
    }

    // Fix 9: hard removal is audited and past history survives.
    func testRemoveEmitsAuditEventAndKeepsHistory() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        let priorEvents = registry.events(for: ProjectID("p")).count
        XCTAssertGreaterThan(priorEvents, 0)
        try registry.remove(ProjectID("p"), at: t0.addingTimeInterval(days(1)))
        XCTAssertNil(registry.project(ProjectID("p")))
        let events = registry.events(for: ProjectID("p"))
        XCTAssertEqual(events.count, priorEvents + 1)
        XCTAssertEqual(events.last?.kind, .projectRemoved)
    }

    // Fix 10: import rejects duplicate decision IDs.
    func testImportRejectsDuplicateDecisionIDs() throws {
        let decision = Decision(id: DecisionID("d"), title: "t", decision: "x",
                                rationale: "r", date: t0, owner: .user)
        let payload = PortfolioExport(projects: [], decisions: [decision, decision], events: [])
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(payload)
        XCTAssertThrowsError(try ControlTowerCodec.importPortfolio(from: data)) {
            XCTAssertEqual($0 as? CodecError, .duplicateDecisionIDs(["d"]))
        }
    }

    // Fix 11: event IDs never collide after importing a gapped/odd timeline.
    func testEventIDGenerationIsCollisionSafeAfterImport() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        // Craft a timeline whose highest evt-N far exceeds its count.
        let oddEvents = [
            ProjectEvent(id: EventID("evt-2"), projectID: ProjectID("p"), timestamp: t0, kind: .projectCreated),
            ProjectEvent(id: EventID("evt-9"), projectID: ProjectID("p"), timestamp: t0, kind: .projectArchived)
        ]
        registry.restoreEventsUnchecked(oddEvents)
        try registry.setPriority(ProjectID("p"), to: .critical, at: t0)
        try registry.setOwner(ProjectID("p"), to: .claude, at: t0)
        let ids = registry.events.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "event ids must be unique: \(ids)")
        XCTAssertFalse(ids.dropFirst(2).contains(EventID("evt-9")))
    }

    // Fix 12: distinct cycles sharing a node are both reported.
    func testSharedNodeCyclesAreBothReported() throws {
        // hub -> a -> hub  and  hub -> b -> hub: two elementary cycles through `hub`.
        var registry = makeRegistry(makeProject("hub"), makeProject("a"), makeProject("b"))
        try registry.addDependency(ProjectID("a"), on: ProjectID("hub"), at: t0)
        try registry.addDependency(ProjectID("hub"), on: ProjectID("a"), at: t0)
        try registry.addDependency(ProjectID("b"), on: ProjectID("hub"), at: t0)
        try registry.addDependency(ProjectID("hub"), on: ProjectID("b"), at: t0)
        let cycles = DependencyGraph(registry).detectCycles()
        XCTAssertEqual(cycles.count, 2, "expected both cycles, got \(cycles)")
        let sets = Set(cycles.map { Set($0) })
        XCTAssertTrue(sets.contains(Set([ProjectID("hub"), ProjectID("a")])))
        XCTAssertTrue(sets.contains(Set([ProjectID("hub"), ProjectID("b")])))
        // conflict detector reports each distinct cycle
        let cycleDiagnostics = ConflictDetector.validate(registry)
            .filter { $0.code == .circularDependency }
        XCTAssertEqual(cycleDiagnostics.count, 2)
    }

    // Fix 12 companion: separate disjoint cycles still both reported,
    // and each reported path is a real cycle edge-by-edge.
    func testDisjointAndSharedCyclePathsAreValid() throws {
        var registry = makeRegistry(
            makeProject("a"), makeProject("b"), makeProject("c"), makeProject("d"))
        try registry.addDependency(ProjectID("a"), on: ProjectID("b"), at: t0)
        try registry.addDependency(ProjectID("b"), on: ProjectID("a"), at: t0)
        try registry.addDependency(ProjectID("c"), on: ProjectID("d"), at: t0)
        try registry.addDependency(ProjectID("d"), on: ProjectID("c"), at: t0)
        let graph = DependencyGraph(registry)
        let cycles = graph.detectCycles()
        XCTAssertEqual(cycles.count, 2)
        for cycle in cycles {
            for i in cycle.indices {
                let from = cycle[i]
                let to = cycle[(i + 1) % cycle.count]
                XCTAssertTrue(graph.downstream[from]?.contains { $0.dependent == to } ?? false,
                              "missing edge \(from) -> \(to)")
            }
        }
    }

    // Fix 13: missing/vague next actions are never ordinary actionable work.
    func testUndefinedActionsRankBelowExecutableWork() throws {
        let registry = makeRegistry(
            makeProject("sharp", status: .active, priority: .low,
                        nextAction: "Run the importer against the sample set and log failures"),
            makeProject("vague", status: .active, priority: .critical,
                        nextAction: "Work on the importer"),
            makeProject("silent", status: .active, priority: .critical, nextAction: nil))
        let queue = WorkQueueEngine.rank(registry, now: t0)
        let byID = Dictionary(uniqueKeysWithValues: queue.map { ($0.projectID, $0) })

        XCTAssertEqual(byID[ProjectID("sharp")]?.bucket, .actionable)
        XCTAssertEqual(byID[ProjectID("vague")]?.bucket, .needsDefinition)
        XCTAssertEqual(byID[ProjectID("silent")]?.bucket, .needsDefinition)
        // even at critical priority, undefined work sits below executable work
        let sharpIndex = queue.firstIndex { $0.projectID == ProjectID("sharp") }!
        let vagueIndex = queue.firstIndex { $0.projectID == ProjectID("vague") }!
        XCTAssertLessThan(sharpIndex, vagueIndex)
        // and the entry says why
        XCTAssertTrue(byID[ProjectID("vague")]!.reasons.contains { $0.contains("too vague") })
        XCTAssertTrue(byID[ProjectID("silent")]!.reasons.contains { $0.contains("no next action") })
    }

    // Fix 13 companion: blocked/awaiting items are unaffected by action prose.
    func testBlockedItemsStayBlockedRegardlessOfActionQuality() throws {
        var registry = makeRegistry(
            makeProject("up", status: .active),
            makeProject("down", status: .active, nextAction: nil))
        try registry.addDependency(ProjectID("down"), on: ProjectID("up"), at: t0)
        let queue = WorkQueueEngine.rank(registry, now: t0)
        XCTAssertEqual(queue.first { $0.projectID == ProjectID("down") }?.bucket, .blocked)
    }
}

/// Regression tests for the second client correction round.
final class RestingStateAndRationaleTests: XCTestCase {

    // setStatus must not reopen a completed project; reopen() is the audited door.
    func testSetStatusRejectsReopeningCompleted() throws {
        var registry = makeRegistry(makeProject("p", status: .completed))
        XCTAssertThrowsError(try registry.setStatus(ProjectID("p"), to: .active, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .reopenViaSetStatus(ProjectID("p")))
        }
        try registry.reopen(ProjectID("p"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p"))?.status, .active)
        XCTAssertTrue(registry.events(for: ProjectID("p")).map(\.kind).contains(.projectReactivated))
    }

    // setStatus must not wake dormant work; reactivate() is the audited door.
    func testSetStatusRejectsReactivatingDormant() throws {
        var registry = makeRegistry(makeProject("p", status: .dormant))
        XCTAssertThrowsError(try registry.setStatus(ProjectID("p"), to: .active, at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .reactivationViaSetStatus(ProjectID("p")))
        }
        try registry.reactivate(ProjectID("p"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p"))?.status, .active)
        XCTAssertTrue(registry.events(for: ProjectID("p")).map(\.kind).contains(.projectReactivated))
    }

    // reopen() applies only to completed projects.
    func testReopenRequiresCompletedStatus() {
        var registry = makeRegistry(makeProject("p", status: .active))
        XCTAssertThrowsError(try registry.reopen(ProjectID("p"), at: t0)) {
            XCTAssertEqual($0 as? RegistryError, .projectNotCompleted(ProjectID("p")))
        }
    }

    // Blank override rationales are rejected on project completion.
    func testCompleteProjectRejectsBlankOverrideRationale() throws {
        for blank in ["", "   ", "\n\t "] {
            var registry = makeRegistry(makeProject("p", status: .active))
            try registry.addBlocker(ProjectID("p"), Blocker(
                id: BlockerID("b"), type: .technical, summary: "s", owner: .user, createdAt: t0), at: t0)
            XCTAssertThrowsError(try registry.completeProject(
                ProjectID("p"), at: t0, overrideRationale: blank)) {
                XCTAssertEqual($0 as? RegistryError, .emptyOverrideRationale,
                               "rationale \(blank.debugDescription) must be rejected")
            }
            // a real rationale still works
            try registry.completeProject(ProjectID("p"), at: t0,
                                         overrideRationale: "blocker obsolete after descope")
            XCTAssertEqual(registry.project(ProjectID("p"))?.status, .completed)
        }
    }

    // Blank override rationales are rejected on milestone completion.
    func testCompleteMilestoneRejectsBlankOverrideRationale() throws {
        var registry = makeRegistry(makeProject("p", status: .active))
        try registry.addMilestone(ProjectID("p"), Milestone(
            id: MilestoneID("m"), title: "t", state: .active,
            acceptanceCriteria: [.init(id: CriterionID("c"), text: "req")],
            owner: .user, createdAt: t0), at: t0)
        XCTAssertThrowsError(try registry.completeMilestone(
            ProjectID("p"), MilestoneID("m"), at: t0, overrideRationale: "  \n ")) {
            XCTAssertEqual($0 as? RegistryError, .emptyOverrideRationale)
        }
        try registry.completeMilestone(ProjectID("p"), MilestoneID("m"), at: t0,
                                       overrideRationale: "criteria tracked in follow-up")
        XCTAssertEqual(registry.project(ProjectID("p"))?.milestone(MilestoneID("m"))?.state, .completed)
    }
}
