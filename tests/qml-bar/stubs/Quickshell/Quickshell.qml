pragma Singleton
import QtQml

QtObject {
  property var screens: [{ name: "DP-1" }, { name: "eDP-1" }]
  function env(name) { return name === "HOME" ? "/home/test" : "" }
}
