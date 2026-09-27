// Switching the language. The choice goes into a cookie rather than into
// the browser's own storage, because most of the text is rendered by the
// server -- from the editor's form down to the error page when no browser
// is there to print a PDF. Only a cookie reaches it, so the page reloads
// afterwards.
//
// Before reloading, anything unsaved is saved: the editor writes on a
// delay, and a reload in that window would throw away the last keystroke.
(function () {
  var button = document.getElementById("language-toggle");
  if (!button) return;

  button.addEventListener("click", function () {
    var target = button.dataset.target;
    if (!target) return;
    button.disabled = true;
    var base = window.SLIDES_BASE ? window.SLIDES_BASE.replace(/\/d\/[^/]+$/, "") : "";
    // The editor announces whether it quiet owes a save; the overview has
    // nothing to lose and answers with a resolved promise.
    var open = window.trivialSlidesSave ? window.trivialSlidesSave() : Promise.resolve();
    open.catch(function () { /* reload anyway -- the server keeps the last saved state */ })
      .then(function () {
        return fetch(base + "/language/" + target, { method: "POST" });
      })
      .then(function () { window.location.reload(); })
      .catch(function () { button.disabled = false; });
  });
})();
