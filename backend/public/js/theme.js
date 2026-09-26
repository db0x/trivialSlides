// Light or dark, chosen by hand. Without a choice the system setting
// applies, which the CSS handles on its own via prefers-color-scheme --
// this file only exists for overriding it.
//
// The choice lives in localStorage and therefore per browser, not per
// account: it is a matter of the screen in front of you, not of the deck.
(function () {
  var SCHLUESSEL = "trivialslides:theme";
  var wurzel = document.documentElement;

  function gewaehlt() {
    try { return localStorage.getItem(SCHLUESSEL); } catch (e) { return null; }
  }

  // What the eye sees right now -- either the explicit choice or, without
  // one, whatever the system asks for.
  function aktuell() {
    return gewaehlt() || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function anwenden(modus) {
    if (modus) wurzel.setAttribute("data-theme", modus);
    else wurzel.removeAttribute("data-theme");
    beschriften();
  }

  // The button shows where the click leads, so its label has to say the
  // same -- an icon alone tells a screen reader nothing.
  function beschriften() {
    var knopf = document.getElementById("theme-umschalter");
    if (!knopf) return;
    var ziel = aktuell() === "dark" ? "light" : "dark";
    var text = ziel === "dark" ? "Auf dunkle Ansicht umschalten" : "Auf helle Ansicht umschalten";
    knopf.title = text;
    knopf.setAttribute("aria-label", text);
  }

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest("#theme-umschalter")) return;
    try { localStorage.setItem(SCHLUESSEL, aktuell() === "dark" ? "light" : "dark"); } catch (e) { /* private window */ }
    anwenden(gewaehlt());
  });

  // Someone who has never chosen follows the system, even while the page
  // stays open.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (!gewaehlt()) beschriften();
  });

  beschriften();
})();
