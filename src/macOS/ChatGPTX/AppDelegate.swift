import AppKit
import Darwin

@main
enum ChatGPTXApplication {
    static func main() {
        let application = NSApplication.shared
        let options: LaunchOptions
        do {
            options = try LaunchOptions(
                arguments: Array(CommandLine.arguments.dropFirst())
            )
        } catch {
            FileHandle.standardError.write(
                Data("\(error.localizedDescription)\n".utf8)
            )
            Darwin.exit(EXIT_FAILURE)
        }
        application.setActivationPolicy(
            options.isAPITest ? .prohibited : .regular
        )
        let delegate = AppDelegate(options: options)

        application.delegate = delegate
        application.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private static let automaticUpdateInterval: Duration = .seconds(10 * 60)

    private let options: LaunchOptions
    private var componentUpdateService: ComponentUpdateService?
    private var preparedComponents: PreparedComponentStore?
    private var launchTask: Task<Void, Never>?
    private var updateTask: Task<Void, Never>?
    private var automaticUpdateTask: Task<Void, Never>?
    private var checkForUpdatesAfterLaunch = false
    private var windowController: LauncherWindowController?
    private var systemMenuController: SystemMenuController?
    private var statusMonitor: ChatGPTStatusMonitor?
    private var injectionMonitor: ChatGPTInjectionMonitor?
    private var notificationController: InjectionNotificationController?
    private var checkedAppManagementPermission = false

    init(options: LaunchOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let installedChatGPTVersion: String?
        do {
            let componentStore = try ComponentStore()
            componentUpdateService = ComponentUpdateService(
                componentStore: componentStore
            )
            let applicationURL = options.applicationURL
                ?? ChatGPTLauncher.installedApplicationURL(
                    workspace: .shared
                )
            installedChatGPTVersion = applicationURL.flatMap {
                ChatGPTLauncher.applicationVersion(at: $0)
            }
            preparedComponents = try componentStore.prepare(
                forChatGPTVersion: installedChatGPTVersion
            )
        } catch {
            failStartup(error)
            return
        }

        if options.isAPITest {
            runAPITest()
            return
        }

        installMainMenu()
        let windowController = LauncherWindowController()
        windowController.onOpenChatGPT = { [weak self] forceRestart in
            self?.openChatGPT(forceRestart: forceRestart)
        }
        windowController.onCheckForUpdates = { [weak self] in
            self?.checkForUpdates()
        }
        windowController.onSetLaunchAtLogin = { [weak self] isEnabled in
            self?.setLaunchAtLogin(isEnabled)
        }
        windowController.setLaunchAtLogin(LaunchAtLoginService.isEnabled)
        self.windowController = windowController

        let systemMenuController = SystemMenuController(
            onOpenChatGPT: { [weak self] forceRestart in
                self?.openChatGPT(forceRestart: forceRestart)
            },
            onShowSettings: { [weak self] in
                self?.showLauncher()
            }
        )
        self.systemMenuController = systemMenuController

        let statusMonitor = ChatGPTStatusMonitor(
            applicationURL: options.applicationURL
        ) { [weak self] snapshot in
            self?.windowController?.showStatus(snapshot)
            self?.systemMenuController?.showStatus(snapshot)
        }
        self.statusMonitor = statusMonitor
        statusMonitor.start()

        let notificationController = InjectionNotificationController()
        notificationController.onRestart = { [weak self] in
            self?.openChatGPT(forceRestart: true)
        }
        notificationController.onCheckForUpdates = { [weak self] in
            self?.checkForUpdates()
        }
        self.notificationController = notificationController

        let injectionMonitor = ChatGPTInjectionMonitor(
            expectedBinding: { [weak self] in
                self?.preparedComponents?.versions.binding
            },
            failureHandler: { [weak notificationController] failure in
                notificationController?.notify(failure)
            }
        )
        self.injectionMonitor = injectionMonitor
        injectionMonitor.start()
        if let preparedComponents,
            let installedChatGPTVersion,
            preparedComponents.bundledComponentsChanged,
            preparedComponents.versions.binding.chatgpt
                == installedChatGPTVersion
        {
            showComponentsInstalled { [weak self] restarted in
                self?.startAutomaticUpdates(checkImmediately: !restarted)
            }
        } else {
            startAutomaticUpdates()
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        guard !options.isAPITest else { return }
        windowController?.setLaunchAtLogin(LaunchAtLoginService.isEnabled)
        if !checkedAppManagementPermission {
            checkedAppManagementPermission = true
            guard !AppManagementPermission.requestIfNeeded() else {
                return
            }
        }
        windowController?.showWindow(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        automaticUpdateTask?.cancel()
        automaticUpdateTask = nil
        statusMonitor?.stop()
        injectionMonitor?.stop()
    }

    func applicationShouldHandleReopen(
        _ sender: NSApplication,
        hasVisibleWindows flag: Bool
    ) -> Bool {
        if !flag {
            windowController?.showWindow(nil)
        }
        return true
    }

    private func showLauncher() {
        NSApplication.shared.activate()
        windowController?.showWindow(nil)
    }

    private func setLaunchAtLogin(_ isEnabled: Bool) {
        do {
            try LaunchAtLoginService.setEnabled(isEnabled)
            windowController?.setLaunchAtLogin(
                LaunchAtLoginService.isEnabled
            )
        } catch {
            windowController?.setLaunchAtLogin(
                LaunchAtLoginService.isEnabled
            )
            showLaunchAtLoginError(error)
        }
    }

    private func runAPITest() {
        guard let preparedComponents else {
            failStartup(ComponentStoreUnavailable())
            return
        }
        launchTask = Task {
            do {
                try await ChatGPTLauncher(
                    componentStore: preparedComponents
                ).launch(
                    mode: .apiTest,
                    arguments: options.chatGPTArguments,
                    localExtensionURLs: options.extensionURLs,
                    applicationURL: options.applicationURL
                )
                NSApplication.shared.terminate(nil)
            } catch {
                FileHandle.standardError.write(
                    Data("\(error.localizedDescription)\n".utf8)
                )
                Darwin.exit(EXIT_FAILURE)
            }
        }
    }

    private func openChatGPT(forceRestart: Bool = false) {
        guard launchTask == nil, updateTask == nil else { return }
        guard let preparedComponents else {
            failStartup(ComponentStoreUnavailable())
            return
        }
        windowController?.setLaunching(true)
        systemMenuController?.setLaunching(true)

        launchTask = Task { [weak self] in
            guard let self else { return }
            defer {
                launchTask = nil
                windowController?.setLaunching(false)
                systemMenuController?.setLaunching(false)
                statusMonitor?.refresh()
                if checkForUpdatesAfterLaunch {
                    checkForUpdatesAfterLaunch = false
                    checkForUpdates()
                }
            }

            do {
                try await ChatGPTLauncher(
                    componentStore: preparedComponents
                ).launch(
                    mode: .normal,
                    localExtensionURLs: options.extensionURLs,
                    forceRestart: forceRestart,
                    applicationURL: options.applicationURL
                )
            } catch {
                showLaunchError(error)
            }
        }
    }

    private func checkForUpdates() {
        guard updateTask == nil, launchTask == nil else { return }
        guard let componentUpdateService else {
            failStartup(ComponentStoreUnavailable())
            return
        }

        windowController?.setCheckingForUpdates(true)
        systemMenuController?.setCheckingForUpdates(true)
        updateTask = Task { [weak self] in
            guard let self else { return }
            defer {
                updateTask = nil
                windowController?.setCheckingForUpdates(false)
                systemMenuController?.setCheckingForUpdates(false)
            }

            do {
                let workspace = NSWorkspace.shared
                guard let applicationURL = options.applicationURL
                    ?? ChatGPTLauncher.installedApplicationURL(
                        workspace: workspace
                    ),
                    let chatgptVersion =
                        ChatGPTLauncher.applicationVersion(
                            at: applicationURL
                        )
                else {
                    throw UpdateUIError.chatGPTNotInstalled
                }
                let outcome = try await componentUpdateService.update(
                    for: chatgptVersion,
                    planned: { [weak self] plan in
                        self?.windowController?.showUpdateSummary(plan.summary)
                    },
                    progress: { [weak self] progress in
                        self?.windowController?.showUpdateProgress(progress)
                    }
                )
                let plan = outcome.plan
                let result = outcome.result
                preparedComponents = result.preparedStore
                windowController?.showUpdateSummary(
                    plan.summary(installed: result.preparedStore.versions)
                )
                let installed: Bool
                switch result {
                case .upToDate:
                    installed = false
                case .installed:
                    installed = true
                }
                let restartRequired =
                    installed && !ChatGPTRuntime.runningApplications.isEmpty
                windowController?.showUpdateCompletion(
                    installed: installed,
                    restartRequired: restartRequired
                )
                showUpdateResult(result)
            } catch {
                windowController?.showUpdateFailure(error)
            }
        }
    }

    private func startAutomaticUpdates(checkImmediately: Bool = true) {
        if checkImmediately {
            checkForUpdates()
        }
        automaticUpdateTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(
                        for: Self.automaticUpdateInterval
                    )
                } catch {
                    return
                }
                guard let self else { return }
                checkForUpdates()
            }
        }
    }

    private func showUpdateResult(_ result: ComponentUpdateResult) {
        guard case .installed = result else { return }
        showComponentsInstalled()
    }

    private func showComponentsInstalled(
        completion: @escaping (Bool) -> Void = { _ in }
    ) {
        guard !ChatGPTRuntime.runningApplications.isEmpty else {
            completion(false)
            return
        }
        let alert = NSAlert()
        alert.messageText = "Components Installed"
        alert.informativeText = "Restart ChatGPT to activate the updates."
        alert.addButton(withTitle: "Restart ChatGPT")
        alert.addButton(withTitle: "Later")

        let handleResponse: (NSApplication.ModalResponse) -> Void = {
            [weak self] response in
            let restarted = response == .alertFirstButtonReturn
            if restarted {
                self?.checkForUpdatesAfterLaunch = true
                self?.openChatGPT(forceRestart: true)
            }
            completion(restarted)
        }
        guard let window = windowController?.window else {
            handleResponse(alert.runModal())
            return
        }
        alert.beginSheetModal(for: window, completionHandler: handleResponse)
    }

    private func showLaunchError(_ error: any Error) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "ChatGPTX couldn’t launch ChatGPT"
        alert.informativeText = error.localizedDescription
        alert.addButton(withTitle: "OK")

        NSApplication.shared.activate(ignoringOtherApps: true)
        if let window = windowController?.window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }

    private func showLaunchAtLoginError(_ error: any Error) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Couldn’t Update Launch at Login"
        alert.informativeText = error.localizedDescription
        alert.addButton(withTitle: "OK")

        if let window = windowController?.window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }

    private func failStartup(_ error: any Error) {
        if options.isAPITest {
            FileHandle.standardError.write(
                Data("\(error.localizedDescription)\n".utf8)
            )
            Darwin.exit(EXIT_FAILURE)
        }

        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "ChatGPTX couldn’t prepare its components"
        alert.informativeText = error.localizedDescription
        alert.addButton(withTitle: "Quit")
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }

    private func installMainMenu() {
        let mainMenu = NSMenu()

        let applicationItem = NSMenuItem()
        mainMenu.addItem(applicationItem)
        let applicationMenu = NSMenu(title: "ChatGPTX")
        applicationItem.submenu = applicationMenu
        applicationMenu.addItem(
            withTitle: "About ChatGPTX",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(
            withTitle: "Hide ChatGPTX",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )
        applicationMenu.addItem(
            withTitle: "Quit ChatGPTX",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )

        let windowItem = NSMenuItem()
        mainMenu.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window")
        windowItem.submenu = windowMenu
        windowMenu.addItem(
            withTitle: "Minimize",
            action: #selector(NSWindow.performMiniaturize(_:)),
            keyEquivalent: "m"
        )
        windowMenu.addItem(
            withTitle: "Bring All to Front",
            action: #selector(NSApplication.arrangeInFront(_:)),
            keyEquivalent: ""
        )
        NSApplication.shared.windowsMenu = windowMenu
        NSApplication.shared.mainMenu = mainMenu
    }
}

private struct ComponentStoreUnavailable: LocalizedError {
    var errorDescription: String? {
        "The component store is unavailable."
    }
}

private enum UpdateUIError: LocalizedError {
    case chatGPTNotInstalled

    var errorDescription: String? {
        "ChatGPT.app is not installed."
    }
}
