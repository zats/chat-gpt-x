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

        return events(at: url).contains("injected")
    }

    static func events(at url: URL) -> Set<String> {
        guard
            let handle = try? FileHandle(forReadingFrom: url),
            let data = try? handle.read(upToCount: maximumBytes)
        else {
            return []
        }
        try? handle.close()

        return Set(data.split(separator: 0x0A).compactMap { line in
            guard
                let object = try? JSONSerialization.jsonObject(with: Data(line))
                    as? [String: Any]
            else {
                return nil
            }
            return object["event"] as? String
        })
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
        let logURL = bridgeLogURL(for: application)
        return ChatGPTBridgeLog.hasInjectedPlatform(
            at: logURL,
            launchedAt: application.launchDate,
            fileManager: fileManager
        )
    }

    static func bridgeLogURL(
        for application: NSRunningApplication
    ) -> URL {
        codexHomeURL()
            .appendingPathComponent("extensions", isDirectory: true)
            .appendingPathComponent("log", isDirectory: true)
            .appendingPathComponent(
                "bridge-\(application.processIdentifier).log"
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

    static func codexHomeURL() -> URL {
        if let path = ProcessInfo.processInfo.environment["CODEX_HOME"],
            !path.isEmpty {
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex", isDirectory: true)
    }
}

enum ChatGPTInjectionFailure {
    case extensionsDisabled(pid_t)
    case bindingMissing(pid_t)
}

final class ChatGPTInjectionMonitor {
    private static let gracePeriod: TimeInterval = 6

    private let expectedBinding: () -> StoredBinding?
    private let failureHandler: (ChatGPTInjectionFailure) -> Void
    private var notifiedProcessIdentifiers = Set<pid_t>()
    private var timer: Timer?

    init(
        expectedBinding: @escaping () -> StoredBinding?,
        failureHandler: @escaping (ChatGPTInjectionFailure) -> Void
    ) {
        self.expectedBinding = expectedBinding
        self.failureHandler = failureHandler
    }

    func start() {
        let timer = Timer(
            timeInterval: 1,
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
    }

    @objc
    private func refresh() {
        let applications = ChatGPTRuntime.runningApplications
        let activeProcessIdentifiers = Set(
            applications.map(\.processIdentifier)
        )
        notifiedProcessIdentifiers.formIntersection(activeProcessIdentifiers)

        for application in applications {
            let processIdentifier = application.processIdentifier
            guard
                !notifiedProcessIdentifiers.contains(processIdentifier),
                !ChatGPTRuntime.extensionsEnabled(for: application),
                let launchDate = application.launchDate,
                Date().timeIntervalSince(launchDate) >= Self.gracePeriod
            else {
                continue
            }

            notifiedProcessIdentifiers.insert(processIdentifier)
            let events = ChatGPTBridgeLog.events(
                at: ChatGPTRuntime.bridgeLogURL(for: application)
            )
            let bindingMatches = application.bundleURL.flatMap { url in
                expectedBinding().map {
                    ChatGPTLauncher.bindingMatches(
                        applicationURL: url,
                        binding: $0
                    )
                }
            } ?? false
            if !bindingMatches || events.contains("bindings-missing") {
                failureHandler(.bindingMissing(processIdentifier))
            } else {
                failureHandler(.extensionsDisabled(processIdentifier))
            }
        }
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
