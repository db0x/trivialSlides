// Header for mutating calls. A foreign document cannot set this header
// without a CORS grant -- which makes forged calls come to nothing. Inside
// Relay its csrf.js replaces this, which is why it sits in exactly one
// place here.
export function schreibKopf(weitere) {
  return Object.assign({ "X-Folien": "1" }, weitere || {});
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
