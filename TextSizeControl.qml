import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Omarchy's TEXT SIZE control, as in its own Display panel: the same stops, the
// same notched PanelSlider, the px value right-aligned in the header, applied
// only when the knob is released. It is a desktop-wide live setting (shell base
// font, GTK text scaling and terminal font) that Omarchy owns; this control
// only asks Omarchy's command to change it, and nothing is stored in a profile.
Column {
  id: root

  property var bar: null
  // Pending stop while a change is in flight; -1 follows the live base size.
  property int previewIndex: -1
  property int baseSize: Style.font.baseSize
  property bool hasCursor: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property alias dragging: slider.dragging

  signal committed(int pixels)
  signal hoveredRow()

  spacing: Style.space(5)

  Item {
    width: parent.width
    implicitHeight: Math.max(title.implicitHeight, pixels.implicitHeight)

    PanelSectionHeader {
      id: title
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: "TEXT SIZE"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Text {
      id: pixels
      textFormat: Text.PlainText
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: slider.dragging
        ? Model.textSizeStops[Math.round(slider.liveValue)] + "px"
        : Model.textSizeLabel(root.previewIndex, root.baseSize)
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
  }

  CursorSurface {
    width: parent.width
    height: slider.implicitHeight + Style.spacing.controlGap
    hasCursor: root.hasCursor
    foreground: root.foreground
    accent: root.accent

    PanelSlider {
      id: slider
      bar: root.bar
      anchors.fill: parent
      anchors.leftMargin: Style.space(2)
      anchors.rightMargin: Style.space(2)
      minimum: 0
      maximum: Model.textSizeStops.length - 1
      step: 1
      integer: true
      tickCount: Model.textSizeStops.length
      value: Model.textStopIndex(root.previewIndex, root.baseSize)
      onReleased: function(next) { root.committed(Model.textSizeStops[Math.round(next)]) }
    }

    HoverHandler { onHoveredChanged: if (hovered) root.hoveredRow() }
  }
}
