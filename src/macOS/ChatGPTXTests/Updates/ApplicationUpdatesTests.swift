@testable import ChatGPTX
import XCTest

@MainActor
final class ApplicationUpdatesTests: XCTestCase {
    func testMenuPresentationsCoverEveryUpdateState() {
        XCTAssertEqual(
            ApplicationUpdateState.idle.menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "Check for Updates…",
                action: .check
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.checking.menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "Checking for Updates…"
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.available(version: "1.3.0")
                .menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "ChatGPTX 1.3.0 Available…",
                action: .check
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.downloading(version: "1.3.0")
                .menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "Downloading ChatGPTX 1.3.0…"
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.ready(version: "1.3.0")
                .menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "Install ChatGPTX 1.3.0 and Restart…",
                action: .install
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.installing(version: "1.3.0")
                .menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "Installing ChatGPTX 1.3.0…"
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.upToDate.menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "ChatGPTX Is Up to Date — Check Again…",
                action: .check
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.failed(message: "Offline")
                .menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "Update Check Failed — Try Again…",
                action: .check,
                toolTip: "Offline"
            )
        )
        XCTAssertEqual(
            ApplicationUpdateState.unavailable.menuPresentation,
            ApplicationUpdateMenuPresentation(
                title: "App Updates Unavailable"
            )
        )
    }

    func testMenuItemEnablesOnlyAvailableActions() {
        var actions: [ApplicationUpdateAction] = []
        let controller = ApplicationUpdateMenuItemController {
            actions.append($0)
        }

        controller.show(.checking)
        XCTAssertEqual(controller.menuItem.title, "Checking for Updates…")
        XCTAssertFalse(controller.menuItem.isEnabled)
        controller.performCurrentAction()
        XCTAssertEqual(actions, [])

        controller.show(.failed(message: "The network is unavailable."))
        XCTAssertTrue(controller.menuItem.isEnabled)
        XCTAssertEqual(
            controller.menuItem.toolTip,
            "The network is unavailable."
        )
        controller.performCurrentAction()
        XCTAssertEqual(actions, [.check])

        controller.show(.ready(version: "1.3.0"))
        XCTAssertTrue(controller.menuItem.isEnabled)
        XCTAssertNil(controller.menuItem.toolTip)
        controller.performCurrentAction()
        XCTAssertEqual(actions, [.check, .install])
    }

    func testNoUpdateAbortKeepsUpToDateState() {
        let error = NSError(
            domain: "SUSparkleErrorDomain",
            code: 1001
        )

        XCTAssertEqual(
            ApplicationUpdateController.stateForAbortedUpdate(error),
            .upToDate
        )
    }

    func testRealAbortShowsFailureState() {
        let error = NSError(
            domain: NSURLErrorDomain,
            code: NSURLErrorCannotConnectToHost,
            userInfo: [NSLocalizedDescriptionKey: "The appcast is invalid."]
        )

        XCTAssertEqual(
            ApplicationUpdateController.stateForAbortedUpdate(error),
            .failed(message: "The appcast is invalid.")
        )
    }
}
