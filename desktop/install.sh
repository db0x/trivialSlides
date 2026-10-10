#!/usr/bin/env bash
# Registers the speaker view as an application of this desktop, so that S
# in a running talk can hand the address over to it.
#
# What it touches, and nothing else:
#
#   ~/.local/share/applications/trivialslides-speaker.desktop   (written)
#   the handler for x-scheme-handler/trivialslides              (set)
#
# Undo it with ./install.sh --remove, which deletes that one file and
# forgets the scheme again. Nothing is installed system-wide, nothing is
# compiled, and the application itself stays where it is in this checkout.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app="$here/trivialslides-speaker.py"
name="trivialslides-speaker.desktop"
dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
target="$dir/$name"

if [ "${1:-}" = "--remove" ]; then
  rm -f "$target"
  # The scheme is remembered in mimeapps.list; dropping the lines that
  # name this entry is what unsets it, and xdg-mime has no "forget".
  for list in "${XDG_CONFIG_HOME:-$HOME/.config}/mimeapps.list" "$dir/mimeapps.list"; do
    [ -f "$list" ] || continue
    tmp="$(mktemp)"
    grep -v "^x-scheme-handler/trivialslides=" "$list" > "$tmp" || true
    mv "$tmp" "$list"
  done
  command -v update-desktop-database >/dev/null && update-desktop-database "$dir" || true
  echo "removed: $target"
  echo "The scheme trivialslides:// is no longer handled."
  exit 0
fi

# A desktop entry pointing at a file that is not executable fails with
# nothing to read anywhere, so it is checked here rather than discovered
# in the middle of a talk.
[ -x "$app" ] || { echo "not executable: $app" >&2; exit 1; }
python3 -c "import gi; gi.require_version('WebKit2','4.1'); gi.require_version('Gtk','3.0')" 2>/dev/null || {
  echo "missing: python3-gi with WebKit2 4.1 (Debian/Ubuntu: apt install python3-gi gir1.2-webkit2-4.1)" >&2
  exit 1
}

mkdir -p "$dir"
sed "s|@EXEC@|$app|" "$here/trivialslides-speaker.desktop.in" > "$target"
chmod 644 "$target"

command -v update-desktop-database >/dev/null && update-desktop-database "$dir" || true
xdg-mime default "$name" x-scheme-handler/trivialslides

echo "installed: $target"
echo "handler:   $(xdg-mime query default x-scheme-handler/trivialslides)"
echo
echo "Where the editor runs is read from TRIVIALSLIDES_URL; without it the"
echo "application looks for http://localhost:9900. To point it elsewhere,"
echo "put the address into the Exec line of the file above, like"
echo "  Exec=env TRIVIALSLIDES_URL=http://beamer.local:9900 $app %u"
