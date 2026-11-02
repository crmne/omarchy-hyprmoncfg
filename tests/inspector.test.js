const test = require("node:test")
const assert = require("node:assert/strict")
const { fs } = require("./english")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("./script")("Model.js")

const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

function panelFunction(name, root, globals = {}) {
  const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  return vm.runInNewContext("(" + source + ")", { root, Model, ...globals })
}

function inspectorRoot(output, field, extra = {}) {
  const edits = []
  const snaps = []
  const root = Object.assign({
    selectedOutput: output, managedChecked: true, editPending: false, previewTransaction: "",
    keyboardInspectorField: field, placementCursor: 0,
    vrrOptions: [{ value: "0" }, { value: "1" }, { value: "2" }],
    bitdepthOptions: [{ value: "8" }, { value: "10" }],
    sdrEotfOptions: [{ value: "default" }, { value: "gamma22" }, { value: "srgb" }],
    triStateOptions: [{ value: "-1" }, { value: "0" }, { value: "1" }],
    colorManagementOptions: [{ value: "srgb" }, { value: "auto" }],
    editorDocument: { displays: [] }, draftProfile: { outputs: [] }, selectedOutputKey: "a",
    editOutput: edit => edits.push(JSON.parse(JSON.stringify(edit))),
    snapSelectedOutput: direction => snaps.push(direction),
    bounded: (value, low, high) => Math.max(low, Math.min(high, value))
  }, extra)
  root.pillStep = panelFunction("pillStep", root)
  root.adjustInspectorField = panelFunction("adjustInspectorField", root)
  root.activateInspectorField = panelFunction("activateInspectorField", root, {
    colorManagementDropdown: { open() {} }, modeDropdown: { open() {} }, scaleDropdown: { open() {} },
    mirrorDropdown: { open() {} }
  })
  return { root, edits, snaps }
}

test("rotation and flip are one transform edited as two independent parts", () => {
  for (let t = 0; t < 8; t++) {
    assert.equal(Model.transformRotation(t), t % 4)
    assert.equal(Model.transformFlipped(t), t >= 4)
    assert.equal(Model.transformWith(t, null, null), t, "no change keeps the transform")
  }
  assert.equal(Model.transformWith(5, 2, null), 6, "rotating keeps the flip")
  assert.equal(Model.transformWith(3, null, true), 7, "flipping keeps the rotation")
  assert.equal(Model.transformWith(6, null, false), 2)
  for (const unknown of [8, -1, 2.5])
    assert.equal(Model.transformWith(unknown, 1, true), unknown, "an unknown transform is never rewritten")
})

test("closed sets keep an unreported current value visible", () => {
  const options = [{ value: "0", label: "Off" }, { value: "1", label: "On" }]
  assert.deepEqual(Model.optionsWithCurrent(options, "1").map(o => o.value), ["0", "1"])
  assert.deepEqual(Model.optionsWithCurrent(options, "3").map(o => o.value), ["0", "1", "3"])
  assert.deepEqual(Model.optionsWithCurrent(options, "").map(o => o.value), ["0", "1"])
  assert.equal(options.length, 2, "the shared option list is not mutated")
})

test("typed coordinates accept whole logical pixels and reject guesses", () => {
  assert.equal(Model.parseCoordinate("2560"), 2560)
  assert.equal(Model.parseCoordinate(" -1440 "), -1440)
  assert.equal(Model.parseCoordinate("+220"), 220)
  for (const bad of ["", "12.5", "1e3", "abc", "30000", "-", "0x10"])
    assert.equal(Model.parseCoordinate(bad), null, bad)
})

test("placement uses the same anchor and positions as Alt+arrow snapping", () => {
  const profile = { outputs: [
    { key: "a", name: "DP-1", enabled: true, x: 0, y: 0, width: 2560, height: 1440, scale: 1 },
    { key: "b", name: "DP-2", enabled: true, x: 3000, y: 900, width: 1920, height: 1080, scale: 1 },
    { key: "c", name: "HDMI-A-1", enabled: false, x: 0, y: 0, width: 1920, height: 1080, scale: 1 }
  ] }
  assert.equal(Model.snapAnchorName(profile, "b"), "DP-1")
  assert.equal(Model.snapAnchorName(profile, "c"), "", "an off display has no placement")
  assert.deepEqual(Model.placementOptions().map(o => o.value), ["left", "right", "up", "down"])
  assert.deepEqual(Model.snapOutputPosition(profile, "b", "right"), { x: 2560, y: 180 })
  assert.deepEqual(Model.snapOutputPosition(profile, "b", "down"), { x: 320, y: 1440 })
})

test("keyboard: Rotation cycles angles keeping Flipped, and Flipped toggles alone", () => {
  let t = inspectorRoot({ transform: 5 }, 6)
  t.root.adjustInspectorField(1)
  assert.deepEqual(t.edits, [{ transform: 6 }])

  t = inspectorRoot({ transform: 3 }, 6)
  t.root.adjustInspectorField(1)
  assert.deepEqual(t.edits, [{ transform: 3 }], "arrows stop at 270 like Omarchy's ButtonGroup")

  t = inspectorRoot({ transform: 3 }, 6)
  t.root.adjustInspectorField(1, true)
  assert.deepEqual(t.edits, [{ transform: 0 }], "Enter wraps within the four angles")

  t = inspectorRoot({ transform: 2 }, 22)
  t.root.activateInspectorField()
  assert.deepEqual(t.edits, [{ transform: 6 }])

  t = inspectorRoot({ transform: 9 }, 6)
  t.root.adjustInspectorField(1)
  t.root.keyboardInspectorField = 22
  t.root.adjustInspectorField(1)
  assert.deepEqual(t.edits, [], "an unknown transform is left for the user to reset")
})

test("keyboard: Place beside opens its list, and arrows on it edit nothing", () => {
  const t = inspectorRoot({ transform: 0 }, 21)
  t.root.adjustInspectorField(1)
  assert.deepEqual(t.edits, [])
  let opened = 0
  panelFunction("activateInspectorField", t.root, { placementField: { open() { opened++ } } })()
  assert.equal(opened, 1)
  assert.match(qml, /onChanged: function\(value\) \{ root\.snapSelectedOutput\(value\) \}/)
})

test("keyboard: Enter opens a selector, flips a toggle, and Position focuses exact entry", () => {
  for (const [field, id] of [[23, "refreshField"], [5, "vrrField"], [6, "rotationField"], [14, "sdrCurveField"], [18, "forceWideField"], [19, "forceHdrField"]]) {
    const t = inspectorRoot({ vrr: 0 }, field)
    let opened = 0
    panelFunction("activateInspectorField", t.root, { [id]: { open() { opened++ } } })()
    assert.equal(opened, 1, id)
    assert.deepEqual(t.edits, [], "opening edits nothing")
  }

  const flip = inspectorRoot({ transform: 1 }, 22)
  flip.root.activateInspectorField()
  assert.deepEqual(flip.edits, [{ transform: 5 }])

  const depth = inspectorRoot({ bitdepth: 8 }, 3)
  depth.root.activateInspectorField()
  assert.deepEqual(depth.edits, [{ bitdepth: 10 }], "two chips still wrap on Enter")

  let focused = ""
  const root = inspectorRoot({ x: 10 }, 7).root
  panelFunction("activateInspectorField", root, {
    positionXField: { input: { forceActiveFocus() { focused = "x" } } },
    positionYField: { input: { forceActiveFocus() { focused = "y" } } }
  })()
  assert.equal(focused, "x")
})

test("Enter opens nothing during a preview, so no list can sit over Keep and Revert", () => {
  const t = inspectorRoot({ vrr: 0 }, 5, { editorPreviewBlocked: true })
  let opened = 0
  panelFunction("activateInspectorField", t.root, { vrrField: { open() { opened++ } } })()
  assert.equal(opened, 0)
  const owners = qml.match(/ownerOpen: root\.opened && root\.expanded && !inspectorViewport\.moving[^\n]*/g)
  assert.ok(owners.length >= 11)
  for (const owner of owners) assert.match(owner, /!root\.editorPreviewBlocked/)
})

test("Advanced hides rare fields from the keyboard until it is open", () => {
  assert.deepEqual(Model.displayInspectorFields(true, false, false, false), [0, 1, 23, 2, 5, 6, 9, 26])
  assert.deepEqual(Model.displayInspectorFields(true, false, false, true), [0, 1, 23, 2, 5, 6, 9, 26, 22, 7, 8, 21])
  assert.deepEqual(Model.displayInspectorFields(true, true, true, false), [0, 1, 23, 2, 5, 6, 9, 24, 25, 26])
  assert.deepEqual(Model.displayInspectorFields(true, true, false, true), [0, 1, 23, 2, 5, 6, 9, 24, 26, 7, 8, 21], "Flipped is off Auto only")
  assert.deepEqual(Model.displayInspectorFields(false, false, false, true), [0, 1, 23, 2, 5, 6, 26, 22])
  assert.deepEqual(Model.displayInspectorFields(false, true, true, true), [0, 1, 23, 2, 5, 6, 24, 25], "nothing left to hide")
  assert.deepEqual(Model.colorInspectorFields(false), [3, 4, 27])
  assert.equal(Model.colorInspectorFields(true).length, 14)
})

test("closing Advanced with the cursor inside leaves it on the row", () => {
  const root = { inspectorPage: "display", displayAdvancedOpen: true, displayKeyboardFields: [0, 26], keyboardInspectorField: 7 }
  panelFunction("toggleAdvanced", root, {})()
  assert.equal(root.displayAdvancedOpen, false)
  assert.equal(root.keyboardInspectorField, 26)
})

test("the Color row names hidden values that differ, ignoring Hyprland's stock levels", () => {
  assert.equal(Model.colorAdvancedSummary({ sdr_brightness: 1, sdr_min_luminance: 0.2, sdr_max_luminance: 80 }), "")
  assert.equal(Model.colorAdvancedSummary({ sdr_eotf: "gamma22", supports_hdr: 1 }), "SDR EOTF, HDR CAPABILITY")
})

test("the inspector wires every field into keyboard order and scroll-into-view", () => {
  const list = qml.match(/\? \[(displayEnabledToggle[\s\S]*?)\]\[root\.keyboardInspectorField\]/)[1]
    .split(",").map(s => s.trim())
  assert.equal(list.length, 28)
  assert.equal(list[21], "placementField")
  assert.equal(list[22], "flippedToggle")
  assert.equal(list[23], "refreshField")
  assert.equal(list[24], "rotationLockToggle")
  assert.equal(list[25], "calibrateButton")
  assert.equal(list[26], "displayAdvancedRow")
  assert.equal(list[27], "colorAdvancedRow")
  assert.equal(list[1], "modeDropdown")
  assert.equal(list[2], "scaleField")
  assert.equal(list[7], "positionXField")
  assert.match(qml, /SegmentedField \{\s+id: bitdepthField/)
  for (const id of ["refreshField", "vrrField", "rotationField", "placementField", "sdrCurveField", "forceWideField", "forceHdrField"]) {
    assert.match(qml, new RegExp("PanelDropdown \\{\\s+id: " + id))
    assert.match(qml, new RegExp(id + "\\.popupOpen"), "global keys hold while its list is open")
  }
  for (const id of ["positionXField", "positionYField"])
    assert.match(qml, new RegExp("CoordinateField \\{\\s+id: " + id))
  assert.match(qml, /positionXField\.input\.activeFocus \|\| positionYField\.input\.activeFocus/)
  assert.doesNotMatch(qml, /vrrDropdown|rotationDropdown|bitdepthDropdown|sdrCurveDropdown|forceWideDropdown|forceHdrDropdown/)
  assert.match(qml, /options: Model\.optionsWithCurrent\(root\.vrrOptions,/)
  assert.match(qml, /onChanged: function\(value\) \{ root\.snapSelectedOutput\(value\) \}/)
  assert.match(qml, /label: "PLACE BESIDE"\s+detail: anchorName/)
})

test("dropdowns report their real height so content-sized panels never clip them", () => {
  const dropdown = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")
  assert.match(dropdown, /dropdownLabel\.implicitHeight \+ Style\.spacing\.labelGap \+ rowHeight/)
  assert.doesNotMatch(dropdown, /rowHeight \+ Style\.spacing\.huge/)
})

test("form grid columns land on whole pixels inside the inspector's clip edge", () => {
  // The Color tab's 7px spacing made (340 - 7) / 2 = 166.5: every right-column
  // field started on a half pixel and its right border was clipped.
  for (const [width, spacing, columns] of [[340, 7, 2], [340, 8, 2], [341, 7, 2], [333, 20, 2], [500, 20, 3], [340, 0, 1]]) {
    const cell = Model.gridCellWidth(width, spacing, columns)
    assert.equal(cell, Math.floor(cell), `${width}/${spacing}/${columns} is a whole pixel`)
    const lastRight = (columns - 1) * (cell + spacing) + cell
    assert.ok(lastRight <= width, `${width}/${spacing}/${columns} stays inside (${lastRight})`)
    assert.ok(width - lastRight < columns, "at most one pixel per column is given up")
  }
  assert.equal(Model.gridCellWidth(340, 7, 2), 166)
  assert.equal(Model.gridCellWidth(0, 7, 2), 0)
  assert.equal(Model.gridCellWidth(340, 7, 0), 340)

  const monitorInfo = fs.readFileSync(path.join(__dirname, "..", "MonitorInfo.qml"), "utf8")
  const cells = qml.match(/readonly property real cellWidth: .*/g) || []
  assert.ok(cells.length >= 5)
  for (const cell of cells) assert.match(cell, /Model\.gridCellWidth\(width, spacing, 2\)/)
  assert.match(monitorInfo, /cellWidth: Model\.gridCellWidth\(width, columnSpacing, columns\)/)
})

test("a built-in panel with a sensor offers Auto rotation, which keeps its rotation as upright", () => {
  const displays = [{ key: "a", rotation_auto_supported: true }, { key: "b" }]
  assert.equal(Model.rotationAutoSupported(displays, "a"), true)
  assert.equal(Model.rotationAutoSupported(displays, "b"), false)
  assert.deepEqual(Model.rotationFieldOptions(true).map(o => o.value), ["auto", "0", "1", "2", "3"])
  assert.deepEqual(Model.rotationFieldOptions(false).map(o => o.value), ["0", "1", "2", "3"])
  assert.equal(Model.rotationFieldValue({ transform: 1 }), "1")
  assert.equal(Model.rotationFieldValue({ transform: 3, rotation_auto: true }), "auto")
  assert.deepEqual(Model.rotationEdit({ transform: 3 }, "auto"), { rotation_auto: true })
  assert.deepEqual(Model.rotationEdit({ transform: 3, rotation_auto: true }, "1"), { transform: 1, rotation_auto: false })
  assert.deepEqual(Model.rotationEdit({ transform: 4 }, "2"), { transform: 6 }, "a fixed panel never sends rotation_auto")
  assert.equal(Model.rotationDetail({ transform: 0, rotation_auto: true }, { locked: false }), "")
  assert.equal(Model.rotationDetail({ transform: 3, rotation_auto: true }, { locked: true }), "Upright 270°, Locked")
  assert.equal(Model.rotationDetail({ transform: 0, rotation_auto: true }, { paused: true }), "Upright while folded")
  assert.equal(Model.rotationDetail({ transform: 1 }, { locked: true }), "", "a fixed rotation has no detail")
  assert.equal(Model.rotationStatus({}), null, "an older daemon has no rotation")
})

test("arrows step into Auto, and the Lock row locks rotation", () => {
  const locks = []
  const output = { key: "a", transform: 0 }
  let { root, edits } = inspectorRoot(output, 6, { selectedRotationAutoSupported: true })
  root.adjustInspectorField(-1, false)
  assert.deepEqual(edits, [{ rotation_auto: true }])

  const auto = { key: "a", transform: 0, rotation_auto: true }
  ;({ root, edits } = inspectorRoot(auto, 6, { selectedRotationAutoSupported: true }))
  root.adjustInspectorField(1, false)
  assert.deepEqual(edits, [{ transform: 0, rotation_auto: false }])

  ;({ root, edits } = inspectorRoot(auto, 24, {
    rotation: { available: true, locked: false }, setRotationLock: locked => locks.push(locked)
  }))
  root.adjustInspectorField(1, false)
  assert.deepEqual(locks, [true])
  assert.deepEqual(edits, [], "the lock is not a draft edit")
})

test("the rotation lock uses the daemon's set_rotation method", () => {
  assert.match(qml, /root\.send\("set_rotation", \{ locked: locked === true \}\)/)
  assert.doesNotMatch(qml, /set_rotation_lock/)
})


test("a selector's list skips its separator, and nothing can pick it", () => {
  const dropdown = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")
  const source = dropdown.match(/function nextOption\(from, delta\) \{[\s\S]*?\n  \}/)[0]
  const options = [{ value: "1" }, { separator: true }, { value: "2" }]
  const next = vm.runInNewContext("(" + source + ")", { options, isSeparator: o => o.separator === true })
  assert.equal(next(0, 1), 2)
  assert.equal(next(2, -1), 0)
  assert.equal(next(2, 1), 2, "it stops at the end")
  assert.match(dropdown, /root\.isSeparator\(root\.options\[currentIndex\]\)\) return/)
})
