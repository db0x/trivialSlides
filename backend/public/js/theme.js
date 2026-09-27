// Light or dark, chosen by hand. Without a choice the system setting
// applies, which the CSS handles on its own via prefers-color-scheme --
// this file only exists for overriding it.
//
// The choice lives in localStorage and therefore per browser, not per
// account: it is a matter of the screen in front of you, not of the deck.
(function () {
  var SCHLUESSEL = "trivialslides:theme";
  var wurzel = document.documentElement;

  // A plain script, not a module, so it cannot import base.js -- it reads
  // the same table the page carries for everyone else.
  var TEXTS = {};
  try {
    var table = document.getElementById("data-texte");
    if (table) TEXTS = JSON.parse(table.textContent);
  } catch (e) { /* the key showing through is loud enough */ }
  function t(k) { return TEXTS[k] === undefined ? k : TEXTS[k]; }

  function chosen() {
    try { return localStorage.getItem(SCHLUESSEL); } catch (e) { return null; }
  }

  // What the eye sees right now -- either the explicit choice or, without
  // one, whatever the system asks for.
  function current() {
    return chosen() || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function anwenden(modus) {
    if (modus) wurzel.setAttribute("data-theme", modus);
    else wurzel.removeAttribute("data-theme");
    label();
  }

  // The button shows where the click leads, so its label has to say the
  // same -- an icon alone tells a screen reader nothing.
  function label() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;
    var target = current() === "dark" ? "light" : "dark";
    var text = t(target === "dark" ? "theme.tooDark" : "theme.tooLight");
    button.dataset.tip = text;
    button.setAttribute("aria-label", text);
  }

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest("#theme-toggle")) return;
    try { localStorage.setItem(SCHLUESSEL, current() === "dark" ? "light" : "dark"); } catch (e) { /* private window */ }
    anwenden(chosen());
  });

  // Someone who has never chosen follows the system, even while the page
  // stays open.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (!chosen()) label();
  });

  label();
})();
