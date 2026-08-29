import AppKit
import SwiftUI

final class LauncherWindowController: NSWindowController {
    private static let frameAutosaveName = "ChatGPTX.SettingsWindow"

    private let model: LauncherSettingsModel
    private var updateStatusDismissalTask: Task<Void, Never>?
    private lazy var updateButtonFeedbackController =
        UpdateButtonFeedbackController(
            resultDuration: updateButtonResultDuration,
            minimumCheckingDuration: updateButtonMinimumCheckingDuration
        ) { [weak model] state in
            model?.showUpdateFeedback(state)
        }

    private let updateButtonResultDuration: Duration
    private let updateButtonMinimumCheckingDuration: Duration

    var onOpenChatGPT: ((Bool) -> Void)? {
        get { model.onOpenChatGPT }
        set { model.onOpenChatGPT = newValue }
    }

    var onCheckForUpdates: (() -> Void)? {
        get { model.onCheckForUpdates }
        set { model.onCheckForUpdates = newValue }
    }

    var onShowRunningChatGPT: (() -> Void)? {
        get { model.onShowRunningChatGPT }
        set { model.onShowRunningChatGPT = newValue }
    }

    var onSetLaunchAtLogin: ((Bool) -> Void)? {
        get { model.onSetLaunchAtLogin }
        set { model.onSetLaunchAtLogin = newValue }
    }

    var onInstallCodexSkill: (() -> Void)? {
        get { model.onInstallCodexSkill }
        set { model.onInstallCodexSkill = newValue }
    }

    init(
        updateButtonResultDuration: Duration =
            UpdateButtonFeedbackController.defaultResultDuration,
        updateButtonMinimumCheckingDuration: Duration =
            UpdateButtonFeedbackController.defaultMinimumCheckingDuration,
        userDefaults: UserDefaults = .standard
    ) {
        self.updateButtonResultDuration = updateButtonResultDuration
        self.updateButtonMinimumCheckingDuration =
            updateButtonMinimumCheckingDuration
        let model = LauncherSettingsModel(userDefaults: userDefaults)
        self.model = model

        let hostingController = NSHostingController(
            rootView: LauncherSettingsView(model: model)
        )
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 760, height: 520),
            styleMask: [
                .titled,
                .closable,
                .miniaturizable,
                .resizable,
                .fullSizeContentView
            ],
            backing: .buffered,
            defer: false
        )
        window.contentViewController = hostingController
        window.title = model.selectedPane.title
        window.titleVisibility = .visible
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 680, height: 460)
        window.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        if !window.setFrameUsingName(Self.frameAutosaveName) {
            window.center()
        }
        window.setFrameAutosaveName(Self.frameAutosaveName)

        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder _: NSCoder) {
        fatalError("init(coder:) is unavailable")
    }

    func setLaunching(_ isLaunching: Bool) {
        model.setLaunching(isLaunching)
    }

    func showStatus(_ snapshot: ChatGPTStatusSnapshot) {
        model.showStatus(snapshot)
    }

    func setCheckingForUpdates(_ isChecking: Bool) {
        model.setCheckingForUpdates(isChecking)
        updateButtonFeedbackController.setChecking(isChecking)
        if isChecking {
            updateStatusDismissalTask?.cancel()
        }
    }

    func setLaunchAtLogin(_ isEnabled: Bool) {
        model.setLaunchAtLogin(isEnabled)
    }

    func showCodexSkillLinkState(_ state: BundledSkillLinkState) {
        model.showCodexSkillLinkState(state)
    }

    func showUpdateSummary(_ summary: ComponentUpdateSummary) {
        model.showUpdateSummary(summary)
    }

    func showUpdateProgress(_ progress: ComponentUpdateProgress) {
        updateStatusDismissalTask?.cancel()
        switch progress {
        case let .downloading(_, name, receivedBytes, totalBytes):
            let received = ByteCountFormatter.string(
                fromByteCount: receivedBytes,
                countStyle: .file
            )
            if let totalBytes {
                let total = ByteCountFormatter.string(
                    fromByteCount: totalBytes,
                    countStyle: .file
                )
                model.showUpdateStatus(
                    "Downloading \(name) · \(received) of \(total)",
                    progress: .determinate(
                        value: Double(receivedBytes),
                        total: Double(totalBytes)
                    )
                )
            } else {
                model.showUpdateStatus(
                    "Downloading \(name) · \(received)",
                    progress: .indeterminate
                )
            }
        case let .verifying(_, name):
            model.showUpdateStatus(
                "Verifying \(name)…",
                progress: .indeterminate
            )
        case let .installing(_, name):
            model.showUpdateStatus(
                "Installing \(name)…",
                progress: .indeterminate
            )
        }
    }

    func showUpdateCompletion(
        installed: Bool,
        restartRequired: Bool
    ) {
        updateButtonFeedbackController.showResult(
            installed ? .updateAvailable : .noUpdates
        )
        guard installed else {
            model.showUpdateStatus(nil, progress: .hidden)
            return
        }
        if restartRequired {
            model.showUpdateStatus(
                "Restart ChatGPT to activate updates.",
                progress: .hidden
            )
            return
        }
        model.showUpdateStatus("Updated", progress: .hidden)
        updateStatusDismissalTask = Task { [weak model] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            model?.showUpdateStatus(nil, progress: .hidden)
        }
    }

    func showUpdateFailure(_ error: any Error) {
        updateButtonFeedbackController.showResult(.failure)
        updateStatusDismissalTask?.cancel()
        model.showUpdateStatus(
            "Update failed: \(error.localizedDescription)",
            progress: .hidden
        )
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.makeKeyAndOrderFront(sender)
    }
}
