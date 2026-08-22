import Foundation
import XCTest
@testable import TowerCore

/// Deterministic SplitMix64 generator: every property failure reports the
/// seed that produced it, and re-running with that seed reproduces it exactly.
struct SeededRNG: RandomNumberGenerator {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
    mutating func int(_ bound: Int) -> Int { Int(next() % UInt64(bound)) }
    mutating func pick<T>(_ array: [T]) -> T { array[int(array.count)] }
    mutating func chance(_ pct: Int) -> Bool { int(100) < pct }
}

let t0 = Date(timeIntervalSince1970: 1_754_000_000)

/// Generates a random but *plausible* command against the current state:
/// mostly valid commands, with a deliberate sprinkle of invalid ones so
/// rejection paths are exercised too. Rejections are expected and swallowed
/// by the runner; what must hold are the invariants afterwards.
func randomCommand(_ tower: Tower, _ rng: inout SeededRNG, step: Int) -> Command {
    let ids = tower.state.allProjects.map(\.id)
    func anyID() -> ProjectID {
        ids.isEmpty || rng.chance(10) ? ProjectID("ghost-\(rng.int(1000))") : rng.pick(ids)
    }
    let owners: [Owner] = [.user, .claude, .chatGPT, .grok, .tool(name: "scanner"),
                           .mixed([.user, .claude])]
    let actions = [
        "Run the importer against the sample set and log failures",
        "Write regression tests for the header parser",
        "Work on stuff", "Fix it", nil,
        "Benchmark the queue drain with 10k synthetic jobs"
    ]
    switch rng.int(24) {
    case 0:
        return .createProject(.init(
            id: ProjectID("p-\(step)"), name: NonEmptyText("Project \(step)")!,
            priority: rng.pick(Priority.allCases), owner: rng.pick(owners),
            nextAction: rng.pick(actions),
            deadline: rng.chance(30) ? t0.addingTimeInterval(Double(rng.int(40) - 10) * 86_400) : nil))
    case 1: return .start(anyID())
    case 2: return .pause(anyID())
    case 3: return .cancel(anyID())
    case 4: return .archive(anyID())
    case 5: return .complete(anyID(), override: rng.chance(40) ? Override("descoped in test")! : nil)
    case 6: return .reopen(anyID())
    case 7: return .reactivate(anyID())
    case 8: return .setStage(anyID(), rng.pick(["design", "build", "stabilisation"]))
    case 9: return .setNextAction(anyID(), rng.pick(actions))
    case 10: return .setPriority(anyID(), rng.pick(Priority.allCases))
    case 11: return .setOwner(anyID(), rng.pick(owners))
    case 12: return .setDeadline(anyID(), rng.chance(50) ? t0.addingTimeInterval(Double(rng.int(30)) * 86_400) : nil)
    case 13: return .addDependency(anyID(), on: anyID(), kind: rng.pick(DependencyKind.allCases))
    case 14: return .removeDependency(anyID(), on: anyID())
    case 15:
        return .openBlocker(anyID(), Blocker(
            id: BlockerID("b-\(step)"),
            kind: rng.pick(Blocker.Kind.allCases),
            summary: NonEmptyText("Blocker \(step)")!,
            owner: rng.pick(owners), severity: rng.pick(Level.allCases), openedAt: t0))
    case 16:
        // resolve a random existing blocker (may already be resolved)
        if let p = tower.state.allProjects.first(where: { !$0.blockers.isEmpty }),
           !p.blockers.isEmpty {
            var rngCopy = rng
            return .resolveBlocker(p.id, rngCopy.pick(p.blockers).id,
                                   resolution: NonEmptyText("resolved in test")!)
        }
        return .resolveBlocker(anyID(), BlockerID("none"), resolution: NonEmptyText("x")!)
    case 17:
        return .addMilestone(anyID(), Milestone(
            id: MilestoneID("m-\(step)"), title: NonEmptyText("Milestone \(step)")!,
            criteria: rng.chance(50) ? [Criterion(id: CriterionID("c-\(step)"),
                                                  text: NonEmptyText("crit")!)] : [],
            createdAt: t0))
    case 18:
        if let p = tower.state.allProjects.first(where: { !$0.milestones.isEmpty }) {
            var rngCopy = rng
            let m = rngCopy.pick(p.milestones)
            if rng.chance(50), let c = m.criteria.first {
                return .satisfyCriterion(p.id, m.id, c.id)
            }
            return .completeMilestone(p.id, m.id,
                override: rng.chance(50) ? Override("override in test")! : nil)
        }
        return .completeMilestone(anyID(), MilestoneID("none"), override: nil)
    case 19:
        return .openGate(anyID(), Gate(
            id: GateID("g-\(step)"), title: NonEmptyText("Gate \(step)")!,
            kind: rng.pick(Gate.Kind.allCases), reviewer: rng.pick(owners), openedAt: t0))
    case 20:
        if let p = tower.state.allProjects.first(where: { !$0.gates.isEmpty }) {
            var rngCopy = rng
            return .resolveGate(p.id, rngCopy.pick(p.gates).id,
                                outcome: rng.chance(70) ? .approved : .rejected,
                                rationale: NonEmptyText("verdict in test")!)
        }
        return .resolveGate(anyID(), GateID("none"), outcome: .approved,
                            rationale: NonEmptyText("x")!)
    case 21:
        return .addRisk(anyID(), Risk(
            id: RiskID("r-\(step)"), summary: NonEmptyText("Risk \(step)")!,
            likelihood: rng.pick(Level.allCases), impact: rng.pick(Level.allCases),
            owner: rng.pick(owners)))
    case 22:
        return .recordDecision(Decision(
            id: DecisionID("d-\(step)"), title: NonEmptyText("Decision \(step)")!,
            decision: NonEmptyText("choice")!, rationale: NonEmptyText("because")!,
            owner: .user, affectedProjects: ids.isEmpty ? [] : [rng.pick(ids)], decidedAt: t0))
    default:
        return .completeAction(anyID(), NonEmptyText("Did the thing \(step)")!)
    }
}

/// Runs `sequences` random command sequences of `steps` steps each; after
/// every accepted command, checks every invariant. Failure messages carry
/// the seed for exact reproduction.
func forAllCommandSequences(
    sequences: Int = 30, steps: Int = 60, seedBase: UInt64 = 42,
    file: StaticString = #filePath, line: UInt = #line,
    invariants: (Tower, _ context: String) -> Void
) {
    for run in 0..<sequences {
        let seed = seedBase &+ UInt64(run)
        var rng = SeededRNG(seed: seed)
        var tower = Tower()
        var clock = t0
        var accepted = 0
        for step in 0..<steps {
            clock = clock.addingTimeInterval(Double(rng.int(48)) * 1800)
            let command = randomCommand(tower, &rng, step: run * 10_000 + step)
            do {
                try tower.execute(command, at: clock)
                accepted += 1
            } catch { /* rejections are expected; invariants must still hold */ }
            invariants(tower, "seed=\(seed) step=\(step) accepted=\(accepted)")
        }
        XCTAssertGreaterThan(accepted, 0, "seed=\(seed): no commands accepted at all",
                             file: file, line: line)
    }
}
