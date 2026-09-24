import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "LayoutReuse.js" as Reuse

Item {
  id: root
  property var profiles: []
  property var liveProfile: ({ outputs: [] })
  property var editorDisplays: []
  property bool available: false
  property bool busy: false
  property string statusMessage: ""
  property bool ownerOpen: false
  property Item popupParent: null
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.5)
  property string fontFamily: Style.font.family
  property string selectedName: ""
  property var mapping: ({})
  property var mappingProfile: null
  property var mappingLiveProfile: null
  readonly property var suggestions: Reuse.templates(profiles, liveProfile)
  readonly property var selected: suggestions.filter(function(item) { return item.name === root.selectedName })[0] || null
  readonly property var targetOptions: [{ value: "", label: "Leave out this saved display" }].concat(
    (liveProfile.outputs || []).map(function(out) {
      return { value: out.key, label: Reuse.targetLabel(out, root.liveProfile) }
    }))
  readonly property bool hasMapping: Object.keys(mapping).some(function(key) { return !!root.mapping[key] })
  signal useRequested(string name, var mapping)
  signal identifyRequested(string key)
  signal closeRequested()
  Keys.onEscapePressed: function(event) { root.closeRequested(); event.accepted = true }

  function focusFirst() { savedLayoutDropdown.focusControl() }

  function choose(name) {
    selectedName = name
    var item = (suggestions || []).filter(function(entry) { return entry.name === name })[0]
    mapping = item ? Model.clone(item.mapping) : ({})
    mappingProfile = item ? Model.clone(item.profile) : null
    mappingLiveProfile = Model.clone(liveProfile)
  }
  function reset() { choose(suggestions && suggestions.length ? suggestions[0].name : "") }
  function refresh() {
    var item = (suggestions || []).filter(function(entry) { return entry.name === root.selectedName })[0]
    if (!item) { reset(); return }
    mapping = Reuse.reconcileMapping(mapping, item.profile, liveProfile, mappingProfile, mappingLiveProfile)
    mappingProfile = Model.clone(item.profile)
    mappingLiveProfile = Model.clone(liveProfile)
  }
  onSuggestionsChanged: refresh()
  Component.onCompleted: refresh()

  EditorPane {
    id: choicePane
    width: Math.round(parent.width * 0.36)
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    title: "Use an existing layout"
    active: true
    foreground: root.foreground
    dim: root.dim
    fontFamily: root.fontFamily

    Column {
      anchors.fill: parent
      spacing: Style.space(12)
      Text {
        width: parent.width
        text: "Choose a template, then assign the monitors on your desk. The original profile stays saved."
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
      }
      PanelDropdown {
        id: savedLayoutDropdown
        width: parent.width
        label: "Saved layout"
        value: root.selectedName
        options: root.suggestions.map(function(item) { return { value: item.name, label: item.name } })
        popupParent: root.popupParent
        ownerOpen: root.ownerOpen && root.visible
        enabled: !root.busy && root.suggestions.length > 0
        foreground: root.foreground
        fontFamily: root.fontFamily
        onChanged: function(value) { root.choose(value) }
      }
      Text {
        width: parent.width
        text: root.selected ? root.selected.reason : "Save a profile first to reuse its layout."
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
        color: Color.accent
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
      }
      DisplayCanvas {
        width: parent.width
        height: Math.max(Style.space(130), choicePane.height * 0.4)
        profile: root.selected ? root.selected.profile : ({ outputs: [] })
        editorDisplays: root.editorDisplays
        interactive: false
        framed: false
        detailed: true
        foreground: root.foreground
        dim: root.dim
        fontFamily: root.fontFamily
      }
    }
  }

  EditorPane {
    anchors.left: choicePane.right
    anchors.leftMargin: Style.space(10)
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    title: "Match the physical monitors"
    foreground: root.foreground
    dim: root.dim
    fontFamily: root.fontFamily

    Column {
      anchors.fill: parent
      spacing: Style.space(12)
      Text {
        width: parent.width
        text: "Identify lights up the chosen screen. For identical monitors, check each role before continuing. Selecting an assigned screen swaps the two roles."
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
      }
      Flickable {
        width: parent.width
        height: Math.max(Style.space(100), parent.height - y - reuseAction.height - availabilityNote.height - parent.spacing * 2)
        contentHeight: mappings.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { }
        Column {
          id: mappings
          width: parent.width - Style.space(12)
          spacing: Style.space(15)
          Repeater {
            model: root.selected ? root.selected.profile.outputs : []
            Column {
              required property var modelData
              width: parent.width
              spacing: Style.space(5)
              Text {
                width: parent.width
                text: Reuse.roleLabel(parent.modelData, root.selected ? root.selected.profile : null)
                wrapMode: Text.WordWrap
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
              }
              Row {
                width: parent.width
                spacing: Style.space(8)
                PanelDropdown {
                  width: parent.width - identifyButton.width - parent.spacing
                  value: String(root.mapping[parent.parent.modelData.key] || "")
                  options: root.targetOptions
                  popupParent: root.popupParent
                  ownerOpen: root.ownerOpen && root.visible
                  showLabel: false
                  enabled: !root.busy
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onChanged: function(value) { root.mapping = Reuse.assign(root.mapping, parent.parent.modelData.key, value) }
                }
                Button {
                  id: identifyButton
                  focusable: true
                  text: "Identify"
                  bordered: true
                  enabled: !root.busy && !!root.mapping[parent.parent.modelData.key]
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.identifyRequested(root.mapping[parent.parent.modelData.key])
                }
              }
            }
          }
        }
      }
      Text {
        id: availabilityNote
        width: parent.width
        text: root.statusMessage !== "" ? root.statusMessage
          : (!root.available ? "The running hyprmoncfg daemon does not support layout reuse yet."
          : "Other connected screens keep their current settings. Review any adjustments in the draft before previewing."
          )
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Button {
        id: reuseAction
        focusable: true
        text: root.busy ? "Preparing layout…" : "Create draft for these monitors"
        selected: true
        bordered: true
        enabled: root.available && !root.busy && root.hasMapping
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.useRequested(root.selectedName, Model.clone(root.mapping))
      }
    }
  }
}
