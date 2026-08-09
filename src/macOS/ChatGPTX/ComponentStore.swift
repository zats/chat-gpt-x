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

struct StoredExtension: Equatable {
    let id: String
    let name: String
    let description: String
    let version: String
    let enabled: Bool
    let required: Bool
    let compatibility: ExtensionCompatibility
    let path: String
}

struct ComponentVersionsLock: Codable, Equatable {
    let schemaVersion: Int
    let generation: Int
    let chatgptApi: StoredChatGPTAPI
    let binding: StoredBinding
}

struct ExtensionSetting {
    var enabled: Bool
    var additionalValues: [String: Any] = [:]
}

struct ExtensionSettings {
    let schemaVersion: Int
    var extensions: [String: ExtensionSetting]
}

struct ExtensionPackageManifest: Decodable {
    let id: String
    let name: String
    let description: String
    let version: String
    let main: String
    let compatibility: ExtensionCompatibility
    let required: Bool?
}

struct PreparedComponentStore {
    let rootURL: URL
    let versionsLockURL: URL
    let versions: ComponentVersionsLock
    let extensions: [StoredExtension]
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
            let versions = try readVersions(at: versionsLockURL)
            if try hasFlatExtensionLayout() == false {
                return try installBundledSeed(
                    versionsLockURL: versionsLockURL,
                    replacing: versions
                )
            }
            let extensions = try reconcileExtensionSettings()
            return PreparedComponentStore(
                rootURL: rootURL,
                versionsLockURL: versionsLockURL,
                versions: versions,
                extensions: extensions,
                bundledComponentsChanged: false
            )
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
        -> ComponentVersionsLock
    {
        let versions = try decode(
            ComponentVersionsLock.self,
            at: versionsLockURL
        )
        try validate(versions)
        try validateInstalledComponents(versions)
        return versions
    }

    private func installBundledSeed(
        versionsLockURL: URL,
        replacing installedVersions: ComponentVersionsLock?
    ) throws
        -> PreparedComponentStore
    {
        let versions = try readBundledVersions()
        let platformComponentsChanged = installedVersions.map {
            versions.chatgptApi != $0.chatgptApi
                || versions.binding != $0.binding
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

        for componentPath in [
            versions.chatgptApi.path,
            versions.binding.path,
        ] {
            try installSeedComponent(
                at: componentPath,
                stagingURL: stagingURL
            )
        }
        let installedExtensionRoot = rootURL.appendingPathComponent(
            "components/extensions",
            isDirectory: true
        )
        let installedExtensionSnapshot = try? extensionSettingsSnapshot(
            at: installedExtensionRoot
        )
        let stagedExtensionRoot = stagingURL.appendingPathComponent(
            "extensions",
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: stagedExtensionRoot,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        for id in try bundledExtensionIDs() {
            let sourceURL = seedURL.appendingPathComponent(
                "components/extensions/\(id)",
                isDirectory: true
            )
            let manifest = try decode(
                ExtensionPackageManifest.self,
                at: sourceURL.appendingPathComponent("package.json")
            )
            try validateExtensionManifest(
                manifest,
                expectedID: id,
                packageRoot: sourceURL
            )
            try fileManager.copyItem(
                at: sourceURL,
                to: stagedExtensionRoot.appendingPathComponent(
                    id,
                    isDirectory: true
                )
            )
        }
        let stagedExtensionSnapshot = try extensionSettingsSnapshot(
            at: stagedExtensionRoot
        )
        let extensionsChanged = installedExtensionSnapshot?.extensions
            != stagedExtensionSnapshot.extensions
        let extensions: [StoredExtension]
        if extensionsChanged {
            try replaceExtensionPackages(
                with: stagedExtensionRoot,
                settingsData: stagedExtensionSnapshot.data
            )
            extensions = stagedExtensionSnapshot.extensions
        } else {
            extensions = installedExtensionSnapshot?.extensions ?? []
        }
        let componentsChanged = platformComponentsChanged || extensionsChanged

        try validateInstalledComponents(versions)

        try atomicWrite(try encode(versions), to: versionsLockURL)

        return PreparedComponentStore(
            rootURL: rootURL,
            versionsLockURL: versionsLockURL,
            versions: versions,
            extensions: extensions,
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

    private func bundledExtensionIDs() throws -> [String] {
        let root = seedURL.appendingPathComponent(
            "components/extensions",
            isDirectory: true
        )
        return try directoryIDs(at: root)
    }

    private func hasFlatExtensionLayout() throws -> Bool {
        let root = rootURL.appendingPathComponent(
            "components/extensions",
            isDirectory: true
        )
        let ids = try directoryIDs(at: root)
        guard !ids.isEmpty else { return false }
        return ids.allSatisfy {
            fileManager.fileExists(
                atPath: root.appendingPathComponent($0)
                    .appendingPathComponent("package.json").path
            )
        }
    }

    func reconcileExtensionSettings() throws -> [StoredExtension] {
        let snapshot = try extensionSettingsSnapshot(
            at: rootURL.appendingPathComponent(
            "components/extensions",
            isDirectory: true
            )
        )
        try atomicWrite(
            snapshot.data,
            to: rootURL.appendingPathComponent("settings.json")
        )
        return snapshot.extensions
    }

    func extensionSettingsSnapshot(at componentsRoot: URL) throws
        -> (data: Data, extensions: [StoredExtension])
    {
        let ids = try directoryIDs(at: componentsRoot)
        var settings = try readExtensionSettings()
        var reconciled: [String: ExtensionSetting] = [:]
        var extensions: [StoredExtension] = []

        for id in ids {
            let packageURL = componentsRoot.appendingPathComponent(id)
                .appendingPathComponent("package.json")
            let manifest = try decode(
                ExtensionPackageManifest.self,
                at: packageURL
            )
            try validateExtensionManifest(
                manifest,
                expectedID: id,
                packageRoot: componentsRoot.appendingPathComponent(id)
            )
            let enabled = manifest.required == true
                ? true
                : settings.extensions[id]?.enabled ?? true
            reconciled[id] = ExtensionSetting(
                enabled: enabled,
                additionalValues:
                    settings.extensions[id]?.additionalValues ?? [:]
            )
            extensions.append(
                StoredExtension(
                    id: id,
                    name: manifest.name,
                    description: manifest.description,
                    version: manifest.version,
                    enabled: enabled,
                    required: manifest.required == true,
                    compatibility: manifest.compatibility,
                    path: "components/extensions/\(id)"
                )
            )
        }

        settings.extensions = reconciled
        return (
            data: try encodeExtensionSettings(settings),
            extensions: extensions
        )
    }

    func replaceExtensionPackages(
        with stagedURL: URL,
        settingsData: Data
    ) throws {
        let destinationURL = try resolveStorePath("components/extensions")
        let backupName = ".extensions-backup-\(UUID().uuidString)"
        let backupURL = destinationURL.deletingLastPathComponent()
            .appendingPathComponent(backupName, isDirectory: true)
        _ = try fileManager.replaceItemAt(
            destinationURL,
            withItemAt: stagedURL,
            backupItemName: backupName,
            options: [.withoutDeletingBackupItem]
        )
        do {
            try atomicWrite(
                settingsData,
                to: rootURL.appendingPathComponent("settings.json")
            )
            try fileManager.removeItem(at: backupURL)
        } catch {
            if fileManager.fileExists(atPath: backupURL.path) {
                _ = try? fileManager.replaceItemAt(
                    destinationURL,
                    withItemAt: backupURL
                )
            }
            throw error
        }
    }

    private func readExtensionSettings() throws -> ExtensionSettings {
        let url = rootURL.appendingPathComponent("settings.json")
        guard fileManager.fileExists(atPath: url.path) else {
            return ExtensionSettings(
                schemaVersion: Self.schemaVersion,
                extensions: [:]
            )
        }
        do {
            let data = try Data(contentsOf: url)
            let object = try JSONSerialization.jsonObject(with: data)
            guard let root = object as? [String: Any],
                root["schemaVersion"] as? Int == Self.schemaVersion
            else {
                throw ComponentStoreError.invalidSettings
            }
            if let records = root["extensions"] as? [String: Any] {
                var extensions: [String: ExtensionSetting] = [:]
                for (id, rawSetting) in records {
                    guard isExtensionID(id),
                        let setting = rawSetting as? [String: Any],
                        let enabled = setting["enabled"] as? Bool
                    else {
                        throw ComponentStoreError.invalidSettings
                    }
                    var additionalValues = setting
                    additionalValues.removeValue(forKey: "enabled")
                    extensions[id] = ExtensionSetting(
                        enabled: enabled,
                        additionalValues: additionalValues
                    )
                }
                return ExtensionSettings(
                    schemaVersion: Self.schemaVersion,
                    extensions: extensions
                )
            }
            if let records = root["extensions"] as? [[String: Any]] {
                var extensions: [String: ExtensionSetting] = [:]
                for record in records {
                    guard let id = record["id"] as? String,
                        isExtensionID(id),
                        extensions[id] == nil,
                        let enabled = record["enabled"] as? Bool
                    else {
                        throw ComponentStoreError.invalidSettings
                    }
                    var additionalValues = record
                    additionalValues.removeValue(forKey: "id")
                    additionalValues.removeValue(forKey: "enabled")
                    extensions[id] = ExtensionSetting(
                        enabled: enabled,
                        additionalValues: additionalValues
                    )
                }
                return ExtensionSettings(
                    schemaVersion: Self.schemaVersion,
                    extensions: extensions
                )
            }
            throw ComponentStoreError.invalidSettings
        } catch let error as ComponentStoreError {
            throw error
        } catch {
            throw ComponentStoreError.invalidJSON(url, error)
        }
    }

    private func directoryIDs(at root: URL) throws -> [String] {
        try fileManager.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ).filter {
            try $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true
        }.map(\.lastPathComponent).sorted()
    }

    private func encodeExtensionSettings(
        _ settings: ExtensionSettings
    ) throws -> Data {
        let extensions = settings.extensions.mapValues { setting in
            setting.additionalValues.merging(["enabled": setting.enabled]) {
                _, enabled in enabled
            }
        }
        var data = try JSONSerialization.data(
            withJSONObject: [
                "schemaVersion": settings.schemaVersion,
                "extensions": extensions,
            ],
            options: [.prettyPrinted, .sortedKeys]
        )
        data.append(0x0A)
        return data
    }

    private func validateExtensionManifest(
        _ manifest: ExtensionPackageManifest,
        expectedID: String,
        packageRoot: URL
    ) throws {
        guard manifest.id == expectedID,
            isExtensionID(manifest.id),
            !manifest.name.isEmpty,
            isVersion(manifest.version),
            manifest.main == "contents/main.js",
            !manifest.compatibility.chatgpt.isEmpty,
            !manifest.compatibility.chatgptApi.isEmpty,
            fileManager.fileExists(
                atPath: packageRoot.appendingPathComponent(
                    "contents/main.js"
                ).path
            )
        else {
            throw ComponentStoreError.componentFileMissing(
                "components/extensions/\(expectedID)"
            )
        }
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
        ]

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
