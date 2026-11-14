pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Model.js" as Model
import "WallpaperModel.js" as Wallpaper

// Per-display wallpapers for the active profile. Omarchy draws one picture on
// every screen, so while the active profile assigns any wallpaper this layer
// suspends Omarchy's background and draws every screen itself: the assigned
// picture, or Omarchy's own background on screens without one. Omarchy is
// driven only through its public commands (see WallpaperModel.js).
Item {
  id: root

  property var shell: null
  property var document: null
  property string stock: ""

  readonly property string home: String(Quickshell.env("HOME") || "")
  readonly property string profile: Model.currentProfileName(root.document)
  readonly property var assigned: Wallpaper.assignments(store.store, root.profile,
    root.document ? root.document.monitors : null)
  readonly property bool active: Wallpaper.shouldSuspend(root.assigned)
  // Omarchy's restart cover must lift before its background is suspended;
  // see Wallpaper.coverShowing.
  property bool coverClear: false
  readonly property bool suspend: root.active && root.coverClear
  property bool suspendedByUs: false

  function applySuspension() {
    if (root.active) stockReader.running = true
    if (root.suspend === root.suspendedByUs) return
    root.suspendedByUs = root.suspend
    Quickshell.execDetached(Wallpaper.suspendCommand(root.suspend))
  }

  onActiveChanged: root.applySuspension()
  onSuspendChanged: root.applySuspension()
  Component.onCompleted: root.applySuspension()
  // Disabling the plugin or reloading the shell hands the desktop back.
  Component.onDestruction: if (root.suspendedByUs) Quickshell.execDetached(Wallpaper.suspendCommand(false))

  WallpaperStore { id: store }

  // Omarchy's current background, for screens without an assignment. Nothing
  // announces a theme change, so StockBackgroundWatch watches for one.
  Process {
    id: stockReader
    command: Wallpaper.stockCommand(root.home)
    stdout: StdioCollector {
      onStreamFinished: {
        root.stock = String(text || "").trim()
        // OWE turns Omarchy's background back on when it hands back a still.
        if (root.suspendedByUs) Quickshell.execDetached(Wallpaper.suspendCommand(true))
      }
    }
  }

  Process {
    id: coverProbe
    command: Wallpaper.coverProbeCommand()
    stdout: StdioCollector {
      onStreamFinished: if (!Wallpaper.coverShowing(text)) root.coverClear = true
    }
  }

  // Poll only while wallpapers wait on the cover; it lifts within seconds.
  Timer {
    property int attempts: 0
    interval: 500
    repeat: true
    triggeredOnStart: true
    running: root.active && !root.coverClear
    onTriggered: {
      // A cover that never lifts must not keep the wallpapers off for good.
      if (++attempts > 40) root.coverClear = true
      else if (!coverProbe.running) coverProbe.running = true
    }
  }

  StockBackgroundWatch {
    home: root.home
    onBackgroundChanged: if (root.active) stockReader.running = true
  }

  Process {
    id: selector
    command: Wallpaper.selectorCommand()
    onExited: stockReader.running = true
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: window
      required property var modelData
      readonly property string source: Wallpaper.screenSource(root.assigned, modelData.name, root.stock)

      screen: modelData
      visible: Wallpaper.screenVisible(root.assigned, modelData.name, root.stock)
      color: "black"
      anchors { top: true; bottom: true; left: true; right: true }
      WlrLayershell.namespace: "hyprmoncfg-wallpaper"
      WlrLayershell.layer: Wallpaper.aboveVideo(root.assigned, modelData.name, root.stock) ? WlrLayer.Bottom : WlrLayer.Background
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      exclusionMode: ExclusionMode.Ignore

      Image {
        anchors.fill: parent
        // A video stock background is OWE's to draw; screenVisible keeps
        // this window off those screens so its video shows through.
        source: Wallpaper.isSupportedImage(window.source) ? "file://" + window.source : ""
        sourceSize.width: Math.ceil(window.width * window.modelData.devicePixelRatio)
        sourceSize.height: Math.ceil(window.height * window.modelData.devicePixelRatio)
        fillMode: Image.PreserveAspectCrop
        asynchronous: true
        cache: false
      }

      // Desktop double-clicks: left picks a background, right opens the theme
      // picker. Single clicks do nothing, so a stray click opens no picker.
      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onDoubleClicked: function(mouse) {
          if (mouse.button === Qt.RightButton) Quickshell.execDetached(Wallpaper.themeSwitcherCommand())
          else if (!selector.running) selector.running = true
        }
      }
    }
  }
}
