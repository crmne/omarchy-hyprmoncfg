import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model
import "Strings.js" as Strings

// Whole-number entry with - and + buttons, in the look of the shell's
// NumberField, built on KeyField rather than Qt's SpinBox so no Qt text input
// is instantiated (see KeyField.qml). Up/Down and the buttons step by
// stepSize; holding a button repeats. Typed digits are committed on Enter or
// focus loss, clamped to from..to; text that is not a number reverts. Wheel
// scrolling is left to the inspector, never an edit.
Column {
  id: root

  property string label: ""
  property int value: 0
  property int from: 0
  property int to: 100
  property int stepSize: 1
  property color foreground: Commons.Color.foreground
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family
  property real fontSize: Style.font.body
  property real fieldWidth: Style.spacing.numberFieldWidth
  property bool hasCursor: false
  readonly property real buttonWidth: Style.space(28)
  readonly property alias field: input

  signal modified(int value)
  signal hovered(bool on)

  spacing: Style.spacing.md

  function commit(next) {
    var bounded = Model.clampInteger(next, root.from, root.to)
    input.text = String(root.value)
    if (bounded !== null && bounded !== root.value) root.modified(bounded)
  }

  function step(delta) {
    if (!root.enabled) return
    root.commit(root.value + delta * root.stepSize)
  }

  onValueChanged: input.text = String(root.value)

  Text {
    textFormat: Text.PlainText
    visible: root.label !== ""
    text: root.label
    color: Qt.darker(root.foreground, 1.4)
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
  }

  KeyField {
    id: input
    width: root.fieldWidth
    implicitHeight: Math.max(Style.spacing.controlHeight, root.fontSize + Style.spacing.controlPaddingY * 2)
    text: String(root.value)
    horizontalAlignment: Text.AlignHCenter
    inputPattern: root.from < 0 ? /-?\d{0,10}/ : /\d{0,10}/
    stepKeys: true
    hasCursor: root.hasCursor
    enabled: root.enabled
    foreground: root.foreground
    accent: root.accent
    leftPadding: root.buttonWidth
    rightPadding: root.buttonWidth
    font.family: root.fontFamily
    font.pixelSize: root.fontSize
    onHoveredChanged: root.hovered(hovered)
    onStepRequested: function(delta) { root.step(delta) }
    onEditingFinished: root.commit(Model.parseInteger(text))

    StepButton { x: 0; delta: -1; glyph: "−"; available: root.value > root.from }
    StepButton { x: input.width - width; delta: 1; glyph: "+"; available: root.value < root.to }
  }

  component StepButton: Rectangle {
    id: button
    property int delta: 1
    property string glyph: ""
    property bool available: true

    width: root.buttonWidth
    height: input.height
    color: area.pressed ? Style.selectedFillFor(root.foreground, root.accent) : "transparent"
    radius: Style.cornerRadius

    Text {
      textFormat: Text.PlainText
      anchors.centerIn: parent
      text: button.glyph
      color: root.foreground
      opacity: button.available ? 1 : 0.35
      font.family: root.fontFamily
      font.pixelSize: root.fontSize
    }

    MouseArea {
      id: area
      anchors.fill: parent
      enabled: root.enabled
      // Wheel events fall through to the scrolling inspector.
      acceptedButtons: Qt.LeftButton
      // The delay starts before the step so a step that disables the stepper
      // (e.g. while an edit is pending) can stop it: disabling drops the
      // press without released or canceled.
      onPressed: { repeatDelay.start(); root.step(button.delta) }
      onReleased: { repeatDelay.stop(); repeat.stop() }
      onCanceled: { repeatDelay.stop(); repeat.stop() }
      onEnabledChanged: if (!enabled) { repeatDelay.stop(); repeat.stop() }
    }

    Timer { id: repeatDelay; interval: 300; onTriggered: repeat.start() }
    Timer { id: repeat; interval: 100; repeat: true; onTriggered: root.step(button.delta) }
  }
}
