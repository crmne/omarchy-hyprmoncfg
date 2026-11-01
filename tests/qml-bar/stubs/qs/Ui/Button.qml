import QtQuick

Rectangle {
  property string text: ""
  property bool selected: false
  property bool bordered: false
  property bool focusable: true
  property color foreground: "white"
  property string fontFamily: ""
  property real fontSize: 12
  signal clicked()
}
