import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model
import "Strings.js" as Strings

// Scale the way Omarchy's own Display panel shows it: one row of preset pills
// (bordered Button, `active` = current) and a trailing More dropdown listing
// every sharp scale, ending with Custom… for typing one. The pills, the list
// and every sharpness verdict come from hyprmoncfg's scale_info (computed in
// Go, see Model.scaleRow); this file only draws them. Labels are compact
// (Model.compactScaleLabels); the value emitted is always the exact scale.
//
// The pills depend only on the mode, so stepping never changes their count. A
// current scale that is not a preset is shown on the More trigger instead
// (active, "1.33x"), and a Blurry one reads "1.33x ⚠" there and "Blurry" in
// the SCALE header, never colour alone. It is never rewritten. Without
// scale_info (an older daemon) there are no pills and no Custom….
Column {
  id: root

  property var presets: []
  property var allOptions: []
  property string value: ""
  // Whether value is sharp, from scale_info, and the mode Custom… asks about.
  property bool sharp: true
  property int modeWidth: 0
  property int modeHeight: 0
  // Custom… needs scale_info; `infos` are its cached replies by scaleInfoKey.
  property bool customAvailable: false
  property var infos: ({})
  // Trigger text for More and the header detail, from Model.scaleRow.
  property string moreText: Strings.t("scale.more", "More")
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
  readonly property alias more: moreDropdown
  readonly property alias customInput: customInput
  readonly property bool customOpen: customEntry.visible
  readonly property bool onMore: !root.presets.some(function(p) { return String(p.value) === root.value })

  signal changed(string value)
  // Typed Custom… scale to apply; the panel sends it with snap_scale.
  signal customApplied(real value)
  // scale_info is needed for a typed value on this mode.
  signal infoNeeded(real value)
  signal resetRequested()
  // Custom… entry closed (applied or cancelled); the panel takes keys back.
  signal customClosed()

  spacing: Style.spacing.labelGap

  readonly property string currentLabel: {
    if (root.detail !== "") return root.detail
    for (var i = 0; i < allOptions.length; i++)
      if (String(allOptions[i].value) === root.value) return String(allOptions[i].label)
    return root.value !== "" ? root.value + "x" : ""
  }

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

  Item {
    width: parent.width
    implicitHeight: Math.max(header.implicitHeight, currentText.implicitHeight, resetAction.visible ? resetAction.height : 0)

    PanelSectionHeader {
      id: header
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: Strings.t("scale.title", "SCALE")
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Text {
      id: currentText
      textFormat: Text.PlainText
      anchors.right: resetAction.visible ? resetAction.left : parent.right
      anchors.rightMargin: resetAction.visible ? Style.spacing.xxs : 0
      anchors.verticalCenter: parent.verticalCenter
      text: root.currentLabel
      color: root.sharp ? Qt.darker(root.foreground, 1.4) : root.urgent
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }

    PanelActionButton {
      id: resetAction
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      visible: root.resetVisible
      enabled: root.enabled
      iconText: "󰑐"
      tooltipText: root.resetTooltip
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: true
      onClicked: root.resetRequested()
    }
  }

  TextMetrics { id: moreText; font.family: root.fontFamily; font.pixelSize: Style.font.body; text: Strings.t("scale.more", "More") }
  TextMetrics { id: currentMoreText; font.family: root.fontFamily; font.pixelSize: Style.font.body; font.bold: true; text: root.moreText }
  TextMetrics { id: moreChevron; font.family: root.fontFamily; font.pixelSize: Style.font.body; text: "󰅀" }

  Row {
    id: pillRow
    width: parent.width
    spacing: Style.spacing.xs
    // Sized from the trigger's own text, chevron and paddings, so neither
    // Strings.t("scale.more", "More") nor the current scale it may carry ever elides.
    readonly property real moreWidth: Math.ceil(Math.max(moreText.advanceWidth, currentMoreText.advanceWidth)
      + moreChevron.advanceWidth + Style.spacing.controlPaddingX + Style.spacing.md + Style.spacing.controlGap
      + Style.normalBorderWidth * 2 + Style.space(2))
    readonly property int count: Math.max(1, root.presets.length)
    readonly property real cellWidth: Math.max(1,
      Math.floor((width - moreWidth - spacing * count) / count))

    Repeater {
      model: root.presets

      Button {
        id: pill
        required property var modelData
        width: pillRow.cellWidth
        height: moreDropdown.rowHeight
        text: String(modelData.label)
        fontSize: Style.font.caption
        // Omarchy's pill padding when there is room; less, never below one
        // pixel, when a narrow panel or a wide More trigger narrows the cells.
        horizontalPadding: Math.max(1, Math.min(Style.spacing.xs,
          Math.floor((pillRow.cellWidth - labelMetrics.advanceWidth - Style.normalBorderWidth * 2) / 2)))
        TextMetrics { id: labelMetrics; font.family: root.fontFamily; font.pixelSize: Style.font.caption; text: pill.text }
        verticalPadding: Style.spacing.controlPaddingY
        bordered: true
        focusable: true
        active: String(modelData.value) === root.value
        hasCursor: root.hasCursor && String(modelData.value) === root.value
        enabled: root.enabled
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onClicked: root.changed(String(modelData.value))
      }
    }

    PanelDropdown {
      id: moreDropdown
      width: pillRow.moreWidth
      showLabel: false
      triggerText: root.moreText
      active: root.onMore
      hasCursor: root.hasCursor && root.onMore
      options: root.customAvailable ? root.allOptions.concat([{ value: "custom", label: Strings.t("scale.custom", "Custom…") }]) : root.allOptions
      value: root.value
      popupParent: root.popupParent
      ownerOpen: root.ownerOpen
      enabled: root.enabled
      foreground: root.foreground
      fontFamily: root.fontFamily
      onChanged: function(value) {
        if (value === "custom") Qt.callLater(root.openCustom)
        else root.changed(value)
      }
    }
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
