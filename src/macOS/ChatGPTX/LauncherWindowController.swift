import AppKit

final class LauncherWindowController: NSWindowController {
    private let launcherViewController: LauncherViewController

    var onOpenChatGPT: (() -> Void)? {
        get { launcherViewController.onOpenChatGPT }
        set { launcherViewController.onOpenChatGPT = newValue }
    }

    init(applicationURL: URL?) {
        launcherViewController = LauncherViewController(
            applicationURL: applicationURL
        )

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 220),
            styleMask: [
                .titled,
                .closable,
                .miniaturizable,
                .fullSizeContentView,
            ],
            backing: .buffered,
            defer: false
        )
        window.title = "ChatGPTX"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.contentViewController = launcherViewController
        window.center()

        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is unavailable")
    }

    func setLaunching(_ isLaunching: Bool) {
        launcherViewController.setLaunching(isLaunching)
    }

    func refreshStatus() {
        launcherViewController.refreshStatus()
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.makeKeyAndOrderFront(sender)
    }
}

private final class LauncherViewController: NSViewController {
    var onOpenChatGPT: (() -> Void)?

    private let configuredApplicationURL: URL?
    private let statusDotView = NSImageView()
    private let statusLabel = NSTextField(labelWithString: "Not Running")
    private let revealButton = NSButton()
    private let openButton = NSButton()
    private var currentApplicationURL: URL?
    private var statusMonitor: ChatGPTStatusMonitor?

    init(applicationURL: URL?) {
        configuredApplicationURL = applicationURL
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is unavailable")
    }

    override func loadView() {
        let backgroundView = NSVisualEffectView()
        backgroundView.material = .underWindowBackground
        backgroundView.blendingMode = .behindWindow
        backgroundView.state = .followsWindowActiveState
        view = backgroundView

        configureControls()

        let statusStack = NSStackView(views: [statusDotView, statusLabel])
        statusStack.orientation = .horizontal
        statusStack.alignment = .centerY
        statusStack.spacing = 6

        let spacer = NSView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spacer.setContentCompressionResistancePriority(
            .defaultLow,
            for: .horizontal
        )

        let appRow = NSStackView(views: [statusStack, spacer, revealButton])
        appRow.orientation = .horizontal
        appRow.alignment = .centerY
        appRow.spacing = 12

        let contentStack = NSStackView(views: [appRow, openButton])
        contentStack.orientation = .vertical
        contentStack.alignment = .leading
        contentStack.spacing = 28
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        backgroundView.addSubview(contentStack)

        NSLayoutConstraint.activate([
            contentStack.leadingAnchor.constraint(
                equalTo: backgroundView.leadingAnchor,
                constant: 28
            ),
            contentStack.trailingAnchor.constraint(
                equalTo: backgroundView.trailingAnchor,
                constant: -28
            ),
            contentStack.topAnchor.constraint(
                equalTo: backgroundView.safeAreaLayoutGuide.topAnchor,
                constant: 22
            ),
            contentStack.bottomAnchor.constraint(
                equalTo: backgroundView.bottomAnchor,
                constant: -28
            ),
            appRow.widthAnchor.constraint(equalTo: contentStack.widthAnchor),
            statusDotView.widthAnchor.constraint(equalToConstant: 8),
            statusDotView.heightAnchor.constraint(equalToConstant: 8),
            revealButton.widthAnchor.constraint(equalToConstant: 28),
            revealButton.heightAnchor.constraint(equalToConstant: 28),
        ])
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        view.window?.initialFirstResponder = openButton
        openButton.nextKeyView = revealButton
        revealButton.nextKeyView = openButton

        guard statusMonitor == nil else { return }

        let monitor = ChatGPTStatusMonitor(
            applicationURL: configuredApplicationURL
        ) { [weak self] snapshot in
            self?.apply(snapshot)
        }
        statusMonitor = monitor
        monitor.start()
    }

    func setLaunching(_ isLaunching: Bool) {
        openButton.isEnabled = !isLaunching
        openButton.title = isLaunching ? "Opening…" : "Open ChatGPT"
    }

    func refreshStatus() {
        statusMonitor?.refresh()
    }

    private func configureControls() {
        statusDotView.image = NSImage(
            systemSymbolName: "circle.fill",
            accessibilityDescription: nil
        )
        statusDotView.contentTintColor = .tertiaryLabelColor

        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.setAccessibilityIdentifier("chatgpt-status")

        revealButton.image = NSImage(
            systemSymbolName: "arrow.up.right.circle.fill",
            accessibilityDescription: "Show ChatGPT in Finder"
        )?.withSymbolConfiguration(
            NSImage.SymbolConfiguration(pointSize: 18, weight: .regular)
        )
        revealButton.imagePosition = .imageOnly
        revealButton.isBordered = false
        revealButton.contentTintColor = .secondaryLabelColor
        revealButton.focusRingType = .none
        revealButton.target = self
        revealButton.action = #selector(revealChatGPT)
        revealButton.setAccessibilityIdentifier("reveal-chatgpt")

        openButton.title = "Open ChatGPT"
        openButton.bezelStyle = .glass
        openButton.tintProminence = .primary
        openButton.controlSize = .small
        openButton.focusRingType = .none
        openButton.keyEquivalent = "\r"
        openButton.target = self
        openButton.action = #selector(openChatGPT)
        openButton.setAccessibilityIdentifier("open-chatgpt")
    }

    private func apply(_ snapshot: ChatGPTStatusSnapshot) {
        currentApplicationURL = snapshot.applicationURL
        revealButton.isEnabled = snapshot.applicationURL != nil
        revealButton.toolTip = snapshot.applicationURL?.path

        switch snapshot.runtimeStatus {
        case .notRunning:
            statusLabel.stringValue = "Not Running"
            statusDotView.contentTintColor = .tertiaryLabelColor
        case .running(extensionsEnabled: true):
            statusLabel.stringValue = "Running"
            statusDotView.contentTintColor = .systemGreen
        case .running(extensionsEnabled: false):
            statusLabel.stringValue = "Running · Extensions Disabled"
            statusDotView.contentTintColor = .systemOrange
        }
    }

    @objc
    private func revealChatGPT() {
        guard let currentApplicationURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([currentApplicationURL])
    }

    @objc
    private func openChatGPT() {
        onOpenChatGPT?()
    }
}
