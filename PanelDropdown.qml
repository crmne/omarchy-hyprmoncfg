import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui

// Dropdown for a KeyboardPanel. The menu is positioned in panel coordinates
// instead of relying on Popup's implicit parent, which keeps it attached to
// the trigger when the panel itself is anchored away from the screen origin.
// It also never assigns `value` internally: callers keep their bindings while
// an asynchronous editor request is being normalized by hyprmoncfg.
Item {
  id: root

  property string label: ""
  property string tooltipText: ""
  property string value: ""
  property var options: []
  property Item popupParent: null
  property bool ownerOpen: true
  property color foreground: Color.popups.text
  property color background: Color.popups.background
  property color popupBorder: Color.popups.border
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property int rowHeight: Style.spacing.controlHeight
  property int popupRowHeight: Style.spacing.popupRowHeight
  property bool showLabel: true
  property bool hasCursor: false
  property bool resetVisible: false
  property string resetTooltip: "Reset to loaded profile value"

  readonly property var popupBorderSpec: Border.localOrSurfaceSpec(
    "popups", "border", popupBorder, Color.popups.border, Style.normalBorderWidth)
  readonly property bool popupOpen: menu.opened

  signal changed(string value)
  signal hovered(bool isHovered)
  signal resetRequested()

  onOwnerOpenChanged: if (!ownerOpen) menu.close()
  onVisibleChanged: if (!visible) menu.close()

  function open() { menu.open() }
  function close() { menu.close() }
  function toggle() { menu.opened ? menu.close() : menu.open() }
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
    return trigger.mapToItem(popupParent, 0, -menu.implicitHeight - Style.spacing.xxs)
  }

  implicitWidth: Style.spacing.dropdownWidth
  implicitHeight: showLabel && label !== "" ? rowHeight + Style.spacing.huge : rowHeight

  Column {
    anchors.fill: parent
    spacing: Style.spacing.labelGap

    Text {
      textFormat: Text.PlainText
      visible: root.showLabel && root.label !== ""
      text: root.label
      color: Qt.darker(root.foreground, 1.4)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      topPadding: Math.ceil(font.pixelSize * 0.15)

      HoverHandler { id: labelHover }
      PanelToolTip {
        visible: root.tooltipText !== "" && labelHover.hovered
        text: root.tooltipText
        fontFamily: root.fontFamily
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
      color: Style.controlFill(focused, hot, root.foreground, root.accent)
      borderSpec: Border.controlSpec(focused ? "focus" : (hot ? "hover-cursor" : "normal"),
                                     root.foreground, root.accent)

      HoverHandler {
        id: triggerHover
        onHoveredChanged: root.hovered(hovered)
      }

      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
            || event.key === Qt.Key_Space || event.key === Qt.Key_Down) {
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
        text: root.currentLabel()
        color: root.foreground
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
    implicitHeight: Math.min(
      root.options.length * root.popupRowHeight
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
        if (currentIndex < 0 || currentIndex >= root.options.length) return
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
          currentIndex = Math.min(root.options.length - 1, currentIndex + 1)
          event.accepted = true
        } else if (event.key === Qt.Key_Up || event.text === "k") {
          currentIndex = Math.max(0, currentIndex - 1)
          event.accepted = true
        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
          selectCurrent()
          event.accepted = true
        }
      }

      delegate: Rectangle {
        required property var modelData
        required property int index
        width: optionList.width
        height: root.popupRowHeight
        color: index === optionList.currentIndex
          ? Style.hoverFillFor(root.foreground, root.accent)
          : "transparent"

        Text {
          textFormat: Text.PlainText
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          anchors.leftMargin: Style.spacing.controlPaddingX
          anchors.rightMargin: Style.spacing.controlPaddingX
          text: root.optionLabel(modelData)
          color: index === optionList.currentIndex
            ? Style.hoverStateColor(root.foreground, root.accent)
            : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onPositionChanged: optionList.currentIndex = parent.index
          onClicked: optionList.selectCurrent()
        }
      }
    }
  }
}
