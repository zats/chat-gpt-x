import Foundation
import XCTest

@testable import ChatGPTX

final class ChatGPTLauncherDiagnosticsTests: XCTestCase {
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
