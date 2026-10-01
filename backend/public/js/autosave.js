// Whether the editor writes the file by itself.
//
//   on  (how it ships)  every pause in the typing writes the deck
//   off                 nothing is written until the Save button is pressed
//
// Off does NOT mean the editor stops talking to the server: it keeps
// sending its model exactly as before, and the server holds it instead of
// writing it (backend/storage.js). That is what lets one page through the
// slides and start the talk with everything that was typed, without a file
// having been touched.
//
// In localStorage and therefore per browser, like the light/dark choice and
// the presenter's keys: it says how this person wants to work, not anything
// about a deck. Nothing of it goes into a .md.
//
// A plain script and not a module, because two readers need it and only one
// of them is one: the editor (js/editor/index.js) and the settings dialog
// (js/prefs.js). The same arrangement presenter-keys.js has, for the same
// reason.
(function () {
  var KEY = "trivialslides:autosave";

  function read() {
    try {
      // Only an explicit "off" switches it off. Anything else -- never
      // chosen, unreadable, a private window -- is the way it ships.
      return localStorage.getItem(KEY) !== "0";
    } catch (e) {
      return true;
    }
  }

  function write(on) {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch (e) { /* then it stays on, which is the safe way round */ }
    // The editor is on the same page and has to hear about it without
    // being reloaded -- its Save button appears and disappears with this.
    document.dispatchEvent(new CustomEvent("autosave", { detail: { on: !!on } }));
  }

  window.autosave = { read: read, write: write };
})();
