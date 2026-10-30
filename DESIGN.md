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

Use a canvas-first vertical grouping: small layout, brightness, text size, management,
current setup, and contextual actions. Do not show a permanent maintenance alert when
nothing needs attention. Brightness is live hardware state, labeled `Brightness`
with a secondary target name when useful. Selecting a screen changes the target;
unavailable control should explain why. Management and automatic profile choice
remain separate concepts.

An automatic extension shows `Laptop + new display` / `Unsaved setup` and
`Adjust and save…`. The new output already works. Off and unusable connected
displays get visible actionable rows. Dismissing a notification must lose no
capability.

Decision, 2026-09-28 (Carmine, canvas-stage direction): the layout canvas moves
from the middle of the compact view to directly under the header. The arrangement
is what people open the panel to see, and a launch audience that knows hyprmoncfg
as a TUI should recognise a graphical display manager at first glance. The canvas
is sized to the arrangement's aspect within fixed clamps (see Content-sized panel).
Nothing was removed; only the order changed. The TUI keeps its own layout and
wording; this is a presentation choice, not a change to shared operations.

Text size (decided 2026-09-30, Carmine) sits directly under Brightness and is
Omarchy's own control: the same stops (9, 10, 11, 12, 14, 16, 20 px), the same
notched slider, `TEXT SIZE` with the px value right-aligned, applied when the knob
is released. It is live desktop state like brightness, but desktop-wide rather
than per display: Omarchy's shell base font, GTK text scaling and terminal font.
The panel changes it only by running `omarchy-display-text-size <px>` and reads
the live value from the shell's base size; it writes nothing itself, and text
size is never part of a profile, a draft or the IPC. When the command is missing
the row is hidden and unreachable by keyboard. In the compact key model it is the
row above Management: Up reaches it, Left and Right step through the stops. A
change rescales the whole content-sized panel, so hover cannot move the keyboard
cursor until the reflow settles (300 ms), and nothing is applied mid-drag. The
TUI has no counterpart: a terminal's text size is the terminal's.

Terminal (decided 2026-10-19, Carmine) sits directly under Text size and is the
same control over the terminal font alone: `TERMINAL` with the pt value
right-aligned, stops 8, 9, 10, 11, 12, 14, 16 and 18 pt, applied on release. It
runs Omarchy's `omarchy-terminal-font-size <pt>` (omacom/omarchy#15896), which sets
Alacritty, Ghostty, Kitty and Foot and leaves the shell and GTK alone. Until an
Omarchy release ships that command, the panel runs its copy in
`bin/omarchy-terminal-font-size`, only when Omarchy is installed; delete the copy
once a release has it. The panel reads the size back from the command after
every Terminal or Text size change, since Text size sets the terminal too, in
proportion: a size chosen here lasts until the next Text size change, as on the
command line. The row is hidden when the command reports no terminal config. In
the compact key model the rows above Management are Text size then Terminal, so
Up from Management reaches Terminal first; Left and Right step either one. Like
Text size, it is live desktop state, never part of a profile, a draft or the IPC,
and the TUI has no counterpart.

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

The canvas is a stage: each enabled display is drawn as a screen (bezel and a
panel lit with the theme's foreground, or its accent when selected) on a dotted
field, with workspaces as bare-ID chips. When a plan change moves a workspace to
another display (strategy, group size, manual reassignment, a display arriving or
leaving, the lid), its chip glides from the old screen to the new one: keyed by
workspace ID, about a quarter of a second, eased with no bounce, slightly
staggered. Chips that keep their display do not travel, and chips that appear
or disappear just do. The change is instant instead when more than twelve chips
would move, during a drag, while the panel is resizing, where a small card shows
its workspaces as one pill, or when Hyprland's `animations:enabled` is off (Omarchy
has no reduced-motion setting of its own). The motion never delays input, and the
settled picture is identical to an unanimated one. It applies to the compact
canvas, the Layout stage and the Workspaces preview. The selected display's six hardware
fields sit directly under the stage, because they describe the pictured screen;
the right column holds only the editable Display and Color controls. Identify
stays the only action in the hardware block. Pane chrome follows Omarchy's
first-party panels: flat sections with uppercase headers and hairline dividers,
no boxes inside boxes.

Remove hardware brightness from the expanded profile editor. SDR brightness and
luminance remain in Color because those are profile settings.

Use `[-] [editable value] [+]` steppers with equal hit areas, exact entry, keyboard
adjustment, units, and individual resets for small counts (workspaces, group size).
Scrolling the inspector must not silently change numeric values. Preserve focus and
the existing viewport behavior.

Inspector controls, decided 2026-09-28 (Carmine, control review). Each control
matches the shape of its value; every field keeps its individual reset, its place
in the keyboard field order, and Hyprland's terminology.

- Position X/Y are exact-entry fields in logical pixels (`POSITION X (px)`), with
  no -/+ buttons: four- and five-digit coordinates are set by dragging, arrow
  nudges (Shift 10px, Ctrl 1px) and snapping, and typed when an exact value is
  needed. Invalid text reverts; nothing is guessed.
- `PLACE BESIDE <display>` offers Left, Right, Above and Below as the pointer
  equivalent of Alt+arrows. It calls the same snapping function and names the
  same nearest display, so there is one placement engine; the exact X/Y above
  it show where the display landed.
- Scale follows Omarchy's own Display panel (decided 2026-09-28, Carmine): one
  row of bordered preset pills, the current one active and its label
  right-aligned in the SCALE header, then a More dropdown with every sharp
  scale for the draft mode, so no sharp scale is out of reach. Revised
  2026-10-17 (sharpness in Go): the pills, the list and every sharpness verdict
  come from the daemon's stateless `scale_info` (Go's `internal/scaling`),
  cached by mode and scale; the panel never computes sharpness. A daemon
  without `scale_info` gets no pills, no Blurry marker and no Custom…, and More
  falls back to `editor_state` `scale_options` for the live mode.
  - Preset rule (Go's `scaling.PresetChoices`): presets 1, 1.25, 1.5, 1.6, 2
    and 3, plus 4 when the sharp list reaches 4 and the mode is at least 5120
    pixels wide. As in Omarchy's
    `cleanScale`/`availableScales`, each preset becomes the smallest sharp scale
    at or above it; presets that land on the same scale collapse to the closest
    one; preset order is kept; a preset above the largest sharp scale is
    dropped. Revised 2026-10-17 (stable scale row): the pills depend only on
    the mode, so stepping never changes their count. A current scale that is
    not a pill, sharp or not, is shown on the More trigger instead (active,
    labelled `1.33x`) and is never rewritten.
  - Blurry (2026-10-17): a current scale that `scale_info` reports as not
    sharp reads `1.33x ⚠` on More and in the list, and `1.33x ⚠ Blurry` in
    the SCALE header, in the urgent colour but never by colour alone. Blurry
    is the one user-facing label in both clients.
  - Custom… (2026-10-17) ends the More list, as in the TUI. It opens an exact
    entry built from key events (`KeyField`). The panel only parses the
    number; `scale_info` checks the range and sharpness, and the feedback is
    worded line for line like the TUI's dialog: sharp sizes, or Blurry with
    the fractional size and the closest sharp scale. Enter sends the typed
    scale with `snap_scale`, so Go applies the closest sharp scale. Esc
    cancels.
  - Label rule: two decimals with trailing zeros trimmed and an `x` suffix
    (`1.33x`, `1.07x`, `2x`); if two scales in the same list would share a
    label, both show the exact value. Labels are display only: the stored and
    applied value is always the exact sharp scale.
  - Keyboard: arrows step through the full sharp list, as the TUI does; Enter
    opens More.
- Resolution and Refresh (2026-10-17) replace the single Mode dropdown, as in
  the TUI and Omarchy's Display panel. RESOLUTION is a dropdown of the
  display's resolutions, each once, largest first. REFRESH is a `ButtonGroup`
  of the rates that resolution offers, slowest first, labelled like the cards
  (`144Hz`). Changing the resolution keeps the rate when the new resolution
  offers it, otherwise takes its highest. Both send the one `mode` edit; the
  profile and IPC are unchanged. Keyboard order is Enabled, Resolution (1),
  Refresh (23), Scale (2), then the rest; arrows on Resolution wrap like the
  old Mode list, Refresh stops at its ends and Enter wraps.
- Small closed sets use the shell's `ButtonGroup`, so spacing, hover, focus and
  keys are Omarchy's: VRR (Off, On, Fullscreen), colour depth (8-bit, 10-bit),
  SDR EOTF, and WCG/HDR capability (Force off, Auto-detect, Force on). A value
  the panel does not recognise is shown as an extra choice and is never
  rewritten. Headers are uppercase with an optional right-aligned detail:
  PLACE BESIDE names the display it snaps to.
- Rotation is Normal, 90°, 180° and 270° with a separate Flipped toggle. Both edit
  the one Hyprland transform and preserve each other; an unknown transform is
  shown and left alone; the ROTATION header shows the raw transform.
- When the daemon reports `rotation_auto_supported` for a built-in panel, Rotation
  starts with **Auto**, which turns the panel with the device and keeps its
  current rotation as upright (shown as, for example, "Upright 270°" in the
  header). Choosing a fixed rotation turns Auto off. Beside Auto the toggle is
  **Lock**, the live rotation lock (`set_rotation` with `locked`), not a draft edit; the
  header adds "Locked", or "Upright while folded" on a convertible folded as a
  laptop. Reset restores the saved rotation and Auto together. A daemon without
  rotation support shows neither. To flip a panel that rotates automatically,
  choose a fixed rotation, set Flipped, then choose Auto again.
- A choice row whose chips leave no room for the reset shows it in the header,
  as Scale does, so it never covers the last chip.
- Kept as they were: Enabled (toggle), Mirror and colour space
  (dropdowns: long or open lists), SDR and display luminance values (exact
  decimal entry with units; the underlying multipliers and nits are not bounded
  ranges, so sliders would imply limits that do not exist), and the ICC path.

Preserve canvas dragging, fine arrow movement, and snapping.

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
Requires newer daemon. Manual mode retains per-rule flags. Strategy offers Off,
Manual, Sequential, and Interleaved; Off is the stored `enabled: false`, keeps the
saved strategy and plan, writes no workspace rules, and suits user-managed rules
or tools such as hyprsplit. While Off, the other plan values are inert.

The optional hyprmoncfg Workspaces picker is offered inside the top of the
Workspaces canvas, with its real grouped-number preview in physical left-to-right,
then top-to-bottom monitor order. The benefit is "A workspace picker that follows
your monitor layout." Offer Install picker when absent, Use in bar when disabled,
and hide the promotion when enabled. Installing uses Omarchy's presented terminal
and its normal trust, enablement and placement questions. Native plugin commands
replace the previous widget and restore it on failure. Nothing changes just by
opening the panel; drafts and previews block installation or enablement. Require
the additive `workspace_plan` status capability and an applied plan.

Right-clicking the picker opens only this Workspaces tab, anchored to the picker
on the clicked display. Reuse the existing editor, draft and persistent preview
guard through a UI-only shell IPC route. Do not duplicate the editor or expose
Layout/Profiles tabs, TUI or Compact controls in this popup. The main panel keeps
its normal navigation. Keep workspace-only mode through preview recovery and bar
rebuilds. Assigned IDs in the workspace-plan rows remain direct Hyprland switching
targets, including numbers omitted from the compact bar; disable switching while
there are unapplied edits or a preview. Opening the planner sends no daemon
configuration or switching command. Older or absent panels retain the picker's
live overview, with an installation action when the panel is missing or disabled.

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

## Optional bar icon

`showBarIcon` (default `true`) on the bar entry hides the icon for people who
open the editor from a customized Display menu or a hotkey through
`omarchy-shell shell summon crmne.hyprmoncfg`. Hiding collapses only the icon
slot to zero size: the widget root and the icon button stay visible (the button
at zero opacity) because the bar skips invisible widgets and the panel window
cannot map from an invisible anchor. The editor, its summon route and the
preview guard service stay loaded. Removing the bar entry instead removes the
route to the editor. A hidden icon is skipped by the shell's numbered panel
hotkeys and Tab switching between panels, which count only visible slots.
Covered by `tests/baricon.test.js` and `tests/qml-bar`.

Use Omarchy's single/multiple-display glyphs at exactly the stock painted size
and in the unchanged bar slot. The compact header follows the stock Display
panel's text metrics too. A separate small theme-accent check indicates the
backend connection, slightly clearer than the first version; its presence never
changes the monitor's scale or center.

TUI parity: the TUI has no bar icon; there is no companion change.

## Content-sized panel

Decision, 2026-09-28 (Carmine): the panel is sized to its content instead of fixed
1120x780 (expanded) boxes that left large empty areas. The geometry is computed by
pure functions in `Model.js` (`stageSize`, `stageHeightForWidth`,
`compactStageHeight`, `expandedPanelLayout`, `panelResizeAllowed`) and covered by
`tests/sizing.test.js`; QML only supplies measured content heights and binds to
the result.

- Layout: the stage follows the arrangement's bounding-box aspect (enabled displays
  plus an Off/mirrored row when present), starting from a preferred height and
  clamped to a minimum and maximum width and height, so a single laptop is not
  tiny and three wide screens do not overflow. The inspector keeps a fixed natural
  width. Body height is the taller of stage plus hardware facts and the Display
  controls; Color scrolls inside the inspector rather than resizing the panel.
- Workspaces and Profiles: a fixed side column plus a stage and details; height
  follows the row count up to a visible cap, after which the list scrolls.
- Every expanded page shares the Layout page's width, so switching pages never
  moves the tabs or header; only the height changes.
- Compact keeps its 430 width; the canvas height follows the arrangement within
  compact clamps and the card is content-sized. When the content is taller than
  the screen (large text size, a small screen), the card stops at the available
  height: the header and the footer (current setup, Create profile, Resume
  automatic matching) stay fixed and only the body between them scrolls, with a
  scrollbar only then. The keyboard cursor's row and a newly shown Keep/Revert
  bar are scrolled into view (`Model.compactPanelLayout`).
- Both axes are clamped to the available screen area. The header and footer stay
  visible; the stage and lists absorb any shortfall and scroll (1366x768 stays
  usable).
- Resizing never happens mid-drag. A new size applies at once when the panel is
  closed or the view mode changes, or when the pointer is outside the panel. With
  a top bar the card's top edge is fixed, so height-only changes apply
  immediately; width changes (which recenter the card) and any change under other
  bar positions wait until the pointer leaves. Changes ease over 160 ms.

TUI parity: the TUI sizes to its terminal and keeps its lists and terminology.
There is no companion change; operations, names and page order are unchanged.

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

Rotation follow-up, 2026-10-19: preview confirmation explains that Auto resumes
after Keep. Sensor-upright calibration belongs to the backend CLI and is separate
from the saved panel transform. Fixed built-in-panel rotations retain touch
alignment with the companion backend fix. Unknown daemon builds do not satisfy
release-version checks; an installed release offers a restart when the daemon
reports a nonempty unknown version, with a reminder to check the service path.

Package migration, 2026-10-19: fresh installs use the prebuilt `hyprmoncfg-bin`.
The compact action list offers Switch to prebuilt package only for the installed
`hyprmoncfg` source package, when no editor draft, preview, installation, or
service operation is pending. Pointer and keyboard activation share the existing
interactive terminal installer. Package replacement is verified before daemon
restart; profiles are preserved. The action disappears after migration, with no
persistent preference. Updates preserve `hyprmoncfg-git` and no migration is
offered for development or unmanaged builds. There is no backend or IPC change.
