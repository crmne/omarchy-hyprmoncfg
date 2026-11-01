// Loads one of the panel's QML library scripts in Node. QML's directives are
// not JavaScript, so they become blank lines, and the Strings import becomes
// the real layer, which answers in English here.
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { Strings } = require("./english")

const loaded = {}

module.exports = function script(name) {
  if (loaded[name]) return loaded[name]
  const file = path.join(__dirname, "..", name)
  const source = fs.readFileSync(file, "utf8").replace(/^\.(pragma|import)\b.*$/gm, "")
  const scriptModule = { exports: {} }
  vm.compileFunction(source, ["module", "Strings"], { filename: file })(scriptModule, Strings)
  loaded[name] = scriptModule.exports
  return loaded[name]
}
