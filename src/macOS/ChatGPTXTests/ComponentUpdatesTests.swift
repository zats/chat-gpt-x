import CryptoKit
import Foundation
import XCTest
@testable import ChatGPTX

final class ComponentUpdatesTests: XCTestCase {
    private enum SimulatedUpdateError: Error {
        case chatGPTChanged
    }

    private static let releaseBaseURL =
        "https://github.com/zats/chat-gpt-x/releases/download"
    private static let indexURL = URL(
        string: "https://updates.invalid/latest.json"
    )!
    private static let chatgptVersion = "26.900.10000"
    private static let nextChatgptVersion = "26.900.10001"
    private static let asarHash = String(repeating: "a", count: 64)
    private static let nextAsarHash = String(repeating: "b", count: 64)

    private var codexHomeURL: URL!

    override func setUpWithError() throws {
        codexHomeURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(
            at: codexHomeURL,
            withIntermediateDirectories: false
        )
        ComponentUpdateURLProtocol.responses = [:]
        ComponentUpdateURLProtocol.requestedURLs = []
    }

    override func tearDownWithError() throws {
        ComponentUpdateURLProtocol.responses = [:]
        ComponentUpdateURLProtocol.requestedURLs = []
        if let codexHomeURL {
            try? FileManager.default.removeItem(at: codexHomeURL)
        }
    }

    @MainActor
    func testStrictSchemaThreeIndexRejectsUnknownAndObsoleteFields() throws {
        let valid = makeIndex(
            apiHash: hash("api"),
            bindingHash: hash("binding"),
            extensionVersions: [
                "sample": [
                    "1.0.0": extensionEntry(
                        apiRange: "^1.0.0",
                        hash: hash("sample")
                    )
                ]
            ]
        )
        let decoded = try ComponentUpdateIndex.decodeStrict(json(valid))
        XCTAssertEqual(decoded.schemaVersion, 3)
        XCTAssertEqual(decoded.minimumLauncherVersion, "1.1.0")
        XCTAssertEqual(
            decoded.bindings[Self.chatgptVersion]?.asarSha256,
            Self.asarHash
        )
        XCTAssertEqual(
            decoded.extensions["sample"]?.versions.keys.sorted(),
            ["1.0.0"]
        )

        var unknownRoot = valid
        unknownRoot["extra"] = true
        XCTAssertThrowsError(
            try ComponentUpdateIndex.decodeStrict(json(unknownRoot))
        )

        var obsoleteSchema = valid
        obsoleteSchema["schemaVersion"] = 2
        XCTAssertThrowsError(
            try ComponentUpdateIndex.decodeStrict(json(obsoleteSchema))
        )

        var obsoleteCompatibility = valid
        var catalogs = try XCTUnwrap(
            obsoleteCompatibility["extensions"] as? [String: Any]
        )
        var catalog = try XCTUnwrap(catalogs["sample"] as? [String: Any])
        var versions = try XCTUnwrap(
            catalog["versions"] as? [String: Any]
        )
        var entry = try XCTUnwrap(versions["1.0.0"] as? [String: Any])
        var compatibility = try XCTUnwrap(
            entry["compatibility"] as? [String: Any]
        )
        compatibility["chatgpt"] = ">=26.0"
        entry["compatibility"] = compatibility
        versions["1.0.0"] = entry
        catalog["versions"] = versions
        catalogs["sample"] = catalog
        obsoleteCompatibility["extensions"] = catalogs
        XCTAssertThrowsError(
            try ComponentUpdateIndex.decodeStrict(
                json(obsoleteCompatibility)
            )
        )

        var invalidRange = valid
        var invalidCatalogs = try XCTUnwrap(
            invalidRange["extensions"] as? [String: Any]
        )
        var invalidCatalog = try XCTUnwrap(
            invalidCatalogs["sample"] as? [String: Any]
        )
        var invalidVersions = try XCTUnwrap(
            invalidCatalog["versions"] as? [String: Any]
        )
        var invalidEntry = try XCTUnwrap(
            invalidVersions["1.0.0"] as? [String: Any]
        )
        invalidEntry["compatibility"] = ["chatgptApi": "banana"]
        invalidVersions["1.0.0"] = invalidEntry
        invalidCatalog["versions"] = invalidVersions
        invalidCatalogs["sample"] = invalidCatalog
        invalidRange["extensions"] = invalidCatalogs
        XCTAssertThrowsError(
            try ComponentUpdateIndex.decodeStrict(json(invalidRange))
        )

        var unsupportedRuntime = valid
        unsupportedRuntime["chatgptApis"] = [
            "1.0.2": [
                "release": "chatgpt-api-v1.0.2",
                "sha256": hash("api"),
            ]
        ]
        var unsupportedBindings = try XCTUnwrap(
            unsupportedRuntime["bindings"] as? [String: Any]
        )
        var unsupportedBinding = try XCTUnwrap(
            unsupportedBindings[Self.chatgptVersion] as? [String: Any]
        )
        unsupportedBinding["chatgptApi"] = "1.0.2"
        unsupportedBindings[Self.chatgptVersion] = unsupportedBinding
        unsupportedRuntime["bindings"] = unsupportedBindings
        XCTAssertThrowsError(
            try ComponentUpdateIndex.decodeStrict(json(unsupportedRuntime))
        )
    }

    @MainActor
    func testBootstrapSelectsLatestAPICompatibleExtensionAndKeepsSettings()
        async throws
    {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let selectedExtension = try makeExtensionArchive(
            id: "sample",
            version: "1.2.0",
            apiRange: "^1.0.0"
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding),
            extensionVersions: [
                "future": [
                    "2.0.0": extensionEntry(
                        apiRange: "^2.0.0",
                        hash: hash("future")
                    )
                ],
                "sample": [
                    "1.0.0": extensionEntry(
                        apiRange: "^1.0.0",
                        hash: hash("old")
                    ),
                    "1.2.0": extensionEntry(
                        apiRange: "^1.0.0",
                        hash: digest(selectedExtension)
                    ),
                    "2.0.0": extensionEntry(
                        apiRange: "^2.0.0",
                        hash: hash("new-major")
                    ),
                ],
            ]
        )
        try writeSettings([
            "future": ["enabled": false, "channel": "stable"],
            "sample": ["enabled": false],
        ])
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
                "extension-sample-v1.2.0": selectedExtension,
            ]
        )

        let outcome = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        guard case .installed(let prepared) = outcome.result else {
            return XCTFail("Bootstrap must install the selected components.")
        }
        XCTAssertEqual(prepared.versions.generation, 7)
        XCTAssertEqual(prepared.versions.chatgptApi.version, "1.1.0")
        XCTAssertEqual(prepared.versions.binding.asarSha256, Self.asarHash)
        XCTAssertEqual(prepared.versions.extensions.map(\.id), ["sample"])
        XCTAssertEqual(prepared.versions.extensions[0].version, "1.2.0")
        XCTAssertFalse(prepared.versions.extensions[0].enabled)
        XCTAssertEqual(
            prepared.versions.extensions[0].path,
            "components/extensions/sample/1.2.0"
        )
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: prepared.rootURL.appendingPathComponent(
                    prepared.versions.extensions[0].path
                ).appendingPathComponent("contents/main.js").path
            )
        )
        for path in [
            prepared.versions.chatgptApi.path,
            prepared.versions.binding.path,
            prepared.versions.extensions[0].path,
        ] {
            XCTAssertTrue(
                FileManager.default.fileExists(
                    atPath: prepared.rootURL.appendingPathComponent(path)
                        .appendingPathComponent(
                            ComponentStore.integrityReceiptFileName
                        ).path
                )
            )
        }

        let settings = try settingsRecords()
        XCTAssertEqual(settings["future"]?["enabled"] as? Bool, false)
        XCTAssertEqual(settings["future"]?["channel"] as? String, "stable")
        XCTAssertEqual(settings["sample"]?["enabled"] as? Bool, false)
        XCTAssertEqual(
            outcome.summary.items.first {
                $0.id == "extension:future"
            }?.localVersion,
            .incompatible(nil)
        )
        XCTAssertEqual(
            outcome.summary.items.filter {
                $0.id != "extension:future"
            }.map(\.localVersion),
            [.current, .current, .current]
        )

        try writeSettings([
            "future": ["enabled": false, "channel": "stable"],
            "sample": ["enabled": true],
        ])
        ComponentUpdateURLProtocol.responses = [
            Self.indexURL: json(index)
        ]
        ComponentUpdateURLProtocol.requestedURLs = []
        let secondOutcome = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )
        guard case .upToDate = secondOutcome.result else {
            return XCTFail(
                "A settings-only change must not require a restart."
            )
        }
        XCTAssertTrue(secondOutcome.result.preparedStore.extensions[0].enabled)
        XCTAssertTrue(
            secondOutcome.result.preparedStore.versions.extensions[0].enabled
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [Self.indexURL]
        )
    }

    @MainActor
    func testLegacyAPIArchiveDoesNotRequireManagerAuthorizationModule()
        async throws
    {
        let apiVersion = "1.0.4"
        let api = try makeAPIArchive(
            version: apiVersion,
            includeManagerAuthorization: false
        )
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: apiVersion,
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding),
            apiVersion: apiVersion
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v\(apiVersion)": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )

        let outcome = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        guard case .installed(let prepared) = outcome.result else {
            return XCTFail("The legacy API package must install.")
        }
        XCTAssertEqual(prepared.versions.chatgptApi.version, apiVersion)
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: prepared.rootURL.appendingPathComponent(
                    "components/chatgpt-api/\(apiVersion)/runtime/extension-manager-authorization.cjs"
                ).path
            )
        )
    }

    @MainActor
    func testSameGenerationCanInstallASecondExactChatGPTBuild() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let firstBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let firstIndex = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(firstBinding)
        )
        installResponses(
            index: firstIndex,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": firstBinding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let nextBinding = try makeBindingArchive(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash
        )
        var secondIndex = firstIndex
        var bindings = try XCTUnwrap(
            secondIndex["bindings"] as? [String: Any]
        )
        bindings[Self.nextChatgptVersion] = bindingEntry(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash,
            hash: digest(nextBinding)
        )
        secondIndex["bindings"] = bindings
        installResponses(
            index: secondIndex,
            archives: [
                "binding-\(Self.nextChatgptVersion)-v1.0.0": nextBinding
            ]
        )

        let outcome = try await makeService {
            version, asarSHA256 in
            XCTAssertEqual(version, Self.nextChatgptVersion)
            XCTAssertEqual(asarSHA256, Self.nextAsarHash)
        }.update(
            for: Self.nextChatgptVersion,
            chatgptAsarSHA256: Self.nextAsarHash
        )

        guard case .installed(let prepared) = outcome.result else {
            return XCTFail("A same-generation exact build must install.")
        }
        XCTAssertEqual(prepared.versions.generation, 7)
        XCTAssertEqual(
            prepared.versions.binding.chatgpt,
            Self.nextChatgptVersion
        )
        XCTAssertEqual(
            prepared.versions.binding.asarSha256,
            Self.nextAsarHash
        )
    }

    @MainActor
    func testUpdatePrefetchesNewestSupportedBuildWithoutActivatingIt()
        async throws
    {
        let api = try makeAPIArchive(version: "1.1.0")
        let currentBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let nextBinding = try makeBindingArchive(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash
        )
        var index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(currentBinding)
        )
        var bindings = try XCTUnwrap(index["bindings"] as? [String: Any])
        bindings[Self.nextChatgptVersion] = bindingEntry(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash,
            hash: digest(nextBinding)
        )
        index["bindings"] = bindings
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": currentBinding,
                "binding-\(Self.nextChatgptVersion)-v1.0.0": nextBinding,
            ]
        )
        var activatedBuilds = [(String, String)]()

        _ = try await makeService { version, asarSHA256 in
            activatedBuilds.append((version, asarSHA256))
        }.update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        XCTAssertEqual(activatedBuilds.count, 1)
        XCTAssertEqual(activatedBuilds.first?.0, Self.chatgptVersion)
        XCTAssertEqual(activatedBuilds.first?.1, Self.asarHash)
        let active = try XCTUnwrap(
            try ComponentStore(
                environment: ["CODEX_HOME": codexHomeURL.path]
            ).activeVersions()
        )
        XCTAssertEqual(active.binding.chatgpt, Self.chatgptVersion)
        let prefetchedURL = codexHomeURL.appendingPathComponent(
            "extensions/prefetched/\(Self.nextChatgptVersion).json"
        )
        let prefetched = try JSONDecoder().decode(
            PrefetchedComponentSet.self,
            from: Data(contentsOf: prefetchedURL)
        )
        XCTAssertEqual(
            prefetched.versions.binding.chatgpt,
            Self.nextChatgptVersion
        )
        XCTAssertEqual(
            prefetched.versions.binding.asarSha256,
            Self.nextAsarHash
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL("chatgpt-api-v1.1.0"),
                releaseURL(
                    "binding-\(Self.nextChatgptVersion)-v1.0.0"
                ),
                releaseURL(
                    "binding-\(Self.chatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testPrefetchKeepsOnlyNewestSupportedBuild()
        async throws
    {
        let newestVersion = "26.900.10002"
        let newestAsarHash = String(repeating: "d", count: 64)
        let api = try makeAPIArchive(version: "1.1.0")
        let currentBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let stagedBinding = try makeBindingArchive(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash
        )
        let newestBinding = try makeBindingArchive(
            chatgpt: newestVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: newestAsarHash
        )
        var index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(currentBinding)
        )
        var bindings = try XCTUnwrap(index["bindings"] as? [String: Any])
        bindings[Self.nextChatgptVersion] = bindingEntry(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash,
            hash: digest(stagedBinding)
        )
        bindings[newestVersion] = bindingEntry(
            chatgpt: newestVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: newestAsarHash,
            hash: digest(newestBinding)
        )
        index["bindings"] = bindings
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": currentBinding,
                "binding-\(Self.nextChatgptVersion)-v1.0.0": stagedBinding,
                "binding-\(newestVersion)-v1.0.0": newestBinding,
            ]
        )

        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: codexHomeURL.appendingPathComponent(
                    "extensions/prefetched/\(Self.nextChatgptVersion).json"
                ).path
            )
        )
        let prefetched = try JSONDecoder().decode(
            PrefetchedComponentSet.self,
            from: Data(contentsOf: codexHomeURL.appendingPathComponent(
                "extensions/prefetched/\(newestVersion).json"
            ))
        )
        XCTAssertEqual(prefetched.versions.binding.chatgpt, newestVersion)
        XCTAssertEqual(
            prefetched.versions.binding.asarSha256,
            newestAsarHash
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL("chatgpt-api-v1.1.0"),
                releaseURL("binding-\(newestVersion)-v1.0.0"),
                releaseURL(
                    "binding-\(Self.chatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testUnsupportedInstalledBuildStillPrefetchesNewestSupportedBuild()
        async throws
    {
        let unsupportedVersion = "26.999.99999"
        let unsupportedAsarHash = String(repeating: "c", count: 64)
        let api = try makeAPIArchive(version: "1.1.0")
        let currentBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let nextBinding = try makeBindingArchive(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash
        )
        var index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(currentBinding)
        )
        var bindings = try XCTUnwrap(index["bindings"] as? [String: Any])
        bindings[Self.nextChatgptVersion] = bindingEntry(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash,
            hash: digest(nextBinding)
        )
        index["bindings"] = bindings
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.nextChatgptVersion)-v1.0.0": nextBinding,
            ]
        )

        do {
            _ = try await makeService().update(
                for: unsupportedVersion,
                chatgptAsarSHA256: unsupportedAsarHash
            )
            XCTFail("The unsupported installed build must be rejected.")
        } catch ComponentUpdateError.bindingUnavailable(let version) {
            XCTAssertEqual(version, unsupportedVersion)
        }

        let prefetchedURL = codexHomeURL.appendingPathComponent(
            "extensions/prefetched/\(Self.nextChatgptVersion).json"
        )
        let prefetched = try JSONDecoder().decode(
            PrefetchedComponentSet.self,
            from: Data(contentsOf: prefetchedURL)
        )
        XCTAssertEqual(
            prefetched.versions.binding.chatgpt,
            Self.nextChatgptVersion
        )
        XCTAssertEqual(
            prefetched.versions.binding.asarSha256,
            Self.nextAsarHash
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL("chatgpt-api-v1.1.0"),
                releaseURL(
                    "binding-\(Self.nextChatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testPrefetchedBuildActivatesWithoutNetworkAccess() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let currentBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let nextBinding = try makeBindingArchive(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash
        )
        var index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(currentBinding)
        )
        var bindings = try XCTUnwrap(index["bindings"] as? [String: Any])
        bindings[Self.nextChatgptVersion] = bindingEntry(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash,
            hash: digest(nextBinding)
        )
        index["bindings"] = bindings
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": currentBinding,
                "binding-\(Self.nextChatgptVersion)-v1.0.0": nextBinding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )
        ComponentUpdateURLProtocol.responses = [:]
        ComponentUpdateURLProtocol.requestedURLs = []
        var activatedBuilds = [(String, String)]()

        let outcome = try await makeService { version, asarSHA256 in
            activatedBuilds.append((version, asarSHA256))
        }.update(
            for: Self.nextChatgptVersion,
            chatgptAsarSHA256: Self.nextAsarHash
        )

        guard case .installed(let prepared) = outcome.result else {
            return XCTFail("The prefetched build must activate locally.")
        }
        XCTAssertEqual(activatedBuilds.count, 1)
        XCTAssertEqual(activatedBuilds.first?.0, Self.nextChatgptVersion)
        XCTAssertEqual(activatedBuilds.first?.1, Self.nextAsarHash)
        XCTAssertEqual(
            prepared.versions.binding.chatgpt,
            Self.nextChatgptVersion
        )
        XCTAssertEqual(ComponentUpdateURLProtocol.requestedURLs, [])
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: codexHomeURL.appendingPathComponent(
                    "extensions/prefetched/\(Self.nextChatgptVersion).json"
                ).path
            )
        )
    }

    @MainActor
    func testChangedChatGPTBuildCannotReplaceActiveSameGenerationLock()
        async throws
    {
        let api = try makeAPIArchive(version: "1.1.0")
        let activeBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let activeIndex = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(activeBinding)
        )
        installResponses(
            index: activeIndex,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": activeBinding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let lockURL = codexHomeURL.appendingPathComponent(
            "extensions/versions-lock.json"
        )
        let activeLock = try Data(contentsOf: lockURL)
        let settingsURL = codexHomeURL.appendingPathComponent(
            "extensions/settings.json"
        )
        let activeSettings = try Data(contentsOf: settingsURL)
        let downloadedBinding = try makeBindingArchive(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash
        )
        var downloadedIndex = activeIndex
        var bindings = try XCTUnwrap(
            downloadedIndex["bindings"] as? [String: Any]
        )
        bindings[Self.nextChatgptVersion] = bindingEntry(
            chatgpt: Self.nextChatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.nextAsarHash,
            hash: digest(downloadedBinding)
        )
        downloadedIndex["bindings"] = bindings
        installResponses(
            index: downloadedIndex,
            archives: [
                "binding-\(Self.nextChatgptVersion)-v1.0.0":
                    downloadedBinding
            ]
        )

        let service = try makeService { expectedVersion, expectedHash in
            XCTAssertEqual(expectedVersion, Self.nextChatgptVersion)
            XCTAssertEqual(expectedHash, Self.nextAsarHash)

            // Sparkle replaced the app after the download completed.
            let currentVersion = Self.chatgptVersion
            let currentHash = Self.asarHash
            guard currentVersion == expectedVersion,
                currentHash == expectedHash
            else {
                throw SimulatedUpdateError.chatGPTChanged
            }
        }

        do {
            _ = try await service.update(
                for: Self.nextChatgptVersion,
                chatgptAsarSHA256: Self.nextAsarHash
            )
            XCTFail("A changed ChatGPT build must stop activation.")
        } catch SimulatedUpdateError.chatGPTChanged {
            // Expected.
        }

        XCTAssertEqual(try Data(contentsOf: lockURL), activeLock)
        XCTAssertEqual(try Data(contentsOf: settingsURL), activeSettings)
        let active = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: Data(contentsOf: lockURL)
            ) as? [String: Any]
        )
        let activeBindingRecord = try XCTUnwrap(
            active["binding"] as? [String: Any]
        )
        XCTAssertEqual(
            activeBindingRecord["chatgpt"] as? String,
            Self.chatgptVersion
        )
        XCTAssertEqual(
            activeBindingRecord["asarSha256"] as? String,
            Self.asarHash
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL(
                    "binding-\(Self.nextChatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testStaleUpdaterCannotReplaceNewerActiveGeneration() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let originalBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let originalIndex = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(originalBinding)
        )
        installResponses(
            index: originalIndex,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": originalBinding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let correctedBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.1",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        var staleIndex = originalIndex
        staleIndex["generation"] = 8
        var bindings = try XCTUnwrap(
            staleIndex["bindings"] as? [String: Any]
        )
        bindings[Self.chatgptVersion] = bindingEntry(
            chatgpt: Self.chatgptVersion,
            version: "1.0.1",
            api: "1.1.0",
            asarHash: Self.asarHash,
            hash: digest(correctedBinding)
        )
        staleIndex["bindings"] = bindings
        installResponses(
            index: staleIndex,
            archives: [
                "binding-\(Self.chatgptVersion)-v1.0.1": correctedBinding
            ]
        )

        let lockURL = codexHomeURL.appendingPathComponent(
            "extensions/versions-lock.json"
        )
        let service = try makeService()

        do {
            _ = try await service.update(
                for: Self.chatgptVersion,
                chatgptAsarSHA256: Self.asarHash,
                progress: { progress in
                    guard case .installing(
                        componentID: "binding",
                        name: _
                    ) = progress else {
                        return
                    }
                    do {
                        var lock = try XCTUnwrap(
                            JSONSerialization.jsonObject(
                                with: Data(contentsOf: lockURL)
                            ) as? [String: Any]
                        )
                        lock["generation"] = 9
                        try self.json(lock).write(
                            to: lockURL,
                            options: .atomic
                        )
                    } catch {
                        XCTFail(
                            "Could not simulate the newer updater: \(error)"
                        )
                    }
                }
            )
            XCTFail("A stale updater must not replace a newer active store.")
        } catch ComponentUpdateError.olderGeneration(
            let remote,
            let installed
        ) {
            XCTAssertEqual(remote, 8)
            XCTAssertEqual(installed, 9)
        }

        let active = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: Data(contentsOf: lockURL)
            ) as? [String: Any]
        )
        XCTAssertEqual(active["generation"] as? Int, 9)
    }

    @MainActor
    func testUpdateRepairsMissingAuthorizationAndInvalidSettings()
        async throws
    {
        let apiVersion = "1.1.1"
        let api = try makeAPIArchive(version: apiVersion)
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: apiVersion,
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding),
            apiVersion: apiVersion
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v\(apiVersion)": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let extensionsRoot = codexHomeURL.appendingPathComponent(
            "extensions",
            isDirectory: true
        )
        let authorizationURL = extensionsRoot.appendingPathComponent(
            "components/chatgpt-api/\(apiVersion)/runtime/extension-manager-authorization.cjs"
        )
        try FileManager.default.removeItem(at: authorizationURL)
        try Data("not-json".utf8).write(
            to: extensionsRoot.appendingPathComponent("settings.json")
        )
        installResponses(
            index: index,
            archives: ["chatgpt-api-v\(apiVersion)": api]
        )

        let outcome = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        guard case .installed(let prepared) = outcome.result else {
            return XCTFail("A damaged selected component must be repaired.")
        }
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: authorizationURL.path)
        )
        XCTAssertEqual(prepared.versions.chatgptApi.version, apiVersion)
        XCTAssertEqual(try settingsRecords().count, 0)
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [Self.indexURL, releaseURL("chatgpt-api-v\(apiVersion)")]
        )
    }

    @MainActor
    func testUpdateRepairsModifiedComponentContent() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding)
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let hostURL = codexHomeURL.appendingPathComponent(
            "extensions/components/bindings/\(Self.chatgptVersion)/1.0.0/host.js"
        )
        try Data("modified".utf8).write(to: hostURL)
        installResponses(
            index: index,
            archives: [
                "binding-\(Self.chatgptVersion)-v1.0.0": binding
            ]
        )

        guard case .installed = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        ).result else {
            return XCTFail("Modified component content must be repaired.")
        }
        XCTAssertEqual(
            try Data(contentsOf: hostURL),
            Data("module.exports = {};".utf8)
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL(
                    "binding-\(Self.chatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testUpdateRepairsUnexpectedComponentFile() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding)
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let unexpectedURL = codexHomeURL.appendingPathComponent(
            "extensions/components/chatgpt-api/1.1.0/unexpected.js"
        )
        try Data("unexpected".utf8).write(to: unexpectedURL)
        installResponses(
            index: index,
            archives: ["chatgpt-api-v1.1.0": api]
        )

        guard case .installed = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        ).result else {
            return XCTFail("Unexpected component files must be removed.")
        }
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: unexpectedURL.path)
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [Self.indexURL, releaseURL("chatgpt-api-v1.1.0")]
        )
    }

    @MainActor
    func testUpdateRepairsMissingIntegrityReceipt() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding)
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let receiptURL = codexHomeURL.appendingPathComponent(
            "extensions/components/bindings/\(Self.chatgptVersion)/1.0.0"
        ).appendingPathComponent(ComponentStore.integrityReceiptFileName)
        try FileManager.default.removeItem(at: receiptURL)
        installResponses(
            index: index,
            archives: [
                "binding-\(Self.chatgptVersion)-v1.0.0": binding
            ]
        )

        guard case .installed = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        ).result else {
            return XCTFail("A missing integrity receipt must be repaired.")
        }
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: receiptURL.path)
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL(
                    "binding-\(Self.chatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testUpdateRepairsReceiptWithWrongArchiveHash() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding)
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let receiptURL = codexHomeURL.appendingPathComponent(
            "extensions/components/bindings/\(Self.chatgptVersion)/1.0.0"
        ).appendingPathComponent(ComponentStore.integrityReceiptFileName)
        var receipt = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: Data(contentsOf: receiptURL)
            ) as? [String: Any]
        )
        receipt["archiveSHA256"] = hash("not-the-archive")
        try json(receipt).write(to: receiptURL, options: .atomic)
        installResponses(
            index: index,
            archives: [
                "binding-\(Self.chatgptVersion)-v1.0.0": binding
            ]
        )

        guard case .installed = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        ).result else {
            return XCTFail("A receipt for another archive must be repaired.")
        }
        let repairedReceipt = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: Data(contentsOf: receiptURL)
            ) as? [String: Any]
        )
        XCTAssertEqual(
            repairedReceipt["archiveSHA256"] as? String,
            digest(binding)
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL(
                    "binding-\(Self.chatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    func testFailedRepairKeepsCorruptPackageUntilReplacementIsReady()
        async throws
    {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding)
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let apiRootURL = codexHomeURL.appendingPathComponent(
            "extensions/components/chatgpt-api/1.1.0",
            isDirectory: true
        )
        try FileManager.default.removeItem(
            at: apiRootURL.appendingPathComponent("bridge/main.cjs")
        )
        ComponentUpdateURLProtocol.responses = [Self.indexURL: json(index)]
        ComponentUpdateURLProtocol.requestedURLs = []

        do {
            _ = try await makeService().update(
                for: Self.chatgptVersion,
                chatgptAsarSHA256: Self.asarHash
            )
            XCTFail("A failed component download must fail the repair.")
        } catch {
            XCTAssertTrue(
                FileManager.default.fileExists(
                    atPath: apiRootURL.appendingPathComponent(
                        "manifest.json"
                    ).path
                )
            )
            XCTAssertFalse(
                FileManager.default.fileExists(
                    atPath: apiRootURL.appendingPathComponent(
                        "bridge/main.cjs"
                    ).path
                )
            )
        }
    }

    @MainActor
    func testSettingsCommitFailureRestoresPriorActiveLock() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let originalBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let originalIndex = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(originalBinding)
        )
        installResponses(
            index: originalIndex,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": originalBinding,
            ]
        )
        _ = try await makeService().update(
            for: Self.chatgptVersion,
            chatgptAsarSHA256: Self.asarHash
        )

        let extensionsRoot = codexHomeURL.appendingPathComponent(
            "extensions",
            isDirectory: true
        )
        let lockURL = extensionsRoot.appendingPathComponent(
            "versions-lock.json"
        )
        let priorLock = try Data(contentsOf: lockURL)
        let settingsURL = extensionsRoot.appendingPathComponent(
            "settings.json"
        )
        try FileManager.default.removeItem(at: settingsURL)
        try FileManager.default.createDirectory(
            at: settingsURL,
            withIntermediateDirectories: false
        )

        let correctedBinding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.1",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        var correctedIndex = originalIndex
        var bindings = try XCTUnwrap(
            correctedIndex["bindings"] as? [String: Any]
        )
        bindings[Self.chatgptVersion] = bindingEntry(
            chatgpt: Self.chatgptVersion,
            version: "1.0.1",
            api: "1.1.0",
            asarHash: Self.asarHash,
            hash: digest(correctedBinding)
        )
        correctedIndex["bindings"] = bindings
        installResponses(
            index: correctedIndex,
            archives: [
                "binding-\(Self.chatgptVersion)-v1.0.1": correctedBinding
            ]
        )

        do {
            _ = try await makeService().update(
                for: Self.chatgptVersion,
                chatgptAsarSHA256: Self.asarHash
            )
            XCTFail("An unwritable settings target must fail the update.")
        } catch {
            XCTAssertEqual(try Data(contentsOf: lockURL), priorLock)
        }
    }

    @MainActor
    func testExactBuildHashAndMinimumLauncherAreRequired() async throws {
        let api = try makeAPIArchive(version: "1.1.0")
        let binding = try makeBindingArchive(
            chatgpt: Self.chatgptVersion,
            version: "1.0.0",
            api: "1.1.0",
            asarHash: Self.asarHash
        )
        let index = makeIndex(
            apiHash: digest(api),
            bindingHash: digest(binding)
        )
        installResponses(
            index: index,
            archives: [
                "chatgpt-api-v1.1.0": api,
                "binding-\(Self.chatgptVersion)-v1.0.0": binding,
            ]
        )

        do {
            _ = try await makeService().update(
                for: Self.chatgptVersion,
                chatgptAsarSHA256: Self.nextAsarHash
            )
            XCTFail("A different app.asar hash must be rejected.")
        } catch ComponentUpdateError.bindingBuildUnavailable(let version) {
            XCTAssertEqual(version, Self.chatgptVersion)
        }

        do {
            _ = try await makeService(launcherVersion: "1.0.9").update(
                for: Self.chatgptVersion,
                chatgptAsarSHA256: Self.asarHash
            )
            XCTFail("An old launcher must be rejected.")
        } catch ComponentUpdateError.launcherTooOld(
            let installed,
            let minimum
        ) {
            XCTAssertEqual(installed, "1.0.9")
            XCTAssertEqual(minimum, "1.1.0")
        }

        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: codexHomeURL.appendingPathComponent(
                    "extensions/versions-lock.json"
                ).path
            )
        )
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: codexHomeURL.appendingPathComponent(
                    "extensions/prefetched/\(Self.chatgptVersion).json"
                ).path
            )
        )
        XCTAssertEqual(
            ComponentUpdateURLProtocol.requestedURLs,
            [
                Self.indexURL,
                releaseURL("chatgpt-api-v1.1.0"),
                releaseURL(
                    "binding-\(Self.chatgptVersion)-v1.0.0"
                ),
            ]
        )
    }

    @MainActor
    private func makeService(
        launcherVersion: String = "1.1.0",
        beforeActivation: @escaping (
            _ chatgptVersion: String,
            _ chatgptAsarSHA256: String
        ) throws -> Void = { _, _ in }
    ) throws -> ComponentUpdateService {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ComponentUpdateURLProtocol.self]
        return ComponentUpdateService(
            componentStore: try ComponentStore(
                environment: ["CODEX_HOME": codexHomeURL.path]
            ),
            session: URLSession(configuration: configuration),
            indexURL: Self.indexURL,
            launcherVersion: launcherVersion,
            beforeActivation: beforeActivation,
            environment: [:]
        )
    }

    private func makeIndex(
        apiHash: String,
        bindingHash: String,
        apiVersion: String = "1.1.0",
        extensionVersions: [String: [String: [String: Any]]] = [:]
    ) -> [String: Any] {
        [
            "schemaVersion": 3,
            "generation": 7,
            "minimumLauncherVersion": "1.1.0",
            "releaseBaseURL": Self.releaseBaseURL,
            "chatgptApis": [
                apiVersion: [
                    "release": "chatgpt-api-v\(apiVersion)",
                    "sha256": apiHash,
                ]
            ],
            "bindings": [
                Self.chatgptVersion: bindingEntry(
                    chatgpt: Self.chatgptVersion,
                    version: "1.0.0",
                    api: apiVersion,
                    asarHash: Self.asarHash,
                    hash: bindingHash
                )
            ],
            "extensions": extensionCatalogs(extensionVersions),
        ]
    }

    private func bindingEntry(
        chatgpt: String,
        version: String,
        api: String,
        asarHash: String,
        hash: String
    ) -> [String: Any] {
        [
            "version": version,
            "chatgptApi": api,
            "asarSha256": asarHash,
            "release": "binding-\(chatgpt)-v\(version)",
            "sha256": hash,
        ]
    }

    private func extensionEntry(
        apiRange: String,
        hash: String
    ) -> [String: Any] {
        [
            "compatibility": ["chatgptApi": apiRange],
            "release": "placeholder",
            "sha256": hash,
        ]
    }

    private func installResponses(
        index: [String: Any],
        archives: [String: Data]
    ) {
        var responses = [Self.indexURL: json(index)]
        for (release, data) in archives {
            responses[releaseURL(release)] = data
        }
        ComponentUpdateURLProtocol.responses = responses
        ComponentUpdateURLProtocol.requestedURLs = []
    }

    private func extensionCatalogs(
        _ source: [String: [String: [String: Any]]]
    ) -> [String: Any] {
        Dictionary(uniqueKeysWithValues: source.map { id, versions in
            let entries = Dictionary(
                uniqueKeysWithValues: versions.map { version, rawEntry in
                    var entry = rawEntry
                    entry["release"] = "extension-\(id)-v\(version)"
                    return (version, entry)
                }
            )
            return (id, ["versions": entries])
        })
    }

    private func makeAPIArchive(
        version: String,
        includeManagerAuthorization: Bool = true
    ) throws -> Data {
        var files = [
            "manifest.json": json(["version": version]),
            "types.d.ts": Data("export {};".utf8),
            "bridge/main.cjs": Data("module.exports = {};".utf8),
            "bridge/preload.cjs": Data("module.exports = {};".utf8),
            "runtime/codex-paths.cjs": Data("module.exports = {};".utf8),
            "runtime/extension-launch-config.cjs": Data(
                "module.exports = {};".utf8
            ),
        ]
        if includeManagerAuthorization {
            files["runtime/extension-manager-authorization.cjs"] = Data(
                "module.exports = {};".utf8
            )
        }
        return try makeArchive(files: files)
    }

    private func makeBindingArchive(
        chatgpt: String,
        version: String,
        api: String,
        asarHash: String
    ) throws -> Data {
        try makeArchive(files: [
            "manifest.json": json([
                "version": version,
                "chatgpt": chatgpt,
                "chatgptApi": api,
                "asarSha256": asarHash,
            ]),
            "host.js": Data("module.exports = {};".utf8),
        ])
    }

    private func makeExtensionArchive(
        id: String,
        version: String,
        apiRange: String
    ) throws -> Data {
        try makeArchive(files: [
            "package.json": json([
                "id": id,
                "name": "Sample",
                "description": "A test extension.",
                "version": version,
                "main": "contents/main.js",
                "compatibility": ["chatgptApi": apiRange],
            ]),
            "contents/main.js": Data("module.exports = {};".utf8),
        ])
    }

    private func makeArchive(files: [String: Data]) throws -> Data {
        let root = codexHomeURL.appendingPathComponent(
            "archive-\(UUID().uuidString)",
            isDirectory: true
        )
        let archiveURL = codexHomeURL.appendingPathComponent(
            "\(UUID().uuidString).zip"
        )
        try FileManager.default.createDirectory(
            at: root,
            withIntermediateDirectories: false
        )
        defer {
            try? FileManager.default.removeItem(at: root)
            try? FileManager.default.removeItem(at: archiveURL)
        }
        for (path, data) in files {
            let url = root.appendingPathComponent(path)
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: url)
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        process.arguments = ["-c", "-k", root.path, archiveURL.path]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw TestError.archiveCreationFailed
        }
        return try Data(contentsOf: archiveURL)
    }

    private func writeSettings(
        _ records: [String: [String: Any]]
    ) throws {
        let extensionsRoot = codexHomeURL.appendingPathComponent(
            "extensions",
            isDirectory: true
        )
        try FileManager.default.createDirectory(
            at: extensionsRoot,
            withIntermediateDirectories: true
        )
        try json([
            "schemaVersion": 1,
            "extensions": records,
        ]).write(
            to: extensionsRoot.appendingPathComponent("settings.json")
        )
    }

    private func settingsRecords() throws -> [String: [String: Any]] {
        let url = codexHomeURL.appendingPathComponent(
            "extensions/settings.json"
        )
        let root = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: url))
                as? [String: Any]
        )
        return try XCTUnwrap(
            root["extensions"] as? [String: [String: Any]]
        )
    }

    private func releaseURL(_ release: String) -> URL {
        URL(
            string: "\(Self.releaseBaseURL)/\(release)/\(release).zip"
        )!
    }

    private func json(_ object: Any) -> Data {
        try! JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys]
        )
    }

    private func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map {
            String(format: "%02x", $0)
        }.joined()
    }

    private func hash(_ seed: String) -> String {
        digest(Data(seed.utf8))
    }
}

private enum TestError: Error {
    case archiveCreationFailed
}

private final class ComponentUpdateURLProtocol: URLProtocol,
    @unchecked Sendable
{
    nonisolated(unsafe) static var responses: [URL: Data] = [:]
    nonisolated(unsafe) static var requestedURLs: [URL] = []

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let url = request.url!
        Self.requestedURLs.append(url)
        guard let data = Self.responses[url] else {
            let response = HTTPURLResponse(
                url: url,
                statusCode: 404,
                httpVersion: nil,
                headerFields: nil
            )!
            client?.urlProtocol(
                self,
                didReceive: response,
                cacheStoragePolicy: .notAllowed
            )
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Length": "\(data.count)"]
        )!
        client?.urlProtocol(
            self,
            didReceive: response,
            cacheStoragePolicy: .notAllowed
        )
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
