import AppKit
import Foundation

struct ChatGPTLauncher {
    private static let chatGPTBundleIdentifier = "com.openai.codex"
    private static let bridgeRelativePath = "bridge/main.cjs"
    private static let quitTimeout: TimeInterval = 10

    func launch() async throws {
        let workspace = NSWorkspace.shared

        guard let applicationURL = workspace.urlForApplication(
            withBundleIdentifier: Self.chatGPTBundleIdentifier
        ), let executableURL = Bundle(url: applicationURL)?.executableURL else {
            throw LaunchError.chatGPTNotInstalled
        }

        guard FileManager.default.isExecutableFile(atPath: executableURL.path) else {
            throw LaunchError.chatGPTExecutableMissing(executableURL)
        }

        guard let bridgeURL = Bundle.main.resourceURL?
            .appendingPathComponent(Self.bridgeRelativePath),
            FileManager.default.fileExists(atPath: bridgeURL.path) else {
            throw LaunchError.bridgeMissing
        }

        try await quitRunningChatGPT()

        let process = Process()
        process.executableURL = executableURL
        process.environment = Self.environment(requiring: bridgeURL)

        do {
            try process.run()
        } catch {
            throw LaunchError.processLaunchFailed(error)
        }
    }

    private func quitRunningChatGPT() async throws {
        let runningApplications = NSRunningApplication.runningApplications(
            withBundleIdentifier: Self.chatGPTBundleIdentifier
        )

        guard !runningApplications.isEmpty else { return }

        for application in runningApplications where !application.terminate() {
            throw LaunchError.chatGPTWouldNotQuit
        }

        let deadline = Date().addingTimeInterval(Self.quitTimeout)
        while runningApplications.contains(where: { !$0.isTerminated }) {
            guard Date() < deadline else {
                throw LaunchError.chatGPTQuitTimedOut
            }
            try await Task.sleep(for: .milliseconds(100))
        }
    }

    private static func environment(requiring bridgeURL: URL) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        let requireOption = "--require \(quoteNodeOption(bridgeURL.path))"

        if let existingOptions = environment["NODE_OPTIONS"], !existingOptions.isEmpty {
            environment["NODE_OPTIONS"] = "\(requireOption) \(existingOptions)"
        } else {
            environment["NODE_OPTIONS"] = requireOption
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

private enum LaunchError: LocalizedError {
    case chatGPTNotInstalled
    case chatGPTExecutableMissing(URL)
    case bridgeMissing
    case chatGPTWouldNotQuit
    case chatGPTQuitTimedOut
    case processLaunchFailed(any Error)

    var errorDescription: String? {
        switch self {
        case .chatGPTNotInstalled:
            "ChatGPT.app is not installed."
        case .chatGPTExecutableMissing(let url):
            "The ChatGPT executable is missing at \(url.path)."
        case .bridgeMissing:
            "The platform bridge is missing from ChatGPTX."
        case .chatGPTWouldNotQuit:
            "The running ChatGPT app declined to quit."
        case .chatGPTQuitTimedOut:
            "The running ChatGPT app did not quit within 10 seconds."
        case .processLaunchFailed(let error):
            "ChatGPT could not be started: \(error.localizedDescription)"
        }
    }
}
