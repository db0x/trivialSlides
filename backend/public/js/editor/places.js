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
// A heading, and which of the three sizes it is. Only a block that is ONE
// such line: a size is something the dialog can offer for it, and a block
// of several lines is not a heading however it starts.
var HEADING = /^[ \t]*(#{1,6})\s*(.*)$/;
// A block that is nothing but a picture. It has no size the dialog could
// offer -- "heading" means nothing to a photograph -- so the row of sizes
// stays out of its way, the way it does for a list or a code block.
var IMAGE = /^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/;
// The same line with its two halves caught: what it says and what it
// points at (see image() at the foot of this file).
var IMAGE_PARTS = /^[ \t]*!\[([^\]]*)\]\(([^)]*)\)[ \t]*$/;
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
    var fence = FENCE.test(line);
    // A fence begins a block of its own and ends one, blank line or not.
    // That is Markdown's own rule -- marked closes the paragraph above at
    // the fence -- and this list has to keep to it, because the preview
    // counts the blocks it was GIVEN (js/slide-place.js) and the two are
    // compared before anything is placed. Counted as one block here and
    // drawn as two over there, every drag on the slide was refused with
    // "its text and what the preview shows are not the same sequence of
    // blocks", which is true, and was this line's fault rather than the
    // text's.
    if (fence && !fenced) current = null;
    if (fence) fenced = !fenced;
    var empty = !fenced && !fence && line.trim() === "";
    if (empty) { current = null; return; }
    // A comment line joins the block in front of it; one that stands
    // alone (nothing before it) is a block of its own and renders as
    // nothing -- which is exactly how it is counted below.
    if (!fenced && !fence && ELEMENT.test(line) && out.length && !current) {
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
    // The fence that closes the block closes it here too: what comes
    // after it is the next block, with or without a blank line between.
    if (fence && !fenced) current = null;
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
// Which line carries what is said ABOUT this block -- where it stands,
// how far it is turned, how it is aligned, whether it waits for a click.
// One line for all of it, so that everything about one element stands in
// one place and nothing has to be read twice.
//
// On a list only a line standing APART may be it: one written directly
// under the last item belongs to that ITEM, which is how a single bullet
// is given a fragment (see LIST above).
function markLine(block) {
  var mine = -1;
  block.marks.forEach(function (i) {
    if (block.list && i === block.to) return;
    if (mine < 0) mine = i;
  });
  return mine;
}

// The classes that line carries, as a list. Empty for a block that has
// no line of its own yet.
export function classes(text, n) {
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return [];
  var mine = markLine(block);
  if (mine < 0) return [];
  var line = String(text).split("\n")[mine];
  var hit = /\bclass="([^"]*)"/.exec(line);
  return hit ? hit[1].trim().split(/\s+/).filter(Boolean) : [];
}

// And set. An empty list takes the attribute away rather than leaving an
// empty one standing; a block that has no comment line and is given no
// classes gets no line either.
export function setClasses(text, n, list) {
  var lines = String(text == null ? "" : text).split("\n");
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return null;
  var said = (list || []).filter(Boolean).join(" ");
  var mine = markLine(block);
  if (mine < 0) {
    if (!said) return lines.join("\n");
    var neu = '<!-- .element: class="' + said + '" -->';
    if (block.list) lines.splice(block.to + 1, 0, "", neu);
    else lines.splice(block.to + 1, 0, neu);
    return lines.join("\n");
  }
  var line = lines[mine].replace(/\s*class="[^"]*"/, "");
  // In front of the rest, which is where the renderer's own examples put
  // it and where a reader looks for it first.
  if (said) line = line.replace(/^(\s*<!--\s*\.element:)/, '$1 class="' + said + '"');
  lines[mine] = line.replace(/<!--\s*\.element:\s*-->/, "");
  // A line left with nothing on it says nothing and goes.
  if (!/\S/.test(lines[mine]) || /^\s*<!--\s*\.element:\s*-->\s*$/.test(lines[mine])) {
    lines.splice(mine, 1);
  }
  return lines.join("\n");
}

export function place(text, n, at, turn) {
  var lines = String(text == null ? "" : text).split("\n");
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return null;
  var says = ' data-at="' + at + '"' + (turn ? ' data-turn="' + turn + '"' : "");

  var mine = markLine(block);
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

// --- One element, read and written ------------------------------------
// What the dialog needs of a block, and what it hands back. The editor
// never touches the text of a freestyle slide any other way: the text
// field is not on the form for that layout, because a field showing the
// whole slide is the one thing that made arranging it unreadable.

// The nth shown block -> { level, body }, or null where there is none.
//
// level is 1, 2 or 3 for a heading of that size, 0 for anything that is
// plain text, and null for a block the dialog has no size to offer for --
// a list, a code block, a picture. Those keep their text and lose
// nothing; only the size chooser stays out of the way.
export function read(text, n) {
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return null;
  var own = block.lines.filter(function (l) { return !ELEMENT.test(l); });
  var head = own.length === 1 && HEADING.exec(own[0]);
  if (head && head[1].length <= 3) {
    return { level: head[1].length, body: head[2].trim() };
  }
  return { level: sized(own.join("\n")) ? 0 : null, body: own.join("\n") };
}

// Is a size a thing this body HAS? A heading or a plain paragraph has one;
// a list, a code block, a quote and a picture have none -- "Überschrift 2"
// means nothing to a row of bullets, and write() below refuses to put a #
// in front of one anyway.
//
// Asked of a body rather than of the file, because the editor has to ask
// it twice: once of the element it opens (read, above) and again at every
// keystroke, since the body changes under the hands. A text element turned
// into a list by the button over the field is a list from that moment, and
// the row of sizes has to go the same moment -- otherwise it stands there
// offering four buttons that quietly do nothing, and a list made here ends
// up looking different from the same list opened again tomorrow
// (js/editor/index.js, elementChanged).
export function sized(body) {
  return String(body == null ? "" : body).split("\n")
    .filter(function (l) { return l.trim() !== ""; })
    .every(function (l) {
      return !HEADING.test(l) && !LIST.test(l) && !FENCE.test(l)
        && !IMAGE.test(l) && !/^[ \t]*>/.test(l);
    });
}

// The text of a block, put back. Its comment lines say the same thing
// afterwards as before -- where it stands, how it is aligned, whether it
// waits for a click -- because none of that is what the dialog was asked
// about. Where they STAND, though, is the one thing that cannot be left
// alone: a comment line directly under the last item of a list belongs to
// that item and not to the list (see LIST). So a block that has become a
// list has its lines pushed behind a blank one, and a block that has
// stopped being one has them pulled back up.
//
// Without that, the dialog's list button quietly unplaced the element:
// the comment it wrote back under the new last item went to the <li>,
// the <ul> was left standing in the flow, and the next drag -- finding no
// line of the list's own -- wrote a second one and left the first on the
// item.
//
// Blank lines inside the new text are closed up: a blank line is what
// separates one block from the next, and a dialog that silently turned
// one element into two would leave the second one unplaced and the
// numbers on both sides out of step.
export function write(text, n, level, body) {
  var lines = String(text == null ? "" : text).split("\n");
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return null;
  var said = String(body == null ? "" : body).replace(/\r\n/g, "\n")
    .split("\n")
    .map(function (l) { return l.replace(/\s+$/, ""); })
    .filter(function (l) { return l.trim() !== ""; })
    .join("\n");
  // A size is a thing a HEADING has. Where the dialog hands back a list,
  // the size the row still shows is the size of what the element used to
  // be, and obeying it would put a # in front of the first bullet, pull
  // the rest onto that line and throw the list away without a word. The
  // other half of this module already agrees: read() offers no size for a
  // list, so writing one could never be read back.
  var list = LIST.test(said.split("\n")[0] || "");
  if (level > 0 && !list) said = "#".repeat(level) + " " + said.replace(/\n/g, " ");
  // Every comment line of this block, wherever it was standing: inside it,
  // or apart from it behind a blank line. blocks() hangs both kinds on the
  // block, and both are this element's.
  var last = block.to;
  block.marks.forEach(function (i) { if (i > last) last = i; });
  var marks = [];
  for (var i = block.from; i <= last; i++) {
    if (ELEMENT.test(lines[i])) marks.push(lines[i]);
  }
  if (marks.length && list) marks.unshift("");
  lines.splice(block.from, last - block.from + 1, said, ...marks);
  return lines.join("\n");
}

// A new element, at the end of the text and in the middle of the slide.
// Its place is given here rather than left empty: an element nobody can
// see is an element nobody can pick up, and the first thing one does with
// a new one is move it anyway.
export function add(text, level, body, at) {
  var said = level > 0 ? "#".repeat(level) + " " + body : body;
  var before = String(text == null ? "" : text).replace(/\s+$/, "");
  var neu = said + "\n" + '<!-- .element: data-at="' + at + '" -->';
  return (before ? before + "\n\n" : "") + neu + "\n";
}

// And away again, with the comment lines that belonged to it. The ones
// standing apart from it are its own too -- blocks() hangs them on the
// block in front, which is this one.
export function remove(text, n) {
  var lines = String(text == null ? "" : text).split("\n");
  var all = blocks(text);
  var block = nth(all, n);
  if (!block) return null;
  var last = block.to;
  block.marks.forEach(function (i) { if (i > last) last = i; });
  lines.splice(block.from, last - block.from + 1);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --- What the list in the form shows about an element -------------------
// The rows over there say three things about a block before it is opened:
// what KIND of thing it is, what it SAYS, and -- from classes() above --
// what rides on its comment line. The first two are read here, because
// what counts as a heading and what counts as a picture is decided by the
// expressions at the top of this file and nowhere else.

// "h1" | "h2" | "h3" | "text" | "image" | "list" | "code" | "quote".
// The same question read() asks for its `level`, answered in full: read()
// has no size to offer for a list or a picture and says null, which is the
// right answer for a row of size buttons and no answer at all for an icon.
export function kind(text, n) {
  var block = nth(blocks(text), n);
  if (!block) return "text";
  var own = block.lines.filter(function (l) { return !ELEMENT.test(l); });
  var first = own[0] || "";
  if (own.length === 1 && IMAGE.test(first)) return "image";
  if (FENCE.test(first)) return "code";
  if (LIST.test(first)) return "list";
  if (/^[ \t]*>/.test(first)) return "quote";
  var head = own.length === 1 && HEADING.exec(first);
  if (head && head[1].length <= 3) return "h" + head[1].length;
  return "text";
}

// A body that is nothing but a picture, taken apart: what it says and the
// file it points at, or null for anything else -- a picture with a word
// beside it is text and is written as text.
//
// The editor shows such an element as the PICTURE (js/editor/index.js):
// the line that describes it is the one piece of Markdown in this editor
// nobody needs to read, because it names a file one can simply look at,
// and offering it as text invites the one edit that cannot be seen going
// wrong -- a letter lost from the file name leaves an element that is
// there, is placed, and shows nothing.
export function image(body) {
  var m = IMAGE_PARTS.exec(String(body == null ? "" : body));
  return m ? { alt: m[1], src: m[2] } : null;
}

// And back, which is the only place this line is written. The alt text is
// carried through untouched: the editor does not ask for it, and what a
// file says is not the editor's to drop.
export function imageLine(picture) {
  return "![" + (picture.alt || "") + "](" + (picture.src || "") + ")";
}

// The one line the row carries: the block's words, with the Markdown that
// shapes them taken off. Not the body as read() hands it over -- a row is
// read at a glance and "## Was wir vorhaben" reads worse than what it
// means. A picture answers with its file name: its alt text is usually
// empty, and the file is what one recognises it by.
export function summary(text, n) {
  var block = nth(blocks(text), n);
  if (!block) return "";
  var own = block.lines.filter(function (l) { return !ELEMENT.test(l); }).join(" ");
  var picture = /!\[([^\]]*)\]\(([^)]*)\)/.exec(own);
  if (picture) {
    return picture[1].trim() || String(picture[2]).replace(/^.*\//, "").trim();
  }
  return own
    .replace(/^[ \t]*#{1,6}\s*/, "")
    .replace(/^[ \t]*>\s*/, "")
    .replace(/^[ \t]*([-*+]|\d+[.)])\s+/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- A second one of the same -------------------------------------------
// The copy is the block AND the line that belongs to it: everything the
// element is -- its words, its size, where it is aligned, whether it waits
// for a click -- travels with it. Only its place is moved, by a step down
// and to the right, so that the copy lands BESIDE the original instead of
// exactly on top of it, where nobody could tell there were two.
//
// It goes to the end of the text, which is where add() puts a new one and
// which makes it the last element on the slide: last in the order the
// fragments appear in, and topmost where two of them overlap.
function shifted(at) {
  var parts = String(at).split(",").map(Number);
  if (parts.length < 3 || parts.some(function (v) { return !isFinite(v); })) return null;
  return [Math.min(parts[0] + 4, 95), Math.min(parts[1] + 6, 95), parts[2]].join(",");
}

// One element, a place further up or down the list -- which is a question
// about the PICTURE as much as about the text. The blocks are drawn in the
// order they are written and each one lies over the one before it, so the
// last block of a freestyle slide is the topmost thing on it: moving a row
// down the list is what puts its element in front of its neighbour.
//
// `dir` is -1 for a step up and +1 for a step down. The answer is the
// whole text with the two swapped, or null where there is no neighbour to
// swap with -- the first row cannot go up and the last cannot go down.
//
// Each block travels with its own comment line, wherever that line stands:
// inside the block or behind a blank one (see blocks). What lies BETWEEN
// the two stays where it is -- it is the blank line that separates them,
// and it separates them just as well the other way round.
export function move(text, n, dir) {
  var lines = String(text == null ? "" : text).split("\n");
  var all = blocks(text);
  var shown = all.filter(function (b) { return !onlyMarks(b); });
  var here = shown.indexOf(nth(all, n));
  var there = here + (dir < 0 ? -1 : 1);
  if (here < 0 || there < 0 || there >= shown.length) return null;
  var ends = function (b) {
    var last = b.to;
    b.marks.forEach(function (i) { if (i > last) last = i; });
    return last;
  };
  var first = shown[Math.min(here, there)];
  var second = shown[Math.max(here, there)];
  return lines.slice(0, first.from)
    .concat(lines.slice(second.from, ends(second) + 1))
    .concat(lines.slice(ends(first) + 1, second.from))
    .concat(lines.slice(first.from, ends(first) + 1))
    .concat(lines.slice(ends(second) + 1))
    .join("\n");
}

export function duplicate(text, n, fallback) {
  var lines = String(text == null ? "" : text).split("\n");
  var block = nth(blocks(text), n);
  if (!block) return null;
  var last = block.to;
  block.marks.forEach(function (i) { if (i > last) last = i; });
  var copy = lines.slice(block.from, last + 1);
  // Where the original stands, one step on -- or, for an element nobody
  // has placed yet, wherever the caller would have put a new one.
  var here = /\bdata-at="([^"]*)"/.exec(copy.join("\n"));
  var at = (here && shifted(here[1])) || fallback;
  var written = false;
  copy = copy.map(function (line) {
    if (!ELEMENT.test(line) || written) return line;
    written = true;
    var bare = line.replace(AT, "");
    return at ? bare.replace(/\s*-->\s*$/, ' data-at="' + at + '" -->') : bare;
  });
  // A block that never had a line of its own gets one, so that the copy
  // has somewhere of its own to stand.
  if (!written && at) copy.push('<!-- .element: data-at="' + at + '" -->');
  var before = lines.join("\n").replace(/\s+$/, "");
  return (before ? before + "\n\n" : "") + copy.join("\n").replace(/^\n+|\n+$/g, "") + "\n";
}
