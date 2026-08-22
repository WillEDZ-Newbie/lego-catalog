import Foundation

/// The façade. Owns the event log, maintains the folded state, validates
/// every command before it becomes history.
///
/// Guarantees, by construction rather than by detection:
/// - the blocking dependency graph is always acyclic (cycles are rejected);
/// - every ID is unique within its kind;
/// - completion happened either with all guards passing or with an audited
///   `Override` — and which one is written into the event;
/// - resting states (`completed`, `dormant`, `archived`) are exited only via
///   deliberate `reopen`/`reactivate` commands;
/// - `TowerState` equals the fold of `events`, always (`replay` proves it).
public struct Tower: Sendable {
    public private(set) var events: [Event]
    public private(set) var state: TowerState
    private var eventCounter: Int

    public init() {
        events = []
        state = TowerState()
        eventCounter = 0
    }

    /// Rebuilds a tower from a history. The fold is deterministic: same
    /// events, same state, every time.
    public static func replay(_ events: [Event]) -> Tower {
        var tower = Tower()
        for event in events {
            tower.state.apply(event)
        }
        tower.events = events
        var highest = events.count
        for e in events where e.id.rawValue.hasPrefix("evt-") {
            if let n = Int(e.id.rawValue.dropFirst(4)) { highest = max(highest, n) }
        }
        tower.eventCounter = highest
        return tower
    }

    /// The portfolio as it was at a past instant (world time).
    public func state(asOf date: Date) -> TowerState {
        var s = TowerState()
        for event in events where event.effectiveAt <= date { s.apply(event) }
        return s
    }

    /// The portfolio as it was *known* at a past instant (system time).
    public func state(recordedBy date: Date) -> TowerState {
        var s = TowerState()
        for event in events where event.recordedAt <= date { s.apply(event) }
        return s
    }

    /// "What changed since…" is a slice of history, not a diff algorithm.
    public func changes(since date: Date) -> [Event] {
        events.filter { $0.recordedAt > date }
    }

    // MARK: - Execution

    /// Validates a command against current state; on success appends the
    /// resulting events and folds them in. `effectiveAt` defaults to `at`
    /// (pass an earlier date to backfill a fact learned late).
    @discardableResult
    public mutating func execute(
        _ command: Command, at recordedAt: Date, effectiveAt: Date? = nil
    ) throws -> [Event] {
        let effective = effectiveAt ?? recordedAt
        let payloads = try handle(command, effectiveAt: effective)
        var produced: [Event] = []
        for payload in payloads {
            eventCounter += 1
            let event = Event(id: EventID("evt-\(eventCounter)"),
                              recordedAt: recordedAt, effectiveAt: effective,
                              payload: payload)
            events.append(event)
            state.apply(event)
            produced.append(event)
        }
        return produced
    }

    // MARK: - Command handlers (pure validation -> payloads)

    private func handle(_ command: Command, effectiveAt: Date) throws -> [Event.Payload] {
        switch command {
        case .createProject(let seed):
            guard state.project(seed.id) == nil else { throw Rejection.duplicateProject(seed.id) }
            return [.projectCreated(seed)]

        case .start(let id):
            let p = try require(id)
            try edge(p, to: .active, allowedFrom: [.notStarted])
            return [.lifecycleChanged(id, from: p.lifecycle, to: .active, cause: .requested)]

        case .pause(let id):
            let p = try require(id)
            try edge(p, to: .dormant, allowedFrom: [.active])
            return [.lifecycleChanged(id, from: p.lifecycle, to: .dormant, cause: .requested)]

        case .cancel(let id):
            let p = try require(id)
            try edge(p, to: .cancelled, allowedFrom: [.notStarted, .active, .dormant])
            return [.lifecycleChanged(id, from: p.lifecycle, to: .cancelled, cause: .requested)]

        case .archive(let id):
            let p = try require(id)
            try edge(p, to: .archived, allowedFrom: [.notStarted, .active, .dormant, .completed, .cancelled])
            return [.lifecycleChanged(id, from: p.lifecycle, to: .archived, cause: .requested)]

        case .complete(let id, let override):
            let p = try require(id)
            try edge(p, to: .completed, allowedFrom: [.active])
            let obstacles = completionObstacles(of: p)
            if obstacles.isEmpty {
                return [.lifecycleChanged(id, from: p.lifecycle, to: .completed, cause: .completionProven)]
            }
            guard let override else { throw Rejection.completionBlocked(by: obstacles) }
            return [.lifecycleChanged(id, from: p.lifecycle, to: .completed,
                                      cause: .completionOverridden(override))]

        case .reopen(let id):
            let p = try require(id)
            guard p.lifecycle == .completed else { throw Rejection.notCompleted(id) }
            return [.lifecycleChanged(id, from: .completed, to: .active, cause: .reopened)]

        case .reactivate(let id):
            let p = try require(id)
            guard p.lifecycle == .dormant || p.lifecycle == .archived else {
                throw Rejection.notResting(id)
            }
            return [.lifecycleChanged(id, from: p.lifecycle, to: .active, cause: .reactivated)]

        case .setStage(let id, let stage):
            let p = try require(id)
            return p.stage == stage ? [] : [.stageChanged(id, to: stage)]

        case .setNextAction(let id, let action):
            let p = try require(id)
            return p.nextAction == action ? [] : [.nextActionChanged(id, to: action)]

        case .completeAction(let id, let action):
            _ = try require(id)
            return [.actionCompleted(id, action: action)]

        case .setPriority(let id, let priority):
            let p = try require(id)
            return p.priority == priority ? [] : [.priorityChanged(id, to: priority)]

        case .setOwner(let id, let owner):
            let p = try require(id)
            return p.owner == owner ? [] : [.ownerChanged(id, to: owner)]

        case .setDeadline(let id, let deadline):
            let p = try require(id)
            return p.deadline == deadline ? [] : [.deadlineChanged(id, to: deadline)]

        case .addDependency(let id, let target, let kind):
            let p = try require(id)
            guard id != target else { throw Rejection.dependencyOnSelf(id) }
            guard state.project(target) != nil else { throw Rejection.dependencyTargetMissing(target) }
            let dep = Dependency(on: target, kind: kind)
            guard !p.dependencies.contains(dep) else {
                throw Rejection.duplicateEntity("dependency \(id) -> \(target) (\(kind.rawValue))")
            }
            if kind.isBlocking,
               let path = Graph(state).blockingPath(from: id, to: target) {
                // target already (transitively) depends on id: adding id -> target closes a loop
                throw Rejection.wouldCreateCycle(path: path + [id])
            }
            return [.dependencyAdded(id, dep)]

        case .removeDependency(let id, let target):
            let p = try require(id)
            let matching = p.dependencies.filter { $0.prerequisite == target }
            return matching.map { .dependencyRemoved(id, $0) }

        case .openBlocker(let id, let blocker):
            let p = try require(id)
            guard !p.blockers.contains(where: { $0.id == blocker.id }) else {
                throw Rejection.duplicateEntity("blocker \(blocker.id)")
            }
            return [.blockerOpened(id, blocker)]

        case .resolveBlocker(let id, let blockerID, let resolution):
            let p = try require(id)
            guard let blocker = p.blockers.first(where: { $0.id == blockerID }) else {
                throw Rejection.unknownBlocker(blockerID)
            }
            guard blocker.isOpen else { throw Rejection.blockerAlreadyResolved(blockerID) }
            return [.blockerResolved(id, blockerID, resolution: resolution)]

        case .addMilestone(let id, let milestone):
            _ = try require(id)
            // milestone ids are globally unique (cross-project prerequisites resolve by id)
            guard !state.projects.values.contains(where: { $0.milestone(milestone.id) != nil }) else {
                throw Rejection.duplicateEntity("milestone \(milestone.id)")
            }
            if let gateID = milestone.gateID {
                guard state.project(id)?.gate(gateID) != nil else { throw Rejection.unknownGate(gateID) }
            }
            for prereq in milestone.prerequisiteProjects where state.project(prereq) == nil {
                throw Rejection.dependencyTargetMissing(prereq)
            }
            return [.milestoneAdded(id, milestone)]

        case .satisfyCriterion(let id, let mid, let cid):
            let p = try require(id)
            guard let m = p.milestone(mid) else { throw Rejection.unknownMilestone(mid) }
            guard m.criteria.contains(where: { $0.id == cid }) else {
                throw Rejection.unknownCriterion(cid)
            }
            return [.criterionSatisfied(id, mid, cid)]

        case .completeMilestone(let id, let mid, let override):
            let p = try require(id)
            guard let m = p.milestone(mid) else { throw Rejection.unknownMilestone(mid) }
            guard !m.isComplete else { throw Rejection.milestoneAlreadyComplete(mid) }
            var obstacles: [Obstacle] = m.unsatisfiedRequiredCriteria.map {
                .unsatisfiedCriterion($0.id, of: mid)
            }
            if let gateID = m.gateID {
                // the gate is known to exist (checked at addMilestone)
                if p.gate(gateID)?.isApproved != true { obstacles.append(.unapprovedGate(gateID)) }
            }
            for prereq in m.prerequisiteProjects
            where state.project(prereq)?.lifecycle != .completed {
                obstacles.append(.unsatisfiedPrerequisite(prereq))
            }
            if obstacles.isEmpty {
                return [.milestoneCompleted(id, mid, override: nil)]
            }
            guard let override else { throw Rejection.completionBlocked(by: obstacles) }
            return [.milestoneCompleted(id, mid, override: override)]

        case .openGate(let id, let gate):
            let p = try require(id)
            guard !p.gates.contains(where: { $0.id == gate.id }) else {
                throw Rejection.duplicateEntity("gate \(gate.id)")
            }
            return [.gateOpened(id, gate)]

        case .resolveGate(let id, let gateID, let outcome, let rationale):
            let p = try require(id)
            guard let gate = p.gate(gateID) else { throw Rejection.unknownGate(gateID) }
            guard gate.isOpen else { throw Rejection.gateAlreadyResolved(gateID) }
            return [.gateResolved(id, gateID, Gate.Verdict(
                outcome: outcome, rationale: rationale, at: effectiveAt))]

        case .addRisk(let id, let risk):
            let p = try require(id)
            guard !p.risks.contains(where: { $0.id == risk.id }) else {
                throw Rejection.duplicateEntity("risk \(risk.id)")
            }
            return [.riskAdded(id, risk)]

        case .setRiskStatus(let id, let riskID, let status):
            let p = try require(id)
            guard p.risks.contains(where: { $0.id == riskID }) else {
                throw Rejection.unknownRisk(riskID)
            }
            return [.riskStatusChanged(id, riskID, to: status)]

        case .addFileReference(let id, let ref):
            _ = try require(id)
            return [.fileReferenceAdded(id, reference: ref)]

        case .recordDecision(let decision):
            guard state.decisions[decision.id] == nil else {
                throw Rejection.decisionIDReused(decision.id)
            }
            var clean = decision
            clean.supersedes = nil
            clean.supersededBy = nil
            return [.decisionRecorded(clean)]

        case .supersedeDecision(let oldID, let new):
            guard let old = state.decisions[oldID] else { throw Rejection.unknownDecision(oldID) }
            guard old.isActive else { throw Rejection.decisionNotActive(oldID) }
            guard new.id != oldID, state.decisions[new.id] == nil else {
                throw Rejection.decisionIDReused(new.id)
            }
            return [.decisionSuperseded(old: oldID, new: new)]
        }
    }

    // MARK: - Completion readiness

    /// Everything currently standing between a project and legal completion.
    /// Empty means `complete` will succeed without an override.
    public func completionObstacles(of project: ProjectSnapshot) -> [Obstacle] {
        var obstacles: [Obstacle] = project.openBlockers.map { .openBlocker($0.id) }
        obstacles += project.incompleteRequiredMilestones.map { .incompleteMilestone($0.id) }
        let graph = Graph(state)
        obstacles += graph.unsatisfiedBlockingPrerequisites(of: project.id)
            .map { .unsatisfiedPrerequisite($0) }
        return obstacles
    }

    // MARK: - Helpers

    private func require(_ id: ProjectID) throws -> ProjectSnapshot {
        guard let p = state.project(id) else { throw Rejection.unknownProject(id) }
        return p
    }

    private func edge(_ p: ProjectSnapshot, to target: Lifecycle,
                      allowedFrom: Set<Lifecycle>) throws {
        guard allowedFrom.contains(p.lifecycle) else {
            throw Rejection.illegalTransition(from: p.lifecycle, to: target)
        }
    }
}

// MARK: - Export / import

/// The export *is* the history. State never travels — it is recomputed by
/// replay, so an export cannot smuggle in a state that history doesn't support.
public struct TowerExport: Codable, Sendable {
    public static let currentSchemaVersion = 1
    public var schemaVersion: Int
    public var events: [Event]
    public init(events: [Event]) {
        self.schemaVersion = Self.currentSchemaVersion
        self.events = events
    }
}

public enum TowerCodecError: Error, Equatable, Sendable {
    case malformed(String)
    case unsupportedSchemaVersion(Int)
}

extension Tower {
    public func export() throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(TowerExport(events: events))
    }

    public static func imported(from data: Data) throws -> Tower {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let export: TowerExport
        do { export = try decoder.decode(TowerExport.self, from: data) }
        catch { throw TowerCodecError.malformed(String(describing: error)) }
        guard export.schemaVersion == TowerExport.currentSchemaVersion else {
            throw TowerCodecError.unsupportedSchemaVersion(export.schemaVersion)
        }
        return Tower.replay(export.events)
    }
}
