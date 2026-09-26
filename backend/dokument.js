// The standalone document: a single HTML file holding reveal.js, the
// theme, our layout CSS, the fonts and every image.
//
// Two consumers, one document: the HTML file to send around and the PDF to
// hand out. The only difference is the reveal.js options -- for the PDF the
// "print" view, in which reveal puts every slide on a page of its own.
// Because both go through the same place, the handout CANNOT look
// different from the talk; that is precisely why this lives here and not
// in the routes.
const fs = require("fs");
const path = require("path");
const render = require("./render");
const storage = require("./storage");

const REVEAL_DIR = path.join(__dirname, "node_modules", "reveal.js", "dist");
const SLIDES_CSS = path.join(__dirname, "public", "css", "slides.css");

const BILD_TYPEN = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

function lies(p) {
  return fs.readFileSync(p, "utf8");
}

// --- Fonts -------------------------------------------------------------
// The reveal.js themes pull their fonts from a subfolder via @import. In a
// single file that folder no longer exists, so the fonts travel along as
// data: URLs. Without this the file you send -- and therefore the PDF too
// -- would show a different typeface than the talk on the wall, and "just
// like the HTML" would only be half true.
//
// Only woff is embedded: in the same @font-face rules, eot and ttf exist
// solely for browsers that have been gone for years, and would triple the
// file size for no gain whatsoever.
//
// Themes that fetch their font from fonts.googleapis.com (sky or night,
// say) keep their @import: only the network can answer that one. The HTML
// file does so when opened, the PDF generator while rendering -- without a
// network both fall back to the same substitute font.
function schriftenEinbetten(css, verzeichnis) {
  return css.replace(/@font-face\s*\{([^}]*)\}/g, (ganz, regel) => {
    const treffer = /url\(\s*['"]?([^'")?]+\.woff)['"]?/.exec(regel);
    if (!treffer) return ganz;
    const datei = path.resolve(verzeichnis, treffer[1]);
    if (!datei.startsWith(REVEAL_DIR + path.sep) || !fs.existsSync(datei)) return ganz;
    // Replace both src declarations of the rule (first eot on its own,
    // then the list) with exactly one -- otherwise a reference would
    // survive pointing at a file that does not exist next to the
    // document.
    const ohneSrc = regel.replace(/src\s*:[^;]*;?/g, "").trim();
    const daten = fs.readFileSync(datei).toString("base64");
    return `@font-face{${ohneSrc}src:url(data:font/woff;base64,${daten}) format("woff");}`;
  });
}

function themeCss(theme) {
  const datei = path.join(REVEAL_DIR, "theme", `${theme}.css`);
  const css = lies(datei).replace(/@import\s+url\(\s*['"]?(\.\/[^'")\s]+)['"]?\s*\)\s*;/g, (ganz, rel) => {
    const ziel = path.resolve(path.dirname(datei), rel);
    if (!ziel.startsWith(REVEAL_DIR + path.sep) || !fs.existsSync(ziel)) return "";
    return schriftenEinbetten(lies(ziel), path.dirname(ziel));
  });

  // Whatever @import is left by now fetches a font from the network. Those
  // lines have to move to the front: an @import only counts as long as no
  // other rule precedes it -- and the embedded @font-face rules now do.
  // Without this step beige, league, moon and solarized would lose their
  // base typeface.
  const fern = [];
  const rest = css.replace(/@import[^;]+;/g, (ganz) => { fern.push(ganz.trim()); return ""; });
  return fern.length ? fern.join("\n") + "\n" + rest : rest;
}

// --- Images ------------------------------------------------------------
// The renderer receives an image "base" that is already a finished URL; a
// data: URL cannot be slotted in there because it differs per image. Hence
// a separate pass over the finished markup instead of a special case
// inside the renderer.
function bilderEinbetten(slides, slug, bildBasis) {
  for (const name of storage.bilder(slug)) {
    const p = storage.bildPfad(slug, name);
    if (!p || !fs.existsSync(p)) continue;
    const typ = BILD_TYPEN[path.extname(name).toLowerCase()];
    if (!typ) continue;
    const datenUrl = `data:${typ};base64,${fs.readFileSync(p).toString("base64")}`;
    slides = slides.split(bildBasis + encodeURIComponent(name)).join(datenUrl);
  }
  return slides;
}

// --- reveal.js options -------------------------------------------------
function optionen(deck, druck) {
  if (!druck) return { hash: true, slideNumber: "c/t", transition: deck.transition };
  return {
    // The "print" view: reveal puts every slide on its own page and sets
    // that page's size to the slide format via @page. The print dialog
    // behind ?print-pdf takes the very same route -- so the PDF is not
    // produced alongside reveal but by reveal's own page breaking.
    view: "print",
    // In the handout a slide shows everything it ends up showing.
    // Otherwise every reveal step ("appear one by one") would get its own
    // page -- right when presenting, just paper when handing out.
    pdfSeparateFragments: false,
    // Numbers the pages: in a handout that is the reference point when
    // someone points at a slide during the talk.
    slideNumber: "c/t",
    transition: "none",
    hash: false,
  };
}

// --- the document ------------------------------------------------------
// bildBasis: the URL prefix the deck's images live under. By now it only
// appears in the document where an image referenced in the .md is missing
// -- every image that does exist is already a data: URL at this point.
function html({ slug, deck, bildBasis, druck = false }) {
  const slides = bilderEinbetten(render.slidesHtml(deck, bildBasis), slug, bildBasis);

  const opt = JSON.stringify(optionen(deck, druck));

  // When printing, reveal.js measures the height of every slide in order
  // to centre it on the page. A font that has not loaded yet yields a
  // different height than the finished one, so the start is delayed: two
  // frames of grace so the browser notices which fonts it needs at all,
  // then document.fonts.
  //
  // pdfFertig is the signal to the PDF generator (pdf.js) that the page
  // breaking is done. Printing earlier would yield a single page.
  const start = druck
    ? `document.addEventListener("pdf-ready", function () { window.pdfFertig = true; });
requestAnimationFrame(function () { requestAnimationFrame(function () {
  document.fonts.ready.then(function () { Reveal.initialize(${opt}); });
}); });`
    : `Reveal.initialize(${opt});`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${render.esc(deck.titel || slug)}</title>
<style>${lies(path.join(REVEAL_DIR, "reset.css"))}</style>
<style>${lies(path.join(REVEAL_DIR, "reveal.css"))}</style>
<style>${themeCss(deck.theme)}</style>
<style>${lies(SLIDES_CSS)}</style>
</head>
<body>
<div class="reveal"><div class="slides">
${slides}
</div></div>
<script>${lies(path.join(REVEAL_DIR, "reveal.js"))}</script>
<script>${start}</script>
</body>
</html>
`;
}

module.exports = { html };
