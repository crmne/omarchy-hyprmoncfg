import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Scale the way Omarchy's own Display panel shows it: one row of preset pills
// (bordered Button, `active` = current), each preset mapped to a sharp scale
// hyprmoncfg reports for this display (Model.scalePresets). A trailing More
// dropdown lists every sharp scale, so none is out of reach. Labels are compact
// (Model.compactScaleLabels); the value emitted is always the exact scale. An
// unsharp current scale is its own pill and is never rewritten.
Column {
  id: root

  property var presets: []
  property var allOptions: []
  property string value: ""
  property bool hasCursor: false
  property bool resetVisible: false
  property string resetTooltip: "Reset to loaded profile value"
  property Item popupParent: null
  property bool ownerOpen: true
  property color foreground: Color.popups.text
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property alias more: moreDropdown

  signal changed(string value)
  signal resetRequested()

  spacing: Style.spacing.labelGap

  readonly property string currentLabel: {
    for (var i = 0; i < allOptions.length; i++)
      if (String(allOptions[i].value) === root.value) return String(allOptions[i].label)
    return root.value !== "" ? root.value + "x" : ""
  }

  Item {
    width: parent.width
    implicitHeight: Math.max(header.implicitHeight, currentText.implicitHeight, resetAction.visible ? resetAction.height : 0)

    PanelSectionHeader {
      id: header
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: "SCALE"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Text {
      id: currentText
      textFormat: Text.PlainText
      anchors.right: resetAction.visible ? resetAction.left : parent.right
      anchors.rightMargin: resetAction.visible ? Style.spacing.xxs : 0
      anchors.verticalCenter: parent.verticalCenter
      text: root.currentLabel
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
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

  TextMetrics { id: moreText; font.family: root.fontFamily; font.pixelSize: Style.font.body; text: "More" }
  TextMetrics { id: moreChevron; font.family: root.fontFamily; font.pixelSize: Style.font.body; text: "󰅀" }

  Row {
    id: pillRow
    width: parent.width
    spacing: Style.spacing.xs
    // Sized from the trigger's own text, chevron and paddings, so "More" never elides.
    readonly property real moreWidth: Math.ceil(moreText.advanceWidth + moreChevron.advanceWidth
      + Style.spacing.controlPaddingX + Style.spacing.md + Style.spacing.controlGap
      + Style.normalBorderWidth * 2 + Style.space(2))
    readonly property int count: Math.max(1, root.presets.length)
    readonly property real cellWidth: Math.max(1,
      Math.floor((width - moreWidth - spacing * count) / count))

    Repeater {
      model: root.presets

      Button {
        id: pill
        required property var modelData
        width: pillRow.cellWidth
        height: moreDropdown.rowHeight
        text: String(modelData.label)
        fontSize: Style.font.caption
        // Omarchy's pill padding when there is room; less, never below one
        // pixel, when a seventh (current-value) pill narrows the cells.
        horizontalPadding: Math.max(1, Math.min(Style.spacing.xs,
          Math.floor((pillRow.cellWidth - labelMetrics.advanceWidth - Style.normalBorderWidth * 2) / 2)))
        TextMetrics { id: labelMetrics; font.family: root.fontFamily; font.pixelSize: Style.font.caption; text: pill.text }
        verticalPadding: Style.spacing.controlPaddingY
        bordered: true
        focusable: true
        active: String(modelData.value) === root.value
        hasCursor: root.hasCursor && String(modelData.value) === root.value
        enabled: root.enabled
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onClicked: root.changed(String(modelData.value))
      }
    }

    PanelDropdown {
      id: moreDropdown
      width: pillRow.moreWidth
      showLabel: false
      triggerText: "More"
      options: root.allOptions
      value: root.value
      popupParent: root.popupParent
      ownerOpen: root.ownerOpen
      enabled: root.enabled
      foreground: root.foreground
      fontFamily: root.fontFamily
      onChanged: function(value) { root.changed(value) }
    }
  }
}
