# Computer Use forbidden targets

## Scope

Computer Use has a forbidden-target policy in addition to its normal app
approval controls. The policy prevents Computer Use from controlling
applications that can run commands, control Codex or ChatGPT, or show sensitive
Apple security UI.

The policy is part of the Computer Use agent. Its target list can change when
the agent is updated.

## Allow forbidden targets

To let Codex and ChatGPT Computer Use control all targets that the agent marks
as forbidden, set this global macOS preference:

```sh
defaults write -g ComputerUseAllowForbiddenTargets -bool YES
```

This preference applies to all Computer Use clients in the current macOS user
account. It is not limited to one Electron profile, one `CODEX_HOME`, or one
ChatGPT instance.

This setting removes an important protection. Computer Use can then control
terminal apps, Codex and ChatGPT apps, and Apple security services. Enable it
only when this access is necessary.

## Known targets

The known forbidden targets are:

- Terminal apps: `com.apple.Terminal`, `com.googlecode.iterm2`,
  `org.alacritty`, `dev.warp.Warp-Stable`, `net.kovidgoyal.kitty`,
  `co.zeit.hyper`, `com.github.wez.wezterm`, `org.tabby`,
  `com.mitchellh.ghostty`, `com.raphaelamorim.rio`, and
  `dev.commandline.waveterm`.
- Codex apps: `com.openai.codex`, including the alpha, beta, dev, and nightly
  channels.
- ChatGPT apps: `com.openai.chat`, including the alpha, beta, nightly, and
  mac-debug channels.
- Apple system and security services: `com.apple.UserNotificationCenter`,
  `com.apple.LocalAuthenticationRemoteService`, and `com.apple.SecurityAgent`.

This list is not a fixed contract. The global preference applies to the
Computer Use agent's current forbidden-target set, including targets that a
later agent version adds.

## Restore the default policy

Remove the global preference to restore the default protection:

```sh
defaults delete -g ComputerUseAllowForbiddenTargets
```
