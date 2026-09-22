import QtQuick
import qs.Commons
import qs.Ui

BorderSurface {
  id: root

  default property alias paneData: content.data
  property string title: ""
  property string meta: ""
  property bool active: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  color: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.018)
  borderSpec: Border.controlSpec(active ? "focus" : "normal", foreground, accent)
  radius: Style.cornerRadius

  Item {
    id: titleBar
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.leftMargin: Style.space(10)
    anchors.rightMargin: Style.space(10)
    height: root.title !== "" || root.meta !== "" ? Style.space(28) : Style.space(10)
    visible: root.title !== "" || root.meta !== ""

    Text {
      textFormat: Text.PlainText
      id: titleLabel
      width: Math.min(implicitWidth, parent.width * (root.meta !== "" ? 0.7 : 1))
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: root.title
      color: root.active ? root.accent : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: true
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
    anchors.top: titleBar.bottom
    anchors.bottom: parent.bottom
    anchors.leftMargin: Style.space(10)
    anchors.rightMargin: Style.space(10)
    anchors.bottomMargin: Style.space(10)
  }
}
