import Foundation

/// A recorded decision — project canon. Preserves what was decided, why,
/// and its supersession lineage so old debates are not silently reopened.
public struct Decision: Codable, Hashable, Sendable, Identifiable {
    public enum Status: String, Codable, CaseIterable, Sendable {
        case active, superseded, revoked
    }

    public var id: DecisionID
    public var title: String
    public var decision: String
    public var rationale: String
    public var date: Date
    public var owner: Owner
    public var affectedProjects: [ProjectID]
    public var supersedes: DecisionID?
    public var supersededBy: DecisionID?
    public var status: Status
    public var tags: [String]

    public init(
        id: DecisionID,
        title: String,
        decision: String,
        rationale: String,
        date: Date,
        owner: Owner,
        affectedProjects: [ProjectID] = [],
        supersedes: DecisionID? = nil,
        supersededBy: DecisionID? = nil,
        status: Status = .active,
        tags: [String] = []
    ) {
        self.id = id
        self.title = title
        self.decision = decision
        self.rationale = rationale
        self.date = date
        self.owner = owner
        self.affectedProjects = affectedProjects
        self.supersedes = supersedes
        self.supersededBy = supersededBy
        self.status = status
        self.tags = tags
    }
}
