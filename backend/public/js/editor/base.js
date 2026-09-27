// Header for mutating calls. A foreign document cannot set this header
// without a CORS grant -- which makes forged calls come to nothing. Inside
// Relay its csrf.js replaces this, which is why it sits in exactly one
// place here.
export function schreibHead(weitere) {
  return Object.assign({ "X-Slides": "1" }, weitere || {});
}

// The strings the page builds itself. The server puts only the subset the
// browser needs into the page (see i18n.js); everything it rendered
// already arrived as finished text.
var TEXTS = {};
try {
  var table = document.getElementById("data-texte");
  if (table) TEXTS = JSON.parse(table.textContent);
} catch (e) { /* without the table the keys show through, which is loud enough */ }

export function t(schluessel, values) {
  var text = TEXTS[schluessel];
  if (text === undefined) return schluessel;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole;
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
