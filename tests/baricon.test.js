const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const vm = require("node:vm")
const path = require("node:path")

const root = path.join(__dirname, "..")
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
const qml = fs.readFileSync(path.join(root, "BarWidget.qml"), "utf8")

// Properties assigned directly on the object that opens at `header`, ignoring
// nested children: the lines one indent level deeper than the header.
function directProperties(source, header) {
  const lines = source.split("\n")
  const start = lines.findIndex((line) => line.trimEnd().endsWith(header + " {"))
  assert.notEqual(start, -1, `missing ${header} block`)
  const indent = lines[start].match(/^ */)[0].length
  const props = {}
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    const depth = line.match(/^ */)[0].length
    if (line.trim() === "}" && depth === indent) break
    const match = depth === indent + 2 && line.match(/^\s*([A-Za-z_][\w.]*)\s*:\s*(.+)$/)
    if (match) props[match[1]] = match[2].trim()
  }
  return props
}

test("the bar icon is shown by default", () => {
  const widget = manifest.barWidget
  assert.equal(widget.defaults.showBarIcon, true)
  const entry = widget.schema.find((field) => field.key === "showBarIcon")
  assert.ok(entry, "showBarIcon is not in the settings schema")
  assert.equal(entry.type, "boolean")
  assert.equal(entry.defaultValue, true)
  // A missing or null shell.json value falls back to showing the icon.
  assert.match(qml, /readonly property bool showBarIcon: root\.setting\("showBarIcon", true\) !== false/)
})

test("hiding the bar icon collapses only the slot", () => {
  const widget = directProperties(qml, "BarWidget")
  assert.equal(widget.implicitWidth, "root.showBarIcon ? button.implicitWidth : 0")
  assert.equal(widget.implicitHeight, "root.showBarIcon ? button.implicitHeight : 0")
  // The bar builds and routes to the widget root; hiding it would drop the
  // editor, the summon route and the panel window with it.
  assert.equal(widget.visible, undefined)
  assert.equal(widget.opacity, undefined)
})

test("the hidden icon still anchors the panel window", () => {
  const button = directProperties(qml, "WidgetButton")
  assert.equal(button.id, "button")
  // An invisible anchor has no window, so the panel would never map.
  assert.equal(button.visible, undefined)
  assert.equal(button.opacity, "root.showBarIcon ? 1 : 0")
  assert.equal(button["anchors.fill"], "parent")
  assert.match(qml, /if \("anchorItem" in target\) target\.anchorItem = button/)
  assert.match(qml, /if \("hostWidget" in target\) target\.hostWidget = root/)
})

test("the editor, summon route and preview service stay loaded without the icon", () => {
  const loader = directProperties(qml, "Loader")
  assert.equal(loader.id, "panelLoader")
  assert.equal(loader.active, "true")
  assert.equal(loader.source, 'Qt.resolvedUrl("Panel.qml")')
  // The shell summons panels through widgets that expose open, close and opened.
  assert.match(qml, /function open\(\) \{/)
  assert.match(qml, /function close\(\) \{/)
  assert.match(qml, /readonly property bool opened:/)
  assert.deepEqual(manifest.kinds, ["bar-widget", "service"])
  assert.equal(manifest.entryPoints.service, "PreviewGuard.qml")
  assert.doesNotMatch(fs.readFileSync(path.join(root, "PreviewGuard.qml"), "utf8"), /showBarIcon/)
})

test("a hidden icon suppresses the bar's open-panel mark", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "BarWidget.qml"), "utf8")
  for (const key of ["openPanelIndicatorWidth", "openPanelIndicatorHeight"]) {
    const value = qml.match(new RegExp("property real " + key + ": (.+)"))[1]
    const hint = showBarIcon => vm.runInNewContext(value, { root: { showBarIcon } })
    // Omarchy's Bar.qml: a hint > 0 is used rounded; anything else falls back
    // to a minimum length.
    assert.equal(hint(true), 0, key + " keeps the default mark for a visible icon")
    assert.ok(hint(false) > 0 && Math.round(hint(false)) === 0, key + " empties the mark for a hidden icon")
  }
})
