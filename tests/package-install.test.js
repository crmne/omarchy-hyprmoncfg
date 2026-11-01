const test = require('node:test')
const assert = require('node:assert/strict')
const { fs } = require('./english')
const os = require('node:os')
const path = require('node:path')
const {spawnSync} = require('node:child_process')
const vm = require('node:vm')
const Model = require('./script')('Model.js')
const qml = fs.readFileSync(path.join(__dirname, '..', 'Panel.qml'), 'utf8')

test('package detection excludes binary, development, and unmanaged installs from migration', () => {
  for (const [input, want] of [['hyprmoncfg\n','hyprmoncfg'], ['hyprmoncfg-bin\n','hyprmoncfg-bin'], ['hyprmoncfg-git\n','hyprmoncfg-git'], ['',''], ['hyprmoncfg-other',''], ['hyprmoncfg\nhyprmoncfg-git','hyprmoncfg-git']]) {
    assert.equal(Model.installedPackage(input), want)
  }
})

// Run the actual installer command against fake programs, never the host package manager.
function install(t, current, migrate, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-package-test-'))
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}))
  fs.writeFileSync(path.join(dir, 'state'), current)
  const scripts = {
    pacman: '[[ "$(cat "$TEST_DIR/state")" == "$2" ]]',
    yay: 'echo "yay $*" >> "$TEST_DIR/log"; if [[ "$FAKE_CANCEL" == 1 ]]; then exit 1; fi; if [[ "$FAKE_NOOP" != 1 ]]; then printf "%s" "${@: -1}" > "$TEST_DIR/state"; fi',
    systemctl: 'echo "systemctl $*" >> "$TEST_DIR/log"',
    setsid: 'echo "setsid $*" >> "$TEST_DIR/log"',
    omarchy: 'echo "omarchy $*" >> "$TEST_DIR/log"; printf "%s" hyprmoncfg-bin > "$TEST_DIR/state"'
  }
  for (const [name, script] of Object.entries(scripts)) fs.writeFileSync(path.join(dir,name), '#!/bin/bash\n'+script+'\n', {mode:0o700})
  const result = spawnSync('/bin/bash', ['-c', Model.installCommand(migrate)], {env:{...process.env, PATH:dir+':/usr/bin', TEST_DIR:dir, XDG_RUNTIME_DIR:dir, ...extra}, encoding:'utf8'})
  return {status:result.status, state:fs.readFileSync(path.join(dir,'state'),'utf8'), log:fs.existsSync(path.join(dir,'log')) ? fs.readFileSync(path.join(dir,'log'),'utf8') : '', complete:fs.existsSync(path.join(dir,'hyprmoncfg-panel-install.complete')), failed:fs.existsSync(path.join(dir,'hyprmoncfg-panel-install.failed'))}
}

test('explicit migration installs binaries, verifies replacement, then restarts and launches', t => {
  const got = install(t, 'hyprmoncfg', true)
  assert.equal(got.status, 0)
  assert.equal(got.state, 'hyprmoncfg-bin')
  assert.equal(got.complete, true)
  assert.equal(got.failed, false)
  assert.match(got.log, /yay -S --needed --cleanafter hyprmoncfg-bin\nsystemctl --user enable hyprmoncfgd.service\nsystemctl --user restart hyprmoncfgd.service\nsetsid/)
  assert.deepEqual(Model.installProcessArgs(true).slice(0,-1), Model.installProcessArgs().slice(0,-1))
  assert.doesNotMatch(Model.installCommand(true), /--noconfirm/)
})

test('cancellation, unchanged packages, and stale development-package actions never restart', t => {
  for (const [current, extra] of [['hyprmoncfg',{FAKE_CANCEL:'1'}], ['hyprmoncfg',{FAKE_NOOP:'1'}], ['hyprmoncfg-git',{}], ['',{}]]) {
    const got = install(t,current,true,extra)
    assert.notEqual(got.status,0)
    assert.equal(got.state,current)
    assert.equal(got.complete,false)
    assert.equal(got.failed,true)
    assert.doesNotMatch(got.log,/systemctl|setsid/)
  }
})

test('ordinary updates preserve the chosen package and fresh installs use binaries', t => {
  for (const current of ['hyprmoncfg','hyprmoncfg-bin','hyprmoncfg-git','']) {
    const got = install(t,current,false)
    assert.equal(got.status,0)
    assert.equal(got.state,current || 'hyprmoncfg-bin')
  }
})

test('migration row and activation respect drafts, previews and work in progress', () => {
  const expr = qml.match(/readonly property bool canSwitchToBinary: ([\s\S]*?)\n  \/\//)[1]
  const root = {installedPackage:'hyprmoncfg'}
  const canSwitch = () => vm.runInNewContext(expr, {root})
  assert.equal(canSwitch(),true)
  for (const field of ['installing','serviceActionPending','draftDirty','editPending','editorPreviewBlocked','daemonPreview']) {
    root[field] = true; assert.equal(canSwitch(),false); root[field] = false
  }
  root.installedPackage='hyprmoncfg-bin'; assert.equal(canSwitch(),false)
  const calls = []
  root.install = value => calls.push(value)
  const source = qml.match(/^  function switchToBinary\([\s\S]*?^  }/m)[0]
  const activate = vm.runInNewContext('('+source+')',{root})
  root.canSwitchToBinary = false; activate(); assert.deepEqual(calls,[])
  root.canSwitchToBinary = true; activate(); assert.deepEqual(calls,[true])
})
