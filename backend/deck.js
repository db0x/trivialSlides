// The storage format: one Markdown file per deck, compatible with
// reveal.js / reveal-md. This module translates between the file and the
// model the editor works with.
//
//   ---                      <- header (only at the very start of the file)
//   titel: My talk
//   theme: white
//   ---
//
//   <!-- .slide: data-layout="titel" -->
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
// inhalt: the rest of the slide passes through untouched).
const layouts = require("./layouts");

// The themes reveal.js ships with. black-contrast and white-contrast meet
// the WCAG contrast requirements -- they belong in the list even though
// they are picked less often.
const THEMES = ["black", "white", "league", "beige", "night", "serif", "simple",
  "solarized", "moon", "sky", "blood", "dracula", "black-contrast", "white-contrast"];
const TRANSITIONS = ["slide", "fade", "convex", "concave", "zoom", "none"];

function eineZeile(s) {
  return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();
}

// --- Header (frontmatter) ----------------------------------------------
// Deliberately NOT a YAML parser: the header has exactly three flat fields.
// A YAML dependency would only need constraining again right away.
function parseKopf(zeilen) {
  const kopf = {};
  if (zeilen[0] !== undefined && zeilen[0].trim() === "---") {
    for (let i = 1; i < zeilen.length; i++) {
      if (zeilen[i].trim() === "---") {
        return { kopf, rest: zeilen.slice(i + 1) };
      }
      const treffer = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(zeilen[i]);
      if (treffer) kopf[treffer[1].toLowerCase()] = treffer[2].trim();
    }
    // No closing "---" found: then the first "---" was a slide separator
    // after all and the file simply has no header.
  }
  return { kopf: {}, rest: zeilen };
}

// --- Slide attributes --------------------------------------------------
// reveal.js' own syntax: an HTML comment on the slide's first line. Any
// other reveal.js reads data-background-* from it directly; data-layout and
// data-image are our addition and do no harm there.
const ATTR_ZEILE = /^\s*<!--\s*\.slide:\s*(.*?)\s*-->\s*$/;

function parseAttrs(zeile) {
  const attrs = {};
  const re = /([a-z-]+)\s*=\s*"([^"]*)"/g;
  let t;
  while ((t = re.exec(zeile)) !== null) attrs[t[1]] = t[2];
  return {
    layout: layouts.get(attrs["data-layout"]).id,
    bild: attrs["data-image"] || "",
    quelle: attrs["data-quelle"] || "",
    hintergrund: /^#[0-9a-fA-F]{6}$/.test(attrs["data-background-color"] || "") ? attrs["data-background-color"] : "",
  };
}

// Returns "" for a slide with nothing special about it: a plain text slide
// should look plain in the file too. That is the only way a hand-written
// deck stays recognisable after the first save.
// immer=true forces the line even for an unremarkable slide. The still
// empty slide needs that: without any content its block in the file would
// be empty, and parse() discards empty blocks -- the slide just created
// would be gone on the next load.
function serialisiereAttrs(folie, immer) {
  const teile = [];
  if (immer || folie.layout !== layouts.DEFAULT_LAYOUT) teile.push(`data-layout="${folie.layout}"`);
  if (folie.bild && layouts.hatFeld(folie.layout, "bild")) teile.push(`data-image="${folie.bild}"`);
  if (folie.quelle && layouts.hatFeld(folie.layout, "quelle")) teile.push(`data-quelle="${folie.quelle}"`);
  if (folie.hintergrund) teile.push(`data-background-color="${folie.hintergrund}"`);
  return teile.length ? `<!-- .slide: ${teile.join(" ")} -->` : "";
}

// --- Slide: separating title from body ---------------------------------
// The editor shows title and body as two separate fields -- that is exactly
// where the Markdown syntax disappears for the user. The title is the FIRST
// heading line of the slide; everything before and after it is body.
function trenneTitel(text) {
  const zeilen = text.split("\n");
  for (let i = 0; i < zeilen.length; i++) {
    const t = /^(#{1,6})\s+(.*)$/.exec(zeilen[i]);
    if (t) {
      const rest = zeilen.slice(0, i).concat(zeilen.slice(i + 1));
      return { titel: t[2].trim(), inhalt: rest.join("\n").trim() };
    }
    if (zeilen[i].trim() !== "") break; // first non-empty line is not a heading
  }
  return { titel: "", inhalt: text.trim() };
}

function parseFolie(text, vertikal) {
  const zeilen = text.split("\n");
  let attrs = { layout: layouts.DEFAULT_LAYOUT, bild: "", quelle: "", hintergrund: "" };
  let i = 0;
  while (i < zeilen.length && zeilen[i].trim() === "") i++;
  if (i < zeilen.length && ATTR_ZEILE.test(zeilen[i])) {
    attrs = parseAttrs(zeilen[i]);
    i++;
  }
  return Object.assign({ vertikal: !!vertikal }, attrs, trenneTitel(zeilen.slice(i).join("\n")));
}

// --- File -> model -----------------------------------------------------
function parse(md) {
  const zeilen = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const { kopf, rest } = parseKopf(zeilen);

  // "---" separates horizontally, "----" vertically (the reveal-md and
  // HedgeDoc convention). Vertical slides attach to the preceding
  // horizontal one.
  const bloecke = [];
  let aktuell = [];
  let vertikal = [false];
  for (const zeile of rest) {
    const t = zeile.trim();
    if (t === "---" || t === "----") {
      bloecke.push(aktuell.join("\n"));
      vertikal.push(t === "----");
      aktuell = [];
    } else {
      aktuell.push(zeile);
    }
  }
  bloecke.push(aktuell.join("\n"));

  const folien = bloecke
    .map((text, i) => ({ text, vertikal: vertikal[i] }))
    // An empty first "slide" appears when the file starts with a
    // separator; empty slides in the middle were never intended.
    .filter((b) => b.text.trim() !== "")
    .map((b, i) => Object.assign({ id: "f" + i }, parseFolie(b.text, i > 0 && b.vertikal)));

  return {
    titel: eineZeile(kopf.titel) || "",
    theme: THEMES.includes(kopf.theme) ? kopf.theme : "white",
    transition: TRANSITIONS.includes(kopf.transition) ? kopf.transition : "slide",
    folien: folien.length ? folien : [neueFolie("titel")],
  };
}

// --- Model -> file -----------------------------------------------------
function serialize(deck) {
  const kopf = ["---", `titel: ${eineZeile(deck.titel)}`, `theme: ${deck.theme}`, `transition: ${deck.transition}`, "---", "", ""];
  const teile = [];
  (deck.folien || []).forEach((folie, i) => {
    // Heading level by weight of the slide: title and section slides get
    // "#", everything else "##". Pure convention, for the case where the
    // file is rendered without our CSS.
    const ebene = folie.layout === "titel" || folie.layout === "abschnitt" ? "#" : "##";
    const attrs = serialisiereAttrs(folie);
    const block = attrs ? [attrs] : [];
    if (eineZeile(folie.titel)) block.push(`${ebene} ${eineZeile(folie.titel)}`);
    if (String(folie.inhalt || "").trim()) block.push(String(folie.inhalt).trim());
    if (!block.length) block.push(serialisiereAttrs(folie, true));
    if (i > 0) teile.push(folie.vertikal ? "----" : "---");
    teile.push(block.join("\n\n"));
  });
  return kopf.join("\n") + teile.join("\n\n") + "\n";
}

function neueFolie(layout) {
  return {
    id: "f" + Date.now().toString(36),
    layout: layouts.get(layout).id,
    vertikal: false,
    titel: "",
    inhalt: "",
    bild: "",
    quelle: "",
    hintergrund: "",
  };
}

// Whatever arrives from the browser is unknown at first -- this turns it
// back into a model holding permitted values only.
function normalize(roh) {
  const deck = roh && typeof roh === "object" ? roh : {};
  const folien = Array.isArray(deck.folien) ? deck.folien : [];
  return {
    titel: eineZeile(deck.titel).slice(0, 120),
    theme: THEMES.includes(deck.theme) ? deck.theme : "white",
    transition: TRANSITIONS.includes(deck.transition) ? deck.transition : "slide",
    folien: (folien.length ? folien : [neueFolie("titel")]).map((f, i) => {
      const layout = layouts.get(f && f.layout).id;
      return {
        id: "f" + i,
        layout,
        // The first slide cannot hang vertically -- there would be
        // nothing for it to hang from.
        vertikal: i > 0 && !!(f && f.vertikal),
        titel: eineZeile(f && f.titel).slice(0, 200),
        inhalt: String((f && f.inhalt) || "").replace(/\r\n/g, "\n").slice(0, 20000),
        bild: layouts.hatFeld(layout, "bild") ? eineZeile(f && f.bild).slice(0, 200) : "",
        quelle: layouts.hatFeld(layout, "quelle") ? eineZeile(f && f.quelle).slice(0, 200) : "",
        hintergrund: /^#[0-9a-fA-F]{6}$/.test((f && f.hintergrund) || "") ? f.hintergrund : "",
      };
    }),
  };
}

module.exports = { parse, serialize, normalize, neueFolie, THEMES, TRANSITIONS };
