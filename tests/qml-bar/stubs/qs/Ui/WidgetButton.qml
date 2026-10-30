import QtQuick
Item {
  property QtObject bar: null
  property string text: ""
  property bool dimmed: false
  property string tooltipText: ""
  property color foreground: "white"
  property string fontFamily: "monospace"
  property real fontSize: 14
  property bool labelVisible: true
  property real pressScale: 1
  property bool vertical: false
  property real fixedWidth: -1
  property real fixedHeight: -1
  signal pressed(int mouseButton)
  implicitWidth: fixedWidth > 0 ? fixedWidth : 27
  implicitHeight: fixedHeight > 0 ? fixedHeight : 26
}
