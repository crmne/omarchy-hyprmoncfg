pragma Singleton
import QtQml

QtObject {
  function controlSpec(state, foreground, accent) { return { state: state, widths: { top: 1, right: 1, bottom: 1, left: 1 } } }
  function none() { return null }
  function flat(color, width) { return { widths: { top: width, right: width, bottom: width, left: width } } }
  function top(spec) { return spec && spec.widths ? spec.widths.top : 0 }
  function right(spec) { return spec && spec.widths ? spec.widths.right : 0 }
  function bottom(spec) { return spec && spec.widths ? spec.widths.bottom : 0 }
  function left(spec) { return spec && spec.widths ? spec.widths.left : 0 }
}
