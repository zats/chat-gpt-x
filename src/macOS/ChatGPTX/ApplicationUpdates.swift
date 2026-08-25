import AppKit
import Security
import Sparkle

enum ApplicationUpdateAction: Equatable {
    case check
    case install
}

enum ApplicationUpdateState: Equatable {
    case idle
    case checking
    case available(version: String)
    case downloading(version: String)
    case ready(version: String)
    case installing(version: String)
    case upToDate
    case failed(message: String)
    case unavailable

    var menuPresentation: ApplicationUpdateMenuPresentation {
        switch self {
        case .idle:
            ApplicationUpdateMenuPresentation(
                title: "Check for Updates…",
                action: .check
            )
        case .checking:
            ApplicationUpdateMenuPresentation(
                title: "Checking for Updates…"
            )
        case .available(let version):
            ApplicationUpdateMenuPresentation(
                title: "ChatGPTX \(version) Available…",
                action: .check
            )
        case .downloading(let version):
            ApplicationUpdateMenuPresentation(
                title: "Downloading ChatGPTX \(version)…"
            )
        case .ready(let version):
            ApplicationUpdateMenuPresentation(
                title: "Install ChatGPTX \(version) and Restart…",
                action: .install
            )
        case .installing(let version):
            ApplicationUpdateMenuPresentation(
                title: "Installing ChatGPTX \(version)…"
            )
        case .upToDate:
            ApplicationUpdateMenuPresentation(
                title: "ChatGPTX Is Up to Date — Check Again…",
                action: .check
            )
        case .failed(let message):
            ApplicationUpdateMenuPresentation(
                title: "Update Check Failed — Try Again…",
                action: .check,
                toolTip: message
            )
        case .unavailable:
            ApplicationUpdateMenuPresentation(
                title: "App Updates Unavailable"
            )
        }
    }
}

struct ApplicationUpdateMenuPresentation: Equatable {
    let title: String
    let action: ApplicationUpdateAction?
    let toolTip: String?

    init(
        title: String,
        action: ApplicationUpdateAction? = nil,
        toolTip: String? = nil
    ) {
        self.title = title
        self.action = action
        self.toolTip = toolTip
    }
}

final class ApplicationUpdateMenuItemController: NSObject {
    let menuItem = NSMenuItem()

    private let perform: (ApplicationUpdateAction) -> Void
    private var action: ApplicationUpdateAction?

    init(perform: @escaping (ApplicationUpdateAction) -> Void) {
        self.perform = perform
        super.init()
        menuItem.target = self
        menuItem.action = #selector(performCurrentAction)
        show(.idle)
    }

    func show(_ state: ApplicationUpdateState) {
        let presentation = state.menuPresentation
        action = presentation.action
        menuItem.title = presentation.title
        menuItem.toolTip = presentation.toolTip
        menuItem.isEnabled = presentation.action != nil
    }

    @objc
    func performCurrentAction() {
        guard let action else { return }
        perform(action)
    }
}

final class ApplicationUpdateController: NSObject, SPUUpdaterDelegate {
    var onStateChange: ((ApplicationUpdateState) -> Void)?

    private(set) var state = ApplicationUpdateState.unavailable
    private var standardUpdaterController: SPUStandardUpdaterController?
    private var immediateInstallHandler: ImmediateInstallHandler?
    private var updateVersion: String?

    func start() {
        guard standardUpdaterController == nil else { return }
        guard Self.isDeveloperIDSigned(bundleURL: Bundle.main.bundleURL) else {
            setState(.unavailable)
            return
        }

        let controller = SPUStandardUpdaterController(
            startingUpdater: false,
            updaterDelegate: self,
            userDriverDelegate: nil
        )
        standardUpdaterController = controller
        setState(.idle)
        controller.startUpdater()
    }

    func perform(_ action: ApplicationUpdateAction) {
        switch action {
        case .check:
            checkForUpdates()
        case .install:
            installUpdate()
        }
    }

    private func checkForUpdates() {
        guard let standardUpdaterController else { return }
        setState(.checking)
        standardUpdaterController.checkForUpdates(nil)
    }

    private func installUpdate() {
        guard let immediateInstallHandler else {
            checkForUpdates()
            return
        }
        setState(.installing(version: updateVersion ?? "Update"))
        immediateInstallHandler.install()
    }

    private func setState(_ state: ApplicationUpdateState) {
        guard self.state != state else { return }
        self.state = state
        onStateChange?(state)
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        didFindValidUpdate item: SUAppcastItem
    ) {
        _ = updater
        Task { @MainActor in
            self.updateVersion = item.displayVersionString
            self.setState(.available(version: item.displayVersionString))
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        willDownloadUpdate item: SUAppcastItem,
        with request: NSMutableURLRequest
    ) {
        _ = updater
        _ = request
        Task { @MainActor in
            self.updateVersion = item.displayVersionString
            self.setState(.downloading(version: item.displayVersionString))
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        didDownloadUpdate item: SUAppcastItem
    ) {
        _ = updater
        Task { @MainActor in
            self.updateVersion = item.displayVersionString
            self.setState(.downloading(version: item.displayVersionString))
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        failedToDownloadUpdate item: SUAppcastItem,
        error: any Error
    ) {
        _ = updater
        _ = item
        Task { @MainActor in
            self.clearPendingInstallation()
            self.setState(.failed(message: error.localizedDescription))
        }
    }

    nonisolated func updaterDidNotFindUpdate(
        _ updater: SPUUpdater,
        error: any Error
    ) {
        _ = updater
        _ = error
        Task { @MainActor in
            self.clearPendingInstallation()
            self.setState(.upToDate)
        }
    }

    nonisolated func userDidCancelDownload(_ updater: SPUUpdater) {
        _ = updater
        Task { @MainActor in
            self.clearPendingInstallation()
            self.setState(.idle)
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        willInstallUpdateOnQuit item: SUAppcastItem,
        immediateInstallationBlock immediateInstallHandler:
            @escaping () -> Void
    ) -> Bool {
        _ = updater
        let handler = ImmediateInstallHandler(immediateInstallHandler)
        Task { @MainActor in
            self.immediateInstallHandler = handler
            self.updateVersion = item.displayVersionString
            self.setState(.ready(version: item.displayVersionString))
        }
        return true
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        userDidMake choice: SPUUserUpdateChoice,
        forUpdate updateItem: SUAppcastItem,
        state: SPUUserUpdateState
    ) {
        _ = updater
        let downloaded = state.stage == .downloaded
        Task { @MainActor in
            switch choice {
            case .install:
                self.setState(
                    .installing(version: updateItem.displayVersionString)
                )
            case .skip:
                self.clearPendingInstallation()
                self.setState(.idle)
            case .dismiss:
                self.setState(
                    downloaded
                        ? .ready(version: updateItem.displayVersionString)
                        : .available(version: updateItem.displayVersionString)
                )
            @unknown default:
                self.clearPendingInstallation()
                self.setState(.idle)
            }
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        didAbortWithError error: any Error
    ) {
        _ = updater
        Task { @MainActor in
            self.clearPendingInstallation()
            self.setState(.failed(message: error.localizedDescription))
        }
    }

    nonisolated func updater(
        _ updater: SPUUpdater,
        didFinishUpdateCycleFor updateCheck: SPUUpdateCheck,
        error: (any Error)?
    ) {
        _ = updater
        _ = updateCheck
        Task { @MainActor in
            guard case .checking = self.state else { return }
            if let error {
                self.setState(.failed(message: error.localizedDescription))
            } else {
                self.setState(.idle)
            }
        }
    }

    private func clearPendingInstallation() {
        immediateInstallHandler = nil
        updateVersion = nil
    }

    private static func isDeveloperIDSigned(bundleURL: URL) -> Bool {
        var staticCode: SecStaticCode?
        guard SecStaticCodeCreateWithPath(
            bundleURL as CFURL,
            SecCSFlags(),
            &staticCode
        ) == errSecSuccess, let staticCode else {
            return false
        }

        var information: CFDictionary?
        guard SecCodeCopySigningInformation(
            staticCode,
            SecCSFlags(rawValue: kSecCSSigningInformation),
            &information
        ) == errSecSuccess,
            let information = information as? [String: Any],
            let certificates = information[
                kSecCodeInfoCertificates as String
            ] as? [SecCertificate],
            let certificate = certificates.first,
            let summary = SecCertificateCopySubjectSummary(certificate)
                as String?
        else {
            return false
        }
        return summary.hasPrefix("Developer ID Application:")
    }
}

private final class ImmediateInstallHandler: @unchecked Sendable {
    nonisolated(unsafe) private let handler: () -> Void

    nonisolated init(_ handler: @escaping () -> Void) {
        self.handler = handler
    }

    func install() {
        handler()
    }
}
