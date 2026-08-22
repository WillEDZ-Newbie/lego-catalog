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

## Status

Experimental companion to v1 — built to demonstrate the architecture ceiling.
v1 remains the reviewed, client-facing deliverable.
