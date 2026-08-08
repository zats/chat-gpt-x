import AppKit
import CryptoKit
import Darwin
import Foundation

@_silgen_name("flock")
nonisolated private func chatGPTXFlock(
    _ fileDescriptor: Int32,
    _ operation: Int32
) -> Int32

struct ChatGPTLaunchReservation {
    let token: String

    private let fileManager: FileManager
    private let fileURL: URL
    private let storedReservation: StoredLaunchReservation

    fileprivate init(
        fileManager: FileManager,
        fileURL: URL,
        storedReservation: StoredLaunchReservation
    ) {
        token = storedReservation.token
        self.fileManager = fileManager
        self.fileURL = fileURL
        self.storedReservation = storedReservation
    }

    func bind(to processIdentifier: pid_t) throws {
        let reservation = StoredLaunchReservation(
            schemaVersion: storedReservation.schemaVersion,
            applicationPath: storedReservation.applicationPath,
            createdAt: storedReservation.createdAt,
            ownerProcessIdentifier: storedReservation.ownerProcessIdentifier,
            ownerLaunchDate: storedReservation.ownerLaunchDate,
            applicationProcessIdentifier: processIdentifier,
            token: storedReservation.token
        )
        let data = try JSONEncoder().encode(reservation)
        let temporaryURL = fileURL
            .deletingLastPathComponent()
            .appendingPathComponent(".\(UUID().uuidString).tmp")
        defer { try? fileManager.removeItem(at: temporaryURL) }

        try data.write(to: temporaryURL, options: .withoutOverwriting)
        try fileManager.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: temporaryURL.path
        )
        guard Darwin.rename(temporaryURL.path, fileURL.path) == 0 else {
            let errorCode = POSIXErrorCode(rawValue: errno) ?? .EIO
            throw POSIXError(errorCode)
        }
    }

    func cancel() {
        try? fileManager.removeItem(at: fileURL)
    }
}

struct ChatGPTLaunchReservationStore {
    private static let schemaVersion = 2
    private static let reservationLifetime: TimeInterval = 30

    private let fileManager: FileManager
    private let directoryURL: URL

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.directoryURL = directoryURL
            ?? fileManager.temporaryDirectory
                .appendingPathComponent(
                    "com.chatgptx.launcher",
                    isDirectory: true
                )
                .appendingPathComponent(
                    "launch-reservations",
                    isDirectory: true
                )
    }

    func reserve(
        applicationURL: URL,
        now: Date = Date()
    ) throws -> ChatGPTLaunchReservation {
        try fileManager.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        removeExpiredReservations(now: now)

        let token = UUID().uuidString
        let reservation = StoredLaunchReservation(
            schemaVersion: Self.schemaVersion,
            applicationPath: Self.canonicalPath(applicationURL),
            createdAt: now,
            ownerProcessIdentifier: ProcessInfo.processInfo.processIdentifier,
            ownerLaunchDate: NSRunningApplication(
                processIdentifier: ProcessInfo.processInfo.processIdentifier
            )?.launchDate,
            applicationProcessIdentifier: nil,
            token: token
        )
        let fileURL = directoryURL.appendingPathComponent(
            "\(token).json"
        )
        let data = try JSONEncoder().encode(reservation)
        try data.write(to: fileURL, options: .atomic)
        try fileManager.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: fileURL.path
        )
        return ChatGPTLaunchReservation(
            fileManager: fileManager,
            fileURL: fileURL,
            storedReservation: reservation
        )
    }

    func reservationState(
        for applicationURL: URL,
        processIdentifier: pid_t,
        now: Date = Date()
    ) -> ChatGPTLaunchReservationState {
        let expectedPath = Self.canonicalPath(applicationURL)
        guard let fileURLs = try? fileManager.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: nil,
            options: .skipsHiddenFiles
        ) else {
            return .none
        }

        var hasPendingReservation = false
        for fileURL in fileURLs where fileURL.pathExtension == "json" {
            guard let reservation = validReservation(
                at: fileURL,
                now: now
            ) else {
                try? fileManager.removeItem(at: fileURL)
                continue
            }
            if reservation.applicationProcessIdentifier == processIdentifier,
                reservation.applicationPath == expectedPath
            {
                return .bound(reservation.token)
            }
            if reservation.applicationProcessIdentifier == nil,
                reservation.applicationPath == expectedPath
            {
                hasPendingReservation = true
            }
        }
        return hasPendingReservation ? .pending : .none
    }

    private func removeExpiredReservations(now: Date) {
        guard let fileURLs = try? fileManager.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: nil,
            options: .skipsHiddenFiles
        ) else {
            return
        }
        for fileURL in fileURLs where fileURL.pathExtension == "json" {
            guard validReservation(at: fileURL, now: now) != nil else {
                try? fileManager.removeItem(at: fileURL)
                continue
            }
        }
    }

    private func validReservation(
        at fileURL: URL,
        now: Date
    ) -> StoredLaunchReservation? {
        guard let reservation = decode(fileURL),
            reservation.schemaVersion == Self.schemaVersion
        else {
            return nil
        }
        if reservation.applicationProcessIdentifier == nil {
            guard Self.isOwnerRunning(reservation) else { return nil }
            return reservation
        }
        guard now.timeIntervalSince(reservation.createdAt)
            <= Self.reservationLifetime
        else {
            return nil
        }
        return reservation
    }

    private func decode(_ fileURL: URL) -> StoredLaunchReservation? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(
            StoredLaunchReservation.self,
            from: data
        )
    }

    private static func canonicalPath(_ url: URL) -> String {
        url.standardizedFileURL.resolvingSymlinksInPath().path
    }

    private static func isOwnerRunning(
        _ reservation: StoredLaunchReservation
    ) -> Bool {
        let processIdentifier = reservation.ownerProcessIdentifier
        guard Darwin.kill(processIdentifier, 0) == 0 || errno == EPERM else {
            return false
        }
        guard let expectedLaunchDate = reservation.ownerLaunchDate else {
            return true
        }
        guard let launchDate = NSRunningApplication(
            processIdentifier: processIdentifier
        )?.launchDate else {
            return false
        }
        return abs(launchDate.timeIntervalSince(expectedLaunchDate)) < 0.001
    }

}

enum ChatGPTLaunchReservationState: Equatable {
    case none
    case pending
    case bound(String)
}

fileprivate struct StoredLaunchReservation: Codable {
    let schemaVersion: Int
    let applicationPath: String
    let createdAt: Date
    let ownerProcessIdentifier: pid_t
    let ownerLaunchDate: Date?
    let applicationProcessIdentifier: pid_t?
    let token: String
}

protocol ChatGPTRecoveryClaim: AnyObject {
    func release()
}

final class ChatGPTFileRecoveryClaim: ChatGPTRecoveryClaim {
    private var fileDescriptor: Int32

    init(fileDescriptor: Int32) {
        self.fileDescriptor = fileDescriptor
    }

    func release() {
        guard fileDescriptor >= 0 else { return }
        _ = chatGPTXFlock(fileDescriptor, LOCK_UN)
        _ = Darwin.close(fileDescriptor)
        fileDescriptor = -1
    }

    deinit {
        guard fileDescriptor >= 0 else { return }
        _ = chatGPTXFlock(fileDescriptor, LOCK_UN)
        _ = Darwin.close(fileDescriptor)
    }
}

struct ChatGPTRecoveryClaimStore {
    private let fileManager: FileManager
    private let directoryURL: URL

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil
    ) {
        self.fileManager = fileManager
        self.directoryURL = directoryURL
            ?? fileManager.temporaryDirectory
                .appendingPathComponent(
                    "com.chatgptx.launcher",
                    isDirectory: true
                )
                .appendingPathComponent(
                    "recovery-claims",
                    isDirectory: true
                )
    }

    func acquire(
        applicationURL: URL
    ) throws -> (any ChatGPTRecoveryClaim)? {
        try fileManager.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let canonicalPath = applicationURL.standardizedFileURL
            .resolvingSymlinksInPath().path
        let digest = SHA256.hash(data: Data(canonicalPath.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        let fileURL = directoryURL.appendingPathComponent("\(digest).lock")
        let fileDescriptor = Darwin.open(
            fileURL.path,
            O_CREAT | O_RDWR | O_CLOEXEC,
            S_IRUSR | S_IWUSR
        )
        guard fileDescriptor >= 0 else {
            throw POSIXError(Self.posixErrorCode())
        }
        guard chatGPTXFlock(fileDescriptor, LOCK_EX | LOCK_NB) == 0 else {
            let errorCode = errno
            _ = Darwin.close(fileDescriptor)
            if errorCode == EWOULDBLOCK {
                return nil
            }
            throw POSIXError(Self.posixErrorCode(errorCode))
        }
        return ChatGPTFileRecoveryClaim(fileDescriptor: fileDescriptor)
    }

    private static func posixErrorCode(
        _ rawValue: Int32 = errno
    ) -> POSIXErrorCode {
        POSIXErrorCode(rawValue: rawValue) ?? .EIO
    }
}
