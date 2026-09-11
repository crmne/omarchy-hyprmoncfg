import QtQuick
import Quickshell
import qs.Commons
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
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
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

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

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

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰕭"
    dimmed: root.barIconDimmed
    tooltipText: root.activeProfile !== "" ? "Display · " + root.activeProfile : "Display · hyprmoncfg"
    iconComponent: Component {
      Item {
        OpticalGlyph {
          id: barDisplayGlyph
          anchors.fill: parent
          text: button.text
          color: button.foreground
          fontFamily: button.fontFamily
          fontSize: button.fontSize
        }

        Text {
          textFormat: Text.PlainText
          visible: root.backendConnected
          anchors.right: barDisplayGlyph.right
          anchors.bottom: barDisplayGlyph.bottom
          anchors.rightMargin: -Style.space(1)
          anchors.bottomMargin: -Style.space(1)
          text: "󰄬"
          color: Color.accent
          font.family: button.fontFamily
          font.pixelSize: Math.max(7, Math.round(button.fontSize * 0.45))
          font.bold: true
        }
      }
    }

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.LeftButton) root.togglePanel()
    }
  }
}
