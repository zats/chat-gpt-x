import AppKit
import Foundation

enum ChatGPTRuntimeStatus: Equatable {
    case notRunning
    case running(extensionsEnabled: Bool)
}

struct ChatGPTStatusSnapshot: Equatable {
    let applicationURL: URL?
    let runtimeStatus: ChatGPTRuntimeStatus
}

enum ChatGPTBridgeLog {
    private static let launchDateTolerance: TimeInterval = 2
    private static let maximumBytes = 128 * 1024

    static func hasInjectedPlatform(
        at url: URL,
        launchedAt launchDate: Date?,
        fileManager: FileManager = .default
    ) -> Bool {
        guard
            let attributes = try? fileManager.attributesOfItem(atPath: url.path),
            let modificationDate = attributes[.modificationDate] as? Date
        else {
            return false
        }

        if let launchDate,
            modificationDate
                < launchDate.addingTimeInterval(-launchDateTolerance) {
            return false
        }

        guard
            let handle = try? FileHandle(forReadingFrom: url),
            let data = try? handle.read(upToCount: maximumBytes)
        else {
            return false
        }
        try? handle.close()

        return data.split(separator: 0x0A).contains { line in
            guard
                let object = try? JSONSerialization.jsonObject(with: Data(line))
                    as? [String: Any]
            else {
                return false
            }
            return object["event"] as? String == "injected"
        }
    }
}

enum ChatGPTRuntime {
    static var runningApplications: [NSRunningApplication] {
        NSRunningApplication.runningApplications(
            withBundleIdentifier: ChatGPTLauncher.chatGPTBundleIdentifier
        )
    }

    static func extensionsEnabled(
        for application: NSRunningApplication,
        fileManager: FileManager = .default
    ) -> Bool {
        let logURL = codexHomeURL()
            .appendingPathComponent("extensions", isDirectory: true)
            .appendingPathComponent("log", isDirectory: true)
            .appendingPathComponent(
                "bridge-\(application.processIdentifier).log"
            )
        return ChatGPTBridgeLog.hasInjectedPlatform(
            at: logURL,
            launchedAt: application.launchDate,
            fileManager: fileManager
        )
    }

    static func activateRunningApplicationWithExtensions() -> Bool {
        guard
            let application = runningApplications.first(where: {
                extensionsEnabled(for: $0)
            })
        else {
            return false
        }

        application.activate(options: [.activateAllWindows])
        return true
    }

    private static func codexHomeURL() -> URL {
        if let path = ProcessInfo.processInfo.environment["CODEX_HOME"],
            !path.isEmpty {
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex", isDirectory: true)
    }
}

final class ChatGPTStatusMonitor: NSObject {
    private let applicationURL: URL?
    private let fileManager: FileManager
    private let workspace: NSWorkspace
    private let updateHandler: (ChatGPTStatusSnapshot) -> Void
    private var lastSnapshot: ChatGPTStatusSnapshot?
    private var timer: Timer?

    init(
        applicationURL: URL?,
        fileManager: FileManager = .default,
        workspace: NSWorkspace = .shared,
        updateHandler: @escaping (ChatGPTStatusSnapshot) -> Void
    ) {
        self.applicationURL = applicationURL
        self.fileManager = fileManager
        self.workspace = workspace
        self.updateHandler = updateHandler
    }

    func start() {
        let notificationCenter = workspace.notificationCenter
        notificationCenter.addObserver(
            self,
            selector: #selector(refresh),
            name: NSWorkspace.didLaunchApplicationNotification,
            object: nil
        )
        notificationCenter.addObserver(
            self,
            selector: #selector(refresh),
            name: NSWorkspace.didTerminateApplicationNotification,
            object: nil
        )

        let timer = Timer(
            timeInterval: 0.75,
            target: self,
            selector: #selector(refresh),
            userInfo: nil,
            repeats: true
        )
        self.timer = timer
        RunLoop.main.add(timer, forMode: .common)
        refresh()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        workspace.notificationCenter.removeObserver(self)
    }

    @objc
    func refresh() {
        let snapshot = Self.snapshot(
            applicationURL: applicationURL,
            fileManager: fileManager,
            workspace: workspace
        )
        guard snapshot != lastSnapshot else { return }
        lastSnapshot = snapshot
        updateHandler(snapshot)
    }

    private static func snapshot(
        applicationURL: URL?,
        fileManager: FileManager,
        workspace: NSWorkspace
    ) -> ChatGPTStatusSnapshot {
        let runningApplications = ChatGPTRuntime.runningApplications
        let resolvedApplicationURL = applicationURL
            ?? runningApplications.first?.bundleURL
            ?? ChatGPTLauncher.installedApplicationURL(workspace: workspace)

        guard !runningApplications.isEmpty else {
            return ChatGPTStatusSnapshot(
                applicationURL: resolvedApplicationURL,
                runtimeStatus: .notRunning
            )
        }

        let extensionsEnabled = runningApplications.contains { application in
            ChatGPTRuntime.extensionsEnabled(
                for: application,
                fileManager: fileManager
            )
        }

        return ChatGPTStatusSnapshot(
            applicationURL: resolvedApplicationURL,
            runtimeStatus: .running(extensionsEnabled: extensionsEnabled)
        )
    }

}
