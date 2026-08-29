@testable import ChatGPTX
import Foundation
import XCTest

@MainActor
final class LauncherSettingsModelTests: XCTestCase {
    func testUnavailableExtensionsKeepShowActionAndOfferRestart() {
        let model = LauncherSettingsModel(
            userDefaults: isolatedUserDefaults()
        )
        model.showStatus(
            ChatGPTStatusSnapshot(
                applicationURL: URL(fileURLWithPath: "/Applications/ChatGPT.app"),
                applicationVersion: "26.825.41651",
                runtimeStatus: .extensionsUnavailable
            )
        )

        XCTAssertEqual(model.primaryChatGPTActionTitle, "Show ChatGPT")
        XCTAssertTrue(model.showsRestartAction)

        var didShowRunningChatGPT = false
        var requestedRestarts: [Bool] = []
        model.onShowRunningChatGPT = { didShowRunningChatGPT = true }
        model.onOpenChatGPT = { requestedRestarts.append($0) }
        model.performPrimaryChatGPTAction()
        model.openChatGPT(forceRestart: true)
        XCTAssertTrue(didShowRunningChatGPT)
        XCTAssertEqual(requestedRestarts, [true])
    }

    func testRunningChatGPTDoesNotOfferRestart() {
        let model = LauncherSettingsModel(
            userDefaults: isolatedUserDefaults()
        )
        model.showStatus(
            ChatGPTStatusSnapshot(
                applicationURL: URL(fileURLWithPath: "/Applications/ChatGPT.app"),
                applicationVersion: "26.825.41651",
                runtimeStatus: .running
            )
        )

        XCTAssertEqual(model.primaryChatGPTActionTitle, "Show ChatGPT")
        XCTAssertFalse(model.showsRestartAction)

        var didShowRunningChatGPT = false
        var openActions: [Bool] = []
        model.onShowRunningChatGPT = { didShowRunningChatGPT = true }
        model.onOpenChatGPT = { openActions.append($0) }
        model.performPrimaryChatGPTAction()
        XCTAssertFalse(didShowRunningChatGPT)
        XCTAssertEqual(openActions, [false])
    }

    func testPaneSelectionPersists() {
        let defaults = isolatedUserDefaults()
        let model = LauncherSettingsModel(userDefaults: defaults)

        model.selectedPane = .components

        XCTAssertEqual(
            LauncherSettingsModel(userDefaults: defaults).selectedPane,
            .components
        )
    }

    func testSystemLaunchAtLoginRefreshDoesNotRepeatCallback() {
        let model = LauncherSettingsModel(
            userDefaults: isolatedUserDefaults()
        )
        var changes: [Bool] = []
        model.onSetLaunchAtLogin = { changes.append($0) }

        model.setLaunchAtLogin(true)
        XCTAssertTrue(changes.isEmpty)

        model.launchAtLogin = false
        XCTAssertEqual(changes, [false])
    }

    private func isolatedUserDefaults() -> UserDefaults {
        let suiteName = "LauncherSettingsModelTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return defaults
    }
}
