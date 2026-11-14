import QtQuick
import Qt.labs.folderlistmodel

// Omarchy announces no background change to plugins, so watch its state
// directory. Both a theme switch and a background pick replace the
// `background` symlink there with `ln -nsf`. A FileView on the link never sees
// that, but the directory does. Changes come in bursts; one signal follows.
Item {
  id: root

  property string home: ""
  readonly property string stateDir: root.home !== "" ? root.home + "/.local/state/omarchy/current" : ""

  signal backgroundChanged()

  FolderListModel {
    folder: root.stateDir !== "" ? "file://" + root.stateDir : ""
    showDirs: false
    showHidden: true
    onDataChanged: settle.restart()
    onRowsInserted: settle.restart()
    onRowsRemoved: settle.restart()
  }

  Timer {
    id: settle
    interval: 150
    onTriggered: root.backgroundChanged()
  }
}
