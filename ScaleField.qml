import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model
import "Strings.js" as Strings

// Scale as a selector. The list leads with the presets, then a hairline, every
// other sharp scale and Custom… for typing one. The list and every sharpness
// verdict come from hyprmoncfg's scale_info (computed in Go, see Model.scaleRow);
// this file only draws them. Labels are compact (Model.compactScaleLabels); the
// value emitted is always the exact scale.
//
// A Blurry scale reads "1.33x ⚠" on the trigger and "Blurry" in the header, never
// colour alone. It is never rewritten. Without scale_info (an older daemon)
// there are no presets and no Custom….
Column {
  id: root

  property var options: []
  property string value: ""
  // Whether value is sharp, from scale_info, and the mode Custom… asks about.
  property bool sharp: true
  property int modeWidth: 0
  property int modeHeight: 0
  // Custom… needs scale_info; `infos` are its cached replies by scaleInfoKey.
  property bool customAvailable: false
  property var infos: ({})
  // Trigger text and the header's verdict, from Model.scaleRow.
  property string triggerText: ""
  property string detail: ""
  property bool hasCursor: false
  property bool resetVisible: false
  property string resetTooltip: Strings.t("reset.default", "Reset to loaded profile value")
  property Item popupParent: null
  property bool ownerOpen: true
  property color foreground: Commons.Color.popups.text
  property color accent: Commons.Color.accent
  property color urgent: Commons.Color.urgent
  property string fontFamily: Style.font.family
  readonly property alias dropdown: scaleDropdown
  readonly property alias customInput: customInput
  readonly property bool customOpen: customEntry.visible

  signal changed(string value)
  // Typed Custom… scale to apply; the panel sends it with snap_scale.
  signal customApplied(real value)
  // scale_info is needed for a typed value on this mode.
  signal infoNeeded(real value)
  signal resetRequested()
  // Custom… entry closed (applied or cancelled); the panel takes keys back.
  signal customClosed()

  spacing: Style.spacing.labelGap

  function openCustom() {
    if (!root.customAvailable) return
    customInput.text = root.value
    root.infoNeeded(Number(root.value))
    customEntry.visible = true
    customInput.forceActiveFocus()
    customInput.selectAll()
  }

  function closeCustom() {
    if (!customEntry.visible) return
    customEntry.visible = false
    root.customClosed()
  }

  function entryInfo(text) {
    var parsed = Model.parseScaleEntry(text)
    if (parsed.error) return null
    var info = root.infos[Model.scaleInfoKey(root.modeWidth, root.modeHeight, parsed.value)]
    return info === undefined ? null : info
  }

  function applyCustom() {
    var feedback = Model.scaleEntryLines(root.modeWidth, root.modeHeight, customInput.text, root.entryInfo(customInput.text))
    if (feedback.apply === null) return
    root.closeCustom()
    root.customApplied(feedback.apply)
  }

  onVisibleChanged: if (!visible) closeCustom()

  PanelDropdown {
    id: scaleDropdown
    width: parent.width
    label: Strings.t("scale.title", "SCALE")
    detail: root.detail
    detailColor: root.sharp ? Qt.darker(root.foreground, 1.4) : root.urgent
    triggerText: root.triggerText
    hasCursor: root.hasCursor
    options: root.customAvailable ? root.options.concat([{ value: "custom", label: Strings.t("scale.custom", "Custom…") }]) : root.options
    value: root.value
    popupParent: root.popupParent
    ownerOpen: root.ownerOpen
    enabled: root.enabled
    foreground: root.foreground
    fontFamily: root.fontFamily
    resetVisible: root.resetVisible
    resetTooltip: root.resetTooltip
    onChanged: function(value) {
      if (value === "custom") Qt.callLater(root.openCustom)
      else root.changed(value)
    }
    onResetRequested: root.resetRequested()
  }

  // Custom…: type an exact scale. Built from key events (KeyField), never
  // from Qt's text input, and explained like the TUI's dialog.
  Column {
    id: customEntry
    visible: false
    width: parent.width
    spacing: Style.spacing.labelGap

    readonly property var feedback: Model.scaleEntryLines(root.modeWidth, root.modeHeight, customInput.text,
      root.entryInfo(customInput.text))

    Text {
      textFormat: Text.PlainText
      text: Strings.t("scale.customTitle", "CUSTOM SCALE")
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      topPadding: Math.ceil(font.pixelSize * 0.15)
    }

    KeyField {
      id: customInput
      width: parent.width
      placeholderText: "1.00"
      horizontalAlignment: Text.AlignRight
      maximumLength: 8
      inputPattern: /\d{0,1}\.?\d{0,5}/
      enabled: root.enabled
      foreground: root.foreground
      font.family: root.fontFamily
      onAccepted: root.applyCustom()
      onTextEdited: {
        var parsed = Model.parseScaleEntry(text)
        if (!parsed.error) root.infoNeeded(parsed.value)
      }
      onActiveFocusChanged: if (!activeFocus) root.closeCustom()
      Keys.onEscapePressed: function(event) {
        root.closeCustom()
        event.accepted = true
      }
    }

    Repeater {
      model: customEntry.feedback.lines

      Text {
        required property var modelData
        width: customEntry.width
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        text: String(modelData.text)
        color: modelData.tone === "ok" ? root.foreground : root.urgent
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: modelData.tone !== "ok"
      }
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      text: Strings.t("scale.customHint", "Enter applies. Esc cancels.")
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
