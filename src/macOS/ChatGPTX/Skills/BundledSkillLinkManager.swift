import Foundation

enum BundledSkillLinkState: Equatable {
    case available
    case installed
    case conflict(String)
    case unstableSource
    case unavailable
}

struct BundledSkillLinkPresentation: Equatable {
    let status: String
    let buttonTitle: String
    let buttonEnabled: Bool
}

extension BundledSkillLinkState {
    var presentation: BundledSkillLinkPresentation {
        switch self {
        case .available:
            BundledSkillLinkPresentation(
                status: "Create local extensions with Codex.",
                buttonTitle: "Install Skill",
                buttonEnabled: true
            )
        case .installed:
            BundledSkillLinkPresentation(
                status: "The Codex skill is installed.",
                buttonTitle: "Installed",
                buttonEnabled: false
            )
        case .conflict(let explanation):
            BundledSkillLinkPresentation(
                status: explanation,
                buttonTitle: "Install Skill",
                buttonEnabled: false
            )
        case .unstableSource:
            BundledSkillLinkPresentation(
                status: "Move ChatGPTX to Applications, then reopen it.",
                buttonTitle: "Install Skill",
                buttonEnabled: false
            )
        case .unavailable:
            BundledSkillLinkPresentation(
                status: "The bundled Codex skill is unavailable.",
                buttonTitle: "Install Skill",
                buttonEnabled: false
            )
        }
    }
}

struct BundledSkillLinkManager {
    static let skillName = "build-chatgptx-extensions"

    private static let requiredFiles = [
        "SKILL.md",
        "agents/openai.yaml",
        "references/authoring-guide.md",
        "references/platform-api.d.ts",
        "assets/test-codex-global-state.json",
        "assets/extension-template/package.json.template",
        "assets/extension-template/contents/main.js",
        "assets/extension-template/sdk/extension-storage.js",
        "assets/extension-template/sdk/extension-storage.d.ts",
        "scripts/build-extension.sh",
        "scripts/bundle-javascript.js",
        "scripts/check-javascript.js",
        "scripts/create-extension.sh",
        "scripts/instrument-test-package.js",
        "scripts/record-test-session.cjs",
        "scripts/resolve-active-api.sh",
        "scripts/seed-test-components.sh",
        "scripts/session-watchdog.sh",
        "scripts/test-extension.sh",
    ]

    private static let executableFiles = [
        "scripts/build-extension.sh",
        "scripts/create-extension.sh",
        "scripts/resolve-active-api.sh",
        "scripts/seed-test-components.sh",
        "scripts/session-watchdog.sh",
        "scripts/test-extension.sh",
    ]

    let sourceURL: URL?
    let destinationURL: URL
    let fileManager: FileManager

    init(
        bundle: Bundle = .main,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fileManager: FileManager = .default
    ) {
        sourceURL = bundle.resourceURL?
            .appendingPathComponent("Skills", isDirectory: true)
            .appendingPathComponent(Self.skillName, isDirectory: true)
        let codexHomeURL = Self.codexHomeURL(
            environment: environment,
            fileManager: fileManager
        )
        destinationURL = codexHomeURL
            .appendingPathComponent("skills", isDirectory: true)
            .appendingPathComponent(Self.skillName, isDirectory: true)
        self.fileManager = fileManager
    }

    static func codexHomeURL(
        environment: [String: String],
        fileManager: FileManager
    ) -> URL {
        if let path = environment["CODEX_HOME"], !path.isEmpty {
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        return fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent(".codex", isDirectory: true)
    }

    init(
        sourceURL: URL?,
        codexHomeURL: URL,
        fileManager: FileManager = .default
    ) {
        self.sourceURL = sourceURL
        destinationURL = codexHomeURL
            .appendingPathComponent("skills", isDirectory: true)
            .appendingPathComponent(Self.skillName, isDirectory: true)
        self.fileManager = fileManager
    }

    func state() -> BundledSkillLinkState {
        guard let sourceURL else {
            return .unavailable
        }
        guard isValidSkillSource(sourceURL) else { return .unavailable }
        guard isStableSkillSource(sourceURL) else { return .unstableSource }

        let attributes: [FileAttributeKey: Any]
        do {
            attributes = try fileManager.attributesOfItem(
                atPath: destinationURL.path
            )
        } catch let error as CocoaError
            where error.code == .fileNoSuchFile ||
                error.code == .fileReadNoSuchFile {
            return .available
        } catch {
            return .unavailable
        }

        guard attributes[.type] as? FileAttributeType == .typeSymbolicLink,
            let linkedURL = resolvedLinkDestination()
        else {
            return .conflict(conflictExplanation(linkTarget: nil))
        }
        return normalized(linkedURL) == normalized(sourceURL)
            ? .installed
            : .conflict(conflictExplanation(linkTarget: linkedURL.path))
    }

    func install() throws {
        guard let sourceURL, isValidSkillSource(sourceURL) else {
            throw BundledSkillLinkError.sourceUnavailable
        }
        switch state() {
        case .installed:
            return
        case .available:
            break
        case .conflict(let explanation):
            throw BundledSkillLinkError.destinationConflict(explanation)
        case .unstableSource:
            throw BundledSkillLinkError.sourceUnstable
        case .unavailable:
            throw BundledSkillLinkError.destinationUnavailable(
                destinationURL.path
            )
        }

        let skillsURL = destinationURL.deletingLastPathComponent()
        try fileManager.createDirectory(
            at: skillsURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        do {
            try fileManager.createSymbolicLink(
                at: destinationURL,
                withDestinationURL: sourceURL.absoluteURL
            )
        } catch {
            throw BundledSkillLinkError.creationFailed(error)
        }
        guard state() == .installed else {
            throw BundledSkillLinkError.verificationFailed
        }
    }

    private func isValidSkillSource(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        do {
            let attributes = try fileManager.attributesOfItem(atPath: url.path)
            guard attributes[.type] as? FileAttributeType == .typeDirectory
            else {
                return false
            }
            for relativePath in Self.requiredFiles {
                let fileURL = url.appendingPathComponent(relativePath)
                let fileAttributes = try fileManager.attributesOfItem(
                    atPath: fileURL.path
                )
                guard fileAttributes[.type] as? FileAttributeType
                    == .typeRegular
                else {
                    return false
                }
            }
            for relativePath in Self.executableFiles {
                guard fileManager.isExecutableFile(
                    atPath: url.appendingPathComponent(relativePath).path
                ) else {
                    return false
                }
            }
            return true
        } catch {
            return false
        }
    }

    private func isStableSkillSource(_ url: URL) -> Bool {
        if url.standardizedFileURL.pathComponents.contains("AppTranslocation") {
            return false
        }
        let keys: Set<URLResourceKey> = [
            .volumeIsEjectableKey,
            .volumeIsReadOnlyKey,
            .volumeIsRemovableKey,
        ]
        guard let values = try? url.resourceValues(forKeys: keys) else {
            return false
        }
        return values.volumeIsEjectable != true &&
            values.volumeIsReadOnly != true &&
            values.volumeIsRemovable != true
    }

    private func resolvedLinkDestination() -> URL? {
        guard let path = try? fileManager.destinationOfSymbolicLink(
            atPath: destinationURL.path
        ) else {
            return nil
        }
        if path.hasPrefix("/") {
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        return destinationURL.deletingLastPathComponent()
            .appendingPathComponent(path, isDirectory: true)
    }

    private func conflictExplanation(linkTarget: String?) -> String {
        if let linkTarget {
            return "Remove the skill link at \(destinationURL.path). " +
                "It points to \(linkTarget)."
        }
        return "Remove or rename the item at \(destinationURL.path)."
    }

    private func normalized(_ url: URL) -> URL {
        url.standardizedFileURL
    }

}

private enum BundledSkillLinkError: LocalizedError {
    case sourceUnavailable
    case sourceUnstable
    case destinationConflict(String)
    case destinationUnavailable(String)
    case creationFailed(any Error)
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .sourceUnavailable:
            "The bundled Codex skill is unavailable."
        case .sourceUnstable:
            "Move ChatGPTX to Applications, then reopen it."
        case .destinationConflict(let path):
            path
        case .destinationUnavailable(let path):
            "The Codex skill path is unavailable: \(path)"
        case .creationFailed(let error):
            "The Codex skill link could not be created: \(error.localizedDescription)"
        case .verificationFailed:
            "The Codex skill link could not be verified."
        }
    }
}
