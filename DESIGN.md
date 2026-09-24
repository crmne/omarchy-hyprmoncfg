# Monitor manager panel design

Status: release-candidate direction, 2026-09-22. The stable panel is 2.3.5;
2.4.0-rc.1 implements the interaction work recorded in the implementation status.
Remaining roadmap items are not shipped capabilities.

The interactive study was accepted as the visual direction on 2026-09-22. Preserve
its hierarchy, single selected-display inspector, and Layout / Workspaces / Profiles
order while adapting it to native Omarchy components. Detailed behavior and timing
remain the implementation roadmap below, not a claim of completed functionality.

The canonical shared product contract is
[hyprmoncfg/DESIGN.md](https://github.com/crmne/hyprmoncfg/blob/main/DESIGN.md)
(sibling checkout: `../hyprmoncfg/DESIGN.md`). Its
[baseline review](https://github.com/crmne/hyprmoncfg/blob/main/docs/design-review-2026-09-22.md)
records release evidence, community work, and macOS references. This document
owns graphical presentation and panel integration. Change shared behavior in the
canonical document first, then update both clients.

The [interactive design study](design/monitor-manager.html) uses sample data to
make the proposed hierarchy and states reviewable. Open it locally in a browser.
It does not contact a daemon, change displays, or persist settings.

## What should be obvious

Show which displays are connected and usable, off, mirrored, or recovering; which
layout is in use and why; whether edits are unapplied or previewing; and the next
action to use, save, enable, or recover. The TUI and panel share operations, names,
defaults, page order, and results, using their own native affordances. Never add a
separate matching algorithm or monitor writer to make the UI appear complete.

## Compact view

Keep the tidy vertical grouping: brightness, management, small layout, current
setup, and contextual actions. Do not show a permanent maintenance alert when
nothing needs attention. Brightness is live hardware state, labeled `Brightness`
with a secondary target name when useful. Selecting a screen changes the target;
unavailable control should explain why. Management and automatic profile choice
remain separate concepts.

An automatic extension shows `Laptop + new display` / `Unsaved setup` and
`Adjust and save…`. The new output already works. Off and unusable connected
displays get visible actionable rows. Dismissing a notification must lose no
capability.

## Expanded view

Use **1 Layout · 2 Workspaces · 3 Profiles** in both clients. Main tabs use at least
body text size with clear selection and focus. Preferences, Identify, Keys, and
Compact are secondary actions. Secondary controls and long setup names may wrap
or move into an overflow menu.
Keep Identify all, Keys, TUI, and Compact together in the header, with equal
compact button heights. Do not repeat setup status between the tabs and actions.

Repeat the compact setup status and contextual Create profile action in the
expanded footer. Use one full-width status/action area, not a separate TUI card.
Use the same status component in both
views. Creating a profile retains the draft, exposes naming and Preview & save,
and keeps these actions outside scrolling content. Dirty, creating, and profile
browsing states replace live setup text with their relevant state and actions.
For a saved setup, show its name and display count. Omit redundant "Current setup",
"Best match", and the normal automatic-mode label; paused matching remains explicit
and offers Resume automatic matching.

Use the backend's preferred Sequential strategy for new plans. Ambiguous
single-display imports use groups of three while preserving workspace total and
persistence. Explicit saved strategies still win; the panel must not independently
infer or migrate workspace intent.

Use a canvas and one selected-display inspector. Readable model/name and status
come first; mode and scale are secondary. Show all six hardware fields directly
in the Info pane, without a More details toggle. Keep `Display` and `Color` tabs without the redundant `Display - Color`
heading. Reduce nested borders and competing headings. Keep advanced HDR/ICC and
signal controls accessible, with units and neutral values matching the TUI.

Remove hardware brightness from the expanded profile editor. SDR brightness and
luminance remain in Color because those are profile settings.

Use `[-] [editable value] [+]` steppers with equal hit areas, exact entry, keyboard
adjustment, units, and individual resets. Position uses logical pixels. Preserve
canvas dragging, fine arrow movement, and snapping. Scrolling the inspector must
not silently change numeric values. Preserve focus and the existing viewport
behavior.

### Display states

| State | Presentation | Action |
| --- | --- | --- |
| Enabled and usable | Spatial canvas card | Select, arrange, inspect, identify |
| Connected but off | Visible card in an Off displays strip/list | Select, Enable… |
| Enabled without usable mode | No usable signal plus recovery status | Inspect, retry, choose a supported mode |
| Mirrored | Card/chip labeled Mirrors… near its source | Select, inspect, stop mirroring |
| Saved but disconnected | Not connected in profile preview | Inspect; no pretend Enable action |

In a clean live view, Enable can start a focused backend-validated preview. With
an existing dirty draft, it adds to that draft and clearly marks the pending change.
Do not silently apply unrelated edits when someone enables a display. Keep an
existing usable screen on, and report if the requested output remains modeless.

Provide Identify all and identify selected through one persistent overlay service.
Use connector identity, never arbitrary display numbers. Canvas and Identify share
connector, model, resolution at refresh rate,
scale with position, and assigned workspaces. Omit logical desktop dimensions.
Canvas values describe the displayed draft; Identify uses a fresh live snapshot.
The inspector shows connector, model, and maximum advertised resolution;
physical dimensions, type, and serial are also always visible, not compositor state.
Identify is the only action in this hardware-information box.
Panel size uses whole inches and compact millimetres, e.g. `32" (710x400mm)`.
Canvas and Identify retain size beside the model (`Model 32"`); only the inspector
separates Model from Panel size. Use the plain ASCII double quote for inches.
Use ASCII x in dimensions and scale (`1.33x`); no approximate or typographic inch symbols.
The accepted formatting and terminology are specified in the shared design's
Accepted display presentation section. TUI display summaries and profile command
presentation are aligned in the 1.19 release candidate; standalone Identify
and a TUI profile action menu remain explicit capability gaps.
Never steal input or cover Keep/
Revert. A disabled screen cannot draw an identification overlay. Reconcile PR #17
and PR #18 instead of creating competing implementations.

### Workspaces

Edit the same draft as Layout and show the backend-resolved plan. Preserve inherited
strategy, group size, workspace count, monitor order, assignments, and persistence.
Group size appears only for Sequential; large values retain direct entry. Manual
mode exposes per-workspace assignment. Persistence offers First per display and
All assigned when `workspace_persistence_supported` is true; otherwise it shows
Requires newer daemon. Manual mode retains per-rule flags. Keep planner-off
available for user-managed rules.

### Profiles

Show labels such as Current, Preferred, Matches these displays, and Other setup.
Put scoring arithmetic behind `Why this profile?`. Browsing selects a row without
applying it. Right-click selects the target and opens its menu; a visible overflow
button and keyboard menu activation expose the same actions:

- Use this profile, Edit layout, Rename, Duplicate, Delete.
- Prefer for these displays and Reuse on other displays, when supported.
- Post-apply command in the advanced group.

Use starts a preview directly; confirmation establishes a session choice without
requiring a separate trip to the automatic-selection toggle. Rename requires
atomic backend support, never separate client save/delete calls. Delete needs
confirmation or undo and must not switch the live arrangement as a hidden side
effect. Retain equivalent TUI operations and documented shortcuts.

### Footer and confirmation

Keep the footer outside scrolling content. Show one concise state: Unsaved setup,
Changes not applied, Editing Laptop, or Using Laptop. The primary action follows
context: Save profile, Preview changes, Preview & save, or Use this profile. A name
is required to save, not merely to use a temporary layout. Keep atomic commit-and-save.

Use the shared proposed 30-second default and backend preferences. Show Applying,
Checking displays, then Keep/Revert with the authoritative deadline. The persistent
preview guard survives monitor/bar rebuilds without taking a live TUI transaction.
Reclaim only when the daemon permits it. Confirmation must fit on the smallest
surviving display. A failed save or rollback is visible, not apparent success.
Show More time only after the daemon supports extending a transaction.

## Preferences and notifications

Preferences is a small application dialog, not a fourth main page. It reads/writes
shared defaults for new-display side/alignment, mode and scale, VRR, preview time,
and notifications. Explain that changing defaults does not edit the current layout.
Inherit workspace planning on the Workspaces page instead of duplicating it here.

One coordinator sends a notification after verified extension, even with multiple
bars. `Adjust and save…` opens the enabled panel on Layout with the new display
selected and a fresh snapshot. Preserve existing drafts and explain topology
changes. Register panel availability through supported shell integration; fall
back to launching the TUI when the panel is unavailable. Merely finding an Omarchy
directory is insufficient. A late click after unplug should show current state.

## Responsive layout and visual language

Profile/Match headers and rows share exact column geometry. Do not prefix the
selected/current profile with an arrow. Post-apply command is the final detail,
with a clickable Not set/edit action. Confirmation dialogs use the same panel
font, border, spacing, and buttons; Cancel receives initial focus, and deletion
uses the explicit Delete profile label. Context menus appear at the pointer or
the invoking button, constrained to the panel bounds.

After a successful coordinated Keep & save, refresh the editor baseline so
Preview & save disappears until the next edit. A failed save must not clear edits.

Use the Omarchy theme and existing components/tokens; the design study's palette
is illustrative. Emphasis indicates selection/state. Main tabs are body-sized,
section headings slightly stronger, and secondary information quieter but readable.
Use text/icons as well as color.

At narrow widths, stack or switch between canvas and inspector. At short heights,
shrink the canvas and scroll the inspector while keeping the footer visible. Test
a 1366x768 logical desktop, fractional scaling, enlarged fonts, long names, and
keyboard-only use. The TUI counterpart targets 80x24 with the same essential
actions available; matching appearance cannot justify inaccessible controls.

## Integration and implementation order

Follow the canonical design's phases: usable displays, predictable hotplug, safe
interactions, consistent editors, then advanced workflows. Keep work reviewable.
The daemon owns matching, topology, mode selection, health, preferences, validation,
workspace resolution, persistence, and recovery. `Model.js` remains deterministic
presentation/draft support. Preserve supported profile fields and calibration.

Correlate status/editor/edit/reuse/preview responses by request, editor revision,
and hardware snapshot. Keep busy/retry distinct from disconnect. Never reset a
dirty draft on automatic refresh or repeated summons. Explicitly document current
close/reopen behavior until persisted drafts are implemented. Gate new operations
on capabilities and maintain older-client support.

The 2026-09-24 reliability split implements status/editor snapshot correlation,
background draft preservation, and Identify safety independently of reuse. See
[implementation status](design/implementation-status.md) for tested scope.
Layout reuse and canvas click-to-identify remain deferred product decisions.

Review existing contributions before overlapping work:

- [Backend #59](https://github.com/crmne/hyprmoncfg/pull/59): wake/startup recovery.
- [Backend #61](https://github.com/crmne/hyprmoncfg/pull/61) and
  [panel #18](https://github.com/crmne/omarchy-hyprmoncfg/pull/18): reuse, snapshots,
  bounded reads, and draft preservation.
- [Panel #17](https://github.com/crmne/omarchy-hyprmoncfg/pull/17): Identify all.
- [Backend #60](https://github.com/crmne/hyprmoncfg/issues/60): small-screen actions;
  [#65](https://github.com/crmne/hyprmoncfg/issues/65): workspace persistence.

These are research links, not approvals or claims that code is merged. Run the
repository validation suite for implementation work, add meaningful state/IPC
regressions, and capture actual compact/expanded before/after evidence. Record the
panel/TUI parity status and physical hardware cases exercised. Do not test prose
by asserting the wording of this design.
