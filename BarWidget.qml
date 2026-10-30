import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "crmne.hyprmoncfg"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) {
      if (panelLoader.item.opened && panelLoader.item.workspaceOnly) {
        panelLoader.item.showDisplaySettings()
        return
      }
      if (!panelLoader.item.opened) {
        panelLoader.item.workspaceLaunchOrigin = null
        panelLoader.item.workspaceOnly = false
      }
      panelLoader.item.toggle()
    }
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool backendConnected: panelLoader.item ? panelLoader.item.backendConnected === true : false
  readonly property bool barIconDimmed: panelLoader.item ? panelLoader.item.barIconDimmed === true : false
  readonly property int monitorCount: panelLoader.item ? panelLoader.item.monitorCount : Quickshell.screens.length
  readonly property string activeProfile: panelLoader.item ? panelLoader.item.activeProfile : ""

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  // Keep the widget root visible so its separate panel window can still map.
  // Only collapse the icon slot; IPC routing and the preview service stay live.
  readonly property bool showBarIcon: root.setting("showBarIcon", true) !== false
  implicitWidth: root.showBarIcon ? button.implicitWidth : 0
  implicitHeight: root.showBarIcon ? button.implicitHeight : 0
  // The bar marks the slot of an open panel, with a minimum length when the
  // slot gives no hint. A hidden icon leaves no slot to mark: a hint under a
  // pixel passes the bar's "hint > 0" check and rounds to an empty mark.
  readonly property real openPanelIndicatorWidth: root.showBarIcon ? 0 : 0.4
  readonly property real openPanelIndicatorHeight: root.showBarIcon ? 0 : 0.4

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    opacity: root.showBarIcon ? 1 : 0
    anchors.fill: parent
    bar: root.bar
    text: root.monitorCount > 1 ? "󰍺" : "󰍹"
    labelVisible: false
    fontSize: Style.bar.iconFont
    fixedWidth: vertical ? -1 : Style.bar.iconSlot
    fixedHeight: vertical ? Style.bar.iconSlot : -1
    dimmed: root.barIconDimmed
    tooltipText: root.activeProfile !== "" ? "Display · " + root.activeProfile : "Display · hyprmoncfg"
    DisplayIcon {
      x: (parent.width - width) / 2
      y: (parent.height - height) / 2
      fontSize: button.fontSize
      size: Style.bar.iconSize
      monitorCount: root.monitorCount
      connected: root.backendConnected
      fontFamily: button.fontFamily
      foreground: button.foreground
      scale: button.pressScale
    }

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.togglePanel()
    }
  }
}
