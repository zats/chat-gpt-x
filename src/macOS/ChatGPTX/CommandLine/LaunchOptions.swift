import Foundation

struct LaunchOptions: Equatable {
    static let apiTestFlag = "--test-api"
    static let extensionTestFlag = "--test-extension"
    static let chatGPTAppPrefix = "--chatgpt-app="
    static let extensionFlag = "--extension"

    let isAPITest: Bool
    let isExtensionTest: Bool
    let applicationURL: URL?
    let extensionURLs: [URL]
    let chatGPTArguments: [String]

    var isIsolatedTest: Bool {
        isAPITest || isExtensionTest
    }

    static func hasForbiddenExtensionTestDebugArgument(
        _ arguments: [String]
    ) -> Bool {
        let debugOptions = [
            "--remote-debugging-port",
            "--remote-debugging-pipe",
            "--inspect",
            "--inspect-brk",
            "--inspect-brk-node",
            "--inspect-port",
            "--debug",
            "--debug-brk",
            "--debug-port",
        ]
        return arguments.contains { argument in
            debugOptions.contains { option in
                argument == option || argument.hasPrefix("\(option)=")
            }
        }
    }

    init(arguments: [String]) throws {
        isAPITest = arguments.contains(Self.apiTestFlag)
        isExtensionTest = arguments.contains(Self.extensionTestFlag)
        guard !isAPITest || !isExtensionTest else {
            throw LaunchOptionsError.conflictingTestModes
        }
        applicationURL = arguments.first {
            $0.hasPrefix(Self.chatGPTAppPrefix)
        }.map {
            URL(
                fileURLWithPath: String(
                    $0.dropFirst(Self.chatGPTAppPrefix.count)
                )
            )
        }

        var extensionURLs: [URL] = []
        var forwardedArguments: [String] = []
        var index = 0
        while index < arguments.count {
            let argument = arguments[index]
            if argument == Self.extensionFlag {
                let valueIndex = index + 1
                guard valueIndex < arguments.count else {
                    throw LaunchOptionsError.extensionPathMissing
                }
                guard arguments[valueIndex].hasPrefix("/") else {
                    throw LaunchOptionsError.extensionPathNotAbsolute(
                        arguments[valueIndex]
                    )
                }
                extensionURLs.append(
                    URL(fileURLWithPath: arguments[valueIndex])
                )
                index += 2
                continue
            }
            if argument != Self.apiTestFlag,
                argument != Self.extensionTestFlag,
                !argument.hasPrefix(Self.chatGPTAppPrefix) {
                forwardedArguments.append(argument)
            }
            index += 1
        }
        self.extensionURLs = extensionURLs
        if isExtensionTest,
            Self.hasForbiddenExtensionTestDebugArgument(forwardedArguments)
        {
            throw LaunchOptionsError.extensionTestDebuggingUnavailable
        }
        chatGPTArguments = (isAPITest || isExtensionTest)
            ? forwardedArguments
            : []
    }
}

private enum LaunchOptionsError: LocalizedError {
    case conflictingTestModes
    case extensionTestDebuggingUnavailable
    case extensionPathMissing
    case extensionPathNotAbsolute(String)

    var errorDescription: String? {
        switch self {
        case .conflictingTestModes:
            "Use only one isolated test mode."
        case .extensionTestDebuggingUnavailable:
            "Remote debugging is unavailable for signed-in extension tests."
        case .extensionPathMissing:
            "The --extension flag requires an absolute path."
        case .extensionPathNotAbsolute(let path):
            "The --extension path must be absolute: \(path)"
        }
    }
}
