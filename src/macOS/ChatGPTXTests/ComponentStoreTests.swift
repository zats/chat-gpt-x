import Foundation
import XCTest
@testable import ChatGPTX

final class ComponentStoreTests: XCTestCase {
    private var codexHomeURL: URL!

    override func setUpWithError() throws {
        codexHomeURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: codexHomeURL,
            withIntermediateDirectories: false
        )
    }

    override func tearDownWithError() throws {
        if let codexHomeURL {
            try? FileManager.default.removeItem(at: codexHomeURL)
        }
    }

    @MainActor
    func testSeedUsesFlatExtensionPackagesAndObjectSettings() throws {
        let store = try makeStore()
        let prepared = try store.prepareInstalled()
        let extensionsRoot = prepared.rootURL.appendingPathComponent(
            "components/extensions",
            isDirectory: true
        )

        XCTAssertFalse(prepared.extensions.isEmpty)
        for extensionComponent in prepared.extensions {
            XCTAssertEqual(
                extensionComponent.path,
                "components/extensions/\(extensionComponent.id)"
            )
            XCTAssertTrue(
                FileManager.default.fileExists(
                    atPath: extensionsRoot
                        .appendingPathComponent(extensionComponent.id)
                        .appendingPathComponent("package.json").path
                )
            )
        }

        let settings = try jsonObject(
            at: prepared.rootURL.appendingPathComponent("settings.json")
        )
        let records = try XCTUnwrap(
            settings["extensions"] as? [String: [String: Any]]
        )
        XCTAssertEqual(
            records.keys.sorted(),
            prepared.extensions.map(\.id).sorted()
        )
        XCTAssertTrue(records.values.allSatisfy { $0["enabled"] as? Bool == true })

        let versions = try jsonObject(at: prepared.versionsLockURL)
        XCTAssertNil(versions["extensions"])
    }

    @MainActor
    func testSettingsPreserveUnknownPerExtensionFields() throws {
        let store = try makeStore()
        let prepared = try store.prepareInstalled()
        let settingsURL = prepared.rootURL.appendingPathComponent(
            "settings.json"
        )
        var settings = try jsonObject(at: settingsURL)
        var records = try XCTUnwrap(
            settings["extensions"] as? [String: [String: Any]]
        )
        var record = try XCTUnwrap(records["multiple-accounts"])
        record["enabled"] = false
        record["updateChannel"] = "stable"
        records["multiple-accounts"] = record
        settings["extensions"] = records
        try JSONSerialization.data(
            withJSONObject: settings,
            options: [.prettyPrinted, .sortedKeys]
        ).write(to: settingsURL, options: .atomic)

        let reconciled = try store.prepareInstalled()
        XCTAssertEqual(
            reconciled.extensions.first { $0.id == "multiple-accounts" }?
                .enabled,
            false
        )
        let written = try jsonObject(at: settingsURL)
        let writtenRecords = try XCTUnwrap(
            written["extensions"] as? [String: [String: Any]]
        )
        XCTAssertEqual(
            writtenRecords["multiple-accounts"]?["updateChannel"] as? String,
            "stable"
        )
    }

    @MainActor
    func testVersionedExtensionLayoutMigratesToFlatPackages() throws {
        let store = try makeStore()
        let prepared = try store.prepareInstalled()
        let extensionsRoot = prepared.rootURL.appendingPathComponent(
            "components/extensions",
            isDirectory: true
        )

        for extensionComponent in prepared.extensions {
            let packageURL = extensionsRoot.appendingPathComponent(
                extensionComponent.id,
                isDirectory: true
            )
            let temporaryURL = extensionsRoot.appendingPathComponent(
                ".\(extensionComponent.id)-old",
                isDirectory: true
            )
            try FileManager.default.moveItem(at: packageURL, to: temporaryURL)
            try FileManager.default.createDirectory(
                at: packageURL,
                withIntermediateDirectories: false
            )
            try FileManager.default.moveItem(
                at: temporaryURL,
                to: packageURL.appendingPathComponent(
                    extensionComponent.version,
                    isDirectory: true
                )
            )
        }

        let migrated = try store.prepareInstalled()
        for extensionComponent in migrated.extensions {
            let packageURL = extensionsRoot.appendingPathComponent(
                extensionComponent.id,
                isDirectory: true
            )
            XCTAssertTrue(
                FileManager.default.fileExists(
                    atPath: packageURL.appendingPathComponent("package.json").path
                )
            )
            XCTAssertFalse(
                FileManager.default.fileExists(
                    atPath: packageURL.appendingPathComponent(
                        extensionComponent.version
                    ).path
                )
            )
        }
    }

    @MainActor
    func testOlderUpdateIndexKeepsInstalledComponentsCurrent() async throws {
        let store = try makeStore()
        let installed = try store.prepareInstalled()
        let indexData = try JSONSerialization.data(
            withJSONObject: [
                "schemaVersion": 2,
                "generation": installed.versions.generation - 1,
                "releaseBaseURL":
                    "https://github.com/zats/chat-gpt-x/releases/download",
                "chatgptApis": [:],
                "bindings": [:],
                "extensions": [:],
            ]
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ComponentIndexURLProtocol.self]
        ComponentIndexURLProtocol.responseData = indexData
        let service = ComponentUpdateService(
            componentStore: store,
            session: URLSession(configuration: configuration),
            indexURL: URL(string: "https://updates.invalid/latest.json")!
        )

        let outcome = try await service.update(
            for: installed.versions.binding.chatgpt
        )

        guard case .upToDate(let prepared) = outcome.result else {
            return XCTFail("An older update index must be ignored.")
        }
        XCTAssertEqual(
            prepared.versions.generation,
            installed.versions.generation
        )
        XCTAssertFalse(outcome.summary.items.isEmpty)
        XCTAssertTrue(
            outcome.summary.items.allSatisfy {
                $0.localVersion == .current
            }
        )
    }

    @MainActor
    private func makeStore() throws -> ComponentStore {
        try ComponentStore(
            environment: ["CODEX_HOME": codexHomeURL.path],
            bundle: Bundle.main
        )
    }

    private func jsonObject(at url: URL) throws -> [String: Any] {
        try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: url))
                as? [String: Any]
        )
    }
}

private final class ComponentIndexURLProtocol: URLProtocol {
    nonisolated(unsafe) static var responseData = Data()

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
