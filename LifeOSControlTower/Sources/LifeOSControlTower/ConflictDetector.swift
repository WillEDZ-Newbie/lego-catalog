import Foundation

/// A structured diagnostic produced by validation.
public struct Diagnostic: Sendable, Equatable, CustomStringConvertible {
    public enum Severity: String, Codable, CaseIterable, Sendable, Comparable {
        case info, warning, error, releaseBlocking

        public var rank: Int {
            switch self {
            case .info: return 0
            case .warning: return 1
            case .error: return 2
            case .releaseBlocking: return 3
            }
        }
        public static func < (lhs: Severity, rhs: Severity) -> Bool { lhs.rank < rhs.rank }
    }

    /// Stable machine-readable code for each invariant.
    public enum Code: String, Codable, CaseIterable, Sendable {
        case completedWithIncompleteMilestones
        case completedWithUnresolvedBlocker
        case milestoneCompletedWithUnsatisfiedCriteria
        case milestoneAwaitingReviewWithoutGate
        case milestoneBlockedWithoutEvidence
        case milestoneCompletedBeforeCreated
        case deadlineBeforeCreation
        case dependencyTargetMissing
        case circularDependency
        case decisionSupersessionLoop
        case decisionLineageBroken
        case activeContradictingDecisions
        case duplicateID
        case gateResolvedWithoutResolution
        case gateResolutionWithoutTimestamp
        case blockerResolvedWithoutResolution
        case updatedBeforeCreated
        case ownerMissing
        case staleDormantExempt
    }

    public var code: Code
    public var severity: Severity
    public var message: String
    public var projectID: ProjectID?
    /// IDs of any related entities, as raw strings (mixed entity kinds).
    public var relatedIDs: [String]

    public init(code: Code, severity: Severity, message: String,
                projectID: ProjectID? = nil, relatedIDs: [String] = []) {
        self.code = code
        self.severity = severity
        self.message = message
        self.projectID = projectID
        self.relatedIDs = relatedIDs
    }

    public var description: String {
        "[\(severity.rawValue)] \(code.rawValue): \(message)"
    }
}

/// Detects inconsistent portfolio state and returns structured diagnostics.
/// Never repairs anything: repair is a human decision.
public enum ConflictDetector {
    public static func validate(_ registry: ProjectRegistry) -> [Diagnostic] {
        var diagnostics: [Diagnostic] = []
        let graph = DependencyGraph(registry)

        for project in registry.allProjects {
            diagnostics += validate(project: project, in: registry)
        }

        // Circular blocking dependencies (portfolio-level).
        for cycle in graph.detectCycles() {
            let path = (cycle + [cycle[0]]).map(\.rawValue).joined(separator: " -> ")
            diagnostics.append(Diagnostic(
                code: .circularDependency,
                severity: .releaseBlocking,
                message: "Circular blocking dependency: \(path)",
                projectID: cycle.first,
                relatedIDs: cycle.map(\.rawValue)
            ))
        }

        diagnostics += validateDecisions(registry)
        return diagnostics
    }

    private static func validate(project p: Project, in registry: ProjectRegistry) -> [Diagnostic] {
        var out: [Diagnostic] = []
        let overrideExists = registry.events(for: p.id).contains {
            if case .projectCompletionOverridden = $0.kind { return true }
            return false
        }

        // Completed while required milestones incomplete (no override event).
        if p.status == .completed {
            let incomplete = p.incompleteRequiredMilestones
            if !incomplete.isEmpty && !overrideExists {
                out.append(Diagnostic(
                    code: .completedWithIncompleteMilestones,
                    severity: .error,
                    message: "Project '\(p.id)' is completed but required milestones are incomplete.",
                    projectID: p.id,
                    relatedIDs: incomplete.map(\.id.rawValue)
                ))
            }
            for blocker in p.openBlockers {
                out.append(Diagnostic(
                    code: .completedWithUnresolvedBlocker,
                    severity: .error,
                    message: "Project '\(p.id)' is completed but blocker '\(blocker.id)' is unresolved.",
                    projectID: p.id,
                    relatedIDs: [blocker.id.rawValue]
                ))
            }
        }

        // Deadline sanity.
        if let deadline = p.deadline, deadline < p.createdAt {
            out.append(Diagnostic(
                code: .deadlineBeforeCreation,
                severity: .error,
                message: "Project '\(p.id)' deadline precedes its creation date.",
                projectID: p.id
            ))
        }
        if p.updatedAt < p.createdAt {
            out.append(Diagnostic(
                code: .updatedBeforeCreated,
                severity: .warning,
                message: "Project '\(p.id)' was updated before it was created.",
                projectID: p.id
            ))
        }

        // Dependencies must reference existing projects.
        for dep in p.dependencies where !registry.contains(dep.prerequisite) {
            out.append(Diagnostic(
                code: .dependencyTargetMissing,
                severity: .error,
                message: "Project '\(p.id)' depends on missing project '\(dep.prerequisite)'.",
                projectID: p.id,
                relatedIDs: [dep.prerequisite.rawValue]
            ))
        }

        // Milestone invariants.
        var seenMilestoneIDs = Set<MilestoneID>()
        for m in p.milestones {
            if !seenMilestoneIDs.insert(m.id).inserted {
                out.append(Diagnostic(
                    code: .duplicateID,
                    severity: .error,
                    message: "Duplicate milestone id '\(m.id)' in project '\(p.id)'.",
                    projectID: p.id,
                    relatedIDs: [m.id.rawValue]
                ))
            }
            if m.state == .completed {
                let unsatisfied = m.unsatisfiedRequiredCriteria
                let overridden = registry.events(for: p.id).contains {
                    if case .milestoneCompletionOverridden(let mid, _) = $0.kind { return mid == m.id }
                    return false
                }
                if !unsatisfied.isEmpty && !overridden {
                    out.append(Diagnostic(
                        code: .milestoneCompletedWithUnsatisfiedCriteria,
                        severity: .error,
                        message: "Milestone '\(m.id)' is completed with unsatisfied required criteria.",
                        projectID: p.id,
                        relatedIDs: unsatisfied.map(\.id.rawValue)
                    ))
                }
                if let completedAt = m.completedAt, completedAt < m.createdAt {
                    out.append(Diagnostic(
                        code: .milestoneCompletedBeforeCreated,
                        severity: .error,
                        message: "Milestone '\(m.id)' completed before it was created.",
                        projectID: p.id,
                        relatedIDs: [m.id.rawValue]
                    ))
                }
            }
            if m.state == .awaitingReview {
                let hasOpenGate = m.reviewGateID.flatMap { p.reviewGate($0) }?.isOpen ?? false
                if !hasOpenGate {
                    out.append(Diagnostic(
                        code: .milestoneAwaitingReviewWithoutGate,
                        severity: .warning,
                        message: "Milestone '\(m.id)' is awaiting review but has no open review gate.",
                        projectID: p.id,
                        relatedIDs: [m.id.rawValue]
                    ))
                }
            }
            if m.state == .blocked {
                let hasEvidence = !p.openBlockers.isEmpty
                    || !registry.milestonePrerequisitesSatisfied(m, in: p)
                if !hasEvidence {
                    out.append(Diagnostic(
                        code: .milestoneBlockedWithoutEvidence,
                        severity: .warning,
                        message: "Milestone '\(m.id)' is marked blocked with no blocker or unsatisfied prerequisite.",
                        projectID: p.id,
                        relatedIDs: [m.id.rawValue]
                    ))
                }
            }
        }

        // Gate and blocker resolution coherence.
        for gate in p.reviewGates {
            if gate.resolvedAt != nil && gate.resolution == nil {
                out.append(Diagnostic(
                    code: .gateResolvedWithoutResolution,
                    severity: .error,
                    message: "Gate '\(gate.id)' has a resolution timestamp but no recorded outcome.",
                    projectID: p.id,
                    relatedIDs: [gate.id.rawValue]
                ))
            }
            if gate.resolution != nil && gate.resolvedAt == nil {
                out.append(Diagnostic(
                    code: .gateResolutionWithoutTimestamp,
                    severity: .warning,
                    message: "Gate '\(gate.id)' has an outcome but no resolution timestamp.",
                    projectID: p.id,
                    relatedIDs: [gate.id.rawValue]
                ))
            }
        }
        for blocker in p.blockers where blocker.resolvedAt != nil && blocker.resolution == nil {
            out.append(Diagnostic(
                code: .blockerResolvedWithoutResolution,
                severity: .warning,
                message: "Blocker '\(blocker.id)' is resolved without a structured resolution.",
                projectID: p.id,
                relatedIDs: [blocker.id.rawValue]
            ))
        }

        return out
    }

    private static func validateDecisions(_ registry: ProjectRegistry) -> [Diagnostic] {
        var out: [Diagnostic] = []
        for decision in registry.decisions.values.sorted(by: { $0.id < $1.id }) {
            // Supersession loop: following supersededBy must terminate.
            var visited: Set<DecisionID> = [decision.id]
            var cursor = decision
            while let nextID = cursor.supersededBy {
                if visited.contains(nextID) {
                    out.append(Diagnostic(
                        code: .decisionSupersessionLoop,
                        severity: .error,
                        message: "Decision supersession loop involving '\(decision.id)'.",
                        relatedIDs: visited.map(\.rawValue).sorted()
                    ))
                    break
                }
                guard let next = registry.decision(nextID) else {
                    out.append(Diagnostic(
                        code: .decisionLineageBroken,
                        severity: .warning,
                        message: "Decision '\(cursor.id)' superseded by missing decision '\(nextID)'.",
                        relatedIDs: [cursor.id.rawValue, nextID.rawValue]
                    ))
                    break
                }
                visited.insert(nextID)
                cursor = next
            }
            // A superseded-by relation where both ends are still active.
            if decision.status == .active, let byID = decision.supersededBy,
               let by = registry.decision(byID), by.status == .active {
                out.append(Diagnostic(
                    code: .activeContradictingDecisions,
                    severity: .error,
                    message: "Decision '\(decision.id)' and its successor '\(byID)' are both active.",
                    relatedIDs: [decision.id.rawValue, byID.rawValue]
                ))
            }
        }
        return out
    }
}
