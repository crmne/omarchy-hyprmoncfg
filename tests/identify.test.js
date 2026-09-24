const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const IdentifyModel = require("../IdentifyModel.js")

function fixture() {
  const output = { key: "monitor-serial", name: "DP-OLD", make: "Dell", model: "Desk", serial: "123" }
  const current = { ...output, name: "DP-3", enabled: true }
  const screen = { name: "DP-3", serialNumber: "123" }
  return { output, current, profile: { outputs: [current] }, displays: [{ key: output.key, dpms: true }], screen }
}

test("identification maps hardware identity to the current connector, including array-like Qt screen lists", () => {
  const f = fixture()
  const wrong = { name: "DP-OLD", serialNumber: "other" }
  const screens = { 0: wrong, 1: f.screen, length: 2 }
  const result = IdentifyModel.target(f.output, f.profile, f.displays, screens)
  assert.equal(result.screen, f.screen)
  assert.equal(result.connector, "DP-3")
  assert.equal(result.label, "Dell Desk")
  assert.equal(result.error, "")
  assert.equal(f.output.name, "DP-OLD")
})

test("a saved connector alone cannot identify a different display at the current desk", () => {
  const f = fixture()
  const unknown = { key: "another-monitor", name: "DP-3" }
  const result = IdentifyModel.target(unknown, f.profile, f.displays, [f.screen])
  assert.equal(result.screen, null)
  assert.match(result.error, /not connected/)
  f.screen.serialNumber = "replacement"
  assert.match(IdentifyModel.target(f.output, f.profile, f.displays, [f.screen]).error, /has changed/)
})

test("disabled, sleeping, mirrored, unavailable, and ambiguous targets give an inline reason", () => {
  for (const [mutate, reason] of [
    [f => { f.current.enabled = false }, /disabled/],
    [f => { f.displays[0].dpms = false }, /asleep/],
    [f => { f.current.mirror_of = "eDP-1" }, /mirrors/],
    [f => { f.displays = [] }, /not connected/],
    [f => { f.screen.name = "DP-4" }, /not available/],
    [f => { f.profile.outputs.push({ ...f.current }) }, /ambiguous/]
  ]) {
    const f = fixture()
    mutate(f)
    const result = IdentifyModel.target(f.output, f.profile, f.displays, [f.screen])
    assert.equal(result.screen, null)
    assert.match(result.error, reason)
  }
  const f = fixture()
  f.output.enabled = false
  assert.equal(IdentifyModel.target(f.output, f.profile, f.displays, [f.screen]).screen, f.screen,
    "identify the currently enabled physical display even if the saved draft disables it")
})

function identificationService() {
  const qml = fs.readFileSync(path.join(__dirname, "..", "DisplayIdentify.qml"), "utf8")
  const overlay = { targets: [] }
  const expiry = { running: false, starts: 0,
    stop() { this.running = false }, restart() { this.running = true; this.starts++ } }
  const overlayContext = vm.createContext({ root: overlay, expiry })
  for (const name of ["clear", "show"]) {
    const source = qml.match(new RegExp("^  function " + name + "\\([^\\n]+", "m"))[0]
    overlay[name] = vm.runInContext("(" + source + ")", overlayContext)
  }
  const guardQml = fs.readFileSync(path.join(__dirname, "..", "PreviewGuard.qml"), "utf8")
  const functions = guardQml.match(/^  function [\s\S]*?^  }/gm)
  const names = functions.map(source => source.match(/function (\w+)/)[1])
  const packets = []
  const screens = { screens: [] }
  const timeout = { running: false, stop() { this.running = false }, restart() { this.running = true } }
  const state = { connected: true, requestSequence: 0, pendingMethods: {}, pendingContexts: {}, statusRevision: 0, stage: "idle",
    transactionId: "", requestPending: false, identifyPending: false,
    identifyTopologyRevision: 0, identifyRequestRevision: 0, document: {},
    identifyRequestId: "", identifyError: "", foreignPreviewActive: false }
  const root = new Proxy(state, {
    set(target, key, value) {
      const changed = target[key] !== value
      target[key] = value
      if (changed && guardQml.includes("on" + key[0].toUpperCase() + key.slice(1) + "Changed: root.statusRevision++"))
        root.statusRevision++
      return true
    }
  })
  Object.defineProperty(root, "opened", { get: () => root.stage !== "idle" })
  const context = vm.createContext({ root, IdentifyModel, Model: require("../Model.js"),
    identifyOverlay: overlay, identifyTimeout: timeout, Quickshell: screens,
    backendSocket: { connected: true, flush() {}, write(line) { packets.push(JSON.parse(line)) } },
    previewClock: { start() {}, stop() {} }, Hyprland: { focusedMonitor: null } })
  vm.runInContext(functions.join("\n") + "\nObject.assign(root, {" + names.join(",") + "})", context)
  return { root, overlay, expiry, timeout, packets, screens,
    receive(id, result) { root.handleMessage(JSON.stringify({ protocol_version: 1, type: "response", id, result })) },
    fail(id) { root.handleMessage(JSON.stringify({ protocol_version: 1, type: "response", id,
      error: { message: "obsolete read failed" } })) },
    expire() { vm.runInContext("root.clear()", overlayContext) },
    changedScreens() {
      const handler = guardQml.match(/function onScreensChanged\(\) \{([\s\S]*?)\n    }/)[1]
      vm.runInContext(handler, context)
    }
  }
}

function serviceFixture() {
  const f = fixture()
  f.current.width = 1920
  f.current.height = 1080
  const service = identificationService()
  service.screens.screens = [f.screen]
  const status = { monitors: [{ name: "DP-3", enabled: true }], monitor_set_hash: "original" }
  const editor = { profile: f.profile, displays: f.displays, monitor_set_hash: "original" }
  service.root.updateDocument(status)
  return { ...service, ...f, status, editor }
}

test("selected and all-screen identification use fresh snapshots through one expiring service", () => {
  const f = serviceFixture()
  for (const key of [f.output.key, ""]) {
    assert.equal(f.root.identifyDisplays(key), true)
    assert.equal(f.overlay.targets.length, 0, "a new request clears the previous cue while reading live state")
    f.receive(f.packets.at(-1).id, f.editor)
    assert.equal(f.overlay.targets.length, 1)
    assert.equal(f.overlay.targets[0].screen, f.screen)
    assert.equal(f.overlay.targets[0].summary.connector, "DP-3")
    assert.equal(f.expiry.running, true)
  }
  assert.equal(f.expiry.starts, 2)
  f.expire()
  assert.equal(f.overlay.targets.length, 0)
  assert.equal(f.expiry.running, false)
})

test("canvas and reuse identification request a live service snapshot instead of using a cached profile", () => {
  const f = serviceFixture()
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const root = { backendConnected: true, editorReady: true, editorLoading: false,
    editorSnapshotStale: false, identifyAvailable: true, previewCoordinator: f.root,
    lastError: "An earlier identification failed" }
  const context = vm.createContext({ root })
  for (const name of ["identifyDisplays", "identifyOutput"]) {
    const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
    root[name] = vm.runInContext("(" + source + ")", context)
  }
  root.identifyOutput(f.output.key)
  assert.equal(root.lastError, "")
  assert.equal(f.packets.at(-1).method, "editor_state")
  assert.equal(f.overlay.targets.length, 0)
  f.receive(f.packets.at(-1).id, f.editor)
  assert.equal(f.overlay.targets[0].screen, f.screen)
  root.editorSnapshotStale = true
  const count = f.packets.length
  root.identifyOutput(f.output.key)
  assert.equal(f.packets.length, count)
  assert.match(root.lastError, /Refresh/)
})

test("the service rejects disconnected, ambiguous, and replaced selected identities", () => {
  for (const mutate of [
    f => { f.editor.profile = { outputs: [] } },
    f => { f.editor.profile.outputs.push({ ...f.current }) },
    f => { f.screen.serialNumber = "replacement" }
  ]) {
    const f = serviceFixture()
    f.root.identifyDisplays(f.output.key)
    mutate(f)
    f.receive(f.packets.at(-1).id, f.editor)
    assert.equal(f.overlay.targets.length, 0)
    assert.notEqual(f.root.identifyError, "")
  }
})

test("topology and hardware changes cancel active and pending cues while Qt screens survive", () => {
  for (const replacement of [
    { monitors: [{ name: "DP-4", enabled: true }], monitor_set_hash: "original" },
    { monitors: [{ name: "DP-3", enabled: true }], monitor_set_hash: "replacement" }
  ]) {
    for (const pending of [false, true]) {
      const f = serviceFixture()
      f.root.identifyDisplays(f.output.key)
      const id = f.packets.at(-1).id
      if (!pending) f.receive(id, f.editor)
      f.root.updateDocument({ ...f.status, monitors: [{ name: "DP-3", enabled: true, focused: true }] })
      assert.equal(f.root.identifyPending, pending, "focus-only updates preserve a pending read")
      assert.equal(f.overlay.targets.length, pending ? 0 : 1, "focus-only updates preserve a visible cue")
      f.root.updateDocument(replacement)
      assert.equal(f.screens.screens[0], f.screen)
      assert.equal(f.overlay.targets.length, 0)
      assert.equal(f.root.identifyPending, false)
      assert.equal(f.expiry.running, false)
      assert.equal(f.timeout.running, false)
      if (pending) f.receive(id, f.editor)
      assert.equal(f.overlay.targets.length, 0, "a late reply must not restore the obsolete request")
    }
  }
})

test("Qt screen replacement cancels requests and stale errors cannot cancel a newer identification", () => {
  const f = serviceFixture()
  f.root.identifyDisplays(f.output.key)
  const old = f.packets.at(-1).id
  f.changedScreens()
  assert.equal(f.root.identifyPending, false)
  f.root.identifyDisplays(f.output.key)
  const current = f.packets.at(-1).id
  f.fail(old)
  assert.equal(f.root.identifyPending, true)
  assert.equal(f.root.identifyError, "")
  f.receive(current, f.editor)
  assert.equal(f.overlay.targets.length, 1)
  f.changedScreens()
  assert.equal(f.overlay.targets.length, 0)
})

test("a newer hardware snapshot is rejected until the service refreshes its status", () => {
  const f = serviceFixture()
  f.root.identifyDisplays(f.output.key)
  f.receive(f.packets.at(-1).id, { ...f.editor, monitor_set_hash: "replacement" })
  assert.equal(f.overlay.targets.length, 0)
  assert.match(f.root.identifyError, /displays changed/)
  assert.equal(f.packets.at(-1).method, "status")
  f.receive(f.packets.at(-1).id, { ...f.status, monitor_set_hash: "replacement" })
  f.root.identifyDisplays(f.output.key)
  f.receive(f.packets.at(-1).id, { ...f.editor, monitor_set_hash: "replacement" })
  assert.equal(f.overlay.targets.length, 1)
})

test("an Identify recovery read cannot remove a preview announced by a newer status event", () => {
  const f = serviceFixture()
  f.root.identifyDisplays(f.output.key)
  f.receive(f.packets.at(-1).id, { ...f.editor, monitor_set_hash: "replacement" })
  const read = f.packets.at(-1)
  assert.equal(read.method, "status")
  const preview = { transaction_id: "recovered", reclaimable: true,
    deadline: new Date(Date.now() + 30000).toISOString() }
  f.root.handleMessage(JSON.stringify({ protocol_version: 1, type: "event", event: "status",
    data: { ...f.status, daemon: { preview } } }))
  f.receive(read.id, f.status)
  assert.equal(f.root.transactionId, "recovered")
  assert.equal(f.root.foreignPreviewActive, true)
  assert.equal(f.root.stage, "confirm")
  assert.equal(f.root.revert(), true)
  assert.equal(f.packets.at(-1).params.transaction_id, "recovered")
})

test("closing a panel leaves its cue with the persistent service until expiry", () => {
  const f = serviceFixture()
  f.root.identifyDisplays(f.output.key)
  f.receive(f.packets.at(-1).id, f.editor)
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const close = qml.match(/^  function close\([\s\S]*?^  }/m)[0]
  let hidden = false
  const root = { reuseGeneration: 0, previewTransaction: "", previewCoordinator: f.root,
    controller: { hide() { hidden = true } } }
  vm.runInNewContext("(" + close + ")", { root })()
  assert.equal(hidden, true)
  assert.equal(f.overlay.targets.length, 1)
  assert.doesNotMatch(qml, /\bDisplayIdentify\s*\{/)
  f.expire()
  assert.equal(f.overlay.targets.length, 0)
})

test("identification windows have no keyboard focus, pointer region, or layout commands", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "DisplayIdentify.qml"), "utf8")
  assert.match(qml, /WlrLayershell\.keyboardFocus: WlrKeyboardFocus\.None/)
  assert.match(qml, /mask: Region \{\}/)
  assert.match(qml, /exclusionMode: ExclusionMode\.Ignore/)
  assert.match(qml, /interval: 4000/)
  assert.doesNotMatch(qml, /\b(?:Process|Socket|MouseArea|IpcHandler)\s*\{|forceActiveFocus|Hyprland\.dispatch/)
})

test("previews clear existing and pending identification and require a fresh request afterward", () => {
  const f = serviceFixture()
  f.root.identifyDisplays(f.output.key)
  f.receive(f.packets.at(-1).id, f.editor)
  f.root.updateDocument({ ...f.status, daemon: { preview: { transaction_id: "tui", reclaimable: false } } })
  assert.equal(f.overlay.targets.length, 0)
  assert.equal(f.root.identifyDisplays(f.output.key), false)
  f.root.updateDocument(f.status)
  assert.equal(f.overlay.targets.length, 0)
  assert.equal(f.root.identifyDisplays(f.output.key), true)
  const pending = f.packets.at(-1).id
  f.root.updateDocument({ ...f.status, daemon: { preview: { transaction_id: "tui", reclaimable: false } } })
  f.root.updateDocument(f.status)
  f.receive(pending, f.editor)
  assert.equal(f.overlay.targets.length, 0, "ending a preview must not resurrect a pre-preview request")
})

function canvasPointer(movable) {
  const qml = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")
  const pointer = qml.slice(qml.indexOf("id: dragArea"))
  const identified = [], selected = [], moved = []
  const context = vm.createContext({
    root: { movable, metrics: { scale: 1 }, outputSelected: key => selected.push(key),
      outputIdentifyRequested: key => identified.push(key), outputMoved: (...args) => moved.push(args) },
    card: { modelData: { key: "desk", x: 0, y: 0 }, dragOffsetX: 0, dragOffsetY: 0 },
    dragArea: { mapToItem: (canvas, x, y) => ({ x, y }) }, canvas: {},
    Style: { space: value => value }, pressed: true,
    pointerStartX: 0, pointerStartY: 0, dragStarted: false, identifyClickPending: false
  })
  const handlers = {}
  for (const name of ["Pressed", "PositionChanged", "Released"]) {
    const source = pointer.match(new RegExp("on" + name + ": (function\\(mouse\\) \\{[\\s\\S]*?\\n          })"))[1]
    handlers[name] = vm.runInContext("(" + source + ")", context)
  }
  for (const name of ["Clicked", "Canceled"]) {
    const body = pointer.match(new RegExp("on" + name + ": \\{([\\s\\S]*?)\\n          }"))[1]
    handlers[name] = vm.runInContext("(function() {" + body + "})", context)
  }
  return { handlers, identified, selected, moved }
}

test("canvas identification fires on an actual click, never on press, drag, or cancellation", () => {
  for (const movable of [true, false]) {
    const click = canvasPointer(movable)
    click.handlers.Pressed({ x: 5, y: 5 })
    assert.deepEqual(click.selected, ["desk"])
    assert.deepEqual(click.identified, [])
    click.handlers.Released({ x: 5, y: 5 })
    click.handlers.Clicked()
    assert.deepEqual(click.identified, ["desk"])
    assert.deepEqual(click.moved, [])

    const drag = canvasPointer(movable)
    drag.handlers.Pressed({ x: 5, y: 5 })
    drag.handlers.PositionChanged({ x: 45, y: 5 })
    drag.handlers.Released({ x: 45, y: 5 })
    drag.handlers.Clicked()
    assert.deepEqual(drag.identified, [])
    assert.equal(drag.moved.length, movable ? 1 : 0)

    const canceled = canvasPointer(movable)
    canceled.handlers.Pressed({ x: 5, y: 5 })
    canceled.handlers.Canceled()
    canceled.handlers.Clicked()
    assert.deepEqual(canceled.identified, [])
  }
})
