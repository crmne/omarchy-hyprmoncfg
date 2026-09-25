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

test("generated to manual conversion retains all-workspace persistence", () => {
  const profile = { outputs: [{ key: "a", name: "DP-1", enabled: true }],
    workspaces: { strategy: "sequential", max_workspaces: 4, group_size: 2, monitor_order: ["a"], persist_all: true } }
  for (const plan of [[], [{ output_key: "a", workspaces: ["1", "2", "3", "4"] }]]) {
    const rules = Model.manualWorkspaceRulesFromPlan(plan, profile)
    assert.equal(rules.length, 4)
    assert.ok(rules.every(rule => rule.persistent))
    assert.equal(rules.filter(rule => rule.default).length, 1)
  }
})

test("persistence keyboard action respects old daemon capability and manual rules", () => {
  const edits = []
  const root = { managedChecked: true, editPending: false, previewTransaction: "",
    draftProfile: { workspaces: { strategy: "sequential", persist_all: false } },
    workspaceKeyboardIndex: 4, workspaceGroupSizeApplicable: true, workspacePersistenceKeyboardIndex: 4,
    workspaceStrategy: "sequential", editorDocument: {}, editWorkspaces: value => edits.push(value) }
  const adjust = panelFunction("adjustWorkspaceKeyboard", root)
  adjust(1)
  assert.equal(edits.length, 0)
  root.editorDocument.workspace_persistence_supported = true
  adjust(1)
  assert.equal(edits[0].persist_all, true)
  root.workspaceStrategy = "manual"
  adjust(1)
  assert.equal(edits.length, 1)
})

test("profile details end with the command and deletion uses native panel controls", () => {
  const qml = fs.readFileSync(path.join(__dirname,"..","Panel.qml"),"utf8")
  const details = qml.slice(qml.indexOf("id: profileDetailsPane"),qml.indexOf("id: workspacePlanPane"))
  assert.ok(details.indexOf('text: "Post-apply command"') > details.indexOf('value: "(not managed)"'))
  assert.doesNotMatch(qml, /savedEntry.current \? "›/)
  assert.match(qml, /id: profileMatchText\s+width: Style.space\(58\)\s+horizontalAlignment: Text.AlignRight/)
  assert.doesNotMatch(qml, /Controls.Dialog/)
  assert.match(qml, /function open\(\) \{ visible = true; cancelDeleteButton.forceActiveFocus\(\) \}/)
  assert.match(qml, /KeyNavigation.tab: cancelDeleteButton/)
  assert.match(qml, /text: "Delete profile"/)
})

test("footer controls share their tallest natural height and keep naming beside save", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const footer = qml.slice(qml.indexOf("id: editorFooter"), qml.indexOf("\n      KeyboardHelp {"))
  const controls = ["profileNameInput", "currentProfileBadge", "activateFooterButton", "discardDraftButton", "saveDraftButton", "createFooterButton", "automaticFooterButton", "reuseFooterButton"]
  const height = footer.match(/readonly property real controlHeight: ([\s\S]*?)\n          height:/)[1]
  for (const tallest of controls) {
    const sizes = Object.fromEntries(controls.map(id => [id, { implicitHeight: id === tallest ? 43.2 : 30 }]))
    assert.equal(vm.runInNewContext(height, sizes), 44, tallest)
  }
  for (const id of controls)
    assert.match(footer, new RegExp("id: " + id + "[\\s\\S]*?height: editorFooter.controlHeight"))
  assert.match(footer, /id: profileFooter\s+anchors.fill: parent/)
  assert.doesNotMatch(footer, /id: openTuiButton/)
  assert.match(footer, /Flow \{\s+id: footerActions/)
  assert.ok(footer.indexOf("Column {") < footer.indexOf("id: profileNameInput"))
  assert.ok(footer.indexOf("id: profileNameInput") < footer.indexOf("id: discardDraftButton"))
  assert.ok(footer.indexOf("id: discardDraftButton") < footer.indexOf("id: saveDraftButton"))
  assert.doesNotMatch(footer, /Math.max\(Style.space\(180\)/)
})

test("new setup actions share preview guards and creation retains the draft", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const available = qml.match(/readonly property bool newSetupAvailable: ([\s\S]*?)\n  readonly property/)[1]
  const root = { profileAutomatic: true, documentReady: true, connectedDisplayCount: 2,
    exactDisplayProfile: null, daemonPreview: null, previewTransaction: "", previewPending: false,
    managedChecked: true, editorReady: true, editPending: false,
    draftProfile: { outputs: [{ key: "a", x: 120 }], workspaces: { strategy: "sequential" } },
    sourceProfile: "", saveName: "" }
  assert.equal(vm.runInNewContext(available, { root }), true)
  for (const [field, value] of [["profileAutomatic", false], ["documentReady", false],
    ["connectedDisplayCount", 0], ["exactDisplayProfile", { name: "Desk" }],
    ["daemonPreview", { profile_name: "TUI preview" }], ["previewTransaction", "preview"],
    ["previewPending", true]]) {
    const previous = root[field]
    root[field] = value
    assert.equal(vm.runInNewContext(available, { root }), false, field)
    root[field] = previous
  }
  let focused = false
  const create = panelFunction("beginCreateProfile", root, {
    Qt: { callLater: fn => fn() }, profileNameInput: { forceActiveFocus: () => { focused = true } }
  })
  const original = JSON.stringify(root.draftProfile)
  root.daemonPreview = { profile_name: "TUI preview" }
  create()
  assert.equal(focused, false)
  root.daemonPreview = null
  create()
  assert.equal(root.creatingProfile, true)
  assert.equal(root.expanded, true)
  assert.equal(root.activePage, "layout")
  assert.equal(root.saveName, "")
  assert.equal(focused, true)
  assert.equal(JSON.stringify(root.draftProfile), original)
  assert.notEqual(root.profileDefaults, root.draftProfile)
})

test("Preview & save requires a manually entered name and stays disabled while busy", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const save = qml.slice(qml.indexOf("id: saveDraftButton"))
  assert.match(save, /text: "Preview & save"/)
  assert.doesNotMatch(save, /Name & save/)
  const enabled = save.match(/enabled: ([\s\S]*?)\n\s+foreground:/)[1]
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
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.18.4", required), false)
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.19.0-rc.0", required), false)
  assert.equal(Model.versionAtLeast("hyprmoncfg " + required, required), true)
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.19.0", required), true)
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
  const state = { statusRevision: 0, pendingContexts: {}, requestSequence: 0, pendingMethods: {}, transactionId: "", profileName: "",
    deadline: "", seconds: 0, stage: "idle", actionPending: false, requestPending: false,
    saveOnCommit: false, draftApply: false, actionError: "", errorMessage: "",
    requestFinished() {}, previewFinished() {} }
  const root = new Proxy(state, {
    set(target, key, value) {
      const changed = target[key] !== value
      target[key] = value
      if (changed && qml.includes("on" + key[0].toUpperCase() + key.slice(1) + "Changed: root.statusRevision++"))
        root.statusRevision++
      return true
    }
  })
  Object.defineProperty(root, "opened", { get: () => root.stage !== "idle" })
  const socket = { connected: true, write(line) { requests.push(JSON.parse(line)) }, flush() {} }
  const context = vm.createContext({ root, Model, IdentifyModel: require("../IdentifyModel.js"), backendSocket: socket,
    identifyOverlay: { clear() {}, show() {} }, Quickshell: { screens: [] },
    identifyTimeout: { restart() {}, stop() {} },
    Hyprland: { focusedMonitor: { name: "eDP-1" } },
    previewClock: { start() {}, stop() {} } })
  vm.runInContext(functions.join("\n") + "\nObject.assign(root, {" + names.join(",") + "})", context)
  return { root, socket, requests, receive(value) { root.handleMessage(JSON.stringify({ protocol_version: 1, ...value })) } }
}

test("successful coordinated save refreshes the editor baseline, failed saves do not", () => {
  for (const statusFirst of [false, true]) {
    const guard = previewGuard()
    let refreshed = 0
    const panel = {previewTransaction:"ours",previewPending:true,
      draftDirty:true,creatingProfile:true, activeProfile:"Desk",
      requestEditorState() { refreshed++ },normalizeWorkspaceCursor() {}}
    panel.clearPreview = panelFunction("clearPreview",panel,{previewTimer:{stop(){}}})
    const qml = fs.readFileSync(path.join(__dirname,"..","Panel.qml"),"utf8")
    const handler = qml.match(/function onPreviewFinished\(\) \{([^}]+)\}/)[1]
    guard.root.previewFinished = () => vm.runInNewContext(handler,{root:panel})
    guard.root.transactionId="ours"
    guard.root.saveOnCommit=true
    guard.root.stage="confirm"
    guard.root.keep()
    const id=guard.requests.at(-1).id
    guard.receive({type:"response",id,error:{message:"disk full"}})
    assert.equal(refreshed,0)
    assert.equal(panel.draftDirty,true)
    assert.equal(guard.root.transactionId,"ours")
    guard.root.keep()
    const retryId=guard.requests.at(-1).id
    if(statusFirst) guard.receive({type:"event",event:"status",data:{daemon:{}}})
    guard.receive({type:"response",id:retryId,result:{}})
    assert.equal(refreshed,1)
    assert.equal(panel.previewTransaction,"")
    panelFunction("updateEditor",panel,{Qt:{callLater(){}}})({
      profile:{name:"Desk",outputs:[]},profiles:[{name:"Desk",outputs:[]}],
      displays:[],source_profile:"Desk",workspace_plan:[]})
    assert.equal(panel.draftDirty,false)
    assert.equal(panel.creatingProfile,false)
    assert.equal(panel.sourceProfile,"Desk")
  }
})

test("the guard defaults to 30 seconds and preserves explicit legacy timeouts", () => {
  for (const [timeout, expected] of [[undefined, 30], [10, 10], [60, 60]]) {
    const guard = previewGuard()
    assert.equal(guard.root.startDraftPreview({ name: "Desk" }, timeout), true)
    assert.equal(guard.requests[0].params.timeout_seconds, expected)
  }
})

test("off and mirrored displays remain individually selectable with honest connection labels", () => {
  const profile = { outputs: [
    { key: "a", name: "Laptop", enabled: true },
    { key: "b", name: "Projector", enabled: false },
    { key: "c", name: "TV", enabled: true, mirror_of: "a" }
  ] }
  assert.deepEqual(Model.nonSpatialDisplays(profile, [{ key: "b" }], true), [
    { key: "b", name: "Projector", state: "Off" },
    { key: "c", name: "TV", state: "Not connected" }
  ])
  assert.equal(Model.nonSpatialDisplays(profile, [], false)[1].state, "Mirrors Laptop")
  assert.deepEqual(Model.nonSpatialDisplays(null, [], true), [])
})

test("profile deletion waits for confirmation and keeps the original target", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const functions = qml.match(/^  function (?:deleteSelectedSavedProfile|confirmProfileDelete)\([\s\S]*?^  }/gm)
  const requests = []
  let opened = false
  const root = { selectedSavedProfileName: "Laptop", previewTransaction: "", previewPending: false,
    send(method, params) { requests.push({ method, params: JSON.parse(JSON.stringify(params)) }) } }
  const context = vm.createContext({ root, deleteConfirmation: { open() { opened = true } } })
  vm.runInContext(functions.join("\n") + "\nObject.assign(root, { deleteSelectedSavedProfile, confirmProfileDelete })", context)
  root.deleteSelectedSavedProfile()
  assert.equal(opened, true)
  assert.equal(requests.length, 0)
  root.selectedSavedProfileName = "Other"
  root.confirmProfileDelete()
  assert.deepEqual(requests, [{ method: "delete", params: { name: "Laptop" } }])
  root.confirmProfileDelete()
  assert.equal(requests.length, 1)
})

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

test("old status and subscribe replies cannot remove a preview recovered from a newer event", () => {
  for (const method of ["status", "subscribe"]) {
    for (const action of ["keep", "revert"]) {
      const guard = previewGuard()
      const id = guard.root.send(method, {})
      const preview = { transaction_id: "recovered", reclaimable: true,
        deadline: new Date(Date.now() + 30000).toISOString() }
      // Events can overtake a slow read; responses on this socket stay ordered.
      guard.receive({ type: "event", event: "status", data: { daemon: { preview } } })
      guard.receive({ type: "response", id, result: { daemon: {} } })
      assert.equal(guard.root.transactionId, "recovered", method)
      assert.equal(guard.root.stage, "confirm", method)
      assert.equal(guard.root[action](), true)
      assert.equal(guard.requests.at(-1).params.transaction_id, "recovered")
    }
  }
})

test("an old status reply cannot resurrect a preview ended by a newer event", () => {
  const guard = previewGuard()
  const preview = { transaction_id: "finished", reclaimable: true }
  guard.receive({ type: "event", event: "status", data: { daemon: { preview } } })
  const id = guard.root.send("status", {})
  guard.receive({ type: "event", event: "status", data: { daemon: {} } })
  guard.receive({ type: "response", id, result: { daemon: { preview } } })
  assert.equal(guard.root.transactionId, "")
  assert.equal(guard.root.opened, false)
})

test("status reads remain usable when no event or preview transition supersedes them", () => {
  const guard = previewGuard()
  const id = guard.root.send("subscribe", {})
  guard.receive({ type: "response", id, result: { daemon: {
    preview: { transaction_id: "current", reclaimable: true }
  } } })
  assert.equal(guard.root.transactionId, "current")
  const settled = guard.root.send("status", {})
  guard.receive({ type: "response", id: settled, result: { daemon: {} } })
  assert.equal(guard.root.opened, false)
})

test("a local preview remains pending when its earlier status read returns in socket order", () => {
  const guard = previewGuard()
  const read = guard.root.send("status", {})
  guard.root.startDraftPreview({ name: "Desk" }, 30)
  const preview = guard.requests.at(-1).id
  guard.receive({ type: "response", id: read, result: { daemon: {} } })
  assert.equal(guard.root.requestPending, true)
  assert.equal(guard.root.stage, "applying")
  guard.receive({ type: "response", id: preview, result: { id: "ours" } })
  assert.equal(guard.root.transactionId, "ours")
  assert.equal(guard.root.stage, "confirm")
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
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.19.0-rc.0", "1.19.0-rc.1"), false)
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.19.0-rc.1", "1.19.0-rc.1"), true)
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.19.0", "1.19.0-rc.1"), true)
  assert.equal(Model.versionAtLeast("hyprmoncfg 1.19.0-beta.9", "1.19.0-rc.1"), false)
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
  assert.equal(Model.displayDetailLabel(displays[0]), "2880x1800@120Hz  1.5x")
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
  assert.equal(Model.displayScaleLayoutLabel(displays[0]), "1.5x = 2560x1440")
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

test("expanded header keeps secondary actions together and setup status in the footer", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const nav = qml.slice(qml.indexOf("id: editorNav"), qml.indexOf("id: previewBanner"))
  assert.doesNotMatch(nav, /Current setup|profileStatusTitle|profileAutomatic/)
  assert.match(nav, /id: openTuiButton[\s\S]*?implicitHeight: identifyAllButton.implicitHeight/)
  assert.match(nav, /id: openTuiButton[\s\S]*?onClicked: root.launchTui\(\)/)
  assert.match(qml, /id: expandedProfileStatus/)
  assert.doesNotMatch(qml, /Best match for this setup/)
})

test("hardware inspector shows every field directly and only Identify is an action", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "MonitorInfo.qml"), "utf8")
  assert.match(qml, /model: root\.info\.basic\.concat\(root\.info\.details\)/)
  assert.doesNotMatch(qml, /detailsExpanded|More details|Less details/)
  assert.equal((qml.match(/Button\s*\{/g) || []).length, 1)
  assert.match(qml, /text: "Identify"/)
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
  assert.match(qml, /label: "2  Workspaces"/)
  assert.match(qml, /label: "3  Profiles"/)
  assert.match(qml, /title: "Monitor Layout"/)
  assert.match(qml, /MonitorInfo \{/)
  assert.doesNotMatch(qml, /title: "Display  -  Color"/)
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

test("monitor information is hardware-only and does not infer maxima from the active mode", () => {
  const info = Model.monitorHardwareInfo({name:"DP-1",model:"Panel",width:1920,height:1080}, {
    available_modes:["1920x1080@240Hz","3840x2160@60Hz","bad"],physical_width:708,physical_height:399
  })
  assert.deepEqual(info.basic.map(row => row.label), ["Connector","Model","Max resolution"])
  assert.equal(info.basic[2].value, "3840x2160")
  assert.equal(info.basic[1].value, "Panel")
  assert.equal(info.details[0].value, '32" (708x399mm)')
  assert.equal(Model.monitorHardwareInfo({}, {physical_width:344,physical_height:215}).details[0].value, '16" (344x215mm)')
  assert.deepEqual(info.details.map(row => row.label), ["Panel size","Type","Serial"])
  const missing = Model.monitorHardwareInfo({width:1920,height:1080}, {})
  assert.equal(missing.basic[2].value, "Not reported")
  assert.doesNotMatch(missing.basic[1].value, /″/)
})

test("Identify uses shared summaries without numbering and rejects sleeping/off/mirrored screens", () => {
  const screen = {name:"DP-2", serialNumber:"two"}
  const doc = {profile:{outputs:[
    {key:"b",name:"DP-2",serial:"two",width:1920,height:1080},
    {key:"a",name:"DP-1",width:1920,height:1080,enabled:false}
  ]},displays:[{key:"a",dpms:true},{key:"b",dpms:true}]}
  const target = Model.identifyTargets(doc,[screen],"")[0]
  assert.equal(target.number, undefined)
  assert.deepEqual(target.summary, Model.displaySummary(doc.profile.outputs[0],doc.displays[1],doc.workspace_plan))
  assert.equal(target.summary.connector,"DP-2")
  assert.equal(Model.identifyTargets(doc,[screen],"a").length,0)
  assert.equal(Model.identifyTargets(doc,[{name:"DP-2",serialNumber:"replacement"}],"b").length,0)
  doc.displays[1].dpms=false
  assert.equal(Model.identifyTargets(doc,[screen],"").length,0)
  doc.displays[1].dpms=true
  doc.profile.outputs[0].mirror_of="a"
  assert.equal(Model.identifyTargets(doc,[screen],"").length,0)
})

test("display summaries keep physical mode separate from canvas geometry", () => {
  const output = {key:"desk", name:"DP-2", model:"Panel", mode:"3840x2160@143.99Hz",
    width:3840,height:2160,scale:1.3333334,x:-2880,y:20}
  const metadata = {key:"desk",physical_width:708,physical_height:399}
  const plan = [{output_key:"desk",workspaces:[1,2,3,4]}]
  const summary = Model.displaySummary(output,metadata,plan)
  assert.equal(summary.model,'Panel 32"')
  assert.equal(summary.mode,"3840x2160@144Hz")
  assert.equal(summary.placement,"Scale 1.33x  Position -2880,20")
  assert.equal(summary.workspaces,"1, 2, 3, 4")
  const card = Model.profileLayoutDisplays({outputs:[output]},[metadata])[0]
  assert.deepEqual(Model.displaySummary(card,metadata,plan),summary)
  assert.equal(Model.displaySummary({}, {}, []).workspaces,"")
  assert.equal(Model.displaySummary({mode:"preferred"}, {}, []).mode,"preferred")
})

test("Identify cannot start while another client owns a preview", () => {
  const guard = previewGuard()
  guard.root.connected = true
  guard.receive({type:"event",event:"status",data:{daemon:{preview:{transaction_id:"tui",reclaimable:false}}}})
  assert.equal(guard.root.identifyDisplays(""),false)
  assert.equal(guard.requests.length,0)
})

test("the workspace form hides irrelevant group size and adapts keyboard navigation", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

  assert.match(qml, /readonly property bool workspaceGroupSizeApplicable: root\.workspaceStrategy === "sequential"/)
  assert.match(qml, /id: workspaceGroupSizeField\s+visible: root\.workspaceGroupSizeApplicable/)
  assert.match(qml, /width: root\.workspaceGroupSizeApplicable\s+\? \(parent\.width - parent\.spacing\) \/ 2 : parent\.width/)
  // Hiding Group Size also removes its keyboard stop; assignment rows move up.
  assert.match(qml, /readonly property int workspacePersistenceKeyboardIndex: root\.workspaceGroupSizeApplicable \? 4 : 3/)
  assert.match(qml, /readonly property int workspaceListKeyboardStart: root\.workspacePersistenceKeyboardIndex \+ 1/)
  assert.match(qml, /root\.workspaceKeyboardIndex === root\.workspaceListKeyboardStart \+ index/)
  assert.doesNotMatch(qml, /root\.workspaceKeyboardIndex === 4 \+ index/)
})

test("the compact profile is stable status with contextual actions, not a selector", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /text: "PROFILE"/)
  assert.match(qml, /id: compactProfileStatus/)
  assert.match(qml, /title: root\.profileStatusTitle/)
  assert.match(qml, /subtitle: root\.profileStatusSubtitle/)
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
  assert.match(qml, /host\.summon\(root\.moduleName, ""\)/)
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

test("reuse keyboard help describes native controls instead of workspace shortcuts", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "KeyboardHelp.qml"), "utf8")
  const body = qml.match(/readonly property var groups: \{([\s\S]*?)\n  \}\n\n  Rectangle/)[1]
  const groups = page => vm.runInNewContext("(function() {" + body + "})()", { root: { page } })
  const reuse = groups("reuse")
  assert.equal(reuse.length, 1)
  assert.equal(reuse[0].title, "Reuse layout")
  assert.ok(reuse[0].bindings.some(binding => binding.keys === "Tab, Shift+Tab"))
  assert.ok(reuse[0].bindings.some(binding => binding.keys === "Esc"))
  for (const page of ["layout", "profiles", "workspaces"])
    assert.ok(groups(page).some(group => group.bindings.some(binding => binding.keys === "1  2  3")))
})

test("manual profile choice is explicit and can return to automatic matching", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /label: "Automatically use the best profile"/)
  assert.equal((qml.match(/Matches your connected displays to your saved profiles/g) || []).length, 1)
  assert.match(qml, /document\.daemon\.profile_override/)
  assert.match(qml, /root\.send\("set_profile_auto", \{ enabled: enabled \}\)/)
  assert.match(qml, /Automatic matching is paused/)
  assert.doesNotMatch(qml, /Turn off automatic profile selection before activating/)
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
  assert.match(panelQml, /text: "Use this profile"/)
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
  assert.match(panelQml, /id: activateFooterButton[\s\S]*?visible: root\.activePage === "profiles"\s+&& !root\.selectedSavedProfileCurrent[\s\S]*?text: "Use this profile"/)
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
  assert.match(canvasQml, /if \(!pressed\) return/)
  assert.match(canvasQml, /if \(!root\.movable\) return/)
  assert.match(canvasQml, /property bool dragStarted: false/)
  assert.match(canvasQml, /var threshold = Style\.space\(6\)/)
  assert.match(canvasQml, /if \(!dragStarted\)/)
  assert.doesNotMatch(canvasQml, /card\.dragOffsetX = mouse\.x - originX/)
})

test("hardware brightness stays in compact mode, outside the profile editor", () => {
  const panelQml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const brightnessQml = fs.readFileSync(path.join(__dirname, "..", "BrightnessControl.qml"), "utf8")

  assert.match(panelQml, /Model\.brightnessTarget\(root\.draftProfile,/)
  assert.match(panelQml, /\["omarchy-brightness-display", "--monitor", connector\]/)
  assert.match(panelQml, /"--no-osd", "--monitor", connector, percent \+ "%"/)
  assert.equal((panelQml.match(/BrightnessControl \{/g) || []).length, 1)
  assert.ok(panelQml.indexOf("BrightnessControl {") < panelQml.indexOf('text: "MONITOR MANAGEMENT"'))
  assert.doesNotMatch(panelQml, /omarchy-brightness-keyboard/)
  assert.match(brightnessQml, /text: "Brightness"/)
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
  assert.match(qml, /if \(!root\.managedChecked \|\| root\.reusePending\) return\s+var name = root\.draftName\(\)/)
  assert.match(qml, /enabled: root\.managedChecked && !!root\.selectedOutput/)
  assert.match(qml, /enabled: root\.managedChecked\s+opacity: root\.managedChecked \? 1\.0 : root\.unmanagedOpacity/)
  assert.match(qml, /if \(!root.managedChecked\) return "Not managed by hyprmoncfg"/)
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
  assert.match(qml, /if \(root.exactDisplayProfileName !== ""\) return displays/)
  assert.match(qml, /return "No saved profile matches these displays"/)
})

test("hotplug and enable changes invalidate the editor snapshot without focus churn", () => {
  const laptop = { name: "eDP-1", enabled: true, focused: true, x: 0, y: 0 }
  const external = { name: "DP-2", enabled: false, focused: false, x: 1600, y: 0 }
  const connected = Model.monitorStateSignature([laptop, external])
  assert.notEqual(Model.monitorStateSignature([laptop]), connected)
  assert.notEqual(Model.monitorStateSignature([laptop, { ...external, enabled: true }]), connected)
  assert.notEqual(Model.monitorStateSignature([laptop, { ...external, x: 2000 }]), connected)
  assert.equal(Model.monitorStateSignature([{ ...external, focused: true }, { ...laptop, focused: false }]), connected)
  assert.equal(laptop.focused, true)
  assert.equal(Model.monitorStateSignature(undefined), "[]")
})

function editorRefreshPanel() {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const timer = qml.slice(qml.indexOf("id: editorRefreshTimer"))
  const running = timer.match(/running: ([\s\S]*?)\n    onTriggered:/)[1]
  const trigger = timer.match(/onTriggered: ([^\n]+)/)[1]
  const blocked = qml.match(/readonly property bool editorRefreshBlocked: ([\s\S]*?)\n  (?:readonly )?property/)[1]
  const requests = []
  const packets = []
  const profile = { name: "Current", outputs: [
    { key: "laptop", enabled: true, scale: 1.5 }, { key: "desk", enabled: true, scale: 1 }
  ] }
  const result = { profile, source_profile: "Current", suggested_profile: "Current",
    displays: [{ key: "laptop", focused: true }, { key: "desk" }],
    profiles: [profile, { name: "Other", outputs: [{ key: "desk", enabled: true, scale: 2 }] }],
    workspace_plan: [] }
  const state = {
    document: { monitors: [{ name: "eDP-1", enabled: true }] },
    documentReady: true, backendConnected: true, opened: true,
    editorRefreshQueued: false, editorResetQueued: false, editorLoading: false, draftDirty: false,
    statusRevision: 0, monitorTopologyRevision: 0, editorRetry: false, statusRetry: false, displaysConnecting: false,
    reusePending: false, reuseTopologyChanged: false, reuseGeneration: 0,
    creatingProfile: false, editPending: false, previewTransaction: "",
    previewPending: false, serviceActionPending: false, profileModePending: false,
    execEditing: false, inputBlocked: false, editorInteractionRevision: 0, editorPreviewRevision: 0,
    managedChecked: true, editorReady: true, activePage: "layout", activeProfile: "Current",
    selectedOutputKey: "laptop", selectedSavedProfileName: "Current", profileChoice: "Current",
    sourceProfile: "Current", saveName: "Current", selectedSavedWorkspacePlan: [],
    editorDocument: Model.clone(result), draftProfile: Model.clone(profile),
    requestSequence: 0, pendingMethods: {}, pendingContexts: {},
    syncDaemonPreview() {},
    normalizeWorkspaceCursor() {}, ensureManualWorkspaceRules() {}
  }
  // Execute the real QML property-change handlers when our fake root changes.
  // This preserves transient input changes that begin and end before a reply.
  const changedHandlers = {}
  let readBlocked = () => false
  let readPreviewBlocked = () => false
  const root = new Proxy(state, {
    set(target, key, value) {
      const before = readBlocked()
      const previewBefore = readPreviewBlocked()
      const changed = target[key] !== value
      target[key] = value
      if (changed && changedHandlers[key]) changedHandlers[key]()
      if (readBlocked() !== before && changedHandlers.editorRefreshBlocked)
        changedHandlers.editorRefreshBlocked()
      if (readPreviewBlocked() !== previewBefore && changedHandlers.identifyBlockedByPreview)
        changedHandlers.identifyBlockedByPreview()
      return true
    }
  })
  const keyCatcher = { get blocked() { return root.inputBlocked || root.execEditing } }
  readBlocked = vm.runInNewContext("(function() { return " + blocked + " })", { root, keyCatcher })
  for (const match of qml.matchAll(/^  on(\w+)Changed: (.+)$/gm)) {
    if (!/root\.(?:editorInteractionRevision|statusRevision|editorPreviewRevision)\+\+/.test(match[2])) continue
    const name = match[1][0].toLowerCase() + match[1].slice(1)
    changedHandlers[name] = vm.runInNewContext("(function() { " + match[2] + " })", { root })
  }
  Object.defineProperty(root, "editorRefreshBlocked", { get: () => readBlocked() })
  const previewBlocked = qml.match(/readonly property bool identifyBlockedByPreview: ([\s\S]*?)\n  onIdentifyBlockedByPreviewChanged:/)[1]
  readPreviewBlocked = vm.runInNewContext("(function() { return " + previewBlocked + " })", { root })
  Object.defineProperty(root, "identifyBlockedByPreview", { get: () => readPreviewBlocked() })
  Object.defineProperty(root, "daemonPreview", { get: () => (root.document.daemon || {}).preview || null })
  const previewChanged = qml.match(/onIdentifyBlockedByPreviewChanged: \{([\s\S]*?)\n  }/)[1]
  changedHandlers.identifyBlockedByPreview = vm.runInNewContext("(function() { " + previewChanged + " })", { root })
  for (const property of ["readPending", "editorPreviewBlocked", "editorSnapshotStale"]) {
    const expression = qml.match(new RegExp("readonly property bool " + property
      + ": ([\\s\\S]*?)\\n  (?:readonly )?property"))[1]
    const get = vm.runInNewContext("(function() { return " + expression + " })", { root, Model })
    Object.defineProperty(root, property, { get })
  }
  Object.defineProperty(root, "monitorSummaries", { get: () => root.document.monitors })
  Object.defineProperty(root, "selectedSavedProfile", {
    get: () => Model.savedProfileByName(root.editorDocument, root.selectedSavedProfileName)
  })
  Object.defineProperty(root, "savedProfiles", { get: () => root.editorDocument.profiles })
  const globals = { Array, Reuse: require('../LayoutReuse.js'), Qt: { callLater() {} },
    reusePane: { choose() {}, reset() {}, focusFirst() {} },
    backendSocket: { connected: true, flush() {}, write(line) {
      const packet = JSON.parse(line)
      packets.push(packet)
      requests.push(packet.method)
    } }, previewTimer: { start() {}, stop() {} } }
  for (const name of ["send", "updateDocument", "queueEditorRefresh", "requestEditorState", "updateEditor", "handleMessage",
    "retryConnectingDisplays", "openLayoutReuse", "reuseLayout", "acceptReusedLayout", "open",
    "changeWorkspaceStrategy", "editWorkspaces", "editDraft", "beginCreateProfile", "loadSelectedSavedProfile", "selectSavedProfile", "beginExecEdit"])
    root[name] = panelFunction(name, root, globals)
  return {
    root, requests, packets, result,
    receive(id, value = result) {
      root.handleMessage(JSON.stringify({ protocol_version: 1, type: "response", id, result: value }))
    },
    fail(id) {
      root.handleMessage(JSON.stringify({ protocol_version: 1, type: "response", id,
        error: { code: "compositor_busy", message: "Displays are still connecting; try again shortly." } }))
    },
    tick() {
      if (vm.runInNewContext(running, { root }))
        vm.runInNewContext(trigger, { root })
    },
    hotplug() {
      root.updateDocument({ monitors: [...root.monitorSummaries, { name: "DP-2", enabled: true }] })
    }
  }
}

test("status and subscribe replies cannot overwrite a newer topology event or restart failed recovery", () => {
  for (const method of ["status", "subscribe"]) {
    for (const error of [false, true]) {
      const panel = editorRefreshPanel()
      panel.root.statusRetry = true
      panel.root.editorRetry = true
      const old = Model.clone(panel.root.document)
      const id = panel.root.send(method, {})
      const current = { monitors: [...old.monitors, { name: "DP-3", enabled: true }], monitor_set_hash: "replacement" }
      panel.root.handleMessage(JSON.stringify({ protocol_version: 1, type: "event", event: "status", data: current }))
      if (error) panel.fail(id)
      else panel.receive(id, old)
      assert.deepEqual(panel.root.document, current, method)
      assert.equal(panel.root.statusRetry, false, "an obsolete error cannot undo successful recovery")
      assert.equal(panel.root.displaysConnecting, false)
      assert.equal(panel.root.pendingMethods[id], undefined)
      assert.equal(panel.root.pendingContexts[id], undefined)
      panel.tick()
      assert.equal(panel.packets.at(-1).method, "editor_state")
      panel.receive(panel.packets.at(-1).id, { ...panel.result, monitor_set_hash: "replacement" })
      assert.equal(panel.root.editorSnapshotStale, false)
    }
  }
})

test("stale subscribe acknowledgements still initialize the editor after a same-topology event", () => {
  for (const retained of ["none", "draftDirty", "creatingProfile"]) {
    for (const error of [false, true]) {
      const panel = editorRefreshPanel()
      panel.root.editorReady = false // Disconnect retains the last status document.
      if (retained !== "none") panel.root[retained] = true
      const id = panel.root.send("subscribe", {})
      const current = { monitors: panel.root.monitorSummaries, daemon: { profile_override: "Current" } }
      panel.root.handleMessage(JSON.stringify({ protocol_version: 1, type: "event", event: "status", data: current }))
      assert.equal(panel.root.editorRefreshQueued, false, "unchanged topology needs no normal refresh")
      if (error) panel.fail(id)
      else panel.receive(id, { monitors: [] })
      assert.deepEqual(panel.root.document, current)
      panel.tick()
      assert.deepEqual(panel.requests, ["subscribe", "editor_state"])
      assert.equal(panel.root.pendingContexts[panel.packets[1].id].automaticEditorRefresh, false)
      panel.receive(panel.packets[1].id)
      assert.equal(panel.root.editorReady, true)
      assert.equal(panel.root.draftDirty, false)
      assert.equal(panel.root.creatingProfile, false)
      assert.equal(panel.root.statusRetry, false)
      panel.tick()
      assert.equal(panel.packets.length, 2)
    }
  }
})

test("stale subscribe acknowledgements leave an already loading or ready editor alone", () => {
  for (const ready of [false, true]) {
    const panel = editorRefreshPanel()
    panel.root.editorReady = ready
    panel.root.editorLoading = !ready
    panel.root.draftDirty = true
    const draft = panel.root.draftProfile
    const subscribeId = panel.root.send("subscribe", {})
    panel.root.updateDocument({ monitors: panel.root.monitorSummaries })
    panel.receive(subscribeId, { monitors: [] })
    assert.equal(panel.root.editorRefreshQueued, false)
    assert.equal(panel.root.editorResetQueued, false)
    panel.tick()
    assert.deepEqual(panel.requests, ["subscribe"])
    assert.equal(panel.root.draftProfile, draft)
    assert.equal(panel.root.draftDirty, true)
    assert.equal(panel.root.editorLoading, !ready)
  }
})

test("subscribe recovery defers initial reads through previews and leaves closed panels alone", () => {
  for (const blocker of ["previewPending", "closed"]) {
    const panel = editorRefreshPanel()
    panel.root.editorReady = false
    if (blocker === "closed") panel.root.opened = false
    else panel.root[blocker] = true
    const draft = panel.root.draftProfile
    const id = panel.root.send("subscribe", {})
    panel.root.updateDocument({ monitors: panel.root.monitorSummaries })
    panel.receive(id, { monitors: [] })
    panel.tick()
    assert.deepEqual(panel.requests, ["subscribe"], blocker)
    assert.equal(panel.root.draftProfile, draft, blocker)
    assert.equal(panel.root.editorResetQueued, blocker !== "closed", blocker)
    assert.equal(panel.root.editorRefreshQueued, blocker !== "closed", blocker)
    if (blocker === "previewPending") {
      panel.root.previewPending = false
      panel.tick()
      panel.receive(panel.packets[1].id)
      assert.equal(panel.root.editorReady, true)
    }
  }
})

test("coordinator preview transitions invalidate panel status reads on its separate socket", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  for (const signal of ["TransactionId", "RequestPending", "ActionPending"]) {
    const panel = editorRefreshPanel()
    const current = panel.root.document
    const id = panel.root.send("status", {})
    const handler = (qml.match(new RegExp("function on" + signal + "Changed\\(\\) \\{([^}]+)\\}")) || [])[1] || ""
    vm.runInNewContext(handler, { root: panel.root })
    panel.receive(id, { monitors: [], daemon: {} })
    assert.equal(panel.root.document, current, signal)
  }
})

test("hotplug refresh stays queued through draft editing and previews without replacing the draft", () => {
  const blockers = {
    draftDirty: true, creatingProfile: true, editPending: true,
    previewTransaction: "pending-preview", previewPending: true, opened: false,
    execEditing: true, inputBlocked: true, profileModePending: true
  }
  for (const [property, blocked] of Object.entries(blockers)) {
    const panel = editorRefreshPanel()
    const previous = panel.root[property]
    const draft = Model.clone(panel.root.draftProfile)
    panel.root[property] = blocked
    panel.hotplug()
    panel.tick()
    assert.equal(panel.root.editorRefreshQueued, true, property)
    assert.deepEqual(panel.requests, [], property)
    assert.deepEqual(panel.root.draftProfile, draft, property)
    panel.root[property] = previous
    panel.tick()
    assert.deepEqual(panel.requests, ["editor_state"], property)
    assert.equal(panel.root.editorRefreshQueued, false, property)
    assert.equal(panel.root.editorLoading, true, property)
    assert.deepEqual(panel.root.draftProfile, draft, property)
  }
})

test("hotplug during an in-flight editor read gets one follow-up while focus changes get none", () => {
  const panel = editorRefreshPanel()
  panel.root.requestEditorState()
  panel.hotplug()
  panel.tick()
  panel.tick()
  assert.equal(panel.root.editorRefreshQueued, true)
  assert.deepEqual(panel.requests, ["editor_state"])
  panel.receive(panel.packets[0].id)
  panel.tick()
  panel.tick()
  assert.deepEqual(panel.requests, ["editor_state", "editor_state"])
  assert.equal(panel.root.editorRefreshQueued, false)
  panel.receive(panel.packets[1].id)
  panel.root.updateDocument({ monitors: panel.root.monitorSummaries.toReversed().map(
    monitor => ({ ...monitor, focused: monitor.name === "DP-2" })
  ) })
  panel.tick()
  assert.equal(panel.root.editorRefreshQueued, false)
  assert.deepEqual(panel.requests, ["editor_state", "editor_state"])
})

test("late automatic replies preserve a newer edited draft, new profile, or loaded saved profile", () => {
  for (const interaction of ["edit", "create", "load"]) {
    const panel = editorRefreshPanel()
    panel.hotplug()
    panel.tick()
    const automaticId = panel.packets[0].id
    if (interaction === "edit") {
      panel.root.editDraft({ output_key: "laptop", scale: 1.75 })
      const edited = Model.clone(panel.root.draftProfile)
      edited.outputs[0].scale = 1.75
      panel.receive(panel.packets[1].id, { profile: edited, workspace_plan: [] })
    } else if (interaction === "create") {
      panel.root.beginCreateProfile()
      panel.root.saveName = "New desk"
    } else {
      panel.root.selectedSavedProfileName = "Other"
      panel.root.loadSelectedSavedProfile()
    }
    const newer = Model.clone({ draftProfile: panel.root.draftProfile,
      sourceProfile: panel.root.sourceProfile, saveName: panel.root.saveName,
      draftDirty: panel.root.draftDirty, creatingProfile: panel.root.creatingProfile })
    panel.receive(automaticId)
    assert.deepEqual(Model.clone({ draftProfile: panel.root.draftProfile,
      sourceProfile: panel.root.sourceProfile, saveName: panel.root.saveName,
      draftDirty: panel.root.draftDirty, creatingProfile: panel.root.creatingProfile }), newer, interaction)
    assert.equal(panel.root.editorLoading, false, interaction)
    assert.equal(panel.root.editorRefreshQueued, true, interaction)
    const count = panel.packets.length
    panel.tick()
    assert.equal(panel.packets.length, count, interaction)
  }
})

test("automatic replies wait for input and remember a preview that ended before its reply", () => {
  for (const interaction of ["editPending", "inputBlocked", "execEditing", "profileModePending", "previewPending"]) {
    const panel = editorRefreshPanel()
    panel.hotplug()
    panel.tick()
    const draft = panel.root.draftProfile
    panel.root[interaction] = true
    if (interaction === "previewPending") panel.root.previewPending = false
    panel.receive(panel.packets[0].id)
    assert.equal(panel.root.draftProfile, draft, interaction)
    assert.equal(panel.root.editorLoading, false, interaction)
    assert.equal(panel.root.editorRefreshQueued, true, interaction)
    panel.root[interaction] = false
    panel.tick()
    panel.receive(panel.packets.at(-1).id)
    assert.equal(panel.root.editorRefreshQueued, false, interaction)
    assert.equal(panel.root.editorLoading, false, interaction)
  }
})

test("requeued automatic reads keep clean profile and output selections when they still exist", () => {
  const panel = editorRefreshPanel()
  panel.hotplug()
  panel.tick()
  panel.root.selectSavedProfile(1)
  panel.root.selectedOutputKey = "desk"
  panel.root.profileChoice = "Other"
  panel.receive(panel.packets[0].id)
  assert.equal(panel.root.editorRefreshQueued, true)
  assert.equal(panel.root.selectedSavedProfileName, "Other")
  panel.tick()
  panel.receive(panel.packets[1].id)
  assert.equal(panel.root.editorRefreshQueued, false)
  assert.equal(panel.root.selectedSavedProfileName, "Other")
  assert.equal(panel.root.selectedOutputKey, "desk")
  assert.equal(panel.root.profileChoice, "Other")

  panel.root.editorRefreshQueued = true
  panel.tick()
  const reduced = Model.clone(panel.result)
  reduced.profiles = reduced.profiles.filter(profile => profile.name !== "Other")
  reduced.profile.outputs = reduced.profile.outputs.filter(output => output.key !== "desk")
  panel.receive(panel.packets.at(-1).id, reduced)
  assert.equal(panel.root.selectedSavedProfileName, "Current")
  assert.equal(panel.root.selectedOutputKey, "laptop")
})

test("intentional editor refreshes retain upstream's discard and default-selection behavior", () => {
  const panel = editorRefreshPanel()
  panel.root.selectedSavedProfileName = "Other"
  panel.root.loadSelectedSavedProfile()
  panel.root.selectedOutputKey = "desk"
  panel.root.requestEditorState()
  assert.equal(panel.root.pendingContexts[panel.packets[0].id].automaticEditorRefresh, false)
  panel.receive(panel.packets[0].id)
  assert.equal(panel.root.draftDirty, false)
  assert.equal(panel.root.selectedSavedProfileName, "Current")
  assert.equal(panel.root.selectedOutputKey, "laptop")
  assert.equal(panel.root.draftProfile.name, "Current")
})

test("explicit editor replies wait across starting, active, and completed previews before resetting", () => {
  for (const stage of ["starting", "active", "completed"]) {
    const panel = editorRefreshPanel()
    const previewDraft = Model.clone(panel.root.draftProfile)
    previewDraft.outputs[0].scale = 2
    panel.root.draftProfile = previewDraft
    panel.root.draftDirty = true
    panel.root.requestEditorState()
    const originalRead = panel.packets[0].id
    panel.root.previewPending = true
    if (stage !== "starting") {
      panel.root.previewTransaction = "new-preview"
      panel.root.previewPending = false
    }
    if (stage === "completed") panel.root.previewTransaction = ""
    panel.receive(originalRead)
    assert.equal(panel.root.draftProfile, previewDraft, stage)
    assert.equal(panel.root.draftDirty, true, stage)
    assert.equal(panel.root.editorLoading, false, stage)
    assert.equal(panel.root.editorResetQueued, true, stage)
    if (stage !== "completed") {
      panel.tick()
      assert.equal(panel.packets.length, 1, stage)
    }
    panel.root.previewPending = false
    panel.root.previewTransaction = ""
    panel.tick()
    assert.equal(panel.packets.length, 2, stage)
    assert.equal(panel.root.pendingContexts[panel.packets[1].id].automaticEditorRefresh, false, stage)
    panel.receive(panel.packets[1].id)
    assert.equal(panel.root.draftDirty, false, stage)
    assert.equal(panel.root.editorResetQueued, false, stage)
  }
})

test("coordinator transitions supersede explicit editor reads on the panel's separate socket", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  for (const property of ["transactionId", "requestPending", "actionPending"]) {
    for (const completed of [false, true]) {
      const panel = editorRefreshPanel()
      panel.root.previewCoordinator = { transactionId: "", requestPending: false, actionPending: false }
      panel.root.draftDirty = true
      panel.root.requestEditorState()
      const draft = panel.root.draftProfile
      const signal = property[0].toUpperCase() + property.slice(1)
      const handler = qml.match(new RegExp("function on" + signal + "Changed\\(\\) \\{([^}]+)\\}"))[1]
      panel.root.previewCoordinator[property] = property === "transactionId" ? "coordinated" : true
      vm.runInNewContext(handler, { root: panel.root })
      if (completed) {
        panel.root.previewCoordinator[property] = property === "transactionId" ? "" : false
        vm.runInNewContext(handler, { root: panel.root })
      }
      panel.receive(panel.packets[0].id)
      assert.equal(panel.root.draftProfile, draft, property)
      assert.equal(panel.root.draftDirty, true, property)
      assert.equal(panel.root.editorResetQueued, true, property)
      if (!completed) {
        panel.tick()
        assert.equal(panel.packets.length, 1, property)
      }
      panel.root.previewCoordinator[property] = property === "transactionId" ? "" : false
      vm.runInNewContext(handler, { root: panel.root })
      panel.tick()
      assert.equal(panel.packets.length, 2, property)
      panel.receive(panel.packets[1].id)
      assert.equal(panel.root.draftDirty, false, property)
    }
  }
})

test("explicit resets requested during preview retain intent without starting an editor read", () => {
  for (const blocker of ["previewPending", "previewTransaction", "coordinator"]) {
    const panel = editorRefreshPanel()
    panel.root.draftDirty = true
    if (blocker === "coordinator") panel.root.previewCoordinator = { requestPending: true }
    else panel.root[blocker] = blocker === "previewTransaction" ? "active" : true
    panel.root.requestEditorState()
    assert.equal(panel.packets.length, 0, blocker)
    assert.equal(panel.root.editorResetQueued, true, blocker)
    panel.root.previewPending = false
    panel.root.previewTransaction = ""
    panel.root.previewCoordinator = null
    panel.tick()
    assert.equal(panel.packets.length, 1, blocker)
    panel.receive(panel.packets[0].id)
    assert.equal(panel.root.draftDirty, false, blocker)
  }
})

test("ordinary status updates do not invalidate a pending editor snapshot", () => {
  for (const automatic of [false, true]) {
    const panel = editorRefreshPanel()
    panel.root.requestEditorState(automatic)
    panel.root.updateDocument({ monitors: panel.root.monitorSummaries })
    panel.receive(panel.packets[0].id)
    assert.equal(panel.root.editorLoading, false)
    assert.equal(panel.root.editorRefreshQueued, false)
    panel.tick()
    assert.equal(panel.packets.length, 1)
  }
})

test("summoning an open panel preserves drafts and input, while reopening issues one reset", () => {
  for (const interaction of ["draftDirty", "creatingProfile", "inputBlocked"]) {
    const panel = editorRefreshPanel()
    panel.root[interaction] = true
    panel.root.checkInstallation = () => {}
    panel.root.controller = { show() {} }
    panel.root.open()
    assert.deepEqual(panel.requests, [], interaction)
    assert.equal(panel.root.editorResetQueued, false, interaction)
  }
  const panel = editorRefreshPanel()
  panel.root.opened = false
  panel.root.draftDirty = true
  panel.root.checkInstallation = () => {}
  panel.root.controller = { show() {
    panel.root.opened = true
    // The actual onOpenedChanged lifecycle handler requests the reset.
    panel.root.requestEditorState()
  } }
  panel.root.open()
  assert.deepEqual(panel.requests, ["editor_state"])
  assert.equal(panel.root.editorResetQueued, false)
  panel.receive(panel.packets[0].id)
  assert.equal(panel.root.draftDirty, false)
  panel.tick()
  assert.equal(panel.packets.length, 1)
})

test("Discard keeps its reset intent behind a pending status or automatic editor read", () => {
  for (const pending of ["status", "editor_state"]) {
    const panel = editorRefreshPanel()
    if (pending === "status") panel.root.send("status", {})
    else panel.root.requestEditorState(true)
    panel.root.draftDirty = true
    const draft = panel.root.draftProfile
    panel.root.requestEditorState()
    assert.equal(panel.root.readPending, true, pending)
    assert.equal(panel.root.editorResetQueued, true, pending)
    panel.tick()
    assert.equal(panel.packets.length, 1, pending)
    panel.receive(panel.packets[0].id, pending === "status"
      ? { monitors: panel.root.monitorSummaries } : panel.result)
    assert.equal(panel.root.draftProfile, draft, pending)
    panel.tick()
    assert.equal(panel.packets.length, 2, pending)
    assert.equal(panel.root.pendingContexts[panel.packets[1].id].automaticEditorRefresh, false, pending)
    panel.receive(panel.packets[1].id)
    assert.equal(panel.root.draftDirty, false, pending)
    assert.equal(panel.root.editorResetQueued, false, pending)
  }
})

test("a timed-out explicit reset retries status first and then discards the dirty draft", () => {
  const panel = editorRefreshPanel()
  panel.root.draftDirty = true
  panel.root.requestEditorState()
  panel.fail(panel.packets[0].id)
  assert.equal(panel.root.editorResetQueued, true)
  panel.tick()
  assert.deepEqual(panel.requests, ["editor_state"])
  panel.root.retryConnectingDisplays()
  assert.deepEqual(panel.requests, ["editor_state", "status"])
  panel.receive(panel.packets[1].id, { monitors: panel.root.monitorSummaries })
  panel.tick()
  assert.deepEqual(panel.requests, ["editor_state", "status", "editor_state"])
  panel.receive(panel.packets[2].id)
  assert.equal(panel.root.draftDirty, false)
  assert.equal(panel.root.editorRetry, false)
  assert.equal(panel.root.editorSnapshotStale, false)
})

test("busy errors retain recovery even when interaction invalidates an automatic response", () => {
  const panel = editorRefreshPanel()
  panel.root.requestEditorState(true)
  panel.root.draftDirty = true
  panel.fail(panel.packets[0].id)
  assert.equal(panel.root.statusRetry, true)
  assert.equal(panel.root.editorRetry, true)
  assert.equal(panel.root.editorResetQueued, false)
  panel.root.retryConnectingDisplays()
  panel.receive(panel.packets[1].id, { monitors: panel.root.monitorSummaries })
  panel.tick()
  panel.root.retryConnectingDisplays()
  assert.deepEqual(panel.requests, ["editor_state", "status"])
  assert.equal(panel.root.draftDirty, true)
})

test("automatic replies from before a topology change cannot replace layout or reuse snapshots", () => {
  for (const page of ["layout", "reuse"]) {
    const panel = editorRefreshPanel()
    panel.hotplug()
    if (page === "reuse") panel.root.openLayoutReuse()
    panel.tick()
    const draft = panel.root.draftProfile
    const monitors = Model.clone(panel.root.monitorSummaries)
    const revision = panel.root.monitorTopologyRevision
    // Include A -> B -> A: matching final signatures must not revive the read.
    panel.root.updateDocument({ monitors: [...monitors, { name: "DP-3", enabled: true }] })
    panel.root.updateDocument({ monitors })
    assert.equal(panel.root.monitorTopologyRevision, revision + 2)
    panel.receive(panel.packets[0].id)
    assert.equal(panel.root.draftProfile, draft, page)
    assert.equal(panel.root.editorRefreshQueued, true, page)
    if (page === "reuse") assert.equal(panel.root.reuseTopologyChanged, true)
    panel.tick()
    assert.equal(panel.packets.length, 2, page)
    panel.receive(panel.packets[1].id)
    assert.equal(panel.root.editorSnapshotStale, false, page)
    assert.equal(panel.root.reuseTopologyChanged, false, page)
  }
})

test("opening reuse after an editor timeout refreshes the editor even when status is unchanged", () => {
  const panel = editorRefreshPanel()
  panel.hotplug()
  panel.tick()
  panel.fail(panel.packets[0].id)
  panel.root.openLayoutReuse()
  assert.equal(panel.root.reuseTopologyChanged, true)
  assert.equal(panel.root.editorSnapshotStale, true)
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  assert.deepEqual(panel.requests, ["editor_state"])
  panel.root.retryConnectingDisplays()
  panel.receive(panel.packets[1].id, { monitors: panel.root.monitorSummaries })
  panel.tick()
  assert.deepEqual(panel.requests, ["editor_state", "status", "editor_state"])
  panel.receive(panel.packets[2].id)
  assert.equal(panel.root.editorSnapshotStale, false)
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  assert.equal(panel.packets.at(-1).method, "reuse_profile")
})

test("newer editor hardware identity refreshes missing status before retrying", () => {
  const panel = editorRefreshPanel()
  panel.root.document.monitor_set_hash = "old-unit"
  panel.root.editorDocument.monitor_set_hash = "old-unit"
  panel.root.requestEditorState(true)
  const draft = panel.root.draftProfile
  const replacement = { ...panel.result, monitor_set_hash: "replacement-unit" }
  panel.receive(panel.packets[0].id, replacement)
  assert.equal(panel.root.draftProfile, draft)
  assert.equal(panel.root.statusRetry, true)
  panel.tick()
  assert.equal(panel.packets.length, 1)
  panel.root.retryConnectingDisplays()
  panel.receive(panel.packets[1].id, { monitors: panel.root.monitorSummaries,
    monitor_set_hash: "replacement-unit" })
  panel.tick()
  panel.receive(panel.packets[2].id, replacement)
  assert.equal(panel.root.editorDocument.monitor_set_hash, "replacement-unit")
  assert.equal(panel.root.editorSnapshotStale, false)
})

test("reuse rejects a different hardware unit on the same connector and recovers through fresh status", () => {
  const panel = editorRefreshPanel()
  panel.root.document.monitor_set_hash = "old-unit"
  panel.root.editorDocument.monitor_set_hash = "old-unit"
  panel.root.openLayoutReuse()
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  const draft = panel.root.draftProfile
  panel.receive(panel.packets[0].id, { profile: panel.result.profile, monitor_set_hash: "replacement-unit" })
  assert.equal(panel.root.draftProfile, draft)
  assert.equal(panel.root.draftDirty, false)
  assert.equal(panel.root.statusRetry, true)
  assert.equal(panel.root.reuseTopologyChanged, true)
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  assert.equal(panel.packets.length, 1)
  panel.root.retryConnectingDisplays()
  panel.receive(panel.packets[1].id, { monitors: panel.root.monitorSummaries, monitor_set_hash: "replacement-unit" })
  panel.tick()
  panel.receive(panel.packets[2].id, { ...panel.result, monitor_set_hash: "replacement-unit" })
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  panel.receive(panel.packets[3].id, { profile: panel.result.profile, monitor_set_hash: "replacement-unit" })
  assert.equal(panel.root.draftDirty, true)
  assert.equal(panel.root.creatingProfile, true)
})

test("reuse rejects observed A to B to A topology changes even when hashes and signatures match again", () => {
  const panel = editorRefreshPanel()
  panel.root.openLayoutReuse()
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  const monitors = Model.clone(panel.root.monitorSummaries)
  panel.hotplug()
  panel.root.updateDocument({ monitors })
  panel.receive(panel.packets[0].id, { profile: panel.result.profile })
  assert.equal(panel.root.draftDirty, false)
  assert.equal(panel.root.reuseTopologyChanged, true)
  assert.equal(panel.root.editorRefreshQueued, true)
})

test("reuse identification waits for pending requests and complete timeout recovery", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const paneQml = fs.readFileSync(path.join(__dirname, "..", "LayoutReusePane.qml"), "utf8")
  const busy = qml.slice(qml.indexOf("id: reusePane"))
    .match(/busy: ([\s\S]*?)\n            statusMessage:/)[1]
  const enabled = paneQml.slice(paneQml.indexOf("id: identifyButton"))
    .match(/enabled: ([^\n]+)/)[1]
  const panel = editorRefreshPanel()
  const pane = { identifyAvailable: true, mapping: { laptop: "laptop" } }
  Object.defineProperty(pane, "busy", {
    get: vm.runInNewContext("(function() { return " + busy + " })", { root: panel.root })
  })
  const identifyEnabled = vm.runInNewContext("(function() { return " + enabled + " })", {
    root: pane, parent: { parent: { modelData: { key: "laptop" } } }
  })
  panel.root.openLayoutReuse()
  assert.equal(identifyEnabled(), true)
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  assert.equal(identifyEnabled(), false, "an in-flight reuse must disable identification")
  panel.fail(panel.packets[0].id)
  assert.equal(panel.root.editorRetry, true)
  assert.equal(panel.root.reuseTopologyChanged, true)
  assert.equal(identifyEnabled(), false, "a failed query leaves the assignment stale")
  panel.root.retryConnectingDisplays()
  assert.equal(identifyEnabled(), false, "status recovery is still in flight")
  panel.receive(panel.packets[1].id, { monitors: panel.root.monitorSummaries })
  assert.equal(identifyEnabled(), false, "status alone cannot refresh the editor assignment")
  panel.root.reuseLayout("Current", { laptop: "laptop" })
  assert.equal(panel.packets.length, 2)
  panel.tick()
  assert.equal(panel.packets[2].method, "editor_state")
  assert.equal(identifyEnabled(), false, "editor recovery is still in flight")
  panel.receive(panel.packets[2].id)
  assert.equal(identifyEnabled(), true, "a current assignment can be identified again")
  pane.mapping = { laptop: "" }
  assert.equal(identifyEnabled(), false, "an omitted saved display cannot be identified")
})

test("reuse waits for a foreign or coordinated preview without claiming its transaction", () => {
  for (const owner of ["foreign", "coordinator", "local"]) {
    const panel = editorRefreshPanel()
    const pending = { transaction_id: "other-client", reclaimable: false }
    if (owner === "foreign") {
      panel.root.syncDaemonPreview = panelFunction("syncDaemonPreview", panel.root)
      panel.root.updateDocument({ ...panel.root.document, daemon: { preview: pending } })
      assert.equal(panel.root.previewTransaction, "", "a live foreign preview is not adopted")
    } else if (owner === "coordinator") panel.root.previewCoordinator = { opened: true }
    else panel.root.previewPending = true
    panel.root.openLayoutReuse()
    assert.equal(panel.root.activePage, "layout", owner)
    panel.root.reuseLayout("Current", { laptop: "laptop" })
    assert.deepEqual(panel.requests, [], owner)
    assert.equal(panel.root.reusePending, false, owner)
    // Also protect a result at the acceptance boundary, independently of signals.
    const draft = panel.root.draftProfile
    panel.root.acceptReusedLayout({ profile: panel.result.profile }, { generation: panel.root.reuseGeneration })
    assert.equal(panel.root.draftProfile, draft, owner)
    assert.equal(panel.root.draftDirty, false, owner)
    if (owner === "foreign") assert.equal(panel.root.daemonPreview.transaction_id, "other-client")
  }
})

test("a preview starting during reuse invalidates its reply even after the preview finishes", () => {
  for (const owner of ["foreign", "coordinator"]) {
    const panel = editorRefreshPanel()
    panel.root.openLayoutReuse()
    panel.root.reuseLayout("Current", { laptop: "laptop" })
    const request = panel.packets[0]
    const draft = panel.root.draftProfile
    if (owner === "foreign")
      panel.root.updateDocument({ ...panel.root.document, daemon: { preview: { transaction_id: "tui", reclaimable: false } } })
    else panel.root.previewCoordinator = { opened: true }
    assert.equal(panel.root.reusePending, false, owner)
    assert.match(panel.root.lastError, /preview started/)
    if (owner === "foreign") panel.root.updateDocument({ ...panel.root.document, daemon: {} })
    else panel.root.previewCoordinator = { opened: false }
    assert.equal(panel.root.identifyBlockedByPreview, false)
    panel.receive(request.id, { profile: panel.result.profile })
    assert.equal(panel.root.draftProfile, draft, owner)
    assert.equal(panel.root.draftDirty, false, owner)
    assert.equal(panel.root.creatingProfile, false, owner)
    panel.root.reuseLayout("Current", { laptop: "laptop" })
    panel.receive(panel.packets.at(-1).id, { profile: panel.result.profile })
    assert.equal(panel.root.creatingProfile, true, "a new request works after preview completion")
  }
})

test("reuse controls wait for reconnect and a ready editor while retaining the assignments", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const paneQml = fs.readFileSync(path.join(__dirname, "..", "LayoutReusePane.qml"), "utf8")
  const busy = qml.slice(qml.indexOf("id: reusePane")).match(/busy: ([\s\S]*?)\n            statusMessage:/)[1]
  const createEnabled = paneQml.slice(paneQml.indexOf("id: reuseAction")).match(/enabled: ([^\n]+)/)[1]
  const panel = editorRefreshPanel()
  const pane = { available: true, mapping: { laptop: "laptop" }, hasMapping: true }
  Object.defineProperty(pane, "busy", {
    get: vm.runInNewContext("(function() { return " + busy + " })", { root: panel.root })
  })
  const enabled = vm.runInNewContext("(function() { return " + createEnabled + " })", { root: pane })
  panel.root.openLayoutReuse()
  const editor = panel.root.editorDocument
  assert.equal(enabled(), true)
  panel.root.backendConnected = false
  const disconnected = qml.match(/onConnectedChanged: \{([\s\S]*?)\n    }\n    onError:/)[1]
  panel.root.clearPreview = panelFunction("clearPreview", panel.root, { previewTimer: { stop() {} } })
  vm.runInNewContext(disconnected, { root: panel.root, connected: false })
  assert.equal(panel.root.editorDocument, editor)
  assert.equal(panel.root.editorSnapshotStale, false, "retained metadata alone need not look stale")
  assert.equal(enabled(), false)
  panel.root.reuseLayout("Current", pane.mapping)
  assert.deepEqual(panel.requests, [])
  panel.root.backendConnected = true
  assert.equal(enabled(), false, "reconnection alone does not refresh the editor")
  panel.root.editorLoading = true
  assert.equal(enabled(), false)
  panel.root.editorLoading = false
  panel.root.editorReady = true
  assert.equal(enabled(), true)
  panel.root.previewCoordinator = { opened: true }
  assert.equal(enabled(), false, "an already-open reuse form waits for a shared preview")
  panel.root.previewCoordinator = { opened: false }
  assert.equal(enabled(), true)
  assert.deepEqual(pane.mapping, { laptop: "laptop" })
})

test("reused generated workspaces materialize assignments when changed to manual", () => {
  for (const strategy of ["sequential", "interleave"]) {
    const panel = editorRefreshPanel()
    const laptopWorkspaces = strategy === "interleave" ? ["1", "3"] : ["1", "2"]
    const deskWorkspaces = strategy === "interleave" ? ["2", "4"] : ["3", "4"]
    panel.root.openLayoutReuse()
    panel.root.reuseLayout("Current", { laptop: "laptop", desk: "desk" })
    panel.receive(panel.packets[0].id, {
      profile: { ...panel.result.profile, workspaces: { strategy, max_workspaces: 4, group_size: 2 } },
      workspace_plan: [{ output_key: "laptop", workspaces: laptopWorkspaces }, { output_key: "desk", workspaces: deskWorkspaces }]
    })
    assert.equal(panel.root.manualWorkspaceRulesInitialized, false)
    panel.root.changeWorkspaceStrategy("manual")
    const settings = panel.packets[1].params.edit.workspaces
    assert.equal(settings.strategy, "manual")
    assert.deepEqual(settings.rules.filter(rule => rule.output_key === "laptop").map(rule => rule.workspace), laptopWorkspaces)
    assert.deepEqual(settings.rules.filter(rule => rule.output_key === "desk").map(rule => rule.workspace), deskWorkspaces)
    assert.equal(settings.rules.filter(rule => rule.default).length, 2)
    assert.equal(settings.rules.filter(rule => rule.default).every(rule => rule.persistent), true)
  }
})

test("hardware snapshot checks remain compatible with daemons that omit the additive hash", () => {
  assert.equal(Model.monitorSnapshotsMatch({}, { monitor_set_hash: "known" }), true)
  assert.equal(Model.monitorSnapshotsMatch({ monitor_set_hash: "known" }, {}), true)
  assert.equal(Model.monitorSnapshotsMatch({ monitor_set_hash: "a" }, { monitor_set_hash: "a" }), true)
  assert.equal(Model.monitorSnapshotsMatch({ monitor_set_hash: "a" }, { monitor_set_hash: "b" }), false)
})

test("the display count includes connected disabled and mirrored outputs with a layout fallback", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const body = qml.match(/readonly property int monitorCount: \{([\s\S]*?)\n  }/)[1]
  const root = { backendConnected: true, documentReady: true, monitorSummaries: [
    { name: "eDP-1", enabled: true }, { name: "DP-1", enabled: false },
    { name: "DP-2", enabled: true, mirror_of: "eDP-1" }
  ] }
  const count = vm.runInNewContext("(function() {" + body + "})", {
    root, layoutDisplays: [{ name: "eDP-1" }]
  })
  assert.equal(count(), 3)
  root.documentReady = false
  assert.equal(count(), 1)
  root.documentReady = true
  root.backendConnected = false
  assert.equal(count(), 1)
})

test("preview recovery summons through the third-party shell facade and stops after reopening", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const timer = qml.slice(qml.indexOf("id: previewRecoveryTimer"))
  const body = timer.match(/onTriggered: \{([\s\S]*?)\n    }/)[1]
  const calls = []
  let stopped = 0
  const root = { moduleName: "crmne.hyprmoncfg", previewTransaction: "orphan", opened: false,
    bar: { shell: { summon(...args) { calls.push(args) } } } }
  const trigger = vm.runInNewContext("(function() {" + body + "})", {
    root, attempts: 0, stop() { stopped++ }
  })
  trigger()
  assert.deepEqual(calls, [["crmne.hyprmoncfg", ""]])
  root.opened = true
  trigger()
  assert.equal(calls.length, 1)
  assert.equal(stopped, 1)
  root.opened = false
  root.previewTransaction = ""
  trigger()
  assert.equal(calls.length, 1)
  assert.equal(stopped, 2)
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
  assert.match(canvasQml, /id: hiddenStrip/)
  assert.match(canvasQml, /visible: root\.nonSpatialDisplays.length > 0/)
})

test("plugin text never interprets daemon or profile values as rich text", () => {
  const pluginRoot = path.join(__dirname, "..")
  const qmlFiles = fs.readdirSync(pluginRoot).filter(function(file) {
    return file.endsWith(".qml")
  })

  for (const file of qmlFiles) {
    const source = fs.readFileSync(path.join(pluginRoot, file), "utf8")
    const textItems = source.match(/^\s*(?:\w+:\s*)?Text\s*\{/gm) || []
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
  assert.equal(Model.daemonNeedsRestart("hyprmoncfg 1.19.0-rc.1", "1.19.0-rc.0"), true)
  assert.equal(Model.daemonNeedsRestart("hyprmoncfg 1.19.0-rc.1", "1.19.0-rc.1"), false)

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

test("the panel does not present marketplace verification as an update alert", () => {
  const calls = []
  const activate = panelFunction("activateRow", {
    restartService() { calls.push("restart-service") }
  })

  activate("panel-updates")
  assert.deepEqual(calls, [])
  activate("restart-service")
  assert.deepEqual(calls, ["restart-service"])
  activate("unknown")

  // Marketplace verification is publication metadata, not a condition the
  // panel can turn into a useful update alert.
  const runtime = fs.readdirSync(path.join(__dirname, ".."))
    .filter(name => /\.(qml|js)$/.test(name))
    .map(name => fs.readFileSync(path.join(__dirname, "..", name), "utf8"))
    .join("\n")
  assert.doesNotMatch(runtime, /Panel updates|Review marketplace verification|panel-updates/)
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

test("reuse entry points respect unmanaged mode and recover when management resumes", () => {
  for (const entry of ["keyboard", "selected profile", "compact"]) {
    const panel = editorRefreshPanel()
    panel.root.activePage = entry === "compact" ? "layout" : "profiles"
    panel.root.expanded = entry !== "compact"
    panel.root.managedChecked = false
    const page = panel.root.activePage
    const expanded = panel.root.expanded
    const enter = entry === "keyboard"
      ? () => panelFunction("handleExpandedText", panel.root)("u")
      : () => panel.root.openLayoutReuse(entry === "compact" ? undefined : "Current")
    enter()
    assert.equal(panel.root.activePage, page, entry)
    assert.equal(panel.root.expanded, expanded, entry)
    assert.deepEqual(panel.requests, [], "unmanaged entry cannot start a request")
    panel.root.managedChecked = true
    enter()
    assert.equal(panel.root.activePage, "reuse", entry)
    assert.equal(panel.root.expanded, true, entry)
  }
})

test("reuse is a selected-profile action within the three main pages", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const choices = vm.runInNewContext(qml.match(/readonly property var pageOptions: (\[[\s\S]*?\n  \])/)[1])
  assert.deepEqual(Array.from(choices, choice => choice.value).sort(), ["layout", "profiles", "workspaces"])
  const panel = editorRefreshPanel()
  const selected = []
  let focused = false
  const globals = { Qt: { callLater: fn => fn() },
    reusePane: { choose: name => selected.push(name), reset() {}, focusFirst() {} },
    keyCatcher: { forceActiveFocus: () => { focused = true } } }
  panel.root.openLayoutReuse = panelFunction("openLayoutReuse", panel.root, globals)
  panel.root.leaveLayoutReuse = panelFunction("leaveLayoutReuse", panel.root, globals)
  const key = panelFunction("handleExpandedText", panel.root, globals)
  for (let index = 0; index < choices.length; index++) {
    key(String(index + 1))
    assert.equal(panel.root.activePage, choices[index].value)
  }
  panel.root.activePage = "layout"
  key("4")
  key("u")
  assert.equal(panel.root.activePage, "layout", "reuse is contextual, not a fourth page")
  panel.root.activePage = "profiles"
  panel.root.selectedSavedProfileName = "Other"
  panel.root.draftDirty = true
  key("u")
  assert.equal(panel.root.activePage, "profiles", "reuse cannot discard an existing draft")
  panel.root.draftDirty = false
  key("u")
  assert.equal(panel.root.activePage, "reuse")
  assert.deepEqual(selected, ["Other"], "reuse starts with the selected saved profile")
  panel.root.reusePending = true
  panel.root.leaveLayoutReuse()
  assert.equal(panel.root.activePage, "reuse", "wait for an in-flight draft request")
  panel.root.reusePending = false
  panel.root.leaveLayoutReuse()
  assert.equal(panel.root.activePage, "profiles")
  assert.equal(focused, true, "return restores keyboard control of the profiles page")
  assert.equal(panel.root.selectedSavedProfileName, "Other")
})
