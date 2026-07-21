import AppKit

@main
enum ChatGPTXApplication {
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()

        application.delegate = delegate
        application.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var launchTask: Task<Void, Never>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        launchTask = Task {
            do {
                try await ChatGPTLauncher().launch()
                NSApplication.shared.terminate(nil)
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
        alert.addButton(withTitle: "Quit")

        NSApplication.shared.activate(ignoringOtherApps: true)
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}
