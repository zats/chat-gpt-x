import CryptoKit
import Foundation

struct ComponentUpdateIndex: Decodable {
    let schemaVersion: Int
    let generation: Int
    let releaseBaseURL: String
    let chatgptApis: [String: UpdateRelease]
    let bindings: [String: BindingUpdate]
    let extensions: [String: ExtensionUpdate]

    static func decodeStrict(_ data: Data) throws -> Self {
        let object = try JSONSerialization.jsonObject(with: data)
        try validate(object)
        return try JSONDecoder().decode(Self.self, from: data)
    }

    private static func validate(_ value: Any) throws {
        let root = try object(
            value,
            keys: [
                "schemaVersion",
                "generation",
                "releaseBaseURL",
                "chatgptApis",
                "bindings",
                "extensions",
            ],
            label: "update index"
        )
        guard root["schemaVersion"] as? Int == 2,
            let generation = root["generation"] as? Int,
            generation > 0,
            root["releaseBaseURL"] as? String
                == "https://github.com/zats/chat-gpt-x/releases/download",
            let APIs = root["chatgptApis"] as? [String: Any],
            let bindings = root["bindings"] as? [String: Any],
            let extensions = root["extensions"] as? [String: Any]
        else {
            throw ComponentUpdateError.indexInvalid("root values")
        }

        for (version, rawEntry) in APIs {
            guard isVersion(version) else {
                throw ComponentUpdateError.indexInvalid(
                    "ChatGPT API version \(version)"
                )
            }
            let entry = try release(
                rawEntry,
                label: "ChatGPT API \(version)"
            )
            guard entry.release == "chatgpt-api-v\(version)" else {
                throw ComponentUpdateError.indexInvalid(entry.release)
            }
        }

        for (chatgpt, rawEntry) in bindings {
            guard isNumericVersion(chatgpt) else {
                throw ComponentUpdateError.indexInvalid(
                    "binding \(chatgpt)"
                )
            }
            let entry = try object(
                rawEntry,
                keys: ["version", "chatgptApi", "release", "sha256"],
                label: "binding \(chatgpt)"
            )
            guard
                let version = entry["version"] as? String,
                isVersion(version),
                let api = entry["chatgptApi"] as? String,
                APIs[api] != nil,
                let release = entry["release"] as? String,
                release == "binding-\(chatgpt)-v\(version)",
                let hash = entry["sha256"] as? String,
                isHash(hash)
            else {
                throw ComponentUpdateError.indexInvalid(
                    "binding \(chatgpt)"
                )
            }
        }

        for (id, rawEntry) in extensions {
            guard isExtensionID(id) else {
                throw ComponentUpdateError.indexInvalid("extension \(id)")
            }
            let entry = try object(
                rawEntry,
                keys: [
                    "version",
                    "compatibility",
                    "release",
                    "sha256",
                ],
                label: "extension \(id)"
            )
            let compatibility = try object(
                entry["compatibility"] as Any,
                keys: ["chatgpt", "chatgptApi"],
                label: "extension \(id) compatibility"
            )
            guard
                let version = entry["version"] as? String,
                isVersion(version),
                let release = entry["release"] as? String,
                release == "extension-\(id)-v\(version)",
                let hash = entry["sha256"] as? String,
                isHash(hash),
                let chatgpt = compatibility["chatgpt"] as? String,
                !chatgpt.isEmpty,
                let api = compatibility["chatgptApi"] as? String,
                !api.isEmpty
            else {
                throw ComponentUpdateError.indexInvalid("extension \(id)")
            }
        }
    }

    private static func release(_ value: Any, label: String) throws
        -> (release: String, hash: String)
    {
        let entry = try object(
            value,
            keys: ["release", "sha256"],
            label: label
        )
        guard
            let release = entry["release"] as? String,
            let hash = entry["sha256"] as? String,
            isHash(hash)
        else {
            throw ComponentUpdateError.indexInvalid(label)
        }
        return (release, hash)
    }

    private static func object(
        _ value: Any,
        keys: [String],
        label: String
    ) throws -> [String: Any] {
        guard let object = value as? [String: Any],
            Set(object.keys) == Set(keys) else {
            throw ComponentUpdateError.indexInvalid(label)
        }
        return object
    }

    private static func isVersion(_ value: String) -> Bool {
        value.range(
            of: #"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$"#,
            options: .regularExpression
        ) != nil
    }

    private static func isNumericVersion(_ value: String) -> Bool {
        value.range(
            of: #"^[0-9]+(?:\.[0-9]+)+$"#,
            options: .regularExpression
        ) != nil
    }

    private static func isExtensionID(_ value: String) -> Bool {
        value.range(
            of: #"^[a-z0-9][a-z0-9._-]*$"#,
            options: .regularExpression
        ) != nil
    }

    private static func isHash(_ value: String) -> Bool {
        value.range(
            of: #"^[a-f0-9]{64}$"#,
            options: .regularExpression
        ) != nil
    }
}

struct UpdateRelease: Decodable {
    let release: String
    let sha256: String
}

struct BindingUpdate: Decodable {
    let version: String
    let chatgptApi: String
    let release: String
    let sha256: String
}

struct ExtensionUpdate: Decodable {
    let version: String
    let compatibility: ExtensionCompatibility
    let release: String
    let sha256: String
}

enum ComponentUpdateResult {
    case upToDate(PreparedComponentStore)
    case installed(PreparedComponentStore)

    var preparedStore: PreparedComponentStore {
        switch self {
        case .upToDate(let store), .installed(let store):
            store
        }
    }
}

enum ComponentUpdater {
    private static let indexURL = URL(
        string:
            "https://github.com/zats/chat-gpt-x/releases/download/updates/latest.json"
    )!

    static func fetchIndex(
        session: URLSession = .shared
    ) async throws -> ComponentUpdateIndex {
        let (data, response) = try await session.data(from: indexURL)
        guard let response = response as? HTTPURLResponse,
            response.statusCode == 200 else {
            throw ComponentUpdateError.indexRequestFailed
        }
        return try ComponentUpdateIndex.decodeStrict(data)
    }
}

extension ComponentStore {
    func install(
        _ index: ComponentUpdateIndex,
        chatgptVersion: String,
        session: URLSession = .shared
    ) async throws -> ComponentUpdateResult {
        let current = try prepare()
        guard index.generation >= current.versions.generation else {
            throw ComponentUpdateError.olderGeneration(
                index.generation,
                current.versions.generation
            )
        }
        guard let binding = index.bindings[chatgptVersion] else {
            throw ComponentUpdateError.bindingUnavailable(chatgptVersion)
        }
        guard let api = index.chatgptApis[binding.chatgptApi] else {
            throw ComponentUpdateError.apiUnavailable(binding.chatgptApi)
        }

        let compatibleExtensions = try index.extensions
            .filter {
                try ComponentCompatibility.matches(
                    $0.value.compatibility,
                    chatgptVersion: chatgptVersion,
                    chatgptAPIVersion: binding.chatgptApi
                )
            }
        let settings = try decode(
            ExtensionSettings.self,
            at: rootURL.appendingPathComponent("settings.json")
        )
        guard settings.schemaVersion == 1 else {
            throw ComponentUpdateError.settingsInvalid
        }
        var seenSettings = Set<String>()
        guard settings.extensions.allSatisfy({
            seenSettings.insert($0.id).inserted
        }) else {
            throw ComponentUpdateError.settingsInvalid
        }

        let apiPath = "components/chatgpt-api/\(binding.chatgptApi)"
        try await installArchive(
            release: api.release,
            sha256: api.sha256,
            baseURL: index.releaseBaseURL,
            destinationPath: apiPath,
            kind: .chatgptAPI(version: binding.chatgptApi),
            session: session
        )

        let bindingPath =
            "components/bindings/\(chatgptVersion)/\(binding.version)"
        try await installArchive(
            release: binding.release,
            sha256: binding.sha256,
            baseURL: index.releaseBaseURL,
            destinationPath: bindingPath,
            kind: .binding(
                chatgpt: chatgptVersion,
                version: binding.version,
                api: binding.chatgptApi
            ),
            session: session
        )
        let installedBindingManifest = try decode(
            BindingPackageManifest.self,
            at: try resolveStorePath(
                "\(bindingPath)/manifest.json"
            )
        )

        let extensionsByID = compatibleExtensions
        var orderedSettings = settings.extensions
        let configuredIDs = Set(orderedSettings.map { $0.id })
        for id in extensionsByID.keys.sorted()
            where !configuredIDs.contains(id) {
            orderedSettings.append(ExtensionSetting(id: id, enabled: true))
        }

        var storedExtensions: [StoredExtension] = []
        for setting in orderedSettings {
            guard let extensionUpdate = extensionsByID[setting.id] else {
                continue
            }
            let extensionPath =
                "components/extensions/\(setting.id)/\(extensionUpdate.version)"
            try await installArchive(
                release: extensionUpdate.release,
                sha256: extensionUpdate.sha256,
                baseURL: index.releaseBaseURL,
                destinationPath: extensionPath,
                kind: .extensionComponent(
                    id: setting.id,
                    version: extensionUpdate.version
                ),
                session: session
            )
            storedExtensions.append(
                StoredExtension(
                    id: setting.id,
                    version: extensionUpdate.version,
                    enabled: setting.enabled,
                    compatibility: extensionUpdate.compatibility,
                    release: extensionUpdate.release,
                    sha256: extensionUpdate.sha256,
                    path: extensionPath
                )
            )
        }

        let versions = ComponentVersionsLock(
            schemaVersion: 1,
            generation: index.generation,
            chatgptApi: StoredChatGPTAPI(
                version: binding.chatgptApi,
                release: api.release,
                sha256: api.sha256,
                path: apiPath
            ),
            binding: StoredBinding(
                chatgpt: chatgptVersion,
                version: binding.version,
                chatgptApi: binding.chatgptApi,
                asarSha256: installedBindingManifest.asarSha256,
                release: binding.release,
                sha256: binding.sha256,
                path: bindingPath
            ),
            extensions: storedExtensions
        )
        let componentsChanged =
            versions.chatgptApi != current.versions.chatgptApi
            || versions.binding != current.versions.binding
            || versions.extensions != current.versions.extensions
        if versions == current.versions {
            return .upToDate(current)
        }
        try validate(versions)
        try validateInstalledComponents(versions)
        let versionsLockURL = rootURL.appendingPathComponent(
            "versions-lock.json"
        )
        try atomicWrite(try encode(versions), to: versionsLockURL)

        let prepared = PreparedComponentStore(
            rootURL: rootURL,
            versionsLockURL: versionsLockURL,
            versions: versions
        )
        return componentsChanged ? .installed(prepared) : .upToDate(prepared)
    }

    private func installArchive(
        release: String,
        sha256: String,
        baseURL: String,
        destinationPath: String,
        kind: ArchiveKind,
        session: URLSession
    ) async throws {
        let destinationURL = try resolveStorePath(destinationPath)
        if fileManager.fileExists(atPath: destinationURL.path) {
            return
        }

        guard let archiveURL = URL(
            string: "\(baseURL)/\(release)/\(release).zip"
        ) else {
            throw ComponentUpdateError.releaseURLInvalid(release)
        }
        let downloadsURL = rootURL.appendingPathComponent(
            "downloads",
            isDirectory: true
        )
        if fileManager.fileExists(atPath: downloadsURL.path) {
            try fileManager.removeItem(at: downloadsURL)
        }
        try fileManager.createDirectory(
            at: downloadsURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        defer { try? fileManager.removeItem(at: downloadsURL) }

        let localArchiveURL = downloadsURL.appendingPathComponent(
            "\(release).zip"
        )

        let (temporaryURL, response) = try await session.download(
            from: archiveURL
        )
        guard let response = response as? HTTPURLResponse,
            response.statusCode == 200 else {
            throw ComponentUpdateError.archiveRequestFailed(release)
        }
        try fileManager.copyItem(at: temporaryURL, to: localArchiveURL)
        try fileManager.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: localArchiveURL.path
        )
        let digest = SHA256.hash(
            data: try Data(contentsOf: localArchiveURL)
        ).map { String(format: "%02x", $0) }.joined()
        guard digest == sha256 else {
            throw ComponentUpdateError.checksumMismatch(release)
        }

        let stagingURL = downloadsURL.appendingPathComponent(
            "extract-\(UUID().uuidString)",
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: stagingURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        defer {
            try? fileManager.removeItem(at: stagingURL)
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        process.arguments = [
            "-x",
            "-k",
            localArchiveURL.path,
            stagingURL.path,
        ]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw ComponentUpdateError.extractionFailed(release)
        }

        try validateArchive(at: stagingURL, kind: kind)
        try fileManager.createDirectory(
            at: destinationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        try fileManager.moveItem(at: stagingURL, to: destinationURL)
    }

    private func validateArchive(
        at root: URL,
        kind: ArchiveKind
    ) throws {
        guard let enumerator = fileManager.enumerator(
            at: root,
            includingPropertiesForKeys: [
                .isRegularFileKey,
                .isSymbolicLinkKey,
            ]
        ) else {
            throw ComponentUpdateError.archiveLayoutInvalid
        }
        for case let fileURL as URL in enumerator {
            let values = try fileURL.resourceValues(
                forKeys: [.isSymbolicLinkKey]
            )
            if values.isSymbolicLink == true {
                throw ComponentUpdateError.archiveLayoutInvalid
            }
        }

        switch kind {
        case .chatgptAPI(let version):
            let manifest = try decode(
                APIPackageManifest.self,
                at: root.appendingPathComponent("manifest.json")
            )
            guard manifest.version == version else {
                throw ComponentUpdateError.archiveLayoutInvalid
            }
            try requireFiles(
                [
                    "types.d.ts",
                    "bridge/main.cjs",
                    "bridge/preload.cjs",
                    "runtime/codex-paths.cjs",
                    "runtime/extension-launch-config.cjs",
                ],
                beneath: root
            )
        case .binding(let chatgpt, let version, let api):
            let manifest = try decode(
                BindingPackageManifest.self,
                at: root.appendingPathComponent("manifest.json")
            )
            guard
                manifest.chatgpt == chatgpt,
                manifest.version == version,
                manifest.chatgptApi == api,
                manifest.asarSha256.range(
                    of: #"^[a-f0-9]{64}$"#,
                    options: .regularExpression
                ) != nil
            else {
                throw ComponentUpdateError.archiveLayoutInvalid
            }
            try requireFiles(["host.js"], beneath: root)
        case .extensionComponent(let id, let version):
            let manifest = try decode(
                ExtensionPackageManifest.self,
                at: root.appendingPathComponent("package.json")
            )
            guard
                manifest.id == id,
                manifest.version == version,
                manifest.main == "contents/main.js"
            else {
                throw ComponentUpdateError.archiveLayoutInvalid
            }
            try requireFiles(["contents/main.js"], beneath: root)
        }
    }

    private func requireFiles(_ paths: [String], beneath root: URL) throws {
        for path in paths {
            var isDirectory: ObjCBool = false
            let url = root.appendingPathComponent(path)
            guard
                fileManager.fileExists(
                    atPath: url.path,
                    isDirectory: &isDirectory
                ),
                !isDirectory.boolValue
            else {
                throw ComponentUpdateError.archiveLayoutInvalid
            }
        }
    }
}

private enum ArchiveKind {
    case chatgptAPI(version: String)
    case binding(chatgpt: String, version: String, api: String)
    case extensionComponent(id: String, version: String)
}

private struct APIPackageManifest: Decodable {
    let version: String
}

private struct BindingPackageManifest: Decodable {
    let version: String
    let chatgpt: String
    let chatgptApi: String
    let asarSha256: String
}

private struct ExtensionPackageManifest: Decodable {
    let id: String
    let version: String
    let main: String
}

enum ComponentUpdateError: LocalizedError {
    case indexRequestFailed
    case indexInvalid(String)
    case olderGeneration(Int, Int)
    case bindingUnavailable(String)
    case apiUnavailable(String)
    case settingsInvalid
    case releaseURLInvalid(String)
    case archiveRequestFailed(String)
    case checksumMismatch(String)
    case extractionFailed(String)
    case archiveLayoutInvalid

    var errorDescription: String? {
        switch self {
        case .indexRequestFailed:
            "The update index could not be downloaded."
        case .indexInvalid(let field):
            "The update index is invalid: \(field)."
        case .olderGeneration(let remote, let installed):
            "Update generation \(remote) is older than installed generation \(installed)."
        case .bindingUnavailable(let version):
            "No binding is available for ChatGPT \(version)."
        case .apiUnavailable(let version):
            "ChatGPT API \(version) is unavailable."
        case .settingsInvalid:
            "Extension settings are invalid."
        case .releaseURLInvalid(let release):
            "The release URL is invalid: \(release)."
        case .archiveRequestFailed(let release):
            "The release could not be downloaded: \(release)."
        case .checksumMismatch(let release):
            "The release checksum is invalid: \(release)."
        case .extractionFailed(let release):
            "The release could not be extracted: \(release)."
        case .archiveLayoutInvalid:
            "The release archive layout is invalid."
        }
    }
}
