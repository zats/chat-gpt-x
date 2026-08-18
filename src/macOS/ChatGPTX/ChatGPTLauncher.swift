import AppKit
import CryptoKit
import Foundation

enum ChatGPTLaunchMode {
    case normal
    case apiTest
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
    private static let restartCountdown = 10
    private static let quitTimeout: TimeInterval = 10

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

        try Self.validateBinding(
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

        if mode == .apiTest {
            guard arguments.contains(where: {
                $0.hasPrefix("--user-data-dir=/")
            }) else {
                throw LaunchError.apiTestUserDataDirectoryMissing
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
            try Self.validateBinding(
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
            versionsLockURL: launchVersionsLockURL
        )
        configuration.createsNewApplicationInstance = true
        configuration.activates = mode == .normal

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
        Bundle(url: url)?.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String
    }

    static func applicationAsarSHA256(at applicationURL: URL) -> String? {
        let asarURL = applicationURL
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("Resources", isDirectory: true)
            .appendingPathComponent("app.asar")
        guard let data = try? Data(contentsOf: asarURL) else {
            return nil
        }
        return SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
    }

    static func bindingMatches(
        applicationURL: URL,
        binding: StoredBinding
    ) -> Bool {
        guard applicationVersion(at: applicationURL) == binding.chatgpt else {
            return false
        }
        return applicationAsarSHA256(at: applicationURL)
            == binding.asarSha256
    }

    private static func validateBinding(
        applicationURL: URL,
        binding: StoredBinding
    ) throws {
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
        guard bindingMatches(
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
        var localExtensions = try localExtensionURLs.map {
            try LocalExtensionResolver.resolve(
                $0,
                chatgptAPIVersion: componentStore.versions.chatgptApi.version
            )
        }

        let selectedExtensions: [LaunchExtension]
        if mode == .apiTest {
            localExtensions = localExtensions.filter {
                $0.id == "api-test-suite"
            }
            guard let apiTestExtension = localExtensions.last else {
                throw LaunchError.apiTestExtensionRequired
            }
            selectedExtensions = [apiTestExtension]
        } else {
            selectedExtensions = merge(
                installedExtensions: componentStore.extensions
                    .filter(\.enabled)
                    .map {
                    LaunchExtension(
                        id: $0.id,
                        path: componentStore.rootURL
                            .appendingPathComponent(
                                $0.path,
                                isDirectory: true
                            )
                            .appendingPathComponent("contents/main.js")
                            .path
                    )
                },
                localExtensions: localExtensions
            )
        }

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
                schemaVersion: 1,
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

    private func merge(
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
        return merged
    }

    private static func environment(
        requiring bridgeURL: URL,
        launchConfigurationURL: URL?,
        versionsLockURL: URL
    ) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        let requireOption = "--require \(quoteNodeOption(bridgeURL.path))"

        if let existingOptions = environment["NODE_OPTIONS"], !existingOptions.isEmpty {
            environment["NODE_OPTIONS"] = "\(requireOption) \(existingOptions)"
        } else {
            environment["NODE_OPTIONS"] = requireOption
        }

        if let launchConfigurationURL {
            environment[launchConfigurationEnvironmentKey] =
                launchConfigurationURL.path
        }
        environment[versionsLockEnvironmentKey] = versionsLockURL.path

        return environment
    }

    private static func quoteNodeOption(_ value: String) -> String {
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }
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
    case apiTestUserDataDirectoryMissing
    case apiTestExtensionRequired
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
        case .apiTestUserDataDirectoryMissing:
            "API tests require an isolated absolute --user-data-dir."
        case .apiTestExtensionRequired:
            "API tests require an explicit api-test-suite extension."
        case .chatGPTAlreadyRunning:
            "Another ChatGPT instance started before recovery completed."
        case .launchAlreadyInProgress:
            "Another ChatGPTX launch is already in progress."
        case .launchCoordinationFailed(let error):
            "ChatGPT launch coordination failed: \(error.localizedDescription)"
        case .launchCoordinationCleanupFailed(let binding, let cleanup):
            "ChatGPT launch coordination failed: \(binding.localizedDescription). The uncoordinated ChatGPT process could not be stopped: \(cleanup.localizedDescription)"
        case .chatGPTWouldNotQuit:
            "The running ChatGPT app declined to quit."
        case .chatGPTQuitTimedOut:
            "The running ChatGPT app did not quit within 10 seconds."
        case .applicationLaunchFailed(let error):
            "ChatGPT could not be started: \(error.localizedDescription)"
        }
    }
}
