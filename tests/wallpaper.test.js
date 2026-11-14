const test = require("node:test")
const assert = require("node:assert/strict")
const Wallpaper = require("../WallpaperModel.js")

const empty = { version: 1, profiles: {} }

test("normalize tolerates a missing, corrupt or unknown-version store", () => {
  assert.deepEqual(Wallpaper.normalize(null), empty)
  assert.deepEqual(Wallpaper.normalize({}), empty)
  assert.deepEqual(Wallpaper.normalize({ version: 99, profiles: { a: { k: "/x.png" } } }), empty)
  assert.deepEqual(Wallpaper.normalize({ version: 1, profiles: { a: { k: 5, j: "/y.png" } } }),
    { version: 1, profiles: { a: { j: "/y.png" } } }, "non-string paths are dropped")
})

test("setWallpaper is immutable and keyed by profile and display", () => {
  const before = Wallpaper.normalize(null)
  const after = Wallpaper.setWallpaper(before, "Home", "lg|ultrawide|1", "/a.png")
  assert.deepEqual(after.profiles, { Home: { "lg|ultrawide|1": "/a.png" } })
  assert.deepEqual(before, empty, "the original store is untouched")
  assert.equal(Wallpaper.wallpaperFor(after, "Home", "lg|ultrawide|1"), "/a.png")
  assert.equal(Wallpaper.wallpaperFor(after, "Home", "other"), "")
  assert.equal(Wallpaper.wallpaperFor(after, "Away", "lg|ultrawide|1"), "")
  assert.deepEqual(Wallpaper.setWallpaper(before, "", "k", "/a.png"), empty, "no profile, no entry")
})

test("clearWallpaper removes the display and prunes an empty profile", () => {
  let store = Wallpaper.setWallpaper(null, "Home", "a", "/a.png")
  store = Wallpaper.setWallpaper(store, "Home", "b", "/b.png")
  const one = Wallpaper.clearWallpaper(store, "Home", "a")
  assert.deepEqual(one.profiles, { Home: { b: "/b.png" } })
  assert.deepEqual(Wallpaper.clearWallpaper(one, "Home", "b").profiles, {})
  assert.deepEqual(store.profiles.Home, { a: "/a.png", b: "/b.png" }, "immutable")
})

test("renameProfile moves its wallpapers and dropProfile removes them", () => {
  const store = Wallpaper.setWallpaper(null, "Home", "a", "/a.png")
  assert.deepEqual(Wallpaper.renameProfile(store, "Home", "Desk").profiles, { Desk: { a: "/a.png" } })
  assert.deepEqual(Wallpaper.renameProfile(store, "Missing", "Desk").profiles, { Home: { a: "/a.png" } })
  assert.deepEqual(Wallpaper.renameProfile(store, "Home", "").profiles, { Home: { a: "/a.png" } })
  assert.deepEqual(Wallpaper.dropProfile(store, "Home").profiles, {})
  assert.deepEqual(store.profiles, { Home: { a: "/a.png" } }, "immutable")
})

// Shape copied from a live hyprmoncfgd status result.
const monitors = [
  { key: "boe|ne156fhm-nx6", name: "eDP-2", enabled: false, usable: false },
  { key: "acer|vg240y p|0x9", name: "DP-2", enabled: true, usable: true },
  { key: "lg|ultrawide|605", name: "DP-1", enabled: true, usable: true }
]

test("assignments maps live connectors to the current profile's wallpapers", () => {
  let store = Wallpaper.setWallpaper(null, "Desk", "lg|ultrawide|605", "/lg.png")
  store = Wallpaper.setWallpaper(store, "Desk", "boe|ne156fhm-nx6", "/laptop.png")
  store = Wallpaper.setWallpaper(store, "Desk", "unplugged|x|1", "/gone.png")
  assert.deepEqual(Wallpaper.assignments(store, "Desk", monitors), { "DP-1": "/lg.png" },
    "disabled and disconnected displays are skipped; DP-2 has none so keeps the stock background")
})

test("assignments is empty without a current profile", () => {
  const store = Wallpaper.setWallpaper(null, "Desk", "lg|ultrawide|605", "/lg.png")
  assert.deepEqual(Wallpaper.assignments(store, "", monitors), {})
  assert.deepEqual(Wallpaper.assignments(store, "Desk", null), {})
})

test("coverShowing spots Omarchy's restart cover on the Bottom layer only", () => {
  const layers = (level, namespace) => JSON.stringify({ "DP-1": { levels: { [level]: [{ namespace }] } } })
  assert.equal(Wallpaper.coverShowing(layers("1", "omarchy-background")), true, "the cover is a Bottom-layer surface")
  assert.equal(Wallpaper.coverShowing(layers("0", "omarchy-background")), false, "the background itself is not a cover")
  assert.equal(Wallpaper.coverShowing(layers("1", "waybar")), false)
  assert.equal(Wallpaper.coverShowing("not json"), false, "unreadable output never blocks the wallpapers")
  assert.equal(Wallpaper.coverShowing(""), false)
})

test("the layer waits for Omarchy's cover to lift before suspending its background", () => {
  const layer = fs.readFileSync(path.join(__dirname, "..", "WallpaperLayer.qml"), "utf8")
  assert.match(layer, /readonly property bool suspend: root\.active && root\.coverClear/)
  assert.match(layer, /onSuspendChanged: root\.applySuspension\(\)/)
  assert.match(layer, /Wallpaper\.coverShowing\(/)
})

test("shouldSuspend only when some screen has an assigned wallpaper", () => {
  assert.equal(Wallpaper.shouldSuspend({ "DP-1": "/lg.png" }), true)
  assert.equal(Wallpaper.shouldSuspend({}), false)
  assert.equal(Wallpaper.shouldSuspend(null), false)
})

test("rows lists the current profile's usable displays with their wallpaper", () => {
  const live = monitors.concat([{ key: "acer|vg240y p|0x9-dup", name: "", enabled: true, usable: true }])
    .map(m => Object.assign({ make: "Make", model: m.name + " model" }, m))
  const store = Wallpaper.setWallpaper(null, "Desk", "lg|ultrawide|605", "/lg.png")
  assert.deepEqual(Wallpaper.rows(store, "Desk", live), [
    { key: "acer|vg240y p|0x9", connector: "DP-2", make: "Make", model: "DP-2 model", path: "", hasWallpaper: false },
    { key: "lg|ultrawide|605", connector: "DP-1", make: "Make", model: "DP-1 model", path: "/lg.png", hasWallpaper: true }
  ], "off displays and displays without a connector are not listed")
  assert.deepEqual(Wallpaper.rows(store, "", live), [], "no current profile, no rows")
})

test("isSupportedImage accepts still images only", () => {
  for (const ok of ["/a.png", "/a.JPG", "/a.jpeg", "/b/c.webp"]) assert.equal(Wallpaper.isSupportedImage(ok), true, ok)
  for (const no of ["", "/a.mp4", "/a.gif", "/png", null]) assert.equal(Wallpaper.isSupportedImage(no), false, String(no))
})

test("screenSource uses the assignment, else the stock background", () => {
  const assigned = { "DP-1": "/lg.png" }
  assert.equal(Wallpaper.screenSource(assigned, "DP-1", "/stock.jpg"), "/lg.png")
  assert.equal(Wallpaper.screenSource(assigned, "DP-2", "/stock.jpg"), "/stock.jpg")
  assert.equal(Wallpaper.screenSource(null, "DP-2", ""), "")
})

const fs = require("node:fs")
const path = require("node:path")
const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

test("the panel offers a fourth Wallpapers page, reachable with 4", () => {
  assert.match(panel, /\{ value: "wallpapers", label: "4  " \+ Strings\.t\("tab\.wallpapers", "Wallpapers"\) \}/)
  assert.match(panel, /key === "4"\) \{\s*root\.activePage = "wallpapers"/)
  assert.match(panel, /WallpapersPage \{[\s\S]*?visible: root\.activePage === "wallpapers"/)
})

test("a confirmed profile delete drops that profile's wallpapers", () => {
  assert.match(panel, /method === "delete"\) wallpaperStore\.dropProfile\(context\.name\)/)
})

test("keyboard: arrows select, Enter chooses, d clears on the Wallpapers page", () => {
  assert.match(panel, /activePage === "wallpapers"\) \{\s*if \(dy !== 0\) wallpapersPage\.move\(dy\)/)
  assert.match(panel, /activePage === "wallpapers"\) \{\s*wallpapersPage\.activate\(\)/)
  assert.match(panel, /activePage === "wallpapers"\) \{\s*if \(key === "d"\) wallpapersPage\.clearSelected\(\)/)
})

test("keyboard help lists the Wallpapers keys and four tabs", () => {
  const help = fs.readFileSync(path.join(__dirname, "..", "KeyboardHelp.qml"), "utf8")
  assert.match(help, /root\.page === "wallpapers"/)
  assert.match(help, /\{ keys: "Enter", action: Strings\.t\("help\.chooseWallpaper", "Choose a wallpaper for this display"\) \}/)
  assert.match(help, /\{ keys: "d", action: Strings\.t\("help\.clearWallpaper", "Clear it and use the Omarchy background"\) \}/)
  assert.match(help, /\{ keys: "1  2  3  4", action: Strings\.t\("help\.switchTabs", "Switch tabs"\) \}/)
})

test("Omarchy's background is driven only through its public commands", () => {
  assert.deepEqual(Wallpaper.suspendCommand(true), ["omarchy-shell", "-q", "background", "setSuspended", "true"])
  assert.deepEqual(Wallpaper.suspendCommand(false), ["omarchy-shell", "-q", "background", "setSuspended", "false"])
  assert.deepEqual(Wallpaper.selectorCommand(),
    ["bash", "-c", "background=$(omarchy-theme-bg-switcher); [[ -n $background ]] && omarchy-theme-bg-set \"$background\""])
  assert.deepEqual(Wallpaper.themeSwitcherCommand(),
    ["omarchy-shell", "shell", "summon", "omarchy.image-picker", "{\"source\":\"themes\"}"])
  assert.deepEqual(Wallpaper.stockCommand("/home/u"), ["readlink", "-f", "/home/u/.local/state/omarchy/current/background"])
})

const savedProfile = {
  name: "Home",
  outputs: [
    { key: "acer|vg240y|1", name: "DP-2", make: "Acer", model: "VG240Y", enabled: true },
    { key: "lg|ultrawide|2", name: "DP-1", make: "LG", model: "ULTRAWIDE", enabled: true },
    { key: "boe|ne156", name: "eDP-2", make: "BOE", model: "NE156", enabled: false }
  ]
}

test("profileRows lists a saved profile's enabled outputs, plugged in or not", () => {
  const store = Wallpaper.setWallpaper(null, "Home", "lg|ultrawide|2", "/b.png")
  assert.deepEqual(Wallpaper.profileRows(store, savedProfile), [
    { key: "acer|vg240y|1", connector: "DP-2", make: "Acer", model: "VG240Y", path: "", hasWallpaper: false },
    { key: "lg|ultrawide|2", connector: "DP-1", make: "LG", model: "ULTRAWIDE", path: "/b.png", hasWallpaper: true }
  ])
  assert.deepEqual(Wallpaper.profileRows(store, null), [])
  assert.deepEqual(Wallpaper.profileRows(store, { name: "Home" }), [])
})

test("pathsByKey maps one profile's displays to their wallpapers", () => {
  let store = Wallpaper.setWallpaper(null, "Home", "a", "/a.png")
  store = Wallpaper.setWallpaper(store, "Home", "b", "/b.png")
  assert.deepEqual(Wallpaper.pathsByKey(store, "Home"), { a: "/a.png", b: "/b.png" })
  assert.deepEqual(Wallpaper.pathsByKey(store, "Away"), {})
  assert.deepEqual(Wallpaper.pathsByKey(store, ""), {})
})

test("Profiles reaches the Wallpapers tab for the selected profile", () => {
  assert.match(panel, /\{ id: "wallpapers", label: Strings\.t\("action\.wallpapersMenu", "Wallpapers…"\)/)
  assert.match(panel, /action === "wallpapers"\) root\.openWallpapersFor\(root\.selectedSavedProfileName\)/)
  assert.match(panel, /if \(key === "w"\) root\.openWallpapersFor\(root\.selectedSavedProfileName\)/)
  assert.doesNotMatch(panel, /label: "Wallpapers"/, "Profile Details has no Wallpapers row; the menu and w reach the tab")
  const help = fs.readFileSync(path.join(__dirname, "..", "KeyboardHelp.qml"), "utf8")
  assert.match(help, /\{ keys: "w", action: Strings\.t\("help\.profileWallpapers", "Manage this profile's wallpapers"\) \}/)
})

test("the Wallpapers tab draws the target profile on the shared display stage", () => {
  assert.match(panel, /Wallpaper\.profileRows\(wallpaperStore\.store, root\.wallpaperProfile\)/)
  assert.match(panel, /wallpapers: Wallpaper\.pathsByKey\(wallpaperStore\.store, root\.wallpaperProfileName\)/)
  const canvas = fs.readFileSync(path.join(__dirname, "..", "DisplayCanvas.qml"), "utf8")
  assert.match(canvas, /property var wallpapers: \(\{\}\)/)
})

test("the panel steps aside while the file chooser is open, without closing", () => {
  // The chooser is a normal window under the panel's full-screen overlay; its
  // clicks would otherwise land as outside-click dismissals.
  assert.match(panel, /KeyboardPanel \{[\s\S]{0,500}open: root\.opened && !wallpaperPicker\.running/)
})

test("desktop double-clicks open the pickers; single clicks do nothing", () => {
  const layer = fs.readFileSync(path.join(__dirname, "..", "WallpaperLayer.qml"), "utf8")
  assert.match(layer, /onDoubleClicked: function\(mouse\) \{[\s\S]{0,200}Qt\.RightButton\) Quickshell\.execDetached\(Wallpaper\.themeSwitcherCommand\(\)\)[\s\S]{0,120}selector\.running = true/)
  assert.doesNotMatch(layer, /onClicked:/, "a single click on the desktop opens nothing")
})

test("a confirmed profile rename moves that profile's wallpapers", () => {
  assert.match(panel, /root\.send\("rename_profile", \{ name: name, new_name: next \}, \{ name: next, from: name \}\)/)
  assert.match(panel, /method === "rename_profile"\) \{[\s\S]{0,200}wallpaperStore\.renameProfile\(context\.from, context\.name\)/)
  const store = fs.readFileSync(path.join(__dirname, "..", "WallpaperStore.qml"), "utf8")
  // Writes start from the file on disk; tst_WallpaperStore.qml covers why.
  assert.match(store, /function renameProfile\(from, to\) \{[\s\S]{0,200}Wallpaper\.renameProfile\(store, from, to\)/)
})

test("isVideoPath matches the extensions Omarchy treats as video", () => {
  for (const video of ["/a.mp4", "/a.M4V", "/a.mov", "/a.webm", "/a.mkv", "/a.avi"]) assert.equal(Wallpaper.isVideoPath(video), true, video)
  for (const still of ["/a.png", "/a.jpg", "", null, "/mp4"]) assert.equal(Wallpaper.isVideoPath(still), false, String(still))
})

test("screenVisible leaves unassigned screens to OWE when the stock background is a video", () => {
  const assigned = { "DP-1": "/lg.png" }
  assert.equal(Wallpaper.screenVisible(assigned, "DP-1", "/clip.mp4"), true, "an assigned screen shows its picture")
  assert.equal(Wallpaper.screenVisible(assigned, "DP-2", "/clip.mp4"), false, "OWE's video shows through")
  assert.equal(Wallpaper.screenVisible(assigned, "DP-2", "/stock.jpg"), true, "the layer draws the stock still itself")
  assert.equal(Wallpaper.screenVisible({}, "DP-1", "/stock.jpg"), false, "no assignment means no layer")
  assert.equal(Wallpaper.screenVisible(null, "DP-1", ""), false)
})

test("normalize reads the file as hyprmoncfg's Go store writes it", () => {
  const written = "{\n  \"version\": 1,\n  \"profiles\": {\n    \"Desk\": {\n      \"dell|u2720q\": \"/a.png\"\n    }\n  }\n}\n"
  assert.deepEqual(Wallpaper.normalize(JSON.parse(written)), { version: 1, profiles: { Desk: { "dell|u2720q": "/a.png" } } })
})

test("each screen's window follows screenVisible, so a video stock background shows through", () => {
  const layer = fs.readFileSync(path.join(__dirname, "..", "WallpaperLayer.qml"), "utf8")
  assert.match(layer, /visible: Wallpaper\.screenVisible\(root\.assigned, modelData\.name, root\.stock\)/)
})

test("a theme or background change re-reads the stock picture at once, not on a 15s poll", () => {
  const layer = fs.readFileSync(path.join(__dirname, "..", "WallpaperLayer.qml"), "utf8")
  assert.doesNotMatch(layer, /interval: 15000/)
  assert.match(layer, /StockBackgroundWatch \{[\s\S]{0,200}onBackgroundChanged: if \(root\.active\) stockReader\.running = true/)
  const watch = fs.readFileSync(path.join(__dirname, "..", "StockBackgroundWatch.qml"), "utf8")
  // A FileView on the symlink never fires when ln -nsf replaces it; the
  // directory does, for omarchy-theme-set and omarchy-theme-bg-next alike.
  assert.match(watch, /FolderListModel \{[\s\S]*folder: /)
  assert.match(watch, /\.local\/state\/omarchy\/current/)
})

test("over a video stock background an assigned screen sits above OWE's layer", () => {
  // OWE draws video on the Background layer too, and Hyprland stacks a layer
  // by map order, so the later surface would win. Bottom is above Background
  // and still below windows.
  const assigned = { "DP-1": "/lg.png" }
  assert.equal(Wallpaper.aboveVideo(assigned, "DP-1", "/clip.mp4"), true)
  assert.equal(Wallpaper.aboveVideo(assigned, "DP-1", "/stock.jpg"), false, "stills keep the Background layer")
  assert.equal(Wallpaper.aboveVideo(assigned, "DP-2", "/clip.mp4"), false)
  const layer = fs.readFileSync(path.join(__dirname, "..", "WallpaperLayer.qml"), "utf8")
  assert.match(layer, /WlrLayershell\.layer: Wallpaper\.aboveVideo\(root\.assigned, modelData\.name, root\.stock\) \? WlrLayer\.Bottom : WlrLayer\.Background/)
})

test("a background change re-asserts the suspension OWE lifts when it hands back a still", () => {
  // OWE turns Omarchy's background back on whenever the background becomes a
  // still; while this layer draws, Omarchy's must stay off underneath it.
  const layer = fs.readFileSync(path.join(__dirname, "..", "WallpaperLayer.qml"), "utf8")
  assert.match(layer, /onStreamFinished: \{[\s\S]{0,200}if \(root\.suspendedByUs\) Quickshell\.execDetached\(Wallpaper\.suspendCommand\(true\)\)/)
})
