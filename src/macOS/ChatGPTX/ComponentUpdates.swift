import CryptoKit
import Foundation

private let defaultComponentUpdateIndexURL = URL(
    string:
        "https://github.com/zats/chat-gpt-x/releases/download/updates/latest.json"
)!

struct ComponentUpdateIndex: Decodable {
    let schemaVersion: Int
    let generation: Int
    let minimumLauncherVersion: String
    let releaseBaseURL: String
    let chatgptApis: [String: UpdateRelease]
    let bindings: [String: BindingUpdate]
    let extensions: [String: ExtensionUpdateCatalog]

    static func decodeStrict(_ data: Data) throws -> Self {
        let value: Any
        do {
            value = try JSONSerialization.jsonObject(with: data)
        } catch {
            throw ComponentUpdateError.indexInvalid("JSON")
        }
        try validate(value)
        do {
            return try JSONDecoder().decode(Self.self, from: data)
        } catch {
            throw ComponentUpdateError.indexInvalid("JSON values")
        }
    }

    private static func validate(_ value: Any) throws {
        let root = try object(
            value,
            keys: [
                "schemaVersion",
                "generation",
                "minimumLauncherVersion",
                "releaseBaseURL",
                "chatgptApis",
                "bindings",
                "extensions",
            ],
            label: "update index"
        )
        guard integer(root["schemaVersion"]) == 3,
            let generation = integer(root["generation"]),
            generation > 0,
            let minimumLauncherVersion = root["minimumLauncherVersion"]
                as? String,
            SemanticVersion(minimumLauncherVersion) != nil,
            root["releaseBaseURL"] as? String
                == "https://github.com/zats/chat-gpt-x/releases/download",
            let apis = root["chatgptApis"] as? [String: Any],
            !apis.isEmpty,
            let bindings = root["bindings"] as? [String: Any],
            !bindings.isEmpty,
            let extensions = root["extensions"] as? [String: Any]
        else {
            throw ComponentUpdateError.indexInvalid("root values")
        }

        for (version, rawEntry) in apis {
            guard let semanticVersion = SemanticVersion(version),
                semanticVersion >= SemanticVersion("1.0.3")!
            else {
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
                keys: [
                    "version",
                    "chatgptApi",
                    "asarSha256",
                    "release",
                    "sha256",
                ],
                label: "binding \(chatgpt)"
            )
            guard
                let version = entry["version"] as? String,
                SemanticVersion(version) != nil,
                let api = entry["chatgptApi"] as? String,
                apis[api] != nil,
                let asarHash = entry["asarSha256"] as? String,
                isHash(asarHash),
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

        for (id, rawCatalog) in extensions {
            guard isExtensionID(id) else {
                throw ComponentUpdateError.indexInvalid("extension \(id)")
            }
            let catalog = try object(
                rawCatalog,
                keys: ["versions"],
                label: "extension \(id)"
            )
            guard let versions = catalog["versions"] as? [String: Any],
                !versions.isEmpty
            else {
                throw ComponentUpdateError.indexInvalid(
                    "extension \(id) versions"
                )
            }

            for (version, rawEntry) in versions {
                guard SemanticVersion(version) != nil else {
                    throw ComponentUpdateError.indexInvalid(
                        "extension \(id) version \(version)"
                    )
                }
                let entry = try object(
                    rawEntry,
                    keys: ["compatibility", "release", "sha256"],
                    label: "extension \(id) \(version)"
                )
                let compatibility = try object(
                    entry["compatibility"] as Any,
                    keys: ["chatgptApi"],
                    label: "extension \(id) \(version) compatibility"
                )
                guard
                    let apiRange = compatibility["chatgptApi"] as? String,
                    isSemverRange(apiRange),
                    let release = entry["release"] as? String,
                    release == "extension-\(id)-v\(version)",
                    let hash = entry["sha256"] as? String,
                    isHash(hash)
                else {
                    throw ComponentUpdateError.indexInvalid(
                        "extension \(id) \(version)"
                    )
                }
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
            Set(object.keys) == Set(keys)
        else {
            throw ComponentUpdateError.indexInvalid(label)
        }
        return object
    }

    private static func integer(_ value: Any?) -> Int? {
        guard !(value is Bool) else { return nil }
        return value as? Int
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

    private static func isSemverRange(_ value: String) -> Bool {
        guard !value.isEmpty,
            value.trimmingCharacters(in: .whitespacesAndNewlines) == value
        else {
            return false
        }
        if value.hasPrefix("^") {
            return SemanticVersion(String(value.dropFirst())) != nil
        }

        let conditions = value.split(whereSeparator: \.isWhitespace)
        guard !conditions.isEmpty else { return false }
        return conditions.allSatisfy { rawCondition in
            var condition = String(rawCondition)
            for comparator in [">=", "<=", ">", "<"]
                where condition.hasPrefix(comparator)
            {
                condition.removeFirst(comparator.count)
                break
            }
            return SemanticVersion(condition) != nil
        }
    }
}

struct UpdateRelease: Decodable {
    let release: String
    let sha256: String
}

struct BindingUpdate: Decodable {
    let version: String
    let chatgptApi: String
    let asarSha256: String
    let release: String
    let sha256: String
}

struct ExtensionUpdateCatalog: Decodable {
    let versions: [String: ExtensionUpdate]
}

struct ExtensionUpdate: Decodable {
    let compatibility: ExtensionCompatibility
    let release: String
    let sha256: String
}

private struct SemanticVersion: Comparable {
    let major: Int
    let minor: Int
    let patch: Int

    init?(_ value: String) {
        let components = value.split(
            separator: ".",
            omittingEmptySubsequences: false
        )
        guard components.count == 3 else { return nil }
        var numbers: [Int] = []
        for component in components {
            guard !component.isEmpty,
                component.allSatisfy(\.isNumber),
                component.count == 1 || component.first != "0",
                let number = Int(component)
            else {
                return nil
            }
            numbers.append(number)
        }
        major = numbers[0]
        minor = numbers[1]
        patch = numbers[2]
    }

    static func < (lhs: Self, rhs: Self) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        return lhs.patch < rhs.patch
    }
}

func chatgptAPIRequiresExtensionManagerAuthorization(
    _ version: String
) -> Bool {
    guard let version = SemanticVersion(version) else {
        return true
    }
    return version >= SemanticVersion("1.1.1")!
}

enum ComponentLocalVersion: Equatable {
    case current
    case different(String)
    case missing
    case incompatible(String?)
}

struct ComponentUpdateItem: Equatable {
    let id: String
    let name: String
    let latestVersion: String
    let localVersion: ComponentLocalVersion
}

struct ComponentUpdateSummary: Equatable {
    let items: [ComponentUpdateItem]

    init(items: [ComponentUpdateItem]) {
        self.items = items
    }

    init(installed store: PreparedComponentStore) {
        let versions = store.versions
        items = [
            ComponentUpdateItem(
                id: "chatgpt-api",
                name: "ChatGPT API",
                latestVersion: versions.chatgptApi.version,
                localVersion: .current
            ),
            ComponentUpdateItem(
                id: "binding",
                name: "Binding",
                latestVersion: versions.binding.version,
                localVersion: .current
            ),
        ] + versions.extensions.map {
            ComponentUpdateItem(
                id: "extension:\($0.id)",
                name: $0.id,
                latestVersion: $0.version,
                localVersion: .current
            )
        }
    }
}

enum ComponentUpdateProgress: Equatable {
    case downloading(
        componentID: String,
        name: String,
        receivedBytes: Int64,
        totalBytes: Int64?
    )
    case verifying(componentID: String, name: String)
    case installing(componentID: String, name: String)
}

typealias ComponentUpdateProgressHandler =
    @MainActor @Sendable (ComponentUpdateProgress) -> Void

typealias ComponentUpdatePlanHandler =
    @MainActor @Sendable (ComponentUpdatePlan) -> Void

struct ComponentUpdatePlan {
    fileprivate let index: ComponentUpdateIndex
    fileprivate let chatgptVersion: String
    fileprivate let current: PreparedComponentStore?
    fileprivate let api: UpdateRelease
    fileprivate let binding: BindingUpdate
    fileprivate let extensions: [PlannedExtensionUpdate]

    var summary: ComponentUpdateSummary {
        summary(installed: current?.versions)
    }

    func summary(
        installed versions: ComponentVersionsLock?
    ) -> ComponentUpdateSummary {
        var items = [
            ComponentUpdateItem(
                id: "chatgpt-api",
                name: "ChatGPT API",
                latestVersion: binding.chatgptApi,
                localVersion: localVersion(
                    versions?.chatgptApi.version,
                    latest: binding.chatgptApi
                )
            ),
            ComponentUpdateItem(
                id: "binding",
                name: "Binding",
                latestVersion: binding.version,
                localVersion: bindingLocalVersion(versions?.binding)
            ),
        ]

        let installedExtensions = Dictionary(
            uniqueKeysWithValues: (versions?.extensions ?? []).map {
                ($0.id, $0)
            }
        )
        items.append(contentsOf: extensions.map { planned in
            ComponentUpdateItem(
                id: "extension:\(planned.id)",
                name: planned.id,
                latestVersion: planned.version,
                localVersion: localVersion(
                    installedExtensions[planned.id]?.version,
                    latest: planned.version
                )
            )
        })

        let selectedIDs = Set(extensions.map(\.id))
        let previouslyInstalled = Dictionary(
            uniqueKeysWithValues: (current?.versions.extensions ?? []).map {
                ($0.id, $0)
            }
        )
        items.append(
            contentsOf: index.extensions.keys.sorted().compactMap { id in
                guard !selectedIDs.contains(id) else { return nil }
                let installed = previouslyInstalled[id]
                return ComponentUpdateItem(
                    id: "extension:\(id)",
                    name: installed?.name ?? id,
                    latestVersion: "Inactive",
                    localVersion: .incompatible(installed?.version)
                )
            }
        )

        return ComponentUpdateSummary(items: items)
    }

    private func bindingLocalVersion(
        _ installed: StoredBinding?
    ) -> ComponentLocalVersion {
        guard let installed else { return .missing }
        guard installed.chatgpt == chatgptVersion else {
            return .different(
                "\(installed.version) · ChatGPT \(installed.chatgpt)"
            )
        }
        return localVersion(installed.version, latest: binding.version)
    }

    private func localVersion(
        _ installed: String?,
        latest: String
    ) -> ComponentLocalVersion {
        guard let installed else { return .missing }
        return installed == latest ? .current : .different(installed)
    }
}

private struct PlannedExtensionUpdate {
    let id: String
    let version: String
    let enabled: Bool
    let update: ExtensionUpdate
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

struct ComponentUpdateOutcome {
    let summary: ComponentUpdateSummary
    let result: ComponentUpdateResult
}

final class ComponentUpdateService {
    private let componentStore: ComponentStore
    private let session: URLSession
    private let indexURL: URL
    private let launcherVersion: String
    private let beforeActivation: (
        _ chatgptVersion: String,
        _ chatgptAsarSHA256: String
    ) throws -> Void

    init(
        componentStore: ComponentStore,
        session: URLSession = .shared,
        indexURL: URL? = nil,
        launcherVersion: String? = nil,
        beforeActivation: @escaping (
            _ chatgptVersion: String,
            _ chatgptAsarSHA256: String
        ) throws -> Void,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) {
        self.componentStore = componentStore
        self.session = session
        self.indexURL = indexURL
            ?? Self.environmentIndexURL(environment)
            ?? defaultComponentUpdateIndexURL
        self.launcherVersion = launcherVersion
            ?? Bundle.main.object(
                forInfoDictionaryKey: "CFBundleShortVersionString"
            ) as? String
            ?? ""
        self.beforeActivation = beforeActivation
    }

    func update(
        for chatgptVersion: String,
        chatgptAsarSHA256: String,
        planned: @escaping ComponentUpdatePlanHandler = { _ in },
        progress: @escaping ComponentUpdateProgressHandler = { _ in }
    ) async throws -> ComponentUpdateOutcome {
        let index = try await fetchIndex()
        try validateLauncher(for: index)
        let current = try? componentStore.prepareInstalled()
        let plan = try componentStore.planUpdate(
            index,
            chatgptVersion: chatgptVersion,
            chatgptAsarSHA256: chatgptAsarSHA256,
            current: current
        )
        planned(plan)
        let result = try await componentStore.install(
            plan,
            session: session,
            beforeActivation: {
                try beforeActivation(
                    chatgptVersion,
                    chatgptAsarSHA256
                )
            },
            progress: progress
        )
        return ComponentUpdateOutcome(
            summary: plan.summary(installed: result.preparedStore.versions),
            result: result
        )
    }

    private static func environmentIndexURL(
        _ environment: [String: String]
    ) -> URL? {
        guard let value = environment["CHATGPTX_UPDATE_INDEX_URL"],
            !value.isEmpty,
            let url = URL(string: value),
            url.scheme == "https" || url.scheme == "http",
            url.host != nil
        else {
            return nil
        }
        return url
    }

    private func validateLauncher(for index: ComponentUpdateIndex) throws {
        guard let installed = SemanticVersion(launcherVersion) else {
            throw ComponentUpdateError.launcherVersionInvalid(
                launcherVersion
            )
        }
        guard let minimum = SemanticVersion(index.minimumLauncherVersion)
        else {
            throw ComponentUpdateError.indexInvalid(
                "minimumLauncherVersion"
            )
        }
        guard installed >= minimum else {
            throw ComponentUpdateError.launcherTooOld(
                installed: launcherVersion,
                minimum: index.minimumLauncherVersion
            )
        }
    }

    private func fetchIndex() async throws -> ComponentUpdateIndex {
        let request = URLRequest(
            url: indexURL,
            cachePolicy: .reloadRevalidatingCacheData
        )
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse,
            response.statusCode == 200
        else {
            throw ComponentUpdateError.indexRequestFailed
        }
        return try ComponentUpdateIndex.decodeStrict(data)
    }
}

private extension ComponentStore {
    func planUpdate(
        _ index: ComponentUpdateIndex,
        chatgptVersion: String,
        chatgptAsarSHA256: String,
        current: PreparedComponentStore?
    ) throws -> ComponentUpdatePlan {
        guard let binding = index.bindings[chatgptVersion] else {
            throw ComponentUpdateError.bindingUnavailable(chatgptVersion)
        }
        guard binding.asarSha256 == chatgptAsarSHA256 else {
            throw ComponentUpdateError.bindingBuildUnavailable(
                chatgptVersion
            )
        }
        guard let api = index.chatgptApis[binding.chatgptApi] else {
            throw ComponentUpdateError.apiUnavailable(binding.chatgptApi)
        }

        let installedByID = Dictionary(
            uniqueKeysWithValues: (current?.versions.extensions ?? []).map {
                ($0.id, $0)
            }
        )
        var plannedExtensions: [PlannedExtensionUpdate] = []
        for id in index.extensions.keys.sorted() {
            guard let catalog = index.extensions[id] else { continue }
            var compatible: [
                (semanticVersion: SemanticVersion, version: String,
                 update: ExtensionUpdate)
            ] = []
            for (version, update) in catalog.versions {
                guard try ComponentCompatibility.matches(
                    update.compatibility,
                    chatgptAPIVersion: binding.chatgptApi
                ) else {
                    continue
                }
                guard let semanticVersion = SemanticVersion(version) else {
                    throw ComponentUpdateError.indexInvalid(
                        "extension \(id) version \(version)"
                    )
                }
                compatible.append((semanticVersion, version, update))
            }
            guard let selected = compatible.max(by: {
                $0.semanticVersion < $1.semanticVersion
            }) else {
                continue
            }
            plannedExtensions.append(
                PlannedExtensionUpdate(
                    id: id,
                    version: selected.version,
                    enabled: installedByID[id]?.enabled ?? true,
                    update: selected.update
                )
            )
        }

        if let current,
            index.generation < current.versions.generation
        {
            throw ComponentUpdateError.olderGeneration(
                index.generation,
                current.versions.generation
            )
        }

        return ComponentUpdatePlan(
            index: index,
            chatgptVersion: chatgptVersion,
            current: current,
            api: api,
            binding: binding,
            extensions: plannedExtensions
        )
    }

    func install(
        _ plan: ComponentUpdatePlan,
        session: URLSession = .shared,
        beforeActivation: () throws -> Void,
        progress: @escaping ComponentUpdateProgressHandler = { _ in }
    ) async throws -> ComponentUpdateResult {
        let index = plan.index
        let chatgptVersion = plan.chatgptVersion
        let binding = plan.binding
        let api = plan.api

        let apiPath = "components/chatgpt-api/\(binding.chatgptApi)"
        try await installArchive(
            release: api.release,
            sha256: api.sha256,
            baseURL: index.releaseBaseURL,
            destinationPath: apiPath,
            kind: .chatgptAPI(version: binding.chatgptApi),
            componentID: "chatgpt-api",
            componentName: "ChatGPT API",
            session: session,
            progress: progress
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
                api: binding.chatgptApi,
                asarSha256: binding.asarSha256
            ),
            componentID: "binding",
            componentName: "Binding",
            session: session,
            progress: progress
        )

        var storedExtensions: [StoredExtension] = []
        for planned in plan.extensions {
            let update = planned.update
            let extensionPath =
                "components/extensions/\(planned.id)/\(planned.version)"
            try await installArchive(
                release: update.release,
                sha256: update.sha256,
                baseURL: index.releaseBaseURL,
                destinationPath: extensionPath,
                kind: .extensionComponent(
                    id: planned.id,
                    version: planned.version,
                    compatibility: update.compatibility
                ),
                componentID: "extension:\(planned.id)",
                componentName: planned.id,
                session: session,
                progress: progress
            )
            let manifest = try decode(
                ExtensionPackageManifest.self,
                at: try resolveStorePath(
                    "\(extensionPath)/package.json"
                )
            )
            storedExtensions.append(
                StoredExtension(
                    id: planned.id,
                    name: manifest.name,
                    description: manifest.description,
                    version: planned.version,
                    enabled: planned.enabled,
                    required: manifest.required == true,
                    compatibility: update.compatibility,
                    release: update.release,
                    sha256: update.sha256,
                    path: extensionPath
                )
            )
        }

        return try withExclusiveMutationLock {
            () throws -> ComponentUpdateResult in
            let preparedSettings = try prepareExtensionSettings(
                for: storedExtensions,
                recoverInvalidSettings: true
            )
            let effectiveExtensions = preparedSettings.extensions
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
                    asarSha256: binding.asarSha256,
                    release: binding.release,
                    sha256: binding.sha256,
                    path: bindingPath
                ),
                extensions: effectiveExtensions
            )
            try validate(versions)
            try validateInstalledComponents(versions)

            let prepared = PreparedComponentStore(
                rootURL: rootURL,
                versions: versions,
                extensions: effectiveExtensions
            )
            let componentsChanged = plan.current.map {
                versions.chatgptApi != $0.versions.chatgptApi
                    || versions.binding != $0.versions.binding
                    || versions.extensions != $0.extensions
            } ?? true

            let activeMetadata = try? activeVersionsMetadata()
            if let activeMetadata,
                index.generation < activeMetadata.generation
            {
                throw ComponentUpdateError.olderGeneration(
                    index.generation,
                    activeMetadata.generation
                )
            }

            let currentVersions = try? activeVersions()
            if versions == currentVersions {
                try beforeActivation()
                try commitExtensionSettings(preparedSettings)
                return componentsChanged
                    ? .installed(prepared)
                    : .upToDate(prepared)
            }

            let previousVersionsLock = try activeVersionsLockData()
            let versionsLockURL = rootURL.appendingPathComponent(
                "versions-lock.json"
            )
            try beforeActivation()
            do {
                try atomicWrite(try encode(versions), to: versionsLockURL)
                try commitExtensionSettings(preparedSettings)
            } catch {
                do {
                    try restoreVersionsLock(previousVersionsLock)
                } catch {
                    throw ComponentUpdateError.installationStateInvalid
                }
                throw error
            }
            return componentsChanged
                ? .installed(prepared)
                : .upToDate(prepared)
        }
    }

    private func installArchive(
        release: String,
        sha256: String,
        baseURL: String,
        destinationPath: String,
        kind: ArchiveKind,
        componentID: String,
        componentName: String,
        session: URLSession,
        progress: @escaping ComponentUpdateProgressHandler
    ) async throws {
        let destinationURL = try resolveStorePath(destinationPath)
        if fileManager.fileExists(atPath: destinationURL.path) {
            do {
                try validateArchive(at: destinationURL, kind: kind)
                try validateComponentIntegrity(
                    at: destinationURL,
                    archiveSHA256: sha256
                )
                return
            } catch {
                // Keep the invalid package until its replacement is ready.
            }
        }

        guard let archiveURL = URL(
            string: "\(baseURL)/\(release)/\(release).zip"
        ) else {
            throw ComponentUpdateError.releaseURLInvalid(release)
        }
        let downloadsRootURL = rootURL.appendingPathComponent(
            "downloads",
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: downloadsRootURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let downloadsURL = downloadsRootURL.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: downloadsURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        defer { try? fileManager.removeItem(at: downloadsURL) }

        let localArchiveURL = downloadsURL.appendingPathComponent(
            "\(release).zip"
        )
        try await downloadArchive(
            from: archiveURL,
            to: localArchiveURL,
            release: release,
            componentID: componentID,
            componentName: componentName,
            session: session,
            progress: progress
        )
        try fileManager.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: localArchiveURL.path
        )
        progress(.verifying(componentID: componentID, name: componentName))
        await Task.yield()
        let digest = SHA256.hash(
            data: try Data(contentsOf: localArchiveURL)
        ).map { String(format: "%02x", $0) }.joined()
        guard digest == sha256 else {
            throw ComponentUpdateError.checksumMismatch(release)
        }

        progress(.installing(componentID: componentID, name: componentName))
        await Task.yield()
        let stagingURL = downloadsURL.appendingPathComponent(
            "extract-\(UUID().uuidString)",
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: stagingURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        defer { try? fileManager.removeItem(at: stagingURL) }

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
        try writeComponentIntegrityReceipt(
            at: stagingURL,
            archiveSHA256: sha256
        )
        try validateComponentIntegrity(
            at: stagingURL,
            archiveSHA256: sha256
        )
        try withExclusiveMutationLock {
            let destinationParentURL = destinationURL
                .deletingLastPathComponent()
            try fileManager.createDirectory(
                at: destinationParentURL,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
            guard fileManager.fileExists(atPath: destinationURL.path) else {
                try fileManager.moveItem(at: stagingURL, to: destinationURL)
                return
            }

            do {
                try validateArchive(at: destinationURL, kind: kind)
                try validateComponentIntegrity(
                    at: destinationURL,
                    archiveSHA256: sha256
                )
                return
            } catch {
                let invalidURL = destinationParentURL.appendingPathComponent(
                    ".\(destinationURL.lastPathComponent).invalid-\(UUID().uuidString)"
                )
                try fileManager.moveItem(
                    at: destinationURL,
                    to: invalidURL
                )
                do {
                    try fileManager.moveItem(
                        at: stagingURL,
                        to: destinationURL
                    )
                } catch {
                    do {
                        try fileManager.moveItem(
                            at: invalidURL,
                            to: destinationURL
                        )
                    } catch {
                        throw ComponentUpdateError.installationStateInvalid
                    }
                    throw error
                }
                try? fileManager.removeItem(at: invalidURL)
            }
        }
    }

    private func downloadArchive(
        from archiveURL: URL,
        to localArchiveURL: URL,
        release: String,
        componentID: String,
        componentName: String,
        session: URLSession,
        progress: @escaping ComponentUpdateProgressHandler
    ) async throws {
        let download = ArchiveDownload(
            configuration: session.configuration,
            destinationURL: localArchiveURL,
            release: release,
            progress: { receivedBytes, totalBytes in
                progress(
                    .downloading(
                        componentID: componentID,
                        name: componentName,
                        receivedBytes: receivedBytes,
                        totalBytes: totalBytes
                    )
                )
            }
        )
        try await download.start(from: archiveURL)
    }

    private func validateArchive(
        at root: URL,
        kind: ArchiveKind
    ) throws {
        let rootValues = try root.resourceValues(
            forKeys: [.isDirectoryKey, .isSymbolicLinkKey]
        )
        guard rootValues.isDirectory == true,
            rootValues.isSymbolicLink != true,
            let enumerator = fileManager.enumerator(
                at: root,
                includingPropertiesForKeys: [.isSymbolicLinkKey]
            )
        else {
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
            var requiredFiles = [
                "types.d.ts",
                "bridge/main.cjs",
                "bridge/preload.cjs",
                "runtime/codex-paths.cjs",
                "runtime/extension-launch-config.cjs",
            ]
            if chatgptAPIRequiresExtensionManagerAuthorization(version) {
                requiredFiles.append(
                    "runtime/extension-manager-authorization.cjs"
                )
            }
            try requireFiles(requiredFiles, beneath: root)
        case .binding(let chatgpt, let version, let api, let asarSha256):
            let manifest = try decode(
                BindingPackageManifest.self,
                at: root.appendingPathComponent("manifest.json")
            )
            guard
                manifest.chatgpt == chatgpt,
                manifest.version == version,
                manifest.chatgptApi == api,
                manifest.asarSha256 == asarSha256
            else {
                throw ComponentUpdateError.archiveLayoutInvalid
            }
            try requireFiles(["host.js"], beneath: root)
        case .extensionComponent(
            let id,
            let version,
            let compatibility
        ):
            let manifest = try decode(
                ExtensionPackageManifest.self,
                at: root.appendingPathComponent("package.json")
            )
            guard
                manifest.id == id,
                manifest.version == version,
                manifest.main == "contents/main.js",
                manifest.compatibility == compatibility
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

private final nonisolated class ArchiveDownload:
    NSObject,
    URLSessionDownloadDelegate,
    @unchecked Sendable
{
    private let configuration: URLSessionConfiguration
    private let destinationURL: URL
    private let release: String
    private let progress:
        @MainActor @Sendable (Int64, Int64?) -> Void
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, any Error>?
    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private var downloadError: (any Error)?

    init(
        configuration: URLSessionConfiguration,
        destinationURL: URL,
        release: String,
        progress: @escaping @MainActor @Sendable (Int64, Int64?) -> Void
    ) {
        self.configuration = configuration
        self.destinationURL = destinationURL
        self.release = release
        self.progress = progress
    }

    func start(from url: URL) async throws {
        await MainActor.run {
            progress(0, nil)
        }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                self.continuation = continuation
                let session = URLSession(
                    configuration: configuration,
                    delegate: self,
                    delegateQueue: .main
                )
                self.session = session
                let task = session.downloadTask(with: url)
                self.task = task
                lock.unlock()

                task.resume()
                if Task.isCancelled {
                    task.cancel()
                }
            }
        } onCancel: {
            self.cancel()
        }
    }

    func urlSession(
        _: URLSession,
        downloadTask _: URLSessionDownloadTask,
        didWriteData _: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        let totalBytes = totalBytesExpectedToWrite > 0
            ? totalBytesExpectedToWrite
            : nil
        MainActor.assumeIsolated {
            progress(totalBytesWritten, totalBytes)
        }
    }

    func urlSession(
        _: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        let error: (any Error)?
        if let response = downloadTask.response as? HTTPURLResponse,
           response.statusCode == 200
        {
            do {
                try FileManager.default.moveItem(
                    at: location,
                    to: destinationURL
                )
                error = nil
            } catch let moveError {
                error = moveError
            }
        } else {
            error = ComponentUpdateError.archiveRequestFailed(release)
        }

        lock.lock()
        downloadError = error
        lock.unlock()
    }

    func urlSession(
        _ session: URLSession,
        task _: URLSessionTask,
        didCompleteWithError error: (any Error)?
    ) {
        lock.lock()
        let resultError = error ?? downloadError
        let continuation = continuation
        self.continuation = nil
        self.session = nil
        task = nil
        lock.unlock()

        session.finishTasksAndInvalidate()
        if let resultError {
            continuation?.resume(throwing: resultError)
        } else {
            continuation?.resume()
        }
    }

    private func cancel() {
        lock.lock()
        let task = task
        lock.unlock()
        task?.cancel()
    }
}

private enum ArchiveKind {
    case chatgptAPI(version: String)
    case binding(
        chatgpt: String,
        version: String,
        api: String,
        asarSha256: String
    )
    case extensionComponent(
        id: String,
        version: String,
        compatibility: ExtensionCompatibility
    )
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

enum ComponentUpdateError: LocalizedError {
    case indexRequestFailed
    case indexInvalid(String)
    case launcherVersionInvalid(String)
    case launcherTooOld(installed: String, minimum: String)
    case olderGeneration(Int, Int)
    case bindingUnavailable(String)
    case bindingBuildUnavailable(String)
    case apiUnavailable(String)
    case releaseURLInvalid(String)
    case archiveRequestFailed(String)
    case checksumMismatch(String)
    case extractionFailed(String)
    case archiveLayoutInvalid
    case installationStateInvalid

    var errorDescription: String? {
        switch self {
        case .indexRequestFailed:
            "The update index could not be downloaded."
        case .indexInvalid(let field):
            "The update index is invalid: \(field)."
        case .launcherVersionInvalid(let version):
            "The launcher version is invalid: \(version)."
        case .launcherTooOld(let installed, let minimum):
            "Launcher \(minimum) or later is required. The installed version is \(installed)."
        case .olderGeneration(let remote, let installed):
            "Update generation \(remote) is older than installed generation \(installed)."
        case .bindingUnavailable(let version):
            "No binding is available for ChatGPT \(version)."
        case .bindingBuildUnavailable(let version):
            "No binding is available for the installed ChatGPT \(version) build."
        case .apiUnavailable(let version):
            "ChatGPT API \(version) is unavailable."
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
        case .installationStateInvalid:
            "The installed component state is invalid."
        }
    }
}
