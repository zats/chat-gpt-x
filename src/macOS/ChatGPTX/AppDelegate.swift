import AppKit
import Darwin

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
        let arguments = Array(CommandLine.arguments.dropFirst())
        let isAPITest = arguments.contains("--test-api")
        let chatGPTAppArgument = arguments.first {
            $0.hasPrefix("--chatgpt-app=")
        }
        let chatGPTAppURL = chatGPTAppArgument.map {
            URL(fileURLWithPath: String($0.dropFirst("--chatgpt-app=".count)))
        }
        let chatGPTArguments = isAPITest
            ? arguments.filter {
                $0 != "--test-api" && !$0.hasPrefix("--chatgpt-app=")
            }
            : []

        launchTask = Task {
            do {
                let mode: ChatGPTLaunchMode = isAPITest ? .apiTest : .normal
                try await ChatGPTLauncher().launch(
                    mode: mode,
                    arguments: chatGPTArguments,
                    applicationURL: chatGPTAppURL
                )
                NSApplication.shared.terminate(nil)
            } catch {
                if isAPITest {
                    FileHandle.standardError.write(
                        Data("\(error.localizedDescription)\n".utf8)
                    )
                    Darwin.exit(EXIT_FAILURE)
                }
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
