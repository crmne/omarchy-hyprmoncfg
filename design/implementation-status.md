# Implementation status, 2026-09-22

## Stable 2.4.0 release preparation, 2026-09-24

Paired with backend 1.19.0. The release notes summarize shipped capabilities and
remaining gaps; the older roadmap and review entries below are historical.
The backend requirement is 1.19.0 in both the manifest and runtime check.

README, marketplace preview, and Layout/Workspaces/Profiles images were refreshed.
Published images are actual production QML rendered with synthetic profiles and
displays, using packaged Omarchy controls in an isolated host with a substitute
window container. Reviewed sizes: compact 430x598 and expanded 1120x808, including
a synthetic light-palette Layout capture. Final captures use offscreen rendering
to avoid compositor resizing; the first clipped on-screen capture pass was rejected.
A separate live-shell compact capture was inspected locally, not published, and
confirmed current hardware remained usable. No profiles or monitor settings were
changed to make these images. This is not a layer-surface interaction or physical
hotplug acceptance test. Earlier live checks are recorded below.

Release validation: 121 Node tests, 21 offscreen Qt tests, qmllint, plugin
validation, and whitespace checks passed. Full backend tests, vet, command builds,
and hypr/daemon/IPC/TUI race tests passed; tidy left dependency files unchanged.
Fresh TUI screenshots are in the companion release. The isolated renderer is
documentation evidence, not proof of full panel/TUI parity or physical recovery.

## Reliability integration, 2026-09-24

Extracted the independent reliability fixes from mapleroyal's panel PR #18 and
companion backend PR #61. Stale reads cannot replace newer topology or preview
state; automatic refresh preserves draft edits/input; busy reads retain the last
visible state. Identify uses a fresh live snapshot and cancels obsolete cues.
Layout reuse and click-to-identify remain deferred on the contributor branches.

Validation: 121 Node tests, 21 offscreen Qt tests, qmllint, plugin validation, and
whitespace checks passed. Actual before/after panel QML captures used an isolated
offscreen Quickshell host with a substitute window container and sample data:
compact 430x730, expanded 1120x812, and 960x720 with a synthetic light palette.
The reviewed compact/expanded dark layout is unchanged. This is not a native
light-theme, layer-surface, or physical hotplug acceptance test; no live display
settings changed. See the companion
[integration record](https://github.com/crmne/hyprmoncfg/blob/main/docs/reliability-integration-2026-09-24.md)
for the split, compatibility path, and remaining gaps. No release/tag changed.

## Follow-up, 2026-09-24 (local review build)

The expanded footer now shares the compact setup-status component and Create
profile action. TUI is a compact header button alongside Identify all, Keys, and
Compact; there is no separate TUI card or duplicate Current setup/automatic line.
Saved setups show their name and display count. Paused matching stays actionable.
Naming, Discard, and Preview & save remain visible outside the scrolling content.

The companion Go change prefers Sequential/groups of three when importing
ambiguous single-display workspace rules. Explicit saved strategies, totals, and
persistence are preserved. The maintainer explicitly authorized updating their
Desktop Solo profile to Sequential/3/6; this is not a general profile migration.

Validation: 80 Node tests, 21 Qt tests, qmllint, plugin validation, and whitespace
checks passed. Live before/after compact and expanded captures were inspected
at 430px and 1120px content widths on a 1.33333-scale desktop. Create profile
was exercised without applying/saving a layout. Captures remain local; desktop
backgrounds may contain unrelated private material. No new small-screen/light
theme check was performed for this change. The maintainer reported successful
connect/disconnect behavior; no physical projector/lid/suspend test is claimed.

The Omarchy-guided install required a shell restart because plugin rescanning
retained cached QML. No published release/tag was changed. Physical recovery and
small-screen acceptance checks remain outstanding. Earlier status below is historical.

## Original release-candidate status

Release candidate 2.4.0-rc.1 across this repository and backend 1.19.0-rc.1.
This does not complete the accepted design. The release candidates are intended
for hardware and interaction testing; no marketplace verification is requested
until a stable release is approved.

## Implemented

- Follow-up: Persistence dropdown on Workspaces, with First per display / All
  assigned and Manual per-rule preservation. Capability-gated for older daemons.
  Installed with `1.18.4-dev.followup`; 79 model tests and 21 Qt tests pass.
  Backend recovery/power/discovery test evidence and remaining PR integration
  work are recorded in the sibling repository's
  `docs/follow-up-review-2026-09-22.md`.

- Canvas and Identify use connector identity without display numbering, a shared
  model/size, resolution/refresh, scale/position, and workspace summary. The side
  inspector keeps hardware information separate from editable settings.
- Persistent Identify all/selected overlays are input-transparent and suppressed
  during previews. The companion TUI review build now shares display-summary
  formatting, all six hardware-only info fields visible directly, and clickable Post-apply
  command last in profile details. Standalone TUI Identify and its profile action
  menu remain gaps. TUI save/apply semantics were not rewritten in this visual pass.

- Removed the permanent marketplace-review row; retained actionable service alerts.
- Matched panel/TUI page order: Layout, Workspaces, Profiles, including 2/3 keys
  and TUI mouse hit testing. Panel tabs now use body text.
- Always-visible selected-display hardware details, no duplicate Display/Color heading,
  hardware brightness only in compact mode, and horizontal integer steppers.
- Selectable Off/Mirrored cards in the panel canvas. Enabling changes the draft;
  it does not immediately apply unrelated settings.
- Companion TUI layout now has selectable Off/Mirrored rows with model names and
  an explicit Enable action. Profiles has visible Preview/Edit/Delete buttons and
  a Status heading; Post-apply command uses an explained Edit command button.
  Pointer regressions cover 80x24 and 113x33, including all-off and absent hardware.
- Profile right-click/overflow/Shift+F10 menu for existing operations. Delete
  requires confirmation in both clients and captures the intended name.
- Direct profile preview while automatic matching is on. Confirmation uses the
  existing daemon session override; the panel guards against replacing dirty edits.
- Default preview duration of 30 seconds in backend, CLI, and TUI; panel sends 30
  explicitly so older supported daemons also provide the longer interval. Explicit
  legacy durations still work. This is not yet a configurable shared preference.
- Unknown-output extension centers against the adjacent rightmost display using
  logical geometry. Selects greatest advertised pixel area, then refresh at that
  resolution, with VRR off and 8-bit sRGB. Preserves saved profiles and existing
  output settings. Existing enabled workspace-plan inheritance is retained.
- Closed-lid policy no longer forces the laptop off merely because an external
  connector exists. It requires an awake, enabled real external mode that remains
  enabled in the target profile.

## Still outstanding

- Persistent modeless/wake recovery, cold-start recovery, bounded readiness and
  fallback modes, and usable-output metadata. The lid check is a guard, not a
  complete recovery system or a guarantee that a projector shows a picture.
- Shared preferences and physical-size scale recommendations; explicit planner-off
  intent, all-assigned persistence, preferred profiles, and live-base provenance.
- Atomic rename/duplicate and reuse; notification delivery/routing;
  hardware snapshot correlation and background draft preservation.
- Full responsive layout, primary Preview changes action, automatic-draft save
  without reapplication, and remaining compact/TUI visual parity.
- Actual before/after expanded-panel and TUI captures at target sizes, and physical
  projector/dock/lid/suspend acceptance checks. The HTML study remains a mockup.

## Validation performed

The later TUI presentation pass has Go model/pointer/formatting regressions,
including wrapped hardware summaries at 113x33 and 80x24 terminal cells. Both
sizes were checked in a live isolated terminal; the 113x33 Layout view was also
reviewed in a desktop screenshot. Hardware details and the profile command editor
were opened without applying or saving a layout. This is presentation evidence,
not physical projector/hotplug acceptance. The review executable is isolated from
the installed client and daemon. Changes remain uncommitted pending user review.
Full Go tests, vet, command builds, TUI race tests, and unchanged tidy dependencies
passed. Original first-pass validation below is historical.

Panel: 70 Node tests, 14 offscreen Qt tests, qmllint, plugin validation, whitespace.
Backend: full Go tests, vet, both command builds, tidy with unchanged dependency
files, daemon/TUI race tests, whitespace. Fake compositor tests cover logical
centering, supported mode pairing, conservative defaults, profile immutability,
closed-lid safety gates, and default/explicit preview deadlines.

An isolated Quickshell process loaded the actual panel on Wayland without opening
it or applying a layout. A separate offscreen process rendered the actual stepper
and display canvas with sample data. This verifies component loading, not complete
GUI interaction or physical monitor readiness.
