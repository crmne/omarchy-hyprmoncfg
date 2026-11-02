const test = require("node:test")
const assert = require("node:assert/strict")
const { fs } = require("./english")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("./script")("Model.js")

const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

// scale_info replies from hyprmoncfg (scaling.Describe), keyed by
// Model.scaleInfoKey. Sharpness is Go's; these only feed the panel's wording.
const INFO = {"3840x2160@1":{"scale":1,"sharp":true,"logical":[3840,2160],"apply":1,"presets":[1,1.25,1.5,1.6,2,3],"options":[1,1.06667,1.2,1.25,1.33333,1.5,1.6,1.66667,1.875,2,2.4,2.5,2.66667,3,3.2,3.33333,3.75,4]},"3840x2160@1.33":{"scale":1.33,"sharp":false,"logical":[2887.218045112782,1624.0601503759397],"closest":1.33333,"closest_logical":[2880,1620],"apply":1.33333,"presets":[1,1.25,1.5,1.6,2,3],"options":[1,1.06667,1.2,1.25,1.33333,1.5,1.6,1.66667,1.875,2,2.4,2.5,2.66667,3,3.2,3.33333,3.75,4]},"3840x2160@1.5":{"scale":1.5,"sharp":true,"logical":[2560,1440],"apply":1.5,"presets":[1,1.25,1.5,1.6,2,3],"options":[1,1.06667,1.2,1.25,1.33333,1.5,1.6,1.66667,1.875,2,2.4,2.5,2.66667,3,3.2,3.33333,3.75,4]},"3840x2160@1.7":{"scale":1.7,"sharp":false,"logical":[2258.823529411765,1270.5882352941176],"closest":1.66667,"closest_logical":[2304,1296],"apply":1.66667,"presets":[1,1.25,1.5,1.6,2,3],"options":[1,1.06667,1.2,1.25,1.33333,1.5,1.6,1.66667,1.875,2,2.4,2.5,2.66667,3,3.2,3.33333,3.75,4]},"3840x2160@2.66667":{"scale":2.66667,"sharp":true,"logical":[1440,810],"apply":2.66667,"presets":[1,1.25,1.5,1.6,2,3],"options":[1,1.06667,1.2,1.25,1.33333,1.5,1.6,1.66667,1.875,2,2.4,2.5,2.66667,3,3.2,3.33333,3.75,4]}}
const info = (scale) => INFO["3840x2160@" + Model.formatScale(scale)]
const STUDIO_4K = INFO["3840x2160@1"].options
const displays = sharp => [{ key: "k", scale_options: sharp }]

const rows = row => row.options.filter(o => !o.separator)
const presets = row => row.options.slice(0, row.options.findIndex(o => o.separator))

test("the list comes from scale_info: presets, a separator, then every other sharp scale", () => {
  const row = Model.scaleRow(displays([1, 2]), "k", 1.5, info(1.5))
  assert.equal(row.supported, true)
  assert.deepEqual(presets(row).map(p => p.label), ["1x", "1.25x", "1.5x", "1.6x", "2x", "3x"])
  assert.deepEqual(rows(row).map(o => Number(o.value)).sort((a, b) => a - b), STUDIO_4K, "not the display's scale_options")
  assert.equal(row.options.filter(o => o.separator).length, 1)
  assert.equal(row.triggerText, "1.5x")
  assert.equal(row.detail, "")
})

test("compact labels: two decimals, zeros trimmed, exact when two would collide", () => {
  const labels = Model.compactScaleLabels([1, 1.06667, 1.33333, 1.875, 2, 2.13333])
  assert.deepEqual(labels, { "1": "1x", "1.06667": "1.07x", "1.33333": "1.33x", "1.875": "1.88x", "2": "2x", "2.13333": "2.13x" })
  const clash = Model.compactScaleLabels([1.33333, 1.334])
  assert.deepEqual(clash, { "1.33333": "1.33333x", "1.334": "1.334x" }, "no two choices read alike")
  const options = Model.scaleOptions([], "k", 1.5, info(1.5))
  assert.equal(options[1].value, "1.06667", "the stored value stays exact")
  assert.equal(options[1].label, "1.07x")
})

test("a Blurry scale is marked on the trigger, with Blurry in the header", () => {
  const blurry = Model.scaleRow([], "k", 1.7, info(1.7))
  assert.equal(presets(blurry).length, 6, "no extra preset")
  assert.equal(blurry.triggerText, "1.7x ⚠")
  assert.equal(blurry.detail, "Blurry")
  assert.equal(blurry.sharp, false)
  assert.deepEqual(blurry.options.find(o => o.value === "1.7"), { value: "1.7", label: "1.7x ⚠", sharp: false })

  const sharpNonPreset = Model.scaleRow([], "k", 2.66667, info(2.66667))
  assert.equal(sharpNonPreset.triggerText, "2.67x")
  assert.equal(sharpNonPreset.detail, "")
  assert.equal(sharpNonPreset.sharp, true)
})

test("without scale_info (an older daemon) nothing is guessed", () => {
  const row = Model.scaleRow(displays([1, 1.33333, 2]), "k", 1.7, null)
  assert.equal(row.supported, false, "no Custom…")
  assert.equal(row.sharp, true, "no Blurry verdict")
  assert.equal(row.detail, "")
  assert.equal(row.triggerText, "1.7x")
  assert.deepEqual(row.options.map(o => o.label), ["1x", "1.33x", "1.7x", "2x"], "the list falls back to scale_options, with no separator")
})

test("stepping through every sharp scale never changes the presets", () => {
  const options = Model.scaleOptions([], "k", 1, info(1))
  let value = "1"
  for (let i = 0; i < 25; i++) {
    const row = Model.scaleRow([], "k", Number(value), { presets: info(1).presets, options: STUDIO_4K, sharp: true })
    assert.equal(presets(row).length, 6)
    value = Model.stepScaleOption(options, value, 1)
  }
})

test("Custom… parses only, and words Go's verdict like the TUI", () => {
  assert.deepEqual(Model.parseScaleEntry(""), { error: "scale is required" })
  assert.deepEqual(Model.parseScaleEntry("1."), { error: "scale must be a number" })
  assert.deepEqual(Model.parseScaleEntry("abc"), { error: "scale must be a number" })
  assert.deepEqual(Model.parseScaleEntry("9"), { value: 9 }, "the range is Go's to check")

  assert.deepEqual(Model.scaleEntryLines(3840, 2160, "1.5", info(1.5)),
    { apply: 1.5, lines: [{ tone: "ok", text: "Sharp: 3840 / 1.5 = 2560, 2160 / 1.5 = 1440 logical px." }] })
  const blurry = Model.scaleEntryLines(3840, 2160, "1.33", info(1.33))
  assert.equal(blurry.apply, 1.33, "sent with snap_scale; Go applies the closest sharp scale")
  assert.deepEqual(blurry.lines.map(l => l.text), [
    "⚠ Blurry: final size has fractional px (3840 / 1.33 = 2887.22, 2160 / 1.33 = 1624.06).",
    "Closest sharp: 1.33333 -> 2880 x 1620 logical px. Enter applies it."
  ])
  assert.deepEqual(Model.scaleEntryLines(3840, 2160, "1.33", null), { lines: [], apply: null }, "waits for Go")
  const range = Model.scaleEntryLines(3840, 2160, "9", { error: "scale must be between 0.25 and 4" })
  assert.equal(range.apply, null)
  assert.deepEqual(range.lines, [{ tone: "error", text: "scale must be between 0.25 and 4" }])
})

test("scale_info replies are cached; an unknown method turns the feature off", () => {
  const sent = []
  const root = { scaleInfoSupported: true, scaleInfos: {}, scaleInfoPending: {},
    send: (method, params, context) => { sent.push({ method, params, context }); return "1" } }
  const source = name => qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  const env = { root, Model, backendSocket: { connected: true } }
  root.requestScaleInfo = vm.runInNewContext("(" + source("requestScaleInfo") + ")", env)
  root.receiveScaleInfo = vm.runInNewContext("(" + source("receiveScaleInfo") + ")", env)
  root.requestScaleInfo(3840, 2160, 1.33)
  root.requestScaleInfo(3840, 2160, 1.33)
  assert.equal(sent.length, 1, "one request in flight per mode and scale")
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].params)), { width: 3840, height: 2160, scale: 1.33 })
  root.receiveScaleInfo(sent[0].context.scaleKey, { result: info(1.33) })
  assert.equal(root.scaleInfos["3840x2160@1.33"].sharp, false)
  root.requestScaleInfo(3840, 2160, 1.33)
  assert.equal(sent.length, 1, "cached")

  root.requestScaleInfo(3840, 2160, 1.5)
  root.receiveScaleInfo(sent[1].context.scaleKey, { error: { message: 'unknown IPC method "scale_info"' } })
  assert.equal(root.scaleInfoSupported, false)
  root.requestScaleInfo(3840, 2160, 2)
  assert.equal(sent.length, 2, "an older daemon is not asked again")
})

test("keyboard steps through the full sharp list like the TUI and stops at the ends", () => {
  const options = Model.scaleOptions([], "k", 1.5, info(1.5))
  assert.equal(Model.stepScaleOption(options, "1.5", 1), "1.6")
  assert.equal(Model.stepScaleOption(options, "1.5", -1), "1.33333", "steps include sharp scales that are not presets")
  assert.equal(Model.stepScaleOption(options, "4", 1), "4")
  assert.equal(Model.stepScaleOption(options, "1", -1), "1")
  assert.equal(Model.stepScaleOption(options, "1.55", 1), "1.6")
  assert.equal(Model.stepScaleOption(options, "1.55", -1), "1.5")
  assert.equal(Model.stepScaleOption([], "1.5", 1), "1.5")
})

test("arrows step Scale; Enter opens the list", () => {
  const edits = []
  let opened = 0
  const root = {
    selectedOutput: { scale: 1.5 }, managedChecked: true, editPending: false, previewTransaction: "",
    keyboardInspectorField: 2, selectedOutputKey: "k", selectedScaleInfo: info(1.5),
    editorDocument: { displays: [] },
    editOutput: edit => edits.push(JSON.parse(JSON.stringify(edit))),
    bounded: (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  }
  const source = name => qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  root.adjustInspectorField = vm.runInNewContext("(" + source("adjustInspectorField") + ")", { root, Model })
  const activate = vm.runInNewContext("(" + source("activateInspectorField") + ")",
    { root, Model, scaleField: { dropdown: { open() { opened++ } } } })
  root.adjustInspectorField(1)
  root.adjustInspectorField(-1)
  activate()
  assert.deepEqual(edits, [{ scale: 1.6 }, { scale: 1.33333 }])
  assert.equal(opened, 1)
})

test("Scale is a selector fed by the backend list", () => {
  const scale = fs.readFileSync(path.join(__dirname, "..", "ScaleField.qml"), "utf8")
  const dropdown = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")
  assert.match(qml, /ScaleField \{\s+id: scaleField/)
  assert.match(qml, /readonly property var row: Model\.scaleRow\(root\.editorDocument\.displays, root\.selectedOutputKey,\s+root\.selectedOutput \? root\.selectedOutput\.scale : 1, root\.selectedScaleInfo\)/)
  assert.match(qml, /onCustomApplied: function\(value\) \{ root\.editOutput\(\{ scale: value, snap_scale: true \}\) \}/)
  assert.match(qml, /root\.send\("scale_info", \{ width: w, height: h, scale: value \}/)
  assert.match(qml, /options: row\.options\s+sharp: row\.sharp\s+triggerText: row\.triggerText/)
  assert.match(qml, /else if \(field === 2\) scaleField\.dropdown\.open\(\)/)
  assert.match(qml, /scaleField\.dropdown\.popupOpen/)
  assert.match(qml, /scaleField\.customInput\.activeFocus/, "typing a custom scale holds the panel's keys")
  assert.match(scale, /options: root\.customAvailable \? root\.options\.concat\(\[\{ value: "custom", label: "Custom…" \}\]\) : root\.options/)
  assert.match(scale, /KeyField \{\s+id: customInput/, "Custom… is built from key events")
  assert.doesNotMatch(scale, /TextField|TextInput|SpinBox/)
  assert.match(scale, /label: "SCALE"/)
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
