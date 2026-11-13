import QtQuick
import Quickshell.Io
import "WallpaperModel.js" as Wallpaper
import "Strings.js" as Strings

// Opens Omarchy's desktop file chooser for one still image. Exit 1 means the
// user picked nothing (a decision, not an error); exit 2 means no chooser ran.
Item {
  id: root

  readonly property bool running: chooser.running
  signal picked(string path)
  signal failed(string message)

  function open() {
    if (!chooser.running) chooser.running = true
  }

  Process {
    id: chooser
    command: ["omarchy", "file", "select", "--title", Strings.t("wallpaper.chooserTitle", "Choose wallpaper"), "--extensions", "png jpg jpeg webp"]
    // Read the path when stdout closes; onExited can run before it is collected.
    stdout: StdioCollector {
      onStreamFinished: {
        var path = String(text || "").trim().split("\n")[0]
        if (path === "") return
        if (Wallpaper.isSupportedImage(path)) root.picked(path)
        else root.failed(Strings.t("wallpaper.unsupported", "Choose a PNG, JPEG or WebP image."))
      }
    }
    onExited: function(exitCode) {
      if (exitCode === 2) root.failed(Strings.t("wallpaper.chooserFailed", "The file chooser could not open."))
    }
  }
}
