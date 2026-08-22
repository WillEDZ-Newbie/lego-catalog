import XCTest
@testable import TowerCoreTests

fileprivate extension AssessAndTimeTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__AssessAndTimeTests = [
        ("testAssessOneCallCoherence", testAssessOneCallCoherence),
        ("testBitemporalBackfill", testBitemporalBackfill),
        ("testChangesSinceIsAHistorySlice", testChangesSinceIsAHistorySlice),
        ("testStateAsOfReconstructsThePast", testStateAsOfReconstructsThePast)
    ]
}

fileprivate extension PropertyTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__PropertyTests = [
        ("testAttentionQueueIsSoundAndExplained", testAttentionQueueIsSoundAndExplained),
        ("testBlockingGraphAlwaysAcyclic", testBlockingGraphAlwaysAcyclic),
        ("testCompletionIsProvenOrAudited", testCompletionIsProvenOrAudited),
        ("testEventLogIntegrity", testEventLogIntegrity),
        ("testExportImportRoundTrip", testExportImportRoundTrip),
        ("testReplayIdentity", testReplayIdentity),
        ("testRestingStatesExitDeliberately", testRestingStatesExitDeliberately),
        ("testTimeTravelConverges", testTimeTravelConverges)
    ]
}

fileprivate extension TowerLifecycleTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__TowerLifecycleTests = [
        ("testBlockingCycleRejectedAtTheDoor", testBlockingCycleRejectedAtTheDoor),
        ("testCompletionBlockedWithoutOverride", testCompletionBlockedWithoutOverride),
        ("testCreateStartCompleteFlow", testCreateStartCompleteFlow),
        ("testDecisionLineage", testDecisionLineage),
        ("testMilestoneGuardsAndGate", testMilestoneGuardsAndGate),
        ("testRestingStatesNeedDeliberateExits", testRestingStatesNeedDeliberateExits)
    ]
}
@available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
func __TowerCoreTests__allTests() -> [XCTestCaseEntry] {
    return [
        testCase(AssessAndTimeTests.__allTests__AssessAndTimeTests),
        testCase(PropertyTests.__allTests__PropertyTests),
        testCase(TowerLifecycleTests.__allTests__TowerLifecycleTests)
    ]
}