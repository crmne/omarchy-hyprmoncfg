import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui

ShellRoot {
  id: root
  property int scenario: 0
  property var scenarios: []
  property var connectedSize: null

  function check(condition, message) {
    if (!condition) throw new Error(message)
  }

  function find(item, property) {
    if (property in item) return item
    for (var i = 0; i < item.children.length; i++) {
      var found = find(item.children[i], property)
      if (found) return found
    }
    return null
  }

  function glyphBounds(item, button) {
    function visibleText(item) {
      if (!item.visible) return null
      if (item instanceof Text && item.text === reference.text) return item
      for (var i = 0; i < item.children.length; i++) {
        var found = visibleText(item.children[i])
        if (found) return found
      }
      return null
    }
    var glyph = visibleText(item)
    check(glyph !== null, "monitor glyph is missing")
    monitorMetrics.font = glyph.font
    monitorMetrics.text = glyph.text
    var ink = monitorMetrics.tightBoundingRect
    return glyph.mapToItem(button, ink.x, glyph.baselineOffset + ink.y, ink.width, ink.height)
  }

  function runScenario() {
    var data = scenarios[scenario]
    Style.reduceMotion = true
    Style.fontBaseSize = data.font
    testBar.vertical = data.vertical
    panel.monitorCount = data.monitors
    panel.backendConnected = data.connected
    widget.settings = { showBarIcon: true }
    settle.restart()
  }

  function verifyScenario() {
    var data = scenarios[scenario]
    var button = find(widget, "tooltipText")
    var expected = glyphBounds(reference, reference)
    var actual = glyphBounds(button, button)
    var smaller = glyphBounds(smallerFontSample, smallerFontSample)
    check(Math.abs(smaller.width - expected.width) > 0.05,
      "measurement failed to detect a smaller glyph font")
    var size = Style.bar.iconSize
    check(Math.abs(Math.max(actual.width, actual.height) - size) < 0.05,
      "monitor size differs from the stock icon")
    check(Math.abs(actual.width - expected.width) < 0.05 && Math.abs(actual.height - expected.height) < 0.05,
      "monitor glyph proportions differ from stock")
    check(Math.abs(actual.x + actual.width / 2 - button.width / 2) < 0.05
      && Math.abs(actual.y + actual.height / 2 - button.height / 2) < 0.05,
      "monitor is no longer optically centered")
    check(widget.implicitWidth === reference.implicitWidth, "slot width changed")
    check(widget.implicitHeight === reference.implicitHeight, "slot height changed")
    var headerActual = glyphBounds(headerSample, headerSample)
    var headerExpected = glyphBounds(stockHero, stockHero)
    check(Math.abs(headerActual.width - headerExpected.width) < 0.05
      && Math.abs(headerActual.height - headerExpected.height) < 0.05,
      "panel-header glyph differs from stock Display panel")

    // Measure the painted Text itself, including all transforms of its parents.
    var badge = null
    function visit(item) {
      if (item instanceof Text && item.text === "󰄬") badge = item
      for (var i = 0; i < item.children.length; i++) visit(item.children[i])
    }
    visit(button)
    check(badge !== null, "connection badge is missing")
    check(badge.visible === data.connected, "badge does not follow backend state")
    if (data.connected) {
      check(badge.color.toString() === Commons.Color.accent.toString(), "badge lost accent color")
      badgeMetrics.font = badge.font
      var ink = badge.mapToItem(button, badgeMetrics.tightBoundingRect.x,
        badge.baselineOffset + badgeMetrics.tightBoundingRect.y,
        badgeMetrics.tightBoundingRect.width, badgeMetrics.tightBoundingRect.height)
      check(ink.x >= 0 && ink.y >= 0 && ink.x + ink.width <= button.width
        && ink.y + ink.height <= button.height, "badge exceeds the button")
      connectedSize = actual
    } else {
      check(Math.abs(actual.width - connectedSize.width) < 0.05
        && Math.abs(actual.height - connectedSize.height) < 0.05,
        "disconnecting resized the monitor")
    }
    console.log("CHECK " + JSON.stringify(data) + " monitor=" + actual.width + "x" + actual.height)
    widget.settings = { showBarIcon: false }
    hiddenSettle.restart()
  }

  function verifyHidden() {
    var button = find(widget, "tooltipText")
    check(widget.implicitWidth === 0 && widget.implicitHeight === 0, "hidden slot did not collapse")
    check(widget.visible && button.visible && button.opacity === 0, "hidden anchor was lost")
    scenario++
    if (scenario < scenarios.length) runScenario()
    else {
      console.log("RESULT pass " + scenarios.length + " scenarios")
      Qt.quit()
    }
  }

  readonly property var panel: {
    var loader = find(widget, "source")
    return loader ? loader.item : null
  }

  Component.onCompleted: {
    var data = []
    for (var i = 0; i < 3; i++) {
      for (var orientation = 0; orientation < 2; orientation++) {
        for (var monitors = 1; monitors <= 2; monitors++) {
          for (var connected = 1; connected >= 0; connected--) {
            data.push({ font: [12, 14, 20][i], vertical: !!orientation,
              monitors: monitors, connected: !!connected })
          }
        }
      }
    }
    scenarios = data
    start.start()
  }

  Timer {
    id: start
    interval: 150
    onTriggered: {
      try {
        root.check(root.panel !== null, "fake panel did not load")
        root.runScenario()
      } catch (error) { console.log("RESULT fail " + error); Qt.quit() }
    }
  }
  Timer {
    id: hiddenSettle
    // Older shells animate opacity for 140 ms without a reduceMotion token.
    interval: 180
    onTriggered: {
      try { root.verifyHidden() }
      catch (error) { console.log("RESULT fail " + error); Qt.quit() }
    }
  }
  Timer {
    id: settle
    interval: 25
    onTriggered: {
      try { root.verifyScenario() }
      catch (error) { console.log("RESULT fail " + error + " " + JSON.stringify(root.scenarios[root.scenario])); Qt.quit() }
    }
  }

  TextMetrics {
    id: monitorMetrics
  }
  TextMetrics {
    id: badgeMetrics
    text: "󰄬"
    font.family: reference.fontFamily
    font.pixelSize: Math.max(7, Math.round(reference.fontSize * 0.45))
    font.bold: true
  }

  QtObject {
    id: testBar
    property bool vertical: false
    property int barSize: vertical ? Style.bar.sizeVertical : Style.bar.sizeHorizontal
    property string fontFamily: Style.font.family
    property color barForeground: Commons.Color.foreground
    property color urgent: Commons.Color.urgent
    property bool foregroundAnimationEnabled: false
    function registerClickTarget(item) {}
    function unregisterClickTarget(item) {}
    function hideTooltip(item) {}
    function showTooltip(item, text) {}
  }

  FloatingWindow {
    visible: true
    implicitWidth: 240
    implicitHeight: 100
    color: Commons.Color.background
    Item {
      id: smallerFontSample
      opacity: 0
      Text {
        text: reference.text
        font.family: reference.fontFamily
        font.pixelSize: Math.max(1, reference.fontSize - 4)
      }
    }
    Item {
      id: stockHero
      opacity: 0
      Text { text: reference.text; font.family: Style.font.family; font.pixelSize: Style.font.display }
    }
    DisplayIcon {
      id: headerSample
      opacity: 0
      optical: false
      fontSize: Style.font.display
      monitorCount: root.panel ? root.panel.monitorCount : 1
    }
    Row {
      spacing: 20
      BarIconButton {
        id: reference
        bar: testBar
        width: implicitWidth
        height: implicitHeight
        text: root.panel && root.panel.monitorCount > 1 ? "󰍺" : "󰍹"
      }
      WidgetUnderTest {
        id: widget
        bar: testBar
        width: implicitWidth
        height: implicitHeight
      }
    }
  }
}
