import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Strings.js" as Strings

Item {
  id: root

  property string page: "layout"
  property bool workspaceOnly: false
  // One display has nothing to move or select.
  property bool arrangeable: true
  property bool displayModeAvailable: false
  property color foreground: Commons.Color.foreground
  property color background: Commons.Color.background
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family

  signal closeRequested()

  readonly property var groups: {
    var contextual = []
    if (root.page === "layout") {
      if (root.arrangeable) contextual.push({
        title: Strings.t("help.selectedDisplay", "Selected display"),
        bindings: [
          { keys: Strings.t("help.keys.dragArrows", "drag, arrows, hjkl"), action: Strings.t("help.move100", "Move by 100px") },
          { keys: Strings.t("help.keys.shiftArrows", "Shift+arrows"), action: Strings.t("help.move10", "Move by 10px") },
          { keys: "Shift+hjkl", action: Strings.t("help.move500", "Move by 500px") },
          { keys: Strings.t("help.keys.ctrlArrows", "Ctrl+arrows/hjkl"), action: Strings.t("help.move1", "Move by 1px") },
          { keys: Strings.t("help.keys.altArrows", "Alt+arrows/hjkl"), action: Strings.t("help.snap", "Snap beside the nearest display") },
          { keys: "0", action: Strings.t("help.moveOrigin", "Move to 0,0") },
          { keys: "[  ]", action: Strings.t("help.selectDisplay", "Select the previous or next display") }
        ]
      })
      contextual.push({
        title: Strings.t("help.layout", "Layout"),
        bindings: [
          { keys: "Tab, Shift+Tab", action: Strings.t("help.movePanes", "Move between canvas, Display, and Color") },
          { keys: "↑  ↓, j  k", action: Strings.t("help.selectField", "Select a field in Display or Color") },
          { keys: "←  →, h  l", action: Strings.t("help.adjustField", "Adjust the selected field") },
          { keys: "Enter", action: Strings.t("help.editField", "Edit or apply the selected field") },
          { keys: Strings.t("help.keys.rightClick", "right-click"), action: Strings.t("help.rotate", "Rotate a display on the canvas") }
        ].concat(root.displayModeAvailable ? [{ keys: "m", action: Strings.t("help.switchMode", "Switch between Extend and Mirror") }] : [])
      })
    } else if (root.page === "profiles") {
      contextual = [{
        title: Strings.t("help.selectedProfile", "Selected profile"),
        bindings: [
          { keys: "↑  ↓, j  k", action: Strings.t("help.browseProfiles", "Browse profiles and their saved setup") },
          { keys: "Enter, a", action: Strings.t("help.previewProfile", "Preview this profile") },
          { keys: "l", action: Strings.t("help.loadProfile", "Load it into the layout editor") },
          { keys: "e", action: Strings.t("help.editCommand", "Edit post-apply command") },
          { keys: "d", action: Strings.t("help.deleteProfile", "Delete with confirmation") },
          { keys: "Shift+F10", action: Strings.t("help.profileActions", "Open profile actions") },
          { keys: "Space", action: Strings.t("help.toggleAutomatic", "Toggle automatic profile selection") }
        ]
      }]
    } else {
      contextual = [{
        title: Strings.t("help.workspaces", "Workspaces"),
        bindings: [
          { keys: "↑  ↓, j  k", action: Strings.t("help.selectSetting", "Select a setting, workspace, or display") },
          { keys: "←  →, h  l", action: Strings.t("help.adjustSetting", "Adjust it, assign a workspace, or reorder displays") },
          { keys: "Enter, Space", action: Strings.t("help.editField", "Edit or apply the selected field") }
        ]
      }]
    }
    contextual.push({
      title: Strings.t("help.anywhere", "Anywhere"),
      bindings: (root.workspaceOnly ? [] : [{ keys: "1  2  3", action: Strings.t("help.switchTabs", "Switch tabs") }]).concat([
        { keys: "a", action: Strings.t("help.apply", "Apply the current draft or selected profile") },
        { keys: "s", action: Strings.t("help.save", "Save the current draft as a profile") },
        { keys: "r", action: Strings.t("help.resetLive", "Reset from live Hyprland state") },
        { keys: "?", action: Strings.t("help.showKeys", "Show these keys") },
        { keys: "R", action: Strings.t("help.restartDaemon", "Restart the daemon after an upgrade") },
        { keys: "q, Esc", action: Strings.t("help.closePanel", "Close the panel") }
      ])
    })
    return contextual
  }

  Rectangle {
    anchors.fill: parent
    color: Qt.rgba(0, 0, 0, 0.58)

    MouseArea {
      anchors.fill: parent
      onClicked: root.closeRequested()
    }
  }

  BorderSurface {
    anchors.centerIn: parent
    width: Math.min(parent.width - Style.space(48), Style.space(650))
    implicitHeight: helpContent.implicitHeight + Style.space(30)
    color: root.background
    borderSpec: Border.controlSpec("focus", root.foreground, root.accent)
    radius: Style.cornerRadius

    Column {
      id: helpContent
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(18)
      anchors.rightMargin: Style.space(18)
      spacing: Style.space(13)

      Text {
        textFormat: Text.PlainText
        text: Strings.t("help.title", "Keys")
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.subtitle
        font.bold: true
      }

      Repeater {
        model: root.groups

        Column {
          required property var modelData
          width: helpContent.width
          spacing: Style.space(4)

          Text {
            textFormat: Text.PlainText
            text: String(parent.modelData.title || "")
            color: root.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            font.bold: true
          }

          Repeater {
            model: modelData.bindings || []

            Row {
              required property var modelData
              width: parent.width
              spacing: Style.space(14)

              Text {
                textFormat: Text.PlainText
                width: Style.space(150)
                text: String(parent.modelData.keys || "")
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                wrapMode: Text.Wrap
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width - Style.space(164)
                text: String(parent.modelData.action || "")
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.Wrap
              }
            }
          }
        }
      }

      Text {
        textFormat: Text.PlainText
        text: Strings.t("help.anyKey", "Any key closes this.")
        color: Qt.darker(root.foreground, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }
}
