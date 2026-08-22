import Foundation

/// One material difference between two snapshots of the same project.
public enum ChangeRecord: Sendable, Equatable, CustomStringConvertible {
    case projectAdded(ProjectID)
    case projectRemoved(ProjectID)
    case statusChanged(ProjectID, from: ProjectStatus, to: ProjectStatus)
    case priorityChanged(ProjectID, from: Priority, to: Priority)
    case ownerChanged(ProjectID, from: Owner, to: Owner)
    case dependencyAdded(ProjectID, Dependency)
    case dependencyRemoved(ProjectID, Dependency)
    case blockerOpened(ProjectID, BlockerID)
    case blockerResolved(ProjectID, BlockerID)
    case nextActionChanged(ProjectID, from: String?, to: String?)
    case milestoneProgressed(ProjectID, MilestoneID, from: Milestone.State, to: Milestone.State)
    case reviewGateOpened(ProjectID, ReviewGateID)
    case reviewGateResolved(ProjectID, ReviewGateID, outcome: ReviewGate.Resolution.Outcome)
    case decisionAdded(DecisionID)
    case decisionSuperseded(old: DecisionID, new: DecisionID)
    case deadlineChanged(ProjectID, from: Date?, to: Date?)
    case healthChanged(ProjectID, from: HealthState, to: HealthState)

    public var description: String {
        switch self {
        case .projectAdded(let id): return "project '\(id)' added"
        case .projectRemoved(let id): return "project '\(id)' removed"
        case .statusChanged(let id, let f, let t): return "'\(id)' status \(f.rawValue) -> \(t.rawValue)"
        case .priorityChanged(let id, let f, let t): return "'\(id)' priority \(f.rawValue) -> \(t.rawValue)"
        case .ownerChanged(let id, let f, let t): return "'\(id)' owner \(f.label) -> \(t.label)"
        case .dependencyAdded(let id, let d): return "'\(id)' now depends on '\(d.prerequisite)' (\(d.kind.rawValue))"
        case .dependencyRemoved(let id, let d): return "'\(id)' no longer depends on '\(d.prerequisite)' (\(d.kind.rawValue))"
        case .blockerOpened(let id, let b): return "'\(id)' blocker '\(b)' opened"
        case .blockerResolved(let id, let b): return "'\(id)' blocker '\(b)' resolved"
        case .nextActionChanged(let id, let f, let t):
            return "'\(id)' next action '\(f ?? "-")' -> '\(t ?? "-")'"
        case .milestoneProgressed(let id, let m, let f, let t):
            return "'\(id)' milestone '\(m)' \(f.rawValue) -> \(t.rawValue)"
        case .reviewGateOpened(let id, let g): return "'\(id)' review gate '\(g)' opened"
        case .reviewGateResolved(let id, let g, let o): return "'\(id)' review gate '\(g)' \(o.rawValue)"
        case .decisionAdded(let d): return "decision '\(d)' recorded"
        case .decisionSuperseded(let o, let n): return "decision '\(o)' superseded by '\(n)'"
        case .deadlineChanged(let id, _, let t):
            return "'\(id)' deadline changed to \(t.map { "\($0)" } ?? "none")"
        case .healthChanged(let id, let f, let t): return "'\(id)' health \(f.rawValue) -> \(t.rawValue)"
        }
    }
}

/// Compares two registry snapshots ("what changed since yesterday?") and
/// reports material changes as structured records suitable for later
/// Chief-style summaries.
public enum ChangeDetector {
    public static func diff(
        before: ProjectRegistry,
        after: ProjectRegistry,
        now: Date,
        config: HealthConfiguration = .default
    ) -> [ChangeRecord] {
        var records: [ChangeRecord] = []

        let beforeIDs = Set(before.projects.keys)
        let afterIDs = Set(after.projects.keys)
        for id in afterIDs.subtracting(beforeIDs).sorted() { records.append(.projectAdded(id)) }
        for id in beforeIDs.subtracting(afterIDs).sorted() { records.append(.projectRemoved(id)) }

        let beforeHealth = HealthEngine.assessAll(before, now: now, config: config)
        let afterHealth = HealthEngine.assessAll(after, now: now, config: config)

        for id in beforeIDs.intersection(afterIDs).sorted() {
            guard let old = before.project(id), let new = after.project(id) else { continue }
            records += diffProject(old: old, new: new)
            if let oh = beforeHealth[id]?.state, let nh = afterHealth[id]?.state, oh != nh {
                records.append(.healthChanged(id, from: oh, to: nh))
            }
        }

        // Decision-level changes.
        let beforeDecisions = Set(before.decisions.keys)
        for (id, decision) in after.decisions.sorted(by: { $0.key < $1.key }) {
            if !beforeDecisions.contains(id) {
                records.append(.decisionAdded(id))
            }
            if decision.status == .superseded,
               before.decision(id)?.status == .active,
               let by = decision.supersededBy {
                records.append(.decisionSuperseded(old: id, new: by))
            }
        }
        return records
    }

    private static func diffProject(old: Project, new: Project) -> [ChangeRecord] {
        var records: [ChangeRecord] = []
        let id = old.id

        if old.status != new.status {
            records.append(.statusChanged(id, from: old.status, to: new.status))
        }
        if old.priority != new.priority {
            records.append(.priorityChanged(id, from: old.priority, to: new.priority))
        }
        if old.owner != new.owner {
            records.append(.ownerChanged(id, from: old.owner, to: new.owner))
        }
        if old.nextAction != new.nextAction {
            records.append(.nextActionChanged(id, from: old.nextAction, to: new.nextAction))
        }
        if old.deadline != new.deadline {
            records.append(.deadlineChanged(id, from: old.deadline, to: new.deadline))
        }

        let oldDeps = Set(old.dependencies)
        let newDeps = Set(new.dependencies)
        for dep in newDeps.subtracting(oldDeps).sorted(by: { $0.prerequisite < $1.prerequisite }) {
            records.append(.dependencyAdded(id, dep))
        }
        for dep in oldDeps.subtracting(newDeps).sorted(by: { $0.prerequisite < $1.prerequisite }) {
            records.append(.dependencyRemoved(id, dep))
        }

        let oldBlockers = Dictionary(uniqueKeysWithValues: old.blockers.map { ($0.id, $0) })
        for blocker in new.blockers.sorted(by: { $0.id < $1.id }) {
            if let previous = oldBlockers[blocker.id] {
                if !previous.isResolved && blocker.isResolved {
                    records.append(.blockerResolved(id, blocker.id))
                }
            } else if !blocker.isResolved {
                records.append(.blockerOpened(id, blocker.id))
            }
        }

        let oldMilestones = Dictionary(uniqueKeysWithValues: old.milestones.map { ($0.id, $0) })
        for milestone in new.milestones.sorted(by: { $0.id < $1.id }) {
            if let previous = oldMilestones[milestone.id], previous.state != milestone.state {
                records.append(.milestoneProgressed(id, milestone.id, from: previous.state, to: milestone.state))
            }
        }

        let oldGates = Dictionary(uniqueKeysWithValues: old.reviewGates.map { ($0.id, $0) })
        for gate in new.reviewGates.sorted(by: { $0.id < $1.id }) {
            if let previous = oldGates[gate.id] {
                if previous.isOpen, let resolution = gate.resolution {
                    records.append(.reviewGateResolved(id, gate.id, outcome: resolution.outcome))
                }
            } else if gate.isOpen {
                records.append(.reviewGateOpened(id, gate.id))
            }
        }
        return records
    }
}
