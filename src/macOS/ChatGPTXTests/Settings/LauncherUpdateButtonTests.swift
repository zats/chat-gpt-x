@testable import ChatGPTX
import XCTest

@MainActor
final class LauncherUpdateButtonTests: XCTestCase {
    func testResultSymbolsAndLabels() {
        XCTAssertEqual(
            UpdateButtonFeedbackController.defaultResultDuration,
            .seconds(2)
        )
        XCTAssertEqual(
            UpdateButtonFeedbackController.defaultMinimumCheckingDuration,
            .milliseconds(500)
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.reload.systemSymbolName,
            "arrow.clockwise"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.reload.accessibilityLabel,
            "Check for Updates"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.result(.noUpdates).systemSymbolName,
            "checkmark"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.result(.noUpdates)
                .accessibilityLabel,
            "No updates available"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.result(.updateAvailable)
                .systemSymbolName,
            "gift"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.result(.updateAvailable)
                .accessibilityLabel,
            "Update available"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.result(.failure).systemSymbolName,
            "exclamationmark"
        )
        XCTAssertEqual(
            UpdateButtonFeedbackState.result(.failure)
                .accessibilityLabel,
            "Update check failed"
        )
        XCTAssertFalse(
            UpdateButtonFeedbackState.checking.animatesTransition(
                to: .result(.noUpdates)
            )
        )
        XCTAssertTrue(
            UpdateButtonFeedbackState.result(.noUpdates)
                .animatesTransition(to: .reload)
        )
    }

    func testResultWaitsForCheckingToFinishAndThenResets() async throws {
        var observedStates: [UpdateButtonFeedbackState] = []
        let controller = UpdateButtonFeedbackController(
            resultDuration: .milliseconds(100),
            minimumCheckingDuration: .milliseconds(60)
        ) { state in
            observedStates.append(state)
        }

        controller.setChecking(true)
        controller.showResult(.noUpdates)
        XCTAssertEqual(controller.state, .checking)
        XCTAssertEqual(observedStates, [.checking])

        controller.setChecking(false)
        XCTAssertEqual(controller.state, .checking)

        try await Task.sleep(for: .milliseconds(80))
        XCTAssertEqual(controller.state, .result(.noUpdates))

        try await Task.sleep(for: .milliseconds(120))
        XCTAssertEqual(controller.state, .reload)
        XCTAssertEqual(
            observedStates,
            [.checking, .result(.noUpdates), .reload]
        )
    }

    func testStartingCheckCancelsResultTimer() async throws {
        var observedStates: [UpdateButtonFeedbackState] = []
        let controller = UpdateButtonFeedbackController(
            resultDuration: .milliseconds(80),
            minimumCheckingDuration: .zero
        ) { state in
            observedStates.append(state)
        }

        controller.showResult(.updateAvailable)
        XCTAssertEqual(controller.state, .result(.updateAvailable))

        try await Task.sleep(for: .milliseconds(20))
        controller.setChecking(true)
        XCTAssertEqual(controller.state, .checking)

        try await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(controller.state, .checking)
        XCTAssertEqual(
            observedStates,
            [.result(.updateAvailable), .checking]
        )

        controller.showResult(.failure)
        controller.setChecking(false)
        XCTAssertEqual(controller.state, .result(.failure))
    }
}
