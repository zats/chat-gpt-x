@testable import ChatGPTX
import XCTest

@MainActor
final class ExtensionTestSelectionTests: XCTestCase {
    func testExtensionTestLoadsRequiredManagerBeforeLocalExtensions() throws {
        let selected = try ChatGPTLauncher.selectExtensions(
            for: .extensionTest,
            installedExtensions: [
                LaunchExtension(id: "extensions", path: "/installed/manager"),
            ],
            localExtensions: [
                LaunchExtension(id: "z-local", path: "/local/z"),
                LaunchExtension(id: "a-local", path: "/local/a"),
            ]
        )

        XCTAssertEqual(selected.map(\.id), ["extensions", "a-local", "z-local"])
    }

    func testExtensionTestRejectsEmptyAndReservedOverrides() {
        XCTAssertThrowsError(
            try ChatGPTLauncher.selectExtensions(
                for: .extensionTest,
                installedExtensions: [],
                localExtensions: []
            )
        )
        for id in ["extensions", "api-test-suite"] {
            XCTAssertThrowsError(
                try ChatGPTLauncher.selectExtensions(
                    for: .extensionTest,
                    installedExtensions: [],
                    localExtensions: [
                        LaunchExtension(id: id, path: "/local/\(id)"),
                    ]
                )
            )
        }
    }

    func testAPITestStillSelectsOnlyTheLastExplicitSuite() throws {
        let selected = try ChatGPTLauncher.selectExtensions(
            for: .apiTest,
            installedExtensions: [
                LaunchExtension(id: "extensions", path: "/installed/manager"),
            ],
            localExtensions: [
                LaunchExtension(id: "api-test-suite", path: "/local/one"),
                LaunchExtension(id: "other", path: "/local/other"),
                LaunchExtension(id: "api-test-suite", path: "/local/two"),
            ]
        )

        XCTAssertEqual(
            selected,
            [LaunchExtension(id: "api-test-suite", path: "/local/two")]
        )
    }
}
