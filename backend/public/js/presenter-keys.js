// The keys a presenter's spare button sends, and what they do:
//
//   presenterKeys  toggle the screen while presenting (views/reveal.ejs)
//   startKeys      start the talk from the editor (js/editor/index.js)
//
// A USB presenter is a keyboard. Its two paging keys are the ones reveal.js
// listens for anyway, so they need no setting; the third one differs from
// stick to stick, and there is no way to know it but to catch it. Hence the
// lists rather than fixed keys -- and hence the settings dialog, where the
// button is pressed once and whatever arrives is kept (js/prefs.js).
//
// They live in localStorage and therefore per browser, like the light/dark
// choice and the preview's format: the stick is plugged into the machine
// that presents, and that is what this belongs to. Nothing of it goes into
// a deck.
//
// One definition for two readers: the pages read the lists, the dialog
// writes them. They must not disagree about the name of a drawer or about
// what is in it when nobody has chosen.
(function () {
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

  // One drawer, named and with a default of its own. Both behave alike
  // down to the empty list, which is a decision rather than a fault:
  // somebody who removed every key wants the button to do nothing.
  function drawer(key, byDefault) {
    function read() {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) return byDefault.slice();
        var list = clean(JSON.parse(raw));
        return list === null ? byDefault.slice() : list;
      } catch (e) {
        // Private window, storage blocked, or something unreadable there.
        return byDefault.slice();
      }
    }
    function write(list) {
      var sauber = clean(list) || [];
      try { localStorage.setItem(key, JSON.stringify(sauber)); } catch (e) { /* private window */ }
      return sauber;
    }
    function reset() {
      try { localStorage.removeItem(key); } catch (e) { /* private window */ }
      return byDefault.slice();
    }
    return { read: read, write: write, reset: reset, DEFAULT: byDefault.slice() };
  }

  // What the Sharkoon "Wireless Present" sends on its third button: Tab
  // when pressed once, Enter when pressed twice quickly. Both mean the same
  // thing to the hand that pressed it. reveal.js binds neither.
  window.presenterKeys = drawer("trivialslides:presenter-keys", ["Tab", "Enter"]);

  // F5, the key every presentation program has used for thirty years and
  // the one a stick can usually be taught to send. Deliberately not the
  // spare key above: in the editor Tab and Enter already belong to
  // somebody -- Tab to whoever is working with the keyboard, Enter to
  // every field and button it lands on.
  window.startKeys = drawer("trivialslides:start-keys", ["F5"]);
})();
