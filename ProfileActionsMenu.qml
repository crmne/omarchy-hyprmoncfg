import QtQuick
import QtQuick.Controls

// Render inside the layer-shell card, not Qt's separate popup overlay.
FocusScope {
  id: root
  anchors.fill: parent
  z: 300
  visible: false
  property real preferredWidth: 260
  property string targetName: ""
  property var actions: []
  property color foreground: "#eeeeee"
  property color backgroundColor: "#252525"
  property color accent: "#88aaff"
  property string fontFamily: "monospace"
  property real fontSize: 14
  property real rowHeight: 36
  property alias menuX: card.x
  property alias menuY: card.y
  readonly property real menuWidth: card.width
  readonly property real menuHeight: card.height
  readonly property bool opened: visible
  property int currentIndex: 0
  signal chosen(string action)
  signal closed()

  function close() { visible = false; closed() }
  function activate(index) {
    var action = actions[index]
    if (!action || action.enabled === false) return
    close()
    chosen(String(action.id))
  }
  function itemAt(index) { return entries.itemAt(index) }
  function openAt(anchor, localX, localY) {
    if (!anchor) return
    var atPointer = localX !== undefined && localY !== undefined
    var point = anchor.mapToItem(root, atPointer ? localX : anchor.width - card.width,
      atPointer ? localY : anchor.height)
    card.x = Math.max(0, Math.min(point.x, width - card.width))
    card.y = point.y + card.height <= height ? point.y
      : Math.max(0, point.y - (atPointer ? 0 : anchor.height) - card.height)
    currentIndex = 0
    visible = true
    forceActiveFocus()
  }
  Keys.onEscapePressed: close()
  Keys.onDownPressed: currentIndex = (currentIndex + 1) % Math.max(1, actions.length)
  Keys.onUpPressed: currentIndex = (currentIndex + actions.length - 1) % Math.max(1, actions.length)
  Keys.onReturnPressed: activate(currentIndex)
  Keys.onEnterPressed: activate(currentIndex)

  MouseArea { anchors.fill: parent; onClicked: root.close() }
  Rectangle {
    id: card
    width: Math.min(root.preferredWidth, root.width)
    height: rows.implicitHeight + 8
    color: root.backgroundColor
    border.color: root.accent
    radius: 5
    Column {
      id: rows
      x: 4; y: 4
      width: parent.width - 8
      Repeater {
        id: entries
        model: root.actions
        delegate: Rectangle {
          required property var modelData
          required property int index
          width: rows.width
          height: root.rowHeight
          color: root.currentIndex === index ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.18) : "transparent"
          Text {
            textFormat: Text.PlainText
            anchors.fill: parent
            anchors.margins: 8
            text: String(modelData.label)
            color: root.foreground
            opacity: modelData.enabled === false ? 0.4 : 1
            font.family: root.fontFamily
            font.pixelSize: root.fontSize
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
          }
          MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onEntered: root.currentIndex = index
            onClicked: root.activate(index)
          }
        }
      }
    }
  }
}
