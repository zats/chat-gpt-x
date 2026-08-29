import AppKit
import ApplicationServices
import Darwin
import Foundation

enum ExtensionTestUIProbe {
    private static let flag = "--extension-test-ui"
    private static let marker = "chatgptx-extension-test-v1"
    private static let chatGPTBundleIdentifier = "com.openai.codex"
    private static let maximumNodeCount = 5_000

    enum Command: Equatable {
        case press(session: String, role: String, label: String)
        case pressAndWait(
            session: String,
            pressRole: String,
            pressLabel: String,
            observedRole: String,
            observedLabel: String,
            timeout: TimeInterval
        )
        case wait(
            session: String,
            role: String,
            label: String,
            timeout: TimeInterval
        )
    }

    struct SemanticNode: Equatable {
        let role: String?
        let title: String?
        let description: String?
        let value: String?
        let identifier: String?

        func matches(role expectedRole: String, label: String) -> Bool {
            (expectedRole == "*" || role == expectedRole)
                && [title, description, value, identifier].contains(label)
        }
    }

    private struct Match {
        let element: AXUIElement
        let node: SemanticNode
    }

    private struct Response: Codable {
        let operation: String
        let matches: [ResponseMatch]
        let processID: Int32
        let result: String

        enum CodingKeys: String, CodingKey {
            case operation
            case matches
            case processID = "processId"
            case result
        }
    }

    private struct ResponseMatch: Codable {
        let role: String?
        let label: String
    }

    private struct ValidatedSession {
        let directoryURL: URL
        let profileURL: URL
        let processID: pid_t
    }

    static func runIfRequested(arguments: [String]) -> Int32? {
        guard arguments.first == flag else { return nil }
        do {
            let command = try parse(arguments: arguments)
            try run(command)
            return EXIT_SUCCESS
        } catch {
            FileHandle.standardError.write(
                Data("\(error.localizedDescription)\n".utf8)
            )
            return EXIT_FAILURE
        }
    }

    static func parse(arguments: [String]) throws -> Command {
        guard arguments.first == flag, arguments.count >= 2 else {
            throw ProbeError.usage
        }
        switch arguments[1] {
        case "press":
            guard arguments.count == 5 else { throw ProbeError.usage }
            let role = try validatedRole(arguments[3])
            guard role != "*" else { throw ProbeError.invalidRole }
            return .press(
                session: arguments[2],
                role: role,
                label: try validatedLabel(arguments[4])
            )
        case "press-wait":
            guard arguments.count == 7 || arguments.count == 8 else {
                throw ProbeError.usage
            }
            let pressRole = try validatedRole(arguments[3])
            guard pressRole != "*" else { throw ProbeError.invalidRole }
            return .pressAndWait(
                session: arguments[2],
                pressRole: pressRole,
                pressLabel: try validatedLabel(arguments[4]),
                observedRole: try validatedRole(arguments[5]),
                observedLabel: try validatedLabel(arguments[6]),
                timeout: try validatedTimeout(
                    arguments.count == 8 ? arguments[7] : nil
                )
            )
        case "wait":
            guard arguments.count == 5 || arguments.count == 6 else {
                throw ProbeError.usage
            }
            return .wait(
                session: arguments[2],
                role: try validatedRole(arguments[3]),
                label: try validatedLabel(arguments[4]),
                timeout: try validatedTimeout(
                    arguments.count == 6 ? arguments[5] : nil
                )
            )
        default:
            throw ProbeError.usage
        }
    }

    private static func validatedRole(_ role: String) throws -> String {
        guard role == "*" || role.hasPrefix("AX"),
            !role.contains("\n"), role.count <= 80
        else {
            throw ProbeError.invalidRole
        }
        return role
    }

    private static func validatedLabel(_ label: String) throws -> String {
        guard !label.isEmpty, !label.contains("\n"), label.count <= 200 else {
            throw ProbeError.invalidLabel
        }
        return label
    }

    private static func validatedTimeout(_ value: String?) throws
        -> TimeInterval
    {
        guard let value else { return 10 }
        guard let timeout = TimeInterval(value),
            timeout >= 0.1, timeout <= 30
        else {
            throw ProbeError.invalidTimeout
        }
        return timeout
    }

    private static func run(_ command: Command) throws {
        guard AXIsProcessTrusted() else {
            throw ProbeError.accessibilityUnavailable
        }
        switch command {
        case .press(let sessionPath, let role, let label):
            let session = try validateSession(at: sessionPath)
            try activate(session)
            try press(
                session: session,
                role: role,
                label: label
            )
        case .pressAndWait(
            let sessionPath,
            let pressRole,
            let pressLabel,
            let observedRole,
            let observedLabel,
            let timeout
        ):
            let session = try validateSession(at: sessionPath)
            try activate(session)
            try press(
                session: session,
                role: pressRole,
                label: pressLabel
            )
            try wait(
                session: session,
                role: observedRole,
                label: observedLabel,
                timeout: timeout
            )
        case .wait(let sessionPath, let role, let label, let timeout):
            let session = try validateSession(at: sessionPath)
            try activate(session)
            try wait(
                session: session,
                role: role,
                label: label,
                timeout: timeout
            )
        }
    }

    private static func press(
        session: ValidatedSession,
        role: String,
        label: String
    ) throws {
        let matches = try findMatches(
            session: session,
            role: role,
            label: label
        )
        guard matches.count == 1, let match = matches.first else {
            throw ProbeError.ambiguousMatch(matches.count)
        }
        try validateProcess(session)
        let result = AXUIElementPerformAction(
            match.element,
            kAXPressAction as CFString
        )
        guard result == .success else {
            throw ProbeError.actionFailed(result.rawValue)
        }
        try writeResponse(
            session: session,
            operation: "press",
            matches: [match.node],
            label: label,
            result: "pressed"
        )
    }

    private static func wait(
        session: ValidatedSession,
        role: String,
        label: String,
        timeout: TimeInterval
    ) throws {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            let matches = try findMatches(
                session: session,
                role: role,
                label: label
            )
            if try hasUniqueObservedMatch(matches.count) {
                try writeResponse(
                    session: session,
                    operation: "wait",
                    matches: [matches[0].node],
                    label: label,
                    result: "observed"
                )
                return
            }
            Thread.sleep(forTimeInterval: 0.1)
        } while Date() < deadline
        throw ProbeError.matchUnavailable(role: role, label: label)
    }

    static func hasUniqueObservedMatch(_ count: Int) throws -> Bool {
        guard count <= 1 else {
            throw ProbeError.ambiguousMatch(count)
        }
        return count == 1
    }

    private static func activate(_ session: ValidatedSession) throws {
        try validateProcess(session)
        guard let application = NSRunningApplication(
            processIdentifier: session.processID
        ), application.bundleIdentifier == chatGPTBundleIdentifier else {
            throw ProbeError.processUnavailable
        }
        application.activate()
        let window = try activeWindow(session)
        AXUIElementPerformAction(window, kAXRaiseAction as CFString)
    }

    private static func activeWindow(
        _ session: ValidatedSession
    ) throws -> AXUIElement {
        try validateProcess(session)
        let root = AXUIElementCreateApplication(session.processID)
        if let focused = copyElement(
            kAXFocusedWindowAttribute as CFString,
            from: root
        ) {
            return focused
        }
        if let main = copyElement(
            kAXMainWindowAttribute as CFString,
            from: root
        ) {
            return main
        }
        let visibleWindows = copyElements(
            kAXWindowsAttribute as CFString,
            from: root
        ).filter {
            copyBoolean(kAXMinimizedAttribute as CFString, from: $0) != true
        }
        guard visibleWindows.count == 1, let window = visibleWindows.first else {
            throw ProbeError.activeWindowUnavailable
        }
        return window
    }

    private static func findMatches(
        session: ValidatedSession,
        role: String,
        label: String
    ) throws -> [Match] {
        try validateProcess(session)
        let root = try activeWindow(session)
        var rootProcessID: pid_t = 0
        guard AXUIElementGetPid(root, &rootProcessID) == .success,
            rootProcessID == session.processID
        else {
            throw ProbeError.processUnavailable
        }

        var queue = [root]
        var index = 0
        var seen = Set<CFHashCode>()
        var matches: [Match] = []
        while index < queue.count {
            guard index < maximumNodeCount else {
                throw ProbeError.accessibilityTreeTooLarge
            }
            let element = queue[index]
            index += 1
            let identity = CFHash(element)
            guard seen.insert(identity).inserted else { continue }

            var elementProcessID: pid_t = 0
            guard AXUIElementGetPid(element, &elementProcessID) == .success,
                elementProcessID == session.processID
            else {
                continue
            }
            let node = semanticNode(for: element)
            if node.matches(role: role, label: label) {
                matches.append(Match(element: element, node: node))
            }
            queue.append(
                contentsOf: copyElements(
                    kAXChildrenAttribute as CFString,
                    from: element
                )
            )
        }
        try validateProcess(session)
        return matches
    }

    private static func semanticNode(for element: AXUIElement) -> SemanticNode {
        let role = copyString(kAXRoleAttribute as CFString, from: element)
        let value = role == "AXSecureTextField"
            ? nil
            : copyScalarString(kAXValueAttribute as CFString, from: element)
        return SemanticNode(
            role: role,
            title: copyString(kAXTitleAttribute as CFString, from: element),
            description: copyString(
                kAXDescriptionAttribute as CFString,
                from: element
            ),
            value: value,
            identifier: copyString(
                kAXIdentifierAttribute as CFString,
                from: element
            )
        )
    }

    private static func copyValue(
        _ attribute: CFString,
        from element: AXUIElement
    ) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute, &value)
            == .success
        else {
            return nil
        }
        return value
    }

    private static func copyString(
        _ attribute: CFString,
        from element: AXUIElement
    ) -> String? {
        copyValue(attribute, from: element) as? String
    }

    private static func copyScalarString(
        _ attribute: CFString,
        from element: AXUIElement
    ) -> String? {
        guard let value = copyValue(attribute, from: element) else {
            return nil
        }
        if let string = value as? String {
            return String(string.prefix(500))
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private static func copyBoolean(
        _ attribute: CFString,
        from element: AXUIElement
    ) -> Bool? {
        (copyValue(attribute, from: element) as? NSNumber)?.boolValue
    }

    private static func copyElement(
        _ attribute: CFString,
        from element: AXUIElement
    ) -> AXUIElement? {
        guard let value = copyValue(attribute, from: element),
            CFGetTypeID(value) == AXUIElementGetTypeID()
        else {
            return nil
        }
        return unsafeDowncast(value, to: AXUIElement.self)
    }

    private static func copyElements(
        _ attribute: CFString,
        from element: AXUIElement
    ) -> [AXUIElement] {
        guard let values = copyValue(attribute, from: element) as? [Any] else {
            return []
        }
        return values.compactMap { value in
            let object = value as CFTypeRef
            guard CFGetTypeID(object) == AXUIElementGetTypeID() else {
                return nil
            }
            return unsafeDowncast(object, to: AXUIElement.self)
        }
    }

    private static func validateSession(at requestedPath: String) throws
        -> ValidatedSession
    {
        guard requestedPath.hasPrefix("/") else {
            throw ProbeError.invalidSession
        }
        let requestedURL = URL(fileURLWithPath: requestedPath)
            .standardizedFileURL
        try requireDirectoryWithoutSymbolicLink(requestedURL)
        let canonicalSessionURL = requestedURL.resolvingSymlinksInPath()
            .standardizedFileURL
        let temporaryURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .resolvingSymlinksInPath().standardizedFileURL
        guard canonicalSessionURL.deletingLastPathComponent().path
                == temporaryURL.path,
            canonicalSessionURL.lastPathComponent.hasPrefix(
                "chatgptx-extension-test."
            )
        else {
            throw ProbeError.invalidSession
        }

        let markerURL = requestedURL.appendingPathComponent(
            ".chatgptx-extension-test"
        )
        try requireRegularFileWithoutSymbolicLink(markerURL)
        guard try String(contentsOf: markerURL, encoding: .utf8)
            .trimmingCharacters(in: .newlines) == marker
        else {
            throw ProbeError.invalidSession
        }
        let profileURL = requestedURL.appendingPathComponent(
            "electron-profile",
            isDirectory: true
        )
        try requireDirectoryWithoutSymbolicLink(profileURL)
        let processIDURL = requestedURL.appendingPathComponent("app.pid")
        try requireRegularFileWithoutSymbolicLink(processIDURL)
        let processIDText = try String(
            contentsOf: processIDURL,
            encoding: .utf8
        ).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let processID = pid_t(processIDText), processID > 1 else {
            throw ProbeError.invalidSession
        }
        let session = ValidatedSession(
            directoryURL: requestedURL,
            profileURL: profileURL,
            processID: processID
        )
        try validateProcess(session)
        return session
    }

    private static func validateProcess(_ session: ValidatedSession) throws {
        let snapshot: ExtensionTestProcessSnapshot
        do {
            snapshot = try ExtensionTestSessionRecorder
                .validateRecordedProcess(
                    sessionPath: session.directoryURL.path,
                    processID: session.processID
                )
        } catch {
            throw ProbeError.processUnavailable
        }
        guard let application = NSRunningApplication(
                processIdentifier: session.processID
            ),
            application.bundleIdentifier == chatGPTBundleIdentifier,
            let executableURL = application.executableURL,
            executableURL.standardizedFileURL.resolvingSymlinksInPath().path
                == URL(fileURLWithPath: snapshot.executablePath)
                    .standardizedFileURL.resolvingSymlinksInPath().path,
            executableURL.lastPathComponent == "ChatGPT",
            executableURL.deletingLastPathComponent().lastPathComponent
                == "MacOS",
            executableURL.deletingLastPathComponent()
                .deletingLastPathComponent().lastPathComponent == "Contents"
        else {
            throw ProbeError.processUnavailable
        }
    }

    private static func writeResponse(
        session: ValidatedSession,
        operation: String,
        matches: [SemanticNode],
        label: String,
        result: String
    ) throws {
        try validateProcess(session)
        let responseData = try JSONEncoder().encode(
            Response(
                operation: operation,
                matches: matches.map {
                    ResponseMatch(role: $0.role, label: label)
                },
                processID: session.processID,
                result: result
            )
        )
        FileHandle.standardOutput.write(responseData)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }

    private static func requireDirectoryWithoutSymbolicLink(_ url: URL) throws {
        var information = stat()
        guard lstat(url.path, &information) == 0,
            information.st_mode & S_IFMT == S_IFDIR,
            information.st_mode & S_IFMT != S_IFLNK
        else {
            throw ProbeError.invalidSession
        }
    }

    private static func requireRegularFileWithoutSymbolicLink(_ url: URL) throws {
        var information = stat()
        guard lstat(url.path, &information) == 0,
            information.st_mode & S_IFMT == S_IFREG,
            information.st_mode & S_IFMT != S_IFLNK
        else {
            throw ProbeError.invalidSession
        }
    }
}

private enum ProbeError: LocalizedError {
    case activeWindowUnavailable
    case accessibilityTreeTooLarge
    case accessibilityUnavailable
    case actionFailed(AXError.RawValue)
    case ambiguousMatch(Int)
    case invalidLabel
    case invalidRole
    case invalidSession
    case invalidTimeout
    case matchUnavailable(role: String, label: String)
    case processUnavailable
    case usage

    var errorDescription: String? {
        switch self {
        case .activeWindowUnavailable:
            "The exact isolated ChatGPT window is unavailable or ambiguous."
        case .accessibilityTreeTooLarge:
            "The isolated accessibility tree is too large to verify safely."
        case .accessibilityUnavailable:
            "Accessibility access is unavailable. Use a stable API read method for test evidence."
        case .actionFailed(let status):
            "The isolated accessibility action failed with status \(status)."
        case .ambiguousMatch(let count):
            "The isolated accessibility selector matched \(count) elements; expected exactly one."
        case .invalidLabel:
            "The accessibility label is invalid."
        case .invalidRole:
            "The accessibility role must be an AX role or *."
        case .invalidSession:
            "The ChatGPTX extension test session is invalid."
        case .invalidTimeout:
            "The accessibility wait timeout must be from 0.1 through 30 seconds."
        case .matchUnavailable(let role, let label):
            "The isolated UI did not expose \(role) with the exact label: \(label)"
        case .processUnavailable:
            "The exact isolated ChatGPT process is unavailable."
        case .usage:
            "Use --extension-test-ui press <session> <AXRole> <label>, --extension-test-ui press-wait <session> <AXRole> <label> <AXRole|*> <label> [timeout], or --extension-test-ui wait <session> <AXRole|*> <label> [timeout]."
        }
    }
}
