const test = require("node:test")
const assert = require("node:assert/strict")
const { fs } = require("./english")
const path = require("node:path")
const Edit = require("../FieldEdit.js")
const Model = require("./script")("Model.js")

const root = path.join(__dirname, "..")
const keys = { V: 1, Insert: 2, A: 3, Backspace: 4, Delete: 5, Left: 6, Right: 7, Home: 8, End: 9, Return: 10, Enter: 11, Up: 12, Down: 13 }

// Every QML and JS file the shell loads: the plugin's own files, not tests.
function shippedFiles() {
  return fs.readdirSync(root).filter(name => /\.(qml|js)$/.test(name))
}

test("no Qt text input is instantiated anywhere in the plugin", () => {
  // Each of these connects an editable QQuickTextInput or QQuickTextEdit to
  // QClipboard::dataChanged, so another clipboard owner could make the
  // shell read its offer with no paste.
  const types = /(^|[^\w.])(?:Controls\.|QQC\.)?(TextInput|TextEdit|TextField|TextArea|SpinBox|NumberField)\s*\{/m
  for (const name of shippedFiles()) {
    const source = fs.readFileSync(path.join(root, name), "utf8")
    assert.doesNotMatch(source, types, `${name} instantiates a Qt text input`)
  }
})

test("only an explicit paste reads the clipboard, bounded and with fixed argv", () => {
  for (const name of shippedFiles()) {
    if (name === "FieldEdit.js") continue
    const source = fs.readFileSync(path.join(root, name), "utf8")
    assert.doesNotMatch(source, /wl-paste|wl-copy|\bClipboard\.|clipboardText/, `${name} reads the clipboard`)
  }
  const command = Edit.pasteCommand()
  assert.deepEqual(command.slice(0, 2), ["sh", "-c"])
  assert.equal(command.length, 3, "nothing typed or pasted is passed as an argument")
  assert.equal(command[2], "timeout -k 1 2 wl-paste --no-newline --type text/plain 2>/dev/null | head -c 4096")
  assert.equal(Edit.pasteLimit, 4096)
  const field = fs.readFileSync(path.join(root, "KeyField.qml"), "utf8")
  assert.match(field, /pasteProcess\.command = FieldEdit\.pasteCommand\(\)/)
  assert.equal((field.match(/pasteProcess\.running = true/g) || []).length, 1, "one place starts the read")
  assert.match(field, /if \(kind === "paste"\) root\.paste\(\)/)
})

test("paste and typing are only the keys that ask for them", () => {
  assert.equal(Edit.action(keys.V, true, false, false, keys), "paste")
  assert.equal(Edit.action(keys.Insert, false, true, false, keys), "paste")
  assert.equal(Edit.action(keys.V, false, false, false, keys), "")
  assert.equal(Edit.action(keys.Insert, false, false, false, keys), "")
  assert.equal(Edit.action(keys.A, true, false, false, keys), "selectAll")
  assert.equal(Edit.action(keys.Enter, false, false, false, keys), "accept")
  assert.equal(Edit.typedText("v", false, false, false), "v")
  assert.equal(Edit.typedText("v", true, false, false), "")
  assert.equal(Edit.typedText("\u001b", false, false, false), "")
  assert.equal(Edit.typedText("\t", false, false, false), "")
})

test("pasted text is one line of printable characters, at most 4096", () => {
  assert.equal(Edit.pastedText("a\nb\r\tc\u0000d\u007f\u0085e f"), "abcdef")
  assert.equal(Edit.pastedText("\u001b[31mred"), "[31mred")
  assert.equal(Edit.pastedText("x".repeat(10000)).length, 4096)
  assert.equal(Edit.pastedText("caf�"), "caf", "a UTF-8 character cut by head -c")
  assert.equal(Edit.pastedText("\uD83D"), "", "an unpaired surrogate")
  assert.equal(Edit.pastedText("😀"), "😀")
})

test("typing inserts at the caret and replaces a selection", () => {
  let s = Edit.state("abd", 2)
  s = Edit.insert(s, "c")
  assert.deepEqual(s, { text: "abcd", cursor: 3, anchor: 3 })
  s = Edit.insert(Edit.selectAll(s), "X")
  assert.deepEqual(s, { text: "X", cursor: 1, anchor: 1 })
})

test("insertions respect the maximum length without splitting a pair", () => {
  assert.equal(Edit.insert(Edit.state("abc"), "defg", 5).text, "abcde")
  assert.equal(Edit.insert(Edit.state("abcde"), "f", 5).text, "abcde")
  assert.equal(Edit.insert(Edit.state("abcd"), "😀", 5).text, "abcd")
})

test("an input pattern rejects edits the way a Qt validator does", () => {
  const coordinate = /[-+]?\d{0,5}/
  let s = Edit.state("")
  for (const ch of "-12x34567") s = Edit.insert(s, ch, 32767, coordinate)
  assert.equal(s.text, "-12345")
  assert.equal(Edit.insert(Edit.state("1"), "-", 32767, coordinate).text, "1", "a sign only at the start")
  const decimal = /[-+]?\d*\.?\d*/
  assert.equal(Edit.insert(Edit.state("1.2"), ".", 32767, decimal).text, "1.2")
  assert.equal(Edit.insert(Edit.state("1"), "e5", 32767, decimal).text, "1")
  assert.equal(Edit.insert(Edit.state("1"), "2.5", 32767, decimal).text, "12.5")
})

test("Backspace, Delete and their Ctrl word forms", () => {
  assert.equal(Edit.backspace(Edit.state("abc", 2)).text, "ac")
  assert.equal(Edit.backspace(Edit.state("abc", 0)).text, "abc")
  assert.equal(Edit.deleteForward(Edit.state("abc", 1)).text, "ac")
  assert.equal(Edit.deleteForward(Edit.state("abc", 3)).text, "abc")
  assert.equal(Edit.backspace(Edit.state("/usr/share/icc", 14), true).text, "/usr/share/")
  assert.equal(Edit.backspace(Edit.state("dock left  ", 11), true).text, "dock ")
  assert.equal(Edit.deleteForward(Edit.state("dock left", 0), true).text, " left")
  assert.equal(Edit.backspace(Edit.selectAll(Edit.state("Desk"))).text, "")
  assert.equal(Edit.backspace(Edit.state("a😀", 3)).text, "a", "a surrogate pair is one character")
})

test("caret movement, Home/End and selection", () => {
  let s = Edit.state("hello world", 11)
  s = Edit.move(s, -1, false, false)
  assert.equal(s.cursor, 10)
  s = Edit.move(s, -1, true, false)
  assert.equal(s.cursor, 6)
  s = Edit.home(s)
  assert.deepEqual([s.cursor, s.anchor], [0, 0])
  s = Edit.move(s, 1, true, true)
  assert.deepEqual([s.cursor, s.anchor], [5, 0])
  assert.equal(s.text.slice(Edit.selectionStart(s), Edit.selectionEnd(s)), "hello")
  assert.equal(Edit.move(s, -1, false, false).cursor, 0, "Left collapses a selection to its start")
  assert.equal(Edit.move(s, 1, false, false).cursor, 5, "Right collapses it to its end")
  s = Edit.end(Edit.state("abc", 0), true)
  assert.deepEqual([s.cursor, s.anchor], [3, 0])
  assert.equal(Edit.move(Edit.state("ab", 2), 1, false, false).cursor, 2)
  assert.equal(Edit.move(Edit.state("ab", 0), -1, false, false).cursor, 0)
})

test("state clamps positions to the text", () => {
  assert.deepEqual(Edit.state("ab", 9), { text: "ab", cursor: 2, anchor: 2 })
  assert.deepEqual(Edit.state(null), { text: "", cursor: 0, anchor: 0 })
  assert.deepEqual(Edit.state("ab", -1, 7), { text: "ab", cursor: 0, anchor: 2 })
})

test("the stepper parses and clamps whole numbers", () => {
  assert.equal(Model.parseInteger(" 12 "), 12)
  assert.equal(Model.parseInteger("+3"), 3)
  assert.equal(Model.parseInteger(""), null)
  assert.equal(Model.parseInteger("1.5"), null)
  assert.equal(Model.clampInteger(99, 1, 50), 50)
  assert.equal(Model.clampInteger(0, 1, 50), 1)
  assert.equal(Model.clampInteger(null, 1, 50), null)
  assert.equal(Model.clampInteger(NaN, 1, 50), null)
})
