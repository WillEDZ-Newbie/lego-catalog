import Foundation

/// Deterministic time source. Every time-sensitive evaluation in the package
/// takes a `now` parameter or a `TowerClock`; nothing reads the wall clock
/// implicitly, so all behaviour is reproducible in tests.
public protocol TowerClock: Sendable {
    func now() -> Date
}

/// Production clock backed by the system time.
public struct SystemClock: TowerClock {
    public init() {}
    public func now() -> Date { Date() }
}

/// Test clock frozen at a fixed instant, advanced explicitly.
public struct FixedClock: TowerClock {
    public var current: Date
    public init(_ current: Date) { self.current = current }
    public func now() -> Date { current }
    public mutating func advance(by interval: TimeInterval) {
        current = current.addingTimeInterval(interval)
    }
}
