// Switching the language. The choice goes into a cookie rather than into
// the browser's own storage, because most of the text is rendered by the
// server -- from the editor's form down to the error page when no browser
// is there to print a PDF. Only a cookie reaches it, so the page reloads
// afterwards.
//
// Before reloading, anything unsaved is saved: the editor writes on a
// delay, and a reload in that window would throw away the last keystroke.
(function () {
  var knopf = document.getElementById("sprache-umschalter");
  if (!knopf) return;

  knopf.addEventListener("click", function () {
    var ziel = knopf.dataset.ziel;
    if (!ziel) return;
    knopf.disabled = true;
    var basis = window.FOLIEN_BASIS ? window.FOLIEN_BASIS.replace(/\/d\/[^/]+$/, "") : "";
    // The editor announces whether it still owes a save; the overview has
    // nothing to lose and answers with a resolved promise.
    var offen = window.trivialSlidesSpeichern ? window.trivialSlidesSpeichern() : Promise.resolve();
    offen.catch(function () { /* reload anyway -- the server keeps the last saved state */ })
      .then(function () {
        return fetch(basis + "/sprache/" + ziel, { method: "POST" });
      })
      .then(function () { window.location.reload(); })
      .catch(function () { knopf.disabled = false; });
  });
})();
