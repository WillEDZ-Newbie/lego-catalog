#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif
import TowerCore

// The real TowerCore engine, compiled to WebAssembly, driven by a browser UI.
// Single-threaded wasm: module-level state is safe.
nonisolated(unsafe) private var tower = Tower()
nonisolated(unsafe) private var lastResult: [UInt8] = []
nonisolated(unsafe) private var recentRejections: [String] = []

// MARK: - Memory + result plumbing

@_cdecl("tc_alloc")
public func tcAlloc(_ size: Int32) -> UnsafeMutableRawPointer {
    UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 1)
}
@_cdecl("tc_dealloc")
public func tcDealloc(_ ptr: UnsafeMutableRawPointer) { ptr.deallocate() }
@_cdecl("tc_result_ptr")
public func tcResultPtr() -> UnsafeMutableRawPointer {
    lastResult.withUnsafeBytes { raw in
        let out = UnsafeMutableRawPointer.allocate(byteCount: max(raw.count, 1), alignment: 1)
        if raw.count > 0 { out.copyMemory(from: raw.baseAddress!, byteCount: raw.count) }
        return out
    }
}
@_cdecl("tc_result_len")
public func tcResultLen() -> Int32 { Int32(lastResult.count) }

private func setResult(_ value: JSONValue) { lastResult = Array(value.serialized()) }
private func ok(_ extra: [String: JSONValue] = [:]) {
    var o: [String: JSONValue] = ["ok": .bool(true)]
    for (k, v) in extra { o[k] = v }
    setResult(.object(o))
}
private func fail(_ message: String) {
    setResult(.object(["ok": .bool(false), "error": .string(message)]))
}

// MARK: - Entry point: tc_call(op, body, nowMs)

@_cdecl("tc_call")
public func tcCall(_ opPtr: UnsafePointer<UInt8>, _ opLen: Int32,
                   _ bodyPtr: UnsafePointer<UInt8>, _ bodyLen: Int32,
                   _ nowMs: Double) -> Int32 {
    let op = String(decoding: UnsafeBufferPointer(start: opPtr, count: Int(opLen)), as: UTF8.self)
    let body = Data(UnsafeBufferPointer(start: bodyPtr, count: Int(bodyLen)))
    let now = Date(timeIntervalSince1970: nowMs / 1000)
    do {
        switch op {
        case "boot_empty":
            tower = Tower(); recentRejections = []; ok()
        case "boot_sample":
            tower = SampleHistory.standard(now: now.addingTimeInterval(-1)); recentRejections = []; ok()
        case "execute":
            let command = try parseCommand(JSONValue.parse(body), now: now)
            do {
                let events = try tower.execute(command, at: now)
                ok(["events": .number(Double(events.count))])
            } catch let r as Rejection {
                recentRejections.append(r.description)
                if recentRejections.count > 8 { recentRejections.removeFirst() }
                setResult(.object(["ok": .bool(false), "rejection": .string(r.description)]))
            }
        case "ui":
            setResult(uiState(now: now))
        case "export":
            lastResult = Array(try tower.export())
        case "import":
            tower = try Tower.imported(from: body); recentRejections = []; ok()
        case "ingest_v1":
            let (t, report) = try V1Ingest.ingest(v1Data: body, at: now)
            tower = t; recentRejections = []
            ok(["projects": .number(Double(report.projects)),
                "adaptations": .array(report.adaptations.map { .string($0.description) })])
        default:
            fail("unknown op '\(op)'")
        }
        return 0
    } catch {
        fail(String(describing: error))
        return 1
    }
}

// MARK: - Command DTO

private func parseOwner(_ label: String?) -> Owner {
    switch label {
    case "user", nil: return .user
    case "chatGPT": return .chatGPT
    case "grok": return .grok
    case "claude": return .claude
    default:
        if let l = label, l.hasPrefix("tool:") { return .tool(name: String(l.dropFirst(5))) }
        return .user
    }
}

private func net(_ v: JSONValue?, _ fallback: String) -> NonEmptyText {
    NonEmptyText(v?.string ?? "") ?? NonEmptyText(fallback)!
}

private func parseCommand(_ j: JSONValue, now: Date) throws -> Command {
    let type = j["type"]?.string ?? ""
    let id = ProjectID(j["id"]?.string ?? "")
    func override() throws -> Override? {
        guard let r = j["override"]?.string else { return nil }
        guard let o = Override(r) else { throw Rejection.blankOverrideRationale }
        return o
    }
    switch type {
    case "createProject":
        return .createProject(.init(
            id: ProjectID(j["newId"]?.string ?? "p-\(Int(now.timeIntervalSince1970))"),
            name: net(j["name"], "Untitled"),
            purpose: j["purpose"]?.string ?? "",
            priority: Priority(rawValue: j["priority"]?.string ?? "") ?? .medium,
            owner: parseOwner(j["owner"]?.string),
            stage: j["stage"]?.string ?? "",
            nextAction: j["action"]?.string,
            deadline: j["deadlineMs"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) }))
    case "start": return .start(id)
    case "pause": return .pause(id)
    case "cancel": return .cancel(id)
    case "archive": return .archive(id)
    case "complete": return .complete(id, override: try override())
    case "reopen": return .reopen(id)
    case "reactivate": return .reactivate(id)
    case "setNextAction": return .setNextAction(id, j["value"]?.string)
    case "completeAction": return .completeAction(id, net(j["value"], "Did the thing"))
    case "setPriority": return .setPriority(id, Priority(rawValue: j["value"]?.string ?? "") ?? .medium)
    case "setStage": return .setStage(id, j["value"]?.string ?? "")
    case "setDeadline":
        return .setDeadline(id, j["deadlineMs"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) })
    case "addDependency":
        return .addDependency(id, on: ProjectID(j["on"]?.string ?? ""),
                              kind: DependencyKind(rawValue: j["kind"]?.string ?? "") ?? .blocks)
    case "removeDependency": return .removeDependency(id, on: ProjectID(j["on"]?.string ?? ""))
    case "openBlocker":
        return .openBlocker(id, Blocker(
            id: BlockerID(j["blockerId"]?.string ?? "blk-\(Int(now.timeIntervalSince1970 * 1000))"),
            kind: Blocker.Kind(rawValue: j["kind"]?.string ?? "") ?? .technical,
            summary: net(j["summary"], "Blocker"),
            owner: parseOwner(j["owner"]?.string),
            severity: Level(rawValue: j["severity"]?.string ?? "") ?? .medium,
            openedAt: now))
    case "resolveBlocker":
        return .resolveBlocker(id, BlockerID(j["blockerId"]?.string ?? ""),
                               resolution: net(j["resolution"], "Resolved"))
    case "openGate":
        return .openGate(id, Gate(
            id: GateID(j["gateId"]?.string ?? "gate-\(Int(now.timeIntervalSince1970 * 1000))"),
            title: net(j["title"], "Review"),
            kind: Gate.Kind(rawValue: j["kind"]?.string ?? "") ?? .userApproval,
            reviewer: parseOwner(j["reviewer"]?.string),
            openedAt: now))
    case "resolveGate":
        return .resolveGate(id, GateID(j["gateId"]?.string ?? ""),
                            outcome: j["outcome"]?.string == "rejected" ? .rejected : .approved,
                            rationale: net(j["rationale"], "Approved"))
    case "addMilestone":
        return .addMilestone(id, Milestone(
            id: MilestoneID(j["milestoneId"]?.string ?? "ms-\(Int(now.timeIntervalSince1970 * 1000))"),
            title: net(j["title"], "Milestone"),
            criteria: (j["criteria"]?.array ?? []).enumerated().map { i, c in
                Criterion(id: CriterionID("c-\(Int(now.timeIntervalSince1970 * 1000))-\(i)"),
                          text: net(c, "criterion"))
            },
            createdAt: now))
    case "satisfyCriterion":
        return .satisfyCriterion(id, MilestoneID(j["milestoneId"]?.string ?? ""),
                                 CriterionID(j["criterionId"]?.string ?? ""))
    case "completeMilestone":
        return .completeMilestone(id, MilestoneID(j["milestoneId"]?.string ?? ""),
                                  override: try override())
    case "addRisk":
        return .addRisk(id, Risk(
            id: RiskID(j["riskId"]?.string ?? "rsk-\(Int(now.timeIntervalSince1970 * 1000))"),
            summary: net(j["summary"], "Risk"),
            likelihood: Level(rawValue: j["likelihood"]?.string ?? "") ?? .medium,
            impact: Level(rawValue: j["impact"]?.string ?? "") ?? .medium,
            owner: parseOwner(j["owner"]?.string)))
    case "addFileReference":
        return .addFileReference(id, net(j["ref"], "file"))
    default:
        throw TowerCodecError.malformed("unknown command type '\(type)'")
    }
}

// MARK: - UI state (same shape the prototype UI already renders)

private func uiState(now: Date) -> JSONValue {
    let assessment = tower.assess(at: now)
    let graph = Graph(tower.state)
    let healthMap: [Health: String] = [.complete: "complete", .inactive: "inactive",
        .needsDecision: "needsDecision", .blocked: "blocked", .inReview: "waitingForReview",
        .atRisk: "atRisk", .stale: "stale", .ready: "ready", .active: "active"]
    func ms(_ d: Date?) -> JSONValue { d.map { .number($0.timeIntervalSince1970 * 1000) } ?? .null }
    func daysAgo(_ d: Date) -> Int { Int(now.timeIntervalSince(d) / 86_400) }

    func eventText(_ e: Event) -> String {
        switch e.payload {
        case .projectCreated(let s): return "Project created: \(s.name)"
        case .lifecycleChanged(_, let f, let t, let cause):
            var text = "Status \(f.rawValue) → \(t.rawValue)"
            switch cause {
            case .completionProven: text += " — all completion guards passed"
            case .completionOverridden(let o): text += " — OVERRIDE: \(o.rationale)"
            case .reopened: text += " — deliberately reopened"
            case .reactivated: text += " — deliberately reactivated"
            case .requested: break
            }
            return text
        case .stageChanged(_, let s): return "Stage → \(s)"
        case .nextActionChanged(_, let a): return a.map { "Next action: \($0)" } ?? "Next action cleared"
        case .actionCompleted(_, let a): return "Completed: \(a)"
        case .priorityChanged(_, let p): return "Priority → \(p.rawValue)"
        case .ownerChanged(_, let o): return "Owner → \(o.label)"
        case .deadlineChanged(_, let d): return d != nil ? "Deadline set" : "Deadline cleared"
        case .dependencyAdded(_, let d): return "Now depends on \(d.prerequisite) (\(d.kind.rawValue))"
        case .dependencyRemoved(_, let d): return "No longer depends on \(d.prerequisite)"
        case .blockerOpened(_, let b): return "Blocker opened: \(b.summary)"
        case .blockerResolved(_, let id, let r): return "Blocker \(id) resolved: \(r)"
        case .milestoneAdded(_, let m): return "Milestone added: \(m.title)"
        case .criterionSatisfied(_, _, let c): return "Criterion satisfied (\(c))"
        case .milestoneCompleted(_, let m, let o):
            return "Milestone \(m) completed" + (o.map { " — OVERRIDE: \($0.rationale)" } ?? "")
        case .gateOpened(_, let g): return "Review requested: \(g.title)"
        case .gateResolved(_, let g, let v): return "Review \(v.outcome.rawValue) (\(g)): \(v.rationale)"
        case .riskAdded(_, let r): return "Risk added: \(r.summary)"
        case .riskStatusChanged(_, let r, let s): return "Risk \(r) → \(s.rawValue)"
        case .fileReferenceAdded(_, let r): return "File reference added: \(r)"
        case .decisionRecorded(let d): return "Decision recorded: \(d.title)"
        case .decisionSuperseded(let old, let new): return "Decision \(old) superseded by \(new.id)"
        }
    }

    var projects: [JSONValue] = []
    for p in tower.state.allProjects {
        let a = assessment.projects[p.id]!
        let events = tower.events.filter { $0.subject == p.id }.suffix(14).map { e in
            JSONValue.object(["tMs": .number(e.effectiveAt.timeIntervalSince1970 * 1000),
                              "text": .string(eventText(e))])
        }
        projects.append(.object([
            "id": .string(p.id.rawValue), "name": .string(p.name.text),
            "purpose": .string(p.purpose), "status": .string(p.lifecycle.rawValue),
            "stage": .string(p.stage), "priority": .string(p.priority.rawValue),
            "owner": .string(p.owner.label),
            "nextAction": p.nextAction.map { .string($0) } ?? .null,
            "deadlineMs": ms(p.deadline),
            "updatedDaysAgo": .number(Double(daysAgo(p.updatedAt))),
            "health": .string(healthMap[a.health]!),
            "healthReasons": .array(a.healthEvidence.map { .string($0.description) }),
            "actionVerdict": .string(a.actionClass.rawValue),
            "actionReasons": .array(a.actionEvidence.map { .string($0.description) }),
            "downstream": .number(Double(graph.affectedDownstream(of: p.id).count)),
            "deps": .array(p.dependencies.map { d in .object([
                "on": .string(d.prerequisite.rawValue), "kind": .string(d.kind.rawValue),
                "blocking": .bool(d.kind.isBlocking)]) }),
            "blockers": .array(p.blockers.map { b in .object([
                "id": .string(b.id.rawValue), "type": .string(b.kind.rawValue),
                "summary": .string(b.summary.text), "owner": .string(b.owner.label),
                "severity": .string(b.severity.rawValue), "resolved": .bool(!b.isOpen),
                "ageDays": .number(Double(daysAgo(b.openedAt)))]) }),
            "risks": .array(p.risks.map { r in .object([
                "id": .string(r.id.rawValue), "summary": .string(r.summary.text),
                "likelihood": .string(r.likelihood.rawValue), "impact": .string(r.impact.rawValue),
                "severity": .number(Double(r.severity)), "status": .string(r.status.rawValue)]) }),
            "milestones": .array(p.milestones.map { m in .object([
                "id": .string(m.id.rawValue), "title": .string(m.title.text),
                "state": .string(m.isComplete ? "completed" : "active"),
                "deadlineMs": ms(m.deadline),
                "criteria": .array(m.criteria.map { c in .object([
                    "id": .string(c.id.rawValue), "text": .string(c.text.text),
                    "required": .bool(c.isRequired), "done": .bool(c.satisfiedAt != nil)]) })]) }),
            "gates": .array(p.gates.map { g in .object([
                "id": .string(g.id.rawValue), "title": .string(g.title.text),
                "kind": .string(g.kind.rawValue),
                "state": .string(g.isOpen ? "open" : (g.isApproved ? "approved" : "rejected")),
                "reviewer": .string(g.reviewer.label), "open": .bool(g.isOpen),
                "ageDays": .number(Double(daysAgo(g.openedAt)))]) }),
            "files": .array(p.fileReferences.map { .string($0) }),
            "events": .array(events)
        ]))
    }

    let queue = assessment.attention.map { e in JSONValue.object([
        "id": .string(e.id.rawValue), "bucket": .number(Double(e.bucket.rawValue)),
        "score": .number(Double(e.score)), "health": .string("—"),
        "reasons": .array(e.evidence.map { .string($0.description) })]) }

    var edges: [JSONValue] = []
    for p in tower.state.allProjects {
        for d in p.dependencies {
            edges.append(.object(["from": .string(d.prerequisite.rawValue),
                                  "to": .string(p.id.rawValue),
                                  "kind": .string(d.kind.rawValue),
                                  "blocking": .bool(d.kind.isBlocking)]))
        }
    }

    let inPlay = tower.state.allProjects.filter { $0.lifecycle != .archived }
    func ids(_ h: String) -> JSONValue {
        .array(inPlay.filter { healthMap[assessment.projects[$0.id]!.health]! == h }
            .map { .string($0.id.rawValue) })
    }
    let workload = tower.workload(at: now)
    let brief = tower.changes(since: now.addingTimeInterval(-86_400)).map { e -> JSONValue in
        let name = e.subject.flatMap { tower.state.project($0)?.name.text } ?? ""
        return .object(["kind": .string("other"),
                        "text": .string((name.isEmpty ? "" : name + ": ") + eventText(e))])
    }

    return .object([
        "engine": .string("TowerCore live (wasm)"),
        "generatedAtMs": .number(now.timeIntervalSince1970 * 1000),
        "projects": .array(projects),
        "queue": .array(queue),
        "edges": .array(edges),
        "cycles": .array([]),
        "longestChain": .array([]),
        "hubs": .array(assessment.criticalHubs.map { .object([
            "id": .string($0.project.rawValue), "count": .number(Double($0.downstreamCount))]) }),
        "rejections": .array(recentRejections.map { .string($0) }),
        "snapshot": .object([
            "total": .number(Double(inPlay.count)),
            "ready": ids("ready"), "active": ids("active"), "blocked": ids("blocked"),
            "review": ids("waitingForReview"), "decision": ids("needsDecision"),
            "stale": ids("stale"), "atRisk": ids("atRisk"),
            "overdue": .array(assessment.overdue.map { .string($0.rawValue) }),
            "completed": ids("complete"),
            "dormant": .array(inPlay.filter { $0.lifecycle == .dormant }.map { .string($0.id.rawValue) }),
            "critical": .array(inPlay.filter { $0.priority == .critical && !$0.lifecycle.isTerminal }
                .map { .string($0.id.rawValue) })]),
        "workload": .object([
            "active": .object(workload.activeCountByOwner.mapValues { .number(Double($0)) }),
            "review": .object(workload.awaitingReviewByReviewer.mapValues { .number(Double($0)) }),
            "blocked": .object(workload.blockedByBlockerOwner.mapValues { .number(Double($0)) }),
            "critHigh": .object(workload.criticalHighByOwner.mapValues { .number(Double($0)) })]),
        "brief": .array(brief),
        "eventCount": .number(Double(tower.events.count))
    ])
}
