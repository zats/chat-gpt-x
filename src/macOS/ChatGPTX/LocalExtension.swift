import Foundation

struct LaunchExtension: Codable, Equatable {
    let id: String
    let path: String
}

private struct LocalExtensionManifest: Decodable {
    let id: String
    let version: String
    let main: String
    let compatibility: ExtensionCompatibility
}

enum LocalExtensionResolver {
    static func resolve(
        _ url: URL,
        chatgptVersion: String,
        chatgptAPIVersion: String,
        fileManager: FileManager = .default
    ) throws -> LaunchExtension {
        let standardizedURL = url.standardizedFileURL
        guard standardizedURL.isFileURL,
            standardizedURL.path.hasPrefix("/") else {
            throw LocalExtensionError.absolutePathRequired(url.path)
        }

        let packageURL: URL
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(
            atPath: standardizedURL.path,
            isDirectory: &isDirectory
        ) else {
            throw LocalExtensionError.pathMissing(standardizedURL.path)
        }
        if isDirectory.boolValue {
            packageURL = standardizedURL.appendingPathComponent("package.json")
        } else {
            let contentsURL = standardizedURL.deletingLastPathComponent()
            guard contentsURL.lastPathComponent == "contents" else {
                throw LocalExtensionError.mainPathInvalid(standardizedURL.path)
            }
            packageURL = contentsURL
                .deletingLastPathComponent()
                .appendingPathComponent("package.json")
        }

        let manifest: LocalExtensionManifest
        do {
            manifest = try JSONDecoder().decode(
                LocalExtensionManifest.self,
                from: Data(contentsOf: packageURL)
            )
        } catch {
            throw LocalExtensionError.manifestInvalid(packageURL.path, error)
        }
        guard manifest.id.range(
            of: #"^[a-z0-9][a-z0-9._-]*$"#,
            options: .regularExpression
        ) != nil else {
            throw LocalExtensionError.idInvalid(manifest.id)
        }
        guard manifest.main == "contents/main.js" else {
            throw LocalExtensionError.mainDeclarationInvalid(manifest.main)
        }

        let packageRoot = packageURL.deletingLastPathComponent()
        let mainURL = packageRoot
            .appendingPathComponent(manifest.main)
            .standardizedFileURL
        if !isDirectory.boolValue, mainURL != standardizedURL {
            throw LocalExtensionError.mainPathInvalid(standardizedURL.path)
        }
        guard fileManager.fileExists(atPath: mainURL.path) else {
            throw LocalExtensionError.pathMissing(mainURL.path)
        }
        guard try ComponentCompatibility.matches(
            manifest.compatibility,
            chatgptVersion: chatgptVersion,
            chatgptAPIVersion: chatgptAPIVersion
        ) else {
            throw LocalExtensionError.incompatible(
                manifest.id,
                chatgptVersion,
                chatgptAPIVersion
            )
        }

        return LaunchExtension(id: manifest.id, path: mainURL.path)
    }
}

enum ComponentCompatibility {
    static func matches(
        _ compatibility: ExtensionCompatibility,
        chatgptVersion: String,
        chatgptAPIVersion: String
    ) throws -> Bool {
        try matchesRange(
            compatibility.chatgpt,
            candidate: chatgptVersion
        ) && matchesSemverRange(
            compatibility.chatgptApi,
            candidate: chatgptAPIVersion
        )
    }

    private static func matchesRange(
        _ expression: String,
        candidate: String
    ) throws -> Bool {
        let candidateParts = try numericVersion(candidate)
        for condition in expression.split(whereSeparator: \.isWhitespace) {
            let token = String(condition)
            let comparator: String
            let version: String
            if token.hasPrefix(">=") || token.hasPrefix("<=") {
                comparator = String(token.prefix(2))
                version = String(token.dropFirst(2))
            } else if token.hasPrefix(">") || token.hasPrefix("<") {
                comparator = String(token.prefix(1))
                version = String(token.dropFirst())
            } else {
                comparator = "="
                version = token
            }
            let comparison = compare(
                candidateParts,
                try numericVersion(version)
            )
            let matches = switch comparator {
            case ">=": comparison >= 0
            case "<=": comparison <= 0
            case ">": comparison > 0
            case "<": comparison < 0
            default: comparison == 0
            }
            if !matches { return false }
        }
        return !expression.isEmpty
    }

    private static func matchesSemverRange(
        _ expression: String,
        candidate: String
    ) throws -> Bool {
        guard expression.hasPrefix("^") else {
            return try matchesRange(expression, candidate: candidate)
        }
        let minimum = try semanticVersion(String(expression.dropFirst()))
        let value = try semanticVersion(candidate)
        guard compare(value, minimum) >= 0 else { return false }

        if minimum[0] > 0 {
            return value[0] == minimum[0]
        }
        if minimum[1] > 0 {
            return value[0] == 0 && value[1] == minimum[1]
        }
        return value == minimum
    }

    private static func semanticVersion(_ value: String) throws -> [Int] {
        let parts = try numericVersion(value)
        guard parts.count == 3 else {
            throw LocalExtensionError.versionInvalid(value)
        }
        return parts
    }

    private static func numericVersion(_ value: String) throws -> [Int] {
        let components = value.split(separator: ".", omittingEmptySubsequences: false)
        guard components.count >= 2 else {
            throw LocalExtensionError.versionInvalid(value)
        }
        return try components.map { component in
            guard
                !component.isEmpty,
                component.allSatisfy(\.isNumber),
                let number = Int(component)
            else {
                throw LocalExtensionError.versionInvalid(value)
            }
            return number
        }
    }

    private static func compare(_ left: [Int], _ right: [Int]) -> Int {
        for index in 0..<max(left.count, right.count) {
            let difference = (index < left.count ? left[index] : 0)
                - (index < right.count ? right[index] : 0)
            if difference != 0 { return difference }
        }
        return 0
    }
}

private enum LocalExtensionError: LocalizedError {
    case absolutePathRequired(String)
    case pathMissing(String)
    case manifestInvalid(String, any Error)
    case idInvalid(String)
    case mainDeclarationInvalid(String)
    case mainPathInvalid(String)
    case incompatible(String, String, String)
    case versionInvalid(String)

    var errorDescription: String? {
        switch self {
        case .absolutePathRequired(let path):
            "Local extension paths must be absolute: \(path)"
        case .pathMissing(let path):
            "The local extension path does not exist: \(path)"
        case .manifestInvalid(let path, let error):
            "Could not read \(path): \(error.localizedDescription)"
        case .idInvalid(let id):
            "The local extension ID is invalid: \(id)"
        case .mainDeclarationInvalid(let main):
            "The local extension main must be contents/main.js, received \(main)."
        case .mainPathInvalid(let path):
            "The local extension file is not its declared main: \(path)"
        case .incompatible(let id, let chatgpt, let api):
            "\(id) is incompatible with ChatGPT \(chatgpt) and API \(api)."
        case .versionInvalid(let version):
            "The component version is invalid: \(version)"
        }
    }
}
