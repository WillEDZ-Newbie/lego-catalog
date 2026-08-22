import Foundation

/// A deterministic fictional portfolio used by tests and as an integration
/// example. Names are invented; nothing here encodes real projects.
///
/// The bulk of the portfolio comes from a seeded generator (same seed, same
/// portfolio, every run); the pathological cases — a dependency cycle, a
/// completed project with an unresolved blocker, dormant-but-not-stale work,
/// superseded decisions — are hand-authored fixtures with stable IDs so
/// tests can point at them.
public enum SyntheticPortfolio {
    /// Deterministic PRNG (SplitMix64) so generation never depends on
    /// the system RNG or the wall clock.
    struct SeededGenerator: RandomNumberGenerator {
        var state: UInt64
        init(seed: UInt64) { state = seed }
        mutating func next() -> UInt64 {
            state &+= 0x9E3779B97F4A7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
            return z ^ (z >> 31)
        }
    }

    /// Well-known fixture IDs for tests.
    public enum Fixture {
        public static let cycleA = ProjectID("fix-cycle-a")
        public static let cycleB = ProjectID("fix-cycle-b")
        public static let cycleC = ProjectID("fix-cycle-c")
        public static let completedWithBlocker = ProjectID("fix-bad-completed")
        public static let dormantOld = ProjectID("fix-dormant-old")
        public static let staleActive = ProjectID("fix-stale-active")
        public static let vagueAction = ProjectID("fix-vague-action")
        public static let missingAction = ProjectID("fix-missing-action")
        public static let chainRoot = ProjectID("fix-chain-1")
        public static let chainEnd = ProjectID("fix-chain-6")
        public static let hub = ProjectID("fix-hub")
        public static let awaitingArchitecture = ProjectID("fix-await-arch")
        public static let awaitingDecision = ProjectID("fix-await-decision")
        public static let overdue = ProjectID("fix-overdue")
        public static let gatedMilestone = ProjectID("fix-gated-milestone")
        public static let supersededDecisionOld = DecisionID("fix-dec-old")
        public static let supersededDecisionNew = DecisionID("fix-dec-new")
        public static let archivedRelic = ProjectID("fix-archived")
        public static let mixedOwnership = ProjectID("fix-mixed-owner")
        public static let toolOwned = ProjectID("fix-tool-owned")
        public static let riskHeavy = ProjectID("fix-risk-heavy")
    }

    static let themes = [
        "Aurora Indexer", "Basalt Importer", "Cobalt Scheduler", "Drift Analyzer",
        "Ember Cache", "Fjord Sync", "Garnet Parser", "Halcyon Monitor",
        "Iris Renderer", "Juniper Queue", "Krypton Store", "Lumen Router",
        "Meridian Ledger", "Nimbus Archive", "Onyx Validator", "Prism Encoder",
        "Quartz Sampler", "Rowan Notifier", "Sable Crawler", "Tundra Planner"
    ]

    static let stages = ["discovery", "design", "build", "stabilisation", "rollout"]

    static let concreteActions = [
        "Draft the v2 interface spec and circulate it for comment",
        "Run the importer against the 5k-record sample set and log failures",
        "Write regression tests for the header parser edge cases",
        "Benchmark the queue drain path with 10k synthetic jobs",
        "Migrate the config loader to the new schema and update fixtures"
    ]

    static let vagueActions = ["Work on the importer", "Continue polish", "Improve things"]

    /// Builds the standard portfolio: 20 hand-authored fixtures plus enough
    /// generated projects to reach `size` (default 80, minimum honoured 75).
    public static func standard(now: Date, size: Int = 80) -> ProjectRegistry {
        var registry = ProjectRegistry()
        let base = now.addingTimeInterval(-120 * 86_400) // portfolio began ~4 months ago
        var rng = SeededGenerator(seed: 0xC0FFEE)

        buildFixtures(&registry, base: base, now: now)
        let fixtureCount = registry.allProjects.count
        let generatedCount = max(size, 75) - fixtureCount

        let owners: [Owner] = [.user, .chatGPT, .grok, .claude,
                               .tool(name: "scanner"), .mixed([.user, .claude])]
        let priorities = Priority.allCases

        var previous: [ProjectID] = []
        for index in 0..<generatedCount {
            let id = ProjectID(String(format: "gen-%03d", index))
            let theme = themes[index % themes.count]
            let created = base.addingTimeInterval(Double(index % 90) * 86_400)
            let owner = owners[Int(rng.next() % UInt64(owners.count))]
            let priority = priorities[Int(rng.next() % UInt64(priorities.count))]
            let roll = rng.next() % 100

            var project = Project(
                id: id,
                name: "\(theme) #\(index)",
                purpose: "Fictional subsystem exercising the \(theme.lowercased()) scenario.",
                status: .notStarted,
                currentStage: stages[Int(rng.next() % UInt64(stages.count))],
                priority: priority,
                owner: owner,
                createdAt: created
            )
            project.nextAction = concreteActions[Int(rng.next() % UInt64(concreteActions.count))]

            try! registry.add(project, at: created)

            // Lifecycle variety, driven by the seeded roll.
            switch roll {
            case 0..<45:
                try! registry.setStatus(id, to: .active, at: created.addingTimeInterval(86_400))
            case 45..<60:
                try! registry.setStatus(id, to: .active, at: created.addingTimeInterval(86_400))
                try! registry.completeProject(id, at: created.addingTimeInterval(10 * 86_400))
            case 60..<70:
                try! registry.setStatus(id, to: .active, at: created.addingTimeInterval(86_400))
                try! registry.setStatus(id, to: .dormant, at: created.addingTimeInterval(5 * 86_400))
            case 70..<78:
                try! registry.setStatus(id, to: .active, at: created.addingTimeInterval(86_400))
                try! registry.completeProject(id, at: created.addingTimeInterval(8 * 86_400))
                try! registry.archive(id, at: created.addingTimeInterval(9 * 86_400))
            default:
                break // stays notStarted
            }

            // Sprinkle structure deterministically.
            if roll % 7 == 0, let target = previous.randomElement(using: &rng) {
                try? registry.addDependency(id, on: target, kind: .blocks,
                                            at: created.addingTimeInterval(2 * 86_400))
            }
            if roll % 11 == 0 {
                try! registry.addBlocker(id, Blocker(
                    id: BlockerID("blk-\(id.rawValue)"),
                    type: roll % 22 == 0 ? .decision : .technical,
                    summary: "Fictional blocker for \(theme).",
                    owner: roll % 22 == 0 ? .user : .claude,
                    createdAt: created.addingTimeInterval(3 * 86_400),
                    severity: .medium
                ), at: created.addingTimeInterval(3 * 86_400))
            }
            if roll % 13 == 0 {
                try! registry.addRisk(id, Risk(
                    id: RiskID("rsk-\(id.rawValue)"),
                    summary: "Fictional risk for \(theme).",
                    likelihood: roll % 26 == 0 ? .high : .medium,
                    impact: .medium,
                    owner: owner
                ), at: created.addingTimeInterval(4 * 86_400))
            }
            if roll % 17 == 0 {
                let deadlineOffset = Double(Int(rng.next() % 40)) - 10 // some overdue
                try! registry.setDeadline(id, to: now.addingTimeInterval(deadlineOffset * 86_400),
                                          at: created.addingTimeInterval(86_400))
            }
            previous.append(id)
        }
        return registry
    }

    // MARK: - Hand-authored pathological fixtures

    private static func buildFixtures(_ registry: inout ProjectRegistry, base: Date, now: Date) {
        let day = 86_400.0

        func addProject(
            _ id: ProjectID, _ name: String, status: ProjectStatus = .active,
            stage: String = "build", priority: Priority = .medium, owner: Owner = .user,
            createdDaysAgo: Double = 60, nextAction: String? = nil, deadline: Date? = nil
        ) {
            let created = now.addingTimeInterval(-createdDaysAgo * day)
            var p = Project(
                id: id, name: name,
                purpose: "Hand-authored fixture: \(name).",
                status: .notStarted, currentStage: stage,
                nextAction: nextAction, priority: priority,
                owner: owner, deadline: deadline, createdAt: created
            )
            p.nextAction = nextAction
            try! registry.add(p, at: created)
            if status != .notStarted {
                try! registry.setStatus(id, to: .active, at: created.addingTimeInterval(day))
                switch status {
                case .dormant: try! registry.setStatus(id, to: .dormant, at: created.addingTimeInterval(2 * day))
                case .completed: try! registry.completeProject(id, at: created.addingTimeInterval(3 * day))
                case .archived:
                    try! registry.completeProject(id, at: created.addingTimeInterval(3 * day))
                    try! registry.archive(id, at: created.addingTimeInterval(4 * day))
                default: break
                }
            }
        }

        // Deliberate circular dependency: A -> B -> C -> A.
        addProject(Fixture.cycleA, "Cycle Alpha", nextAction: "Extract shared schema into its own module")
        addProject(Fixture.cycleB, "Cycle Beta", nextAction: "Port beta consumers to the shared schema")
        addProject(Fixture.cycleC, "Cycle Gamma", nextAction: "Delete the legacy gamma shim")
        try! registry.addDependency(Fixture.cycleB, on: Fixture.cycleA, at: now.addingTimeInterval(-50 * day))
        try! registry.addDependency(Fixture.cycleC, on: Fixture.cycleB, at: now.addingTimeInterval(-50 * day))
        try! registry.addDependency(Fixture.cycleA, on: Fixture.cycleC, at: now.addingTimeInterval(-50 * day))

        // Long chain 1 -> 2 -> ... -> 6 (chain-1 is the root prerequisite).
        var previousChain: ProjectID? = nil
        for i in 1...6 {
            let id = ProjectID("fix-chain-\(i)")
            addProject(id, "Chain Stage \(i)",
                       status: i == 1 ? .completed : .active,
                       priority: .high, owner: .claude,
                       nextAction: "Implement stage \(i) transform and verify output hashes")
            if let prev = previousChain {
                try! registry.addDependency(id, on: prev, at: now.addingTimeInterval(-40 * day))
            }
            previousChain = id
        }

        // Wide fan-out hub: five dependents.
        addProject(Fixture.hub, "Hub Platform", priority: .critical, owner: .claude,
                   nextAction: "Publish the platform interface package to the local registry")
        for i in 1...5 {
            let id = ProjectID("fix-spoke-\(i)")
            addProject(id, "Spoke \(i)", owner: .chatGPT,
                       nextAction: "Adopt platform interface once published")
            try! registry.addDependency(id, on: Fixture.hub, at: now.addingTimeInterval(-30 * day))
        }

        // Completed project with an unresolved blocker — validator fixture.
        // Built via unchecked insert because the registry refuses this path.
        let badCreated = now.addingTimeInterval(-70 * day)
        var bad = Project(
            id: Fixture.completedWithBlocker, name: "Broken Completion",
            purpose: "Hand-authored fixture: completed with unresolved blocker.",
            status: .completed, currentStage: "rollout", priority: .low,
            owner: .user, createdAt: badCreated
        )
        bad.blockers = [Blocker(
            id: BlockerID("fix-bad-blocker"), type: .technical,
            summary: "Left deliberately unresolved for validator tests.",
            owner: .user, createdAt: badCreated.addingTimeInterval(day), severity: .high
        )]
        registry.insertUnchecked(bad)

        // Dormant project untouched for months — must NOT be flagged stale.
        addProject(Fixture.dormantOld, "Sleeping Giant", status: .dormant, createdDaysAgo: 100)

        // Active project untouched past threshold — MUST be flagged stale.
        addProject(Fixture.staleActive, "Forgotten Build", createdDaysAgo: 90,
                   nextAction: "Re-run the nightly suite and triage the failures")

        // Vague and missing next actions.
        addProject(Fixture.vagueAction, "Vague Venture", nextAction: "Work on the importer")
        addProject(Fixture.missingAction, "Silent Runner", nextAction: nil)

        // Awaiting architecture review, with downstream dependents.
        addProject(Fixture.awaitingArchitecture, "Gatehouse", priority: .critical, owner: .claude,
                   nextAction: "Address review notes on the storage design")
        try! registry.openReviewGate(Fixture.awaitingArchitecture, ReviewGate(
            id: ReviewGateID("fix-gate-arch"), title: "Storage design review",
            kind: .architectureReview, reviewer: .chatGPT,
            requestedAt: now.addingTimeInterval(-5 * day)
        ), at: now.addingTimeInterval(-5 * day))
        for i in 1...2 {
            let id = ProjectID("fix-gated-dependent-\(i)")
            addProject(id, "Gated Dependent \(i)", owner: .claude,
                       nextAction: "Start once the storage design is approved")
            try! registry.addDependency(id, on: Fixture.awaitingArchitecture,
                                        at: now.addingTimeInterval(-4 * day))
        }

        // Awaiting an explicit user decision.
        addProject(Fixture.awaitingDecision, "Crossroads", priority: .high,
                   nextAction: "Implement the chosen sync strategy")
        try! registry.addBlocker(Fixture.awaitingDecision, Blocker(
            id: BlockerID("fix-decision-blocker"), type: .decision,
            summary: "Choose between snapshot sync and event sync.",
            owner: .user, createdAt: now.addingTimeInterval(-6 * day), severity: .high
        ), at: now.addingTimeInterval(-6 * day))

        // Overdue project with explicit deadline.
        addProject(Fixture.overdue, "Deadline Drifter", priority: .high,
                   nextAction: "Ship the export command behind a feature flag",
                   deadline: now.addingTimeInterval(-2 * day))

        // Milestone with acceptance criteria and a review gate.
        addProject(Fixture.gatedMilestone, "Milestone Manor", owner: .claude,
                   nextAction: "Finish the acceptance checklist for milestone one")
        let gateID = ReviewGateID("fix-gate-milestone")
        try! registry.openReviewGate(Fixture.gatedMilestone, ReviewGate(
            id: gateID, title: "Milestone sign-off", kind: .userApproval,
            reviewer: .user, scope: .milestone(MilestoneID("fix-milestone-1")),
            requestedAt: now.addingTimeInterval(-3 * day)
        ), at: now.addingTimeInterval(-3 * day))
        try! registry.addMilestone(Fixture.gatedMilestone, Milestone(
            id: MilestoneID("fix-milestone-1"), title: "First cut",
            state: .active,
            acceptanceCriteria: [
                .init(id: CriterionID("fix-crit-1"), text: "All importer tests pass"),
                .init(id: CriterionID("fix-crit-2"), text: "Docs updated", isRequired: false)
            ],
            owner: .claude,
            deadline: now.addingTimeInterval(5 * day),
            reviewGateID: gateID,
            createdAt: now.addingTimeInterval(-20 * day)
        ), at: now.addingTimeInterval(-20 * day))

        // Superseded decision lineage.
        try! registry.recordDecision(Decision(
            id: Fixture.supersededDecisionOld, title: "Use flat files",
            decision: "Store fixture data as flat files.",
            rationale: "Simplest thing that works.",
            date: now.addingTimeInterval(-60 * day), owner: .user,
            affectedProjects: [Fixture.gatedMilestone]
        ), at: now.addingTimeInterval(-60 * day))
        try! registry.supersedeDecision(Fixture.supersededDecisionOld, with: Decision(
            id: Fixture.supersededDecisionNew, title: "Use a bundled index",
            decision: "Store fixture data behind a bundled index.",
            rationale: "Flat files did not scale past 50k rows.",
            date: now.addingTimeInterval(-20 * day), owner: .user,
            affectedProjects: [Fixture.gatedMilestone]
        ), at: now.addingTimeInterval(-20 * day))

        // Archived relic, mixed ownership, tool-owned, risk-heavy.
        addProject(Fixture.archivedRelic, "Retired Relic", status: .archived, createdDaysAgo: 110)
        addProject(Fixture.mixedOwnership, "Joint Venture", owner: .mixed([.user, .claude]),
                   nextAction: "Split the migration into user and Claude tracks")
        addProject(Fixture.toolOwned, "Robot Gardener", owner: .tool(name: "scanner"),
                   nextAction: "Run scanner pass over the fixture library and file results")
        addProject(Fixture.riskHeavy, "Storm Watch", priority: .high,
                   nextAction: "Add the failover path for the flaky upstream feed")
        try! registry.addRisk(Fixture.riskHeavy, Risk(
            id: RiskID("fix-risk-high"), summary: "Upstream feed may be discontinued.",
            likelihood: .high, impact: .high, owner: .user
        ), at: now.addingTimeInterval(-10 * day))
        try! registry.addRisk(Fixture.riskHeavy, Risk(
            id: RiskID("fix-risk-mitigated"), summary: "Parser brittle on malformed rows.",
            likelihood: .medium, impact: .high,
            mitigation: "Added quarantine lane for malformed rows.",
            owner: .claude, status: .mitigated
        ), at: now.addingTimeInterval(-9 * day))
    }
}
