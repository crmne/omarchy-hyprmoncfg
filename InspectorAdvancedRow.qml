import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Strings.js" as Strings

// The one disclosure on an inspector tab. Closed, it keeps hidden state honest:
// `summary` names hidden values that are not at their default, and the dot marks
// hidden fields changed from the loaded profile. It never opens by itself, so
// dragging a display cannot make the inspector jump.
Item {
  id: root

  property bool open: false
  property string summary: ""
  property bool changed: false
  property bool hasCursor: false
  property color foreground: Commons.Color.popups.text
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family

  signal toggled()

  implicitHeight: Style.spacing.popupRowHeight
  Accessible.role: Accessible.Button
  Accessible.name: Strings.t("inspector.advanced", "ADVANCED")
  activeFocusOnTab: true
  Keys.onReturnPressed: root.toggled()
  Keys.onEnterPressed: root.toggled()
  Keys.onSpacePressed: root.toggled()

  Rectangle {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    height: Style.normalBorderWidth
    color: Qt.darker(root.foreground, 3)
  }

  Rectangle {
    anchors.fill: parent
    anchors.topMargin: Style.normalBorderWidth
    radius: Style.cornerRadius
    color: root.hasCursor || root.activeFocus || hover.hovered
      ? Style.hoverFillFor(root.foreground, root.accent) : "transparent"
    border.width: root.hasCursor || root.activeFocus ? Style.normalBorderWidth : 0
    border.color: root.accent
  }

  Row {
    id: lead
    anchors.left: parent.left
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: Style.spacing.xxs
    spacing: Style.spacing.xs

    Text {
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: root.open ? "󰅃" : "󰅀"
      color: Qt.darker(root.foreground, 1.2)
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    PanelSectionHeader {
      anchors.verticalCenter: parent.verticalCenter
      text: Strings.t("inspector.advanced", "ADVANCED")
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Rectangle {
      visible: root.changed
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(6)
      height: width
      radius: width / 2
      color: root.accent
    }
  }

  Text {
    anchors.left: lead.right
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.leftMargin: Style.spacing.md
    anchors.rightMargin: Style.spacing.xxs
    visible: !root.open && root.summary !== ""
    textFormat: Text.PlainText
    text: root.summary
    horizontalAlignment: Text.AlignRight
    color: root.accent
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
  }

  HoverHandler { id: hover }
  MouseArea {
    anchors.fill: parent
    cursorShape: Qt.PointingHandCursor
    onClicked: root.toggled()
  }
}
