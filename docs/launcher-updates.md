# Launcher Updates

## Scope

Sparkle updates `ChatGPTX.app`. The component updater remains responsible for
the ChatGPT API runtime, exact-build bindings, and extensions. These update
systems do not share packages or version numbers.

## Update behavior

Release builds pin Sparkle 2.9.3 through SwiftPM. `Info.plist` enables
automatic checks and automatic installation by default. Sparkle reads the
checked-in [`appcast.xml`](../appcast.xml) from the repository's `main` branch.
Each appcast enclosure points to a notarized ZIP in a GitHub Release named
`launcher-v<version>`. Appcast generation keeps the latest 10 builds for each
Sparkle update branch.

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

The matching private key can be stored in the release maintainer's macOS
Keychain under the Sparkle account `com.chatgptx.launcher`. Never commit or
print the private key. The GitHub release workflow reads the exported key from
the `CHATGPTX_SPARKLE_PRIVATE_KEY` repository secret.

## Release flow

A successful `CI` push run for the current `main` commit starts
`.github/workflows/release-launcher.yml`. A failed CI run and a successful run
for a stale `main` commit do not publish a launcher.

The workflow manages versions as follows:

- For a normal `main` commit, it increments the patch part of
  `MARKETING_VERSION`.
- To start a new minor or major series, change `MARKETING_VERSION` in
  `src/macOS/project.yaml` before the commit reaches `main`. The workflow keeps
  that declared version. For example, it keeps `1.3.0` after `1.2.9` and keeps
  `2.0.0` after a `1.x` release.
- It increments `CURRENT_PROJECT_VERSION` for every release. A manual value can
  move the build number forward, but cannot make it decrease.

The workflow imports the Developer ID PKCS#12 file into a temporary keychain.
It gets the signing identity and team from that certificate. It does not store
those identifiers in the repository. The repository secrets are:

- `CHATGPTX_DEVELOPER_ID_P12_BASE64`
- `CHATGPTX_DEVELOPER_ID_P12_PASSWORD`
- `CHATGPTX_APP_STORE_CONNECT_API_KEY_P8`
- `CHATGPTX_APP_STORE_CONNECT_KEY_ID`
- `CHATGPTX_APP_STORE_CONNECT_ISSUER_ID`
- `CHATGPTX_SPARKLE_PRIVATE_KEY`

The release path then:

1. Commits and pushes the prepared launcher version.
2. Builds and tests a fresh Release application.
3. Confirms that the application and nested Sparkle helpers have timestamped
   Developer ID signatures.
4. Submits the application to Apple's notarization service, staples the
   ticket, and validates Gatekeeper acceptance.
5. Creates `ChatGPTX-<version>.zip` and signs it with the Sparkle key.
6. Uses Pandoc to convert the Markdown notes to HTML, then uses Sparkle's
   `generate_appcast` tool to add the release to `appcast.xml`.
7. Creates `launcher-v<version>` as a draft GitHub Release, uploads the ZIP,
   publishes the release, and then pushes the appcast commit to `main`.
8. Verifies that the public feed contains the new build and that its enclosure
   is reachable.

For a local end-to-end test, set the signing, notarization, and Sparkle
environment described by `scripts/release-launcher.sh --help`, then run:

```shell
scripts/release-launcher.sh \
  --local-only \
  --output-dir <artifact-directory> \
  <release-notes.md>
```

This mode performs signing, notarization, stapling, Gatekeeper validation,
packaging, and appcast generation. It does not create a GitHub Release or
change the checked-in appcast.

The release asset must be public before the appcast commit reaches `main`.
This order prevents users from receiving an update URL that returns 404.
