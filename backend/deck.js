// The storage format: one Markdown file per deck, compatible with
// reveal.js / reveal-md. This module translates between the file and the
// model the editor works with.
//
//   ---                      <- header (only at the very start of the file)
//   titel: My talk
//   theme: white
//   ---
//
//   <!-- .slide: data-layout="title" -->
//   # My talk
//
//   A subtitle
//
//   ---                      <- next slide
//
//   ## Second slide
//   - A point
//
// Why Markdown and not JSON: the user must be able to open the file in any
// editor, put it under git and copy it into an existing reveal.js project.
// The editor is a VIEW onto this format, not its owner -- which is why a
// round trip preserves everything we do not understand ourselves (see
// content: the rest of the slide passes through untouched).
const layouts = require("./layouts");
const effects = require("./effects");
const video = require("./video");
const qr = require("./qr");

// The themes reveal.js ships with. black-contrast and white-contrast meet
// the WCAG contrast requirements -- they belong in the list even though
// they are picked less often.
const THEMES = ["black", "white", "league", "beige", "night", "serif", "simple",
  "solarized", "moon", "sky", "blood", "dracula", "black-contrast", "white-contrast"];
const TRANSITIONS = ["slide", "fade", "convex", "concave", "zoom", "none"];

function oneLine(s) {
  return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();
}

// --- Gradients ---------------------------------------------------------
// A slide background may be a CSS gradient (data-background-gradient,
// which reveal.js reads by itself). Unlike a colour this is free CSS, and
// it ends up in an attribute and from there in a style property -- so it is
// checked against a SHAPE rather than merely escaped: exactly one gradient
// function, whose arguments are plain tokens plus, nested, nothing but the
// colour functions. That makes url(), a second declaration, a closing quote
// and an unbalanced bracket impossible by construction instead of by
// counting.
//
// The pattern is unanchored on purpose: the editor puts it straight into
// the input's pattern attribute, which anchors it itself. One definition,
// two places, no second grammar in the browser.
const GRADIENT_PATTERN = "(?:repeating-)?(?:linear|radial|conic)-gradient\\((?:[\\w .,%#\\/\\-]|(?:rgba?|hsla?)\\([\\w .,%\\/\\-]+\\))*\\)";
const GRADIENT = new RegExp("^" + GRADIENT_PATTERN + "$");
const GRADIENT_MAX = 400;

function isGradient(value) {
  const s = String(value == null ? "" : value);
  return s.length <= GRADIENT_MAX && GRADIENT.test(s);
}

// A line break inside a gradient is CSS anyone may write, but the attribute
// it travels in is one line -- so it is folded first and only then judged.
function onlyGradient(value) {
  const s = oneLine(value);
  return isGradient(s) ? s : "";
}

// Colours stay strictly hexadecimal: they come out of the picker, and a
// hand-written name would only be a value the picker cannot show again.
const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

function onlyColor(value) {
  return COLOR.test(String(value || "")) ? String(value) : "";
}

// --- Header (frontmatter) ----------------------------------------------
// Deliberately NOT a YAML parser: the header has exactly three flat fields.
// A YAML dependency would only need constraining again right away.
function parseHead(lines) {
  const head = {};
  if (lines[0] !== undefined && lines[0].trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        return { head, rest: lines.slice(i + 1) };
      }
      const hit = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(lines[i]);
      if (hit) head[hit[1].toLowerCase()] = hit[2].trim();
    }
    // No closing "---" found: then the first "---" was a slide separator
    // after all and the file simply has no header.
  }
  return { head: {}, rest: lines };
}

// --- Slide attributes --------------------------------------------------
// reveal.js' own syntax: an HTML comment on the slide's first line. Any
// other reveal.js reads data-background-* from it directly; data-layout and
// data-image are our addition and do no harm there.
const ATTR_LINE = /^\s*<!--\s*\.slide:\s*(.*?)\s*-->\s*$/;

function parseAttrs(line) {
  const attrs = {};
  const re = /([a-z-]+)\s*=\s*"([^"]*)"/g;
  let t;
  while ((t = re.exec(line)) !== null) attrs[t[1]] = t[2];
  const layout = layouts.get(attrs["data-layout"]).id;
  // What a layout has no field for comes back empty, exactly as it does
  // from normalize() -- otherwise a text slide read from a file would carry
  // a text arrangement it cannot have, and the same slide would look
  // different before and after its first save.
  const ifField = (field, value) => (layouts.hasField(layout, field) ? value : "");
  return {
    layout,
    image: ifField("image", attrs["data-image"] || ""),
    // Only the id is kept, never a URL -- see video.js.
    video: ifField("video", video.isId(attrs["data-video"] || "") ? attrs["data-video"] : ""),
    source: ifField("source", attrs["data-quelle"] || ""),
    // Where the text goes in relation to the player. A name, not a value:
    // the arrangement is in slides.css (see video.js).
    textSide: ifField("textSide", layouts.onlySide(attrs["data-textseite"], layout)),
    url: ifField("url", qr.toUrl(attrs["data-url"])),
    qrColor: ifField("qrColor", qr.onlyColor(attrs["data-qr-color"])),
    qrBackground: ifField("qrBackground", qr.onlyBackground(attrs["data-qr-background"])),
    qrTextColor: ifField("qrTextColor", qr.onlyTextColor(attrs["data-qr-text-color"])),
    textWidth: ifField("textWidth", layouts.onlyWidth(attrs["data-textbreite"], layout)),
    // Where the text box stands on a full-bleed picture (layouts.js).
    textPlace: ifField("textPlace", layouts.onlyPlace(attrs["data-text-place"])),
    // Whether each column has a text of its own. The breaks between them
    // are in the body, not here -- see layouts.js.
    columnMode: ifField("columnMode", layouts.onlyColumnMode(attrs["data-columns"])),
    // Where the heading stands. No ifField: every layout has a heading, so
    // this belongs to the slide like its colours do.
    titleAlign: layouts.onlyTitleAlign(attrs["data-title-align"]),
    // Whether the text waits for a click. Also no ifField: every layout
    // has a text box, and reveal.js makes a fragment of it (render.js).
    textFragment: attrs["data-text-fragment"] === ON,
    background: onlyColor(attrs["data-background-color"]),
    textColor: onlyColor(attrs["data-text-color"]),
    // A gradient someone wrote by hand passes through as it stands, as
    // long as it fits the grammar -- the editor's own presets are not a
    // limit on the file.
    gradient: onlyGradient(attrs["data-background-gradient"]),
    effect: effects.onlyEffect(attrs["data-background-effect"]),
  };
}

// Returns "" for a slide with nothing special about it: a plain text slide
// should look plain in the file too. That is the only way a hand-written
// deck stays recognisable after the first save.
// immer=true forces the line even for an unremarkable slide. The quiet
// empty slide needs that: without any content its block in the file would
// be empty, and parse() discards empty blocks -- the slide just created
// would be gone on the next load.
function serializeAttrs(slide, immer) {
  const parts = [];
  if (immer || slide.layout !== layouts.DEFAULT_LAYOUT) parts.push(`data-layout="${slide.layout}"`);
  if (slide.image && layouts.hasField(slide.layout, "image")) parts.push(`data-image="${slide.image}"`);
  if (slide.video && layouts.hasField(slide.layout, "video")) parts.push(`data-video="${slide.video}"`);
  // No escaping here, and none needed: toUrl lets nothing through that is
  // not http(s) followed by characters that cannot close an attribute
  // (qr.js) -- the same reasoning as the video id above.
  if (slide.url && layouts.hasField(slide.layout, "url")) parts.push(`data-url="${slide.url}"`);
  if (layouts.hasField(slide.layout, "qrColor") && slide.qrColor
      && slide.qrColor !== qr.COLOR_DEFAULT) parts.push(`data-qr-color="${slide.qrColor}"`);
  // The see-through one is written out as a word: an absent attribute
  // already means white, so "nothing here" cannot also mean "nothing
  // behind it".
  if (layouts.hasField(slide.layout, "qrBackground") && slide.qrBackground !== qr.BACKGROUND_DEFAULT) {
    parts.push(`data-qr-background="${slide.qrBackground || qr.TRANSPARENT}"`);
  }
  if (layouts.hasField(slide.layout, "qrTextColor") && slide.qrTextColor)
    parts.push(`data-qr-text-color="${slide.qrTextColor}"`);
  if (slide.source && layouts.hasField(slide.layout, "source")) parts.push(`data-quelle="${slide.source}"`);
  // The default stays out of the file: a video slide that has not been
  // arranged should look unarranged there too.
  if (layouts.hasField(slide.layout, "textSide") && slide.textSide
      && slide.textSide !== layouts.defaultSide(slide.layout)) parts.push(`data-textseite="${slide.textSide}"`);
  if (layouts.hasField(slide.layout, "textWidth") && slide.textWidth
      && slide.textWidth !== layouts.defaultWidth(slide.layout)) parts.push(`data-textbreite="${slide.textWidth}"`);
  if (layouts.hasField(slide.layout, "textPlace") && slide.textPlace
      && slide.textPlace !== layouts.PLACE_DEFAULT) parts.push(`data-text-place="${slide.textPlace}"`);
  // Only the split arrangement is written: an absent attribute means the
  // columns flow, which is what these layouts have always done.
  if (layouts.hasField(slide.layout, "columnMode")
      && slide.columnMode === layouts.COLUMN_SPLIT) parts.push(`data-columns="${layouts.COLUMN_SPLIT}"`);
  // Nothing is written while the layout is left in charge -- which is what
  // keeps a deck that has never been asked looking untouched in the file.
  if (slide.titleAlign) parts.push(`data-title-align="${slide.titleAlign}"`);
  if (slide.textFragment) parts.push(`data-text-fragment="${ON}"`);
  if (slide.background) parts.push(`data-background-color="${slide.background}"`);
  if (slide.gradient) parts.push(`data-background-gradient="${slide.gradient}"`);
  if (slide.effect) parts.push(`data-background-effect="${slide.effect}"`);
  if (slide.textColor) parts.push(`data-text-color="${slide.textColor}"`);
  return parts.length ? `<!-- .slide: ${parts.join(" ")} -->` : "";
}

// --- Slide: separating title from body ---------------------------------
// The editor shows title and body as two separate fields -- that is exactly
// where the Markdown syntax disappears for the user. The title is the FIRST
// heading line of the slide; everything before and after it is body.
// null and "" are two different things here, and that difference is the
// point: null means the slide has NO heading line, "" means it has one that
// is empty. An empty heading is not nothing -- it holds the space a heading
// takes, which is how a slide keeps its proportions when the words belong
// somewhere else on it. Folding the two together is what made the editor
// swallow a hand-written "##".
function splitTitle(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // The text after the hashes is optional, so "##" on its own is a
    // heading too -- CommonMark says so, and it saves writing a line that
    // ends in a space.
    const t = /^(#{1,6})(?:\s+(.*))?$/.exec(lines[i]);
    if (t) {
      const rest = lines.slice(0, i).concat(lines.slice(i + 1));
      return { title: (t[2] || "").trim(), content: rest.join("\n").trim() };
    }
    if (lines[i].trim() !== "") break; // first non-empty line is not a heading
  }
  // null, not "": see above -- a slide with no heading line at all.
  return { title: null, content: text.trim() };
}

// The one value a flag in this file takes. A flag and not a mode: there is
// nothing to choose between, the text either waits for a click or it does
// not -- so the attribute is simply absent on every slide that does not.
const ON = "1";

function parseSlide(text, vertical) {
  const lines = text.split("\n");
  let attrs = { layout: layouts.DEFAULT_LAYOUT, image: "", source: "", video: "", textSide: layouts.defaultSide(layouts.DEFAULT_LAYOUT), url: "", qrColor: "", qrBackground: "", qrTextColor: "", textWidth: layouts.defaultWidth(layouts.DEFAULT_LAYOUT), textPlace: "", columnMode: "", titleAlign: "", textFragment: false, background: "", textColor: "", gradient: "", effect: "" };
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && ATTR_LINE.test(lines[i])) {
    attrs = parseAttrs(lines[i]);
    i++;
  }
  return Object.assign({ vertical: !!vertical }, attrs, splitTitle(lines.slice(i).join("\n")));
}

// --- File -> model -----------------------------------------------------
function parse(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const { head, rest } = parseHead(lines);

  // "---" separates horizontally, "----" vertically (the reveal-md and
  // HedgeDoc convention). Vertical slides attach to the preceding
  // horizontal one.
  const blocks = [];
  let current = [];
  let vertical = [false];
  for (const line of rest) {
    const t = line.trim();
    if (t === "---" || t === "----") {
      blocks.push(current.join("\n"));
      vertical.push(t === "----");
      current = [];
    } else {
      current.push(line);
    }
  }
  blocks.push(current.join("\n"));

  const slides = blocks
    .map((text, i) => ({ text, vertical: vertical[i] }))
    // An empty first "slide" appears when the file starts with a
    // separator; empty slides in the middle were never intended.
    .filter((b) => b.text.trim() !== "")
    .map((b, i) => Object.assign({ id: "f" + i }, parseSlide(b.text, i > 0 && b.vertical)));

  return {
    // "titel" and not "title": that is the key in the FILE, and the file
    // format stays as it is -- only the model field beside it is English.
    title: oneLine(head.titel) || "",
    theme: THEMES.includes(head.theme) ? head.theme : "white",
    transition: TRANSITIONS.includes(head.transition) ? head.transition : "slide",
    slides: slides.length ? slides : [newSlide("title")],
  };
}

// --- Model -> file -----------------------------------------------------
function serialize(deck) {
  const head = ["---", `titel: ${oneLine(deck.title)}`, `theme: ${deck.theme}`, `transition: ${deck.transition}`, "---", "", ""];
  const parts = [];
  (deck.slides || []).forEach((slide, i) => {
    // Heading level by weight of the slide: title and section slides get
    // "#", everything else "##". Pure convention, for the case where the
    // file is rendered without our CSS.
    const level = slide.layout === "title" || slide.layout === "section" ? "#" : "##";
    const attrs = serializeAttrs(slide);
    const block = attrs ? [attrs] : [];
    // Written whenever the slide has a heading at all -- an empty one comes
    // out as a bare "##", which is what carries it back in.
    if (slide.title !== null && slide.title !== undefined) {
      const heading = oneLine(slide.title);
      block.push(heading ? `${level} ${heading}` : level);
    }
    if (String(slide.content || "").trim()) block.push(String(slide.content).trim());
    if (!block.length) block.push(serializeAttrs(slide, true));
    if (i > 0) parts.push(slide.vertical ? "----" : "---");
    parts.push(block.join("\n\n"));
  });
  return head.join("\n") + parts.join("\n\n") + "\n";
}

function newSlide(layout) {
  return {
    id: "f" + Date.now().toString(36),
    layout: layouts.get(layout).id,
    vertical: false,
    title: null,
    content: "",
    image: "",
    source: "",
    video: "",
    textSide: layouts.defaultSide(layout),
    url: "",
    qrColor: qr.COLOR_DEFAULT,
    qrBackground: qr.BACKGROUND_DEFAULT,
    qrTextColor: "",
    textWidth: layouts.defaultWidth(layout),
    textPlace: layouts.hasField(layout, "textPlace") ? layouts.PLACE_DEFAULT : "",
    columnMode: "",
    titleAlign: "",
    textFragment: false,
    background: "",
    textColor: "",
    gradient: "",
    effect: "",
  };
}

// Whatever arrives from the browser is unknown at first -- this turns it
// back into a model holding permitted values only.
function normalize(raw) {
  const deck = raw && typeof raw === "object" ? raw : {};
  const slides = Array.isArray(deck.slides) ? deck.slides : [];
  return {
    title: oneLine(deck.title).slice(0, 120),
    theme: THEMES.includes(deck.theme) ? deck.theme : "white",
    transition: TRANSITIONS.includes(deck.transition) ? deck.transition : "slide",
    slides: (slides.length ? slides : [newSlide("title")]).map((f, i) => {
      const layout = layouts.get(f && f.layout).id;
      return {
        id: "f" + i,
        layout,
        // The first slide cannot hang vertically -- there would be
        // nothing for it to hang from.
        vertical: i > 0 && !!(f && f.vertical),
        // Passed through rather than folded to "": the editor sends null for
        // a slide without a heading and "" for one with an empty heading,
        // and both have to survive the round trip.
        title: f && f.title !== null && f.title !== undefined ? oneLine(f.title).slice(0, 200) : null,
        content: String((f && f.content) || "").replace(/\r\n/g, "\n").slice(0, 20000),
        image: layouts.hasField(layout, "image") ? oneLine(f && f.image).slice(0, 200) : "",
        source: layouts.hasField(layout, "source") ? oneLine(f && f.source).slice(0, 200) : "",
        // Whatever arrives -- a watch link, a short link, an id -- becomes
        // an id here, so the editor may simply pass on what was pasted.
        video: layouts.hasField(layout, "video") ? video.toId(f && f.video) : "",
        textSide: layouts.hasField(layout, "textSide") ? layouts.onlySide(f && f.textSide, layout) : "",
        url: layouts.hasField(layout, "url") ? qr.toUrl(f && f.url) : "",
        qrColor: layouts.hasField(layout, "qrColor") ? qr.onlyColor(f && f.qrColor) : "",
        // f.qrBackground is undefined on a slide just switched to this
        // layout, and that has to come out white rather than see-through --
        // onlyBackground is what tells the two apart.
        qrBackground: layouts.hasField(layout, "qrBackground") ? qr.onlyBackground(f ? f.qrBackground : undefined) : "",
        qrTextColor: layouts.hasField(layout, "qrTextColor") ? qr.onlyTextColor(f && f.qrTextColor) : "",
        textWidth: layouts.hasField(layout, "textWidth") ? layouts.onlyWidth(f && f.textWidth, layout) : "",
        textPlace: layouts.hasField(layout, "textPlace") ? layouts.onlyPlace(f && f.textPlace) : "",
        columnMode: layouts.hasField(layout, "columnMode") ? layouts.onlyColumnMode(f && f.columnMode) : "",
        titleAlign: layouts.onlyTitleAlign(f && f.titleAlign),
        textFragment: !!(f && f.textFragment),
        background: onlyColor(f && f.background),
        textColor: onlyColor(f && f.textColor),
        // Not truncated but dropped when it does not fit: half a gradient
        // is invalid CSS, and the slide would come out with no background
        // at all rather than with a shorter one.
        gradient: onlyGradient(f && f.gradient),
        effect: effects.onlyEffect(f && f.effect),
      };
    }),
  };
}

module.exports = { parse, serialize, normalize, newSlide, isGradient, THEMES, TRANSITIONS, GRADIENT_PATTERN, GRADIENT_MAX, TEXT_FRAGMENT_ON: ON };
