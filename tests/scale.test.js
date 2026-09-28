const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("../Model.js")

const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

// Parity vectors generated from hyprmoncfg internal/scaling (GridScales(w, h, 1, 4),
// the editor_state scale_options list) and an independent Go implementation of the
// preset rule. The TUI mirrors the same vectors.
const CASES = [{"mode": [3840, 2160], "sharp": [1, 1.06667, 1.2, 1.25, 1.33333, 1.5, 1.6, 1.66667, 1.875, 2, 2.4, 2.5, 2.66667, 3, 3.2, 3.33333, 3.75, 4], "pills": [1, 1.25, 1.5, 1.6, 2, 3], "labels": ["1x", "1.25x", "1.5x", "1.6x", "2x", "3x"]}, {"mode": [2560, 1600], "sharp": [1, 1.06667, 1.25, 1.33333, 1.6, 1.66667, 2, 2.13333, 2.5, 2.66667, 3.2, 3.33333, 4], "pills": [1, 1.25, 1.6, 2, 3.2], "labels": ["1x", "1.25x", "1.6x", "2x", "3.2x"]}, {"mode": [2256, 1504], "sharp": [1, 1.06667, 1.175, 1.33333, 1.56667, 1.6, 1.95833, 2, 2.35, 2.66667, 3.13333, 3.2, 3.91667, 4], "pills": [1, 1.33333, 1.56667, 1.6, 2, 3.13333], "labels": ["1x", "1.33x", "1.57x", "1.6x", "2x", "3.13x"]}, {"mode": [5120, 2880], "sharp": [1, 1.06667, 1.25, 1.33333, 1.6, 1.66667, 2, 2.13333, 2.5, 2.66667, 3.2, 3.33333, 4], "pills": [1, 1.25, 1.6, 2, 3.2, 4], "labels": ["1x", "1.25x", "1.6x", "2x", "3.2x", "4x"]}, {"mode": [3024, 1964], "sharp": [1, 1.33333, 2, 4], "pills": [1, 1.33333, 2, 4], "labels": ["1x", "1.33x", "2x", "4x"]}, {"mode": [1366, 768], "sharp": [1, 2], "pills": [1, 2], "labels": ["1x", "2x"]}, {"mode": [7680, 4320], "sharp": [1, 1.06667, 1.2, 1.25, 1.33333, 1.5, 1.6, 1.66667, 1.875, 2, 2.13333, 2.4, 2.5, 2.66667, 3, 3.2, 3.33333, 3.75, 4], "pills": [1, 1.25, 1.5, 1.6, 2, 3, 4], "labels": ["1x", "1.25x", "1.5x", "1.6x", "2x", "3x", "4x"]}]

const STUDIO_4K = CASES[0].sharp
const displays = sharp => [{ key: "k", scale_options: sharp }]

test("preset pills map like Omarchy: next sharp scale at or above, deduplicated, preset order", () => {
  for (const c of CASES) {
    const [width] = c.mode
    const pills = Model.scalePresets(displays(c.sharp), "k", c.pills[0], width)
    assert.deepEqual(pills.map(p => Number(p.value)), c.pills, c.mode.join("x"))
    assert.deepEqual(pills.map(p => p.label), c.labels, c.mode.join("x") + " labels")
  }
})

test("4x is a preset only on 5K-class modes where it is sharp", () => {
  const fourK = Model.scalePresets(displays(STUDIO_4K), "k", 1, 3840).map(p => p.value)
  assert.ok(STUDIO_4K.includes(4) && !fourK.includes("4"), "sharp on 4K, but not offered as a preset")
  const fiveK = CASES.find(c => c.mode[0] === 5120)
  assert.ok(Model.scalePresets(displays(fiveK.sharp), "k", 1, 5120).some(p => p.value === "4"))
})

test("compact labels: two decimals, zeros trimmed, exact when two would collide", () => {
  const labels = Model.compactScaleLabels([1, 1.06667, 1.33333, 1.875, 2, 2.13333])
  assert.deepEqual(labels, { "1": "1x", "1.06667": "1.07x", "1.33333": "1.33x", "1.875": "1.88x", "2": "2x", "2.13333": "2.13x" })
  const clash = Model.compactScaleLabels([1.33333, 1.334])
  assert.deepEqual(clash, { "1.33333": "1.33333x", "1.334": "1.334x" }, "no two choices read alike")
  const options = Model.scaleOptions(displays(STUDIO_4K), "k", 1.5)
  assert.equal(options[1].value, "1.06667", "the stored value stays exact")
  assert.equal(options[1].label, "1.07x")
})

test("More lists every sharp scale; an unsharp current value is its own selected pill", () => {
  const all = Model.scaleOptions(displays(STUDIO_4K), "k", 1.5)
  assert.deepEqual(all.map(o => Number(o.value)), STUDIO_4K)

  const current = Model.scalePresets(displays(STUDIO_4K), "k", 1.7, 3840)
  assert.deepEqual(current.map(p => p.value), ["1", "1.25", "1.5", "1.6", "1.7", "2", "3"])
  assert.equal(current[4].label, "1.7x")
  assert.ok(Model.scaleOptions(displays(STUDIO_4K), "k", 1.7).some(o => o.value === "1.7"), "and it is in More")

  const sharpNonPreset = Model.scalePresets(displays(STUDIO_4K), "k", 2.66667, 3840)
  assert.deepEqual(sharpNonPreset.map(p => p.label), ["1x", "1.25x", "1.5x", "1.6x", "2x", "2.67x", "3x"])
  assert.equal(Model.scalePresets([], "none", 1.25, 0).map(p => p.value).join(), "1.25", "no backend list: the current value only")
})

test("keyboard steps through the full sharp list like the TUI and stops at the ends", () => {
  const options = Model.scaleOptions(displays(STUDIO_4K), "k", 1.5)
  assert.equal(Model.stepScaleOption(options, "1.5", 1), "1.6")
  assert.equal(Model.stepScaleOption(options, "1.5", -1), "1.33333", "steps include sharp scales that are not presets")
  assert.equal(Model.stepScaleOption(options, "4", 1), "4")
  assert.equal(Model.stepScaleOption(options, "1", -1), "1")
  assert.equal(Model.stepScaleOption(options, "1.55", 1), "1.6")
  assert.equal(Model.stepScaleOption(options, "1.55", -1), "1.5")
  assert.equal(Model.stepScaleOption([], "1.5", 1), "1.5")
})

test("arrows step Scale; Enter opens More", () => {
  const edits = []
  let opened = 0
  const root = {
    selectedOutput: { scale: 1.5 }, managedChecked: true, editPending: false, previewTransaction: "",
    keyboardInspectorField: 2, selectedOutputKey: "k",
    editorDocument: { displays: displays(STUDIO_4K) },
    editOutput: edit => edits.push(JSON.parse(JSON.stringify(edit))),
    bounded: (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  }
  const source = name => qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  root.adjustInspectorField = vm.runInNewContext("(" + source("adjustInspectorField") + ")", { root, Model })
  const activate = vm.runInNewContext("(" + source("activateInspectorField") + ")",
    { root, Model, scaleField: { more: { open() { opened++ } } } })
  root.adjustInspectorField(1)
  root.adjustInspectorField(-1)
  activate()
  assert.deepEqual(edits, [{ scale: 1.6 }, { scale: 1.33333 }])
  assert.equal(opened, 1)
})

test("Scale is Omarchy's pill row plus a More dropdown, fed by the backend list", () => {
  const scale = fs.readFileSync(path.join(__dirname, "..", "ScaleField.qml"), "utf8")
  const dropdown = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")
  assert.match(qml, /ScaleField \{\s+id: scaleField/)
  assert.match(qml, /presets: Model\.scalePresets\(root\.editorDocument\.displays, root\.selectedOutputKey,/)
  assert.match(qml, /allOptions: Model\.scaleOptions\(root\.editorDocument\.displays, root\.selectedOutputKey,/)
  assert.match(qml, /else if \(field === 2\) scaleField\.more\.open\(\)/)
  assert.match(qml, /scaleField\.more\.popupOpen/)
  assert.doesNotMatch(qml, /scaleDropdown/)
  assert.match(scale, /bordered: true/)
  assert.match(scale, /active: String\(modelData\.value\) === root\.value/, "Omarchy's ScalePill marks the current scale as active")
  assert.match(scale, /triggerText: "More"/)
  assert.match(scale, /options: root\.allOptions/)
  assert.match(scale, /text: "SCALE"/)
  assert.match(dropdown, /text: root\.triggerText !== "" \? root\.triggerText : root\.currentLabel\(\)/)
})

test("pill rows stop at their ends like Omarchy's ButtonGroup", () => {
  const vrr = [{ value: "0", label: "Off" }, { value: "1", label: "On" }, { value: "2", label: "Fullscreen" }]
  assert.equal(Model.stepOptionValue(vrr, "2", 1), "2")
  assert.equal(Model.stepOptionValue(vrr, "0", -1), "0")
  assert.equal(Model.stepOptionValue(vrr, "1", 1), "2")
  assert.equal(Model.stepOptionValue(vrr, "7", 1), "7", "an unrecognised value is never rewritten")
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  for (const field of ["edit.vrr", "edit.bitdepth", "edit.sdr_eotf", "edit.supports_wide_color", "edit.supports_hdr"]) {
    const line = qml.split("\n").find(l => l.includes(field + " = "))
    assert.match(line, /root\.pillStep\(/, field + " should stop at the ends")
  }
})
