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

fileprivate extension CompatFacadeTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__CompatFacadeTests = [
        ("testBlankOverrideRationaleRejectedLikeV1", testBlankOverrideRationaleRejectedLikeV1),
        ("testV1NamedFlowWorks", testV1NamedFlowWorks)
    ]
}

fileprivate extension ImportValidationTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__ImportValidationTests = [
        ("testEventIDGenerationStaysCollisionSafeAfterValidatedImport", testEventIDGenerationStaysCollisionSafeAfterValidatedImport),
        ("testImportRejectsDuplicateDecisionIdentity", testImportRejectsDuplicateDecisionIdentity),
        ("testImportRejectsDuplicateProjectIdentity", testImportRejectsDuplicateProjectIdentity),
        ("testImportRejectsSmuggledCycleWithPath", testImportRejectsSmuggledCycleWithPath),
        ("testImportRejectsUnknownReferencesAndDuplicateEventIDs", testImportRejectsUnknownReferencesAndDuplicateEventIDs),
        ("testLegalHistoryImportsCleanly", testLegalHistoryImportsCleanly)
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

fileprivate extension QueryAndWorkloadTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__QueryAndWorkloadTests = [
        ("testFluentQueries", testFluentQueries),
        ("testWorkloadReport", testWorkloadReport)
    ]
}

fileprivate extension SampleHistoryTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__SampleHistoryTests = [
        ("testDeterministicAndSubstantial", testDeterministicAndSubstantial)
    ]
}

fileprivate extension SchemaMigrationTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__SchemaMigrationTests = [
        ("testUnsupportedFutureVersionRejected", testUnsupportedFutureVersionRejected),
        ("testV0PayloadMigratesForward", testV0PayloadMigratesForward)
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

fileprivate extension V1IngestTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__V1IngestTests = [
        ("testIngestIsNonDestructiveAndComplete", testIngestIsNonDestructiveAndComplete)
    ]
}
@available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
func __TowerCoreTests__allTests() -> [XCTestCaseEntry] {
    return [
        testCase(AssessAndTimeTests.__allTests__AssessAndTimeTests),
        testCase(CompatFacadeTests.__allTests__CompatFacadeTests),
        testCase(ImportValidationTests.__allTests__ImportValidationTests),
        testCase(PropertyTests.__allTests__PropertyTests),
        testCase(QueryAndWorkloadTests.__allTests__QueryAndWorkloadTests),
        testCase(SampleHistoryTests.__allTests__SampleHistoryTests),
        testCase(SchemaMigrationTests.__allTests__SchemaMigrationTests),
        testCase(TowerLifecycleTests.__allTests__TowerLifecycleTests),
        testCase(V1IngestTests.__allTests__V1IngestTests)
    ]
}