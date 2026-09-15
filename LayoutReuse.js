function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

function sameModel(a, b) {
  return normalized(a.model) !== "" && normalized(a.model) === normalized(b.model)
    && normalized(a.make) === normalized(b.make)
}

function identity(a) { return String(a.match_key || a.key || "") }
function internal(a) { return /^(edp|lvds|dsi)-/i.test(String(a.name || "")) }

// Reserve exact hardware first. Same-model guesses are only proposed mappings;
// the user identifies the physical screens and confirms their roles.
function suggestedMapping(profile, liveProfile) {
  var saved = (profile || {}).outputs || []
  var live = (liveProfile || {}).outputs || []
  var mapping = {}, used = {}
  saved.forEach(function(out) { mapping[out.key] = "" })
  for (var pass = 0; pass < 4; pass++) {
    saved.forEach(function(out) {
      if (mapping[out.key]) return
      var candidates = live.filter(function(target) {
        if (used[target.key]) return false
        if (pass === 0) return out.key === target.key
        if (pass === 1) return identity(out) !== "" && identity(out) === identity(target)
        if (pass === 2) return sameModel(out, target)
        return internal(out) === internal(target)
      })
      candidates.sort(function(a, b) {
        var byName = Number(b.name === out.name) - Number(a.name === out.name)
        return byName || Number(a.x || 0) - Number(b.x || 0)
          || String(a.name || "").localeCompare(String(b.name || ""))
      })
      if (candidates.length) {
        mapping[out.key] = candidates[0].key
        used[candidates[0].key] = true
      }
    })
  }
  return mapping
}

function templates(profiles, liveProfile) {
  var live = (liveProfile || {}).outputs || []
  return (profiles || []).map(function(profile) {
    var mapping = suggestedMapping(profile, liveProfile)
    var matched = 0, exact = 0, modes = 0
    var saved = profile.outputs || []
    saved.forEach(function(out) {
      var target = live.filter(function(item) { return item.key === mapping[out.key] })[0]
      if (!target) return
      if (sameModel(out, target)) matched++
      if (identity(out) === identity(target)) exact++
      if (out.width === target.width && out.height === target.height) modes++
    })
    var sameCount = saved.length === live.length
    var reason = sameCount && matched === live.length ? "Same monitor models"
      : matched + " matching " + (matched === 1 ? "model" : "models")
    return { name: profile.name, profile: profile, mapping: mapping,
      score: matched * 100 + exact * 10 + modes * 3 - Math.abs(saved.length - live.length) * 80,
      reason: reason + " · " + saved.length + " saved displays" }
  }).sort(function(a, b) { return b.score - a.score || a.name.localeCompare(b.name) })
}

function assign(mapping, sourceKey, targetKey) {
  var next = Object.assign({}, mapping)
  var previous = next[sourceKey] || ""
  // Selecting an occupied screen swaps the two roles, so left/right is one step.
  if (targetKey) Object.keys(next).forEach(function(key) {
    if (key !== sourceKey && next[key] === targetKey) next[key] = previous
  })
  next[sourceKey] = targetKey
  return next
}

function nextName(name, profiles) {
  var base = String(name || "Layout") + " (new setup)"
  var candidate = base, suffix = 2
  while ((profiles || []).some(function(p) { return p.name === candidate }))
    candidate = base + " " + suffix++
  return candidate
}

function roleLabel(output) {
  return String(output.name || "Display") + " · "
    + [output.make, output.model].filter(Boolean).join(" ")
    + " · " + Number(output.x || 0) + ", " + Number(output.y || 0)
    + (output.enabled === false ? " · off" : "")
}

if (typeof module !== "undefined") module.exports = {
  sameModel: sameModel, suggestedMapping: suggestedMapping, templates: templates,
  assign: assign, nextName: nextName, roleLabel: roleLabel
}
