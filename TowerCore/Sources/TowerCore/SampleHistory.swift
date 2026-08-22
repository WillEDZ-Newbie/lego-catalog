#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// A deterministic fictional portfolio built purely through guarded
/// commands — usable from tests and demos without leaving the package.
/// Same `now`, same history, every time.
public enum SampleHistory {
    struct RNG { var s: UInt64
        mutating func next() -> UInt64 { s &+= 0x9E3779B97F4A7C15; var z = s
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB; return z ^ (z >> 31) }
        mutating func int(_ b: Int) -> Int { Int(next() % UInt64(b)) }
        mutating func pick<T>(_ a: [T]) -> T { a[int(a.count)] }
    }

    public static func standard(now: Date) -> Tower {
        var tower = Tower()
        let day = 86_400.0
        func ago(_ d: Double) -> Date { now.addingTimeInterval(-d * day) }
        func net(_ s: String) -> NonEmptyText { NonEmptyText(s)! }
        func mk(_ id: String, _ name: String, pri: Priority = .medium, owner: Owner = .user,
                action: String? = nil, deadline: Date? = nil, at created: Date) {
            try! tower.execute(.createProject(.init(
                id: ProjectID(id), name: net(name), purpose: "Sample fixture: \(name).",
                priority: pri, owner: owner, nextAction: action, deadline: deadline)), at: created)
        }

        mk("hub", "Hub Platform", pri: .critical, owner: .claude,
           action: "Publish the platform interface package", at: ago(60))
        try! tower.execute(.start(ProjectID("hub")), at: ago(59))
        for i in 1...4 {
            mk("spoke-\(i)", "Spoke \(i)", owner: .chatGPT,
               action: "Adopt the platform interface once published", at: ago(58))
            try! tower.execute(.start(ProjectID("spoke-\(i)")), at: ago(57))
            try! tower.execute(.addDependency(ProjectID("spoke-\(i)"), on: ProjectID("hub"), kind: .blocks), at: ago(57))
        }
        var prev: String? = nil
        for i in 1...5 {
            let id = "chain-\(i)"
            mk(id, "Chain Stage \(i)", pri: .high, owner: .claude,
               action: "Implement stage \(i) transform", at: ago(50))
            try! tower.execute(.start(ProjectID(id)), at: ago(49))
            if let p = prev { try! tower.execute(.addDependency(ProjectID(id), on: ProjectID(p), kind: .blocks), at: ago(49)) }
            prev = id
        }
        try! tower.execute(.complete(ProjectID("chain-1"), override: nil), at: ago(20))

        mk("crossroads", "Crossroads", pri: .high, action: "Implement the chosen sync strategy", at: ago(30))
        try! tower.execute(.start(ProjectID("crossroads")), at: ago(29))
        try! tower.execute(.openBlocker(ProjectID("crossroads"), Blocker(
            id: BlockerID("blk-decision"), kind: .decision,
            summary: net("Choose between snapshot sync and event sync."),
            owner: .user, severity: .high, openedAt: ago(6))), at: ago(6))

        mk("manor", "Milestone Manor", owner: .claude,
           action: "Finish the acceptance checklist", at: ago(25))
        try! tower.execute(.start(ProjectID("manor")), at: ago(24))
        try! tower.execute(.openGate(ProjectID("manor"), Gate(
            id: GateID("gate-signoff"), title: net("Milestone sign-off"),
            kind: .userApproval, reviewer: .user, openedAt: ago(3))), at: ago(3))
        try! tower.execute(.addMilestone(ProjectID("manor"), Milestone(
            id: MilestoneID("ms-first"), title: net("First cut"),
            criteria: [Criterion(id: CriterionID("crit-tests"), text: net("All importer tests pass"))],
            gateID: GateID("gate-signoff"), deadline: now.addingTimeInterval(5 * day),
            createdAt: ago(20))), at: ago(20))

        mk("drifter", "Deadline Drifter", pri: .high,
           action: "Ship the export command behind a flag", deadline: ago(2), at: ago(40))
        try! tower.execute(.start(ProjectID("drifter")), at: ago(39))
        mk("forgotten", "Forgotten Build", action: "Re-run the nightly suite and triage", at: ago(90))
        try! tower.execute(.start(ProjectID("forgotten")), at: ago(89))
        mk("vague", "Vague Venture", pri: .critical, action: "Work on the importer", at: ago(10))
        try! tower.execute(.start(ProjectID("vague")), at: ago(9))
        mk("sleeper", "Sleeping Giant", at: ago(100))
        try! tower.execute(.start(ProjectID("sleeper")), at: ago(99))
        try! tower.execute(.pause(ProjectID("sleeper")), at: ago(95))
        mk("relic", "Retired Relic", at: ago(110))
        try! tower.execute(.start(ProjectID("relic")), at: ago(109))
        try! tower.execute(.complete(ProjectID("relic"), override: nil), at: ago(100))
        try! tower.execute(.archive(ProjectID("relic")), at: ago(99))
        mk("hotfix", "Hotfix Harbor", pri: .high, action: "Ship the hotfix", at: ago(30))
        try! tower.execute(.start(ProjectID("hotfix")), at: ago(29))
        try! tower.execute(.openBlocker(ProjectID("hotfix"), Blocker(
            id: BlockerID("blk-flaky"), kind: .technical,
            summary: net("Flaky test in the release lane."), owner: .claude, openedAt: ago(8))), at: ago(8))
        try! tower.execute(.complete(ProjectID("hotfix"),
            override: Override("Shipping under incident; flaky test tracked separately")), at: ago(2))
        try! tower.execute(.recordDecision(Decision(
            id: DecisionID("dec-flat"), title: net("Use flat files"),
            decision: net("Store fixtures as flat files."), rationale: net("Simplest thing."),
            owner: .user, affectedProjects: [ProjectID("manor")], decidedAt: ago(60))), at: ago(60))
        try! tower.execute(.supersedeDecision(DecisionID("dec-flat"), with: Decision(
            id: DecisionID("dec-index"), title: net("Use a bundled index"),
            decision: net("Fixtures behind a bundled index."), rationale: net("Scale."),
            owner: .user, affectedProjects: [ProjectID("manor")], decidedAt: ago(20))), at: ago(20))

        var rng = RNG(s: 0xC0FFEE)
        let owners: [Owner] = [.user, .chatGPT, .grok, .claude, .tool(name: "scanner")]
        let actions = ["Draft the v2 interface spec", "Run the importer on the 5k sample",
                       "Write regression tests for the parser", nil]
        for i in 0..<20 {
            let id = "gen-" + (i < 10 ? "0" : "") + String(i)
            let created = ago(Double(5 + rng.int(70)))
            mk(id, "Sample Project #\(i)",
               pri: [Priority.critical, .high, .medium, .low][rng.int(4)],
               owner: rng.pick(owners), action: rng.pick(actions), at: created)
            if rng.int(100) < 70 { try! tower.execute(.start(ProjectID(id)), at: created.addingTimeInterval(day)) }
        }
        return tower
    }
}
