import QtQuick
import QtTest
import qs.Commons as Commons
import "../../Model.js" as Model
import "../../Strings.js" as Strings

TestCase {
  id: testCase
  name: "Strings"

  readonly property string direct: Strings.t("test.greeting", "Hello %1", "Ada")
  readonly property string plural: Strings.tn("test.count", 2, "%1 display", "%1 displays")
  readonly property string throughModel: Model.placementOptions()[0].label
  readonly property string untranslated: Strings.t("test.englishOnly", "Only English")
  readonly property bool mirrored: Strings.rightToLeft()

  function cleanup() {
    Commons.I18n.language = "en"
    Commons.I18n.rightToLeft = false
  }

  function test_bindings_follow_the_language() {
    compare(direct, "Hello Ada")
    compare(plural, "2 displays")
    compare(throughModel, "Left")
    Commons.I18n.language = "da"
    compare(direct, "Hej Ada")
    compare(plural, "2 skærme")
    compare(throughModel, "Venstre")
    Commons.I18n.language = "en"
    compare(direct, "Hello Ada")
    compare(throughModel, "Left")
  }

  function test_a_string_missing_from_the_language_stays_english() {
    Commons.I18n.language = "da"
    compare(untranslated, "Only English")
  }

  function test_numbers_use_the_language() {
    Commons.I18n.language = "da"
    compare(Strings.number(1.5, 1), "1,5")
  }

  function test_right_to_left_follows_the_language() {
    compare(mirrored, false)
    Commons.I18n.rightToLeft = true
    compare(mirrored, true)
  }
}
