import QtQuick

// A small bordered text action in the panel's flat style. Plain QtQuick so the
// wallpaper page stays testable outside the shell.
Rectangle {
  id: root

  property string text: ""
  property color foreground: "white"
  property string fontFamily: ""
  property real fontSize: 13
  property real unit: 1

  signal clicked()

  implicitWidth: label.implicitWidth + Math.round(20 * unit)
  implicitHeight: Math.round(28 * unit)
  radius: Math.round(4 * unit)
  color: area.containsMouse && enabled
    ? Qt.rgba(foreground.r, foreground.g, foreground.b, 0.08) : "transparent"
  border.width: 1
  border.color: Qt.rgba(foreground.r, foreground.g, foreground.b, enabled ? 0.25 : 0.1)
  opacity: enabled ? 1 : 0.45

  Text {
    id: label
    anchors.centerIn: parent
    textFormat: Text.PlainText
    text: root.text
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: root.fontSize
  }

  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    enabled: root.enabled
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
