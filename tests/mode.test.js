const test = require("node:test")
const assert = require("node:assert/strict")
const { fs } = require("./english")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("./script")("Model.js")

const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

// The same advertised list the TUI's mode controls tests use.
const MODES = [
  "3840x2160@60.00Hz", "2560x1440@59.95Hz", "3840x2160@144.00Hz", "1920x1080@60.00Hz",
  "2560x1440@144.00Hz", "3840x2160@120.00Hz", "1080x1920@60.00Hz"
]
const displays = [{ key: "k", available_modes: MODES }]

test("resolutions are listed once, best first, like the TUI", () => {
  const modes = Model.displayModes(displays, "k", "3840x2160@144.00Hz")
  assert.equal(modes[0], "3840x2160@144.00Hz", "the current mode leads, once")
  assert.equal(modes.length, MODES.length)
  assert.deepEqual(Model.resolutionOptions(modes.concat(["preferred"])).map(o => o.value),
    ["3840x2160", "2560x1440", "1920x1080", "1080x1920", "preferred"])
})

test("Refresh lists each rate of the resolution, slowest first, as the cards print it", () => {
  const options = Model.refreshOptions(MODES, "3840x2160")
  assert.deepEqual(options, [
    { value: "3840x2160@60.00Hz", label: "60Hz" },
    { value: "3840x2160@120.00Hz", label: "120Hz" },
    { value: "3840x2160@144.00Hz", label: "144Hz" }
  ])
  assert.deepEqual(Model.refreshLabels([59.94, 60, 59.95]), ["59.94Hz", "60Hz", "59.95Hz"],
    "rates that round alike get more precision")
})

test("a resolution change keeps the rate when offered, otherwise takes the highest", () => {
  assert.equal(Model.modeForResolution(MODES, "2560x1440", 144), "2560x1440@144.00Hz")
  assert.equal(Model.modeForResolution(MODES, "1920x1080", 144), "1920x1080@60.00Hz")
  assert.equal(Model.modeForResolution(MODES, "2560x1440", 60), "2560x1440@144.00Hz",
    "59.95 is not 60, so the highest wins")
  assert.equal(Model.modeForResolution(MODES, "800x600", 60), "")
})

test("arrows step Resolution and wrap; Refresh stops at the ends and Enter wraps", () => {
  const edits = []
  let mode = "3840x2160@144.00Hz"
  const root = {
    managedChecked: true, editPending: false, previewTransaction: "", selectedOutputKey: "k",
    editorDocument: { displays },
    editOutput: edit => { edits.push(edit.mode); mode = edit.mode; refresh() },
    bounded: (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  }
  function refresh() {
    root.selectedOutput = { mode }
    root.selectedDisplayModes = Model.displayModes(displays, "k", mode)
    root.selectedRefreshOptions = Model.refreshOptions(root.selectedDisplayModes, Model.modeResolution(mode))
  }
  refresh()
  const source = name => qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  root.pillStep = vm.runInNewContext("(" + source("pillStep") + ")", { Model })
  const adjust = vm.runInNewContext("(" + source("adjustInspectorField") + ")", { root, Model })

  root.keyboardInspectorField = 1
  adjust(-1)
  assert.equal(mode, "1080x1920@60.00Hz", "left from the best resolution wraps to the last")
  adjust(-1)
  assert.equal(mode, "1920x1080@60.00Hz")
  adjust(-1)
  assert.equal(mode, "2560x1440@144.00Hz", "60Hz is not offered, so the highest")

  root.keyboardInspectorField = 23
  adjust(1)
  assert.equal(mode, "2560x1440@144.00Hz", "right on the fastest rate stays")
  adjust(1, true)
  assert.equal(mode, "2560x1440@59.95Hz", "Enter wraps to the slowest")
  adjust(-1)
  assert.equal(mode, "2560x1440@59.95Hz", "left on the slowest rate stays")
})

test("Resolution and Refresh replace Mode and only ever send the mode", () => {
  assert.match(qml, /label: "RESOLUTION"/)
  assert.match(qml, /label: "REFRESH"/)
  assert.doesNotMatch(qml, /label: "MODE"/)
  assert.match(qml, /PanelDropdown \{\s+id: refreshField/)
  assert.match(qml, /onChanged: function\(value\) \{ root\.editOutput\(\{ mode: value \}\) \}/)
  assert.match(qml, /if \(mode !== ""\) root\.editOutput\(\{ mode: mode \}\)/)
  assert.match(qml, /else if \(field === 23\) refreshField\.open\(\)/, "Enter opens Refresh's list")
})
