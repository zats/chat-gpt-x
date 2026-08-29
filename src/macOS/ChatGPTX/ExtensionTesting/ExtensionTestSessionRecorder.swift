import AppKit
import Darwin
import Foundation

enum ExtensionTestSessionRecorder {
    private static let flag = "--extension-test-process"
    private static let marker = "chatgptx-extension-test-v1"
    private static let bundleIdentifier = "com.openai.codex"
    private static let rootEnvironmentKey = "CHATGPTX_EXTENSION_TEST_ROOT"
    private static let recorderEnvironmentKey =
        "CHATGPTX_EXTENSION_TEST_RECORDER"
    private static let anchorName = ".chatgpt-executable"
    private static let recorderScriptName = "record-test-session.cjs"

    private struct Session {
        let directoryURL: URL
        let profileURL: URL
        let codexHomeURL: URL
        let processGroupURL: URL

        var anchorURL: URL {
            directoryURL.appendingPathComponent(anchorName)
        }

        var recorderScriptURL: URL {
            directoryURL.appendingPathComponent(recorderScriptName)
        }
    }

    private struct ProcessRecord {
        let processID: pid_t
        let appPath: String
        let startIdentity: ExtensionTestProcessStartIdentity

        var data: Data {
            Data("\(appPath)\n\(startIdentity.serialized)\n".utf8)
        }
    }

    private struct ValidatedGroup {
        let processGroupID: pid_t
        let memberIDs: [pid_t]
    }

    private final class OpenedCleanupSession {
        let parentDescriptor: Int32
        let sessionDescriptor: Int32
        let name: String
        let device: dev_t
        let inode: ino_t

        init(
            parentDescriptor: Int32,
            sessionDescriptor: Int32,
            name: String,
            device: dev_t,
            inode: ino_t
        ) {
            self.parentDescriptor = parentDescriptor
            self.sessionDescriptor = sessionDescriptor
            self.name = name
            self.device = device
            self.inode = inode
        }

        deinit {
            _ = Darwin.close(sessionDescriptor)
            _ = Darwin.close(parentDescriptor)
        }
    }

    enum RecordedLeaderDecision: Equatable {
        case live
        case orphaned
        case stale
        case reject
    }

    static func runIfRequested(arguments: [String]) -> Int32? {
        guard arguments.first == flag else { return nil }
        do {
            guard arguments.count >= 3 else { throw RecorderError.usage }
            let sessionPath = arguments[2]
            switch arguments[1] {
            case "record":
                guard arguments.count == 4,
                    let processID = pid_t(arguments[3]),
                    processID > 1
                else {
                    throw RecorderError.usage
                }
                try record(
                    sessionPath: sessionPath,
                    processID: processID,
                    application: nil
                )
                return EXIT_SUCCESS
            case "list":
                guard arguments.count == 3 else {
                    throw RecorderError.usage
                }
                let output = try listedProcessIDs(sessionPath: sessionPath)
                    .map(String.init).joined(separator: "\n")
                if !output.isEmpty {
                    FileHandle.standardOutput.write(Data("\(output)\n".utf8))
                }
                return EXIT_SUCCESS
            case "signal":
                guard arguments.count == 4 else {
                    throw RecorderError.usage
                }
                let signal: Int32
                switch arguments[3] {
                case "TERM":
                    signal = SIGTERM
                case "KILL":
                    signal = SIGKILL
                default:
                    throw RecorderError.usage
                }
                try signalValidatedGroups(
                    sessionPath: sessionPath,
                    signal: signal
                )
                return EXIT_SUCCESS
            case "purge":
                guard arguments.count == 3 else {
                    throw RecorderError.usage
                }
                try purge(sessionPath: sessionPath)
                return EXIT_SUCCESS
            case "remove":
                guard arguments.count == 3 else {
                    throw RecorderError.usage
                }
                try remove(sessionPath: sessionPath)
                return EXIT_SUCCESS
            default:
                throw RecorderError.usage
            }
        } catch {
            FileHandle.standardError.write(
                Data("\(error.localizedDescription)\n".utf8)
            )
            return EXIT_FAILURE
        }
    }

    static func purge(sessionPath: String) throws {
        let session = try openCleanupSession(at: sessionPath)
        for name in ["codex-home", "electron-profile", "test-package"] {
            try removeEntry(
                named: name,
                from: session.sessionDescriptor,
                rootDevice: session.device,
                depth: 0
            )
        }
        try requireCurrentSessionPath(session)
    }

    static func remove(
        sessionPath: String,
        beforeFinalRemoval: (() throws -> Void)? = nil
    ) throws {
        let session = try openCleanupSession(at: sessionPath)
        try removeDirectoryContents(
            session.sessionDescriptor,
            rootDevice: session.device,
            depth: 0
        )
        try beforeFinalRemoval?()

        try requireCurrentSessionPath(session)
        guard
            unlinkat(
                session.parentDescriptor,
                session.name,
                AT_REMOVEDIR
            ) == 0
        else {
            throw RecorderError.cleanupFailed
        }
    }

    static func prepare(
        sessionPath: String,
        executableURL: URL,
        arguments: [String]
    ) throws {
        let session = try validatedCompleteSession(at: sessionPath)
        try requireExactEnvironment(for: session)
        try requireRegularFile(
            session.recorderScriptURL,
            requiredPermissions: 0o600
        )

        let canonicalExecutableURL = executableURL.standardizedFileURL
            .resolvingSymlinksInPath()
        let appURL = try appURL(forExecutableURL: canonicalExecutableURL)
        guard let bundle = Bundle(url: appURL),
            bundle.bundleIdentifier == bundleIdentifier,
            let bundleExecutableURL = bundle.executableURL,
            bundleExecutableURL.standardizedFileURL.resolvingSymlinksInPath()
                == canonicalExecutableURL,
            FileManager.default.isExecutableFile(
                atPath: canonicalExecutableURL.path
            )
        else {
            throw RecorderError.invalidApplication
        }
        guard hasExactProfileArgument(
            arguments,
            profileURL: session.profileURL
        ) else {
            throw RecorderError.invalidProfileArgument
        }

        let anchor = Data("\(canonicalExecutableURL.path)\n".utf8)
        guard try publishExclusive(anchor, at: session.anchorURL) else {
            throw RecorderError.invalidRecord
        }
    }

    static func recorderScriptURL(sessionPath: String) -> URL {
        URL(fileURLWithPath: sessionPath).standardizedFileURL
            .appendingPathComponent(recorderScriptName)
    }

    static func record(_ application: NSRunningApplication) throws {
        guard let sessionPath = ProcessInfo.processInfo.environment[
            rootEnvironmentKey
        ] else {
            throw RecorderError.invalidSession
        }
        try record(
            sessionPath: sessionPath,
            processID: application.processIdentifier,
            application: application
        )
    }

    static func validateRecordedProcess(
        sessionPath: String,
        processID: pid_t
    ) throws -> ExtensionTestProcessSnapshot {
        let session = try validatedCompleteSession(at: sessionPath)
        let executablePath = try readAnchor(for: session)
        let appURL = try appURL(
            forExecutableURL: URL(fileURLWithPath: executablePath)
        )
        let records = try processRecords(
            for: session,
            expectedAppPath: appURL.path
        )
        guard let record = records.first(where: {
            $0.processID == processID
        }) else {
            throw RecorderError.invalidRecord
        }
        return try validatedSnapshot(
            processID: processID,
            session: session,
            executablePath: executablePath,
            record: record,
            requireProfileArgument: true
        )
    }

    private static func record(
        sessionPath: String,
        processID: pid_t,
        application: NSRunningApplication?
    ) throws {
        let session = try validatedCompleteSession(at: sessionPath)
        let executablePath = try readAnchor(for: session)
        let executableURL = URL(fileURLWithPath: executablePath)
        let appURL = try appURL(forExecutableURL: executableURL)
        if let application {
            guard application.processIdentifier == processID,
                application.bundleIdentifier == bundleIdentifier,
                let applicationExecutableURL = application.executableURL,
                applicationExecutableURL.standardizedFileURL
                    .resolvingSymlinksInPath() == executableURL
            else {
                throw RecorderError.invalidProcess
            }
        }

        let existingRecords = try processRecords(
            for: session,
            expectedAppPath: appURL.path
        )
        let snapshot = try currentSnapshot(
            processID: processID,
            session: session,
            executablePath: executablePath
        )
        guard snapshot.processGroupID == processID else {
            throw RecorderError.invalidProcess
        }

        let record = ProcessRecord(
            processID: processID,
            appPath: appURL.path,
            startIdentity: snapshot.startIdentity
        )
        if let existing = existingRecords.first(where: {
            $0.processID == processID
        }) {
            guard existing.data == record.data else {
                throw RecorderError.invalidRecord
            }
        } else {
            try publishOrValidate(
                record.data,
                at: session.processGroupURL.appendingPathComponent(
                    String(processID)
                )
            )
        }
        try replaceRegularFile(
            Data("\(processID)\n".utf8),
            at: session.directoryURL.appendingPathComponent("app.pid")
        )
    }

    private static func currentSnapshot(
        processID: pid_t,
        session: Session,
        executablePath: String
    ) throws -> ExtensionTestProcessSnapshot {
        guard case .found(let snapshot) =
            ExtensionTestProcessInspection.snapshot(for: processID),
            snapshot.userID == getuid(),
            canonicalPath(snapshot.executablePath) == executablePath,
            hasExactProfileArgument(
                snapshot.arguments,
                profileURL: session.profileURL
            )
        else {
            throw RecorderError.invalidProcess
        }
        return snapshot
    }

    private static func validatedSnapshot(
        processID: pid_t,
        session: Session,
        executablePath: String,
        record: ProcessRecord,
        requireProfileArgument: Bool
    ) throws -> ExtensionTestProcessSnapshot {
        guard case .found(let snapshot) =
            ExtensionTestProcessInspection.snapshot(
                for: processID,
                includeInvocation: requireProfileArgument
            ),
            snapshot.userID == getuid(),
            snapshot.processGroupID == processID,
            canonicalPath(snapshot.executablePath) == executablePath,
            snapshot.startIdentity == record.startIdentity,
            !requireProfileArgument || hasExactProfileArgument(
                snapshot.arguments,
                profileURL: session.profileURL
            )
        else {
            throw RecorderError.invalidProcess
        }
        return snapshot
    }

    private static func validatedGroups(
        at sessionPath: String
    ) throws -> [ValidatedGroup] {
        let session = try validatedBaseSession(at: sessionPath)
        let executablePath = try readAnchor(for: session)
        let appURL = try appURL(
            forExecutableURL: URL(fileURLWithPath: executablePath)
        )
        let records = try processRecords(
            for: session,
            expectedAppPath: appURL.path
        )
        var groups: [ValidatedGroup] = []
        for record in records {
            let listedMemberIDs = try ExtensionTestProcessInspection
                .processIDs(inGroup: record.processID)
            let leaderResult = ExtensionTestProcessInspection.snapshot(
                for: record.processID,
                includeInvocation: false
            )
            let leader: ExtensionTestProcessSnapshot?
            switch leaderResult {
            case .found(let value):
                leader = value
            case .notRunning:
                leader = nil
            case .unavailable:
                throw RecorderError.invalidRecord
            }
            let leaderDecision = recordedLeaderDecision(
                processGroupID: record.processID,
                recordedStartIdentity: record.startIdentity,
                listedMemberIDs: listedMemberIDs,
                currentLeader: leader
            )
            guard leaderDecision != .reject else {
                throw RecorderError.invalidRecord
            }
            if leaderDecision == .stale {
                groups.append(ValidatedGroup(
                    processGroupID: record.processID,
                    memberIDs: []
                ))
                continue
            }
            let leaderIsValid = leaderDecision == .live

            var memberIDs: [pid_t] = []
            for memberID in listedMemberIDs {
                switch ExtensionTestProcessInspection.snapshot(
                    for: memberID,
                    includeInvocation: !leaderIsValid
                ) {
                case .found(let member):
                    guard member.userID == getuid(),
                        member.processGroupID == record.processID,
                        leaderIsValid || hasExactSessionRoot(
                            member.environment,
                            sessionPath: session.directoryURL.path
                        )
                    else {
                        throw RecorderError.invalidRecord
                    }
                    memberIDs.append(memberID)
                case .notRunning:
                    continue
                case .unavailable:
                    throw RecorderError.invalidRecord
                }
            }
            groups.append(ValidatedGroup(
                processGroupID: record.processID,
                memberIDs: Set(memberIDs).sorted()
            ))
        }
        return groups
    }

    static func listedProcessIDs(sessionPath: String) throws -> [pid_t] {
        Set(try validatedGroups(at: sessionPath).flatMap(\.memberIDs))
            .sorted()
    }

    static func signalValidatedGroups(
        sessionPath: String,
        signal: Int32
    ) throws {
        guard signal == SIGTERM || signal == SIGKILL else {
            throw RecorderError.usage
        }
        let groups = try validatedGroups(at: sessionPath)
            .filter { !$0.memberIDs.isEmpty }
        for group in groups {
            if killpg(group.processGroupID, signal) != 0, errno != ESRCH {
                throw RecorderError.signalFailed
            }
        }
    }

    static func recordedLeaderDecision(
        processGroupID: pid_t,
        recordedStartIdentity: ExtensionTestProcessStartIdentity,
        listedMemberIDs: [pid_t],
        currentLeader: ExtensionTestProcessSnapshot?
    ) -> RecordedLeaderDecision {
        guard !listedMemberIDs.isEmpty else { return .stale }
        guard let currentLeader else { return .orphaned }
        guard currentLeader.processID == processGroupID else {
            return .reject
        }
        guard currentLeader.startIdentity == recordedStartIdentity else {
            return .stale
        }
        guard
            currentLeader.processGroupID == processGroupID,
            currentLeader.userID == getuid()
        else {
            return .reject
        }
        return .live
    }

    static func hasExactSessionRoot(
        _ environment: [String],
        sessionPath: String
    ) -> Bool {
        let key = "CHATGPTX_EXTENSION_TEST_ROOT="
        return environment.filter { $0.hasPrefix(key) }
            == ["\(key)\(sessionPath)"]
    }

    private static func validatedCompleteSession(
        at requestedPath: String
    ) throws -> Session {
        let session = try validatedBaseSession(at: requestedPath)
        try requireDirectory(
            session.profileURL,
            requiredPermissions: 0o700
        )
        try requireDirectory(
            session.codexHomeURL,
            requiredPermissions: 0o700
        )
        return session
    }

    private static func validatedBaseSession(at requestedPath: String) throws
        -> Session
    {
        guard requestedPath.hasPrefix("/") else {
            throw RecorderError.invalidSession
        }
        let requestedURL = URL(fileURLWithPath: requestedPath)
            .standardizedFileURL
        try requireDirectory(
            requestedURL,
            requiredPermissions: 0o700
        )
        let sessionURL = requestedURL.resolvingSymlinksInPath()
            .standardizedFileURL
        let temporaryURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .resolvingSymlinksInPath().standardizedFileURL
        guard sessionURL == requestedURL,
            sessionURL.deletingLastPathComponent().path == temporaryURL.path,
            sessionURL.lastPathComponent.hasPrefix(
                "chatgptx-extension-test."
            )
        else {
            throw RecorderError.invalidSession
        }

        let markerURL = sessionURL.appendingPathComponent(
            ".chatgptx-extension-test"
        )
        guard try String(
            decoding: readRegularFile(
                markerURL,
                requiredPermissions: 0o600
            ),
            as: UTF8.self
        ).trimmingCharacters(in: .newlines) == marker else {
            throw RecorderError.invalidSession
        }

        let profileURL = sessionURL.appendingPathComponent(
            "electron-profile",
            isDirectory: true
        )
        let codexHomeURL = sessionURL.appendingPathComponent(
            "codex-home",
            isDirectory: true
        )
        let processGroupURL = sessionURL.appendingPathComponent(
            "process-groups",
            isDirectory: true
        )
        try requireDirectory(
            processGroupURL,
            requiredPermissions: 0o700
        )
        return Session(
            directoryURL: sessionURL,
            profileURL: profileURL,
            codexHomeURL: codexHomeURL,
            processGroupURL: processGroupURL
        )
    }

    private static func requireExactEnvironment(for session: Session) throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment[rootEnvironmentKey].map(canonicalPath)
                == session.directoryURL.path,
            environment["CODEX_HOME"].map(canonicalPath)
                == session.codexHomeURL.path,
            let recorderPath = environment[recorderEnvironmentKey],
            recorderPath.hasPrefix("/"),
            canonicalPath(recorderPath) == Bundle.main.executableURL.map({
                $0.standardizedFileURL.resolvingSymlinksInPath().path
            })
        else {
            throw RecorderError.invalidSession
        }
    }

    private static func readAnchor(for session: Session) throws -> String {
        let data = try readRegularFile(
            session.anchorURL,
            requiredPermissions: 0o600
        )
        guard let value = String(data: data, encoding: .utf8),
            value.last == "\n",
            !value.dropLast().contains("\n")
        else {
            throw RecorderError.invalidRecord
        }
        let path = String(value.dropLast())
        guard path.hasPrefix("/"), canonicalPath(path) == path else {
            throw RecorderError.invalidRecord
        }
        let executableURL = URL(fileURLWithPath: path)
        let appURL = try appURL(forExecutableURL: executableURL)
        guard let bundle = Bundle(url: appURL),
            bundle.bundleIdentifier == bundleIdentifier,
            let bundleExecutableURL = bundle.executableURL,
            bundleExecutableURL.standardizedFileURL.resolvingSymlinksInPath()
                == executableURL
        else {
            throw RecorderError.invalidRecord
        }
        return path
    }

    private static func processRecords(
        for session: Session,
        expectedAppPath: String
    ) throws -> [ProcessRecord] {
        let recordURLs = try FileManager.default.contentsOfDirectory(
            at: session.processGroupURL,
            includingPropertiesForKeys: nil,
            options: []
        ).sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try recordURLs.map { url in
            guard let processID = pid_t(url.lastPathComponent),
                processID > 1
            else {
                throw RecorderError.invalidRecord
            }
            let data = try readRegularFile(
                url,
                requiredPermissions: 0o600
            )
            guard let value = String(data: data, encoding: .utf8) else {
                throw RecorderError.invalidRecord
            }
            let lines = value.split(
                separator: "\n",
                omittingEmptySubsequences: false
            )
            guard lines.count == 3,
                lines[2].isEmpty,
                String(lines[0]) == expectedAppPath,
                let startIdentity = ExtensionTestProcessStartIdentity(
                    serialized: String(lines[1])
                )
            else {
                throw RecorderError.invalidRecord
            }
            return ProcessRecord(
                processID: processID,
                appPath: String(lines[0]),
                startIdentity: startIdentity
            )
        }
    }

    static func hasExactProfileArgument(
        _ arguments: [String],
        profileURL: URL
    ) -> Bool {
        let profileArguments = arguments.filter {
            $0.hasPrefix("--user-data-dir=")
        }
        guard profileArguments.count == 1,
            let argument = profileArguments.first
        else {
            return false
        }
        let path = String(argument.dropFirst("--user-data-dir=".count))
        return path.hasPrefix("/")
            && canonicalPath(path) == profileURL.path
    }

    private static func appURL(forExecutableURL executableURL: URL) throws
        -> URL
    {
        let canonicalExecutableURL = executableURL.standardizedFileURL
            .resolvingSymlinksInPath()
        guard canonicalExecutableURL.lastPathComponent == "ChatGPT",
            canonicalExecutableURL.deletingLastPathComponent()
                .lastPathComponent == "MacOS",
            canonicalExecutableURL.deletingLastPathComponent()
                .deletingLastPathComponent().lastPathComponent == "Contents"
        else {
            throw RecorderError.invalidProcess
        }
        return canonicalExecutableURL.deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func canonicalPath(_ path: String) -> String {
        URL(fileURLWithPath: path).standardizedFileURL
            .resolvingSymlinksInPath().path
    }

    private static func openCleanupSession(
        at requestedPath: String
    ) throws -> OpenedCleanupSession {
        guard requestedPath.hasPrefix("/") else {
            throw RecorderError.invalidSession
        }
        let requestedURL = URL(fileURLWithPath: requestedPath)
            .standardizedFileURL
        let temporaryURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .resolvingSymlinksInPath().standardizedFileURL
        let name = requestedURL.lastPathComponent
        guard requestedURL.deletingLastPathComponent() == temporaryURL,
            name.hasPrefix("chatgptx-extension-test.")
        else {
            throw RecorderError.invalidSession
        }

        let parentDescriptor = open(
            temporaryURL.path,
            O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
        )
        guard parentDescriptor >= 0 else {
            throw RecorderError.invalidSession
        }
        let sessionDescriptor = openat(
            parentDescriptor,
            name,
            O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
        )
        guard sessionDescriptor >= 0 else {
            _ = Darwin.close(parentDescriptor)
            throw RecorderError.invalidSession
        }
        var keepDescriptors = false
        defer {
            if !keepDescriptors {
                _ = Darwin.close(sessionDescriptor)
                _ = Darwin.close(parentDescriptor)
            }
        }

        var information = stat()
        var pathInformation = stat()
        guard fstat(sessionDescriptor, &information) == 0,
            fstatat(
                parentDescriptor,
                name,
                &pathInformation,
                AT_SYMLINK_NOFOLLOW
            ) == 0,
            information.st_mode & S_IFMT == S_IFDIR,
            information.st_mode & 0o7777 == 0o700,
            information.st_uid == getuid(),
            pathInformation.st_dev == information.st_dev,
            pathInformation.st_ino == information.st_ino
        else {
            throw RecorderError.invalidSession
        }
        guard try readRegularFile(
            in: sessionDescriptor,
            named: ".chatgptx-extension-test",
            requiredPermissions: 0o600
        ) == Data("\(marker)\n".utf8) else {
            throw RecorderError.invalidSession
        }
        keepDescriptors = true
        return OpenedCleanupSession(
            parentDescriptor: parentDescriptor,
            sessionDescriptor: sessionDescriptor,
            name: name,
            device: information.st_dev,
            inode: information.st_ino
        )
    }

    private static func requireCurrentSessionPath(
        _ session: OpenedCleanupSession
    ) throws {
        var current = stat()
        guard fstatat(
            session.parentDescriptor,
            session.name,
            &current,
            AT_SYMLINK_NOFOLLOW
        ) == 0,
            current.st_mode & S_IFMT == S_IFDIR,
            current.st_dev == session.device,
            current.st_ino == session.inode
        else {
            throw RecorderError.cleanupFailed
        }
    }

    private static func removeDirectoryContents(
        _ directoryDescriptor: Int32,
        rootDevice: dev_t,
        depth: Int
    ) throws {
        guard depth <= 128 else { throw RecorderError.cleanupFailed }
        for name in try directoryEntryNames(directoryDescriptor) {
            try name.withUnsafeBufferPointer { buffer in
                guard let pointer = buffer.baseAddress else {
                    throw RecorderError.cleanupFailed
                }
                try removeEntry(
                    named: pointer,
                    from: directoryDescriptor,
                    rootDevice: rootDevice,
                    depth: depth
                )
            }
        }
        guard try directoryEntryNames(directoryDescriptor).isEmpty else {
            throw RecorderError.cleanupFailed
        }
    }

    private static func removeEntry(
        named name: String,
        from parentDescriptor: Int32,
        rootDevice: dev_t,
        depth: Int
    ) throws {
        try name.withCString {
            try removeEntry(
                named: $0,
                from: parentDescriptor,
                rootDevice: rootDevice,
                depth: depth
            )
        }
    }

    private static func removeEntry(
        named name: UnsafePointer<CChar>,
        from parentDescriptor: Int32,
        rootDevice: dev_t,
        depth: Int
    ) throws {
        var information = stat()
        if fstatat(
            parentDescriptor,
            name,
            &information,
            AT_SYMLINK_NOFOLLOW
        ) != 0 {
            guard errno == ENOENT else {
                throw RecorderError.cleanupFailed
            }
            return
        }

        guard information.st_mode & S_IFMT == S_IFDIR else {
            if unlinkat(parentDescriptor, name, 0) != 0, errno != ENOENT {
                throw RecorderError.cleanupFailed
            }
            return
        }
        guard information.st_dev == rootDevice else {
            throw RecorderError.cleanupFailed
        }

        let childDescriptor = openat(
            parentDescriptor,
            name,
            O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
        )
        guard childDescriptor >= 0 else {
            throw RecorderError.cleanupFailed
        }
        var openedInformation = stat()
        guard fstat(childDescriptor, &openedInformation) == 0,
            openedInformation.st_mode & S_IFMT == S_IFDIR,
            openedInformation.st_dev == information.st_dev,
            openedInformation.st_ino == information.st_ino
        else {
            _ = Darwin.close(childDescriptor)
            throw RecorderError.cleanupFailed
        }
        do {
            try removeDirectoryContents(
                childDescriptor,
                rootDevice: rootDevice,
                depth: depth + 1
            )
        } catch {
            _ = Darwin.close(childDescriptor)
            throw error
        }
        _ = Darwin.close(childDescriptor)

        var currentInformation = stat()
        guard fstatat(
            parentDescriptor,
            name,
            &currentInformation,
            AT_SYMLINK_NOFOLLOW
        ) == 0,
            currentInformation.st_mode & S_IFMT == S_IFDIR,
            currentInformation.st_dev == openedInformation.st_dev,
            currentInformation.st_ino == openedInformation.st_ino,
            unlinkat(parentDescriptor, name, AT_REMOVEDIR) == 0
        else {
            throw RecorderError.cleanupFailed
        }
    }

    private static func directoryEntryNames(
        _ directoryDescriptor: Int32
    ) throws -> [[CChar]] {
        let scanDescriptor = openat(
            directoryDescriptor,
            ".",
            O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
        )
        guard scanDescriptor >= 0 else {
            throw RecorderError.cleanupFailed
        }
        guard let directory = fdopendir(scanDescriptor) else {
            _ = Darwin.close(scanDescriptor)
            throw RecorderError.cleanupFailed
        }
        defer { closedir(directory) }

        var names: [[CChar]] = []
        while true {
            errno = 0
            guard let entry = readdir(directory) else {
                guard errno == 0 else {
                    throw RecorderError.cleanupFailed
                }
                break
            }
            let length = Int(entry.pointee.d_namlen)
            var name = [CChar](repeating: 0, count: length + 1)
            _ = withUnsafeBytes(of: entry.pointee.d_name) { source in
                name.withUnsafeMutableBytes { destination in
                    memcpy(
                        destination.baseAddress,
                        source.baseAddress,
                        length
                    )
                }
            }
            if name == [CChar(46), 0]
                || name == [CChar(46), CChar(46), 0]
            {
                continue
            }
            names.append(name)
        }
        return names
    }

    private static func readRegularFile(
        in directoryDescriptor: Int32,
        named name: String,
        requiredPermissions: mode_t
    ) throws -> Data {
        let descriptor = openat(
            directoryDescriptor,
            name,
            O_RDONLY | O_NOFOLLOW | O_CLOEXEC
        )
        guard descriptor >= 0 else { throw RecorderError.invalidSession }
        defer { _ = Darwin.close(descriptor) }
        var information = stat()
        guard fstat(descriptor, &information) == 0,
            information.st_mode & S_IFMT == S_IFREG,
            information.st_mode & 0o7777 == requiredPermissions,
            information.st_uid == getuid(),
            information.st_size >= 0,
            information.st_size <= 64 * 1_024
        else {
            throw RecorderError.invalidSession
        }
        var data = Data(count: Int(information.st_size))
        let readAll = data.withUnsafeMutableBytes { buffer -> Bool in
            var offset = 0
            while offset < buffer.count {
                let count = Darwin.read(
                    descriptor,
                    buffer.baseAddress?.advanced(by: offset),
                    buffer.count - offset
                )
                if count < 0, errno == EINTR { continue }
                guard count > 0 else { return false }
                offset += count
            }
            return true
        }
        guard readAll else { throw RecorderError.invalidSession }
        return data
    }

    private static func publishOrValidate(_ data: Data, at url: URL) throws {
        if try publishExclusive(data, at: url) { return }
        guard try readRegularFile(url, requiredPermissions: 0o600) == data else {
            throw RecorderError.invalidRecord
        }
    }

    private static func publishExclusive(_ data: Data, at url: URL) throws
        -> Bool
    {
        let parentURL = url.deletingLastPathComponent()
        let stagingURL = parentURL.lastPathComponent == "process-groups"
            ? parentURL.deletingLastPathComponent()
            : parentURL
        let temporaryURL = stagingURL
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString)")
        try writeNewFile(data, at: temporaryURL)
        defer { _ = unlink(temporaryURL.path) }
        if link(temporaryURL.path, url.path) == 0 { return true }
        guard errno == EEXIST else { throw RecorderError.invalidRecord }
        return false
    }

    private static func replaceRegularFile(_ data: Data, at url: URL) throws {
        if lstatExists(url) {
            try requireRegularFile(url, requiredPermissions: 0o600)
        }
        let temporaryURL = url.deletingLastPathComponent()
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString)")
        try writeNewFile(data, at: temporaryURL)
        defer { _ = unlink(temporaryURL.path) }
        guard rename(temporaryURL.path, url.path) == 0 else {
            throw RecorderError.invalidRecord
        }
    }

    private static func writeNewFile(_ data: Data, at url: URL) throws {
        let descriptor = open(
            url.path,
            O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
            mode_t(0o600)
        )
        guard descriptor >= 0 else { throw RecorderError.invalidRecord }
        var succeeded = false
        defer {
            _ = close(descriptor)
            if !succeeded { _ = unlink(url.path) }
        }
        let wroteAll = data.withUnsafeBytes { buffer -> Bool in
            var offset = 0
            while offset < buffer.count {
                let count = Darwin.write(
                    descriptor,
                    buffer.baseAddress?.advanced(by: offset),
                    buffer.count - offset
                )
                if count < 0, errno == EINTR { continue }
                guard count > 0 else { return false }
                offset += count
            }
            return true
        }
        guard wroteAll, fsync(descriptor) == 0 else {
            throw RecorderError.invalidRecord
        }
        succeeded = true
    }

    private static func readRegularFile(
        _ url: URL,
        requiredPermissions: mode_t? = nil
    ) throws -> Data {
        let descriptor = open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else { throw RecorderError.invalidRecord }
        defer { _ = close(descriptor) }
        var information = stat()
        guard fstat(descriptor, &information) == 0,
            information.st_mode & S_IFMT == S_IFREG,
            information.st_uid == getuid(),
            information.st_size >= 0,
            information.st_size <= 64 * 1_024,
            requiredPermissions.map({
                information.st_mode & 0o7777 == $0
            }) ?? true
        else {
            throw RecorderError.invalidRecord
        }
        var data = Data(count: Int(information.st_size))
        let readAll = data.withUnsafeMutableBytes { buffer -> Bool in
            var offset = 0
            while offset < buffer.count {
                let count = Darwin.read(
                    descriptor,
                    buffer.baseAddress?.advanced(by: offset),
                    buffer.count - offset
                )
                if count < 0, errno == EINTR { continue }
                guard count > 0 else { return false }
                offset += count
            }
            return true
        }
        guard readAll else { throw RecorderError.invalidRecord }
        return data
    }

    private static func requireDirectory(
        _ url: URL,
        requiredPermissions: mode_t? = nil
    ) throws {
        var information = stat()
        guard lstat(url.path, &information) == 0,
            information.st_mode & S_IFMT == S_IFDIR,
            information.st_uid == getuid(),
            requiredPermissions.map({
                information.st_mode & 0o7777 == $0
            }) ?? true
        else {
            throw RecorderError.invalidSession
        }
    }

    private static func requireRegularFile(
        _ url: URL,
        requiredPermissions: mode_t? = nil
    ) throws {
        _ = try readRegularFile(
            url,
            requiredPermissions: requiredPermissions
        )
    }

    private static func lstatExists(_ url: URL) -> Bool {
        var information = stat()
        return lstat(url.path, &information) == 0
    }
}

private enum RecorderError: LocalizedError {
    case cleanupFailed
    case invalidApplication
    case invalidProfileArgument
    case invalidProcess
    case invalidRecord
    case invalidSession
    case signalFailed
    case usage

    var errorDescription: String? {
        switch self {
        case .cleanupFailed:
            "ChatGPTX could not remove the extension test data safely."
        case .invalidApplication:
            "ChatGPTX could not verify the installed ChatGPT application for the isolated test."
        case .invalidProfileArgument:
            "ChatGPTX requires one exact isolated profile argument for the extension test."
        case .invalidProcess:
            "ChatGPTX could not verify the exact isolated ChatGPT process."
        case .invalidRecord:
            "The isolated ChatGPT process record is invalid."
        case .invalidSession:
            "The ChatGPTX extension test session is invalid."
        case .signalFailed:
            "ChatGPTX could not signal the isolated process group."
        case .usage:
            "Use --extension-test-process record <session> <pid>, list <session>, signal <session> TERM|KILL, purge <session>, or remove <session>."
        }
    }
}
