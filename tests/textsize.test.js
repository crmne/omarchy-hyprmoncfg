const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("../Model.js")

const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8")
const qml = read("Panel.qml")
const control = read("TextSizeControl.qml")

function panelFunction(name, root, globals = {}) {
  const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  return vm.runInNewContext("(" + source + ")", { root, Model, ...globals })
}

test("text size uses Omarchy's stops and snaps the live size to the nearest", () => {
  assert.deepEqual(Model.textSizeStops, [9, 10, 11, 12, 14, 16, 20])
  assert.equal(Model.nearestTextStop(12), 3)
  assert.equal(Model.nearestTextStop(13), 3, "a tie keeps the lower stop, as Omarchy does")
  assert.equal(Model.nearestTextStop(15), 4)
  assert.equal(Model.nearestTextStop(18), 5)
  assert.equal(Model.nearestTextStop(19), 6)
  assert.equal(Model.nearestTextStop(4), 0)
  assert.equal(Model.nearestTextStop(40), 6)
})

test("the knob and header follow the pending choice, then the live size", () => {
  assert.equal(Model.textStopIndex(-1, 12), 3)
  assert.equal(Model.textStopIndex(5, 12), 5, "a change in flight holds the knob")
  assert.equal(Model.textSizeLabel(-1, 13), "13px", "an off-stop live size is shown as it is")
  assert.equal(Model.textSizeLabel(5, 12), "16px")
  assert.equal(Model.steppedTextIndex(3, 1), 4)
  assert.equal(Model.steppedTextIndex(6, 1), 6)
  assert.equal(Model.steppedTextIndex(0, -1), 0)
  assert.equal(Model.textPreviewSettled(4, 14), true)
  assert.equal(Model.textPreviewSettled(4, 12), false)
  assert.equal(Model.textPreviewSettled(-1, 12), false)
})

function textRoot(overrides = {}) {
  const calls = []
  const proc = { running: false, command: [] }
  const root = Object.assign({
    textSizeAvailable: true, textSizePreviewIndex: -1, reflowingText: false,
    markReflowing() { root.reflowingText = true }
  }, overrides)
  const globals = { textSizeProcess: proc, Style: { font: { baseSize: 12 } } }
  root.setTextSize = panelFunction("setTextSize", root, globals)
  root.adjustTextSize = panelFunction("adjustTextSize", root, globals)
  return { root, proc, calls }
}

test("changing text size only runs Omarchy's command", () => {
  const { root, proc } = textRoot()
  root.adjustTextSize(1)
  assert.deepEqual(Array.from(proc.command), ["omarchy-display-text-size", "14"])
  assert.equal(proc.running, true)
  assert.equal(root.textSizePreviewIndex, 4)
  assert.equal(root.reflowingText, true, "hover is quiet while the panel reflows")

  const end = textRoot({ textSizePreviewIndex: 6 })
  end.root.adjustTextSize(1)
  assert.deepEqual(Array.from(end.proc.command), ["omarchy-display-text-size", "20"], "the last stop is the ceiling")
})

test("without Omarchy's command nothing runs and the row is unreachable", () => {
  const { root, proc } = textRoot({ textSizeAvailable: false })
  root.adjustTextSize(1)
  root.setTextSize(16)
  assert.deepEqual(Array.from(proc.command), [])
  assert.equal(proc.running, false)

  const cursor = { cursorIndex: 0, cursorActive: false, textSizeAvailable: false, itemCount: () => 2 }
  panelFunction("moveCursor", cursor)(-1)
  assert.equal(cursor.cursorIndex, 0)
  cursor.textSizeAvailable = true
  panelFunction("moveCursor", cursor)(-1)
  assert.equal(cursor.cursorIndex, -1, "Text size is the row above Management")
  panelFunction("moveCursor", cursor)(-1)
  assert.equal(cursor.cursorIndex, -1)
})

test("the panel delegates to Omarchy, writes nothing itself, and keeps text size out of profiles", () => {
  assert.match(qml, /textSizeProbe\.command = \["sh", "-c", "command -v omarchy-display-text-size >\/dev\/null 2>&1"\]/)
  assert.match(qml, /onExited: function\(exitCode\) \{ root\.textSizeAvailable = exitCode === 0 \}/)
  assert.equal((qml.match(/omarchy-display-text-size/g) || []).length, 3, "probe, command, and one comment")
  assert.doesNotMatch(qml, /shell\.toml|text-scaling-factor|gsettings/)
  assert.doesNotMatch(read("Model.js"), /shell\.toml|text-scaling-factor|gsettings/)
  assert.match(qml, /TextSizeControl \{\s+id: compactTextSize\s+visible: root\.textSizeAvailable/)
  assert.match(qml, /else if \(!root\.expanded && dx !== 0 && root\.cursorIndex === -1\) root\.adjustTextSize\(dx\)/)
  // Compact only, directly under Brightness.
  assert.ok(qml.indexOf("BrightnessControl {") < qml.indexOf("TextSizeControl {"))
  assert.ok(qml.indexOf("TextSizeControl {") < qml.indexOf('text: "MONITOR MANAGEMENT"'))
  assert.ok(qml.indexOf("TextSizeControl {") < qml.indexOf("id: expandedEditor"))
  // No edit, save or preview path mentions it.
  for (const name of ["editOutput", "editWorkspaces", "previewDraft"]) {
    const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
    assert.doesNotMatch(source, /textSize/i, name)
  }
})

test("reflow care: hover cannot move the cursor while the base size lands", () => {
  assert.match(qml, /onHoveredRow: if \(!root\.reflowingText\) \{/)
  assert.match(qml, /onEntered: \{\s+if \(root\.reflowingText\) return/)
  assert.match(qml, /id: reflowSettle\s+interval: 300/)
  assert.match(qml, /function onFontBaseSizeChanged\(\) \{\s+root\.markReflowing\(\)\s+if \(Model\.textPreviewSettled\(root\.textSizePreviewIndex, Style\.font\.baseSize\)\)\s+root\.textSizePreviewIndex = -1/)
  assert.match(qml, /onExited: function\(exitCode\) \{ if \(exitCode !== 0\) root\.textSizePreviewIndex = -1 \}/)
})

test("the control is Omarchy's notched slider, applied on release", () => {
  assert.match(control, /text: "TEXT SIZE"/)
  assert.match(control, /PanelSlider \{/)
  assert.match(control, /tickCount: Model\.textSizeStops\.length/)
  assert.match(control, /maximum: Model\.textSizeStops\.length - 1/)
  assert.match(control, /onReleased: function\(next\) \{ root\.committed\(Model\.textSizeStops\[Math\.round\(next\)\]\) \}/)
  assert.doesNotMatch(control, /onMoved/, "dragging previews the number only; nothing is applied mid-drag")
  assert.doesNotMatch(control, /Process \{|\.command\b/, "the control runs nothing; the panel owns the command")
})
