import Darwin
import Foundation

struct StoredChatGPTAPI: Codable, Equatable {
    let version: String
    let release: String
    let sha256: String
    let path: String
}

struct StoredBinding: Codable, Equatable {
    let chatgpt: String
    let version: String
    let chatgptApi: String
    let asarSha256: String
    let release: String
    let sha256: String
    let path: String
}

struct ExtensionCompatibility: Codable, Equatable {
    let chatgpt: String
    let chatgptApi: String
}

struct StoredExtension: Codable, Equatable {
    let id: String
    let version: String
    let enabled: Bool
    let compatibility: ExtensionCompatibility
    let release: String
    let sha256: String
    let path: String
}

struct ComponentVersionsLock: Codable, Equatable {
    let schemaVersion: Int
    let generation: Int
    let chatgptApi: StoredChatGPTAPI
    let binding: StoredBinding
    let extensions: [StoredExtension]
}

struct ExtensionSetting: Codable {
    let id: String
    let enabled: Bool
}

struct ExtensionSettings: Codable {
    let schemaVersion: Int
    let extensions: [ExtensionSetting]
}

struct PreparedComponentStore {
    let rootURL: URL
    let versionsLockURL: URL
    let versions: ComponentVersionsLock
    let bundledComponentsChanged: Bool
}

struct ComponentStore {
    private static let schemaVersion = 1

    let fileManager: FileManager
    let rootURL: URL
    private let seedURL: URL

    init(
        fileManager: FileManager = .default,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        bundle: Bundle = .main
    ) throws {
        self.fileManager = fileManager

        let codexHomeURL: URL
        if let path = environment["CODEX_HOME"], !path.isEmpty {
            codexHomeURL = URL(fileURLWithPath: path, isDirectory: true)
        } else {
            codexHomeURL = fileManager.homeDirectoryForCurrentUser
                .appendingPathComponent(".codex", isDirectory: true)
        }
        rootURL = codexHomeURL.appendingPathComponent(
            "extensions",
            isDirectory: true
        )

        guard let resourcesURL = bundle.resourceURL else {
            throw ComponentStoreError.resourcesMissing
        }
        seedURL = resourcesURL.appendingPathComponent(
            "component-seed",
            isDirectory: true
        )
    }

    func prepare(forChatGPTVersion chatGPTVersion: String?) throws
        -> PreparedComponentStore
    {
        let installed = try prepareInstalled()
        let bundled = try readBundledVersions()
        if !shouldInstallBundledSeed(
            installed: installed.versions,
            bundled: bundled,
            chatGPTVersion: chatGPTVersion
        ) {
            return installed
        }
        return try installBundledSeed(
            versionsLockURL: installed.versionsLockURL,
            replacing: installed.versions
        )
    }

    func prepareInstalled() throws -> PreparedComponentStore {
        try createStoreLayout()

        let versionsLockURL = rootURL.appendingPathComponent(
            "versions-lock.json"
        )
        if fileManager.fileExists(atPath: versionsLockURL.path) {
            return try readVersions(at: versionsLockURL)
        }
        return try installBundledSeed(
            versionsLockURL: versionsLockURL,
            replacing: nil
        )
    }

    private func shouldInstallBundledSeed(
        installed: ComponentVersionsLock,
        bundled: ComponentVersionsLock,
        chatGPTVersion: String?
    ) -> Bool {
        guard let chatGPTVersion else { return false }

        let installedMatches = installed.binding.chatgpt == chatGPTVersion
        let bundledMatches = bundled.binding.chatgpt == chatGPTVersion
        if installedMatches != bundledMatches {
            return bundledMatches
        }
        return bundledMatches && bundled.generation > installed.generation
    }

    private func createStoreLayout() throws {
        for relativePath in [
            "",
            "components",
            "components/chatgpt-api",
            "components/bindings",
            "components/extensions",
            "state",
        ] {
            let directoryURL = relativePath.isEmpty
                ? rootURL
                : rootURL.appendingPathComponent(
                    relativePath,
                    isDirectory: true
                )
            try fileManager.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
        }
    }

    private func readVersions(at versionsLockURL: URL) throws
        -> PreparedComponentStore
    {
        let versions = try decode(
            ComponentVersionsLock.self,
            at: versionsLockURL
        )
        try validate(versions)
        try validateInstalledComponents(versions)
        return PreparedComponentStore(
            rootURL: rootURL,
            versionsLockURL: versionsLockURL,
            versions: versions,
            bundledComponentsChanged: false
        )
    }

    private func installBundledSeed(
        versionsLockURL: URL,
        replacing installedVersions: ComponentVersionsLock?
    ) throws
        -> PreparedComponentStore
    {
        let versions = try bundledVersionsApplyingSettings()
        let componentsChanged = installedVersions.map {
            versions.chatgptApi != $0.chatgptApi
                || versions.binding != $0.binding
                || versions.extensions != $0.extensions
        } ?? true

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

        let stagingURL = downloadsURL
            .appendingPathComponent(
                "seed-\(UUID().uuidString)",
                isDirectory: true
            )
        try fileManager.createDirectory(
            at: stagingURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        defer { try? fileManager.removeItem(at: stagingURL) }

        let componentPaths = [
            versions.chatgptApi.path,
            versions.binding.path,
        ] + versions.extensions.map(\.path)
        for componentPath in componentPaths {
            try installSeedComponent(
                at: componentPath,
                stagingURL: stagingURL
            )
        }

        try validateInstalledComponents(versions)

        let settingsURL = rootURL.appendingPathComponent("settings.json")
        if !fileManager.fileExists(atPath: settingsURL.path) {
            let settings = ExtensionSettings(
                schemaVersion: Self.schemaVersion,
                extensions: versions.extensions.map {
                    ExtensionSetting(id: $0.id, enabled: true)
                }
            )
            try atomicWrite(try encode(settings), to: settingsURL)
        }

        try atomicWrite(try encode(versions), to: versionsLockURL)

        return PreparedComponentStore(
            rootURL: rootURL,
            versionsLockURL: versionsLockURL,
            versions: versions,
            bundledComponentsChanged: componentsChanged
        )
    }

    private func readBundledVersions() throws -> ComponentVersionsLock {
        let seedVersionsLockURL = seedURL.appendingPathComponent(
            "versions-lock.json"
        )
        let versions = try decode(
            ComponentVersionsLock.self,
            at: seedVersionsLockURL
        )
        try validate(versions)
        return versions
    }

    private func bundledVersionsApplyingSettings() throws
        -> ComponentVersionsLock
    {
        let versions = try readBundledVersions()
        let settingsURL = rootURL.appendingPathComponent("settings.json")
        guard fileManager.fileExists(atPath: settingsURL.path) else {
            return versions
        }

        let settings = try decode(ExtensionSettings.self, at: settingsURL)
        var seenIDs = Set<String>()
        guard
            settings.schemaVersion == Self.schemaVersion,
            settings.extensions.allSatisfy({
                seenIDs.insert($0.id).inserted
            })
        else {
            throw ComponentStoreError.invalidSettings
        }

        let extensionsByID = Dictionary(
            uniqueKeysWithValues: versions.extensions.map { ($0.id, $0) }
        )
        let configuredIDs = Set(settings.extensions.map(\.id))
        let configuredExtensions = settings.extensions.compactMap { setting in
            extensionsByID[setting.id].map { component in
                StoredExtension(
                    id: component.id,
                    version: component.version,
                    enabled: setting.enabled,
                    compatibility: component.compatibility,
                    release: component.release,
                    sha256: component.sha256,
                    path: component.path
                )
            }
        }
        let newExtensions = versions.extensions.filter {
            !configuredIDs.contains($0.id)
        }

        return ComponentVersionsLock(
            schemaVersion: versions.schemaVersion,
            generation: versions.generation,
            chatgptApi: versions.chatgptApi,
            binding: versions.binding,
            extensions: configuredExtensions + newExtensions
        )
    }

    private func installSeedComponent(
        at relativePath: String,
        stagingURL: URL
    ) throws {
        let sourceURL = seedURL.appendingPathComponent(
            relativePath,
            isDirectory: true
        )
        var isDirectory: ObjCBool = false
        guard
            fileManager.fileExists(
                atPath: sourceURL.path,
                isDirectory: &isDirectory
            ),
            isDirectory.boolValue
        else {
            throw ComponentStoreError.seedComponentMissing(relativePath)
        }

        let destinationURL = try resolveStorePath(relativePath)
        if fileManager.fileExists(atPath: destinationURL.path) {
            return
        }

        let stagedURL = stagingURL.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )
        try fileManager.copyItem(at: sourceURL, to: stagedURL)
        try fileManager.createDirectory(
            at: destinationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        try fileManager.moveItem(at: stagedURL, to: destinationURL)
    }

    func validate(_ versions: ComponentVersionsLock) throws {
        guard
            versions.schemaVersion == Self.schemaVersion,
            versions.generation > 0,
            isVersion(versions.chatgptApi.version),
            isHash(versions.chatgptApi.sha256),
            versions.chatgptApi.path
                == "components/chatgpt-api/\(versions.chatgptApi.version)",
            isChatGPTVersion(versions.binding.chatgpt),
            isVersion(versions.binding.version),
            versions.binding.chatgptApi == versions.chatgptApi.version,
            isHash(versions.binding.asarSha256),
            isHash(versions.binding.sha256),
            versions.binding.path
                == "components/bindings/\(versions.binding.chatgpt)/\(versions.binding.version)"
        else {
            throw ComponentStoreError.invalidVersionsLock
        }

        var extensionIDs = Set<String>()
        for extensionComponent in versions.extensions {
            guard
                isExtensionID(extensionComponent.id),
                extensionIDs.insert(extensionComponent.id).inserted,
                isVersion(extensionComponent.version),
                isHash(extensionComponent.sha256),
                !extensionComponent.compatibility.chatgpt.isEmpty,
                !extensionComponent.compatibility.chatgptApi.isEmpty,
                extensionComponent.path
                    == "components/extensions/\(extensionComponent.id)/\(extensionComponent.version)"
            else {
                throw ComponentStoreError.invalidVersionsLock
            }
        }
    }

    func validateInstalledComponents(
        _ versions: ComponentVersionsLock
    ) throws {
        let requiredPaths = [
            "\(versions.chatgptApi.path)/manifest.json",
            "\(versions.chatgptApi.path)/bridge/main.cjs",
            "\(versions.chatgptApi.path)/bridge/preload.cjs",
            "\(versions.chatgptApi.path)/runtime/codex-paths.cjs",
            "\(versions.chatgptApi.path)/runtime/extension-launch-config.cjs",
            "\(versions.binding.path)/manifest.json",
            "\(versions.binding.path)/host.js",
        ] + versions.extensions.flatMap {
            [
                "\($0.path)/package.json",
                "\($0.path)/contents/main.js",
            ]
        }

        for relativePath in requiredPaths {
            let fileURL = try resolveStorePath(relativePath)
            var isDirectory: ObjCBool = false
            guard
                fileManager.fileExists(
                    atPath: fileURL.path,
                    isDirectory: &isDirectory
                ),
                !isDirectory.boolValue
            else {
                throw ComponentStoreError.componentFileMissing(relativePath)
            }
        }
    }

    func resolveStorePath(_ relativePath: String) throws -> URL {
        guard
            !relativePath.hasPrefix("/"),
            !relativePath.split(separator: "/").contains("..")
        else {
            throw ComponentStoreError.invalidPath(relativePath)
        }
        let resolved = rootURL.appendingPathComponent(relativePath)
            .standardizedFileURL
        let rootPath = rootURL.standardizedFileURL.path + "/"
        guard resolved.path.hasPrefix(rootPath) else {
            throw ComponentStoreError.invalidPath(relativePath)
        }
        return resolved
    }

    func decode<Value: Decodable>(
        _ type: Value.Type,
        at url: URL
    ) throws -> Value {
        do {
            return try JSONDecoder().decode(type, from: Data(contentsOf: url))
        } catch {
            throw ComponentStoreError.invalidJSON(url, error)
        }
    }

    func encode<Value: Encodable>(_ value: Value) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        var data = try encoder.encode(value)
        data.append(0x0A)
        return data
    }

    func atomicWrite(_ data: Data, to destinationURL: URL) throws {
        let temporaryURL = destinationURL
            .deletingLastPathComponent()
            .appendingPathComponent(
                ".\(destinationURL.lastPathComponent).\(UUID().uuidString).tmp"
            )
        try data.write(to: temporaryURL, options: .withoutOverwriting)
        do {
            try fileManager.setAttributes(
                [.posixPermissions: 0o600],
                ofItemAtPath: temporaryURL.path
            )
            let result = temporaryURL.path.withCString { source in
                destinationURL.path.withCString { destination in
                    Darwin.rename(source, destination)
                }
            }
            guard result == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        } catch {
            try? fileManager.removeItem(at: temporaryURL)
            throw error
        }
    }

    private func isVersion(_ value: String) -> Bool {
        value.range(
            of: #"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$"#,
            options: .regularExpression
        ) != nil
    }

    private func isChatGPTVersion(_ value: String) -> Bool {
        value.range(
            of: #"^[0-9]+(?:\.[0-9]+)+$"#,
            options: .regularExpression
        ) != nil
    }

    private func isExtensionID(_ value: String) -> Bool {
        value.range(
            of: #"^[a-z0-9][a-z0-9._-]*$"#,
            options: .regularExpression
        ) != nil
    }

    private func isHash(_ value: String) -> Bool {
        value.range(
            of: #"^[a-f0-9]{64}$"#,
            options: .regularExpression
        ) != nil
    }
}

private enum ComponentStoreError: LocalizedError {
    case resourcesMissing
    case invalidVersionsLock
    case invalidSettings
    case invalidPath(String)
    case invalidJSON(URL, any Error)
    case seedComponentMissing(String)
    case componentFileMissing(String)

    var errorDescription: String? {
        switch self {
        case .resourcesMissing:
            "ChatGPTX resources are missing."
        case .invalidVersionsLock:
            "The component versions lock is invalid."
        case .invalidSettings:
            "The extension settings are invalid."
        case .invalidPath(let path):
            "The component path is invalid: \(path)"
        case .invalidJSON(let url, let error):
            "Could not read \(url.path): \(error.localizedDescription)"
        case .seedComponentMissing(let path):
            "The bundled component is missing: \(path)"
        case .componentFileMissing(let path):
            "The installed component file is missing: \(path)"
        }
    }
}
