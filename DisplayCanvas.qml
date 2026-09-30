import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Direction B: the arrangement is a stage. Each display is drawn as a screen
// (bezel plus lit panel) so the canvas reads as hardware at a glance; the
// selected screen is the only one lit with the theme accent. Every value is
// still the shared display summary: connector, model with size, compact
// mode, Scale/Position, and bare workspace IDs.
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
  property bool dotted: framed
  // Keyboard focus on the stage (Layout page): a quiet accent outline.
  property bool focusOutline: false
  // True while a display card is pressed; the panel never resizes mid-drag.
  property bool dragging: false
  // Output key to a short note from the daemon's display health, such as
  // "No usable signal" or "Running without VRR". See Model.displayNotes.
  property var notes: ({})
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property real stagePadding: detailed ? Style.space(14) : Style.space(3)

  // ---- Workspace chip travel. When a plan change moves a workspace to another
  // display, its chip glides there instead of popping. The decision is
  // Model.chipMoves (pure); this only measures chips and animates ghosts. The
  // settled picture is exactly what it would be without any animation.
  property bool chipTravelEnabled: false
  property bool reducedMotion: false
  property bool resizing: false
  property int chipTravelDuration: Model.chipTravel.duration
  property var chipItems: ({})
  property var chipRects: ({})
  property var travelingChips: []
  property var travelingIds: ({})
  property bool chipTravelPending: false

  function registerChip(id, item) { root.chipItems[id] = item }
  function unregisterChip(id, item) { if (root.chipItems[id] === item) delete root.chipItems[id] }

  function snapshotChips() {
    var rects = {}
    for (var id in root.chipItems) {
      var item = root.chipItems[id]
      if (!item || !item.parent || !item.parent.visible) continue
      if (typeof item.parent.forceLayout === "function") item.parent.forceLayout()
      var point = item.mapToItem(canvas, 0, 0)
      rects[id] = { x: point.x, y: point.y, width: item.width, height: item.height, owner: item.ownerKey }
    }
    return rects
  }

  function endChipTravel() {
    root.travelingIds = ({})
    root.travelingChips = []
  }

  function chipArrived(id) {
    var left = Object.assign({}, root.travelingIds)
    delete left[id]
    root.travelingIds = left
    if (Object.keys(left).length === 0) root.travelingChips = []
  }

  // Coalesces a burst of changes (profile and plan usually change together)
  // into one comparison of the last settled chips with the new ones.
  function chipsChanged(animate) {
    if (root.chipTravelPending) return
    root.chipTravelPending = true
    var before = root.chipRects
    Qt.callLater(function() {
      root.chipTravelPending = false
      var after = root.snapshotChips()
      root.chipRects = after
      root.endChipTravel()
      var moves = animate ? Model.chipMoves(before, after, {
        enabled: root.chipTravelEnabled && root.visible, dragging: root.dragging,
        resizing: root.resizing, reducedMotion: root.reducedMotion
      }) : []
      if (moves.length === 0) return
      var ids = {}
      for (var i = 0; i < moves.length; i++) ids[moves[i].id] = true
      root.travelingIds = ids
      root.travelingChips = moves
    })
  }

  onWorkspacePlanChanged: root.chipsChanged(true)
  onProfileChanged: root.chipsChanged(true)
  onWidthChanged: root.chipsChanged(false)
  onHeightChanged: root.chipsChanged(false)
  onDraggingChanged: if (root.dragging) root.endChipTravel()
  onResizingChanged: if (root.resizing) root.endChipTravel()
  Component.onCompleted: root.chipsChanged(false)

  signal outputSelected(string key)
  signal outputMoved(string key, int x, int y, int snapDistance)

  readonly property var displays: Model.profileLayoutDisplays(profile, editorDisplays, notes)
  readonly property var bounds: Model.layoutBounds(displays)
  readonly property var metrics: Model.layoutMetrics(bounds, canvas.width, canvas.height, root.stagePadding)
  readonly property var nonSpatialDisplays: Model.nonSpatialDisplays(profile, editorDisplays, markDisconnected, notes)

  implicitHeight: Style.space(205)
  color: framed ? Qt.rgba(foreground.r, foreground.g, foreground.b, 0.035) : "transparent"
  borderSpec: focusOutline
    ? Border.flat(Qt.rgba(accent.r, accent.g, accent.b, 0.55), Math.max(1, Style.normalBorderWidth))
    : Border.none()
  radius: framed ? Style.cornerRadius : 0

  // Spatial reference without a wireframe: a quiet dot lattice.
  Canvas {
    id: dots
    visible: root.dotted
    anchors.fill: parent
    anchors.margins: Style.space(6)
    property color dotColor: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.13)
    onDotColorChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()
    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      ctx.fillStyle = dotColor
      var step = Style.space(18)
      var r = Math.max(1, Style.spaceReal(1.1))
      for (var y = step / 2; y < height; y += step)
        for (var x = step / 2; x < width; x += step)
          ctx.fillRect(Math.round(x), Math.round(y), r, r)
    }
  }

  Flow {
    id: hiddenStrip
    visible: root.detailed && root.nonSpatialDisplays.length > 0
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
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
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
    anchors.margins: root.detailed ? Style.space(8) : Style.space(2)
    anchors.topMargin: hiddenStrip.visible ? Style.space(5) : (root.detailed ? Style.space(8) : Style.space(2))

    Repeater {
      model: root.displays

      Item {
        id: card
        required property var modelData
        readonly property var previewRect: Model.layoutRect(modelData, root.bounds, canvas.width, canvas.height, root.stagePadding)
        property real dragOffsetX: 0
        property real dragOffsetY: 0
        readonly property bool selected: String(modelData.key || "") === root.selectedKey
        readonly property string workspaceText: Model.workspaceText(root.workspacePlan, modelData.key)
        readonly property var workspaceIds: workspaceText === "" ? [] : workspaceText.split(", ")
        // Many workspaces: one elided pill with the shared text instead of chips.
        readonly property bool chipsFit: workspaceIds.length * Style.space(22) <= width * 0.6
        readonly property var summary: Model.displaySummary(modelData,
          Model.editorMetadata(root.editorDisplays, modelData.key), root.workspacePlan)
        readonly property bool disconnected: root.markDisconnected && modelData.connected === false
        readonly property string note: disconnected ? "" : String(root.notes[String(modelData.key || "")] || "")
        readonly property bool compact: width < Style.space(170) || height < Style.space(96)
        readonly property bool tiny: !root.detailed || height < Style.space(40)
        readonly property real gutter: Math.min(Style.space(root.detailed ? 3 : 1), previewRect.width / 8, previewRect.height / 8)
        readonly property real bezel: tiny ? Math.max(1, Style.space(1)) : Style.space(4)
        readonly property color lit: selected ? root.accent : root.foreground

        x: previewRect.x + gutter + dragOffsetX
        y: previewRect.y + gutter + dragOffsetY
        width: previewRect.width - gutter * 2
        height: previewRect.height - gutter * 2
        z: selected ? 2 : 1

        // Contact shadow: the screen sits on the stage, not in it.
        Rectangle {
          visible: !card.tiny
          x: 0
          y: Style.space(3)
          width: parent.width
          height: parent.height
          radius: bezelRect.radius
          color: Qt.rgba(0, 0, 0, 0.22)
        }

        Rectangle {
          id: bezelRect
          anchors.fill: parent
          radius: Math.min(Style.cornerRadius, Style.space(card.tiny ? 2 : 7))
          color: Qt.tint(Color.background, Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.10))
          border.width: card.selected ? Math.max(2, Style.normalBorderWidth * 2) : 1
          border.color: card.selected ? root.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.30)

          Rectangle {
            id: panel
            anchors.fill: parent
            anchors.margins: card.bezel + (card.selected ? 1 : 0)
            radius: Math.max(0, bezelRect.radius - card.bezel / 2)
            gradient: Gradient {
              GradientStop { position: 0.0; color: Qt.rgba(card.lit.r, card.lit.g, card.lit.b, card.selected ? 0.30 : 0.10) }
              GradientStop { position: 1.0; color: Qt.rgba(card.lit.r, card.lit.g, card.lit.b, card.selected ? 0.08 : 0.03) }
            }
          }
        }

        Column {
          id: cardHead
          visible: !card.tiny || root.detailed
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.rightMargin: chips.visible && !card.compact ? chips.width + card.bezel + Style.space(16) : card.bezel + Style.space(card.compact ? 6 : 10)
          anchors.top: parent.top
          anchors.margins: card.bezel + Style.space(card.compact ? 6 : 10)
          spacing: Style.space(2)

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: card.summary.connector
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: card.compact ? Style.font.body : Style.font.title
            font.bold: true
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            // Small cards keep the bottom edge for workspace chips.
            visible: root.detailed && card.height >= Style.space(card.compact && chips.visible ? 76 : 56)
            width: parent.width
            text: card.summary.model
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.80)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            visible: card.note !== ""
            width: parent.width
            text: card.note
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.italic: true
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
            elide: Text.ElideRight
          }
        }

        // Workspaces as bare-ID chips pinned to the screen's corner.
        Row {
          id: chips
          visible: root.detailed && card.workspaceIds.length > 0 && card.height >= Style.space(44)
          readonly property real inset: card.bezel + Style.space(card.compact ? 6 : 9)
          x: card.compact ? inset : card.width - width - inset
          y: card.compact ? card.height - height - inset : inset
          spacing: Style.space(3)

          Repeater {
            model: card.chipsFit ? card.workspaceIds : [card.workspaceText]
            Rectangle {
              id: chip
              required property var modelData
              readonly property bool strong: root.emphasis === "workspaces"
              readonly property string ownerKey: String(card.modelData.key || "")
              // Hidden only while its ghost is gliding in; never delays input.
              opacity: root.travelingIds[String(modelData)] === true ? 0 : 1
              Component.onCompleted: if (card.chipsFit) root.registerChip(String(modelData), chip)
              Component.onDestruction: root.unregisterChip(String(modelData), chip)
              width: Math.min(card.width * 0.6, Math.max(height, chipText.implicitWidth + Style.space(8)))
              height: chipText.implicitHeight + Style.space(strong ? 5 : 3)
              radius: Math.min(Style.cornerRadius, Style.space(4))
              color: strong ? root.accent : Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.20)

              Text {
                id: chipText
                anchors.centerIn: parent
                width: Math.min(implicitWidth, card.width * 0.6 - Style.space(8))
                elide: Text.ElideRight
                textFormat: Text.PlainText
                text: String(modelData)
                color: parent.strong ? Color.background : root.accent
                font.family: root.fontFamily
                font.pixelSize: parent.strong ? Style.font.bodySmall : Style.font.caption
                font.bold: true
              }
            }
          }
        }

        Column {
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          anchors.margins: card.bezel + Style.space(10)
          spacing: Style.space(1)
          visible: !card.compact && root.detailed

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: card.summary.mode
            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.72)
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
          }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: card.summary.placement
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
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

          onPressed: function(mouse) {
            root.dragging = root.movable
            root.outputSelected(String(card.modelData.key || ""))
            var point = dragArea.mapToItem(canvas, mouse.x, mouse.y)
            pointerStartX = point.x
            pointerStartY = point.y
            dragStarted = false
            card.dragOffsetX = 0
            card.dragOffsetY = 0
          }
          onPositionChanged: function(mouse) {
            if (!pressed || !root.movable) return
            var point = dragArea.mapToItem(canvas, mouse.x, mouse.y)
            var deltaX = point.x - pointerStartX
            var deltaY = point.y - pointerStartY
            if (!dragStarted) {
              var threshold = Style.space(6)
              if (deltaX * deltaX + deltaY * deltaY < threshold * threshold) return
              dragStarted = true
            }
            card.dragOffsetX = deltaX
            card.dragOffsetY = deltaY
          }
          onReleased: function(mouse) {
            root.dragging = false
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
          onCanceled: {
            root.dragging = false
            dragStarted = false
            card.dragOffsetX = 0
            card.dragOffsetY = 0
          }
        }
      }
    }

    // Ghost chips: drawn like the real ones, above the cards, input-transparent.
    Repeater {
      model: root.travelingChips

      Rectangle {
        id: ghost
        required property var modelData
        readonly property bool strong: root.emphasis === "workspaces"
        z: 10
        x: modelData.fromX
        y: modelData.fromY
        width: modelData.width
        height: modelData.height
        radius: Math.min(Style.cornerRadius, Style.space(4))
        color: strong ? root.accent : Qt.tint(Color.background, Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.35))

        Text {
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: String(ghost.modelData.id)
          color: ghost.strong ? Color.background : root.accent
          font.family: root.fontFamily
          font.pixelSize: ghost.strong ? Style.font.bodySmall : Style.font.caption
          font.bold: true
        }

        SequentialAnimation {
          running: true
          PauseAnimation { duration: ghost.modelData.delay }
          ParallelAnimation {
            NumberAnimation { target: ghost; property: "x"; to: ghost.modelData.toX; duration: root.chipTravelDuration; easing.type: Easing.InOutCubic }
            NumberAnimation { target: ghost; property: "y"; to: ghost.modelData.toY; duration: root.chipTravelDuration; easing.type: Easing.InOutCubic }
          }
          ScriptAction { script: { ghost.visible = false; root.chipArrived(ghost.modelData.id) } }
        }
      }
    }

    Text {
      textFormat: Text.PlainText
      visible: root.displays.length === 0 && root.detailed
      anchors.centerIn: parent
      text: "No enabled displays"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }
  }
}
