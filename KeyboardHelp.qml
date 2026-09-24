import QtQuick
import qs.Commons
import qs.Ui

Item {
  id: root

  property string page: "layout"
  property color foreground: Color.foreground
  property color background: Color.background
  property color accent: Color.accent
  property string fontFamily: Style.font.family

  signal closeRequested()

  readonly property var groups: {
    var contextual = []
    if (root.page === "layout") {
      contextual = [
        {
          title: "Selected display",
          bindings: [
            { keys: "drag, arrows", action: "Move by 100px" },
            { keys: "Shift+arrows", action: "Move by 10px" },
            { keys: "Ctrl+arrows", action: "Move by 1px" },
            { keys: "Alt+arrows", action: "Snap beside the nearest display" },
            { keys: "0", action: "Move to 0,0" },
            { keys: "[  ]", action: "Select the previous or next display" }
          ]
        },
        {
          title: "Layout",
          bindings: [
            { keys: "Tab, Shift+Tab", action: "Move between canvas, Display, and Color" },
            { keys: "↑  ↓", action: "Select a field in Display or Color" },
            { keys: "←  →", action: "Adjust the selected field" },
            { keys: "Enter", action: "Edit the selected field" }
          ]
        }
      ]
    } else if (root.page === "profiles") {
      contextual = [{
        title: "Selected profile",
        bindings: [
          { keys: "↑  ↓", action: "Browse profiles and their saved setup" },
          { keys: "Enter, a", action: "Preview this profile" },
          { keys: "l", action: "Load it into the layout editor" },
          { keys: "u", action: "Reuse its layout on these displays" },
          { keys: "e", action: "Edit post-apply command" },
          { keys: "d", action: "Delete with confirmation" },
          { keys: "Shift+F10", action: "Open profile actions" },
          { keys: "Space", action: "Toggle automatic profile selection" }
        ]
      }]
    } else if (root.page === "reuse") {
      contextual = [{
        title: "Reuse layout",
        bindings: [
          { keys: "Tab, Shift+Tab", action: "Move between selectors and buttons" },
          { keys: "Enter, Space", action: "Open a selector or activate a button" },
          { keys: "↑  ↓", action: "Choose an option in an open menu" },
          { keys: "Enter", action: "Confirm the menu choice" },
          { keys: "Esc", action: "Close the menu or return to profiles" }
        ]
      }]
    } else {
      contextual = [{
        title: "Workspaces",
        bindings: [
          { keys: "↑  ↓", action: "Select a setting, workspace, or display" },
          { keys: "←  →", action: "Adjust it, assign a workspace, or reorder displays" },
          { keys: "Enter, Space", action: "Advance the selected setting" }
        ]
      }]
    }
    if (root.page !== "reuse") contextual.push({
      title: "Anywhere",
      bindings: [
        { keys: "1  2  3", action: "Switch tabs" },
        { keys: "a", action: "Apply the current draft or selected profile" },
        { keys: "s", action: "Save the current draft as a profile" },
        { keys: "r", action: "Reset from live Hyprland state" },
        { keys: "?", action: "Show these keys" },
        { keys: "R", action: "Restart the daemon after an upgrade" },
        { keys: "q, Esc", action: "Close the panel" }
      ]
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
        text: "Keys"
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
              }

              Text {
                textFormat: Text.PlainText
                width: parent.width - Style.space(164)
                text: String(parent.modelData.action || "")
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }
            }
          }
        }
      }

      Text {
        textFormat: Text.PlainText
        text: root.page === "reuse" ? "Click outside this card to close." : "Any key closes this."
        color: Qt.darker(root.foreground, 1.5)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }
}
