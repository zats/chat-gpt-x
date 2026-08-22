import Darwin
import Foundation

struct ChatGPTApplicationIdentity: Hashable, Sendable {
    let processIdentifier: pid_t
    let launchDate: Date?
}

struct ChatGPTLaunchCandidate: Equatable, Sendable {
    let identity: ChatGPTApplicationIdentity
    let hasVerifiedBuild: Bool
    let hasInjectedPlatform: Bool
    let isActive: Bool
    let isFinishedLaunching: Bool
}

enum ChatGPTLaunchRecoveryAction: Equatable {
    case ignore
    case recover(ChatGPTApplicationIdentity)
    case stopUnexpected(ChatGPTApplicationIdentity)
}

struct ChatGPTLaunchRecoveryState: Equatable {
    enum Phase: Equatable {
        case bootstrapping
        case armed
        case stopping(ChatGPTApplicationIdentity)
        case relaunchPending(ChatGPTApplicationIdentity)
        case expectingSelfLaunch(ChatGPTApplicationIdentity?)
        case verifying(
            source: ChatGPTApplicationIdentity?,
            application: ChatGPTApplicationIdentity
        )
        case blocked(ChatGPTApplicationIdentity)
        case circuitOpen(ChatGPTApplicationIdentity?)
    }

    private(set) var phase: Phase = .bootstrapping
    private(set) var preexistingApplications = Set<ChatGPTApplicationIdentity>()
    private(set) var selfLaunchedApplications = Set<ChatGPTApplicationIdentity>()
    private(set) var externallyLaunchedApplications =
        Set<ChatGPTApplicationIdentity>()
    private(set) var recoveryAttemptedApplications =
        Set<ChatGPTApplicationIdentity>()

    var isAutomaticRecoveryActive: Bool {
        switch phase {
        case .stopping, .relaunchPending:
            true
        case .expectingSelfLaunch(let source),
            .verifying(let source, _):
            source != nil
        case .bootstrapping, .armed, .blocked, .circuitOpen:
            false
        }
    }

    var isExpectingSelfLaunch: Bool {
        if case .expectingSelfLaunch = phase {
            return true
        }
        return false
    }

    mutating func finishBootstrapping(
        applications: Set<ChatGPTApplicationIdentity>
    ) {
        guard phase == .bootstrapping else { return }
        preexistingApplications.formUnion(applications)
        phase = .armed
    }

    mutating func observeLaunch(
        _ candidate: ChatGPTLaunchCandidate,
        liveApplications: Set<ChatGPTApplicationIdentity>,
        recoveryAllowed: Bool
    ) -> ChatGPTLaunchRecoveryAction {
        let identity = candidate.identity

        if preexistingApplications.contains(identity)
            || selfLaunchedApplications.contains(identity)
            || externallyLaunchedApplications.contains(identity)
            || recoveryAttemptedApplications.contains(identity)
        {
            return .ignore
        }

        switch phase {
        case .stopping, .relaunchPending:
            guard candidate.hasVerifiedBuild,
                !candidate.hasInjectedPlatform,
                !candidate.isActive,
                !candidate.isFinishedLaunching
            else {
                return .ignore
            }
            recoveryAttemptedApplications.insert(identity)
            return .stopUnexpected(identity)
        default:
            break
        }

        if case .expectingSelfLaunch = phase {
            guard candidate.hasVerifiedBuild,
                !candidate.hasInjectedPlatform,
                !candidate.isActive,
                !candidate.isFinishedLaunching,
                liveApplications.subtracting([identity]).isEmpty
            else {
                return .ignore
            }
            recoveryAttemptedApplications.insert(identity)
            return .stopUnexpected(identity)
        }

        guard phase == .armed,
            recoveryAllowed,
            candidate.hasVerifiedBuild,
            !candidate.hasInjectedPlatform,
            liveApplications.subtracting([identity]).isEmpty
        else {
            return .ignore
        }

        recoveryAttemptedApplications.insert(identity)
        phase = .stopping(identity)
        return .recover(identity)
    }

    mutating func candidateDidTerminate(
        _ identity: ChatGPTApplicationIdentity
    ) {
        guard phase == .stopping(identity) else { return }
        phase = .relaunchPending(identity)
    }

    mutating func candidateStopFailed(
        _ identity: ChatGPTApplicationIdentity
    ) {
        guard phase == .stopping(identity) else { return }
        phase = .blocked(identity)
    }

    mutating func candidateRecoveryClaimDenied(
        _ identity: ChatGPTApplicationIdentity
    ) {
        guard phase == .stopping(identity) else { return }
        externallyLaunchedApplications.insert(identity)
        phase = .armed
    }

    mutating func registerExpectedLaunch() {
        switch phase {
        case .relaunchPending(let source):
            phase = .expectingSelfLaunch(source)
        case .expectingSelfLaunch:
            break
        default:
            phase = .expectingSelfLaunch(nil)
        }
    }

    mutating func registerExternalLaunch(
        _ identity: ChatGPTApplicationIdentity
    ) {
        externallyLaunchedApplications.insert(identity)
    }

    mutating func bindExpectedLaunch(
        _ identity: ChatGPTApplicationIdentity
    ) {
        switch phase {
        case .expectingSelfLaunch(let source):
            selfLaunchedApplications.insert(identity)
            phase = .verifying(source: source, application: identity)
        case .verifying(let source, _):
            selfLaunchedApplications.insert(identity)
            phase = .verifying(source: source, application: identity)
        default:
            break
        }
    }

    mutating func expectedLaunchFailed() {
        switch phase {
        case .expectingSelfLaunch(let source):
            phase = source.map(Phase.circuitOpen) ?? .armed
        case .verifying(let source, let application):
            selfLaunchedApplications.remove(application)
            phase = source.map(Phase.circuitOpen) ?? .armed
        case .relaunchPending(let source):
            phase = .circuitOpen(source)
        default:
            break
        }
    }

    mutating func verificationSucceeded(
        _ identity: ChatGPTApplicationIdentity
    ) {
        guard case .verifying(_, let application) = phase,
            application == identity
        else {
            return
        }
        phase = .armed
    }

    mutating func verificationFailed(
        _ identity: ChatGPTApplicationIdentity
    ) {
        guard case .verifying(_, let application) = phase,
            application == identity
        else {
            return
        }
        phase = .circuitOpen(identity)
    }

    mutating func applicationDidTerminate(
        _ identity: ChatGPTApplicationIdentity
    ) {
        preexistingApplications.remove(identity)
        selfLaunchedApplications.remove(identity)
        externallyLaunchedApplications.remove(identity)

        switch phase {
        case .stopping(let stopping) where stopping == identity:
            phase = .relaunchPending(identity)
        case .blocked(let blocked) where blocked == identity:
            phase = .armed
        case .circuitOpen(let blocked) where blocked == identity:
            phase = .armed
        case .verifying(let source, let application)
            where application == identity:
            phase = source.map(Phase.circuitOpen) ?? .armed
        default:
            break
        }
    }
}
