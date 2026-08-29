import CryptoKit
import Darwin
import XCTest

@testable import ChatGPTX

final class ChatGPTAsarHashCacheTests: XCTestCase {
    func testUnchangedFileReusesStreamedDigest() async throws {
        let applicationURL = try makeApplication(
            version: "1.2.3",
            asar: Data("streamed content".utf8)
        )
        let hashCount = LockedCounter()
        let cache = ChatGPTAsarHashCache { handle in
            hashCount.increment()
            return try Self.streamSHA256(handle)
        }

        let first = try await cache.sha256(at: applicationURL)
        let second = try await cache.sha256(at: applicationURL)

        XCTAssertEqual(first, Self.sha256(Data("streamed content".utf8)))
        XCTAssertEqual(second, first)
        XCTAssertEqual(hashCount.value, 1)
        XCTAssertEqual(cache.cachedSHA256(at: applicationURL), first)
    }

    @MainActor
    func testFullReadDoesNotRunOnMainActor() async throws {
        let applicationURL = try makeApplication(
            version: "1.2.3",
            asar: Data("content".utf8)
        )
        let started = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        let cache = ChatGPTAsarHashCache { _ in
            XCTAssertFalse(Thread.isMainThread)
            started.signal()
            guard release.wait(timeout: .now() + 5) == .success else {
                throw TestError.timedOut
            }
            return Self.sha256(Data("content".utf8))
        }

        let hashTask = Task {
            try await cache.sha256(at: applicationURL)
        }
        let didStart = await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                continuation.resume(
                    returning: started.wait(timeout: .now() + 5) == .success
                )
            }
        }

        XCTAssertTrue(didStart)
        XCTAssertTrue(Thread.isMainThread)
        release.signal()
        _ = try await hashTask.value
    }

    @MainActor
    func testReplacementWithSameSizeAndDateInvalidatesCache() async throws {
        let firstData = Data("first".utf8)
        let secondData = Data("other".utf8)
        let applicationURL = try makeApplication(
            version: "1.2.3",
            asar: firstData
        )
        let asarURL = Self.asarURL(for: applicationURL)
        let modificationDate = try XCTUnwrap(
            try FileManager.default.attributesOfItem(
                atPath: asarURL.path
            )[.modificationDate] as? Date
        )
        let cache = ChatGPTAsarHashCache()

        let first = try await cache.sha256(at: applicationURL)
        let replacementURL = asarURL.deletingLastPathComponent()
            .appendingPathComponent("replacement.asar")
        try secondData.write(to: replacementURL)
        try FileManager.default.setAttributes(
            [.modificationDate: modificationDate],
            ofItemAtPath: replacementURL.path
        )
        XCTAssertEqual(
            Darwin.rename(replacementURL.path, asarURL.path),
            0,
            "The fixture replacement must be atomic."
        )
        try FileManager.default.setAttributes(
            [.modificationDate: modificationDate],
            ofItemAtPath: asarURL.path
        )

        XCTAssertNil(cache.cachedSHA256(at: applicationURL))
        let second = try await cache.sha256(at: applicationURL)
        XCTAssertEqual(first, Self.sha256(firstData))
        XCTAssertEqual(second, Self.sha256(secondData))
        XCTAssertNotEqual(second, first)
    }

    @MainActor
    func testCachedBuildMatchRequiresCurrentVerifiedFile() async throws {
        let applicationURL = try makeApplication(
            version: "1.2.3",
            asar: Data("verified".utf8)
        )
        let expectedHash = Self.sha256(Data("verified".utf8))

        XCTAssertFalse(ChatGPTLauncher.cachedBuildMatches(
            applicationURL: applicationURL,
            expectedVersion: "1.2.3",
            expectedAsarSHA256: expectedHash
        ))
        let actualHash = await ChatGPTLauncher.applicationAsarSHA256(
            at: applicationURL
        )
        XCTAssertEqual(actualHash, expectedHash)
        XCTAssertTrue(ChatGPTLauncher.cachedBuildMatches(
            applicationURL: applicationURL,
            expectedVersion: "1.2.3",
            expectedAsarSHA256: expectedHash
        ))
        XCTAssertFalse(ChatGPTLauncher.cachedBuildMatches(
            applicationURL: applicationURL,
            expectedVersion: "1.2.4",
            expectedAsarSHA256: expectedHash
        ))

        try Data("changed!".utf8).write(to: Self.asarURL(
            for: applicationURL
        ))
        XCTAssertFalse(ChatGPTLauncher.cachedBuildMatches(
            applicationURL: applicationURL,
            expectedVersion: "1.2.3",
            expectedAsarSHA256: expectedHash
        ))
    }

    private func makeApplication(
        version: String,
        asar: Data
    ) throws -> URL {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "ChatGPTAsarHashCacheTests-\(UUID().uuidString)",
                isDirectory: true
            )
        addTeardownBlock {
            try? FileManager.default.removeItem(at: rootURL)
        }
        let applicationURL = rootURL.appendingPathComponent(
            "ChatGPT.app",
            isDirectory: true
        )
        let contentsURL = applicationURL.appendingPathComponent(
            "Contents",
            isDirectory: true
        )
        let resourcesURL = contentsURL.appendingPathComponent(
            "Resources",
            isDirectory: true
        )
        try FileManager.default.createDirectory(
            at: resourcesURL,
            withIntermediateDirectories: true
        )
        let information: [String: Any] = [
            "CFBundleShortVersionString": version,
        ]
        let infoData = try PropertyListSerialization.data(
            fromPropertyList: information,
            format: .xml,
            options: 0
        )
        try infoData.write(to: contentsURL.appendingPathComponent(
            "Info.plist"
        ))
        try asar.write(to: Self.asarURL(for: applicationURL))
        return applicationURL
    }

    private static func asarURL(for applicationURL: URL) -> URL {
        applicationURL
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("Resources", isDirectory: true)
            .appendingPathComponent("app.asar")
    }

    private nonisolated static func streamSHA256(
        _ handle: FileHandle
    ) throws -> String {
        var hasher = SHA256()
        while let data = try handle.read(upToCount: 3), !data.isEmpty {
            hasher.update(data: data)
        }
        return hasher.finalize()
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private nonisolated static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

private final class LockedCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int {
        lock.withLock { count }
    }

    func increment() {
        lock.withLock { count += 1 }
    }
}

private enum TestError: Error {
    case timedOut
}
