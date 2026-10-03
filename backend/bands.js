// The two strips that are the same on every slide: a header along the top
// and a footer along the bottom. One definition, four consumers -- the
// reader and the writer of the file (deck.js), the renderer (render.js),
// the check behind the source dialog (check.js) and the editor's dialog,
// which is built from the lists below.
//
// What a band holds is deliberately short: a line of text, a picture out
// of the deck's own folder, where each of the two stands, and two things
// about the strip as a whole -- whether it is parted from the slide by a
// line, and whether its pieces spread across the slide or stand together
// in the middle of it. Anything more and it would be a slide of its own --
// which this project already has, and which is where a sentence that needs
// formatting belongs.
//
// In the file the band lives in the front matter, because it belongs to
// the DECK and not to any one slide:
//
//   ---
//   titel: Quarterly report
//   theme: white
//   transition: slide
//   header-text: ACME Corp
//   header-logo: logo.svg
//   footer-text: Confidential
//   ---
//
// Flat keys and no nesting, for the same reason deck.js parses the head by
// hand rather than with YAML: the head has a handful of fields and every
// one of them is one line. A reveal.js that has never heard of these keys
// reads past them and shows the deck without its bands -- the same honest
// fallback a full-bleed picture or a column break has.
const PLACES = ["left", "center", "right"];

// Where each of the two stands when nobody has said. A logo goes to the
// outer corner and the words to the reading edge -- which is what every
// letterhead does, and what makes the pair readable as one line.
const TEXT_PLACE_DEFAULT = "left";
const LOGO_PLACE_DEFAULT = "right";

// The two things said about the strip as a whole. Both are flags, and both
// are written the way round that leaves a band nobody has asked looking
// exactly as bands have always looked: the line is drawn unless the file
// says otherwise, and the pieces spread unless it says otherwise.
//
//   noRule  no hairline between the strip and the slide
//   center  logo and text stand TOGETHER in the middle of the slide
//           instead of each in its own third of it. Their places are then
//           not places any more but an order: what stands left of what
//           (slides.css keeps the three cells and merely pulls them
//           together, so nothing in the markup changes).
//   still   the strip does not travel with the slide through its
//           transition. It cannot stand still where it is -- it sits in
//           the box reveal.js moves -- so it is taken out of sight for as
//           long as the movement lasts and brought back once the slide has
//           arrived (js/slide-bands.js).
//
// The one value a flag takes in this file, as everywhere else in this
// project: it is there or it is not (deck.js, ON).
const FLAGS = ["noRule", "center", "still"];
const ON = "1";

// Which bands there are, in the order they appear on the slide. The dialog
// in the editor builds one box per entry and the renderer walks this list,
// so most of a third band would be the line below plus one in HIDDEN. The
// two places that would still have to be told by hand are the ones that
// name every field one by one on purpose: the reader and the writer of the
// file (deck.js) and the per-slide switches in the form.
const BANDS = ["header", "footer"];

// What a SLIDE says about a band: that it does not want it. The field in
// the model and the attribute in the file, named per band so the renderer
// does not have to ask which of the two it is holding. Written the
// negative way round because that is what the slide decides -- the deck
// says what the band IS, a slide says only that it stands without it
// (deck.js writes and reads these two attributes).
const HIDDEN = {
  header: { field: "noHeader", attribute: "data-no-header" },
  footer: { field: "noFooter", attribute: "data-no-footer" },
};

// One line, like the deck's title -- and shorter than it: what does not
// fit on a strip the height of a line is not a band's business.
const TEXT_MAX = 120;
const LOGO_MAX = 200;

function oneLine(s) {
  return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();
}

function onlyPlace(value, fallback) {
  const s = oneLine(value);
  return PLACES.includes(s) ? s : fallback;
}

// The keys a band takes in the front matter. Built from the band's name so
// that the name is said once: "header" and "footer" are the only words
// this module and the file have in common.
function keys(name) {
  return {
    text: `${name}-text`,
    logo: `${name}-logo`,
    textPlace: `${name}-text-place`,
    logoPlace: `${name}-logo-place`,
    // Named for what it takes AWAY, the way a slide's data-no-header is:
    // an absent key has to mean the line is drawn, or every deck written
    // before this existed would lose it.
    noRule: `${name}-no-rule`,
    center: `${name}-center`,
    still: `${name}-still`,
  };
}

// Every head key the two bands may bring, for the check -- which has to
// tell a key it merely does not know from one it knows and would drop.
function headKeys() {
  return BANDS.reduce((out, name) => out.concat(Object.values(keys(name))), []);
}

// Whatever arrives -- from a file, from the browser -- as a band holding
// permitted values only. The places come back filled even on an empty
// band: the editor's menus have to show something, and an empty band is
// not written to the file at all (see serialize below), so a default that
// nobody chose costs the file nothing.
function normalize(raw) {
  const band = raw && typeof raw === "object" ? raw : {};
  return {
    text: oneLine(band.text).slice(0, TEXT_MAX),
    // A name, never a path or an address: the picture comes out of the
    // deck's own folder, the same as a slide's (deck.js, imageName).
    logo: oneLine(band.logo).replace(/^.*\//, "").slice(0, LOGO_MAX),
    textPlace: onlyPlace(band.textPlace, TEXT_PLACE_DEFAULT),
    logoPlace: onlyPlace(band.logoPlace, LOGO_PLACE_DEFAULT),
    noRule: !!band.noRule,
    center: !!band.center,
    still: !!band.still,
  };
}

// A band with neither words nor a picture is no band: nothing is drawn for
// it and nothing is written about it. That is what lets a deck that has
// never been asked keep the three-line head it has always had.
function isEmpty(band) {
  return !band || (!band.text && !band.logo);
}

// The front matter -> a band.
function fromHead(head, name) {
  const k = keys(name);
  return normalize({
    text: head[k.text],
    logo: head[k.logo],
    textPlace: head[k.textPlace],
    logoPlace: head[k.logoPlace],
    noRule: head[k.noRule] === ON,
    center: head[k.center] === ON,
    still: head[k.still] === ON,
  });
}

// A band -> the lines of the front matter. Only what the band really says:
// an empty band writes nothing, and a place equal to the default writes
// nothing either, so the head stays as short as the deck is plain.
function toHead(band, name) {
  if (isEmpty(band)) return [];
  const k = keys(name);
  const lines = [];
  if (band.text) lines.push(`${k.text}: ${band.text}`);
  if (band.logo) lines.push(`${k.logo}: ${band.logo}`);
  // Said only where it has something to say: the place of a piece the band
  // does not carry would be a line about nothing.
  if (band.text && band.textPlace !== TEXT_PLACE_DEFAULT) lines.push(`${k.textPlace}: ${band.textPlace}`);
  if (band.logo && band.logoPlace !== LOGO_PLACE_DEFAULT) lines.push(`${k.logoPlace}: ${band.logoPlace}`);
  // Nothing is written while the band looks the way bands have always
  // looked -- a line under it, its pieces spread across the slide.
  FLAGS.forEach((flag) => { if (band[flag]) lines.push(`${k[flag]}: ${ON}`); });
  return lines;
}

module.exports = {
  BANDS, PLACES, HIDDEN, FLAGS, ON, TEXT_PLACE_DEFAULT, LOGO_PLACE_DEFAULT, TEXT_MAX, LOGO_MAX,
  keys, headKeys, normalize, isEmpty, fromHead, toHead,
};
