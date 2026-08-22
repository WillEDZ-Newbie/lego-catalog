import Foundation

/// Deterministic risk record. Severity is derived arithmetically from
/// likelihood x impact; no probabilistic or AI judgement is involved.
public struct Risk: Codable, Hashable, Sendable, Identifiable {
    public enum Status: String, Codable, CaseIterable, Sendable {
        case open, mitigated, accepted, closed
    }

    public var id: RiskID
    public var summary: String
    public var likelihood: Level
    public var impact: Level
    public var mitigation: String?
    public var owner: Owner
    public var status: Status
    public var affectedMilestone: MilestoneID?

    /// Derived severity score in 1...9 (likelihood score x impact score).
    public var severity: Int { likelihood.score * impact.score }

    /// A risk still counting against project/portfolio health.
    public var isLive: Bool { status == .open }

    public init(
        id: RiskID,
        summary: String,
        likelihood: Level,
        impact: Level,
        mitigation: String? = nil,
        owner: Owner,
        status: Status = .open,
        affectedMilestone: MilestoneID? = nil
    ) {
        self.id = id
        self.summary = summary
        self.likelihood = likelihood
        self.impact = impact
        self.mitigation = mitigation
        self.owner = owner
        self.status = status
        self.affectedMilestone = affectedMilestone
    }
}
