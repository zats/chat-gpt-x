import Darwin
import Foundation
import XCTest

@testable import ChatGPTX

@MainActor
final class ExtensionTestSessionRecorderProcessTests: XCTestCase {
    func testRecordRejectsEmbeddedProfileArgumentWithoutSignalingGroup() throws {
        let fixture = try makeFixture()
        defer { fixture.remove() }

        let embeddedArgument =
            "--description=contains --user-data-dir=\(fixture.profileURL.path)"
        let process = try startLeader(
            fixture: fixture,
            shellArguments: [
                "-c",
                "while :; do /bin/sleep 1; done",
                embeddedArgument,
            ]
        )
        let processGroupID = process.processIdentifier
        defer { stopProcessGroup(processGroupID, leader: process) }

        let snapshot = try waitForLeader(
            processID: processGroupID,
            executablePath: fixture.executableURL.path
        )
        XCTAssertEqual(snapshot.processGroupID, processGroupID)
        XCTAssertTrue(snapshot.arguments.contains(embeddedArgument))
        XCTAssertEqual(
            snapshot.arguments.filter { $0.hasPrefix("--user-data-dir=") },
            []
        )

        XCTAssertEqual(
            ExtensionTestSessionRecorder.runIfRequested(arguments: [
                "--extension-test-process",
                "record",
                fixture.sessionURL.path,
                String(processGroupID),
            ]),
            EXIT_FAILURE
        )
        XCTAssertEqual(
            try ExtensionTestSessionRecorder.listedProcessIDs(
                sessionPath: fixture.sessionURL.path
            ),
            []
        )

        XCTAssertEqual(
            ExtensionTestSessionRecorder.runIfRequested(arguments: [
                "--extension-test-process",
                "signal",
                fixture.sessionURL.path,
                "KILL",
            ]),
            EXIT_SUCCESS
        )
        usleep(200_000)

        XCTAssertTrue(process.isRunning)
        guard case let .found(survivingSnapshot) =
            ExtensionTestProcessInspection.snapshot(for: processGroupID)
        else {
            return XCTFail("The rejected process group was signaled.")
        }
        XCTAssertEqual(
            canonicalPath(survivingSnapshot.executablePath),
            canonicalPath(fixture.executableURL.path)
        )
    }

    func testListsAndSignalsOrphanedRecordedGroupMember() throws {
        let fixture = try makeFixture()
        defer { fixture.remove() }

        let gateURL = fixture.sessionURL.appendingPathComponent("spawn-gate")
        let helperPIDURL = fixture.sessionURL.appendingPathComponent(
            "helper.pid"
        )
        let profileArgument = "--user-data-dir=\(fixture.profileURL.path)"
        let script = """
        while [ ! -e "$1" ]; do /bin/sleep 0.02; done
        "\(fixture.helperExecutableURL.path)" 60 &
        printf '%s\\n' "$!" > "$2"
        exit 0
        """
        let process = try startLeader(
            fixture: fixture,
            shellArguments: [
                "-c",
                script,
                profileArgument,
                gateURL.path,
                helperPIDURL.path,
            ]
        )
        let processGroupID = process.processIdentifier
        defer { stopProcessGroup(processGroupID, leader: process) }

        let snapshot = try waitForLeader(
            processID: processGroupID,
            executablePath: fixture.executableURL.path
        )
        XCTAssertEqual(snapshot.processGroupID, processGroupID)
        XCTAssertEqual(
            snapshot.arguments.filter { $0.hasPrefix("--user-data-dir=") },
            [profileArgument]
        )

        XCTAssertEqual(
            ExtensionTestSessionRecorder.runIfRequested(arguments: [
                "--extension-test-process",
                "record",
                fixture.sessionURL.path,
                String(processGroupID),
            ]),
            EXIT_SUCCESS
        )

        try Data().write(to: gateURL)
        let helperPID = try waitForProcessID(at: helperPIDURL)
        try waitForExit(process)

        guard case let .found(helperSnapshot) =
            ExtensionTestProcessInspection.snapshot(for: helperPID)
        else {
            return XCTFail("The orphan helper process is not running.")
        }
        XCTAssertEqual(helperSnapshot.processGroupID, processGroupID)
        XCTAssertEqual(
            canonicalPath(helperSnapshot.executablePath),
            canonicalPath(fixture.helperExecutableURL.path)
        )
        XCTAssertEqual(
            try ExtensionTestSessionRecorder.listedProcessIDs(
                sessionPath: fixture.sessionURL.path
            ),
            [helperPID]
        )

        XCTAssertEqual(
            ExtensionTestSessionRecorder.runIfRequested(arguments: [
                "--extension-test-process",
                "signal",
                fixture.sessionURL.path,
                "KILL",
            ]),
            EXIT_SUCCESS
        )
        try waitForProcessToStop(helperPID)
        XCTAssertEqual(
            try ExtensionTestSessionRecorder.listedProcessIDs(
                sessionPath: fixture.sessionURL.path
            ),
            []
        )
    }

    private struct Fixture {
        let sessionURL: URL
        let profileURL: URL
        let appRootURL: URL
        let executableURL: URL
        let helperExecutableURL: URL

        func remove() {
            try? FileManager.default.removeItem(at: sessionURL)
            try? FileManager.default.removeItem(at: appRootURL)
        }
    }

    private func makeFixture() throws -> Fixture {
        let temporaryURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .resolvingSymlinksInPath().standardizedFileURL
        let nonce = UUID().uuidString
        let appRootURL = temporaryURL.appendingPathComponent(
            "chatgptx-fake-app.\(nonce)",
            isDirectory: true
        )
        let appURL = appRootURL.appendingPathComponent(
            "ChatGPT.app",
            isDirectory: true
        )
        let contentsURL = appURL.appendingPathComponent(
            "Contents",
            isDirectory: true
        )
        let macOSURL = contentsURL.appendingPathComponent(
            "MacOS",
            isDirectory: true
        )
        let executableURL = macOSURL.appendingPathComponent("ChatGPT")
        let helperExecutableURL = appRootURL.appendingPathComponent(
            "external-sleep"
        )
        try FileManager.default.createDirectory(
            at: macOSURL,
            withIntermediateDirectories: true
        )
        try FileManager.default.copyItem(
            at: URL(fileURLWithPath: "/bin/bash"),
            to: executableURL
        )
        try setMode(0o755, at: executableURL)
        try replacePlatformSignature(of: executableURL)
        try FileManager.default.copyItem(
            at: URL(fileURLWithPath: "/bin/sleep"),
            to: helperExecutableURL
        )
        try setMode(0o755, at: helperExecutableURL)
        try replacePlatformSignature(of: helperExecutableURL)

        let propertyList: [String: Any] = [
            "CFBundleExecutable": "ChatGPT",
            "CFBundleIdentifier": "com.openai.codex",
            "CFBundleName": "ChatGPT",
            "CFBundlePackageType": "APPL",
            "CFBundleShortVersionString": "1.0",
            "CFBundleVersion": "1",
        ]
        let propertyListData = try PropertyListSerialization.data(
            fromPropertyList: propertyList,
            format: .xml,
            options: 0
        )
        try propertyListData.write(
            to: contentsURL.appendingPathComponent("Info.plist")
        )

        let sessionURL = temporaryURL.appendingPathComponent(
            "chatgptx-extension-test.\(nonce)",
            isDirectory: true
        )
        let profileURL = sessionURL.appendingPathComponent(
            "electron-profile",
            isDirectory: true
        )
        let codexHomeURL = sessionURL.appendingPathComponent(
            "codex-home",
            isDirectory: true
        )
        let processGroupsURL = sessionURL.appendingPathComponent(
            "process-groups",
            isDirectory: true
        )
        for url in [sessionURL, profileURL, codexHomeURL, processGroupsURL] {
            try FileManager.default.createDirectory(
                at: url,
                withIntermediateDirectories: false
            )
            try setMode(0o700, at: url)
        }

        try writeStrictFile(
            Data("chatgptx-extension-test-v1\n".utf8),
            to: sessionURL.appendingPathComponent(
                ".chatgptx-extension-test"
            )
        )
        try writeStrictFile(
            Data("\(executableURL.path)\n".utf8),
            to: sessionURL.appendingPathComponent(".chatgpt-executable")
        )
        return Fixture(
            sessionURL: sessionURL,
            profileURL: profileURL,
            appRootURL: appRootURL,
            executableURL: executableURL,
            helperExecutableURL: helperExecutableURL
        )
    }

    private func startLeader(
        fixture: Fixture,
        shellArguments: [String]
    ) throws -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        process.arguments = [
            "-MPOSIX",
            "-e",
            "POSIX::setpgid(0, 0); exec { $ARGV[0] } @ARGV; die $!;",
            fixture.executableURL.path,
        ] + shellArguments
        var environment = ProcessInfo.processInfo.environment
        environment["CHATGPTX_EXTENSION_TEST_ROOT"] =
            fixture.sessionURL.path
        process.environment = environment
        try process.run()
        return process
    }

    private func waitForLeader(
        processID: pid_t,
        executablePath: String
    ) throws -> ExtensionTestProcessSnapshot {
        let deadline = Date().addingTimeInterval(5)
        var lastResult = "No process snapshot was available."
        while Date() < deadline {
            switch ExtensionTestProcessInspection.snapshot(for: processID) {
            case let .found(snapshot):
                lastResult =
                    "path=\(snapshot.executablePath), "
                        + "group=\(snapshot.processGroupID), "
                        + "arguments=\(snapshot.arguments)"
                if canonicalPath(snapshot.executablePath)
                    == canonicalPath(executablePath),
                    snapshot.processGroupID == processID
                {
                    return snapshot
                }
            case .notRunning:
                lastResult = "The process is not running."
            case .unavailable:
                lastResult = "The process snapshot is unavailable."
            }
            usleep(20000)
        }
        throw TestError.timedOut(
            "The fake ChatGPT leader did not start. Last result: \(lastResult)"
        )
    }

    private func waitForProcessID(at url: URL) throws -> pid_t {
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            if let data = try? Data(contentsOf: url),
               let value = String(data: data, encoding: .utf8)?
               .trimmingCharacters(in: .whitespacesAndNewlines),
               let processID = pid_t(value),
               processID > 1
            {
                return processID
            }
            usleep(20000)
        }
        throw TestError.timedOut("The helper process ID was not written.")
    }

    private func waitForExit(_ process: Process) throws {
        let deadline = Date().addingTimeInterval(5)
        while process.isRunning, Date() < deadline {
            usleep(20000)
        }
        guard !process.isRunning else {
            throw TestError.timedOut("The fake ChatGPT leader did not exit.")
        }
        process.waitUntilExit()
        guard process.terminationStatus == EXIT_SUCCESS else {
            throw TestError.unexpectedExit(process.terminationStatus)
        }
    }

    private func waitForProcessToStop(_ processID: pid_t) throws {
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            if case .notRunning =
                ExtensionTestProcessInspection.snapshot(for: processID)
            {
                return
            }
            usleep(20000)
        }
        throw TestError.timedOut("The orphan helper process did not stop.")
    }

    private func stopProcessGroup(_ groupID: pid_t, leader: Process) {
        _ = killpg(groupID, SIGKILL)
        if leader.isRunning {
            _ = kill(leader.processIdentifier, SIGKILL)
        }
        leader.waitUntilExit()
    }

    private func writeStrictFile(_ data: Data, to url: URL) throws {
        try data.write(to: url)
        try setMode(0o600, at: url)
    }

    private func replacePlatformSignature(of executableURL: URL) throws {
        try runCodeSign([
            "--remove-signature",
            executableURL.path,
        ])
        try runCodeSign([
            "--force",
            "--sign",
            "-",
            "--identifier",
            "com.openai.codex.test.\(UUID().uuidString)",
            executableURL.path,
        ])
    }

    private func runCodeSign(_ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        process.arguments = arguments
        let errorPipe = Pipe()
        process.standardError = errorPipe
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == EXIT_SUCCESS else {
            let message = String(
                decoding: errorPipe.fileHandleForReading.readDataToEndOfFile(),
                as: UTF8.self
            ).trimmingCharacters(in: .whitespacesAndNewlines)
            throw TestError.signingFailed(message)
        }
    }

    private func setMode(_ mode: mode_t, at url: URL) throws {
        guard chmod(url.path, mode) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
    }

    private func canonicalPath(_ path: String) -> String {
        URL(fileURLWithPath: path).standardizedFileURL
            .resolvingSymlinksInPath().path
    }
}

private enum TestError: LocalizedError {
    case signingFailed(String)
    case timedOut(String)
    case unexpectedExit(Int32)

    var errorDescription: String? {
        switch self {
        case let .signingFailed(message):
            "The fake ChatGPT executable could not be signed: \(message)"
        case let .timedOut(message):
            message
        case let .unexpectedExit(status):
            "The fake ChatGPT leader exited with status \(status)."
        }
    }
}
