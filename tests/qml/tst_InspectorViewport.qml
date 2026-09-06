import QtQuick
import QtQuick.Controls
import QtTest
import "../.."

Rectangle {
  id: stage
  width: 500
  height: 600
  color: "#101010"

  TextField {
    id: outsideField
    x: 400
    y: 400
    width: 90
  }

  Component {
    id: formComponent

    InspectorViewport {
      width: 380
      height: 180
      formHeight: form.implicitHeight
      property alias firstField: first
      property alias lastField: last

      Column {
        id: form
        width: parent.width
        spacing: 8

        TextField {
          id: first
          width: parent.width
          height: 40
          text: "First field"
        }

        Rectangle {
          width: parent.width
          height: 240
          color: "#ff0000"
        }

        TextField {
          id: last
          width: parent.width
          height: 40
          text: "Last field"
        }
      }
    }
  }

  TestCase {
    name: "InspectorViewport"
    when: windowShown
    property var viewport

    function init() {
      viewport = createTemporaryObject(formComponent, stage)
      verify(viewport !== null)
      waitForRendering(viewport)
    }

    function fullyVisible(field) {
      var top = field.mapToItem(viewport, 0, 0).y
      return top >= 0 && top + field.height <= viewport.height
    }

    function test_overflow_is_clipped() {
      verify(viewport.contentHeight > viewport.height)
      verify(viewport.clip)
      verify(viewport.firstField.width < viewport.width)
      verify(viewport.ScrollBar.vertical.active)
      var image = grabImage(stage)
      compare(image.pixel(20, 120), "#ff0000")
      compare(image.pixel(20, 200), "#101010")
    }

    function test_keyboard_cursor_reveals_both_ends() {
      viewport.currentField = viewport.lastField
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      viewport.currentField = viewport.firstField
      tryVerify(function() { return fullyVisible(viewport.firstField) })
      compare(viewport.contentY, 0)
    }

    function test_native_focus_scrolls_into_view() {
      viewport.lastField.forceActiveFocus()
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      viewport.firstField.forceActiveFocus()
      tryVerify(function() { return fullyVisible(viewport.firstField) })
    }

    function test_resize_keeps_native_focus_visible() {
      viewport.lastField.forceActiveFocus()
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      viewport.height = 100
      tryVerify(function() { return fullyVisible(viewport.lastField) })
    }

    function test_mouse_wheel_reaches_the_last_field_without_editing() {
      mouseWheel(viewport, 100, 100, 0, -1200)
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      compare(viewport.lastField.text, "Last field")
      compare(viewport.firstField.text, "First field")
    }

    function test_focus_outside_the_form_does_not_scroll() {
      viewport.currentField = viewport.lastField
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      var position = viewport.contentY
      outsideField.forceActiveFocus()
      wait(0)
      compare(viewport.contentY, position)
    }

    function test_resize_keeps_keyboard_field_visible() {
      viewport.currentField = viewport.lastField
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      viewport.height = 100
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      viewport.height = 500
      tryCompare(viewport, "contentY", 0)
      verify(fullyVisible(viewport.firstField))
      verify(fullyVisible(viewport.lastField))
    }

    function test_shorter_form_clears_old_scroll_position() {
      viewport.currentField = viewport.lastField
      tryVerify(function() { return fullyVisible(viewport.lastField) })
      viewport.currentField = null
      viewport.formHeight = 80
      tryCompare(viewport, "contentY", 0)
    }
  }
}
