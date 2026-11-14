import QtQuick
import QtTest
import "../.."

// Run with -import tests/qml-bar/stubs. hyprmoncfg itself edits the file too
// (TUI edits, and profile renames from the CLI, TUI or daemon), so the panel
// must write on top of what is on disk, never on top of a stale copy.
Item {
  id: stage

  Component {
    id: storeComponent
    WallpaperStore {}
  }

  TestCase {
    name: "WallpaperStore"
    when: windowShown

    function fileOf(store) {
      return findChild(store, "wallpaperFile")
    }

    function test_writesKeepChangesMadeOnDisk() {
      var store = createTemporaryObject(storeComponent, stage)
      var file = fileOf(store)
      verify(file !== null, "the store's FileView has objectName wallpaperFile")
      store.setWallpaper("Desk", "dell|a", "/a.png")

      // hyprmoncfg renamed Desk to Studio; the watcher has not fired yet.
      file.disk = JSON.stringify({ version: 1, profiles: { Studio: { "dell|a": "/a.png" } } })
      store.setWallpaper("Home", "lg|b", "/h.png")

      var written = JSON.parse(file.disk)
      compare(written.profiles.Studio["dell|a"], "/a.png", "the rename on disk survives")
      verify(written.profiles.Desk === undefined, "the stale name is not written back")
      compare(written.profiles.Home["lg|b"], "/h.png")
    }

    function test_renameAfterHyprmoncfgMovedItIsANoOp() {
      var store = createTemporaryObject(storeComponent, stage)
      var file = fileOf(store)
      store.setWallpaper("Desk", "dell|a", "/a.png")
      file.disk = JSON.stringify({ version: 1, profiles: { Studio: { "dell|a": "/a.png" } } })
      var before = file.disk

      store.renameProfile("Desk", "Studio")
      compare(file.disk, before, "nothing left to move, so nothing is written")
      store.dropProfile("Desk")
      compare(file.disk, before)
    }
  }
}
