import AppKit
import SwiftUI

struct LauncherSettingsRowLabel: View {
    let title: String
    let subtitle: String?
    let warning: Bool

    init(
        _ title: String,
        subtitle: String? = nil,
        warning: Bool = false
    ) {
        self.title = title
        self.subtitle = subtitle
        self.warning = warning
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(self.title)
            if let subtitle = self.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(self.warning ? .orange : .secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct LauncherCenteredLabeledContentStyle: LabeledContentStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .center, spacing: 16) {
            configuration.label
            Spacer(minLength: 16)
            configuration.content
        }
    }
}

struct LauncherSidebarMaterial: NSViewRepresentable {
    func makeNSView(context _: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        configure(view)
        return view
    }

    func updateNSView(
        _ nsView: NSVisualEffectView,
        context _: Context
    ) {
        configure(nsView)
    }

    private func configure(_ view: NSVisualEffectView) {
        view.material = .sidebar
        view.blendingMode = .behindWindow
        view.state = .followsWindowActiveState
    }
}

struct LauncherWindowAppearanceBridge: NSViewRepresentable {
    let title: String

    func makeNSView(context _: Context) -> LauncherWindowBridgeView {
        let view = LauncherWindowBridgeView()
        view.title = title
        return view
    }

    func updateNSView(
        _ nsView: LauncherWindowBridgeView,
        context _: Context
    ) {
        nsView.title = title
        nsView.applyWindowTitle()
    }
}

final class LauncherWindowBridgeView: NSView {
    var title = "ChatGPTX"

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        applyWindowTitle()
    }

    func applyWindowTitle() {
        window?.title = title
    }
}
