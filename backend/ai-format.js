// The storage format, written out as a document for a model to read.
//
// This is the half of the AI feature that must never be written by hand.
// Every value a trivialSlides file may carry is already a list in this
// project -- the layouts and the fields each one reads (layouts.js), the
// two strips (bands.js), the effects, the gradients, the themes and the
// transitions (deck.js), and above all the table of every attribute the
// reader understands at all (check.js, ATTRIBUTES). Said a second time in
// prose, this document would be wrong the first time a layout gains a
// field -- and nothing would say so. The model would go on writing an
// attribute that is quietly dropped, and the deck would come back missing
// something nobody can point at.
//
// So the document below is GENERATED. What is written by hand here is the
// prose between the lists -- what a piece is for, and which mistakes cost
// a line -- and not one permitted value.
//
// Two things it deliberately does NOT hold:
//
//   Taste. When a section slide is right, how many points belong on one
//   slide, that a wall of text makes slide-fit step the type down until it
//   is unreadable. That is the other prompt (ai-prompt.md), it is the one
//   a human has to write, and it is the one that decides whether the decks
//   are any good.
//
//   The pictures of any one deck. Those are handed in, because they are
//   not a property of the format but of the folder being worked in.
//
// It is in English, like the code: a model reads it, not the user. The
// words for the layouts are taken from the English table (i18n/en.json),
// where they already stand for the editor -- so a layout renamed there is
// renamed here.
const layouts = require("./layouts");
const bands = require("./bands");
const effects = require("./effects");
const deck = require("./deck");
const check = require("./check");
const qr = require("./qr");
const gradients = require("./gradients");
const i18n = require("./i18n");

// The document's own language. Not the user's: what the user writes is the
// deck's language, and that is decided by their prompt, not by this file.
const LANG = "en";

function word(key) {
  return i18n.translate(LANG, key);
}

// `a`, `b`, `c` -- a list of literal values, in prose.
function values(list) {
  return list.map((v) => "`" + v + "`").join(", ");
}

// Which attribute carries which field of the model, and which values it
// allows. Taken from the check's table, which is the only list that has
// every one of them (check.js).
const BY_FIELD = new Map(check.ATTRIBUTES.map((a) => [a.field, a]));

// What a field takes where it is not a list of names: a file, an address,
// a colour. Prose, because there is nothing to enumerate -- and the shape
// itself is enforced elsewhere (video.js, qr.js, deck.js), so a wrong one
// is caught rather than believed.
//
// A field missing here falls back to its attribute name alone, which is
// terser but not wrong. That is the honest degradation: a new field shows
// up in the document the day it exists, and only its sentence is missing.
const SHAPES = {
  image: "the file name of a picture in this deck's folder, nothing else -- no path, no address",
  video: "a YouTube address or the bare 11-character video id; only the id is kept",
  url: "an `http://` or `https://` address",
  source: "one line naming who said it",
  qrColor: "a colour as `#rrggbb`",
  qrBackground: "a colour as `#rrggbb`, or `transparent`",
  qrTextColor: "a colour as `#rrggbb`",
};

// The value a field has before anybody chooses, per layout -- because for
// three of them the default belongs to the LAYOUT and not to the list: an
// image layout has always split the slide down the middle, a video slide
// has always had its text above the player (layouts.js). Written into the
// file, a default is removed again on the next save, so naming them here
// keeps the model from writing lines that do not survive.
function fallback(field, layout) {
  if (field === "textSide") return layouts.defaultSide(layout);
  if (field === "textWidth") return layouts.defaultWidth(layout);
  if (field === "textPlace") return layouts.PLACE_DEFAULT;
  if (field === "qrColor") return qr.COLOR_DEFAULT;
  if (field === "qrBackground") return qr.BACKGROUND_DEFAULT;
  return "";
}

// A field that is a yes or a no reads differently from one that is a
// choice: "one of `1`" is a list of one, which is true and says nothing.
// Which ones those are comes from the check, not from a second list here.
function isFlag(field) {
  return check.FLAGS.includes(field);
}

// One field of one layout, as a line of the document.
function fieldLine(field, layout) {
  const attr = BY_FIELD.get(field);
  if (!attr) return null;
  const parts = [];
  if (isFlag(field)) parts.push("the flag `" + bands.ON + "`, or left out");
  else if (attr.allowed) parts.push("one of " + values(attr.allowed()));
  else if (SHAPES[field]) parts.push(SHAPES[field]);
  const standard = fallback(field, layout);
  if (standard) parts.push("default `" + standard + "`");
  return "- `" + attr.name + "`" + (parts.length ? " -- " + parts.join(", ") : "");
}

// --- The pieces of the document ----------------------------------------

function intro() {
  return [
    "# The trivialSlides file format",
    "",
    "A deck is ONE Markdown file, `deck.md`. Its pictures lie beside it in an",
    "`assets/` folder and are named by file name only.",
    "",
    "What follows is the complete format. The reader is deliberately forgiving:",
    "anything it does not understand is dropped quietly, without an error. So a",
    "line that is not described below is a line that will disappear -- which is",
    "why this document, and not a guess, is what to write against.",
  ];
}

function shape() {
  return [
    "## The file as a whole",
    "",
    "```",
    "---                  <- the head, and only at the very start of the file",
    "titel: My talk",
    "theme: white",
    "transition: slide",
    "---",
    "",
    '<!-- .slide: data-layout="title" -->',
    "# My talk",
    "",
    "A subtitle",
    "",
    "---                  <- the next slide",
    "",
    "## Second slide",
    "",
    "- A point",
    "",
    "----                 <- a slide hanging BELOW the previous one",
    "",
    "## An aside",
    "```",
    "",
    "`---` on a line of its own separates two slides, `----` hangs the next one",
    "below the one before it (reveal.js' vertical stack). A block with nothing",
    "in it is not a slide and is thrown away.",
  ];
}

function head() {
  const out = [
    "## The head",
    "",
    "Three keys, and all three are always written. One flat `key: value` per",
    "line -- this is not YAML: no nesting, no lists, no quotes.",
    "",
    "- `titel` -- the deck's title. German key, deliberately, because it is the",
    "  key in the FILE. `title:` is not read.",
    "- `theme` -- one of " + values(deck.THEMES),
    "- `transition` -- one of " + values(deck.TRANSITIONS),
    "",
    "Then, optional, the two strips that stand on EVERY slide -- a header along",
    "the top edge, a footer along the bottom. A strip with neither text nor logo",
    "does not exist: write nothing about it at all.",
    "",
  ];
  bands.BANDS.forEach((name) => {
    const k = bands.keys(name);
    out.push("- `" + k.text + "` -- one line, at most " + bands.TEXT_MAX + " characters");
    out.push("- `" + k.logo + "` -- a picture from this deck's folder");
    out.push("- `" + k.textPlace + "` -- one of " + values(bands.PLACES)
      + ", default `" + bands.TEXT_PLACE_DEFAULT + "`");
    out.push("- `" + k.logoPlace + "` -- one of " + values(bands.PLACES)
      + ", default `" + bands.LOGO_PLACE_DEFAULT + "`");
    out.push("- `" + k.noRule + "` -- `" + bands.ON + "` draws no hairline between strip and slide");
    out.push("- `" + k.center + "` -- `" + bands.ON + "` gathers text and logo in the middle"
      + " instead of spreading them");
  });
  out.push("");
  out.push("Every flag in this format is written `" + bands.ON + "` or left out entirely."
    + " There is no `0`.");
  return out;
}

function slide() {
  return [
    "## A slide",
    "",
    "Three parts, in this order, and all three optional except that a slide must",
    "hold something:",
    "",
    "1. **The attribute line.** reveal.js' own syntax, an HTML comment, and it",
    "   must be the slide's first non-empty line:",
    "",
    '   `<!-- .slide: data-layout="text" data-background-color="#112233" -->`',
    "",
    "   Double quotes, always. A slide with nothing special about it has no such",
    "   line at all.",
    "",
    "2. **The heading.** The FIRST heading line in the block is the slide's",
    "   title, wherever it stands; everything else is body. `#` for the `title`",
    "   and `section` layouts, `##` for all the others -- convention, so the file",
    "   still reads sensibly without this project's CSS. A bare `##` on its own",
    "   is a heading that is present but empty, which holds the space a heading",
    "   takes; leaving the line out altogether is a slide with no heading.",
    "",
    "3. **The body.** Markdown, see below.",
  ];
}

function layoutList() {
  const out = [
    "## The layouts",
    "",
    "`data-layout` picks one. Left out, the slide is `" + layouts.DEFAULT_LAYOUT + "`.",
    "An unknown name becomes `" + layouts.DEFAULT_LAYOUT + "` as well.",
    "",
    "A layout only reads the attributes listed under it. The same attribute on a",
    "layout that has no field for it is dropped -- `data-image` on a `quote`",
    "slide is a picture nobody will ever see.",
    "",
  ];
  layouts.LAYOUTS.forEach((l) => {
    out.push("### `" + l.id + "` -- " + word("layout." + l.id + ".label"));
    out.push("");
    out.push(word("layout." + l.id + ".hint"));
    out.push("");
    const columns = layouts.columnCount(l.id);
    if (columns) {
      out.push("The body runs through " + columns + " columns by itself. With"
        + " `data-columns=\"" + layouts.COLUMN_SPLIT + "\"` each column gets a text of"
        + " its own instead, separated in the body by a line holding nothing but"
        + " `" + layouts.COLUMN_BREAK + "`.");
      out.push("");
    }
    const lines = l.fields.map((f) => fieldLine(f, l.id)).filter(Boolean);
    if (lines.length) {
      out.push("Reads:");
      out.push(...lines);
    } else {
      out.push("Reads no attributes of its own.");
    }
    out.push("");
    out.push("Its heading stands `" + layouts.defaultTitleAlign(l.id)
      + "` unless `data-title-align` says otherwise.");
    out.push("");
  });
  // The blank line the last layout left behind. The sections are joined
  // with one of their own, and two would start a paragraph nobody wrote.
  out.pop();
  return out;
}

function everySlide() {
  const out = [
    "## Attributes any slide may carry",
    "",
    "These hang on the slide rather than on its layout, so they work on all of",
    "them:",
    "",
  ];
  check.ATTRIBUTES.filter((a) => !a.layout && a.field !== "layout").forEach((a) => {
    const parts = [];
    if (isFlag(a.field)) parts.push("the flag `" + bands.ON + "`, or left out");
    else if (a.allowed) parts.push("one of " + values(a.allowed()));
    else if (a.field === "background" || a.field === "textColor") parts.push("a colour as `#rrggbb`");
    else if (a.field === "gradient") parts.push("one CSS gradient function and nothing else");
    out.push("- `" + a.name + "`" + (parts.length ? " -- " + parts.join(", ") : ""));
  });
  out.push("");
  out.push("The three flags, because their names do not say it: `data-text-fragment`"
    + " makes the slide's whole body wait for a click, and `data-no-header` /"
    + " `data-no-footer` are how a single slide stands without the deck's"
    + " strips -- a title slide usually wants neither.");
  out.push("");
  out.push("The gradients the editor offers, usable as a value for"
    + " `data-background-gradient`:");
  out.push("");
  gradients.list().forEach((g) => {
    out.push("- " + (g.name || word("gradient." + g.id)) + ": `" + g.css + "`");
  });
  out.push("");
  out.push("The animated backgrounds for `data-background-effect`: "
    + values(effects.EFFECTS.map((e) => e.id))
    + " (" + effects.EFFECTS.map((e) => word("effect." + e.id)).join(", ") + ").");
  return out;
}

function body() {
  return [
    "## In the body",
    "",
    "Ordinary Markdown: paragraphs, `-` and `1.` lists, `**bold**`, `*italic*`,",
    "`` `code` ``, fenced code blocks, links, tables, block quotes.",
    "",
    "Raw HTML is dropped -- with exactly one exception, a run of text in a colour",
    "of its own, which has no Markdown of its own:",
    "",
    '`<span style="color: #e100ff">like this</span>`',
    "",
    "A picture in the body is written `![alt](name.png)`, with the bare file name",
    "of a picture in this deck's folder.",
    "",
    "Four comment lines carry what Markdown cannot say. Each must stand on a line",
    "of its own, and each is invisible to any other reveal.js -- which then shows",
    "the slide without the finer point, never broken:",
    "",
    '- `<!-- .element: class="fragment" -->` directly AFTER a block makes that',
    "  block wait for a click. `class=\"fragment\" data-fragment-index=\"2\"` sets the",
    "  order; number every fragment of a slide or none of them.",
    '- `<!-- .element: class="align-center" -->` aligns the block; `align-left`,',
    "  `align-center`, `align-right` and `align-fill` exist. The classes combine:",
    '  `class="fragment align-center"`.',
    "- `" + layouts.COLUMN_BREAK + "` separates the texts of a split column layout.",
    '- `<!-- .group: class="fragment" -->` ... `<!-- /.group -->` wraps several',
    "  blocks so they appear together on one click -- a heading and the code block",
    "  under it, for instance.",
  ];
}

function limits() {
  return [
    "## Limits",
    "",
    "Cut silently when the file is read, so stay under them:",
    "",
    "- the deck's title: 120 characters",
    "- a slide's heading: 200 characters",
    "- a strip's text: " + bands.TEXT_MAX + " characters",
    "- a one-line attribute value (`data-image`, `data-quelle`): 200 characters",
    "- a slide's body: 20000 characters",
  ];
}

// The pictures of the deck being worked in. Named rather than described,
// because a name that is not in the folder is not a picture: the check
// reads this same list and reports an invented one (check.js), so guessing
// one costs a round rather than a slide.
function pictures(images) {
  const list = (images || []).filter(Boolean);
  if (!list.length) {
    return [
      "## Pictures",
      "",
      "This deck's folder is empty. Do not name a picture anywhere -- not in",
      "`data-image`, not in a strip's logo, not in the body. A name that is not in",
      "the folder is dropped and reported as a fault.",
    ];
  }
  return [
    "## Pictures",
    "",
    "These, and only these, lie in this deck's folder. Use the name exactly as",
    "it stands; anything else is dropped and reported as a fault:",
    "",
  ].concat(list.map((name) => "- `" + name + "`"));
}

// The faults that cost a line WITHOUT anything looking wrong. Every one of
// them has been a real mistake in this project's own history, which is why
// they are worth a section of their own rather than a sentence somewhere
// above: a model reading the lists correctly can still write a file that
// loses half of what it says.
function traps() {
  return [
    "## Mistakes that cost a line",
    "",
    "- `titel:`, not `title:`. Three attributes are German too, for the same",
    "  reason -- they are the keys in the file: `data-quelle`, `data-textseite`,",
    "  `data-textbreite`. Everything else is English.",
    "- An attribute on a layout that has no field for it is dropped. Check the",
    "  layout's list before writing one.",
    "- A value outside its list does not fail -- it is replaced by the default,",
    "  silently. A misspelled `theme` gives a deck in `white`.",
    "- The attribute line must be the slide's first non-empty line. Below the",
    "  heading it is a comment and nothing more.",
    "- Single quotes in an attribute do not count. Double quotes only.",
    "- Writing a default out is pointless: it is removed again on the next save.",
    "- `----` instead of `---` hangs the slide below the previous one. That is",
    "  for an aside one may skip, not for the next point.",
  ];
}

// The whole document. images: the names in the deck's folder (storage.js,
// images) -- the one thing here that is not a property of the format.
function document(options) {
  const parts = [
    intro(), shape(), head(), slide(), layoutList(), everySlide(),
    body(), limits(), pictures(options && options.images), traps(),
  ];
  return parts.map((lines) => lines.join("\n")).join("\n\n") + "\n";
}

module.exports = { document };
