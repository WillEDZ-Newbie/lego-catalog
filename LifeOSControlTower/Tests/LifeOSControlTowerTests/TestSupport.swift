import Foundation
@testable import LifeOSControlTower

/// Frozen reference instant: all tests are date-independent.
let t0 = Date(timeIntervalSince1970: 1_754_000_000) // 2025-08-01T00:53:20Z

func days(_ n: Double) -> TimeInterval { n * 86_400 }

/// Minimal project factory.
func makeProject(
    _ id: String,
    name: String? = nil,
    status: ProjectStatus = .notStarted,
    priority: Priority = .medium,
    owner: Owner = .user,
    nextAction: String? = "Write the first failing test for the parser",
    createdAt: Date = t0
) -> Project {
    Project(
        id: ProjectID(id),
        name: name ?? "Project \(id)",
        purpose: "Test project \(id)",
        status: status,
        nextAction: nextAction,
        priority: priority,
        owner: owner,
        createdAt: createdAt
    )
}

/// Registry pre-loaded with the given projects (added at their createdAt).
func makeRegistry(_ projects: Project...) -> ProjectRegistry {
    var registry = ProjectRegistry()
    for p in projects {
        var copy = p
        let status = p.status
        copy.status = .notStarted
        try! registry.add(copy, at: p.createdAt)
        if status != .notStarted {
            switch status {
            case .active:
                try! registry.setStatus(p.id, to: .active, at: p.createdAt)
            case .completed:
                try! registry.setStatus(p.id, to: .active, at: p.createdAt)
                try! registry.completeProject(p.id, at: p.createdAt)
            case .dormant:
                try! registry.setStatus(p.id, to: .active, at: p.createdAt)
                try! registry.setStatus(p.id, to: .dormant, at: p.createdAt)
            case .archived:
                try! registry.archive(p.id, at: p.createdAt)
            case .cancelled:
                try! registry.setStatus(p.id, to: .active, at: p.createdAt)
                try! registry.setStatus(p.id, to: .cancelled, at: p.createdAt)
            case .notStarted:
                break
            }
        }
    }
    return registry
}
