// Which keys a presenter's spare button sends, and what they do here:
// toggle the fullscreen while presenting.
//
// A USB presenter is a keyboard. Its two paging keys are the ones reveal.js
// listens for anyway, so they need no setting; the third one differs from
// stick to stick, and there is no way to know it but to catch it. Hence the
// list rather than a fixed key -- and hence the settings dialog, where the
// button is pressed once and whatever arrives is kept (js/prefs.js).
//
// It lives in localStorage and therefore per browser, like the light/dark
// choice and the preview's format: the stick is plugged into the machine
// that presents, and that is what this belongs to. Nothing of it goes into
// a deck.
//
// One definition for two readers: the presentation reads the list
// (views/reveal.ejs), the dialog writes it. They must not disagree about
// the name of the drawer or about what is in it when nobody has chosen.
(function () {
  var KEY = "trivialslides:presenter-keys";

  // What the Sharkoon "Wireless Present" sends on its third button: Tab
  // when pressed once, Enter when pressed twice quickly. Both mean the same
  // thing to the hand that pressed it. reveal.js binds neither.
  var DEFAULT = ["Tab", "Enter"];

  // KeyboardEvent.key values, not keyCodes: that is what the browser gives
  // us today and what a name in a dialog can be read as ("Tab", "F5", "b").
  // Anything not a plain string is not one of ours.
  function clean(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    list.forEach(function (name) {
      if (typeof name !== "string") return;
      var trimmed = name.trim();
      if (!trimmed || trimmed.length > 20) return;
      if (out.indexOf(trimmed) === -1) out.push(trimmed);
    });
    return out;
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw === null) return DEFAULT.slice();
      var list = clean(JSON.parse(raw));
      // An empty list is a decision, not a fault: somebody who removed
      // every key wants the button to do nothing.
      return list === null ? DEFAULT.slice() : list;
    } catch (e) {
      // Private window, storage blocked, or something unreadable in there.
      return DEFAULT.slice();
    }
  }

  function write(list) {
    var sauber = clean(list) || [];
    try { localStorage.setItem(KEY, JSON.stringify(sauber)); } catch (e) { /* private window */ }
    return sauber;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* private window */ }
    return DEFAULT.slice();
  }

  window.presenterKeys = { read: read, write: write, reset: reset, DEFAULT: DEFAULT.slice() };
})();
