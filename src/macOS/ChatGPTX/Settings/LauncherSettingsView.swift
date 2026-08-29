import Foundation
import SwiftUI

struct LauncherSettingsView: View {
    @Bindable var model: LauncherSettingsModel

    var body: some View {
        HStack(spacing: 0) {
            LauncherSidebarView(model: self.model)
                .frame(width: 210)
                .background {
                    LauncherSidebarMaterial()
                        .ignoresSafeArea()
                }

            Divider()
                .ignoresSafeArea()

            LauncherDetailView(model: self.model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(
            minWidth: 680,
            idealWidth: 760,
            maxWidth: .infinity,
            minHeight: 460,
            idealHeight: 520,
            maxHeight: .infinity
        )
        .background {
            LauncherWindowAppearanceBridge(
                title: self.model.selectedPane.title
            )
            .allowsHitTesting(false)
        }
    }
}

private struct LauncherSidebarView: View {
    @Bindable var model: LauncherSettingsModel

    var body: some View {
        VStack(spacing: 2) {
            ForEach(LauncherPane.allCases) { pane in
                Button {
                    self.model.selectedPane = pane
                } label: {
                    LauncherSidebarRow(
                        pane: pane,
                        isSelected: self.model.selectedPane == pane
                    )
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.top, 12)
    }
}

private struct LauncherSidebarRow: View {
    let pane: LauncherPane
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 8) {
            LauncherSettingsIconChip(
                systemImage: self.pane.systemImage,
                color: self.pane.color
            )
            Text(self.pane.title)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .background {
            if self.isSelected {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.accentColor.opacity(0.18))
            }
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct LauncherSettingsIconChip: View {
    let systemImage: String
    let color: Color

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 20, height: 20)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [color.opacity(0.85), color],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .shadow(color: .black.opacity(0.15), radius: 1, y: 1)
            )
            .accessibilityHidden(true)
    }
}

private struct LauncherDetailView: View {
    let model: LauncherSettingsModel

    var body: some View {
        VStack {
            switch self.model.selectedPane {
            case .general:
                LauncherGeneralPane(model: self.model)
            case .components:
                LauncherComponentsPane(model: self.model)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct LauncherGeneralPane: View {
    @Bindable var model: LauncherSettingsModel

    var body: some View {
        Form {
            Section("Startup") {
                Toggle(
                    "Launch at Login",
                    isOn: self.$model.launchAtLogin
                )
                .accessibilityIdentifier("launch-at-login")
            }

            Section("ChatGPT") {
                LauncherChatGPTApplicationRow(model: self.model)
                if self.model.showsRestartAction {
                    LauncherChatGPTRestartRow(model: self.model)
                }
            }

            Section("Skills") {
                LauncherSkillRow(model: self.model)
            }
        }
        .formStyle(.grouped)
        .labeledContentStyle(LauncherCenteredLabeledContentStyle())
        .toggleStyle(.switch)
        .scrollContentBackground(.hidden)
    }
}

private struct LauncherChatGPTApplicationRow: View {
    @State private var isOptionKeyPressed = false
    let model: LauncherSettingsModel

    var body: some View {
        LabeledContent {
            Button(
                self.usesRestartAction
                    ? "Restart ChatGPT"
                    : self.model.primaryChatGPTActionTitle
            ) {
                if self.usesRestartAction {
                    self.model.openChatGPT(forceRestart: true)
                } else {
                    self.model.performPrimaryChatGPTAction()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(
                self.model.isBusy || self.model.applicationURL == nil
            )
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier(
                self.usesRestartAction
                    ? "restart-chatgpt"
                    : "open-chatgpt"
            )
        } label: {
            LauncherChatGPTLabel(
                version: self.model.applicationVersion ?? "Not installed",
                subtitle: self.model.runtimeDescription,
                warning: self.model.showsRestartAction
            )
        }
        .onModifierKeysChanged(mask: .option) { _, newModifiers in
            self.isOptionKeyPressed = newModifiers.contains(.option)
        }
    }

    private var usesRestartAction: Bool {
        self.isOptionKeyPressed && self.model.runtimeStatus != .notRunning
    }
}

private struct LauncherChatGPTLabel: View {
    let version: String
    let subtitle: String
    let warning: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("ChatGPT")
                Text(self.version)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("chatgpt-version")
            }
            Text(self.subtitle)
                .font(.caption)
                .foregroundStyle(self.warning ? .orange : .secondary)
        }
    }
}

private struct LauncherChatGPTRestartRow: View {
    let model: LauncherSettingsModel

    var body: some View {
        LabeledContent {
            Button("Restart ChatGPT") {
                self.model.openChatGPT(forceRestart: true)
            }
            .disabled(self.model.isBusy)
            .accessibilityIdentifier("restart-chatgpt-with-extensions")
        } label: {
            LauncherSettingsRowLabel(
                "Enable Extensions",
                subtitle: nil
            )
        }
    }
}

private struct LauncherSkillRow: View {
    let model: LauncherSettingsModel

    var body: some View {
        let presentation = model.skillLinkState.presentation
        LabeledContent {
            Button(presentation.buttonTitle) {
                self.model.installCodexSkill()
            }
            .disabled(self.model.isBusy || !presentation.buttonEnabled)
            .accessibilityIdentifier("install-codex-skill")
        } label: {
            LauncherSettingsRowLabel(
                "Build ChatGPTX Extensions",
                subtitle: presentation.status
            )
            .accessibilityIdentifier("codex-skill-status")
        }
    }
}

#if DEBUG
    private enum LauncherSettingsPreviewData {
        static func makeModel() -> LauncherSettingsModel {
            let defaults = UserDefaults(
                suiteName: "com.chatgptx.launcher.preview"
            )!
            let model = LauncherSettingsModel(userDefaults: defaults)
            model.selectedPane = .general
            model.showStatus(
                ChatGPTStatusSnapshot(
                    applicationURL: URL(
                        fileURLWithPath: "/Preview/ChatGPT.app"
                    ),
                    applicationVersion: "26.825.41651",
                    runtimeStatus: .extensionsUnavailable
                )
            )
            model.setLaunchAtLogin(true)
            model.showCodexSkillLinkState(.available)
            model.showUpdateSummary(
                ComponentUpdateSummary(
                    items: [
                        ComponentUpdateItem(
                            id: "chatgpt-api",
                            name: "ChatGPT API",
                            latestVersion: "1.5.2",
                            localVersion: .current
                        ),
                        ComponentUpdateItem(
                            id: "binding",
                            name: "Binding",
                            latestVersion: "1.0.0",
                            localVersion: .current
                        ),
                        ComponentUpdateItem(
                            id: "extension:extensions",
                            name: "extensions",
                            latestVersion: "0.1.2",
                            localVersion: .current
                        ),
                        ComponentUpdateItem(
                            id: "extension:multiple-accounts",
                            name: "multiple-accounts",
                            latestVersion: "0.1.14",
                            localVersion: .current
                        ),
                        ComponentUpdateItem(
                            id: "extension:reactions",
                            name: "reactions",
                            latestVersion: "0.3.0",
                            localVersion: .current
                        ),
                        ComponentUpdateItem(
                            id: "extension:thread-colors",
                            name: "thread-colors",
                            latestVersion: "0.1.13",
                            localVersion: .current
                        ),
                    ]
                )
            )
            model.onOpenChatGPT = { _ in }
            model.onShowRunningChatGPT = {}
            model.onCheckForUpdates = {}
            model.onSetLaunchAtLogin = { _ in }
            model.onInstallCodexSkill = {}
            return model
        }
    }

    #Preview("Main Screen") {
        @Previewable @State var model = LauncherSettingsPreviewData.makeModel()

        LauncherSettingsView(model: model)
            .frame(width: 760, height: 520)
    }
#endif
