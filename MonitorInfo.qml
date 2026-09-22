import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

BorderSurface {
  id: root
  property var output: null
  property var metadata: ({})
  property bool canIdentify: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property var info: Model.monitorHardwareInfo(output, metadata)
  signal identifyRequested()
  implicitHeight: rows.implicitHeight + Style.space(20)
  color: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.018)
  borderSpec: Border.controlSpec("normal", foreground, accent)
  radius: Style.cornerRadius

  Column {
    id: rows
    x: Style.space(10)
    y: Style.space(10)
    width: parent.width - Style.space(20)
    spacing: Style.space(4)
    Repeater {
      model: root.info.basic.concat(root.info.details)
      delegate: Row {
        required property var modelData
        width: rows.width
        spacing: Style.space(8)
        Text {
          textFormat: Text.PlainText
          width: parent.width * 0.38
          text: modelData.label
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        Text {
          textFormat: Text.PlainText
          width: parent.width * 0.62 - parent.spacing
          text: modelData.value
          wrapMode: Text.Wrap
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
    Row {
      spacing: Style.space(6)
      Button {
        text: "Identify"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: "Identify this display"
        focusable: true
        enabled: root.canIdentify
        onClicked: root.identifyRequested()
      }
    }
  }
}
