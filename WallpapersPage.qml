pragma ComponentBehavior: Bound

import QtQuick
import "Strings.js" as Strings

// The Wallpapers page: one row per display the current profile drives, with
// keyboard selection. It only emits intents; the panel owns picking and saving.
Item {
  id: root

  property var rows: []
  property string profileName: ""
  property int currentIndex: 0
  property color foreground: "white"
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: "#7aa2f7"
  property string fontFamily: ""
  property real bodySize: 13
  property real captionSize: 11
  property real unit: 1

  signal chooseRequested(string key)
  signal clearRequested(string key)

  readonly property var selectedRow: rows.length > 0 ? rows[Math.min(currentIndex, rows.length - 1)] : null
  // The stage and the list share this selection, by display key.
  readonly property string selectedKey: selectedRow ? String(selectedRow.key) : ""
  property string heldKey: ""

  // Handlers read rows directly: the selectedRow binding may not be updated yet.
  onCurrentIndexChanged: holdCurrent()
  // A save rebuilds the rows; keep the display the user had selected.
  onRowsChanged: {
    var held = indexOfKey(heldKey)
    currentIndex = held >= 0 ? held : Math.max(0, Math.min(currentIndex, rows.length - 1))
    holdCurrent()
  }

  function holdCurrent() {
    if (currentIndex >= 0 && currentIndex < rows.length) heldKey = String(rows[currentIndex].key)
  }

  function indexOfKey(key) {
    for (var i = 0; i < rows.length; i++) if (String(rows[i].key) === String(key)) return i
    return -1
  }

  function selectKey(key) {
    var index = indexOfKey(key)
    if (index >= 0) currentIndex = index
  }

  function move(delta) {
    if (rows.length === 0) return
    currentIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + delta))
  }

  function activate() {
    if (selectedRow) chooseRequested(String(selectedRow.key))
  }

  function clearSelected() {
    if (selectedRow && selectedRow.hasWallpaper === true) clearRequested(String(selectedRow.key))
  }

  // The panel puts its display stage here; this page stays plain QtQuick.
  // Not a default property: that would also capture this file's own children.
  property alias stageContent: stageHost.data
  property real stageHeight: 0

  Item {
    id: stageHost
    width: parent.width
    height: root.stageHeight
    visible: root.stageHeight > 0
  }

  Text {
    id: header
    anchors.top: stageHost.bottom
    anchors.topMargin: root.stageHeight > 0 ? Math.round(10 * root.unit) : 0
    width: parent.width
    textFormat: Text.PlainText
    text: Strings.t("wallpaper.heading", "Wallpapers").toUpperCase() + (root.profileName !== "" ? "  ·  " + root.profileName : "")
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: root.captionSize
    font.bold: true
  }

  Flickable {
    anchors.top: header.bottom
    anchors.topMargin: Math.round(8 * root.unit)
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    contentHeight: list.height
    clip: true

    Column {
      id: list
      width: parent.width
      spacing: Math.round(4 * root.unit)

      Repeater {
        objectName: "wallpaperRows"
        model: root.rows

        WallpaperRow {
          required property var modelData
          required property int index
          width: list.width
          row: modelData
          selected: index === root.currentIndex
          foreground: root.foreground
          dim: root.dim
          accent: root.accent
          fontFamily: root.fontFamily
          bodySize: root.bodySize
          captionSize: root.captionSize
          unit: root.unit
          onSelectRequested: root.currentIndex = index
          onChooseRequested: root.chooseRequested(String(modelData.key))
          onClearRequested: root.clearRequested(String(modelData.key))
        }
      }
    }
  }

  Text {
    objectName: "emptyState"
    visible: root.rows.length === 0
    anchors.centerIn: parent
    width: Math.min(parent.width, Math.round(360 * root.unit))
    wrapMode: Text.WordWrap
    horizontalAlignment: Text.AlignHCenter
    textFormat: Text.PlainText
    text: root.profileName === ""
      ? Strings.t("wallpaper.needsProfile", "Wallpapers follow a saved profile. Use or save a profile for these displays first.")
      : Strings.t("wallpaper.noDisplays", "No displays are on in this profile.")
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: root.bodySize
  }
}
