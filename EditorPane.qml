import QtQuick
import qs.Commons
import qs.Ui

// Direction A: panes are flat sections in Omarchy's first-party vocabulary
// (uppercase section header, right-aligned meta, no box). Only a pane that
// hosts a spatial canvas opts into `surface`, the one tinted well per page.
BorderSurface {
  id: root

  default property alias paneData: content.data
  property string title: ""
  property string meta: ""
  property bool active: false
  property bool surface: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property real inset: surface ? Style.space(10) : 0

  color: surface ? Qt.rgba(foreground.r, foreground.g, foreground.b, 0.03) : "transparent"
  borderSpec: Border.none()
  radius: Style.cornerRadius

  Item {
    id: titleBar
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.leftMargin: root.inset
    anchors.rightMargin: root.inset
    anchors.topMargin: root.surface ? Style.space(6) : 0
    height: root.title !== "" || root.meta !== "" ? Style.space(24) : 0
    visible: root.title !== "" || root.meta !== ""

    // Keyboard focus between panes stays visible without a box: a short
    // accent rule beside the active section title.
    Rectangle {
      id: activeRule
      visible: root.active
      anchors.left: parent.left
      anchors.verticalCenter: titleLabel.verticalCenter
      width: Style.space(3)
      height: titleLabel.font.pixelSize
      radius: width / 2
      color: root.accent
    }

    PanelSectionHeader {
      id: titleLabel
      width: Math.min(implicitWidth, parent.width * (root.meta !== "" ? 0.7 : 1))
      anchors.left: activeRule.visible ? activeRule.right : parent.left
      anchors.leftMargin: activeRule.visible ? Style.space(6) : 0
      anchors.verticalCenter: parent.verticalCenter
      text: root.title.toUpperCase()
      foreground: root.active ? Qt.lighter(root.dim, 1.4) : root.foreground
      fontFamily: root.fontFamily
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: Math.max(0, parent.width - titleLabel.width - Style.space(12))
      text: root.meta
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      horizontalAlignment: Text.AlignRight
      elide: Text.ElideRight
    }
  }

  Item {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: titleBar.visible ? titleBar.bottom : parent.top
    anchors.bottom: parent.bottom
    anchors.topMargin: titleBar.visible ? Style.space(6) : root.inset
    anchors.leftMargin: root.inset
    anchors.rightMargin: root.inset
    anchors.bottomMargin: root.inset
  }
}
