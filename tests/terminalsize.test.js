const test = require("node:test")
const assert = require("node:assert/strict")
const { fs } = require("./english")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { execFileSync, spawnSync } = require("node:child_process")
const Model = require("./script")("Model.js")

const repo = path.join(__dirname, "..")
const read = name => fs.readFileSync(path.join(repo, name), "utf8")
const qml = read("Panel.qml")
const bundled = path.join(repo, "bin", "omarchy-terminal-font-size")

function panelFunction(name, root, globals = {}) {
  const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  return vm.runInNewContext("(" + source + ")", { root, Model, ...globals })
}

// A scratch home with one config per terminal, and stubs for everything that
// would reach the running desktop: no signal or notification leaves the test.
function scratch(stubs = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-size-"))
  const home = path.join(dir, "home")
  const bin = path.join(dir, "bin")
  const calls = path.join(dir, "calls.log")
  const config = name => path.join(home, ".config", name)
  for (const name of ["alacritty", "ghostty", "kitty", "foot"]) fs.mkdirSync(config(name), { recursive: true })
  fs.writeFileSync(config("alacritty/alacritty.toml"), '[font]\nnormal = { family = "Mono" }\nsize = 9\n')
  fs.writeFileSync(config("ghostty/config"), 'font-family = "Mono"\nfont-size = 9\n')
  fs.writeFileSync(config("kitty/kitty.conf"), "include kitty.d/theme.conf\n")
  fs.writeFileSync(config("foot/foot.ini"), "[main]\nfont=Mono:size=9\n")
  fs.mkdirSync(bin)
  const all = {
    pkill: `printf 'pkill %s\\n' "$*" >>"${calls}"`,
    pgrep: "exit 1",
    "omarchy-notification-send": `printf 'notify %s\\n' "$*" >>"${calls}"`,
    ...stubs
  }
  for (const [name, body] of Object.entries(all)) {
    fs.writeFileSync(path.join(bin, name), "#!/bin/sh\n" + body + "\n", { mode: 0o755 })
  }
  const env = { HOME: home, PATH: bin + ":/usr/bin:/bin", XDG_RUNTIME_DIR: dir }
  const run = (command, args = []) => spawnSync(command, args, { env, encoding: "utf8" })
  const sizes = () => [
    read2(config("alacritty/alacritty.toml")).match(/^size = (.*)$/m)[1],
    read2(config("ghostty/config")).match(/^font-size = (.*)$/m)[1],
    (read2(config("kitty/kitty.conf")).match(/^font_size (.*)$/m) || [])[1],
    read2(config("foot/foot.ini")).match(/:size=([0-9.]+)/)[1]
  ].join("|")
  return { dir, home, calls, config, run, sizes, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}
const read2 = file => fs.readFileSync(file, "utf8")

test("terminal sizes use their own stops, in points", () => {
  assert.deepEqual(Model.terminalSizeStops, [8, 9, 10, 11, 12, 14, 16, 18])
  assert.equal(Model.terminalStopIndex(-1, 9), 1)
  assert.equal(Model.terminalStopIndex(-1, 13), 4, "an off-stop size snaps to the nearest, lower on a tie")
  assert.equal(Model.terminalStopIndex(6, 9), 6, "a change in flight holds the knob")
  assert.equal(Model.terminalSizeLabel(-1, 13), "13pt", "the live size is shown as it is")
  assert.equal(Model.terminalSizeLabel(4, 9), "12pt")
  assert.equal(Model.steppedTerminalIndex(7, 1), 7)
  assert.equal(Model.steppedTerminalIndex(0, -1), 0)
  assert.equal(Model.parseTerminalSize("12\n"), 12)
  assert.equal(Model.parseTerminalSize(""), 0, "no terminal config hides the row")
  assert.equal(Model.parseTerminalSize("n/a"), 0)
})

test("Text size and Terminal are the rows above Management, top to bottom", () => {
  const both = Model.compactTopRows(true, true)
  assert.deepEqual(both, ["textsize", "terminal"])
  assert.equal(Model.compactTopRow(both, -2), "textsize")
  assert.equal(Model.compactTopRow(both, -1), "terminal")
  assert.equal(Model.compactTopRow(both, 0), "")
  assert.equal(Model.compactTopIndex(both, "textsize"), -2)
  assert.equal(Model.compactTopIndex(both, "terminal"), -1)
  assert.deepEqual(Model.compactTopRows(false, true), ["terminal"])
  assert.equal(Model.compactTopRow(["terminal"], -1), "terminal")

  const cursor = { cursorIndex: 0, cursorActive: false, compactTopRows: both, itemCount: () => 2 }
  const move = panelFunction("moveCursor", cursor)
  move(-1)
  assert.equal(cursor.cursorIndex, -1, "Up from Management reaches Terminal")
  move(-1)
  assert.equal(cursor.cursorIndex, -2, "then Text size")
  move(-1)
  assert.equal(cursor.cursorIndex, -2, "and stops there")
})

function terminalRoot(overrides = {}) {
  const proc = { running: false, command: [] }
  const root = Object.assign({
    terminalSize: 9, terminalSizePreviewIndex: -1, terminalSizeAvailable: true,
    bundledTerminalSizeCommand: "/plugin/bin/omarchy-terminal-font-size"
  }, overrides)
  const globals = { terminalSizeProcess: proc }
  root.terminalSizeCommand = panelFunction("terminalSizeCommand", root, globals)
  root.setTerminalSize = panelFunction("setTerminalSize", root, globals)
  root.adjustTerminalSize = panelFunction("adjustTerminalSize", root, globals)
  return { root, proc }
}

test("changing the terminal size runs only the terminal command, and Left/Right step it", () => {
  const { root, proc } = terminalRoot()
  root.adjustTerminalSize(1)
  const command = Array.from(proc.command)
  assert.deepEqual(command.slice(0, 2), ["sh", "-c"])
  assert.deepEqual(command.slice(3), ["/plugin/bin/omarchy-terminal-font-size", "10"])
  assert.equal(proc.running, true)
  assert.equal(root.terminalSizePreviewIndex, 2)

  const off = terminalRoot({ terminalSizeAvailable: false, terminalSize: 0 })
  off.root.adjustTerminalSize(1)
  off.root.setTerminalSize(12)
  assert.equal(off.proc.running, false, "without a terminal config nothing runs")

  const adjusted = []
  const row = { cursorIndex: -1, compactTopRows: ["textsize", "terminal"],
    adjustTextSize: d => adjusted.push("text " + d), adjustTerminalSize: d => adjusted.push("terminal " + d) }
  panelFunction("adjustCompactTopRow", row)(1)
  row.cursorIndex = -2
  panelFunction("adjustCompactTopRow", row)(-1)
  assert.deepEqual(adjusted, ["terminal 1", "text -1"])
})

test("Omarchy's own command wins; the bundled copy runs only on Omarchy", () => {
  const { root } = terminalRoot({ bundledTerminalSizeCommand: "" })
  const script = Array.from(root.terminalSizeCommand([]))[2]
  const runWith = (stubs, args) => {
    const s = scratch(stubs)
    try {
      const fake = path.join(s.dir, "bundled")
      fs.writeFileSync(fake, 'echo "bundled $*"\n')
      // Only the stubs and bash: the machine's own Omarchy must not answer.
      fs.symlinkSync("/usr/bin/bash", path.join(s.dir, "bin", "bash"))
      return execFileSync("/bin/sh", ["-c", script, fake, ...args], { env: { PATH: path.join(s.dir, "bin") }, encoding: "utf8" })
    } finally { s.cleanup() }
  }
  assert.equal(runWith({ "omarchy-terminal-font-size": 'echo "omarchy $*"', "omarchy-cmd-present": "exit 0" }, ["12"]), "omarchy 12\n")
  assert.equal(runWith({ "omarchy-cmd-present": "exit 0" }, ["12"]), "bundled 12\n")
  assert.equal(runWith({}, ["12"]), "", "off Omarchy nothing runs and the row stays hidden")
})

test("the bundled command sets every terminal's size and nothing else", () => {
  const s = scratch()
  try {
    assert.equal(s.run(bundled).stdout, "9\n")
    assert.equal(s.run(bundled, ["12"]).status, 0)
    assert.equal(s.sizes(), "12|12|12.0|12")
    assert.equal(s.run(bundled).stdout, "12\n")
    assert.match(read2(s.config("ghostty/config")), /^font-family = "Mono"$/m, "the family is left alone")
    assert.match(read2(s.config("foot/foot.ini")), /^font=Mono:size=12$/m)
    const calls = read2(s.calls)
    assert.match(calls, /^pkill -SIGUSR2 ghostty$/m)
    assert.match(calls, /^pkill -USR1 kitty$/m)
    assert.ok(!fs.existsSync(path.join(s.home, ".config/omarchy")), "the shell's text size is untouched")

    for (const bad of ["5", "25", "abc", "1.5"]) assert.notEqual(s.run(bundled, [bad]).status, 0, bad)
    assert.equal(s.sizes(), "12|12|12.0|12", "a rejected size changes nothing")
    s.run(bundled, ["reset"])
    assert.equal(s.sizes(), "9|9|9.0|9")
  } finally { s.cleanup() }
})

test("the bundled Foot notice falls back to English without omarchy-i18n", () => {
  const s = scratch({ pgrep: "exit 0" })
  try {
    s.run(bundled, ["12"])
    assert.match(read2(s.calls), /^notify Restart Foot to apply the new terminal font size -p$/m)
  } finally { s.cleanup() }
})

test("the panel reads the size back after every change, and keeps it out of profiles", () => {
  assert.match(qml, /TextSizeControl \{\s+id: compactTerminalSize\s+visible: root\.terminalSizeAvailable/)
  assert.match(qml, /title: "TERMINAL"\s+stops: Model\.terminalSizeStops\s+unit: "pt"/)
  // Directly under Text size, above Management.
  assert.ok(qml.indexOf("id: compactTextSize") < qml.indexOf("id: compactTerminalSize"))
  assert.ok(qml.indexOf("id: compactTerminalSize") < qml.indexOf('text: "MONITOR MANAGEMENT"'))
  // Text size moves terminals too, so both processes read the size again.
  assert.match(qml, /id: textSizeProcess[\s\S]*?root\.readTerminalSize\(\)[\s\S]*?id: terminalSizeReader/)
  assert.match(qml, /id: terminalSizeProcess\s+onExited: root\.readTerminalSize\(\)/)
  assert.match(qml, /root\.checkTextSizeCommand\(\)\s+root\.readTerminalSize\(\)/)
  assert.doesNotMatch(qml, /kitty\.conf|foot\.ini|alacritty\.toml|ghostty\/config/, "the panel writes no terminal config itself")
  for (const name of ["editOutput", "editWorkspaces", "previewDraft"]) {
    const source = qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
    assert.doesNotMatch(source, /terminalSize/i, name)
  }
})
