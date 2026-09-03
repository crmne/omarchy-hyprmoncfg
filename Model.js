function installCommand() {
  return "rm -f \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.failed\" \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.complete\"; status=0; if pacman -Q hyprmoncfg-bin >/dev/null 2>&1; then yay -S --needed --cleanafter hyprmoncfg-bin; elif pacman -Q hyprmoncfg >/dev/null 2>&1; then yay -S --needed --cleanafter hyprmoncfg; else omarchy pkg aur add hyprmoncfg-bin; fi && systemctl --user enable hyprmoncfgd.service && systemctl --user restart hyprmoncfgd.service && setsid -f gtk-launch hyprmoncfg-omarchy >/dev/null 2>&1 || status=$?; if (( status == 0 )); then : > \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.complete\"; else printf '%s\\n' \"$status\" > \"$XDG_RUNTIME_DIR/hyprmoncfg-panel-install.failed\"; fi; (exit \"$status\")"
}

function installProcessArgs() {
  return [
    "omarchy",
    "launch",
    "floating",
    "terminal",
    "with",
    "presentation",
    installCommand()
  ]
}

function parseEnvelope(raw) {
  try {
    var value = JSON.parse(String(raw || ""))
    if (!value || typeof value !== "object") return null
    if (value.protocol_version !== 1) return null
    if (value.type !== "response" && value.type !== "event") return null
    return value
  } catch (e) {
    return null
  }
}

function mirrorTarget(monitor) {
  return String((monitor || {}).mirror_of || "").trim()
}

// A monitor only earns a rectangle when it drives its own image. One that is
// off has no place on the canvas, and one that mirrors another shares its
// source's position, so drawing it would stack two cards on the same spot.
function drawsOwnImage(monitor) {
  return !!monitor
    && monitor.enabled !== false
    && mirrorTarget(monitor) === ""
    && Number(monitor.logical_width || 0) > 0
    && Number(monitor.logical_height || 0) > 0
}

// hiddenDisplays names what the canvas leaves out, so a display never vanishes
// without a trace. Mirrors: the TUI canvas strip.
function hiddenDisplays(monitors) {
  var summaries = monitors instanceof Array ? monitors : []
  var off = []
  var mirrored = []

  for (var i = 0; i < summaries.length; i++) {
    var monitor = summaries[i] || {}
    var name = String(monitor.name || "Display")
    if (monitor.enabled === false) {
      off.push(name)
    } else if (mirrorTarget(monitor) !== "") {
      mirrored.push(name + " → " + mirrorTarget(monitor))
    }
  }

  var parts = []
  if (off.length > 0) parts.push("Off: " + off.join(", "))
  if (mirrored.length > 0) parts.push("Mirrored: " + mirrored.join(", "))
  return parts.join("   ")
}

function layoutDisplays(monitors, screens) {
  var summaries = monitors instanceof Array ? monitors : []
  var enriched = summaries.filter(drawsOwnImage).map(function(monitor) {
    return {
      name: String(monitor.name || "Display"),
      description: String(monitor.description || ""),
      make: String(monitor.make || ""),
      model: String(monitor.model || ""),
      mode: String(monitor.mode || ""),
      scale: Number(monitor.scale || 1),
      internal: monitor.internal === true,
      focused: monitor.focused === true,
      x: Number(monitor.x || 0),
      y: Number(monitor.y || 0),
      width: Number(monitor.logical_width),
      height: Number(monitor.logical_height)
    }
  })
  return enriched.length > 0 ? enriched : (screens || [])
}

function displayModelLabel(display, compact) {
  var monitor = display || {}
  var makeModel = compact === true
    ? String(monitor.model || "").trim()
    : (String(monitor.make || "") + " " + String(monitor.model || "")).trim()
  var label = makeModel || String(monitor.description || "").trim() || "Unknown display"
  return monitor.internal === true ? "Internal · " + label : label
}

function displayDetailLabel(display) {
  var monitor = display || {}
  var mode = String(monitor.mode || "").trim()
  var match = mode.match(/^(\d+)x(\d+)(?:@([\d.]+)Hz)?$/)
  var parts = []
  if (match) {
    parts.push(match[1] + "×" + match[2])
    if (match[3]) parts.push(Math.round(Number(match[3])) + " Hz")
  } else if (mode !== "") {
    parts.push(mode)
  }
  var scale = Number(monitor.scale || 1)
  if (!isFinite(scale) || scale <= 0) scale = 1
  parts.push(String(Math.round(scale * 100) / 100) + "x")
  return parts.join(" · ")
}

function displayScaleLayoutLabel(display) {
  var monitor = display || {}
  var scale = Number(monitor.scale || 1)
  if (!isFinite(scale) || scale <= 0) scale = 1
  var logicalWidth = Math.max(1, Math.round(Number(monitor.width || 1)))
  var logicalHeight = Math.max(1, Math.round(Number(monitor.height || 1)))
  return formatScale(scale) + "x = " + logicalWidth + "×" + logicalHeight
}

function layoutBounds(displays) {
  var list = displays || []
  if (list.length === 0) return { x: 0, y: 0, width: 1, height: 1 }

  var minX = Infinity
  var minY = Infinity
  var maxX = -Infinity
  var maxY = -Infinity
  for (var i = 0; i < list.length; i++) {
    var display = list[i] || {}
    var x = Number(display.x || 0)
    var y = Number(display.y || 0)
    var width = Math.max(1, Number(display.width || 1))
    var height = Math.max(1, Number(display.height || 1))
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }
}

function layoutRect(display, bounds, canvasWidth, canvasHeight, padding) {
  var item = display || {}
  var area = bounds || layoutBounds([])
  var inset = Math.max(0, Number(padding || 0))
  var usableWidth = Math.max(1, Number(canvasWidth || 1) - inset * 2)
  var usableHeight = Math.max(1, Number(canvasHeight || 1) - inset * 2)
  var scale = Math.min(usableWidth / area.width, usableHeight / area.height)
  var contentWidth = area.width * scale
  var contentHeight = area.height * scale
  var offsetX = inset + (usableWidth - contentWidth) / 2
  var offsetY = inset + (usableHeight - contentHeight) / 2

  return {
    x: offsetX + (Number(item.x || 0) - area.x) * scale,
    y: offsetY + (Number(item.y || 0) - area.y) * scale,
    width: Math.max(1, Number(item.width || 1) * scale),
    height: Math.max(1, Number(item.height || 1) * scale)
  }
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (e) {
    return null
  }
}

function validEditorDocument(value) {
  return !!value && typeof value === "object"
    && value.profile && typeof value.profile === "object"
    && value.profile.outputs instanceof Array
    && value.displays instanceof Array
}

function editorMetadata(editorDisplays, key) {
  var displays = editorDisplays instanceof Array ? editorDisplays : []
  for (var i = 0; i < displays.length; i++) {
    if (String((displays[i] || {}).key || "") === String(key || "")) return displays[i]
  }
  return {}
}

function outputLogicalSize(output) {
  var item = output || {}
  var scale = Number(item.scale || 1)
  if (!isFinite(scale) || scale <= 0) scale = 1
  var width = Math.max(1, Math.round(Number(item.width || 1) / scale))
  var height = Math.max(1, Math.round(Number(item.height || 1) / scale))
  if (Math.abs(Number(item.transform || 0)) % 2 === 1) {
    var swap = width
    width = height
    height = swap
  }
  return { width: width, height: height }
}

function outputMode(output) {
  var item = output || {}
  var mode = String(item.mode || "").trim()
  if (mode !== "") return mode
  var width = Number(item.width || 0)
  var height = Number(item.height || 0)
  var refresh = Number(item.refresh || 0)
  if (width <= 0 || height <= 0) return "preferred"
  return width + "x" + height + (refresh > 0 ? "@" + refresh.toFixed(2) + "Hz" : "")
}

function profileLayoutDisplays(profile, editorDisplays) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  var result = []
  for (var i = 0; i < outputs.length; i++) {
    var output = outputs[i] || {}
    if (output.enabled === false || mirrorTarget(output) !== "") continue
    var logical = outputLogicalSize(output)
    var metadata = editorMetadata(editorDisplays, output.key)
    var connected = Object.keys(metadata).length > 0
    result.push({
      key: String(output.key || ""),
      name: String(output.name || "Display"),
      description: String(output.description || ""),
      make: String(output.make || ""),
      model: String(output.model || ""),
      serial: String(output.serial || ""),
      mode: outputMode(output),
      scale: Number(output.scale || 1),
      internal: /^(eDP|LVDS|DSI)-/i.test(String(output.name || "")),
      focused: metadata.focused === true,
      connected: connected,
      x: Number(output.x || 0),
      y: Number(output.y || 0),
      width: logical.width,
      height: logical.height
    })
  }
  return result
}

function hiddenProfileDisplays(profile) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  var off = []
  var mirrored = []
  for (var i = 0; i < outputs.length; i++) {
    var output = outputs[i] || {}
    var name = String(output.name || "Display")
    if (output.enabled === false) off.push(name)
    else if (mirrorTarget(output) !== "") mirrored.push(name + " → " + outputName(profile, mirrorTarget(output)))
  }
  var parts = []
  if (off.length) parts.push("Off: " + off.join(", "))
  if (mirrored.length) parts.push("Mirrored: " + mirrored.join(", "))
  return parts.join("   ")
}

function outputByKey(profile, key) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  for (var i = 0; i < outputs.length; i++) {
    if (String((outputs[i] || {}).key || "") === String(key || "")) return outputs[i]
  }
  return null
}

function wrapIndex(index, length) {
  var count = Math.max(0, Number(length || 0))
  if (count === 0) return 0
  var value = Number(index || 0) % count
  return value < 0 ? value + count : value
}

function adjacentOutputKey(profile, selectedKey, delta) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  if (outputs.length === 0) return ""
  var current = 0
  for (var i = 0; i < outputs.length; i++) {
    if (String((outputs[i] || {}).key || "") === String(selectedKey || "")) {
      current = i
      break
    }
  }
  return String((outputs[wrapIndex(current + Number(delta || 0), outputs.length)] || {}).key || "")
}

function adjacentProfileName(profiles, selectedName, delta) {
  var items = profiles instanceof Array ? profiles : []
  if (items.length === 0) return ""
  var current = 0
  for (var i = 0; i < items.length; i++) {
    if (String((items[i] || {}).name || "") === String(selectedName || "")) {
      current = i
      break
    }
  }
  return String((items[wrapIndex(current + Number(delta || 0), items.length)] || {}).name || "")
}

function cycleOptionValue(options, currentValue, delta) {
  var items = options instanceof Array ? options : []
  if (items.length === 0) return String(currentValue || "")
  var current = 0
  for (var i = 0; i < items.length; i++) {
    var value = items[i] && typeof items[i] === "object" ? items[i].value : items[i]
    if (String(value) === String(currentValue || "")) {
      current = i
      break
    }
  }
  var selected = items[wrapIndex(current + Number(delta || 0), items.length)]
  return String(selected && typeof selected === "object" ? selected.value : selected)
}

// Match the TUI's Alt+arrow placement: use the nearest enabled, non-mirrored
// output as the anchor, put the selected output flush beside it, and center it
// on the other axis.
function snapOutputPosition(profile, selectedKey, direction) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  var selectedIndex = -1
  for (var i = 0; i < outputs.length; i++) {
    if (String((outputs[i] || {}).key || "") === String(selectedKey || "")) {
      selectedIndex = i
      break
    }
  }
  if (selectedIndex < 0) return null

  var selected = outputs[selectedIndex] || {}
  if (selected.enabled === false || mirrorTarget(selected) !== "") return null
  var selectedSize = outputLogicalSize(selected)
  var selectedCenterX = Number(selected.x || 0) * 2 + selectedSize.width
  var selectedCenterY = Number(selected.y || 0) * 2 + selectedSize.height
  var anchor = null
  var nearestDistance = Infinity

  for (var j = 0; j < outputs.length; j++) {
    var candidate = outputs[j] || {}
    if (j === selectedIndex || candidate.enabled === false || mirrorTarget(candidate) !== "") continue
    var candidateSize = outputLogicalSize(candidate)
    var dx = selectedCenterX - (Number(candidate.x || 0) * 2 + candidateSize.width)
    var dy = selectedCenterY - (Number(candidate.y || 0) * 2 + candidateSize.height)
    var distance = dx * dx + dy * dy
    if (distance < nearestDistance) {
      nearestDistance = distance
      anchor = { output: candidate, size: candidateSize }
    }
  }
  if (!anchor) return null

  var anchorX = Number(anchor.output.x || 0)
  var anchorY = Number(anchor.output.y || 0)
  if (direction === "left") {
    return {
      x: anchorX - selectedSize.width,
      y: anchorY + Math.trunc((anchor.size.height - selectedSize.height) / 2)
    }
  }
  if (direction === "right") {
    return {
      x: anchorX + anchor.size.width,
      y: anchorY + Math.trunc((anchor.size.height - selectedSize.height) / 2)
    }
  }
  if (direction === "up") {
    return {
      x: anchorX + Math.trunc((anchor.size.width - selectedSize.width) / 2),
      y: anchorY - selectedSize.height
    }
  }
  if (direction === "down") {
    return {
      x: anchorX + Math.trunc((anchor.size.width - selectedSize.width) / 2),
      y: anchorY + anchor.size.height
    }
  }
  return null
}

function outputName(profile, key) {
  var output = outputByKey(profile, key)
  return output ? String(output.name || key || "Display") : String(key || "Display")
}

function outputDisplayLabel(profile, key) {
  var output = outputByKey(profile, key)
  if (!output) return String(key || "Display")
  var makeModel = (String(output.make || "") + " " + String(output.model || "")).trim()
  return makeModel || String(output.description || "").trim() || String(output.name || key || "Display")
}

function clampBrightness(value) {
  var number = Number(value)
  if (!isFinite(number)) return 1
  return Math.max(1, Math.min(100, Math.round(number)))
}

// Brightness is live hardware state, not profile state. Resolve the selected
// profile output back to a connector only while that output is connected and
// enabled, then give the panel a friendly label that cannot be mistaken for a
// global brightness control.
function brightnessTarget(profile, key, editorDisplays) {
  var output = outputByKey(profile, key)
  var metadata = editorMetadata(editorDisplays, key)
  if (!output || output.enabled === false || Object.keys(metadata).length === 0) {
    return { connector: "", label: "" }
  }

  var connector = String(output.name || "").trim()
  if (connector === "") return { connector: "", label: "" }
  var makeModel = (String(output.make || "") + " " + String(output.model || "")).trim()
  var label = makeModel || String(output.description || "").trim() || connector
  return { connector: connector, label: label }
}

function initialOutputKey(profile, editorDisplays) {
  var displays = editorDisplays instanceof Array ? editorDisplays : []
  for (var i = 0; i < displays.length; i++) {
    if (displays[i] && displays[i].focused) return String(displays[i].key || "")
  }
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  for (var j = 0; j < outputs.length; j++) {
    if (outputs[j] && outputs[j].enabled !== false) return String(outputs[j].key || "")
  }
  return outputs.length ? String((outputs[0] || {}).key || "") : ""
}

function modeOptions(editorDisplays, key) {
  var metadata = editorMetadata(editorDisplays, key)
  var modes = metadata.available_modes instanceof Array ? metadata.available_modes : []
  return modes.map(function(mode) {
    var value = String(mode || "")
    return { value: value, label: displayDetailLabel({ mode: value, scale: 1 }).replace(/ · 1x$/, "") }
  })
}

function formatScale(value) {
  var number = Number(value)
  if (!isFinite(number) || number <= 0) number = 1
  return String(Math.round(number * 100000) / 100000)
}

function scaleOptions(editorDisplays, key, current) {
  var metadata = editorMetadata(editorDisplays, key)
  var values = metadata.scale_options instanceof Array ? metadata.scale_options.slice() : []
  var normalizedCurrent = formatScale(current)
  var found = false
  for (var i = 0; i < values.length; i++) {
    if (formatScale(values[i]) === normalizedCurrent) found = true
  }
  if (!found) values.push(Number(current || 1))
  values.sort(function(a, b) { return Number(a) - Number(b) })
  return values.map(function(value) {
    var formatted = formatScale(value)
    return { value: formatted, label: formatted + "x" }
  })
}

function mirrorOptions(profile, selectedKey) {
  var options = [{ value: "", label: "None" }]
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  for (var i = 0; i < outputs.length; i++) {
    var output = outputs[i] || {}
    if (String(output.key || "") === String(selectedKey || "") || output.enabled === false) continue
    options.push({ value: String(output.key || ""), label: String(output.name || "Display") })
  }
  return options
}

function outputOptions(profile) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  return outputs.map(function(output) {
    var item = output || {}
    return {
      value: String(item.key || ""),
      label: String(item.name || "Display") + (item.enabled === false ? " · off" : "")
    }
  })
}

function profileOptions(document) {
  var profiles = document && document.profiles instanceof Array ? document.profiles : []
  var options = []
  for (var i = 0; i < profiles.length; i++) {
    var profile = profiles[i] || {}
    if (Number(profile.connected_enabled_outputs || 0) <= 0) continue
    var suffix = profile.active ? " · active" : (profile.recommended ? " · best match" : "")
    options.push({ value: String(profile.name || ""), label: String(profile.name || "Profile") + suffix })
  }
  return options
}

function savedProfileByName(editorDocument, name) {
  var profiles = editorDocument && editorDocument.profiles instanceof Array ? editorDocument.profiles : []
  for (var i = 0; i < profiles.length; i++) {
    if (String((profiles[i] || {}).name || "") === String(name || "")) return profiles[i]
  }
  return null
}

function profileSummaryByName(document, name) {
  var profiles = document && document.profiles instanceof Array ? document.profiles : []
  for (var i = 0; i < profiles.length; i++) {
    if (String((profiles[i] || {}).name || "") === String(name || "")) return profiles[i]
  }
  return null
}

// The daemon owns display matching. This helper only picks the exact match it
// already identified so the panel can decide whether the current hardware set
// needs its own profile.
function exactDisplayProfile(document) {
  var profiles = document && document.profiles instanceof Array ? document.profiles : []
  var active = null
  var first = null
  for (var i = 0; i < profiles.length; i++) {
    var item = profiles[i] || {}
    if (item.exact_display_match !== true) continue
    if (item.recommended === true) return item
    if (item.active === true) active = item
    if (!first) first = item
  }
  return active || first
}

function profileWorkspacePlan(editorDocument, name) {
  var plans = editorDocument && editorDocument.profile_workspace_plans
  if (!plans || typeof plans !== "object") return []
  var plan = plans[String(name || "")]
  return plan instanceof Array ? plan : []
}

function displayType(metadata, output) {
  var live = metadata || {}
  var saved = output || {}
  return live.internal === true || /^(eDP|LVDS|DSI)-/i.test(String(saved.name || ""))
    ? "Internal display"
    : "External display"
}

function onOff(value) {
  return value === true ? "on" : "off"
}

function profileWorkspaceSummary(profile) {
  var settings = (profile || {}).workspaces || {}
  if (!settings.enabled) return "Disabled"
  var strategy = String(settings.strategy || "manual")
  var maximum = Number(settings.max_workspaces || 0)
  return strategy.charAt(0).toUpperCase() + strategy.slice(1)
    + (maximum > 0 ? " · " + maximum + " workspaces" : "")
}

function profileMatchLabel(summary) {
  var item = summary || {}
  var label = item.active ? "Active"
    : (item.recommended ? "Recommended"
      : (Number(item.match_score || 0) > 0 ? "Partial match" : "No match"))
  return Number(item.match_score || 0) > 0 ? label + " · score " + Number(item.match_score) : label
}

function matchReasonLabel(kind) {
  switch (String(kind || "")) {
    case "connected": return "connected"
    case "connected_kept_off": return "connected, kept off"
    case "not_connected": return "not connected"
    case "not_connected_kept_off": return "not connected, kept off"
    case "connected_unknown": return "connected, not in profile"
    default: return ""
  }
}

function profileMatchReasonRows(summary) {
  var item = summary || {}
  var reasons = item.match_reasons instanceof Array ? item.match_reasons : []
  return reasons.map(function(reason) {
    var count = Number((reason || {}).count || 0)
    var points = Number((reason || {}).points || 0)
    var score = Number(item.match_score || 0)
    var arithmetic = score > 0 ? (points > 0 ? "+" : "") + points + "   " : ""
    return {
      value: arithmetic + count + (count === 1 ? " display " : " displays ") + matchReasonLabel(reason.kind),
      positive: points > 0
    }
  })
}

function profileHiddenDisplayRows(profile) {
  var p = profile || {}
  var outputs = p.outputs instanceof Array ? p.outputs : []
  var rows = []
  var keptOff = []
  var mirrors = []
  for (var i = 0; i < outputs.length; i++) {
    var output = outputs[i] || {}
    if (output.enabled === false) keptOff.push(outputDisplayLabel(p, output.key))
    else if (mirrorTarget(output) !== "") {
      mirrors.push(outputDisplayLabel(p, output.key) + " → " + outputDisplayLabel(p, mirrorTarget(output)))
    }
  }
  for (var off = 0; off < keptOff.length; off++)
    rows.push({ label: off === 0 ? "Kept off" : "", value: keptOff[off] })
  for (var mirror = 0; mirror < mirrors.length; mirror++)
    rows.push({ label: mirror === 0 ? "Mirrors" : "", value: mirrors[mirror] })
  return rows
}

function profileUpdatedLabel(value) {
  var date = new Date(String(value || ""))
  if (!isFinite(date.getTime())) return "—"
  function pad(number) { return Number(number) < 10 ? "0" + Number(number) : String(number) }
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
    + " " + pad(date.getHours()) + ":" + pad(date.getMinutes())
}

function workspaceRuleNumber(value) {
  var text = String(value || "").trim()
  return /^[1-9][0-9]*$/.test(text) ? Number(text) : 0
}

function sortedManualWorkspaceRules(rules) {
  var items = rules instanceof Array ? clone(rules) || [] : []
  items.sort(function(left, right) {
    var leftNumber = workspaceRuleNumber((left || {}).workspace)
    var rightNumber = workspaceRuleNumber((right || {}).workspace)
    if (leftNumber > 0 && rightNumber > 0) return leftNumber - rightNumber
    if (leftNumber > 0) return -1
    if (rightNumber > 0) return 1
    var leftName = String((left || {}).workspace || "")
    var rightName = String((right || {}).workspace || "")
    return leftName < rightName ? -1 : (leftName > rightName ? 1 : 0)
  })
  return items
}

function manualWorkspaceTargetKeys(profile) {
  var settings = (profile || {}).workspaces || {}
  var order = settings.monitor_order instanceof Array ? settings.monitor_order : []
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  var keys = []
  var seen = ({})

  function add(key) {
    var value = String(key || "")
    var output = outputByKey(profile, value)
    if (value === "" || seen["key:" + value] || !output
        || output.enabled === false || mirrorTarget(output) !== "") return
    keys.push(value)
    seen["key:" + value] = true
  }

  for (var i = 0; i < order.length; i++) add(order[i])
  for (var j = 0; j < outputs.length; j++) add((outputs[j] || {}).key)
  return keys
}

function normalizeManualWorkspaceDefaults(rules) {
  var items = sortedManualWorkspaceRules(rules)
  var seen = ({})
  for (var i = 0; i < items.length; i++) {
    var rule = items[i] || {}
    var target = String(rule.output_key || rule.output_name || "")
    rule.default = false
    rule.persistent = false
    if (target !== "" && !seen["key:" + target]) {
      rule.default = true
      rule.persistent = true
      seen["key:" + target] = true
    }
    items[i] = rule
  }
  return items
}

function manualWorkspaceRulesFromPlan(plan, profile) {
  var rows = plan instanceof Array ? plan : []
  var rules = []
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {}
    var key = String(row.output_key || "")
    var workspaces = row.workspaces instanceof Array ? row.workspaces : []
    for (var j = 0; j < workspaces.length; j++) {
      rules.push({
        workspace: String(workspaces[j] || ""),
        output_key: key,
        output_name: outputName(profile, key)
      })
    }
  }
  if (rules.length > 0) return normalizeManualWorkspaceDefaults(rules)

  // A disabled planner has no daemon plan to materialize. Recreate the plan
  // from its saved generated settings so switching to manual still starts
  // from what the user configured rather than an empty list.
  var settings = (profile || {}).workspaces || {}
  var keys = manualWorkspaceTargetKeys(profile)
  var maximum = Math.max(1, Math.floor(Number(settings.max_workspaces || 9)))
  var groupSize = Math.max(1, Number(settings.group_size || 3))
  var interleave = String(settings.strategy || "") === "interleave"
  for (var workspace = 1; workspace <= maximum && keys.length > 0; workspace++) {
    var targetIndex = interleave
      ? (workspace - 1) % keys.length
      : Math.floor((workspace - 1) / groupSize) % keys.length
    var target = keys[targetIndex]
    rules.push({
      workspace: String(workspace),
      output_key: target,
      output_name: outputName(profile, target)
    })
  }
  return normalizeManualWorkspaceDefaults(rules)
}

function manualWorkspaceRows(profile) {
  var settings = (profile || {}).workspaces || {}
  var rules = sortedManualWorkspaceRules(settings.rules)
  return rules.map(function(rule) {
    var item = rule || {}
    var key = String(item.output_key || "")
    var label = key !== "" ? outputDisplayLabel(profile, key) : String(item.output_name || "Display")
    return {
      workspace: String(item.workspace || "?"),
      output_key: key,
      display_name: label
    }
  })
}

function manualWorkspaceCount(settings) {
  var value = settings || {}
  var rules = value.rules instanceof Array ? value.rules : []
  var maximum = 0
  for (var i = 0; i < rules.length; i++) {
    maximum = Math.max(maximum, workspaceRuleNumber((rules[i] || {}).workspace))
  }
  return maximum > 0 ? maximum : Math.max(1, Number(value.max_workspaces || 9))
}

function resizeManualWorkspaceRules(rules, profile, maximum) {
  var limit = Math.max(1, Math.floor(Number(maximum || 1)))
  var current = sortedManualWorkspaceRules(rules)
  var numbered = ({})
  var named = []
  for (var i = 0; i < current.length; i++) {
    var number = workspaceRuleNumber((current[i] || {}).workspace)
    if (number > 0 && number <= limit) numbered[String(number)] = current[i]
    else if (number === 0) named.push(current[i])
  }

  var keys = manualWorkspaceTargetKeys(profile)
  var resized = []
  for (var workspace = 1; workspace <= limit; workspace++) {
    var rule = numbered[String(workspace)] || { workspace: String(workspace) }
    if (!rule.output_key && keys.length > 0) {
      rule.output_key = keys[0]
      rule.output_name = outputName(profile, keys[0])
    }
    resized.push(rule)
  }
  return normalizeManualWorkspaceDefaults(resized.concat(named))
}

function cycleManualWorkspaceRule(rules, profile, rowIndex, delta) {
  var items = sortedManualWorkspaceRules(rules)
  var index = Number(rowIndex || 0)
  var keys = manualWorkspaceTargetKeys(profile)
  if (index < 0 || index >= items.length || keys.length === 0) return items

  var rule = items[index] || {}
  var current = keys.indexOf(String(rule.output_key || ""))
  if (current < 0) current = Number(delta || 0) < 0 ? 0 : -1
  var target = keys[wrapIndex(current + Number(delta || 0), keys.length)]
  rule.output_key = target
  rule.output_name = outputName(profile, target)
  items[index] = rule
  return normalizeManualWorkspaceDefaults(items)
}

function workspacePlanRows(plan, profile) {
  var rows = plan instanceof Array ? plan : []
  return rows.map(function(row) {
    var item = row || {}
    var workspaces = item.workspaces instanceof Array ? item.workspaces.join(", ") : ""
    return {
      key: String(item.output_key || ""),
      name: profile ? outputDisplayLabel(profile, item.output_key) : String(item.output_name || "Display"),
      workspaces: workspaces || "—"
    }
  })
}

function enabledOutputCount(profile) {
  var outputs = profile && profile.outputs instanceof Array ? profile.outputs : []
  var count = 0
  for (var i = 0; i < outputs.length; i++) if (outputs[i] && outputs[i].enabled !== false) count++
  return count
}

function layoutMetrics(bounds, canvasWidth, canvasHeight, padding) {
  var area = bounds || layoutBounds([])
  var inset = Math.max(0, Number(padding || 0))
  var usableWidth = Math.max(1, Number(canvasWidth || 1) - inset * 2)
  var usableHeight = Math.max(1, Number(canvasHeight || 1) - inset * 2)
  return { scale: Math.min(usableWidth / area.width, usableHeight / area.height) }
}

function workspaceText(plan, outputKey) {
  var rows = plan instanceof Array ? plan : []
  for (var i = 0; i < rows.length; i++) {
    if (String((rows[i] || {}).output_key || "") === String(outputKey || "")) {
      var workspaces = rows[i].workspaces instanceof Array ? rows[i].workspaces : []
      return workspaces.join(", ")
    }
  }
  return ""
}

function namedProfile(profile, name) {
  var copy = clone(profile) || { outputs: [] }
  copy.name = String(name || "").trim()
  return copy
}

// Omarchy installs plugins as git checkouts under ~/.config/omarchy/plugins and
// never updates them on its own, so the panel has to notice for itself. The
// check mirrors `omarchy plugin update`: fetch, then compare HEAD to FETCH_HEAD.
// Fetching is throttled, because opening a panel is not a reason to talk to a
// remote every time. Exit 10 means an update is waiting; anything else means
// there is nothing to say.
function pluginUpdateCheckCommand(pluginId, throttleHours) {
  var hours = Number(throttleHours || 6)
  return [
    "sh",
    "-c",
    'set -e; ' +
      'dir="$HOME/.config/omarchy/plugins/$1"; ' +
      '[ -d "$dir/.git" ] || exit 3; ' +
      'runtime="${XDG_RUNTIME_DIR:-}"; ' +
      '[ -n "$runtime" ] && [ -d "$runtime" ] || exit 6; ' +
      '[ "$(stat -c "%u:%a" -- "$runtime" 2>/dev/null)" = "$(id -u):700" ] || exit 6; ' +
      'stamp="$runtime/$1.update-check"; ' +
      'if [ -z "$(find "$stamp" -newermt "-$2 hours" 2>/dev/null)" ]; then ' +
      'git -C "$dir" fetch --quiet origin HEAD 2>/dev/null || exit 4; ' +
      '[ ! -L "$stamp" ] || exit 6; ' +
      '(umask 077; touch --no-dereference -- "$stamp") || exit 6; fi; ' +
      'head=$(git -C "$dir" rev-parse HEAD 2>/dev/null) || exit 5; ' +
      'remote=$(git -C "$dir" rev-parse FETCH_HEAD 2>/dev/null) || exit 5; ' +
      '[ "$head" = "$remote" ] || exit 10',
    "sh",
    String(pluginId || ""),
    String(hours)
  ]
}

// Omarchy's rescanPlugins discovers plugins but does not re-execute the QML of
// one already loaded, so a plugin that updates itself keeps showing its old
// code until the shell restarts. setsid takes the restart out of the shell's
// own process group, so killing the shell cannot kill the command relaunching it.
function shellRestartCommand() {
  return ["sh", "-c", "setsid -f omarchy-restart-shell >/dev/null 2>&1"]
}

// Keep updater output out of the long-lived shell: even a broken or compromised
// updater cannot grow its memory by writing forever. Exit 10 reports a changed
// checkout without collecting subprocess text; zero means it was already current.
function pluginUpdateCommand(pluginId) {
  return [
    "sh",
    "-c",
    'dir="$HOME/.config/omarchy/plugins/$1"; ' +
      '[ -d "$dir/.git" ] || exit 3; ' +
      'before=$(git -C "$dir" rev-parse HEAD 2>/dev/null) || exit 4; ' +
      'omarchy plugin update "$1" --yes >/dev/null 2>&1 || exit 5; ' +
      'after=$(git -C "$dir" rev-parse HEAD 2>/dev/null) || exit 4; ' +
      '[ "$before" = "$after" ] || exit 10',
    "sh",
    String(pluginId || "")
  ]
}

// releaseVersion pulls the plain version out of `hyprmoncfg version` output,
// which also carries a commit and a build date.
function releaseVersion(output) {
  var match = String(output || "").match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : ""
}

// daemonNeedsRestart reports an upgraded package whose daemon is still the
// previous binary. Installing runs as root and cannot restart a user service,
// so the old daemon keeps serving profiles until someone restarts it.
function daemonNeedsRestart(installedOutput, daemonVersion) {
  var installed = releaseVersion(installedOutput)
  var running = releaseVersion(daemonVersion)
  return installed !== "" && running !== "" && installed !== running
}

function versionAtLeast(output, minimum) {
  var text = String(output || "")
  if (/\bdev\b/.test(text)) return true

  function parts(value) {
    var match = String(value || "").match(/v?(\d+)\.(\d+)\.(\d+)/)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
  }

  var current = parts(text)
  var wanted = parts(minimum)
  if (!current || !wanted) return false
  for (var i = 0; i < 3; i++) {
    if (current[i] > wanted[i]) return true
    if (current[i] < wanted[i]) return false
  }
  return true
}

if (typeof module !== "undefined") {
  module.exports = {
    installCommand: installCommand,
    installProcessArgs: installProcessArgs,
    parseEnvelope: parseEnvelope,
    hiddenDisplays: hiddenDisplays,
    layoutDisplays: layoutDisplays,
    displayModelLabel: displayModelLabel,
    displayDetailLabel: displayDetailLabel,
    displayScaleLayoutLabel: displayScaleLayoutLabel,
    layoutBounds: layoutBounds,
    layoutRect: layoutRect,
    clone: clone,
    validEditorDocument: validEditorDocument,
    editorMetadata: editorMetadata,
    outputLogicalSize: outputLogicalSize,
    outputMode: outputMode,
    profileLayoutDisplays: profileLayoutDisplays,
    hiddenProfileDisplays: hiddenProfileDisplays,
    outputByKey: outputByKey,
    wrapIndex: wrapIndex,
    adjacentOutputKey: adjacentOutputKey,
    adjacentProfileName: adjacentProfileName,
    cycleOptionValue: cycleOptionValue,
    snapOutputPosition: snapOutputPosition,
    outputName: outputName,
    outputDisplayLabel: outputDisplayLabel,
    clampBrightness: clampBrightness,
    brightnessTarget: brightnessTarget,
    initialOutputKey: initialOutputKey,
    modeOptions: modeOptions,
    formatScale: formatScale,
    scaleOptions: scaleOptions,
    mirrorOptions: mirrorOptions,
    outputOptions: outputOptions,
    profileOptions: profileOptions,
    savedProfileByName: savedProfileByName,
    profileSummaryByName: profileSummaryByName,
    exactDisplayProfile: exactDisplayProfile,
    profileWorkspacePlan: profileWorkspacePlan,
    displayType: displayType,
    onOff: onOff,
    profileWorkspaceSummary: profileWorkspaceSummary,
    profileMatchLabel: profileMatchLabel,
    profileMatchReasonRows: profileMatchReasonRows,
    profileHiddenDisplayRows: profileHiddenDisplayRows,
    profileUpdatedLabel: profileUpdatedLabel,
    manualWorkspaceTargetKeys: manualWorkspaceTargetKeys,
    manualWorkspaceRulesFromPlan: manualWorkspaceRulesFromPlan,
    manualWorkspaceRows: manualWorkspaceRows,
    manualWorkspaceCount: manualWorkspaceCount,
    resizeManualWorkspaceRules: resizeManualWorkspaceRules,
    cycleManualWorkspaceRule: cycleManualWorkspaceRule,
    workspacePlanRows: workspacePlanRows,
    enabledOutputCount: enabledOutputCount,
    layoutMetrics: layoutMetrics,
    workspaceText: workspaceText,
    namedProfile: namedProfile,
    pluginUpdateCheckCommand: pluginUpdateCheckCommand,
    pluginUpdateCommand: pluginUpdateCommand,
    shellRestartCommand: shellRestartCommand,
    releaseVersion: releaseVersion,
    daemonNeedsRestart: daemonNeedsRestart,
    versionAtLeast: versionAtLeast
  }
}
