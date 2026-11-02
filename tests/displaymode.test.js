const test = require("node:test")
const assert = require("node:assert/strict")
const { fs } = require("./english")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("./script")("Model.js")

const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
function panelFunction(name, root) {
  const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  return vm.runInNewContext("(" + source + ")", { root, Model })
}

const laptop = { key: "lap", name: "eDP-1", enabled: true, x: 1920, y: 0 }
const desk = { key: "desk", name: "DP-1", enabled: true, x: 0, y: 0 }
const side = { key: "side", name: "HDMI-A-1", enabled: true, x: 4480, y: 100 }
const live = [{ key: "lap", internal: true }, { key: "desk" }, { key: "side" }]
const draft = (...outputs) => ({ outputs })

test("Extend and Mirror need an enabled built-in display and an enabled, connected external", () => {
  assert.deepEqual(Model.displayModeState(draft(laptop, desk), live),
    { available: true, mode: "extend", builtInKey: "lap", externalKeys: ["desk"] })
  assert.equal(Model.displayModeState(draft(laptop), live).available, false)
  assert.equal(Model.displayModeState(draft(desk, side), live).available, false, "desktop")
  assert.equal(Model.displayModeState(draft({ ...laptop, enabled: false }, desk), live).available, false, "clamshell")
  assert.equal(Model.displayModeState(draft(laptop, { ...desk, enabled: false }), live).available, false)
  assert.equal(Model.displayModeState(draft(laptop, desk), [{ key: "lap" }]).available, false, "unplugged")
  for (const name of ["LVDS-1", "DSI-1"])
    assert.equal(Model.displayModeState(draft({ ...laptop, name }, desk), []).available, true, name)
  assert.equal(Model.displayModeState(draft({ ...laptop, name: "Panel" }, desk), live).available, true,
    "the daemon's internal flag counts")
})

test("the shown mode says what the externals do, and a custom arrangement selects neither", () => {
  const mirrored = { ...desk, mirror_of: "lap" }
  assert.equal(Model.displayModeState(draft(laptop, mirrored), live).mode, "mirror")
  assert.equal(Model.displayModeState(draft(laptop, mirrored, side), live).mode, "")
  assert.equal(Model.displayModeState(draft(laptop, desk, { ...side, mirror_of: "desk" }), live).mode, "")
  assert.equal(Model.displayModeState(draft({ ...laptop, mirror_of: "desk" }, desk), live).mode, "")
})

test("Mirror edits only mirror_of on the externals that need it", () => {
  assert.deepEqual(Model.displayModeEdits(draft(laptop, desk, side), live, "mirror"), [
    { output_key: "desk", mirror_of: "lap" }, { output_key: "side", mirror_of: "lap" }])
  assert.deepEqual(Model.displayModeEdits(draft(laptop, { ...desk, mirror_of: "lap" }, side), live, "mirror"), [
    { output_key: "side", mirror_of: "lap" }])
  assert.deepEqual(Model.displayModeEdits(draft(laptop, { ...desk, mirror_of: "lap" }), live, "mirror"), [])
})

test("a built-in display that mirrors an external is freed first, so no cycle forms", () => {
  assert.deepEqual(Model.displayModeEdits(draft({ ...laptop, mirror_of: "desk" }, desk), live, "mirror"), [
    { output_key: "lap", mirror_of: "" }, { output_key: "desk", mirror_of: "lap" }])
})

test("Extend leaves the draft's positions to come back and only adds remembered ones", () => {
  const mirrored = draft(laptop, { ...desk, mirror_of: "lap" }, { ...side, mirror_of: "lap" })
  assert.deepEqual(Model.displayModeEdits(mirrored, live, "extend"), [
    { output_key: "desk", mirror_of: "" }, { output_key: "side", mirror_of: "" }])
  const before = Model.mirrorArrangement(draft(laptop, desk, side), live)
  assert.deepEqual(before, { desk: { x: 0, y: 0 }, side: { x: 4480, y: 100 } })
  const reloaded = draft(laptop, { ...desk, x: 1920, mirror_of: "lap" }, { ...side, x: 1920, y: 0, mirror_of: "lap" })
  assert.deepEqual(Model.displayModeEdits(reloaded, live, "extend", before), [
    { output_key: "desk", mirror_of: "", x: 0, y: 0 }, { output_key: "side", mirror_of: "", x: 4480, y: 100 }])
})

test("a second Mirror keeps the position remembered for an already mirrored external", () => {
  const remembered = { desk: { x: 7, y: 8 } }
  assert.deepEqual(Model.mirrorArrangement(draft(laptop, { ...desk, mirror_of: "lap" }, side), live, remembered),
    { desk: { x: 7, y: 8 }, side: { x: 4480, y: 100 } })
})

function chainRoot(overrides = {}) {
  const sent = []
  const root = {
    displayMode: { available: true, mode: "extend" }, displayModeEnabled: true,
    managedChecked: true, editorReady: true, editPending: false, previewTransaction: "",
    draftDirty: false, draftProfile: draft(laptop, desk, side), editorDocument: { displays: live },
    mirrorArrangement: {}, outputEditQueue: [], applyAfterOutputEdits: false, applied: 0, sent,
    editDraft(edit) { root.editPending = true; sent.push(edit) },
    applyDraft() { root.applied++ },
    ...overrides
  }
  root.editOutputs = panelFunction("editOutputs", root)
  root.finishOutputEdit = panelFunction("finishOutputEdit", root)
  root.setDisplayMode = panelFunction("setDisplayMode", root)
  return root
}

test("on a clean draft the last edit of the chain starts the preview guard, never before", () => {
  const root = chainRoot()
  root.setDisplayMode("mirror")
  assert.deepEqual(root.sent, [{ output_key: "desk", mirror_of: "lap" }])
  root.finishOutputEdit()
  assert.equal(root.sent.length, 2)
  assert.equal(root.applied, 0)
  root.finishOutputEdit()
  assert.equal(root.sent.length, 2)
  assert.equal(root.applied, 1)
  assert.deepEqual(Object.keys(root.mirrorArrangement).sort(), ["desk", "side"])
})

test("a dirty draft only gains the change", () => {
  const root = chainRoot({ draftDirty: true })
  root.setDisplayMode("mirror")
  root.finishOutputEdit()
  root.finishOutputEdit()
  assert.equal(root.sent.length, 2)
  assert.equal(root.applied, 0)
})

test("the switch does nothing while it is unavailable, already chosen or blocked", () => {
  for (const overrides of [
    { displayMode: { available: false, mode: "" } },
    { displayModeEnabled: false }
  ]) {
    const root = chainRoot(overrides)
    root.setDisplayMode("mirror")
    assert.equal(root.sent.length, 0)
  }
  const root = chainRoot()
  root.setDisplayMode("extend")
  assert.equal(root.sent.length, 0)
})

test("the panel never writes to Hyprland for a display mode", () => {
  const source = qml.match(/^  function setDisplayMode\([\s\S]*?^  }/m)[0]
  assert.doesNotMatch(source, /hyprctl|Process|root\.send/)
  assert.match(qml, /root\.send\("edit_profile", \{ profile: root\.draftProfile, edit: edit \}\)/)
  assert.deepEqual([...new Set(qml.match(/"hyprctl",[^\]]*/g))], ['"hyprctl", "-j", "getoption", "animations:enabled"'],
    "the only hyprctl use is a read")
})

test("any end to an edit drops the rest of a chain, so a failure cannot apply it", () => {
  assert.match(qml, /onEditPendingChanged: if \(!root\.editPending\) \{\n\s+root\.outputEditQueue = \[\]\n\s+root\.applyAfterOutputEdits = false/)
})

test("the compact cursor reaches the switch above the text rows", () => {
  const rows = Model.compactTopRows(true, true, true)
  assert.deepEqual(rows, ["displaymode", "textsize", "terminal"])
  assert.equal(Model.compactTopRow(rows, -3), "displaymode")
  assert.deepEqual(Model.compactTopRows(true, true, false), ["textsize", "terminal"])
})

test("the mode row adds to the expanded stage like the Off strip", () => {
  const bounds = { x: 0, y: 0, width: 7680, height: 1080 }
  const height = options => Model.stageSize(bounds, 1, options).height
  assert.equal(height({ modeRow: true }) - height({}), Model.panelSizing.offRowHeight)
})

test("rotate menu offers the field's choices with the current one checked, keeping Flipped", () => {
  const ids = actions => actions.map(action => action.id)
  const checked = actions => actions.filter(action => action.checked).map(action => action.label)
  assert.deepEqual(ids(Model.rotationMenuActions({ transform: 1 }, false)), ["0", "1", "2", "3"])
  assert.deepEqual(Model.rotationMenuActions({ transform: 1 }, false).map(action => action.label),
    ["Normal", "90°", "180°", "270°"])
  assert.deepEqual(checked(Model.rotationMenuActions({ transform: 1 }, false)), ["90°"])
  assert.deepEqual(checked(Model.rotationMenuActions({ transform: 6 }, false)), ["180°"])
  assert.deepEqual(checked(Model.rotationMenuActions({ transform: 0, rotation_auto: true }, true)), ["Auto"])
  assert.equal(Model.rotationEdit({ transform: 4 }, "1").transform, 5, "flipped survives")
})

test("an unknown transform is shown nothing to pick, as the field leaves it alone", () => {
  const actions = Model.rotationMenuActions({ transform: 9 }, false)
  assert.ok(actions.every(action => action.enabled === false && action.checked === false))
  assert.ok(Model.rotationMenuActions(null, false).every(action => action.enabled === false))
})

test("choosing a rotation goes through the one rotation edit, and the current one sends nothing", () => {
  const calls = []
  const root = {
    draftProfile: draft({ key: "a", transform: 4 }),
    editOutput(fields, key) { calls.push([fields, key]) }
  }
  const rotate = panelFunction("rotateOutput", root)
  rotate("a", "0")
  assert.equal(calls.length, 0)
  rotate("a", "2")
  assert.deepEqual(calls, [[{ transform: 6 }, "a"]])
})

test("an arrangement exists when anything else is in the draft or connected", () => {
  assert.equal(Model.singleDisplay(draft(laptop), [{ key: "lap" }]), true)
  assert.equal(Model.singleDisplay(draft(laptop, { ...desk, enabled: false }), live.slice(0, 2)), false, "one is off")
  assert.equal(Model.singleDisplay(draft(laptop, desk), [{ key: "lap" }]), false, "a loaded profile")
  assert.equal(Model.singleDisplay(draft(laptop), live.slice(0, 2)), false, "one just arrived")
})

test("one display moves nothing, whichever way it is asked", () => {
  const calls = []
  const root = {
    arrangeable: false, selectedOutput: laptop, managedChecked: true, editPending: false,
    previewTransaction: "", draftProfile: draft(laptop), selectedOutputKey: "lap",
    editOutput(fields) { calls.push(fields) }
  }
  panelFunction("nudgeSelectedOutput", root)(10, 0)
  panelFunction("snapSelectedOutput", root)("left")
  assert.equal(calls.length, 0)
  assert.equal(root.lastError, undefined, "no error for a key that has nothing to do")
  assert.match(qml, /movable: root\.rotatable && root\.arrangeable/)
  assert.doesNotMatch(qml, /rotatable: root\.rotatable && root\.arrangeable/)
})

test("letter aliases cover the arrows' Ctrl and Alt moves and leave Shift to the 500px jump", () => {
  for (const mod of ["Ctrl", "Alt"])
    for (const [arrow, letter] of [["Left", "H"], ["Right", "L"], ["Up", "K"], ["Down", "J"]])
      assert.ok(qml.includes(`sequences: ["${mod}+${arrow}", "${mod}+${letter}"]`), mod + "+" + letter)
  assert.doesNotMatch(qml, /"Shift\+[HJKL]"/)
  assert.match(qml, /key === "H"\) root\.nudgeSelectedOutput\(-500, 0\)/)
})

test("no text entry can receive a letter the canvas or the catcher took", () => {
  const blocked = qml.match(/blocked: root\.execEditing[\s\S]*?\n\s+onMoveRequested/)[0]
  for (const id of ["profileNameInput", "positionXField", "positionYField", "workspaceCountField",
    "workspaceGroupSizeField", "sdrBrightnessField", "sdrSaturationField", "sdrMinLuminanceField",
    "sdrMaxLuminanceField", "minLuminanceField", "maxLuminanceField", "maxAvgLuminanceField",
    "iccProfileInput", "scaleField.customInput", "rotateMenu.visible"])
    assert.ok(blocked.includes(id), id)
  assert.match(qml, /canvasKeysEnabled: [\s\S]*?!keyCatcher\.blocked/)
  const keyFields = (qml.match(/KeyField \{\n\s+id: (\w+)/g) || []).map(line => line.match(/id: (\w+)/)[1])
  assert.deepEqual(keyFields.sort(), ["decimalInput", "iccProfileInput", "profileExecInput", "profileNameInput", "renameInput"],
    "a new text field must join `blocked`")
})

test("the keyboard guide names the letters and drops moves for one display", () => {
  const help = fs.readFileSync(path.join(__dirname, "..", "KeyboardHelp.qml"), "utf8")
  assert.match(help, /drag, arrows, hjkl/)
  assert.match(help, /Shift\+hjkl", action: "Move by 500px"/)
  assert.match(help, /if \(root\.arrangeable\) contextual\.push\(\{\n\s+title: "Selected display"/)
})
