# Repository guidance

## Product and cross-repository contract

Read `DESIGN.md` before changing user-visible behavior, and the canonical shared
design in `crmne/hyprmoncfg` (`../hyprmoncfg/DESIGN.md` in a sibling checkout).
Proposed roadmap items are not shipped features. Keep each task scoped; use the
dated baseline review to distinguish gaps from regressions.

The panel and TUI are two interfaces to the same product. Keep operations,
terminology, defaults, page order, and preview semantics aligned while using native
controls. Document capability gaps and companion changes. Read
`.github/copilot-instructions.md` for architecture and review guidance.

- Unknown displays should become usable without overwriting saved profiles.
  Preserve intentional disabled/strict policies and workspace intent.
- Distinguish connected, enabled, usable, sleeping, mirrored, and disconnected.
  Off displays need discoverable selection and enable actions.
- Keep matching, mode selection, preferences, workspace resolution, validation,
  persistence, and recovery in Go. Never add a competing monitor writer/watcher.
- Preserve daemon preview ownership/deadlines, atomic commit-and-save, and guard
  recovery across bar rebuilds. Do not steal a live TUI preview or cover it with Identify.
- Distinguish automatic drafts, editor drafts, and saved profiles. Correlate
  asynchronous responses and preserve edits during automatic refresh and hotplug.
- Brightness is live hardware state; SDR/HDR luminance is profile state. Preserve
  calibration and supported profile fields through edits.
- Keep actions accessible by pointer and keyboard, main navigation readable,
  profile menus discoverable, and footers visible at small sizes.
- Gate operations on backend support, coordinate IPC/client changes, and review
  overlapping PRs before duplicating work.
- Use actual before/after compact and expanded captures for UI changes. Label
  historical screenshots and mockups; state which physical checks actually ran.

`design/monitor-manager.html` is an isolated sample-data study, not production QML.
Documentation changes need link/content and whitespace checks, not tests of prose.

## Presentation consistency

- No inline keyboard hints in action labels. Keep shortcuts in footer/help;
  only the numbered 1, 2, 3 navigation tabs are exceptions.
- Follow the shared design's Accepted display presentation contract. Use shared
  formatters: connector identity, model, compact resolution@Hz, Scale and
  Position, bare workspace IDs. Never add display numbering or logical-size text.
- Keep hardware-only inspector details separate from live/draft controls.
  Show all six fields directly; Identify is the only action, with no disclosure toggle.
  Panel size uses whole inches with a plain quote (`32" (710x400mm)`); scale uses
  ASCII x. Canvas/Identify model labels include `32"`; inspector Model does not.
- Say Post-apply command in the UI, last in profile details; reserve exec for
  code/storage. Match native theme controls and make actions keyboard/pointer
  accessible. Keep profile columns aligned and avoid redundant selection arrows.
- Only backend-confirmed save success establishes a clean editor baseline.
- Visual review precedes commits for this design pass. Record tested sizes and
  explicit capability gaps; do not claim full panel/TUI parity from formatting.

## Validation

Before committing a change, run:

```sh
node --test tests/*.test.js
qmllint *.qml
QT_QUICK_BACKEND=software /usr/lib/qt6/bin/qmltestrunner -platform offscreen -input tests/qml
omarchy plugin validate .
git diff --check
```

## Release process

1. Use the next semantic version. Never move or replace a published tag.
2. Update `manifest.json` and commit all release changes on `main`.
3. Run the full validation commands above.
4. Push `main`, tag the exact release commit as `v<version>`, and push the tag.
5. Confirm the Release workflow completed and the GitHub release exists.
6. Open a new verification issue in `omacom/omarchy-plugin-marketplace` using the verification form. Choose `Verify and publish a newer upstream commit`, keep the form headings unchanged, and target the full 40-character release commit SHA.
7. Confirm the marketplace automation accepts the exact commit. Respond to review findings before considering the release complete.
