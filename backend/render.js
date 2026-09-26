// Model -> reveal.js markup. One place for all three consumers: the live
// preview in the editor, the presentation view and the export. That way the
// preview cannot look different from the finished talk.
const { marked } = require("marked");
const layouts = require("./layouts");

// Only the Markdown part is rendered, raw HTML inside a slide is dropped.
// The reason: this markup later reaches colleagues who merely view the
// talk -- without raw HTML a smuggled-in <script> is impossible to begin
// with, and the editor does not offer HTML anyway. Anyone who does need it
// uses reveal.js directly; the .md stays readable either way.
function markdownRenderer(bildBasis) {
  const r = new marked.Renderer();
  r.html = () => "";
  const bildOrig = r.image.bind(r);
  // Images in body text: relative paths point at the deck's image folder,
  // absolute ones (http(s)) are left alone.
  r.image = (href, title, text) => bildOrig(bildUrl(href, bildBasis), title, text);
  return r;
}

function bildUrl(name, basis) {
  const s = String(name || "");
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:")) return s;
  return basis + encodeURIComponent(s.replace(/^.*\//, ""));
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function md(text, bildBasis) {
  if (!String(text || "").trim()) return "";
  return marked.parse(String(text), { gfm: true, breaks: false, renderer: markdownRenderer(bildBasis), mangle: false, headerIds: false });
}

// --- a single slide ----------------------------------------------------
// Always the same shape: <section> carries the layout class and the reveal
// attributes, inside it a .folie-text with title and body and -- depending
// on the layout -- a .folie-bild next to it. The arrangement is done
// entirely by the CSS (public/css/slides.css), not by this module. A layout
// can therefore be redesigned without touching the renderer.
function folieHtml(folie, bildBasis) {
  const layout = layouts.get(folie.layout).id;
  const attrs = [`class="layout-${layout}"`, `data-layout="${layout}"`];
  if (folie.hintergrund) attrs.push(`data-background-color="${esc(folie.hintergrund)}"`);
  // A full-bleed image is a slide background in reveal.js -- that way
  // reveal handles the scaling and the transition.
  if (layout === "bild-voll" && folie.bild) {
    attrs.push(`data-background-image="${esc(bildUrl(folie.bild, bildBasis))}"`);
    attrs.push('data-background-size="cover"');
  }

  const ueberschrift = folie.titel
    ? `<h${layout === "titel" || layout === "abschnitt" ? 1 : 2}>${esc(folie.titel)}</h${layout === "titel" || layout === "abschnitt" ? 1 : 2}>`
    : "";

  let innen;
  if (layout === "zitat") {
    innen =
      `<blockquote>${md(folie.inhalt, bildBasis) || "<p></p>"}</blockquote>` +
      (folie.quelle ? `<cite>${esc(folie.quelle)}</cite>` : "");
    innen = `<div class="folie-text">${ueberschrift}${innen}</div>`;
  } else {
    innen = `<div class="folie-text">${ueberschrift}${md(folie.inhalt, bildBasis)}</div>`;
  }

  if (layouts.hatFeld(layout, "bild") && layout !== "bild-voll" && folie.bild) {
    const bild = `<div class="folie-bild"><img src="${esc(bildUrl(folie.bild, bildBasis))}" alt=""></div>`;
    // Order in the markup = reading order; which side it appears on is
    // decided by the CSS grid columns.
    innen = layout === "bild-links" ? bild + innen : innen + bild;
  }

  return `<section ${attrs.join(" ")}>\n${innen}\n</section>`;
}

// --- all slides --------------------------------------------------------
// Vertical slides are grouped into a nested <section> in reveal.js
// (a "stack").
function foliengruppen(folien) {
  const gruppen = [];
  (folien || []).forEach((f, i) => {
    if (i > 0 && f.vertikal && gruppen.length) gruppen[gruppen.length - 1].push(f);
    else gruppen.push([f]);
  });
  return gruppen;
}

// bildBasis: URL prefix the image file name is appended to. A route in the
// editor and the presentation, the "bilder/" subfolder in the export.
function slidesHtml(deck, bildBasis) {
  return foliengruppen(deck.folien)
    .map((gruppe) =>
      gruppe.length === 1
        ? folieHtml(gruppe[0], bildBasis)
        : `<section>\n${gruppe.map((f) => folieHtml(f, bildBasis)).join("\n")}\n</section>`
    )
    .join("\n");
}

// Index of each slide in the flat list -> [horizontal, vertical] for
// Reveal.slide(). The preview uses it to jump to the slide being edited.
function indizes(folien) {
  const out = [];
  let h = -1;
  let v = 0;
  (folien || []).forEach((f, i) => {
    if (i > 0 && f.vertikal) v++;
    else { h++; v = 0; }
    out.push([h, v]);
  });
  return out;
}

module.exports = { slidesHtml, folieHtml, indizes, esc, bildUrl };
