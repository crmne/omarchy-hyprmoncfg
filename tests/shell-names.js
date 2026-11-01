// Reads the names a QML tree declares and uses, without Qt: enough to compare
// the plugin with the oldest Omarchy shell it supports. QML type errors only
// appear when a file loads, on that shell, so nothing else catches them.
const fs = require("node:fs")
const path = require("node:path")

const stripComments = source => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/("(?:[^"\\\n]|\\.)*")|\/\/.*$/gm, "$1")

// Objects, their ids, declared members and top-level bindings. Plain braces
// (functions, object literals) are skipped over.
function parseQml(source) {
  const text = stripComments(source)
  const objects = []
  const blocks = []
  let current = null
  for (let i = 0; i < text.length;) {
    const char = text[i]
    if (char === '"' || char === "'" || char === "`") {
      for (i++; i < text.length && text[i] !== char; i++) if (text[i] === "\\") i++
      i++
    } else if (char === "{") {
      blocks.push(null)
      i++
    } else if (char === "}") {
      const closed = blocks.pop()
      if (closed) current = closed.parent
      i++
    } else if (/[A-Za-z_]/.test(char)) {
      const line = text.slice(text.lastIndexOf("\n", i) + 1, i).trim()
      const statementStart = line === "" || /[:;{]$/.test(line)
      const rest = text.slice(i, i + 200)
      const opened = statementStart && /^((?:[A-Za-z]+\.)*[A-Z]\w*)\s*\{/.exec(rest)
      const inObject = current && blocks[blocks.length - 1] && statementStart
      let match
      if (opened) {
        const object = { type: opened[1], id: null, parent: current, declared: [], bindings: [] }
        objects.push(object)
        blocks.push({ parent: current })
        current = object
        i += opened[0].length
      } else if (inObject && (match = /^id:\s*(\w+)/.exec(rest))) {
        current.id = match[1]
        i += match[0].length
      } else if (inObject && (match = /^(?:(?:required|readonly|default)\s+)*property\s+[\w.<>]+\s+(\w+)/.exec(rest))
        || inObject && (match = /^(?:signal|function)\s+(\w+)/.exec(rest))) {
        current.declared.push(match[1])
        i += match[0].length
      } else if (inObject && (match = /^(\w+)(?:\.\w+)*\s*:(?!:)/.exec(rest))) {
        current.bindings.push(match[1])
        i += match[0].length
      } else {
        while (i < text.length && /[\w.]/.test(text[i])) i++
      }
    } else {
      i++
    }
  }
  return { text, objects }
}

// Members of `readonly property QtObject name: QtObject { ... }`, as "name.member".
function nestedMembers(text) {
  const members = []
  for (const match of text.matchAll(/property\s+QtObject\s+(\w+)\s*:\s*QtObject\s*\{/g)) {
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    for (; i < text.length && depth > 0; i++) depth += text[i] === "{" ? 1 : text[i] === "}" ? -1 : 0
    for (const inner of text.slice(start, i).matchAll(/property\s+[\w.<>]+\s+(\w+)/g)) members.push(match[1] + "." + inner[1])
  }
  return members
}

function shellNames(shellDir) {
  const parsed = {}
  const modules = {}
  for (const module of ["Commons", "Ui"]) {
    const qmldir = fs.readFileSync(path.join(shellDir, module, "qmldir"), "utf8")
    modules[module] = {}
    for (const match of qmldir.matchAll(/^(singleton\s+)?(\w+)\s+[\d.]+\s+(\S+\.qml)$/gm)) {
      const source = fs.readFileSync(path.join(shellDir, module, match[3]), "utf8")
      const { text, objects } = parseQml(source)
      parsed[match[2]] = { root: objects[0], text, module, singleton: Boolean(match[1]) }
    }
  }
  const inherited = name => {
    const entry = parsed[name]
    if (!entry) return { base: name, members: [] }
    // A file may wrap the Qt type it is named after.
    const parent = entry.root.type === name ? { base: name, members: [] } : inherited(entry.root.type)
    return { base: parent.base, members: [...entry.root.declared, ...parent.members] }
  }
  for (const [name, entry] of Object.entries(parsed)) {
    const { base, members } = inherited(name)
    modules[entry.module][name] = entry.singleton
      ? { singleton: true, members: [...new Set([...members, ...nestedMembers(entry.text)])].sort() }
      : { base, members: [...new Set(members)].sort() }
  }
  return modules
}

module.exports = { parseQml, shellNames }
