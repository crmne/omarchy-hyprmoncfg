import QtQuick

// Omarchy's ScreenMoveRemap, which 4.0 has and later shells removed because
// Hyprland 0.57 moves layer surfaces with their monitor. Hyprland before that
// leaves a mapped layer surface at its old position, so the preview guard
// still needs this there. The owning window folds it into `visible`:
//   visible: <shown> && !guard.remapping
Item {
  id: root

  required property var window
  readonly property var screen: window ? window.screen : null
  property bool remapping: false

  visible: false

  // A layout reshuffle can move the monitor more than once before it lands.
  Timer {
    id: settleTimer
    interval: 200
    onTriggered: root.remapping = true
  }

  // Stay unmapped for a beat, so the compositor doesn't coalesce the unmap
  // and the remap into a no-op.
  Timer {
    interval: 50
    running: root.remapping
    onTriggered: root.remapping = false
  }

  Connections {
    target: root.screen
    function onXChanged() { settleTimer.restart() }
    function onYChanged() { settleTimer.restart() }
  }
}
