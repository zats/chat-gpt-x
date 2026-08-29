import Darwin
import Foundation
import XCTest

@testable import ChatGPTX

@MainActor
final class ExtensionTestSessionCleanupTests: XCTestCase {
    func testRemoveAcceptsThePhysicalTemporaryDirectorySpelling() throws {
        let sessionURL = try makeSession()
        let physicalPath = sessionURL.path.hasPrefix("/var/")
            ? "/private\(sessionURL.path)"
            : sessionURL.path

        try ExtensionTestSessionRecorder.remove(sessionPath: physicalPath)

        XCTAssertFalse(pathEntryExists(sessionURL))
    }

    func testPurgeDoesNotFollowSessionSymlinks() throws {
        let sessionURL = try makeSession()
        let outsideURL = try makeTemporaryDirectory(prefix: "outside")
        defer {
            try? removeKnownFile(outsideURL.appendingPathComponent("keep"))
            _ = rmdir(outsideURL.path)
            try? ExtensionTestSessionRecorder.remove(
                sessionPath: sessionURL.path
            )
        }

        let codexHomeURL = sessionURL.appendingPathComponent("codex-home")
        let profileURL = sessionURL.appendingPathComponent("electron-profile")
        let packageURL = sessionURL.appendingPathComponent("test-package")
        try createDirectory(codexHomeURL)
        try createDirectory(profileURL)
        try createDirectory(packageURL)
        try Data("outside\n".utf8).write(
            to: outsideURL.appendingPathComponent("keep")
        )
        try FileManager.default.createSymbolicLink(
            at: codexHomeURL.appendingPathComponent("escape"),
            withDestinationURL: outsideURL
        )
        try Data("keep\n".utf8).write(
            to: sessionURL.appendingPathComponent("keep")
        )

        try ExtensionTestSessionRecorder.purge(sessionPath: sessionURL.path)

        XCTAssertFalse(pathEntryExists(codexHomeURL))
        XCTAssertFalse(pathEntryExists(profileURL))
        XCTAssertFalse(pathEntryExists(packageURL))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: outsideURL.appendingPathComponent("keep").path
        ))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: sessionURL.appendingPathComponent("keep").path
        ))
    }

    func testRemoveRejectsFinalDirectoryPathSwap() throws {
        let sessionURL = try makeSession()
        let movedURL = sessionURL.deletingLastPathComponent()
            .appendingPathComponent("moved.\(UUID().uuidString)")
        defer {
            _ = rmdir(sessionURL.path)
            _ = rmdir(movedURL.path)
        }
        try Data("private\n".utf8).write(
            to: sessionURL.appendingPathComponent("private")
        )

        XCTAssertThrowsError(try ExtensionTestSessionRecorder.remove(
            sessionPath: sessionURL.path,
            beforeFinalRemoval: {
                guard rename(sessionURL.path, movedURL.path) == 0,
                      mkdir(sessionURL.path, mode_t(0o700)) == 0
                else {
                    throw POSIXError(
                        POSIXErrorCode(rawValue: errno) ?? .EIO
                    )
                }
            }
        ))

        XCTAssertTrue(pathEntryExists(sessionURL))
        XCTAssertTrue(pathEntryExists(movedURL))
        XCTAssertEqual(
            try FileManager.default.contentsOfDirectory(
                atPath: movedURL.path
            ),
            []
        )
    }

    private func makeSession() throws -> URL {
        let url = try makeTemporaryDirectory(
            prefix: "chatgptx-extension-test"
        )
        let markerURL = url.appendingPathComponent(
            ".chatgptx-extension-test"
        )
        try Data("chatgptx-extension-test-v1\n".utf8).write(to: markerURL)
        guard chmod(markerURL.path, mode_t(0o600)) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        return url
    }

    private func makeTemporaryDirectory(prefix: String) throws -> URL {
        let temporaryURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .resolvingSymlinksInPath().standardizedFileURL
        let url = temporaryURL.appendingPathComponent(
            "\(prefix).\(UUID().uuidString)"
        )
        guard mkdir(url.path, mode_t(0o700)) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        return url
    }

    private func createDirectory(_ url: URL) throws {
        guard mkdir(url.path, mode_t(0o700)) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
    }

    private func pathEntryExists(_ url: URL) -> Bool {
        var information = stat()
        return lstat(url.path, &information) == 0
    }

    private func removeKnownFile(_ url: URL) throws {
        guard unlink(url.path) == 0 || errno == ENOENT else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
    }
}
