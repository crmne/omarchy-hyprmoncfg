import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model
import "Strings.js" as Strings

// Omarchy's TEXT SIZE control, as in its own Display panel: the same stops, the
// same notched PanelSlider, the px value right-aligned in the header, applied
// only when the knob is released. It is a desktop-wide live setting (shell base
// font, GTK text scaling and terminal font) that Omarchy owns; this control
// only asks Omarchy's command to change it, and nothing is stored in a profile.
// The TERMINAL row is the same control over the terminal font alone, in pt.
Column {
  id: root

  property var bar: null
  property string title: Strings.t("textSize.title", "TEXT SIZE")
  property var stops: Model.textSizeStops
  property string unit: "px"
  // Pending stop while a change is in flight; -1 follows the live size.
  property int previewIndex: -1
  property int baseSize: Style.font.baseSize
  property bool hasCursor: false
  property color foreground: Commons.Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family
  readonly property alias dragging: slider.dragging

  signal committed(int size)
  signal hoveredRow()

  spacing: Style.space(5)

  Item {
    width: parent.width
    implicitHeight: Math.max(header.implicitHeight, valueLabel.implicitHeight)

    PanelSectionHeader {
      id: header
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: root.title
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Text {
      id: valueLabel
      textFormat: Text.PlainText
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: Strings.number(slider.dragging ? root.stops[Math.round(slider.liveValue)]
        : root.previewIndex >= 0 ? root.stops[Math.min(root.previewIndex, root.stops.length - 1)]
        : root.baseSize) + root.unit
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
      maximum: root.stops.length - 1
      step: 1
      integer: true
      tickCount: root.stops.length
      value: root.previewIndex >= 0 ? Math.min(root.previewIndex, root.stops.length - 1)
        : Model.nearestStop(root.stops, root.baseSize)
      onReleased: function(next) { root.committed(root.stops[Math.round(next)]) }
    }

    HoverHandler { onHoveredChanged: if (hovered) root.hoveredRow() }
  }
}
