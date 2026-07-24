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
                let arguments = Array(CommandLine.arguments.dropFirst())
                let isAPITest = arguments.contains("--test-api")
                let mode: ChatGPTLaunchMode = isAPITest ? .apiTest : .normal
                let chatGPTArguments = isAPITest
                    ? arguments.filter { $0 != "--test-api" }
                    : []
                try await ChatGPTLauncher().launch(
                    mode: mode,
                    arguments: chatGPTArguments
                )
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
