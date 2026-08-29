import AppKit
import CryptoKit
import Darwin
import Foundation

enum ChatGPTLaunchMode {
    case normal
    case apiTest
    case extensionTest
}

enum ChatGPTRunningApplicationPolicy: Equatable {
    case normal
    case forceRestart
    case requireNotRunning
}

struct ChatGPTLauncher {
    static let chatGPTBundleIdentifier = "com.openai.codex"
    private static let launchConfigurationEnvironmentKey =
        "CHATGPTX_LAUNCH_CONFIGURATION"
    private static let versionsLockEnvironmentKey =
        "CHATGPTX_VERSIONS_LOCK"
    private static let relaunchArgumentsEnvironmentKey =
        "CHATGPTX_RELAUNCH_ARGUMENTS"
    private static let extensionTestRootEnvironmentKey =
        "CHATGPTX_EXTENSION_TEST_ROOT"
    private static let iconOverlayEnvironmentKey =
        "CHATGPTX_ICON_OVERLAY"
    private static let iconOverlayAssetName =
        "InjectedDockIconOverlay"
    private static let restartCountdown = 10
    private static let quitTimeout: TimeInterval = 10
    private static let asarHashCache = ChatGPTAsarHashCache()

    nonisolated static func diagnosticDescription(
        for error: any Error
    ) -> String {
        var descriptions: [String] = []
        var current: NSError? = error as NSError
        var depth = 0

        while let error = current, depth < 4 {
            var description =
                "\(error.localizedDescription) [\(error.domain) \(error.code)]"
            if let reason = error.localizedFailureReason,
                !description.contains(reason)
            {
                description += " Reason: \(reason)"
            }
            if let suggestion = error.localizedRecoverySuggestion,
                !description.contains(suggestion)
            {
                description += " Recovery: \(suggestion)"
            }
            descriptions.append(description)
            current = error.userInfo[NSUnderlyingErrorKey] as? NSError
            depth += 1
        }

        return descriptions.joined(separator: " Underlying error: ")
    }

    let componentStore: PreparedComponentStore
    private let launchReservationStore = ChatGPTLaunchReservationStore()

    @discardableResult
    func launch(
        mode: ChatGPTLaunchMode = .normal,
        arguments: [String] = [],
        localExtensionURLs: [URL] = [],
        runningApplicationPolicy: ChatGPTRunningApplicationPolicy = .normal,
        applicationURL: URL? = nil,
        beforeOpen: ((String) -> Void)? = nil
    ) async throws -> NSRunningApplication? {
        let activity = ProcessInfo.processInfo.beginActivity(
            options: .userInitiated,
            reason: "Restart ChatGPT with the extension platform"
        )
        defer { ProcessInfo.processInfo.endActivity(activity) }

        let workspace = NSWorkspace.shared

        guard let resolvedApplicationURL = applicationURL
            ?? Self.installedApplicationURL(workspace: workspace),
            Self.isChatGPTBundle(resolvedApplicationURL),
            let chatGPTBundle = Bundle(url: resolvedApplicationURL),
            let executableURL = chatGPTBundle.executableURL else {
            throw LaunchError.chatGPTNotInstalled
        }

        guard FileManager.default.isExecutableFile(atPath: executableURL.path) else {
            throw LaunchError.chatGPTExecutableMissing(executableURL)
        }

        try await Self.validateBinding(
            applicationURL: resolvedApplicationURL,
            binding: componentStore.versions.binding
        )

        let launchClaim: (any ChatGPTRecoveryClaim)?
        if mode == .normal,
            runningApplicationPolicy != .requireNotRunning
        {
            guard let claim = try ChatGPTRecoveryClaimStore().acquire(
                applicationURL: resolvedApplicationURL
            ) else {
                throw LaunchError.launchAlreadyInProgress
            }
            launchClaim = claim
        } else {
            launchClaim = nil
        }
        defer { launchClaim?.release() }

        let bridgeURL = componentStore.rootURL
            .appendingPathComponent(
                componentStore.versions.chatgptApi.path,
                isDirectory: true
            )
            .appendingPathComponent("bridge/main.cjs")
        guard FileManager.default.fileExists(atPath: bridgeURL.path) else {
            throw LaunchError.bridgeMissing
        }
        let iconOverlayURL = try Self.launchIconOverlay()

        if mode == .normal {
            switch runningApplicationPolicy {
            case .normal:
                if localExtensionURLs.isEmpty,
                    try await ChatGPTRuntime
                        .activateRunningApplicationWithExtensions(
                            workspace: workspace
                        )
                {
                    return nil
                }
                if Self.isChatGPTRunning,
                    !RestartPrompt(seconds: Self.restartCountdown).run()
                {
                    return nil
                }
            case .forceRestart:
                break
            case .requireNotRunning:
                guard !Self.isChatGPTRunning else {
                    throw LaunchError.chatGPTAlreadyRunning
                }
            }
        }

        if mode != .normal {
            guard arguments.contains(where: {
                $0.hasPrefix("--user-data-dir=/")
            }) else {
                throw LaunchError.isolatedTestUserDataDirectoryMissing
            }
        }
        let launchConfigurationURL = try launchConfiguration(
            for: mode,
            localExtensionURLs: localExtensionURLs
        )
        let launchVersionsLockURL = try launchVersionsLock()
        let launchReservation: ChatGPTLaunchReservation
        do {
            launchReservation = try launchReservationStore.reserve(
                applicationURL: resolvedApplicationURL
            )
        } catch {
            if let launchConfigurationURL {
                try? FileManager.default.removeItem(at: launchConfigurationURL)
            }
            throw LaunchError.launchCoordinationFailed(error)
        }
        beforeOpen?(launchReservation.token)

        if mode == .normal
            && runningApplicationPolicy != .requireNotRunning
        {
            do {
                try await quitRunningChatGPT()
            } catch {
                launchReservation.cancel()
                if let launchConfigurationURL {
                    try? FileManager.default.removeItem(
                        at: launchConfigurationURL
                    )
                }
                throw error
            }
        }

        do {
            try await Self.validateBinding(
                applicationURL: resolvedApplicationURL,
                binding: componentStore.versions.binding
            )
        } catch {
            launchReservation.cancel()
            if let launchConfigurationURL {
                try? FileManager.default.removeItem(at: launchConfigurationURL)
            }
            throw error
        }

        let configuration = NSWorkspace.OpenConfiguration()
        configuration.arguments = arguments
        configuration.environment = Self.environment(
            requiring: bridgeURL,
            launchConfigurationURL: launchConfigurationURL,
            versionsLockURL: launchVersionsLockURL,
            iconOverlayURL: iconOverlayURL,
            arguments: arguments,
            mode: mode
        )
        configuration.createsNewApplicationInstance = true
        configuration.activates = mode != .apiTest

        if mode == .extensionTest {
            guard let sessionPath = ProcessInfo.processInfo.environment[
                Self.extensionTestRootEnvironmentKey
            ] else {
                launchReservation.cancel()
                if let launchConfigurationURL {
                    try? FileManager.default.removeItem(
                        at: launchConfigurationURL
                    )
                }
                throw LaunchError.extensionTestSessionUnavailable
            }
            do {
                try ExtensionTestSessionRecorder.prepare(
                    sessionPath: sessionPath,
                    executableURL: executableURL,
                    arguments: arguments
                )
            } catch {
                launchReservation.cancel()
                if let launchConfigurationURL {
                    try? FileManager.default.removeItem(
                        at: launchConfigurationURL
                    )
                }
                throw error
            }
        }

        let application: NSRunningApplication
        do {
            application = try await workspace.openApplication(
                at: resolvedApplicationURL,
                configuration: configuration
            )
        } catch {
            launchReservation.cancel()
            if let launchConfigurationURL {
                try? FileManager.default.removeItem(at: launchConfigurationURL)
            }
            throw LaunchError.applicationLaunchFailed(error)
        }

        do {
            try launchReservation.bind(to: application.processIdentifier)
        } catch {
            let bindingError = error
            defer {
                launchReservation.cancel()
                if let launchConfigurationURL {
                    try? FileManager.default.removeItem(
                        at: launchConfigurationURL
                    )
                }
            }
            do {
                try await stopUncoordinatedChatGPT(application)
            } catch {
                throw LaunchError.launchCoordinationCleanupFailed(
                    binding: bindingError,
                    cleanup: error
                )
            }
            throw LaunchError.launchCoordinationFailed(bindingError)
        }
        return application
    }

    @discardableResult
    static func openStock(
        applicationURL: URL? = nil
    ) async throws -> NSRunningApplication {
        let workspace = NSWorkspace.shared
        guard let resolvedApplicationURL = applicationURL
            ?? installedApplicationURL(workspace: workspace),
            isChatGPTBundle(resolvedApplicationURL)
        else {
            throw LaunchError.chatGPTNotInstalled
        }

        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        configuration.createsNewApplicationInstance = false
        var environment = ProcessInfo.processInfo.environment
        environment.removeValue(forKey: "NODE_OPTIONS")
        environment.removeValue(forKey: launchConfigurationEnvironmentKey)
        environment.removeValue(forKey: versionsLockEnvironmentKey)
        environment.removeValue(forKey: relaunchArgumentsEnvironmentKey)
        environment.removeValue(forKey: iconOverlayEnvironmentKey)
        configuration.environment = environment
        do {
            return try await workspace.openApplication(
                at: resolvedApplicationURL,
                configuration: configuration
            )
        } catch {
            throw LaunchError.applicationLaunchFailed(error)
        }
    }

    private func stopUncoordinatedChatGPT(
        _ application: NSRunningApplication
    ) async throws {
        let liveness = ChatGPTApplicationProcessLiveness()
        liveness.observe(application)
        guard !liveness.isRunning(application)
            || application.terminate()
            || application.forceTerminate()
        else {
            throw LaunchError.chatGPTWouldNotQuit
        }

        var deadline = Date().addingTimeInterval(Self.quitTimeout)
        while liveness.isRunning(application), Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        guard liveness.isRunning(application) else { return }
        guard application.forceTerminate() else {
            throw LaunchError.chatGPTWouldNotQuit
        }

        deadline = Date().addingTimeInterval(Self.quitTimeout)
        while liveness.isRunning(application), Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        guard !liveness.isRunning(application) else {
            throw LaunchError.chatGPTQuitTimedOut
        }
    }

    private func quitRunningChatGPT() async throws {
        let applications = NSRunningApplication.runningApplications(
            withBundleIdentifier: Self.chatGPTBundleIdentifier
        )
        let liveness = ChatGPTApplicationProcessLiveness()
        let runningApplications = applications.filter {
            Self.status(of: $0, liveness: liveness) != .stopped
        }

        guard !runningApplications.isEmpty else { return }

        for application in runningApplications where !application.terminate() {
            throw LaunchError.chatGPTWouldNotQuit
        }

        let deadline = Date().addingTimeInterval(Self.quitTimeout)
        while runningApplications.contains(where: liveness.isRunning) {
            guard Date() < deadline else {
                throw LaunchError.chatGPTQuitTimedOut
            }
            try await Task.sleep(for: .milliseconds(100))
        }
    }

    private static var isChatGPTRunning: Bool {
        let applications = NSRunningApplication.runningApplications(
            withBundleIdentifier: chatGPTBundleIdentifier
        )
        let liveness = ChatGPTApplicationProcessLiveness()
        return applications.contains {
            status(of: $0, liveness: liveness) != .stopped
        }
    }

    private static func status(
        of application: NSRunningApplication,
        liveness: ChatGPTApplicationProcessLiveness
    ) -> ChatGPTApplicationProcessStatus {
        liveness.observe(application)
        let processStatus = liveness.status(of: application)
        guard processStatus == .running else { return processStatus }
        guard let bundleURL = application.bundleURL,
            let executableURL = Bundle(url: bundleURL)?.executableURL
        else {
            return .unavailable
        }
        switch ChatGPTProcessInspection.executablePath(
            for: application.processIdentifier
        ) {
        case .notRunning:
            return .stopped
        case .unavailable:
            return .unavailable
        case .found(let runningExecutablePath):
            return URL(fileURLWithPath: runningExecutablePath)
                .standardizedFileURL.resolvingSymlinksInPath()
                == executableURL.standardizedFileURL.resolvingSymlinksInPath()
                ? .running
                : .stopped
        }
    }

    static func installedApplicationURL(workspace: NSWorkspace) -> URL? {
        let fileManager = FileManager.default
        let domains: [FileManager.SearchPathDomainMask] = [
            .localDomainMask,
            .userDomainMask,
        ]

        for domain in domains {
            for directory in fileManager.urls(
                for: .applicationDirectory,
                in: domain
            ) {
                let candidates = (try? fileManager.contentsOfDirectory(
                    at: directory,
                    includingPropertiesForKeys: nil,
                    options: [.skipsHiddenFiles]
                ))?.sorted { $0.path < $1.path } ?? []

                for candidate in candidates where isChatGPTBundle(candidate) {
                    return candidate
                }
            }
        }

        guard let candidate = workspace.urlForApplication(
            withBundleIdentifier: chatGPTBundleIdentifier
        ), isChatGPTBundle(candidate) else {
            return nil
        }
        return candidate
    }

    static func applicationVersion(at url: URL) -> String? {
        let infoURL = url
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("Info.plist")
        guard let data = try? Data(contentsOf: infoURL),
            let propertyList = try? PropertyListSerialization.propertyList(
                from: data,
                options: [],
                format: nil
            ),
            let information = propertyList as? [String: Any]
        else {
            return nil
        }
        return information["CFBundleShortVersionString"] as? String
    }

    static func applicationAsarSHA256(
        at applicationURL: URL
    ) async -> String? {
        try? await asarHashCache.sha256(at: applicationURL)
    }

    static func cachedBuildMatches(
        applicationURL: URL,
        expectedVersion: String,
        expectedAsarSHA256: String
    ) -> Bool {
        guard applicationVersion(at: applicationURL) == expectedVersion,
            asarHashCache.cachedSHA256(at: applicationURL)
                == expectedAsarSHA256,
            applicationVersion(at: applicationURL) == expectedVersion,
            asarHashCache.cachedSHA256(at: applicationURL)
                == expectedAsarSHA256
        else {
            return false
        }
        return true
    }

    static func bindingMatches(
        applicationURL: URL,
        binding: StoredBinding
    ) async -> Bool {
        guard applicationVersion(at: applicationURL) == binding.chatgpt else {
            return false
        }
        guard await applicationAsarSHA256(at: applicationURL)
            == binding.asarSha256
        else {
            return false
        }
        return cachedBuildMatches(
            applicationURL: applicationURL,
            expectedVersion: binding.chatgpt,
            expectedAsarSHA256: binding.asarSha256
        )
    }

    private static func validateBinding(
        applicationURL: URL,
        binding: StoredBinding
    ) async throws {
        guard let installedVersion = applicationVersion(at: applicationURL),
            !installedVersion.isEmpty
        else {
            throw LaunchError.chatGPTVersionMissing
        }
        guard installedVersion == binding.chatgpt else {
            throw LaunchError.bindingMissing(
                installed: installedVersion,
                available: binding.chatgpt
            )
        }
        guard await bindingMatches(
            applicationURL: applicationURL,
            binding: binding
        ) else {
            throw LaunchError.bindingBuildMismatch(installedVersion)
        }
    }

    private static func isChatGPTBundle(_ url: URL) -> Bool {
        guard let bundle = Bundle(url: url),
            bundle.bundleIdentifier == chatGPTBundleIdentifier,
            let executableURL = bundle.executableURL else {
            return false
        }
        return FileManager.default.isExecutableFile(atPath: executableURL.path)
    }

    private func launchConfiguration(
        for mode: ChatGPTLaunchMode,
        localExtensionURLs: [URL]
    ) throws -> URL? {
        let localExtensions = try localExtensionURLs.map {
            try LocalExtensionResolver.resolve(
                $0,
                chatgptAPIVersion: componentStore.versions.chatgptApi.version
            )
        }

        let installedExtensions = try componentStore.extensions
            .filter {
                mode == .normal || (mode == .extensionTest && $0.required)
            }
            .map { try installedLaunchExtension($0) }
        let selectedExtensions = try Self.selectExtensions(
            for: mode,
            installedExtensions: installedExtensions,
            localExtensions: localExtensions
        )

        let directoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ChatGPTX", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )

        let configurationURL = directoryURL.appendingPathComponent(
            "launch-\(UUID().uuidString).json"
        )
        let data = try JSONEncoder().encode(
            LaunchConfiguration(
                schemaVersion: 3,
                extensions: selectedExtensions
            )
        )
        try data.write(to: configurationURL, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: configurationURL.path
        )
        return configurationURL
    }

    static func selectExtensions(
        for mode: ChatGPTLaunchMode,
        installedExtensions: [LaunchExtension],
        localExtensions: [LaunchExtension]
    ) throws -> [LaunchExtension] {
        switch mode {
        case .normal:
            return merge(
                installedExtensions: installedExtensions,
                localExtensions: localExtensions
            )
        case .apiTest:
            guard let apiTestExtension = localExtensions.last(where: {
                $0.id == "api-test-suite"
            }) else {
                throw LaunchError.apiTestExtensionRequired
            }
            return [apiTestExtension]
        case .extensionTest:
            guard !localExtensions.isEmpty else {
                throw LaunchError.extensionTestExtensionRequired
            }
            if let reserved = localExtensions.first(where: {
                $0.id == "extensions" || $0.id == "api-test-suite"
            }) {
                throw LaunchError.extensionTestReservedID(reserved.id)
            }
            return merge(
                installedExtensions: installedExtensions,
                localExtensions: localExtensions
            )
        }
    }

    private func installedLaunchExtension(
        _ extensionComponent: StoredExtension
    ) throws -> LaunchExtension {
        let packageRoot = componentStore.rootURL.appendingPathComponent(
            extensionComponent.path,
            isDirectory: true
        )
        let manifest = try JSONDecoder().decode(
            ExtensionPackageManifest.self,
            from: Data(
                contentsOf: packageRoot.appendingPathComponent(
                    "package.json"
                )
            )
        )
        return LaunchExtension(
            id: extensionComponent.id,
            path: packageRoot.appendingPathComponent(
                "contents/main.js"
            ).path,
            enabled: extensionComponent.enabled,
            settingsPath: manifest.settings.map {
                packageRoot.appendingPathComponent($0.main).path
            },
            settingsPaneId: manifest.settings?.pane
        )
    }

    private func launchVersionsLock() throws -> URL {
        let installed = componentStore.versions
        let versions = ComponentVersionsLock(
            schemaVersion: installed.schemaVersion,
            generation: installed.generation,
            chatgptApi: installed.chatgptApi,
            binding: installed.binding,
            extensions: componentStore.extensions
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        var data = try encoder.encode(versions)
        data.append(0x0A)
        let digest = SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()

        let directoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ChatGPTX", isDirectory: true)
            .appendingPathComponent("versions-locks", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let snapshotURL = directoryURL.appendingPathComponent(
            "\(digest).json"
        )
        try data.write(to: snapshotURL, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: snapshotURL.path
        )
        return snapshotURL
    }

    private static func launchIconOverlay() throws -> URL {
        guard let asset = NSDataAsset(name: iconOverlayAssetName),
            !asset.data.isEmpty,
            NSBitmapImageRep(data: asset.data) != nil
        else {
            throw LaunchError.iconOverlayMissing
        }

        let digest = SHA256.hash(data: asset.data)
            .map { String(format: "%02x", $0) }
            .joined()
        let directoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ChatGPTX", isDirectory: true)
            .appendingPathComponent("icon-overlays", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let overlayURL = directoryURL.appendingPathComponent(
            "\(digest).png"
        )
        try asset.data.write(to: overlayURL, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: overlayURL.path
        )
        return overlayURL
    }

    static func merge(
        installedExtensions: [LaunchExtension],
        localExtensions: [LaunchExtension]
    ) -> [LaunchExtension] {
        var merged = installedExtensions
        for extensionComponent in localExtensions {
            if let index = merged.firstIndex(where: {
                $0.id == extensionComponent.id
            }) {
                merged[index] = extensionComponent
            } else {
                merged.append(extensionComponent)
            }
        }
        return Self.orderExtensions(merged)
    }

    private static func orderExtensions(
        _ extensions: [LaunchExtension]
    ) -> [LaunchExtension] {
        extensions.sorted { left, right in
            if left.id == "extensions" {
                return right.id != "extensions"
            }
            if right.id == "extensions" {
                return false
            }
            return left.id < right.id
        }
    }

    static func environment(
        requiring bridgeURL: URL,
        launchConfigurationURL: URL?,
        versionsLockURL: URL,
        iconOverlayURL: URL,
        arguments: [String],
        mode: ChatGPTLaunchMode = .normal,
        baseEnvironment: [String: String] = ProcessInfo.processInfo.environment
    ) -> [String: String] {
        var environment = baseEnvironment
        let requireOption = "--require \(quoteNodeOption(bridgeURL.path))"

        if mode == .extensionTest {
            var controlledOptions: [String] = []
            if let sessionPath = environment[
                extensionTestRootEnvironmentKey
            ] {
                let recorderURL = ExtensionTestSessionRecorder
                    .recorderScriptURL(sessionPath: sessionPath)
                controlledOptions.append(
                    "--require \(quoteNodeOption(recorderURL.path))"
                )
            }
            controlledOptions.append(requireOption)
            environment["NODE_OPTIONS"] = controlledOptions.joined(
                separator: " "
            )
        } else if let existingOptions = environment["NODE_OPTIONS"],
            !existingOptions.isEmpty
        {
            environment["NODE_OPTIONS"] = "\(requireOption) \(existingOptions)"
        } else {
            environment["NODE_OPTIONS"] = requireOption
        }

        if let launchConfigurationURL {
            environment[launchConfigurationEnvironmentKey] =
                launchConfigurationURL.path
        }
        environment[versionsLockEnvironmentKey] = versionsLockURL.path
        environment[iconOverlayEnvironmentKey] = iconOverlayURL.path
        if let data = try? JSONSerialization.data(withJSONObject: arguments),
            let value = String(data: data, encoding: .utf8)
        {
            environment[relaunchArgumentsEnvironmentKey] = value
        }

        return environment
    }

    private static func quoteNodeOption(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }
}

actor ChatGPTAsarHashCache {
    typealias HashFile = @Sendable (FileHandle) throws -> String

    private static let readChunkSize = 1024 * 1024
    private static let maximumReadAttempts = 2

    private let entries = ChatGPTAsarHashEntries()
    private let hashFile: HashFile

    init(hashFile: @escaping HashFile = ChatGPTAsarHashCache.streamSHA256) {
        self.hashFile = hashFile
    }

    func sha256(at applicationURL: URL) throws -> String {
        let asarURL = Self.asarURL(for: applicationURL)
        let canonicalURL = asarURL.standardizedFileURL.resolvingSymlinksInPath()
        let path = canonicalURL.path

        for _ in 0..<Self.maximumReadAttempts {
            let pathIdentity = try Self.fileIdentity(atPath: path)
            if let cached = entries.sha256(
                atPath: path,
                identity: pathIdentity
            ) {
                return cached
            }

            let handle = try FileHandle(forReadingFrom: canonicalURL)
            defer { try? handle.close() }
            let openedIdentity = try Self.fileIdentity(
                fileDescriptor: handle.fileDescriptor
            )
            guard openedIdentity == pathIdentity else { continue }

            let sha256 = try hashFile(handle)
            let completedIdentity = try Self.fileIdentity(
                fileDescriptor: handle.fileDescriptor
            )
            guard completedIdentity == openedIdentity,
                try Self.fileIdentity(atPath: path) == openedIdentity
            else {
                continue
            }

            entries.store(
                sha256: sha256,
                atPath: path,
                identity: openedIdentity
            )
            return sha256
        }

        throw ChatGPTAsarHashError.changedDuringRead
    }

    nonisolated func cachedSHA256(at applicationURL: URL) -> String? {
        let path = Self.asarURL(for: applicationURL)
            .standardizedFileURL.resolvingSymlinksInPath().path
        guard let identity = try? Self.fileIdentity(atPath: path) else {
            return nil
        }
        return entries.sha256(atPath: path, identity: identity)
    }

    private nonisolated static func asarURL(for applicationURL: URL) -> URL {
        applicationURL
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("Resources", isDirectory: true)
            .appendingPathComponent("app.asar")
    }

    private nonisolated static func fileIdentity(
        atPath path: String
    ) throws -> ChatGPTAsarFileIdentity {
        var status = stat()
        let result = path.withCString { Darwin.lstat($0, &status) }
        guard result == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        return try ChatGPTAsarFileIdentity(status)
    }

    private nonisolated static func fileIdentity(
        fileDescriptor: Int32
    ) throws -> ChatGPTAsarFileIdentity {
        var status = stat()
        guard Darwin.fstat(fileDescriptor, &status) == 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        return try ChatGPTAsarFileIdentity(status)
    }

    private nonisolated static func streamSHA256(
        _ handle: FileHandle
    ) throws -> String {
        var hasher = SHA256()
        while let data = try handle.read(upToCount: readChunkSize),
            !data.isEmpty
        {
            hasher.update(data: data)
        }
        return hasher.finalize()
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

nonisolated private struct ChatGPTAsarFileIdentity: Equatable, Sendable {
    let device: UInt64
    let inode: UInt64
    let size: Int64
    let modificationSeconds: Int64
    let modificationNanoseconds: Int64
    let changeSeconds: Int64
    let changeNanoseconds: Int64

    init(_ status: stat) throws {
        guard status.st_mode & S_IFMT == S_IFREG else {
            throw ChatGPTAsarHashError.notRegularFile
        }
        device = UInt64(status.st_dev)
        inode = UInt64(status.st_ino)
        size = status.st_size
        modificationSeconds = Int64(status.st_mtimespec.tv_sec)
        modificationNanoseconds = Int64(status.st_mtimespec.tv_nsec)
        changeSeconds = Int64(status.st_ctimespec.tv_sec)
        changeNanoseconds = Int64(status.st_ctimespec.tv_nsec)
    }
}

nonisolated private final class ChatGPTAsarHashEntries: @unchecked Sendable {
    private struct Entry {
        let identity: ChatGPTAsarFileIdentity
        let sha256: String
    }

    private let lock = NSLock()
    private var entries = [String: Entry]()

    func sha256(
        atPath path: String,
        identity: ChatGPTAsarFileIdentity
    ) -> String? {
        lock.withLock {
            guard let entry = entries[path], entry.identity == identity else {
                return nil
            }
            return entry.sha256
        }
    }

    func store(
        sha256: String,
        atPath path: String,
        identity: ChatGPTAsarFileIdentity
    ) {
        lock.withLock {
            entries[path] = Entry(identity: identity, sha256: sha256)
        }
    }
}

nonisolated private enum ChatGPTAsarHashError: Error {
    case changedDuringRead
    case notRegularFile
}

private struct LaunchConfiguration: Encodable {
    let schemaVersion: Int
    let extensions: [LaunchExtension]
}

private final class RestartPrompt {
    private let alert = NSAlert()
    private var secondsRemaining: Int
    private var timer: Timer?

    init(seconds: Int) {
        secondsRemaining = seconds

        alert.alertStyle = .warning
        alert.messageText = "Restart ChatGPT?"
        alert.addButton(withTitle: "Restart")
        alert.addButton(withTitle: "Cancel")
        alert.buttons[1].keyEquivalent = "\u{1b}"
        updateCountdown()
    }

    func run() -> Bool {
        NSApplication.shared.activate(ignoringOtherApps: true)
        let countdownTimer = Timer(
            timeInterval: 1,
            target: self,
            selector: #selector(tick(_:)),
            userInfo: nil,
            repeats: true
        )
        timer = countdownTimer
        RunLoop.main.add(countdownTimer, forMode: .common)
        RunLoop.main.add(countdownTimer, forMode: .modalPanel)

        defer {
            timer?.invalidate()
            timer = nil
            alert.window.orderOut(nil)
        }

        return alert.runModal() == .alertFirstButtonReturn
    }

    @objc
    private func tick(_ timer: Timer) {
        secondsRemaining -= 1

        guard secondsRemaining > 0 else {
            timer.invalidate()
            NSApplication.shared.stopModal(withCode: .alertFirstButtonReturn)
            return
        }

        updateCountdown()
    }

    private func updateCountdown() {
        let unit = secondsRemaining == 1 ? "second" : "seconds"
        alert.informativeText =
            "ChatGPTX will quit and relaunch ChatGPT in \(secondsRemaining) \(unit)."
    }
}

private enum LaunchError: LocalizedError {
    case chatGPTNotInstalled
    case chatGPTExecutableMissing(URL)
    case chatGPTVersionMissing
    case bindingMissing(installed: String, available: String)
    case bindingBuildMismatch(String)
    case bridgeMissing
    case iconOverlayMissing
    case isolatedTestUserDataDirectoryMissing
    case apiTestExtensionRequired
    case extensionTestExtensionRequired
    case extensionTestReservedID(String)
    case extensionTestSessionUnavailable
    case chatGPTAlreadyRunning
    case launchAlreadyInProgress
    case launchCoordinationFailed(any Error)
    case launchCoordinationCleanupFailed(
        binding: any Error,
        cleanup: any Error
    )
    case chatGPTWouldNotQuit
    case chatGPTQuitTimedOut
    case applicationLaunchFailed(any Error)

    var errorDescription: String? {
        switch self {
        case .chatGPTNotInstalled:
            "ChatGPT.app is not installed."
        case .chatGPTExecutableMissing(let url):
            "The ChatGPT executable is missing at \(url.path)."
        case .chatGPTVersionMissing:
            "The installed ChatGPT version could not be determined."
        case .bindingMissing(let installed, let available):
            "ChatGPT \(installed) is installed, but the active binding supports \(available)."
        case .bindingBuildMismatch(let version):
            "The active binding does not match the installed ChatGPT \(version) build."
        case .bridgeMissing:
            "The platform bridge is missing from ChatGPTX."
        case .iconOverlayMissing:
            "The injected Dock icon overlay is missing from ChatGPTX."
        case .isolatedTestUserDataDirectoryMissing:
            "Isolated tests require an absolute --user-data-dir."
        case .apiTestExtensionRequired:
            "API tests require an explicit api-test-suite extension."
        case .extensionTestExtensionRequired:
            "Extension tests require an explicit local extension."
        case .extensionTestReservedID(let id):
            "Extension tests cannot override the reserved \(id) extension."
        case .extensionTestSessionUnavailable:
            "The ChatGPTX extension test session is unavailable."
        case .chatGPTAlreadyRunning:
            "Another ChatGPT instance started before recovery completed."
        case .launchAlreadyInProgress:
            "Another ChatGPTX launch is already in progress."
        case .launchCoordinationFailed(let error):
            "ChatGPT launch coordination failed: \(ChatGPTLauncher.diagnosticDescription(for: error))"
        case .launchCoordinationCleanupFailed(let binding, let cleanup):
            "ChatGPT launch coordination failed: \(ChatGPTLauncher.diagnosticDescription(for: binding)). The uncoordinated ChatGPT process could not be stopped: \(ChatGPTLauncher.diagnosticDescription(for: cleanup))"
        case .chatGPTWouldNotQuit:
            "The running ChatGPT app declined to quit."
        case .chatGPTQuitTimedOut:
            "The running ChatGPT app did not quit within 10 seconds."
        case .applicationLaunchFailed(let error):
            "ChatGPT could not be started: \(ChatGPTLauncher.diagnosticDescription(for: error))"
        }
    }
}
