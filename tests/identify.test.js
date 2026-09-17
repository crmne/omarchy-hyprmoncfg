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

function overlay() {
  const qml = fs.readFileSync(path.join(__dirname, "..", "DisplayIdentify.qml"), "utf8")
  const root = { availableScreens: [], targetScreen: null, connectorName: "", displayLabel: "", active: false, lastError: "" }
  const expiry = { running: false, starts: 0,
    stop() { this.running = false }, restart() { this.running = true; this.starts++ } }
  const context = vm.createContext({ root, expiry, IdentifyModel })
  for (const name of ["identify", "clear", "refreshScreens"]) {
    const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
    root[name] = vm.runInContext("(" + source + ")", context)
  }
  return { root, expiry,
    expire() { vm.runInContext(qml.match(/onTriggered: ([^\n]+)/)[1], context) },
    changedScreens() { vm.runInContext(qml.match(/onAvailableScreensChanged: ([^\n]+)/)[1], context) }
  }
}

test("the cue replaces previous targets and clears its screen and labels on timeout", () => {
  const f = fixture()
  const cue = overlay()
  cue.root.availableScreens = [f.screen]
  assert.equal(cue.root.identify(f.output, f.profile, f.displays), true)
  assert.equal(cue.root.active, true)
  assert.equal(cue.root.targetScreen, f.screen)
  assert.equal(cue.expiry.starts, 1)
  cue.root.identify(f.output, f.profile, f.displays)
  assert.equal(cue.expiry.starts, 2)
  cue.expire()
  assert.equal(cue.root.active, false)
  assert.equal(cue.root.targetScreen, null)
  assert.equal(cue.root.connectorName, "")
  assert.equal(cue.root.displayLabel, "")
  assert.equal(cue.expiry.running, false)
})

test("unplug/replacement and failed identification remove the old cue without choosing another screen", () => {
  const f = fixture()
  const cue = overlay()
  cue.root.availableScreens = [f.screen]
  cue.root.identify(f.output, f.profile, f.displays)
  cue.root.availableScreens = [{ ...f.screen }]
  cue.changedScreens()
  assert.equal(cue.root.active, false, "a replacement screen object must not inherit the cue")
  assert.equal(cue.expiry.running, false)
  cue.root.availableScreens = [f.screen]
  cue.root.identify(f.output, f.profile, f.displays)
  assert.equal(cue.root.identify({ key: "missing" }, f.profile, f.displays), false)
  assert.equal(cue.root.active, false)
  assert.match(cue.root.lastError, /not connected/)
})

test("identification windows have no keyboard focus, pointer region, or layout commands", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "DisplayIdentify.qml"), "utf8")
  assert.match(qml, /WlrLayershell\.keyboardFocus: WlrKeyboardFocus\.None/)
  assert.match(qml, /mask: Region \{\}/)
  assert.match(qml, /exclusionMode: ExclusionMode\.Ignore/)
  assert.match(qml, /property int duration: 2000/)
  assert.doesNotMatch(qml, /\b(?:Process|Socket|MouseArea|IpcHandler)\s*\{|forceActiveFocus|Hyprland\.dispatch/)
})

test("starting any display preview clears identification and refuses cues until the decision ends", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const blocked = qml.match(/readonly property bool identifyBlockedByPreview: ([\s\S]*?)\n  onIdentifyBlockedByPreviewChanged:/)[1]
  const changed = qml.match(/onIdentifyBlockedByPreviewChanged: ([^\n]+)/)[1]
  const identify = qml.match(/^  function identifyOutput\([\s\S]*?^  }/m)[0]
  for (const [key, value] of [
    ["previewPending", true],
    ["previewTransaction", "pending-transaction"],
    ["daemonPreview", { transaction_id: "other-client-preview" }],
    ["previewCoordinator", { opened: true, stage: "applying" }],
    ["previewCoordinator", { opened: true, stage: "confirm" }]
  ]) {
    const f = fixture()
    const root = {
      backendConnected: true, editorReady: true, editorLoading: false,
      editorRefreshQueued: false, displaysConnecting: false,
      draftProfile: f.profile, editorDocument: { profile: f.profile, displays: f.displays },
      previewPending: false, previewTransaction: "", daemonPreview: null, previewCoordinator: null,
      lastError: ""
    }
    const cue = { active: false, requests: 0,
      identify() { this.active = true; this.requests++; return true },
      clear() { this.active = false }
    }
    const context = vm.createContext({ root, displayIdentify: cue, Model: require("../Model.js") })
    Object.defineProperty(root, "identifyBlockedByPreview", {
      get() { return vm.runInContext(blocked, context) }
    })
    root.identifyOutput = vm.runInContext("(" + identify + ")", context)
    root.identifyOutput(f.output.key)
    assert.equal(cue.active, true)
    const previous = root[key]
    root[key] = value
    vm.runInContext(changed, context)
    assert.equal(cue.active, false, key + " must clear a cue that was already visible")
    root.lastError = "Keep or revert the current preview"
    root.identifyOutput(f.output.key)
    assert.equal(cue.requests, 1, key + " must refuse another cue")
    assert.equal(root.lastError, "Keep or revert the current preview")
    root[key] = previous
    vm.runInContext(changed, context)
    assert.equal(cue.active, false, "ending the preview must not restore an obsolete cue")
    root.identifyOutput(f.output.key)
    assert.equal(cue.requests, 2, "identification must work again after the preview ends")
  }
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
