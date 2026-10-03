// Slide layouts. One definition, two consumers: the editor builds its
// layout tiles from it (handed into the page as JSON), the renderer picks
// the CSS class with it and decides whether an image element is needed.
//
// Important for the storage format: a layout NEVER changes a slide's
// Markdown text, only its attributes. That keeps the body plain Markdown,
// which a stock reveal.js (or a text editor) quiet renders sensibly --
// just without the finer points of the arrangement.
//
// The words belong to i18n.js, keyed by id -- layout.<id>.label and
// layout.<id>.hint. What stays here is the structure.
//
// fields: which input fields the editor shows for this layout.
//   image   - image picker (data-image)
//   source - attribution below the quote (data-quelle)
//   video  - a YouTube link (data-video, see video.js)
//   textSide - where the text goes in relation to the player
//            (data-textseite, see video.js)
//   textWidth - how wide the text may get beside the picture or the
//            player (data-textbreite, see WIDTHS below)
//   columnMode - whether the columns are filled one by one or the text
//            flows through them (data-columns, see COLUMNS below)
// Every layout has a title and a body, so those are not in the list.
const LAYOUTS = [
  {
    id: "title",
    fields: [],
    // Centred by design, and so is its heading -- see TITLE_ALIGNS below.
    titleAlign: "center",
  },
  {
    id: "section",
    fields: [],
    titleAlign: "center",
  },
  {
    id: "text",
    fields: [],
  },
  {
    id: "columns",
    fields: ["columnMode"],
    columns: 2,
  },
  {
    id: "columns-three",
    fields: ["columnMode"],
    columns: 3,
  },
  {
    id: "image-right",
    fields: ["image", "textWidth"],
    // Half and half, which is what this layout has always looked like.
    width: "50",
  },
  {
    id: "image-left",
    fields: ["image", "textWidth"],
    // Half and half, which is what this layout has always looked like.
    width: "50",
  },
  {
    id: "image-full",
    fields: ["image", "textPlace"],
  },
  {
    id: "video",
    fields: ["video", "textSide", "textWidth"],
    width: "33",
  },
  {
    // A code somebody in the room can point a phone at -- the address to
    // the talk, the repository, the author. Built like the video layout,
    // only with a picture the server draws instead of a player it embeds
    // (qr.js).
    id: "qr",
    fields: ["url", "textSide", "textWidth", "qrColor", "qrBackground", "qrTextColor"],
    // Beside the text, not under it: a code is something to scan while the
    // slide is being talked about, and it is square -- across the full
    // width it would take half the slide and say nothing more.
    side: "rechts",
    width: "50",
  },
  {
    id: "quote",
    fields: ["source"],
  },
];

// How much of the slide the text may take where it stands BESIDE something
// -- a picture or a player. A cap and not a width: a couple of lines do not
// have to fill their share, and what the cap leaves over goes to the other
// side.
//
// A short list and not a free number: what is on offer has to look right
// next to a picture, and a field taking any percentage would mostly offer
// ways to make the slide worse. Five of them, because the question is
// asked from both ends -- a picture that is the point of the slide wants a
// quarter of text beside it, and a picture that merely illustrates one
// wants three quarters.
//
// Here rather than with the video (video.js), because by now three layouts
// share it and none of them owns it.
//
// The default belongs to the LAYOUT, not to the list: an image layout has
// always split the slide down the middle and a video slide has always given
// the player two thirds. Those are what they look like before anybody
// chooses, so those are their defaults -- a deck written before this
// existed reads exactly as it did. `width` on a layout below says so; a
// layout that names none falls back to the middle value.
// Where the text sits in relation to what the slide is built around -- a
// player, a code. The arrangement itself is in slides.css; what is decided
// here is which names a file may carry.
//
// Like the width below, the default belongs to the LAYOUT: a video slide
// has always had its text above the player, and a QR code is meant to
// stand beside the text rather than under it. `side` on a layout says so;
// a layout that names none gets the first value.
const SIDES = ["oben", "unten", "links", "rechts"];
const SIDE_DEFAULT = "oben";

function defaultSide(id) {
  return get(id).side || SIDE_DEFAULT;
}

function onlySide(value, layoutId) {
  const s = String(value == null ? "" : value).trim();
  return SIDES.includes(s) ? s : defaultSide(layoutId);
}

// Where the text box stands ON a full-bleed picture. Nine places, because
// a picture is a rectangle and the free corner of it is wherever the motif
// is not -- four sides would leave out exactly the corners one reaches for
// most. The arrangement itself is in slides.css; what is settled here is
// which names a file may carry.
//
// The middle is the default and not a corner: a box in the middle is
// readable on every picture, and a picture whose middle is busy is the
// case one then goes and moves it for.
const PLACES = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];
const PLACE_DEFAULT = "center";

function onlyPlace(value) {
  const s = String(value == null ? "" : value).trim();
  return PLACES.includes(s) ? s : PLACE_DEFAULT;
}

const WIDTHS = ["25", "33", "50", "66", "75"];
const WIDTH_DEFAULT = "33";

function defaultWidth(id) {
  return get(id).width || WIDTH_DEFAULT;
}

function onlyWidth(value, layoutId) {
  const s = String(value == null ? "" : value).trim();
  return WIDTHS.includes(s) ? s : defaultWidth(layoutId);
}

// --- The heading's place -----------------------------------------------
// Where the heading stands on the slide. Every layout has a heading, so
// this is not in any layout's `fields` -- it belongs to the slide the way
// its colours do.
//
// The default is the LAYOUT's own: a title slide and a section divider
// centre everything they carry, everything else reads from the left. A
// slide that has never been asked therefore looks exactly as it always
// did, and nothing is written into the file for it. `titleAlign` on a
// layout above says so; a layout that names none reads from the left.
//
// The arrangement itself is in slides.css. What is decided here is which
// names a file may carry -- and what the editor's button shows while the
// slide has made no choice of its own.
const TITLE_ALIGNS = ["left", "center", "right"];
const TITLE_ALIGN_DEFAULT = "left";

function defaultTitleAlign(id) {
  return get(id).titleAlign || TITLE_ALIGN_DEFAULT;
}

// "" means "no choice of its own" -- which is a value in its own right
// here, not a missing one: it is what leaves the layout in charge.
function onlyTitleAlign(value) {
  const s = String(value == null ? "" : value).trim();
  return TITLE_ALIGNS.includes(s) ? s : "";
}

// --- Columns -----------------------------------------------------------
// A column layout fills its columns in one of two ways.
//
//   flowing (the default, and what these layouts have always done): the
//     slide has ONE body and the browser distributes it over the columns.
//     Nothing in the text says where a column ends -- the same words can be
//     read in two columns or three by changing the layout alone.
//
//   split (data-columns="split"): each column has a text of its own. That
//     cannot be expressed by an attribute alone -- the body has to say
//     where one column ends and the next begins, which is what COLUMN_BREAK
//     does. It is a comment in reveal.js' own family (<!-- .slide: -->,
//     <!-- .element: -->), so any other renderer leaves it out and shows
//     the slide as one running text: exactly the flowing arrangement, which
//     is the honest fallback for a file read elsewhere.
//
// The switch lives in an attribute and the breaks live in the text, so a
// slide keeps its columns' texts when it is switched back and forth -- the
// breaks simply stop being read.
const COLUMN_SPLIT = "split";
const COLUMN_BREAK = "<!-- .column -->";

// Tolerant of spacing the way the other two comment lines are (deck.js'
// ATTR_LINE, render.js' FRAGMENT_RE): a break is a line that holds nothing
// but the comment.
const COLUMN_BREAK_LINE = /^[ \t]*<!--[ \t]*\.column[ \t]*-->[ \t]*$/m;

// How many columns a layout has; 0 for every layout that has none.
function columnCount(id) {
  return get(id).columns || 0;
}

function onlyColumnMode(value) {
  return String(value == null ? "" : value).trim() === COLUMN_SPLIT ? COLUMN_SPLIT : "";
}

// The body -> one text per column, always exactly `count` of them.
//
// More breaks than the layout has columns (a three-column slide turned into
// a two-column one) put the surplus into the LAST column rather than
// dropping it: fewer columns must not cost the user a paragraph. Fewer
// breaks than columns leave the columns at the end empty.
//
// The editor does the same walk on its side (js/editor/index.js) -- it has
// to, it is a browser and this is a module on the server. Both halves are
// named after each other so the pair stays findable.
function splitColumns(text, count) {
  const parts = String(text == null ? "" : text)
    .split(new RegExp(COLUMN_BREAK_LINE.source, "m"))
    .map((t) => t.trim());
  const out = parts.slice(0, Math.max(count, 1) - 1);
  out.push(parts.slice(Math.max(count, 1) - 1).filter(Boolean).join("\n\n"));
  while (out.length < count) out.push("");
  return out;
}

// The columns' texts -> one body. All empty means an empty body: a slide
// nobody has written anything on should not carry breaks in the file.
function joinColumns(parts) {
  const texts = (parts || []).map((t) => String(t == null ? "" : t).trim());
  if (!texts.some(Boolean)) return "";
  return texts.join(`\n\n${COLUMN_BREAK}\n\n`);
}

const DEFAULT_LAYOUT = "text";

const byId = new Map(LAYOUTS.map((l) => [l.id, l]));

// --- The names these layouts used to have -------------------------------
// This project wrote its layout ids in German until they were renamed with
// everything else that is code. A deck written before that says
// data-layout="bild-voll", and without this it would be an unknown name --
// which falls back to "text", and a text slide has no field for an image.
// The slide would not merely lose its arrangement, it would lose its
// PICTURE, and the next save would make that permanent.
//
// So the old names are still read. Nothing writes them: serialize puts the
// current id down, so a deck repairs itself the first time it is saved,
// and this table only ever has to grow if something is renamed again.
//
// The three attributes that are still German are a different matter and
// stay as they are -- data-quelle, data-textseite, data-textbreite are the
// keys in the FILE, and the file format does not change because the code
// around it is in English.
const RENAMED = {
  titel: "title",
  abschnitt: "section",
  spalten: "columns",
  "spalten-drei": "columns-three",
  "bild-rechts": "image-right",
  "bild-links": "image-left",
  "bild-voll": "image-full",
  zitat: "quote",
};

// What a name used to belong to, or "" -- for the check, which has to tell
// a name that is merely OLD from one that is wrong: the first is rewritten
// on saving and costs nothing, the second costs the slide its arrangement
// (check.js).
function renamedTo(id) {
  const old = String(id || "");
  return Object.prototype.hasOwnProperty.call(RENAMED, old) ? RENAMED[old] : "";
}

// Unknown layout names (hand-written Markdown, an older deck) fall back to
// "text" instead of swallowing the slide.
function get(id) {
  const name = String(id || "");
  return byId.get(name) || byId.get(renamedTo(name)) || byId.get(DEFAULT_LAYOUT);
}

function hasField(id, field) {
  return get(id).fields.includes(field);
}

module.exports = { LAYOUTS, DEFAULT_LAYOUT, RENAMED, renamedTo, get, hasField,
  SIDES, SIDE_DEFAULT, defaultSide, onlySide,
  WIDTHS, WIDTH_DEFAULT, defaultWidth, onlyWidth,
  COLUMN_SPLIT, COLUMN_BREAK, columnCount, onlyColumnMode, splitColumns, joinColumns,
  TITLE_ALIGNS, TITLE_ALIGN_DEFAULT, defaultTitleAlign, onlyTitleAlign,
  PLACES, PLACE_DEFAULT, onlyPlace };
