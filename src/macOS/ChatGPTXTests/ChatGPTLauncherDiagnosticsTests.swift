import Foundation
import XCTest

@testable import ChatGPTX

final class ChatGPTLauncherDiagnosticsTests: XCTestCase {
    @MainActor
    func testLaunchEnvironmentIncludesBundledDockIconOverlay() {
        let bridgeURL = URL(
            fileURLWithPath: "/tmp/ChatGPTX Build/bridge/main.cjs"
        )
        let versionsLockURL = URL(
            fileURLWithPath: "/tmp/ChatGPTX/versions-lock.json"
        )
        let iconOverlayURL = URL(
            fileURLWithPath:
                "/Applications/ChatGPTX.app/Contents/Resources/InjectedDockIconOverlay.png"
        )

        let environment = ChatGPTLauncher.environment(
            requiring: bridgeURL,
            launchConfigurationURL: nil,
            versionsLockURL: versionsLockURL,
            iconOverlayURL: iconOverlayURL,
            arguments: ["--user-data-dir=/tmp/profile", "--flag=value"]
        )

        XCTAssertEqual(
            environment["CHATGPTX_ICON_OVERLAY"],
            iconOverlayURL.path
        )
        XCTAssertEqual(
            environment["CHATGPTX_VERSIONS_LOCK"],
            versionsLockURL.path
        )
        let relaunchArguments = environment["CHATGPTX_RELAUNCH_ARGUMENTS"]
            .flatMap { $0.data(using: .utf8) }
            .flatMap { try? JSONSerialization.jsonObject(with: $0) }
            as? [String]
        XCTAssertEqual(
            relaunchArguments,
            ["--user-data-dir=/tmp/profile", "--flag=value"]
        )
        XCTAssertTrue(
            environment["NODE_OPTIONS"]?.contains(
                "--require \"/tmp/ChatGPTX Build/bridge/main.cjs\""
            ) == true
        )
    }

    func testDiagnosticDescriptionIncludesErrorIdentityAndUnderlyingCause() {
        let underlying = NSError(
            domain: "TestUnderlyingDomain",
            code: 42,
            userInfo: [NSLocalizedDescriptionKey: "Inner failure"]
        )
        let error = NSError(
            domain: "TestLaunchDomain",
            code: 7,
            userInfo: [
                NSLocalizedDescriptionKey: "Outer failure",
                NSUnderlyingErrorKey: underlying
            ]
        )

        let description = ChatGPTLauncher.diagnosticDescription(for: error)

        XCTAssertTrue(description.contains("Outer failure"))
        XCTAssertTrue(description.contains("TestLaunchDomain 7"))
        XCTAssertTrue(description.contains("Underlying error"))
        XCTAssertTrue(description.contains("Inner failure"))
        XCTAssertTrue(description.contains("TestUnderlyingDomain 42"))
    }
}
