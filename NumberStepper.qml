import QtQuick
import qs.Commons
import qs.Ui

// Keep the shell's validation, exact entry, and keyboard behavior. Only replace
// the indicator geometry; wheel scrolling must scroll the inspector, not edit.
NumberField {
  id: root
  readonly property real buttonWidth: Style.space(28)

  field.wheelEnabled: false
  field.leftPadding: buttonWidth
  field.rightPadding: buttonWidth
  field.down.indicator: Rectangle {
    x: 0
    width: root.buttonWidth
    height: root.field.height
    color: root.field.down.pressed ? Style.selectedFillFor(root.foreground, root.accent) : "transparent"
    Text {
      textFormat: Text.PlainText
      anchors.centerIn: parent
      text: "−"
      color: root.foreground
      opacity: root.field.value > root.from ? 1 : 0.35
      font.family: root.fontFamily
      font.pixelSize: root.fontSize
    }
  }
  field.up.indicator: Rectangle {
    x: root.field.width - width
    width: root.buttonWidth
    height: root.field.height
    color: root.field.up.pressed ? Style.selectedFillFor(root.foreground, root.accent) : "transparent"
    Text {
      textFormat: Text.PlainText
      anchors.centerIn: parent
      text: "+"
      color: root.foreground
      opacity: root.field.value < root.to ? 1 : 0.35
      font.family: root.fontFamily
      font.pixelSize: root.fontSize
    }
  }
}
