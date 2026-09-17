import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import "IdentifyModel.js" as IdentifyModel

// Visual-only cue. Never changes the layout, focuses a window, or grabs input.
Item {
  id: root

  readonly property var availableScreens: Quickshell.screens || []
  property var targetScreen: null
  property string connectorName: ""
  property string displayLabel: ""
  property string lastError: ""
  property bool active: false
  property int duration: 2000
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  function identify(output, currentProfile, editorDisplays) {
    var result = IdentifyModel.target(output, currentProfile, editorDisplays, root.availableScreens)
    root.clear()
    root.lastError = result.error
    if (!result.screen) return false
    root.targetScreen = result.screen
    root.connectorName = result.connector
    root.displayLabel = result.label
    root.active = true
    expiry.restart()
    return true
  }

  function clear() {
    expiry.stop()
    root.active = false
    root.targetScreen = null
    root.connectorName = ""
    root.displayLabel = ""
  }

  function refreshScreens() {
    if (root.active && !IdentifyModel.containsScreen(root.targetScreen, root.availableScreens))
      root.clear()
  }

  onAvailableScreensChanged: root.refreshScreens()

  Timer {
    id: expiry
    interval: Math.max(250, root.duration)
    repeat: false
    onTriggered: root.clear()
  }

  Variants {
    model: root.availableScreens

    PanelWindow {
      id: cueWindow
      required property var modelData
      screen: modelData
      visible: root.active && root.targetScreen === modelData
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "hyprmoncfg-display-identify"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      anchors { top: true; bottom: true; left: true; right: true }
      // Empty input region keeps every pointer event on the desktop below.
      mask: Region {}

      Rectangle {
        anchors.fill: parent
        anchors.margins: Style.space(8)
        color: "transparent"
        border.color: "#ffffff"
        border.width: Style.space(2)
        radius: Style.space(15)

        Rectangle {
          anchors.fill: parent
          anchors.margins: Style.space(3)
          color: "transparent"
          border.color: root.accent
          border.width: Style.space(6)
          radius: Style.space(12)
        }
      }

      Rectangle {
        anchors.centerIn: parent
        width: Math.max(1, Math.min(parent.width - Style.space(48), Style.space(620)))
        height: labelColumn.implicitHeight + Style.space(40)
        color: "#ee11151d"
        border.color: root.accent
        border.width: Style.space(3)
        radius: Style.space(16)

        Column {
          id: labelColumn
          anchors.centerIn: parent
          width: Math.max(1, parent.width - Style.space(40))
          spacing: Style.space(8)

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: "This display"
            color: "#cbd5e1"
            font.family: root.fontFamily
            font.pixelSize: Style.space(18)
            horizontalAlignment: Text.AlignHCenter
          }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: root.connectorName
            color: "#ffffff"
            font.family: root.fontFamily
            font.pixelSize: Style.space(40)
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: root.displayLabel
            color: "#e2e8f0"
            font.family: root.fontFamily
            font.pixelSize: Style.space(20)
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            maximumLineCount: 2
            elide: Text.ElideRight
          }
        }
      }
    }
  }
}
