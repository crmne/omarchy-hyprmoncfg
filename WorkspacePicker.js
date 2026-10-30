var pickerId = "crmne.hyprmoncfg-workspaces"

function parseStatus(text) {
  try {
    if (String(text).length > 1024 * 1024) return null
    var entries = JSON.parse(text)
    if (!Array.isArray(entries)) return null
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === pickerId)
        return { installed: true, enabled: entries[i].enabled === true }
    }
    return { installed: false, enabled: false }
  } catch (_) { return null }
}

function offer(status, capable, planned, blocked) {
  if (!status) return { action: "check", label: "Retry", description: "Check whether the workspace picker is installed.", enabled: !blocked }
  if (status.enabled) return { action: "", label: "", description: "", enabled: false }
  if (!capable) return { action: "", label: "Update required", description: "Update hyprmoncfg to connect the picker to your workspace plan.", enabled: false }
  if (!planned) return { action: "", label: "Plan required", description: "Apply a workspace plan to group your workspaces in the bar.", enabled: false }
  return { action: status.installed ? "use" : "install", label: status.installed ? "Use in bar" : "Install picker",
    description: "A workspace picker that follows your monitor layout.", enabled: !blocked }
}

// Match the picker's physical left-to-right, then top-to-bottom ordering.
function previewGroups(plan, displays) {
  var ordered = (displays || []).slice().sort(function(a, b) {
    return Number(a.x || 0) - Number(b.x || 0) || Number(a.y || 0) - Number(b.y || 0)
      || String(a.name || "").localeCompare(String(b.name || ""))
  })
  return ordered.map(function(display) {
    var group = (plan || []).filter(function(entry) { return entry.output_key === display.key })[0]
    var ids = group ? (group.workspaces || []).map(String).filter(function(id) {
      return /^[1-9][0-9]*$/.test(id) && Number(id) <= 2147483647
    }).map(Number).sort(function(a,b) { return a-b }) : []
    var shown = ids.slice(0,5).map(String)
    if (ids.length > 5) shown.push("+" + (ids.length-5))
    return { name: String(display.name || ""), workspaces: shown }
  }).filter(function(group) { return group.workspaces.length > 0 })
}

// This is a UI launch request, never a monitor or workspace configuration edit.
function editorOrigin(text, fallbackScreen) {
  try {
    if (String(text).length > 4096) return null
    var value = JSON.parse(text || "{}")
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    var screen = String(value.screen || fallbackScreen || "")
    if (!screen || screen.length > 256) return null
    var origin = { screen: screen }
    if ([value.x,value.y,value.width,value.height].every(function(v) { return typeof v === "number" && isFinite(v) })) {
      if (Math.abs(value.x) > 100000 || Math.abs(value.y) > 100000 || value.width <= 0 || value.width > 8192 || value.height <= 0 || value.height > 8192) return null
      origin.x=value.x; origin.y=value.y; origin.width=value.width; origin.height=value.height
    }
    return origin
  } catch (_) { return null }
}

function workspaceIds(text) {
  return String(text || "").split(/[,\s]+/).filter(function(value) {
    return /^[1-9][0-9]*$/.test(value) && Number(value) <= 2147483647
  }).map(Number)
}
function focusRequest(value, lua) {
  var id = String(value)
  if (workspaceIds(id).length !== 1 || !/^[1-9][0-9]*$/.test(id)) return ""
  return lua ? 'hl.dsp.focus({ workspace = "' + id + '" })' : "workspace " + id
}

if (typeof module !== "undefined") module.exports = { pickerId, parseStatus, offer, previewGroups, editorOrigin, workspaceIds, focusRequest }
