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
  var copy = $("#deck-source-copy");
  var state = $("#deck-source-state");

  function show(text, cls) {
    state.textContent = text;
    state.className = "hint " + (cls || "");
  }

  button.addEventListener("click", function () {
    // Open first, fetch after: the dialog is the answer to the click, and
    // waiting for the network with nothing on the screen would look like
    // the click had missed.
    code.textContent = t("source.loading");
    copy.disabled = true;
    show("");
    dialog.showModal();
    Promise.resolve(flush())
      .then(function () { return fetch(base + "/source.html"); })
      .then(function (r) {
        if (!r.ok) throw new Error("Status " + r.status);
        return r.text();
      })
      .then(function (html) {
        // Markup from our own server, escaped there (source.js) -- the
        // text of the deck never reaches this line unescaped.
        code.innerHTML = html;
        copy.disabled = false;
      })
      .catch(function (e) {
        console.error(e);
        code.textContent = "";
        show(t("source.failed"), "is-error");
      });
  });

  // The text of the <pre> is the file, character for character: the
  // colouring adds nothing but elements around it. So there is no second
  // copy of the Markdown to keep in step here.
  copy.addEventListener("click", function () {
    var text = code.textContent;
    if (!navigator.clipboard) return show(t("source.copyFailed"), "is-error");
    navigator.clipboard.writeText(text).then(function () {
      show(t("source.copied"));
    }, function (e) {
      console.error(e);
      show(t("source.copyFailed"), "is-error");
    });
  });
}
