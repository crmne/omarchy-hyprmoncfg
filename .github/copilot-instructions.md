# Copilot instructions

Read and follow `AGENTS.md` and `README.md` before reviewing or changing this
repository. Keep changes narrowly scoped and preserve existing behavior unless
the task explicitly changes it.

## Repository boundaries

- This repository is the Omarchy shell plugin. It owns the QML panel, the
  persistent preview guard, the JavaScript presentation model, plugin metadata,
  installation and update presentation, and integration with Omarchy shell
  APIs.
- `crmne/hyprmoncfg` owns the daemon and CLI, the versioned IPC protocol,
  monitor discovery and matching, profile persistence and application,
  generated Hyprland configuration, and the `manage` and `unmanage` behavior.
  Do not implement backend protocol behavior in this plugin.
- `basecamp/omarchy` owns the shell APIs and packaged monitor-changing paths.
  Do not patch packaged Omarchy files from this plugin.
- `omacom/omarchy-plugin-marketplace` owns publication and verification. Never
  change a release tag or marketplace commit after publication.

## Review priorities

- Treat display safety as a release blocker. Every topology-changing edit must
  preserve the preview, countdown, explicit Keep or Revert decision, recovery
  after monitor remaps, and a route back to a visible working display.
- Preserve the ownership contract. Managed mode lets hyprmoncfg control monitor
  state; `unmanage` hands it back cleanly. Do not add a second monitor watcher
  or competing direct Hyprland configuration path.
- `PreviewGuard.qml` is a persistent service because monitor changes can rebuild
  every per-monitor bar instance. Keep preview transaction state and input
  recovery there. The panel may coordinate with it, but must still handle a
  disconnected service safely.
- `Panel.qml` communicates with `hyprmoncfgd` over newline-delimited JSON at
  protocol version 1. Validate envelopes, correlate request IDs, serialize
  conflicting asynchronous edits, and prevent delayed responses from replacing
  newer local state.
- Keep `Model.js` compatible with both QML's JavaScript runtime and CommonJS for
  Node tests. Put deterministic transformations there and export every function
  that tests call. Avoid modern syntax unsupported by the shell runtime.
- Use `Quickshell.Io.Process` argument arrays when possible. If a shell command
  is necessary, pass data as positional arguments, quote it, bound or discard
  subprocess output, defend runtime files from symlinks, and keep long-running
  work out of the shell process.
- Installation and AUR upgrades must remain visible and interactive in
  Omarchy's presented terminal. Never add `--noconfirm` or run privileged work
  invisibly. Release package installation must restart the user daemon before
  opening the TUI.
- Brightness is live hardware state, never profile state. Keep read and write
  requests tied to the selected connected output, and preserve queued or
  debounced updates when selection changes.
- Preserve keyboard and pointer parity with the hyprmoncfg TUI. Async server
  normalization must not make controls flicker or temporarily lose their local
  option. Visual changes need before-and-after evidence for compact and expanded
  layouts at representative sizes.
- Keep `manifest.json` IDs, entry points, minimum backend version, and protocol
  version aligned with actual support. Do not advertise a backend capability
  merely because an IPC field exists.
- Require focused Node regression tests for model or state behavior, `qmllint`
  for QML changes, `omarchy plugin validate .`, and `git diff --check`.

## Review communication

Lead with concrete, actionable defects introduced by the change. Distinguish
confirmed bugs from questions, avoid speculative redesigns and adjacent
refactors, and report which validation actually ran. Never use em dashes in
repository-facing prose.
