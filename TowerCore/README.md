# TowerCore

The event-sourced cut of the LifeOS Control Tower engine — same domain, built
on the architecture I'd choose without constraints. Sits beside
`LifeOSControlTower` (v1) for comparison; nothing depends on it yet.

## What's different from v1

| | v1 (`LifeOSControlTower`) | TowerCore |
|---|---|---|
| Truth | current state, events emitted alongside | **events are the truth; state is a fold** (`Tower.replay` proves it) |
| Invalid state | detected by `ConflictDetector` after the fact | **rejected at the door** — blocking cycles, duplicate IDs, blank rationales and guard bypasses cannot enter history |
| Blank override rationale | runtime check | **unrepresentable** — `Override` requires `NonEmptyText`, which cannot be constructed blank |
| Completion audit | override event alongside status change | the lifecycle event itself carries its cause: `completionProven` or `completionOverridden(rationale)` |
| Reasons | strings | **typed `Evidence` values**; English is rendered at the edge |
| Diff / "what changed" | snapshot diff algorithm | **a slice of history**: `changes(since:)` |
| Time | one timestamp | **bitemporal**: `state(asOf:)` (world time) vs `state(recordedBy:)` (what we knew) — backfilled facts answer both honestly |
| Export | state + events, migrations | **the export is the history**; import = replay, so an export can't smuggle in a state history doesn't support |
| API | six engine entry points | **one façade**: `tower.assess(at:)` returns health, action quality, attention queue and aggregates, mutually consistent |
| Tests | 121 example-based | 18 example-based **+ 8 property invariants**, each checked across 1,800 randomized command steps with reproducible seeds |

## Build & test

```sh
swift build && swift test   # 26 tests; properties report their seed on failure
```

## Shape

```
Command --execute--> [validate against state] --accepted--> [Event] --fold--> TowerState
                                    \-- rejected --> Rejection (typed, precise)
tower.assess(at:)  -> PortfolioAssessment (typed Evidence throughout)
tower.changes(since:) / state(asOf:) / state(recordedBy:)  -> history queries
```

The property suite (`PropertyTests.swift`) is the spec: replay identity,
export/import identity, log integrity, permanent acyclicity, completion
proven-or-audited, deliberate resting-state exits, sound and explained
attention ranking, time-travel convergence.

## Alignment with the LifeOS boundaries brief

Checked against the canonical "Full System Explanation and Claude Boundaries"
document, §3.1 required invariants:

| # | Invariant | TowerCore |
|---|---|---|
| 1–2 | Completion only via dedicated operations | ✅ stronger: no generic setters exist at all |
| 3 | Completion rejects open blockers/milestones without audited override | ✅ and the override rationale is `NonEmptyText` — blank is unconstructible |
| 4 | Milestone completion enforces criteria, prerequisites, gates | ✅ |
| 5 | Missing referenced gate ≠ approval | ✅ stronger: a dangling gate reference cannot be created |
| 6 | Unique IDs; decision IDs never reused | ✅ |
| 7 | Append-only history with audit events on every transition | ✅ the audit **is** the history; completion events carry their proof |
| 8 | Import validates identities/references/invariants | ✅ guarded replay (`Tower.validated`) rejects tampered histories with precise violations |
| 9 | Distinct cycles never collapsed | ✅ by prevention: the first cycle-closing event is rejected with its exact path, on `execute` and on import alike |
| 10 | Missing/vague next actions → needs-definition | ✅ |

§3.2 command/query separation holds structurally (commands = `execute`,
queries = value-type projections). A **compatibility façade** (`Compat.swift`)
mirrors the approved core's call shape — `createProject`, `completeProject(_:at:overrideRationale:)`,
`completeMilestone`, `archive`, `reopen`, `reactivate` — including v1's
blank-rationale rejection, so call sites written for v1 map one-to-one.

## Status

Experimental companion to the approved core, aligned with the boundaries
brief and offered as an **architecture decision proposal** — adopting it is a
decision for the owner and reviewer, not a default. The approved v1 core
remains the client-facing deliverable.
