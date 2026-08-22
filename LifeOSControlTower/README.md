# LifeOSControlTower

A standalone, Xcode-native Swift package: the deterministic domain and
reasoning substrate for the LifeOS **Project Control Tower**. It models
projects, milestones, typed dependencies, review gates, decisions, risks,
blockers, an append-only history timeline, workload and portfolio health —
with **no UI, no persistence, no networking, no filesystem access and no AI
calls**. Every judgement the engines make is rule-based and comes with
structured reasons.

- **Language:** Swift 6 (strict concurrency; all domain types are `Sendable` value types)
- **Dependencies:** none beyond Foundation
- **Platforms:** platform-independent domain logic; opens and builds directly in Xcode

## Build & test

```sh
swift build
swift test        # 116 behavioural tests, deterministic, no wall-clock dependence
```

Or open the package folder in Xcode (`File ▸ Open… ▸ LifeOSControlTower/`) —
`Package.swift` is the project; all tests run from the Test navigator.

## Quick tour

```swift
import LifeOSControlTower

var registry = ProjectRegistry()
let now = Date()

// Create work. Every mutation goes through the registry and appends
// timeline events — history is a guaranteed side effect, not a convention.
try registry.add(Project(
    id: ProjectID("scanner"), name: "Nexus Scanner",
    purpose: "Index the reference library.",
    nextAction: "Run scanner on the 10k-file test library and record duration",
    priority: .high, owner: .claude, createdAt: now), at: now)
try registry.setStatus(ProjectID("scanner"), to: .active, at: now)

// Typed dependencies + real graph analysis.
let graph = DependencyGraph(registry)
graph.detectCycles()                       // actual cycle paths, not a Bool
graph.affectedDownstream(of: ProjectID("scanner"))
graph.explainBlockage(of: registry.project(ProjectID("scanner"))!)

// Deterministic, explainable health — evidence, never a bare score.
let health = HealthEngine.assess(
    registry.project(ProjectID("scanner"))!, in: registry, now: now)
// health.state == .ready; health.reasons explain why

// "What deserves attention now?" — bucketed, documented points, reasons.
for entry in WorkQueueEngine.rank(registry, now: now) {
    print(entry.projectID, entry.score, entry.reasons)
}

// Fluent queries; archived work excluded by default.
registry.query().blocked()
registry.query().needingDecision()
registry.query().dueSoon(within: 7 * 86_400, now: now)

// Versioned JSON boundary with validation — no silent repair.
let data = try ControlTowerCodec.export(registry)
let imported = try ControlTowerCodec.importPortfolio(from: data)
imported.diagnostics   // structured findings from ConflictDetector
```

A full worked example lives in `SyntheticPortfolio.standard(now:)` — a
deterministic 80-project fictional portfolio with long chains, a deliberate
cycle, gated milestones, superseded decisions and planted-invalid fixtures.

## Design decisions that differ from the original brief

Agreed before implementation:

1. **Stored status is intent-only** (`notStarted / active / dormant /
   completed / cancelled / archived`). Blocked, awaiting-review, stale,
   needs-decision and at-risk are **derived** by `HealthEngine` from
   evidence, so stored state and reality cannot disagree. "Stabilisation"
   is a stage label (`currentStage`), not a status.
2. **The work queue is not a weighted-sum oracle.** Coarse attention
   buckets order first (executable → needs-definition → awaiting-human →
   blocked, with a documented promotion for decisions/reviews that unlock
   downstream work; projects whose next action is missing or vague are
   never presented as ordinary actionable work); documented per-component
   points order within a bucket and double as the display score.
3. **Typed IDs** (`ProjectID`, `MilestoneID`, …) — the compiler rejects a
   milestone ID where a project ID belongs.
4. No `.xcodeproj` is shipped: Xcode opens `Package.swift` natively.

See `ARCHITECTURE.md` for boundaries, the public API summary, integration
guidance and known limitations.
