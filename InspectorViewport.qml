import QtQuick
import QtQuick.Window
import QtQuick.Controls

Flickable {
  id: root

  default property alias fields: contents.data
  property real formHeight: 0
  property Item currentField: null
  property real scrollBarGap: 4
  readonly property Item focusedField: root.Window.window ? root.Window.window.activeFocusItem : null
  readonly property bool scrollable: contentHeight > height

  contentWidth: width
  contentHeight: formHeight
  interactive: scrollable
  clip: true
  boundsBehavior: Flickable.StopAtBounds
  flickableDirection: Flickable.VerticalFlick

  function reveal(field) {
    if (!visible || !field || !field.visible) return
    var ancestor = field
    while (ancestor && ancestor !== contents) ancestor = ancestor.parent
    if (!ancestor) return

    var top = field.mapToItem(contents, 0, 0).y
    var bottom = top + field.height
    var position = contentY
    if (top < position) position = top
    else if (bottom > position + height) position = bottom - height
    contentY = Math.max(0, Math.min(position, Math.max(0, contentHeight - height)))
  }

  onCurrentFieldChanged: Qt.callLater(function() { root.reveal(root.currentField) })
  onFocusedFieldChanged: Qt.callLater(function() { root.reveal(root.focusedField) })
  onHeightChanged: Qt.callLater(function() {
    root.reveal(root.currentField)
    root.reveal(root.focusedField)
  })
  onContentHeightChanged: {
    contentY = Math.max(0, Math.min(contentY, Math.max(0, contentHeight - height)))
    Qt.callLater(function() {
      root.reveal(root.currentField)
      root.reveal(root.focusedField)
    })
  }

  Item {
    id: contents
    width: root.width - (scrollBar.visible ? scrollBar.width + root.scrollBarGap : 0)
    height: root.contentHeight
  }

  ScrollBar.vertical: ScrollBar {
    id: scrollBar
    policy: ScrollBar.AsNeeded
    visible: root.scrollable
    active: root.scrollable
  }
}
