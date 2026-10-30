#!/bin/bash
set -euo pipefail

# Use real Omarchy rendering components, but never load the real Panel.qml.
# Usage: bash tests/baricon-geometry.sh [path/to/omarchy/shell]
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shell_dir=${1:-${OMARCHY_PATH:-/usr/share/omarchy}/shell}
[[ -f $shell_dir/Ui/BarIconButton.qml ]] || {
  echo "Omarchy shell not found: $shell_dir" >&2
  exit 1
}

test_tmp=$(mktemp -d)
trap 'rm -rf -- "$test_tmp"' EXIT
mkdir -m 700 "$test_tmp/runtime"
ln -s "$(realpath "$shell_dir/Ui")" "$test_tmp/Ui"
ln -s "$(realpath "$shell_dir/Commons")" "$test_tmp/Commons"
cp "$root/BarWidget.qml" "$test_tmp/WidgetUnderTest.qml"
cp "$root/DisplayIcon.qml" "$test_tmp/DisplayIcon.qml"
cp "$root/tests/baricon-geometry/Panel.qml" "$test_tmp/Panel.qml"
cp "$root/tests/baricon-geometry/shell.qml" "$test_tmp/shell.qml"

# Fractional and integer device scaling without touching compositor settings.
for scale in 1 1.25 1.5 2; do
  output=$(env QT_QPA_PLATFORM=offscreen QT_QPA_PLATFORMTHEME=basic QT_STYLE_OVERRIDE=Fusion QT_QUICK_BACKEND=software \
    QT_SCALE_FACTOR="$scale" DCONF_BACKEND=memory \
    XDG_RUNTIME_DIR="$test_tmp/runtime" \
    timeout 20s quickshell -p "$test_tmp" --no-color 2>&1) || {
    printf '%s\n' "$output" >&2
    exit 1
  }
  if [[ $output != *"RESULT pass"* ]]; then
    printf '%s\n' "$output" >&2
    exit 1
  fi
  printf 'PASS bar icon geometry at device scale %s\n' "$scale"
done
