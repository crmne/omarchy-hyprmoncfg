import QtQuick

Item {
  property string text: ""
  property color color: "white"
  property string fontFamily: ""
  property int fontSize: 14
  property real paintedSize: 0
  readonly property real paintedWidth: paintedSize
  readonly property real paintedHeight: paintedSize
}
