// The panel's QML as these tests read it: a translated string shown as the
// English written beside its key, so that assertions about source text and
// functions run in vm keep working without a Strings object. Calls that fill
// in values stay as they are; pass the real layer with `Strings` from here.
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function english(source) {
  return source.replace(/Strings\.t\("[\w.]+", ("(?:[^"\\]|\\.)*")\)/g, "$1")
}

// node:fs, with .qml files read that way.
const englishFs = {
  ...fs,
  readFileSync(file, options) {
    const contents = fs.readFileSync(file, options)
    return String(file).endsWith(".qml") && typeof contents === "string" ? english(contents) : contents
  }
}

// Strings.js without its QML pragma. With no Qt here, it answers in English.
function loadStrings(extra = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", "Strings.js"), "utf8").replace(".pragma library", "")
  const context = { ...extra }
  vm.runInNewContext(source, context)
  return context
}

module.exports = { fs: englishFs, english, loadStrings, Strings: loadStrings() }
