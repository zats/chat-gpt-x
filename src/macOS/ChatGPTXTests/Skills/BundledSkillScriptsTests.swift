import Foundation
import XCTest

@MainActor
final class BundledSkillScriptsTests: XCTestCase {
    private nonisolated(unsafe) var rootURL: URL!

    override func setUpWithError() throws {
        rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: rootURL,
            withIntermediateDirectories: true
        )
    }

    override func tearDownWithError() throws {
        if let rootURL {
            try? FileManager.default.removeItem(at: rootURL)
        }
    }

    func testSeedCopiesOnlyComponentsAndExactLockWithoutChangingSource() throws {
        let source = try makeSourceStore(named: "source", apiVersion: "1.5.2")
        let destination = rootURL.appendingPathComponent("destination")
        let sourcePayload = source
            .appendingPathComponent("components/chatgpt-api/1.5.2/types.d.ts")
        let originalPayload = try Data(contentsOf: sourcePayload)

        let result = try runSeed(
            source: source,
            destination: destination,
            apiVersion: "1.5.2"
        )

        XCTAssertEqual(result.status, 0, result.error)
        XCTAssertEqual(
            try Data(
                contentsOf: destination.appendingPathComponent(
                    "components/chatgpt-api/1.5.2/types.d.ts"
                )
            ),
            originalPayload
        )
        XCTAssertEqual(try Data(contentsOf: sourcePayload), originalPayload)
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: destination.appendingPathComponent("state/private.json").path
            )
        )
    }

    func testSeedRejectsAnAPIChangeWithoutCreatingDestination() throws {
        let source = try makeSourceStore(named: "mismatch", apiVersion: "1.5.3")
        let destination = rootURL.appendingPathComponent("mismatch-destination")

        let result = try runSeed(
            source: source,
            destination: destination,
            apiVersion: "1.5.2"
        )

        XCTAssertNotEqual(result.status, 0)
        XCTAssertTrue(result.error.contains("changed from 1.5.2 to 1.5.3"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path))
    }

    func testSeedRejectsAComponentSymbolicLink() throws {
        let source = try makeSourceStore(named: "symlink", apiVersion: "1.5.2")
        let link = source.appendingPathComponent("components/linked-types.d.ts")
        try FileManager.default.createSymbolicLink(
            at: link,
            withDestinationURL: source.appendingPathComponent(
                "components/chatgpt-api/1.5.2/types.d.ts"
            )
        )
        let destination = rootURL.appendingPathComponent("symlink-destination")

        let result = try runSeed(
            source: source,
            destination: destination,
            apiVersion: "1.5.2"
        )

        XCTAssertNotEqual(result.status, 0)
        XCTAssertTrue(result.error.contains("contains a symbolic link"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path))
    }

    func testCreateReservesDestinationAndPreservesUnicodeDisplayName() throws {
        let store = try makeSourceStore(
            named: "create-home/extensions",
            apiVersion: "1.5.2"
        )
        try Data().write(to: store.appendingPathComponent("update.lock"))
        let codexHome = store.deletingLastPathComponent()
        let destination = rootURL.appendingPathComponent("created-extension")
        let displayName = "Tom’s R&D | \"Café\" \\ Tools"

        let result = try runCreate(
            destination: destination,
            extensionID: "local-tools",
            displayName: displayName,
            sourceCodexHome: codexHome
        )

        XCTAssertEqual(result.status, 0, result.error)
        let manifestData = try Data(
            contentsOf: destination.appendingPathComponent("package.json")
        )
        let manifest = try XCTUnwrap(
            JSONSerialization.jsonObject(with: manifestData) as? [String: Any]
        )
        XCTAssertEqual(manifest["id"] as? String, "local-tools")
        XCTAssertEqual(manifest["name"] as? String, displayName)
        XCTAssertEqual(
            (manifest["compatibility"] as? [String: String])?["chatgptApi"],
            "^1.5.2"
        )
        XCTAssertEqual(
            try String(
                contentsOf: destination.appendingPathComponent(
                    ".chatgptx-api-version"
                ),
                encoding: .utf8
            ),
            "1.5.2\n"
        )
    }

    func testCreateDoesNotChangeAnExistingDestination() throws {
        let store = try makeSourceStore(
            named: "existing-home/extensions",
            apiVersion: "1.5.2"
        )
        try Data().write(to: store.appendingPathComponent("update.lock"))
        let destination = rootURL.appendingPathComponent("existing-project")
        try FileManager.default.createDirectory(
            at: destination,
            withIntermediateDirectories: true
        )
        let sentinel = destination.appendingPathComponent("owned.txt")
        let original = Data("owned by user\n".utf8)
        try original.write(to: sentinel)

        let result = try runCreate(
            destination: destination,
            extensionID: "local-tools",
            displayName: "Local Tools",
            sourceCodexHome: store.deletingLastPathComponent()
        )

        XCTAssertNotEqual(result.status, 0)
        XCTAssertEqual(try Data(contentsOf: sentinel), original)
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: destination.appendingPathComponent("package.json").path
            )
        )
    }

    func testCreateRemovesItsReservedDestinationAfterFailure() throws {
        let store = try makeSourceStore(
            named: "failed-home/extensions",
            apiVersion: "1.5.2"
        )
        try Data().write(to: store.appendingPathComponent("update.lock"))
        try FileManager.default.removeItem(
            at: store.appendingPathComponent(
                "components/chatgpt-api/1.5.2/types.d.ts"
            )
        )
        let destination = rootURL.appendingPathComponent("failed-project")

        let result = try runCreate(
            destination: destination,
            extensionID: "local-tools",
            displayName: "Local Tools",
            sourceCodexHome: store.deletingLastPathComponent()
        )

        XCTAssertNotEqual(result.status, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path))
    }

    func testWatchdogUsesExplicitTemporaryRootWhenLaunchdOmitsTMPDIR() throws {
        let session = try makeWatchdogSession()
        defer { try? FileManager.default.removeItem(at: session) }
        let state = rootURL.appendingPathComponent("watchdog-state")
        let launcher = try makeFakeProcessTool(
            state: state,
            mode: "stop"
        )

        let result = try runWatchdog(
            session: session,
            lifetime: 1,
            launcher: launcher,
            state: state
        )

        XCTAssertEqual(result.status, 0, result.error)
        XCTAssertFalse(FileManager.default.fileExists(atPath: session.path))
        XCTAssertEqual(
            try String(
                contentsOf: state.appendingPathComponent("signals"),
                encoding: .utf8
            ),
            "TERM\n"
        )
    }

    func testWatchdogKeepsPurgingUntilNativeRecordsRecover() throws {
        let session = try makeWatchdogSession()
        defer { try? FileManager.default.removeItem(at: session) }
        let testPackage = session.appendingPathComponent("test-package")
        try FileManager.default.createDirectory(
            at: testPackage,
            withIntermediateDirectories: true
        )
        let state = rootURL.appendingPathComponent("invalid-watchdog-state")
        let launcher = try makeFakeProcessTool(
            state: state,
            mode: "fail-twice-after-start"
        )

        let result = try runWatchdog(
            session: session,
            lifetime: 4,
            launcher: launcher,
            state: state
        )

        XCTAssertEqual(result.status, 0, result.error)
        XCTAssertFalse(FileManager.default.fileExists(atPath: session.path))
        let purges = try String(
            contentsOf: state.appendingPathComponent("purges"),
            encoding: .utf8
        ).split(separator: "\n")
        XCTAssertGreaterThanOrEqual(purges.count, 2)
    }

    func testWatchdogRemovesAnAnchoredSessionThatNeverStarts() throws {
        let session = try makeWatchdogSession()
        defer { try? FileManager.default.removeItem(at: session) }
        try Data("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n".utf8)
            .write(to: session.appendingPathComponent(".chatgpt-executable"))
        let state = rootURL.appendingPathComponent("empty-watchdog-state")
        let launcher = try makeFakeProcessTool(
            state: state,
            mode: "empty"
        )

        let result = try runWatchdog(
            session: session,
            lifetime: 1,
            launcher: launcher,
            state: state
        )

        XCTAssertEqual(result.status, 0, result.error)
        XCTAssertFalse(FileManager.default.fileExists(atPath: session.path))
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: state.appendingPathComponent("purges").path
            )
        )
    }

    private func makeSourceStore(
        named name: String,
        apiVersion: String
    ) throws -> URL {
        let source = rootURL.appendingPathComponent(name, isDirectory: true)
        let apiDirectory = source.appendingPathComponent(
            "components/chatgpt-api/\(apiVersion)",
            isDirectory: true
        )
        try FileManager.default.createDirectory(
            at: apiDirectory,
            withIntermediateDirectories: true
        )
        try Data("interface PlatformApi {}\n".utf8).write(
            to: apiDirectory.appendingPathComponent("types.d.ts")
        )
        let lock = [
            "chatgptApi": [
                "path": "components/chatgpt-api/\(apiVersion)",
                "version": apiVersion,
            ],
        ]
        try JSONSerialization.data(
            withJSONObject: lock,
            options: [.prettyPrinted, .sortedKeys]
        ).write(to: source.appendingPathComponent("versions-lock.json"))
        let stateDirectory = source.appendingPathComponent("state")
        try FileManager.default.createDirectory(
            at: stateDirectory,
            withIntermediateDirectories: true
        )
        try Data("must not be copied\n".utf8).write(
            to: stateDirectory.appendingPathComponent("private.json")
        )
        return source
    }

    private func makeWatchdogSession() throws -> URL {
        let session = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "chatgptx-extension-test.\(UUID().uuidString)",
                isDirectory: true
            )
        for relativePath in ["electron-profile", "codex-home", "process-groups"] {
            try FileManager.default.createDirectory(
                at: session.appendingPathComponent(relativePath),
                withIntermediateDirectories: true
            )
        }
        try Data("chatgptx-extension-test-v1\n".utf8).write(
            to: session.appendingPathComponent(".chatgptx-extension-test")
        )
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: session.appendingPathComponent(
                ".chatgptx-extension-test"
            ).path
        )
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700],
            ofItemAtPath: session.path
        )
        return session
    }

    private func makeFakeProcessTool(state: URL, mode: String) throws -> URL {
        let executable = rootURL.appendingPathComponent("fake-process-tool")
        try FileManager.default.createDirectory(
            at: state,
            withIntermediateDirectories: true
        )
        try Data(mode.utf8).write(to: state.appendingPathComponent("mode"))
        if mode != "empty" {
            try Data("live\n".utf8).write(
                to: state.appendingPathComponent("live")
            )
        }
        let source = #"""
        #!/bin/bash
        set -u
        state="${CHATGPTX_FAKE_PROCESS_STATE:?}"
        [[ "$1" == "--extension-test-process" ]] || exit 64
        command_name="$2"
        mode="$(<"$state/mode")"
        case "$command_name" in
          list)
            count=0
            [[ -f "$state/list-count" ]] && count="$(<"$state/list-count")"
            printf '%s\n' "$((count + 1))" > "$state/list-count"
            if [[ "$mode" == "fail-twice-after-start" &&
              "$count" -gt 0 && "$count" -lt 3 ]]; then
              exit 1
            fi
            [[ -f "$state/live" ]] && printf '4242\n'
            exit 0
            ;;
          signal)
            printf '%s\n' "$4" >> "$state/signals"
            /bin/rm -f -- "$state/live"
            ;;
          purge)
            printf 'purge\n' >> "$state/purges"
            /bin/rm -rf -- \
              "$3/codex-home" "$3/electron-profile" "$3/test-package"
            ;;
          remove)
            /bin/rm -rf -- "$3"
            ;;
          *)
            exit 64
            ;;
        esac
        """#.replacingOccurrences(of: "        ", with: "")
        try Data(source.utf8).write(to: executable)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o755],
            ofItemAtPath: executable.path
        )
        return executable
    }

    private func runWatchdog(
        session: URL,
        lifetime: TimeInterval,
        launcher: URL,
        state: URL
    ) throws -> (status: Int32, error: String) {
        let scriptURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(
                "ChatGPTX/Resources/Skills/build-chatgptx-extensions/scripts/session-watchdog.sh"
            )
        let now = Date().timeIntervalSince1970
        let errorPipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [
            scriptURL.path,
            session.path,
            String(Int(now + 3)),
            String(Int(now + lifetime)),
            launcher.path,
            session.deletingLastPathComponent().path,
            "1",
            "com.chatgptx.launcher.extension-test.unit-test",
        ]
        var environment = ProcessInfo.processInfo.environment
        environment.removeValue(forKey: "TMPDIR")
        environment["CHATGPTX_FAKE_PROCESS_STATE"] = state.path
        process.environment = environment
        process.standardError = errorPipe
        try process.run()
        process.waitUntilExit()
        return (
            process.terminationStatus,
            String(
                decoding: errorPipe.fileHandleForReading.readDataToEndOfFile(),
                as: UTF8.self
            )
        )
    }

    private func runSeed(
        source: URL,
        destination: URL,
        apiVersion: String
    ) throws -> (status: Int32, error: String) {
        let scriptURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(
                "ChatGPTX/Resources/Skills/build-chatgptx-extensions/scripts/seed-test-components.sh"
            )
        let errorPipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [
            scriptURL.path,
            source.path,
            destination.path,
            apiVersion,
        ]
        process.standardError = errorPipe
        try process.run()
        process.waitUntilExit()
        return (
            process.terminationStatus,
            String(
                decoding: errorPipe.fileHandleForReading.readDataToEndOfFile(),
                as: UTF8.self
            )
        )
    }

    private func runCreate(
        destination: URL,
        extensionID: String,
        displayName: String,
        sourceCodexHome: URL
    ) throws -> (status: Int32, output: String, error: String) {
        let scriptURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(
                "ChatGPTX/Resources/Skills/build-chatgptx-extensions/scripts/create-extension.sh"
            )
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [
            scriptURL.path,
            destination.path,
            extensionID,
            displayName,
        ]
        var environment = ProcessInfo.processInfo.environment
        environment["CODEX_HOME"] = sourceCodexHome.path
        process.environment = environment
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        try process.run()
        process.waitUntilExit()
        return (
            process.terminationStatus,
            String(
                decoding: outputPipe.fileHandleForReading.readDataToEndOfFile(),
                as: UTF8.self
            ),
            String(
                decoding: errorPipe.fileHandleForReading.readDataToEndOfFile(),
                as: UTF8.self
            )
        )
    }
}
