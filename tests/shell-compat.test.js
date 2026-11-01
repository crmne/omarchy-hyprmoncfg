// The plugin must load on the oldest Omarchy it supports. Using a Commons or Ui
// name that shell lacks fails only when the file loads there, and takes the
// whole widget with it (crmne/omarchy-hyprmoncfg#44). tests/shell-baseline.json
// holds that shell's names; tools/shell-baseline.js regenerates it.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { parseQml } = require("./shell-names")

const root = path.join(__dirname, "..")
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "shell-baseline.json"), "utf8"))
const shellTypes = { ...baseline.Commons, ...baseline.Ui }
const files = fs.readdirSync(root).filter(name => name.endsWith(".qml"))
const scripts = fs.readdirSync(root).filter(name => name.endsWith(".js"))
const localTypes = new Set(files.flatMap(name => [name.slice(0, -4),
  ...[...fs.readFileSync(path.join(root, name), "utf8").matchAll(/^\s*component (\w+)\s*:/gm)].map(match => match[1])]))

// Loaded only through a guard that survives its failure: see Strings.js.
const guarded = new Set(["StringsSource.qml"])
const bundledCommands = new Set(["omarchy-terminal-font-size"])

// Everything else a plugin file may instantiate. A new Qt or Quickshell type
// goes here; a type that isn't one is a shell name the baseline lacks.
const otherTypes = new Set(`Canvas Column Component Connections Flickable Flow FocusScope GradientStop Grid
  HoverHandler Item ListView Loader MouseArea NumberAnimation ParallelAnimation PauseAnimation Popup Process
  PanelWindow QtObject Rectangle Region Repeater Row ScriptAction SequentialAnimation Shortcut Socket SplitParser
  StdioCollector Text TextInput TextMetrics Timer Variants Window Gradient IpcHandler Scope PropertyAnimation
  Behavior ColorAnimation TextEdit TapHandler Image ScrollBar`.split(/\s+/))

// Item, Rectangle, Text and positioner properties a shell type inherits from Qt.
const qtMembers = new Set(`activeFocus activeFocusOnTab anchors antialiasing baselineOffset border bottomPadding
  childrenRect clip color data elide enabled focus font forceActiveFocus gradient height horizontalAlignment
  implicitHeight implicitWidth layer leftPadding mapFromItem mapToItem maximumLineCount objectName opacity padding
  paintedHeight paintedWidth parent radius renderType rightPadding rotation scale screen spacing states text
  textFormat topPadding transformOrigin transitions verticalAlignment visible width wrapMode x y z bottom top left
  right horizontalCenter verticalCenter contains children resources`.split(/\s+/))

const unqualified = type => type.replace(/^(?:Commons|Ui)\./, "")
const known = (type, member) => shellTypes[type].members.includes(member) || qtMembers.has(member)

function handlerTarget(binding) {
  const name = binding.slice(2).replace(/(?<=.)Changed$/, "")
  return name[0].toLowerCase() + name.slice(1)
}

test("every type a plugin file uses exists in the oldest supported shell", () => {
  const unknown = []
  for (const file of files.filter(name => !guarded.has(name))) {
    for (const { type } of parseQml(fs.readFileSync(path.join(root, file), "utf8")).objects) {
      const name = unqualified(type)
      if (localTypes.has(name) || shellTypes[name] || otherTypes.has(name)) continue
      unknown.push(file + ": " + type)
    }
  }
  assert.deepEqual([...new Set(unknown)], [], "not in Omarchy " + baseline.version)
})

test("properties set on shell types exist in the oldest supported shell", () => {
  const unknown = []
  for (const file of files) {
    for (const object of parseQml(fs.readFileSync(path.join(root, file), "utf8")).objects) {
      const name = unqualified(object.type)
      if (localTypes.has(name) || !shellTypes[name] || shellTypes[name].singleton) continue
      for (const binding of object.bindings) {
        if (/^[A-Z]/.test(binding) || binding === "id") continue // Attached properties.
        const member = /^on[A-Z]/.test(binding) ? handlerTarget(binding) : binding
        if (!known(name, member) && !object.declared.includes(member)) unknown.push(file + ": " + name + "." + binding)
      }
    }
  }
  assert.deepEqual([...new Set(unknown)], [], "not in Omarchy " + baseline.version)
})

test("members read from a shell object by id exist in the oldest supported shell", () => {
  const unknown = []
  for (const file of files) {
    const { text, objects } = parseQml(fs.readFileSync(path.join(root, file), "utf8"))
    for (const object of objects) {
      const name = unqualified(object.type)
      if (!object.id || localTypes.has(name) || !shellTypes[name]) continue
      for (const match of text.matchAll(new RegExp("\\b" + object.id + "\\.(\\w+)(\\s*\\|\\|)?", "g"))) {
        if (!match[2] && !known(name, match[1]) && !object.declared.includes(match[1])) unknown.push(file + ": " + object.id + "." + match[1])
      }
    }
  }
  assert.deepEqual([...new Set(unknown)], [], "not in Omarchy " + baseline.version)
})

// `Style.bar.iconSize || fallback` is how a file reads a newer name safely.
test("singleton members exist in the oldest supported shell, or read through ||", () => {
  const unknown = []
  const pattern = /(?<![\w.])(?:Commons\.)?(Style|Border|Util)\.(\w+(?:\.\w+)?)(?:(\s*\|\|)|\b)/g
  for (const file of [...files, ...scripts]) {
    const { text } = parseQml(fs.readFileSync(path.join(root, file), "utf8"))
    for (const match of text.matchAll(pattern)) {
      const members = baseline.Commons[match[1]].members
      const [first] = match[2].split(".")
      if (match[3] || members.includes(match[2])) continue
      if (members.includes(first) && !members.some(member => member.startsWith(first + "."))) continue
      unknown.push(file + ": " + match[1] + "." + match[2])
    }
    for (const match of text.matchAll(/\bCommons\.(\w+)/g)) {
      if (!guarded.has(file) && !baseline.Commons[match[1]]) unknown.push(file + ": Commons." + match[1])
    }
  }
  assert.deepEqual([...new Set(unknown)], [], "not in Omarchy " + baseline.version)
})

test("omarchy commands exist in the oldest supported shell or ship here", () => {
  const unknown = []
  for (const file of [...files, ...scripts]) {
    const text = fs.readFileSync(path.join(root, file), "utf8")
    for (const match of text.matchAll(/\b(omarchy-[a-z][a-z-]*[a-z])\b/g)) {
      if (!baseline.commands.includes(match[1]) && !bundledCommands.has(match[1])) unknown.push(file + ": " + match[1])
    }
  }
  assert.deepEqual([...new Set(unknown)].filter(name => !/hyprmoncfg/.test(name)), [], "not in Omarchy " + baseline.version)
})

test("the check catches what it should", () => {
  const { objects } = parseQml(`import qs.Ui
Item {
  id: a
  OpticalGlyph { id: glyph; paintedSize: 1
    onTextChanged: { var x = { fake: 1 } }
  }
}`)
  assert.equal(objects[1].type, "OpticalGlyph")
  assert.deepEqual(objects[1].bindings, ["paintedSize", "onTextChanged"])
  assert.equal(known("OpticalGlyph", "paintedSize"), false)
  assert.equal(shellTypes.ShellIpc, undefined)
  assert.equal(baseline.Commons.Style.members.includes("bar.iconSize"), false)
  assert.equal(baseline.Commons.Style.members.includes("bar.iconFont"), true)
})
