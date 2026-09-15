const test = require('node:test')
const assert = require('node:assert/strict')
const Reuse = require('../LayoutReuse.js')
const Model = require('../Model.js')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

function screen(key, name, model, x = 0) {
  return { key, match_key: key, name, make: 'Dell', model, x, width: 1920, height: 1080, enabled: true }
}
const laptop = screen('laptop', 'eDP-1', 'Panel')
const oldLeft = screen('old-left', 'DP-1', 'P2719H', -1920)
const oldRight = screen('old-right', 'DP-2', 'P2719H', 0)
const left = screen('new-left', 'DP-1', 'P2719H', 0)
const right = screen('new-right', 'DP-2', 'P2719H', 1920)
const work = { name: 'Work', outputs: [laptop, oldLeft, oldRight] }
const live = { outputs: [laptop, left, right] }

test('same-model dual monitor setup ranks above a partial laptop hardware match', () => {
  const discovery = { name: 'Discovery', outputs: [laptop, screen('other', 'HDMI-A-1', 'Other')] }
  const suggestions = Reuse.templates([discovery, work], live)
  assert.equal(suggestions[0].name, 'Work')
  assert.match(suggestions[0].reason, /Same monitor models/)
  assert.deepEqual(suggestions[0].mapping, { laptop: 'laptop', 'old-left': 'new-left', 'old-right': 'new-right' })
})

test('exact identities are reserved before same-model guesses despite changed connector names', () => {
  const exactRight = { ...right, name: 'DP-1' }
  const replacement = { ...left, name: 'DP-2' }
  const template = { outputs: [oldLeft, right] }
  assert.deepEqual(Reuse.suggestedMapping(template, { outputs: [exactRight, replacement] }),
    { 'old-left': 'new-left', 'new-right': 'new-right' })
})

test('unique output keys are reserved before shared serialless hardware identities', () => {
  const saved = { outputs: [
    { ...oldLeft, match_key: 'same-model' },
    { ...right, match_key: 'same-model' }
  ] }
  const current = { outputs: [
    { ...right, name: 'DP-1', match_key: 'same-model' },
    { ...left, name: 'DP-2', match_key: 'same-model' }
  ] }
  assert.deepEqual(Reuse.suggestedMapping(saved, current), { 'old-left': 'new-left', 'new-right': 'new-right' })
})

test('changing one occupied target swaps the roles without losing assignment', () => {
  const original = { a: 'left', b: 'right', c: 'laptop' }
  assert.deepEqual(Reuse.assign(original, 'a', 'right'), { a: 'right', b: 'left', c: 'laptop' })
  assert.deepEqual(original, { a: 'left', b: 'right', c: 'laptop' })
  assert.deepEqual(Reuse.assign(original, 'a', ''), { a: '', b: 'right', c: 'laptop' })
})

test('different models and display counts remain available as explicit templates', () => {
  const mapping = Reuse.suggestedMapping(work, { outputs: [laptop, screen('other', 'HDMI-A-1', 'Different')] })
  assert.equal(mapping.laptop, 'laptop')
  assert.equal(Object.values(mapping).filter(Boolean).length, 2)
  assert.equal(Object.values(mapping).filter(v => v === '').length, 1)
  assert.equal(Reuse.templates([work], { outputs: [laptop] }).length, 1)
})

test('template defaults never duplicate target assignments for indistinguishable screens', () => {
  const targets = { outputs: [left, right, { ...left, key: 'third', name: 'DP-3' }] }
  for (let count = 1; count <= 5; count++) {
    const saved = { outputs: Array.from({ length: count }, (_, i) => ({ ...oldLeft, key: 'saved-' + i, name: 'DP-' + i })) }
    const mapped = Object.values(Reuse.suggestedMapping(saved, targets)).filter(Boolean)
    assert.equal(new Set(mapped).size, mapped.length)
  }
})

test('new setup names do not overwrite an existing saved profile', () => {
  assert.equal(Reuse.nextName('Work', [work]), 'Work (new setup)')
  assert.equal(Reuse.nextName('Work', [{ name: 'Work (new setup)' }, { name: 'Work (new setup) 2' }]), 'Work (new setup) 3')
})

function panelFunction(name, root, globals = {}) {
  const qml = fs.readFileSync(path.join(__dirname, '..', 'Panel.qml'), 'utf8')
  const source = qml.match(new RegExp('^  function ' + name + '\\([\\s\\S]*?^  }', 'm'))[0]
  return vm.runInNewContext('(' + source + ')', { root, Model, Reuse, ...globals })
}

test('reused draft arriving after hotplug is discarded, not applied to a changed setup', () => {
  const root = { monitorSummaries: [{ name: 'DP-3' }], reusePending: true, draftProfile: live,
    reuseGeneration: 1, previewTransaction: '' }
  panelFunction('acceptReusedLayout', root)({ profile: work }, { generation: 1, templateName: 'Work', monitorSignature: 'outdated' })
  assert.equal(root.draftProfile, live)
  assert.equal(root.reusePending, false)
  assert.equal(root.editorRefreshQueued, true)
  assert.match(root.lastError, /displays changed/)
})

test('reuse creates a named draft and preserves backend adjustments without saving or applying', () => {
  const root = { monitorSummaries: [], savedProfiles: [work], editorDocument: { displays: [] }, previewTransaction: '', reuseGeneration: 1 }
  const result = { profile: live, workspace_plan: [], warnings: ['DP-1 uses its current mode.'] }
  panelFunction('acceptReusedLayout', root, { Qt: { callLater: () => {} } })(result,
    { generation: 1, templateName: 'Work', monitorSignature: Model.monitorStateSignature([]) })
  assert.equal(root.sourceProfile, '')
  assert.equal(root.saveName, 'Work (new setup)')
  assert.equal(root.creatingProfile, true)
  assert.equal(root.draftDirty, true)
  assert.match(root.reuseNotice, /current mode/)
  assert.equal(root.activePage, 'layout')
  assert.notEqual(root.draftProfile, result.profile)
})

test('reused draft cannot overwrite the original or another saved profile by renaming', () => {
  const root = { managedChecked: true, draftName: () => 'Work', reusedTemplateName: 'Work', savedProfiles: [work] }
  panelFunction('previewDraft', root)()
  assert.match(root.lastError, /new profile name/)
})

test('preview, creation, refresh and edit entry points cannot race a pending reuse', () => {
  const root = { reusePending: true, managedChecked: true, editorReady: true, selectedSavedProfile: work }
  for (const name of ['beginCreateProfile', 'loadSelectedSavedProfile', 'previewDraft', 'previewProfile',
    'applyDraft', 'beginExecEdit', 'requestEditorState', 'setProfileAutomatic', 'setManaged']) {
    panelFunction(name, root)()
    assert.equal(root.draftProfile, undefined, name)
    assert.equal(root.creatingProfile, undefined, name)
    assert.equal(root.previewPending, undefined, name)
  }
})

test('stale reuse errors cannot clear a newer request after close and reopen', () => {
  const root = {
    pendingMethods: { old: 'reuse_profile' }, pendingContexts: { old: { generation: 1 } },
    reuseGeneration: 2, reusePending: true, lastError: ''
  }
  panelFunction('handleMessage', root)(JSON.stringify({ type: 'response', protocol_version: 1,
    id: 'old', error: { message: 'Old failure' } }))
  assert.equal(root.reusePending, true)
  assert.equal(root.lastError, '')
  assert.equal(root.pendingMethods.old, undefined)
})

test('request, close, new request and late success preserve the newer request', () => {
  let sequence = 0
  const root = { managedChecked: true, editorReady: true, reuseGeneration: 0, previewTransaction: '',
    monitorSummaries: [], pendingMethods: {}, pendingContexts: {}, controller: { hide() {} },
    send(method, params, context) {
      const id = String(++sequence)
      this.pendingMethods[id] = method
      this.pendingContexts[id] = context
    }
  }
  const request = panelFunction('reuseLayout', root)
  request('Work', { a: 'b' })
  const first = root.reuseGeneration
  panelFunction('close', root, { displayIdentify: { clear() {} } })()
  request('Discovery', { c: 'd' })
  assert.ok(root.reuseGeneration > first)
  panelFunction('handleMessage', root)(JSON.stringify({ type: 'response', protocol_version: 1,
    id: '1', result: { profile: work, workspace_plan: [] } }))
  assert.equal(root.reusePending, true)
  assert.equal(root.draftProfile, undefined)
  assert.equal(root.pendingContexts['2'].templateName, 'Discovery')
})

test('busy compositor response ends loading and retains the draft while scheduling recovery', () => {
  const root = { pendingMethods: { e: 'editor_state' }, pendingContexts: {},
    editorLoading: true, draftProfile: live }
  panelFunction('handleMessage', root)(JSON.stringify({ type: 'response', protocol_version: 1, id: 'e',
    error: { code: 'compositor_busy', message: 'Displays are still connecting; try again shortly.' } }))
  assert.equal(root.editorLoading, false)
  assert.equal(root.displaysConnecting, true)
  assert.equal(root.editorRetry, true)
  assert.equal(root.statusRetry, true)
  assert.equal(root.draftProfile, live)
})

test('recovery retries only one read at a time and waits for draft interaction to finish', () => {
  const calls = []
  const root = { statusRetry: true, editorRetry: true,
    send: method => calls.push(method), requestEditorState: () => calls.push('editor_state') }
  const retry = panelFunction('retryConnectingDisplays', root)
  for (const key of ['readPending', 'previewPending', 'reusePending']) {
    root[key] = true
    retry()
    root[key] = false
    assert.deepEqual(calls, [])
  }
  retry()
  assert.deepEqual(calls, ['status'])
  root.statusRetry = false
  root.editorRefreshBlocked = true
  retry()
  assert.deepEqual(calls, ['status'])
  root.editorRefreshBlocked = false
  retry()
  assert.deepEqual(calls, ['status', 'editor_state'])
})

test('successful status clears connecting feedback without replacing an edited draft', () => {
  const root = { monitorSummaries: [], statusRetry: true, displaysConnecting: true, draftProfile: live,
    lastError: 'Displays are still connecting; try again shortly.', syncDaemonPreview() {} }
  panelFunction('updateDocument', root)({ monitors: [], daemon: {} })
  assert.equal(root.displaysConnecting, false)
  assert.equal(root.statusRetry, false)
  assert.equal(root.lastError, '')
  assert.equal(root.draftProfile, live)
})

test('identification waits while a timed-out display query leaves a stale snapshot visible', () => {
  const root = { backendConnected: true, editorReady: true, editorLoading: false,
    editorRefreshQueued: false, displaysConnecting: true }
  panelFunction('identifyOutput', root)('laptop', live)
  assert.match(root.lastError, /Refresh it before identifying/)
})
