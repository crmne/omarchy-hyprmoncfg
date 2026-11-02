import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Strings.js" as Strings

// Dropdown for a KeyboardPanel. The menu is positioned in panel coordinates
// instead of relying on Popup's implicit parent, which keeps it attached to
// the trigger when the panel itself is anchored away from the screen origin.
// It also never assigns `value` internally: callers keep their bindings while
// an asynchronous editor request is being normalized by hyprmoncfg.
Item {
  id: root

  property string label: ""
  property string tooltipText: ""
  // Right-aligned in the label row: a target, or a verdict on the current value.
  property string detail: ""
  property color detailColor: Qt.darker(root.foreground, 1.4)
  property string value: ""
  property var options: []
  property Item popupParent: null
  property bool ownerOpen: true
  property color foreground: Commons.Color.popups.text
  property color background: Commons.Color.popups.background
  property color popupBorder: Commons.Color.popups.border
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family
  property int rowHeight: Style.spacing.controlHeight
  property int popupRowHeight: Style.spacing.popupRowHeight
  property bool showLabel: true
  // Fixed trigger text (e.g. "More"); empty shows the current option's label.
  property string triggerText: ""
  property bool hasCursor: false
  // Selected look on the trigger, like an active pill (Scale's More trigger
  // when it carries the current value).
  property bool active: false
  property bool resetVisible: false
  property string resetTooltip: Strings.t("reset.default", "Reset to loaded profile value")

  readonly property var popupBorderSpec: Border.localOrSurfaceSpec(
    "popups", "border", popupBorder, Commons.Color.popups.border, Style.normalBorderWidth)
  readonly property bool popupOpen: menu.opened

  signal changed(string value)
  signal hovered(bool isHovered)
  signal resetRequested()

  onOwnerOpenChanged: if (!ownerOpen) menu.close()
  onVisibleChanged: if (!visible) menu.close()

  function open() { if (root.enabled) menu.open() }
  function close() { menu.close() }
  function toggle() { menu.opened ? menu.close() : root.open() }
  // An option { separator: true } draws a hairline; nothing can select it.
  function isSeparator(option) { return !!option && typeof option === "object" && option.separator === true }
  function nextOption(from, delta) {
    for (var index = from + delta; index >= 0 && index < options.length; index += delta)
      if (!isSeparator(options[index])) return index
    return from
  }
  function optionValue(option) {
    return option && typeof option === "object" ? String(option.value) : String(option)
  }
  function optionLabel(option) {
    return option && typeof option === "object" ? String(option.label) : String(option)
  }
  function currentLabel() {
    for (var index = 0; index < options.length; index++) {
      if (optionValue(options[index]) === value) return optionLabel(options[index])
    }
    return value
  }
  function menuPosition() {
    if (!popupParent) return Qt.point(0, trigger.height + Style.spacing.xxs)
    var below = trigger.mapToItem(popupParent, 0, trigger.height + Style.spacing.xxs)
    if (below.y + menu.implicitHeight <= popupParent.height) return below
    var above = trigger.mapToItem(popupParent, 0, -menu.implicitHeight - Style.spacing.xxs)
    return Qt.point(above.x, Math.max(0, above.y))
  }

  implicitWidth: Style.spacing.dropdownWidth
  // Measure the label rather than assume it, so content-sized parents that
  // sum implicit heights never clip the trigger.
  implicitHeight: showLabel && label !== ""
    ? dropdownLabel.implicitHeight + Style.spacing.labelGap + rowHeight : rowHeight

  Column {
    anchors.fill: parent
    spacing: Style.spacing.labelGap

    Item {
      visible: root.showLabel && root.label !== ""
      width: parent.width
      height: dropdownLabel.implicitHeight

      Text {
        id: dropdownLabel
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.right: detailText.visible ? detailText.left : parent.right
        anchors.rightMargin: detailText.visible ? Style.spacing.xs : 0
        text: root.label
        horizontalAlignment: Text.AlignLeft
        color: Qt.darker(root.foreground, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        topPadding: Math.ceil(font.pixelSize * 0.15)
        elide: Text.ElideRight

        HoverHandler { id: labelHover }
        PanelToolTip {
          visible: root.tooltipText !== "" && labelHover.hovered
          text: root.tooltipText
          fontFamily: root.fontFamily
        }
      }

      Text {
        id: detailText
        textFormat: Text.PlainText
        anchors.right: parent.right
        anchors.verticalCenter: dropdownLabel.verticalCenter
        visible: root.detail !== ""
        text: root.detail
        color: root.detailColor
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }
    }

    BorderSurface {
      id: trigger
      width: parent.width
      height: root.rowHeight
      radius: Style.cornerRadius
      activeFocusOnTab: true

      readonly property bool focused: activeFocus
      readonly property bool hot: triggerHover.hovered || root.hasCursor
      color: root.active && !focused && !hot
        ? Style.selectedFillFor(root.foreground, root.accent)
        : Style.controlFill(focused, hot, root.foreground, root.accent)
      borderSpec: Border.controlSpec(focused ? "focus" : (hot ? "hover-cursor" : "normal"),
                                     root.foreground, root.accent)

      HoverHandler {
        id: triggerHover
        onHoveredChanged: root.hovered(hovered)
      }

      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
            || event.key === Qt.Key_Space || event.key === Qt.Key_Down || event.text === "j") {
          root.toggle()
          event.accepted = true
        } else if (event.key === Qt.Key_Escape && menu.opened) {
          menu.close()
          event.accepted = true
        }
      }

      Text {
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.right: chevron.left
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: trigger.borderLeft + Style.spacing.controlPaddingX
        anchors.rightMargin: trigger.borderRight + Style.spacing.md
        text: root.triggerText !== "" ? root.triggerText : root.currentLabel()
        color: root.active ? Style.selectedStateColor(root.foreground, root.accent) : root.foreground
        font.bold: root.active
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        id: chevron
        anchors.right: resetAction.visible ? resetAction.left : parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.rightMargin: resetAction.visible ? Style.spacing.xxs
          : trigger.borderRight + Style.spacing.controlGap
        text: menu.opened ? "󰅃" : "󰅀"
        color: Qt.darker(root.foreground, 1.2)
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }

      MouseArea {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.right: resetAction.visible ? resetAction.left : parent.right
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          trigger.forceActiveFocus()
          root.toggle()
        }
      }

      PanelActionButton {
        id: resetAction
        anchors.right: parent.right
        anchors.rightMargin: trigger.borderRight + Style.spacing.xxs
        anchors.verticalCenter: parent.verticalCenter
        visible: root.resetVisible
        enabled: root.enabled
        iconText: "󰑐"
        tooltipText: root.resetTooltip
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.body
        size: Math.min(root.rowHeight - Style.spacing.xs, Style.space(24))
        focusable: true
        onClicked: root.resetRequested()
      }
    }
  }

  Popup {
    id: menu
    parent: root.popupParent || root
    readonly property point anchoredPosition: root.menuPosition()
    x: anchoredPosition.x
    y: anchoredPosition.y
    width: trigger.width
    readonly property int separators: root.options.filter(root.isSeparator).length
    readonly property int rows: root.options.length - separators
    implicitHeight: Math.min(
      rows * root.popupRowHeight + separators * Style.spacing.xs
        + Math.max(0, root.options.length - 1) * Style.spacing.labelGap
        + Style.spacing.xxs,
      root.popupRowHeight * 8 + 7 * Style.spacing.labelGap + Style.spacing.xxs)
    padding: Style.spacing.hairline
    leftPadding: Border.left(root.popupBorderSpec) + Style.spacing.hairline
    rightPadding: Border.right(root.popupBorderSpec) + Style.spacing.hairline
    topPadding: Border.top(root.popupBorderSpec) + Style.spacing.hairline
    bottomPadding: Border.bottom(root.popupBorderSpec) + Style.spacing.hairline
    focus: true
    popupType: Popup.Item

    background: BorderSurface {
      color: root.background
      borderSpec: root.popupBorderSpec
      radius: Style.cornerRadius
    }

    onOpened: {
      optionList.currentIndex = Math.max(0, optionList.indexOfValue(root.value))
      optionList.forceActiveFocus()
    }

    contentItem: ListView {
      id: optionList
      spacing: Style.spacing.labelGap
      implicitHeight: contentHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      model: root.options
      currentIndex: -1

      function indexOfValue(value) {
        for (var index = 0; index < root.options.length; index++) {
          if (root.optionValue(root.options[index]) === value) return index
        }
        return -1
      }
      function selectCurrent() {
        if (currentIndex < 0 || currentIndex >= root.options.length || root.isSeparator(root.options[currentIndex])) return
        var selectedValue = root.optionValue(root.options[currentIndex])
        root.changed(selectedValue)
        menu.close()
      }

      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Escape) {
          menu.close()
          event.accepted = true
        } else if (event.key === Qt.Key_Down || event.text === "j") {
          currentIndex = root.nextOption(currentIndex, 1)
          event.accepted = true
        } else if (event.key === Qt.Key_Up || event.text === "k") {
          currentIndex = root.nextOption(currentIndex, -1)
          event.accepted = true
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
          selectCurrent()
          event.accepted = true
        }
      }

      delegate: Rectangle {
        required property var modelData
        required property int index
        readonly property bool separator: root.isSeparator(modelData)
        width: optionList.width
        height: separator ? Style.spacing.xs : root.popupRowHeight
        color: !separator && index === optionList.currentIndex
          ? Style.hoverFillFor(root.foreground, root.accent)
          : "transparent"

        Rectangle {
          visible: parent.separator
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          height: Style.normalBorderWidth
          color: Qt.darker(root.foreground, 2.5)
        }

        Text {
          textFormat: Text.PlainText
          visible: !parent.separator
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: Style.spacing.controlPaddingX
          anchors.rightMargin: Style.spacing.controlPaddingX
          text: parent.separator ? "" : root.optionLabel(modelData)
          color: index === optionList.currentIndex
            ? Style.hoverStateColor(root.foreground, root.accent)
            : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        MouseArea {
          anchors.fill: parent
          enabled: !parent.separator
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onPositionChanged: optionList.currentIndex = parent.index
          onClicked: optionList.selectCurrent()
        }
      }
    }
  }
}
