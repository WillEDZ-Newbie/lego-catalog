import Foundation

/// The portfolio's source of truth. All mutations route through the registry
/// so that every material change appends a timeline event — this invariant is
/// what keeps history trustworthy.
///
/// A value type: `let before = registry` takes a snapshot; `ChangeDetector`
/// diffs two snapshots.
public struct ProjectRegistry: Codable, Sendable, Equatable {
    public private(set) var projects: [ProjectID: Project]
    /// Global decision register (decisions may span projects).
    public private(set) var decisions: [DecisionID: Decision]
    /// Append-only event timeline across the whole portfolio.
    public private(set) var events: [ProjectEvent]

    private var eventCounter: Int

    public init() {
        self.projects = [:]
        self.decisions = [:]
        self.events = []
        self.eventCounter = 0
    }

    // MARK: - Lookup

    public func project(_ id: ProjectID) -> Project? { projects[id] }

    public func requireProject(_ id: ProjectID) throws -> Project {
        guard let p = projects[id] else { throw RegistryError.unknownProject(id) }
        return p
    }

    public var allProjects: [Project] {
        projects.values.sorted { $0.id < $1.id }
    }

    public func contains(_ id: ProjectID) -> Bool { projects[id] != nil }

    public func events(for id: ProjectID) -> [ProjectEvent] {
        events.filter { $0.projectID == id }
    }

    public func decision(_ id: DecisionID) -> Decision? { decisions[id] }

    // MARK: - Event emission

    private mutating func emit(_ kind: ProjectEvent.Kind, project id: ProjectID, at date: Date) {
        eventCounter += 1
        events.append(ProjectEvent(
            id: EventID("evt-\(eventCounter)"),
            projectID: id,
            timestamp: date,
            kind: kind
        ))
    }

    /// Applies a mutation to a project, bumps `updatedAt`, and emits events.
    private mutating func mutate(
        _ id: ProjectID,
        at date: Date,
        _ body: (inout Project) throws -> [ProjectEvent.Kind]
    ) throws {
        guard var p = projects[id] else { throw RegistryError.unknownProject(id) }
        let kinds = try body(&p)
        p.updatedAt = date
        projects[id] = p
        for kind in kinds { emit(kind, project: id, at: date) }
    }

    // MARK: - Project lifecycle

    /// Adds a new project. The project's dependencies may reference projects
    /// added later; referential integrity is checked by `ConflictDetector`
    /// and by `addDependency`, which validates eagerly.
    public mutating func add(_ project: Project, at date: Date) throws {
        guard projects[project.id] == nil else {
            throw RegistryError.duplicateProjectID(project.id)
        }
        projects[project.id] = project
        emit(.projectCreated, project: project.id, at: date)
    }

    /// Inserts a project without validation or events. Internal — used only
    /// to build deliberately inconsistent fixtures for validator tests.
    internal mutating func insertUnchecked(_ project: Project) {
        projects[project.id] = project
    }

    /// Restores a decision verbatim (import path only; no events emitted).
    internal mutating func restoreDecisionUnchecked(_ decision: Decision) {
        decisions[decision.id] = decision
    }

    /// Restores an event timeline verbatim (import path only). The counter
    /// resumes past the highest `evt-N` id present, so future events never
    /// collide with imported ones even when ids are gapped or reordered.
    internal mutating func restoreEventsUnchecked(_ list: [ProjectEvent]) {
        events = list
        var highest = list.count
        for event in list where event.id.rawValue.hasPrefix("evt-") {
            if let n = Int(event.id.rawValue.dropFirst(4)) {
                highest = max(highest, n)
            }
        }
        eventCounter = highest
    }

    /// Hard removal. Prefer `archive` in real flows: removal keeps the
    /// project's past events and appends an explicit `projectRemoved` audit
    /// event, but the current-state record is gone.
    public mutating func remove(_ id: ProjectID, at date: Date) throws {
        guard projects[id] != nil else { throw RegistryError.unknownProject(id) }
        emit(.projectRemoved, project: id, at: date)
        projects[id] = nil
    }

    /// Sets the lifecycle status. Completion and archival are deliberately
    /// NOT reachable here: their guards and audit events live in
    /// `completeProject` and `archive`, the only doors to those states.
    public mutating func setStatus(_ id: ProjectID, to target: ProjectStatus, at date: Date) throws {
        switch target {
        case .completed: throw RegistryError.completionViaSetStatus(id)
        case .archived: throw RegistryError.archivalViaSetStatus(id)
        default: try applyStatus(id, to: target, at: date)
        }
    }

    /// Shared transition core used by setStatus/completeProject/archive.
    private mutating func applyStatus(_ id: ProjectID, to target: ProjectStatus, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.status.canTransition(to: target) else {
                throw RegistryError.invalidStatusTransition(from: p.status, to: target)
            }
            var kinds: [ProjectEvent.Kind] = [.statusChanged(from: p.status, to: target)]
            if target == .archived { kinds.append(.projectArchived) }
            if p.status == .archived && target == .active { kinds.append(.projectReactivated) }
            p.status = target
            return kinds
        }
    }

    /// Completes a project, enforcing required milestones and open blocking
    /// blockers unless a deliberate override (with rationale) is supplied.
    public mutating func completeProject(
        _ id: ProjectID,
        at date: Date,
        overrideRationale: String? = nil
    ) throws {
        try mutate(id, at: date) { p in
            guard p.status.canTransition(to: .completed) else {
                throw RegistryError.invalidStatusTransition(from: p.status, to: .completed)
            }
            let incomplete = p.incompleteRequiredMilestones
            let openBlockers = p.openBlockers
            var kinds: [ProjectEvent.Kind] = []
            if !incomplete.isEmpty && overrideRationale == nil {
                throw RegistryError.incompleteRequiredMilestones(id, milestones: incomplete.map(\.id))
            }
            if !openBlockers.isEmpty && overrideRationale == nil {
                throw RegistryError.unresolvedBlockers(id, blockers: openBlockers.map(\.id))
            }
            if !incomplete.isEmpty || !openBlockers.isEmpty, let rationale = overrideRationale {
                kinds.append(.projectCompletionOverridden(rationale: rationale))
            }
            kinds.append(.statusChanged(from: p.status, to: .completed))
            p.status = .completed
            return kinds
        }
    }

    /// Archives a project (from any archivable status) preserving all history.
    /// The only route to `.archived`.
    public mutating func archive(_ id: ProjectID, at date: Date) throws {
        try applyStatus(id, to: .archived, at: date)
    }

    /// Explicitly reactivates archived or dormant work.
    public mutating func reactivate(_ id: ProjectID, at date: Date) throws {
        let p = try requireProject(id)
        guard p.status == .archived || p.status == .dormant else {
            throw RegistryError.projectNotArchivedOrDormant(id)
        }
        try applyStatus(id, to: .active, at: date)
    }

    // MARK: - Simple field mutations

    public mutating func setStage(_ id: ProjectID, to stage: String, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.currentStage != stage else { return [] }
            let old = p.currentStage
            p.currentStage = stage
            return [.stageChanged(from: old, to: stage)]
        }
    }

    /// Records a completed action and clears the next action if it matches.
    public mutating func completeAction(_ id: ProjectID, action: String, at date: Date) throws {
        try mutate(id, at: date) { p in
            p.lastAction = action
            var kinds: [ProjectEvent.Kind] = [.actionCompleted(action: action)]
            if p.nextAction == action {
                kinds.append(.nextActionChanged(from: p.nextAction, to: nil))
                p.nextAction = nil
            }
            return kinds
        }
    }

    public mutating func setNextAction(_ id: ProjectID, to action: String?, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.nextAction != action else { return [] }
            let old = p.nextAction
            p.nextAction = action
            return [.nextActionChanged(from: old, to: action)]
        }
    }

    public mutating func setOwner(_ id: ProjectID, to owner: Owner, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.owner != owner else { return [] }
            let old = p.owner
            p.owner = owner
            return [.ownerChanged(from: old, to: owner)]
        }
    }

    public mutating func setPriority(_ id: ProjectID, to priority: Priority, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.priority != priority else { return [] }
            let old = p.priority
            p.priority = priority
            return [.priorityChanged(from: old, to: priority)]
        }
    }

    public mutating func setDeadline(_ id: ProjectID, to deadline: Date?, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.deadline != deadline else { return [] }
            let old = p.deadline
            p.deadline = deadline
            return [.deadlineChanged(from: old, to: deadline)]
        }
    }

    // MARK: - Dependencies

    public mutating func addDependency(
        _ id: ProjectID,
        on prerequisite: ProjectID,
        kind: DependencyKind = .blocks,
        at date: Date
    ) throws {
        guard id != prerequisite else { throw RegistryError.dependencyOnSelf(id) }
        guard projects[prerequisite] != nil else {
            throw RegistryError.dependencyTargetMissing(prerequisite)
        }
        try mutate(id, at: date) { p in
            let dep = Dependency(on: prerequisite, kind: kind)
            guard !p.dependencies.contains(where: { $0.prerequisite == prerequisite && $0.kind == kind }) else {
                throw RegistryError.duplicateDependency(id, on: prerequisite)
            }
            p.dependencies.append(dep)
            return [.dependencyAdded(dep)]
        }
    }

    public mutating func removeDependency(
        _ id: ProjectID,
        on prerequisite: ProjectID,
        kind: DependencyKind? = nil,
        at date: Date
    ) throws {
        try mutate(id, at: date) { p in
            let removed = p.dependencies.filter {
                $0.prerequisite == prerequisite && (kind == nil || $0.kind == kind)
            }
            p.dependencies.removeAll {
                $0.prerequisite == prerequisite && (kind == nil || $0.kind == kind)
            }
            return removed.map { .dependencyRemoved($0) }
        }
    }

    // MARK: - Blockers

    public mutating func addBlocker(_ id: ProjectID, _ blocker: Blocker, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.blocker(blocker.id) == nil else {
                throw RegistryError.duplicateBlockerID(blocker.id)
            }
            p.blockers.append(blocker)
            return [.blockerAdded(blocker.id)]
        }
    }

    public mutating func resolveBlocker(
        _ id: ProjectID,
        _ blockerID: BlockerID,
        resolution: Blocker.Resolution,
        at date: Date
    ) throws {
        try mutate(id, at: date) { p in
            guard let idx = p.blockers.firstIndex(where: { $0.id == blockerID }) else {
                throw RegistryError.unknownBlocker(blockerID, in: id)
            }
            guard !p.blockers[idx].isResolved else {
                throw RegistryError.blockerAlreadyResolved(blockerID)
            }
            p.blockers[idx].resolvedAt = date
            p.blockers[idx].resolution = resolution
            return [.blockerResolved(blockerID)]
        }
    }

    // MARK: - Milestones

    public mutating func addMilestone(_ id: ProjectID, _ milestone: Milestone, at date: Date) throws {
        // Milestone IDs are globally unique: cross-project prerequisites
        // resolve by ID across the whole portfolio.
        guard !projects.values.contains(where: { $0.milestone(milestone.id) != nil }) else {
            throw RegistryError.duplicateMilestoneID(milestone.id)
        }
        try mutate(id, at: date) { p in
            p.milestones.append(milestone)
            return [.milestoneAdded(milestone.id)]
        }
    }

    public mutating func setMilestoneState(
        _ id: ProjectID,
        _ milestoneID: MilestoneID,
        to state: Milestone.State,
        at date: Date
    ) throws {
        guard state != .completed else {
            throw RegistryError.milestoneCompletionViaSetState(milestoneID)
        }
        try mutate(id, at: date) { p in
            guard let idx = p.milestones.firstIndex(where: { $0.id == milestoneID }) else {
                throw RegistryError.unknownMilestone(milestoneID, in: id)
            }
            let old = p.milestones[idx].state
            guard old != state else { return [] }
            p.milestones[idx].state = state
            return [.milestoneStateChanged(milestoneID, from: old, to: state)]
        }
    }

    public mutating func satisfyCriterion(
        _ id: ProjectID,
        milestone milestoneID: MilestoneID,
        criterion criterionID: CriterionID,
        at date: Date
    ) throws {
        try mutate(id, at: date) { p in
            guard let mIdx = p.milestones.firstIndex(where: { $0.id == milestoneID }) else {
                throw RegistryError.unknownMilestone(milestoneID, in: id)
            }
            guard let cIdx = p.milestones[mIdx].acceptanceCriteria.firstIndex(where: { $0.id == criterionID }) else {
                throw RegistryError.unknownCriterion(criterionID, in: milestoneID)
            }
            p.milestones[mIdx].acceptanceCriteria[cIdx].satisfiedAt = date
            return []
        }
    }

    /// Completes a milestone, enforcing required acceptance criteria and an
    /// approved review gate unless a deliberate override (with rationale)
    /// is supplied. Overrides are themselves timeline events.
    public mutating func completeMilestone(
        _ id: ProjectID,
        _ milestoneID: MilestoneID,
        at date: Date,
        overrideRationale: String? = nil
    ) throws {
        // Prerequisite satisfaction needs the whole registry; evaluate before
        // entering the single-project mutation.
        let host = try requireProject(id)
        guard let preM = host.milestone(milestoneID) else {
            throw RegistryError.unknownMilestone(milestoneID, in: id)
        }
        let prerequisitesSatisfied = milestonePrerequisitesSatisfied(preM, in: host)

        try mutate(id, at: date) { p in
            guard let idx = p.milestones.firstIndex(where: { $0.id == milestoneID }) else {
                throw RegistryError.unknownMilestone(milestoneID, in: id)
            }
            let m = p.milestones[idx]
            guard m.state != .completed else {
                throw RegistryError.milestoneAlreadyCompleted(milestoneID)
            }
            // A dangling gate reference is corruption, never approval — no
            // override can complete past it.
            if let gateID = m.reviewGateID, p.reviewGate(gateID) == nil {
                throw RegistryError.unknownReviewGate(gateID, in: id)
            }
            var kinds: [ProjectEvent.Kind] = []
            let unsatisfied = m.unsatisfiedRequiredCriteria
            var needsOverride = false
            if !unsatisfied.isEmpty {
                if overrideRationale == nil {
                    throw RegistryError.unsatisfiedAcceptanceCriteria(
                        milestoneID, unsatisfied: unsatisfied.map(\.id))
                }
                needsOverride = true
            }
            if let gateID = m.reviewGateID,
               let gate = p.reviewGates.first(where: { $0.id == gateID }),
               gate.resolution?.outcome != .approved {
                if overrideRationale == nil {
                    throw RegistryError.unresolvedReviewGate(milestoneID, gate: gateID)
                }
                needsOverride = true
            }
            if !prerequisitesSatisfied {
                if overrideRationale == nil {
                    throw RegistryError.unsatisfiedMilestonePrerequisites(milestoneID)
                }
                needsOverride = true
            }
            if needsOverride, let rationale = overrideRationale {
                kinds.append(.milestoneCompletionOverridden(milestoneID, rationale: rationale))
            }
            kinds.append(.milestoneStateChanged(milestoneID, from: m.state, to: .completed))
            kinds.append(.milestoneCompleted(milestoneID))
            p.milestones[idx].state = .completed
            p.milestones[idx].completedAt = date
            return kinds
        }
    }

    // MARK: - Review gates

    public mutating func openReviewGate(_ id: ProjectID, _ gate: ReviewGate, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard p.reviewGate(gate.id) == nil else {
                throw RegistryError.duplicateReviewGateID(gate.id)
            }
            p.reviewGates.append(gate)
            return [.reviewRequested(gate.id)]
        }
    }

    public mutating func resolveReviewGate(
        _ id: ProjectID,
        _ gateID: ReviewGateID,
        resolution: ReviewGate.Resolution,
        at date: Date
    ) throws {
        try mutate(id, at: date) { p in
            guard let idx = p.reviewGates.firstIndex(where: { $0.id == gateID }) else {
                throw RegistryError.unknownReviewGate(gateID, in: id)
            }
            guard p.reviewGates[idx].isOpen else {
                throw RegistryError.gateAlreadyResolved(gateID)
            }
            p.reviewGates[idx].resolution = resolution
            p.reviewGates[idx].resolvedAt = date
            return [.reviewResolved(gateID, outcome: resolution.outcome)]
        }
    }

    // MARK: - Risks

    public mutating func addRisk(_ id: ProjectID, _ risk: Risk, at date: Date) throws {
        try mutate(id, at: date) { p in
            guard !p.risks.contains(where: { $0.id == risk.id }) else {
                throw RegistryError.duplicateRiskID(risk.id)
            }
            p.risks.append(risk)
            return [.riskAdded(risk.id)]
        }
    }

    public mutating func setRiskStatus(
        _ id: ProjectID,
        _ riskID: RiskID,
        to status: Risk.Status,
        at date: Date
    ) throws {
        try mutate(id, at: date) { p in
            guard let idx = p.risks.firstIndex(where: { $0.id == riskID }) else {
                throw RegistryError.unknownRisk(riskID, in: id)
            }
            let old = p.risks[idx].status
            guard old != status else { return [] }
            p.risks[idx].status = status
            return [.riskChanged(riskID, from: old, to: status)]
        }
    }

    // MARK: - Decisions

    /// Records a decision and links it to its affected projects' timelines.
    public mutating func recordDecision(_ decision: Decision, at date: Date) throws {
        guard decisions[decision.id] == nil else {
            throw RegistryError.duplicateDecisionID(decision.id)
        }
        var d = decision
        // Supersession must go through supersedeDecision.
        d.supersededBy = nil
        decisions[d.id] = d
        for pid in d.affectedProjects where projects[pid] != nil {
            emit(.decisionRecorded(d.id), project: pid, at: date)
        }
    }

    /// Replaces an active decision with a new one, wiring the lineage in
    /// both directions so neither can silently contradict the other.
    public mutating func supersedeDecision(
        _ oldID: DecisionID,
        with newDecision: Decision,
        at date: Date
    ) throws {
        guard var old = decisions[oldID] else { throw RegistryError.unknownDecision(oldID) }
        guard old.status == .active else { throw RegistryError.decisionNotActive(oldID) }
        guard old.supersededBy == nil else { throw RegistryError.decisionAlreadySuperseded(oldID) }
        guard newDecision.id != oldID, decisions[newDecision.id] == nil else {
            throw RegistryError.duplicateDecisionID(newDecision.id)
        }
        var new = newDecision
        new.supersedes = oldID
        new.status = .active
        old.status = .superseded
        old.supersededBy = new.id
        decisions[oldID] = old
        decisions[new.id] = new
        for pid in Set(new.affectedProjects + old.affectedProjects) where projects[pid] != nil {
            emit(.decisionSuperseded(old: oldID, new: new.id), project: pid, at: date)
        }
    }

    /// Active decisions affecting a project.
    public func activeDecisions(for id: ProjectID) -> [Decision] {
        decisions.values
            .filter { $0.status == .active && $0.affectedProjects.contains(id) }
            .sorted { $0.date < $1.date }
    }

    /// Superseded decisions affecting a project (historical context).
    public func supersededDecisions(for id: ProjectID) -> [Decision] {
        decisions.values
            .filter { $0.status == .superseded && $0.affectedProjects.contains(id) }
            .sorted { $0.date < $1.date }
    }

    /// Full supersession lineage containing a decision, oldest first.
    /// Follows `supersedes` backwards and `supersededBy` forwards; cycles in
    /// corrupted data are guarded against with a visited set.
    public func decisionLineage(of id: DecisionID) -> [Decision] {
        guard let start = decisions[id] else { return [] }
        var visited: Set<DecisionID> = [id]
        var chain: [Decision] = [start]
        var cursor = start
        while let prevID = cursor.supersedes, let prev = decisions[prevID],
              !visited.contains(prevID) {
            visited.insert(prevID)
            chain.insert(prev, at: 0)
            cursor = prev
        }
        cursor = start
        while let nextID = cursor.supersededBy, let next = decisions[nextID],
              !visited.contains(nextID) {
            visited.insert(nextID)
            chain.append(next)
            cursor = next
        }
        return chain
    }

    // MARK: - Milestone queries

    /// Prerequisite satisfaction for a milestone within this registry.
    public func milestonePrerequisitesSatisfied(_ milestone: Milestone, in project: Project) -> Bool {
        for prereq in milestone.prerequisites {
            switch prereq {
            case .project(let pid):
                guard let p = projects[pid], p.status == .completed else { return false }
            case .milestone(let mid):
                // Sibling milestone first, then any milestone in the portfolio.
                if let sibling = project.milestone(mid) {
                    if sibling.state != .completed { return false }
                } else if let other = projects.values.lazy.compactMap({ $0.milestone(mid) }).first {
                    if other.state != .completed { return false }
                } else {
                    return false
                }
            }
        }
        return true
    }

    /// Milestones of a project whose prerequisites are satisfied and which
    /// are not blocked/completed — i.e. workable now.
    public func readyMilestones(of id: ProjectID) -> [Milestone] {
        guard let p = projects[id] else { return [] }
        return p.milestones.filter { m in
            m.state != .completed && m.state != .blocked
                && milestonePrerequisitesSatisfied(m, in: p)
        }
    }

    /// The first incomplete milestone in declaration order.
    public func nextMilestone(of id: ProjectID) -> Milestone? {
        guard let p = projects[id] else { return nil }
        return p.milestones.first { $0.state != .completed }
    }

    // MARK: - Review gate queries

    /// All open gates across the portfolio awaiting a particular reviewer.
    public func gatesAwaiting(reviewer: Owner) -> [(project: ProjectID, gate: ReviewGate)] {
        allProjects.flatMap { p in
            p.openReviewGates
                .filter { $0.reviewer.involves(reviewer) || $0.reviewer == reviewer }
                .map { (p.id, $0) }
        }
    }
}
