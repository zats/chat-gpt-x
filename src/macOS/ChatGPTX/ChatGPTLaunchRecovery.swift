import AppKit
import Foundation

protocol ChatGPTApplicationProcess: AnyObject {
    var processIdentifier: pid_t { get }
    var launchDate: Date? { get }
    var bundleIdentifier: String? { get }
    var bundleURL: URL? { get }
    var isActive: Bool { get }
    var isFinishedLaunching: Bool { get }
    var isTerminated: Bool { get }

    func hide() -> Bool
    func unhide() -> Bool
    func terminate() -> Bool
}

extension NSRunningApplication: ChatGPTApplicationProcess {}

protocol ChatGPTLifecycleSource: AnyObject {
    var runningApplications: [any ChatGPTApplicationProcess] { get }

    func start(
        launchHandler: @escaping (any ChatGPTApplicationProcess) -> Void,
        terminationHandler: @escaping (any ChatGPTApplicationProcess) -> Void
    )
    func stop()
}

final class NSWorkspaceChatGPTLifecycleSource: NSObject,
    ChatGPTLifecycleSource
{
    private let workspace: NSWorkspace
    private var launchHandler: ((any ChatGPTApplicationProcess) -> Void)?
    private var terminationHandler:
        ((any ChatGPTApplicationProcess) -> Void)?

    init(workspace: NSWorkspace = .shared) {
        self.workspace = workspace
    }

    var runningApplications: [any ChatGPTApplicationProcess] {
        ChatGPTRuntime.runningApplications
    }

    func start(
        launchHandler: @escaping (any ChatGPTApplicationProcess) -> Void,
        terminationHandler: @escaping (any ChatGPTApplicationProcess) -> Void
    ) {
        self.launchHandler = launchHandler
        self.terminationHandler = terminationHandler

        let notificationCenter = workspace.notificationCenter
        notificationCenter.addObserver(
            self,
            selector: #selector(applicationLaunched(_:)),
            name: NSWorkspace.willLaunchApplicationNotification,
            object: nil
        )
        notificationCenter.addObserver(
            self,
            selector: #selector(applicationLaunched(_:)),
            name: NSWorkspace.didLaunchApplicationNotification,
            object: nil
        )
        notificationCenter.addObserver(
            self,
            selector: #selector(applicationTerminated(_:)),
            name: NSWorkspace.didTerminateApplicationNotification,
            object: nil
        )
    }

    func stop() {
        workspace.notificationCenter.removeObserver(self)
        launchHandler = nil
        terminationHandler = nil
    }

    @objc
    private func applicationLaunched(_ notification: Notification) {
        guard let application = application(from: notification) else { return }
        launchHandler?(application)
    }

    @objc
    private func applicationTerminated(_ notification: Notification) {
        guard let application = application(from: notification) else { return }
        terminationHandler?(application)
    }

    private func application(
        from notification: Notification
    ) -> NSRunningApplication? {
        guard let application = notification.userInfo?[
            NSWorkspace.applicationUserInfoKey
        ] as? NSRunningApplication,
            application.bundleIdentifier
                == ChatGPTLauncher.chatGPTBundleIdentifier
        else {
            return nil
        }
        return application
    }
}

final class ChatGPTLaunchRecoveryMonitor {
    typealias Relaunch = (URL) async throws ->
        (any ChatGPTApplicationProcess)?

    private let lifecycleSource: any ChatGPTLifecycleSource
    private let approvedApplicationURL: () -> URL?
    private let applicationBuildIdentity: (URL) -> String?
    private let injectionEnabled: (any ChatGPTApplicationProcess) -> Bool
    private let recoveryAllowed: () -> Bool
    private let launchReservationState:
        (any ChatGPTApplicationProcess) -> ChatGPTLaunchReservationState
    private let acquireRecoveryClaim:
        (URL) -> (any ChatGPTRecoveryClaim)?
    private let relaunch: Relaunch
    private let launchErrorHandler: (any Error) -> Void
    private let verificationFailureHandler: (ChatGPTInjectionFailure) -> Void
    private let quitPollLimit: Int
    private let verificationPollLimit: Int
    private let reservationPollDelay: () async -> Void
    private let pollDelay: () async -> Void

    private var state = ChatGPTLaunchRecoveryState()
    private var approvedURL: URL?
    private var approvedBuildIdentity: String?
    private var expectedLaunchReservationToken: String?
    private var recoveryTask: Task<Void, Never>?
    private var verificationTask: Task<Void, Never>?
    private var pendingLaunchTasks = [pid_t: Task<Void, Never>]()
    private var unexpectedStopTasks = [
        ChatGPTApplicationIdentity: Task<Void, Never>
    ]()
    private var bootstrapLaunches = [
        ChatGPTApplicationIdentity: any ChatGPTApplicationProcess
    ]()
    private var bootstrapTerminations = Set<ChatGPTApplicationIdentity>()

    init(
        lifecycleSource: any ChatGPTLifecycleSource =
            NSWorkspaceChatGPTLifecycleSource(),
        approvedApplicationURL: @escaping () -> URL?,
        applicationBuildIdentity: @escaping (URL) -> String? = {
            applicationURL in
            ChatGPTLaunchRecoveryMonitor.buildIdentity(applicationURL)
        },
        injectionEnabled: @escaping (any ChatGPTApplicationProcess) -> Bool,
        recoveryAllowed: @escaping () -> Bool,
        launchReservationState: @escaping (
            any ChatGPTApplicationProcess
        ) -> ChatGPTLaunchReservationState = { application in
            guard let applicationURL = application.bundleURL else {
                return .none
            }
            return ChatGPTLaunchReservationStore().reservationState(
                for: applicationURL,
                processIdentifier: application.processIdentifier
            )
        },
        acquireRecoveryClaim: @escaping (
            URL
        ) -> (any ChatGPTRecoveryClaim)? = { applicationURL in
            try? ChatGPTRecoveryClaimStore().acquire(
                applicationURL: applicationURL
            )
        },
        relaunch: @escaping Relaunch,
        launchErrorHandler: @escaping (any Error) -> Void,
        verificationFailureHandler: @escaping (ChatGPTInjectionFailure) -> Void,
        quitPollLimit: Int = 100,
        verificationPollLimit: Int = 60,
        reservationPollDelay: @escaping () async -> Void = {
            try? await Task.sleep(for: .milliseconds(25))
        },
        pollDelay: @escaping () async -> Void = {
            try? await Task.sleep(for: .milliseconds(100))
        }
    ) {
        self.lifecycleSource = lifecycleSource
        self.approvedApplicationURL = approvedApplicationURL
        self.applicationBuildIdentity = applicationBuildIdentity
        self.injectionEnabled = injectionEnabled
        self.recoveryAllowed = recoveryAllowed
        self.launchReservationState = launchReservationState
        self.acquireRecoveryClaim = acquireRecoveryClaim
        self.relaunch = relaunch
        self.launchErrorHandler = launchErrorHandler
        self.verificationFailureHandler = verificationFailureHandler
        self.quitPollLimit = quitPollLimit
        self.verificationPollLimit = verificationPollLimit
        self.reservationPollDelay = reservationPollDelay
        self.pollDelay = pollDelay
    }

    var isAutomaticRecoveryActive: Bool {
        state.isAutomaticRecoveryActive
    }

    var recoveryPhase: ChatGPTLaunchRecoveryState.Phase {
        state.phase
    }

    func start() {
        let preexistingSnapshot = Dictionary(
            uniqueKeysWithValues: lifecycleSource.runningApplications.map {
                (Self.identity($0), $0)
            }
        )
        lifecycleSource.start(
            launchHandler: { [weak self] application in
                self?.applicationLaunched(application)
            },
            terminationHandler: { [weak self] application in
                self?.applicationTerminated(application)
            }
        )

        let observedSnapshot = Dictionary(
            uniqueKeysWithValues: lifecycleSource.runningApplications.map {
                (Self.identity($0), $0)
            }
        )
        refreshApprovedApplication()

        var launchesAfterInitialSnapshot = observedSnapshot
        for identity in preexistingSnapshot.keys {
            launchesAfterInitialSnapshot[identity] = nil
        }
        for (identity, application) in bootstrapLaunches
            where preexistingSnapshot[identity] == nil
        {
            launchesAfterInitialSnapshot[identity] = application
        }
        for identity in bootstrapTerminations {
            launchesAfterInitialSnapshot[identity] = nil
        }

        state.finishBootstrapping(
            applications: Set(preexistingSnapshot.keys)
                .subtracting(bootstrapTerminations)
        )
        bootstrapLaunches.removeAll()
        bootstrapTerminations.removeAll()

        for application in launchesAfterInitialSnapshot.values
            where !application.isTerminated
        {
            applicationLaunched(application)
        }
    }

    func stop() {
        recoveryTask?.cancel()
        recoveryTask = nil
        verificationTask?.cancel()
        verificationTask = nil
        expectedLaunchReservationToken = nil
        for task in pendingLaunchTasks.values {
            task.cancel()
        }
        pendingLaunchTasks.removeAll()
        for task in unexpectedStopTasks.values {
            task.cancel()
        }
        unexpectedStopTasks.removeAll()
        lifecycleSource.stop()
    }

    func refreshApprovedApplication() {
        guard let applicationURL = approvedApplicationURL() else {
            approvedURL = nil
            approvedBuildIdentity = nil
            return
        }
        let canonicalURL = Self.canonicalURL(applicationURL)
        guard let buildIdentity = applicationBuildIdentity(canonicalURL) else {
            approvedURL = nil
            approvedBuildIdentity = nil
            return
        }
        approvedURL = canonicalURL
        approvedBuildIdentity = buildIdentity
    }

    func registerExpectedLaunch(token: String? = nil) {
        state.registerExpectedLaunch()
        if let token {
            expectedLaunchReservationToken = token
        }
    }

    func openedExpectedApplication(
        _ application: (any ChatGPTApplicationProcess)?
    ) {
        guard let application else {
            expectedLaunchReservationToken = nil
            state.expectedLaunchFailed()
            return
        }

        pendingLaunchTasks[application.processIdentifier]?.cancel()
        pendingLaunchTasks[application.processIdentifier] = nil
        expectedLaunchReservationToken = nil
        state.bindExpectedLaunch(Self.identity(application))
        verificationTask?.cancel()
        verificationTask = Task { [weak self] in
            await self?.verifyExpectedApplication(application)
        }
    }

    func expectedLaunchFailed() {
        expectedLaunchReservationToken = nil
        state.expectedLaunchFailed()
    }

    private func applicationLaunched(
        _ application: any ChatGPTApplicationProcess
    ) {
        guard application.bundleIdentifier
            == ChatGPTLauncher.chatGPTBundleIdentifier
        else {
            return
        }

        let identity = Self.identity(application)
        if state.phase == .bootstrapping {
            bootstrapLaunches[identity] = application
            bootstrapTerminations.remove(identity)
            return
        }
        let hasVerifiedBuild = isApproved(application)
        let reservationState = hasVerifiedBuild
            ? launchReservationState(application)
            : .none
        if case .bound(let reservationToken) = reservationState {
            classifyReservedLaunch(
                identity,
                reservationToken: reservationToken
            )
            return
        }
        let candidate = ChatGPTLaunchCandidate(
            identity: identity,
            hasVerifiedBuild: hasVerifiedBuild,
            hasInjectedPlatform: injectionEnabled(application),
            isActive: application.isActive,
            isFinishedLaunching: application.isFinishedLaunching
        )
        let wasExpectedUnreservedCandidate = state.isExpectingSelfLaunch
            && isEligibleDirectLaunch(
                candidate,
                liveApplications: Set(
                    lifecycleSource.runningApplications.map(Self.identity)
                )
            )
        let expectedReservationTokenAtObservation =
            state.isExpectingSelfLaunch
                ? expectedLaunchReservationToken
                : nil
        let mustAwaitLaunchReservation =
            expectedReservationTokenAtObservation != nil
            || reservationState == .pending
        guard mustAwaitLaunchReservation else {
            classifyUnreservedLaunch(
                application,
                candidate: candidate,
                wasExpectedUnreservedCandidate:
                    wasExpectedUnreservedCandidate
            )
            return
        }
        guard pendingLaunchTasks[application.processIdentifier] == nil else {
            return
        }
        pendingLaunchTasks[application.processIdentifier] = Task {
            [weak self] in
            await self?.classifyLaunchAfterReservationWait(
                application,
                candidate: candidate,
                wasExpectedUnreservedCandidate:
                    wasExpectedUnreservedCandidate,
                expectedReservationTokenAtObservation:
                    expectedReservationTokenAtObservation
            )
        }
    }

    private func classifyLaunchAfterReservationWait(
        _ application: any ChatGPTApplicationProcess,
        candidate: ChatGPTLaunchCandidate,
        wasExpectedUnreservedCandidate: Bool,
        expectedReservationTokenAtObservation: String?
    ) async {
        let processIdentifier = application.processIdentifier
        defer { pendingLaunchTasks[processIdentifier] = nil }

        while !application.isTerminated {
            guard !Task.isCancelled else { return }
            switch launchReservationState(application) {
            case .bound(let reservationToken):
                classifyReservedLaunch(
                    candidate.identity,
                    reservationToken: reservationToken
                )
                return
            case .pending:
                await reservationPollDelay()
                continue
            case .none:
                break
            }
            if let expectedReservationTokenAtObservation {
                guard expectedLaunchReservationToken
                    == expectedReservationTokenAtObservation
                else {
                    break
                }
                await reservationPollDelay()
                continue
            }
            break
        }
        guard !application.isTerminated, !Task.isCancelled else { return }
        classifyUnreservedLaunch(
            application,
            candidate: candidate,
            wasExpectedUnreservedCandidate: wasExpectedUnreservedCandidate
        )
    }

    private func classifyReservedLaunch(
        _ identity: ChatGPTApplicationIdentity,
        reservationToken: String
    ) {
        if state.isExpectingSelfLaunch,
            reservationToken == expectedLaunchReservationToken
        {
            expectedLaunchReservationToken = nil
            state.bindExpectedLaunch(identity)
        } else {
            state.registerExternalLaunch(identity)
        }
    }

    private func classifyUnreservedLaunch(
        _ application: any ChatGPTApplicationProcess,
        candidate: ChatGPTLaunchCandidate,
        wasExpectedUnreservedCandidate: Bool
    ) {
        let candidate = ChatGPTLaunchCandidate(
            identity: candidate.identity,
            hasVerifiedBuild: isApproved(application),
            hasInjectedPlatform: injectionEnabled(application),
            isActive: application.isActive,
            isFinishedLaunching: application.isFinishedLaunching
        )
        if wasExpectedUnreservedCandidate,
            !candidate.isActive,
            !candidate.isFinishedLaunching
        {
            stopUnexpectedApplication(
                application,
                identity: candidate.identity
            )
            return
        }
        let action = state.observeLaunch(
            candidate,
            liveApplications: Set(
                lifecycleSource.runningApplications.map(Self.identity)
            ),
            recoveryAllowed: recoveryAllowed()
        )

        switch action {
        case .ignore:
            return
        case .stopUnexpected:
            stopUnexpectedApplication(
                application,
                identity: candidate.identity
            )
            return
        case .recover:
            break
        }

        guard recoveryTask == nil,
            let candidateURL = application.bundleURL
        else {
            return
        }
        guard let recoveryClaim = acquireRecoveryClaim(candidateURL) else {
            state.candidateRecoveryClaimDenied(candidate.identity)
            return
        }

        let terminationRequested = application.terminate()
        guard terminationRequested || application.isTerminated else {
            state.candidateStopFailed(candidate.identity)
            return
        }
        if !application.isTerminated {
            _ = application.hide()
        }

        recoveryTask = Task { [weak self] in
            await self?.finishRecovery(
                application: application,
                applicationURL: candidateURL,
                identity: candidate.identity,
                recoveryClaim: recoveryClaim
            )
        }
    }

    private func isEligibleDirectLaunch(
        _ candidate: ChatGPTLaunchCandidate,
        liveApplications: Set<ChatGPTApplicationIdentity>
    ) -> Bool {
        candidate.hasVerifiedBuild
            && !candidate.hasInjectedPlatform
            && !candidate.isActive
            && !candidate.isFinishedLaunching
            && liveApplications.subtracting([candidate.identity]).isEmpty
    }

    private func stopUnexpectedApplication(
        _ application: any ChatGPTApplicationProcess,
        identity: ChatGPTApplicationIdentity
    ) {
        guard unexpectedStopTasks[identity] == nil else { return }
        let terminationRequested = application.terminate()
        guard terminationRequested || application.isTerminated else { return }
        if !application.isTerminated {
            _ = application.hide()
        }
        unexpectedStopTasks[identity] = Task { [weak self] in
            await self?.finishUnexpectedStop(
                application: application,
                identity: identity
            )
        }
    }

    private func finishUnexpectedStop(
        application: any ChatGPTApplicationProcess,
        identity: ChatGPTApplicationIdentity
    ) async {
        defer { unexpectedStopTasks[identity] = nil }
        var remainingPolls = quitPollLimit
        while !application.isTerminated, remainingPolls > 0 {
            guard !Task.isCancelled else {
                restore(application)
                return
            }
            remainingPolls -= 1
            await pollDelay()
        }
        if !application.isTerminated {
            restore(application)
        }
    }

    private func applicationTerminated(
        _ application: any ChatGPTApplicationProcess
    ) {
        guard application.bundleIdentifier
            == ChatGPTLauncher.chatGPTBundleIdentifier
        else {
            return
        }
        let identity = Self.identity(application)
        if state.phase == .bootstrapping {
            bootstrapLaunches.removeValue(forKey: identity)
            bootstrapTerminations.insert(identity)
            return
        }
        pendingLaunchTasks[application.processIdentifier]?.cancel()
        pendingLaunchTasks[application.processIdentifier] = nil
        state.applicationDidTerminate(identity)
    }

    private func finishRecovery(
        application: any ChatGPTApplicationProcess,
        applicationURL: URL,
        identity: ChatGPTApplicationIdentity,
        recoveryClaim: any ChatGPTRecoveryClaim
    ) async {
        defer {
            recoveryClaim.release()
            recoveryTask = nil
        }

        var remainingPolls = quitPollLimit
        while !application.isTerminated, remainingPolls > 0 {
            guard !Task.isCancelled else {
                restore(application)
                return
            }
            remainingPolls -= 1
            await pollDelay()
        }
        guard application.isTerminated else {
            restore(application)
            state.candidateStopFailed(identity)
            return
        }
        guard !Task.isCancelled else { return }

        state.candidateDidTerminate(identity)
        state.registerExpectedLaunch()

        do {
            let launchedApplication = try await relaunch(applicationURL)
            guard let launchedApplication else {
                expectedLaunchFailed()
                return
            }
            pendingLaunchTasks[
                launchedApplication.processIdentifier
            ]?.cancel()
            pendingLaunchTasks[launchedApplication.processIdentifier] = nil
            expectedLaunchReservationToken = nil
            state.bindExpectedLaunch(Self.identity(launchedApplication))
            await verifyExpectedApplication(launchedApplication)
        } catch {
            expectedLaunchFailed()
            launchErrorHandler(error)
        }
    }

    private func verifyExpectedApplication(
        _ application: any ChatGPTApplicationProcess
    ) async {
        let identity = Self.identity(application)
        var remainingPolls = verificationPollLimit

        while !application.isTerminated, remainingPolls > 0 {
            guard !Task.isCancelled else { return }
            if injectionEnabled(application) {
                state.verificationSucceeded(identity)
                return
            }
            remainingPolls -= 1
            await pollDelay()
        }

        guard !application.isTerminated else {
            state.applicationDidTerminate(identity)
            return
        }
        state.verificationFailed(identity)
        verificationFailureHandler(.extensionsDisabled(
            application.processIdentifier
        ))
    }

    private func isApproved(
        _ application: any ChatGPTApplicationProcess
    ) -> Bool {
        guard let approvedURL,
            let approvedBuildIdentity,
            let bundleURL = application.bundleURL
        else {
            return false
        }
        let canonicalURL = Self.canonicalURL(bundleURL)
        return canonicalURL == approvedURL
            && applicationBuildIdentity(canonicalURL)
                == approvedBuildIdentity
    }

    private func restore(_ application: any ChatGPTApplicationProcess) {
        guard !application.isTerminated else { return }
        _ = application.unhide()
    }

    private static func identity(
        _ application: any ChatGPTApplicationProcess
    ) -> ChatGPTApplicationIdentity {
        ChatGPTApplicationIdentity(
            processIdentifier: application.processIdentifier,
            launchDate: application.launchDate
        )
    }

    private static func canonicalURL(_ url: URL) -> URL {
        url.standardizedFileURL.resolvingSymlinksInPath()
    }

    private static func buildIdentity(_ applicationURL: URL) -> String? {
        let asarURL = applicationURL
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("Resources", isDirectory: true)
            .appendingPathComponent("app.asar")
        guard let attributes = try? FileManager.default.attributesOfItem(
            atPath: asarURL.path
        ),
            let systemNumber = (
                attributes[.systemNumber] as? NSNumber
            )?.uint64Value,
            let fileNumber = (
                attributes[.systemFileNumber] as? NSNumber
            )?.uint64Value,
            let fileSize = (attributes[.size] as? NSNumber)?.uint64Value,
            let modificationDate = attributes[.modificationDate] as? Date
        else {
            return nil
        }
        return [
            String(systemNumber),
            String(fileNumber),
            String(fileSize),
            String(modificationDate.timeIntervalSinceReferenceDate),
        ].joined(separator: ":")
    }
}
