import Foundation

/// A violation found while validating an imported history. Each names the
/// offending event and the invariant it breaks — imports fail loudly and
/// precisely, never by silently repairing.
public struct HistoryViolation: Equatable, Sendable, CustomStringConvertible {
    public var eventID: EventID
    public var detail: String
    public var description: String { "\(eventID): \(detail)" }
}

public enum ImportError: Error, Sendable, CustomStringConvertible {
    case invalidHistory([HistoryViolation])
    public var description: String {
        guard case .invalidHistory(let v) = self else { return "invalid history" }
        return "invalid history (\(v.count) violation(s)): "
            + v.prefix(5).map(\.description).joined(separator: "; ")
    }
}

extension Tower {
    /// Guarded replay: folds a history while re-checking every identity,
    /// reference and structural invariant against the accumulating state —
    /// the import-side mirror of `execute`'s command guards (LifeOS
    /// boundaries §3.1 invariant 8, §3.2 "Imports").
    ///
    /// Cycle handling honours invariant 9 by prevention: the first event
    /// that would close a blocking cycle is rejected *with its exact path*,
    /// so distinct cycles can never accumulate, let alone be collapsed.
    public static func validated(_ events: [Event]) throws -> Tower {
        var tower = Tower()
        var violations: [HistoryViolation] = []
        var seenEventIDs = Set<EventID>()

        func flag(_ e: Event, _ detail: String) {
            violations.append(HistoryViolation(eventID: e.id, detail: detail))
        }

        for event in events {
            if !seenEventIDs.insert(event.id).inserted {
                flag(event, "duplicate event id")
                continue
            }
            let state = tower.state
            var ok = true
            switch event.payload {
            case .projectCreated(let seed):
                if state.project(seed.id) != nil { flag(event, "duplicate project id '\(seed.id)'"); ok = false }
            case .decisionRecorded(let d):
                if state.decisions[d.id] != nil { flag(event, "duplicate decision id '\(d.id)'"); ok = false }
            case .decisionSuperseded(let oldID, let new):
                guard let old = state.decisions[oldID] else {
                    flag(event, "supersedes unknown decision '\(oldID)'"); ok = false; break
                }
                if !old.isActive { flag(event, "supersedes non-active decision '\(oldID)'"); ok = false }
                if new.id == oldID || state.decisions[new.id] != nil {
                    flag(event, "reused decision id '\(new.id)'"); ok = false
                }
            case .dependencyAdded(let id, let dep):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if dep.prerequisite == id { flag(event, "self-dependency on '\(id)'"); ok = false }
                else if state.project(dep.prerequisite) == nil {
                    flag(event, "dependency target '\(dep.prerequisite)' does not exist"); ok = false
                } else if state.project(id)!.dependencies.contains(dep) {
                    flag(event, "duplicate dependency \(id) -> \(dep.prerequisite)"); ok = false
                } else if dep.kind.isBlocking,
                          let path = Graph(state).blockingPath(from: id, to: dep.prerequisite) {
                    let cycle = (path + [id]).map(\.rawValue).joined(separator: " -> ")
                    flag(event, "closes blocking cycle: \(cycle)"); ok = false
                }
            case .blockerOpened(let id, let b):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if state.project(id)!.blockers.contains(where: { $0.id == b.id }) {
                    flag(event, "duplicate blocker id '\(b.id)'"); ok = false
                }
            case .milestoneAdded(let id, let m):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if state.projects.values.contains(where: { $0.milestone(m.id) != nil }) {
                    flag(event, "duplicate milestone id '\(m.id)'"); ok = false
                }
                if let gateID = m.gateID, state.project(id)!.gate(gateID) == nil {
                    flag(event, "milestone references missing gate '\(gateID)'"); ok = false
                }
                for prereq in m.prerequisiteProjects where state.project(prereq) == nil {
                    flag(event, "milestone prerequisite '\(prereq)' does not exist"); ok = false
                }
            case .gateOpened(let id, let g):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if state.project(id)!.gates.contains(where: { $0.id == g.id }) {
                    flag(event, "duplicate gate id '\(g.id)'"); ok = false
                }
            case .riskAdded(let id, let r):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if state.project(id)!.risks.contains(where: { $0.id == r.id }) {
                    flag(event, "duplicate risk id '\(r.id)'"); ok = false
                }
            case .blockerResolved(let id, let bid, _):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if state.project(id)!.blockers.first(where: { $0.id == bid }) == nil {
                    flag(event, "resolves unknown blocker '\(bid)'"); ok = false
                }
            case .gateResolved(let id, let gid, _):
                guard requireProject(id, state, event, &violations) else { ok = false; break }
                if state.project(id)!.gate(gid) == nil {
                    flag(event, "resolves unknown gate '\(gid)'"); ok = false
                }
            case .lifecycleChanged(let id, _, _, _), .stageChanged(let id, _),
                 .nextActionChanged(let id, _), .actionCompleted(let id, _),
                 .priorityChanged(let id, _), .ownerChanged(let id, _),
                 .deadlineChanged(let id, _), .dependencyRemoved(let id, _),
                 .criterionSatisfied(let id, _, _), .milestoneCompleted(let id, _, _),
                 .riskStatusChanged(let id, _, _), .fileReferenceAdded(let id, _):
                if state.project(id) == nil {
                    flag(event, "references unknown project '\(id)'"); ok = false
                }
            }
            if ok { tower = appending(tower, event) }
        }
        guard violations.isEmpty else { throw ImportError.invalidHistory(violations) }
        return tower
    }

    private static func requireProject(
        _ id: ProjectID, _ state: TowerState, _ e: Event,
        _ violations: inout [HistoryViolation]
    ) -> Bool {
        if state.project(id) == nil {
            violations.append(HistoryViolation(eventID: e.id, detail: "references unknown project '\(id)'"))
            return false
        }
        return true
    }

    private static func appending(_ tower: Tower, _ event: Event) -> Tower {
        var t = tower
        t = Tower.replay(t.events + [event])
        return t
    }
}
