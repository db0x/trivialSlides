// The whole deck as Markdown, in a dialog (views/editor.ejs).
//
// Read-only on purpose: the file is written from the form, and a second
// place to type would be a second truth. What it shows is the SAVED file,
// which is why anything the delayed save still owes is flushed before the
// text is fetched -- otherwise the last sentence typed would be missing
// from a view whose whole point is completeness.
import { $, t } from "./base.js";

export function setupDeckSource(base, flush) {
  var button = $("#deck-source-open");
  var dialog = $("#deck-source-dialog");
  if (!button || !dialog) return;

  var code = $("#deck-source-code");

  // The one line the dialog ever says for itself: what it is waiting for,
  // or that the waiting came to nothing. It stands where the file would
  // stand, because that is where one is looking.
  function say(text, cls) {
    code.textContent = text;
    code.className = cls || "";
  }

  button.addEventListener("click", function () {
    // Open first, fetch after: the dialog is the answer to the click, and
    // waiting for the network with nothing on the screen would look like
    // the click had missed.
    say(t("source.loading"));
    dialog.showModal();
    Promise.resolve(flush())
      .then(function () { return fetch(base + "/source.html"); })
      .then(function (r) {
        if (!r.ok) throw new Error("Status " + r.status);
        return r.text();
      })
      .then(function (html) {
        // Markup from our own server: the file escaped there, and the
        // marks beside the blocks the only words added (source.js). The
        // text of the deck never reaches this line unescaped.
        code.className = "";
        code.innerHTML = html;
      })
      .catch(function (e) {
        console.error(e);
        say(t("source.failed"), "is-error");
      });
  });
}
