import SwiftUI

struct LauncherComponentsPane: View {
    let model: LauncherSettingsModel

    var body: some View {
        Form {
            Section {
                if self.model.componentItems.isEmpty {
                    Text("No component information is available.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(self.model.componentItems, id: \.id) { item in
                        LauncherComponentRow(item: item)
                    }
                }
            } header: {
                LauncherComponentsHeader(model: self.model)
            }

            if self.model.updateStatus != nil || self.model.updateProgress != .hidden {
                Section {
                    LauncherComponentUpdateStatus(model: self.model)
                }
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
    }
}

private struct LauncherComponentRow: View {
    let item: ComponentUpdateItem

    var body: some View {
        LabeledContent {
            VStack(alignment: .trailing, spacing: 2) {
                Text(self.latestVersion)
                    .font(.body.monospacedDigit())
                if let localVersion = self.localVersion {
                    Text(localVersion)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        } label: {
            Text(self.item.name)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    private var latestVersion: String {
        if case .incompatible = item.localVersion {
            return "Inactive"
        }
        return item.latestVersion
    }

    private var localVersion: String? {
        switch item.localVersion {
        case .current:
            nil
        case let .different(version):
            "Installed \(version)"
        case .missing:
            "Not installed"
        case let .incompatible(version):
            version.map { "Installed \($0) · incompatible" }
                ?? "No compatible version"
        }
    }

    private var accessibilityLabel: String {
        if case let .incompatible(version) = item.localVersion {
            return version.map {
                "\(self.item.name), inactive, installed \($0) is incompatible"
            } ?? "\(item.name), inactive, no compatible version"
        }
        return "\(item.name), latest \(item.latestVersion)"
    }
}

private struct LauncherComponentsHeader: View {
    let model: LauncherSettingsModel

    var body: some View {
        HStack {
            Text("Installed Components")
            Spacer()
            Button {
                self.model.checkForUpdates()
            } label: {
                if self.model.updateFeedbackState == .checking {
                    ProgressView()
                        .controlSize(.small)
                } else if let systemSymbolName = self.model.updateFeedbackState.systemSymbolName {
                    Image(systemName: systemSymbolName)
                        .font(.callout)
                        .foregroundStyle(
                            Color(
                                nsColor: self.model.updateFeedbackState
                                    .tintColor
                            )
                        )
                }
            }
            .buttonStyle(.plain)
            .disabled(self.model.isBusy)
            .accessibilityLabel(
                self.model.updateFeedbackState.accessibilityLabel
            )
            .accessibilityIdentifier("check-for-updates")
            .help("Reload Components")
        }
        .frame(maxWidth: .infinity)
    }
}

private struct LauncherComponentUpdateStatus: View {
    let model: LauncherSettingsModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let updateStatus = self.model.updateStatus {
                Text(updateStatus)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            switch self.model.updateProgress {
            case .hidden:
                EmptyView()
            case .indeterminate:
                ProgressView()
                    .controlSize(.small)
            case let .determinate(value, total):
                ProgressView(value: value, total: total)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
