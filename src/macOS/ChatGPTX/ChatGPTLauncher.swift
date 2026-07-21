import AppKit
import Darwin
import Foundation

struct ChatGPTLauncher {
    private static let chatGPTBundleIdentifier = "com.openai.codex"
    private static let bridgeRelativePath = "bridge/main.cjs"
    private static let restartCountdown = 10
    private static let quitTimeout: TimeInterval = 10

    func launch() async throws {
        let activity = ProcessInfo.processInfo.beginActivity(
            options: .userInitiated,
            reason: "Restart ChatGPT with the extension platform"
        )
        defer { ProcessInfo.processInfo.endActivity(activity) }

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

        if Self.isChatGPTRunning,
            !RestartPrompt(seconds: Self.restartCountdown).run() {
            return
        }

        try await quitRunningChatGPT()

        let process = Process()
        process.executableURL = executableURL
        process.environment = Self.environment(requiring: bridgeURL)
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

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

    private static func isProcessRunning(_ processIdentifier: pid_t) -> Bool {
        Darwin.kill(processIdentifier, 0) == 0 || errno != ESRCH
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
