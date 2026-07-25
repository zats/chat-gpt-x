import Foundation

struct LaunchOptions: Equatable {
    static let apiTestFlag = "--test-api"
    static let chatGPTAppPrefix = "--chatgpt-app="

    let isAPITest: Bool
    let applicationURL: URL?
    let chatGPTArguments: [String]

    init(arguments: [String]) {
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
        chatGPTArguments = isAPITest
            ? arguments.filter {
                $0 != Self.apiTestFlag
                    && !$0.hasPrefix(Self.chatGPTAppPrefix)
            }
            : []
    }
}
