import Foundation
import XCTest
@testable import ChatGPTX

final class ComponentStoreTests: XCTestCase {
    private let hashA = String(repeating: "a", count: 64)
    private let hashB = String(repeating: "b", count: 64)
    private let hashC = String(repeating: "c", count: 64)
    private let hashD = String(repeating: "d", count: 64)
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
    func testEmptyStoreCreatesLayoutAndReturnsNil() throws {
        let store = try makeStore()

        XCTAssertNil(try store.prepareInstalled())

        for relativePath in [
            "components/chatgpt-api",
            "components/bindings",
            "components/extensions",
            "state",
        ] {
            var isDirectory: ObjCBool = false
            XCTAssertTrue(
                FileManager.default.fileExists(
                    atPath: store.rootURL.appendingPathComponent(
                        relativePath
                    ).path,
                    isDirectory: &isDirectory
                )
            )
            XCTAssertTrue(isDirectory.boolValue)
        }
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: store.rootURL.appendingPathComponent(
                    "versions-lock.json"
                ).path
            )
        )
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: store.rootURL.appendingPathComponent(
                    "settings.json"
                ).path
            )
        )
    }

    @MainActor
    func testValidVersionedStoreReturnsEffectiveExtensions() throws {
        let store = try makeStore()
        let extensionComponent = makeExtension(id: "alpha")
        let lock = makeLock(extensions: [extensionComponent])
        try installFixture(lock, in: store)

        let prepared = try XCTUnwrap(store.prepareInstalled())

        XCTAssertEqual(prepared.versions, lock)
        XCTAssertEqual(prepared.extensions, [extensionComponent])
        XCTAssertEqual(
            prepared.extensions[0].path,
            "components/extensions/alpha/1.0.0"
        )
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: store.rootURL.appendingPathComponent(
                    "components/extensions/alpha/package.json"
                ).path
            )
        )
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: store.rootURL.appendingPathComponent(
                    "components/extensions/alpha/1.0.0/package.json"
                ).path
            )
        )

        let settings = try jsonObject(
            at: store.rootURL.appendingPathComponent("settings.json")
        )
        let records = try XCTUnwrap(
            settings["extensions"] as? [String: [String: Any]]
        )
        XCTAssertEqual(records["alpha"]?["enabled"] as? Bool, true)
    }

    @MainActor
    func testCompatibilityIgnoresOldChatGPTKeyAndEncodesOnlyAPI() throws {
        let data = Data(
            #"{"chatgpt":">=26.700.1","chatgptApi":"^1.0.0"}"#.utf8
        )

        let compatibility = try JSONDecoder().decode(
            ExtensionCompatibility.self,
            from: data
        )
        XCTAssertEqual(compatibility.chatgptApi, "^1.0.0")

        let encoded = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(compatibility)
        )
        let object = try XCTUnwrap(encoded as? [String: Any])
        XCTAssertEqual(Set(object.keys), Set(["chatgptApi"]))

        let store = try makeStore()
        let lock = makeLock(extensions: [makeExtension(id: "alpha")])
        try installFixture(lock, in: store, includeOldChatGPTKey: true)
        XCTAssertNotNil(try store.prepareInstalled())
    }

    @MainActor
    func testSettingsPreserveUnselectedRecordsAndRestoreEnablement() throws {
        let store = try makeStore()
        _ = try store.prepareInstalled()
        let alpha = makeExtension(id: "alpha", enabled: true)
        let beta = makeExtension(id: "beta", enabled: true)
        try writeJSON(
            [
                "schemaVersion": 1,
                "extensions": [
                    "alpha": [
                        "enabled": false,
                        "updateChannel": "stable",
                    ],
                    "beta": [
                        "enabled": false,
                        "note": "keep while incompatible",
                    ],
                ],
            ],
            to: store.rootURL.appendingPathComponent("settings.json")
        )
        try installFixture(
            makeLock(extensions: [alpha]),
            in: store,
            writeLayout: false
        )
        try installExtensionPackage(beta, in: store)

        let prepared = try XCTUnwrap(store.prepareInstalled())
        XCTAssertEqual(prepared.versions.extensions[0].enabled, true)
        XCTAssertEqual(prepared.extensions[0].enabled, false)

        var settings = try settingsRecords(in: store)
        XCTAssertEqual(
            settings["alpha"]?["updateChannel"] as? String,
            "stable"
        )
        XCTAssertEqual(
            settings["beta"]?["note"] as? String,
            "keep while incompatible"
        )

        let restored = try store.reconcileExtensionSettings(for: [beta])
        XCTAssertEqual(restored[0].enabled, false)
        settings = try settingsRecords(in: store)
        XCTAssertEqual(settings["alpha"]?["enabled"] as? Bool, false)
        XCTAssertEqual(settings["beta"]?["enabled"] as? Bool, false)
    }

    @MainActor
    func testRequiredExtensionIsForcedEnabledAndKeepsUnknownSettings() throws {
        let store = try makeStore()
        _ = try store.prepareInstalled()
        let required = makeExtension(
            id: "required-extension",
            enabled: true,
            required: true
        )
        try writeJSON(
            [
                "schemaVersion": 1,
                "extensions": [
                    "required-extension": [
                        "enabled": false,
                        "source": "user",
                    ]
                ],
            ],
            to: store.rootURL.appendingPathComponent("settings.json")
        )
        try installFixture(
            makeLock(extensions: [required]),
            in: store,
            writeLayout: false
        )

        let prepared = try XCTUnwrap(store.prepareInstalled())
        XCTAssertTrue(prepared.extensions[0].enabled)

        let settings = try settingsRecords(in: store)
        XCTAssertEqual(
            settings["required-extension"]?["enabled"] as? Bool,
            true
        )
        XCTAssertEqual(
            settings["required-extension"]?["source"] as? String,
            "user"
        )
    }

    @MainActor
    func testPreparedSettingsAreNotWrittenBeforeCommit() throws {
        let store = try makeStore()
        _ = try store.prepareInstalled()
        let required = makeExtension(
            id: "required-extension",
            required: true
        )
        try installExtensionPackage(required, in: store)
        try writeJSON(
            [
                "schemaVersion": 1,
                "extensions": [
                    "required-extension": ["enabled": false]
                ],
            ],
            to: store.rootURL.appendingPathComponent("settings.json")
        )

        let prepared = try store.prepareExtensionSettings(for: [required])

        XCTAssertTrue(prepared.extensions[0].enabled)
        XCTAssertEqual(
            try settingsRecords(in: store)["required-extension"]?["enabled"]
                as? Bool,
            false
        )

        try store.commitExtensionSettings(prepared)
        XCTAssertEqual(
            try settingsRecords(in: store)["required-extension"]?["enabled"]
                as? Bool,
            true
        )
    }

    @MainActor
    func testOldLockWithoutVersionedExtensionsFailsClearly() throws {
        let store = try makeStore()
        _ = try store.prepareInstalled()
        try writeJSON(
            [
                "schemaVersion": 1,
                "generation": 1,
                "chatgptApi": storedAPIObject(),
                "binding": storedBindingObject(),
            ],
            to: store.rootURL.appendingPathComponent("versions-lock.json")
        )

        XCTAssertThrowsError(try store.prepareInstalled()) { error in
            XCTAssertEqual(
                error.localizedDescription,
                "The component versions lock is invalid."
            )
        }
    }

    @MainActor
    func testFlatExtensionPathIsRejected() throws {
        let store = try makeStore()
        _ = try store.prepareInstalled()
        let invalid = makeExtension(
            id: "alpha",
            path: "components/extensions/alpha"
        )
        let lock = makeLock(extensions: [invalid])
        try store.atomicWrite(
            try store.encode(lock),
            to: store.rootURL.appendingPathComponent("versions-lock.json")
        )

        XCTAssertThrowsError(try store.prepareInstalled()) { error in
            XCTAssertEqual(
                error.localizedDescription,
                "The component versions lock is invalid."
            )
        }
    }

    @MainActor
    func testMissingInstalledFileFailsClearly() throws {
        let store = try makeStore()
        let extensionComponent = makeExtension(id: "alpha")
        try installFixture(
            makeLock(extensions: [extensionComponent]),
            in: store,
            omitExtensionMain: true
        )

        XCTAssertThrowsError(try store.prepareInstalled()) { error in
            XCTAssertTrue(
                error.localizedDescription.contains(
                    "components/extensions/alpha/1.0.0/contents/main.js"
                )
            )
        }
    }

    @MainActor
    private func makeStore() throws -> ComponentStore {
        try ComponentStore(
            environment: ["CODEX_HOME": codexHomeURL.path]
        )
    }

    @MainActor
    private func makeLock(
        extensions: [StoredExtension]
    ) -> ComponentVersionsLock {
        ComponentVersionsLock(
            schemaVersion: 1,
            generation: 7,
            chatgptApi: StoredChatGPTAPI(
                version: "1.2.3",
                release: "chatgpt-api-v1.2.3",
                sha256: hashA,
                path: "components/chatgpt-api/1.2.3"
            ),
            binding: StoredBinding(
                chatgpt: "26.900.1",
                version: "2.0.0",
                chatgptApi: "1.2.3",
                asarSha256: hashB,
                release: "binding-26.900.1-v2.0.0",
                sha256: hashC,
                path: "components/bindings/26.900.1/2.0.0"
            ),
            extensions: extensions
        )
    }

    @MainActor
    private func makeExtension(
        id: String,
        enabled: Bool = true,
        required: Bool = false,
        path: String? = nil
    ) -> StoredExtension {
        StoredExtension(
            id: id,
            name: id == "alpha" ? "Alpha" : "Beta Extension",
            description: "Description for \(id)",
            version: "1.0.0",
            enabled: enabled,
            required: required,
            compatibility: ExtensionCompatibility(
                chatgptApi: "^1.0.0"
            ),
            release: "extension-\(id)-v1.0.0",
            sha256: hashD,
            path: path ?? "components/extensions/\(id)/1.0.0"
        )
    }

    @MainActor
    private func installFixture(
        _ lock: ComponentVersionsLock,
        in store: ComponentStore,
        writeLayout: Bool = true,
        includeOldChatGPTKey: Bool = true,
        omitExtensionMain: Bool = false
    ) throws {
        if writeLayout {
            _ = try store.prepareInstalled()
        }
        try installPlatformFiles(lock, in: store)
        for extensionComponent in lock.extensions {
            try installExtensionPackage(
                extensionComponent,
                in: store,
                includeOldChatGPTKey: includeOldChatGPTKey,
                omitMain: omitExtensionMain
            )
        }
        try store.atomicWrite(
            try store.encode(lock),
            to: store.rootURL.appendingPathComponent("versions-lock.json")
        )
    }

    @MainActor
    private func installPlatformFiles(
        _ lock: ComponentVersionsLock,
        in store: ComponentStore
    ) throws {
        try writeJSON(
            ["version": lock.chatgptApi.version],
            to: try store.resolveStorePath(
                "\(lock.chatgptApi.path)/manifest.json"
            )
        )
        for relativePath in [
            "bridge/main.cjs",
            "bridge/preload.cjs",
            "runtime/codex-paths.cjs",
            "runtime/extension-launch-config.cjs",
        ] {
            try writeText(
                "module.exports = {};\n",
                to: try store.resolveStorePath(
                    "\(lock.chatgptApi.path)/\(relativePath)"
                )
            )
        }
        try writeJSON(
            [
                "version": lock.binding.version,
                "chatgpt": lock.binding.chatgpt,
                "chatgptApi": lock.binding.chatgptApi,
                "asarSha256": lock.binding.asarSha256,
            ],
            to: try store.resolveStorePath(
                "\(lock.binding.path)/manifest.json"
            )
        )
        try writeText(
            "(() => {})();\n",
            to: try store.resolveStorePath("\(lock.binding.path)/host.js")
        )
    }

    @MainActor
    private func installExtensionPackage(
        _ extensionComponent: StoredExtension,
        in store: ComponentStore,
        includeOldChatGPTKey: Bool = true,
        omitMain: Bool = false
    ) throws {
        var compatibility: [String: Any] = [
            "chatgptApi": extensionComponent.compatibility.chatgptApi
        ]
        if includeOldChatGPTKey {
            compatibility["chatgpt"] = ">=26.700.1"
        }
        var manifest: [String: Any] = [
            "id": extensionComponent.id,
            "name": extensionComponent.name,
            "description": extensionComponent.description,
            "version": extensionComponent.version,
            "main": "contents/main.js",
            "compatibility": compatibility,
        ]
        if extensionComponent.required {
            manifest["required"] = true
        }
        try writeJSON(
            manifest,
            to: try store.resolveStorePath(
                "\(extensionComponent.path)/package.json"
            )
        )
        if !omitMain {
            try writeText(
                "module.exports = {};\n",
                to: try store.resolveStorePath(
                    "\(extensionComponent.path)/contents/main.js"
                )
            )
        }
    }

    @MainActor
    private func settingsRecords(
        in store: ComponentStore
    ) throws -> [String: [String: Any]] {
        let settings = try jsonObject(
            at: store.rootURL.appendingPathComponent("settings.json")
        )
        return try XCTUnwrap(
            settings["extensions"] as? [String: [String: Any]]
        )
    }

    private func storedAPIObject() -> [String: Any] {
        [
            "version": "1.2.3",
            "release": "chatgpt-api-v1.2.3",
            "sha256": hashA,
            "path": "components/chatgpt-api/1.2.3",
        ]
    }

    private func storedBindingObject() -> [String: Any] {
        [
            "chatgpt": "26.900.1",
            "version": "2.0.0",
            "chatgptApi": "1.2.3",
            "asarSha256": hashB,
            "release": "binding-26.900.1-v2.0.0",
            "sha256": hashC,
            "path": "components/bindings/26.900.1/2.0.0",
        ]
    }

    private func writeText(_ text: String, to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(text.utf8).write(to: url)
    }

    private func writeJSON(_ object: Any, to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        var data = try JSONSerialization.data(
            withJSONObject: object,
            options: [.prettyPrinted, .sortedKeys]
        )
        data.append(0x0A)
        try data.write(to: url)
    }

    private func jsonObject(at url: URL) throws -> [String: Any] {
        try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: url))
                as? [String: Any]
        )
    }
}
