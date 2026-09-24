import QtQuick
import qs.Commons

Row {
  id: root
  property string title: ""
  property string subtitle: ""
  property string iconText: "󰍹"
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property string fontFamily: Style.font.family

  spacing: Style.space(12)
  height: Math.max(statusIcon.implicitHeight, labels.implicitHeight)

  Text {
    id: statusIcon
    anchors.verticalCenter: parent.verticalCenter
    textFormat: Text.PlainText
    text: root.iconText
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.icon
  }

  Column {
    id: labels
    width: Math.max(0, parent.width - statusIcon.width - parent.spacing)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(1)

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.title
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: true
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.subtitle
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
    }
  }
}
