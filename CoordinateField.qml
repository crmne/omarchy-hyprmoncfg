import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Exact entry for a layout coordinate. Positions are four- or five-digit
// logical pixels that are normally set by dragging, snapping or arrow nudges,
// so the field shows the exact value and accepts a typed one; it has no
// -/+ buttons (single-pixel steps are what the canvas arrows are for). Typing
// is committed on Enter or focus loss; invalid text reverts, never guesses.
Column {
  id: root

  property string label: ""
  property int value: 0
  property bool hasCursor: false
  property bool resetVisible: false
  property string resetTooltip: "Reset to loaded profile value"
  property color foreground: Color.popups.text
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property alias input: coordinateInput

  signal modified(int value)
  signal resetRequested()

  spacing: Style.spacing.labelGap

  onValueChanged: if (!coordinateInput.activeFocus) coordinateInput.text = String(root.value)

  Text {
    textFormat: Text.PlainText
    visible: root.label !== ""
    text: root.label
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    topPadding: Math.ceil(font.pixelSize * 0.15)
  }

  Item {
    width: parent.width
    height: coordinateInput.height

    TextField {
      id: coordinateInput
      anchors.left: parent.left
      anchors.right: resetAction.visible ? resetAction.left : parent.right
      anchors.rightMargin: resetAction.visible ? Style.spacing.xxs : 0
      text: String(root.value)
      horizontalAlignment: TextInput.AlignRight
      inputMethodHints: Qt.ImhFormattedNumbersOnly
      validator: RegularExpressionValidator { regularExpression: /[-+]?\d{0,5}/ }
      enabled: root.enabled
      hasCursor: root.hasCursor
      foreground: root.foreground
      font.family: root.fontFamily
      onEditingFinished: {
        var parsed = Model.parseCoordinate(text)
        if (parsed === null) text = String(root.value)
        else if (parsed !== root.value) root.modified(parsed)
      }
    }

    PanelActionButton {
      id: resetAction
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      visible: root.resetVisible
      enabled: root.enabled
      iconText: "󰑐"
      tooltipText: root.resetTooltip
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: true
      onClicked: root.resetRequested()
    }
  }
}
