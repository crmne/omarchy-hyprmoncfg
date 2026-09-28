import QtQuick
import qs.Commons
import qs.Ui

// A small closed set shown all at once: every choice is visible and one
// click away, instead of hidden behind a dropdown. Built from the shell's own
// Button so selection, hover, focus and theme tokens match every other
// control. Same caption label, tooltip and reset action as PanelDropdown.
//
// `value` is never assigned internally: callers keep their bindings while
// hyprmoncfg normalizes the edit. A value outside `options` (for example one
// Hyprland reports that the panel does not know) selects no chip and is not
// rewritten; callers can add it with Model.optionsWithCurrent to show it.
//
// Actions mode (`actions: true`): chips are commands, not a selection; none is
// shown as selected and `changed(value)` means "do this".
Column {
  id: root

  property string label: ""
  property string tooltipText: ""
  property var options: []
  property string value: ""
  property bool actions: false
  property bool hasCursor: false
  // Chip that carries the keyboard cursor; -1 means the selected chip.
  property int cursorIndex: -1
  property bool resetVisible: false
  property string resetTooltip: "Reset to loaded profile value"
  // Optional trailing on/off chip sharing the row (Rotation's Flipped).
  property string toggleLabel: ""
  property bool toggleChecked: false
  property bool toggleHasCursor: false
  property color foreground: Color.popups.text
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.caption

  signal changed(string value)
  signal toggled(bool checked)
  signal resetRequested()

  spacing: Style.spacing.labelGap

  function optionValue(option) {
    return option && typeof option === "object" ? String(option.value) : String(option)
  }
  function optionLabel(option) {
    return option && typeof option === "object" ? String(option.label) : String(option)
  }
  function selectedIndex() {
    for (var i = 0; i < options.length; i++)
      if (optionValue(options[i]) === value) return i
    return -1
  }
  readonly property int cursorChip: !hasCursor ? -2
    : (cursorIndex >= 0 ? cursorIndex : Math.max(0, selectedIndex()))

  Text {
    textFormat: Text.PlainText
    visible: root.label !== ""
    text: root.label
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    topPadding: Math.ceil(font.pixelSize * 0.15)

    HoverHandler { id: labelHover }
    PanelToolTip {
      visible: root.tooltipText !== "" && labelHover.hovered
      text: root.tooltipText
      fontFamily: root.fontFamily
    }
  }

  Item {
    width: parent.width
    height: Style.spacing.controlHeight

    Row {
      id: chips
      anchors.left: parent.left
      anchors.right: resetAction.visible ? resetAction.left : parent.right
      anchors.rightMargin: resetAction.visible ? Style.spacing.xxs : 0
      height: parent.height
      spacing: Style.spacing.xs
      readonly property int count: root.options.length + (root.toggleLabel !== "" ? 1 : 0)
      readonly property real chipWidth: count > 0 ? Math.floor((width - spacing * (count - 1)) / count) : width

      Repeater {
        model: root.options
        delegate: Button {
          required property var modelData
          required property int index
          width: chips.chipWidth
          height: chips.height
          text: root.optionLabel(modelData)
          selected: !root.actions && root.optionValue(modelData) === root.value
          hasCursor: root.cursorChip === index
          bordered: true
          focusable: true
          enabled: root.enabled
          foreground: root.foreground
          accent: root.accent
          fontFamily: root.fontFamily
          fontSize: root.fontSize
          horizontalPadding: Style.space(4)
          onClicked: root.changed(root.optionValue(modelData))
        }
      }

      Button {
        visible: root.toggleLabel !== ""
        width: chips.chipWidth
        height: chips.height
        text: root.toggleLabel
        selected: root.toggleChecked
        hasCursor: root.toggleHasCursor
        bordered: true
        focusable: true
        enabled: root.enabled
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: root.fontSize
        horizontalPadding: Style.space(4)
        onClicked: root.toggled(!root.toggleChecked)
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
