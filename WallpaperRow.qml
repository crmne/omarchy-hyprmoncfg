import QtQuick
import "Strings.js" as Strings

// One display of the current profile: thumbnail, connector, model, and the
// Choose / Clear actions. Plain QtQuick so it renders under qmltestrunner; the
// panel passes Omarchy's theme colors, font and sizes in.
Item {
  id: root

  property var row: ({})
  property bool selected: false
  property color foreground: "white"
  property color dim: Qt.darker(foreground, 1.5)
  property color accent: "#7aa2f7"
  property string fontFamily: ""
  property real bodySize: 13
  property real captionSize: 11
  property real unit: 1

  signal selectRequested()
  signal chooseRequested()
  signal clearRequested()

  implicitHeight: Math.round(64 * unit)

  Rectangle {
    anchors.fill: parent
    radius: Math.round(4 * root.unit)
    color: root.selected ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06) : "transparent"
  }

  Rectangle {
    visible: root.selected
    width: Math.round(2 * root.unit)
    height: parent.height - Math.round(16 * root.unit)
    anchors.verticalCenter: parent.verticalCenter
    color: root.accent
  }

  MouseArea {
    anchors.fill: parent
    onClicked: root.selectRequested()
  }

  Rectangle {
    id: thumb
    x: Math.round(12 * root.unit)
    anchors.verticalCenter: parent.verticalCenter
    width: Math.round(84 * root.unit)
    height: Math.round(48 * root.unit)
    radius: Math.round(3 * root.unit)
    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.05)
    border.width: 1
    border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
    clip: true

    Image {
      anchors.fill: parent
      anchors.margins: 1
      visible: root.row.hasWallpaper === true
      source: root.row.hasWallpaper === true ? "file://" + root.row.path : ""
      sourceSize.width: Math.round(168 * root.unit)
      fillMode: Image.PreserveAspectCrop
      asynchronous: true
      cache: false
    }

    Text {
      anchors.centerIn: parent
      visible: root.row.hasWallpaper !== true
      textFormat: Text.PlainText
      text: Strings.t("wallpaper.stock", "Stock")
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.captionSize
    }
  }

  Column {
    anchors.left: thumb.right
    anchors.leftMargin: Math.round(12 * root.unit)
    anchors.right: actions.left
    anchors.rightMargin: Math.round(12 * root.unit)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Math.round(2 * root.unit)

    Text {
      width: parent.width
      textFormat: Text.PlainText
      elide: Text.ElideRight
      text: String(root.row.connector || "") + "  " + (String(root.row.make || "") + " " + String(root.row.model || "")).trim()
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: root.bodySize
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      elide: Text.ElideMiddle
      text: root.row.hasWallpaper === true ? String(root.row.path) : Strings.t("wallpaper.omarchyBackground", "Omarchy background")
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: root.captionSize
    }
  }

  Row {
    id: actions
    anchors.right: parent.right
    anchors.rightMargin: Math.round(8 * root.unit)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Math.round(6 * root.unit)

    WallpaperAction {
      objectName: "chooseButton"
      text: Strings.t("wallpaper.choose", "Choose…")
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: root.bodySize
      unit: root.unit
      onClicked: { root.selectRequested(); root.chooseRequested() }
    }

    WallpaperAction {
      objectName: "clearButton"
      text: Strings.t("wallpaper.clear", "Clear")
      enabled: root.row.hasWallpaper === true
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: root.bodySize
      unit: root.unit
      onClicked: { root.selectRequested(); root.clearRequested() }
    }
  }
}
