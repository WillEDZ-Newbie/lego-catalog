import XCTest
@testable import LifeOSControlTower

final class CoreModelTests: XCTestCase {

    // MARK: Creation & registry CRUD

    func testAddAndLookupProject() throws {
        var registry = ProjectRegistry()
        try registry.add(makeProject("p1"), at: t0)
        XCTAssertNotNil(registry.project(ProjectID("p1")))
        XCTAssertEqual(registry.allProjects.count, 1)
        XCTAssertTrue(registry.contains(ProjectID("p1")))
    }

    func testDuplicateProjectIDRejected() throws {
        var registry = ProjectRegistry()
        try registry.add(makeProject("p1"), at: t0)
        XCTAssertThrowsError(try registry.add(makeProject("p1"), at: t0)) { error in
            XCTAssertEqual(error as? RegistryError, .duplicateProjectID(ProjectID("p1")))
        }
    }

    func testRemoveProject() throws {
        var registry = makeRegistry(makeProject("p1"))
        try registry.remove(ProjectID("p1"), at: t0)
        XCTAssertNil(registry.project(ProjectID("p1")))
        XCTAssertThrowsError(try registry.remove(ProjectID("p1"), at: t0))
    }

    func testCreationEmitsEvent() throws {
        let registry = makeRegistry(makeProject("p1"))
        let events = registry.events(for: ProjectID("p1"))
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].kind, .projectCreated)
        XCTAssertEqual(events[0].timestamp, t0)
    }

    // MARK: Status transitions

    func testAllowedTransitions() throws {
        var registry = makeRegistry(makeProject("p1"))
        let id = ProjectID("p1")
        try registry.setStatus(id, to: .active, at: t0)
        try registry.setStatus(id, to: .dormant, at: t0)
        try registry.reactivate(id, at: t0)
        try registry.completeProject(id, at: t0)
        try registry.archive(id, at: t0)
        XCTAssertEqual(registry.project(id)?.status, .archived)
    }

    func testForbiddenTransitions() {
        // notStarted -> completed is illegal (must pass through active).
        var registry = makeRegistry(makeProject("p1"))
        XCTAssertThrowsError(try registry.completeProject(ProjectID("p1"), at: t0)) { error in
            guard case .invalidStatusTransition(let from, let to)? = error as? RegistryError else {
                return XCTFail("wrong error: \(error)")
            }
            XCTAssertEqual(from, .notStarted)
            XCTAssertEqual(to, .completed)
        }
        // archived -> dormant is illegal.
        var registry2 = makeRegistry(makeProject("p2", status: .archived))
        XCTAssertThrowsError(try registry2.setStatus(ProjectID("p2"), to: .dormant, at: t0))
        // no self transition
        var registry3 = makeRegistry(makeProject("p3", status: .active))
        XCTAssertThrowsError(try registry3.setStatus(ProjectID("p3"), to: .active, at: t0))
    }

    func testCompletedAndArchivedAreDistinct() throws {
        var registry = makeRegistry(makeProject("p1", status: .active))
        try registry.completeProject(ProjectID("p1"), at: t0)
        XCTAssertEqual(registry.project(ProjectID("p1"))?.status, .completed)
        XCTAssertNotEqual(registry.project(ProjectID("p1"))?.status, .archived)
        try registry.archive(ProjectID("p1"), at: t0.addingTimeInterval(days(1)))
        XCTAssertEqual(registry.project(ProjectID("p1"))?.status, .archived)
    }

    func testStatusChangeEmitsEventAndBumpsUpdatedAt() throws {
        var registry = makeRegistry(makeProject("p1"))
        let later = t0.addingTimeInterval(days(2))
        try registry.setStatus(ProjectID("p1"), to: .active, at: later)
        XCTAssertEqual(registry.project(ProjectID("p1"))?.updatedAt, later)
        let kinds = registry.events(for: ProjectID("p1")).map(\.kind)
        XCTAssertTrue(kinds.contains(.statusChanged(from: .notStarted, to: .active)))
    }

    // MARK: Field mutations & events

    func testFieldMutationsEmitEvents() throws {
        var registry = makeRegistry(makeProject("p1", status: .active))
        let id = ProjectID("p1")
        try registry.setPriority(id, to: .critical, at: t0)
        try registry.setOwner(id, to: .claude, at: t0)
        try registry.setNextAction(id, to: "Run the importer on the sample set", at: t0)
        try registry.setDeadline(id, to: t0.addingTimeInterval(days(7)), at: t0)
        try registry.setStage(id, to: "stabilisation", at: t0)
        try registry.completeAction(id, action: "Run the importer on the sample set", at: t0)

        let kinds = registry.events(for: id).map(\.kind)
        XCTAssertTrue(kinds.contains(.priorityChanged(from: .medium, to: .critical)))
        XCTAssertTrue(kinds.contains(.ownerChanged(from: .user, to: .claude)))
        XCTAssertTrue(kinds.contains(.stageChanged(from: "", to: "stabilisation")))
        XCTAssertTrue(kinds.contains(.actionCompleted(action: "Run the importer on the sample set")))
        // completing the matching action clears nextAction
        XCTAssertNil(registry.project(id)?.nextAction)
        XCTAssertEqual(registry.project(id)?.lastAction, "Run the importer on the sample set")
    }

    func testNoOpMutationEmitsNothing() throws {
        var registry = makeRegistry(makeProject("p1", priority: .high))
        let before = registry.events.count
        try registry.setPriority(ProjectID("p1"), to: .high, at: t0)
        XCTAssertEqual(registry.events.count, before)
    }

    // MARK: Ownership

    func testOwnerInvolvement() {
        XCTAssertTrue(Owner.mixed([.user, .claude]).involves(.claude))
        XCTAssertTrue(Owner.mixed([.mixed([.grok]), .chatGPT]).involves(.grok))
        XCTAssertFalse(Owner.mixed([.user]).involves(.claude))
        XCTAssertTrue(Owner.tool(name: "scanner").involves(.tool(name: "scanner")))
        XCTAssertFalse(Owner.tool(name: "scanner").involves(.tool(name: "other")))
        XCTAssertTrue(Owner.mixed([.user, .claude]).involvesUser)
    }

    // MARK: Archive & reactivation

    func testArchivePreservesHistoryAndReactivates() throws {
        var registry = makeRegistry(makeProject("p1", status: .active))
        let id = ProjectID("p1")
        try registry.recordDecision(Decision(
            id: DecisionID("d1"), title: "T", decision: "D", rationale: "R",
            date: t0, owner: .user, affectedProjects: [id]), at: t0)
        try registry.archive(id, at: t0.addingTimeInterval(days(1)))
        XCTAssertEqual(registry.project(id)?.status, .archived)
        XCTAssertFalse(registry.events(for: id).isEmpty)
        XCTAssertEqual(registry.activeDecisions(for: id).count, 1)

        try registry.reactivate(id, at: t0.addingTimeInterval(days(2)))
        XCTAssertEqual(registry.project(id)?.status, .active)
        let kinds = registry.events(for: id).map(\.kind)
        XCTAssertTrue(kinds.contains(.projectArchived))
        XCTAssertTrue(kinds.contains(.projectReactivated))
    }

    func testReactivateRequiresArchivedOrDormant() {
        var registry = makeRegistry(makeProject("p1", status: .active))
        XCTAssertThrowsError(try registry.reactivate(ProjectID("p1"), at: t0)) { error in
            XCTAssertEqual(error as? RegistryError, .projectNotArchivedOrDormant(ProjectID("p1")))
        }
    }

    func testArchivedExcludedFromQueriesByDefault() throws {
        let registry = makeRegistry(
            makeProject("live", status: .active),
            makeProject("gone", status: .archived))
        XCTAssertEqual(registry.query().all.map(\.id), [ProjectID("live")])
        XCTAssertEqual(registry.query(includeArchived: true).all.count, 2)
    }
}
