function failure(message) {
  return { screen: null, connector: "", label: "", error: message }
}

// Resolve a saved/draft output through its current hardware key. A connector
// saved at another desk must never identify a different monitor at this desk.
function target(output, currentProfile, editorDisplays, screens) {
  var requested = output || {}
  var key = String(requested.key || "")
  var outputs = currentProfile && currentProfile.outputs instanceof Array ? currentProfile.outputs : []
  var metadata = editorDisplays instanceof Array ? editorDisplays : []
  var current = null
  var connected = null
  if (key === "") return failure("Choose a connected display to identify.")
  for (var i = 0; i < outputs.length; i++) {
    if (String((outputs[i] || {}).key || "") === key) {
      if (current) return failure("This display's identity is ambiguous. Refresh the display list.")
      current = outputs[i]
    }
  }
  for (var j = 0; j < metadata.length; j++) {
    if (String((metadata[j] || {}).key || "") === key) connected = metadata[j]
  }
  if (!current || !connected)
    return failure("This saved display is not connected. Identify one of the current displays instead.")
  if (current.enabled === false)
    return failure("This display is disabled, so it cannot show an identification cue.")
  if (String(current.mirror_of || "").trim() !== "")
    return failure("This display mirrors another screen and cannot show a separate identification cue.")
  if (connected.dpms === false)
    return failure("This display is asleep. Wake it before identifying it.")
  var connector = String(current.name || "")
  var selected = null
  var available = screens || []
  for (var k = 0; k < available.length; k++) {
    if (available[k] && String(available[k].name || "") === connector) {
      if (selected) return failure("This connector has multiple screen matches. Refresh the display list.")
      selected = available[k]
    }
  }
  if (!selected) return failure("This display is not available to the desktop yet. Refresh and try again.")
  // Qt exposes a serial when the compositor supplies it. Use it as an extra
  // stale-snapshot check without guessing when either side lacks a serial.
  var expectedSerial = String(current.serial || "").trim()
  var screenSerial = String(selected.serialNumber || "").trim()
  if (expectedSerial !== "" && screenSerial !== "" && expectedSerial !== screenSerial)
    return failure("The display on this connector has changed. Refresh before identifying it.")
  var label = [String(current.make || "").trim(), String(current.model || "").trim()]
    .filter(function(part) { return part !== "" }).join(" ")
  return { screen: selected, connector: connector, label: label || connector, error: "" }
}

function containsScreen(screen, screens) {
  if (!screen) return false
  var available = screens || []
  for (var i = 0; i < available.length; i++) {
    if (available[i] === screen) return true
  }
  return false
}

if (typeof module !== "undefined") {
  module.exports = { target: target, containsScreen: containsScreen }
}
