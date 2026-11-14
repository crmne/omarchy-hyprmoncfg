import QtQuick
import QtTest
import "../.."

Rectangle {
  id: stage
  width: 640
  height: 420
  color: "#101010"

  readonly property string sampleImage: Qt.resolvedUrl("../../preview.png").toString().replace("file://", "")
  readonly property var sampleRows: [
    { key: "acer|vg240y p|0x9", connector: "DP-2", make: "Acer", model: "VG240Y P", path: "", hasWallpaper: false },
    { key: "lg|ultrawide|605", connector: "DP-1", make: "LG", model: "ULTRAWIDE", path: stage.sampleImage, hasWallpaper: true }
  ]

  Component {
    id: pageComponent
    WallpapersPage {
      width: stage.width
      height: stage.height
      property string chosen: ""
      property string cleared: ""
      onChooseRequested: function(key) { chosen = key }
      onClearRequested: function(key) { cleared = key }
    }
  }

  TestCase {
    name: "WallpapersPage"
    when: windowShown

    function makePage(rows, profile) {
      var page = createTemporaryObject(pageComponent, stage, { rows: rows, profileName: profile })
      verify(page !== null)
      return page
    }

    function test_renders_one_row_per_display() {
      var page = makePage(stage.sampleRows, "Desk")
      compare(findChild(page, "wallpaperRows").count, 2)
      compare(findChild(page, "emptyState").visible, false)
    }

    function test_keyboard_choose_and_clear_follow_the_selection() {
      var page = makePage(stage.sampleRows, "Desk")
      page.activate()
      compare(page.chosen, "acer|vg240y p|0x9")
      page.move(1)
      page.clearSelected()
      compare(page.cleared, "lg|ultrawide|605")
      page.move(5)
      compare(page.currentIndex, 1, "selection stays within the rows")
    }

    function test_clear_is_ignored_for_a_display_without_wallpaper() {
      var page = makePage(stage.sampleRows, "Desk")
      page.clearSelected()
      compare(page.cleared, "")
    }

    function test_pointer_choose_on_a_row() {
      var page = makePage(stage.sampleRows, "Desk")
      waitForRendering(page)
      var row = findChild(page, "wallpaperRows").itemAt(1)
      var choose = findChild(row, "chooseButton")
      mouseClick(choose, choose.width / 2, choose.height / 2)
      compare(page.chosen, "lg|ultrawide|605")
      compare(page.currentIndex, 1, "clicking a row selects it")
    }

    function test_empty_state_without_a_current_profile() {
      var page = makePage([], "")
      compare(findChild(page, "emptyState").visible, true)
      compare(findChild(page, "wallpaperRows").count, 0)
      page.activate()
      compare(page.chosen, "")
    }
      function test_stage_selection_and_list_share_one_selected_key() {
      var page = makePage(stage.sampleRows, "Desk")
      compare(page.selectedKey, "acer|vg240y p|0x9")
      page.selectKey("lg|ultrawide|605")
      compare(page.currentIndex, 1)
      compare(page.selectedKey, "lg|ultrawide|605")
      page.selectKey("unknown")
      compare(page.currentIndex, 1, "an unknown key keeps the selection")
    }

    function test_new_rows_keep_the_selected_display() {
      var page = makePage(stage.sampleRows, "Desk")
      page.selectKey("lg|ultrawide|605")
      var cleared = [stage.sampleRows[0], Object.assign({}, stage.sampleRows[1], { path: "", hasWallpaper: false })]
      page.rows = [cleared[1], cleared[0]]
      compare(page.selectedKey, "lg|ultrawide|605", "a save reorders nothing the user selected")
    }
  }
}
