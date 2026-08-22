import AppKit
@preconcurrency import UserNotifications

final class InjectionNotificationController: NSObject,
    UNUserNotificationCenterDelegate
{
    private static let restartAction = "restart-chatgpt"
    private static let updateAction = "check-for-updates"
    private static let restartCategory = "extensions-disabled"
    private static let updateCategory = "binding-missing"

    var onRestart: (() -> Void)?
    var onCheckForUpdates: (() -> Void)?

    override init() {
        super.init()

        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([
            UNNotificationCategory(
                identifier: Self.restartCategory,
                actions: [
                    UNNotificationAction(
                        identifier: Self.restartAction,
                        title: "Restart ChatGPT"
                    )
                ],
                intentIdentifiers: []
            ),
            UNNotificationCategory(
                identifier: Self.updateCategory,
                actions: [
                    UNNotificationAction(
                        identifier: Self.updateAction,
                        title: "Check for Updates"
                    )
                ],
                intentIdentifiers: []
            ),
        ])
    }

    func notify(_ failure: ChatGPTInjectionFailure) {
        let content = UNMutableNotificationContent()
        let notificationText = Self.notificationText(for: failure)
        content.title = notificationText.title
        content.body = notificationText.body
        let processIdentifier: pid_t
        switch failure {
        case .extensionsDisabled(let pid):
            processIdentifier = pid
            content.categoryIdentifier = Self.restartCategory
        case .bindingMissing(let pid):
            processIdentifier = pid
            content.categoryIdentifier = Self.updateCategory
        }

        deliver(
            content,
            identifier: "chatgptx-injection-\(processIdentifier)"
        )
    }

    func notifyRuntimeReady(chatgptVersion: String) {
        let content = UNMutableNotificationContent()
        let notificationText = Self.runtimeReadyNotificationText(
            for: chatgptVersion
        )
        content.title = notificationText.title
        content.body = notificationText.body
        content.categoryIdentifier = Self.restartCategory

        deliver(
            content,
            identifier: "chatgptx-runtime-ready-\(chatgptVersion)"
        )
    }

    private func deliver(
        _ content: UNNotificationContent,
        identifier: String
    ) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined:
                center.requestAuthorization(
                    options: [.alert, .sound]
                ) { granted, _ in
                    guard granted else { return }
                    Self.add(
                        content,
                        identifier: identifier,
                        to: center
                    )
                }
            case .authorized, .provisional, .ephemeral:
                Self.add(
                    content,
                    identifier: identifier,
                    to: center
                )
            case .denied:
                break
            @unknown default:
                break
            }
        }
    }

    static func runtimeReadyNotificationText(
        for chatgptVersion: String
    ) -> (title: String, body: String) {
        (
            title: "ChatGPT Runtime Ready",
            body: "Runtime support for ChatGPT \(chatgptVersion) is ready. Restart ChatGPT to enable extensions."
        )
    }

    static func notificationText(
        for failure: ChatGPTInjectionFailure
    ) -> (title: String, body: String) {
        switch failure {
        case .extensionsDisabled:
            (
                title: "ChatGPT Extensions Disabled",
                body: "Restart ChatGPT to enable extensions."
            )
        case .bindingMissing:
            (
                title: "ChatGPT Runtime Not Supported",
                body: "No matching runtime is installed for this ChatGPT build. ChatGPT will run without extensions while ChatGPTX checks for support."
            )
        }
    }

    private nonisolated static func add(
        _ content: UNNotificationContent,
        identifier: String,
        to center: UNUserNotificationCenter
    ) {
        center.add(
            UNNotificationRequest(
                identifier: identifier,
                content: content,
                trigger: nil
            )
        )
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler:
            @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionIdentifier = response.actionIdentifier
        completionHandler()
        Task { @MainActor [weak self] in
            if actionIdentifier == Self.restartAction {
                self?.onRestart?()
            } else if actionIdentifier == Self.updateAction {
                self?.onCheckForUpdates?()
            }
        }
    }
}
