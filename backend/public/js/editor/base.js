// Header for mutating calls. A foreign document cannot set this header
// without a CORS grant -- which makes forged calls come to nothing. Inside
// Relay its csrf.js replaces this, which is why it sits in exactly one
// place here.
export function schreibKopf(weitere) {
  return Object.assign({ "X-Folien": "1" }, weitere || {});
}

// The strings the page builds itself. The server puts only the subset the
// browser needs into the page (see i18n.js); everything it rendered
// already arrived as finished text.
var TEXTE = {};
try {
  var tafel = document.getElementById("daten-texte");
  if (tafel) TEXTE = JSON.parse(tafel.textContent);
} catch (e) { /* without the table the keys show through, which is loud enough */ }

export function t(schluessel, werte) {
  var text = TEXTE[schluessel];
  if (text === undefined) return schluessel;
  if (!werte) return text;
  return text.replace(/\{(\w+)\}/g, function (ganz, name) {
    return Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : ganz;
  });
}

// Shorthands that would otherwise run through every file.
export function $(sel, wurzel) {
  return (wurzel || document).querySelector(sel);
}
export function $$(sel, wurzel) {
  return Array.prototype.slice.call((wurzel || document).querySelectorAll(sel));
}

// Waits until nothing has happened for a while. Used for saving and for
// redrawing the preview while typing.
export function verzoegert(ms, fn) {
  var t = null;
  return function () {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}
