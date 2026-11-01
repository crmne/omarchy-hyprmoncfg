import QtQuick
import QtTest
import "../.."

Rectangle {
  id: stage
  width: 800
  height: 500
  color: "#101010"

  Component {
    id: canvasComponent
    DisplayCanvas {
      width: 800
      height: 500
      selectable: true
      profile: ({ outputs: [
        { key: "lap", name: "eDP-1", enabled: true, x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
        { key: "desk", name: "DP-1", enabled: true, x: 1920, y: 0, width: 1920, height: 1080, scale: 1 }
      ] })
    }
  }

  SignalSpy { id: contextSpy; signalName: "outputContextRequested" }
  SignalSpy { id: selectSpy; signalName: "outputSelected" }
  SignalSpy { id: moveSpy; signalName: "outputMoved" }

  TestCase {
    name: "DisplayCanvas"
    when: windowShown
    property var canvas

    function init() {
      canvas = createTemporaryObject(canvasComponent, stage)
      verify(canvas !== null)
      contextSpy.clear(); selectSpy.clear(); moveSpy.clear()
      contextSpy.target = canvas; selectSpy.target = canvas; moveSpy.target = canvas
      waitForRendering(canvas)
    }

    function test_right_click_selects_the_card_and_asks_for_its_menu() {
      canvas.rotatable = true
      canvas.movable = true
      mouseClick(canvas, 600, 250, Qt.RightButton)
      compare(contextSpy.count, 1)
      compare(contextSpy.signalArguments[0][0], "desk")
      compare(selectSpy.signalArguments[0][0], "desk")
      compare(canvas.dragging, false)
    }

    function test_rotation_does_not_need_a_movable_card() {
      canvas.rotatable = true
      canvas.movable = false
      mouseClick(canvas, 200, 250, Qt.RightButton)
      compare(contextSpy.count, 1)
      compare(contextSpy.signalArguments[0][0], "lap")
    }

    function test_right_click_is_inert_on_a_canvas_that_cannot_rotate() {
      mouseClick(canvas, 600, 250, Qt.RightButton)
      compare(contextSpy.count, 0)
    }

    function test_right_drag_moves_nothing_and_left_drag_still_does() {
      canvas.rotatable = true
      canvas.movable = true
      mouseDrag(canvas, 600, 250, 80, 60, Qt.RightButton)
      compare(moveSpy.count, 0)
      mouseDrag(canvas, 600, 250, 80, 60, Qt.LeftButton)
      compare(moveSpy.count, 1)
    }

    function test_a_lone_display_does_not_drag() {
      canvas.rotatable = true
      canvas.movable = false
      mouseDrag(canvas, 600, 250, 80, 60, Qt.LeftButton)
      compare(moveSpy.count, 0)
      compare(canvas.dragging, false)
    }
  }
}
