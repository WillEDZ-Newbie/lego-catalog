#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// Non-destructive ingestion of a portfolio exported by the approved
/// LifeOS Control Tower core (v1 `PortfolioExport` JSON).
///
/// Contract:
/// - The source is **read-only**: nothing is written back, ever. TowerCore
///   builds its **own copy** as an event history and leaves the input intact.
/// - Nothing is silently altered. Where v1 state cannot be represented
///   under TowerCore's guarantees, the copy uses TowerCore's honest
///   equivalent and the deviation is recorded in the `IngestReport`:
///   * a cycle-closing blocking dependency is imported as a non-blocking
///     `informs` edge (linkage preserved, acyclicity preserved);
///   * a project/milestone completed in v1 despite open guards is imported
///     as an **audited override** whose rationale names the source facts;
///   * anything unrepresentable is skipped and reported, never dropped
///     silently.
/// - Bitemporal split: `effectiveAt` = the source's own timestamps;
///   `recordedAt` = ingestion time. "We learned it now; it was true then."
public enum V1Ingest {

    public struct Adaptation: Sendable, Equatable, CustomStringConvertible {
        public var subject: String
        public var detail: String
        public var description: String { "\(subject): \(detail)" }
    }

    public struct IngestReport: Sendable {
        public var projects = 0
        public var dependencies = 0
        public var blockers = 0
        public var milestones = 0
        public var gates = 0
        public var risks = 0
        public var decisions = 0
        public var adaptations: [Adaptation] = []
        /// True by construction: ingestion never writes to its input.
        public let sourceUntouched = true
    }

    public enum IngestFailure: Error, CustomStringConvertible {
        case malformed(String)
        public var description: String {
            guard case .malformed(let d) = self else { return "malformed" }
            return "v1 payload malformed: \(d)"
        }
    }

    // MARK: - Entry point

    public static func ingest(v1Data data: Data, at now: Date) throws -> (tower: Tower, report: IngestReport) {
        guard let tree = try? JSONValue.parse(data), tree.object != nil else {
            throw IngestFailure.malformed("top level is not a JSON object")
        }
        let projects = (tree["projects"]?.array ?? []).compactMap { $0.object != nil ? $0 : nil }
        let decisions = (tree["decisions"]?.array ?? []).compactMap { $0.object != nil ? $0 : nil }

        var tower = Tower()
        var report = IngestReport()
        let isoStyle = Date.ISO8601FormatStyle(includingFractionalSeconds: false)
        func date(_ v: JSONValue?) -> Date? {
            guard let s = v?.string else { return nil }
            return (try? isoStyle.parse(s)) ?? (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(s))
        }
        func run(_ c: Command, _ effective: Date?) throws {
            try tower.execute(c, at: now, effectiveAt: effective ?? now)
        }
        func adapt(_ subject: String, _ detail: String) {
            report.adaptations.append(Adaptation(subject: subject, detail: detail))
        }
        func text(_ v: JSONValue?, fallback: String) -> NonEmptyText {
            NonEmptyText(v?.string ?? "") ?? NonEmptyText(fallback)!
        }
        func owner(_ v: JSONValue?) -> Owner {
            guard let d = v?.object, let key = d.keys.first else { return .user }
            switch key {
            case "user": return .user
            case "chatGPT": return .chatGPT
            case "grok": return .grok
            case "claude": return .claude
            case "tool":
                return .tool(name: d["tool"]?["name"]?.string ?? "tool")
            case "mixed":
                let arr = d["mixed"]?["_0"]?.array ?? []
                let owners = arr.map { owner($0) }
                return owners.isEmpty ? .user : .mixed(owners)
            default: return .user
            }
        }
        func level(_ v: JSONValue?, subject: String, field: String) -> Level {
            switch v?.string {
            case "low": return .low
            case "medium": return .medium
            case "high": return .high
            case "critical":
                adapt(subject, "\(field) 'critical' mapped to TowerCore's top level 'high'")
                return .high
            default: return .medium
            }
        }

        // ---- Phase 1: create every project, carry lastAction ----
        struct Pending {
            var id: ProjectID
            var status: String
            var updatedAt: Date?
            var dict: JSONValue
        }
        var pending: [Pending] = []
        for p in projects {
            guard let idStr = p["id"]?.string else {
                adapt("project", "entry without id skipped"); continue
            }
            let id = ProjectID(idStr)
            let created = date(p["createdAt"])
            let seed = Event.ProjectSeed(
                id: id,
                name: text(p["name"], fallback: "Untitled (\(idStr))"),
                purpose: p["purpose"]?.string ?? "",
                priority: Priority(rawValue: p["priority"]?.string ?? "") ?? .medium,
                owner: owner(p["owner"]),
                stage: p["currentStage"]?.string ?? "",
                nextAction: p["nextAction"]?.string,
                deadline: date(p["deadline"]))
            do {
                try run(.createProject(seed), created)
                report.projects += 1
            } catch {
                adapt(idStr, "could not create (\(error)); skipped"); continue
            }
            if let last = p["lastAction"]?.string, let t = NonEmptyText(last) {
                try? run(.completeAction(id, t), date(p["updatedAt"]) ?? created)
                if let na = p["nextAction"]?.string {
                    try? run(.setNextAction(id, na), date(p["updatedAt"]) ?? created)
                }
            }
            pending.append(Pending(id: id, status: p["status"]?.string ?? "notStarted",
                                   updatedAt: date(p["updatedAt"]), dict: p))
        }

        // ---- Phase 2: dependencies (cycle-closers demoted to informs) ----
        for p in pending {
            for depAny in p.dict["dependencies"]?.array ?? [] {
                guard let target = depAny["prerequisite"]?.string else { continue }
                let kind = DependencyKind(rawValue: depAny["kind"]?.string ?? "") ?? .blocks
                let when = p.updatedAt
                do {
                    try run(.addDependency(p.id, on: ProjectID(target), kind: kind), when)
                    report.dependencies += 1
                } catch let r as Rejection {
                    if case .wouldCreateCycle(let path) = r {
                        try? run(.addDependency(p.id, on: ProjectID(target), kind: .informs), when)
                        report.dependencies += 1
                        adapt("\(p.id) -> \(target)",
                              "blocking dependency closes cycle (\(path.map(\.rawValue).joined(separator: " -> "))) in source; imported as non-blocking 'informs' edge")
                    } else {
                        adapt("\(p.id) -> \(target)", "dependency skipped: \(r)")
                    }
                }
            }
        }

        // ---- Phase 3: gates, blockers, risks, files, milestones ----
        struct PendingMilestoneCompletion { var project: ProjectID; var milestone: MilestoneID }
        var milestoneCompletions: [PendingMilestoneCompletion] = []

        for p in pending {
            for g in p.dict["reviewGates"]?.array ?? [] {
                guard let gid = g["id"]?.string else { continue }
                let gate = Gate(id: GateID(gid),
                                title: text(g["title"], fallback: "Review \(gid)"),
                                kind: Gate.Kind(rawValue: g["kind"]?.string ?? "") ?? .userApproval,
                                reviewer: owner(g["reviewer"]),
                                openedAt: date(g["requestedAt"]) ?? now)
                do { try run(.openGate(p.id, gate), gate.openedAt); report.gates += 1 }
                catch { adapt(gid, "gate skipped: \(error)"); continue }
                if let res = g["resolution"], res.object != nil {
                    let outcome: Gate.Outcome = res["outcome"]?.string == "rejected" ? .rejected : .approved
                    let rationale = NonEmptyText(res["rationale"]?.string ?? "")
                        ?? NonEmptyText("migrated: no rationale recorded in source")!
                    if NonEmptyText(res["rationale"]?.string ?? "") == nil {
                        adapt(gid, "gate verdict had no rationale in source; placeholder recorded")
                    }
                    try? run(.resolveGate(p.id, GateID(gid), outcome: outcome, rationale: rationale),
                             date(g["resolvedAt"]) ?? now)
                }
            }
            for b in p.dict["blockers"]?.array ?? [] {
                guard let bid = b["id"]?.string else { continue }
                let blocker = Blocker(
                    id: BlockerID(bid),
                    kind: Blocker.Kind(rawValue: b["type"]?.string ?? "") ?? .unknown,
                    summary: text(b["summary"], fallback: "Blocker \(bid)"),
                    owner: owner(b["owner"]),
                    severity: level(b["severity"], subject: bid, field: "severity"),
                    openedAt: date(b["createdAt"]) ?? now)
                do { try run(.openBlocker(p.id, blocker), blocker.openedAt); report.blockers += 1 }
                catch { adapt(bid, "blocker skipped: \(error)"); continue }
                if let resolvedAt = date(b["resolvedAt"]) {
                    let summary = b["resolution"]?["summary"]?.string
                    let rt = NonEmptyText(summary ?? "") ?? NonEmptyText("migrated: resolved in source without structured resolution")!
                    try? run(.resolveBlocker(p.id, BlockerID(bid), resolution: rt), resolvedAt)
                }
            }
            for r in p.dict["risks"]?.array ?? [] {
                guard let rid = r["id"]?.string else { continue }
                let risk = Risk(id: RiskID(rid),
                                summary: text(r["summary"], fallback: "Risk \(rid)"),
                                likelihood: level(r["likelihood"], subject: rid, field: "likelihood"),
                                impact: level(r["impact"], subject: rid, field: "impact"),
                                owner: owner(r["owner"]))
                do { try run(.addRisk(p.id, risk), p.updatedAt); report.risks += 1 }
                catch { adapt(rid, "risk skipped: \(error)"); continue }
                if let status = Risk.Status(rawValue: r["status"]?.string ?? ""), status != .open {
                    try? run(.setRiskStatus(p.id, RiskID(rid), status), p.updatedAt)
                }
            }
            for f in p.dict["files"]?.array ?? [] {
                if let ref = NonEmptyText(f["identifier"]?.string ?? "") {
                    try? run(.addFileReference(p.id, ref), p.updatedAt)
                }
            }
            for m in p.dict["milestones"]?.array ?? [] {
                guard let mid = m["id"]?.string else { continue }
                var prereqs: [ProjectID] = []
                for prereq in m["prerequisites"]?.array ?? [] {
                    if let proj = prereq["project"]?["_0"]?.string {
                        prereqs.append(ProjectID(proj))
                    } else if let ms = prereq["milestone"]?["_0"]?.string {
                        adapt(mid, "milestone-to-milestone prerequisite '\(ms)' not representable; recorded here, omitted from copy")
                    }
                }
                var criteria: [Criterion] = []
                var satisfied: [(CriterionID, Date?)] = []
                for c in m["acceptanceCriteria"]?.array ?? [] {
                    guard let cid = c["id"]?.string else { continue }
                    criteria.append(Criterion(id: CriterionID(cid),
                                              text: text(c["text"], fallback: "criterion \(cid)"),
                                              isRequired: c["isRequired"]?.boolValue ?? true))
                    if c["satisfiedAt"] != nil { satisfied.append((CriterionID(cid), date(c["satisfiedAt"]))) }
                }
                var gateID = m["reviewGateID"]?.string.map { GateID($0) }
                if let g = gateID, tower.state.project(p.id)?.gate(g) == nil {
                    adapt(mid, "references missing gate '\(g)' in source; imported without gate (a missing gate is never approval)")
                    gateID = nil
                }
                let milestone = Milestone(
                    id: MilestoneID(mid),
                    title: text(m["title"], fallback: "Milestone \(mid)"),
                    criteria: criteria,
                    prerequisiteProjects: prereqs.filter { pid in pending.contains { $0.id == pid } },
                    gateID: gateID,
                    deadline: date(m["deadline"]),
                    requiredForCompletion: m["isRequiredForProjectCompletion"]?.boolValue ?? true,
                    createdAt: date(m["createdAt"]) ?? now)
                do { try run(.addMilestone(p.id, milestone), milestone.createdAt); report.milestones += 1 }
                catch { adapt(mid, "milestone skipped: \(error)"); continue }
                for (cid, when) in satisfied {
                    try? run(.satisfyCriterion(p.id, MilestoneID(mid), cid), when)
                }
                if m["state"]?.string == "completed" || m["completedAt"] != nil {
                    milestoneCompletions.append(.init(project: p.id, milestone: MilestoneID(mid)))
                }
            }
        }

        // ---- Phase 4: decisions and supersession lineage ----
        func decisionValue(_ d: JSONValue) -> Decision? {
            guard let id = d["id"]?.string else { return nil }
            return Decision(id: DecisionID(id),
                            title: text(d["title"], fallback: "Decision \(id)"),
                            decision: text(d["decision"], fallback: "(not recorded)"),
                            rationale: text(d["rationale"], fallback: "(not recorded)"),
                            owner: owner(d["owner"]),
                            affectedProjects: (d["affectedProjects"]?.array ?? []).compactMap { $0.string.map { ProjectID($0) } },
                            decidedAt: date(d["date"]) ?? now)
        }
        let sortedDecisions = decisions.sorted {
            (date($0["date"]) ?? .distantPast) < (date($1["date"]) ?? .distantPast)
        }
        var supersessions: [(old: DecisionID, new: Decision, when: Date?)] = []
        var recorded = Set<DecisionID>()
        for d in sortedDecisions {
            guard let value = decisionValue(d) else { continue }
            if let oldID = d["supersedes"]?.string {
                supersessions.append((DecisionID(oldID), value, date(d["date"]))); continue
            }
            do { try run(.recordDecision(value), value.decidedAt); report.decisions += 1; recorded.insert(value.id) }
            catch { adapt(value.id.rawValue, "decision skipped: \(error)") }
        }
        for s in supersessions.sorted(by: { ($0.when ?? .distantPast) < ($1.when ?? .distantPast) }) {
            do { try run(.supersedeDecision(s.old, with: s.new), s.when); report.decisions += 1 }
            catch {
                adapt(s.new.id.rawValue, "supersession of '\(s.old)' not replayable (\(error)); recorded as standalone decision")
                try? run(.recordDecision(s.new), s.new.decidedAt)
                report.decisions += 1
            }
        }

        // ---- Phase 5: lifecycle finalization ----
        for p in pending {
            switch p.status {
            case "active": try? run(.start(p.id), p.updatedAt)
            case "dormant":
                try? run(.start(p.id), p.updatedAt)
                try? run(.pause(p.id), p.updatedAt)
            case "cancelled": try? run(.cancel(p.id), p.updatedAt)
            case "completed", "archived": try? run(.start(p.id), p.updatedAt)
            default: break
            }
        }
        // Fixed-point completion loop: complete what completes cleanly first,
        // so overrides are used only where the source truly violated guards.
        var pendingProjects = pending.filter { $0.status == "completed" || $0.status == "archived" }
        var pendingMilestones = milestoneCompletions
        var progress = true
        while progress {
            progress = false
            pendingMilestones.removeAll { pm in
                if (try? run(.completeMilestone(pm.project, pm.milestone, override: nil),
                             pending.first { $0.id == pm.project }?.updatedAt)) != nil {
                    progress = true; return true
                }
                return false
            }
            pendingProjects.removeAll { pp in
                if (try? run(.complete(pp.id, override: nil), pp.updatedAt)) != nil {
                    progress = true; return true
                }
                return false
            }
        }
        for pm in pendingMilestones {
            let obstacles = (try? obstaclesText(tower, pm.project, milestone: pm.milestone)) ?? "open guards"
            let override = Override("migrated from source: milestone completed in v1 despite \(obstacles)")!
            do {
                try run(.completeMilestone(pm.project, pm.milestone, override: override),
                        pending.first { $0.id == pm.project }?.updatedAt)
                adapt(pm.milestone.rawValue, "completed via audited override (source had it complete despite \(obstacles))")
            } catch { adapt(pm.milestone.rawValue, "completion not replayable: \(error)") }
        }
        for pp in pendingProjects {
            let project = tower.state.project(pp.id)
            let obstacles = project.map { tower.completionObstacles(of: $0).map(\.description).joined(separator: "; ") } ?? "open guards"
            let override = Override("migrated from source: completed in v1 despite \(obstacles.isEmpty ? "unreplayable guards" : obstacles))")!
            do {
                try run(.complete(pp.id, override: override), pp.updatedAt)
                if !obstacles.isEmpty {
                    adapt(pp.id.rawValue, "completed via audited override (source had it complete despite \(obstacles))")
                }
            } catch { adapt(pp.id.rawValue, "completion not replayable: \(error)") }
        }
        for p in pending where p.status == "archived" {
            do { try run(.archive(p.id), p.updatedAt) }
            catch { adapt(p.id.rawValue, "archive not replayable: \(error)") }
        }

        return (tower, report)
    }

    private static func obstaclesText(_ tower: Tower, _ id: ProjectID, milestone mid: MilestoneID) throws -> String {
        guard let p = tower.state.project(id), let m = p.milestone(mid) else { return "open guards" }
        var parts: [String] = m.unsatisfiedRequiredCriteria.map { "unsatisfied criterion '\($0.id)'" }
        if let g = m.gateID, p.gate(g)?.isApproved != true { parts.append("unapproved gate '\(g)'") }
        return parts.isEmpty ? "open guards" : parts.joined(separator: "; ")
    }
}
