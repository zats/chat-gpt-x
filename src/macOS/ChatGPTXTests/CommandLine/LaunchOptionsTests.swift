@testable import ChatGPTX
import Foundation
import XCTest

@MainActor
final class LaunchOptionsTests: XCTestCase {
    func testExtensionTestForwardsOnlyChatGPTArguments() throws {
        let options = try LaunchOptions(arguments: [
            "--test-extension",
            "--extension",
            "/tmp/example-extension",
            "--chatgpt-app=/Applications/ChatGPT.app",
            "--user-data-dir=/tmp/example-profile",
            "--disable-gpu",
        ])

        XCTAssertFalse(options.isAPITest)
        XCTAssertTrue(options.isExtensionTest)
        XCTAssertTrue(options.isIsolatedTest)
        XCTAssertEqual(
            options.extensionURLs,
            [URL(fileURLWithPath: "/tmp/example-extension")]
        )
        XCTAssertEqual(
            options.chatGPTArguments,
            [
                "--user-data-dir=/tmp/example-profile",
                "--disable-gpu",
            ]
        )
    }

    func testNormalLaunchDoesNotForwardUnknownArguments() throws {
        let options = try LaunchOptions(arguments: [
            "--extension",
            "/tmp/example-extension",
            "--user-data-dir=/tmp/must-not-be-used",
        ])

        XCTAssertFalse(options.isIsolatedTest)
        XCTAssertEqual(options.chatGPTArguments, [])
    }

    func testTestModesAreMutuallyExclusive() {
        XCTAssertThrowsError(
            try LaunchOptions(arguments: ["--test-api", "--test-extension"])
        )
    }

    func testExtensionTestRejectsDebugArgumentsBeforeLaunching() {
        let arguments = [
            "--remote-debugging-port=9337",
            "--remote-debugging-pipe",
            "--inspect=9229",
            "--inspect-brk=9229",
            "--inspect-brk-node=9229",
            "--inspect-port=9229",
            "--debug=9229",
            "--debug-brk=9229",
            "--debug-port=9229",
        ]
        for argument in arguments {
            XCTAssertThrowsError(
                try LaunchOptions(arguments: [
                    "--test-extension",
                    "--extension",
                    "/tmp/example-extension",
                    "--user-data-dir=/tmp/example-profile",
                    argument,
                ]),
                "Accepted forbidden debug argument: \(argument)"
            )
        }
    }

    func testExtensionPathMustBeAbsolute() {
        XCTAssertThrowsError(
            try LaunchOptions(arguments: [
                "--test-extension",
                "--extension",
                "relative-extension",
            ])
        )
    }
}
