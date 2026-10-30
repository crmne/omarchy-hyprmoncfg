const test = require('node:test')
const assert = require('node:assert/strict')
const picker = require('../WorkspacePicker.js')

test('picker discovery distinguishes missing, disabled and enabled plugins', () => {
  assert.deepEqual(picker.parseStatus('[]'), { installed:false, enabled:false })
  assert.deepEqual(picker.parseStatus(JSON.stringify([{id:picker.pickerId, enabled:false} ])), {installed:true, enabled:false})
  assert.deepEqual(picker.parseStatus(JSON.stringify([{id:picker.pickerId, enabled:true} ])), {installed:true, enabled:true})
  for (const input of ['broken', '{}', 'x'.repeat(1048577)]) assert.equal(picker.parseStatus(input), null)
})
test('picker actions require the current plan and never silently enable planning', () => {
  const absent = {installed:false, enabled:false}
  assert.equal(picker.offer(absent, false, true, false).enabled, false)
  assert.equal(picker.offer(absent, true, false, false).enabled, false)
  assert.equal(picker.offer(absent, true, true, false).action, 'install')
  assert.equal(picker.offer({installed:true, enabled:false}, true, true, false).action, 'use')
})
test('an active picker opens its overview even with an older daemon', () => {
  assert.equal(picker.offer({installed:true, enabled:true}, false, false, false).action, 'open')
})
test('previews, dirty drafts and ongoing operations block every picker action', () => {
  for (const status of [null, {installed:false}, {installed:true}, {installed:true, enabled:true}])
    assert.equal(picker.offer(status, true, true, true).enabled, false)
})

const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
function actionHarness(action, blocked = false) {
  const calls = [], delayed = []
  const root = {pickerOffer:{action, enabled:!blocked}, pickerBlockedReason:blocked?'preview':'',
    pickerScript:"/a path/it's a picker.rb", close:()=>calls.push('close'),
    checkWorkspacePicker:()=>calls.push('check')}
  const process = {command:[], startDetached:()=>calls.push(Array.from(process.command))}
  const qml = fs.readFileSync(path.join(__dirname, '..', 'Panel.qml'),'utf8')
  const source = qml.match(/^  function activateWorkspacePicker\([\s\S]*?^  }/m)[0]
  const invoke = vm.runInNewContext('('+source+')', {root, Picker:require('../WorkspacePicker.js'),
    pickerAction:process, Qt:{callLater:fn=>delayed.push(fn)},
    Util:{shellQuote:s=>"'"+s.replace(/'/g,"'\\''")+"'"}})
  invoke()
  delayed.forEach(fn=>fn())
  return calls
}
test('opening the picker uses the complete shell summon signature after closing', () => {
  assert.deepEqual(actionHarness('open'), ['close', ['omarchy-shell','shell','summon','crmne.hyprmoncfg-workspaces','{}']])
})
test('the installer stays interactive and quotes a plugin path with spaces and quotes', () => {
  const calls = actionHarness('install')
  assert.equal(calls[0], 'close')
  assert.deepEqual(calls[1].slice(0,-1), ['omarchy','launch','floating','terminal','with','presentation'])
  assert.equal(calls[1].at(-1), "ruby '/a path/it'\\''s a picker.rb' install")
})
test('blocked actions do not close a preview or launch a process', () => {
  for (const action of ['open','install','use']) assert.deepEqual(actionHarness(action,true), [])
  assert.deepEqual(actionHarness('check'), ['check'])
})
