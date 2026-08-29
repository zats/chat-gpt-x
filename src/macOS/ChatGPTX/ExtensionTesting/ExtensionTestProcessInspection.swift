import Darwin
import Foundation

struct ExtensionTestProcessStartIdentity: Equatable {
    let seconds: UInt64
    let microseconds: UInt64

    var serialized: String {
        let value = String(microseconds)
        let padding = String(repeating: "0", count: max(0, 6 - value.count))
        return "\(seconds).\(padding)\(value)"
    }

    init(seconds: UInt64, microseconds: UInt64) {
        self.seconds = seconds
        self.microseconds = microseconds
    }

    init?(serialized value: String) {
        let parts = value.split(
            separator: ".",
            maxSplits: 1,
            omittingEmptySubsequences: false
        )
        guard parts.count == 2,
            parts[1].count == 6,
            let seconds = UInt64(parts[0]),
            let microseconds = UInt64(parts[1]),
            microseconds < 1_000_000
        else {
            return nil
        }
        self.seconds = seconds
        self.microseconds = microseconds
        guard serialized == value else { return nil }
    }
}

struct ExtensionTestProcessSnapshot {
    let processID: pid_t
    let processGroupID: pid_t
    let userID: uid_t
    let executablePath: String
    let arguments: [String]
    let environment: [String]
    let startIdentity: ExtensionTestProcessStartIdentity
}

struct ExtensionTestProcessInvocation: Equatable {
    let arguments: [String]
    let environment: [String]
}

enum ExtensionTestProcessInspectionResult<Value> {
    case found(Value)
    case notRunning
    case unavailable
}

enum ExtensionTestProcessInspection {
    private struct Metadata: Equatable {
        let processID: pid_t
        let processGroupID: pid_t
        let userID: uid_t
        let startIdentity: ExtensionTestProcessStartIdentity
    }

    static func snapshot(
        for processID: pid_t,
        includeInvocation: Bool = true
    ) -> ExtensionTestProcessInspectionResult<ExtensionTestProcessSnapshot> {
        guard processID > 0 else { return .notRunning }
        let beforeResult = metadata(for: processID)
        guard case .found(let before) = beforeResult else {
            return beforeResult.mapToSnapshotFailure()
        }
        let executableResult = executablePath(for: processID)
        guard case .found(let executablePath) = executableResult else {
            return executableResult.mapToSnapshotFailure()
        }

        let invocation: ExtensionTestProcessInvocation
        if includeInvocation {
            let argumentsResult = rawArguments(for: processID)
            guard case .found(let value) = argumentsResult else {
                return argumentsResult.mapToSnapshotFailure()
            }
            guard let parsed = try? parseInvocation(from: value) else {
                return .unavailable
            }
            invocation = parsed
        } else {
            invocation = ExtensionTestProcessInvocation(
                arguments: [],
                environment: []
            )
        }

        let afterResult = metadata(for: processID)
        guard case .found(let after) = afterResult else {
            return afterResult.mapToSnapshotFailure()
        }
        guard before == after else { return .unavailable }
        return .found(ExtensionTestProcessSnapshot(
            processID: before.processID,
            processGroupID: before.processGroupID,
            userID: before.userID,
            executablePath: executablePath,
            arguments: invocation.arguments,
            environment: invocation.environment,
            startIdentity: before.startIdentity
        ))
    }

    static func processIDs(inGroup processGroupID: pid_t) throws -> [pid_t] {
        guard processGroupID > 0 else {
            throw InspectionError.processListUnavailable
        }
        var capacity = max(Int(proc_listpgrppids(processGroupID, nil, 0)), 16)
        guard capacity > 0 else { return [] }

        for _ in 0..<3 {
            var processIDs = [pid_t](repeating: 0, count: capacity)
            let count = processIDs.withUnsafeMutableBytes { buffer in
                proc_listpgrppids(
                    processGroupID,
                    buffer.baseAddress,
                    Int32(buffer.count)
                )
            }
            guard count >= 0 else {
                throw InspectionError.processListUnavailable
            }
            if count < capacity {
                return Array(processIDs.prefix(Int(count))).filter { $0 > 0 }
            }
            capacity *= 2
        }
        throw InspectionError.processListUnavailable
    }

    static func parseInvocation(
        from data: Data
    ) throws -> ExtensionTestProcessInvocation {
        let bytes = [UInt8](data)
        let countSize = MemoryLayout<CInt>.size
        guard bytes.count >= countSize else {
            throw InspectionError.invalidArguments
        }

        var argumentCount: CInt = 0
        withUnsafeMutableBytes(of: &argumentCount) { destination in
            _ = bytes.withUnsafeBytes { source in
                memcpy(destination.baseAddress, source.baseAddress, countSize)
            }
        }
        guard argumentCount > 0,
            Int(argumentCount) <= bytes.count - countSize
        else {
            throw InspectionError.invalidArguments
        }

        var offset = countSize
        guard let executableEnd = bytes[offset...].firstIndex(of: 0),
            executableEnd > offset
        else {
            throw InspectionError.invalidArguments
        }
        offset = executableEnd + 1
        while offset < bytes.count, bytes[offset] == 0 {
            offset += 1
        }

        var arguments: [String] = []
        arguments.reserveCapacity(Int(argumentCount))
        for _ in 0..<argumentCount {
            guard offset < bytes.count,
                let end = bytes[offset...].firstIndex(of: 0),
                let argument = String(
                    bytes: bytes[offset..<end],
                    encoding: .utf8
                )
            else {
                throw InspectionError.invalidArguments
            }
            arguments.append(argument)
            offset = end + 1
        }
        while offset < bytes.count, bytes[offset] == 0 {
            offset += 1
        }
        var environment: [String] = []
        while offset < bytes.count, bytes[offset] != 0 {
            guard let end = bytes[offset...].firstIndex(of: 0),
                let entry = String(
                    bytes: bytes[offset..<end],
                    encoding: .utf8
                )
            else {
                throw InspectionError.invalidArguments
            }
            environment.append(entry)
            offset = end + 1
        }
        return ExtensionTestProcessInvocation(
            arguments: arguments,
            environment: environment
        )
    }

    private static func metadata(
        for processID: pid_t
    ) -> ExtensionTestProcessInspectionResult<Metadata> {
        var information = proc_bsdinfo()
        let expectedSize = Int32(MemoryLayout<proc_bsdinfo>.stride)
        errno = 0
        let actualSize = withUnsafeMutablePointer(to: &information) {
            proc_pidinfo(
                processID,
                PROC_PIDTBSDINFO,
                0,
                $0,
                expectedSize
            )
        }
        if actualSize == expectedSize {
            guard information.pbi_pid == UInt32(processID),
                information.pbi_pgid > 0,
                information.pbi_pgid <= UInt32(Int32.max),
                information.pbi_start_tvusec < 1_000_000
            else {
                return .unavailable
            }
            return .found(Metadata(
                processID: processID,
                processGroupID: pid_t(information.pbi_pgid),
                userID: information.pbi_uid,
                startIdentity: ExtensionTestProcessStartIdentity(
                    seconds: information.pbi_start_tvsec,
                    microseconds: information.pbi_start_tvusec
                )
            ))
        }
        return actualSize == 0 && (errno == ESRCH || errno == ENOENT)
            ? .notRunning
            : .unavailable
    }

    private static func executablePath(
        for processID: pid_t
    ) -> ExtensionTestProcessInspectionResult<String> {
        var buffer = [CChar](
            repeating: 0,
            count: Int(PATH_MAX) * 4
        )
        errno = 0
        let length = proc_pidpath(
            processID,
            &buffer,
            UInt32(buffer.count)
        )
        if length > 0, Int(length) < buffer.count {
            let pathBytes = buffer.prefix(Int(length)).prefix { $0 != 0 }
                .map { UInt8(bitPattern: $0) }
            if let path = String(bytes: pathBytes, encoding: .utf8),
                path.hasPrefix("/")
            {
                return .found(path)
            }
        }
        return errno == ESRCH || errno == ENOENT
            ? .notRunning
            : .unavailable
    }

    private static func rawArguments(
        for processID: pid_t
    ) -> ExtensionTestProcessInspectionResult<Data> {
        var maximumName = [CInt](arrayLiteral: CTL_KERN, KERN_ARGMAX)
        var maximumSize: CInt = 0
        var maximumSizeLength = MemoryLayout<CInt>.size
        guard sysctl(
            &maximumName,
            UInt32(maximumName.count),
            &maximumSize,
            &maximumSizeLength,
            nil,
            0
        ) == 0,
            maximumSizeLength == MemoryLayout<CInt>.size,
            maximumSize >= CInt(MemoryLayout<CInt>.size),
            maximumSize <= 16 * 1_024 * 1_024
        else {
            return .unavailable
        }

        var name = [CInt](arrayLiteral: CTL_KERN, KERN_PROCARGS2, processID)
        var data = Data(count: Int(maximumSize))
        var actualSize = data.count
        errno = 0
        let status = data.withUnsafeMutableBytes { buffer in
            sysctl(
                &name,
                UInt32(name.count),
                buffer.baseAddress,
                &actualSize,
                nil,
                0
            )
        }
        guard status == 0,
            actualSize >= MemoryLayout<CInt>.size,
            actualSize <= data.count
        else {
            return errno == ESRCH || errno == ENOENT
                ? .notRunning
                : .unavailable
        }
        data.removeSubrange(actualSize..<data.count)
        return .found(data)
    }
}

private extension ExtensionTestProcessInspectionResult {
    func mapToSnapshotFailure<T>()
        -> ExtensionTestProcessInspectionResult<T>
    {
        switch self {
        case .found:
            .unavailable
        case .notRunning:
            .notRunning
        case .unavailable:
            .unavailable
        }
    }
}

private enum InspectionError: Error {
    case invalidArguments
    case processListUnavailable
}
