import Foundation
import XCTest

@testable import ChatGPTX

@MainActor
final class ChatGPTLauncherDiagnosticsTests: XCTestCase {
    func testLaunchEnvironmentIncludesMaterializedDockIconOverlay() {
        let bridgeURL = URL(
            fileURLWithPath: "/tmp/ChatGPTX Build/bridge/main.cjs"
        )
        let versionsLockURL = URL(
            fileURLWithPath: "/tmp/ChatGPTX/versions-lock.json"
        )
        let iconOverlayURL = URL(
            fileURLWithPath:
            "/tmp/ChatGPTX/icon-overlays/overlay.png"
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
                NSUnderlyingErrorKey: underlying,
            ]
        )

        let description = ChatGPTLauncher.diagnosticDescription(for: error)

        XCTAssertTrue(description.contains("Outer failure"))
        XCTAssertTrue(description.contains("TestLaunchDomain 7"))
        XCTAssertTrue(description.contains("Underlying error"))
        XCTAssertTrue(description.contains("Inner failure"))
        XCTAssertTrue(description.contains("TestUnderlyingDomain 42"))
    }

    func testExtensionTestNodeOptionsUseOnlyRecorderThenBridge() {
        let nodeOptionsKey = "NODE_OPTIONS"

        let environment = ChatGPTLauncher.environment(
            requiring: URL(fileURLWithPath: "/tmp/bridge main.cjs"),
            launchConfigurationURL: nil,
            versionsLockURL: URL(fileURLWithPath: "/tmp/versions.json"),
            iconOverlayURL: URL(fileURLWithPath: "/tmp/icon.png"),
            arguments: [],
            mode: .extensionTest,
            baseEnvironment: [
                "CHATGPTX_EXTENSION_TEST_ROOT":
                    "/private/tmp/chatgptx-extension-test.example",
                nodeOptionsKey: "--require /tmp/untrusted.cjs",
            ]
        )

        XCTAssertEqual(
            environment[nodeOptionsKey],
            "--require \"/private/tmp/chatgptx-extension-test.example/record-test-session.cjs\" --require \"/tmp/bridge main.cjs\""
        )
        XCTAssertFalse(
            environment[nodeOptionsKey]?.contains("untrusted.cjs") == true
        )
    }
}
