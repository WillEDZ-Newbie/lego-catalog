# Architecture Note — LifeOSControlTower

## Where this sits in LifeOS

| Layer | Role | Relationship to this package |
|---|---|---|
| Chief (DO) | Execution & next actions | Will consume ready/blocked/review queues and `NextActionAssessment`s |
| Atlas (KNOW) | Knowledge & context | Will add semantic context on top of `ProjectID`s |
| Nexus (ORGANISE) | Files & intake | Will supply `FileReference` associations |
| Machine Oracle / ChatGPT | Architecture & review | Will reason over exported structured state |

The Control Tower is the portfolio/control layer: it knows what exists,
what state it is in, what depends on what, and what deserves attention.
It executes nothing and calls nothing external. **Domain types import
only Foundation** — every future system connects through an adapter that
this package never sees.

## Domain boundaries

```
ProjectRegistry  ── source of truth; ALL mutations route through it and
 │                  append ProjectEvents (append-only timeline)
 ├── Project ─ Milestone / Blocker / ReviewGate / Risk   (embedded value types)
 └── Decision                                            (global register, lineage-linked)

Pure analysis over snapshots (stateless, deterministic):
  DependencyGraph      distinct elementary cycles w/ paths (Tarjan SCC-scoped),
                       impact sets, hubs, depth, chains, blockage explanation
  HealthEngine         evidence-based state, configurable thresholds, injected `now`
  NextActionValidator  missing/vague/blocked/awaitingReview/awaitingDecision/executable
  ConflictDetector     structured Diagnostics (info/warning/error/releaseBlocking)
  ChangeDetector       snapshot diff -> ChangeRecords ("what changed since yesterday?")
  WorkQueueEngine      bucketed, documented-point ranking with reasons
  PortfolioAnalyzer / WorkloadAnalyzer  aggregates & capacity flags
  ControlTowerCodec / SchemaMigrator    versioned JSON boundary + v0→v1 migration
```

Key invariants:

- **Registry is a value type.** `let before = registry` is a snapshot;
  diffing snapshots is what `ChangeDetector` does. No singletons, no
  global mutable state.
- **History cannot rot.** Events are only appended inside registry
  mutations; there is no public event-writing API.
- **Stored status is intent; conditions are derived.** The one deliberate
  exception is `Milestone.state` (kept per the brief), and
  `ConflictDetector` polices its coherence (`awaitingReview` without an
  open gate, `blocked` without evidence).
- **Completion has one door — in both directions.** `setStatus` cannot reach
  `.completed` or `.archived`, and cannot leave them either: reopening
  completed work goes through `reopen`, waking dormant/archived work through
  `reactivate`, each audited with a reactivation event. Override rationales
  must contain actual text; blank rationales are rejected. Same for milestones: `completeMilestone` is the only route to
  `.completed`, enforcing criteria, prerequisites and review gates — and a
  dangling gate reference always fails, never passing as approval.
- **Overrides are events.** Completing a project/milestone past its guards
  requires a rationale and leaves `…Overridden` events that the validator
  respects.
- **Time is injected.** Every time-sensitive evaluation takes `now`;
  `TowerClock`/`FixedClock` exist for callers and tests. No test reads the
  wall clock.
- **No silent repair.** Import returns `ImportResult` with diagnostics;
  invalid state stays visible.

## Public API summary

| Area | Entry points |
|---|---|
| Identity | `Identifier<Marker>` → `ProjectID`, `MilestoneID`, `BlockerID`, `DecisionID`, `RiskID`, `ReviewGateID`, `EventID`, `CriterionID` |
| Core model | `Project`, `ProjectStatus` (+ transition rules), `Priority`, `Owner` (incl. `.tool(name:)`, `.mixed`), `Dependency`, `DependencyKind` (+`isBlocking`), `FileReference`, `Level` |
| Registry | `ProjectRegistry`: `add`, `setStatus`, `completeProject(overrideRationale:)`, `archive`, `reactivate`, `setStage/NextAction/Owner/Priority/Deadline`, `completeAction`, `add/removeDependency`, `addBlocker/resolveBlocker`, `addMilestone/satisfyCriterion/completeMilestone/setMilestoneState`, `openReviewGate/resolveReviewGate`, `addRisk/setRiskStatus`, `recordDecision/supersedeDecision`, `activeDecisions/supersededDecisions/decisionLineage`, `readyMilestones/nextMilestone`, `gatesAwaiting(reviewer:)`, `events(for:)` |
| Graph | `DependencyGraph`: `areBlockingDependenciesSatisfied`, `newlyUnblocked(afterCompleting:)`, `affectedDownstream`, `upstreamImpactSet`, `detectCycles()` (returns paths), `criticalHubs`, `dependencyDepth`, `longestChain`, `explainBlockage` |
| Health | `HealthEngine.assess/assessAll`, `HealthAssessment`, `HealthState`, `HealthReason`, `HealthConfiguration` |
| Actions | `NextActionValidator.validate`, `NextActionAssessment`, `NextActionPolicy` |
| Validation | `ConflictDetector.validate`, `Diagnostic` (+`Code`, `Severity`) |
| Change | `ChangeDetector.diff(before:after:now:)`, `ChangeRecord` |
| Queries | `registry.query(includeArchived:)` → `needingReview/blocked/readyToStart/needingDecision/withPriority/ownedBy/dependingOn/dueSoon/overdue/stale/withOpenRisks/completed/dormant/inStage/inStabilisation` |
| Attention | `WorkQueueEngine.rank`, `WorkQueueEntry`, `WorkQueuePolicy`, `AttentionBucket` |
| Portfolio | `PortfolioAnalyzer.healthSnapshot`, `WorkloadAnalyzer.report`, `WorkloadPolicy` |
| I/O | `ControlTowerCodec.export/importPortfolio`, `PortfolioExport`, `ImportResult`, `CodecError`, `SchemaMigrator`, `ControlTowerSchema.currentVersion` |
| Fixtures | `SyntheticPortfolio.standard(now:size:)`, `SyntheticPortfolio.Fixture.*` |

## Integrating into the LifeOS Xcode workspace

1. Drag the `LifeOSControlTower` folder into the workspace sidebar (or
   **File ▸ Add Package Dependencies… ▸ Add Local…**). Xcode consumes
   `Package.swift` directly; no `.xcodeproj` is needed or shipped.
2. Add `LifeOSControlTower` to the app target's *Frameworks, Libraries,
   and Embedded Content*.
3. `import LifeOSControlTower` — no configuration, no initialisation.
4. Tests appear in the Test navigator automatically; they also run via
   `swift test` in CI.

Adapter seams (later work, in the host app, not here):

- **SwiftData**: persist `PortfolioExport` payloads or mirror domain types
  into `@Model` classes; the codec is the boundary. Store events for audit.
- **Chief**: poll `WorkQueueEngine.rank` and `registry.query()`; render
  `reasons` verbatim — they are written to be shown.
- **Atlas/Nexus**: join on `ProjectID`/`FileReference.identifier`.
- **ChatGPT/Oracle**: feed `ControlTowerCodec.export` output; ingest
  proposed `Decision`s through `recordDecision` after human approval.
- **Shortcuts/Siri**: thin intents over registry mutations.

## Schema & migration

Exports carry `schemaVersion` (currently **1**). Import reads the version
first, runs raw-JSON migration steps forward (`SchemaMigrator.steps`,
one step per version), then decodes and validates. v0 (legacy projects
with no risks/gates/milestones/priority) migrates by filling empty
defaults — never inventing content. Bump `ControlTowerSchema.currentVersion`
and append one step per future change; migrations are pure functions and
unit-tested.

## Known limitations

- **Vagueness detection is structural, not semantic.** The validator
  catches leading vague phrases and too-short actions; adversarial prose
  will slip through. The policy is injectable; treat results as a linter,
  not a judge.
- **Unknown JSON fields are dropped on import** (Swift `Codable`
  behaviour). Forward-compatibility is by version negotiation, not
  field preservation; a round-trip through an older reader loses
  newer optional fields.
- **`Milestone.state` is stored**, so it can drift from evidence; the
  conflict detector flags drift rather than preventing it (deliberate,
  per brief §7).
- **Cross-project milestone prerequisites** resolve by scanning all
  projects for the milestone ID; IDs are assumed globally unique.
- **The event timeline is append-only but not tamper-proof** — an import
  can supply any history. Auditability assumes storage is trusted.
- **`registry.remove` is a hard delete** — audited with a `projectRemoved`
  event and past history survives, but the current-state record is gone;
  prefer `archive` in real flows.
- **Cycle enumeration is capped** (default 64 distinct cycles per call,
  documented parameter) — beyond that the portfolio is structurally broken
  regardless of the exact count.
- No persistence, UI, scheduling or external execution — by design.
