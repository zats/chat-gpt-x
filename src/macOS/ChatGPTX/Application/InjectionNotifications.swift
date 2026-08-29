import AppKit
@preconcurrency import UserNotifications

final class InjectionNotificationController: NSObject,
    UNUserNotificationCenterDelegate
{
    private static let restartAction = "restart-chatgpt"
    private static let updateAction = "check-for-updates"
    private static let restartCategory = "extensions-disabled"
    private static let updateCategory = "binding-missing"
    static let restartNotificationIdentifier =
        "chatgptx-restart-required"

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
        switch failure {
        case .extensionsDisabled:
            content.categoryIdentifier = Self.restartCategory
        case .bindingMissing:
            content.categoryIdentifier = Self.updateCategory
        }

        deliver(
            content,
            identifier: Self.notificationIdentifier(for: failure)
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
            identifier: Self.restartNotificationIdentifier
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
                    Self.replace(
                        content,
                        identifier: identifier,
                        to: center
                    )
                }
            case .authorized, .provisional, .ephemeral:
                Self.replace(
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

    static func notificationIdentifier(
        for failure: ChatGPTInjectionFailure
    ) -> String {
        switch failure {
        case .extensionsDisabled:
            Self.restartNotificationIdentifier
        case .bindingMissing(let processIdentifier):
            "chatgptx-injection-\(processIdentifier)"
        }
    }

    private nonisolated static func replace(
        _ content: UNNotificationContent,
        identifier: String,
        to center: UNUserNotificationCenter
    ) {
        center.removePendingNotificationRequests(
            withIdentifiers: [identifier]
        )
        center.removeDeliveredNotifications(
            withIdentifiers: [identifier]
        )
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
