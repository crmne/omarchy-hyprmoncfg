import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "IdentifyModel.js" as IdentifyModel

// Display previews can rebuild every per-monitor bar instance. Keep the
// safety decision in a shell-level service so the confirmation is already on
// screen before that happens and survives the topology change.
Item {
  id: root

  property var shell: null
  readonly property string runtimeDir: String(Quickshell.env("XDG_RUNTIME_DIR") || "")
  readonly property string socketPath: root.runtimeDir + "/hyprmoncfgd.sock"
  readonly property bool connected: backendSocket.connected

  property int requestSequence: 0
  property var pendingMethods: ({})
  property var pendingContexts: ({})
  property int statusRevision: 0
  property string transactionId: ""
  property string profileName: ""
  property string deadline: ""
  property int seconds: 0
  property bool saveOnCommit: false
  property bool draftApply: false
  property bool requestPending: false
  property bool actionPending: false
  property string stage: "idle"
  property string errorMessage: ""
  property string actionError: ""
  property string targetScreenName: ""
  onTransactionIdChanged: root.statusRevision++
  onRequestPendingChanged: root.statusRevision++
  onActionPendingChanged: root.statusRevision++
  property bool foreignPreviewActive: false
  property bool identifyPending: false
  property string identifyKey: ""
  property string identifyRequestId: ""
  property string identifyError: ""
  property var document: ({})
  property int identifyTopologyRevision: 0
  property int identifyRequestRevision: 0

  function cancelIdentify() {
    root.identifyPending = false
    root.identifyRequestId = ""
    identifyTimeout.stop()
    identifyOverlay.clear()
  }

  function identifyDisplays(key) {
    root.identifyError = ""
    if (!root.connected || root.opened || root.foreignPreviewActive || root.identifyPending) {
      root.identifyError = "Identify is unavailable while a preview is active or the service is busy."
      return false
    }
    root.identifyKey = String(key || "")
    root.identifyRequestRevision = root.identifyTopologyRevision
    root.identifyPending = true
    identifyOverlay.clear()
    root.identifyRequestId = root.send("editor_state", {})
    identifyTimeout.restart()
    return true
  }

  DisplayIdentify { id: identifyOverlay }
  Timer {
    id: identifyTimeout
    interval: 7000
    onTriggered: {
      root.identifyPending = false
      root.identifyError = "Reading displays timed out. Try Identify again."
    }
  }
  onOpenedChanged: if (opened) root.cancelIdentify()
  Connections {
    target: Quickshell
    function onScreensChanged() {
      root.identifyTopologyRevision++
      root.cancelIdentify()
    }
  }

  readonly property bool opened: root.stage !== "idle"
  readonly property string dialogScreenName: {
    var screens = Quickshell.screens || []
    for (var i = 0; i < screens.length; i++) {
      if (String(screens[i].name || "") === root.targetScreenName) return root.targetScreenName
    }
    var focused = Hyprland.focusedMonitor
    var focusedName = focused ? String(focused.name || "") : ""
    for (var j = 0; j < screens.length; j++) {
      if (String(screens[j].name || "") === focusedName) return focusedName
    }
    return screens.length > 0 ? String(screens[0].name || "") : ""
  }

  signal requestFinished(bool success, string message)

  function send(method, params) {
    if (!backendSocket.connected) return ""
    root.requestSequence++
    var id = String(root.requestSequence)
    var request = {
      type: "request",
      protocol_version: 1,
      id: id,
      method: method
    }
    if (params !== undefined && params !== null) request.params = params
    root.pendingMethods[id] = method
    if (method === "status" || method === "subscribe")
      root.pendingContexts[id] = { statusRevision: root.statusRevision }
    backendSocket.write(JSON.stringify(request) + "\n")
    backendSocket.flush()
    return id
  }

  function rememberScreen() {
    var focused = Hyprland.focusedMonitor
    root.targetScreenName = focused ? String(focused.name || "") : ""
  }

  function beginPreview(params, name, save, draft) {
    if (root.opened || root.requestPending || root.actionPending) {
      root.errorMessage = "Finish the current display preview first."
      root.requestFinished(false, root.errorMessage)
      return false
    }
    if (!backendSocket.connected) {
      root.errorMessage = "The display confirmation service is reconnecting. Try again in a moment."
      root.requestFinished(false, root.errorMessage)
      return false
    }

    root.rememberScreen()
    root.profileName = String(name || "Display layout")
    root.saveOnCommit = save === true
    root.draftApply = draft === true
    root.errorMessage = ""
    root.actionError = ""
    root.requestPending = true
    root.stage = "applying"
    if (root.send("preview", params) !== "") return true

    root.requestPending = false
    root.stage = "error"
    root.errorMessage = "Could not start the display preview."
    root.requestFinished(false, root.errorMessage)
    return false
  }

  function startDraftPreview(profile, timeoutSeconds) {
    var value = profile || ({})
    return root.beginPreview({
      profile: value,
      timeout_seconds: Math.max(1, Number(timeoutSeconds || 30)),
      save_on_commit: true
    }, String(value.name || "Display layout"), true, true)
  }

  function startDraftApply(profile, timeoutSeconds) {
    var value = profile || ({})
    return root.beginPreview({
      profile: value,
      timeout_seconds: Math.max(1, Number(timeoutSeconds || 30)),
      save_on_commit: false
    }, String(value.name || "Display layout"), false, true)
  }

  function startSavedProfilePreview(name, timeoutSeconds) {
    var selected = String(name || "")
    if (selected === "") return false
    return root.beginPreview({
      profile_name: selected,
      timeout_seconds: Math.max(1, Number(timeoutSeconds || 30))
    }, selected, false, false)
  }

  function keep() {
    if (root.actionPending) return false
    if (root.transactionId === "") {
      root.actionError = "The display preview is no longer available."
      return false
    }
    if (!backendSocket.connected) {
      root.actionError = "The display confirmation service is reconnecting. Try again in a moment."
      return false
    }
    root.actionPending = true
    root.actionError = ""
    if (root.send("commit", {
      transaction_id: root.transactionId,
      save: root.saveOnCommit
    }) !== "") return true
    root.actionPending = false
    root.actionError = "Could not keep this display layout."
    return false
  }

  function revert() {
    if (root.actionPending) return false
    if (root.transactionId === "") {
      root.actionError = "The display preview is no longer available."
      return false
    }
    if (!backendSocket.connected) {
      root.actionError = "The display confirmation service is reconnecting. Try again in a moment."
      return false
    }
    root.actionPending = true
    root.actionError = ""
    if (root.send("revert", { transaction_id: root.transactionId }) !== "") return true
    root.actionPending = false
    root.actionError = "Could not restore the previous display layout."
    return false
  }

  function clear() {
    root.transactionId = ""
    root.profileName = ""
    root.deadline = ""
    root.seconds = 0
    root.saveOnCommit = false
    root.draftApply = false
    root.requestPending = false
    root.actionPending = false
    root.stage = "idle"
    root.errorMessage = ""
    root.actionError = ""
    previewClock.stop()
  }

  function updateClock() {
    var at = Date.parse(root.deadline)
    if (!isFinite(at)) return
    root.seconds = Math.max(0, Math.ceil((at - Date.now()) / 1000))
  }

  function syncPreview(pending) {
    var id = pending ? String(pending.transaction_id || "") : ""
    if (id !== "") {
      if (!Model.canConfirmPreview(pending, root.transactionId)) return
      if (root.transactionId !== id) root.actionError = ""
      root.transactionId = id
      root.profileName = String(pending.profile_name
        || (pending.profile ? pending.profile.name : "")
        || root.profileName
        || "Display layout")
      root.deadline = String(pending.deadline || root.deadline || "")
      root.saveOnCommit = pending.save_on_commit === true || root.saveOnCommit
      root.requestPending = false
      root.stage = "confirm"
      root.updateClock()
      previewClock.start()
      return
    }
    if (root.transactionId !== "" && !root.requestPending) root.clear()
  }

  function updateDocument(value) {
    if (!value || typeof value !== "object") return
    root.statusRevision++
    var previous = root.document || ({})
    var changed = Model.monitorStateSignature(previous.monitors) !== Model.monitorStateSignature(value.monitors)
      || String(previous.monitor_set_hash || "") !== String(value.monitor_set_hash || "")
    root.document = value
    if (changed) {
      root.identifyTopologyRevision++
      root.cancelIdentify()
    }
    root.foreignPreviewActive = !!(value.daemon && value.daemon.preview)
    if (root.foreignPreviewActive) root.cancelIdentify()
    root.syncPreview(value.daemon ? value.daemon.preview : null)
  }

  function handleMessage(line) {
    var envelope = Model.parseEnvelope(line)
    if (!envelope) return
    if (envelope.type === "event") {
      if (envelope.event === "status") root.updateDocument(envelope.data)
      return
    }

    var method = root.pendingMethods[String(envelope.id)] || ""
    var context = root.pendingContexts[String(envelope.id)] || ({})
    delete root.pendingMethods[String(envelope.id)]
    delete root.pendingContexts[String(envelope.id)]
    // A newer event or preview transition makes an earlier read obsolete.
    if ((method === "status" || method === "subscribe")
        && context.statusRevision !== root.statusRevision) return
    if (method === "editor_state"
        && (String(envelope.id) !== root.identifyRequestId || !root.identifyPending)) return
    if (envelope.error) {
      var message = String(envelope.error.message || "hyprmoncfg request failed")
      if (method === "editor_state") {
        root.identifyPending = false
        identifyTimeout.stop()
        root.identifyError = message
      }
      if (method === "preview") {
        root.requestPending = false
        root.stage = "error"
        root.errorMessage = message
        root.requestFinished(false, message)
      } else if (method === "commit" || method === "revert") {
        root.actionPending = false
        root.actionError = message
      }
      return
    }

    if (method === "editor_state") {
      root.identifyPending = false
      identifyTimeout.stop()
      if (root.opened || root.foreignPreviewActive) return
      if (root.identifyRequestRevision !== root.identifyTopologyRevision
          || !Model.monitorSnapshotsMatch(root.document, envelope.result)) {
        root.identifyError = "The displays changed. Refresh before identifying them again."
        root.send("status", {})
        return
      }
      if (root.identifyKey !== "") {
        var editor = envelope.result || ({})
        var target = IdentifyModel.target(Model.outputByKey(editor.profile, root.identifyKey),
          editor.profile, editor.displays, Quickshell.screens || [])
        if (!target.screen) {
          root.identifyError = target.error
          return
        }
      }
      var targets = Model.identifyTargets(envelope.result, Quickshell.screens || [], root.identifyKey)
      if (!targets.length) root.identifyError = "No awake, enabled display is available to identify."
      else identifyOverlay.show(targets)
    } else if (method === "subscribe" || method === "status") {
      root.updateDocument(envelope.result)
    } else if (method === "preview") {
      var transaction = envelope.result || ({})
      root.transactionId = String(transaction.id || root.transactionId || "")
      root.deadline = String(transaction.deadline || root.deadline || "")
      root.requestPending = false
      root.stage = "confirm"
      root.updateClock()
      previewClock.start()
      root.requestFinished(true, "")
    } else if (method === "commit" || method === "revert") {
      root.clear()
      root.previewFinished()
    }
  }

  Component.onCompleted: backendSocket.connected = root.socketPath !== "/hyprmoncfgd.sock"
  signal previewFinished()

  Socket {
    id: backendSocket
    path: root.socketPath
    connected: false
    parser: SplitParser {
      splitMarker: "\n"
      onRead: function(line) { root.handleMessage(line) }
    }
    onConnectedChanged: {
      if (connected) root.send("subscribe", {})
      else {
        root.identifyTopologyRevision++
        root.cancelIdentify()
        var wasPending = root.requestPending
        root.pendingMethods = ({})
        root.pendingContexts = ({})
        root.clear()
        if (wasPending) root.requestFinished(false, "hyprmoncfg disconnected during the preview. Reconnecting…")
      }
    }
    onError: function(error) { backendSocket.connected = false }
  }

  Timer {
    interval: 750
    repeat: true
    running: root.socketPath !== "/hyprmoncfgd.sock" && !backendSocket.connected
    onTriggered: backendSocket.connected = true
  }

  Timer {
    id: previewClock
    interval: 250
    repeat: true
    onTriggered: root.updateClock()
  }

  Variants {
    model: root.opened ? Quickshell.screens : []

    PanelWindow {
      id: guardWindow
      required property var modelData
      readonly property bool ownsDialog: !!modelData
        && String(modelData.name || "") === root.dialogScreenName

      function restoreInputFocus() {
        if (!guardWindow.ownsDialog || !guardWindow.backingWindowVisible) return
        Qt.callLater(function() {
          if (guardWindow.ownsDialog && guardWindow.backingWindowVisible)
            keyCatcher.forceActiveFocus()
        })
      }

      screen: modelData
      visible: root.opened && !remapGuard.remapping
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "hyprmoncfg-preview-guard"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: ownsDialog
        ? WlrKeyboardFocus.Exclusive
        : WlrKeyboardFocus.None
      anchors { top: true; bottom: true; left: true; right: true }
      mask: Region {
        width: guardWindow.width
        height: guardWindow.height
      }

      onBackingWindowVisibleChanged: {
        if (backingWindowVisible) guardWindow.restoreInputFocus()
      }
      onOwnsDialogChanged: guardWindow.restoreInputFocus()
      Component.onCompleted: guardWindow.restoreInputFocus()

      ScreenMoveRemap {
        id: remapGuard
        window: guardWindow
      }

      Rectangle {
        anchors.fill: parent
        color: Util.alpha(Color.background, 0.72)
      }

      // Consume every pointer press while the layout is awaiting a decision.
      // Outside clicks must not dismiss the only confirmation surface.
      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.AllButtons
        onClicked: function(mouse) { mouse.accepted = true }
      }

      BorderSurface {
        id: dialog
        visible: guardWindow.ownsDialog
        width: Math.min(parent.width - Style.space(32), Style.space(460))
        height: Style.space(188)
        anchors.centerIn: parent
        color: Color.background
        borderSpec: Border.surfaceSpec("popups", "border", Color.accent, Math.max(1, Style.space(2)))
        radius: Style.cornerRadius
        padding: Style.space(20)

        MouseArea { anchors.fill: parent; onClicked: function(mouse) { mouse.accepted = true } }

        Item {
          id: keyCatcher
          anchors.fill: parent
          anchors.topMargin: dialog.contentTopInset
          anchors.rightMargin: dialog.contentRightInset
          anchors.bottomMargin: dialog.contentBottomInset
          anchors.leftMargin: dialog.contentLeftInset
          focus: guardWindow.ownsDialog

          Keys.priority: Keys.BeforeItem
          Keys.onPressed: function(event) {
            if (root.stage === "confirm"
                && (event.key === Qt.Key_Escape || event.text === "n"
                  || event.text === "N" || event.text === "q" || event.text === "Q")) {
              root.revert()
              event.accepted = true
            } else if (root.stage === "confirm"
                && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
                  || event.text === "y" || event.text === "Y")) {
              root.keep()
              event.accepted = true
            } else if (root.stage === "error" && event.key === Qt.Key_Escape) {
              root.clear()
              event.accepted = true
            }
          }

          Column {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            spacing: Style.space(7)

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: root.stage === "applying"
                ? "Applying display preview…"
                : (root.stage === "error"
                  ? "Couldn’t preview this layout"
                  : (root.saveOnCommit ? "Keep and save this layout?"
                    : (root.draftApply ? "Keep this layout?" : "Keep this profile?")))
              color: root.stage === "error" ? Color.urgent : Color.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.heading
              font.bold: true
              wrapMode: Text.WordWrap
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: root.stage === "applying"
                ? "This confirmation stays open while your displays reconfigure."
                : (root.stage === "error"
                  ? root.errorMessage
                  : (root.actionError !== ""
                    ? root.actionError
                    : root.profileName + " · " + root.seconds + " seconds before the previous layout returns"))
              color: root.stage === "error" || root.actionError !== "" ? Color.urgent : Color.foreground
              opacity: 0.68
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }
          }

          Row {
            visible: root.stage === "confirm"
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            spacing: Style.space(10)

            Button {
              text: root.actionPending ? "Working…" : "Revert"
              bordered: true
              enabled: !root.actionPending
              foreground: Color.foreground
              fontFamily: Style.font.family
              onClicked: root.revert()
            }

            Button {
              text: root.saveOnCommit ? "Keep & save" : "Keep"
              selected: true
              bordered: true
              enabled: !root.actionPending
              foreground: Color.foreground
              fontFamily: Style.font.family
              onClicked: root.keep()
            }
          }

          Button {
            visible: root.stage === "error"
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            text: "Close"
            bordered: true
            foreground: Color.foreground
            fontFamily: Style.font.family
            onClicked: root.clear()
          }
        }
      }
    }
  }
}
