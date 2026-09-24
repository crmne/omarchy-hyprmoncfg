import QtQuick
import QtQuick.Controls
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "LayoutReuse.js" as Reuse

Panel {
  id: root
  moduleName: "crmne.hyprmoncfg"
  ipcTarget: "crmne.hyprmoncfg"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  property bool installed: false
  property string installedVersion: ""
  property bool compatible: false
  property bool checkingInstallation: true
  property bool installationStateKnown: false
  property bool installing: false
  property bool serviceEnabled: false
  property bool serviceActive: false
  property bool serviceStateKnown: false
  property bool serviceActionPending: false
  property bool serviceTargetManaged: false
  property string serviceAction: ""
  property bool connectionGrace: false
  property bool backendConnected: backendSocket.connected
  property var document: ({ profiles: [], monitors: [], daemon: { running: false } })
  property bool documentReady: false
  property string lastError: ""
  property int requestSequence: 0
  property var pendingMethods: ({})
  property var pendingContexts: ({})
  property int statusRevision: 0
  readonly property bool readPending: Object.keys(root.pendingMethods).some(function(id) {
    return ["status", "subscribe", "editor_state", "reuse_profile"].indexOf(root.pendingMethods[id]) >= 0
  })
  property bool displaysConnecting: false
  property bool statusRetry: false
  property bool editorRetry: false
  property int cursorIndex: 0
  property bool cursorActive: false
  property bool keyboardHelpOpen: false
  property string keyboardLayoutPane: "canvas"
  property int keyboardInspectorField: 0
  property int workspaceKeyboardIndex: 0
  property bool manualWorkspaceRulesInitialized: false
  property bool execEditing: false
  property string execDraft: ""
  property string deleteProfileName: ""

  property var editorDocument: ({
    profile: { outputs: [], workspaces: {} },
    profiles: [],
    displays: [],
    workspace_plan: [],
    profile_workspace_plans: ({})
  })
  property var draftProfile: ({ outputs: [], workspaces: {} })
  property var profileDefaults: ({ outputs: [], workspaces: {} })
  property var workspacePlan: []
  property bool editorReady: false
  property bool editorLoading: false
  property bool editorRefreshQueued: false
  property bool editorResetQueued: false
  property int monitorTopologyRevision: 0
  property bool reusePending: false
  property int reuseGeneration: 0
  property bool reuseTopologyChanged: false
  property string reuseStatus: ""
  property string reusedTemplateName: ""
  property string reuseNotice: ""
  property int editorInteractionRevision: 0
  // Completed previews also invalidate reads that began before the transition.
  property int editorPreviewRevision: 0
  readonly property bool editorPreviewBlocked: root.previewPending || root.previewTransaction !== ""
    || (!!root.previewCoordinator && (root.previewCoordinator.requestPending === true
      || root.previewCoordinator.actionPending === true
      || String(root.previewCoordinator.transactionId || "") !== ""))
  readonly property bool editorRefreshBlocked: !root.opened || root.draftDirty
    || root.creatingProfile || root.editPending || root.profileModePending
    || root.editorPreviewBlocked || root.reusePending
    || (keyCatcher.blocked && root.activePage !== "reuse")
    || (root.activePage === "reuse" && !root.reuseTopologyChanged)
  readonly property bool editorSnapshotStale: root.editorRefreshQueued || root.editorRetry
    || root.statusRetry || root.displaysConnecting
    || !Model.monitorSnapshotsMatch(root.document, root.editorDocument)
  property bool editPending: false
  property bool draftDirty: false
  property string sourceProfile: ""
  property string suggestedProfile: ""
  property string selectedOutputKey: ""
  property string activePage: "layout"
  property bool expanded: false
  property string inspectorPage: "display"
  property string selectedSavedProfileName: ""
  property string profileChoice: ""
  property bool profileModePending: false
  property bool creatingProfile: false
  property string saveName: ""
  property string previewTransaction: ""
  property string previewKind: ""
  property string previewDeadline: ""
  property int previewSeconds: 0
  property bool previewPending: false
  onPreviewPendingChanged: { root.statusRevision++; root.editorPreviewRevision++ }
  onPreviewTransactionChanged: { root.statusRevision++; root.editorPreviewRevision++ }
  readonly property bool identifyBlockedByPreview: root.previewPending || root.previewTransaction !== ""
    || !!root.daemonPreview || (!!root.previewCoordinator && root.previewCoordinator.opened === true)
  onIdentifyBlockedByPreviewChanged: {
    if (root.identifyBlockedByPreview && root.previewCoordinator
        && typeof root.previewCoordinator.cancelIdentify === "function") root.previewCoordinator.cancelIdentify()
    if (root.identifyBlockedByPreview && root.reusePending) {
      root.reuseGeneration++
      root.reusePending = false
      root.lastError = "A display preview started. Finish it, then create the draft again."
    }
  }
  property int brightnessPercent: 1
  property int pendingBrightnessPercent: 1
  property bool brightnessAvailable: false
  property bool brightnessLoading: false
  property bool brightnessReadQueued: false
  property string brightnessReadConnector: ""
  property bool brightnessSetQueued: false
  property string brightnessSetConnector: ""
  property string pendingBrightnessConnector: ""

  // Automatic reads must not replace input started after their request. The
  // existing key catcher also covers text buffers, dropdowns, and exec editing.
  onEditorRefreshBlockedChanged: root.editorInteractionRevision++
  onSelectedSavedProfileNameChanged: root.editorInteractionRevision++
  onSelectedOutputKeyChanged: root.editorInteractionRevision++
  onProfileChoiceChanged: root.editorInteractionRevision++

  readonly property var monitorSummaries: document && document.monitors instanceof Array ? document.monitors : []
  readonly property var layoutDisplays: root.daemonPreview && root.daemonPreview.profile
    ? Model.profileLayoutDisplays(root.daemonPreview.profile, root.editorDocument.displays)
    : (root.editorReady
      ? Model.profileLayoutDisplays(root.draftProfile, root.editorDocument.displays)
      : Model.layoutDisplays(root.backendConnected ? monitorSummaries : [], Quickshell.screens || []))
  readonly property var layoutBounds: Model.layoutBounds(layoutDisplays)
  readonly property string hiddenDisplays: root.daemonPreview && root.daemonPreview.profile
    ? Model.hiddenProfileDisplays(root.daemonPreview.profile)
    : (root.editorReady
      ? Model.hiddenProfileDisplays(root.draftProfile)
      : Model.hiddenDisplays(root.backendConnected ? monitorSummaries : []))
  readonly property int monitorCount: {
    return root.backendConnected && root.documentReady
      ? root.monitorSummaries.length : layoutDisplays.length
  }
  readonly property string activeProfile: root.managedChecked
    ? Model.currentProfileName(root.document) : ""
  readonly property string recommendedProfile: root.managedChecked && document && document.recommended_profile
    ? String(document.recommended_profile.name || "")
    : ""
  readonly property var daemonPreview: root.document && root.document.daemon && root.document.daemon.preview
    ? root.document.daemon.preview : null
  readonly property string pendingProfileName: root.daemonPreview
    ? String(root.daemonPreview.profile_name || "") : ""
  readonly property string profileOverride: root.document && root.document.daemon
    ? String(root.document.daemon.profile_override || "")
    : ""
  readonly property var exactDisplayProfile: Model.exactDisplayProfile(root.document)
  readonly property string exactDisplayProfileName: root.exactDisplayProfile
    ? String(root.exactDisplayProfile.name || "") : ""
  readonly property int connectedDisplayCount: root.document && root.document.monitors instanceof Array
    ? root.document.monitors.length : 0
  readonly property string displayedProfile: pendingProfileName !== ""
    ? pendingProfileName
    : (profileOverride !== "" ? profileOverride
      : (activeProfile !== "" ? activeProfile : recommendedProfile))
  readonly property bool profileAutomatic: root.profileOverride === ""
  readonly property bool newSetupAvailable: root.profileAutomatic && root.documentReady
    && root.connectedDisplayCount > 0 && !root.exactDisplayProfile
    && !root.daemonPreview && root.previewTransaction === "" && !root.previewPending
  readonly property string profileStatusTitle: {
    if (!root.managedChecked) return "Not managed by hyprmoncfg"
    if (root.displaysConnecting) return "Displays connecting…"
    if (!root.documentReady) return root.serviceActionPending ? "Starting hyprmoncfg…" : "Loading profile…"
    if (root.pendingProfileName !== "") return root.pendingProfileName
    if (!root.profileAutomatic && root.displayedProfile !== "") return root.displayedProfile
    if (root.profileAutomatic && root.exactDisplayProfileName !== "") return root.exactDisplayProfileName
    if (root.profileAutomatic && root.connectedDisplayCount > 0) return "New display setup"
    return "Custom layout"
  }
  readonly property string profileStatusSubtitle: {
    if (!root.managedChecked) return "Turn on management for automatic profiles"
    if (root.displaysConnecting) return "Waiting for display information; keeping the current view"
    if (!root.documentReady) return "Reading the active display layout"
    var displays = root.connectedDisplayCount === 1 ? "1 display" : root.connectedDisplayCount + " displays"
    if (root.pendingProfileName !== "") return displays + " · Awaiting confirmation"
    if (!root.profileAutomatic) return "Automatic matching is paused"
    if (root.exactDisplayProfileName !== "") return displays
    if (root.connectedDisplayCount > 0) return "No saved profile matches these displays"
    return "No connected displays"
  }
  readonly property bool daemonUnmanaged: !!(root.document && root.document.daemon && root.document.daemon.unmanaged)
  readonly property bool managedChecked: serviceActionPending
    ? serviceTargetManaged
    : (root.documentReady && root.backendConnected
      ? !root.daemonUnmanaged
      : (serviceEnabled || serviceActive || backendConnected))
  readonly property string runningVersion: Model.releaseVersion(root.document ? root.document.version : "")
  readonly property string installedRelease: Model.releaseVersion(root.installedVersion)
  readonly property bool daemonOutdated: root.backendConnected
    && root.documentReady
    && Model.daemonNeedsRestart(root.installedVersion, root.document ? root.document.version : "")
  // Every actionable row in one list, so their cursor positions cannot drift
  // apart from what is on screen.
  readonly property var actionRows: {
    var rows = []
    if (root.serviceBroken)
      rows.push({
        id: "restart-service",
        icon: "󰑓",
        title: "Restart hyprmoncfg",
        subtitle: "Try the background service again"
      })
    else if (root.daemonOutdated)
      rows.push({
        id: "restart-service",
        icon: "󰑓",
        title: "Restart daemon",
        subtitle: "Running " + root.runningVersion + ", installed " + root.installedRelease
      })
    return rows
  }
  readonly property int layoutRowIndex: 1 + root.actionRows.length
  readonly property bool serviceBroken: serviceStateKnown
    && serviceEnabled
    && !backendConnected
    && !connectionGrace
    && !serviceActionPending
  readonly property string runtimeDir: String(Quickshell.env("XDG_RUNTIME_DIR") || "")
  readonly property string socketPath: root.runtimeDir + "/hyprmoncfgd.sock"
  readonly property string installFailurePath: root.runtimeDir + "/hyprmoncfg-panel-install.failed"
  readonly property string installCompletePath: root.runtimeDir + "/hyprmoncfg-panel-install.complete"
  readonly property var previewCoordinator: {
    var host = root.bar && root.bar.shell ? root.bar.shell : null
    if (!host) return null
    if (typeof host.serviceFor === "function") {
      var own = null
      try { own = host.serviceFor(root.moduleName) } catch (e) { own = null }
      if (own) return own
    }
    var services = host._services || null
    return services && services[root.moduleName] ? services[root.moduleName] : null
  }
  readonly property bool barIconDimmed: root.installationStateKnown
    && root.compatible
    && root.serviceStateKnown
    && !root.managedChecked
    && !root.serviceActionPending
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property real unmanagedOpacity: 0.45
  // NumberField is backed by a QML int. Keep only that technical boundary;
  // workspace planning itself has no product-level maximum.
  readonly property int workspaceValueMaximum: 2147483647
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property var selectedOutput: Model.outputByKey(root.draftProfile, root.selectedOutputKey)
  readonly property string profileDefaultsLabel: root.sourceProfile !== ""
    ? root.sourceProfile : "loaded layout"
  readonly property var selectedOutputMetadata: Model.editorMetadata(root.editorDocument.displays, root.selectedOutputKey)
  readonly property bool identifyAvailable: !!root.previewCoordinator
    && typeof root.previewCoordinator.identifyDisplays === "function"
    && root.previewCoordinator.connected && !root.previewCoordinator.opened
    && !root.previewCoordinator.identifyPending && !root.daemonPreview && !root.previewPending

  function identifyDisplays(key) {
    if (!root.identifyAvailable) return
    if (!root.previewCoordinator.identifyDisplays(key))
      root.lastError = root.previewCoordinator.identifyError
    else root.lastError = ""
  }
  readonly property var brightnessTarget: Model.brightnessTarget(root.draftProfile,
    root.selectedOutputKey, root.editorDocument.displays)
  readonly property string brightnessConnector: String(root.brightnessTarget.connector || "")
  readonly property string brightnessDisplayLabel: String(root.brightnessTarget.label || "")
  readonly property var savedProfiles: root.editorDocument && root.editorDocument.profiles instanceof Array
    ? root.editorDocument.profiles : []
  readonly property var selectedSavedProfile: Model.savedProfileByName(root.editorDocument, root.selectedSavedProfileName)
  readonly property var selectedSavedSummary: Model.profileSummaryByName(root.document, root.selectedSavedProfileName)
  readonly property bool selectedSavedProfileCurrent: Model.profileIsCurrent(root.selectedSavedSummary, root.document)
  readonly property var selectedSavedWorkspacePlan: Model.profileWorkspacePlan(root.editorDocument, root.selectedSavedProfileName)
  readonly property var selectedSavedWorkspaceRows: Model.workspacePlanRows(root.selectedSavedWorkspacePlan, root.selectedSavedProfile)
  readonly property var selectedSavedMatchReasons: Model.profileMatchReasonRows(root.selectedSavedSummary)
  readonly property var selectedSavedHiddenRows: Model.profileHiddenDisplayRows(root.selectedSavedProfile)
  readonly property int selectedSavedDetailRowCount: 5
    + root.selectedSavedMatchReasons.length
    + root.selectedSavedHiddenRows.length
    + Math.max(1, root.selectedSavedWorkspaceRows.length)
  readonly property var workspaceRows: Model.workspacePlanRows(root.workspacePlan, root.draftProfile)
  readonly property var manualWorkspaceRows: Model.manualWorkspaceRows(root.draftProfile)
  readonly property int manualWorkspaceTargetCount: Model.manualWorkspaceTargetKeys(root.draftProfile).length
  readonly property string workspaceStrategy: String(((root.draftProfile || {}).workspaces || {}).strategy || "manual")
  readonly property bool workspaceGroupSizeApplicable: root.workspaceStrategy === "sequential"
  readonly property int workspacePersistenceKeyboardIndex: root.workspaceGroupSizeApplicable ? 4 : 3
  readonly property int workspaceListKeyboardStart: root.workspacePersistenceKeyboardIndex + 1
  readonly property string selectedWorkspaceDisplayKey: {
    var index = root.workspaceKeyboardIndex - root.workspaceListKeyboardStart
    if (index < 0) return ""
    var settings = (root.draftProfile || {}).workspaces || {}
    if (String(settings.strategy || "") === "manual") {
      if (index >= root.manualWorkspaceRows.length) return ""
      return String((root.manualWorkspaceRows[index] || {}).output_key || "")
    }
    var order = settings.monitor_order instanceof Array ? settings.monitor_order : []
    return index < order.length ? String(order[index] || "") : ""
  }
  readonly property var pageOptions: [
    { value: "layout", label: "1  Layout" },
    { value: "workspaces", label: "2  Workspaces" },
    { value: "profiles", label: "3  Profiles" }
  ]
  readonly property var inspectorOptions: [
    { value: "display", label: "Display" },
    { value: "color", label: "Color" }
  ]
  readonly property var displayKeyboardFields: [0, 1, 2, 5, 6, 7, 8, 9]
  readonly property var colorKeyboardFields: [3, 4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  readonly property var vrrOptions: [
    { value: "0", label: "Off" },
    { value: "1", label: "On" },
    { value: "2", label: "Fullscreen" }
  ]
  readonly property var bitdepthOptions: [
    { value: "8", label: "8-bit" },
    { value: "10", label: "10-bit" }
  ]
  readonly property var colorManagementOptions: [
    { value: "srgb", label: "sRGB (SDR)" },
    { value: "auto", label: "Automatic" },
    { value: "wide", label: "BT.2020 (SDR)" },
    { value: "hdr", label: "BT.2020 + PQ (HDR)" },
    { value: "hdredid", label: "EDID primaries + PQ" },
    { value: "dcip3", label: "DCI-P3" },
    { value: "dp3", label: "Display P3" },
    { value: "adobe", label: "Adobe RGB" },
    { value: "edid", label: "EDID primaries (SDR)" }
  ]
  readonly property var triStateOptions: [
    { value: "-1", label: "Force off" },
    { value: "0", label: "Auto-detect" },
    { value: "1", label: "Force on" }
  ]
  readonly property var transformOptions: [
    { value: "0", label: "Normal" },
    { value: "1", label: "90°" },
    { value: "2", label: "180°" },
    { value: "3", label: "270°" },
    { value: "4", label: "Flipped" },
    { value: "5", label: "Flipped 90°" },
    { value: "6", label: "Flipped 180°" },
    { value: "7", label: "Flipped 270°" }
  ]

  onBrightnessConnectorChanged: {
    root.brightnessAvailable = false
    root.brightnessLoading = root.brightnessConnector !== ""
    if (root.opened) brightnessSelectionTimer.restart()
  }

  function open() {
    var alreadyOpen = root.opened
    root.controller.show()
    root.cursorActive = false
    root.cursorIndex = 0
    root.checkInstallation()
    if (root.compatible) root.checkServiceState()
    // onOpenedChanged reloads a newly opened panel. Summoning an open panel
    // must preserve its draft and must not queue a second destructive read.
    if (alreadyOpen && root.backendConnected) root.requestEditorState(true)
  }

  function openFromHotkey() { root.open() }
  function close() {
    root.reuseGeneration++
    root.reusePending = false
    if (root.previewTransaction !== "" && !root.previewCoordinator) root.revertPreview()
    root.keyboardHelpOpen = false
    root.execEditing = false
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function refreshBrightness() {
    var connector = root.brightnessConnector
    if (!root.opened || connector === "") {
      root.brightnessLoading = false
      root.brightnessAvailable = false
      return
    }
    if (brightnessReadProcess.running || brightnessSetProcess.running) {
      root.brightnessReadQueued = true
      return
    }

    root.brightnessReadQueued = false
    root.brightnessReadConnector = connector
    if (!root.brightnessAvailable) root.brightnessLoading = true
    brightnessReadProcess.command = ["omarchy-brightness-display", "--monitor", connector]
    brightnessReadProcess.running = true
  }

  function previewBrightness(value) {
    if (root.brightnessConnector === "" || !root.brightnessAvailable) return
    root.brightnessPercent = Model.clampBrightness(value)
    brightnessSetDebounce.restart()
  }

  function startBrightnessSet(connector, percent) {
    if (connector === "") return
    root.brightnessSetConnector = connector
    brightnessSetProcess.command = [
      "omarchy-brightness-display", "--no-osd", "--monitor", connector, percent + "%"
    ]
    brightnessSetProcess.running = true
  }

  function setBrightness(value) {
    var connector = root.brightnessConnector
    if (connector === "" || !root.brightnessAvailable) return
    var percent = Model.clampBrightness(value)
    root.brightnessPercent = percent
    root.pendingBrightnessPercent = percent
    root.pendingBrightnessConnector = connector

    if (brightnessSetProcess.running) {
      root.brightnessSetQueued = true
      return
    }

    root.brightnessSetQueued = false
    root.startBrightnessSet(connector, percent)
  }

  function checkInstallation() {
    if (whichProcess.running) return
    if (!root.installationStateKnown) root.checkingInstallation = true
    whichProcess.command = [
      "sh",
      "-c",
      "if test \"$3\" = \"1\"; then if test -f \"$1\"; then cat \"$1\"; exit 2; elif ! test -f \"$2\"; then exit 3; fi; fi; if command -v hyprmoncfg >/dev/null 2>&1; then hyprmoncfg version; else exit 1; fi",
      "sh",
      root.installFailurePath,
      root.installCompletePath,
      root.installing ? "1" : "0"
    ]
    whichProcess.running = true
  }

  function checkServiceState() {
    if (!root.compatible || serviceProcess.running || enabledProcess.running || activeProcess.running) return
    enabledProcess.command = ["systemctl", "--user", "is-enabled", "--quiet", "hyprmoncfgd.service"]
    enabledProcess.running = true
  }

  function install() {
    if (root.runtimeDir === "") {
      root.lastError = "Could not find the user runtime directory."
      return
    }
    root.installing = true
    root.lastError = ""
    installPreparationProcess.command = ["rm", "-f", root.installFailurePath, root.installCompletePath]
    installPreparationProcess.running = true
  }

  function setManaged(enabled) {
    if (root.reusePending) return
    if (!root.compatible || serviceProcess.running || root.serviceActionPending) return
    root.lastError = ""
    root.serviceActionPending = true
    root.serviceTargetManaged = enabled === true
    root.serviceAction = enabled === true ? "enable" : "disable"
    serviceProcess.command = enabled === true
      ? ["sh", "-c", "systemctl --user enable --now hyprmoncfgd.service && hyprmoncfg manage"]
      : ["hyprmoncfg", "unmanage"]
    serviceProcess.running = true
  }

  function restartService() {
    if (!root.compatible || serviceProcess.running || root.serviceActionPending) return
    root.lastError = ""
    root.serviceActionPending = true
    root.serviceTargetManaged = true
    root.serviceAction = "restart"
    serviceProcess.command = ["systemctl", "--user", "restart", "hyprmoncfgd.service"]
    serviceProcess.running = true
  }

  function launchTui() {
    tuiProcess.command = ["gtk-launch", "hyprmoncfg-omarchy"]
    root.close()
    Qt.callLater(function() { tuiProcess.startDetached() })
  }

  function connectBackend() {
    if (!root.compatible || backendSocket.connected || root.socketPath === "/hyprmoncfgd.sock") return
    if (!root.serviceEnabled && !root.serviceActive && !(root.serviceActionPending && root.serviceTargetManaged)) return
    backendSocket.connected = true
  }

  function send(method, params, context) {
    if (!backendSocket.connected) {
      root.previewPending = false
      root.editPending = false
      root.editorLoading = false
      root.reusePending = false
      root.lastError = "hyprmoncfg is reconnecting. Try again in a moment."
      return ""
    }
    root.requestSequence++
    var id = String(root.requestSequence)
    var request = {
      type: "request",
      protocol_version: 1,
      id: id,
      method: method
    }
    if (params !== undefined && params !== null) request.params = params
    var methods = Object.assign({}, root.pendingMethods)
    methods[id] = method
    root.pendingMethods = methods
    if (method === "status" || method === "subscribe")
      context = Object.assign({}, context || {}, { statusRevision: root.statusRevision })
    if (context !== undefined && context !== null) root.pendingContexts[id] = context
    backendSocket.write(JSON.stringify(request) + "\n")
    backendSocket.flush()
    return id
  }

  function subscribe() { root.send("subscribe", {}) }

  function retryConnectingDisplays() {
    if (root.readPending || root.previewPending || root.reusePending) return
    if (root.statusRetry) root.send("status", {})
    else if (root.editorResetQueued) root.requestEditorState()
    else if (root.editorRetry && !root.editorRefreshBlocked) root.requestEditorState(true)
  }

  function queueEditorRefresh(automatic) {
    root.editorRefreshQueued = true
    if (automatic !== true) root.editorResetQueued = true
    if (root.activePage === "reuse") root.reuseTopologyChanged = true
  }

  function requestEditorState(automatic) {
    if (!root.backendConnected || root.reusePending) return
    var automaticRefresh = automatic === true && !root.editorResetQueued
    if (root.editorPreviewBlocked) {
      root.queueEditorRefresh(automaticRefresh)
      return
    }
    if (automaticRefresh && root.editorRefreshBlocked) return
    if (root.editorLoading || root.readPending || root.statusRetry) {
      root.queueEditorRefresh(automaticRefresh)
      return
    }
    root.editorRefreshQueued = false
    root.editorResetQueued = false
    root.editorLoading = true
    root.send("editor_state", {}, {
      automaticEditorRefresh: automaticRefresh,
      interactionRevision: root.editorInteractionRevision,
      previewRevision: root.editorPreviewRevision,
      topologyRevision: root.monitorTopologyRevision
    })
  }

  function updateEditor(value, preserveSelection) {
    if (!Model.validEditorDocument(value)) {
      root.editorLoading = false
      root.lastError = "hyprmoncfg returned an invalid editor state."
      return
    }
    root.editorDocument = value
    root.draftProfile = Model.clone(value.profile)
    root.workspacePlan = value.workspace_plan instanceof Array ? value.workspace_plan : []
    var workspaceSettings = (root.draftProfile || {}).workspaces || {}
    root.manualWorkspaceRulesInitialized = String(workspaceSettings.strategy || "") === "manual"
      && workspaceSettings.rules instanceof Array && workspaceSettings.rules.length > 0
    root.sourceProfile = String(value.source_profile || "")
    root.suggestedProfile = String(value.suggested_profile || "")
    var savedDefaults = root.sourceProfile !== ""
      ? Model.savedProfileByName(value, root.sourceProfile) : null
    root.profileDefaults = Model.clone(savedDefaults || value.profile)
    if (!preserveSelection || !Model.outputByKey(root.draftProfile, root.selectedOutputKey))
      root.selectedOutputKey = Model.initialOutputKey(root.draftProfile, value.displays)
    if (!preserveSelection || !Model.savedProfileByName(value, root.profileChoice))
      root.profileChoice = root.activeProfile !== "" ? root.activeProfile : root.suggestedProfile
    if (!preserveSelection || !Model.savedProfileByName(value, root.selectedSavedProfileName))
      root.selectedSavedProfileName = root.profileChoice !== ""
        ? root.profileChoice
        : (value.profiles instanceof Array && value.profiles.length > 0 ? String(value.profiles[0].name || "") : "")
    root.saveName = root.sourceProfile
    root.editorReady = true
    root.editorLoading = false
    root.editPending = false
    root.draftDirty = false
    root.creatingProfile = false
    root.reusedTemplateName = ""
    root.reuseNotice = ""
    root.reuseTopologyChanged = false
    root.editorRetry = false
    Qt.callLater(function() {
      root.normalizeWorkspaceCursor()
      if (root.activePage === "workspaces") root.ensureManualWorkspaceRules()
    })
  }

  function editDraft(edit) {
    if (!root.managedChecked || !root.editorReady || root.editPending || root.reusePending || root.previewTransaction !== "") return
    root.lastError = ""
    root.editPending = true
    root.send("edit_profile", { profile: root.draftProfile, edit: edit })
  }

  function identifyOutput(key) {
    if (root.identifyBlockedByPreview) return
    if (!root.backendConnected || !root.editorReady || root.editorLoading || root.editorSnapshotStale) {
      root.lastError = "The display list changed. Refresh it before identifying a monitor."
      return
    }
    root.identifyDisplays(key)
  }

  function editOutput(fields, key) {
    var edit = fields || {}
    edit.output_key = String(key || root.selectedOutputKey)
    var output = Model.outputByKey(root.draftProfile, edit.output_key)
    if (edit.enabled === false && output && output.enabled !== false
        && Model.enabledOutputCount(root.draftProfile) <= 1) {
      root.lastError = "At least one display must stay enabled."
      return
    }
    root.editDraft(edit)
  }

  function outputFieldChanged(field) {
    return Model.outputFieldChanged(root.draftProfile, root.profileDefaults,
      root.selectedOutputKey, field)
  }

  function outputFieldResetTooltip(label) {
    return "Reset " + label + " to the value saved in " + root.profileDefaultsLabel
  }

  function resetOutputField(field) {
    var edit = Model.outputFieldResetEdit(root.profileDefaults, root.selectedOutputKey, field)
    if (edit) root.editOutput(edit)
  }

  function editWorkspaces(fields) {
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    var changes = fields || {}
    for (var key in changes) settings[key] = changes[key]
    root.editDraft({ workspaces: settings })
  }

  function changeWorkspaceStrategy(value) {
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    var current = String(settings.strategy || "manual")
    var next = String(value || "manual")
    var changes = { strategy: next }
    if (next === "manual" && current !== "manual" && !root.manualWorkspaceRulesInitialized) {
      changes.rules = Model.manualWorkspaceRulesFromPlan(root.workspacePlan, root.draftProfile)
      root.manualWorkspaceRulesInitialized = changes.rules.length > 0
    }
    root.editWorkspaces(changes)
  }

  function setWorkspaceCount(value) {
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    var maximum = Math.floor(root.bounded(Number(value || 1), 1, root.workspaceValueMaximum))
    if (String(settings.strategy || "") === "manual") {
      root.editWorkspaces({
        max_workspaces: maximum,
        rules: Model.resizeManualWorkspaceRules(settings.rules, root.draftProfile, maximum)
      })
      root.manualWorkspaceRulesInitialized = true
      return
    }
    root.editWorkspaces({ max_workspaces: maximum })
  }

  function moveManualWorkspace(row, delta) {
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    root.workspaceKeyboardIndex = root.workspaceListKeyboardStart + Number(row || 0)
    root.editWorkspaces({
      rules: Model.cycleManualWorkspaceRule(settings.rules, root.draftProfile, row, delta)
    })
    root.manualWorkspaceRulesInitialized = true
  }

  function ensureManualWorkspaceRules() {
    if (!root.managedChecked || !root.editorReady || root.editPending
        || root.previewTransaction !== "") return
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    if (String(settings.strategy || "") !== "manual"
        || (settings.rules instanceof Array && settings.rules.length > 0)) return
    var rules = Model.manualWorkspaceRulesFromPlan(root.workspacePlan, root.draftProfile)
    if (rules.length === 0) return
    root.manualWorkspaceRulesInitialized = true
    root.editWorkspaces({ rules: rules })
  }

  function moveWorkspaceMonitor(key, delta) {
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    var order = settings.monitor_order instanceof Array ? settings.monitor_order.slice() : []
    var index = order.indexOf(String(key || ""))
    var target = index + Number(delta || 0)
    if (index < 0 || target < 0 || target >= order.length) return
    var moved = order[index]
    order[index] = order[target]
    order[target] = moved
    root.editWorkspaces({ monitor_order: order })
  }

  function selectOutput(delta) {
    var next = Model.adjacentOutputKey(root.draftProfile, root.selectedOutputKey, delta)
    if (next !== "") root.selectedOutputKey = next
  }

  function nudgeSelectedOutput(dx, dy) {
    var output = root.selectedOutput
    if (!output || !root.managedChecked || root.editPending || root.previewTransaction !== "") return
    if (String(output.mirror_of || "") !== "") {
      root.lastError = String(output.name || "This display") + " mirrors another display and follows it."
      return
    }
    root.editOutput({
      x: Number(output.x || 0) + Number(dx || 0),
      y: Number(output.y || 0) + Number(dy || 0)
    })
  }

  function snapSelectedOutput(direction) {
    if (!root.managedChecked || root.editPending || root.previewTransaction !== "") return
    var position = Model.snapOutputPosition(root.draftProfile, root.selectedOutputKey, direction)
    if (!position) {
      root.lastError = "No other enabled display is available for snapping."
      return
    }
    root.editOutput({ x: position.x, y: position.y })
  }

  function cycleLayoutKeyboardPane(direction) {
    var panes = ["canvas", "display", "color"]
    var current = panes.indexOf(root.keyboardLayoutPane)
    root.keyboardLayoutPane = panes[Model.wrapIndex(current + direction, panes.length)]
    if (root.keyboardLayoutPane !== "canvas") {
      root.inspectorPage = root.keyboardLayoutPane
      var fields = root.keyboardLayoutPane === "display"
        ? root.displayKeyboardFields : root.colorKeyboardFields
      if (fields.indexOf(root.keyboardInspectorField) < 0)
        root.keyboardInspectorField = fields[0]
    }
  }

  function moveInspectorCursor(delta) {
    var fields = root.inspectorPage === "display"
      ? root.displayKeyboardFields : root.colorKeyboardFields
    var current = fields.indexOf(root.keyboardInspectorField)
    root.keyboardInspectorField = fields[Model.wrapIndex(current + delta, fields.length)]
  }

  function inspectorHasCursor(field) {
    return root.expanded && root.activePage === "layout"
      && root.keyboardLayoutPane !== "canvas"
      && root.keyboardInspectorField === field
  }

  function bounded(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value))
  }

  function adjustInspectorField(delta) {
    var output = root.selectedOutput
    if (!output || !root.managedChecked || root.editPending || root.previewTransaction !== "") return
    var field = root.keyboardInspectorField
    var edit = ({})
    if (field === 0) edit.enabled = output.enabled === false
    else if (field === 1) edit.mode = Model.cycleOptionValue(
      Model.modeOptions(root.editorDocument.displays, root.selectedOutputKey), Model.outputMode(output), delta)
    else if (field === 2) edit.scale = root.bounded(Number(output.scale || 1) + delta * 0.05, 0.25, 4)
    else if (field === 3) edit.bitdepth = Number(Model.cycleOptionValue(root.bitdepthOptions,
      String(output.bitdepth || 8), delta))
    else if (field === 4) edit.cm = Model.cycleOptionValue(root.colorManagementOptions,
      String(output.cm || "srgb"), delta)
    else if (field === 5) edit.vrr = Number(Model.cycleOptionValue(root.vrrOptions,
      String(output.vrr || 0), delta))
    else if (field === 6) edit.transform = Number(Model.cycleOptionValue(root.transformOptions,
      String(output.transform || 0), delta))
    else if (field === 7) edit.x = Number(output.x || 0) + delta * 10
    else if (field === 8) edit.y = Number(output.y || 0) + delta * 10
    else if (field === 9) edit.mirror_of = Model.cycleOptionValue(
      Model.mirrorOptions(root.draftProfile, root.selectedOutputKey), String(output.mirror_of || ""), delta)
    else if (field === 10) edit.sdr_brightness = root.bounded(Number(output.sdr_brightness || 1) + delta * 0.05, 0, 3)
    else if (field === 11) edit.sdr_saturation = root.bounded(Number(output.sdr_saturation || 1) + delta * 0.05, 0, 3)
    else if (field === 12) edit.sdr_min_luminance = root.bounded(Number(output.sdr_min_luminance || 0) + delta * 0.005, 0, 1)
    else if (field === 13) edit.sdr_max_luminance = root.bounded(Number(output.sdr_max_luminance || 0) + delta * 10, 0, 1000)
    else if (field === 14) edit.sdr_eotf = Model.cycleOptionValue(sdrCurveDropdown.options,
      String(output.sdr_eotf || "default"), delta)
    else if (field === 15) edit.min_luminance = root.bounded(Number(output.min_luminance || 0) + delta * 0.001, 0, 1000)
    else if (field === 16) edit.max_luminance = root.bounded(Number(output.max_luminance || 0) + delta * 10, 0, 2000)
    else if (field === 17) edit.max_avg_luminance = root.bounded(Number(output.max_avg_luminance || 0) + delta * 10, 0, 2000)
    else if (field === 18) edit.supports_wide_color = Number(Model.cycleOptionValue(root.triStateOptions,
      String(output.supports_wide_color || 0), delta))
    else if (field === 19) edit.supports_hdr = Number(Model.cycleOptionValue(root.triStateOptions,
      String(output.supports_hdr || 0), delta))
    else return
    root.editOutput(edit)
  }

  function activateInspectorField() {
    if (!root.selectedOutput || !root.managedChecked || root.editPending) return
    var field = root.keyboardInspectorField
    if (field === 0) root.adjustInspectorField(1)
    else if (field === 1) modeDropdown.open()
    else if (field === 2) scaleDropdown.open()
    else if (field === 3) bitdepthDropdown.open()
    else if (field === 4) colorManagementDropdown.open()
    else if (field === 5) vrrDropdown.open()
    else if (field === 6) rotationDropdown.open()
    else if (field === 7) positionXField.field.forceActiveFocus()
    else if (field === 8) positionYField.field.forceActiveFocus()
    else if (field === 9) mirrorDropdown.open()
    else if (field === 10) sdrBrightnessField.input.forceActiveFocus()
    else if (field === 11) sdrSaturationField.input.forceActiveFocus()
    else if (field === 12) sdrMinLuminanceField.input.forceActiveFocus()
    else if (field === 13) sdrMaxLuminanceField.input.forceActiveFocus()
    else if (field === 14) sdrCurveDropdown.open()
    else if (field === 15) minLuminanceField.input.forceActiveFocus()
    else if (field === 16) maxLuminanceField.input.forceActiveFocus()
    else if (field === 17) maxAvgLuminanceField.input.forceActiveFocus()
    else if (field === 18) forceWideDropdown.open()
    else if (field === 19) forceHdrDropdown.open()
    else if (field === 20) iccProfileInput.forceActiveFocus()
  }

  function selectSavedProfile(delta) {
    var profiles = root.editorDocument && root.editorDocument.profiles instanceof Array
      ? root.editorDocument.profiles : []
    var selected = Model.adjacentProfileName(profiles, root.selectedSavedProfileName, delta)
    if (selected !== "") root.selectedSavedProfileName = selected
  }

  function loadSelectedSavedProfile() {
    if (!root.selectedSavedProfile || root.reusePending) return
    root.draftProfile = Model.clone(root.selectedSavedProfile)
    root.profileDefaults = Model.clone(root.selectedSavedProfile)
    root.workspacePlan = Model.clone(root.selectedSavedWorkspacePlan) || []
    var workspaceSettings = (root.draftProfile || {}).workspaces || {}
    root.manualWorkspaceRulesInitialized = String(workspaceSettings.strategy || "") === "manual"
      && workspaceSettings.rules instanceof Array && workspaceSettings.rules.length > 0
    root.sourceProfile = root.selectedSavedProfileName
    root.saveName = root.selectedSavedProfileName
    root.selectedOutputKey = Model.initialOutputKey(root.draftProfile, root.editorDocument.displays)
    root.draftDirty = true
    root.creatingProfile = false
    root.activePage = "layout"
    root.keyboardLayoutPane = "canvas"
    root.lastError = ""
    root.reusedTemplateName = ""
    root.reuseNotice = ""
  }

  function openLayoutReuse(name) {
    if (!root.backendConnected || !root.editorReady || root.editorLoading || root.draftDirty || root.creatingProfile || root.reusePending
        || root.identifyBlockedByPreview) return
    root.expanded = true
    root.activePage = "reuse"
    root.reuseStatus = ""
    root.reuseTopologyChanged = root.editorSnapshotStale
    if (name) reusePane.choose(name)
    else reusePane.reset()
    Qt.callLater(function() { reusePane.focusFirst() })
  }

  function leaveLayoutReuse() {
    if (root.reusePending) return
    root.activePage = "profiles"
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function reuseLayout(name, mapping) {
    if (!root.backendConnected || !root.managedChecked || !root.editorReady || root.editorLoading || root.readPending || root.editorSnapshotStale || root.reusePending || root.draftDirty
        || root.creatingProfile || root.editPending || root.identifyBlockedByPreview) return
    root.lastError = ""
    root.reusePending = true
    root.send("reuse_profile", { name: name, mapping: mapping }, {
      templateName: name,
      generation: ++root.reuseGeneration,
      monitorSignature: Model.monitorStateSignature(root.monitorSummaries),
      topologyRevision: root.monitorTopologyRevision,
      monitor_set_hash: String((root.editorDocument || {}).monitor_set_hash || "")
    })
  }

  function acceptReusedLayout(result, context) {
    if (context.generation !== root.reuseGeneration) return
    root.reusePending = false
    if (root.draftDirty || root.creatingProfile || root.identifyBlockedByPreview) {
      root.lastError = "The draft changed while the layout was prepared. Your current draft was kept."
      return
    }
    if (context.topologyRevision !== root.monitorTopologyRevision
        || context.monitorSignature !== Model.monitorStateSignature(root.monitorSummaries)
        || !Model.monitorSnapshotsMatch(context, result)
        || !Model.monitorSnapshotsMatch(root.document, result)) {
      root.lastError = "The displays changed. Check the monitor assignments and try again."
      root.queueEditorRefresh(true)
      root.statusRetry = true
      return
    }
    if (!result || !result.profile || !Array.isArray(result.profile.outputs)) {
      root.lastError = "hyprmoncfg returned an invalid layout draft."
      return
    }
    root.draftProfile = Model.clone(result.profile)
    root.profileDefaults = Model.clone(result.profile)
    root.workspacePlan = Array.isArray(result.workspace_plan) ? result.workspace_plan : []
    root.sourceProfile = ""
    root.reusedTemplateName = context.templateName
    root.saveName = Reuse.nextName(context.templateName, root.savedProfiles)
    root.draftDirty = true
    root.creatingProfile = true
    root.selectedOutputKey = Model.initialOutputKey(root.draftProfile, root.editorDocument.displays)
    var workspaceSettings = (root.draftProfile || {}).workspaces || {}
    root.manualWorkspaceRulesInitialized = String(workspaceSettings.strategy || "") === "manual"
      && Array.isArray(workspaceSettings.rules) && workspaceSettings.rules.length > 0
    root.reuseNotice = "Copied " + context.templateName + " for these monitors. "
      + ((result.warnings || []).length ? result.warnings.join(" ") : "Check the layout, then preview and save.")
    root.activePage = "layout"
    root.keyboardLayoutPane = "canvas"
    Qt.callLater(function() { profileNameInput.forceActiveFocus() })
  }

  function deleteSelectedSavedProfile() {
    var name = String(root.selectedSavedProfileName || "")
    if (name === "" || root.previewTransaction !== "" || root.previewPending) return
    if (root.draftDirty || root.editPending) {
      root.lastError = "Save or discard your edits before deleting a profile."
      return
    }
    root.deleteProfileName = name
    deleteConfirmation.open()
  }

  function confirmProfileDelete() {
    var name = root.deleteProfileName
    root.deleteProfileName = ""
    if (name === "" || root.previewTransaction !== "" || root.previewPending) return
    root.lastError = ""
    root.send("delete", { name: name }, { name: name })
  }

  function beginExecEdit() {
    if (root.reusePending) return
    if (!root.selectedSavedProfile) return
    if (root.draftDirty || root.editPending) {
      root.lastError = "Save or discard your edits before editing a profile command."
      return
    }
    root.execDraft = String(root.selectedSavedProfile.exec || "")
    root.execEditing = true
    Qt.callLater(function() { profileExecInput.forceActiveFocus() })
  }

  function commitExecEdit() {
    if (!root.selectedSavedProfile) {
      root.execEditing = false
      return
    }
    var profile = Model.clone(root.selectedSavedProfile)
    profile.exec = String(root.execDraft || "").trim()
    root.execEditing = false
    root.send("save", { profile: profile }, { kind: "exec", name: profile.name })
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function workspaceKeyboardCount() {
    var settings = ((root.draftProfile || {}).workspaces || {})
    if (root.workspaceStrategy === "manual")
      return root.workspaceListKeyboardStart + root.manualWorkspaceRows.length
    var order = settings.monitor_order || []
    return root.workspaceListKeyboardStart + order.length
  }

  function normalizeWorkspaceCursor() {
    root.workspaceKeyboardIndex = Model.wrapIndex(
      root.workspaceKeyboardIndex, root.workspaceKeyboardCount())
    if (manualAssignmentList.visible
        && root.workspaceKeyboardIndex >= root.workspaceListKeyboardStart)
      manualAssignmentList.positionViewAtIndex(
        root.workspaceKeyboardIndex - root.workspaceListKeyboardStart, ListView.Contain)
  }

  function moveWorkspaceCursor(delta) {
    root.workspaceKeyboardIndex = Model.wrapIndex(
      root.workspaceKeyboardIndex + delta, root.workspaceKeyboardCount())
    if (manualAssignmentList.visible
        && root.workspaceKeyboardIndex >= root.workspaceListKeyboardStart)
      manualAssignmentList.positionViewAtIndex(
        root.workspaceKeyboardIndex - root.workspaceListKeyboardStart, ListView.Contain)
  }

  function adjustWorkspaceKeyboard(delta) {
    if (!root.managedChecked || root.editPending || root.previewTransaction !== "") return
    var settings = Model.clone((root.draftProfile || {}).workspaces || {}) || {}
    var index = root.workspaceKeyboardIndex
    if (index === 0) root.editWorkspaces({ enabled: !settings.enabled })
    else if (index === 1) root.changeWorkspaceStrategy(
      Model.cycleOptionValue(["manual", "sequential", "interleave"],
        String(settings.strategy || "manual"), delta))
    else if (index === 2) root.setWorkspaceCount(
      (String(settings.strategy || "") === "manual"
        ? Model.manualWorkspaceCount(settings)
        : Number(settings.max_workspaces || 9)) + delta)
    else if (index === 3 && root.workspaceGroupSizeApplicable) {
      root.editWorkspaces({
        group_size: Math.floor(root.bounded(Number(settings.group_size || 3) + delta,
          1, root.workspaceValueMaximum))
      })
    }
    else if (index === root.workspacePersistenceKeyboardIndex) {
      if (root.editorDocument.workspace_persistence_supported === true && root.workspaceStrategy !== "manual")
        root.editWorkspaces({ persist_all: !settings.persist_all })
    }
    else {
      if (String(settings.strategy || "") === "manual") {
        root.moveManualWorkspace(index - root.workspaceListKeyboardStart, delta)
        return
      }
      var order = settings.monitor_order instanceof Array ? settings.monitor_order : []
      var orderIndex = index - root.workspaceListKeyboardStart
      var target = orderIndex + delta
      if (orderIndex < 0 || orderIndex >= order.length || target < 0 || target >= order.length) return
      root.moveWorkspaceMonitor(String(order[orderIndex] || ""), delta)
      root.workspaceKeyboardIndex = root.workspaceListKeyboardStart + target
    }
  }

  function draftName() {
    return root.sourceProfile !== "" ? root.sourceProfile : String(root.saveName || "").trim()
  }

  function previewCoordinatorReady(method) {
    return !!root.previewCoordinator
      && root.previewCoordinator.connected === true
      && typeof root.previewCoordinator[method] === "function"
  }

  function previewDraft() {
    if (!root.managedChecked || root.reusePending) return
    var name = root.draftName()
    if (name === "") {
      root.lastError = "Give this layout a profile name before previewing it."
      return
    }
    if (root.reusedTemplateName !== "" && root.savedProfiles.some(function(profile) { return profile.name === name })) {
      root.lastError = "Choose a new profile name to keep the existing saved layouts."
      return
    }
    root.lastError = ""
    root.previewPending = true
    if (root.previewCoordinatorReady("startDraftPreview")) {
      if (!root.previewCoordinator.startDraftPreview(
          Model.namedProfile(root.draftProfile, name), 30)) {
        root.previewPending = false
        root.lastError = String(root.previewCoordinator.errorMessage
          || "Could not open the display confirmation.")
      }
      return
    }
    root.send("preview", {
      profile: Model.namedProfile(root.draftProfile, name),
      timeout_seconds: 30,
      save_on_commit: true
    }, { kind: "draft" })
  }

  function applyDraft() {
    if (!root.managedChecked || root.reusePending || root.previewTransaction !== "" || root.previewPending) return
    var name = root.draftName() || "draft"
    var profile = Model.namedProfile(root.draftProfile, name)
    root.lastError = ""
    root.previewPending = true
    if (root.previewCoordinatorReady("startDraftApply")) {
      if (!root.previewCoordinator.startDraftApply(profile, 30)) {
        root.previewPending = false
        root.lastError = String(root.previewCoordinator.errorMessage
          || "Could not open the display confirmation.")
      }
      return
    }
    root.send("preview", {
      profile: profile,
      timeout_seconds: 30,
      save_on_commit: false
    }, { kind: "draft-apply" })
  }

  function keyboardSaveDraft() {
    if (root.draftName() !== "") {
      root.previewDraft()
      return
    }
    root.creatingProfile = true
    root.saveName = ""
    Qt.callLater(function() { profileNameInput.forceActiveFocus() })
  }

  function handleExpandedMove(dx, dy) {
    if (root.reusePending) return
    if (root.keyboardHelpOpen) {
      root.keyboardHelpOpen = false
      return
    }
    if (root.previewTransaction !== "") return
    if (root.activePage === "layout") {
      if (root.keyboardLayoutPane === "canvas") root.nudgeSelectedOutput(dx * 100, dy * 100)
      else if (dy !== 0) root.moveInspectorCursor(dy)
      else if (dx !== 0) root.adjustInspectorField(dx)
    } else if (root.activePage === "profiles") {
      if (dy !== 0) root.selectSavedProfile(dy)
    } else if (root.activePage === "workspaces") {
      if (dy !== 0) root.moveWorkspaceCursor(dy)
      else if (dx !== 0) root.adjustWorkspaceKeyboard(dx)
    }
  }

  function handleExpandedActivate(returnPressed) {
    if (root.reusePending) return
    if (root.keyboardHelpOpen) {
      root.keyboardHelpOpen = false
      return
    }
    if (root.previewTransaction !== "") {
      root.keepPreview()
      return
    }
    if (root.activePage === "layout") {
      if (root.keyboardLayoutPane === "canvas") {
        if (returnPressed) root.cycleLayoutKeyboardPane(1)
        else if (root.selectedOutput) root.editOutput({ enabled: root.selectedOutput.enabled === false })
      } else root.activateInspectorField()
    } else if (root.activePage === "profiles") {
      if (returnPressed) root.activateSelectedSavedProfile()
      else root.setProfileAutomatic(!root.profileAutomatic)
    } else if (root.activePage === "workspaces") {
      root.adjustWorkspaceKeyboard(1)
    }
  }

  function handleExpandedTab(direction) {
    if (root.keyboardHelpOpen) {
      root.keyboardHelpOpen = false
      return
    }
    if (root.activePage === "layout") root.cycleLayoutKeyboardPane(direction)
  }

  function handleExpandedText(text) {
    if (root.reusePending) return
    var key = String(text || "")
    if (root.keyboardHelpOpen) {
      root.keyboardHelpOpen = false
      return
    }
    if (root.previewTransaction !== "") {
      if (key === "y" || key === "Y") root.keepPreview()
      else if (key === "n" || key === "N") root.revertPreview()
      return
    }
    if (key === "1" || key === "2" || key === "3") {
      root.activePage = key === "1" ? "layout" : (key === "2" ? "workspaces" : "profiles")
      return
    }
    if (key === "?") {
      root.keyboardHelpOpen = true
      return
    }
    if (key === "q") {
      root.close()
      return
    }
    if (key === "R") {
      if (root.daemonOutdated) root.restartService()
      return
    }
    if (key === "r") {
      root.requestEditorState()
      return
    }
    if (key === "s") {
      root.keyboardSaveDraft()
      return
    }
    if (key === "a") {
      if (root.activePage === "profiles") root.activateSelectedSavedProfile()
      else root.applyDraft()
      return
    }

    if (root.activePage === "layout") {
      if (key === "0") root.editOutput({ x: 0, y: 0 })
      else if (key === "[") root.selectOutput(-1)
      else if (key === "]") root.selectOutput(1)
      else if (root.keyboardLayoutPane === "canvas" && key === "H") root.nudgeSelectedOutput(-500, 0)
      else if (root.keyboardLayoutPane === "canvas" && key === "L") root.nudgeSelectedOutput(500, 0)
      else if (root.keyboardLayoutPane === "canvas" && key === "K") root.nudgeSelectedOutput(0, -500)
      else if (root.keyboardLayoutPane === "canvas" && key === "J") root.nudgeSelectedOutput(0, 500)
      else if (root.keyboardLayoutPane !== "canvas" && (key === "-" || key === "_")) root.adjustInspectorField(-1)
      else if (root.keyboardLayoutPane !== "canvas" && (key === "+" || key === "=")) root.adjustInspectorField(1)
    } else if (root.activePage === "profiles") {
      if (key === "e") root.beginExecEdit()
      else if (key === "d") root.deleteSelectedSavedProfile()
      else if (key === "u" && root.selectedSavedProfile) root.openLayoutReuse(root.selectedSavedProfileName)
    } else if (root.activePage === "workspaces") {
      if (key === "-" || key === "_") root.adjustWorkspaceKeyboard(-1)
      else if (key === "+" || key === "=") root.adjustWorkspaceKeyboard(1)
    }
  }

  function previewProfile(name) {
    if (root.reusePending) return
    var selected = String(name || root.profileChoice || "")
    if (selected === "") return
    if (!root.managedChecked) return
    if (root.previewPending || root.previewTransaction !== "") return
    root.lastError = ""
    root.previewPending = true
    if (root.previewCoordinatorReady("startSavedProfilePreview")) {
      if (!root.previewCoordinator.startSavedProfilePreview(selected, 30)) {
        root.previewPending = false
        root.lastError = String(root.previewCoordinator.errorMessage
          || "Could not open the display confirmation.")
      }
      return
    }
    root.send("preview", { profile_name: selected, timeout_seconds: 30 }, {
      kind: "profile",
      name: selected
    })
  }

  function activateSelectedSavedProfile() {
    if (root.draftDirty || root.editPending) {
      root.lastError = "Save or discard your edits before using another profile."
      return
    }
    var selected = String(root.selectedSavedProfileName || "")
    if (selected === "" || selected === root.activeProfile) return
    root.profileChoice = selected
    root.previewProfile(selected)
  }

  function setProfileAutomatic(enabled) {
    if (root.reusePending) return
    if (!root.managedChecked || !root.backendConnected || root.profileModePending || root.previewTransaction !== "") return
    root.lastError = ""
    if (enabled && root.activeProfile !== "") {
      root.profileChoice = root.activeProfile
      root.selectedSavedProfileName = root.activeProfile
    }
    root.profileModePending = true
    root.send("set_profile_auto", { enabled: enabled })
  }

  function beginCreateProfile() {
    if (!root.managedChecked || !root.editorReady || root.editPending || root.reusePending
        || root.daemonPreview || root.previewTransaction !== "" || root.previewPending) return
    root.lastError = ""
    root.profileDefaults = Model.clone(root.draftProfile)
    root.sourceProfile = ""
    root.saveName = ""
    root.creatingProfile = true
    root.activePage = "layout"
    root.expanded = true
    Qt.callLater(function() { profileNameInput.forceActiveFocus() })
  }

  function keepPreview() {
    if (root.previewTransaction === "" || root.previewPending) return
    root.previewPending = true
    if (root.previewCoordinator
        && String(root.previewCoordinator.transactionId || "") === root.previewTransaction) {
      if (!root.previewCoordinator.keep()) root.previewPending = false
      return
    }
    root.send("commit", {
      transaction_id: root.previewTransaction,
      save: root.previewKind === "draft"
    }, { kind: root.previewKind })
  }

  function revertPreview() {
    if (root.previewTransaction === "" || root.previewPending) return
    root.previewPending = true
    if (root.previewCoordinator
        && String(root.previewCoordinator.transactionId || "") === root.previewTransaction) {
      if (!root.previewCoordinator.revert()) root.previewPending = false
      return
    }
    root.send("revert", { transaction_id: root.previewTransaction }, { kind: root.previewKind })
  }

  function clearPreview(reload) {
    root.previewTransaction = ""
    root.previewKind = ""
    root.previewDeadline = ""
    root.previewSeconds = 0
    root.previewPending = false
    previewTimer.stop()
    if (reload) root.requestEditorState()
  }

  function updatePreviewClock() {
    var deadline = Date.parse(root.previewDeadline)
    if (!isFinite(deadline)) return
    root.previewSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (root.previewSeconds === 0) root.clearPreview(true)
  }

  function updateDocument(value) {
    if (!value || typeof value !== "object") return
    root.statusRevision++
    root.statusRetry = false
    root.displaysConnecting = false
    if (root.lastError === "Displays are still connecting; try again shortly.") root.lastError = ""
    var monitorsChanged = Model.monitorStateSignature(root.monitorSummaries)
      !== Model.monitorStateSignature(value.monitors)
      || String((root.document || {}).monitor_set_hash || "") !== String(value.monitor_set_hash || "")
    root.document = value
    root.documentReady = true
    root.syncDaemonPreview(value.daemon ? value.daemon.preview : null)
    if (monitorsChanged) {
      root.monitorTopologyRevision++
      root.queueEditorRefresh(true)
    }
    if (monitorsChanged && root.activePage === "reuse") {
      root.reuseTopologyChanged = true
      root.reuseStatus = "The displays changed. Review the refreshed assignments before continuing."
    }
    if (root.serviceActionPending) {
      var unmanaged = !!(value.daemon && value.daemon.unmanaged)
      if (root.serviceTargetManaged === !unmanaged) {
        root.serviceActionPending = false
        root.serviceAction = ""
        serviceConfirmationTimer.stop()
      }
    }
  }

  function syncDaemonPreview(pending) {
    var id = pending ? String(pending.transaction_id || "") : ""
    if (id !== "") {
      var coordinated = root.previewCoordinator
        && String(root.previewCoordinator.transactionId || "") === id
      if (!coordinated && !Model.canConfirmPreview(pending, root.previewTransaction)) return
      // The shell service recovers abandoned previews when it is available.
      if (!coordinated && root.previewTransaction !== id
          && root.previewCoordinatorReady("keep")) return
      root.previewTransaction = id
      root.previewKind = pending.save_on_commit ? "draft" : "profile"
      root.previewDeadline = String(pending.deadline || "")
      if (pending.profile && pending.profile.outputs instanceof Array) {
        root.draftProfile = Model.clone(pending.profile)
        root.profileChoice = String(pending.profile_name || pending.profile.name || "")
        root.selectedSavedProfileName = root.profileChoice
      }
      root.updatePreviewClock()
      previewTimer.start()
      if ((!root.previewCoordinator || !root.previewCoordinator.connected)
          && !root.opened && !previewRecoveryTimer.running)
        previewRecoveryTimer.start()
      return
    }
    if (root.previewTransaction !== "" && !root.previewPending) root.clearPreview(false)
  }

  function handleMessage(line) {
    var envelope = Model.parseEnvelope(line)
    if (!envelope) {
      root.lastError = "hyprmoncfg returned an invalid IPC message."
      return
    }
    if (envelope.type === "event") {
      if (envelope.event === "status") root.updateDocument(envelope.data)
      return
    }

    var method = root.pendingMethods[String(envelope.id)] || ""
    var context = root.pendingContexts[String(envelope.id)] || ({})
    delete root.pendingMethods[String(envelope.id)]
    root.pendingMethods = Object.assign({}, root.pendingMethods)
    delete root.pendingContexts[String(envelope.id)]
    // Events and preview transitions supersede snapshots from earlier reads.
    if ((method === "status" || method === "subscribe")
        && context.statusRevision !== root.statusRevision) {
      // The snapshot is obsolete, but subscription still completes reconnect.
      if (method === "subscribe" && root.opened && !root.editorReady && !root.editorLoading)
        root.requestEditorState()
      return
    }
    if (method === "reuse_profile" && context.generation !== root.reuseGeneration) return
    if (envelope.error) {
      if (method === "reuse_profile") root.reusePending = false
      if (method === "editor_state") root.editorLoading = false
      if (method === "edit_profile") root.editPending = false
      if (method === "preview" || method === "commit" || method === "revert") root.previewPending = false
      if (method === "set_profile_auto") root.profileModePending = false
      root.lastError = String(envelope.error.message || "hyprmoncfg request failed")
      if (envelope.error.code === "compositor_busy") {
        root.displaysConnecting = true
        root.statusRetry = true
        if (method === "editor_state" || method === "reuse_profile") {
          root.editorRetry = true
          root.queueEditorRefresh(method === "reuse_profile" || context.automaticEditorRefresh === true)
        }
      }
      return
    }
    if (method === "editor_state") {
      var snapshotChanged = !Model.monitorSnapshotsMatch(root.document, envelope.result)
      if (snapshotChanged || context.topologyRevision !== root.monitorTopologyRevision
          || root.editorPreviewBlocked || context.previewRevision !== root.editorPreviewRevision
          || (context.automaticEditorRefresh
            && (root.editorRefreshBlocked
              || context.interactionRevision !== root.editorInteractionRevision))) {
        root.editorLoading = false
        root.queueEditorRefresh(context.automaticEditorRefresh === true)
        // A newer editor snapshot can arrive before status, or after a lost
        // status event. Refresh status as well so recovery can make progress.
        if (snapshotChanged) root.statusRetry = true
        return
      }
    }
    if (method === "status" || method === "subscribe") {
      root.updateDocument(envelope.result)
      if (method === "subscribe" && root.opened) root.requestEditorState()
    }
    else if (method === "editor_state") root.updateEditor(envelope.result, context.automaticEditorRefresh === true)
    else if (method === "reuse_profile") root.acceptReusedLayout(envelope.result, context)
    else if (method === "edit_profile") {
      var result = envelope.result || {}
      if (!result.profile || !(result.profile.outputs instanceof Array)) {
        root.editPending = false
        root.lastError = "hyprmoncfg returned an invalid edited profile."
        return
      }
      root.draftProfile = result.profile
      root.workspacePlan = result.workspace_plan instanceof Array ? result.workspace_plan : []
      root.editPending = false
      root.draftDirty = true
      Qt.callLater(function() {
        root.normalizeWorkspaceCursor()
        if (root.activePage === "workspaces") root.ensureManualWorkspaceRules()
      })
    } else if (method === "preview") {
      var transaction = envelope.result || {}
      root.previewTransaction = String(transaction.id || "")
      root.previewKind = String(context.kind || "profile")
      root.previewDeadline = String(transaction.deadline || "")
      root.previewPending = false
      root.updatePreviewClock()
      previewTimer.start()
    } else if (method === "commit" || method === "revert") {
      root.clearPreview(true)
    } else if (method === "set_profile_auto") {
      root.profileModePending = false
    } else if (method === "save" || method === "delete") {
      root.requestEditorState()
    }
  }

  function itemCount() {
    if (!root.compatible) return 1
    return root.layoutRowIndex + 1
  }

  function moveCursor(delta) {
    root.cursorActive = true
    root.cursorIndex = Math.max(0, Math.min(root.itemCount() - 1, root.cursorIndex + delta))
  }

  function activateCursor() {
    if (!root.compatible) {
      root.install()
      return
    }
    if (root.cursorIndex === 0) {
      root.setManaged(!root.managedChecked)
      return
    }
    var row = root.actionRows[root.cursorIndex - 1]
    if (row) {
      root.activateRow(String(row.id))
      return
    }
    root.launchTui()
  }

  function activateRow(id) {
    if (id === "restart-service") root.restartService()
  }

  Component.onCompleted: root.checkInstallation()
  onActivePageChanged: {
    if (root.activePage === "workspaces")
      Qt.callLater(function() { root.ensureManualWorkspaceRules() })
  }

  Connections {
    target: root.previewCoordinator
    ignoreUnknownSignals: true
    function onTransactionIdChanged() { root.statusRevision++; root.editorPreviewRevision++; root.syncDaemonPreview(root.daemonPreview) }
    function onRequestPendingChanged() { root.statusRevision++; root.editorPreviewRevision++ }
    function onActionPendingChanged() { root.statusRevision++; root.editorPreviewRevision++ }
    function onPreviewFinished() { root.clearPreview(true) }
    function onIdentifyErrorChanged() {
      if (root.previewCoordinator.identifyError) root.lastError = root.previewCoordinator.identifyError
    }
    function onRequestFinished(success, message) {
      root.previewPending = false
      if (!success && String(message || "") !== "") root.lastError = String(message)
    }
  }

  onOpenedChanged: {
    if (opened) {
      root.cursorIndex = 0
      root.cursorActive = false
      root.keyboardLayoutPane = "canvas"
      root.keyboardInspectorField = 0
      root.workspaceKeyboardIndex = 0
      root.checkInstallation()
      if (root.compatible) root.checkServiceState()
      if (root.backendConnected) root.requestEditorState()
      brightnessSelectionTimer.restart()
    } else {
      brightnessSetDebounce.stop()
      root.reuseGeneration++
      root.reusePending = false
      profileActions.close()
      deleteConfirmation.close()
      root.deleteProfileName = ""
    }
  }

  Socket {
    id: backendSocket
    path: root.socketPath
    connected: false
    parser: SplitParser {
      splitMarker: "\n"
      onRead: function(line) { root.handleMessage(line) }
    }
    onConnectedChanged: {
      if (connected) {
        root.connectionGrace = false
        root.lastError = ""
        root.installing = false
        root.subscribe()
      } else {
        root.pendingMethods = ({})
        root.pendingContexts = ({})
        root.editorReady = false
        root.editorLoading = false
        root.editorRefreshQueued = false
        root.editorResetQueued = false
        root.monitorTopologyRevision++
        root.editPending = false
        root.profileModePending = false
        root.reusePending = false
        root.reuseGeneration++
        root.statusRetry = false
        root.editorRetry = false
        root.displaysConnecting = false
        root.clearPreview(false)
        if (root.compatible && (root.serviceEnabled || root.serviceActive))
          serviceRefreshTimer.restart()
      }
    }
    onError: function(error) { backendSocket.connected = false }
  }

  Process {
    id: whichProcess
    stdout: StdioCollector { id: versionOutput; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode === 3 && root.installing) return

      root.checkingInstallation = false
      root.installationStateKnown = true
      var probedInstalled = exitCode === 0
      var probedCompatible = probedInstalled && Model.versionAtLeast(versionOutput.text, "1.19.0")

      if (root.installing && exitCode === 2) {
        root.installing = false
        installPoll.stop()
        installTimeout.stop()
        root.lastError = String(versionOutput.text || "").trim() === "130"
          ? "Installation was canceled."
          : "Installation did not finish. Check the Omarchy terminal and try again."
        return
      }

      if (root.installing && !probedCompatible) {
        root.installing = false
        installPoll.stop()
        installTimeout.stop()
        root.lastError = "The update finished, but hyprmoncfg 1.19.0 or newer is still required."
        return
      }

      root.installed = probedInstalled
      root.installedVersion = probedInstalled ? String(versionOutput.text || "") : ""
      root.compatible = probedCompatible
      if (root.compatible) {
        root.installing = false
        installPoll.stop()
        installTimeout.stop()
        root.checkServiceState()
      } else {
        backendSocket.connected = false
        root.serviceStateKnown = false
      }
    }
  }

  Process {
    id: enabledProcess
    onExited: function(exitCode) {
      root.serviceEnabled = exitCode === 0
      activeProcess.command = ["systemctl", "--user", "is-active", "--quiet", "hyprmoncfgd.service"]
      activeProcess.running = true
    }
  }

  Process {
    id: activeProcess
    onExited: function(exitCode) {
      var wasActive = root.serviceActive
      root.serviceActive = exitCode === 0
      root.serviceStateKnown = true
      if (root.serviceActive) {
        if (!root.backendConnected) {
          if (!wasActive) {
            root.connectionGrace = true
            connectionGraceTimer.restart()
          }
          root.connectBackend()
        }
      } else {
        root.connectionGrace = false
        backendSocket.connected = false
      }
      if (root.serviceActionPending && !serviceProcess.running) {
        // Turning management off no longer stops the unit, so only the
        // managed direction can be confirmed from systemctl. The other one is
        // confirmed by the daemon's status document in updateDocument.
        var confirmed = root.serviceTargetManaged
          && root.serviceEnabled
          && root.serviceActive
        if (confirmed) {
          root.serviceActionPending = false
          root.serviceAction = ""
          serviceConfirmationTimer.stop()
        } else {
          serviceRefreshTimer.restart()
        }
      }
    }
  }

  Process {
    id: installPreparationProcess
    onExited: function(exitCode) {
      if (!root.installing) return
      if (exitCode !== 0) {
        root.installing = false
        root.lastError = "Could not prepare the hyprmoncfg update."
        return
      }
      installerProcess.command = Model.installProcessArgs()
      // Release the overlay's keyboard focus before presenting a sudo prompt.
      root.close()
      Qt.callLater(function() { installerProcess.startDetached() })
      installPoll.restart()
      installTimeout.restart()
    }
  }

  Process { id: installerProcess }

  Process {
    id: serviceProcess
    stderr: StdioCollector { id: serviceStderr; waitForEnd: true }
    onExited: function(exitCode) {
      var action = root.serviceAction
      if (exitCode !== 0) {
        root.serviceActionPending = false
        root.serviceAction = ""
        var fallback = action === "disable" ? "Could not return display management to Omarchy." : "Could not start hyprmoncfg."
        root.lastError = String(serviceStderr.text || fallback).trim()
      } else if (action === "disable") {
        root.checkServiceState()
      } else {
        root.connectionGrace = true
        connectionGraceTimer.restart()
        reconnectTimer.restart()
      }
      if (exitCode === 0) serviceConfirmationTimer.restart()
      serviceRefreshTimer.restart()
    }
  }

  Process { id: tuiProcess }

  // Status events arrive while the panel remains open, including hotplug and
  // automatic profile changes. Refresh its separate editor snapshot after the
  // burst settles, preserving edits and waiting for any in-flight read.
  Timer {
    interval: 1000
    repeat: true
    running: root.opened && root.backendConnected && (root.statusRetry || root.editorRetry)
    onTriggered: root.retryConnectingDisplays()
  }

  Timer {
    id: editorRefreshTimer
    interval: 200
    repeat: true
    running: root.backendConnected && (root.editorResetQueued
      || (root.editorRefreshQueued && !root.editorRefreshBlocked))
    onTriggered: root.requestEditorState(!root.editorResetQueued)
  }

  Timer {
    id: brightnessSelectionTimer
    interval: 80
    repeat: false
    onTriggered: root.refreshBrightness()
  }

  Timer {
    id: brightnessSetDebounce
    interval: 180
    repeat: false
    onTriggered: root.setBrightness(root.brightnessPercent)
  }

  Timer {
    interval: 5000
    repeat: true
    running: root.opened && root.brightnessConnector !== ""
    onTriggered: root.refreshBrightness()
  }

  Process {
    id: brightnessReadProcess
    stdout: StdioCollector { id: brightnessReadOutput; waitForEnd: true }
    onExited: function(exitCode) {
      var connector = root.brightnessReadConnector
      var parsed = Number(String(brightnessReadOutput.text || "").trim())
      if (connector === root.brightnessConnector) {
        root.brightnessLoading = false
        root.brightnessAvailable = exitCode === 0 && isFinite(parsed)
        if (root.brightnessAvailable) root.brightnessPercent = Model.clampBrightness(parsed)
      }
      if (root.brightnessReadQueued) {
        root.brightnessReadQueued = false
        brightnessSelectionTimer.restart()
      }
    }
  }

  Process {
    id: brightnessSetProcess
    onExited: function(exitCode) {
      var completedConnector = root.brightnessSetConnector
      if (exitCode !== 0 && completedConnector === root.brightnessConnector) {
        root.brightnessAvailable = false
      }

      if (root.brightnessSetQueued) {
        root.brightnessSetQueued = false
        if (root.pendingBrightnessConnector === root.brightnessConnector)
          root.startBrightnessSet(root.pendingBrightnessConnector, root.pendingBrightnessPercent)
        return
      }

      if (root.brightnessReadQueued) {
        root.brightnessReadQueued = false
        // Avoid Omarchy's known immediate-read race after a successful write.
        // A new selection needs a read now; this display can wait for the
        // regular five-second reconciliation.
        if (completedConnector !== root.brightnessConnector || exitCode !== 0)
          brightnessSelectionTimer.restart()
      }
    }
  }

  Timer {
    id: installPoll
    interval: 1000
    repeat: true
    running: root.installing && !root.compatible
    onTriggered: root.checkInstallation()
  }

  Timer {
    id: installTimeout
    interval: 300000
    onTriggered: {
      if (!root.installing) return
      root.installing = false
      installPoll.stop()
      root.lastError = "Installation is still waiting. Check the Omarchy terminal and try again."
    }
  }

  Timer {
    id: serviceRefreshTimer
    interval: 250
    onTriggered: root.checkServiceState()
  }

  Timer {
    id: serviceDiscoveryTimer
    interval: 2000
    repeat: true
    running: root.compatible && !root.backendConnected && !root.serviceActionPending
    onTriggered: root.checkServiceState()
  }

  Timer {
    id: connectionGraceTimer
    interval: 2000
    onTriggered: root.connectionGrace = false
  }

  Timer {
    id: serviceConfirmationTimer
    interval: 5000
    onTriggered: {
      if (!root.serviceActionPending) return
      root.serviceActionPending = false
      root.serviceAction = ""
      root.lastError = "Could not confirm the automatic switching state."
      root.checkServiceState()
    }
  }

  Timer {
    id: reconnectTimer
    interval: 1000
    repeat: true
    running: root.compatible
      && (root.serviceActive || (root.serviceActionPending && root.serviceTargetManaged))
      && !root.backendConnected
    onTriggered: {
      root.checkServiceState()
      root.connectBackend()
    }
  }

  Timer {
    id: previewTimer
    interval: 250
    repeat: true
    onTriggered: root.updatePreviewClock()
  }

  // Applying a profile can rebuild Omarchy's per-screen bar and destroy the
  // panel that initiated the preview. The daemon keeps the transaction alive;
  // ask the shared bar host to reopen this widget on the focused output so the
  // replacement instance can show the same Keep/Revert choice.
  Timer {
    id: previewRecoveryTimer
    property int attempts: 0
    interval: 150
    repeat: true
    onRunningChanged: if (running) attempts = 0
    onTriggered: {
      attempts++
      if (root.previewTransaction === "" || root.opened) {
        stop()
        return
      }
      var host = root.bar && root.bar.shell ? root.bar.shell : null
      if (host && typeof host.summon === "function")
        host.summon(root.moduleName, "")
      if (attempts >= 20) stop()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: false
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(root.expanded ? 1120 : 430))
    contentHeight: root.expanded
      ? panel.fittedContentHeight(Style.space(780))
      : panel.fittedContentHeight(compactColumn.implicitHeight)

    Item {
      width: 0
      height: 0

      Shortcut {
        sequence: "Shift+Left"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(-10, 0)
      }
      Shortcut {
        sequence: "Shift+Right"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(10, 0)
      }
      Shortcut {
        sequence: "Shift+Up"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(0, -10)
      }
      Shortcut {
        sequence: "Shift+Down"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(0, 10)
      }
      Shortcut {
        sequence: "Ctrl+Left"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(-1, 0)
      }
      Shortcut {
        sequence: "Ctrl+Right"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(1, 0)
      }
      Shortcut {
        sequence: "Ctrl+Up"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(0, -1)
      }
      Shortcut {
        sequence: "Ctrl+Down"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.nudgeSelectedOutput(0, 1)
      }
      Shortcut {
        sequence: "Alt+Left"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.snapSelectedOutput("left")
      }
      Shortcut {
        sequence: "Alt+Right"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.snapSelectedOutput("right")
      }
      Shortcut {
        sequence: "Alt+Up"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.snapSelectedOutput("up")
      }
      Shortcut {
        sequence: "Alt+Down"
        enabled: root.opened && root.expanded && root.activePage === "layout"
          && root.keyboardLayoutPane === "canvas" && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.snapSelectedOutput("down")
      }
      Shortcut {
        sequence: "L"
        enabled: root.opened && root.expanded && root.activePage === "profiles"
          && !root.keyboardHelpOpen && !root.execEditing && !keyCatcher.blocked
        onActivated: root.loadSelectedSavedProfile()
      }
    }

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      property bool returnPressed: false
      blocked: root.activePage === "reuse" || root.execEditing || profileActions.visible || deleteConfirmation.visible
        || profileNameInput.activeFocus
        || positionXField.field.activeFocus || positionYField.field.activeFocus
        || workspaceCountField.field.activeFocus || workspaceGroupSizeField.field.activeFocus
        || sdrBrightnessField.input.activeFocus || sdrSaturationField.input.activeFocus
        || sdrMinLuminanceField.input.activeFocus || sdrMaxLuminanceField.input.activeFocus
        || minLuminanceField.input.activeFocus || maxLuminanceField.input.activeFocus
        || maxAvgLuminanceField.input.activeFocus || iccProfileInput.activeFocus
        || modeDropdown.popupOpen || scaleDropdown.popupOpen || vrrDropdown.popupOpen
        || rotationDropdown.popupOpen || mirrorDropdown.popupOpen
        || bitdepthDropdown.popupOpen || colorManagementDropdown.popupOpen
        || sdrCurveDropdown.popupOpen || forceWideDropdown.popupOpen || forceHdrDropdown.popupOpen
        || workspaceStrategyDropdown.popupOpen || workspacePersistenceDropdown.popupOpen
      onMoveRequested: function(dx, dy) {
        if (!root.expanded && dy !== 0) root.moveCursor(dy)
        else if (root.expanded) root.handleExpandedMove(dx, dy)
      }
      onReturnRequested: returnPressed = true
      onActivateRequested: {
        if (!root.expanded) root.activateCursor()
        else root.handleExpandedActivate(returnPressed)
        returnPressed = false
      }
      onCloseRequested: {
        if (root.keyboardHelpOpen) root.keyboardHelpOpen = false
        else if (root.previewTransaction !== "") root.revertPreview()
        else root.close()
      }
      onTabRequested: function(direction) {
        if (root.expanded) root.handleExpandedTab(direction)
        else root.switchPanel(direction)
      }
      onTextKey: function(text) { if (root.expanded) root.handleExpandedText(text) }

      Column {
        id: compactColumn
        visible: !root.expanded
        width: parent.width
        spacing: Style.space(14)

        Item {
          width: parent.width
          implicitHeight: Math.max(compactHeroIcon.implicitHeight, compactHeroLabels.implicitHeight, compactExpandButton.implicitHeight)

          Item {
            id: compactHeroIcon
            implicitWidth: compactHeroGlyph.implicitWidth
            implicitHeight: compactHeroGlyph.implicitHeight
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            opacity: root.backendConnected ? 1.0 : 0.6

            Text {
              textFormat: Text.PlainText
              id: compactHeroGlyph
              text: root.monitorCount > 1 ? "󰍺" : "󰍹"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
            }

            Text {
              textFormat: Text.PlainText
              visible: root.backendConnected
              anchors.right: compactHeroGlyph.right
              anchors.bottom: compactHeroGlyph.bottom
              anchors.rightMargin: -Style.space(2)
              anchors.bottomMargin: -Style.space(1)
              text: "󰄬"
              color: Color.accent
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }
          }

          Column {
            id: compactHeroLabels
            anchors.left: compactHeroIcon.right
            anchors.leftMargin: Style.space(14)
            anchors.right: compactExpandButton.left
            anchors.rightMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(1)

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: "Display"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: "hyprmoncfg"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              elide: Text.ElideRight
            }
          }

          Button {
            id: compactExpandButton
            visible: root.compatible
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: "Expand"
            iconText: "󰊓"
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            onClicked: root.expanded = true
          }
        }

        Text {
          textFormat: Text.PlainText
          visible: root.lastError !== ""
          width: parent.width
          text: root.lastError
          color: root.urgent
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Column {
          visible: !root.compatible && !root.checkingInstallation
          width: parent.width
          spacing: Style.space(14)

          PanelSeparator { foreground: root.foreground }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: root.installed
              ? "Update hyprmoncfg to use the visual editor."
              : "Install hyprmoncfg to manage monitor layouts."
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignHCenter
          }

          Button {
            width: parent.width
            text: root.installing
              ? (root.installed ? "Updating hyprmoncfg…" : "Installing hyprmoncfg…")
              : (root.installed ? "Update hyprmoncfg" : "Install hyprmoncfg")
            iconText: root.installed ? "󰚰" : "󰏔"
            iconSpinning: root.installing
            selected: !root.installed
            bordered: true
            enabled: !root.installing
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.install()
          }
        }

        Column {
          visible: root.compatible
          width: parent.width
          spacing: Style.space(14)

          PanelSeparator { foreground: root.foreground }

          BrightnessControl {
            visible: root.brightnessConnector !== ""
            width: parent.width
            bar: root.bar
            connector: root.brightnessConnector
            displayLabel: root.brightnessDisplayLabel
            value: root.brightnessPercent
            available: root.brightnessAvailable
            loading: root.brightnessLoading
            foreground: root.foreground
            dim: root.dim
            accent: Color.accent
            fontFamily: root.fontFamily
            onPreviewed: function(value) { root.previewBrightness(value) }
            onCommitted: function(value) {
              brightnessSetDebounce.stop()
              root.setBrightness(value)
            }
          }

          Column {
            width: parent.width
            spacing: Style.space(6)

            PanelSectionHeader {
              text: "MONITOR MANAGEMENT"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Toggle {
              width: parent.width
              label: "Managed by hyprmoncfg"
              description: {
                if (root.serviceActionPending)
                  return root.serviceTargetManaged ? "Taking control of display configuration…" : "Handing display control back…"
                if (root.serviceBroken) return "The background service could not start"
                if (root.managedChecked && root.profileAutomatic)
                  return "Switch layouts on monitor, lid, and resume events"
                if (root.managedChecked) return "Owns and applies monitor configuration"
                return "Read-only — display configuration is controlled elsewhere"
              }
              checked: root.managedChecked
              enabled: !root.serviceActionPending
              hasCursor: root.cursorActive && root.cursorIndex === 0
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.setManaged(!root.managedChecked)
            }
          }

          Repeater {
            model: root.actionRows

            ActionRow {
              required property var modelData
              required property int index
              width: parent.width
              rowIndex: 1 + index
              icon: String(modelData.icon)
              title: String(modelData.title)
              subtitle: String(modelData.subtitle)
              onActivated: root.activateRow(String(modelData.id))
            }
          }

          EditorPane {
            width: parent.width
            height: Style.space(250)
            title: "Monitor Layout"
            meta: root.monitorCount + (root.monitorCount === 1 ? " display" : " displays")
            active: true
            foreground: root.foreground
            dim: root.dim
            accent: Color.accent
            fontFamily: root.fontFamily
            opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

            DisplayCanvas {
              anchors.fill: parent
              profile: root.draftProfile
              editorDisplays: root.editorDocument.displays
              workspacePlan: root.workspacePlan
              emphasis: "layout"
              selectedKey: root.selectedOutputKey
              interactive: false
              selectable: root.editorReady
              movable: root.managedChecked && root.editorReady && !root.editPending && root.previewTransaction === ""
              detailed: true
              framed: false
              foreground: root.foreground
              dim: root.dim
              accent: Color.accent
              fontFamily: root.fontFamily
              onOutputSelected: function(key) { root.selectedOutputKey = key }
              onOutputIdentifyRequested: function(key) { root.identifyOutput(key) }
              onOutputMoved: function(key, x, y, snapDistance) {
                root.editOutput({ x: x, y: y, snap_distance: snapDistance }, key)
              }
            }
          }

          BorderSurface {
            visible: root.draftDirty || root.previewTransaction !== ""
            width: parent.width
            implicitHeight: compactDraftActions.implicitHeight + Style.space(16)
            color: Style.selectedFillFor(root.foreground, Color.accent)
            borderSpec: Border.controlSpec("selected", root.foreground, Color.accent)
            radius: Style.cornerRadius
            opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

            Row {
              id: compactDraftActions
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(10)
              anchors.rightMargin: Style.space(10)
              spacing: Style.space(7)

              Column {
                width: parent.width - compactDiscardDraft.width - compactApplyDraft.width - parent.spacing * 2
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(1)

                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: root.previewTransaction !== ""
                    ? (root.previewKind === "profile" ? "Keep this profile?" : "Keep this layout?")
                    : (root.editPending ? "Checking layout…" : "Layout changed")
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                  elide: Text.ElideRight
                }

                Text {
                  textFormat: Text.PlainText
                  visible: root.previewTransaction !== ""
                  width: parent.width
                  text: root.previewSeconds + " seconds to decide"
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                }
              }

              Button {
                id: compactDiscardDraft
                text: root.previewTransaction !== "" ? "Revert" : "Discard"
                bordered: true
                enabled: root.previewTransaction !== ""
                  ? !root.previewPending
                  : (!root.editorLoading && !root.editPending)
                foreground: root.foreground
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(4)
                onClicked: {
                  if (root.previewTransaction !== "") root.revertPreview()
                  else root.requestEditorState()
                }
              }

              Button {
                id: compactApplyDraft
                text: root.previewTransaction !== ""
                  ? "Keep"
                  : (root.sourceProfile !== "" ? "Preview" : "Finish in editor")
                selected: true
                bordered: true
                enabled: !root.editPending && !root.previewPending
                  && root.managedChecked
                foreground: root.foreground
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(4)
                onClicked: {
                  if (root.previewTransaction !== "") root.keepPreview()
                  else if (root.sourceProfile !== "") root.previewDraft()
                  else root.expanded = true
                }
              }
            }
          }

          PanelSeparator { foreground: root.foreground }

          Column {
            width: parent.width
            spacing: Style.space(6)
            opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

            PanelSectionHeader {
              text: "PROFILE"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            ProfileStatus {
              id: compactProfileStatus
              width: parent.width
              title: root.profileStatusTitle
              subtitle: root.profileStatusSubtitle
              iconText: root.monitorCount > 1 ? "󰍺" : "󰍹"
              foreground: root.foreground
              dim: root.dim
              fontFamily: root.fontFamily
            }

            Button {
              width: parent.width
              visible: !root.profileAutomatic
              text: root.profileModePending ? "Resuming automatic matching…" : "Resume automatic matching"
              selected: true
              bordered: true
              enabled: root.managedChecked && !root.profileModePending
                && root.previewTransaction === "" && !root.previewPending
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.setProfileAutomatic(true)
            }

            Button {
              width: parent.width
              visible: root.newSetupAvailable
              text: "Create profile"
              selected: true
              bordered: true
              enabled: root.managedChecked && root.editorReady
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.beginCreateProfile()
            }

            Button {
              width: parent.width
              text: "Use an existing layout…"
              bordered: true
              visible: root.savedProfiles.length > 0
              enabled: root.backendConnected && root.managedChecked && root.editorReady && !root.editorLoading
                && !root.draftDirty && !root.creatingProfile && !root.reusePending
                && !root.identifyBlockedByPreview
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.openLayoutReuse()
            }
          }
        }
      }

      Item {
        id: expandedEditor
        visible: root.expanded
        anchors.fill: parent

        Item {
          id: editorNav
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: parent.top
          height: Style.space(38)

          Row {
            id: editorTabsRow
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Repeater {
              model: root.pageOptions

              Button {
                required property var modelData
                focusable: true
                text: String(modelData.label || "")
                selected: String(modelData.value || "") === root.activePage
                  || (modelData.value === "profiles" && root.activePage === "reuse")
                foreground: root.foreground
                fontFamily: root.fontFamily
                fontSize: Style.font.body
                horizontalPadding: Style.space(7)
                verticalPadding: Style.space(3)
                enabled: !root.reusePending
                onClicked: root.activePage = String(modelData.value || "layout")
              }
            }
          }

          Row {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(10)

            Button {
              id: identifyAllButton
              anchors.verticalCenter: parent.verticalCenter
              text: "Identify all"
              enabled: root.identifyAvailable
              foreground: root.foreground
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              bordered: true
              onClicked: root.identifyDisplays("")
            }

            Button {
              id: keyboardHelpButton
              anchors.verticalCenter: parent.verticalCenter
              text: ""
              bordered: true
              foreground: root.foreground
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              implicitWidth: keyboardHelpButtonContent.implicitWidth
                + horizontalPadding * 2 + Style.normalBorderWidth * 2
              implicitHeight: identifyAllButton.implicitHeight

              Row {
                id: keyboardHelpButtonContent
                anchors.centerIn: parent
                spacing: Style.space(4)

                Text {
                  textFormat: Text.PlainText
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.verticalCenterOffset: 1
                  text: "?"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }

                Text {
                  textFormat: Text.PlainText
                  anchors.verticalCenter: parent.verticalCenter
                  text: "Keys"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }

              onClicked: root.keyboardHelpOpen = true
            }

            Button {
              id: openTuiButton
              anchors.verticalCenter: parent.verticalCenter
              text: "TUI"
              iconText: "󰆍"
              iconSize: fontSize
              implicitHeight: identifyAllButton.implicitHeight
              bordered: true
              enabled: !root.reusePending
              foreground: root.foreground
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              onClicked: root.launchTui()
            }

            Button {
              id: compactButton
              anchors.verticalCenter: parent.verticalCenter
              text: "Compact"
              iconText: "󰊔"
              iconSize: fontSize
              implicitHeight: identifyAllButton.implicitHeight
              bordered: true
              foreground: root.foreground
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              onClicked: root.expanded = false
            }
          }

          Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: 1
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.22)
          }
        }

        BorderSurface {
          id: previewBanner
          visible: root.previewTransaction !== ""
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: editorNav.bottom
          anchors.topMargin: Style.space(8)
          height: Style.space(58)
          color: Style.selectedFillFor(root.foreground, Color.accent)
          borderSpec: Border.controlSpec("selected", root.foreground, Color.accent)
          radius: Style.cornerRadius

          Row {
            anchors.fill: parent
            anchors.leftMargin: Style.space(12)
            anchors.rightMargin: Style.space(12)
            spacing: Style.space(10)

            Column {
              width: parent.width - keepExpandedPreview.width - revertExpandedPreview.width - parent.spacing * 2
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(1)

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "Keep this layout?"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.previewSeconds + " seconds before the previous layout returns"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
            }

            Button {
              id: revertExpandedPreview
              anchors.verticalCenter: parent.verticalCenter
              text: "Revert"
              bordered: true
              enabled: !root.previewPending
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.revertPreview()
            }

            Button {
              id: keepExpandedPreview
              anchors.verticalCenter: parent.verticalCenter
              text: root.previewKind === "draft" ? "Keep & save" : "Keep"
              selected: true
              bordered: true
              enabled: !root.previewPending
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.keepPreview()
            }
          }
        }

        BorderSurface {
          id: reuseBanner
          visible: root.reuseNotice !== "" && root.previewTransaction === ""
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: editorNav.bottom
          anchors.topMargin: Style.space(8)
          height: reuseNoticeLabel.implicitHeight + Style.space(20)
          color: Style.selectedFillFor(root.foreground, Color.accent)
          borderSpec: Border.controlSpec("normal", root.foreground, Color.accent)
          radius: Style.cornerRadius
          Text {
            id: reuseNoticeLabel
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.margins: Style.space(10)
            text: root.reuseNotice
            textFormat: Text.PlainText
            wrapMode: Text.WordWrap
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }

        Item {
          id: editorBody
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: previewBanner.visible ? previewBanner.bottom
            : (reuseBanner.visible ? reuseBanner.bottom : editorNav.bottom)
          anchors.bottom: editorFooter.top
          anchors.topMargin: Style.space(10)
          anchors.bottomMargin: Style.space(10)

          LayoutReusePane {
            id: reusePane
            anchors.fill: parent
            visible: root.activePage === "reuse"
            profiles: root.savedProfiles
            liveProfile: root.editorDocument.profile
            editorDisplays: root.editorDocument.displays
            available: root.managedChecked && (root.editorDocument.capabilities || []).indexOf("reuse_profile") >= 0
            busy: !root.backendConnected || !root.editorReady || root.reusePending || root.editorLoading || root.readPending
              || root.editorSnapshotStale || root.reuseTopologyChanged || root.identifyBlockedByPreview
            statusMessage: root.reuseStatus
            ownerOpen: root.opened
            popupParent: keyCatcher
            foreground: root.foreground
            dim: root.dim
            fontFamily: root.fontFamily
            onUseRequested: function(name, mapping) { root.reuseLayout(name, mapping) }
            onIdentifyRequested: function(key) { root.identifyOutput(key) }
            onCloseRequested: root.leaveLayoutReuse()
          }

          Item {
            visible: root.activePage === "layout"
            anchors.fill: parent

            EditorPane {
              id: layoutPane
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Math.round(parent.width * 0.65)
              title: "Monitor Layout"
              meta: root.hiddenDisplays
              active: root.keyboardLayoutPane === "canvas"
              foreground: root.foreground
              dim: root.dim
              accent: Color.accent
              fontFamily: root.fontFamily
              opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

              DisplayCanvas {
                anchors.fill: parent
                profile: root.draftProfile
                editorDisplays: root.editorDocument.displays
                workspacePlan: root.workspacePlan
                emphasis: "layout"
                selectedKey: root.selectedOutputKey
                interactive: false
                selectable: root.editorReady
                movable: root.managedChecked && root.editorReady && !root.editPending && root.previewTransaction === ""
                detailed: true
                framed: false
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily
                onOutputSelected: function(key) { root.selectedOutputKey = key }
                onOutputIdentifyRequested: function(key) { root.identifyOutput(key) }
                onOutputMoved: function(key, x, y, snapDistance) {
                  root.editOutput({ x: x, y: y, snap_distance: snapDistance }, key)
                }
              }
            }

            Column {
              anchors.left: layoutPane.right
              anchors.leftMargin: Style.space(10)
              anchors.right: parent.right
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              spacing: Style.space(10)

              MonitorInfo {
                id: inspectorPane
                width: parent.width
                height: implicitHeight
                output: root.selectedOutput
                metadata: root.selectedOutputMetadata
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily
                canIdentify: root.identifyAvailable && !!root.selectedOutput
                onIdentifyRequested: root.identifyDisplays(root.selectedOutputKey)
              }

              EditorPane {
                width: parent.width
                height: parent.height - inspectorPane.height - Style.space(10)
                active: root.keyboardLayoutPane !== "canvas"
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily

                ButtonGroup {
                  id: inspectorTabs
                  anchors.left: parent.left
                  anchors.top: parent.top
                  options: root.inspectorOptions
                  value: root.inspectorPage
                  foreground: root.foreground
                  background: root.bar ? root.bar.background : Color.background
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.caption
                  onChanged: function(value) {
                    root.inspectorPage = value
                    root.keyboardLayoutPane = value
                  }
                }

                InspectorViewport {
                  id: inspectorViewport
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.top: inspectorTabs.bottom
                  anchors.bottom: parent.bottom
                  anchors.topMargin: Style.space(8)
                  scrollBarGap: Style.space(4)
                  formHeight: root.inspectorPage === "display"
                    ? displayControls.implicitHeight : colorControls.implicitHeight
                  property string page: root.inspectorPage
                  onPageChanged: contentY = 0
                  currentField: root.keyboardLayoutPane === root.inspectorPage
                    ? [displayEnabledToggle, modeDropdown, scaleDropdown, bitdepthDropdown,
                       colorManagementDropdown, vrrDropdown, rotationDropdown, positionXField,
                       positionYField, mirrorDropdown, sdrBrightnessField, sdrSaturationField,
                       sdrMinLuminanceField, sdrMaxLuminanceField, sdrCurveDropdown,
                       minLuminanceField, maxLuminanceField, maxAvgLuminanceField,
                       forceWideDropdown, forceHdrDropdown, iccProfileInput][root.keyboardInspectorField]
                    : null

                  Column {
                    id: displayControls
                    visible: root.inspectorPage === "display"
                    width: parent.width
                    spacing: Style.space(9)

                    Item {
                      width: parent.width
                      height: displayEnabledToggle.height

                      Toggle {
                        id: displayEnabledToggle
                        anchors.left: parent.left
                        anchors.right: enabledResetAction.visible ? enabledResetAction.left : parent.right
                        anchors.rightMargin: enabledResetAction.visible ? Style.spacing.xxs : 0
                        label: "Enabled"
                        description: checked ? "This display participates in the layout" : "Saved as off"
                        checked: root.selectedOutput ? root.selectedOutput.enabled !== false : false
                        enabled: root.managedChecked && !!root.selectedOutput && !root.editPending
                          && (checked ? Model.enabledOutputCount(root.draftProfile) > 1 : true)
                        opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity
                        hasCursor: root.inspectorHasCursor(0)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        onClicked: root.editOutput({ enabled: !checked })
                      }

                      PanelActionButton {
                        id: enabledResetAction
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        visible: root.outputFieldChanged("enabled")
                        enabled: displayEnabledToggle.enabled
                        iconText: "󰑐"
                        tooltipText: root.outputFieldResetTooltip("enabled state")
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        focusable: true
                        onClicked: root.resetOutputField("enabled")
                      }
                    }

                    Grid {
                      width: parent.width
                      columns: 2
                      spacing: Style.space(8)
                      enabled: root.managedChecked
                      opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity
                      readonly property real cellWidth: (width - spacing) / 2

                      PanelDropdown {
                        id: modeDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "MODE"
                        options: Model.modeOptions(root.editorDocument.displays, root.selectedOutputKey)
                        value: root.selectedOutput ? Model.outputMode(root.selectedOutput) : ""
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(1)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("mode")
                        resetTooltip: root.outputFieldResetTooltip("display mode")
                        onChanged: function(value) { root.editOutput({ mode: value }) }
                        onResetRequested: root.resetOutputField("mode")
                      }

                      PanelDropdown {
                        id: scaleDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "SCALE"
                        options: Model.scaleOptions(root.editorDocument.displays, root.selectedOutputKey,
                          root.selectedOutput ? root.selectedOutput.scale : 1)
                        value: root.selectedOutput ? Model.formatScale(root.selectedOutput.scale) : "1"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(2)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("scale")
                        resetTooltip: root.outputFieldResetTooltip("display scale")
                        onChanged: function(value) { root.editOutput({ scale: Number(value) }) }
                        onResetRequested: root.resetOutputField("scale")
                      }

                      PanelDropdown {
                        id: vrrDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "VRR"
                        options: root.vrrOptions
                        value: root.selectedOutput ? String(root.selectedOutput.vrr || 0) : "0"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(5)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("vrr")
                        resetTooltip: root.outputFieldResetTooltip("VRR mode")
                        onChanged: function(value) { root.editOutput({ vrr: Number(value) }) }
                        onResetRequested: root.resetOutputField("vrr")
                      }

                      PanelDropdown {
                        id: rotationDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "ROTATION"
                        options: root.transformOptions
                        value: root.selectedOutput ? String(root.selectedOutput.transform || 0) : "0"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(6)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("transform")
                        resetTooltip: root.outputFieldResetTooltip("rotation")
                        onChanged: function(value) { root.editOutput({ transform: Number(value) }) }
                        onResetRequested: root.resetOutputField("transform")
                      }

                      Item {
                        width: parent.cellWidth
                        height: positionXField.height

                        NumberStepper {
                          id: positionXField
                          anchors.left: parent.left
                          anchors.right: positionXResetAction.visible ? positionXResetAction.left : parent.right
                          anchors.rightMargin: positionXResetAction.visible ? Style.spacing.xxs : 0
                          fieldWidth: width
                          label: "POSITION X"
                          from: -20000
                          to: 20000
                          value: root.selectedOutput ? Number(root.selectedOutput.x || 0) : 0
                          enabled: !!root.selectedOutput && !root.editPending
                          hasCursor: root.inspectorHasCursor(7)
                          foreground: root.foreground
                          fontFamily: root.fontFamily
                          onModified: function(value) {
                            root.editOutput({ x: value })
                            Qt.callLater(function() { keyCatcher.forceActiveFocus() })
                          }
                        }

                        PanelActionButton {
                          id: positionXResetAction
                          anchors.right: parent.right
                          anchors.bottom: parent.bottom
                          visible: root.outputFieldChanged("x")
                          enabled: !!root.selectedOutput && !root.editPending
                          iconText: "󰑐"
                          tooltipText: root.outputFieldResetTooltip("horizontal position")
                          foreground: root.foreground
                          fontFamily: root.fontFamily
                          focusable: true
                          onClicked: root.resetOutputField("x")
                        }
                      }

                      Item {
                        width: parent.cellWidth
                        height: positionYField.height

                        NumberStepper {
                          id: positionYField
                          anchors.left: parent.left
                          anchors.right: positionYResetAction.visible ? positionYResetAction.left : parent.right
                          anchors.rightMargin: positionYResetAction.visible ? Style.spacing.xxs : 0
                          fieldWidth: width
                          label: "POSITION Y"
                          from: -20000
                          to: 20000
                          value: root.selectedOutput ? Number(root.selectedOutput.y || 0) : 0
                          enabled: !!root.selectedOutput && !root.editPending
                          hasCursor: root.inspectorHasCursor(8)
                          foreground: root.foreground
                          fontFamily: root.fontFamily
                          onModified: function(value) {
                            root.editOutput({ y: value })
                            Qt.callLater(function() { keyCatcher.forceActiveFocus() })
                          }
                        }

                        PanelActionButton {
                          id: positionYResetAction
                          anchors.right: parent.right
                          anchors.bottom: parent.bottom
                          visible: root.outputFieldChanged("y")
                          enabled: !!root.selectedOutput && !root.editPending
                          iconText: "󰑐"
                          tooltipText: root.outputFieldResetTooltip("vertical position")
                          foreground: root.foreground
                          fontFamily: root.fontFamily
                          focusable: true
                          onClicked: root.resetOutputField("y")
                        }
                      }
                    }

                    PanelDropdown {
                      id: mirrorDropdown
                      popupParent: keyCatcher
                      ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                      width: parent.width
                      label: "MIRROR"
                      options: Model.mirrorOptions(root.draftProfile, root.selectedOutputKey)
                      value: root.selectedOutput ? String(root.selectedOutput.mirror_of || "") : ""
                      enabled: root.managedChecked && !!root.selectedOutput && !root.editPending
                      hasCursor: root.inspectorHasCursor(9)
                      opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity
                      foreground: root.foreground
                      fontFamily: root.fontFamily
                      resetVisible: root.outputFieldChanged("mirror_of")
                      resetTooltip: root.outputFieldResetTooltip("mirror target")
                      onChanged: function(value) { root.editOutput({ mirror_of: value }) }
                      onResetRequested: root.resetOutputField("mirror_of")
                    }
                  }

                  Column {
                    id: colorControls
                    visible: root.inspectorPage === "color"
                    width: parent.width
                    spacing: Style.space(8)
                    enabled: root.managedChecked
                    opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

                    Grid {
                      width: parent.width
                      columns: 2
                      spacing: Style.space(7)
                      readonly property real cellWidth: (width - spacing) / 2

                      PanelDropdown {
                        id: bitdepthDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "COLOR DEPTH (BPC)"
                        tooltipText: "Bits per color component."
                        options: root.bitdepthOptions
                        value: root.selectedOutput ? String(root.selectedOutput.bitdepth || 8) : "8"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(3)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("bitdepth")
                        resetTooltip: root.outputFieldResetTooltip("color depth")
                        onChanged: function(value) { root.editOutput({ bitdepth: Number(value) }) }
                        onResetRequested: root.resetOutputField("bitdepth")
                      }

                      PanelDropdown {
                        id: colorManagementDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "COLOR SPACE / EOTF"
                        tooltipText: "Color space and electro-optical transfer function."
                        options: root.colorManagementOptions
                        value: root.selectedOutput && String(root.selectedOutput.cm || "") !== ""
                          ? String(root.selectedOutput.cm) : "srgb"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(4)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("cm")
                        resetTooltip: root.outputFieldResetTooltip("color space and EOTF")
                        onChanged: function(value) { root.editOutput({ cm: value }) }
                        onResetRequested: root.resetOutputField("cm")
                      }

                      DecimalField {
                        id: sdrBrightnessField
                        width: parent.cellWidth
                        label: "SDR LUMINANCE SCALE"
                        value: root.selectedOutput ? Number(root.selectedOutput.sdr_brightness || 1) : 1
                        decimals: 2
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(10)
                        resetVisible: root.outputFieldChanged("sdr_brightness")
                        resetTooltip: root.outputFieldResetTooltip("SDR luminance scale")
                        onModified: function(value) { root.editOutput({ sdr_brightness: value }) }
                        onResetRequested: root.resetOutputField("sdr_brightness")
                      }

                      DecimalField {
                        id: sdrSaturationField
                        width: parent.cellWidth
                        label: "SDR SATURATION SCALE"
                        value: root.selectedOutput ? Number(root.selectedOutput.sdr_saturation || 1) : 1
                        decimals: 2
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(11)
                        resetVisible: root.outputFieldChanged("sdr_saturation")
                        resetTooltip: root.outputFieldResetTooltip("SDR saturation scale")
                        onModified: function(value) { root.editOutput({ sdr_saturation: value }) }
                        onResetRequested: root.resetOutputField("sdr_saturation")
                      }

                      DecimalField {
                        id: sdrMinLuminanceField
                        width: parent.cellWidth
                        label: "SDR BLACK LEVEL (cd/m²)"
                        value: root.selectedOutput ? Number(root.selectedOutput.sdr_min_luminance || 0) : 0
                        decimals: 3
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(12)
                        resetVisible: root.outputFieldChanged("sdr_min_luminance")
                        resetTooltip: root.outputFieldResetTooltip("SDR black level")
                        onModified: function(value) { root.editOutput({ sdr_min_luminance: value }) }
                        onResetRequested: root.resetOutputField("sdr_min_luminance")
                      }

                      DecimalField {
                        id: sdrMaxLuminanceField
                        width: parent.cellWidth
                        label: "SDR WHITE LEVEL (cd/m²)"
                        value: root.selectedOutput ? Number(root.selectedOutput.sdr_max_luminance || 0) : 0
                        decimals: 0
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(13)
                        resetVisible: root.outputFieldChanged("sdr_max_luminance")
                        resetTooltip: root.outputFieldResetTooltip("SDR white level")
                        onModified: function(value) { root.editOutput({ sdr_max_luminance: Math.round(value) }) }
                        onResetRequested: root.resetOutputField("sdr_max_luminance")
                      }

                      PanelDropdown {
                        id: sdrCurveDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "SDR EOTF"
                        tooltipText: "SDR electro-optical transfer function."
                        options: [
                          { value: "default", label: "Default" },
                          { value: "gamma22", label: "Gamma 2.2" },
                          { value: "srgb", label: "sRGB" }
                        ]
                        value: root.selectedOutput && String(root.selectedOutput.sdr_eotf || "") !== ""
                          ? String(root.selectedOutput.sdr_eotf) : "default"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(14)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("sdr_eotf")
                        resetTooltip: root.outputFieldResetTooltip("SDR EOTF")
                        onChanged: function(value) { root.editOutput({ sdr_eotf: value }) }
                        onResetRequested: root.resetOutputField("sdr_eotf")
                      }

                      DecimalField {
                        id: minLuminanceField
                        width: parent.cellWidth
                        label: "DISPLAY BLACK (cd/m²)"
                        tooltipText: "All display luminance values at 0: use EDID."
                        value: root.selectedOutput ? Number(root.selectedOutput.min_luminance || 0) : 0
                        decimals: 3
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(15)
                        resetVisible: root.outputFieldChanged("min_luminance")
                        resetTooltip: root.outputFieldResetTooltip("display black level")
                        onModified: function(value) { root.editOutput({ min_luminance: value }) }
                        onResetRequested: root.resetOutputField("min_luminance")
                      }

                      DecimalField {
                        id: maxLuminanceField
                        width: parent.cellWidth
                        label: "DISPLAY PEAK (cd/m²)"
                        tooltipText: "All display luminance values at 0: use EDID."
                        value: root.selectedOutput ? Number(root.selectedOutput.max_luminance || 0) : 0
                        decimals: 0
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(16)
                        resetVisible: root.outputFieldChanged("max_luminance")
                        resetTooltip: root.outputFieldResetTooltip("display peak luminance")
                        onModified: function(value) { root.editOutput({ max_luminance: Math.round(value) }) }
                        onResetRequested: root.resetOutputField("max_luminance")
                      }

                      DecimalField {
                        id: maxAvgLuminanceField
                        width: parent.cellWidth
                        label: "MAX FRAME-AVERAGE (cd/m²)"
                        tooltipText: "All display luminance values at 0: use EDID."
                        value: root.selectedOutput ? Number(root.selectedOutput.max_avg_luminance || 0) : 0
                        decimals: 0
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(17)
                        resetVisible: root.outputFieldChanged("max_avg_luminance")
                        resetTooltip: root.outputFieldResetTooltip("maximum frame-average luminance")
                        onModified: function(value) { root.editOutput({ max_avg_luminance: Math.round(value) }) }
                        onResetRequested: root.resetOutputField("max_avg_luminance")
                      }

                      PanelDropdown {
                        id: forceWideDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "WCG CAPABILITY"
                        tooltipText: "Override wide color gamut support."
                        options: root.triStateOptions
                        value: root.selectedOutput ? String(root.selectedOutput.supports_wide_color || 0) : "0"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(18)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("supports_wide_color")
                        resetTooltip: root.outputFieldResetTooltip("wide-color-gamut capability")
                        onChanged: function(value) { root.editOutput({ supports_wide_color: Number(value) }) }
                        onResetRequested: root.resetOutputField("supports_wide_color")
                      }

                      PanelDropdown {
                        id: forceHdrDropdown
                        popupParent: keyCatcher
                        ownerOpen: root.opened && root.expanded && !inspectorViewport.moving
                        width: parent.cellWidth
                        label: "HDR CAPABILITY"
                        options: root.triStateOptions
                        value: root.selectedOutput ? String(root.selectedOutput.supports_hdr || 0) : "0"
                        enabled: !!root.selectedOutput && !root.editPending
                        hasCursor: root.inspectorHasCursor(19)
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        resetVisible: root.outputFieldChanged("supports_hdr")
                        resetTooltip: root.outputFieldResetTooltip("HDR capability")
                        onChanged: function(value) { root.editOutput({ supports_hdr: Number(value) }) }
                        onResetRequested: root.resetOutputField("supports_hdr")
                      }
                    }

                    Column {
                      width: parent.width
                      spacing: Style.space(4)

                      PanelSectionHeader {
                        text: "ICC DEVICE PROFILE"
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                      }

                      Item {
                        width: parent.width
                        height: iccProfileInput.height

                        TextField {
                          id: iccProfileInput
                          anchors.left: parent.left
                          anchors.right: iccResetAction.visible ? iccResetAction.left : parent.right
                          anchors.rightMargin: iccResetAction.visible ? Style.spacing.xxs : 0
                          text: root.selectedOutput ? String(root.selectedOutput.icc || "") : ""
                          placeholderText: "None — enter an absolute ICC profile path"
                          enabled: !!root.selectedOutput && !root.editPending
                          hasCursor: root.inspectorHasCursor(20)
                          foreground: root.foreground
                          onEditingFinished: {
                            var returnToKeyboard = activeFocus
                            if (text !== String((root.selectedOutput || {}).icc || ""))
                              root.editOutput({ icc: text })
                            if (returnToKeyboard)
                              Qt.callLater(function() { keyCatcher.forceActiveFocus() })
                          }
                        }

                        PanelActionButton {
                          id: iccResetAction
                          anchors.right: parent.right
                          anchors.verticalCenter: parent.verticalCenter
                          visible: root.outputFieldChanged("icc")
                          enabled: !!root.selectedOutput && !root.editPending
                          iconText: "󰑐"
                          tooltipText: root.outputFieldResetTooltip("ICC device profile")
                          foreground: root.foreground
                          fontFamily: root.fontFamily
                          fontSize: Style.font.body
                          size: Math.min(iccProfileInput.height, Style.space(24))
                          focusable: true
                          onClicked: root.resetOutputField("icc")
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          Item {
            visible: root.activePage === "profiles"
            anchors.fill: parent
            opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

            EditorPane {
              id: profileListPane
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Math.round(parent.width * 0.34)
              title: "Saved Profiles"
              meta: root.savedProfiles.length + " saved"
              active: true
              foreground: root.foreground
              dim: root.dim
              accent: Color.accent
              fontFamily: root.fontFamily

              Column {
                anchors.fill: parent
                spacing: Style.space(6)

                Toggle {
                  width: parent.width
                  label: "Automatically use the best profile"
                  description: {
                    if (root.profileModePending) return "Updating profile selection mode…"
                    return "Matches your connected displays to your saved profiles"
                  }
                  checked: root.profileAutomatic
                  enabled: root.managedChecked && !root.profileModePending
                    && root.previewTransaction === "" && !root.previewPending
                    && (!root.profileAutomatic || root.activeProfile !== "")
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.setProfileAutomatic(!checked)
                }

                PanelSeparator { foreground: root.foreground }

                Row {
                  x: Style.space(7)
                  width: parent.width - Style.space(46)
                  height: Style.space(22)
                  spacing: Style.space(8)

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width - Style.space(58) - parent.spacing
                    text: "PROFILE"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: Style.space(58)
                    text: "MATCH"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    horizontalAlignment: Text.AlignRight
                  }
                }

                Repeater {
                  id: profileEntries
                  model: root.document && root.document.profiles instanceof Array ? root.document.profiles : []

                  BorderSurface {
                    id: savedEntry
                    function openActions() { profileActions.openAt(profileMenuButton) }
                    required property var modelData
                    width: parent.width
                    height: Style.space(32)
                    readonly property bool selected: String(modelData.name || "") === root.selectedSavedProfileName
                    readonly property bool current: Model.profileIsCurrent(modelData, root.document)
                    color: selected
                      ? Style.selectedFillFor(root.foreground, Color.accent)
                      : "transparent"
                    borderSpec: selected ? Border.controlSpec("selected", root.foreground, Color.accent) : Border.none()
                    radius: Style.cornerRadius

                    Row {
                      anchors.fill: parent
                      anchors.leftMargin: Style.space(7)
                      anchors.rightMargin: Style.space(39)
                      spacing: Style.space(8)

                      Text {
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - profileMatchText.width - Style.space(8)
                        text: String(modelData.name || "Profile")
                        color: savedEntry.current || savedEntry.selected ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: savedEntry.current
                        elide: Text.ElideRight
                      }

                      Text {
                        textFormat: Text.PlainText
                        id: profileMatchText
                        width: Style.space(58)
                        horizontalAlignment: Text.AlignRight
                        anchors.verticalCenter: parent.verticalCenter
                        text: Number(modelData.match_score || 0) > 0 ? String(modelData.match_score) : "—"
                        color: modelData.recommended ? Color.accent : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: modelData.recommended
                      }
                    }

                    MouseArea {
                      id: profileRowMouse
                      anchors.fill: parent
                      anchors.rightMargin: Style.space(36)
                      hoverEnabled: true
                      acceptedButtons: Qt.LeftButton | Qt.RightButton
                      enabled: String(parent.modelData.name || "") !== ""
                      cursorShape: Qt.PointingHandCursor
                      onClicked: function(mouse) {
                        var selected = String(parent.modelData.name || "")
                        root.selectedSavedProfileName = selected
                        if (mouse.button === Qt.RightButton) profileActions.openAt(profileRowMouse, mouse.x, mouse.y)
                      }
                    }
                    Button {
                      id: profileMenuButton
                      anchors.right: parent.right
                      anchors.verticalCenter: parent.verticalCenter
                      text: "⋮"
                      tooltipText: "Profile actions"
                      focusable: true
                      onClicked: {
                        root.selectedSavedProfileName = String(savedEntry.modelData.name || "")
                        profileActions.openAt(profileMenuButton)
                      }
                    }
                  }
                }
              }
            }

            Column {
              anchors.left: profileListPane.right
              anchors.leftMargin: Style.space(10)
              anchors.right: parent.right
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              spacing: Style.space(10)

              EditorPane {
                id: profileDetailsPane
                width: parent.width
                height: Math.min(parent.height - Style.space(180),
                  Math.max(Style.space(190), profileDetailsContent.implicitHeight + Style.space(38)))
                title: "Profile Details"
                meta: root.selectedSavedProfileCurrent ? "Active" : ""
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily

                Flickable {
                  anchors.fill: parent
                  contentHeight: profileDetailsContent.implicitHeight
                  clip: true
                  boundsBehavior: Flickable.StopAtBounds
                  Column {
                  id: profileDetailsContent
                  width: parent.width
                  spacing: Style.space(4)

                  InfoRow {
                    label: "Name"
                    value: root.selectedSavedProfile ? String(root.selectedSavedProfile.name || "—") : "—"
                    valueBold: true
                  }
                  InfoRow {
                    label: "Updated"
                    value: root.selectedSavedProfile ? Model.profileUpdatedLabel(root.selectedSavedProfile.updated_at) : "—"
                  }
                  InfoRow {
                    label: "Match"
                    value: root.selectedSavedSummary
                      ? Model.profileMatchLabel(root.selectedSavedSummary, root.selectedSavedProfileCurrent) : "—"
                    valueAccent: !!root.selectedSavedSummary
                      && (root.selectedSavedProfileCurrent || root.selectedSavedSummary.recommended)
                  }

                  Repeater {
                    model: root.selectedSavedMatchReasons

                    InfoRow {
                      required property var modelData
                      label: ""
                      value: String(modelData.value || "")
                    }
                  }

                  InfoRow {
                    label: "Displays"
                    value: root.selectedSavedSummary
                      ? Number(root.selectedSavedSummary.output_count || 0) + " saved · "
                        + Number(root.selectedSavedSummary.connected_outputs || 0) + " connected"
                      : "—"
                  }

                  Repeater {
                    model: root.selectedSavedHiddenRows

                    InfoRow {
                      required property var modelData
                      label: String(modelData.label || "")
                      value: String(modelData.value || "")
                    }
                  }

                  Repeater {
                    model: root.selectedSavedWorkspaceRows

                    ProfileWorkspaceInfoRow {
                      required property var modelData
                      required property int index
                      label: index === 0 ? "Workspaces" : ""
                      displayName: String(modelData.name || "Display")
                      workspaces: String(modelData.workspaces || "—")
                    }
                  }

                  InfoRow {
                    visible: root.selectedSavedWorkspaceRows.length === 0
                    label: "Workspaces"
                    value: "(not managed)"
                  }

                  Column {
                    width: parent.width
                    spacing: Style.space(4)
                    Text {
                      text: "Post-apply command"
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                    }
                    Button {
                      width: parent.width
                      text: ""
                      implicitHeight: commandLabel.implicitHeight + verticalPadding * 2 + Style.normalBorderWidth * 2
                      Text {
                        id: commandLabel
                        anchors.fill: parent
                        anchors.leftMargin: parent.horizontalPadding
                        anchors.rightMargin: parent.horizontalPadding
                        text: root.selectedSavedProfile && String(root.selectedSavedProfile.exec || "").trim() !== ""
                          ? String(root.selectedSavedProfile.exec) : "Not set"
                        textFormat: Text.PlainText
                        elide: Text.ElideRight
                        verticalAlignment: Text.AlignVCenter
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.body
                      }
                      bordered: true
                      focusable: true
                      leftAlign: true
                      enabled: root.managedChecked && !!root.selectedSavedProfile
                        && !root.editPending && !root.previewPending && root.previewTransaction === ""
                      foreground: root.foreground
                      fontFamily: root.fontFamily
                      tooltipText: "Edit post-apply command"
                      onClicked: root.beginExecEdit()
                    }
                  }

                  }
                }
              }

              EditorPane {
                width: parent.width
                height: parent.height - profileDetailsPane.height - parent.spacing
                title: "Monitor Layout"
                meta: root.selectedSavedProfileName
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily

                DisplayCanvas {
                  anchors.fill: parent
                  profile: root.selectedSavedProfile || ({ outputs: [] })
                  editorDisplays: root.editorDocument.displays
                  workspacePlan: root.selectedSavedWorkspacePlan
                  emphasis: "profile"
                  selectedKey: ""
                  interactive: false
                  detailed: true
                  framed: false
                  markDisconnected: true
                  foreground: root.foreground
                  dim: root.dim
                  accent: Color.accent
                  fontFamily: root.fontFamily
                }
              }
            }
          }

          Item {
            visible: root.activePage === "workspaces"
            anchors.fill: parent
            enabled: root.managedChecked
            opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

            EditorPane {
              id: workspaceSettingsPane
              anchors.left: parent.left
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              width: Math.round(parent.width * 0.34)
              title: "Workspace Planner"
              active: true
              foreground: root.foreground
              dim: root.dim
              accent: Color.accent
              fontFamily: root.fontFamily

              Column {
                anchors.fill: parent
                spacing: Style.space(12)

                Toggle {
                  id: workspaceEnabledToggle
                  width: parent.width
                  label: "Enabled"
                  description: checked ? "Place workspaces with this profile" : "Leave placement unchanged"
                  checked: !!((root.draftProfile || {}).workspaces || {}).enabled
                  enabled: root.editorReady && !root.editPending
                  hasCursor: root.expanded && root.activePage === "workspaces"
                    && root.workspaceKeyboardIndex === 0
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.editWorkspaces({ enabled: !checked })
                }

                PanelDropdown {
                  id: workspaceStrategyDropdown
                  popupParent: keyCatcher
                  ownerOpen: root.opened && root.expanded
                  width: parent.width
                  label: "STRATEGY"
                  options: [
                    { value: "manual", label: "Manual" },
                    { value: "sequential", label: "Sequential" },
                    { value: "interleave", label: "Interleaved" }
                  ]
                  value: String(((root.draftProfile || {}).workspaces || {}).strategy || "manual")
                  enabled: root.editorReady && !root.editPending
                  hasCursor: root.expanded && root.activePage === "workspaces"
                    && root.workspaceKeyboardIndex === 1
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onChanged: function(value) { root.changeWorkspaceStrategy(value) }
                }

                Row {
                  width: parent.width
                  spacing: Style.space(10)

                  NumberStepper {
                    id: workspaceCountField
                    width: root.workspaceGroupSizeApplicable
                      ? (parent.width - parent.spacing) / 2 : parent.width
                    fieldWidth: width
                    label: "WORKSPACES"
                    from: 1
                    to: root.workspaceValueMaximum
                    value: String(((root.draftProfile || {}).workspaces || {}).strategy || "") === "manual"
                      ? Model.manualWorkspaceCount((root.draftProfile || {}).workspaces || {})
                      : Number(((root.draftProfile || {}).workspaces || {}).max_workspaces || 9)
                    enabled: !root.editPending
                    hasCursor: root.expanded && root.activePage === "workspaces"
                      && root.workspaceKeyboardIndex === 2
                    foreground: root.foreground
                    fontFamily: root.fontFamily
                    onModified: function(value) {
                      var returnToKeyboard = workspaceCountField.field.activeFocus
                      if (!root.editPending) root.setWorkspaceCount(value)
                      if (returnToKeyboard)
                        Qt.callLater(function() { keyCatcher.forceActiveFocus() })
                    }
                  }

                  NumberStepper {
                    id: workspaceGroupSizeField
                    visible: root.workspaceGroupSizeApplicable
                    width: (parent.width - parent.spacing) / 2
                    fieldWidth: width
                    label: "GROUP SIZE"
                    from: 1
                    to: root.workspaceValueMaximum
                    value: Number(((root.draftProfile || {}).workspaces || {}).group_size || 3)
                    enabled: !root.editPending
                      && String(((root.draftProfile || {}).workspaces || {}).strategy || "") === "sequential"
                    hasCursor: root.expanded && root.activePage === "workspaces"
                      && root.workspaceKeyboardIndex === 3
                    foreground: root.foreground
                    fontFamily: root.fontFamily
                    onModified: function(value) {
                      root.editWorkspaces({ group_size: value })
                      Qt.callLater(function() { keyCatcher.forceActiveFocus() })
                    }
                  }

                }

                PanelDropdown {
                  id: workspacePersistenceDropdown
                  popupParent: keyCatcher
                  ownerOpen: root.opened && root.expanded
                  width: parent.width
                  label: "PERSISTENCE"
                  options: root.editorDocument.workspace_persistence_supported !== true
                    ? [{ value: "unavailable", label: "Requires newer daemon" }]
                    : root.workspaceStrategy === "manual"
                      ? [{ value: "custom", label: "Custom (per rule)" }]
                      : [{ value: "first", label: "First per display" }, { value: "all", label: "All assigned" }]
                  value: root.editorDocument.workspace_persistence_supported !== true ? "unavailable"
                    : root.workspaceStrategy === "manual" ? "custom"
                    : (((root.draftProfile || {}).workspaces || {}).persist_all ? "all" : "first")
                  enabled: root.editorReady && !root.editPending
                    && root.editorDocument.workspace_persistence_supported === true && root.workspaceStrategy !== "manual"
                  hasCursor: root.expanded && root.activePage === "workspaces"
                    && root.workspaceKeyboardIndex === root.workspacePersistenceKeyboardIndex
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onChanged: function(value) { root.editWorkspaces({ persist_all: value === "all" }) }
                }

                PanelSeparator { foreground: root.foreground }

                PanelSectionHeader {
                  text: String(((root.draftProfile || {}).workspaces || {}).strategy || "") === "manual"
                    ? "WORKSPACE → DISPLAY" : "MONITOR ORDER"
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                }

                Repeater {
                  model: String(((root.draftProfile || {}).workspaces || {}).strategy || "") === "manual"
                    ? [] : (((root.draftProfile || {}).workspaces || {}).monitor_order || [])

                  BorderSurface {
                    required property var modelData
                    required property int index
                    width: parent.width
                    height: Style.space(42)
                    readonly property bool hasKeyboardCursor: root.expanded
                      && root.activePage === "workspaces"
                      && root.workspaceKeyboardIndex === root.workspaceListKeyboardStart + index
                    color: hasKeyboardCursor
                      ? Style.selectedFillFor(root.foreground, Color.accent)
                      : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.025)
                    borderSpec: Border.controlSpec(hasKeyboardCursor ? "focus" : "normal",
                      root.foreground, Color.accent)
                    radius: Style.cornerRadius

                    Row {
                      anchors.fill: parent
                      anchors.leftMargin: Style.space(10)
                      anchors.rightMargin: Style.space(6)
                      spacing: Style.space(6)

                      Text {
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - orderLeft.width - orderRight.width - parent.spacing * 2
                        text: (index + 1) + ".  " + Model.outputDisplayLabel(root.draftProfile, String(modelData))
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.body
                        elide: Text.ElideRight
                      }

                      Button {
                        id: orderLeft
                        anchors.verticalCenter: parent.verticalCenter
                        text: "←"
                        bordered: true
                        enabled: index > 0 && !root.editPending
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        onClicked: root.moveWorkspaceMonitor(String(modelData), -1)
                      }

                      Button {
                        id: orderRight
                        anchors.verticalCenter: parent.verticalCenter
                        text: "→"
                        bordered: true
                        enabled: index < (((root.draftProfile || {}).workspaces || {}).monitor_order || []).length - 1
                          && !root.editPending
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        onClicked: root.moveWorkspaceMonitor(String(modelData), 1)
                      }
                    }
                  }
                }

                ListView {
                  id: manualAssignmentList
                  visible: String(((root.draftProfile || {}).workspaces || {}).strategy || "") === "manual"
                  width: parent.width
                  height: visible ? Math.max(Style.space(90), parent.height - y) : 0
                  clip: true
                  spacing: Style.space(6)
                  boundsBehavior: Flickable.StopAtBounds
                  model: visible ? root.manualWorkspaceRows : []
                  currentIndex: root.workspaceKeyboardIndex >= root.workspaceListKeyboardStart
                    ? root.workspaceKeyboardIndex - root.workspaceListKeyboardStart : -1
                  ScrollBar.vertical: ScrollBar {
                    id: manualScrollBar
                    policy: ScrollBar.AsNeeded
                  }

                  delegate: BorderSurface {
                    required property var modelData
                    required property int index
                    width: manualAssignmentList.width - (manualScrollBar.visible
                      ? manualScrollBar.width + Style.space(4) : 0)
                    height: Style.space(42)
                    readonly property bool hasKeyboardCursor: root.expanded
                      && root.activePage === "workspaces"
                      && root.workspaceKeyboardIndex === root.workspaceListKeyboardStart + index
                    color: hasKeyboardCursor
                      ? Style.selectedFillFor(root.foreground, Color.accent)
                      : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.025)
                    borderSpec: Border.controlSpec(hasKeyboardCursor ? "focus" : "normal",
                      root.foreground, Color.accent)
                    radius: Style.cornerRadius

                    Row {
                      anchors.fill: parent
                      anchors.leftMargin: Style.space(10)
                      anchors.rightMargin: Style.space(6)
                      spacing: Style.space(6)

                      Text {
                        id: manualWorkspaceLabel
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: Style.space(82)
                        text: "Workspace " + String(modelData.workspace || "?")
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        elide: Text.ElideRight
                      }

                      Text {
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - manualWorkspaceLabel.width
                          - manualLeft.width - manualRight.width - parent.spacing * 3
                        text: String(modelData.display_name || "Display")
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.body
                        font.bold: root.expanded && root.activePage === "workspaces"
                          && root.workspaceKeyboardIndex === root.workspaceListKeyboardStart + index
                        elide: Text.ElideRight
                      }

                      Button {
                        id: manualLeft
                        anchors.verticalCenter: parent.verticalCenter
                        text: "←"
                        bordered: true
                        enabled: root.manualWorkspaceTargetCount > 1 && !root.editPending
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        onClicked: root.moveManualWorkspace(index, -1)
                      }

                      Button {
                        id: manualRight
                        anchors.verticalCenter: parent.verticalCenter
                        text: "→"
                        bordered: true
                        enabled: root.manualWorkspaceTargetCount > 1 && !root.editPending
                        foreground: root.foreground
                        fontFamily: root.fontFamily
                        onClicked: root.moveManualWorkspace(index, 1)
                      }
                    }
                  }
                }
              }
            }

            Column {
              anchors.left: workspaceSettingsPane.right
              anchors.leftMargin: Style.space(10)
              anchors.right: parent.right
              anchors.top: parent.top
              anchors.bottom: parent.bottom
              spacing: Style.space(10)

              EditorPane {
                width: parent.width
                height: Style.space(145)
                title: "Workspace Plan"
                meta: ((root.draftProfile || {}).workspaces || {}).enabled ? "" : "preview only"
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily

                Column {
                  anchors.fill: parent
                  spacing: Style.space(5)

                  Repeater {
                    model: root.workspaceRows

                    InfoRow {
                      required property var modelData
                      label: String(modelData.name || "Display")
                      value: String(modelData.workspaces || "—")
                      valueAccent: true
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    visible: root.workspaceRows.length === 0
                    text: "No workspace rules configured"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                  }
                }
              }

              EditorPane {
                width: parent.width
                height: parent.height - Style.space(155)
                title: "Monitor Layout"
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily

                DisplayCanvas {
                  anchors.fill: parent
                  profile: root.draftProfile
                  editorDisplays: root.editorDocument.displays
                  workspacePlan: root.workspacePlan
                  emphasis: "workspaces"
                  selectedKey: root.selectedWorkspaceDisplayKey
                  interactive: false
                  detailed: true
                  framed: false
                  foreground: root.foreground
                  dim: root.dim
                  accent: Color.accent
                  fontFamily: root.fontFamily
                }
              }
            }
          }
        }

        Item {
          id: editorFooter
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          readonly property real controlHeight: Math.ceil(Math.max(
            profileNameInput.implicitHeight,
            currentProfileBadge.implicitHeight, activateFooterButton.implicitHeight,
            discardDraftButton.implicitHeight, saveDraftButton.implicitHeight,
            createFooterButton.implicitHeight, automaticFooterButton.implicitHeight,
            reuseFooterButton.implicitHeight))
          height: Math.max(Style.space(58), footerContent.implicitHeight + Style.space(18))
          opacity: root.managedChecked ? 1.0 : root.unmanagedOpacity

          BorderSurface {
            id: profileFooter
            anchors.fill: parent
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.025)
            borderSpec: Border.controlSpec(root.draftDirty || root.creatingProfile ? "selected" : "normal", root.foreground, Color.accent)
            radius: Style.cornerRadius

            Column {
              id: footerContent
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(12)
              anchors.rightMargin: Style.space(12)
              spacing: Style.space(9)

              Row {
                width: parent.width
                height: Math.max(expandedProfileStatus.height, cleanFooterActions.height)
                spacing: Style.space(9)

                ProfileStatus {
                  id: expandedProfileStatus
                  anchors.verticalCenter: parent.verticalCenter
                  width: Math.max(0, parent.width - (cleanFooterActions.width > 0
                    ? cleanFooterActions.width + parent.spacing : 0))
                  title: root.lastError !== ""
                    ? root.lastError
                    : (root.creatingProfile ? "Creating a profile for this setup"
                      : (root.draftDirty ? "Unsaved display changes"
                      : (root.activePage === "profiles"
                        ? (root.selectedSavedProfileCurrent
                          ? "This profile is active"
                          : "Browsing " + root.selectedSavedProfileName)
                        : (root.activePage === "reuse" ? "Use an existing layout" : root.profileStatusTitle))))
                  subtitle: root.editPending ? "Checking layout…"
                    : (root.creatingProfile ? "Name it, arrange the displays, then preview and save."
                    : (root.draftDirty ? "Changes are previewed safely before they can be saved."
                    : (root.activePage === "profiles"
                      ? "Preview, then keep to use this profile until displays change."
                      : (root.activePage === "reuse" ? "Assign the saved roles to the displays on your desk."
                        : root.profileStatusSubtitle))))
                  iconText: root.monitorCount > 1 ? "󰍺" : "󰍹"
                  foreground: root.lastError !== "" ? root.urgent : root.foreground
                  dim: root.dim
                  fontFamily: root.fontFamily
                }

                Row {
                  id: cleanFooterActions
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.space(9)

                  Button {
                    id: createFooterButton
                    height: editorFooter.controlHeight
                    visible: root.newSetupAvailable && !root.draftDirty
                      && !root.creatingProfile && root.activePage !== "profiles" && root.activePage !== "reuse"
                    text: "Create profile"
                    selected: true
                    bordered: true
                    enabled: root.managedChecked && root.editorReady && !root.editPending
                    foreground: root.foreground
                    fontFamily: root.fontFamily
                    onClicked: root.beginCreateProfile()
                  }

                  Button {
                    id: automaticFooterButton
                    height: editorFooter.controlHeight
                    visible: !root.profileAutomatic && !root.draftDirty && !root.creatingProfile
                      && root.activePage !== "profiles" && root.activePage !== "reuse" && !root.daemonPreview
                    text: root.profileModePending ? "Resuming…" : "Resume automatic matching"
                    bordered: true
                    enabled: root.managedChecked && !root.profileModePending && !root.previewPending
                    foreground: root.foreground
                    fontFamily: root.fontFamily
                    onClicked: root.setProfileAutomatic(true)
                  }
                }
              }

              Flow {
                id: footerActions
                width: parent.width
                spacing: Style.space(9)
                visible: root.draftDirty || root.creatingProfile || root.activePage === "profiles" || root.activePage === "reuse"

                TextField {
                  id: profileNameInput
                  visible: root.creatingProfile || (root.draftDirty && root.sourceProfile === "")
                  height: editorFooter.controlHeight
                  width: Math.min(Style.space(190), parent.width)
                  text: root.saveName
                  placeholderText: root.creatingProfile ? "Name this display setup" : "New profile name"
                  foreground: root.foreground
                  enabled: root.managedChecked
                  onTextEdited: root.saveName = text
                  onAccepted: root.previewDraft()
                }

                BorderSurface {
                  id: currentProfileBadge
                  height: editorFooter.controlHeight
                  visible: root.activePage === "profiles"
                    && root.selectedSavedProfileCurrent
                  implicitWidth: currentProfileBadgeRow.implicitWidth + contentLeftInset + contentRightInset
                  implicitHeight: currentProfileBadgeRow.implicitHeight + contentTopInset + contentBottomInset
                  leftPadding: Style.spacing.controlPaddingX
                  rightPadding: Style.spacing.controlPaddingX
                  topPadding: Style.spacing.controlPaddingY
                  bottomPadding: Style.spacing.controlPaddingY
                  color: Style.selectedFillFor(root.foreground, Color.accent)
                  borderSpec: Border.controlSpec("selected", root.foreground, Color.accent)
                  radius: Style.cornerRadius

                  Row {
                    id: currentProfileBadgeRow
                    anchors.centerIn: parent
                    spacing: Style.spacing.controlGap

                    Text {
                      textFormat: Text.PlainText
                      text: "󰄬"
                      color: Style.selectedStateColor(root.foreground, Color.accent)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.icon
                      anchors.verticalCenter: parent.verticalCenter
                    }

                    Text {
                      textFormat: Text.PlainText
                      text: "Current profile"
                      color: Style.selectedStateColor(root.foreground, Color.accent)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      font.bold: true
                      anchors.verticalCenter: parent.verticalCenter
                    }
                  }
                }

                Button {
                  id: activateFooterButton
                  height: editorFooter.controlHeight
                  visible: root.activePage === "profiles"
                    && !root.selectedSavedProfileCurrent
                  text: "Use this profile"
                  selected: enabled
                  bordered: true
                  enabled: !root.draftDirty && !!root.selectedSavedProfile
                    && root.managedChecked
                    && root.previewTransaction === "" && !root.previewPending
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.activateSelectedSavedProfile()
                }

                Button {
                  id: reuseFooterButton
                  height: editorFooter.controlHeight
                  visible: root.activePage === "profiles" || root.activePage === "reuse"
                  text: root.activePage === "reuse" ? "Back to profiles" : "Reuse layout…"
                  focusable: true
                  bordered: true
                  enabled: !root.reusePending && (root.activePage === "reuse"
                    || (root.backendConnected && root.managedChecked && root.editorReady && !root.editorLoading
                      && !root.draftDirty && !root.creatingProfile && !root.editPending
                      && !!root.selectedSavedProfile && !root.identifyBlockedByPreview))
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: {
                    if (root.activePage === "reuse") root.leaveLayoutReuse()
                    else root.openLayoutReuse(root.selectedSavedProfileName)
                  }
                }

                Button {
                  id: discardDraftButton
                  height: editorFooter.controlHeight
                  visible: root.draftDirty || root.creatingProfile
                  text: "Discard"
                  bordered: true
                  enabled: !root.editorLoading && !root.editPending
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.requestEditorState()
                }

                Button {
                  id: saveDraftButton
                  height: editorFooter.controlHeight
                  visible: root.draftDirty || root.creatingProfile
                  text: "Preview & save"
                  selected: true
                  bordered: true
                  enabled: root.managedChecked && !root.editPending && !root.previewPending
                    && (root.sourceProfile !== "" || String(root.saveName || "").trim() !== "")
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.previewDraft()
                }
              }
            }
          }

        }
      }

      KeyboardHelp {
        anchors.fill: parent
        z: 100
        visible: root.keyboardHelpOpen
        page: root.activePage
        foreground: root.foreground
        background: root.bar ? root.bar.background : Color.background
        accent: Color.accent
        fontFamily: root.fontFamily
        onCloseRequested: root.keyboardHelpOpen = false
      }

      Item {
        anchors.fill: parent
        z: 110
        visible: root.execEditing

        Rectangle {
          anchors.fill: parent
          color: Qt.rgba(0, 0, 0, 0.58)

          MouseArea {
            anchors.fill: parent
            onClicked: root.execEditing = false
          }
        }

        BorderSurface {
          anchors.centerIn: parent
          width: Math.min(parent.width - Style.space(48), Style.space(660))
          height: execContent.implicitHeight + Style.space(30)
          color: root.bar ? root.bar.background : Color.background
          borderSpec: Border.controlSpec("focus", root.foreground, Color.accent)
          radius: Style.cornerRadius

          Column {
            id: execContent
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Style.space(18)
            anchors.rightMargin: Style.space(18)
            spacing: Style.space(10)

            Text {
              textFormat: Text.PlainText
              text: "Post-apply command for " + root.selectedSavedProfileName
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }

            TextField {
              id: profileExecInput
              width: parent.width
              text: root.execDraft
              placeholderText: "/path/to/script.sh"
              foreground: root.foreground
              onTextEdited: root.execDraft = text
              onAccepted: root.commitExecEdit()
              Keys.onEscapePressed: function(event) {
                root.execEditing = false
                Qt.callLater(function() { keyCatcher.forceActiveFocus() })
                event.accepted = true
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: "Enter saves. Leave empty to clear. Esc discards."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }
      }
    }
  }

  ProfileActionsMenu {
    id: profileActions
    parent: keyCatcher
    preferredWidth: Style.space(280)
    rowHeight: Style.space(36)
    foreground: root.foreground
    backgroundColor: root.bar ? root.bar.background : Color.background
    accent: Color.accent
    fontFamily: root.fontFamily
    fontSize: Style.font.body
    property bool available: !root.draftDirty && !root.editPending && !root.previewPending && root.previewTransaction === ""
    actions: [
      { id: "use", label: "Use this profile", enabled: available && root.managedChecked },
      { id: "edit", label: "Edit layout", enabled: available },
      { id: "reuse", label: "Reuse layout…", enabled: available && root.managedChecked
          && root.backendConnected && root.editorReady && !root.editorLoading && !root.creatingProfile
          && !root.reusePending && !root.identifyBlockedByPreview },
      { id: "exec", label: "Edit post-apply command…", enabled: available },
      { id: "delete", label: "Delete…", enabled: available }
    ]
    onVisibleChanged: if (visible) targetName = root.selectedSavedProfileName
    onClosed: Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    onChosen: function(action) {
      root.selectedSavedProfileName = targetName
      if (action === "use") root.activateSelectedSavedProfile()
      else if (action === "edit") root.loadSelectedSavedProfile()
      else if (action === "reuse") root.openLayoutReuse(targetName)
      else if (action === "exec") root.beginExecEdit()
      else if (action === "delete") root.deleteSelectedSavedProfile()
    }
  }

  FocusScope {
    id: deleteConfirmation
    parent: keyCatcher
    anchors.fill: parent
    z: 400
    visible: false
    function open() { visible = true; cancelDeleteButton.forceActiveFocus() }
    function close() {
      visible = false
      root.deleteProfileName = ""
      Qt.callLater(function() { keyCatcher.forceActiveFocus() })
    }
    Keys.onEscapePressed: close()
    MouseArea { anchors.fill: parent; onClicked: deleteConfirmation.close() }
    BorderSurface {
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(24), Style.space(440))
      height: deleteContent.implicitHeight + Style.space(32)
      color: root.bar ? root.bar.background : Color.background
      borderSpec: Border.controlSpec("focus", root.foreground, Color.accent)
      radius: Style.cornerRadius
      MouseArea { anchors.fill: parent }
      Column {
        id: deleteContent
        x: Style.space(16)
        y: Style.space(16)
        width: parent.width - Style.space(32)
        spacing: Style.space(14)
        Text {
          text: "Delete profile?"
          textFormat: Text.PlainText
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          font.bold: true
        }
        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: "Delete “" + root.deleteProfileName + "”? Your live layout will not change."
          wrapMode: Text.Wrap
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
        }
        Row {
          anchors.right: parent.right
          spacing: Style.space(8)
          Button {
            id: cancelDeleteButton
            KeyNavigation.tab: confirmDeleteButton
            KeyNavigation.backtab: confirmDeleteButton
            text: "Cancel"
            bordered: true
            focusable: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: deleteConfirmation.close()
          }
          Button {
            id: confirmDeleteButton
            KeyNavigation.tab: cancelDeleteButton
            KeyNavigation.backtab: cancelDeleteButton
            text: "Delete profile"
            bordered: true
            focusable: true
            foreground: root.urgent
            fontFamily: root.fontFamily
            onClicked: {
              root.confirmProfileDelete()
              deleteConfirmation.close()
            }
          }
        }
      }
    }
  }

  Shortcut {
    sequence: "Shift+F10"
    enabled: root.opened && root.expanded && root.activePage === "profiles"
      && !keyCatcher.blocked && !!root.selectedSavedProfile
    onActivated: {
      for (var i = 0; i < profileEntries.count; i++) {
        var row = profileEntries.itemAt(i)
        if (row && row.selected) { row.openActions(); break }
      }
    }
  }

  component InfoRow: Item {
    id: infoRow
    property string label: ""
    property string value: ""
    property bool valueAccent: false
    property bool valueBold: false

    width: parent ? parent.width : 0
    implicitHeight: Math.max(infoLabel.implicitHeight, infoValue.implicitHeight)

    Text {
      textFormat: Text.PlainText
      id: infoLabel
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: Math.min(parent.width * 0.34, Style.space(105))
      text: infoRow.label
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      id: infoValue
      anchors.left: infoLabel.right
      anchors.leftMargin: Style.space(8)
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: infoRow.value
      color: infoRow.valueAccent ? Color.accent : root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.bold: infoRow.valueAccent || infoRow.valueBold
      elide: Text.ElideRight
    }
  }

  component DecimalField: Column {
    id: decimalField
    property string label: ""
    property string tooltipText: ""
    property real value: 0
    property int decimals: 2
    property bool hasCursor: false
    property bool resetVisible: false
    property string resetTooltip: "Reset to loaded profile value"
    property alias input: decimalInput
    signal modified(real value)
    signal resetRequested()

    spacing: Style.space(4)

    function formatted() {
      var number = Number(decimalField.value || 0)
      return isFinite(number) ? number.toFixed(decimalField.decimals) : Number(0).toFixed(decimalField.decimals)
    }

    onValueChanged: {
      if (!decimalInput.activeFocus) decimalInput.text = decimalField.formatted()
    }

    PanelSectionHeader {
      text: decimalField.label
      foreground: root.foreground
      fontFamily: root.fontFamily

      HoverHandler { id: labelHover }
      PanelToolTip {
        visible: decimalField.tooltipText !== "" && labelHover.hovered
        text: decimalField.tooltipText
        fontFamily: root.fontFamily
      }
    }

    Item {
      width: parent.width
      height: decimalInput.height

      TextField {
        id: decimalInput
        anchors.left: parent.left
        anchors.right: resetAction.visible ? resetAction.left : parent.right
        anchors.rightMargin: resetAction.visible ? Style.spacing.xxs : 0
        text: decimalField.formatted()
        enabled: decimalField.enabled
        hasCursor: decimalField.hasCursor
        foreground: root.foreground
        validator: DoubleValidator { notation: DoubleValidator.StandardNotation }
        onEditingFinished: {
          var returnToKeyboard = activeFocus
          var parsed = Number(text)
          if (!isFinite(parsed)) text = decimalField.formatted()
          else if (text !== decimalField.formatted() && parsed !== decimalField.value)
            decimalField.modified(parsed)
          if (returnToKeyboard)
            Qt.callLater(function() { keyCatcher.forceActiveFocus() })
        }
      }

      PanelActionButton {
        id: resetAction
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        visible: decimalField.resetVisible
        enabled: decimalField.enabled
        iconText: "󰑐"
        tooltipText: decimalField.resetTooltip
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.body
        size: Math.min(decimalInput.height, Style.space(24))
        focusable: true
        onClicked: decimalField.resetRequested()
      }
    }
  }

  component ActionRow: CursorSurface {
    id: actionRow
    property int rowIndex: 0
    property string icon: ""
    property string title: ""
    property string subtitle: ""
    signal activated()

    hasCursor: root.cursorActive && root.cursorIndex === rowIndex
    foreground: root.foreground
    implicitHeight: actionContent.implicitHeight + Style.spacing.rowPaddingX

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: actionRow.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
      enabled: actionRow.enabled
      onEntered: {
        root.cursorActive = true
        root.cursorIndex = actionRow.rowIndex
      }
      onClicked: actionRow.activated()
    }

    Row {
      id: actionContent
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(12)
      anchors.rightMargin: Style.space(12)
      spacing: Style.space(12)

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        text: actionRow.icon
        color: actionRow.enabled ? root.foreground : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
      }

      Column {
        width: parent.width - parent.children[0].width - parent.spacing
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(2)

        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: actionRow.title
          color: actionRow.enabled ? root.foreground : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          font.bold: true
          elide: Text.ElideRight
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: actionRow.subtitle
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          elide: Text.ElideRight
        }
      }
    }
  }

  component ProfileWorkspaceInfoRow: Item {
    id: workspaceInfoRow
    property string label: ""
    property string displayName: ""
    property string workspaces: ""

    width: parent ? parent.width : 0
    implicitHeight: Math.max(workspaceLabel.implicitHeight, workspaceDisplay.implicitHeight, workspaceValues.implicitHeight)

    Text {
      textFormat: Text.PlainText
      id: workspaceLabel
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: Math.min(parent.width * 0.34, Style.space(105))
      text: workspaceInfoRow.label
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      id: workspaceValues
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: workspaceInfoRow.workspaces
      color: Color.accent
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.bold: true
    }

    Text {
      textFormat: Text.PlainText
      id: workspaceDisplay
      anchors.left: workspaceLabel.right
      anchors.leftMargin: Style.space(8)
      anchors.right: workspaceValues.left
      anchors.rightMargin: Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      text: workspaceInfoRow.displayName
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
    }
  }
}
