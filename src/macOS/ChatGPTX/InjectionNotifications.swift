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
        let processIdentifier: pid_t
        switch failure {
        case .extensionsDisabled(let pid):
            processIdentifier = pid
            content.title = "ChatGPT Extensions Disabled"
            content.body = "Restart ChatGPT to enable extensions."
            content.categoryIdentifier = Self.restartCategory
        case .bindingMissing(let pid):
            processIdentifier = pid
            content.title = "ChatGPT Update Needs Components"
            content.body = "Check for updates to install a matching binding."
            content.categoryIdentifier = Self.updateCategory
        }

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
                        processIdentifier: processIdentifier,
                        to: center
                    )
                }
            case .authorized, .provisional, .ephemeral:
                Self.add(
                    content,
                    processIdentifier: processIdentifier,
                    to: center
                )
            case .denied:
                break
            @unknown default:
                break
            }
        }
    }

    private nonisolated static func add(
        _ content: UNNotificationContent,
        processIdentifier: pid_t,
        to center: UNUserNotificationCenter
    ) {
        center.add(
            UNNotificationRequest(
                identifier: "chatgptx-injection-\(processIdentifier)",
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
