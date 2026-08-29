import Foundation
import Observation
import SwiftUI

enum LauncherPane: String, CaseIterable, Identifiable {
    case general
    case components

    static let selectionDefaultsKey = "launcherSelectedPane"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general:
            "General"
        case .components:
            "Components"
        }
    }

    var systemImage: String {
        switch self {
        case .general:
            "gearshape.fill"
        case .components:
            "shippingbox.fill"
        }
    }

    var color: Color {
        switch self {
        case .general:
            .gray
        case .components:
            .blue
        }
    }
}

enum LauncherUpdateProgressState: Equatable {
    case hidden
    case indeterminate
    case determinate(value: Double, total: Double)
}

@Observable
final class LauncherSettingsModel {
    var selectedPane: LauncherPane {
        didSet {
            userDefaults.set(
                selectedPane.rawValue,
                forKey: LauncherPane.selectionDefaultsKey
            )
        }
    }

    private(set) var applicationURL: URL?
    private(set) var applicationVersion: String?
    private(set) var runtimeStatus = ChatGPTRuntimeStatus.notRunning
    private(set) var isLaunching = false
    private(set) var isCheckingForUpdates = false
    private(set) var skillLinkState = BundledSkillLinkState.unavailable
    private(set) var componentItems: [ComponentUpdateItem] = []
    private(set) var updateFeedbackState = UpdateButtonFeedbackState.reload
    private(set) var updateStatus: String?
    private(set) var updateProgress = LauncherUpdateProgressState.hidden

    var launchAtLogin = false {
        didSet {
            guard !isApplyingLaunchAtLoginState else { return }
            onSetLaunchAtLogin?(launchAtLogin)
        }
    }

    @ObservationIgnored var onOpenChatGPT: ((Bool) -> Void)?
    @ObservationIgnored var onShowRunningChatGPT: (() -> Void)?
    @ObservationIgnored var onCheckForUpdates: (() -> Void)?
    @ObservationIgnored var onSetLaunchAtLogin: ((Bool) -> Void)?
    @ObservationIgnored var onInstallCodexSkill: (() -> Void)?
    @ObservationIgnored private let userDefaults: UserDefaults
    @ObservationIgnored private var isApplyingLaunchAtLoginState = false

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        let rawPane = userDefaults.string(
            forKey: LauncherPane.selectionDefaultsKey
        )
        selectedPane = rawPane.flatMap(LauncherPane.init(rawValue:))
            ?? .general
    }

    var isBusy: Bool {
        isLaunching || isCheckingForUpdates
    }

    var primaryChatGPTActionTitle: String {
        if isLaunching {
            return "Opening…"
        }
        switch runtimeStatus {
        case .notRunning:
            return "Open ChatGPT"
        case .running, .extensionsUnavailable:
            return "Show ChatGPT"
        }
    }

    var showsRestartAction: Bool {
        runtimeStatus == .extensionsUnavailable
    }

    var runtimeDescription: String {
        switch runtimeStatus {
        case .notRunning:
            "ChatGPT is not running."
        case .running:
            "Extensions are enabled."
        case .extensionsUnavailable:
            "ChatGPT is running without extensions."
        }
    }

    func openChatGPT(forceRestart: Bool) {
        onOpenChatGPT?(forceRestart)
    }

    func performPrimaryChatGPTAction() {
        if runtimeStatus == .extensionsUnavailable {
            onShowRunningChatGPT?()
        } else {
            onOpenChatGPT?(false)
        }
    }

    func checkForUpdates() {
        onCheckForUpdates?()
    }

    func installCodexSkill() {
        onInstallCodexSkill?()
    }

    func setLaunching(_ isLaunching: Bool) {
        self.isLaunching = isLaunching
    }

    func showStatus(_ snapshot: ChatGPTStatusSnapshot) {
        applicationURL = snapshot.applicationURL
        applicationVersion = snapshot.applicationVersion
        runtimeStatus = snapshot.runtimeStatus
    }

    func setCheckingForUpdates(_ isChecking: Bool) {
        isCheckingForUpdates = isChecking
        guard isChecking else { return }
        updateStatus = nil
        updateProgress = .hidden
    }

    func setLaunchAtLogin(_ isEnabled: Bool) {
        isApplyingLaunchAtLoginState = true
        launchAtLogin = isEnabled
        isApplyingLaunchAtLoginState = false
    }

    func showCodexSkillLinkState(_ state: BundledSkillLinkState) {
        skillLinkState = state
    }

    func showUpdateSummary(_ summary: ComponentUpdateSummary) {
        componentItems = summary.items
    }

    func showUpdateFeedback(_ state: UpdateButtonFeedbackState) {
        updateFeedbackState = state
    }

    func showUpdateStatus(
        _ status: String?,
        progress: LauncherUpdateProgressState
    ) {
        updateStatus = status
        updateProgress = progress
    }
}
