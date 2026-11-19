import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

Item {
  id: root
  property string label: ""
  property var workspaceIds: []
  property bool switchingEnabled: false
  // Per display labels each workspace by its slot on its display (11 reads 1).
  property bool slotLabels: false
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  signal chosen(int workspaceId)
  implicitHeight: Math.max(name.implicitHeight, numbers.implicitHeight)
  Text {
    id: name
    width: Math.min(parent.width * 0.5, Style.space(220))
    text: root.label
    textFormat: Text.PlainText
    elide: Text.ElideRight
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    color: Util.alpha(root.foreground, 0.65)
  }
  Flow {
    id: numbers
    x: name.width + Style.space(8)
    width: Math.max(0,parent.width-x)
    spacing: Style.space(3)
    Repeater {
      model: root.workspaceIds
      Button {
        required property var modelData
        text: root.slotLabels ? Model.workspaceSlot(modelData) : String(modelData)
        foreground: Commons.Color.accent
        fontFamily: root.fontFamily
        fontSize: Style.font.body
        horizontalPadding: Style.space(3)
        verticalPadding: 0
        focusable: true
        enabled: root.switchingEnabled
        onClicked: root.chosen(Number(modelData))
      }
    }
  }
}
