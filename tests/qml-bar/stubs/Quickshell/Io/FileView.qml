import QtQml

// An in-memory file. `disk` is what is on disk; text() returns what was last
// loaded, so a test can change the disk without the watcher having fired yet.
QtObject {
  property string path: ""
  property bool watchChanges: false
  property bool atomicWrites: false
  property bool blockLoading: false
  property bool printErrors: true
  property string disk: ""
  property string loadedText: ""
  property int reloads: 0
  signal fileChanged()
  signal loaded()
  signal loadFailed(var error)
  function text() { return loadedText }
  function setText(value) { disk = value; loadedText = value }
  function reload() { reloads++; loadedText = disk; loaded() }
}
