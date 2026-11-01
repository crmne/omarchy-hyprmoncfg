pragma Singleton
import QtQuick

QtObject {
  property string language: "en"
  property bool rightToLeft: false

  function formatNumber(value, decimals) {
    var text = decimals === undefined ? String(value) : Number(value).toFixed(decimals)
    return language === "da" ? text.replace(".", ",") : text
  }
}
