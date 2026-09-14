import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Briefly labels every physical screen with the number its card shows on the
// layout canvas, so identical monitors can be told apart at a glance. The
// labels are informational only: they never take keyboard focus or pointer
// input, and they disappear on their own.
Item {
  id: root

  property var entries: []
  property string selectedKey: ""
  readonly property bool active: hideTimer.running

  function show(list, selected, seconds) {
    root.entries = list instanceof Array ? list : []
    root.selectedKey = String(selected || "")
    if (root.entries.length === 0) {
      root.hide()
      return false
    }
    hideTimer.interval = Math.max(1, Number(seconds || 4)) * 1000
    hideTimer.restart()
    return true
  }

  function hide() {
    hideTimer.stop()
    root.entries = []
    root.selectedKey = ""
  }

  Timer {
    id: hideTimer
    repeat: false
    onTriggered: {
      root.entries = []
      root.selectedKey = ""
    }
  }

  Variants {
    model: root.active ? Quickshell.screens : []

    PanelWindow {
      id: identifyWindow
      required property var modelData
      readonly property var entry: Model.identifyEntryForScreen(root.entries, identifyWindow.modelData ? identifyWindow.modelData.name : "")
      readonly property bool selected: !!entry && root.selectedKey !== ""
        && String(entry.key || "") === root.selectedKey

      screen: modelData
      visible: root.active && !!entry && !remapGuard.remapping
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "hyprmoncfg-identify"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      anchors { top: true; bottom: true; left: true; right: true }
      mask: Region {}

      ScreenMoveRemap {
        id: remapGuard
        window: identifyWindow
      }

      BorderSurface {
        id: card
        anchors.centerIn: parent
        width: Math.min(parent.width - Style.space(32),
          Math.max(Style.space(260), details.implicitWidth + Style.space(48)))
        height: details.implicitHeight + Style.space(40)
        color: Color.background
        borderSpec: Border.surfaceSpec("popups", "border",
          identifyWindow.selected ? Color.accent : Color.foreground,
          Math.max(1, Style.space(identifyWindow.selected ? 3 : 2)))
        radius: Style.cornerRadius
        padding: Style.space(20)
        opacity: 0
        scale: 0.96

        Component.onCompleted: {
          opacity = 1
          scale = 1
        }
        Behavior on opacity { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
        Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

        Column {
          id: details
          anchors.centerIn: parent
          spacing: Style.space(4)

          Text {
            textFormat: Text.PlainText
            anchors.horizontalCenter: parent.horizontalCenter
            text: identifyWindow.entry ? String(identifyWindow.entry.number) : ""
            color: identifyWindow.selected ? Color.accent : Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.space(112)
            font.bold: true
            lineHeight: 0.9
          }

          Text {
            textFormat: Text.PlainText
            anchors.horizontalCenter: parent.horizontalCenter
            text: identifyWindow.entry ? identifyWindow.entry.name : ""
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.heading
            font.bold: true
          }

          Text {
            textFormat: Text.PlainText
            anchors.horizontalCenter: parent.horizontalCenter
            text: identifyWindow.entry ? identifyWindow.entry.model : ""
            color: Color.foreground
            opacity: 0.68
            font.family: Style.font.family
            font.pixelSize: Style.font.body
          }

          Text {
            textFormat: Text.PlainText
            anchors.horizontalCenter: parent.horizontalCenter
            visible: text !== ""
            text: identifyWindow.entry ? identifyWindow.entry.detail : ""
            color: Color.foreground
            opacity: 0.5
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          Text {
            textFormat: Text.PlainText
            anchors.horizontalCenter: parent.horizontalCenter
            visible: identifyWindow.selected
            text: "Selected in hyprmoncfg"
            color: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
            font.bold: true
          }
        }
      }
    }
  }
}
