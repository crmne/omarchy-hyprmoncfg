import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

BorderSurface {
  id: root

  property var profile: ({ outputs: [] })
  property var editorDisplays: []
  property var workspacePlan: []
  property string selectedKey: ""
  property bool interactive: true
  property bool selectable: interactive
  property bool movable: interactive
  // Every canvas uses the same monitor-card anatomy. Emphasis changes visual
  // priority for the active task; it never changes what the monitor means.
  property string emphasis: "layout"
  property bool detailed: true
  property bool framed: true
  property bool markDisconnected: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  signal outputSelected(string key)
  signal outputIdentifyRequested(string key)
  signal outputMoved(string key, int x, int y, int snapDistance)

  readonly property var displays: Model.profileLayoutDisplays(profile, editorDisplays)
  readonly property var bounds: Model.layoutBounds(displays)
  readonly property var metrics: Model.layoutMetrics(bounds, canvas.width, canvas.height, Style.space(8))
  readonly property var nonSpatialDisplays: Model.nonSpatialDisplays(profile, editorDisplays, markDisconnected)

  implicitHeight: Style.space(205)
  color: framed ? Qt.rgba(foreground.r, foreground.g, foreground.b, 0.025) : "transparent"
  borderSpec: framed ? Border.controlSpec("normal", foreground, accent) : Border.none()
  radius: framed ? Style.cornerRadius : 0

  Flow {
    id: hiddenStrip
    visible: root.nonSpatialDisplays.length > 0
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.leftMargin: Style.space(10)
    anchors.rightMargin: Style.space(10)
    anchors.topMargin: Style.space(7)
    spacing: Style.space(4)

    Repeater {
      model: root.nonSpatialDisplays
      Button {
        required property var modelData
        text: String(modelData.name) + " · " + String(modelData.state)
        width: Math.min(implicitWidth, hiddenStrip.width)
        selected: String(modelData.key) === root.selectedKey
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.body
        enabled: root.selectable
        focusable: root.selectable
        onClicked: root.outputSelected(String(modelData.key))
      }
    }
  }

  Item {
    id: canvas
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: hiddenStrip.visible ? hiddenStrip.bottom : parent.top
    anchors.bottom: parent.bottom
    anchors.margins: Style.space(8)
    anchors.topMargin: hiddenStrip.visible ? Style.space(5) : Style.space(8)

    Repeater {
      model: 8
      Rectangle {
        required property int index
        x: Math.round(index * canvas.width / 7)
        width: 1
        height: canvas.height
        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.10)
      }
    }

    Repeater {
      model: 6
      Rectangle {
        required property int index
        y: Math.round(index * canvas.height / 5)
        width: canvas.width
        height: 1
        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.10)
      }
    }

    Repeater {
      model: root.displays

      Rectangle {
        id: card
        required property var modelData
        readonly property var previewRect: Model.layoutRect(modelData, root.bounds, canvas.width, canvas.height, Style.space(8))
        property real dragOffsetX: 0
        property real dragOffsetY: 0
        readonly property bool selected: String(modelData.key || "") === root.selectedKey
        readonly property string workspaceText: Model.workspaceText(root.workspacePlan, modelData.key)
        readonly property var summary: Model.displaySummary(modelData,
          Model.editorMetadata(root.editorDisplays, modelData.key), root.workspacePlan)
        readonly property bool disconnected: root.markDisconnected && modelData.connected === false
        readonly property int fullDetailHeight: Style.space(workspaceText !== ""
          ? (disconnected ? 110 : 98)
          : (disconnected ? 98 : 86))
        readonly property bool compact: width < Style.space(155) || height < fullDetailHeight
        readonly property bool hasModelRoom: root.detailed && height >= Style.space(56)

        x: previewRect.x + dragOffsetX
        y: previewRect.y + dragOffsetY
        width: previewRect.width
        height: previewRect.height
        radius: Math.min(Style.cornerRadius, Style.space(5))
        color: selected
          ? Style.selectedFillFor(root.foreground, root.accent)
          : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.045)
        border.width: selected ? Math.max(1, Style.normalBorderWidth) : 1
        border.color: selected ? root.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.55)

        Behavior on color { ColorAnimation { duration: 100 } }

        Column {
          anchors.centerIn: parent
          width: Math.max(0, parent.width - Style.space(10))
          spacing: Style.space(1)

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: card.summary.connector
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: card.hasModelRoom
            width: parent.width
            text: card.summary.model
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: card.disconnected
            width: parent.width
            text: "not connected"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.italic: true
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: !card.compact && root.detailed
            width: parent.width
            text: card.summary.mode
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: !card.compact && root.detailed
            width: parent.width
            text: card.summary.placement
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: card.workspaceText !== ""
            width: parent.width
            text: card.summary.workspaces
            color: root.emphasis === "layout"
              ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.78)
              : root.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: root.emphasis !== "layout"
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }
        }

        MouseArea {
          id: dragArea
          anchors.fill: parent
          enabled: root.selectable
          hoverEnabled: true
          cursorShape: root.movable
            ? (dragStarted ? Qt.ClosedHandCursor : Qt.OpenHandCursor)
            : Qt.PointingHandCursor
          // Pointer coordinates must come from the stationary canvas. Using
          // mouse.x/y directly makes the origin move with the card and feeds
          // the card's own movement back into the next drag delta.
          property real pointerStartX: 0
          property real pointerStartY: 0
          property bool dragStarted: false
          property bool identifyClickPending: false

          onPressed: function(mouse) {
            root.outputSelected(String(card.modelData.key || ""))
            var point = dragArea.mapToItem(canvas, mouse.x, mouse.y)
            pointerStartX = point.x
            pointerStartY = point.y
            dragStarted = false
            identifyClickPending = true
            card.dragOffsetX = 0
            card.dragOffsetY = 0
          }
          onPositionChanged: function(mouse) {
            if (!pressed) return
            var point = dragArea.mapToItem(canvas, mouse.x, mouse.y)
            var deltaX = point.x - pointerStartX
            var deltaY = point.y - pointerStartY
            var threshold = Style.space(6)
            if (deltaX * deltaX + deltaY * deltaY >= threshold * threshold)
              identifyClickPending = false
            if (!root.movable) return
            if (!dragStarted) {
              if (deltaX * deltaX + deltaY * deltaY < threshold * threshold) return
              dragStarted = true
            }
            card.dragOffsetX = deltaX
            card.dragOffsetY = deltaY
          }
          onReleased: function(mouse) {
            if (!root.movable || !dragStarted) {
              card.dragOffsetX = 0
              card.dragOffsetY = 0
              return
            }
            var scale = Math.max(0.0001, Number(root.metrics.scale || 1))
            var nextX = Math.round(Number(card.modelData.x || 0) + card.dragOffsetX / scale)
            var nextY = Math.round(Number(card.modelData.y || 0) + card.dragOffsetY / scale)
            var snap = Math.max(1, Math.round(Style.space(12) / scale))
            card.dragOffsetX = 0
            card.dragOffsetY = 0
            dragStarted = false
            root.outputMoved(String(card.modelData.key || ""), nextX, nextY, snap)
          }
          onClicked: {
            if (identifyClickPending)
              root.outputIdentifyRequested(String(card.modelData.key || ""))
            identifyClickPending = false
          }
          onCanceled: {
            dragStarted = false
            identifyClickPending = false
            card.dragOffsetX = 0
            card.dragOffsetY = 0
          }
        }
      }
    }

    Text {
      textFormat: Text.PlainText
      visible: root.displays.length === 0
      anchors.centerIn: parent
      text: "No enabled displays"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }
  }
}
