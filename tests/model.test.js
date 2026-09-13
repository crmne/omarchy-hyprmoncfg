const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../Model.js")
const vm = require("node:vm")

function panelFunction(name, root, globals = {}) {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  return vm.runInNewContext("(" + source + ")", { root, Model, ...globals })
}

test("footer controls share their tallest natural height and keep naming beside save", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const footer = qml.slice(qml.indexOf("id: editorFooter"), qml.indexOf("\n      KeyboardHelp {"))
  const controls = ["openTuiButton", "profileNameInput", "currentProfileBadge", "activateFooterButton", "discardDraftButton", "saveDraftButton"]
  const height = footer.match(/readonly property real controlHeight: ([\s\S]*?)\n          height:/)[1]
  for (const tallest of controls) {
    const sizes = Object.fromEntries(controls.map(id => [id, { implicitHeight: id === tallest ? 43.2 : 30 }]))
    assert.equal(vm.runInNewContext(height, sizes), 44, tallest)
  }
  for (const id of controls)
    assert.match(footer, new RegExp("id: " + id + "\\s+anchors.verticalCenter: parent.verticalCenter\\s+height: editorFooter.controlHeight|id: " + id + "\\s+visible:[^\\n]+\\s+anchors.verticalCenter: parent.verticalCenter\\s+height: editorFooter.controlHeight"))
  assert.ok(footer.indexOf("id: openTuiButton") < footer.indexOf("Column {"))
  assert.ok(footer.indexOf("Column {") < footer.indexOf("id: profileNameInput"))
  assert.ok(footer.indexOf("id: profileNameInput") < footer.indexOf("id: discardDraftButton"))
  assert.ok(footer.indexOf("id: discardDraftButton") < footer.indexOf("id: saveDraftButton"))
  assert.doesNotMatch(footer, /Math.max\(Style.space\(180\)/)
})

test("Preview & save requires a manually entered name and stays disabled while busy", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const save = qml.slice(qml.indexOf("id: saveDraftButton"))
  assert.match(save, /text: "Preview & save"/)
  assert.doesNotMatch(save, /Name & save/)
  const enabled = save.match(/enabled: ([\s\S]*?)\n              foreground:/)[1]
  const root = { managedChecked: true, editPending: false, previewPending: false, sourceProfile: "", saveName: "" }
  const evaluate = () => vm.runInNewContext(enabled, { root })
  assert.equal(evaluate(), false)
  root.saveName = "   "
  assert.equal(evaluate(), false)
  root.saveName = "Laptop"
  assert.equal(evaluate(), true)
  for (const [key, value] of [["editPending", true], ["previewPending", true], ["managedChecked", false]]) {
    const previous = root[key]
    root[key] = value
    assert.equal(evaluate(), false, key)
    root[key] = previous
  }
  root.saveName = ""
  root.sourceProfile = "Desk"
  assert.equal(evaluate(), true)
  root.sourceProfile = ""
  root.draftName = panelFunction("draftName", root)
  root.send = () => assert.fail("unnamed layout must not reach the backend")
  panelFunction("previewDraft", root)()
  assert.match(root.lastError, /profile name/)
})

test("the installed backend requirement matches the manifest and upgrade message", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const required = require("../manifest.json").hyprmoncfg.minimumVersion
  assert.equal(qml.match(/Model.versionAtLeast\(versionOutput.text, "([^"]+)"\)/)[1], required)
  assert.ok(qml.includes("hyprmoncfg " + required + " or newer is still required."))
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.18.2", required), false)
  assert.equal(Model.versionAtLeast("hyprmoncfg " + required, required), true)
})

test("installer and TUI launches release panel focus before starting the terminal", () => {
  const trace = []
  const deferred = []
  const root = { installing: true, close() { trace.push("close") } }
  const process = { startDetached() { trace.push("launch") } }
  const globals = { Qt: { callLater(fn) { deferred.push(fn) } }, tuiProcess: process }
  panelFunction("launchTui", root, globals)()
  assert.deepEqual(trace, ["close"])
  deferred.shift()()
  assert.deepEqual(trace, ["close", "launch"])

  trace.length = 0
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const source = qml.match(/id: installPreparationProcess\s+onExited: (function\(exitCode\) \{[\s\S]*?\n    })/)[1]
  const prepared = vm.runInNewContext("(" + source + ")", { root, Model, ...globals,
    installerProcess: process,
    installPoll: { restart() { trace.push("poll") } },
    installTimeout: { restart() { trace.push("timeout") } }
  })
  prepared(0)
  assert.deepEqual(trace, ["close", "poll", "timeout"])
  deferred.shift()()
  assert.equal(trace.at(-1), "launch")
  trace.length = 0
  prepared(1)
  assert.deepEqual(trace, [])
  assert.equal(deferred.length, 0)
  assert.equal(root.installing, false)
  assert.match(root.lastError, /Could not prepare/)
})

test("field resets preserve wire defaults and derive modes from saved geometry", () => {
  const baseline = { outputs: [{ key: "desk", width: 1920, height: 1080, refresh: 60 }] }
  for (const field of ["sdr_min_luminance", "sdr_max_luminance", "sdr_brightness", "sdr_saturation"])
    assert.deepEqual(Model.outputFieldResetEdit(baseline, "desk", field), { [field]: 0 })
  assert.deepEqual(Model.outputFieldResetEdit(baseline, "desk", "mode"), { mode: "1920x1080@60.00Hz" })
  const explicit = Model.clone(baseline)
  Object.assign(explicit.outputs[0], { bitdepth: 8, cm: "srgb", sdr_eotf: "default", sdr_brightness: 1, sdr_saturation: 1 })
  for (const field of ["bitdepth", "cm", "sdr_eotf", "sdr_brightness", "sdr_saturation"])
    assert.equal(Model.outputFieldChanged(explicit, baseline, "desk", field), false, field)
  for (const field of ["__proto__", "toString", "constructor"])
    assert.equal(Model.outputFieldResetEdit(baseline, "desk", field), null)
})

test("resets cannot disable the last display or change unrelated draft fields", () => {
  const edits = []
  const root = {
    selectedOutputKey: "desk",
    draftProfile: { outputs: [{ key: "desk", enabled: true, scale: 1.5, cm: "hdr" }] },
    profileDefaults: { outputs: [{ key: "desk", enabled: false, scale: 1, cm: "srgb" }] },
    editDraft(edit) { edits.push(JSON.parse(JSON.stringify(edit))) }
  }
  root.editOutput = panelFunction("editOutput", root)
  const reset = panelFunction("resetOutputField", root)
  reset("enabled")
  assert.equal(edits.length, 0)
  assert.match(root.lastError, /one display must stay enabled/)
  reset("scale")
  assert.deepEqual(edits, [{ output_key: "desk", scale: 1 }])
  assert.equal(root.draftProfile.outputs[0].cm, "hdr")
  assert.equal(root.profileDefaults.outputs[0].scale, 1)
})

test("current profile identity never hides a proven live match behind a stale override", () => {
  const document = { daemon: { running: true, profile_override: "Desk" },
    active_profile: { name: "TV" }, profiles: [{ name: "Desk" }, { name: "TV", active: true }] }
  assert.equal(Model.currentProfileName(document), "TV")
  document.active_profile = null
  assert.equal(Model.currentProfileName(document), "Desk")
  document.daemon.preview = { profile_name: "TV" }
  assert.equal(Model.currentProfileName(document), "")
  delete document.daemon.preview
  document.daemon.unmanaged = true
  assert.equal(Model.currentProfileName(document), "")
  delete document.daemon.unmanaged
  document.daemon.running = false
  assert.equal(Model.currentProfileName(document), "")
  document.daemon.running = true
  document.daemon.profile_override = "Deleted"
  assert.equal(Model.currentProfileName(document), "")
  assert.equal(Model.profileMatchLabel({ active: true }, false), "No match")
})

test("leaving an unchanged decimal field does not block its reset or lose precision", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const component = qml.slice(qml.indexOf("component DecimalField:"))
  const body = component.match(/onEditingFinished: \{([\s\S]*?)\n        }/)[1]
  const edits = []
  const context = vm.createContext({ text: "0.006", activeFocus: false,
    decimalField: { value: 0.0063, formatted() { return "0.006" }, modified(value) { edits.push(value) } },
    Qt: { callLater() {} } })
  const finish = vm.runInContext("(function() {" + body + "})", context)
  finish()
  assert.deepEqual(edits, [])
  context.text = "0.007"
  finish()
  assert.deepEqual(edits, [0.007])
  context.text = "invalid"
  finish()
  assert.equal(context.text, "0.006")
})

// Execute the actual QML handlers with a fake socket. This exercises message
// ordering without changing the running desktop's monitor configuration.
function previewGuard() {
  const qml = fs.readFileSync(path.join(__dirname, "..", "PreviewGuard.qml"), "utf8")
  const functions = qml.match(/^  function [\s\S]*?^  }/gm)
  const names = functions.map(source => source.match(/function (\w+)/)[1])
  const requests = []
  const root = { requestSequence: 0, pendingMethods: {}, transactionId: "", profileName: "",
    deadline: "", seconds: 0, stage: "idle", actionPending: false, requestPending: false,
    saveOnCommit: false, draftApply: false, actionError: "", errorMessage: "",
    requestFinished() {} }
  Object.defineProperty(root, "opened", { get: () => root.stage !== "idle" })
  const socket = { connected: true, write(line) { requests.push(JSON.parse(line)) }, flush() {} }
  const context = vm.createContext({ root, Model, backendSocket: socket,
    Hyprland: { focusedMonitor: { name: "eDP-1" } },
    previewClock: { start() {}, stop() {} } })
  vm.runInContext(functions.join("\n") + "\nObject.assign(root, {" + names.join(",") + "})", context)
  return { root, socket, requests, receive(value) { root.handleMessage(JSON.stringify({ protocol_version: 1, ...value })) } }
}

test("the guard leaves TUI previews alone and adopts abandoned previews", () => {
  const guard = previewGuard()
  const preview = { transaction_id: "tui", deadline: new Date(Date.now() + 10000).toISOString(), profile_name: "Desk", reclaimable: false }
  guard.receive({ type: "event", event: "status", data: { daemon: { preview } } })
  assert.equal(guard.root.opened, false)
  guard.receive({ type: "event", event: "status", data: { daemon: { preview: { ...preview, reclaimable: true } } } })
  assert.equal(guard.root.stage, "confirm")
  assert.equal(guard.root.keep(), true)
  assert.equal(guard.requests[0].method, "commit")
  assert.equal(guard.requests[0].params.transaction_id, "tui")
})

test("status arriving before the preview response cannot steal ownership or unlock a pending commit", () => {
  const guard = previewGuard()
  const deadline = new Date(Date.now() + 10000).toISOString()
  assert.equal(guard.root.startDraftPreview({ name: "Desk" }, 10), true)
  const preview = { transaction_id: "ours", deadline, profile_name: "Desk", save_on_commit: true, reclaimable: false }
  const status = { type: "event", event: "status", data: { daemon: { preview } } }
  guard.receive(status)
  assert.equal(guard.root.transactionId, "")
  guard.receive({ type: "response", id: guard.requests[0].id, result: { id: "ours", deadline } })
  assert.equal(guard.root.transactionId, "ours")
  assert.equal(guard.root.keep(), true)
  guard.receive(status)
  assert.equal(guard.root.keep(), false)
  assert.equal(guard.requests.filter(request => request.method === "commit").length, 1)
  guard.receive({ type: "response", id: guard.requests[1].id, result: {} })
  assert.equal(guard.root.opened, false)
})

test("a failed confirmation remains actionable and shows the backend error", () => {
  const guard = previewGuard()
  guard.root.syncPreview({ transaction_id: "orphan", reclaimable: true })
  guard.root.keep()
  guard.receive({ type: "response", id: guard.requests[0].id, error: { message: "could not save profile" } })
  assert.equal(guard.root.actionPending, false)
  assert.equal(guard.root.actionError, "could not save profile")
  assert.equal(guard.root.revert(), true)
  assert.equal(guard.requests[1].method, "revert")
})

test("installation and upgrades use a presented AUR flow, restart the daemon, and open a centered TUI", () => {
  assert.deepEqual(Model.installProcessArgs(), [
    "omarchy",
    "launch",
    "floating",
    "terminal",
    "with",
    "presentation",
    "rm -f \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.failed\" \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.complete\"; status=0; if pacman -Q hyprmoncfg-bin >/dev/null 2>&1; then yay -S --needed --cleanafter hyprmoncfg-bin; elif pacman -Q hyprmoncfg >/dev/null 2>&1; then yay -S --needed --cleanafter hyprmoncfg; else omarchy pkg aur add hyprmoncfg-bin; fi && systemctl --user enable hyprmoncfgd.service && systemctl --user restart hyprmoncfgd.service && setsid -f gtk-launch hyprmoncfg-omarchy >/dev/null 2>&1 || status=$?; if (( status == 0 )); then : > \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.complete\"; else printf '%s\\n' \"$status\" > \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.failed\"; fi; (exit \"$status\")"
  ])
  assert.doesNotMatch(Model.installCommand(), /--noconfirm/)
})

test("installation completion and failure are observable and cannot leave the panel spinning forever", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /hyprmoncfg-panel-install\.failed/)
  assert.match(qml, /hyprmoncfg-panel-install\.complete/)
  assert.match(qml, /id: installPreparationProcess/)
  assert.match(qml, /root\.installing && exitCode === 2/)
  assert.match(qml, /exitCode === 3 && root\.installing/)
  assert.match(qml, /id: installTimeout/)
  assert.match(qml, /interval: 300000/)
  assert.doesNotMatch(Model.installCommand(), /&\s*$/)
})

test("background installation probes keep the resolved update screen stable", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /property bool installationStateKnown: false/)
  assert.match(qml, /if \(!root\.installationStateKnown\) root\.checkingInstallation = true/)
  assert.match(qml, /if \(exitCode === 3 && root\.installing\) return/)
  assert.match(qml, /root\.installed = probedInstalled/)
  assert.ok(qml.indexOf("root.installed = probedInstalled") > qml.indexOf("if (root.installing && !probedCompatible)"))
})

test("missing hyprmoncfg gets a focused onboarding screen", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /Install hyprmoncfg to manage monitor layouts\./)
  assert.match(qml, /Update hyprmoncfg to use the visual editor\./)
  assert.match(qml, /visible: !root\.compatible && !root\.checkingInstallation/)
  assert.match(qml, /selected: !root\.installed/)
})

test("the layout editor delegates window behavior to the packaged desktop launcher", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /\["gtk-launch", "hyprmoncfg-omarchy"\]/)
  assert.doesNotMatch(qml, /TUI\.float/)
  assert.doesNotMatch(qml, /--app-id=hyprmoncfg/)
})

test("IPC envelopes require protocol version one", () => {
  assert.deepEqual(Model.parseEnvelope('{"type":"event","protocol_version":1,"event":"status"}'), {
    type: "event",
    protocol_version: 1,
    event: "status"
  })
  assert.equal(Model.parseEnvelope('{"type":"event","protocol_version":2}'), null)
  assert.equal(Model.parseEnvelope("nope"), null)
})

test("a confirmed manual override is current when duplicate profile states are ambiguous", () => {
  const document = {
    daemon: { running: true, profile_override: "Test" },
    active_profile: null,
    profiles: [
      { name: "Test", active: false, recommended: false, match_score: 300 },
      { name: "adamc-system-default", active: false, recommended: true, match_score: 300 }
    ]
  }

  assert.equal(Model.currentProfileName(document), "Test")
  assert.equal(Model.profileIsCurrent(document.profiles[0], document), true)
  assert.equal(Model.profileIsCurrent(document.profiles[1], document), false)
  assert.equal(Model.profileMatchLabel(document.profiles[0], true), "Active · score 300")
})

test("version compatibility accepts the IPC release and development builds", () => {
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.12.0 (abc)", "1.12.0"), true)
  assert.equal(Model.versionAtLeast("hyprmoncfg v1.12.3", "1.12.0"), true)
  assert.equal(Model.versionAtLeast("hyprmoncfg dev", "1.12.0"), true)
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.11.1", "1.12.0"), false)
  assert.equal(Model.versionAtLeast("not installed", "1.12.0"), false)
})

test("layout display data comes from daemon status and matches TUI labels", () => {
  const displays = Model.layoutDisplays([{
    name: "eDP-1",
    description: "Samsung Display Corp. ATNA60CL10-0",
    make: "Samsung Display Corp.",
    model: "ATNA60CL10-0",
    mode: "2880x1800@120.00Hz",
    scale: 1.5,
    internal: true,
    focused: true,
    enabled: true,
    x: 3840,
    y: 0,
    logical_width: 1920,
    logical_height: 1200
  }], [{ name: "fallback" }])

  assert.equal(displays.length, 1)
  assert.equal(Model.displayModelLabel(displays[0]), "Internal · Samsung Display Corp. ATNA60CL10-0")
  assert.equal(Model.displayModelLabel(displays[0], true), "Internal · ATNA60CL10-0")
  assert.equal(Model.displayDetailLabel(displays[0]), "2880×1800 · 120 Hz · 1.5x")
})

test("layout preview preserves relative placement", () => {
  const bounds = Model.layoutBounds([
    { x: 0, y: 0, width: 200, height: 100 },
    { x: 200, y: 50, width: 100, height: 100 }
  ])
  const left = Model.layoutRect({ x: 0, y: 0, width: 200, height: 100 }, bounds, 330, 140, 10)
  const right = Model.layoutRect({ x: 200, y: 50, width: 100, height: 100 }, bounds, 330, 140, 10)

  assert.equal(left.x, 45)
  assert.equal(left.width, 160)
  assert.equal(right.x, 205)
  assert.equal(right.y, 50)
})

test("keyboard navigation wraps outputs and profiles like the TUI", () => {
  const profile = { outputs: [
    { key: "left" },
    { key: "right" },
    { key: "projector" }
  ] }
  const profiles = [{ name: "Desk" }, { name: "Laptop" }]

  assert.equal(Model.adjacentOutputKey(profile, "left", -1), "projector")
  assert.equal(Model.adjacentOutputKey(profile, "projector", 1), "left")
  assert.equal(Model.adjacentProfileName(profiles, "Desk", -1), "Laptop")
  assert.equal(Model.adjacentProfileName(profiles, "Laptop", 1), "Desk")
  assert.equal(Model.cycleOptionValue([
    { value: "manual" },
    { value: "sequential" },
    { value: "interleave" }
  ], "manual", -1), "interleave")
})

test("Alt-arrow snapping matches the TUI's nearest-monitor placement", () => {
  const profile = { outputs: [
    {
      key: "selected", enabled: true, width: 2560, height: 1440,
      scale: 2, transform: 0, x: 2000, y: 300
    },
    {
      key: "near", enabled: true, width: 1920, height: 1080,
      scale: 1, transform: 0, x: 0, y: 0
    },
    {
      key: "far", enabled: true, width: 3840, height: 2160,
      scale: 1, transform: 0, x: 7000, y: 0
    },
    {
      key: "mirror", enabled: true, mirror_of: "near", width: 1920,
      height: 1080, scale: 1, x: 1900, y: 0
    }
  ] }

  assert.deepEqual(Model.snapOutputPosition(profile, "selected", "right"), {
    x: 1920,
    y: 180
  })
  assert.deepEqual(Model.snapOutputPosition(profile, "selected", "up"), {
    x: 320,
    y: -720
  })
  assert.equal(Model.snapOutputPosition({ outputs: [profile.outputs[0]] }, "selected", "left"), null)
})

test("editor layout derives logical geometry without losing profile fields", () => {
  const profile = {
    name: "Desk",
    outputs: [{
      key: "desk-panel",
      name: "DP-1",
      make: "Example",
      model: "Panel",
      enabled: true,
      mode: "3840x2160@120.00Hz",
      width: 3840,
      height: 2160,
      scale: 1.5,
      transform: 0,
      x: 100,
      y: 40,
      icc: "/profiles/desk.icc"
    }]
  }
  const displays = Model.profileLayoutDisplays(profile, [{ key: "desk-panel", focused: true }])

  assert.equal(displays.length, 1)
  assert.equal(displays[0].width, 2560)
  assert.equal(displays[0].height, 1440)
  assert.equal(displays[0].focused, true)
  assert.equal(Model.displayScaleLayoutLabel(displays[0]), "1.5x = 2560×1440")
  assert.equal(profile.outputs[0].icc, "/profiles/desk.icc")
})

test("brightness follows the selected connected display without becoming profile state", () => {
  const profile = { outputs: [
    { key: "desk", name: "DP-1", make: "Microstep", model: "MPG321UR-QD", enabled: true },
    { key: "laptop", name: "eDP-1", make: "Samsung", model: "Panel", enabled: false }
  ] }
  const displays = [{ key: "desk" }, { key: "laptop" }]

  assert.deepEqual(Model.brightnessTarget(profile, "desk", displays), {
    connector: "DP-1",
    label: "Microstep MPG321UR-QD"
  })
  assert.deepEqual(Model.brightnessTarget(profile, "laptop", displays), { connector: "", label: "" })
  assert.deepEqual(Model.brightnessTarget(profile, "missing", displays), { connector: "", label: "" })
  assert.equal(Model.clampBrightness(0), 1)
  assert.equal(Model.clampBrightness(42.6), 43)
  assert.equal(Model.clampBrightness(120), 100)
  assert.equal(Object.hasOwn(profile.outputs[0], "brightness"), false)
})

test("expanded profile and workspace panes use daemon-owned documents", () => {
  const editor = { profiles: [
    { name: "Desk", outputs: [{ key: "desk" }], workspaces: { enabled: true, strategy: "sequential", max_workspaces: 8 } },
    { name: "Laptop", outputs: [{ key: "laptop" }] }
  ] }
  const status = { profiles: [
    { name: "Desk", active: true, match_score: 200 },
    { name: "Laptop", match_score: 80 }
  ] }

  assert.equal(Model.savedProfileByName(editor, "Desk").outputs[0].key, "desk")
  assert.equal(Model.profileSummaryByName(status, "Desk").active, true)
  editor.profile_workspace_plans = {
    Desk: [{ output_key: "desk", output_name: "Desk display", workspaces: ["1", "2"] }]
  }
  assert.deepEqual(Model.profileWorkspacePlan(editor, "Desk"), editor.profile_workspace_plans.Desk)
  assert.deepEqual(Model.profileWorkspacePlan(editor, "Missing"), [])
  assert.equal(Model.profileWorkspaceSummary(editor.profiles[0]), "Sequential · 8 workspaces")
  assert.deepEqual(Model.workspacePlanRows([
    { output_key: "desk", output_name: "Desk display", workspaces: ["1", "2"] }
  ]), [{ key: "desk", name: "Desk display", workspaces: "1, 2" }])

  const detailed = {
    name: "Desk",
    outputs: [
      { key: "desk", name: "DP-1", make: "Microstep", model: "MPG321UR-QD", enabled: true },
      { key: "laptop", name: "eDP-1", make: "Samsung", model: "ATNA", enabled: false }
    ]
  }
  assert.deepEqual(Model.workspacePlanRows([
    { output_key: "desk", output_name: "DP-1", workspaces: ["1", "2"] }
  ], detailed), [{ key: "desk", name: "Microstep MPG321UR-QD", workspaces: "1, 2" }])
  assert.equal(Model.outputDisplayLabel(detailed, "laptop"), "Samsung ATNA")
  assert.equal(Model.profileMatchLabel({ active: true, match_score: 150 }), "Active · score 150")
  assert.deepEqual(Model.profileMatchReasonRows({
    match_score: 150,
    match_reasons: [
      { kind: "connected", count: 1, points: 100 },
      { kind: "connected_kept_off", count: 1, points: 50 }
    ]
  }), [
    { value: "+100   1 display connected", positive: true },
    { value: "+50   1 display connected, kept off", positive: true }
  ])
  assert.deepEqual(Model.profileHiddenDisplayRows(detailed), [
    { label: "Kept off", value: "Samsung ATNA" }
  ])
})

test("manual workspace assignments materialize the visible plan", () => {
  const profile = {
    outputs: [
      { key: "desk", name: "DP-1", make: "Dell", model: "Desk", enabled: true },
      { key: "side", name: "HDMI-A-1", make: "LG", model: "Side", enabled: true }
    ],
    workspaces: {
      strategy: "sequential",
      max_workspaces: 6,
      group_size: 3,
      monitor_order: ["desk", "side"]
    }
  }
  const rules = Model.manualWorkspaceRulesFromPlan([
    { output_key: "desk", workspaces: ["1", "2", "3"] },
    { output_key: "side", workspaces: ["4", "5", "6"] }
  ], profile)

  assert.equal(rules.length, 6)
  assert.deepEqual(rules.map(rule => rule.output_key), ["desk", "desk", "desk", "side", "side", "side"])
  assert.equal(rules[0].default, true)
  assert.equal(rules[0].persistent, true)
  assert.equal(rules[1].default, false)
  assert.equal(rules[3].default, true)

  const disabledPlanRules = Model.manualWorkspaceRulesFromPlan([], profile)
  assert.deepEqual(disabledPlanRules.map(rule => rule.output_key),
    ["desk", "desk", "desk", "side", "side", "side"])

  profile.workspaces.rules = rules
  assert.deepEqual(Model.manualWorkspaceRows(profile).slice(0, 2), [
    { workspace: "1", output_key: "desk", display_name: "Dell Desk" },
    { workspace: "2", output_key: "desk", display_name: "Dell Desk" }
  ])
})

test("manual workspace assignments cycle displays and resize numbered rules", () => {
  const profile = {
    outputs: [
      { key: "off", name: "eDP-1", enabled: false },
      { key: "desk", name: "DP-1", enabled: true },
      { key: "mirror", name: "DP-2", enabled: true, mirror_of: "desk" },
      { key: "side", name: "HDMI-A-1", enabled: true }
    ],
    workspaces: { monitor_order: ["off", "desk", "mirror", "side"] }
  }
  const initial = [
    { workspace: "2", output_key: "desk", output_name: "DP-1" },
    { workspace: "1", output_key: "desk", output_name: "DP-1" },
    { workspace: "special:music", output_key: "side", output_name: "HDMI-A-1" }
  ]

  assert.deepEqual(Model.manualWorkspaceTargetKeys(profile), ["desk", "side"])
  const moved = Model.cycleManualWorkspaceRule(initial, profile, 1, 1)
  assert.equal(moved[1].workspace, "2")
  assert.equal(moved[1].output_key, "side")
  assert.equal(moved[0].default, true)
  assert.equal(moved[1].default, true)

  const grown = Model.resizeManualWorkspaceRules(moved, profile, 3)
  assert.deepEqual(grown.map(rule => rule.workspace), ["1", "2", "3", "special:music"])
  assert.equal(grown[2].output_key, "desk")
  assert.equal(Model.manualWorkspaceCount({ max_workspaces: 9, rules: grown }), 3)

  const shrunk = Model.resizeManualWorkspaceRules(grown, profile, 2)
  assert.deepEqual(shrunk.map(rule => rule.workspace), ["1", "2", "special:music"])
})

test("workspace planning has no legacy 10 or 30 workspace ceiling", () => {
  const profile = {
    outputs: [
      { key: "desk", name: "DP-1", enabled: true },
      { key: "side", name: "HDMI-A-1", enabled: true }
    ],
    workspaces: {
      strategy: "sequential",
      max_workspaces: 64,
      group_size: 40,
      monitor_order: ["desk", "side"]
    }
  }

  const generated = Model.manualWorkspaceRulesFromPlan([], profile)
  assert.equal(generated.length, 64)
  assert.deepEqual(generated.slice(0, 40).map(rule => rule.output_key),
    Array(40).fill("desk"))
  assert.deepEqual(generated.slice(40).map(rule => rule.output_key),
    Array(24).fill("side"))

  const resized = Model.resizeManualWorkspaceRules([], profile, 64)
  assert.equal(resized.length, 64)

  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /readonly property int workspaceValueMaximum: 2147483647/)
  assert.equal((qml.match(/to: root\.workspaceValueMaximum/g) || []).length, 2)
  assert.doesNotMatch(qml, /to: (10|30)\b/)
})

test("the daemon's exact display match drives contextual profile onboarding", () => {
  const exact = { name: "Desk", exact_display_match: true, recommended: true }
  const activeExact = { name: "Desk fallback", exact_display_match: true, active: true }
  const partial = { name: "Laptop", exact_display_match: false, recommended: false }

  assert.equal(Model.exactDisplayProfile({ profiles: [partial, activeExact, exact] }), exact)
  assert.equal(Model.exactDisplayProfile({ profiles: [partial, activeExact] }), activeExact)
  assert.equal(Model.exactDisplayProfile({ profiles: [partial] }), null)
})

test("editor options stay compact and only offer applicable profiles", () => {
  const scales = Model.scaleOptions([{ key: "panel", scale_options: [1, 1.33333, 2] }], "panel", 1.5)
  assert.deepEqual(scales, [
    { value: "1", label: "1x" },
    { value: "1.33333", label: "1.33333x" },
    { value: "1.5", label: "1.5x" },
    { value: "2", label: "2x" }
  ])

  const profiles = Model.profileOptions({ profiles: [
    { name: "Desk", connected_enabled_outputs: 2, active: true },
    { name: "Projector", connected_enabled_outputs: 0 },
    { name: "Gaming", connected_enabled_outputs: 1, recommended: true }
  ] })
  assert.deepEqual(profiles, [
    { value: "Desk", label: "Desk · active" },
    { value: "Gaming", label: "Gaming · best match" }
  ])
})

test("individual output fields reset to the loaded profile values", () => {
  const defaults = {
    outputs: [{
      key: "desk",
      mode: "3440x1440@165.00Hz",
      scale: 1,
      bitdepth: 10,
      cm: "hdredid",
      sdr_brightness: 1,
      sdr_saturation: 1,
      min_luminance: 0.055,
      max_luminance: 456,
      supports_hdr: 0
    }]
  }
  const draft = Model.clone(defaults)
  draft.outputs[0].scale = 1.25
  draft.outputs[0].sdr_brightness = 1.35
  draft.outputs[0].supports_hdr = 1

  assert.equal(Model.outputFieldChanged(draft, defaults, "desk", "scale"), true)
  assert.equal(Model.outputFieldChanged(draft, defaults, "desk", "sdr_brightness"), true)
  assert.equal(Model.outputFieldChanged(draft, defaults, "desk", "supports_hdr"), true)
  assert.equal(Model.outputFieldChanged(draft, defaults, "desk", "cm"), false)
  assert.deepEqual(Model.outputFieldResetEdit(defaults, "desk", "scale"), { scale: 1 })
  assert.deepEqual(Model.outputFieldResetEdit(defaults, "desk", "sdr_brightness"), {
    sdr_brightness: 1
  })
  assert.deepEqual(Model.outputFieldResetEdit(defaults, "desk", "supports_hdr"), {
    supports_hdr: 0
  })
})

test("field reset restores neutral or auto-detected values omitted from a profile", () => {
  const defaults = { outputs: [{ key: "desk" }] }
  const draft = {
    outputs: [{
      key: "desk",
      max_luminance: 1000,
      max_avg_luminance: 600,
      icc: "/profiles/desk.icc"
    }]
  }

  assert.deepEqual(Model.outputFieldResetEdit(defaults, "desk", "max_luminance"), {
    max_luminance: 0
  })
  assert.deepEqual(Model.outputFieldResetEdit(defaults, "desk", "max_avg_luminance"), {
    max_avg_luminance: 0
  })
  assert.deepEqual(Model.outputFieldResetEdit(defaults, "desk", "icc"), { icc: "" })
  assert.equal(Model.outputFieldChanged(draft, defaults, "missing", "icc"), false)
  assert.equal(Model.outputFieldResetEdit(defaults, "desk", "not_a_field"), null)
})

test("workspace preview is rendered from the daemon plan", () => {
  const plan = [
    { output_key: "left", workspaces: ["1", "2", "3", "4"] },
    { output_key: "right", workspaces: ["5", "6", "7", "8"] }
  ]
  assert.equal(Model.workspaceText(plan, "right"), "5, 6, 7, 8")
  assert.equal(Model.workspaceText(plan, "missing"), "")
})

test("bar icon stays legible through transient daemon restarts", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "BarWidget.qml"), "utf8")
  assert.doesNotMatch(qml, /text: "H"/)
  assert.doesNotMatch(qml, /slotSize: Style\.bar\.statusSlot/)
  assert.match(qml, /text: root\.monitorCount > 1 \? "󰍺" : "󰍹"/)
  assert.match(qml, /dimmed: root\.barIconDimmed/)
  assert.doesNotMatch(qml, /dimmed: !root\.backendConnected/)
  assert.match(qml, /id: barDisplayGlyph/)
  assert.match(qml, /visible: root\.backendConnected/)
  assert.match(qml, /text: "󰄬"/)
  assert.match(qml, /color: Color\.accent/)
})

test("the update call to action uses a plain refresh icon", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /iconText: root\.installed \? "󰚰" : "󰏔"/)
  assert.match(qml, /selected: !root\.installed/)
})

test("the panel header uses the clear managed check at hero scale", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /id: compactHeroGlyph/)
  assert.match(qml, /visible: root\.backendConnected/)
  assert.match(qml, /text: "󰄬"/)
  assert.match(qml, /color: Color\.accent/)
  assert.match(qml, /text: "hyprmoncfg"/)
})

test("the panel hands monitor management over, not the user service", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /text: "MONITOR MANAGEMENT"/)
  assert.match(qml, /label: "Managed by hyprmoncfg"/)
  assert.match(qml, /Switch layouts on monitor, lid, and resume events/)
  assert.match(qml, /if \(root\.managedChecked && root\.profileAutomatic\)/)
  assert.match(qml, /Owns and applies monitor configuration/)
  assert.match(qml, /Read-only — display configuration is controlled elsewhere/)
  // Turning management on starts the unit and claims the displays.
  assert.match(qml, /systemctl --user enable --now hyprmoncfgd\.service && hyprmoncfg manage/)
  // Turning it off hands the config back and leaves the unit alone. Stopping
  // the daemon never removed hyprmoncfg's include, so the generated rules kept
  // loading last and kept winning.
  assert.match(qml, /\["hyprmoncfg", "unmanage"\]/)
  assert.doesNotMatch(qml, /"disable", "--now"/)
  assert.match(qml, /\["systemctl", "--user", "is-enabled", "--quiet", "hyprmoncfgd\.service"\]/)
  assert.match(qml, /\["systemctl", "--user", "is-active", "--quiet", "hyprmoncfgd\.service"\]/)
  assert.doesNotMatch(qml, /set_automation/)
  assert.doesNotMatch(qml, /automaticSwitching/)
  assert.doesNotMatch(qml, /settings\.json/)
  assert.match(qml, /serviceActionPending && !serviceProcess\.running/)
  // Only the managed direction can be confirmed from systemctl now. Handing the
  // displays back leaves the unit enabled and active, so that direction is
  // confirmed by the daemon reporting itself unmanaged.
  assert.match(qml, /root\.serviceTargetManaged\s*&& root\.serviceEnabled\s*&& root\.serviceActive/)
  assert.match(qml, /root\.serviceTargetManaged === !unmanaged/)
  assert.match(qml, /daemon\.unmanaged/)
})

test("each monitor discovers management started from another panel", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /id: serviceDiscoveryTimer/)
  assert.match(qml, /interval: 2000/)
  assert.match(qml, /running: root\.compatible && !root\.backendConnected && !root\.serviceActionPending/)
  assert.match(qml, /onTriggered: root\.checkServiceState\(\)/)
})

test("the panel has management-first compact mode and a TUI-shaped expanded mode", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /property bool expanded: false/)
  assert.match(qml, /Style\.space\(root\.expanded \? 1120 : 430\)/)
  assert.match(qml, /Style\.space\(780\)/)
  assert.doesNotMatch(qml, /ScrollView \{/)
  assert.match(qml, /id: compactColumn/)
  assert.match(qml, /id: expandedEditor/)
  assert.match(qml, /label: "1  Layout"/)
  assert.match(qml, /label: "2  Profiles"/)
  assert.match(qml, /label: "3  Workspaces"/)
  assert.match(qml, /title: "Monitor Layout"/)
  assert.match(qml, /title: "Info"/)
  assert.match(qml, /title: "Display  -  Color"/)
  assert.match(qml, /title: "Saved Profiles"/)
  assert.match(qml, /title: "Workspace Planner"/)
  assert.match(qml, /DisplayCanvas \{/)
  assert.match(qml, /root\.editOutput\(\{ mode: value \}\)/)
  assert.match(qml, /root\.changeWorkspaceStrategy\(value\)/)
  assert.match(qml, /"WORKSPACE → DISPLAY"/)
  assert.match(qml, /root\.moveManualWorkspace\(index, -1\)/)
  assert.match(qml, /root\.moveManualWorkspace\(index, 1\)/)
  assert.match(qml, /function ensureManualWorkspaceRules\(\)/)
  assert.match(qml, /selectedKey: root\.selectedWorkspaceDisplayKey/)
  assert.doesNotMatch(qml, /full TUI remains available for editing individual rules/)
  assert.doesNotMatch(qml, /text: "Preview profile"/)
  assert.match(qml, /centerOnBar: false/)
  assert.match(qml, /fontSize: Style\.font\.caption/)
  assert.doesNotMatch(qml, /ProfileRow/)
  assert.match(qml, /match_score/)
})

test("the inspectors use standards-based colour terms and per-field profile resets", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const dropdown = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")

  for (const label of [
    "COLOR DEPTH (BPC)",
    "COLOR SPACE / EOTF",
    "SDR LUMINANCE SCALE",
    "SDR SATURATION SCALE",
    "SDR BLACK LEVEL (cd/m²)",
    "SDR WHITE LEVEL (cd/m²)",
    "SDR EOTF",
    "DISPLAY BLACK (cd/m²)",
    "DISPLAY PEAK (cd/m²)",
    "MAX FRAME-AVERAGE (cd/m²)",
    "WCG CAPABILITY",
    "HDR CAPABILITY",
    "ICC DEVICE PROFILE"
  ]) assert.match(qml, new RegExp(label.replace(/[()²/]/g, "\\$&")))

  assert.doesNotMatch(qml, /bpc =|EOTF =|PQ =|WCG =|A reset button appears/)
  assert.match(qml, /tooltipText: "Bits per color component\."/)
  assert.match(qml, /tooltipText: "Color space and electro-optical transfer function\."/)
  assert.match(qml, /tooltipText: "Override wide color gamut support\."/)
  assert.match(qml, /tooltipText: "All display luminance values at 0: use EDID\."/)
  assert.match(qml, /BT\.2020 \+ PQ \(HDR\)/)
  assert.match(qml, /EDID primaries \+ PQ/)
  assert.match(qml, /function resetOutputField\(field\)/)
  assert.equal((qml.match(/resetVisible: root\.outputFieldChanged/g) || []).length, 17)
  assert.equal((qml.match(/onResetRequested: root\.resetOutputField/g) || []).length, 17)
  assert.equal((qml.match(/visible: root\.outputFieldChanged/g) || []).length, 4)
  assert.equal((qml.match(/onClicked: root\.resetOutputField/g) || []).length, 4)
  assert.match(qml, /visible: root\.outputFieldChanged\("icc"\)/)
  assert.match(qml, /onClicked: root\.resetOutputField\("icc"\)/)
  assert.match(dropdown, /signal resetRequested\(\)/)
  assert.match(dropdown, /tooltipText: root\.resetTooltip/)
})

test("both inspector forms stay inside a scrollable viewport below the tabs", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const viewport = fs.readFileSync(path.join(__dirname, "..", "InspectorViewport.qml"), "utf8")
  const start = qml.indexOf("                InspectorViewport {")
  const end = qml.indexOf("\n                }", start)
  const inspector = qml.slice(start, end)
  assert.match(inspector, /anchors.top: inspectorTabs.bottom/)
  assert.match(inspector, /anchors.bottom: parent.bottom/)
  assert.match(inspector, /id: displayControls/)
  assert.match(inspector, /id: colorControls/)
  assert.match(inspector, /id: iccProfileInput/)
  assert.match(inspector, /formHeight: root.inspectorPage === "display"/)
  assert.match(inspector, /currentField: root.keyboardLayoutPane === root.inspectorPage/)
  assert.match(inspector, /onPageChanged: contentY = 0/)
  assert.match(inspector, /!inspectorViewport.moving/)
  assert.match(viewport, /clip: true/)
  assert.match(viewport, /ScrollBar.vertical: ScrollBar/)
  assert.match(viewport, /onCurrentFieldChanged:/)
  assert.match(viewport, /onFocusedFieldChanged:/)
})

test("the default inspector leaves room for the complete color form", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const pane = fs.readFileSync(path.join(__dirname, "..", "EditorPane.qml"), "utf8")
  const viewport = qml.slice(qml.indexOf("id: inspectorViewport"))
  const tabGap = Number(viewport.match(/anchors.topMargin: Style.space\((\d+)\)/)[1])
  const panelHeight = Number(qml.match(/panel.fittedContentHeight\(Style.space\((\d+)\)\)/)[1])
  const navHeight = Number(qml.slice(qml.indexOf("id: editorNav")).match(/height: Style.space\((\d+)\)/)[1])
  const footerHeight = Number(qml.slice(qml.indexOf("id: editorFooter")).match(/height: Math.max\(Style.space\((\d+)\)/)[1])
  const body = qml.slice(qml.indexOf("id: editorBody"))
  const bodyInsets = [...body.matchAll(/anchors.(?:top|bottom)Margin: Style.space\((\d+)\)/g)]
    .slice(0, 2).reduce((sum, match) => sum + Number(match[1]), 0)
  const infoSpace = Number(qml.match(/height: parent.height - Style.space\((\d+)\)/)[1])
  const titleHeight = Number(pane.match(/height: Style.space\((\d+)\)/)[1])
  const bottomInset = Number(pane.match(/anchors.bottomMargin: Style.space\((\d+)\)/)[1])
  // Measured with the actual Omarchy controls at the default 12px font.
  // Keep the layout budget coupled to the source: 2.3.2 left only 394px.
  const tabsHeight = 28
  const colorFormHeight = 395
  const available = panelHeight - navHeight - footerHeight - bodyInsets - infoSpace
    - titleHeight - bottomInset - tabsHeight - tabGap
  assert.ok(available >= colorFormHeight, `${colorFormHeight}px form exceeds ${available}px viewport`)
})

test("the workspace form hides irrelevant group size and adapts keyboard navigation", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

  assert.match(qml, /readonly property bool workspaceGroupSizeApplicable: root\.workspaceStrategy === "sequential"/)
  assert.match(qml, /id: workspaceGroupSizeField\s+visible: root\.workspaceGroupSizeApplicable/)
  assert.match(qml, /width: root\.workspaceGroupSizeApplicable\s+\? \(parent\.width - parent\.spacing\) \/ 2 : parent\.width/)
  // Hiding Group Size also removes its keyboard stop; assignment rows move up.
  assert.match(qml, /readonly property int workspaceListKeyboardStart: root\.workspaceGroupSizeApplicable \? 4 : 3/)
  assert.match(qml, /root\.workspaceKeyboardIndex === root\.workspaceListKeyboardStart \+ index/)
  assert.doesNotMatch(qml, /root\.workspaceKeyboardIndex === 4 \+ index/)
})

test("the compact profile is stable status with contextual actions, not a selector", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /text: "PROFILE"/)
  assert.match(qml, /id: compactProfileStatus/)
  assert.match(qml, /text: root\.profileStatusTitle/)
  assert.match(qml, /text: root\.profileStatusSubtitle/)
  assert.match(qml, /text: root\.profileModePending \? "Resuming automatic matching…" : "Resume automatic matching"/)
  assert.match(qml, /text: "Create profile"/)
  assert.match(qml, /root\.beginCreateProfile\(\)/)
  assert.doesNotMatch(qml, /compactProfilesOpen/)
  assert.doesNotMatch(qml, /id: compactProfileSelector/)
  assert.doesNotMatch(qml, /model: Model\.profileOptions\(root\.document\)/)
  assert.doesNotMatch(qml, /Open full display editor/)
})

test("the compact change row becomes the one preview confirmation row", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /visible: root\.draftDirty \|\| root\.previewTransaction !== ""/)
  assert.match(qml, /root\.previewKind === "profile" \? "Keep this profile\?" : "Keep this layout\?"/)
  assert.match(qml, /root\.previewTransaction !== "" \? "Revert" : "Discard"/)
  assert.match(qml, /if \(root\.previewTransaction !== ""\) root\.keepPreview\(\)/)
  assert.doesNotMatch(qml, /id: compactPreviewRow/)
  assert.match(qml, /id: previewRecoveryTimer/)
  assert.match(qml, /root\.syncDaemonPreview\(value\.daemon \? value\.daemon\.preview : null\)/)
  assert.match(qml, /root\.bar\.summonBarWidget\(root\.moduleName\)/)
  assert.match(qml, /save_on_commit: true/)
  assert.match(qml, /pending\.profile && pending\.profile\.outputs instanceof Array/)
  assert.match(qml, /root\.draftProfile = Model\.clone\(pending\.profile\)/)
  assert.match(qml, /root\.pendingProfileName !== ""/)
})

test("display previews keep a shell-level confirmation across monitor rebuilds", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"))
  const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const guard = fs.readFileSync(path.join(__dirname, "..", "PreviewGuard.qml"), "utf8")

  assert.deepEqual(manifest.kinds, ["bar-widget", "service"])
  assert.equal(manifest.entryPoints.service, "PreviewGuard.qml")
  assert.match(panel, /previewCoordinator\.startDraftPreview/)
  assert.match(panel, /previewCoordinator\.startDraftApply/)
  assert.match(panel, /previewCoordinator\.startSavedProfilePreview/)
  assert.match(panel, /root\.previewCoordinator\.connected === true/)
  assert.match(panel, /!root\.previewCoordinator \|\| !root\.previewCoordinator\.connected/)
  assert.match(guard, /root\.stage = "applying"/)
  assert.match(guard, /Model\.canConfirmPreview\(pending, root\.transactionId\)/)
  assert.match(guard, /This confirmation stays open while your displays reconfigure\./)
  assert.match(guard, /WlrKeyboardFocus\.Exclusive/)
  assert.doesNotMatch(guard, /WlrKeyboardFocus\.OnDemand/)
  assert.match(guard, /model: root\.opened \? Quickshell\.screens : \[\]/)
  assert.match(guard, /mask: Region/)
  assert.match(guard, /onBackingWindowVisibleChanged/)
  assert.match(guard, /keyCatcher\.forceActiveFocus\(\)/)
  assert.match(guard, /onClicked: function\(mouse\) \{ mouse\.accepted = true \}/)
  assert.match(guard, /function startDraftApply\(profile, timeoutSeconds\)/)
  assert.match(guard, /save_on_commit: false/)
  assert.match(guard, /root\.actionError !== ""/)
  assert.match(guard, /event\.text === "y"/)
  assert.match(guard, /event\.text === "n"/)
})

test("preview confirmation belongs to its client until that client disconnects", () => {
  const preview = { transaction_id: "tui-preview", reclaimable: false }
  assert.equal(Model.canConfirmPreview(preview, ""), false)
  assert.equal(Model.canConfirmPreview(preview, "panel-preview"), false)
  assert.equal(Model.canConfirmPreview(preview, "tui-preview"), true)
  assert.equal(Model.canConfirmPreview({ ...preview, reclaimable: true }, ""), true)
  // Older daemons cannot advertise an orphan: do not guess and steal focus.
  assert.equal(Model.canConfirmPreview({ transaction_id: "old-preview" }, ""), false)
  assert.equal(Model.canConfirmPreview(null, "tui-preview"), false)
  assert.equal(Model.canConfirmPreview({ transaction_id: "", reclaimable: true }, ""), false)
})

test("the expanded panel mirrors the TUI's contextual keyboard map", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const help = fs.readFileSync(path.join(__dirname, "..", "KeyboardHelp.qml"), "utf8")

  assert.match(panel, /onTextKey: function\(text\) \{ if \(root\.expanded\) root\.handleExpandedText\(text\) \}/)
  assert.match(panel, /root\.activePage = key === "1" \? "layout"/)
  assert.match(panel, /root\.nudgeSelectedOutput\(dx \* 100, dy \* 100\)/)
  assert.match(panel, /sequence: "Shift\+Left"/)
  assert.match(panel, /sequence: "Ctrl\+Left"/)
  assert.match(panel, /sequence: "Alt\+Left"/)
  assert.match(panel, /root\.snapSelectedOutput\("left"\)/)
  assert.match(panel, /sequence: "L"[\s\S]*root\.loadSelectedSavedProfile\(\)/)
  assert.match(panel, /if \(key === "e"\) root\.beginExecEdit\(\)/)
  assert.match(panel, /else if \(key === "d"\) root\.deleteSelectedSavedProfile\(\)/)
  assert.match(panel, /root\.adjustWorkspaceKeyboard\(dx\)/)
  assert.match(panel, /root\.keyboardHelpOpen = true/)
  assert.match(help, /Any key closes this\./)
  assert.match(help, /Tab, Shift\+Tab/)
  assert.match(help, /Apply the current draft or selected profile/)
})

test("manual profile choice is explicit and can return to automatic matching", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /label: "Automatically use the best profile"/)
  assert.equal((qml.match(/Matches your connected displays to your saved profiles/g) || []).length, 1)
  assert.match(qml, /document\.daemon\.profile_override/)
  assert.match(qml, /root\.send\("set_profile_auto", \{ enabled: enabled \}\)/)
  assert.match(qml, /Automatic matching is paused/)
  assert.match(qml, /&& !root\.profileAutomatic && root\.managedChecked/)
  assert.match(qml, /root\.profileChoice = selected\s+root\.previewProfile\(selected\)/)
  assert.match(qml, /Model\.currentProfileName\(root\.document\)/)
  assert.match(qml, /Model\.profileIsCurrent\(modelData, root\.document\)/)
  assert.equal((qml.match(/label: "Automatically use the best profile"/g) || []).length, 1)
  assert.doesNotMatch(qml, /id: profilePreviewButton/)
})

test("expanded profiles separate browsing from activation and show saved workspaces", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const canvasQml = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")

  assert.match(panelQml, /root\.selectedSavedProfileName = selected/)
  assert.match(panelQml, /id: activateFooterButton/)
  assert.match(panelQml, /!root\.profileAutomatic && root\.managedChecked/)
  assert.match(panelQml, /root\.activateSelectedSavedProfile\(\)/)
  assert.match(panelQml, /workspacePlan: root\.selectedSavedWorkspacePlan/)
  assert.match(panelQml, /workspacePlan: root\.selectedSavedWorkspacePlan\s+emphasis: "profile"/)
  assert.match(canvasQml, /property string emphasis: "layout"/)
})

test("active saved profiles render as status instead of a disabled action", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

  assert.match(panelQml, /id: currentProfileBadge/)
  assert.match(panelQml, /text: "Current profile"/)
  assert.match(panelQml, /visible: root\.activePage === "profiles"\s+&& root\.selectedSavedProfileCurrent/)
  assert.match(panelQml, /id: activateFooterButton[\s\S]*?visible: root\.activePage === "profiles"\s+&& !root\.selectedSavedProfileCurrent[\s\S]*?text: "Activate"/)
  assert.doesNotMatch(panelQml, /\? "Active" : "Activate"/)
})

test("profile details and workspace labels mirror the TUI semantics", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

  assert.match(panelQml, /Model\.profileMatchLabel\(root\.selectedSavedSummary, root\.selectedSavedProfileCurrent\)/)
  assert.match(panelQml, /model: root\.selectedSavedMatchReasons/)
  assert.match(panelQml, /Number\(root\.selectedSavedSummary\.output_count \|\| 0\) \+ " saved · "/)
  assert.match(panelQml, /Number\(root\.selectedSavedSummary\.connected_outputs \|\| 0\) \+ " connected"/)
  assert.match(panelQml, /model: root\.selectedSavedWorkspaceRows/)
  assert.match(panelQml, /Model\.outputDisplayLabel\(root\.draftProfile, String\(modelData\)\)/)
  assert.match(panelQml, /label: "ROTATION"/)
  assert.doesNotMatch(panelQml, /label: "TRANSFORM"/)
})

test("every panel canvas uses the same adaptive card with contextual emphasis", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const canvasQml = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")

  assert.equal((panelQml.match(/emphasis: "layout"/g) || []).length, 2)
  assert.equal((panelQml.match(/emphasis: "profile"/g) || []).length, 1)
  assert.equal((panelQml.match(/emphasis: "workspaces"/g) || []).length, 1)
  assert.match(canvasQml, /readonly property string workspaceText:/)
  assert.match(canvasQml, /visible: card\.workspaceText !== ""/)
  assert.match(canvasQml, /visible: !card\.compact && root\.detailed/)
  assert.doesNotMatch(canvasQml, /showWorkspaces/)
})

test("layout dragging uses stationary canvas coordinates in both panel sizes", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const canvasQml = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")
  assert.equal((panelQml.match(/selectable: root\.editorReady/g) || []).length, 2)
  assert.equal((panelQml.match(/movable: root\.managedChecked && root\.editorReady/g) || []).length, 2)
  assert.match(canvasQml, /dragArea\.mapToItem\(canvas, mouse\.x, mouse\.y\)/)
  assert.match(canvasQml, /property bool selectable: interactive/)
  assert.match(canvasQml, /property bool movable: interactive/)
  assert.match(canvasQml, /if \(!pressed \|\| !root\.movable\) return/)
  assert.match(canvasQml, /property bool dragStarted: false/)
  assert.match(canvasQml, /var threshold = Style\.space\(6\)/)
  assert.match(canvasQml, /if \(!dragStarted\)/)
  assert.doesNotMatch(canvasQml, /card\.dragOffsetX = mouse\.x - originX/)
})

test("brightness uses Omarchy's per-monitor hardware path in both panel sizes", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const brightnessQml = fs.readFileSync(path.join(__dirname, "..", "BrightnessControl.qml"), "utf8")

  assert.match(panelQml, /Model\.brightnessTarget\(root\.draftProfile,/)
  assert.match(panelQml, /\["omarchy-brightness-display", "--monitor", connector\]/)
  assert.match(panelQml, /"--no-osd", "--monitor", connector, percent \+ "%"/)
  assert.equal((panelQml.match(/BrightnessControl \{/g) || []).length, 2)
  assert.ok(panelQml.indexOf("BrightnessControl {") < panelQml.indexOf('text: "MONITOR MANAGEMENT"'))
  assert.doesNotMatch(panelQml, /omarchy-brightness-keyboard/)
  assert.match(brightnessQml, /text: "BRIGHTNESS · " \+ root\.connector/)
  assert.match(brightnessQml, /text: "Selected display · " \+ root\.displayLabel/)
  assert.match(brightnessQml, /height: Math\.max\(brightnessSlider\.implicitHeight/)
  assert.match(brightnessQml, /visible: !root\.available/)
})

test("editor dropdowns stay anchored and preserve their source bindings", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")
  assert.match(qml, /trigger\.mapToItem\(popupParent/)
  assert.match(qml, /popupType: Popup\.Item/)
  assert.match(qml, /onOwnerOpenChanged: if \(!ownerOpen\) menu\.close\(\)/)
  assert.match(qml, /root\.changed\(selectedValue\)/)
  assert.doesNotMatch(qml, /root\.value\s*=\s*selectedValue/)
})

test("unmanaged mode stays inspectable but makes configuration read-only", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /root\.backendConnected \? monitorSummaries : \[\]/)
  assert.match(qml, /Quickshell\.screens \|\| \[\]/)
  assert.match(qml, /root\.launchTui\(\)/)
  assert.match(qml, /profile: root\.draftProfile/)
  assert.match(qml, /readonly property real unmanagedOpacity: 0\.45/)
  assert.ok((qml.match(/opacity: root\.managedChecked \? 1\.0 : root\.unmanagedOpacity/g) || []).length >= 8)
  assert.match(qml, /if \(!root\.managedChecked \|\| !root\.editorReady/)
  assert.match(qml, /if \(!root\.managedChecked\) return\s+var name = root\.draftName\(\)/)
  assert.match(qml, /enabled: root\.managedChecked && !!root\.selectedOutput/)
  assert.match(qml, /enabled: root\.managedChecked\s+opacity: root\.managedChecked \? 1\.0 : root\.unmanagedOpacity/)
  assert.match(qml, /!root\.managedChecked \? " · read-only"/)
})

test("the profile explains the unmanaged state", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /if \(!root\.managedChecked\) return "Not managed by hyprmoncfg"/)
  assert.match(qml, /if \(!root\.managedChecked\) return "Turn on management for automatic profiles"/)
})

test("profile status distinguishes preview, manual, exact, and new display setups", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /pendingProfileName !== ""/)
  assert.match(qml, /if \(!root\.profileAutomatic && root\.displayedProfile !== ""\) return root\.displayedProfile/)
  assert.match(qml, /if \(root\.profileAutomatic && root\.exactDisplayProfileName !== ""\) return root\.exactDisplayProfileName/)
  assert.match(qml, /return "New display setup"/)
  assert.match(qml, /return "Automatic matching is paused"/)
  assert.match(qml, /return displays \+ " · Best match for this setup"/)
  assert.match(qml, /return "No saved profile matches these displays"/)
})

test("the layout draws only displays that own their image and names the rest", () => {
  const monitors = [
    { name: "DP-1", enabled: true, x: 0, y: 0, logical_width: 2880, logical_height: 1620 },
    { name: "HDMI-A-1", enabled: true, mirror_of: "DP-1", x: 0, y: 0, logical_width: 2560, logical_height: 1440 },
    { name: "eDP-1", enabled: false, x: 0, y: 1620, logical_width: 1920, logical_height: 1200 }
  ]

  const displays = Model.layoutDisplays(monitors, [{ name: "fallback" }])
  assert.deepEqual(displays.map(function(display) { return display.name }), ["DP-1"])
  assert.equal(Model.hiddenDisplays(monitors), "Off: eDP-1   Mirrored: HDMI-A-1 → DP-1")
  assert.equal(Model.hiddenDisplays([monitors[0]]), "")

  const canvasQml = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")
  assert.match(canvasQml, /id: hiddenLabel/)
  assert.match(canvasQml, /visible: root\.hiddenDisplays !== ""/)
})

test("plugin text never interprets daemon or profile values as rich text", () => {
  const pluginRoot = path.join(__dirname, "..")
  const qmlFiles = fs.readdirSync(pluginRoot).filter(function(file) {
    return file.endsWith(".qml")
  })

  for (const file of qmlFiles) {
    const source = fs.readFileSync(path.join(pluginRoot, file), "utf8")
    const textItems = source.match(/^\s*Text\s*\{/gm) || []
    const plainTextItems = source.match(/^\s*textFormat:\s*Text\.PlainText\s*$/gm) || []
    assert.equal(plainTextItems.length, textItems.length,
      `${file} must render every Text item as plain text`)
  }
})

test("the panel waits for daemon status before calling a layout custom", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /property bool documentReady: false/)
  assert.match(qml, /if \(!root\.documentReady\) return root\.serviceActionPending \? "Starting hyprmoncfg…" : "Loading profile…"/)
  assert.match(qml, /root\.documentReady = true/)
})

test("an enabled service without IPC is a recoverable failure", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /readonly property bool serviceBroken:/)
  assert.match(qml, /title: "Restart hyprmoncfg"/)
  assert.match(qml, /\["systemctl", "--user", "restart", "hyprmoncfgd\.service"\]/)
})

test("an upgraded package whose daemon is still the old binary offers a restart", () => {
  // Installing runs as root and cannot restart a user service, so the panel has
  // to say so rather than leave the previous daemon quietly serving profiles.
  assert.equal(Model.daemonNeedsRestart("hyprmoncfg 1.14.0 (abc, 2026-08-18)", "1.13.0"), true)
  assert.equal(Model.daemonNeedsRestart("hyprmoncfg 1.14.0 (abc, 2026-08-18)", "1.14.0"), false)

  // Nothing to say until both versions are known.
  assert.equal(Model.daemonNeedsRestart("", "1.13.0"), false)
  assert.equal(Model.daemonNeedsRestart("hyprmoncfg 1.14.0", ""), false)
  assert.equal(Model.daemonNeedsRestart("hyprmoncfg dev", "1.13.0"), false)

  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /readonly property bool daemonOutdated:/)
  assert.match(qml, /title: "Restart daemon"/)
  // Every subtitle has to fit the row: this panel elides, and a cut sentence
  // reads as a bug.
  const subtitles = qml.match(/subtitle: "[^"]+"/g) || []
  for (const subtitle of subtitles) {
    const text = subtitle.slice("subtitle: \"".length, -1)
    assert.ok(text.length <= 40, `subtitle too long to fit the row: ${text}`)
  }
  assert.match(qml, /else if \(root\.daemonOutdated\)/)
})

test("panel updates open the marketplace without changing or reloading plugin code", () => {
  const opened = []
  const calls = []
  const activate = panelFunction("activateRow", {
    restartService() { calls.push("restart-service") }
  }, {
    Qt: { openUrlExternally(url) { opened.push(url) } }
  })

  activate("panel-updates")
  assert.deepEqual(opened, ["https://plugins.omarchy.org/plugin.html?id=crmne.hyprmoncfg"])
  assert.deepEqual(calls, [])
  activate("restart-service")
  assert.deepEqual(calls, ["restart-service"])
  assert.equal(opened.length, 1)
  activate("unknown")
  assert.equal(opened.length, 1)

  // Runtime code must not retain an alternative path around the review page.
  const runtime = fs.readdirSync(path.join(__dirname, ".."))
    .filter(name => /\.(qml|js)$/.test(name))
    .map(name => fs.readFileSync(path.join(__dirname, "..", name), "utf8"))
    .join("\n")
  assert.doesNotMatch(runtime, /omarchy(?:-| )plugin(?:-| )update|git[^\n]*fetch|FETCH_HEAD|omarchy(?:-| )restart(?:-| )shell/)
})

test("action rows keep their cursor positions in step with what is on screen", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  // One list drives the rows, their indices, and the item count, so a new row
  // cannot land on top of another one's position.
  assert.match(qml, /readonly property var actionRows:/)
  assert.match(qml, /readonly property int layoutRowIndex: 1 \+ root\.actionRows\.length/)
  assert.match(qml, /rowIndex: 1 \+ index/)
  assert.match(qml, /return root\.layoutRowIndex \+ 1/)
  assert.doesNotMatch(qml, /serviceBroken \? 2 : 1/)
  assert.doesNotMatch(qml, /serviceBroken \? 3 : 2/)
})
