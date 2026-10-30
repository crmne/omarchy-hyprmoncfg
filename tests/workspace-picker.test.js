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
test('an active picker has no installation offer', () => {
  assert.equal(picker.offer({installed:true, enabled:true}, false, false, false).action, '')
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

test('the in-canvas preview follows physical display order without renumbering workspaces', () => {
  const displays = [{key:'right',x:100,y:0},{key:'bottom',x:0,y:100},{key:'top',x:0,y:-100}]
  const plan = [{output_key:'right',workspaces:['7','8','9']},{output_key:'top',workspaces:['1','2','3']},{output_key:'bottom',workspaces:['4','5','6']}]
  assert.deepEqual(picker.previewGroups(plan,displays).map(group=>group.workspaces), [['1','2','3'],['4','5','6'],['7','8','9']])
  displays[0].x = -100
  assert.deepEqual(picker.previewGroups(plan,displays)[0].workspaces, ['7','8','9'])
  assert.deepEqual(picker.previewGroups(plan,[]), [])
})

test('planner launch requests accept only bounded local popup coordinates', () => {
  assert.deepEqual(picker.editorOrigin('{}','DP-1'), {screen:'DP-1'})
  assert.deepEqual(picker.editorOrigin('{"screen":"DP-2","x":12,"y":0,"width":124,"height":26}','DP-1'), {screen:'DP-2',x:12,y:0,width:124,height:26})
  for (const text of ['broken','null','[]','{"screen":"DP-1","x":0,"y":0,"width":-1,"height":26}','x'.repeat(4097)]) assert.equal(picker.editorOrigin(text,''),null)
})

test('workspace targets preserve numeric IDs and never accept dispatch fragments', () => {
  assert.deepEqual(picker.workspaceIds('1, 2, 12'),[1,2,12])
  assert.equal(picker.focusRequest(12,true),'hl.dsp.focus({ workspace = "12" })')
  assert.equal(picker.focusRequest(12,false),'workspace 12')
  for (const value of ['1; exec bad','1,2','1 2','-1','0',2147483648]) assert.equal(picker.focusRequest(value,true),'')
})
