.pragma library

// The panel's visible text, shared by every QML file and JS model.
//
//   Strings.t("key", "English %1", value)
//   Strings.tn("key", count, "%1 display", "%1 displays")
//
// Catalogs are i18n/<code>.json, read through Omarchy's Commons.Translations,
// which follows Setup > Language live, falls back string by string and picks
// plural forms. A binding that reaches t() subscribes to it, so it re-renders
// when the language changes, even through Model.js, which imports this file
// as a library for that reason.
//
// Commons.Translations and Commons.I18n arrived together. Naming the type
// directly in a QML file stops that file loading on an older Omarchy, so only
// StringsSource.qml names it, and it is loaded here where a failure is
// harmless. Without it, as in tests, every call answers with the English
// written beside its key; i18n/en.json has to match those, which
// tests/i18n.test.js checks.

var source = undefined
var component = null

function load() {
  if (source !== undefined) return source
  try {
    if (!component) component = Qt.createComponent(Qt.resolvedUrl("StringsSource.qml"))
    if (component.status === 2) return null // Still loading: ask again next lookup.
    source = component.status === 1 ? component.createObject(null) : null
  } catch (e) {
    source = null
  }
  return source
}

// One pass, so a %1 inside an inserted profile name is left alone.
function fill(text, values) {
  return String(text).replace(/%(\d)/g, function(token, position) {
    var value = values[Number(position) - 1]
    return value === undefined ? token : String(value)
  })
}

function t(key, fallback) {
  var values = Array.prototype.slice.call(arguments, 2)
  var text = fallback
  try {
    var strings = load()
    if (strings) text = strings.t(key, fallback)
  } catch (e) {
    text = fallback
  }
  return fill(text, values)
}

// %1 is the count, written the language's way; further values follow from %2.
function tn(key, count, one, other) {
  var fallback = Number(count) === 1 ? one : other
  var values = [number(count)].concat(Array.prototype.slice.call(arguments, 4))
  var text = fallback
  try {
    var strings = load()
    if (strings) text = strings.tn(key, count, fallback)
  } catch (e) {
    text = fallback
  }
  return fill(text, values)
}

// A displayed number with the language's digits and decimal separator.
function number(value, decimals) {
  try {
    var strings = load()
    if (strings) return strings.number(value, decimals)
  } catch (e) {
  }
  return decimals === undefined ? String(value) : Number(value).toFixed(decimals)
}

// Left-to-right values inside right-to-left text, so -100,0 keeps its sign in front.
function isolated(text) {
  return rightToLeft() ? "\u2066" + text + "\u2069" : String(text)
}

function rightToLeft() {
  try {
    var strings = load()
    return strings ? strings.rightToLeft === true : false
  } catch (e) {
    return false
  }
}
