import QtQuick
import qs.Commons
import qs.Ui

// A small closed set shown all at once, built on the shell's own ButtonGroup
// so chip spacing, hover, focus, Tab entry and h/l/Enter keys are Omarchy's.
// The header follows Omarchy's panels: uppercase label on the left, and an
// optional right-aligned `detail` (the target or current value).
//
// `value` is never assigned internally: callers keep their bindings while
// hyprmoncfg normalizes the edit. A value outside `options` selects no chip
// and is not rewritten; callers add it with Model.optionsWithCurrent to show it.
//
// Actions mode (`actions: true`): chips are commands; ButtonGroup gets an
// empty value so none reads as selected, and `changed(value)` means "do this".
Column {
  id: root

  property string label: ""
  property string detail: ""
  property string tooltipText: ""
  property var options: []
  property string value: ""
  property bool actions: false
  property bool hasCursor: false
  // Chip that carries the panel's keyboard cursor; -1 means the selected chip.
  property int cursorIndex: -1
  property bool resetVisible: false
  property string resetTooltip: "Reset to loaded profile value"
  // Optional trailing on/off chip in the same row (Rotation's Flipped).
  property string toggleLabel: ""
  property bool toggleEnabled: true
  property bool toggleChecked: false
  // Optional chip after the toggle, for opting out of the field rather than
  // choosing within it (Rotation's Auto). Not an option: selecting it clears the
  // choices instead of joining them.
  property string tailLabel: ""
  property bool tailSelected: false
  property bool tailHasCursor: false
  property bool toggleHasCursor: false
  property color foreground: Color.popups.text
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.caption

  signal changed(string value)
  signal toggled(bool checked)
  signal tailClicked()
  signal resetRequested()

  spacing: Style.spacing.labelGap

  function selectedIndex() {
    for (var i = 0; i < options.length; i++)
      if (group.optionValue(options[i]) === value) return i
    return -1
  }

  Item {
    width: parent.width
    visible: root.label !== ""
    implicitHeight: Math.max(header.implicitHeight, detailText.implicitHeight)

    PanelSectionHeader {
      id: header
      anchors.left: parent.left
      anchors.right: detailText.visible ? detailText.left : parent.right
      anchors.rightMargin: detailText.visible ? Style.space(8) : 0
      anchors.verticalCenter: parent.verticalCenter
      text: root.label
      elide: Text.ElideRight
      foreground: root.foreground
      fontFamily: root.fontFamily

      HoverHandler { id: labelHover }
      PanelToolTip {
        visible: root.tooltipText !== "" && labelHover.hovered
        text: root.tooltipText
        fontFamily: root.fontFamily
      }
    }

    Text {
      id: detailText
      textFormat: Text.PlainText
      visible: root.detail !== ""
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: root.detail
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
  }

  Item {
    width: parent.width
    height: Math.max(controls.implicitHeight, resetAction.visible ? resetAction.height : 0)

    Row {
      id: controls
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      spacing: group.spacing

      ButtonGroup {
        id: group
        options: root.options
        value: root.actions ? "" : root.value
        enabled: root.enabled
        cursorIndex: !root.hasCursor ? -1
          : (root.cursorIndex >= 0 ? root.cursorIndex : Math.max(0, root.selectedIndex()))
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: root.fontSize
        onChanged: function(value) { root.changed(value) }
      }

      Button {
        visible: root.toggleLabel !== ""
        text: root.toggleLabel
        selected: root.toggleChecked
        hasCursor: root.toggleHasCursor
        bordered: true
        // Same chrome as the group's chips, which get this from ButtonGroup.
        // Button's own default is transparent, so without it a selected state
        // has no fill to show and the chip looks the same either way.
        background: Color.background
        focusable: true
        enabled: root.enabled && root.toggleEnabled
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: root.fontSize
        onClicked: root.toggled(!root.toggleChecked)
      }

      Button {
        visible: root.tailLabel !== ""
        text: root.tailLabel
        selected: root.tailSelected
        hasCursor: root.tailHasCursor
        bordered: true
        background: Color.background
        focusable: true
        enabled: root.enabled
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: root.fontSize
        onClicked: root.tailClicked()
      }

      // Reset rides in the row rather than at the panel's right edge. Anchored
      // right it overlapped the choices once a field grew wide enough to reach
      // it, and the choice chips cannot shrink out of the way.
      PanelActionButton {
        id: resetAction
        anchors.verticalCenter: controls.verticalCenter
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
}
