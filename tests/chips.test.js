const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../Model.js")

const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8")
const chip = (x, owner, y = 10) => ({ x, y, width: 16, height: 16, owner })

// Two displays, six workspaces: Sequential (1-3 | 4-6) to Interleaved (1,3,5 | 2,4,6).
const sequential = { "1": chip(10, "a"), "2": chip(30, "a"), "3": chip(50, "a"), "4": chip(210, "b"), "5": chip(230, "b"), "6": chip(250, "b") }
const interleaved = { "1": chip(10, "a"), "3": chip(30, "a"), "5": chip(50, "a"), "2": chip(210, "b"), "4": chip(230, "b"), "6": chip(250, "b") }

test("workspace owners are keyed by workspace ID", () => {
  const owners = Model.workspaceOwners([
    { output_key: "a", workspaces: ["1", "2", "3"] },
    { output_key: "b", workspaces: [4, 5, 6] }
  ])
  assert.deepEqual(owners, { "1": "a", "2": "a", "3": "a", "4": "b", "5": "b", "6": "b" })
  assert.deepEqual(Model.workspaceOwners(null), {})
})

test("only chips whose display changed travel, from their old place to their new one", () => {
  const moves = Model.chipMoves(sequential, interleaved)
  assert.deepEqual(moves.map(m => m.id), ["2", "5"], "1, 3, 4 and 6 keep their display and do not travel")
  assert.deepEqual([moves[0].fromX, moves[0].toX], [30, 210])
  assert.deepEqual([moves[1].fromX, moves[1].toX], [230, 50])
  assert.equal(moves[0].width, 16)
})

test("travel is staggered in workspace order, numerically", () => {
  const before = {}, after = {}
  for (const id of ["10", "9", "2"]) { before[id] = chip(0, "a"); after[id] = chip(100, "b") }
  const moves = Model.chipMoves(before, after)
  assert.deepEqual(moves.map(m => m.id), ["2", "9", "10"])
  assert.deepEqual(moves.map(m => m.delay), [0, Model.chipTravel.stagger, 2 * Model.chipTravel.stagger])
  assert.ok(Model.chipTravel.duration <= 300, "short")
})

test("chips that appear or disappear pop; nothing travels without a previous place", () => {
  assert.deepEqual(Model.chipMoves({}, interleaved), [], "first layout")
  const grown = Object.assign({}, sequential, { "7": chip(70, "a") })
  assert.deepEqual(Model.chipMoves(sequential, grown), [], "a new workspace just appears")
  const unplugged = { "1": chip(10, "a"), "2": chip(30, "a"), "3": chip(50, "a") }
  assert.deepEqual(Model.chipMoves(sequential, unplugged), [], "a display leaving takes its chips with it")
  const merged = { "1": chip(10, "a"), "2": chip(30, "a"), "3": chip(50, "a"), "4": chip(70, "a"), "5": chip(90, "a"), "6": chip(110, "a") }
  assert.deepEqual(Model.chipMoves(sequential, merged).map(m => m.id), ["4", "5", "6"], "its workspaces moving to the remaining display travel")
})

test("the change is instant when it should not animate", () => {
  for (const option of ["dragging", "resizing", "reducedMotion"])
    assert.deepEqual(Model.chipMoves(sequential, interleaved, { [option]: true }), [], option)
  assert.deepEqual(Model.chipMoves(sequential, interleaved, { enabled: false }), [])
  assert.deepEqual(Model.chipMoves(sequential, interleaved, { limit: 1 }), [], "more movers than the limit")
  assert.equal(Model.chipMoves(sequential, interleaved, { limit: 2 }).length, 2)
  const many = {}, moved = {}
  for (let i = 1; i <= Model.chipTravel.limit + 1; i++) { many[i] = chip(i, "a"); moved[i] = chip(i, "b") }
  assert.deepEqual(Model.chipMoves(many, moved), [], "default limit")
})

test("Hyprland's animations setting is the motion preference", () => {
  assert.equal(Model.motionReduced('{"option": "animations:enabled", "bool": false, "set": true }'), true)
  assert.equal(Model.motionReduced('{"option": "animations:enabled", "bool": true, "set": true }'), false)
  assert.equal(Model.motionReduced('{"option": "animations:enabled", "int": 0, "set": true}'), true)
  assert.equal(Model.motionReduced('{"option": "animations:enabled", "int": 1, "set": true}'), false)
  for (const unreadable of ["", "{}", "not json", undefined])
    assert.equal(Model.motionReduced(unreadable), false, String(unreadable))
})

test("the canvas measures and animates; the decision stays in Model.chipMoves", () => {
  const canvas = read("DisplayCanvas.qml")
  const panel = read("Panel.qml")
  assert.match(canvas, /Model\.chipMoves\(before, after, \{/)
  assert.match(canvas, /enabled: root\.chipTravelEnabled && root\.visible, dragging: root\.dragging,\s+resizing: root\.resizing, reducedMotion: root\.reducedMotion/)
  assert.match(canvas, /property bool chipTravelEnabled: false/, "thumbnails and other canvases stay instant by default")
  assert.match(canvas, /onDraggingChanged: if \(root\.dragging\) root\.endChipTravel\(\)/)
  assert.match(canvas, /onResizingChanged: if \(root\.resizing\) root\.endChipTravel\(\)/)
  assert.match(canvas, /easing\.type: Easing\.InOutCubic/, "eased, no bounce")
  assert.doesNotMatch(canvas, /Easing\.(OutBack|OutBounce|OutElastic)/)
  assert.match(canvas, /opacity: root\.travelingIds\[String\(modelData\)\] === true \? 0 : 1/)
  const ghost = canvas.slice(canvas.indexOf("// Ghost chips"), canvas.indexOf("visible: root.displays.length === 0"))
  assert.doesNotMatch(ghost, /MouseArea|HoverHandler|TapHandler/, "ghosts never take input")
  // Compact, Layout and Workspaces canvases opt in; the Profiles preview and thumbnails do not.
  assert.equal((panel.match(/chipTravelEnabled: root\.opened/g) || []).length, 3)
  assert.equal((panel.match(/resizing: root\.panelResizing/g) || []).length, 3)
  assert.equal((panel.match(/reducedMotion: root\.reducedMotion/g) || []).length, 3)
  assert.match(panel, /motionProbe\.command = \["hyprctl", "-j", "getoption", "animations:enabled"\]/)
})
