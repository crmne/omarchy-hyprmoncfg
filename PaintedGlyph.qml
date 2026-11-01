import QtQuick
import qs.Commons
import qs.Commons as Commons

// A glyph fitted to a painted size, measured from its ink rather than its line
// box. Omarchy's OpticalGlyph does this from 4.5 on; 4.0's has no paintedSize,
// and assigning one there stops the whole bar widget loading.
Item {
  id: root

  property string text: ""
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.body
  property real paintedSize: 0
  property color color: Commons.Color.foreground

  // Tight bounds come back in whole pixels, so measure a hundred times larger.
  readonly property int metricsScale: 100
  readonly property int renderedFontSize: Math.max(1, Math.round(fontSize))
  readonly property rect ink: Qt.rect(glyphMetrics.tightBoundingRect.x / metricsScale,
    glyphMetrics.tightBoundingRect.y / metricsScale,
    glyphMetrics.tightBoundingRect.width / metricsScale,
    glyphMetrics.tightBoundingRect.height / metricsScale)
  readonly property real tightWidth: Math.max(1, ink.width)
  readonly property real tightHeight: Math.max(1, ink.height)
  readonly property real paintedScale: paintedSize > 0
    ? Math.min(paintedSize, width, height) / Math.max(tightWidth, tightHeight)
    : 1
  readonly property real paintedWidth: tightWidth * paintedScale
  readonly property real paintedHeight: tightHeight * paintedScale

  TextMetrics {
    id: glyphMetrics
    font.family: root.fontFamily
    font.pixelSize: root.renderedFontSize * root.metricsScale
    text: root.text
  }

  Text {
    textFormat: Text.PlainText
    x: root.width / 2 - (root.ink.x + root.tightWidth / 2) * root.paintedScale
    y: root.paintedSize > 0
      ? root.height / 2 - (baselineOffset + root.ink.y + root.tightHeight / 2) * root.paintedScale
      : Math.round((root.height - height) / 2)
    text: root.text
    color: root.color
    font.family: root.fontFamily
    font.pixelSize: root.renderedFontSize
    transformOrigin: Item.TopLeft
    scale: root.paintedScale
    // Distance fields: the curve renderer's antialiasing steps at bar sizes.
    renderType: root.paintedSize > 0 ? Text.QtRendering : Text.NativeRendering
  }
}
