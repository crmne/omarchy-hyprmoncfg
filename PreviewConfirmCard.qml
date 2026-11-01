import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Strings.js" as Strings

// Direction B: Keep/Revert shows what is being kept. A miniature stage of the
// previewed layout sits above the question, so the decision is about the
// arrangement on screen, not a profile name. The deadline drains below it.
// Keys stay in PreviewGuard; this only draws and emits.
BorderSurface {
  id: root

  // This card has its own window, so no shell panel mirrors it.
  LayoutMirroring.enabled: Strings.rightToLeft()
  LayoutMirroring.childrenInherit: true

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

  readonly property bool hasAutoRotation: {
    var outputs = root.layoutProfile ? root.layoutProfile.outputs || [] : []
    for (var i = 0; i < outputs.length; i++) {
      if (outputs[i].enabled && outputs[i].rotation_auto && !outputs[i].mirror_of) return true
    }
    return false
  }

  readonly property real remaining: root.totalSeconds > 0
    ? Math.max(0, Math.min(1, root.seconds / root.totalSeconds)) : 0

  width: Style.space(480)
  height: content.implicitHeight + contentTopInset + contentBottomInset
  color: Commons.Color.popups.background
  borderSpec: Border.surfaceSpec("popups", "border", Commons.Color.accent, Math.max(1, Style.space(2)))
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
      foreground: Commons.Color.foreground
      accent: Commons.Color.accent
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
          ? Strings.t("preview.applying", "Applying display preview…")
          : (root.stage === "error"
            ? Strings.t("preview.failed", "Couldn’t preview this layout")
            : (root.saveOnCommit ? Strings.t("preview.keepAndSaveTitle", "Keep and save this layout?")
              : (root.draftApply ? Strings.t("preview.keepLayoutTitle", "Keep this layout?") : Strings.t("preview.keepProfileTitle", "Keep this profile?"))))
        color: root.stage === "error" ? Commons.Color.urgent : Commons.Color.foreground
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
        color: Commons.Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.heading
        font.bold: true
      }
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.stage === "applying"
        ? Strings.t("preview.staysOpen", "This confirmation stays open while your displays reconfigure.")
        : (root.stage === "error"
          ? root.errorMessage
          : (root.actionError !== ""
            ? root.actionError
            : Strings.tn("preview.returnsIn", root.seconds, "%2 · the previous layout returns in %1 second", "%2 · the previous layout returns in %1 seconds", root.profileName)
              + (root.hasAutoRotation ? "\n" + Strings.t("preview.autoRotationResumes", "Auto rotation resumes after Keep.") : "")))
      color: root.stage === "error" || root.actionError !== "" ? Commons.Color.urgent : Commons.Color.foreground
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
      color: Qt.rgba(Commons.Color.foreground.r, Commons.Color.foreground.g, Commons.Color.foreground.b, 0.12)

      Rectangle {
        width: parent.width * root.remaining
        height: parent.height
        radius: parent.radius
        color: Commons.Color.accent
        Behavior on width { NumberAnimation { duration: 240 } }
      }
    }

    Item { width: 1; height: Style.space(2) }

    Row {
      visible: root.stage === "confirm"
      anchors.right: parent.right
      spacing: Style.space(10)

      Button {
        text: root.actionPending ? Strings.t("preview.working", "Working…") : Strings.t("action.revert", "Revert")
        bordered: true
        enabled: !root.actionPending
        foreground: Commons.Color.foreground
        fontFamily: Style.font.family
        onClicked: root.revertRequested()
      }

      Button {
        text: root.saveOnCommit ? Strings.t("action.keepAndSave", "Keep & save") : Strings.t("action.keep", "Keep")
        selected: true
        bordered: true
        enabled: !root.actionPending
        foreground: Commons.Color.foreground
        fontFamily: Style.font.family
        onClicked: root.keepRequested()
      }
    }

    Button {
      visible: root.stage === "error"
      anchors.right: parent.right
      text: Strings.t("action.close", "Close")
      bordered: true
      foreground: Commons.Color.foreground
      fontFamily: Style.font.family
      onClicked: root.closeRequested()
    }
  }
}
