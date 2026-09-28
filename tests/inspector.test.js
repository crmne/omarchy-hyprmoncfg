const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("../Model.js")

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
  assert.deepEqual(Model.placementOptions.map(o => o.value), ["left", "right", "up", "down"])
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

test("keyboard: Place beside nearest moves a cursor, and Enter snaps through the shared engine", () => {
  const t = inspectorRoot({ transform: 0 }, 21)
  t.root.adjustInspectorField(1)
  t.root.adjustInspectorField(1)
  assert.equal(t.root.placementCursor, 2)
  t.root.adjustInspectorField(5)
  assert.equal(t.root.placementCursor, 3, "the cursor stops at the last choice")
  assert.deepEqual(t.edits, [], "moving the cursor never edits")
  t.root.activateInspectorField()
  assert.deepEqual(t.snaps, ["down"])
})

test("keyboard: Enter on a segmented field advances it; Position focuses exact entry", () => {
  let t = inspectorRoot({ vrr: 0 }, 5)
  t.root.activateInspectorField()
  assert.deepEqual(t.edits, [{ vrr: 1 }])

  t = inspectorRoot({ sdr_eotf: "srgb" }, 14)
  t.root.activateInspectorField()
  assert.deepEqual(t.edits, [{ sdr_eotf: "default" }])

  let focused = ""
  const root = inspectorRoot({ x: 10 }, 7).root
  panelFunction("activateInspectorField", root, {
    positionXField: { input: { forceActiveFocus() { focused = "x" } } },
    positionYField: { input: { forceActiveFocus() { focused = "y" } } }
  })()
  assert.equal(focused, "x")
})

test("the inspector wires every field into keyboard order and scroll-into-view", () => {
  assert.match(qml, /readonly property var displayKeyboardFields: \[0, 1, 2, 5, 6, 22, 7, 8, 21, 9\]/)
  assert.match(qml, /readonly property var colorKeyboardFields: \[3, 4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20\]/)
  const list = qml.match(/\? \[(displayEnabledToggle[\s\S]*?)\]\[root\.keyboardInspectorField\]/)[1]
    .split(",").map(s => s.trim())
  assert.equal(list.length, 23)
  assert.equal(list[21], "placementField")
  assert.equal(list[22], "rotationField")
  assert.equal(list[2], "scaleField")
  assert.equal(list[7], "positionXField")
  for (const id of ["vrrField", "rotationField", "bitdepthField", "sdrCurveField", "forceWideField", "forceHdrField"])
    assert.match(qml, new RegExp("SegmentedField \\{\\s+id: " + id))
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
  const pills = fs.readFileSync(path.join(__dirname, "..", "ScaleField.qml"), "utf8")
  assert.match(pills, /Math\.floor\(\(width - moreWidth - spacing \* count\) \/ count\)/, "pill cells are whole pixels")
})
