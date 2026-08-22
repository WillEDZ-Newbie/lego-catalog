import XCTest
@testable import TowerCore

/// Tests for the LifeOS-boundaries alignment pass: import validation
/// (guarded replay, §3.1 invariant 8 / §3.2 Imports) and the v1-compatible
/// API façade.
final class ImportValidationTests: XCTestCase {

    private func legalTower() throws -> Tower {
        var t = Tower()
        try t.createProject(.init(id: ProjectID("a"), name: NonEmptyText("A")!, owner: .user), at: t0)
        try t.startProject(ProjectID("a"), at: t0)
        try t.createProject(.init(id: ProjectID("b"), name: NonEmptyText("B")!, owner: .user), at: t0)
        try t.execute(.addDependency(ProjectID("b"), on: ProjectID("a"), kind: .blocks), at: t0)
        return t
    }

    func testLegalHistoryImportsCleanly() throws {
        let tower = try legalTower()
        let imported = try Tower.imported(from: tower.export())
        XCTAssertEqual(imported.state, tower.state)
    }

    private func tamper(_ tower: Tower, adding payloads: [Event.Payload]) throws -> Data {
        var events = tower.events
        for (i, payload) in payloads.enumerated() {
            events.append(Event(id: EventID("evil-\(i)"), recordedAt: t0, effectiveAt: t0, payload: payload))
        }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(TowerExport(events: events))
    }

    func testImportRejectsDuplicateProjectIdentity() throws {
        let data = try tamper(legalTower(), adding: [
            .projectCreated(.init(id: ProjectID("a"), name: NonEmptyText("A2")!, owner: .user))
        ])
        XCTAssertThrowsError(try Tower.imported(from: data)) {
            guard case ImportError.invalidHistory(let v)? = $0 as? ImportError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertTrue(v.contains { $0.detail.contains("duplicate project id 'a'") })
        }
    }

    func testImportRejectsDuplicateDecisionIdentity() throws {
        var tower = try legalTower()
        let decision = Decision(id: DecisionID("d"), title: NonEmptyText("t")!,
                                decision: NonEmptyText("x")!, rationale: NonEmptyText("r")!,
                                owner: .user, decidedAt: t0)
        try tower.execute(.recordDecision(decision), at: t0)
        let data = try tamper(tower, adding: [.decisionRecorded(decision)])
        XCTAssertThrowsError(try Tower.imported(from: data)) {
            guard case ImportError.invalidHistory(let v)? = $0 as? ImportError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertTrue(v.contains { $0.detail.contains("duplicate decision id 'd'") })
        }
    }

    func testImportRejectsSmuggledCycleWithPath() throws {
        // b already depends on a; a tampered event makes a depend on b.
        let data = try tamper(legalTower(), adding: [
            .dependencyAdded(ProjectID("a"), Dependency(on: ProjectID("b"), kind: .blocks))
        ])
        XCTAssertThrowsError(try Tower.imported(from: data)) {
            guard case ImportError.invalidHistory(let v)? = $0 as? ImportError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertTrue(v.contains { $0.detail.contains("closes blocking cycle") && $0.detail.contains("->") },
                          "cycle violation must trace its path: \(v)")
        }
    }

    func testImportRejectsUnknownReferencesAndDuplicateEventIDs() throws {
        var tower = try legalTower()
        var events = tower.events
        events.append(Event(id: events[0].id, recordedAt: t0, effectiveAt: t0,
                            payload: .stageChanged(ProjectID("a"), to: "x")))       // dup event id
        events.append(Event(id: EventID("evil-ref"), recordedAt: t0, effectiveAt: t0,
                            payload: .priorityChanged(ProjectID("ghost"), to: .high))) // unknown project
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(TowerExport(events: events))
        XCTAssertThrowsError(try Tower.imported(from: data)) {
            guard case ImportError.invalidHistory(let v)? = $0 as? ImportError else {
                return XCTFail("wrong error: \($0)")
            }
            XCTAssertTrue(v.contains { $0.detail.contains("duplicate event id") })
            XCTAssertTrue(v.contains { $0.detail.contains("unknown project 'ghost'") })
        }
        _ = tower // silence mutation warning
    }

    func testEventIDGenerationStaysCollisionSafeAfterValidatedImport() throws {
        var tower = try legalTower()
        var imported = try Tower.imported(from: tower.export())
        try imported.execute(.setPriority(ProjectID("a"), .critical), at: t0)
        let ids = imported.events.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count)
    }
}

final class CompatFacadeTests: XCTestCase {

    func testV1NamedFlowWorks() throws {
        var tower = Tower()
        try tower.createProject(.init(id: ProjectID("p"), name: NonEmptyText("P")!, owner: .user), at: t0)
        try tower.startProject(ProjectID("p"), at: t0)
        try tower.pause(ProjectID("p"), at: t0)
        try tower.reactivate(ProjectID("p"), at: t0)
        try tower.completeProject(ProjectID("p"), at: t0)
        try tower.reopen(ProjectID("p"), at: t0)
        try tower.completeProject(ProjectID("p"), at: t0)
        try tower.archive(ProjectID("p"), at: t0)
        XCTAssertEqual(tower.state.project(ProjectID("p"))?.lifecycle, .archived)
    }

    func testBlankOverrideRationaleRejectedLikeV1() throws {
        var tower = Tower()
        try tower.createProject(.init(id: ProjectID("p"), name: NonEmptyText("P")!, owner: .user), at: t0)
        try tower.startProject(ProjectID("p"), at: t0)
        try tower.execute(.openBlocker(ProjectID("p"), Blocker(
            id: BlockerID("b"), kind: .technical, summary: NonEmptyText("s")!,
            owner: .user, openedAt: t0)), at: t0)
        for blank in ["", "   ", "\n\t"] {
            XCTAssertThrowsError(try tower.completeProject(
                ProjectID("p"), at: t0, overrideRationale: blank)) {
                XCTAssertEqual($0 as? Rejection, .blankOverrideRationale)
            }
        }
        try tower.completeProject(ProjectID("p"), at: t0,
                                  overrideRationale: "descoped after review")
        XCTAssertEqual(tower.state.project(ProjectID("p"))?.lifecycle, .completed)
    }
}
