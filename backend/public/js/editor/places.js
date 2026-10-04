// Where a block stands, written into the text.
//
// The mouse end of this is in the preview (js/slide-place.js); what
// arrives here is the finished answer -- this block, these numbers -- and
// the one thing left to do is put it in the body where the renderer will
// read it back (render.js, elementMark).
//
// The body is Markdown and stays Markdown: a placement is a line of its
// own after the block, in reveal.js' own comment family, exactly as a
// fragment is. Nothing else about the text is touched -- not its order,
// not its wording, not the other comment lines it carries.
//
// The twin of this is the renderer, and the pair has one rule between
// them: what the one writes the other has to read back.

// A block ends where a blank line is -- outside a fenced code block,
// where a blank line is part of the code.
var FENCE = /^\s{0,3}(```|~~~)/;
// A line that is nothing but an element comment. It belongs to the block
// in front of it rather than being one of its own.
var ELEMENT = /^[ \t]*<!--[ \t]*\.element:.*-->[ \t]*$/;
// What this module writes and rewrites. Everything else on such a line --
// a class, a fragment number -- is left exactly as it stands.
var AT = /\s*data-at="[^"]*"/;
var TURN = /\s*data-turn="[^"]*"/;
// A list does not take its comment the way a paragraph does: a comment
// line directly under the last item belongs to that ITEM, which is how a
// single bullet is given a fragment. A placement is meant for the whole
// list, so there it goes behind a blank line.
var LIST = /^[ \t]*([-*+]|\d+[.)])\s/;
// The one line this module must refuse to count past: a group wraps
// several blocks into one element, so from there on the blocks of the
// text and the elements on the slide are no longer the same list, and the
// number the preview sent would point at the wrong one.
var GROUP = /^[ \t]*<!--[ \t]*\/?\.group/;

// The body -> its top-level blocks. Each one is { from, to } as line
// numbers, `to` being the last line of the block itself; a comment line
// that follows it is part of it and is remembered separately.
export function blocks(text) {
  var lines = String(text == null ? "" : text).split("\n");
  var out = [];
  var fenced = false;
  var current = null;
  lines.forEach(function (line, i) {
    if (FENCE.test(line)) fenced = !fenced;
    var empty = !fenced && line.trim() === "";
    if (empty) { current = null; return; }
    // A comment line joins the block in front of it; one that stands
    // alone (nothing before it) is a block of its own and renders as
    // nothing -- which is exactly how it is counted below.
    if (!fenced && ELEMENT.test(line) && out.length && !current) {
      out[out.length - 1].marks.push(i);
      return;
    }
    if (!current) {
      current = { from: i, to: i, marks: [] };
      out.push(current);
    } else {
      current.to = i;
      if (!fenced && ELEMENT.test(line)) current.marks.push(i);
    }
  });
  // The lines of the block itself, without the comments that trail it.
  out.forEach(function (b) {
    b.lines = lines.slice(b.from, b.to + 1);
    b.text = b.lines.join("\n");
    b.list = LIST.test(b.lines[0] || "");
  });
  return out;
}

// Whether this text can be placed in at all. A group makes the blocks of
// the text and the elements on the slide two different lists, and a
// number from one of them means nothing in the other.
export function placeable(text) {
  return !String(text == null ? "" : text).split("\n").some(function (l) { return GROUP.test(l); });
}

// How many blocks the slide SHOWS -- which is every block that is not
// merely a comment. The preview counts the same list from the other end
// (js/slide-place.js, blocks) and sends its count along, so the two can
// be compared before anything is written.
export function count(text) {
  return blocks(text).filter(function (b) { return !onlyMarks(b); }).length;
}

function onlyMarks(b) {
  return b.lines.every(function (l) { return l.trim() === "" || ELEMENT.test(l); });
}

// The nth shown block, or null.
function nth(all, n) {
  var seen = -1;
  for (var i = 0; i < all.length; i++) {
    if (onlyMarks(all[i])) continue;
    seen++;
    if (seen === n) return all[i];
  }
  return null;
}

// data-at="..." plus, where there is one, data-turn="..." -- put into the
// block's own comment line, or into a new one where it has none.
//
// `at` is "x,y,w" and `turn` a number; both come from the preview, which
// has already rounded them to what the file can hold. Everything else on
// the line survives: a block that appears on a click and is then moved
// still appears on a click.
export function place(text, n, at, turn) {
  var lines = String(text == null ? "" : text).split("\n");
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return null;
  var says = ' data-at="' + at + '"' + (turn ? ' data-turn="' + turn + '"' : "");

  // An existing comment line of this block, if it has one that may carry
  // the placement. On a list only a line standing APART may: one written
  // directly under the last item belongs to that item (see LIST above).
  var mine = -1;
  block.marks.forEach(function (i) {
    if (block.list && i === block.to) return;
    if (mine < 0) mine = i;
  });

  if (mine >= 0) {
    var line = lines[mine].replace(AT, "").replace(TURN, "");
    lines[mine] = line.replace(/\s*-->\s*$/, says + " -->");
    return lines.join("\n");
  }

  // None yet: a new line after the block. Behind a blank line where the
  // block is a list, directly underneath otherwise -- which is how this
  // project has always written the comment that belongs to a paragraph.
  var neu = "<!-- .element:" + says + " -->";
  var after = block.to;
  if (block.list) lines.splice(after + 1, 0, "", neu);
  else lines.splice(after + 1, 0, neu);
  return lines.join("\n");
}
