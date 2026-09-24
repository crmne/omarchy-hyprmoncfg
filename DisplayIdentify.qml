import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons

// Input-transparent cues, following the layer-shell approach reviewed in PR #18.
// Owned by the persistent preview service, never by an individual bar instance.
Item {
  id: root
  property var targets: []
  function clear() { expiry.stop(); root.targets = [] }
  function show(items) { root.targets = items; expiry.restart() }
  Timer { id: expiry; interval: 4000; onTriggered: root.clear() }
  Connections {
    target: Quickshell
    function onScreensChanged() { root.clear() }
  }
  Variants {
    model: root.targets
    PanelWindow {
      required property var modelData
      screen: modelData.screen
      visible: true
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "hyprmoncfg-display-identify"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      anchors { top: true; bottom: true; left: true; right: true }
      mask: Region {}
      Rectangle {
        anchors.centerIn: parent
        width: Math.min(parent.width - Style.space(32), Style.space(480))
        height: labels.implicitHeight + Style.space(32)
        color: Color.background
        border.color: Color.accent
        border.width: 3
        radius: Style.cornerRadius
        Column {
          id: labels
          anchors.centerIn: parent
          width: parent.width - Style.space(24)
          spacing: Style.space(6)
          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: modelData.summary.connector
            color: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.space(32)
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
          }
          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: modelData.summary.model
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignHCenter
          }
          Repeater {
            model: [modelData.summary.mode, modelData.summary.placement, modelData.summary.workspaces]
            delegate: Text {
              required property string modelData
              visible: modelData !== ""
              width: labels.width
              textFormat: Text.PlainText
              text: modelData
              color: Color.foreground
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              wrapMode: Text.Wrap
              horizontalAlignment: Text.AlignHCenter
            }
          }
        }
      }
    }
  }
}
