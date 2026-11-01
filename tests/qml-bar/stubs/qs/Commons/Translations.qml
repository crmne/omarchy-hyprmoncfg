import QtQuick

// The shape of Omarchy's Commons.Translations, with a Danish catalog written
// in, so a test can switch language without Quickshell's file views.
QtObject {
  property var directory: ""
  readonly property string language: I18n.language
  readonly property var strings: language === "da"
    ? ({ "option.placeLeft": "Venstre", "test.greeting": "Hej %1", "test.count": { one: "%1 skærm", other: "%1 skærme" } })
    : ({})

  function t(key, fallback) {
    var value = strings[key]
    return typeof value === "string" ? value : fallback
  }

  function tn(key, count, fallback) {
    var value = strings[key]
    if (!value) return fallback
    return count === 1 ? value.one : value.other
  }
}
