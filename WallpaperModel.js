// Per-profile, per-display wallpapers. The store lives in a plugin-owned file
// because the daemon owns profile JSON and rewrites it on save. Entries are
// keyed by profile name, then by the display match key (make|model|serial), so
// moving a cable keeps each picture on its physical display.

var STORE_VERSION = 1

function normalize(value) {
  var store = { version: STORE_VERSION, profiles: {} }
  if (!value || value.version !== STORE_VERSION || !value.profiles || typeof value.profiles !== "object") return store
  Object.keys(value.profiles).forEach(function(profile) {
    var entries = value.profiles[profile] || {}
    var kept = {}
    Object.keys(entries).forEach(function(key) {
      if (typeof entries[key] === "string" && entries[key] !== "") kept[key] = entries[key]
    })
    if (Object.keys(kept).length > 0) store.profiles[profile] = kept
  })
  return store
}

function wallpaperFor(store, profile, key) {
  var entries = normalize(store).profiles[String(profile || "")] || {}
  return entries[String(key || "")] || ""
}

function setWallpaper(store, profile, key, path) {
  var next = normalize(store)
  var name = String(profile || ""), id = String(key || ""), file = String(path || "")
  if (name === "" || id === "" || file === "") return next
  var entries = Object.assign({}, next.profiles[name] || {})
  entries[id] = file
  next.profiles[name] = entries
  return next
}

function clearWallpaper(store, profile, key) {
  var next = normalize(store)
  var name = String(profile || "")
  if (!next.profiles[name]) return next
  var entries = Object.assign({}, next.profiles[name])
  delete entries[String(key || "")]
  if (Object.keys(entries).length > 0) next.profiles[name] = entries
  else delete next.profiles[name]
  return next
}

function renameProfile(store, from, to) {
  var next = normalize(store)
  var oldName = String(from || ""), newName = String(to || "")
  if (newName === "" || oldName === newName || !next.profiles[oldName]) return next
  next.profiles[newName] = next.profiles[oldName]
  delete next.profiles[oldName]
  return next
}

function dropProfile(store, profile) {
  var next = normalize(store)
  delete next.profiles[String(profile || "")]
  return next
}

// Connector -> path for displays that are on and usable right now. A display
// with no entry is left out; the layer shows the stock background there.
function assignments(store, profile, monitors) {
  var result = {}
  var name = String(profile || "")
  if (name === "" || !(monitors instanceof Array)) return result
  monitors.filter(isUsable).forEach(function(monitor) {
    var path = wallpaperFor(store, name, monitor.key)
    if (path !== "") result[String(monitor.name)] = path
  })
  return result
}

// While the stock background is suspended, unassigned screens must still
// show it, so the layer draws the stock picture there itself.
function screenSource(assigned, connector, stock) {
  var path = (assigned || {})[String(connector || "")]
  return path ? path : String(stock || "")
}

// Omarchy hands video backgrounds to OWE, which draws them on its own layer.
// This copies the shell's Util.isVideoPath, which plugins cannot import.
function isVideoPath(path) {
  return /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(String(path || ""))
}

// Whether the layer covers a screen. With a video stock background the layer
// cannot draw it, so unassigned screens stay uncovered and OWE's video shows.
function screenVisible(assigned, connector, stock) {
  if (!shouldSuspend(assigned)) return false
  if ((assigned || {})[String(connector || "")]) return true
  return !isVideoPath(stock)
}

// OWE's video sits on the Background layer as well, where the surface mapped
// last is on top. An assigned screen over a video therefore uses the Bottom
// layer, which is above Background and still below windows.
function aboveVideo(assigned, connector, stock) {
  return !!(assigned || {})[String(connector || "")] && isVideoPath(stock)
}

function shouldSuspend(assigned) {
  return !!assigned && Object.keys(assigned).length > 0
}

function isUsable(monitor) {
  return !!monitor && monitor.enabled !== false && monitor.usable !== false && String(monitor.name || "") !== ""
}

// Page rows, in daemon order, for the displays the current profile drives.
function rows(store, profile, monitors) {
  var name = String(profile || "")
  if (name === "" || !(monitors instanceof Array)) return []
  return monitors.filter(isUsable).map(function(monitor) {
    var key = String(monitor.key || "")
    var path = wallpaperFor(store, name, key)
    return {
      key: key,
      connector: String(monitor.name),
      make: String(monitor.make || ""),
      model: String(monitor.model || ""),
      path: path,
      hasWallpaper: path !== ""
    }
  })
}

// Rows for a saved profile's enabled outputs, whether or not they are plugged
// in, so any profile can be edited from the Profiles tab.
function profileRows(store, profile) {
  if (!profile || !(profile.outputs instanceof Array)) return []
  var name = String(profile.name || "")
  return profile.outputs.filter(function(output) { return !!output && output.enabled !== false }).map(function(output) {
    var key = String(output.key || "")
    var path = wallpaperFor(store, name, key)
    return {
      key: key,
      connector: String(output.name || ""),
      make: String(output.make || ""),
      model: String(output.model || ""),
      path: path,
      hasWallpaper: path !== ""
    }
  })
}

// Display key -> path for one profile; the stage paints these on its cards.
function pathsByKey(store, profile) {
  return Object.assign({}, normalize(store).profiles[String(profile || "")] || {})
}

function isSupportedImage(path) {
  return /\.(png|jpe?g|webp)$/i.test(String(path || ""))
}

// Third-party plugins cannot reach Omarchy's background object (the shell's
// plugin facade withholds first-party services), so the layer drives it only
// through the same public commands Omarchy's own scripts use.
// Across a shell restart Omarchy covers the desktop with its stock wallpaper
// on the Bottom layer, and lifts the cover only once its own background is
// drawing. Suspending that background first would leave the cover up for
// good, so the layer waits until `hyprctl layers -j` shows no such cover.
// Omarchy's real background sits on the Background layer (level 0).
function coverShowing(layersJson) {
  var monitors
  try { monitors = JSON.parse(String(layersJson || "")) } catch (error) { return false }
  for (var name in monitors || {}) {
    var bottom = ((monitors[name] || {}).levels || {})["1"] || []
    for (var i = 0; i < bottom.length; i++)
      if (bottom[i] && bottom[i].namespace === "omarchy-background") return true
  }
  return false
}

function coverProbeCommand() {
  return ["hyprctl", "layers", "-j"]
}

function suspendCommand(suspended) {
  return ["omarchy-shell", "-q", "background", "setSuspended", suspended ? "true" : "false"]
}

function selectorCommand() {
  return ["bash", "-c", "background=$(omarchy-theme-bg-switcher); [[ -n $background ]] && omarchy-theme-bg-set \"$background\""]
}

function themeSwitcherCommand() {
  return ["omarchy-shell", "shell", "summon", "omarchy.image-picker", JSON.stringify({ source: "themes" })]
}

function stockCommand(home) {
  return ["readlink", "-f", String(home || "") + "/.local/state/omarchy/current/background"]
}

if (typeof module !== "undefined") {
  module.exports = {
    suspendCommand: suspendCommand,
    coverShowing: coverShowing,
    coverProbeCommand: coverProbeCommand,
    selectorCommand: selectorCommand,
    themeSwitcherCommand: themeSwitcherCommand,
    stockCommand: stockCommand,
    rows: rows,
    isSupportedImage: isSupportedImage,
    assignments: assignments,
    shouldSuspend: shouldSuspend,
    screenSource: screenSource,
    screenVisible: screenVisible,
    aboveVideo: aboveVideo,
    isVideoPath: isVideoPath,
    normalize: normalize,
    wallpaperFor: wallpaperFor,
    setWallpaper: setWallpaper,
    clearWallpaper: clearWallpaper,
    renameProfile: renameProfile,
    dropProfile: dropProfile,
    profileRows: profileRows,
    pathsByKey: pathsByKey
  }
}
