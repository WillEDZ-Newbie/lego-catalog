import Foundation

/// Pure snapshot of the portfolio: the fold of the event log. `apply` is
/// total over events produced by `Tower.execute` — it never validates,
/// because validation happened before the event existed.
public struct TowerState: Codable, Hashable, Sendable {
    public private(set) var projects: [ProjectID: ProjectSnapshot]
    public private(set) var decisions: [DecisionID: Decision]

    public init() {
        projects = [:]
        decisions = [:]
    }

    public func project(_ id: ProjectID) -> ProjectSnapshot? { projects[id] }
    public var allProjects: [ProjectSnapshot] { projects.values.sorted { $0.id < $1.id } }

    mutating func apply(_ event: Event) {
        let at = event.effectiveAt
        switch event.payload {
        case .projectCreated(let seed):
            projects[seed.id] = ProjectSnapshot(
                id: seed.id, name: seed.name, purpose: seed.purpose,
                lifecycle: .notStarted, stage: seed.stage, priority: seed.priority,
                owner: seed.owner, nextAction: seed.nextAction, lastAction: nil,
                deadline: seed.deadline, dependencies: [], blockers: [],
                milestones: [], gates: [], risks: [], fileReferences: [],
                createdAt: at, updatedAt: at)
        case .lifecycleChanged(let id, _, let to, _):
            touch(id, at) { $0.lifecycle = to }
        case .stageChanged(let id, let stage):
            touch(id, at) { $0.stage = stage }
        case .nextActionChanged(let id, let action):
            touch(id, at) { $0.nextAction = action }
        case .actionCompleted(let id, let action):
            touch(id, at) {
                $0.lastAction = action.text
                if $0.nextAction == action.text { $0.nextAction = nil }
            }
        case .priorityChanged(let id, let p):
            touch(id, at) { $0.priority = p }
        case .ownerChanged(let id, let o):
            touch(id, at) { $0.owner = o }
        case .deadlineChanged(let id, let d):
            touch(id, at) { $0.deadline = d }
        case .dependencyAdded(let id, let dep):
            touch(id, at) { $0.dependencies.append(dep) }
        case .dependencyRemoved(let id, let dep):
            touch(id, at) { $0.dependencies.removeAll { $0 == dep } }
        case .blockerOpened(let id, let blocker):
            touch(id, at) { $0.blockers.append(blocker) }
        case .blockerResolved(let id, let blockerID, let resolution):
            touch(id, at) { p in
                guard let i = p.blockers.firstIndex(where: { $0.id == blockerID }) else { return }
                p.blockers[i].resolvedAt = at
                p.blockers[i].resolution = resolution
            }
        case .milestoneAdded(let id, let milestone):
            touch(id, at) { $0.milestones.append(milestone) }
        case .criterionSatisfied(let id, let mid, let cid):
            touch(id, at) { p in
                guard let m = p.milestones.firstIndex(where: { $0.id == mid }),
                      let c = p.milestones[m].criteria.firstIndex(where: { $0.id == cid })
                else { return }
                p.milestones[m].criteria[c].satisfiedAt = at
            }
        case .milestoneCompleted(let id, let mid, _):
            touch(id, at) { p in
                guard let m = p.milestones.firstIndex(where: { $0.id == mid }) else { return }
                p.milestones[m].completedAt = at
            }
        case .gateOpened(let id, let gate):
            touch(id, at) { $0.gates.append(gate) }
        case .gateResolved(let id, let gateID, let verdict):
            touch(id, at) { p in
                guard let i = p.gates.firstIndex(where: { $0.id == gateID }) else { return }
                p.gates[i].verdict = verdict
            }
        case .riskAdded(let id, let risk):
            touch(id, at) { $0.risks.append(risk) }
        case .riskStatusChanged(let id, let riskID, let status):
            touch(id, at) { p in
                guard let i = p.risks.firstIndex(where: { $0.id == riskID }) else { return }
                p.risks[i].status = status
            }
        case .fileReferenceAdded(let id, let ref):
            touch(id, at) { $0.fileReferences.append(ref.text) }
        case .decisionRecorded(let decision):
            decisions[decision.id] = decision
        case .decisionSuperseded(let oldID, let new):
            decisions[oldID]?.supersededBy = new.id
            var linked = new
            linked.supersedes = oldID
            decisions[linked.id] = linked
        }
    }

    private mutating func touch(_ id: ProjectID, _ at: Date,
                                _ body: (inout ProjectSnapshot) -> Void) {
        guard var p = projects[id] else { return }
        body(&p)
        p.updatedAt = at
        projects[id] = p
    }
}
