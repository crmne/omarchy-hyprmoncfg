import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

Item {
  id: root
  property var offer: ({ label: "Install picker", description: "", enabled: true })
  property bool hasCursor: false
  property var previewGroups: []
  property string blockedReason: ""
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  signal activated()
  implicitHeight: Style.space(12) + Math.max(copy.implicitHeight, action.implicitHeight)

  Rectangle {
    anchors.bottom: parent.bottom
    width: parent.width; height: 1
    color: Util.alpha(root.foreground, 0.14)
  }
  Column {
    id: copy
    x: 0; y: 0
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
    Flow {
      width: parent.width
      spacing: Style.space(7)
      Repeater {
        model: root.previewGroups
        Row {
          required property var modelData
          spacing: Style.space(1)
          Repeater {
            model: modelData.workspaces
            Text {
              required property var modelData
              width: Style.space(20); height: Style.space(26)
              text: String(modelData)
              textFormat: Text.PlainText
              horizontalAlignment: Text.AlignHCenter
              verticalAlignment: Text.AlignVCenter
              font.family: root.fontFamily; font.pixelSize: Style.bar.iconFont
              color: root.foreground
            }
          }
        }
      }
    }
  }
  Button {
    id: action
    anchors.right: parent.right
    y: 0
    text: root.offer.label
    enabled: root.offer.enabled
    hasCursor: root.hasCursor
    onClicked: root.activated()
  }
}
