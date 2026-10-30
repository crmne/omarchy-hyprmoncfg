import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

Item {
  id: root
  property var offer: ({ label: "Install picker", description: "", enabled: true })
  property bool hasCursor: false
  property string blockedReason: ""
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  signal activated()
  implicitHeight: Style.space(12) + Math.max(copy.implicitHeight, action.implicitHeight)

  Rectangle {
    width: parent.width; height: 1
    color: Util.alpha(root.foreground, 0.14)
  }
  Column {
    id: copy
    x: 0; y: Style.space(12)
    width: Math.max(0, parent.width - action.width - Style.space(16))
    spacing: Style.space(4)
    Text {
      width: parent.width
      wrapMode: Text.WordWrap
      text: "hyprmoncfg Workspaces"
      textFormat: Text.PlainText
      color: root.foreground
      font.family: root.fontFamily; font.pixelSize: Style.font.body
    }
    Text {
      width: parent.width
      text: root.blockedReason || root.offer.description
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      color: Util.alpha(root.foreground, 0.65)
      font.family: root.fontFamily; font.pixelSize: Style.font.caption
    }
  }
  Button {
    id: action
    anchors.right: parent.right
    y: Style.space(12)
    text: root.offer.label
    enabled: root.offer.enabled
    hasCursor: root.hasCursor
    onClicked: root.activated()
  }
}
