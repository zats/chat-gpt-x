import AppKit
import Darwin

enum ChatGPTXRuntimeEnvironment {
    static var isUnitTesting: Bool {
        ProcessInfo.processInfo.environment["CHATGPTX_UNIT_TESTING"] == "1"
    }

    static var isXcodePreview: Bool {
        ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
    }
}

@main
enum ChatGPTXApplication {
    static func main() {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if let status = ExtensionTestSessionRecorder.runIfRequested(
            arguments: arguments
        ) {
            Darwin.exit(status)
        }
        if let status = ExtensionTestUIProbe.runIfRequested(
            arguments: arguments
        ) {
            Darwin.exit(status)
        }
        let application = NSApplication.shared
        let options: LaunchOptions
        do {
            options = try LaunchOptions(arguments: arguments)
        } catch {
            FileHandle.standardError.write(
                Data("\(error.localizedDescription)\n".utf8)
            )
            Darwin.exit(EXIT_FAILURE)
        }
        application.setActivationPolicy(
            options.isIsolatedTest
                || ChatGPTXRuntimeEnvironment.isUnitTesting
                || ChatGPTXRuntimeEnvironment.isXcodePreview
                ? .prohibited
                : .regular
        )
        let delegate = AppDelegate(options: options)

        application.delegate = delegate
        application.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private static let automaticUpdateInterval: Duration = .seconds(10 * 60)

    static func automaticRecoveryAllowed(
        launchInProgress: Bool,
        updateInProgress: Bool,
        hasPreparedComponents: Bool
    ) -> Bool {
        !launchInProgress && (hasPreparedComponents || updateInProgress)
    }

    private let options: LaunchOptions
    private var componentStore: ComponentStore?
    private var componentUpdateService: ComponentUpdateService?
    private var applicationUpdateController: ApplicationUpdateController?
    private var applicationUpdateMenuItemController:
        ApplicationUpdateMenuItemController?
    private var preparedComponents: PreparedComponentStore?
    private var launchTask: Task<Void, Never>?
    private var updateTask: Task<Void, Never>?
    private var automaticUpdateTask: Task<Void, Never>?
    private var checkForUpdatesAfterLaunch = false
    private var runtimeSupportCheckPending = false
    private var runtimeReadyNotificationPending = false
    private var windowController: LauncherWindowController?
    private var systemMenuController: SystemMenuController?
    private var launchRecoveryMonitor: ChatGPTLaunchRecoveryMonitor?
    private var statusMonitor: ChatGPTStatusMonitor?
    private var injectionMonitor: ChatGPTInjectionMonitor?
    private var notificationController: InjectionNotificationController?
    private var checkedAppManagementPermission = false
    private var bundledSkillLinkManager: BundledSkillLinkManager?

    init(options: LaunchOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_: Notification) {
        guard !ChatGPTXRuntimeEnvironment.isUnitTesting,
              !ChatGPTXRuntimeEnvironment.isXcodePreview
        else {
            return
        }

        do {
            let componentStore = try ComponentStore()
            self.componentStore = componentStore
            componentUpdateService = ComponentUpdateService(
                componentStore: componentStore,
                beforeActivation: {
                    [weak self] expectedVersion, expectedAsarSHA256 in
                    guard let self else {
                        throw ComponentStoreUnavailable()
                    }
                    try validateChatGPTBuild(
                        expectedVersion: expectedVersion,
                        expectedAsarSHA256: expectedAsarSHA256
                    )
                }
            )
            let applicationURL = options.applicationURL
                ?? ChatGPTLauncher.installedApplicationURL(
                    workspace: .shared
                )
            let installed = try? componentStore.prepareInstalled()
            preparedComponents = nil
            if !options.isIsolatedTest, let applicationURL, let installed {
                Task { [weak self] in
                    guard await ChatGPTLauncher.bindingMatches(
                        applicationURL: applicationURL,
                        binding: installed.versions.binding
                    ), let self,
                    let current = try? componentStore.prepareInstalled(),
                    current.versions == installed.versions,
                    ChatGPTLauncher.cachedBuildMatches(
                        applicationURL: applicationURL,
                        expectedVersion: current.versions.binding.chatgpt,
                        expectedAsarSHA256:
                        current.versions.binding.asarSha256
                    )
                    else {
                        return
                    }
                    preparedComponents = current
                    self.launchRecoveryMonitor?.refreshApprovedApplication()
                }
            }
        } catch {
            failStartup(error)
            return
        }

        if options.isAPITest {
            runIsolatedTest(mode: .apiTest)
            return
        }
        if options.isExtensionTest {
            runIsolatedTest(mode: .extensionTest)
            return
        }

        let applicationUpdateController = ApplicationUpdateController()
        applicationUpdateController.onStateChange = { [weak self] state in
            self?.applicationUpdateMenuItemController?.show(state)
            self?.systemMenuController?.showApplicationUpdateState(state)
        }
        self.applicationUpdateController = applicationUpdateController

        installMainMenu()
        let windowController = LauncherWindowController()
        windowController.onOpenChatGPT = { [weak self] forceRestart in
            self?.openChatGPT(forceRestart: forceRestart)
        }
        windowController.onShowRunningChatGPT = { [weak self] in
            self?.showRunningChatGPT()
        }
        windowController.onCheckForUpdates = { [weak self] in
            self?.checkForUpdates()
        }
        windowController.onSetLaunchAtLogin = { [weak self] isEnabled in
            self?.setLaunchAtLogin(isEnabled)
        }
        let bundledSkillLinkManager = BundledSkillLinkManager()
        self.bundledSkillLinkManager = bundledSkillLinkManager
        windowController.onInstallCodexSkill = { [weak self] in
            self?.installCodexSkill()
        }
        windowController.setLaunchAtLogin(LaunchAtLoginService.isEnabled)
        windowController.showCodexSkillLinkState(
            bundledSkillLinkManager.state()
        )
        self.windowController = windowController

        let systemMenuController = SystemMenuController(
            onOpenChatGPT: { [weak self] forceRestart in
                self?.openChatGPT(forceRestart: forceRestart)
            },
            onShowSettings: { [weak self] in
                self?.showLauncher()
            },
            onApplicationUpdateAction: { [weak self] action in
                self?.applicationUpdateController?.perform(action)
            }
        )
        self.systemMenuController = systemMenuController
        systemMenuController.showApplicationUpdateState(
            applicationUpdateController.state
        )
        applicationUpdateController.start()

        let notificationController = InjectionNotificationController()
        notificationController.onRestart = { [weak self] in
            self?.openChatGPT(forceRestart: true)
        }
        notificationController.onCheckForUpdates = { [weak self] in
            self?.checkForUpdates()
        }
        self.notificationController = notificationController

        let launchRecoveryMonitor = ChatGPTLaunchRecoveryMonitor(
            approvedApplicationURL: { [weak self] in
                self?.approvedChatGPTApplicationURL()
            },
            injectionEnabled: { application in
                guard let application = application as? NSRunningApplication
                else {
                    return false
                }
                return ChatGPTRuntime.extensionsEnabled(for: application)
            },
            recoveryAllowed: { [weak self] in
                guard let self else { return false }
                return Self.automaticRecoveryAllowed(
                    launchInProgress: launchTask != nil,
                    updateInProgress: updateTask != nil,
                    hasPreparedComponents: preparedComponents != nil
                )
            },
            relaunch: { [weak self] applicationURL in
                guard let self else {
                    throw ComponentStoreUnavailable()
                }
                if let updateTask {
                    await updateTask.value
                }
                guard launchTask == nil, updateTask == nil,
                      let componentStore,
                      let preparedComponents = try componentStore
                      .prepareInstalled(),
                      await ChatGPTLauncher.bindingMatches(
                          applicationURL: applicationURL,
                          binding: preparedComponents.versions.binding
                      )
                else {
                    throw AutomaticLaunchUnavailable()
                }
                self.preparedComponents = preparedComponents
                return try await ChatGPTLauncher(
                    componentStore: preparedComponents
                ).launch(
                    mode: .normal,
                    localExtensionURLs: options.extensionURLs,
                    runningApplicationPolicy: .requireNotRunning,
                    applicationURL: applicationURL,
                    beforeOpen: { [weak self] token in
                        self?.launchRecoveryMonitor?.registerExpectedLaunch(
                            token: token
                        )
                    }
                )
            },
            launchErrorHandler: { [weak self] error in
                self?.showLaunchError(error)
            },
            verificationFailureHandler: {
                [weak notificationController] failure in
                notificationController?.notify(failure)
            }
        )
        self.launchRecoveryMonitor = launchRecoveryMonitor
        launchRecoveryMonitor.start()

        let statusMonitor = ChatGPTStatusMonitor(
            applicationURL: options.applicationURL
        ) { [weak self] snapshot in
            self?.windowController?.showStatus(snapshot)
            self?.systemMenuController?.showStatus(snapshot)
        }
        self.statusMonitor = statusMonitor
        statusMonitor.start()

        let injectionMonitor = ChatGPTInjectionMonitor(
            expectedBinding: { [weak self] in
                self?.preparedComponents?.versions.binding
            },
            failureHandler: {
                [weak self, weak notificationController] failure in
                notificationController?.notify(failure)
                if Self.runtimeSupportCheckRequired(after: failure) {
                    self?.requestRuntimeSupportCheck()
                }
            }
        )
        self.injectionMonitor = injectionMonitor
        injectionMonitor.start()
        startAutomaticUpdates()
    }

    func applicationDidBecomeActive(_: Notification) {
        guard !ChatGPTXRuntimeEnvironment.isUnitTesting,
              !options.isIsolatedTest
        else {
            return
        }
        windowController?.setLaunchAtLogin(LaunchAtLoginService.isEnabled)
        refreshCodexSkillLinkState()
        if !checkedAppManagementPermission {
            checkedAppManagementPermission = true
            guard !AppManagementPermission.requestIfNeeded() else {
                return
            }
        }
        windowController?.showWindow(nil)
    }

    func applicationWillTerminate(_: Notification) {
        automaticUpdateTask?.cancel()
        automaticUpdateTask = nil
        launchRecoveryMonitor?.stop()
        statusMonitor?.stop()
        injectionMonitor?.stop()
    }

    func applicationShouldHandleReopen(
        _: NSApplication,
        hasVisibleWindows flag: Bool
    ) -> Bool {
        guard !ChatGPTXRuntimeEnvironment.isUnitTesting else { return false }
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

    private func installCodexSkill() {
        guard let bundledSkillLinkManager else { return }
        do {
            try bundledSkillLinkManager.install()
            refreshCodexSkillLinkState()
        } catch {
            refreshCodexSkillLinkState()
            showCodexSkillInstallError(error)
        }
    }

    private func refreshCodexSkillLinkState() {
        guard let bundledSkillLinkManager else { return }
        windowController?.showCodexSkillLinkState(
            bundledSkillLinkManager.state()
        )
    }

    private func runIsolatedTest(mode: ChatGPTLaunchMode) {
        launchTask = Task { [weak self] in
            guard let self else { return }
            do {
                let applicationURL = try selectedChatGPTApplicationURL()
                let preparedComponents = try await prepareComponentsForIsolatedTest(
                    applicationURL: applicationURL,
                    mode: mode
                )
                let application = try await ChatGPTLauncher(
                    componentStore: preparedComponents
                ).launch(
                    mode: mode,
                    arguments: options.chatGPTArguments,
                    localExtensionURLs: options.extensionURLs,
                    applicationURL: applicationURL
                )
                if mode == .extensionTest, let application {
                    do {
                        try ExtensionTestSessionRecorder.record(application)
                    } catch {
                        if !application.terminate() {
                            application.forceTerminate()
                        }
                        throw error
                    }
                }
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
        guard launchTask == nil,
              launchRecoveryMonitor?.isAutomaticRecoveryActive != true
        else {
            return
        }
        windowController?.setLaunching(true)
        systemMenuController?.setLaunching(true)

        launchTask = Task { [weak self] in
            guard let self else { return }
            var registeredExpectedLaunch = false
            defer {
                launchTask = nil
                windowController?.setLaunching(false)
                systemMenuController?.setLaunching(false)
                statusMonitor?.refresh()
                if checkForUpdatesAfterLaunch {
                    checkForUpdatesAfterLaunch = false
                    checkForUpdates()
                } else {
                    runPendingRuntimeSupportCheck()
                }
            }

            do {
                let applicationURL = try selectedChatGPTApplicationURL()
                let installed = componentStore.flatMap {
                    try? $0.prepareInstalled()
                }
                if let installed,
                   await ChatGPTLauncher.bindingMatches(
                       applicationURL: applicationURL,
                       binding: installed.versions.binding
                   )
                {
                    preparedComponents = installed
                    let application = try await ChatGPTLauncher(
                        componentStore: installed
                    ).launch(
                        mode: .normal,
                        localExtensionURLs: options.extensionURLs,
                        runningApplicationPolicy:
                        forceRestart ? .forceRestart : .normal,
                        applicationURL: applicationURL,
                        beforeOpen: { [weak self] token in
                            registeredExpectedLaunch = true
                            self?.launchRecoveryMonitor?
                                .registerExpectedLaunch(token: token)
                        }
                    )
                    launchRecoveryMonitor?.openedExpectedApplication(
                        application
                    )
                } else {
                    preparedComponents = nil
                    try await ChatGPTLauncher.openStock(
                        applicationURL: applicationURL
                    )
                }
            } catch {
                if registeredExpectedLaunch {
                    launchRecoveryMonitor?.expectedLaunchFailed()
                }
                showLaunchError(error)
            }
        }
    }

    private func showRunningChatGPT() {
        Task { [weak self] in
            do {
                if try await ChatGPTRuntime.activateRunningApplication(
                    workspace: .shared
                ) {
                    return
                }
                self?.openChatGPT()
            } catch {
                self?.showLaunchError(error)
            }
        }
    }

    private func prepareComponentsForIsolatedTest(
        applicationURL: URL,
        mode: ChatGPTLaunchMode
    ) async throws -> PreparedComponentStore {
        guard let componentStore, let componentUpdateService else {
            throw ComponentStoreUnavailable()
        }
        let cached = try? componentStore.prepareInstalled()
        let exactCached: PreparedComponentStore?
        if let cached,
           await ChatGPTLauncher.bindingMatches(
               applicationURL: applicationURL,
               binding: cached.versions.binding
           )
        {
            exactCached = cached
        } else {
            exactCached = nil
        }

        if mode == .extensionTest {
            guard let exactCached else {
                throw ExtensionTestComponentsUnavailable()
            }
            preparedComponents = exactCached
            return exactCached
        }

        let outcome: ComponentUpdateOutcome
        do {
            outcome = try await componentUpdateService.update(
                for: chatGPTVersion(at: applicationURL),
                chatgptAsarSHA256: await chatGPTAsarSHA256(
                    at: applicationURL
                )
            )
        } catch {
            guard let exactCached,
                  canUseCachedAPITestComponents(after: error)
            else {
                throw error
            }
            preparedComponents = exactCached
            return exactCached
        }
        let installed = outcome.result.preparedStore
        guard await ChatGPTLauncher.bindingMatches(
            applicationURL: applicationURL,
            binding: installed.versions.binding
        ) else {
            throw UpdateUIError.chatGPTChangedDuringUpdate
        }
        preparedComponents = installed
        return installed
    }

    private func canUseCachedAPITestComponents(
        after error: any Error
    ) -> Bool {
        if error is URLError { return true }
        guard let error = error as? ComponentUpdateError else {
            return false
        }
        switch error {
        case .indexRequestFailed, .indexInvalid, .olderGeneration,
             .bindingUnavailable, .bindingBuildUnavailable, .apiUnavailable:
            return true
        case .launcherVersionInvalid, .launcherTooOld, .releaseURLInvalid,
             .archiveRequestFailed, .checksumMismatch, .extractionFailed,
             .archiveLayoutInvalid, .installationStateInvalid:
            return false
        }
    }

    private func selectedChatGPTApplicationURL() throws -> URL {
        guard let applicationURL = options.applicationURL
            ?? ChatGPTLauncher.installedApplicationURL(workspace: .shared)
        else {
            throw UpdateUIError.chatGPTNotInstalled
        }
        return applicationURL
    }

    private func chatGPTVersion(at applicationURL: URL) throws -> String {
        guard let version = ChatGPTLauncher.applicationVersion(
            at: applicationURL
        ) else {
            throw UpdateUIError.chatGPTVersionUnavailable
        }
        return version
    }

    private func chatGPTAsarSHA256(
        at applicationURL: URL
    ) async throws -> String {
        guard let sha256 = await ChatGPTLauncher.applicationAsarSHA256(
            at: applicationURL
        ) else {
            throw UpdateUIError.chatGPTBuildUnavailable
        }
        return sha256
    }

    private func validateChatGPTBuild(
        expectedVersion: String,
        expectedAsarSHA256: String
    ) throws {
        guard let applicationURL = try? selectedChatGPTApplicationURL(),
              ChatGPTLauncher.cachedBuildMatches(
                  applicationURL: applicationURL,
                  expectedVersion: expectedVersion,
                  expectedAsarSHA256: expectedAsarSHA256
              )
        else {
            throw UpdateUIError.chatGPTChangedDuringUpdate
        }
    }

    private func approvedChatGPTApplicationURL() -> URL? {
        guard let binding = preparedComponents?.versions.binding else {
            return nil
        }
        let workspace = NSWorkspace.shared
        guard let applicationURL = options.applicationURL
            ?? ChatGPTLauncher.installedApplicationURL(workspace: workspace),
            ChatGPTLauncher.cachedBuildMatches(
                applicationURL: applicationURL,
                expectedVersion: binding.chatgpt,
                expectedAsarSHA256: binding.asarSha256
            )
        else {
            return nil
        }
        return applicationURL
    }

    private func checkForUpdates(inBackground: Bool = false) {
        guard updateTask == nil, launchTask == nil,
              launchRecoveryMonitor?.isAutomaticRecoveryActive != true
        else {
            return
        }
        guard let componentUpdateService else {
            failStartup(ComponentStoreUnavailable())
            return
        }

        if !inBackground {
            windowController?.setCheckingForUpdates(true)
            systemMenuController?.setCheckingForUpdates(true)
        }
        updateTask = Task { [weak self] in
            guard let self else { return }
            defer {
                updateTask = nil
                launchRecoveryMonitor?.refreshApprovedApplication()
                if !inBackground {
                    windowController?.setCheckingForUpdates(false)
                    systemMenuController?.setCheckingForUpdates(false)
                }
                runPendingRuntimeSupportCheck()
            }

            do {
                let applicationURL = try selectedChatGPTApplicationURL()
                let chatgptVersion = try chatGPTVersion(
                    at: applicationURL
                )
                let chatgptAsarSHA256 = try await chatGPTAsarSHA256(
                    at: applicationURL
                )
                let outcome = try await componentUpdateService.update(
                    for: chatgptVersion,
                    chatgptAsarSHA256: chatgptAsarSHA256,
                    planned: { [weak self] plan in
                        self?.windowController?.showUpdateSummary(plan.summary)
                    },
                    progress: { [weak self] progress in
                        self?.windowController?.showUpdateProgress(progress)
                    }
                )
                let result = outcome.result
                guard await ChatGPTLauncher.bindingMatches(
                    applicationURL: applicationURL,
                    binding: result.preparedStore.versions.binding
                ) else {
                    preparedComponents = nil
                    throw UpdateUIError.chatGPTChangedDuringUpdate
                }
                preparedComponents = result.preparedStore
                runtimeSupportCheckPending = false
                let notifyRuntimeReady = runtimeReadyNotificationPending
                runtimeReadyNotificationPending = false
                windowController?.showUpdateSummary(outcome.summary)
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
                if notifyRuntimeReady {
                    notificationController?.notifyRuntimeReady(
                        chatgptVersion: chatgptVersion
                    )
                } else {
                    showUpdateResult(result)
                }
            } catch {
                windowController?.showUpdateFailure(error)
            }
        }
    }

    static func runtimeSupportCheckRequired(
        after failure: ChatGPTInjectionFailure
    ) -> Bool {
        switch failure {
        case .bindingMissing:
            true
        case .extensionsDisabled:
            false
        }
    }

    private func requestRuntimeSupportCheck() {
        runtimeSupportCheckPending = true
        runtimeReadyNotificationPending = true
        runPendingRuntimeSupportCheck()
    }

    private func runPendingRuntimeSupportCheck() {
        guard runtimeSupportCheckPending,
              updateTask == nil,
              launchTask == nil,
              launchRecoveryMonitor?.isAutomaticRecoveryActive != true
        else {
            return
        }
        runtimeSupportCheckPending = false
        checkForUpdates(inBackground: true)
    }

    private func startAutomaticUpdates(checkImmediately: Bool = true) {
        if checkImmediately {
            checkForUpdates(inBackground: true)
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
                checkForUpdates(inBackground: true)
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

    private func showCodexSkillInstallError(_ error: any Error) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Could Not Install the Codex Skill"
        alert.informativeText = error.localizedDescription
        alert.addButton(withTitle: "OK")

        if let window = windowController?.window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }

    private func failStartup(_ error: any Error) {
        if options.isIsolatedTest {
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
        let applicationUpdateMenuItemController =
            ApplicationUpdateMenuItemController { [weak self] action in
                self?.applicationUpdateController?.perform(action)
            }
        applicationUpdateMenuItemController.show(
            applicationUpdateController?.state ?? .unavailable
        )
        self.applicationUpdateMenuItemController =
            applicationUpdateMenuItemController
        applicationMenu.addItem(
            applicationUpdateMenuItemController.menuItem
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

private struct ExtensionTestComponentsUnavailable: LocalizedError {
    var errorDescription: String? {
        "The isolated extension test components do not match the installed ChatGPT build. Open ChatGPTX, check for component updates, and build the extension again."
    }
}

private struct AutomaticLaunchUnavailable: LocalizedError {
    var errorDescription: String? {
        "ChatGPTX is already performing another launch or update."
    }
}

private enum UpdateUIError: LocalizedError {
    case chatGPTNotInstalled
    case chatGPTVersionUnavailable
    case chatGPTBuildUnavailable
    case chatGPTChangedDuringUpdate

    var errorDescription: String? {
        switch self {
        case .chatGPTNotInstalled:
            "ChatGPT.app is not installed."
        case .chatGPTVersionUnavailable:
            "The installed ChatGPT version could not be determined."
        case .chatGPTBuildUnavailable:
            "The installed ChatGPT build could not be identified."
        case .chatGPTChangedDuringUpdate:
            "ChatGPT changed while its components were being installed. Check for updates again."
        }
    }
}
