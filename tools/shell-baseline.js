#!/usr/bin/env node
// Regenerates tests/shell-baseline.json from the oldest supported Omarchy:
//   git -C ~/Code/omarchy archive <tag> shell bin | tar -x -C <dir>
//   node tools/shell-baseline.js <dir> <tag>
const fs = require("node:fs")
const path = require("node:path")
const { shellNames } = require("../tests/shell-names")

const [dir, version] = process.argv.slice(2)
if (!dir || !version) throw new Error("usage: shell-baseline.js <omarchy-dir> <version>")
const baseline = {
  version,
  commands: fs.readdirSync(path.join(dir, "bin")).filter(name => name.startsWith("omarchy")).sort(),
  ...shellNames(path.join(dir, "shell"))
}
fs.writeFileSync(path.join(__dirname, "..", "tests", "shell-baseline.json"), JSON.stringify(baseline, null, 1) + "\n")
