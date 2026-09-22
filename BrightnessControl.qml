import QtQuick
import qs.Commons
import qs.Ui

Column {
  id: root

  property var bar: null
  property string connector: ""
  property string displayLabel: ""
  property int value: 1
  property bool available: false
  property bool loading: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  signal previewed(real value)
  signal committed(real value)

  spacing: Style.space(5)

  Item {
    width: parent.width
    implicitHeight: Math.max(brightnessTitle.implicitHeight, brightnessValue.implicitHeight)

    PanelSectionHeader {
      id: brightnessTitle
      anchors.left: parent.left
      anchors.right: brightnessValue.left
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      text: "Brightness"
      elide: Text.ElideRight
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Text {
      textFormat: Text.PlainText
      id: brightnessValue
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: root.loading ? "…" : (root.available ? root.value + "%" : "Unavailable")
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
  }

  Text {
    textFormat: Text.PlainText
    width: parent.width
    text: "Selected display · " + root.displayLabel
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    elide: Text.ElideRight
  }

  CursorSurface {
    width: parent.width
    height: Math.max(brightnessSlider.implicitHeight + Style.spacing.controlGap,
      brightnessStatus.implicitHeight + Style.space(12))
    enabled: root.available
    opacity: root.loading ? 0.6 : 1.0
    outline: true
    foreground: root.foreground
    accent: root.accent

    PanelSlider {
      id: brightnessSlider
      visible: root.available
      bar: root.bar
      anchors.fill: parent
      anchors.leftMargin: Style.space(6)
      anchors.rightMargin: Style.space(6)
      minimum: 1
      maximum: 100
      step: 1
      value: root.value
      integer: true
      onMoved: function(next) { root.previewed(next) }
      onReleased: function(next) { root.committed(next) }
    }

    Text {
      textFormat: Text.PlainText
      id: brightnessStatus
      visible: !root.available
      anchors.centerIn: parent
      width: Math.max(0, parent.width - Style.space(12))
      text: root.loading ? "Reading selected display…" : "Brightness unavailable for this display"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      horizontalAlignment: Text.AlignHCenter
      elide: Text.ElideRight
    }
  }
}
