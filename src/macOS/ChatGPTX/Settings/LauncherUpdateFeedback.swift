import AppKit

enum UpdateButtonResult: Equatable {
    case noUpdates
    case updateAvailable
    case failure
}

enum UpdateButtonFeedbackState: Equatable {
    case reload
    case checking
    case result(UpdateButtonResult)

    var systemSymbolName: String? {
        switch self {
        case .reload:
            "arrow.clockwise"
        case .checking:
            nil
        case .result(.noUpdates):
            "checkmark"
        case .result(.updateAvailable):
            "gift"
        case .result(.failure):
            "exclamationmark"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .reload:
            "Check for Updates"
        case .checking:
            "Checking for updates"
        case .result(.noUpdates):
            "No updates available"
        case .result(.updateAvailable):
            "Update available"
        case .result(.failure):
            "Update check failed"
        }
    }

    var tintColor: NSColor {
        switch self {
        case .reload, .checking:
            .secondaryLabelColor
        case .result(.noUpdates):
            .systemGreen
        case .result(.updateAvailable):
            .systemPurple
        case .result(.failure):
            .systemRed
        }
    }

    func animatesTransition(to nextState: Self) -> Bool {
        systemSymbolName != nil && nextState.systemSymbolName != nil
    }
}

final class UpdateButtonFeedbackController {
    static let defaultResultDuration = Duration.seconds(2)
    static let defaultMinimumCheckingDuration = Duration.milliseconds(500)

    private let resultDuration: Duration
    private let minimumCheckingDuration: Duration
    private let onStateChange: @MainActor (UpdateButtonFeedbackState) -> Void
    private var pendingResult: UpdateButtonResult?
    private var resetTask: Task<Void, Never>?
    private var finishCheckingTask: Task<Void, Never>?
    private var checkingStartedAt: ContinuousClock.Instant?
    private var checkingGeneration = 0
    private var generation = 0

    private(set) var state = UpdateButtonFeedbackState.reload

    init(
        resultDuration: Duration = defaultResultDuration,
        minimumCheckingDuration: Duration = defaultMinimumCheckingDuration,
        onStateChange: @escaping @MainActor (
            UpdateButtonFeedbackState
        ) -> Void
    ) {
        self.resultDuration = resultDuration
        self.minimumCheckingDuration = minimumCheckingDuration
        self.onStateChange = onStateChange
    }

    func setChecking(_ isChecking: Bool) {
        if isChecking {
            checkingGeneration &+= 1
            finishCheckingTask?.cancel()
            finishCheckingTask = nil
            checkingStartedAt = ContinuousClock.now
            pendingResult = nil
            cancelReset()
            transition(to: .checking)
            return
        }

        guard state == .checking else { return }
        guard let checkingStartedAt else {
            finishChecking()
            return
        }
        let elapsed = checkingStartedAt.duration(to: ContinuousClock.now)
        let remaining = minimumCheckingDuration - elapsed
        guard remaining > .zero else {
            finishChecking()
            return
        }
        finishCheckingTask?.cancel()
        let expectedGeneration = checkingGeneration
        finishCheckingTask = Task { [weak self] in
            do {
                try await Task.sleep(for: remaining)
            } catch {
                return
            }
            guard let self,
                  checkingGeneration == expectedGeneration,
                  !Task.isCancelled
            else {
                return
            }
            finishChecking()
        }
    }

    private func finishChecking() {
        finishCheckingTask = nil
        checkingStartedAt = nil
        if let pendingResult {
            self.pendingResult = nil
            present(pendingResult)
        } else {
            transition(to: .reload)
        }
    }

    func showResult(_ result: UpdateButtonResult) {
        if state == .checking {
            pendingResult = result
        } else {
            pendingResult = nil
            present(result)
        }
    }

    private func present(_ result: UpdateButtonResult) {
        cancelReset()
        let expectedGeneration = generation
        transition(to: .result(result))
        resetTask = Task { [weak self] in
            do {
                try await Task.sleep(for: self?.resultDuration ?? .zero)
            } catch {
                return
            }
            guard let self,
                  generation == expectedGeneration,
                  !Task.isCancelled
            else {
                return
            }
            resetTask = nil
            transition(to: .reload)
        }
    }

    private func cancelReset() {
        generation &+= 1
        resetTask?.cancel()
        resetTask = nil
    }

    private func transition(to newState: UpdateButtonFeedbackState) {
        guard state != newState else { return }
        state = newState
        onStateChange(newState)
    }
}
