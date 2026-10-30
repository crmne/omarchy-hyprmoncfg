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
  if (status.enabled) return { action: "open", label: "Show overview", description: "Active in your bar. Workspaces are grouped by monitor.", enabled: !blocked }
  if (!capable) return { action: "", label: "Update required", description: "Update hyprmoncfg to connect the picker to your workspace plan.", enabled: false }
  if (!planned) return { action: "", label: "Plan required", description: "Apply a workspace plan to group your workspaces in the bar.", enabled: false }
  return { action: status.installed ? "use" : "install", label: status.installed ? "Use in bar" : "Install picker",
    description: "Group your workspaces by monitor, with a layout overview on right-click.", enabled: !blocked }
}

if (typeof module !== "undefined") module.exports = { pickerId, parseStatus, offer }
