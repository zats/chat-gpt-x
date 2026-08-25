# Launcher Updates

## Scope

Sparkle updates `ChatGPTX.app`. The component updater remains responsible for
the ChatGPT API runtime, exact-build bindings, and extensions. These update
systems do not share packages or version numbers.

## Update behavior

Release builds use Sparkle 2.9 through SwiftPM, with 2.9.3 as the minimum
package version. `Info.plist` enables automatic checks and automatic
installation by default. Sparkle reads the checked-in
[`appcast.xml`](../appcast.xml) from the repository's `main` branch. Each
appcast enclosure points to a notarized ZIP in a GitHub Release named
`launcher-v<version>`.

Development builds do not start Sparkle. ChatGPTX enables the updater only when
the application has a Developer ID Application signature. This prevents a
local build from replacing itself with a public release.

Both the ChatGPTX application menu and status-item menu show the same update
state:

- Check for Updates…
- Checking for Updates…
- A new version is available or downloading
- The downloaded version is ready to install and restart
- ChatGPTX is up to date
- The update check failed and can be retried

## Signing key

The application contains only this Sparkle Ed25519 public key:

```text
lkJyHKoZxlwe1nhfrrfLVHvsCnSwX3JLYD9G8XoIw7Y=
```

The matching private key is stored in the release maintainer's macOS Keychain
under the Sparkle account `com.chatgptx.launcher`. Never commit or print the
private key. For a CI release, export it with Sparkle's `generate_keys` tool and
store the file contents as the `CHATGPTX_SPARKLE_PRIVATE_KEY` secret.

## Release flow

Before a launcher release:

1. Increment `MARKETING_VERSION` and the monotonically increasing
   `CURRENT_PROJECT_VERSION` in `src/macOS/project.yaml`.
2. Commit the release code and push the exact commit to `main`.
3. Prepare a Markdown file with the public release notes.
4. Set the signing and notarization environment described by
   `scripts/release-launcher.sh --help`.
5. Run `scripts/release-launcher.sh <release-notes.md>` from a clean `main`
   checkout.

The script then:

1. Builds and tests a fresh Release application.
2. Confirms that the application has a Developer ID signature.
3. Submits the application to Apple's notarization service, staples the
   ticket, and validates Gatekeeper acceptance.
4. Creates `ChatGPTX-<version>.zip` and signs it with the Sparkle key.
5. Uses Pandoc to convert the Markdown notes to HTML, then uses Sparkle's
   `generate_appcast` tool to add the release to `appcast.xml`.
6. Creates `launcher-v<version>` as a draft GitHub Release, uploads the ZIP,
   publishes the release, and then pushes the appcast commit to `main`.
7. Verifies that the public feed contains the new build and that its enclosure
   is reachable.

The release asset must be public before the appcast commit reaches `main`.
This order prevents users from receiving an update URL that returns 404.
