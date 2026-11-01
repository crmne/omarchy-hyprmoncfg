import QtQuick
import qs.Commons as Commons

// Loaded only through Strings.js: see the note there before using this type.
Commons.Translations {
  directory: Qt.resolvedUrl("i18n")

  readonly property bool rightToLeft: Commons.I18n.rightToLeft === true

  function number(value, decimals) {
    return Commons.I18n.formatNumber(value, decimals)
  }
}
