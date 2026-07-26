import CoreFoundation
import Darwin
import Permiso

enum AppManagementPermission {
    private typealias TCCAuthorizationPreflight = @convention(c) (
        CFString,
        UnsafeMutableRawPointer?
    ) -> UInt64

    private static let frameworkPath =
        "/System/Library/PrivateFrameworks/TCC.framework/TCC"
    private static let service =
        "kTCCServiceSystemPolicyAppBundles" as CFString
    private static let allowedAuthorization: UInt64 = 2

    static func requestIfNeeded() {
        guard !isGranted else { return }
        PermisoAssistant.shared.present(panel: .appManagement)
    }

    private static var isGranted: Bool {
        guard let framework = dlopen(frameworkPath, RTLD_NOW) else {
            preconditionFailure("Unable to load TCC.framework")
        }
        defer { dlclose(framework) }

        guard let symbol = dlsym(
            framework,
            "tcc_authorization_preflight"
        ) else {
            preconditionFailure(
                "tcc_authorization_preflight is unavailable"
            )
        }
        let preflight = unsafeBitCast(
            symbol,
            to: TCCAuthorizationPreflight.self
        )
        return preflight(service, nil) == allowedAuthorization
    }
}
