#if canImport(FoundationEssentials)
import FoundationEssentials
#else
import Foundation
#endif

/// Compatibility façade: the approved LifeOS Control Tower core (v1.2)
/// exposes named methods; these wrappers give TowerCore the same call shape
/// so existing call sites and the boundaries doc's vocabulary map one-to-one.
/// Each is pure sugar over `execute` — same guards, same audit events.
extension Tower {
    public mutating func createProject(_ seed: Event.ProjectSeed, at date: Date) throws {
        try execute(.createProject(seed), at: date)
    }
    public mutating func startProject(_ id: ProjectID, at date: Date) throws {
        try execute(.start(id), at: date)
    }
    /// Mirrors v1 `completeProject(_:at:overrideRationale:)` — a blank
    /// rationale string is rejected exactly as v1's `emptyOverrideRationale`.
    public mutating func completeProject(
        _ id: ProjectID, at date: Date, overrideRationale: String? = nil
    ) throws {
        let override: Override?
        if let rationale = overrideRationale {
            guard let o = Override(rationale) else { throw Rejection.blankOverrideRationale }
            override = o
        } else { override = nil }
        try execute(.complete(id, override: override), at: date)
    }
    public mutating func completeMilestone(
        _ id: ProjectID, _ milestone: MilestoneID, at date: Date,
        overrideRationale: String? = nil
    ) throws {
        let override: Override?
        if let rationale = overrideRationale {
            guard let o = Override(rationale) else { throw Rejection.blankOverrideRationale }
            override = o
        } else { override = nil }
        try execute(.completeMilestone(id, milestone, override: override), at: date)
    }
    public mutating func archive(_ id: ProjectID, at date: Date) throws {
        try execute(.archive(id), at: date)
    }
    public mutating func reopen(_ id: ProjectID, at date: Date) throws {
        try execute(.reopen(id), at: date)
    }
    public mutating func reactivate(_ id: ProjectID, at date: Date) throws {
        try execute(.reactivate(id), at: date)
    }
    public mutating func pause(_ id: ProjectID, at date: Date) throws {
        try execute(.pause(id), at: date)
    }
}
