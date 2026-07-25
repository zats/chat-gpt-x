import Foundation

struct LaunchOptions: Equatable {
    static let apiTestFlag = "--test-api"
    static let chatGPTAppPrefix = "--chatgpt-app="
    static let extensionFlag = "--extension"

    let isAPITest: Bool
    let applicationURL: URL?
    let extensionURLs: [URL]
    let chatGPTArguments: [String]

    init(arguments: [String]) throws {
        isAPITest = arguments.contains(Self.apiTestFlag)
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
                !argument.hasPrefix(Self.chatGPTAppPrefix) {
                forwardedArguments.append(argument)
            }
            index += 1
        }
        self.extensionURLs = extensionURLs
        chatGPTArguments = isAPITest ? forwardedArguments : []
    }
}

private enum LaunchOptionsError: LocalizedError {
    case extensionPathMissing
    case extensionPathNotAbsolute(String)

    var errorDescription: String? {
        switch self {
        case .extensionPathMissing:
            "The --extension flag requires an absolute path."
        case .extensionPathNotAbsolute(let path):
            "The --extension path must be absolute: \(path)"
        }
    }
}
