// How S opens the speaker view during a presentation. Three ways, and the
// reason there are three is that no one of them is simply right:
//
//   window  (how it ships)  a window of its own, which is what a second
//                           screen wants -- but a browser only gives that
//                           as a POPUP: no address bar, and under Wayland
//                           a frame the window manager did not draw
//   tab                     an ordinary tab. Dragged out of the strip it
//                           becomes a regular window with a title bar
//   app                     the application in desktop/, a window of the
//                           desktop with the title bar GNOME draws. It
//                           shows the view at its own address, which the
//                           first two cannot: reveal writes its speaker
//                           page into about:blank and talks to it through
//                           window.opener, so that one has no URL at all
//
// There is no fourth. A page asks for a window with window.open, and the
// standard lets it ask for exactly two things: a popup or a tab. Every
// feature list that produces a window of its own produces a popup -- we
// measured the lot -- so the switch is the honest version of a choice that
// cannot be made to disappear.
//
// For the first two, what is read back is reveal's third argument: the
// page here knows about popups, the rewritten plugin (backend/app.js) only
// asks what to pass on. For the third, reveal's window is not opened at
// all; the application gets the address instead, and what it shows is fed
// by the talk over the channel in backend/speaker.js.
//
// In localStorage and therefore per browser, like the light/dark choice,
// the presenter's keys and autosave: it belongs to the machine that
// presents and to the screens plugged into it. Nothing of it goes into a
// .md.
(function () {
  var KEY = "trivialslides:speaker-window";

  // The size reveal.js asks for. Kept because it is a sensible one and
  // because a popup without it opens at some default of the browser's.
  var POPUP = "width=1100,height=700";

  var WAYS = ["window", "tab", "app"];

  function read() {
    try {
      var stored = localStorage.getItem(KEY);
      return WAYS.indexOf(stored) === -1 ? "window" : stored;
    } catch (e) {
      // Private window, storage blocked, or something unreadable there.
      return "window";
    }
  }

  function write(way) {
    if (WAYS.indexOf(way) === -1) return;
    try { localStorage.setItem(KEY, way); } catch (e) { /* stays reveal's own way */ }
  }

  // What goes into window.open as its third argument. An empty string is
  // not "no preference": it is precisely what makes a browser open a tab
  // instead of a popup.
  function features() {
    return read() === "tab" ? "" : POPUP;
  }

  // The address the application is handed. A scheme of our own, because
  // that is the only thing a web page may use to reach an application --
  // and the desktop decides what answers to it (desktop/install.sh).
  function appUrl() {
    var slug = document.body && document.body.dataset ? document.body.dataset.slug : "";
    return slug ? "trivialslides://speaker/" + encodeURIComponent(slug) : "";
  }

  // Handing over to the application. location.href and not window.open:
  // an unknown scheme in window.open leaves an empty tab standing when
  // nothing handles it, where this leaves the talk exactly as it was. The
  // browser asks the first time whether it may; "always allow" makes the
  // question go away.
  function handOver() {
    var url = appUrl();
    if (!url) return false;
    try {
      window.location.href = url;
      return true;
    } catch (e) {
      return false;
    }
  }

  // What reveal.js gets back when the application took over. It opened no
  // window, but the plugin is about to write a page into one and poke it
  // for the rest of the talk, so it is handed something that answers --
  // quietly, and without ever being seen.
  //
  // closed stays false, so a second press of S reaches focus() rather than
  // opening a second one: in that case the application is told again,
  // which brings it forward (or starts it, if it was closed meanwhile).
  function stub() {
    var nothing = function () {};
    return {
      closed: false,
      focus: handOver,
      blur: nothing,
      close: nothing,
      postMessage: nothing,
      addEventListener: nothing,
      removeEventListener: nothing,
      location: { href: "" },
      document: { write: nothing, close: nothing, body: null },
    };
  }

  // Called by the notes plugin in place of its own window.open
  // (backend/app.js rewrites that one line). Returns a window for the two
  // browser ways, and something that keeps reveal quiet for the third.
  function open() {
    if (read() === "app" && handOver()) return stub();
    return window.open("about:blank", "reveal.js - Notes", features());
  }

  window.speakerWindow = {
    read: read, write: write, features: features,
    open: open, appUrl: appUrl, WAYS: WAYS,
  };
})();
