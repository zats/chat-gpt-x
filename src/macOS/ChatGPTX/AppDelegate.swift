import AppKit
import Darwin

@main
enum ChatGPTXApplication {
    static func main() {
        let application = NSApplication.shared
        let options = LaunchOptions(
            arguments: Array(CommandLine.arguments.dropFirst())
        )
        application.setActivationPolicy(
            options.isAPITest ? .prohibited : .regular
        )
        let delegate = AppDelegate(options: options)

        application.delegate = delegate
        application.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let options: LaunchOptions
    private var launchTask: Task<Void, Never>?
    private var windowController: LauncherWindowController?

    init(options: LaunchOptions) {
        self.options = options
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if options.isAPITest {
            runAPITest()
            return
        }

        installMainMenu()
        let windowController = LauncherWindowController(
            applicationURL: options.applicationURL
        )
        windowController.onOpenChatGPT = { [weak self] in
            self?.openChatGPT()
        }
        self.windowController = windowController
        windowController.showWindow(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
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

    private func runAPITest() {
        launchTask = Task {
            do {
                try await ChatGPTLauncher().launch(
                    mode: .apiTest,
                    arguments: options.chatGPTArguments,
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

    private func openChatGPT() {
        guard launchTask == nil else { return }
        windowController?.setLaunching(true)

        launchTask = Task { [weak self] in
            guard let self else { return }
            defer {
                launchTask = nil
                windowController?.setLaunching(false)
                windowController?.refreshStatus()
            }

            do {
                try await ChatGPTLauncher().launch(
                    mode: .normal,
                    applicationURL: options.applicationURL
                )
            } catch {
                showLaunchError(error)
            }
        }
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
