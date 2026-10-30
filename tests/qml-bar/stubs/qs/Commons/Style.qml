pragma Singleton
import QtQml

QtObject {
  property int cornerRadius: 0
  property QtObject bar: QtObject {
    property int iconFont: 14
    property int iconSlot: 27
    property int iconCanvas: 16
    property int iconSize: 12
  }
  property QtObject font: QtObject {
    property string family: "monospace"
    property int body: 14
    property int bodySmall: 12
  }
  property QtObject spacing: QtObject {
    property int controlPaddingX: 10
    property int controlPaddingY: 6
    property int inputPaddingY: 7
    property int controlHeight: 30
    property int numberFieldWidth: 120
    property int md: 8
  }
  function space(n) { return n }
  function spaceReal(n) { return n }
  function controlFill(focused, hot, foreground, accent) { return focused ? "#303030" : (hot ? "#282828" : "#202020") }
  function selectionFillFor(foreground, accent) { return "#5070a0" }
  function selectedFillFor(foreground, accent) { return "#405060" }
}
