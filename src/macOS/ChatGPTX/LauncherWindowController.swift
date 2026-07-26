import AppKit
import SnapKit

private let componentScrollerInset = NSScroller.scrollerWidth(
    for: .regular,
    scrollerStyle: .overlay
)

final class LauncherWindowController: NSWindowController {
    private let launcherViewController: LauncherViewController

    var onOpenChatGPT: ((Bool) -> Void)? {
        get { launcherViewController.onOpenChatGPT }
        set { launcherViewController.onOpenChatGPT = newValue }
    }
    var onCheckForUpdates: (() -> Void)? {
        get { launcherViewController.onCheckForUpdates }
        set { launcherViewController.onCheckForUpdates = newValue }
    }

    init(applicationURL: URL?) {
        launcherViewController = LauncherViewController(
            applicationURL: applicationURL
        )

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 390),
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

    func setCheckingForUpdates(_ isChecking: Bool) {
        launcherViewController.setCheckingForUpdates(isChecking)
    }

    func showUpdateSummary(_ summary: ComponentUpdateSummary) {
        launcherViewController.showUpdateSummary(summary)
    }

    func showUpdateProgress(_ progress: ComponentUpdateProgress) {
        launcherViewController.showUpdateProgress(progress)
    }

    func showUpdateCompletion(
        installed: Bool,
        restartRequired: Bool
    ) {
        launcherViewController.showUpdateCompletion(
            installed: installed,
            restartRequired: restartRequired
        )
    }

    func showUpdateFailure(_ error: any Error) {
        launcherViewController.showUpdateFailure(error)
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.makeKeyAndOrderFront(sender)
    }
}

private final class LauncherViewController: NSViewController {
    var onOpenChatGPT: ((Bool) -> Void)?
    var onCheckForUpdates: (() -> Void)?

    private let configuredApplicationURL: URL?
    private let appNameLabel = NSTextField(labelWithString: "ChatGPT")
    private let appVersionLabel = NSTextField(labelWithString: "")
    private let runtimeWarningLabel = NSTextField(labelWithString: "")
    private let revealButton = NSButton()
    private let revealGlassView = NSGlassEffectView()
    private let updateButton = NSButton()
    private let updateGlassView = NSGlassEffectView()
    private let updateSpinner = NSProgressIndicator()
    private let openButton = NSButton()
    private let componentsTableView = NSTableView()
    private let componentsScrollView = NSScrollView()
    private let updateStateStack = NSStackView()
    private let updateStatusLabel = NSTextField(labelWithString: "")
    private let progressIndicator = NSProgressIndicator()
    private var componentItems: [ComponentUpdateItem] = []
    private var currentApplicationURL: URL?
    private var statusMonitor: ChatGPTStatusMonitor?
    private var updateStatusDismissalTask: Task<Void, Never>?
    private var runtimeStatus = ChatGPTRuntimeStatus.notRunning
    private var isLaunching = false
    private var isCheckingForUpdates = false

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

        let appTitleStack = NSStackView(
            views: [appNameLabel, appVersionLabel]
        )
        appTitleStack.orientation = .horizontal
        appTitleStack.alignment = .firstBaseline
        appTitleStack.spacing = 8

        let appInfoStack = NSStackView(
            views: [appTitleStack, runtimeWarningLabel]
        )
        appInfoStack.orientation = .vertical
        appInfoStack.alignment = .leading
        appInfoStack.spacing = 4

        let appRow = NSView()
        appRow.addSubview(appInfoStack)
        appRow.addSubview(updateGlassView)
        appRow.addSubview(updateSpinner)
        appRow.addSubview(revealGlassView)
        appInfoStack.snp.makeConstraints { make in
            make.leading.centerY.equalToSuperview()
            make.trailing.lessThanOrEqualTo(updateGlassView.snp.leading)
                .offset(-16)
        }
        revealGlassView.snp.makeConstraints { make in
            make.trailing.centerY.equalToSuperview()
            make.size.equalTo(28)
        }
        updateGlassView.snp.makeConstraints { make in
            make.trailing.equalTo(revealGlassView.snp.leading).offset(-8)
            make.centerY.equalToSuperview()
            make.size.equalTo(28)
        }
        updateSpinner.snp.makeConstraints { make in
            make.center.equalTo(updateGlassView)
            make.size.equalTo(16)
        }
        appRow.snp.makeConstraints { make in
            make.height.equalTo(32)
        }

        let separator = NSBox()
        separator.boxType = .separator
        separator.snp.makeConstraints { make in
            make.height.equalTo(1)
        }

        let componentsTitleLabel = NSTextField(
            labelWithString: "Components"
        )
        componentsTitleLabel.font = .systemFont(
            ofSize: 13,
            weight: .semibold
        )
        let latestLabel = NSTextField(labelWithString: "Latest")
        latestLabel.font = .systemFont(ofSize: 11)
        latestLabel.textColor = .secondaryLabelColor

        let componentsHeader = NSView()
        componentsHeader.addSubview(componentsTitleLabel)
        componentsHeader.addSubview(latestLabel)
        componentsTitleLabel.snp.makeConstraints { make in
            make.leading.centerY.equalToSuperview()
        }
        latestLabel.snp.makeConstraints { make in
            make.trailing.equalToSuperview().inset(componentScrollerInset)
            make.centerY.equalToSuperview()
        }
        componentsHeader.snp.makeConstraints { make in
            make.height.equalTo(18)
        }

        let componentsContainer = NSView()
        componentsContainer.addSubview(componentsScrollView)
        componentsScrollView.snp.makeConstraints { make in
            make.edges.equalToSuperview()
        }
        componentsContainer.snp.makeConstraints { make in
            make.height.equalTo(174)
        }

        updateStateStack.addArrangedSubview(updateStatusLabel)
        updateStateStack.addArrangedSubview(progressIndicator)
        updateStateStack.orientation = .vertical
        updateStateStack.alignment = .leading
        updateStateStack.spacing = 7
        updateStateStack.isHidden = true
        progressIndicator.snp.makeConstraints { make in
            make.width.equalToSuperview()
        }

        let actionsRow = NSView()
        actionsRow.addSubview(openButton)
        openButton.snp.makeConstraints { make in
            make.leading.centerY.equalToSuperview()
        }
        actionsRow.snp.makeConstraints { make in
            make.height.equalTo(24)
        }

        let flexibleSpacer = NSView()
        flexibleSpacer.setContentHuggingPriority(
            .init(rawValue: 1),
            for: .vertical
        )
        flexibleSpacer.setContentCompressionResistancePriority(
            .init(rawValue: 1),
            for: .vertical
        )

        let contentStack = NSStackView(
            views: [
                appRow,
                separator,
                componentsHeader,
                componentsContainer,
                updateStateStack,
                flexibleSpacer,
                actionsRow,
            ]
        )
        contentStack.orientation = .vertical
        contentStack.alignment = .leading
        contentStack.spacing = 14
        contentStack.setCustomSpacing(10, after: appRow)
        contentStack.setCustomSpacing(12, after: componentsHeader)
        contentStack.setCustomSpacing(18, after: updateStateStack)
        backgroundView.addSubview(contentStack)
        contentStack.snp.makeConstraints { make in
            make.leading.trailing.equalToSuperview().inset(28)
            make.top.equalTo(backgroundView.safeAreaLayoutGuide.snp.top)
                .offset(8)
            make.bottom.equalToSuperview().inset(24)
        }
        for arrangedView in contentStack.arrangedSubviews {
            arrangedView.snp.makeConstraints { make in
                make.width.equalTo(contentStack)
            }
        }
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        view.window?.initialFirstResponder = openButton
        openButton.nextKeyView = updateButton
        updateButton.nextKeyView = revealButton
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
        self.isLaunching = isLaunching
        updateOpenButton()
        updateActionAvailability()
    }

    func refreshStatus() {
        statusMonitor?.refresh()
    }

    func setCheckingForUpdates(_ isChecking: Bool) {
        isCheckingForUpdates = isChecking
        updateGlassView.isHidden = isChecking
        updateSpinner.isHidden = !isChecking
        if isChecking {
            updateSpinner.startAnimation(nil)
        } else {
            updateSpinner.stopAnimation(nil)
        }
        updateActionAvailability()
        guard isChecking else { return }
        updateStatusDismissalTask?.cancel()
        hideUpdateState()
    }

    func showUpdateSummary(_ summary: ComponentUpdateSummary) {
        componentItems = summary.items
        componentsTableView.reloadData()
    }

    func showUpdateProgress(_ progress: ComponentUpdateProgress) {
        updateStatusDismissalTask?.cancel()
        switch progress {
        case let .downloading(
            _,
            name,
            receivedBytes,
            totalBytes
        ):
            let received = ByteCountFormatter.string(
                fromByteCount: receivedBytes,
                countStyle: .file
            )
            if let totalBytes {
                let total = ByteCountFormatter.string(
                    fromByteCount: totalBytes,
                    countStyle: .file
                )
                showUpdateStatus(
                    "Downloading \(name) · \(received) of \(total)"
                )
                progressIndicator.isIndeterminate = false
                progressIndicator.minValue = 0
                progressIndicator.maxValue = Double(totalBytes)
                progressIndicator.doubleValue = Double(receivedBytes)
                progressIndicator.stopAnimation(nil)
            } else {
                showUpdateStatus("Downloading \(name) · \(received)")
                showIndeterminateProgress()
            }
        case let .verifying(_, name):
            showUpdateStatus("Verifying \(name)…")
            showIndeterminateProgress()
        case let .installing(_, name):
            showUpdateStatus("Installing \(name)…")
            showIndeterminateProgress()
        }
    }

    func showUpdateCompletion(
        installed: Bool,
        restartRequired: Bool
    ) {
        hideProgress()
        if !installed {
            hideUpdateState()
        } else if restartRequired {
            showUpdateStatus("Restart ChatGPT to activate updates.")
        } else {
            showUpdateStatus("Updated")
            updateStatusDismissalTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                self?.hideUpdateState()
            }
        }
    }

    func showUpdateFailure(_ error: any Error) {
        updateStatusDismissalTask?.cancel()
        hideProgress()
        showUpdateStatus(
            "Update failed: \(error.localizedDescription)"
        )
    }

    private func configureControls() {
        let actionSymbolConfiguration = NSImage.SymbolConfiguration(
            pointSize: 18,
            weight: .regular
        )

        appNameLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        appVersionLabel.font = .monospacedDigitSystemFont(
            ofSize: 12,
            weight: .regular
        )
        appVersionLabel.textColor = .secondaryLabelColor
        appVersionLabel.setAccessibilityIdentifier("chatgpt-version")

        runtimeWarningLabel.font = .systemFont(ofSize: 11)
        runtimeWarningLabel.textColor = .systemOrange
        runtimeWarningLabel.isHidden = true
        runtimeWarningLabel.setAccessibilityIdentifier(
            "chatgpt-runtime-warning"
        )

        let revealImage = NSImage(
            systemSymbolName: "magnifyingglass.circle.fill",
            accessibilityDescription: "Show ChatGPT in Finder"
        )?.withSymbolConfiguration(actionSymbolConfiguration)
        revealImage?.isTemplate = true
        revealButton.image = revealImage
        revealButton.imagePosition = .imageOnly
        revealButton.imageScaling = .scaleProportionallyDown
        revealButton.isBordered = false
        revealButton.contentTintColor = .secondaryLabelColor
        revealButton.controlSize = .small
        revealButton.focusRingType = .none
        revealButton.target = self
        revealButton.action = #selector(revealChatGPT)
        revealButton.setAccessibilityIdentifier("reveal-chatgpt")
        revealGlassView.contentView = revealButton
        revealGlassView.cornerRadius = 14
        revealButton.snp.makeConstraints { make in
            make.edges.equalToSuperview()
        }

        let updateImage = NSImage(
            systemSymbolName: "arrow.clockwise",
            accessibilityDescription: "Check for Updates"
        )?.withSymbolConfiguration(actionSymbolConfiguration)
        updateImage?.isTemplate = true
        updateButton.image = updateImage
        updateButton.imagePosition = .imageOnly
        updateButton.imageScaling = .scaleProportionallyDown
        updateButton.isBordered = false
        updateButton.contentTintColor = .alternateSelectedControlTextColor
        updateButton.controlSize = .small
        updateButton.focusRingType = .none
        updateButton.toolTip = "Check for Updates"
        updateButton.target = self
        updateButton.action = #selector(checkForUpdates)
        updateButton.setAccessibilityIdentifier("check-for-updates")
        updateGlassView.contentView = updateButton
        updateGlassView.cornerRadius = 14
        updateGlassView.tintColor = .controlAccentColor
        updateButton.snp.makeConstraints { make in
            make.edges.equalToSuperview()
        }

        updateSpinner.style = .spinning
        updateSpinner.controlSize = .small
        updateSpinner.isHidden = true
        updateSpinner.setAccessibilityLabel("Checking for updates")
        updateSpinner.setAccessibilityIdentifier("checking-for-updates")

        openButton.title = "Open ChatGPT"
        openButton.bezelStyle = .glass
        openButton.tintProminence = .primary
        openButton.controlSize = .small
        openButton.focusRingType = .none
        openButton.keyEquivalent = "\r"
        openButton.target = self
        openButton.action = #selector(openChatGPT)
        openButton.setAccessibilityIdentifier("open-chatgpt")

        let tableColumn = NSTableColumn(identifier: .component)
        componentsTableView.addTableColumn(tableColumn)
        componentsTableView.headerView = nil
        componentsTableView.style = .plain
        componentsTableView.backgroundColor = .clear
        componentsTableView.selectionHighlightStyle = .none
        componentsTableView.rowHeight = 42
        componentsTableView.intercellSpacing = NSSize(width: 0, height: 2)
        componentsTableView.columnAutoresizingStyle =
            .lastColumnOnlyAutoresizingStyle
        tableColumn.resizingMask = .autoresizingMask
        componentsTableView.dataSource = self
        componentsTableView.delegate = self

        componentsScrollView.documentView = componentsTableView
        componentsScrollView.drawsBackground = false
        componentsScrollView.borderType = .noBorder
        componentsScrollView.hasVerticalScroller = true
        componentsScrollView.autohidesScrollers = true

        updateStatusLabel.font = .systemFont(ofSize: 11)
        updateStatusLabel.textColor = .secondaryLabelColor
        updateStatusLabel.lineBreakMode = .byTruncatingTail
        updateStatusLabel.isHidden = true
        progressIndicator.style = .bar
        progressIndicator.controlSize = .small
        progressIndicator.isHidden = true
    }

    private func apply(_ snapshot: ChatGPTStatusSnapshot) {
        currentApplicationURL = snapshot.applicationURL
        runtimeStatus = snapshot.runtimeStatus
        appVersionLabel.stringValue =
            snapshot.applicationVersion ?? "Not installed"
        revealButton.isEnabled = snapshot.applicationURL != nil
        revealButton.toolTip = snapshot.applicationURL?.path
        runtimeWarningLabel.stringValue = "Extensions unavailable"
        runtimeWarningLabel.isHidden =
            snapshot.runtimeStatus != .extensionsUnavailable
        updateOpenButton()
        updateActionAvailability()
    }

    private func updateActionAvailability() {
        let enabled = !isLaunching && !isCheckingForUpdates
        updateButton.isEnabled = enabled
        openButton.isEnabled = enabled && currentApplicationURL != nil
    }

    private func updateOpenButton() {
        if isLaunching {
            openButton.title = "Opening…"
            return
        }

        switch runtimeStatus {
        case .notRunning:
            openButton.title = "Open ChatGPT"
        case .running:
            openButton.title = "Show ChatGPT"
        case .extensionsUnavailable:
            openButton.title = "Restart ChatGPT"
        }
    }

    private func showIndeterminateProgress() {
        updateStateStack.isHidden = false
        progressIndicator.isHidden = false
        progressIndicator.isIndeterminate = true
        progressIndicator.startAnimation(nil)
    }

    private func hideProgress() {
        progressIndicator.stopAnimation(nil)
        progressIndicator.isHidden = true
    }

    private func showUpdateStatus(_ status: String) {
        updateStatusLabel.stringValue = status
        updateStatusLabel.isHidden = false
        updateStateStack.isHidden = false
    }

    private func hideUpdateState() {
        updateStatusLabel.stringValue = ""
        updateStatusLabel.isHidden = true
        updateStateStack.isHidden = true
    }

    @objc
    private func revealChatGPT() {
        guard let currentApplicationURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([currentApplicationURL])
    }

    @objc
    private func openChatGPT() {
        onOpenChatGPT?(runtimeStatus == .extensionsUnavailable)
    }

    @objc
    private func checkForUpdates() {
        onCheckForUpdates?()
    }
}

extension LauncherViewController: NSTableViewDataSource, NSTableViewDelegate {
    func numberOfRows(in _: NSTableView) -> Int {
        componentItems.count
    }

    func tableView(
        _ tableView: NSTableView,
        viewFor _: NSTableColumn?,
        row: Int
    ) -> NSView? {
        let cell =
            tableView.makeView(
                withIdentifier: .component,
                owner: self
            ) as? ComponentRowView
            ?? ComponentRowView()
        cell.identifier = .component
        cell.configure(with: componentItems[row])
        return cell
    }
}

private final class ComponentRowView: NSTableCellView {
    private let nameLabel = NSTextField(labelWithString: "")
    private let latestVersionLabel = NSTextField(labelWithString: "")
    private let localVersionLabel = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)

        nameLabel.font = .systemFont(ofSize: 13)
        nameLabel.lineBreakMode = .byTruncatingTail
        latestVersionLabel.font = .monospacedDigitSystemFont(
            ofSize: 12,
            weight: .medium
        )
        latestVersionLabel.alignment = .right
        localVersionLabel.font = .systemFont(ofSize: 10)
        localVersionLabel.textColor = .secondaryLabelColor
        localVersionLabel.alignment = .right

        let versionStack = NSStackView(
            views: [latestVersionLabel, localVersionLabel]
        )
        versionStack.orientation = .vertical
        versionStack.alignment = .trailing
        versionStack.spacing = 2

        addSubview(nameLabel)
        addSubview(versionStack)
        nameLabel.snp.makeConstraints { make in
            make.leading.centerY.equalToSuperview()
            make.trailing.lessThanOrEqualTo(versionStack.snp.leading)
                .offset(-16)
        }
        versionStack.snp.makeConstraints { make in
            make.trailing.equalToSuperview().inset(componentScrollerInset)
            make.centerY.equalToSuperview()
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is unavailable")
    }

    func configure(with item: ComponentUpdateItem) {
        nameLabel.stringValue = item.name
        latestVersionLabel.stringValue = item.latestVersion
        switch item.localVersion {
        case .current:
            localVersionLabel.isHidden = true
        case let .different(version):
            localVersionLabel.stringValue = "Installed \(version)"
            localVersionLabel.isHidden = false
        case .missing:
            localVersionLabel.stringValue = "Not installed"
            localVersionLabel.isHidden = false
        }
        setAccessibilityLabel(
            "\(item.name), latest \(item.latestVersion)"
        )
    }
}

private extension NSUserInterfaceItemIdentifier {
    static let component = Self("component")
}
