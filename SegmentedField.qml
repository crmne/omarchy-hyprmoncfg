import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Strings.js" as Strings

// A small closed set shown all at once, built on the shell's own ButtonGroup
// so chip spacing, hover, focus, Tab entry and h/l/Enter keys are Omarchy's.
// The header follows Omarchy's panels: uppercase label on the left, and an
// optional right-aligned `detail` (the target or current value).
//
// `value` is never assigned internally: callers keep their bindings while
// hyprmoncfg normalizes the edit. A value outside `options` selects no chip
// and is not rewritten; callers add it with Model.optionsWithCurrent to show it.
Column {
  id: root

  property string label: ""
  property string detail: ""
  property string tooltipText: ""
  property var options: []
  property string value: ""
  property bool hasCursor: false
  property bool resetVisible: false
  property string resetTooltip: Strings.t("reset.default", "Reset to loaded profile value")
  property color foreground: Commons.Color.popups.text
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.caption

  signal changed(string value)
  signal resetRequested()

  spacing: Style.spacing.labelGap

  // A row whose chips leave no room for the reset beside them shows it in
  // the header instead, so it never covers the last chip.
  readonly property bool resetInHeader: root.resetVisible
    && controls.implicitWidth + Style.space(8) + rowReset.implicitWidth > root.width

  function selectedIndex() {
    for (var i = 0; i < options.length; i++)
      if (group.optionValue(options[i]) === value) return i
    return -1
  }

  Item {
    width: parent.width
    visible: root.label !== ""
    implicitHeight: Math.max(header.implicitHeight, detailText.implicitHeight,
      headerReset.visible ? headerReset.height : 0)

    PanelSectionHeader {
      id: header
      anchors.left: parent.left
      anchors.right: detailText.visible ? detailText.left : (headerReset.visible ? headerReset.left : parent.right)
      anchors.rightMargin: detailText.visible || headerReset.visible ? Style.space(8) : 0
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

    PanelActionButton {
      id: headerReset
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      visible: root.resetInHeader
      enabled: root.enabled
      iconText: "󰑐"
      tooltipText: root.resetTooltip
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: true
      onClicked: root.resetRequested()
    }

    Text {
      id: detailText
      textFormat: Text.PlainText
      visible: root.detail !== ""
      anchors.right: headerReset.visible ? headerReset.left : parent.right
      anchors.rightMargin: headerReset.visible ? Style.space(6) : 0
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
    height: Math.max(controls.implicitHeight, rowReset.visible ? rowReset.height : 0)

    Row {
      id: controls
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      spacing: group.spacing

      ButtonGroup {
        id: group
        options: root.options
        value: root.value
        enabled: root.enabled
        cursorIndex: !root.hasCursor ? -1 : Math.max(0, root.selectedIndex())
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        fontSize: root.fontSize
        onChanged: function(value) { root.changed(value) }
      }
    }

    PanelActionButton {
      id: rowReset
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      visible: root.resetVisible && !root.resetInHeader
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
