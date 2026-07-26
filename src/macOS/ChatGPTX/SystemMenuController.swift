import AppKit

final class SystemMenuController: NSObject, NSMenuDelegate {
    private let statusItem: NSStatusItem
    private let openChatGPTItem = NSMenuItem()
    private let onOpenChatGPT: (Bool) -> Void
    private let onShowSettings: () -> Void
    private var runtimeStatus = ChatGPTRuntimeStatus.notRunning
    private var applicationIsInstalled = false
    private var isLaunching = false
    private var isCheckingForUpdates = false

    init(
        onOpenChatGPT: @escaping (Bool) -> Void,
        onShowSettings: @escaping () -> Void
    ) {
        statusItem = NSStatusBar.system.statusItem(
            withLength: NSStatusItem.squareLength
        )
        self.onOpenChatGPT = onOpenChatGPT
        self.onShowSettings = onShowSettings
        super.init()
        configureStatusItem()
    }

    func showStatus(_ snapshot: ChatGPTStatusSnapshot) {
        runtimeStatus = snapshot.runtimeStatus
        applicationIsInstalled = snapshot.applicationURL != nil
        updateOpenChatGPTItem()
    }

    func setLaunching(_ isLaunching: Bool) {
        self.isLaunching = isLaunching
        updateOpenChatGPTItem()
    }

    func setCheckingForUpdates(_ isCheckingForUpdates: Bool) {
        self.isCheckingForUpdates = isCheckingForUpdates
        updateOpenChatGPTItem()
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        updateOpenChatGPTItem()
    }

    private func configureStatusItem() {
        statusItem.autosaveName = "chatgptx"
        guard let button = statusItem.button else {
            preconditionFailure("Unable to create the ChatGPTX status item")
        }
        guard let image = NSImage(named: "MenuBarIcon") else {
            preconditionFailure("ChatGPTX status item image is unavailable")
        }
        image.size = NSSize(width: 18, height: 18)
        image.isTemplate = true
        button.image = image
        button.imagePosition = .imageOnly
        button.imageScaling = .scaleNone
        button.setAccessibilityIdentifier("chatgptx-status-item")
        button.setAccessibilityTitle("ChatGPTX")

        let menu = NSMenu()
        menu.autoenablesItems = false
        menu.delegate = self

        openChatGPTItem.target = self
        openChatGPTItem.action = #selector(openChatGPT)
        menu.addItem(openChatGPTItem)
        menu.addItem(.separator())

        let settingsItem = NSMenuItem(
            title: "Settings…",
            action: #selector(showSettings),
            keyEquivalent: ","
        )
        settingsItem.keyEquivalentModifierMask = [.command]
        settingsItem.target = self
        menu.addItem(settingsItem)

        menu.addItem(.separator())
        let quitItem = NSMenuItem(
            title: "Quit ChatGPTX",
            action: #selector(quit),
            keyEquivalent: "q"
        )
        quitItem.keyEquivalentModifierMask = [.command]
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
        updateOpenChatGPTItem()
    }

    private func updateOpenChatGPTItem() {
        openChatGPTItem.title = isLaunching
            ? "Opening…"
            : runtimeStatus.openAction.title
        openChatGPTItem.isEnabled =
            applicationIsInstalled
            && !isLaunching
            && !isCheckingForUpdates
    }

    @objc
    private func openChatGPT() {
        onOpenChatGPT(runtimeStatus.openAction.forceRestart)
    }

    @objc
    private func showSettings() {
        onShowSettings()
    }

    @objc
    private func quit() {
        NSApplication.shared.terminate(nil)
    }
}
