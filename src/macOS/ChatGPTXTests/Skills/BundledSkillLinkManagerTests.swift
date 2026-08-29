@testable import ChatGPTX
import Foundation
import XCTest

@MainActor
final class BundledSkillLinkManagerTests: XCTestCase {
    private nonisolated(unsafe) var rootURL: URL!
    private nonisolated(unsafe) var sourceURL: URL!
    private nonisolated(unsafe) var codexHomeURL: URL!

    override func setUpWithError() throws {
        rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        sourceURL = rootURL
            .appendingPathComponent("App With Spaces", isDirectory: true)
            .appendingPathComponent("build-chatgptx-extensions", isDirectory: true)
        codexHomeURL = rootURL
            .appendingPathComponent("Codex Home", isDirectory: true)
        try FileManager.default.createDirectory(
            at: sourceURL,
            withIntermediateDirectories: true
        )
        try Self.createSkillFixture(at: sourceURL)
    }

    override func tearDownWithError() throws {
        if let rootURL {
            try? FileManager.default.removeItem(at: rootURL)
        }
    }

    func testInstallCreatesOneAbsoluteSkillLinkAndIsIdempotent() throws {
        let manager = makeManager()

        XCTAssertEqual(manager.state(), .available)
        try manager.install()

        XCTAssertEqual(manager.state(), .installed)
        let destination = manager.destinationURL
        XCTAssertEqual(
            try FileManager.default.destinationOfSymbolicLink(
                atPath: destination.path
            ),
            sourceURL.path
        )
        XCTAssertEqual(
            try FileManager.default.attributesOfItem(
                atPath: destination.deletingLastPathComponent().path
            )[.posixPermissions] as? NSNumber,
            NSNumber(value: 0o700)
        )
        try manager.install()
        XCTAssertEqual(manager.state(), .installed)
    }

    func testExistingFileIsNotReplaced() throws {
        let manager = makeManager()
        try FileManager.default.createDirectory(
            at: manager.destinationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let original = Data("owned by user\n".utf8)
        try original.write(to: manager.destinationURL)

        assertConflict(manager.state(), contains: manager.destinationURL.path)
        XCTAssertThrowsError(try manager.install())
        XCTAssertEqual(try Data(contentsOf: manager.destinationURL), original)
    }

    func testExistingDirectoryIsNotReplaced() throws {
        let manager = makeManager()
        try FileManager.default.createDirectory(
            at: manager.destinationURL,
            withIntermediateDirectories: true
        )

        assertConflict(manager.state(), contains: manager.destinationURL.path)
        XCTAssertThrowsError(try manager.install())
        var isDirectory: ObjCBool = false
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: manager.destinationURL.path,
                isDirectory: &isDirectory
            )
        )
        XCTAssertTrue(isDirectory.boolValue)
    }

    func testDifferentAndDanglingLinksAreNotReplaced() throws {
        for target in ["../other-skill", "../missing-skill"] {
            let home = rootURL.appendingPathComponent(
                UUID().uuidString,
                isDirectory: true
            )
            let manager = BundledSkillLinkManager(
                sourceURL: sourceURL,
                codexHomeURL: home
            )
            try FileManager.default.createDirectory(
                at: manager.destinationURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.createSymbolicLink(
                atPath: manager.destinationURL.path,
                withDestinationPath: target
            )

            assertConflict(manager.state(), contains: target)
            XCTAssertThrowsError(try manager.install())
            XCTAssertEqual(
                try FileManager.default.destinationOfSymbolicLink(
                    atPath: manager.destinationURL.path
                ),
                target
            )
        }
    }

    func testRelativeLinkToExactSourceIsInstalled() throws {
        let manager = makeManager()
        let skillsURL = manager.destinationURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: skillsURL,
            withIntermediateDirectories: true
        )
        let relative = "../../App With Spaces/build-chatgptx-extensions"
        try FileManager.default.createSymbolicLink(
            atPath: manager.destinationURL.path,
            withDestinationPath: relative
        )

        XCTAssertEqual(manager.state(), .installed)
    }

    func testIndirectLinkToSourceIsAConflict() throws {
        let manager = makeManager()
        let skillsURL = manager.destinationURL.deletingLastPathComponent()
        let aliasURL = rootURL.appendingPathComponent("skill-alias")
        try FileManager.default.createDirectory(
            at: skillsURL,
            withIntermediateDirectories: true
        )
        try FileManager.default.createSymbolicLink(
            at: aliasURL,
            withDestinationURL: sourceURL
        )
        try FileManager.default.createSymbolicLink(
            at: manager.destinationURL,
            withDestinationURL: aliasURL
        )

        assertConflict(manager.state(), contains: aliasURL.path)
    }

    func testTranslocatedSourceCannotBeInstalled() throws {
        let translocatedSource = rootURL
            .appendingPathComponent("AppTranslocation", isDirectory: true)
            .appendingPathComponent(
                BundledSkillLinkManager.skillName,
                isDirectory: true
            )
        try FileManager.default.createDirectory(
            at: translocatedSource,
            withIntermediateDirectories: true
        )
        try Self.createSkillFixture(at: translocatedSource)
        let manager = BundledSkillLinkManager(
            sourceURL: translocatedSource,
            codexHomeURL: codexHomeURL
        )

        XCTAssertEqual(manager.state(), .unstableSource)
        XCTAssertThrowsError(try manager.install())
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: manager.destinationURL.path)
        )
    }

    func testCodexHomeResolutionUsesOverrideOrDefaultHome() {
        let override = BundledSkillLinkManager.codexHomeURL(
            environment: ["CODEX_HOME": "/tmp/custom-codex-home"],
            fileManager: .default
        )
        XCTAssertEqual(override.path, "/tmp/custom-codex-home")

        let defaultHome = BundledSkillLinkManager.codexHomeURL(
            environment: [:],
            fileManager: .default
        )
        XCTAssertEqual(
            defaultHome,
            FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".codex", isDirectory: true)
        )
    }

    func testMissingSkillSourceIsUnavailableAndDoesNotMutateDestination() {
        let manager = BundledSkillLinkManager(
            sourceURL: rootURL.appendingPathComponent("missing"),
            codexHomeURL: codexHomeURL
        )

        XCTAssertEqual(manager.state(), .unavailable)
        XCTAssertThrowsError(try manager.install())
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: manager.destinationURL.path)
        )
    }

    func testPartialSkillSourceIsUnavailable() throws {
        let partialSource = rootURL.appendingPathComponent(
            "partial-skill",
            isDirectory: true
        )
        try FileManager.default.createDirectory(
            at: partialSource,
            withIntermediateDirectories: true
        )
        try Data("skill\n".utf8).write(
            to: partialSource.appendingPathComponent("SKILL.md")
        )
        let manager = BundledSkillLinkManager(
            sourceURL: partialSource,
            codexHomeURL: codexHomeURL
        )

        XCTAssertEqual(manager.state(), .unavailable)
        XCTAssertThrowsError(try manager.install())
    }

    func testPresentationStatesAreExplicit() {
        XCTAssertEqual(
            BundledSkillLinkState.available.presentation,
            BundledSkillLinkPresentation(
                status: "Create local extensions with Codex.",
                buttonTitle: "Install Skill",
                buttonEnabled: true
            )
        )
        XCTAssertFalse(
            BundledSkillLinkState.installed.presentation.buttonEnabled
        )
        let conflict = BundledSkillLinkState.conflict("Resolve this path.")
        XCTAssertEqual(conflict.presentation.status, "Resolve this path.")
        XCTAssertFalse(conflict.presentation.buttonEnabled)
        XCTAssertFalse(
            BundledSkillLinkState.unstableSource.presentation.buttonEnabled
        )
        XCTAssertFalse(
            BundledSkillLinkState.unavailable.presentation.buttonEnabled
        )
    }

    private func makeManager() -> BundledSkillLinkManager {
        BundledSkillLinkManager(
            sourceURL: sourceURL,
            codexHomeURL: codexHomeURL
        )
    }

    private func assertConflict(
        _ state: BundledSkillLinkState,
        contains text: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        guard case let .conflict(explanation) = state else {
            XCTFail("Expected a conflict, got \(state).", file: file, line: line)
            return
        }
        XCTAssertTrue(
            explanation.contains(text),
            "The conflict did not identify \(text): \(explanation)",
            file: file,
            line: line
        )
    }

    private nonisolated static func createSkillFixture(at root: URL) throws {
        let regularFiles = [
            "SKILL.md",
            "agents/openai.yaml",
            "references/authoring-guide.md",
            "references/platform-api.d.ts",
            "assets/test-codex-global-state.json",
            "assets/extension-template/package.json.template",
            "assets/extension-template/contents/main.js",
            "assets/extension-template/sdk/extension-storage.js",
            "assets/extension-template/sdk/extension-storage.d.ts",
            "scripts/check-javascript.js",
            "scripts/bundle-javascript.js",
            "scripts/instrument-test-package.js",
            "scripts/record-test-session.cjs",
        ]
        let executableFiles = [
            "scripts/build-extension.sh",
            "scripts/create-extension.sh",
            "scripts/resolve-active-api.sh",
            "scripts/seed-test-components.sh",
            "scripts/session-watchdog.sh",
            "scripts/test-extension.sh",
        ]
        for relativePath in regularFiles + executableFiles {
            let fileURL = root.appendingPathComponent(relativePath)
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try Data("fixture\n".utf8).write(to: fileURL)
        }
        for relativePath in executableFiles {
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o755],
                ofItemAtPath: root.appendingPathComponent(relativePath).path
            )
        }
    }
}
