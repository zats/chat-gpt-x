import AppKit
import CryptoKit
import Darwin
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

        guard
            let installedVersion = chatGPTBundle.object(
                forInfoDictionaryKey: "CFBundleShortVersionString"
            ) as? String,
            !installedVersion.isEmpty
        else {
            throw LaunchError.chatGPTVersionMissing
        }
        guard installedVersion == componentStore.versions.binding.chatgpt else {
            throw LaunchError.bindingMissing(
                installed: installedVersion,
                available: componentStore.versions.binding.chatgpt
            )
        }
        guard Self.bindingMatches(
            applicationURL: resolvedApplicationURL,
            binding: componentStore.versions.binding
        ) else {
            throw LaunchError.bindingBuildMismatch(installedVersion)
        }

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

        let configuration = NSWorkspace.OpenConfiguration()
        configuration.arguments = arguments
        configuration.environment = Self.environment(
            requiring: bridgeURL,
            launchConfigurationURL: launchConfigurationURL,
            versionsLockURL: componentStore.versionsLockURL
        )
        configuration.createsNewApplicationInstance = true

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

    private func stopUncoordinatedChatGPT(
        _ application: NSRunningApplication
    ) async throws {
        let processIdentifier = application.processIdentifier
        guard !Self.isProcessRunning(processIdentifier)
            || application.terminate()
            || application.forceTerminate()
        else {
            throw LaunchError.chatGPTWouldNotQuit
        }

        var deadline = Date().addingTimeInterval(Self.quitTimeout)
        while Self.isProcessRunning(processIdentifier), Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        guard Self.isProcessRunning(processIdentifier) else { return }
        guard application.forceTerminate() else {
            throw LaunchError.chatGPTWouldNotQuit
        }

        deadline = Date().addingTimeInterval(Self.quitTimeout)
        while Self.isProcessRunning(processIdentifier), Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        guard !Self.isProcessRunning(processIdentifier) else {
            throw LaunchError.chatGPTQuitTimedOut
        }
    }

    private func quitRunningChatGPT() async throws {
        let runningApplications = NSRunningApplication.runningApplications(
            withBundleIdentifier: Self.chatGPTBundleIdentifier
        )

        guard !runningApplications.isEmpty else { return }

        let processIdentifiers = runningApplications.map(\.processIdentifier)

        for application in runningApplications where !application.terminate() {
            throw LaunchError.chatGPTWouldNotQuit
        }

        let deadline = Date().addingTimeInterval(Self.quitTimeout)
        while processIdentifiers.contains(where: Self.isProcessRunning) {
            guard Date() < deadline else {
                throw LaunchError.chatGPTQuitTimedOut
            }
            try await Task.sleep(for: .milliseconds(100))
        }
    }

    private static var isChatGPTRunning: Bool {
        !NSRunningApplication.runningApplications(
            withBundleIdentifier: chatGPTBundleIdentifier
        ).isEmpty
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

    static func bindingMatches(
        applicationURL: URL,
        binding: StoredBinding
    ) -> Bool {
        guard applicationVersion(at: applicationURL) == binding.chatgpt else {
            return false
        }
        let asarURL = applicationURL
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("Resources", isDirectory: true)
            .appendingPathComponent("app.asar")
        guard let data = try? Data(contentsOf: asarURL) else {
            return false
        }
        let digest = SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
        return digest == binding.asarSha256
    }

    private static func isChatGPTBundle(_ url: URL) -> Bool {
        guard let bundle = Bundle(url: url),
            bundle.bundleIdentifier == chatGPTBundleIdentifier,
            let executableURL = bundle.executableURL else {
            return false
        }
        return FileManager.default.isExecutableFile(atPath: executableURL.path)
    }

    private static func isProcessRunning(_ processIdentifier: pid_t) -> Bool {
        Darwin.kill(processIdentifier, 0) == 0 || errno != ESRCH
    }

    private func launchConfiguration(
        for mode: ChatGPTLaunchMode,
        localExtensionURLs: [URL]
    ) throws -> URL? {
        var localExtensions = try localExtensionURLs.map {
            try LocalExtensionResolver.resolve(
                $0,
                chatgptVersion: componentStore.versions.binding.chatgpt,
                chatgptAPIVersion: componentStore.versions.chatgptApi.version
            )
        }

        let selectedExtensions: [LaunchExtension]
        if mode == .apiTest {
            localExtensions = localExtensions.filter {
                $0.id == "api-test-suite"
            }
            if let apiTestExtension = localExtensions.last {
                selectedExtensions = [apiTestExtension]
            } else {
                guard let resourcesURL = Bundle.main.resourceURL else {
                    throw LaunchError.bridgeMissing
                }
                let bundledAPIExtensionURL = resourcesURL
                    .appendingPathComponent(
                        "component-seed/api-test-suite",
                        isDirectory: true
                    )
                selectedExtensions = [
                    try LocalExtensionResolver.resolve(
                        bundledAPIExtensionURL,
                        chatgptVersion: componentStore.versions.binding.chatgpt,
                        chatgptAPIVersion:
                            componentStore.versions.chatgptApi.version
                    )
                ]
            }
        } else {
            guard !localExtensions.isEmpty else { return nil }
            selectedExtensions = merge(
                installedExtensions: componentStore.versions.extensions
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
