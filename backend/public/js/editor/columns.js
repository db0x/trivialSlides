// The columns of a column layout, in the browser.
//
// The twin of the COLUMN_* half of layouts.js on the server: the same break
// line, the same rule for taking a body apart into columns and putting it
// back together. Two halves because that one is a module on the server and
// this one is a script in a page -- what they must not do is disagree, so
// the two strings themselves come from the server with the page rather than
// being written a second time here (see views/editor.ejs).
var config = window.SLIDES_COLUMNS || {};

// The line that separates one column's text from the next.
export var COLUMN_BREAK = config.break;

// The value data-columns carries while the columns are kept apart.
export var SPLIT = config.split;

// Tolerant of spacing, like its twin: a break is a line that holds nothing
// but the comment. Without the global flag -- it is used for testing a
// single line as well as for splitting.
export var BREAK_LINE = /^[ \t]*<!--[ \t]*\.column[ \t]*-->[ \t]*$/;

// The body -> one text per column, always exactly `count` of them. Same
// rule as the server's splitColumns(): a surplus break puts what follows it
// into the LAST column instead of dropping it, and missing breaks leave the
// columns at the end empty.
export function splitColumns(text, count) {
  var parts = String(text == null ? "" : text)
    .split(new RegExp(BREAK_LINE.source, "m"))
    .map(function (t) { return t.trim(); });
  var keep = Math.max(count, 1) - 1;
  var out = parts.slice(0, keep);
  out.push(parts.slice(keep).filter(Boolean).join("\n\n"));
  while (out.length < count) out.push("");
  return out;
}

// The columns' texts -> one body. All of them empty means an empty body: a
// slide nobody has written anything on should not carry breaks in the file.
export function joinColumns(parts) {
  var texts = (parts || []).map(function (t) { return String(t == null ? "" : t).trim(); });
  if (!texts.some(Boolean)) return "";
  return texts.join("\n\n" + COLUMN_BREAK + "\n\n");
}

// One text out of all the columns, breaks and all. For the moment a slide
// stops keeping its columns apart: the breaks then mean nothing, and the
// text field cannot show them -- it would have to fall back to source mode
// over a line the user never typed.
export function mergeColumns(text) {
  return String(text == null ? "" : text)
    .split(new RegExp(BREAK_LINE.source, "m"))
    .map(function (t) { return t.trim(); })
    .filter(Boolean)
    .join("\n\n");
}
