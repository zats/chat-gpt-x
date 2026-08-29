@testable import ChatGPTX
import XCTest

@MainActor
final class ExtensionTestUIProbeTests: XCTestCase {
    func testParsesSessionBoundPressAndWaitCommands() throws {
        XCTAssertEqual(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "press",
                "/private/tmp/chatgptx-extension-test.example",
                "AXPopUpButton",
                "Open profile menu",
            ]),
            .press(
                session: "/private/tmp/chatgptx-extension-test.example",
                role: "AXPopUpButton",
                label: "Open profile menu"
            )
        )
        XCTAssertEqual(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "press-wait",
                "/private/tmp/chatgptx-extension-test.example",
                "AXPopUpButton",
                "Open profile menu",
                "*",
                "Local Skill Check",
                "2.5",
            ]),
            .pressAndWait(
                session: "/private/tmp/chatgptx-extension-test.example",
                pressRole: "AXPopUpButton",
                pressLabel: "Open profile menu",
                observedRole: "*",
                observedLabel: "Local Skill Check",
                timeout: 2.5
            )
        )
        XCTAssertEqual(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "wait",
                "/private/tmp/chatgptx-extension-test.example",
                "*",
                "Local Skill Check",
                "2.5",
            ]),
            .wait(
                session: "/private/tmp/chatgptx-extension-test.example",
                role: "*",
                label: "Local Skill Check",
                timeout: 2.5
            )
        )
    }

    func testRejectsBroadOrMalformedUIProbeCommands() {
        XCTAssertThrowsError(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "press",
                "/private/tmp/chatgptx-extension-test.example",
                "*",
                "",
            ])
        )
        XCTAssertThrowsError(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "wait",
                "/private/tmp/chatgptx-extension-test.example",
                "button",
                "Local Skill Check",
                "31",
            ])
        )
        XCTAssertThrowsError(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "press-wait",
                "/private/tmp/chatgptx-extension-test.example",
                "*",
                "Open profile menu",
                "*",
                "Local Skill Check",
            ])
        )
        XCTAssertThrowsError(
            try ExtensionTestUIProbe.parse(arguments: [
                "--extension-test-ui",
                "snapshot",
                "/private/tmp/chatgptx-extension-test.example",
            ])
        )
    }

    func testSemanticMatchingIsExact() {
        let node = ExtensionTestUIProbe.SemanticNode(
            role: "AXButton",
            title: "Local Skill Check",
            description: nil,
            value: nil,
            identifier: "dev.local.profile-menu-skill-check.local-skill-check"
        )
        XCTAssertTrue(
            node.matches(role: "AXButton", label: "Local Skill Check")
        )
        XCTAssertTrue(node.matches(role: "*", label: "Local Skill Check"))
        XCTAssertFalse(node.matches(role: "AXMenuItem", label: "Local Skill Check"))
        XCTAssertFalse(node.matches(role: "AXButton", label: "Skill Check"))
    }

    func testObservedMatchRequiresOneUniqueMatch() throws {
        XCTAssertFalse(try ExtensionTestUIProbe.hasUniqueObservedMatch(0))
        XCTAssertTrue(try ExtensionTestUIProbe.hasUniqueObservedMatch(1))
        XCTAssertThrowsError(
            try ExtensionTestUIProbe.hasUniqueObservedMatch(2)
        )
    }
}
