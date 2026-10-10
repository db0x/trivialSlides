#!/usr/bin/env python3
"""The speaker view as an application of the desktop.

Not a browser window. A window of the window manager, with the title bar
the window manager draws -- which is the whole point of it: reveal.js opens
its own speaker view with window.open and a size, and a size is what makes
a browser open a POPUP. Under Wayland that popup has no title bar to grab,
and GNOME draws no decoration for it either, because Mutter does not do
server-side decorations at all. Nothing a web page can say changes that.

So this is the way round it: the view is an ordinary page at an ordinary
address (backend/views/speaker.ejs), served by the editor, and this holds
it in a window that belongs to the desktop rather than to Chrome.

It is deliberately thin. All it does is open a window, put a WebView in it,
and point that at a URL. What is shown, how it looks and where it gets its
state from are the server's business -- the same page in a browser tab
shows exactly the same thing.

Run it with a deck:

    trivialslides-speaker.py http://localhost:9900/d/example/speaker
    trivialslides-speaker.py trivialslides://speaker/example

The second form is what a browser hands over when S is pressed and the
.desktop file beside this one is installed; where the editor runs is then
read from TRIVIALSLIDES_URL (see that file).

Dependencies: python3-gi and gir1.2-webkit2-4.1, both of which a GNOME
desktop has already. No pip, no node, no packaging.
"""

import os
import sys
import urllib.parse

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, Gdk, WebKit2, GLib  # noqa: E402  (gi wants the versions first)

# Where the editor runs, for the scheme form of the address. A talk is
# presented off a laptop far more often than off a server somewhere, so
# localhost is the guess; the port is the one docker-compose publishes.
DEFAULT_BASE = os.environ.get("TRIVIALSLIDES_URL", "http://localhost:9900")

SCHEME = "trivialslides"

# Only these. The argument arrives from a browser, which got it from a web
# page: it decides which address this window loads, and nothing that is not
# plainly an http(s) address of ours is going to be loaded.
ALLOWED_SCHEMES = ("http", "https")


def address(argument):
    """Turn what was handed over into the URL of a speaker view.

    Two forms, because two things call this: a person on a command line,
    who types the address, and a browser acting on the scheme handler,
    which hands over trivialslides://speaker/<slug>.
    """
    parsed = urllib.parse.urlparse(argument)

    if parsed.scheme == SCHEME:
        # trivialslides://speaker/<slug> -- netloc is "speaker", the slug
        # is the path. Anything else under this scheme is not ours.
        slug = parsed.path.strip("/")
        if parsed.netloc != "speaker" or not slug:
            raise ValueError("not a speaker address: %s" % argument)
        # A slug is a folder name on the server and arrives from outside:
        # it is quoted, and a path climbing out of it is no slug at all.
        if "/" in slug or slug in (".", ".."):
            raise ValueError("not a deck: %s" % slug)
        base = DEFAULT_BASE.rstrip("/")
        return "%s/d/%s/speaker" % (base, urllib.parse.quote(slug, safe=""))

    if parsed.scheme in ALLOWED_SCHEMES:
        return argument

    raise ValueError("not an address this will open: %s" % argument)


class SpeakerWindow(Gtk.Window):
    def __init__(self, url):
        super().__init__(title="trivialSlides — Sprecheransicht")
        self.set_default_size(1100, 760)
        self.set_icon_name("x-office-presentation")

        self.view = WebKit2.WebView()

        # A lectern machine is not a browsing session: nothing of this
        # window outlives it, and a talk leaves no cookies behind.
        self.view.get_context().set_cache_model(WebKit2.CacheModel.DOCUMENT_VIEWER)

        settings = self.view.get_settings()
        settings.set_enable_developer_extras(True)
        # No right-click menu offering to go back, reload or print: there
        # is nowhere to go back to, and a wrong click mid-talk is the one
        # thing this window must not do.
        settings.set_enable_back_forward_navigation_gestures(False)

        self.add(self.view)
        self.view.load_uri(url)

        self.connect("destroy", Gtk.main_quit)
        self.connect("key-press-event", self.on_key)

        self.fullscreen_on = False

    def on_key(self, _widget, event):
        """The two keys a window like this needs and no more.

        F11 fullscreen, because a speaker view on a second screen is better
        without a title bar once it is where it belongs -- the difference
        to the popup being that here it is the presenter who asks for it.
        Escape leaves fullscreen; it does not close the window, which would
        be an expensive misfire mid-talk. Ctrl+R reloads, for the one case
        where the editor was restarted under a running talk.
        """
        key = Gdk.keyval_name(event.keyval)
        control = bool(event.state & Gdk.ModifierType.CONTROL_MASK)

        if key == "F11":
            self.fullscreen_on = not self.fullscreen_on
            self.fullscreen() if self.fullscreen_on else self.unfullscreen()
            return True
        if key == "Escape" and self.fullscreen_on:
            self.fullscreen_on = False
            self.unfullscreen()
            return True
        if control and key in ("r", "R"):
            self.view.reload()
            return True
        return False


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    try:
        url = address(argv[1])
    except ValueError as wrong:
        print("trivialslides-speaker: %s" % wrong, file=sys.stderr)
        return 2

    # The window manager reads this for the application's name and icon
    # under Wayland; without it the window is "Python3" in the switcher.
    GLib.set_prgname("trivialslides-speaker")
    GLib.set_application_name("trivialSlides Sprecheransicht")

    window = SpeakerWindow(url)
    window.show_all()
    Gtk.main()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
