import AppKit
import XCTest
@testable import ChatGPTX

final class ChatGPTLaunchReservationTests: XCTestCase {
    @MainActor
    func testHostedTestAppIsInactiveAndIsolated() throws {
        XCTAssertTrue(ChatGPTXRuntimeEnvironment.isUnitTesting)
        XCTAssertEqual(NSApplication.shared.activationPolicy(), .prohibited)
        let testRoot = URL(
            fileURLWithPath: try XCTUnwrap(
                ProcessInfo.processInfo.environment["CHATGPTX_TEST_ROOT"]
            )
        ).standardizedFileURL.path + "/"
        for key in ["HOME", "CODEX_HOME"] {
            let value = try XCTUnwrap(
                ProcessInfo.processInfo.environment[key]
            )
            XCTAssertTrue(
                URL(fileURLWithPath: value).standardizedFileURL.path
                    .hasPrefix(testRoot)
            )
        }
    }

    @MainActor
    func testRecoveryClaimIsExclusiveUntilReleased() throws {
        let fileManager = FileManager.default
        let directoryURL = fileManager.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? fileManager.removeItem(at: directoryURL) }
        let store = ChatGPTRecoveryClaimStore(
            fileManager: fileManager,
            directoryURL: directoryURL
        )
        let applicationURL = URL(
            fileURLWithPath: "/Applications/ChatGPT.app"
        )

        let firstClaim = try XCTUnwrap(
            store.acquire(applicationURL: applicationURL)
        )
        XCTAssertNil(try store.acquire(applicationURL: applicationURL))

        firstClaim.release()
        let secondClaim = try XCTUnwrap(
            store.acquire(applicationURL: applicationURL)
        )
        secondClaim.release()
    }

    @MainActor
    func testReservationIsVisibleUntilCancelled() throws {
        let fileManager = FileManager.default
        let directoryURL = fileManager.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? fileManager.removeItem(at: directoryURL) }

        let store = ChatGPTLaunchReservationStore(
            fileManager: fileManager,
            directoryURL: directoryURL
        )
        let applicationURL = URL(
            fileURLWithPath: "/Applications/ChatGPT.app"
        )
        let reservation = try store.reserve(applicationURL: applicationURL)

        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: 123
            ),
            .pending
        )
        try reservation.bind(to: 123)
        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: 123
            ),
            .bound(reservation.token)
        )
        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: ProcessInfo.processInfo.processIdentifier
            ),
            .none
        )
        reservation.cancel()
        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: 123
            ),
            .none
        )
    }

    @MainActor
    func testFailedBindingPreservesPendingReservation() throws {
        let fileManager = FileManager.default
        let directoryURL = fileManager.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer {
            try? fileManager.setAttributes(
                [.posixPermissions: 0o700],
                ofItemAtPath: directoryURL.path
            )
            try? fileManager.removeItem(at: directoryURL)
        }
        let store = ChatGPTLaunchReservationStore(
            fileManager: fileManager,
            directoryURL: directoryURL
        )
        let applicationURL = URL(
            fileURLWithPath: "/Applications/ChatGPT.app"
        )
        let reservation = try store.reserve(applicationURL: applicationURL)
        try fileManager.setAttributes(
            [.posixPermissions: 0o500],
            ofItemAtPath: directoryURL.path
        )

        XCTAssertThrowsError(try reservation.bind(to: 123))

        try fileManager.setAttributes(
            [.posixPermissions: 0o700],
            ofItemAtPath: directoryURL.path
        )
        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: 123
            ),
            .pending
        )
    }

    @MainActor
    func testExpiredReservationIsIgnoredAndRemoved() throws {
        let fileManager = FileManager.default
        let directoryURL = fileManager.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? fileManager.removeItem(at: directoryURL) }

        let store = ChatGPTLaunchReservationStore(
            fileManager: fileManager,
            directoryURL: directoryURL
        )
        let applicationURL = URL(
            fileURLWithPath: "/Applications/ChatGPT.app"
        )
        let reservation = try store.reserve(
            applicationURL: applicationURL,
            now: Date(timeIntervalSince1970: 0)
        )
        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: 123,
                now: Date(timeIntervalSince1970: 31)
            ),
            .pending
        )
        try reservation.bind(to: 123)

        XCTAssertEqual(
            store.reservationState(
                for: applicationURL,
                processIdentifier: 123,
                now: Date(timeIntervalSince1970: 31)
            ),
            .none
        )
        XCTAssertEqual(
            try fileManager.contentsOfDirectory(atPath: directoryURL.path),
            []
        )
    }

}

final class ChatGPTLaunchRecoveryTests: XCTestCase {
    private let applicationURL = URL(fileURLWithPath: "/Applications/ChatGPT.app")

    @MainActor
    func testLifecycleObservationIsInstalledBetweenBootstrapSnapshots() {
        let existing = MockApplication(pid: 10, url: applicationURL)
        let source = MockLifecycleSource(applications: [existing])
        var relaunchCount = 0
        let monitor = makeMonitor(source: source) { _ in
            relaunchCount += 1
            return nil
        }

        monitor.start()
        source.emitLaunch(existing)

        XCTAssertEqual(
            source.operations.prefix(3),
            ["enumerate", "start", "enumerate"]
        )
        XCTAssertEqual(existing.terminateCount, 0)
        XCTAssertEqual(relaunchCount, 0)
    }

    @MainActor
    func testLaunchDuringObservationRegistrationIsRecovered() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 11, url: applicationURL)
        let injected = MockApplication(
            pid: 12,
            url: applicationURL,
            injected: true
        )
        source.onStart = {
            source.applications = [direct]
        }
        direct.onTerminate = {
            direct.isTerminated = true
        }
        var relaunchCount = 0
        let monitor = makeMonitor(source: source) { _ in
            relaunchCount += 1
            source.applications = [injected]
            return injected
        }

        monitor.start()
        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 1)
    }

    @MainActor
    func testLaunchCallbackAfterSecondBootstrapSnapshotIsReplayed() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 13, url: applicationURL)
        let injected = MockApplication(
            pid: 14,
            url: applicationURL,
            injected: true
        )
        direct.onTerminate = {
            direct.isTerminated = true
        }
        var didEmitLaunch = false
        var relaunchCount = 0
        let monitor = makeMonitor(
            source: source,
            approvedApplicationURL: {
                if !didEmitLaunch {
                    didEmitLaunch = true
                    source.applications = [direct]
                    source.emitLaunch(direct)
                }
                return self.applicationURL
            }
        ) { _ in
            relaunchCount += 1
            source.applications = [injected]
            return injected
        }

        monitor.start()
        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 1)
    }

    @MainActor
    func testAutomaticRecoveryRequiresPreparedComponentsOrActiveUpdate() {
        XCTAssertTrue(AppDelegate.automaticRecoveryAllowed(
            launchInProgress: false,
            updateInProgress: false,
            hasPreparedComponents: true
        ))
        XCTAssertTrue(AppDelegate.automaticRecoveryAllowed(
            launchInProgress: false,
            updateInProgress: true,
            hasPreparedComponents: false
        ))
        XCTAssertFalse(AppDelegate.automaticRecoveryAllowed(
            launchInProgress: false,
            updateInProgress: false,
            hasPreparedComponents: false
        ))
        XCTAssertFalse(AppDelegate.automaticRecoveryAllowed(
            launchInProgress: true,
            updateInProgress: false,
            hasPreparedComponents: true
        ))
        XCTAssertFalse(AppDelegate.automaticRecoveryAllowed(
            launchInProgress: true,
            updateInProgress: true,
            hasPreparedComponents: true
        ))
    }

    @MainActor
    func testApprovalRefreshAndUpdateWaitRecoverInactiveLaunches() async {
        let approvalSource = MockLifecycleSource()
        let approvalDirect = MockApplication(pid: 15, url: applicationURL)
        let approvalInjected = MockApplication(
            pid: 16,
            url: applicationURL,
            injected: true
        )
        var approvedURL: URL?
        approvalDirect.onTerminate = {
            approvalDirect.isTerminated = true
        }
        var approvalRelaunchCount = 0
        let approvalMonitor = makeMonitor(
            source: approvalSource,
            approvedApplicationURL: { approvedURL }
        ) { _ in
            approvalRelaunchCount += 1
            approvalSource.applications = [approvalInjected]
            return approvalInjected
        }

        approvalMonitor.start()
        approvalSource.applications = [approvalDirect]
        approvalSource.emitLaunch(approvalDirect)

        XCTAssertEqual(approvalDirect.terminateCount, 0)
        XCTAssertEqual(approvalRelaunchCount, 0)

        approvedURL = applicationURL
        approvalMonitor.refreshApprovedApplication()
        await waitUntil {
            approvalRelaunchCount == 1
                && approvalMonitor.recoveryPhase == .armed
        }

        XCTAssertEqual(approvalDirect.terminateCount, 1)
        XCTAssertEqual(approvalRelaunchCount, 1)
        approvalMonitor.stop()

        let gatedSource = MockLifecycleSource()
        let gatedDirect = MockApplication(pid: 17, url: applicationURL)
        let gatedInjected = MockApplication(
            pid: 18,
            url: applicationURL,
            injected: true
        )
        var terminationWasInactive = false
        gatedDirect.onTerminate = {
            terminationWasInactive = !gatedDirect.isActive
                && !gatedDirect.isFinishedLaunching
            gatedDirect.isTerminated = true
        }
        var updateWaitStarted = false
        var finishUpdate: CheckedContinuation<Void, Never>?
        var gatedRelaunchCount = 0
        let gatedMonitor = makeMonitor(source: gatedSource) { _ in
            updateWaitStarted = true
            await withCheckedContinuation { continuation in
                finishUpdate = continuation
            }
            gatedRelaunchCount += 1
            gatedSource.applications = [gatedInjected]
            return gatedInjected
        }

        gatedMonitor.start()
        gatedSource.applications = [gatedDirect]
        gatedSource.emitLaunch(gatedDirect)

        XCTAssertEqual(gatedDirect.terminateCount, 1)
        XCTAssertTrue(terminationWasInactive)
        await waitUntil { updateWaitStarted }

        XCTAssertEqual(gatedRelaunchCount, 0)
        XCTAssertEqual(
            gatedMonitor.recoveryPhase,
            .expectingSelfLaunch(gatedDirect.identity)
        )

        guard let finishUpdate else {
            XCTFail("Recovery did not wait for the update")
            return
        }
        finishUpdate.resume()
        gatedMonitor.refreshApprovedApplication()

        await waitUntil {
            gatedRelaunchCount == 1
                && gatedMonitor.recoveryPhase == .armed
        }

        XCTAssertEqual(gatedDirect.terminateCount, 1)
        XCTAssertEqual(gatedRelaunchCount, 1)
    }

    @MainActor
    func testEligibleDirectLaunchQuitsThenRelaunchesOnce() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 20, url: applicationURL)
        let injected = MockApplication(
            pid: 21,
            url: applicationURL,
            injected: true
        )
        var operations = [String]()
        var relaunchCount = 0
        direct.onTerminate = {
            operations.append("terminate")
            direct.isTerminated = true
        }

        let monitor = makeMonitor(source: source) { _ in
            relaunchCount += 1
            operations.append("relaunch")
            source.applications = [injected]
            return injected
        }
        monitor.start()
        source.applications = [direct]
        source.emitLaunch(direct)

        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertEqual(operations, ["terminate", "relaunch"])
        XCTAssertEqual(direct.hideCount, 0)
        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 1)

        source.emitLaunch(injected)
        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 1)

        injected.isTerminated = true
        source.applications = []
        source.emitTermination(injected)
        await Task.yield()
        XCTAssertEqual(relaunchCount, 1)
    }

    @MainActor
    func testRecoveryWaitsForExactProcessTermination() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 30, url: applicationURL)
        let injected = MockApplication(
            pid: 31,
            url: applicationURL,
            injected: true
        )
        var operations = [String]()
        direct.onTerminate = {
            operations.append("terminate")
        }

        let monitor = makeMonitor(
            source: source,
            pollDelay: {
                operations.append("poll")
                direct.isTerminated = true
            }
        ) { _ in
            operations.append("relaunch")
            source.applications = [injected]
            return injected
        }
        monitor.start()
        source.applications = [direct]
        source.emitLaunch(direct)

        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertEqual(operations, ["terminate", "poll", "relaunch"])
    }

    @MainActor
    func testRecoveryUsesPIDWhenLaunchObjectTerminationIsStale() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 33, url: applicationURL)
        let terminationEvent = MockApplication(pid: 33, url: applicationURL)
        let injected = MockApplication(
            pid: 34,
            url: applicationURL,
            injected: true
        )
        var runningProcessIdentifiers: Set<pid_t> = [
            direct.processIdentifier
        ]
        direct.onTerminate = {
            runningProcessIdentifiers.remove(direct.processIdentifier)
            source.applications = []
            source.emitTermination(terminationEvent)
        }
        var relaunchCount = 0
        let monitor = makeMonitor(
            source: source,
            applicationIsRunning: { application in
                runningProcessIdentifiers.contains(
                    application.processIdentifier
                )
            }
        ) { _ in
            relaunchCount += 1
            runningProcessIdentifiers.insert(injected.processIdentifier)
            source.applications = [injected]
            return injected
        }
        monitor.start()

        source.applications = [direct]
        source.emitLaunch(direct)
        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertFalse(direct.isTerminated)
        XCTAssertFalse(terminationEvent.isTerminated)
        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 1)
    }

    @MainActor
    func testProcessLivenessRejectsInvalidPID() {
        let application = MockApplication(pid: -1, url: applicationURL)
        var processWasProbed = false
        let liveness = ChatGPTApplicationProcessLiveness { _ in
            processWasProbed = true
            return .found(ChatGPTProcessStartIdentifier(
                seconds: 1,
                microseconds: 1
            ))
        }

        liveness.observe(application)

        XCTAssertFalse(liveness.isRunning(application))
        XCTAssertFalse(processWasProbed)
    }

    @MainActor
    func testProcessLivenessRejectsReusedPID() {
        let application = MockApplication(pid: 35, url: applicationURL)
        var currentStartIdentifier = ChatGPTProcessStartIdentifier(
            seconds: 1,
            microseconds: 1
        )
        let liveness = ChatGPTApplicationProcessLiveness { _ in
            .found(currentStartIdentifier)
        }
        liveness.observe(application)
        currentStartIdentifier = ChatGPTProcessStartIdentifier(
            seconds: 2,
            microseconds: 1
        )
        liveness.observe(application)

        XCTAssertFalse(liveness.isRunning(application))
    }

    @MainActor
    func testProcessLivenessDoesNotRequireLaunchDate() {
        let application = MockApplication(
            pid: 36,
            url: applicationURL,
            launchDateAvailable: false
        )
        let startIdentifier = ChatGPTProcessStartIdentifier(
            seconds: 1,
            microseconds: 1
        )
        let liveness = ChatGPTApplicationProcessLiveness { _ in
            .found(startIdentifier)
        }
        liveness.observe(application)

        XCTAssertTrue(liveness.isRunning(application))
    }

    @MainActor
    func testProcessLivenessKeepsUnavailableProbeConservative() {
        let application = MockApplication(pid: 37, url: applicationURL)
        let startIdentifier = ChatGPTProcessStartIdentifier(
            seconds: 1,
            microseconds: 1
        )
        var inspectionResult: ChatGPTProcessInspectionResult<
            ChatGPTProcessStartIdentifier
        > = .found(startIdentifier)
        let liveness = ChatGPTApplicationProcessLiveness { _ in
            inspectionResult
        }
        liveness.observe(application)
        inspectionResult = .unavailable

        XCTAssertEqual(liveness.status(of: application), .unavailable)
        XCTAssertTrue(liveness.isRunning(application))
    }

    @MainActor
    func testProcessLivenessKeepsMissingObservationConservative() {
        let application = MockApplication(pid: 38, url: applicationURL)
        let liveness = ChatGPTApplicationProcessLiveness { _ in
            .unavailable
        }

        XCTAssertEqual(liveness.status(of: application), .unavailable)
        XCTAssertTrue(liveness.isRunning(application))
    }

    @MainActor
    func testRecoveryObservesDistinctRelaunchResult() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 37, url: applicationURL)
        let launchNotification = MockApplication(
            pid: 38,
            url: applicationURL,
            injected: true
        )
        let relaunchResult = MockApplication(
            pid: 38,
            url: applicationURL,
            injected: true
        )
        let directStart = ChatGPTProcessStartIdentifier(
            seconds: 1,
            microseconds: 1
        )
        let relaunchedStart = ChatGPTProcessStartIdentifier(
            seconds: 2,
            microseconds: 1
        )
        var startIdentifiers = [direct.processIdentifier: directStart]
        let liveness = ChatGPTApplicationProcessLiveness {
            guard let startIdentifier = startIdentifiers[$0] else {
                return .notRunning
            }
            return .found(startIdentifier)
        }
        direct.onTerminate = {
            startIdentifiers[direct.processIdentifier] = nil
            source.applications = []
            source.emitTermination(
                MockApplication(pid: 37, url: self.applicationURL)
            )
        }
        var relaunchCount = 0
        let monitor = makeMonitor(
            source: source,
            applicationLiveness: liveness,
            applicationIsRunning: nil
        ) { _ in
            relaunchCount += 1
            startIdentifiers[relaunchResult.processIdentifier] =
                relaunchedStart
            source.applications = [launchNotification]
            source.emitLaunch(launchNotification)
            return relaunchResult
        }
        monitor.start()

        source.applications = [direct]
        source.emitLaunch(direct)
        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertEqual(relaunchCount, 1)
    }

    @MainActor
    func testTerminationRefusalBlocksRepeatedRecovery() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 40, url: applicationURL)
        direct.terminateResult = false
        var relaunchCount = 0
        let monitor = makeMonitor(source: source) { _ in
            relaunchCount += 1
            return nil
        }
        monitor.start()
        source.applications = [direct]

        source.emitLaunch(direct)
        source.emitLaunch(direct)
        await Task.yield()

        XCTAssertEqual(monitor.recoveryPhase, .blocked(direct.identity))
        XCTAssertEqual(direct.hideCount, 0)
        XCTAssertEqual(direct.unhideCount, 0)
        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 0)

        direct.isTerminated = true
        source.applications = []
        source.emitTermination(direct)
        source.emitLaunch(direct)

        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(relaunchCount, 0)
    }

    @MainActor
    func testTerminationTimeoutDoesNotRelaunch() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 45, url: applicationURL)
        var pollCount = 0
        var relaunchCount = 0
        let monitor = makeMonitor(
            source: source,
            pollDelay: { pollCount += 1 }
        ) { _ in
            relaunchCount += 1
            return nil
        }
        monitor.start()
        source.applications = [direct]

        source.emitLaunch(direct)
        await waitUntil {
            monitor.recoveryPhase == .blocked(direct.identity)
        }

        XCTAssertEqual(direct.terminateCount, 1)
        XCTAssertEqual(direct.hideCount, 1)
        XCTAssertEqual(direct.unhideCount, 1)
        XCTAssertEqual(pollCount, 2)
        XCTAssertEqual(relaunchCount, 0)
    }

    @MainActor
    func testActiveFinishedInjectedUnverifiedAndAmbiguousLaunchesAreIgnored() {
        let existing = MockApplication(pid: 50, url: applicationURL)
        let candidates = [
            MockApplication(pid: 51, url: applicationURL, active: true),
            MockApplication(pid: 52, url: applicationURL, finished: true),
            MockApplication(pid: 53, url: applicationURL, injected: true),
            MockApplication(
                pid: 54,
                url: URL(fileURLWithPath: "/Applications/Other.app")
            ),
        ]

        for candidate in candidates {
            let source = MockLifecycleSource()
            let monitor = makeMonitor(source: source) { _ in nil }
            monitor.start()
            source.applications = [candidate]
            source.emitLaunch(candidate)
            XCTAssertEqual(candidate.terminateCount, 0)
        }

        let source = MockLifecycleSource()
        let candidate = MockApplication(pid: 55, url: applicationURL)
        let monitor = makeMonitor(source: source) { _ in nil }
        monitor.start()
        source.applications = [existing, candidate]
        source.emitLaunch(candidate)
        XCTAssertEqual(candidate.terminateCount, 0)
    }

    @MainActor
    func testExpectedSelfLaunchIsNeverTerminated() async {
        let source = MockLifecycleSource()
        let expected = MockApplication(
            pid: 60,
            url: applicationURL,
            injected: true
        )
        let monitor = makeMonitor(
            source: source,
            launchReservationState: { application in
                application.processIdentifier == expected.processIdentifier
                    ? .bound("expected")
                    : .none
            }
        ) { _ in nil }
        monitor.start()

        monitor.registerExpectedLaunch(token: "expected")
        source.applications = [expected]
        source.emitLaunch(expected)
        monitor.openedExpectedApplication(expected)
        await waitUntil { monitor.recoveryPhase == .armed }

        XCTAssertEqual(expected.terminateCount, 0)
    }

    @MainActor
    func testLaunchReservedByAnotherLauncherIsNeverTerminated() {
        let source = MockLifecycleSource()
        let expected = MockApplication(pid: 65, url: applicationURL)
        let monitor = makeMonitor(
            source: source,
            launchReservationState: { _ in .bound("external") }
        ) { _ in nil }
        monitor.start()

        source.applications = [expected]
        source.emitLaunch(expected)
        source.emitLaunch(expected)

        XCTAssertEqual(expected.terminateCount, 0)
    }

    @MainActor
    func testLaunchWaitsForExactReservationBinding() async {
        let source = MockLifecycleSource()
        let external = MockApplication(pid: 66, url: applicationURL)
        var reservationState = ChatGPTLaunchReservationState.pending
        var reservationWasRead = false
        let monitor = makeMonitor(
            source: source,
            reservationPollDelay: {
                reservationState = .bound("external")
                await Task.yield()
            },
            launchReservationState: { _ in
                if case .bound = reservationState {
                    reservationWasRead = true
                }
                return reservationState
            }
        ) { _ in nil }
        monitor.start()

        source.applications = [external]
        source.emitLaunch(external)

        await waitUntil { reservationWasRead }
        XCTAssertEqual(external.terminateCount, 0)
    }

    @MainActor
    func testActiveApplicationIsNotRecoveredAfterReservationEnds() async {
        let source = MockLifecycleSource()
        let external = MockApplication(pid: 67, url: applicationURL)
        var reservationState = ChatGPTLaunchReservationState.pending
        var classificationFinished = false
        let monitor = makeMonitor(
            source: source,
            reservationPollDelay: {
                external.isActive = true
                external.isFinishedLaunching = true
                reservationState = .none
                await Task.yield()
            },
            launchReservationState: { _ in
                if reservationState == .none {
                    classificationFinished = true
                }
                return reservationState
            }
        ) { _ in
            XCTFail("An active application must not be recovered")
            return nil
        }
        monitor.start()

        source.applications = [external]
        source.emitLaunch(external)
        await waitUntil { classificationFinished }

        XCTAssertTrue(classificationFinished)
        XCTAssertEqual(external.terminateCount, 0)
        XCTAssertEqual(monitor.recoveryPhase, .armed)
    }

    @MainActor
    func testExpectedLaunchWaitsUntilOpenOperationBindsReservation() async {
        let source = MockLifecycleSource()
        let expected = MockApplication(pid: 67, url: applicationURL)
        var pollCount = 0
        var reservationWasRead = false
        let monitor = makeMonitor(
            source: source,
            reservationPollDelay: {
                pollCount += 1
                await Task.yield()
            },
            launchReservationState: { _ in
                guard pollCount >= 3 else { return .none }
                reservationWasRead = true
                return .bound("expected")
            }
        ) { _ in nil }
        monitor.start()
        monitor.registerExpectedLaunch(token: "expected")

        source.applications = [expected]
        source.emitLaunch(expected)

        await waitUntil { reservationWasRead }
        XCTAssertGreaterThan(pollCount, 1)
        XCTAssertEqual(expected.terminateCount, 0)
    }

    @MainActor
    func testApprovedBuildIsCachedAcrossLaunchNotifications() {
        let source = MockLifecycleSource()
        let application = MockApplication(
            pid: 71,
            url: applicationURL,
            finished: true
        )
        var lookupCount = 0
        let monitor = makeMonitor(
            source: source,
            approvedApplicationURL: {
                lookupCount += 1
                return self.applicationURL
            }
        ) { _ in nil }
        monitor.start()

        source.applications = [application]
        source.emitLaunch(application)
        source.emitLaunch(application)

        XCTAssertEqual(lookupCount, 1)
    }

    @MainActor
    func testInPlaceBuildChangeIsNotRecovered() async {
        let source = MockLifecycleSource()
        let application = MockApplication(pid: 74, url: applicationURL)
        var buildIdentity = "original"
        let monitor = makeMonitor(
            source: source,
            applicationBuildIdentity: { _ in buildIdentity }
        ) { _ in nil }
        monitor.start()
        buildIdentity = "updated"

        source.applications = [application]
        source.emitLaunch(application)
        await Task.yield()

        XCTAssertEqual(application.terminateCount, 0)
    }

    @MainActor
    func testUnreservedLaunchDuringExpectedLaunchIsStopped() async {
        let source = MockLifecycleSource()
        let unrelated = MockApplication(pid: 68, url: applicationURL)
        let expected = MockApplication(
            pid: 69,
            url: applicationURL,
            injected: true
        )
        unrelated.onTerminate = { unrelated.isTerminated = true }
        let monitor = makeMonitor(
            source: source,
            launchReservationState: { application in
                application.processIdentifier == expected.processIdentifier
                    ? .bound("expected")
                    : .none
            }
        ) { _ in nil }
        monitor.start()
        monitor.registerExpectedLaunch(token: "expected")

        source.applications = [unrelated]
        source.emitLaunch(unrelated)
        source.applications = [expected]
        source.emitLaunch(expected)
        monitor.openedExpectedApplication(expected)

        await waitUntil { monitor.recoveryPhase == .armed }
        XCTAssertEqual(unrelated.terminateCount, 1)
        XCTAssertEqual(expected.terminateCount, 0)
    }

    @MainActor
    func testAutomaticLaunchFailureFromVerifyingOpensCircuit() {
        let sourceIdentity = ChatGPTApplicationIdentity(
            processIdentifier: 69,
            launchDate: Date(timeIntervalSince1970: 69)
        )
        let expectedIdentity = ChatGPTApplicationIdentity(
            processIdentifier: 70,
            launchDate: Date(timeIntervalSince1970: 70)
        )
        var state = ChatGPTLaunchRecoveryState()
        state.finishBootstrapping(applications: [])
        _ = state.observeLaunch(
            ChatGPTLaunchCandidate(
                identity: sourceIdentity,
                hasVerifiedBuild: true,
                hasInjectedPlatform: false,
                isActive: false,
                isFinishedLaunching: false
            ),
            liveApplications: [sourceIdentity],
            recoveryAllowed: true
        )
        state.candidateDidTerminate(sourceIdentity)
        state.registerExpectedLaunch()
        state.bindExpectedLaunch(expectedIdentity)

        state.expectedLaunchFailed()

        XCTAssertEqual(state.phase, .circuitOpen(sourceIdentity))
        XCTAssertFalse(state.isAutomaticRecoveryActive)
    }

    @MainActor
    func testCompetingLaunchesAreStoppedDuringAutomaticRecovery() {
        let firstIdentity = ChatGPTApplicationIdentity(
            processIdentifier: 78,
            launchDate: Date(timeIntervalSince1970: 78)
        )
        let secondIdentity = ChatGPTApplicationIdentity(
            processIdentifier: 79,
            launchDate: Date(timeIntervalSince1970: 79)
        )
        let thirdIdentity = ChatGPTApplicationIdentity(
            processIdentifier: 80,
            launchDate: Date(timeIntervalSince1970: 80)
        )
        func candidate(
            _ identity: ChatGPTApplicationIdentity
        ) -> ChatGPTLaunchCandidate {
            ChatGPTLaunchCandidate(
                identity: identity,
                hasVerifiedBuild: true,
                hasInjectedPlatform: false,
                isActive: false,
                isFinishedLaunching: false
            )
        }
        var state = ChatGPTLaunchRecoveryState()
        state.finishBootstrapping(applications: [])

        XCTAssertEqual(
            state.observeLaunch(
                candidate(firstIdentity),
                liveApplications: [firstIdentity],
                recoveryAllowed: true
            ),
            .recover(firstIdentity)
        )
        XCTAssertEqual(
            state.observeLaunch(
                candidate(secondIdentity),
                liveApplications: [firstIdentity, secondIdentity],
                recoveryAllowed: true
            ),
            .stopUnexpected(secondIdentity)
        )

        state.applicationDidTerminate(firstIdentity)
        XCTAssertEqual(state.phase, .relaunchPending(firstIdentity))
        XCTAssertEqual(
            state.observeLaunch(
                candidate(thirdIdentity),
                liveApplications: [thirdIdentity],
                recoveryAllowed: true
            ),
            .stopUnexpected(thirdIdentity)
        )
    }

    @MainActor
    func testRecoveryClaimDenialLeavesDirectLaunchRunning() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 72, url: applicationURL)
        let monitor = makeMonitor(
            source: source,
            acquireRecoveryClaim: { _ in nil }
        ) { _ in nil }
        monitor.start()

        source.applications = [direct]
        source.emitLaunch(direct)
        await Task.yield()

        XCTAssertEqual(direct.terminateCount, 0)
        XCTAssertEqual(monitor.recoveryPhase, .armed)
    }

    @MainActor
    func testTerminatedExpectedLaunchDoesNotReportInjectionFailure() async {
        let source = MockLifecycleSource()
        let expected = MockApplication(pid: 73, url: applicationURL)
        var failureCount = 0
        let monitor = makeMonitor(
            source: source,
            verificationPollLimit: 2,
            pollDelay: {
                expected.isTerminated = true
                source.emitTermination(expected)
                await Task.yield()
            },
            verificationFailureHandler: { _ in failureCount += 1 }
        ) { _ in nil }
        monitor.start()
        monitor.registerExpectedLaunch(token: "expected")
        monitor.openedExpectedApplication(expected)

        await waitUntil { expected.isTerminated }
        await Task.yield()
        XCTAssertEqual(failureCount, 0)
        XCTAssertEqual(monitor.recoveryPhase, .armed)
    }

    @MainActor
    func testTerminationBeforeExpectedBindingDoesNotWedgeRecovery() async {
        let source = MockLifecycleSource()
        let expected = MockApplication(pid: 75, url: applicationURL)
        expected.isTerminated = true
        var failureCount = 0
        let monitor = makeMonitor(
            source: source,
            verificationFailureHandler: { _ in failureCount += 1 }
        ) { _ in nil }
        monitor.start()
        monitor.registerExpectedLaunch(token: "expected")
        source.emitTermination(expected)

        monitor.openedExpectedApplication(expected)

        await waitUntil { monitor.recoveryPhase == .armed }
        XCTAssertEqual(failureCount, 0)
    }

    @MainActor
    func testVerificationFailureOpensCircuitAndPreventsLoop() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 70, url: applicationURL)
        let uninjected = MockApplication(pid: 71, url: applicationURL)
        direct.onTerminate = { direct.isTerminated = true }
        var relaunchCount = 0

        let monitor = makeMonitor(
            source: source,
            verificationPollLimit: 1
        ) { _ in
            relaunchCount += 1
            source.applications = [uninjected]
            return uninjected
        }
        monitor.start()
        source.applications = [direct]
        source.emitLaunch(direct)

        await waitUntil {
            monitor.recoveryPhase == .circuitOpen(uninjected.identity)
        }
        source.emitLaunch(uninjected)
        await Task.yield()

        XCTAssertEqual(uninjected.terminateCount, 0)
        XCTAssertEqual(relaunchCount, 1)
    }

    @MainActor
    func testCancelledRecoveryDoesNotRelaunchAfterTermination() async {
        let source = MockLifecycleSource()
        let direct = MockApplication(pid: 76, url: applicationURL)
        var delayStarted = false
        var allowDelayToFinish = false
        var relaunchCount = 0
        let monitor = makeMonitor(
            source: source,
            pollDelay: {
                delayStarted = true
                while !allowDelayToFinish {
                    await Task.yield()
                }
            }
        ) { _ in
            relaunchCount += 1
            return nil
        }
        monitor.start()
        source.applications = [direct]
        source.emitLaunch(direct)
        await waitUntil { delayStarted }

        monitor.stop()
        direct.isTerminated = true
        allowDelayToFinish = true
        for _ in 0..<10 {
            await Task.yield()
        }

        XCTAssertEqual(relaunchCount, 0)
    }

    @MainActor
    private func makeMonitor(
        source: MockLifecycleSource,
        approvedApplicationURL: (() -> URL?)? = nil,
        applicationBuildIdentity: @escaping (URL) -> String? = { _ in
            "approved"
        },
        applicationLiveness: ChatGPTApplicationProcessLiveness =
            ChatGPTApplicationProcessLiveness(),
        applicationIsRunning: ((
            any ChatGPTApplicationProcess
        ) -> Bool)? = { application in
            !application.isTerminated
        },
        recoveryAllowed: @escaping () -> Bool = { true },
        verificationPollLimit: Int = 2,
        pollDelay: @escaping () async -> Void = { await Task.yield() },
        reservationPollDelay: @escaping () async -> Void = {
            await Task.yield()
        },
        launchReservationState: @escaping (
            any ChatGPTApplicationProcess
        ) -> ChatGPTLaunchReservationState = { _ in
            .none
        },
        acquireRecoveryClaim: @escaping (
            URL
        ) -> (any ChatGPTRecoveryClaim)? = { _ in
            MockRecoveryClaim()
        },
        verificationFailureHandler: @escaping (
            ChatGPTInjectionFailure
        ) -> Void = { _ in },
        relaunch: @escaping ChatGPTLaunchRecoveryMonitor.Relaunch
    ) -> ChatGPTLaunchRecoveryMonitor {
        ChatGPTLaunchRecoveryMonitor(
            lifecycleSource: source,
            approvedApplicationURL: approvedApplicationURL
                ?? { self.applicationURL },
            applicationBuildIdentity: applicationBuildIdentity,
            injectionEnabled: { application in
                (application as? MockApplication)?.injected == true
            },
            applicationLiveness: applicationLiveness,
            applicationIsRunning: applicationIsRunning,
            recoveryAllowed: recoveryAllowed,
            launchReservationState: launchReservationState,
            acquireRecoveryClaim: acquireRecoveryClaim,
            relaunch: relaunch,
            launchErrorHandler: { _ in },
            verificationFailureHandler: verificationFailureHandler,
            quitPollLimit: 2,
            verificationPollLimit: verificationPollLimit,
            reservationPollDelay: reservationPollDelay,
            pollDelay: pollDelay
        )
    }

    @MainActor
    private func waitUntil(
        _ condition: @escaping () -> Bool,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        for _ in 0..<100 {
            if condition() { return }
            await Task.yield()
        }
        XCTFail("Condition did not become true", file: file, line: line)
    }
}

@MainActor
private final class MockRecoveryClaim: ChatGPTRecoveryClaim {
    func release() {}
}

@MainActor
private final class MockLifecycleSource: ChatGPTLifecycleSource {
    var applications: [any ChatGPTApplicationProcess]
    var onEnumerate: (() -> Void)?
    var onStart: (() -> Void)?
    private(set) var operations = [String]()
    private var launchHandler: ((any ChatGPTApplicationProcess) -> Void)?
    private var terminationHandler:
        ((any ChatGPTApplicationProcess) -> Void)?

    init(applications: [any ChatGPTApplicationProcess] = []) {
        self.applications = applications
    }

    var runningApplications: [any ChatGPTApplicationProcess] {
        operations.append("enumerate")
        onEnumerate?()
        return applications
    }

    func start(
        launchHandler: @escaping (any ChatGPTApplicationProcess) -> Void,
        terminationHandler: @escaping (any ChatGPTApplicationProcess) -> Void
    ) {
        operations.append("start")
        self.launchHandler = launchHandler
        self.terminationHandler = terminationHandler
        onStart?()
    }

    func stop() {}

    func emitLaunch(_ application: any ChatGPTApplicationProcess) {
        launchHandler?(application)
    }

    func emitTermination(_ application: any ChatGPTApplicationProcess) {
        terminationHandler?(application)
    }
}

@MainActor
private final class MockApplication: ChatGPTApplicationProcess {
    let processIdentifier: pid_t
    let launchDate: Date?
    let bundleIdentifier: String? = ChatGPTLauncher.chatGPTBundleIdentifier
    let bundleURL: URL?
    var isActive: Bool
    var isFinishedLaunching: Bool
    var isTerminated = false
    var injected: Bool
    var terminateResult = true
    var onTerminate: (() -> Void)?
    private(set) var hideCount = 0
    private(set) var unhideCount = 0
    private(set) var terminateCount = 0

    init(
        pid: pid_t,
        url: URL,
        active: Bool = false,
        finished: Bool = false,
        injected: Bool = false,
        launchDateAvailable: Bool = true
    ) {
        processIdentifier = pid
        launchDate = launchDateAvailable
            ? Date(timeIntervalSince1970: TimeInterval(pid))
            : nil
        bundleURL = url
        isActive = active
        isFinishedLaunching = finished
        self.injected = injected
    }

    var identity: ChatGPTApplicationIdentity {
        ChatGPTApplicationIdentity(
            processIdentifier: processIdentifier,
            launchDate: launchDate
        )
    }

    func hide() -> Bool {
        hideCount += 1
        return true
    }

    func unhide() -> Bool {
        unhideCount += 1
        return true
    }

    func terminate() -> Bool {
        terminateCount += 1
        onTerminate?()
        return terminateResult
    }
}
