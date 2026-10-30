import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Omarchy's display glyphs, optically sized independently of the status mark.
Item {
  id: root
  property int monitorCount: 1
  property bool connected: false
  property real size: Style.space(28)
  property real fontSize: size
  property string fontFamily: Style.font.family
  property color foreground: Commons.Color.foreground
  readonly property real paintedWidth: monitor.paintedWidth
  readonly property real paintedHeight: monitor.paintedHeight
  implicitWidth: size
  implicitHeight: size

  OpticalGlyph {
    id: monitor
    anchors.fill: parent
    text: root.monitorCount > 1 ? "󰍺" : "󰍹"
    fontFamily: root.fontFamily
    fontSize: root.fontSize
    paintedSize: root.size
    color: root.foreground
  }
  OpticalGlyph {
    id: check
    visible: root.connected
    width: Math.max(Style.space(5), root.size * 0.3)
    height: width
    x: (root.width + monitor.paintedWidth) / 2 - width * 0.65
    y: (root.height + monitor.paintedHeight) / 2 - height * 0.45
    text: "󰄬"
    fontFamily: root.fontFamily
    fontSize: width
    paintedSize: width
    color: Commons.Color.accent
  }
}
