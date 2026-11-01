import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Strings.js" as Strings

// Extend | Mirror above the stage. The panel's keyboard cursor drives it, so
// it takes no Tab focus of its own. `value` is "" for an arrangement that is
// neither, which selects no chip.
ButtonGroup {
  property bool hasCursor: false

  options: Model.displayModeOptions()
  cursorIndex: hasCursor ? (value === "mirror" ? 1 : 0) : -1
  focusable: false
  fontSize: Style.font.caption
}
