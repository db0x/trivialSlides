// What a hand-written source would COST when it is saved.
//
// The editor lets the file be edited in the source dialog, and deck.js is
// forgiving by design: an attribute it does not know, a colour that is not
// a colour, a slide block with nothing in it -- none of that is refused, it
// is quietly left out. That is the right behaviour for a file arriving from
// somewhere else, and exactly the wrong one for a file somebody is editing
// in front of us: they would press "apply" and watch a line disappear.
//
// So this module answers one question: which lines does deck.js not carry
// over, and why. It does NOT hold a second set of rules -- it parses the
// text with deck.js itself and compares what came back against what the
// file says. A value that went missing on the way was dropped, and the
// attribute it belonged to says what to call the loss. That way the check
// cannot drift away from the reader: there is only one set of rules, and
// this asks it rather than repeating it.
//
// A finding is { line, key, values } -- a line number (1-based), a text key
// and what to put in it. The words are the caller's business (i18n.js), so
// that a finding reads in the language the editor is in.
const deck = require("./deck");
const source = require("./source");
const layouts = require("./layouts");
const bands = require("./bands");
const effects = require("./effects");
const qr = require("./qr");

const ATTR_LINE = /^\s*<!--\s*\.slide:\s*(.*?)\s*-->\s*$/;
// Anything that merely LOOKS like the line above. What matches this but not
// ATTR_LINE is a slide comment somebody meant and mistyped -- the one case
// where silence would be cruel, because the slide keeps every attribute's
// effect in the editor until the next save and then loses all of them at
// once.
const ATTR_LIKE = /<!--[^>]*\.slide\b/;
const PAIR = /([a-z-]+)\s*=\s*"([^"]*)"/g;
// The group comments (render.js). Written as this module writes everything
// else: the shape that WORKS, and the shape that merely looks like it. A
// group whose opening line is mistyped renders as nothing at all and takes
// its closing line with it, which is a silence worth breaking.
const GROUP_OPEN = /^\s*<!--\s*\.group:\s*class="[A-Za-z0-9 _-]+"\s*-->\s*$/;
const GROUP_CLOSE = /^\s*<!--\s*\/\.group\s*-->\s*$/;
const GROUP_LIKE = /<!--[^>]*\.group\b/;
// The three lines serialize() always writes. A head that is missing one of
// them gets it back with a value nobody chose, which is worth saying.
const HEAD_KEYS = ["titel", "theme", "transition"];
// What the two bands may add (bands.js). Optional, every one of them: a
// deck without bands has nothing to say about them and its head is the
// three lines above and no more -- so a missing one is not a finding here.
const BAND_KEYS = bands.headKeys();
// What deck.js cuts to length in normalize(): the deck's title, a slide's
// heading, and the two one-line fields an attribute may carry.
const TITLE_MAX = 120;
const HEADING_MAX = 200;
const FIELD_MAX = 200;
const CONTENT_MAX = 20000;

// Every attribute deck.js reads, and the field of the model it lands in.
// The order is the one serialize() writes them in, so a reader comparing
// the two files has them in the same order.
//
// `layout: true` marks the ten that hang on the LAYOUT -- the ones
// parseAttrs passes through its ifField. What they carry comes back empty
// on a layout that has no such field, however well it is written. The rest
// belong to the slide the way its colours do (deck.js says so in as many
// words) and are read whatever the layout is.
const ATTRIBUTES = [
  { name: "data-layout", field: "layout", key: "check.layout", allowed: () => layouts.LAYOUTS.map((l) => l.id) },
  { name: "data-image", field: "image", key: "check.tooLong", values: { max: FIELD_MAX }, layout: true },
  { name: "data-video", field: "video", key: "check.video", layout: true },
  { name: "data-url", field: "url", key: "check.url", layout: true },
  { name: "data-qr-color", field: "qrColor", key: "check.color", layout: true },
  { name: "data-qr-background", field: "qrBackground", key: "check.qrBackground", layout: true },
  { name: "data-qr-text-color", field: "qrTextColor", key: "check.color", layout: true },
  { name: "data-quelle", field: "source", key: "check.tooLong", values: { max: FIELD_MAX }, layout: true },
  { name: "data-textseite", field: "textSide", key: "check.side", allowed: () => layouts.SIDES, layout: true },
  { name: "data-textbreite", field: "textWidth", key: "check.width", allowed: () => layouts.WIDTHS, layout: true },
  { name: "data-text-place", field: "textPlace", key: "check.place", allowed: () => layouts.PLACES, layout: true },
  { name: "data-columns", field: "columnMode", key: "check.columns", allowed: () => [layouts.COLUMN_SPLIT], layout: true },
  { name: "data-title-align", field: "titleAlign", key: "check.titleAlign", allowed: () => layouts.TITLE_ALIGNS },
  { name: "data-text-fragment", field: "textFragment", key: "check.textFragment", allowed: () => [deck.TEXT_FRAGMENT_ON] },
  // The two bands a slide can send away, built from the same table the
  // renderer reads (bands.js) rather than written out a second time.
  ...bands.BANDS.map((name) => ({
    name: bands.HIDDEN[name].attribute, field: bands.HIDDEN[name].field,
    key: "check.bandFlag", allowed: () => [deck.TEXT_FRAGMENT_ON],
  })),
  { name: "data-background-color", field: "background", key: "check.color" },
  { name: "data-background-gradient", field: "gradient", key: "check.gradient" },
  { name: "data-background-effect", field: "effect", key: "check.effect", allowed: () => effects.EFFECTS.map((e) => e.id) },
  { name: "data-text-color", field: "textColor", key: "check.color" },
];
const byName = new Map(ATTRIBUTES.map((a) => [a.name, a]));
// The attributes whose value is a yes or a no: the text waiting for a
// click, and the two bands a slide can send away.
const FLAGS = ["textFragment"].concat(bands.BANDS.map((n) => bands.HIDDEN[n].field));

function pairs(inner) {
  const out = [];
  PAIR.lastIndex = 0;
  let hit;
  while ((hit = PAIR.exec(inner)) !== null) out.push({ name: hit[1], value: hit[2] });
  return out;
}

// --- The head ----------------------------------------------------------
// images: the names in the deck's folder, for the one value here that
// names a file -- a band's logo (bands.js).
function checkHead(block, model, images, add) {
  if (!block) return add(1, "check.headMissing");
  block.lines.forEach((line, i) => {
    const at = i + 1;
    if (line.trim() === "---" || line.trim() === "") return;
    const hit = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line);
    // Not "key: value", so parseHead walks past it and the line is gone.
    if (!hit) return add(at, "check.headLine");
    const key = hit[1].toLowerCase();
    const value = hit[2].trim();
    if (BAND_KEYS.includes(key)) return checkBandLine(key, value, at, model, images, add);
    if (!HEAD_KEYS.includes(key)) return add(at, "check.headKey", { key: hit[1] });
    // What the file says against what came out of it. Only these three
    // fields, and each one differs for exactly one reason.
    if (key === "theme" && model.theme !== value) {
      return add(at, "check.theme", { value, allowed: deck.THEMES.join(", ") });
    }
    if (key === "transition" && model.transition !== value) {
      return add(at, "check.transition", { value, allowed: deck.TRANSITIONS.join(", ") });
    }
    if (key === "titel" && model.title !== value) {
      return add(at, "check.tooLong", { max: TITLE_MAX });
    }
  });
  // A key left out is not an error in a file from elsewhere -- but saving
  // writes all three, so the missing one would arrive with a value nobody
  // chose.
  const written = new Set(block.lines
    .map((l) => (/^([A-Za-z_-]+)\s*:/.exec(l) || [])[1])
    .filter(Boolean).map((k) => k.toLowerCase()));
  HEAD_KEYS.filter((k) => !written.has(k))
    .forEach((k) => add(1, "check.headKeyMissing", { key: k }));
  // The band keys are deliberately NOT in that list: a deck without bands
  // says nothing about them and saving writes nothing about them either
  // (bands.js, toHead).
}

// One line of a band. Four shapes, and each of them is wrong for exactly
// one reason -- the same reasoning the attributes below are judged by:
// what the file says against what bands.js made of it.
function checkBandLine(key, value, at, model, images, add) {
  const which = key.indexOf("footer") === 0 ? "footer" : "header";
  const band = model[which] || {};
  const k = bands.keys(which);
  if (key === k.text) {
    if (band.text !== value) add(at, "check.bandTooLong", { max: bands.TEXT_MAX });
    return;
  }
  if (key === k.logo) {
    if (band.logo !== value) return add(at, "check.bandTooLong", { max: bands.LOGO_MAX });
    // The one value nothing else can judge: whether the picture is in the
    // folder. Asked here, where the answer is at hand -- otherwise the
    // band would come out empty and nobody would know why.
    if (images && !images.includes(band.logo)) add(at, "check.bandLogo", { value: band.logo });
    return;
  }
  // The two flags the band carries as a whole. One spelling each, and the
  // key is simply absent on a band that does not say it -- so "the value
  // survived" means the file says that one value and the model came out
  // yes, exactly as it does for a slide's own flags below.
  const flag = bands.FLAGS.find((f) => key === k[f]);
  if (flag) {
    if (!(value === bands.ON && band[flag])) {
      add(at, "check.bandHeadFlag", { value, allowed: bands.ON });
    }
    return;
  }
  // A place that is not one of the three comes back as the default, and
  // the band then stands somewhere nobody asked for.
  const place = key === k.textPlace ? band.textPlace : band.logoPlace;
  if (place !== value) {
    add(at, "check.bandPlace", { name: key, value, allowed: bands.PLACES.join(", ") });
  }
}

// --- One slide ---------------------------------------------------------
function checkSlide(block, slide, isFirstSlide, images, add) {
  const at = (i) => block.start + i + 1;
  const body = block.lines.filter((l) => l.trim() !== "");

  // A separator, and then nothing. parse() drops the block, and with it
  // every line that stood in it.
  if (!body.length || (body.length === 1 && /^-{3,4}$/.test(body[0].trim()))) {
    return add(at(0), "check.slideEmpty");
  }
  if (isFirstSlide && block.vertical) add(at(0), "check.verticalFirst");

  // The attribute line has to be the FIRST line of the slide; anywhere
  // else parseSlide walks past it and every attribute on it is lost. And
  // the first line is the only place the values are worth reading: a line
  // further down has already lost all of them, so going through them one
  // by one would say the same thing a second time.
  const first = block.lines.findIndex((l) => l.trim() !== "" && !/^-{3,4}$/.test(l.trim()));
  block.lines.forEach((line, i) => {
    if (!ATTR_LIKE.test(line)) return;
    if (i !== first) return add(at(i), "check.attrPlace");
    if (!ATTR_LINE.test(line)) return add(at(i), "check.attrBroken");
    checkAttrs(line, at(i), slide, images, add);
  });

  // The heading and the body, both of which deck.js cuts to length.
  const heading = /^#{1,6}(?:\s+(.*))?$/.exec((body.find((l) => /^#{1,6}(\s|$)/.test(l)) || "").trim());
  if (heading && slide.title !== null && (heading[1] || "").trim() !== slide.title) {
    add(at(block.lines.indexOf(body.find((l) => /^#{1,6}(\s|$)/.test(l)))), "check.tooLong", { max: HEADING_MAX });
  }
  if (slide.content.length >= CONTENT_MAX) add(at(0), "check.tooLong", { max: CONTENT_MAX });

  // The groups. One that is opened and never closed still shows its slide
  // -- the renderer closes it at the end rather than losing the text -- but
  // it reaches further than whoever wrote it meant, so it is said here. A
  // closing line on its own does nothing at all.
  let open = 0;
  let openedAt = 0;
  let fenced = false;
  block.lines.forEach((line, i) => {
    // Inside a code block a line like this is text somebody is showing,
    // not a line this file acts on -- the same reading the renderer has.
    if (/^\s{0,3}```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    if (GROUP_OPEN.test(line)) { if (!open) openedAt = i; open++; return; }
    if (GROUP_CLOSE.test(line)) {
      if (open) open--;
      else add(at(i), "check.groupClose");
      return;
    }
    if (GROUP_LIKE.test(line)) add(at(i), "check.groupBroken");
  });
  if (open) add(at(openedAt), "check.groupOpen");
}

function checkAttrs(line, at, slide, images, add) {
  const inner = ATTR_LINE.exec(line)[1];
  const written = pairs(inner);

  // Everything in the comment that is not name="value". The reader's
  // pattern simply does not see it, so it says nothing -- and a
  // data-layout=title without quotation marks would take the slide's whole
  // arrangement with it in silence.
  const rest = written.reduce((text, p) => text.replace(`${p.name}="${p.value}"`, ""), inner)
    .replace(/^\.slide:/, "").trim();
  if (rest) add(at, "check.attrJunk", { rest: rest.slice(0, 40) });

  const seen = new Set();
  written.forEach((p) => {
    const rule = byName.get(p.name);
    if (!rule) return add(at, "check.attrUnknown", { name: p.name });
    if (seen.has(p.name)) return add(at, "check.attrTwice", { name: p.name });
    seen.add(p.name);
    // The layout decides which of those ten a slide may carry at all.
    if (rule.layout && !layouts.hasField(slide.layout, rule.field)) {
      return add(at, "check.attrField", { name: p.name, layout: slide.layout });
    }
    // The one value deck.js does not judge at all: it names a file, and
    // whether that file is in the folder is not a question the reader can
    // answer. Asked here, where the answer is at hand -- otherwise the
    // slide would come out empty and nobody would know why.
    if (rule.field === "image" && images && slide.image === p.value.trim()
        && !images.includes(slide.image)) {
      return add(at, "check.image", { value: slide.image });
    }
    // What the file says against what deck.js made of it. Equal means the
    // value survived; anything else was dropped, repaired or cut.
    if (String(slide[rule.field]) === p.value.trim()) return;
    if (rule.field === "url" && slide.url === "https://" + p.value.trim()) {
      return add(at, "check.urlScheme", { value: p.value });
    }
    if (rule.field === "qrBackground" && p.value.trim() === qr.TRANSPARENT && slide.qrBackground === "") return;
    // A flag holds a yes or a no in the model and has one spelling in the
    // file: it is there or it is not. So "the value survived" means the
    // file says that one value and the model came out yes. Three of them
    // by now: the text waiting for a click, and the two bands a slide can
    // send away (deck.js).
    if (FLAGS.includes(rule.field)) {
      if (p.value.trim() === deck.TEXT_FRAGMENT_ON && slide[rule.field]) return;
    }
    add(at, rule.key, Object.assign({ name: p.name, value: p.value },
      rule.values || {}, rule.allowed ? { allowed: rule.allowed().join(", ") } : {}));
  });
}

// --- The net under the rules -------------------------------------------
// Whatever the rules above missed. Every line that carries something is
// looked for in the file deck.js would write back; a line that is not
// there any more was lost, whatever the reason. Blank lines and the order
// are left out of it on purpose -- saving rearranges both without costing
// anybody a word, and a check that complained about that could never be
// satisfied.
function canonical(line) {
  const hit = ATTR_LINE.exec(line);
  if (!hit) return line.replace(/\s+$/, "");
  // An attribute line is compared by what it SAYS, not by the order it
  // says it in: serialize writes the pairs in its own order.
  return "<!-- .slide: " + pairs(hit[1])
    .map((p) => `${p.name}="${p.value}"`).sort().join(" ") + " -->";
}

function lost(lines, written, add) {
  const left = new Map();
  written.split("\n").map(canonical).filter((l) => l.trim() !== "")
    .forEach((l) => left.set(l, (left.get(l) || 0) + 1));
  lines.forEach((line, i) => {
    const key = canonical(line);
    if (key.trim() === "") return;
    const n = left.get(key) || 0;
    if (n > 0) return left.set(key, n - 1);
    add(i + 1, "check.lost");
  });
}

// --- The whole file ----------------------------------------------------
// images: the names in the deck's folder, so that a picture named in the
// file but not on disk is found here rather than on the slide.
function check(text, images) {
  const findings = [];
  const add = (line, key, values) => findings.push({ line, key, values: values || {} });
  const md = String(text == null ? "" : text).replace(/\r\n/g, "\n");
  const lines = md.split("\n");
  // Normalised, not merely parsed: the length limits live in normalize(),
  // and normalize() is what the saved file goes through. Comparing against
  // the raw parse would let a title of 130 characters pass here and cut it
  // on saving anyway -- which is the one thing this module is for.
  const model = deck.normalize(deck.parse(md));

  // The same cut of the file the dialog shows, so a line number here and a
  // line in the view are the same line.
  let at = 0;
  const blocks = source.blocks(lines).map((b) => {
    const start = at;
    at += b.lines.length;
    return Object.assign({ start }, b);
  });

  const head = blocks[0] && blocks[0].head ? blocks[0] : null;
  checkHead(head, model, Array.isArray(images) ? images : null, add);

  // parse() throws empty blocks away, so the slides of the model line up
  // with the blocks that hold something -- and only with those. Which
  // block is which slide is counted in source.js, once, for everyone.
  blocks.filter((b) => !b.head).forEach((block, i) => {
    if (block.slide == null) return add(block.start + 1, "check.slideEmpty");
    checkSlide(block, model.slides[block.slide], i === 0,
      Array.isArray(images) ? images : null, add);
  });

  if (!findings.length) lost(lines, deck.serialize(model), add);

  return findings.sort((a, b) => a.line - b.line);
}

module.exports = { check };
