import QtQuick
import Quickshell
import Quickshell.Io
import "WallpaperModel.js" as Wallpaper

// Reads and writes ~/.config/hyprmoncfg/wallpapers.json. The panel writes it
// and the service watches it, so the file is the only channel between them.
// All rules live in WallpaperModel.js; this file only persists their results.
Item {
  id: root

  readonly property string configHome: String(Quickshell.env("XDG_CONFIG_HOME") || (Quickshell.env("HOME") + "/.config"))
  readonly property string path: root.configHome + "/hyprmoncfg/wallpapers.json"
  property var store: Wallpaper.normalize(null)

  function save(next) {
    root.store = Wallpaper.normalize(next)
    file.setText(JSON.stringify(root.store, null, 2) + "\n")
  }

  function setWallpaper(profile, key, path) { save(Wallpaper.setWallpaper(root.store, profile, key, path)) }
  function clearWallpaper(profile, key) { save(Wallpaper.clearWallpaper(root.store, profile, key)) }
  function renameProfile(from, to) {
    if (Wallpaper.normalize(root.store).profiles[String(from || "")]) save(Wallpaper.renameProfile(root.store, from, to))
  }
  function dropProfile(profile) {
    if (Wallpaper.normalize(root.store).profiles[String(profile || "")]) save(Wallpaper.dropProfile(root.store, profile))
  }

  function parse(text) {
    try {
      root.store = Wallpaper.normalize(JSON.parse(String(text || "")))
    } catch (error) {
      root.store = Wallpaper.normalize(null)
    }
  }

  FileView {
    id: file
    path: root.path
    watchChanges: true
    atomicWrites: true
    blockLoading: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.parse(text())
    onLoadFailed: root.store = Wallpaper.normalize(null)
  }
}
