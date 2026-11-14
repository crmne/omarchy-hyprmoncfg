import QtQuick
import Quickshell
import Quickshell.Io
import "WallpaperModel.js" as Wallpaper

// Reads and writes ~/.config/hyprmoncfg/wallpapers.json. The panel writes it
// and the service watches it, so the file is the only channel between them.
// hyprmoncfg edits it too (its TUI, and profile renames and deletes from any
// client), so every write starts from what is on disk, not from a copy the
// watcher may not have refreshed yet. All rules live in WallpaperModel.js;
// this file only persists their results.
Item {
  id: root

  readonly property string configHome: String(Quickshell.env("XDG_CONFIG_HOME") || (Quickshell.env("HOME") + "/.config"))
  readonly property string path: root.configHome + "/hyprmoncfg/wallpapers.json"
  property var store: Wallpaper.normalize(null)

  function save(next) {
    root.store = Wallpaper.normalize(next)
    file.setText(JSON.stringify(root.store, null, 2) + "\n")
  }

  function current() {
    file.reload()
    root.parse(file.text())
    return root.store
  }

  function setWallpaper(profile, key, path) { save(Wallpaper.setWallpaper(current(), profile, key, path)) }
  function clearWallpaper(profile, key) { save(Wallpaper.clearWallpaper(current(), profile, key)) }
  // hyprmoncfg moves or drops the entry itself when it renames or deletes a
  // profile; these only act when an older hyprmoncfg left it in place.
  function renameProfile(from, to) {
    var store = current()
    if (store.profiles[String(from || "")]) save(Wallpaper.renameProfile(store, from, to))
  }
  function dropProfile(profile) {
    var store = current()
    if (store.profiles[String(profile || "")]) save(Wallpaper.dropProfile(store, profile))
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
    objectName: "wallpaperFile"
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
