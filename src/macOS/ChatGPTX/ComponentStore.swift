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
    let chatgptApi: String
}

struct StoredExtension: Codable, Equatable {
    let id: String
    let name: String
    let description: String
    let version: String
    let enabled: Bool
    let required: Bool
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
    let versions: ComponentVersionsLock
    let extensions: [StoredExtension]
}

struct PreparedExtensionSettings {
    let extensions: [StoredExtension]
    fileprivate let settings: ExtensionSettings
}

struct ComponentStore {
    private static let schemaVersion = 1

    let fileManager: FileManager
    let rootURL: URL

    init(
        fileManager: FileManager = .default,
        environment: [String: String] = ProcessInfo.processInfo.environment
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
    }

    func prepareInstalled() throws -> PreparedComponentStore? {
        try createStoreLayout()

        let versionsLockURL = rootURL.appendingPathComponent(
            "versions-lock.json"
        )
        guard fileManager.fileExists(atPath: versionsLockURL.path) else {
            return nil
        }

        let versions = try readVersions(at: versionsLockURL)
        let extensions = try reconcileExtensionSettings(
            for: versions.extensions
        )
        return PreparedComponentStore(
            rootURL: rootURL,
            versions: versions,
            extensions: extensions
        )
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
        let versions: ComponentVersionsLock
        do {
            versions = try JSONDecoder().decode(
                ComponentVersionsLock.self,
                from: Data(contentsOf: versionsLockURL)
            )
        } catch {
            throw ComponentStoreError.invalidVersionsLock
        }
        try validate(versions)
        try validateInstalledComponents(versions)
        return versions
    }

    func reconcileExtensionSettings(
        for selectedExtensions: [StoredExtension],
        recoverInvalidSettings: Bool = false
    ) throws -> [StoredExtension] {
        let prepared = try prepareExtensionSettings(
            for: selectedExtensions,
            recoverInvalidSettings: recoverInvalidSettings
        )
        try commitExtensionSettings(prepared)
        return prepared.extensions
    }

    func prepareExtensionSettings(
        for selectedExtensions: [StoredExtension],
        recoverInvalidSettings: Bool = false
    ) throws -> PreparedExtensionSettings {
        var extensionIDs = Set<String>()
        var settings: ExtensionSettings
        do {
            settings = try readExtensionSettings()
        } catch {
            guard recoverInvalidSettings else { throw error }
            settings = ExtensionSettings(
                schemaVersion: Self.schemaVersion,
                extensions: [:]
            )
        }
        var effectiveExtensions: [StoredExtension] = []

        for extensionComponent in selectedExtensions {
            try validateExtensionShape(
                extensionComponent,
                extensionIDs: &extensionIDs
            )
            let manifest = try installedExtensionManifest(
                for: extensionComponent
            )
            let required = manifest.required == true
            guard extensionComponent.name == manifest.name,
                extensionComponent.description == manifest.description,
                extensionComponent.required == required
            else {
                throw ComponentStoreError.extensionManifestMismatch(
                    extensionComponent.id
                )
            }

            let priorSetting = settings.extensions[extensionComponent.id]
            let enabled = required
                ? true
                : priorSetting?.enabled ?? extensionComponent.enabled
            settings.extensions[extensionComponent.id] = ExtensionSetting(
                enabled: enabled,
                additionalValues: priorSetting?.additionalValues ?? [:]
            )
            effectiveExtensions.append(
                StoredExtension(
                    id: extensionComponent.id,
                    name: manifest.name,
                    description: manifest.description,
                    version: extensionComponent.version,
                    enabled: enabled,
                    required: required,
                    compatibility: extensionComponent.compatibility,
                    release: extensionComponent.release,
                    sha256: extensionComponent.sha256,
                    path: extensionComponent.path
                )
            )
        }

        return PreparedExtensionSettings(
            extensions: effectiveExtensions,
            settings: settings
        )
    }

    func commitExtensionSettings(
        _ prepared: PreparedExtensionSettings
    ) throws {
        try writeExtensionSettingsIfNeeded(prepared.settings)
    }

    func activeVersionsLockData() throws -> Data? {
        let url = rootURL.appendingPathComponent("versions-lock.json")
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try Data(contentsOf: url)
    }

    func activeVersions() throws -> ComponentVersionsLock? {
        let url = rootURL.appendingPathComponent("versions-lock.json")
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try readVersions(at: url)
    }

    func activeVersionsMetadata() throws -> ComponentVersionsLock? {
        let url = rootURL.appendingPathComponent("versions-lock.json")
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let versions: ComponentVersionsLock
        do {
            versions = try JSONDecoder().decode(
                ComponentVersionsLock.self,
                from: Data(contentsOf: url)
            )
        } catch {
            throw ComponentStoreError.invalidVersionsLock
        }
        try validate(versions)
        return versions
    }

    func withExclusiveMutationLock<Result>(
        _ operation: () throws -> Result
    ) throws -> Result {
        try createStoreLayout()
        let lockURL = rootURL.appendingPathComponent("update.lock")
        let descriptor = lockURL.path.withCString {
            Darwin.open($0, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        }
        guard descriptor >= 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        defer {
            _ = Darwin.lockf(descriptor, F_ULOCK, 0)
            _ = Darwin.close(descriptor)
        }

        while Darwin.lockf(descriptor, F_LOCK, 0) != 0 {
            guard errno == EINTR else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        }
        return try operation()
    }

    func restoreVersionsLock(_ data: Data?) throws {
        let url = rootURL.appendingPathComponent("versions-lock.json")
        if let data {
            try atomicWrite(data, to: url)
        } else if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
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
            let object = try JSONSerialization.jsonObject(
                with: Data(contentsOf: url)
            )
            guard let root = object as? [String: Any],
                Set(root.keys) == Set(["schemaVersion", "extensions"]),
                root["schemaVersion"] as? Int == Self.schemaVersion,
                let records = root["extensions"] as? [String: Any]
            else {
                throw ComponentStoreError.invalidSettings
            }

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
        } catch let error as ComponentStoreError {
            throw error
        } catch {
            throw ComponentStoreError.invalidJSON(url, error)
        }
    }

    private func writeExtensionSettingsIfNeeded(
        _ settings: ExtensionSettings
    ) throws {
        let data = try encodeExtensionSettings(settings)
        let url = rootURL.appendingPathComponent("settings.json")
        if fileManager.fileExists(atPath: url.path),
            try Data(contentsOf: url) == data
        {
            return
        }
        try atomicWrite(data, to: url)
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

    private func installedExtensionManifest(
        for extensionComponent: StoredExtension
    ) throws -> ExtensionPackageManifest {
        let packageRoot = try resolveStorePath(extensionComponent.path)
        let manifest = try decode(
            ExtensionPackageManifest.self,
            at: packageRoot.appendingPathComponent("package.json")
        )
        guard manifest.id == extensionComponent.id,
            isExtensionID(manifest.id),
            !manifest.name.isEmpty,
            manifest.version == extensionComponent.version,
            manifest.main == "contents/main.js",
            manifest.compatibility == extensionComponent.compatibility,
            fileManager.fileExists(
                atPath: packageRoot.appendingPathComponent(
                    manifest.main
                ).path
            )
        else {
            throw ComponentStoreError.extensionManifestMismatch(
                extensionComponent.id
            )
        }
        return manifest
    }

    func validate(_ versions: ComponentVersionsLock) throws {
        guard
            versions.schemaVersion == Self.schemaVersion,
            versions.generation > 0,
            isVersion(versions.chatgptApi.version),
            !versions.chatgptApi.release.isEmpty,
            isHash(versions.chatgptApi.sha256),
            versions.chatgptApi.path
                == "components/chatgpt-api/\(versions.chatgptApi.version)",
            isChatGPTVersion(versions.binding.chatgpt),
            isVersion(versions.binding.version),
            versions.binding.chatgptApi == versions.chatgptApi.version,
            isHash(versions.binding.asarSha256),
            !versions.binding.release.isEmpty,
            isHash(versions.binding.sha256),
            versions.binding.path
                == "components/bindings/\(versions.binding.chatgpt)/\(versions.binding.version)"
        else {
            throw ComponentStoreError.invalidVersionsLock
        }

        var extensionIDs = Set<String>()
        for extensionComponent in versions.extensions {
            try validateExtensionShape(
                extensionComponent,
                extensionIDs: &extensionIDs
            )
            guard !extensionComponent.required || extensionComponent.enabled
            else {
                throw ComponentStoreError.invalidVersionsLock
            }
        }
    }

    private func validateExtensionShape(
        _ extensionComponent: StoredExtension,
        extensionIDs: inout Set<String>
    ) throws {
        guard
            isExtensionID(extensionComponent.id),
            extensionIDs.insert(extensionComponent.id).inserted,
            !extensionComponent.name.isEmpty,
            isVersion(extensionComponent.version),
            !extensionComponent.compatibility.chatgptApi.isEmpty,
            !extensionComponent.release.isEmpty,
            isHash(extensionComponent.sha256),
            extensionComponent.path
                == "components/extensions/\(extensionComponent.id)/\(extensionComponent.version)"
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

        let apiManifest = try decode(
            ChatGPTAPIPackageManifest.self,
            at: try resolveStorePath(
                "\(versions.chatgptApi.path)/manifest.json"
            )
        )
        guard apiManifest.version == versions.chatgptApi.version else {
            throw ComponentStoreError.componentManifestMismatch("chatgpt-api")
        }

        let bindingManifest = try decode(
            BindingPackageManifest.self,
            at: try resolveStorePath(
                "\(versions.binding.path)/manifest.json"
            )
        )
        guard bindingManifest.version == versions.binding.version,
            bindingManifest.chatgpt == versions.binding.chatgpt,
            bindingManifest.chatgptApi == versions.binding.chatgptApi,
            bindingManifest.asarSha256 == versions.binding.asarSha256
        else {
            throw ComponentStoreError.componentManifestMismatch("binding")
        }

        for extensionComponent in versions.extensions {
            let manifest = try installedExtensionManifest(
                for: extensionComponent
            )
            let manifestIsRequired = manifest.required == true
            guard manifest.name == extensionComponent.name,
                manifest.description == extensionComponent.description,
                manifestIsRequired == extensionComponent.required
            else {
                throw ComponentStoreError.extensionManifestMismatch(
                    extensionComponent.id
                )
            }
        }
    }

    func resolveStorePath(_ relativePath: String) throws -> URL {
        guard
            !relativePath.isEmpty,
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

private struct ChatGPTAPIPackageManifest: Decodable {
    let version: String
}

private struct BindingPackageManifest: Decodable {
    let version: String
    let chatgpt: String
    let chatgptApi: String
    let asarSha256: String
}

private enum ComponentStoreError: LocalizedError {
    case invalidVersionsLock
    case invalidSettings
    case invalidPath(String)
    case invalidJSON(URL, any Error)
    case componentFileMissing(String)
    case componentManifestMismatch(String)
    case extensionManifestMismatch(String)

    var errorDescription: String? {
        switch self {
        case .invalidVersionsLock:
            "The component versions lock is invalid."
        case .invalidSettings:
            "The extension settings are invalid."
        case .invalidPath(let path):
            "The component path is invalid: \(path)"
        case .invalidJSON(let url, let error):
            "Could not read \(url.path): \(error.localizedDescription)"
        case .componentFileMissing(let path):
            "The installed component file is missing: \(path)"
        case .componentManifestMismatch(let component):
            "The installed \(component) manifest does not match the versions lock."
        case .extensionManifestMismatch(let id):
            "The installed extension manifest does not match the versions lock: \(id)"
        }
    }
}
