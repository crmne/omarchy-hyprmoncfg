import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Direction A: hardware facts as a flat definition list under a section
// header. Identify, the only action here, sits on the header line so the six
// fields read as one block and the inspector gains a row of height.
Item {
  id: root
  property var output: null
  property var metadata: ({})
  property bool canIdentify: false
  // Two columns when the facts sit under a wide stage; reading order is kept
  // (Connector, Model, Max resolution, Panel size, Type, Serial).
  property int columns: 1
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property var info: Model.monitorHardwareInfo(output, metadata)
  signal identifyRequested()
  implicitHeight: header.height + Style.space(8) + rows.implicitHeight

  Item {
    id: header
    width: parent.width
    height: Math.max(headerLabel.implicitHeight, identifyButton.implicitHeight)

    PanelSectionHeader {
      id: headerLabel
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: "HARDWARE"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Button {
      id: identifyButton
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: "Identify"
      bordered: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      horizontalPadding: Style.space(8)
      verticalPadding: Style.space(3)
      tooltipText: "Identify this display"
      focusable: true
      enabled: root.canIdentify
      onClicked: root.identifyRequested()
    }
  }

  Grid {
    id: rows
    anchors.top: header.bottom
    anchors.topMargin: Style.space(8)
    width: parent.width
    columns: Math.max(1, root.columns)
    columnSpacing: Style.space(20)
    rowSpacing: Style.space(5)
    readonly property real cellWidth: Model.gridCellWidth(width, columnSpacing, columns)
    Repeater {
      model: root.info.basic.concat(root.info.details)
      delegate: Row {
        required property var modelData
        width: rows.cellWidth
        spacing: Style.space(8)
        Text {
          textFormat: Text.PlainText
          width: Math.min(parent.width * 0.4, Style.space(112))
          text: modelData.label
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        Text {
          textFormat: Text.PlainText
          width: parent.width - parent.children[0].width - parent.spacing
          text: modelData.value
          wrapMode: Text.Wrap
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
  }
}
