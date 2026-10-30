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
  property bool optical: true
  property string fontFamily: Style.font.family
  property color foreground: Commons.Color.foreground
  readonly property real paintedWidth: optical ? monitor.paintedWidth : heroMetrics.tightBoundingRect.width
  readonly property real paintedHeight: optical ? monitor.paintedHeight : heroMetrics.tightBoundingRect.height
  implicitWidth: optical ? size : hero.implicitWidth
  implicitHeight: optical ? size : hero.implicitHeight

  OpticalGlyph {
    id: monitor
    visible: root.optical
    anchors.fill: parent
    text: root.monitorCount > 1 ? "󰍺" : "󰍹"
    fontFamily: root.fontFamily
    fontSize: root.fontSize
    paintedSize: root.size
    color: root.foreground
  }
  Text {
    id: hero
    visible: !root.optical
    textFormat: Text.PlainText
    text: monitor.text
    font.family: root.fontFamily
    font.pixelSize: root.fontSize
    color: root.foreground
  }
  TextMetrics { id: heroMetrics; text: hero.text; font: hero.font }
  OpticalGlyph {
    id: check
    visible: root.connected
    width: Math.max(Style.space(6), root.fontSize * 0.3)
    height: width
    x: (root.optical ? (root.width + root.paintedWidth) / 2
      : heroMetrics.tightBoundingRect.x + root.paintedWidth) - width * 0.65
    y: (root.optical ? (root.height + root.paintedHeight) / 2
      : hero.baselineOffset + heroMetrics.tightBoundingRect.y + root.paintedHeight) - height * 0.45
    text: "󰄬"
    fontFamily: root.fontFamily
    fontSize: width
    paintedSize: width
    color: Commons.Color.accent
  }
}
