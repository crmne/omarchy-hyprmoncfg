const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../Model.js")

// Logical arrangement bounds used by the capture fixtures and common desks.
const laptop = { width: 1440, height: 960 }                  // 2880x1920 at 2x
const studioAndPortable = { width: 4160, height: 1440 }      // 2560x1440 + 1600x1000 side by side
const laptopStudioPortable = { width: 5600, height: 1440 }   // three across
const verticalStack = { width: 2560, height: 2880 }          // 1440p above 1440p
const ultrawide = { width: 3440, height: 1440 }

const layoutInput = (bounds, extra) => Object.assign({
  unit: 1, page: "layout", bounds, chromeHeight: 128, inspectorHeight: 300, hardwareHeight: 90,
  availableWidth: 1880, availableHeight: 1000
}, extra || {})

test("the Layout stage follows the arrangement's aspect within its clamps", () => {
  const one = Model.stageSize(laptop, 1)
  assert.equal(one.width, 520, "a single laptop is held at the minimum width, not shrunk")
  assert.equal(one.height, 361)

  const two = Model.stageSize(studioAndPortable, 1)
  assert.equal(two.width, 780, "two wide screens reach the maximum width")
  assert.equal(two.height, 299)

  const three = Model.stageSize(laptopStudioPortable, 1)
  assert.equal(three.width, 780)
  assert.equal(three.height, 260, "three screens across stop at the minimum height")

  const stack = Model.stageSize(verticalStack, 1)
  assert.equal(stack.height, 520, "a vertical stack is capped at the maximum height")
  assert.equal(stack.width, 520)

  const wide = Model.stageSize(ultrawide, 1)
  assert.ok(wide.width > one.width && wide.width < 780)
  assert.ok(Math.abs((wide.width - 44) / (wide.height - 44) - ultrawide.width / ultrawide.height) < 0.02,
    "between the clamps the stage keeps the arrangement's aspect")
})

test("an Off or mirrored display adds its row to the stage height", () => {
  const without = Model.stageSize(studioAndPortable, 1)
  const withRow = Model.stageSize(studioAndPortable, 1, { offRow: true })
  assert.equal(withRow.height - without.height, Model.panelSizing.offRowHeight)
  assert.equal(withRow.width, without.width)
})

test("sizes scale with the theme's spacing unit", () => {
  const base = Model.stageSize(studioAndPortable, 1)
  const large = Model.stageSize(studioAndPortable, 1.5)
  assert.ok(Math.abs(large.width - base.width * 1.5) <= 1)
  assert.ok(Math.abs(large.height - base.height * 1.5) <= 1)
})

test("the expanded Layout page is as tall as its tallest column", () => {
  const two = Model.expandedPanelLayout(layoutInput(studioAndPortable))
  assert.equal(two.width, 780 + 25 + 340)
  assert.equal(two.bodyHeight, 299 + 10 + 90, "stage plus the hardware facts under it")
  assert.equal(two.height, 128 + 299 + 10 + 90)
  assert.equal(two.clamped, false)

  const tallInspector = Model.expandedPanelLayout(layoutInput(studioAndPortable, { inspectorHeight: 540 }))
  assert.equal(tallInspector.bodyHeight, 540, "the Display controls win when they are taller")

  const one = Model.expandedPanelLayout(layoutInput(laptop))
  assert.equal(one.width, 905, "narrow arrangements keep the minimum panel width")
  assert.equal(one.layoutStageWidth, 905 - 25 - 340, "the stage takes the width the inspector leaves")
})

test("every page shares the Layout width so switching pages never moves the tabs", () => {
  const pages = ["layout", "workspaces", "profiles"].map(page =>
    Model.expandedPanelLayout(layoutInput(laptopStudioPortable, {
      page, profileCount: 3, profileListHeaderHeight: 150, profileDetailsHeight: 200,
      workspaceSettingsHeight: 280, workspacePlanHeight: 100
    })))
  assert.equal(new Set(pages.map(p => p.width)).size, 1)
  assert.notEqual(pages[0].height, pages[2].height, "heights still follow each page's content")
})

test("Profiles grow with their rows up to the visible cap, then scroll", () => {
  const profiles = count => Model.expandedPanelLayout(layoutInput(laptop, {
    page: "profiles", profileCount: count, profileListHeaderHeight: 300, profileDetailsHeight: 60
  }))
  const row = Model.panelSizing.profileRowHeight + Model.panelSizing.profileRowSpacing
  assert.equal(profiles(4).bodyHeight - profiles(3).bodyHeight, row)
  assert.equal(profiles(6).bodyHeight, profiles(40).bodyHeight, "more rows than the cap scroll")
  assert.equal(profiles(0).bodyHeight, profiles(1).bodyHeight, "an empty list still reserves one row")
})

test("Workspaces count manual rows up to their cap", () => {
  const workspaces = rows => Model.expandedPanelLayout(layoutInput(laptop, {
    page: "workspaces", workspaceSettingsHeight: 400, workspaceRowCount: rows, workspacePlanHeight: 40
  }))
  const row = Model.panelSizing.workspaceRowHeight + Model.panelSizing.workspaceRowSpacing
  assert.equal(workspaces(3).bodyHeight - workspaces(2).bodyHeight, row)
  assert.equal(workspaces(8).bodyHeight, workspaces(24).bodyHeight)
})

test("the panel never exceeds the available screen area", () => {
  // 1366x768 logical, minus bar, gaps and card insets.
  const small = Model.expandedPanelLayout(layoutInput(laptopStudioPortable, {
    inspectorHeight: 540, availableWidth: 1324, availableHeight: 700
  }))
  assert.ok(small.width <= 1324)
  assert.ok(small.height <= 700)

  const tiny = Model.expandedPanelLayout(layoutInput(laptopStudioPortable, {
    page: "profiles", profileCount: 30, profileListHeaderHeight: 150, profileDetailsHeight: 260,
    availableWidth: 900, availableHeight: 500
  }))
  assert.equal(tiny.width, 900)
  assert.equal(tiny.height, 500)
  assert.equal(tiny.bodyHeight, 500 - 128, "the footer and header stay; the body absorbs the shortfall")
  assert.equal(tiny.layoutStageWidth, 900 - 25 - 340)
  assert.equal(tiny.clamped, true)
})

test("the compact stage fits the arrangement between its clamps", () => {
  const width = 402
  assert.equal(Model.compactStageHeight(verticalStack, width, 1), 260)
  assert.equal(Model.compactStageHeight(laptopStudioPortable, width, 1), 150)
  assert.equal(Model.compactStageHeight(laptop, width, 1), 260, "a lone laptop fills the compact maximum")
  const wide = Model.compactStageHeight(ultrawide, width, 1)
  assert.equal(wide, Math.round((width - 44) / (3440 / 1440) + 44))
  assert.equal(Model.compactStageHeight(ultrawide, width, 1, true) - wide, Model.panelSizing.offRowHeight)
})

test("resizing waits for the pointer and never happens mid-drag", () => {
  const allowed = state => Model.panelResizeAllowed(Object.assign({ open: true, barPosition: "top" }, state))
  assert.equal(allowed({ dragging: true, pointerInside: false }), false)
  assert.equal(allowed({ dragging: true, modeChanged: true }), false)
  assert.equal(allowed({ open: false, pointerInside: true, widthChanged: true }), true)
  assert.equal(allowed({ modeChanged: true, pointerInside: true, widthChanged: true }), true)
  assert.equal(allowed({ pointerInside: false, widthChanged: true }), true)
  assert.equal(allowed({ pointerInside: true, widthChanged: false }), true,
    "a top bar keeps the card's top edge, so height-only changes leave the controls in place")
  assert.equal(allowed({ pointerInside: true, widthChanged: true }), false, "width recenters the card")
  for (const barPosition of ["bottom", "left", "right"])
    assert.equal(allowed({ barPosition, pointerInside: true, widthChanged: false }), false, barPosition)
})

test("profile thumbnails draw each saved setup from its own outputs", () => {
  const displays = [{ key: "lap", internal: true }, { key: "studio" }, { key: "portable" }]
  const desk = { name: "Desk", outputs: [
    { key: "lap", name: "eDP-1", enabled: false, width: 2880, height: 1920, scale: 2, x: 0, y: 480 },
    { key: "studio", name: "DP-1", enabled: true, width: 3840, height: 2160, scale: 1.5, x: 1440, y: 0 },
    { key: "portable", name: "DP-2", enabled: true, width: 2560, height: 1600, scale: 1.6, x: 4000, y: 220 }
  ] }
  const drawn = Model.profileLayoutDisplays(desk, displays)
  assert.deepEqual(drawn.map(d => d.name).sort(), ["DP-1", "DP-2"], "a display kept off is not drawn")
  const bounds = Model.layoutBounds(drawn)
  assert.equal(bounds.width, 4000 + 1600 - 1440)
  assert.equal(bounds.height, 1440)
  const off = Model.nonSpatialDisplays(desk, displays, true, {})
  assert.deepEqual(off.map(d => d.name), ["eDP-1"])

  const thumb = { width: 74, height: 44 }
  const rects = drawn.map(d => Model.layoutRect(d, bounds, thumb.width, thumb.height, 3))
  for (const r of rects) {
    assert.ok(r.x >= 3 - 0.001 && r.x + r.width <= thumb.width - 3 + 0.001)
    assert.ok(r.y >= 0 && r.y + r.height <= thumb.height)
  }
  const studio = rects[drawn.findIndex(d => d.name === "DP-1")]
  const portable = rects[drawn.findIndex(d => d.name === "DP-2")]
  assert.ok(Math.abs(studio.x + studio.width - portable.x) < 0.01, "adjacent screens stay adjacent in the thumbnail")
})

test("QML sizes the panel only through the Model functions", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /readonly property var panelLayout: Model\.expandedPanelLayout\(\{/)
  assert.match(qml, /height: Model\.compactStageHeight\(root\.layoutBounds, width, root\.sizingUnit, root\.layoutOffRow\)/)
  assert.match(qml, /Model\.panelResizeAllowed\(\{/)
  assert.match(qml, /onCanvasDraggingChanged: root\.applyPanelSize\(false\)/)
  assert.match(qml, /onExpandedChanged: root\.applyPanelSize\(true\)/)
  assert.match(qml, /HoverHandler \{ id: panelPointer; onHoveredChanged: root\.applyPanelSize\(false\) \}/)
  assert.doesNotMatch(qml, /width: Math\.round\(parent\.width \* 0\./, "no fixed-fraction columns remain")
  const canvas = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")
  assert.match(canvas, /root\.dragging = root\.movable/)
  assert.equal((canvas.match(/root\.dragging = false/g) || []).length, 2)
})

test("the Color tab grows the Layout page instead of scrolling", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const input = qml.slice(qml.indexOf("Model.expandedPanelLayout({"), qml.indexOf("hardwareHeight:"))
  assert.match(input, /root\.inspectorPage === "display" \? displayControls\.implicitHeight : colorControls\.implicitHeight/,
    "the panel height follows the active inspector page")
})

test("the Layout stage width does not depend on measured heights", () => {
  const layout = Model.expandedPanelLayout(layoutInput(studioAndPortable))
  assert.equal(Model.layoutInspectorSpan(1), layout.inspectorWidth + layout.columnGap)
  assert.equal(Model.layoutInspectorSpan(1.5), Math.round(340 * 1.5) + Math.round(25 * 1.5))
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const pane = qml.slice(qml.indexOf("id: layoutPane"), qml.indexOf("title:", qml.indexOf("id: layoutPane")))
  const width = pane.split("\n").find(line => line.trim().startsWith("width:"))
  assert.doesNotMatch(width, /panelLayout/, "binding the pane width to panelLayout forms a width/height loop")
})

test("a clamped compact card keeps its header and footer and scrolls only the body", () => {
  const fits = Model.compactPanelLayout({ headerHeight: 40, bodyHeight: 380, footerHeight: 100, gap: 14, availableHeight: 700 })
  assert.deepEqual(fits, { height: 40 + 14 + 380 + 14 + 100, bodyHeight: 380, scrolls: false })

  // 20px text on a 1366x768 screen: the content is far taller than the screen.
  const clamped = Model.compactPanelLayout({ headerHeight: 66, bodyHeight: 800, footerHeight: 180, gap: 23, availableHeight: 676 })
  assert.equal(clamped.height, 676, "the card stops at the available height")
  assert.equal(clamped.bodyHeight, 676 - 66 - 23 - 23 - 180, "only the body gives way")
  assert.equal(clamped.scrolls, true)

  const exact = Model.compactPanelLayout({ headerHeight: 40, bodyHeight: 300, footerHeight: 60, gap: 10, availableHeight: 420 })
  assert.deepEqual(exact, { height: 420, bodyHeight: 300, scrolls: false }, "an exact fit does not scroll")

  const noFooter = Model.compactPanelLayout({ headerHeight: 40, bodyHeight: 120, footerHeight: 0, gap: 14, availableHeight: 700 })
  assert.deepEqual(noFooter, { height: 174, bodyHeight: 120, scrolls: false }, "install state: no footer, no second gap")

  const tiny = Model.compactPanelLayout({ headerHeight: 66, bodyHeight: 800, footerHeight: 180, gap: 23, availableHeight: 200 })
  assert.equal(tiny.bodyHeight, 0, "the body never goes negative")
  assert.equal(Model.compactPanelLayout({ headerHeight: 40, bodyHeight: 300, footerHeight: 60, gap: 10 }).scrolls, false,
    "unknown screen height means content-sized")
})

test("the compact view binds its height and scrolling to the Model", () => {
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  assert.match(qml, /readonly property var compactLayout: Model\.compactPanelLayout\(\{/)
  assert.match(qml, /: panel\.fittedContentHeight\(root\.compactLayout\.height\)/)
  assert.match(qml, /InspectorViewport \{\s+id: compactBody/)
  assert.match(qml, /height: root\.compactLayout\.bodyHeight/)
  assert.match(qml, /formHeight: compactBodyColumn\.implicitHeight/)
  // Header above, footer below, both outside the scrolling body.
  const body = qml.slice(qml.indexOf("id: compactBody"), qml.indexOf("id: compactFooter"))
  assert.doesNotMatch(body, /text: "PROFILE"|id: compactExpandButton/)
  assert.match(body, /TextSizeControl \{|BrightnessControl \{/)
  const footer = qml.slice(qml.indexOf("id: compactFooter"), qml.indexOf("id: expandedEditor"))
  assert.match(footer, /anchors\.bottom: parent\.bottom/)
  assert.match(footer, /text: "PROFILE"/)
  assert.match(footer, /text: "Create profile"/)
  assert.match(footer, /"Resume automatic matching"/)
  // The keyboard cursor's row and a newly shown Keep/Revert bar are revealed.
  assert.match(qml, /currentField: !root\.cursorActive \? null\s+: \(root\.cursorIndex === -1 \? compactTextSize\s+: \(root\.cursorIndex === 0 \? compactManagedToggle\s+: compactActionRows\.itemAt\(root\.cursorIndex - 1\)\)\)/)
  assert.match(qml, /onVisibleChanged: if \(visible\) Qt\.callLater\(function\(\) \{ compactBody\.reveal\(compactDraftBar\) \}\)/)
})
