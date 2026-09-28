import QtQuick
import qs.Commons
import qs.Ui

// Direction B: Keep/Revert shows what is being kept. A miniature stage of the
// previewed layout sits above the question, so the decision is about the
// arrangement on screen, not a profile name. The deadline drains below it.
// Keys stay in PreviewGuard; this only draws and emits.
BorderSurface {
  id: root

  property string stage: "confirm"
  property string profileName: ""
  property int seconds: 0
  property int totalSeconds: 30
  property bool saveOnCommit: false
  property bool draftApply: false
  property bool actionPending: false
  property string actionError: ""
  property string errorMessage: ""
  property var layoutProfile: null
  signal keepRequested()
  signal revertRequested()
  signal closeRequested()

  readonly property real remaining: root.totalSeconds > 0
    ? Math.max(0, Math.min(1, root.seconds / root.totalSeconds)) : 0

  width: Style.space(480)
  height: content.implicitHeight + contentTopInset + contentBottomInset
  color: Color.popups.background
  borderSpec: Border.surfaceSpec("popups", "border", Color.accent, Math.max(1, Style.space(2)))
  radius: Style.cornerRadius
  padding: Style.space(20)

  MouseArea { anchors.fill: parent; onClicked: function(mouse) { mouse.accepted = true } }

  Column {
    id: content
    x: root.contentLeftInset
    y: root.contentTopInset
    width: root.width - root.contentLeftInset - root.contentRightInset
    spacing: Style.space(10)

    DisplayCanvas {
      visible: root.stage === "confirm" && !!root.layoutProfile
      width: parent.width
      height: Style.space(132)
      profile: root.layoutProfile || ({ outputs: [] })
      interactive: false
      detailed: true
      framed: true
      foreground: Color.foreground
      accent: Color.accent
    }

    Item {
      width: parent.width
      height: Math.max(title.implicitHeight, countdown.implicitHeight)

      Text {
        id: title
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.right: countdown.left
        anchors.rightMargin: Style.space(12)
        anchors.verticalCenter: parent.verticalCenter
        text: root.stage === "applying"
          ? "Applying display preview…"
          : (root.stage === "error"
            ? "Couldn’t preview this layout"
            : (root.saveOnCommit ? "Keep and save this layout?"
              : (root.draftApply ? "Keep this layout?" : "Keep this profile?")))
        color: root.stage === "error" ? Color.urgent : Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
        font.bold: true
        wrapMode: Text.WordWrap
      }

      Text {
        id: countdown
        textFormat: Text.PlainText
        visible: root.stage === "confirm"
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: root.seconds + "s"
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
        font.bold: true
      }
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.stage === "applying"
        ? "This confirmation stays open while your displays reconfigure."
        : (root.stage === "error"
          ? root.errorMessage
          : (root.actionError !== ""
            ? root.actionError
            : root.profileName + " · the previous layout returns in " + root.seconds + " seconds"))
      color: root.stage === "error" || root.actionError !== "" ? Color.urgent : Color.foreground
      opacity: 0.68
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      wrapMode: Text.WordWrap
    }

    Rectangle {
      visible: root.stage === "confirm"
      width: parent.width
      height: Style.space(3)
      radius: height / 2
      color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)

      Rectangle {
        width: parent.width * root.remaining
        height: parent.height
        radius: parent.radius
        color: Color.accent
        Behavior on width { NumberAnimation { duration: 240 } }
      }
    }

    Item { width: 1; height: Style.space(2) }

    Row {
      visible: root.stage === "confirm"
      anchors.right: parent.right
      spacing: Style.space(10)

      Button {
        text: root.actionPending ? "Working…" : "Revert"
        bordered: true
        enabled: !root.actionPending
        foreground: Color.foreground
        fontFamily: Style.font.family
        onClicked: root.revertRequested()
      }

      Button {
        text: root.saveOnCommit ? "Keep & save" : "Keep"
        selected: true
        bordered: true
        enabled: !root.actionPending
        foreground: Color.foreground
        fontFamily: Style.font.family
        onClicked: root.keepRequested()
      }
    }

    Button {
      visible: root.stage === "error"
      anchors.right: parent.right
      text: "Close"
      bordered: true
      foreground: Color.foreground
      fontFamily: Style.font.family
      onClicked: root.closeRequested()
    }
  }
}
