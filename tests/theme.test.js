const test = require('node:test')
const assert = require('node:assert/strict')
const { fs } = require('./english')
const path = require('node:path')

test('runtime QML resolves Omarchy colors explicitly alongside QtQuick Color', () => {
  const root = path.join(__dirname, '..')
  for (const file of fs.readdirSync(root).filter(name => name.endsWith('.qml'))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /(?<![\w.])Color\./, file)
    if (source.includes('Commons.Color.')) assert.match(source, /^import qs\.Commons as Commons$/m, file)
  }
})
