import QtQuick
import QtQuick.Controls
import QtTest
import "../.."

Rectangle {
  id: stage
  width: 500
  height: 400
  color: "#101010"

  Item { id: anchor; x: 420; y: 340; width: 60; height: 32 }

  Component {
    id: menuComponent
    ProfileActionsMenu {
      id: actions
      property bool triggered: false
      actions: [
        { id: "use", label: "Use this profile" },
        { id: "edit", label: "Edit layout" },
        { id: "exec", label: "Edit post-apply command…" },
        { id: "delete", label: "Delete…" }
      ]
      onChosen: triggered = true
    }
  }

  TestCase {
    name: "ProfileActionsMenu"
    when: windowShown
    property var menu

    function init() {
      menu = createTemporaryObject(menuComponent, stage)
      verify(menu !== null)
      menu.openAt(anchor)
      tryCompare(menu, "opened", true)
    }

    function cleanup() { menu.close() }

    function test_custom_background_keeps_actions_visible_and_clickable() {
      compare(menu.menuWidth, 260)
      var action = menu.itemAt(0)
      verify(action.width > 200)
      verify(action.height > 0)
      mouseClick(action, action.width / 2, action.height / 2)
      compare(menu.triggered, true)
      tryCompare(menu, "opened", false)
    }

    function test_menu_stays_inside_panel_at_bottom_right() {
      verify(menu.menuX >= 0)
      verify(menu.menuX + menu.menuWidth <= stage.width)
      verify(menu.menuY >= 0)
      verify(menu.menuY + menu.menuHeight <= stage.height)
      verify(menu.menuY < anchor.y)
    }

    function test_keyboard_activation() {
      menu.currentIndex = 0
      keyClick(Qt.Key_Return)
      compare(menu.triggered, true)
      tryCompare(menu, "opened", false)
    }

    function test_right_click_uses_local_pointer_coordinates() {
      menu.openAt(stage, 100, 90)
      compare(menu.menuX, 100)
      compare(menu.menuY, 90)
    }

    function test_overflow_button_aligns_menu_to_button_edge() {
      menu.openAt(anchor)
      compare(menu.menuX + menu.menuWidth, anchor.x + anchor.width)
      compare(menu.menuY + menu.menuHeight, anchor.y)
    }
  }
}
