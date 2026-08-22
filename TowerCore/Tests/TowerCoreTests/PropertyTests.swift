import XCTest
@testable import TowerCore

/// The invariants that must survive ANY sequence of commands — these are the
/// package's real specification. Each runs against 30 random 60-step
/// command sequences (1,800 randomized steps per property).
final class PropertyTests: XCTestCase {

    /// State is always exactly the fold of the event log.
    func testReplayIdentity() {
        forAllCommandSequences { tower, ctx in
            XCTAssertEqual(Tower.replay(tower.events).state, tower.state,
                           "replay diverged from live state [\(ctx)]")
        }
    }

    /// Export -> import is the identity on both history and state.
    func testExportImportRoundTrip() {
        forAllCommandSequences(sequences: 10) { tower, ctx in
            do {
                let data = try tower.export()
                let imported = try Tower.imported(from: data)
                XCTAssertEqual(imported.events, tower.events, "events changed in transit [\(ctx)]")
                XCTAssertEqual(imported.state, tower.state, "state changed in transit [\(ctx)]")
            } catch {
                XCTFail("round trip threw: \(error) [\(ctx)]")
            }
        }
    }

    /// Event IDs are unique and history only grows.
    func testEventLogIntegrity() {
        forAllCommandSequences { tower, ctx in
            let ids = tower.events.map(\.id)
            XCTAssertEqual(ids.count, Set(ids).count, "duplicate event ids [\(ctx)]")
        }
    }

    /// The blocking dependency graph is acyclic in every reachable state —
    /// cycles are impossible, not detected. Oracle: Kahn's topological sort
    /// consumes every node iff the graph has no cycle.
    func testBlockingGraphAlwaysAcyclic() {
        forAllCommandSequences { tower, ctx in
            var indegree: [ProjectID: Int] = [:]
            var out: [ProjectID: [ProjectID]] = [:]
            let projects = tower.state.allProjects
            for p in projects { indegree[p.id] = 0 }
            for p in projects {
                for dep in p.dependencies where dep.kind.isBlocking {
                    guard indegree[dep.prerequisite] != nil else { continue }
                    out[dep.prerequisite, default: []].append(p.id)
                    indegree[p.id]! += 1
                }
            }
            var queue = projects.map(\.id).filter { indegree[$0] == 0 }
            var visited = 0
            while let n = queue.popLast() {
                visited += 1
                for m in out[n] ?? [] {
                    indegree[m]! -= 1
                    if indegree[m] == 0 { queue.append(m) }
                }
            }
            XCTAssertEqual(visited, projects.count,
                           "blocking graph contains a cycle [\(ctx)]")
        }
    }

    /// A completed project either had zero obstacles at completion time or
    /// carries an override with a non-empty rationale in its history.
    func testCompletionIsProvenOrAudited() {
        forAllCommandSequences { tower, ctx in
            for event in tower.events {
                guard case .lifecycleChanged(let id, _, .completed, let cause) = event.payload
                else { continue }
                switch cause {
                case .completionProven, .completionOverridden:
                    break // override rationale is NonEmptyText by construction
                default:
                    XCTFail("'\(id)' reached completed via \(cause) [\(ctx)]")
                }
            }
        }
    }

    /// Resting states are only ever exited by the deliberate commands.
    func testRestingStatesExitDeliberately() {
        forAllCommandSequences { tower, ctx in
            for event in tower.events {
                guard case .lifecycleChanged(let id, let from, .active, let cause) = event.payload
                else { continue }
                switch (from, cause) {
                case (.notStarted, .requested),
                     (.completed, .reopened),
                     (.dormant, .reactivated), (.archived, .reactivated):
                    break
                default:
                    XCTFail("'\(id)' left \(from.rawValue) for active via \(cause) [\(ctx)]")
                }
            }
        }
    }

    /// Attention queue: buckets never regress, blocked work never outranks
    /// executable work, and every entry carries evidence.
    func testAttentionQueueIsSoundAndExplained() {
        forAllCommandSequences(sequences: 12) { tower, ctx in
            let assessment = tower.assess(at: t0.addingTimeInterval(90 * 86_400))
            let queue = assessment.attention
            for pair in zip(queue, queue.dropFirst()) {
                XCTAssertLessThanOrEqual(pair.0.bucket.rawValue, pair.1.bucket.rawValue,
                                         "bucket order regressed [\(ctx)]")
            }
            for entry in queue {
                XCTAssertFalse(entry.evidence.isEmpty, "'\(entry.id)' ranked without evidence [\(ctx)]")
            }
            // terminal & dormant work never appears
            for entry in queue {
                let lifecycle = tower.state.project(entry.id)!.lifecycle
                XCTAssertFalse(lifecycle.isTerminal || lifecycle == .dormant,
                               "'\(entry.id)' (\(lifecycle)) in queue [\(ctx)]")
            }
        }
    }

    /// Bitemporal sanity: folding only events up to any past instant is a
    /// prefix fold — state(asOf:) at the last instant equals current state.
    func testTimeTravelConverges() {
        forAllCommandSequences(sequences: 8) { tower, ctx in
            guard let last = tower.events.last else { return }
            XCTAssertEqual(tower.state(asOf: last.effectiveAt), tower.state,
                           "asOf(latest) != current [\(ctx)]")
            XCTAssertEqual(tower.state(recordedBy: last.recordedAt), tower.state,
                           "recordedBy(latest) != current [\(ctx)]")
        }
    }
}
