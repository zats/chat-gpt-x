import Darwin
import Foundation
import XCTest

@testable import ChatGPTX

@MainActor
final class ExtensionTestProcessInspectionTests: XCTestCase {
    func testProfileArgumentAcceptsOneCanonicalEquivalentPath() throws {
        let temporaryURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .standardizedFileURL.resolvingSymlinksInPath()
        let rootURL = temporaryURL.appendingPathComponent(
            "chatgptx-profile-argument.\(UUID().uuidString)",
            isDirectory: true
        )
        let profileURL = rootURL.appendingPathComponent(
            "electron-profile",
            isDirectory: true
        )
        let aliasURL = temporaryURL.appendingPathComponent(
            "chatgptx-profile-alias.\(UUID().uuidString)"
        )
        try FileManager.default.createDirectory(
            at: profileURL,
            withIntermediateDirectories: true
        )
        try FileManager.default.createSymbolicLink(
            at: aliasURL,
            withDestinationURL: profileURL
        )
        defer {
            try? FileManager.default.removeItem(at: aliasURL)
            try? FileManager.default.removeItem(at: rootURL)
        }

        XCTAssertTrue(ExtensionTestSessionRecorder.hasExactProfileArgument(
            ["--user-data-dir=\(aliasURL.path)"],
            profileURL: profileURL
        ))
        XCTAssertFalse(ExtensionTestSessionRecorder.hasExactProfileArgument(
            [
                "--user-data-dir=\(profileURL.path)",
                "--user-data-dir=\(aliasURL.path)",
            ],
            profileURL: profileURL
        ))
        XCTAssertFalse(ExtensionTestSessionRecorder.hasExactProfileArgument(
            ["--user-data-dir=relative-profile"],
            profileURL: profileURL
        ))
    }

    func testParsesExactArgumentBoundaries() throws {
        let arguments = [
            "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
            "--description=contains --user-data-dir=/tmp/fake",
            "--user-data-dir=/private/tmp/profile with spaces",
            "--flag=value",
        ]
        let data = processArgumentsData(
            executablePath:
            "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
            arguments: arguments,
            environment: [
                "VALUE=--user-data-dir=/tmp/environment-fake",
                "NOTE=contains CHATGPTX_EXTENSION_TEST_ROOT=/tmp/fake",
                "CHATGPTX_EXTENSION_TEST_ROOT=/private/tmp/session with spaces",
            ],
            argumentEnvironmentPadding: 3
        )

        let parsed = try ExtensionTestProcessInspection.parseInvocation(
            from: data
        )

        XCTAssertEqual(parsed.arguments, arguments)
        XCTAssertEqual(
            parsed.arguments.filter { $0.hasPrefix("--user-data-dir=") },
            ["--user-data-dir=/private/tmp/profile with spaces"]
        )
        XCTAssertEqual(parsed.environment, [
            "VALUE=--user-data-dir=/tmp/environment-fake",
            "NOTE=contains CHATGPTX_EXTENSION_TEST_ROOT=/tmp/fake",
            "CHATGPTX_EXTENSION_TEST_ROOT=/private/tmp/session with spaces",
        ])
    }

    func testRejectsTruncatedArgumentData() {
        let data = processArgumentsData(
            executablePath: "/bin/example",
            arguments: ["example", "--flag"]
        ).dropLast()

        XCTAssertThrowsError(
            try ExtensionTestProcessInspection.parseInvocation(from: Data(data))
        )
    }

    func testRejectsAnArgumentCountThatExceedsTheBuffer() {
        var count = CInt.max
        var data = withUnsafeBytes(of: &count) { Data($0) }
        data.append(contentsOf: "/bin/example".utf8)
        data.append(0)

        XCTAssertThrowsError(
            try ExtensionTestProcessInspection.parseInvocation(from: data)
        )
    }

    func testStartIdentityUsesCanonicalMicroseconds() {
        let identity = ExtensionTestProcessStartIdentity(
            seconds: 1_725_000_000,
            microseconds: 42
        )

        XCTAssertEqual(identity.serialized, "1725000000.000042")
        XCTAssertEqual(
            ExtensionTestProcessStartIdentity(
                serialized: identity.serialized
            ),
            identity
        )
        XCTAssertNil(ExtensionTestProcessStartIdentity(
            serialized: "1725000000.42"
        ))
    }

    func testReadsCurrentProcessSnapshot() throws {
        guard case let .found(snapshot) =
            ExtensionTestProcessInspection.snapshot(
                for: ProcessInfo.processInfo.processIdentifier
            )
        else {
            return XCTFail("The current process snapshot is unavailable.")
        }

        XCTAssertEqual(
            snapshot.processID,
            ProcessInfo.processInfo.processIdentifier
        )
        XCTAssertTrue(snapshot.executablePath.hasPrefix("/"))
        XCTAssertFalse(snapshot.arguments.isEmpty)
        XCTAssertFalse(snapshot.environment.isEmpty)
        XCTAssertLessThan(snapshot.startIdentity.microseconds, 1_000_000)
    }

    func testReadsExactSessionEnvironmentFromExternalHelper() throws {
        let sessionPath = "/private/tmp/chatgptx-extension-test.with spaces"
        let helperDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("chatgptx-process-helper.\(UUID().uuidString)")
        let helperURL = helperDirectory.appendingPathComponent("sleep")
        try FileManager.default.createDirectory(
            at: helperDirectory,
            withIntermediateDirectories: false
        )
        try FileManager.default.copyItem(
            at: URL(fileURLWithPath: "/bin/sleep"),
            to: helperURL
        )
        let removeSignature = Process()
        removeSignature.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        removeSignature.arguments = ["--remove-signature", helperURL.path]
        try removeSignature.run()
        removeSignature.waitUntilExit()
        XCTAssertEqual(removeSignature.terminationStatus, 0)
        defer { try? FileManager.default.removeItem(at: helperDirectory) }

        let process = Process()
        process.executableURL = helperURL
        process.arguments = ["5"]
        process.environment = [
            "CHATGPTX_EXTENSION_TEST_ROOT": sessionPath,
            "NOTE": "CHATGPTX_EXTENSION_TEST_ROOT=/private/tmp/fake",
        ]
        try process.run()
        defer {
            if process.isRunning { process.terminate() }
            process.waitUntilExit()
        }

        guard case let .found(snapshot) =
            ExtensionTestProcessInspection.snapshot(
                for: process.processIdentifier
            )
        else {
            return XCTFail("The helper process snapshot is unavailable.")
        }
        XCTAssertTrue(ExtensionTestSessionRecorder.hasExactSessionRoot(
            snapshot.environment,
            sessionPath: sessionPath
        ), "Arguments: \(snapshot.arguments); environment: \(snapshot.environment)")
        XCTAssertFalse(ExtensionTestSessionRecorder.hasExactSessionRoot(
            snapshot.environment,
            sessionPath: "/private/tmp/fake"
        ))
    }

    func testRecordedLeaderDecisionHandlesExecAndPIDReuse() {
        let processGroupID: pid_t = 42
        let start = ExtensionTestProcessStartIdentity(
            seconds: 100,
            microseconds: 200
        )
        let path = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"
        let exactLeader = processSnapshot(
            processID: processGroupID,
            processGroupID: processGroupID,
            executablePath: path,
            startIdentity: start
        )

        XCTAssertEqual(
            ExtensionTestSessionRecorder.recordedLeaderDecision(
                processGroupID: processGroupID,
                recordedStartIdentity: start,
                listedMemberIDs: [],
                currentLeader: processSnapshot(
                    processID: processGroupID,
                    processGroupID: 99,
                    executablePath: "/bin/sleep",
                    startIdentity: ExtensionTestProcessStartIdentity(
                        seconds: 101,
                        microseconds: 0
                    )
                )
            ),
            .stale
        )
        XCTAssertEqual(
            ExtensionTestSessionRecorder.recordedLeaderDecision(
                processGroupID: processGroupID,
                recordedStartIdentity: start,
                listedMemberIDs: [84],
                currentLeader: nil
            ),
            .orphaned
        )
        XCTAssertEqual(
            ExtensionTestSessionRecorder.recordedLeaderDecision(
                processGroupID: processGroupID,
                recordedStartIdentity: start,
                listedMemberIDs: [processGroupID],
                currentLeader: exactLeader
            ),
            .live
        )
        XCTAssertEqual(
            ExtensionTestSessionRecorder.recordedLeaderDecision(
                processGroupID: processGroupID,
                recordedStartIdentity: start,
                listedMemberIDs: [processGroupID],
                currentLeader: processSnapshot(
                    processID: processGroupID,
                    processGroupID: processGroupID,
                    executablePath: "/bin/sleep",
                    startIdentity: start
                )
            ),
            .live
        )
        XCTAssertEqual(
            ExtensionTestSessionRecorder.recordedLeaderDecision(
                processGroupID: processGroupID,
                recordedStartIdentity: start,
                listedMemberIDs: [84],
                currentLeader: processSnapshot(
                    processID: processGroupID,
                    processGroupID: 99,
                    executablePath: "/bin/sleep",
                    startIdentity: start
                )
            ),
            .reject
        )
        XCTAssertEqual(
            ExtensionTestSessionRecorder.recordedLeaderDecision(
                processGroupID: processGroupID,
                recordedStartIdentity: start,
                listedMemberIDs: [processGroupID],
                currentLeader: processSnapshot(
                    processID: processGroupID,
                    processGroupID: processGroupID,
                    executablePath: path,
                    startIdentity: ExtensionTestProcessStartIdentity(
                        seconds: 101,
                        microseconds: 0
                    )
                )
            ),
            .stale
        )
    }

    private func processArgumentsData(
        executablePath: String,
        arguments: [String],
        environment: [String] = [],
        argumentEnvironmentPadding: Int = 0
    ) -> Data {
        var argumentCount = CInt(arguments.count)
        var data = withUnsafeBytes(of: &argumentCount) { Data($0) }
        data.append(contentsOf: executablePath.utf8)
        data.append(0)
        data.append(contentsOf: [0, 0, 0])
        for value in arguments {
            data.append(contentsOf: value.utf8)
            data.append(0)
        }
        data.append(contentsOf: [UInt8](
            repeating: 0,
            count: argumentEnvironmentPadding
        ))
        for value in environment {
            data.append(contentsOf: value.utf8)
            data.append(0)
        }
        return data
    }

    private func processSnapshot(
        processID: pid_t,
        processGroupID: pid_t,
        executablePath: String,
        startIdentity: ExtensionTestProcessStartIdentity
    ) -> ExtensionTestProcessSnapshot {
        ExtensionTestProcessSnapshot(
            processID: processID,
            processGroupID: processGroupID,
            userID: getuid(),
            executablePath: executablePath,
            arguments: [],
            environment: [],
            startIdentity: startIdentity
        )
    }
}
