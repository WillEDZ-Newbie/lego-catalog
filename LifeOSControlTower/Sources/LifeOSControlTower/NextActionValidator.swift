import Foundation

/// Deterministically evaluates whether a project's next action is concrete
/// enough to execute. This is *not* an AI planner — it applies conservative
/// structural heuristics and does not pretend to understand arbitrary prose.
public enum NextActionClassification: String, Codable, CaseIterable, Sendable {
    case missing
    case vague
    case blocked
    case awaitingReview
    case awaitingDecision
    case executable
}

public struct NextActionAssessment: Sendable, Equatable {
    public var projectID: ProjectID
    public var classification: NextActionClassification
    public var reasons: [String]
    /// Blocking prerequisite projects that must complete first.
    public var missingPrerequisites: [ProjectID]
    public var relatedBlockerIDs: [BlockerID]
    public var relatedGateIDs: [ReviewGateID]
}

/// Configurable vagueness policy. The defaults catch the obvious cases
/// ("Work on Nexus"); expect false negatives on adversarial prose.
public struct NextActionPolicy: Sendable {
    /// Lowercased phrases that mark an action as vague when it *starts* with one.
    public var vagueLeadingPhrases: [String]
    /// Minimum number of words for an action to be considered operational.
    public var minimumWordCount: Int

    public init(
        vagueLeadingPhrases: [String] = [
            "work on", "continue", "keep working", "think about", "look into",
            "explore", "improve", "polish", "handle", "deal with", "progress",
            "make progress", "carry on", "do more", "more work", "misc", "various"
        ],
        minimumWordCount: Int = 3
    ) {
        self.vagueLeadingPhrases = vagueLeadingPhrases
        self.minimumWordCount = minimumWordCount
    }

    public static let `default` = NextActionPolicy()
}

public enum NextActionValidator {
    public static func validate(
        _ project: Project,
        in registry: ProjectRegistry,
        graph: DependencyGraph? = nil,
        now: Date,
        policy: NextActionPolicy = .default
    ) -> NextActionAssessment {
        let graph = graph ?? DependencyGraph(registry)
        let unsatisfied = graph.unsatisfiedBlockingPrerequisites(of: project.id).sorted()
        let openBlockers = project.openBlockers
        let decisionBlockers = openBlockers.filter { $0.type == .decision }
        let otherBlockers = openBlockers.filter { $0.type != .decision }
        let openGates = project.openReviewGates

        func result(
            _ classification: NextActionClassification,
            _ reasons: [String]
        ) -> NextActionAssessment {
            NextActionAssessment(
                projectID: project.id,
                classification: classification,
                reasons: reasons,
                missingPrerequisites: unsatisfied,
                relatedBlockerIDs: openBlockers.map(\.id).sorted(),
                relatedGateIDs: openGates.map(\.id).sorted()
            )
        }

        // Project-state gates take precedence over prose quality: an action
        // cannot be executable while the project cannot proceed.
        if !decisionBlockers.isEmpty {
            return result(.awaitingDecision, decisionBlockers.map {
                "decision blocker '\($0.id)' awaiting \($0.owner.label)"
            })
        }
        if !unsatisfied.isEmpty || !otherBlockers.isEmpty {
            var reasons = unsatisfied.map { "blocking dependency '\($0)' incomplete" }
            reasons += otherBlockers.map { "open blocker '\($0.id)'" }
            return result(.blocked, reasons)
        }
        if !openGates.isEmpty {
            return result(.awaitingReview, openGates.map {
                "open review gate '\($0.id)' (\($0.kind.rawValue))"
            })
        }

        guard let action = project.nextAction?.trimmingCharacters(in: .whitespacesAndNewlines),
              !action.isEmpty else {
            return result(.missing, ["no next action recorded"])
        }

        let lowered = action.lowercased()
        for phrase in policy.vagueLeadingPhrases where lowered.hasPrefix(phrase) {
            return result(.vague, ["action starts with vague phrase '\(phrase)'"])
        }
        let words = lowered.split(whereSeparator: { $0.isWhitespace })
        if words.count < policy.minimumWordCount {
            return result(.vague, ["action has \(words.count) word(s); minimum is \(policy.minimumWordCount)"])
        }

        return result(.executable, ["action is concrete and the project can proceed"])
    }
}
