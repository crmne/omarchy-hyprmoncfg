// The catalogs in i18n/ and the rule that visible text goes through them.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { loadStrings } = require("./english")

const root = path.join(__dirname, "..")
const read = name => fs.readFileSync(path.join(root, name), "utf8")

// Omarchy's languages (default/i18n/locales.json) by the plural categories
// each needs (shell/Commons/Plural.js categories()). Update both from upstream
// when Omarchy adds a language.
const pluralCategories = {
  "zero one two few many other": "ar",
  "one other": "bg bn da de el en et fa fi fil hi hu is nl no si sv sw ta tr ur uz",
  "one many other": "ca es-MX fr it pt pt-BR",
  "one few other": "cs hr lt ro sk sr",
  "one two few many other": "ga",
  "one two other": "he",
  "other": "id ja ko ms th vi zh-CN zh-TW",
  "zero one other": "lv",
  "one few many other": "pl ru uk",
  "one two few other": "sl"
}
const languages = Object.entries(pluralCategories).flatMap(([categories, codes]) =>
  codes.split(" ").map(code => ({ code, categories: categories.split(" ") })))

// Names and units a translation has to keep exactly as written.
const literals = ["hyprmoncfg", "Hyprland", "Omarchy", "TUI", "EDID", "EOTF", "ICC", "SDR", "HDR", "WCG", "BPC", "PQ", "VRR",
  "cd/m²", "px", "Esc", "Enter", "Shift", "Ctrl", "Alt", "hjkl", "⚠", "->"]

const english = JSON.parse(read("i18n/en.json"))
const tokens = text => [...new Set(String(text).match(/%\d/g) || [])].sort()
const forms = value => typeof value === "string" ? [value] : Object.values(value)

function catalog(code) {
  return JSON.parse(read("i18n/" + code + ".json"))
}

const sources = fs.readdirSync(root).filter(name => /\.(qml|js)$/.test(name) && name !== "Strings.js")

// Every lookup in the code, as [key, English].
function lookups() {
  const string = String.raw`"((?:[^"\\]|\\.)*)"`
  const found = []
  for (const file of sources) {
    const source = read(file)
    for (const match of source.matchAll(new RegExp(String.raw`(?:Strings\.t|\btr|outputFieldResetTooltip)\("([\w.]+)",\s*` + string, "g")))
      found.push({ file, key: match[1], english: JSON.parse('"' + match[2] + '"') })
    for (const match of source.matchAll(new RegExp(String.raw`(?:Strings\.tn|\btrn)\("([\w.]+)",[^"]*?` + string + String.raw`,\s*` + string, "g")))
      found.push({ file, key: match[1], english: { one: JSON.parse('"' + match[2] + '"'), other: JSON.parse('"' + match[3] + '"') } })
  }
  return found.filter(item => item.key !== "key")
}

test("there is one catalog per Omarchy language and no others", () => {
  const files = fs.readdirSync(path.join(root, "i18n")).filter(name => name.endsWith(".json")).sort()
  assert.deepEqual(files, languages.map(language => language.code + ".json").sort())
})

test("catalogs are valid JSON objects of strings and plural forms", () => {
  for (const { code } of languages) {
    const parsed = catalog(code)
    assert.equal(typeof parsed, "object", code)
    assert.equal(Array.isArray(parsed), false, code)
    for (const [key, value] of Object.entries(parsed)) {
      assert.ok(typeof value === "string" || (value && typeof value === "object" && !Array.isArray(value)), code + " " + key)
      for (const form of forms(value)) assert.ok(typeof form === "string" && form.trim() !== "", code + " " + key)
    }
  }
})

test("catalogs hold only English keys, and missing ones only warn", t => {
  for (const { code } of languages) {
    const keys = Object.keys(catalog(code))
    assert.deepEqual(keys.filter(key => !(key in english)), [], code + " has unknown keys")
    // A missing string falls back to English, so a new one needn't wait for translators.
    const missing = Object.keys(english).filter(key => !keys.includes(key))
    if (missing.length) t.diagnostic(code + " is missing " + missing.length + " strings: " + missing.join(", "))
  }
})

test("translations keep every token and no others", () => {
  for (const { code } of languages) {
    const parsed = catalog(code)
    for (const [key, value] of Object.entries(parsed)) {
      const expected = tokens(forms(english[key] ?? "").join(" "))
      for (const form of forms(value)) assert.deepEqual(tokens(form), expected, code + " " + key + ": " + form)
    }
  }
})

test("plural entries carry the categories their language uses", () => {
  const plurals = Object.keys(english).filter(key => typeof english[key] !== "string")
  assert.ok(plurals.length > 0)
  for (const { code, categories } of languages) {
    const parsed = catalog(code)
    for (const key of plurals.filter(key => key in parsed)) {
      assert.equal(typeof parsed[key], "object", code + " " + key)
      assert.deepEqual(Object.keys(parsed[key]).sort(), [...categories].sort(), code + " " + key)
    }
    for (const key of Object.keys(parsed).filter(key => !plurals.includes(key)))
      assert.equal(typeof parsed[key], "string", code + " " + key)
  }
})

test("names and units stay as they are in every language", () => {
  for (const { code } of languages) {
    const parsed = catalog(code)
    for (const [key, value] of Object.entries(english)) {
      // The verb here, not the key.
      const source = forms(value).join(" ").replace("None. Enter an absolute", "")
      const wanted = literals.filter(literal => new RegExp("(^|[^A-Za-z])" + literal.replace(/[/\-]/g, "\\$&") + "([^A-Za-z]|$)").test(source))
      for (const form of forms(parsed[key] ?? ""))
        for (const literal of wanted) assert.ok(form.includes(literal), code + " " + key + " lost " + literal + ": " + form)
    }
  }
})

test("en.json is exactly the English written in the code", () => {
  const seen = {}
  for (const item of lookups()) {
    assert.deepEqual(item.english, english[item.key], item.file + " " + item.key)
    seen[item.key] = true
  }
  assert.deepEqual(Object.keys(english).filter(key => !seen[key]), [], "keys nothing uses")
})

test("every file that shows text imports Strings.js", () => {
  for (const file of sources.filter(name => name.endsWith(".qml") && name !== "StringsSource.qml")) {
    const source = read(file)
    if (/\bStrings\./.test(source)) assert.match(source, /import "Strings\.js" as Strings/, file)
  }
  // A plain script cannot reach Strings.js through the file importing it: Qt
  // caches that lookup per script, by import position, across all importers.
  for (const file of sources.filter(name => name.endsWith(".js"))) {
    const source = read(file)
    if (/\bStrings\./.test(source)) assert.match(source, /^\.pragma library\n\.import "Strings\.js" as Strings\n/, file)
  }
})

test("only StringsSource.qml names the type older Omarchy lacks", () => {
  for (const file of sources.filter(name => name.endsWith(".qml") && name !== "StringsSource.qml")) {
    assert.doesNotMatch(read(file), /Commons\.Translations|Commons\.I18n/, file)
  }
})

const visibleProperty = /\b(?:text|title|subtitle|label|meta|detail|description|tooltipText|placeholderText|resetTooltip|toggleLabel|moreText|action|lastError|errorMessage|actionError|identifyError)\b\s*[:=]/
// Shown as written everywhere: product names and standards.
const allowedLiterals = new Set(["hyprmoncfg", "hyprmoncfg Workspaces", "TUI", "VRR", "SDR EOTF", "sRGB", "sRGB (SDR)",
  "BT.2020 (SDR)", "BT.2020 + PQ (HDR)", "DCI-P3", "Display P3", "Adobe RGB", "Gamma 2.2", "8-bit", "10-bit", "/path/to/script.sh",
  "90°", "180°", "270°", "transform "])

function hardCoded(source) {
  const found = []
  source.split("\n").forEach((line, index) => {
    if (/^\s*(\/\/|import\b)/.test(line) || !visibleProperty.test(line)) return
    const bare = line.replace(/(?:Strings\.tn?|\btrn?)\("[\w.]+"(?:,\s*[^",\s][^",]*)?(?:,\s*"(?:[^"\\]|\\.)*")*/g, "")
      .replace(/\b(?:keys|value|id): "[^"]*"/g, "")
      .replace(/outputFieldResetTooltip\("[\w.]+",\s*"(?:[^"\\]|\\.)*"/g, "")
      .replace(/\b[\w.]+\s*(?:===|!==)\s*"[^"]*"/g, "")
      .replace(/"[^"]*"\s*(?:===|!==)/g, "")
    for (const match of bare.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      if (/\p{L}{2}/u.test(match[1]) && !allowedLiterals.has(match[1]) && !/^(?:#|[a-z]+$|[a-z]+:)/.test(match[1]))
        found.push((index + 1) + ": " + match[1])
    }
  })
  return found
}

test("the hard-coded text check catches what it should", () => {
  assert.deepEqual(hardCoded('  text: "Save profile"'), ["1: Save profile"])
  assert.deepEqual(hardCoded('  label: ready ? "Keep" : "Discard"'), ["1: Keep", "1: Discard"])
  assert.deepEqual(hardCoded('  root.lastError = "Could not save."'), ["1: Could not save."])
  assert.deepEqual(hardCoded('  text: "Count " + value'), ["1: Count "])
  assert.deepEqual(hardCoded('  text: Strings.t("a.b", "Save profile")'), [])
  assert.deepEqual(hardCoded('  text: Strings.tn("a.b", count, "%1 display", "%1 displays")'), [])
  assert.deepEqual(hardCoded('  text: "hyprmoncfg"'), [])
  assert.deepEqual(hardCoded('  text: root.stage === "applying" ? "" : ""'), [])
})

test("QML text properties have no hard-coded English", () => {
  for (const file of sources.filter(name => name.endsWith(".qml")))
    assert.deepEqual(hardCoded(read(file)), [], file)
})

test("the layer answers in English without Commons.Translations", () => {
  const strings = loadStrings()
  assert.equal(strings.t("a", "Save"), "Save")
  assert.equal(strings.t("a", "Reset %1 to %2", "scale", "laptop"), "Reset scale to laptop")
  assert.equal(strings.tn("a", 1, "%1 display", "%1 displays"), "1 display")
  assert.equal(strings.tn("a", 3, "%1 display", "%1 displays"), "3 displays")
  assert.equal(strings.number(1.5, 2), "1.50")
  assert.equal(strings.rightToLeft(), false)
})

test("a failed or broken load falls back to English and never throws", () => {
  const failed = loadStrings({ Qt: { resolvedUrl: url => url, createComponent: () => ({ status: 3 }) } })
  assert.equal(failed.t("a", "Save"), "Save")
  const thrown = loadStrings({ Qt: { resolvedUrl: url => url, createComponent: () => { throw new Error("no") } } })
  assert.equal(thrown.tn("a", 2, "%1 x", "%1 xs"), "2 xs")
  const broken = { t() { throw new Error("gone") }, tn() { throw new Error("gone") }, number() { throw new Error("gone") } }
  const stale = loadStrings({ Qt: { resolvedUrl: url => url, createComponent: () => ({ status: 1, createObject: () => broken }) } })
  assert.equal(stale.t("a", "Save"), "Save")
  assert.equal(stale.tn("a", 2, "%1 x", "%1 xs"), "2 xs")
})

test("values are filled once, so a name holding %1 stays as typed", () => {
  const strings = loadStrings()
  assert.equal(strings.t("a", "%1 and %2", "100%2", "b"), "100%2 and b")
  const translated = { t: (key, fallback) => "Oversat " + fallback, tn: (key, count) => count === 1 ? "en" : "%1 flere", number: value => "٢", rightToLeft: true }
  const live = loadStrings({ Qt: { resolvedUrl: url => url, createComponent: () => ({ status: 1, createObject: () => translated }) } })
  assert.equal(live.t("a", "Save"), "Oversat Save")
  assert.equal(live.tn("a", 2, "%1 x", "%1 xs"), "٢ flere")
  assert.equal(live.rightToLeft(), true)
})

test("the canvas stays physical when the key catcher mirrors Left and Right", () => {
  const panel = require("./english").english(read("Panel.qml"))
  const source = panel.match(/^  function handleExpandedMove\([\s\S]*?^  }/m)[0]
  const nudge = rightToLeft => {
    const moves = []
    const root = { keyboardHelpOpen: false, previewTransaction: "", activePage: "layout", keyboardLayoutPane: "canvas",
      nudgeSelectedOutput: (dx, dy) => moves.push([dx, dy]) }
    vm.runInNewContext("(" + source + ")", { root, Strings: { rightToLeft: () => rightToLeft } })(-1, 0)
    return moves[0]
  }
  assert.deepEqual(nudge(false), [-100, 0])
  // The catcher reports the Right key as -1 in a mirrored panel.
  assert.deepEqual(nudge(true), [100, 0])
})
