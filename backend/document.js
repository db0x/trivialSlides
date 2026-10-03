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
const code = require("./code");
const storage = require("./storage");

const REVEAL_DIR = path.join(__dirname, "node_modules", "reveal.js", "dist");
const SLIDES_CSS = path.join(__dirname, "public", "css", "slides.css");
const EFFECTS_JS = path.join(__dirname, "public", "js", "slide-effects.js");
const VIDEO_JS = path.join(__dirname, "public", "js", "slide-video.js");
const BANDS_JS = path.join(__dirname, "public", "js", "slide-bands.js");
const FIT_JS = path.join(__dirname, "public", "js", "slide-fit.js");
const HIGHLIGHT_JS = path.join(REVEAL_DIR, "..", "plugin", "highlight", "highlight.js");
const HIGHLIGHT_CSS = path.join(REVEAL_DIR, "..", "plugin", "highlight", "monokai.css");

const IMAGE_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

function read(p) {
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
function embedFonts(css, verzeichnis) {
  return css.replace(/@font-face\s*\{([^}]*)\}/g, (whole, rule) => {
    const hit = /url\(\s*['"]?([^'")?]+\.woff)['"]?/.exec(rule);
    if (!hit) return whole;
    const file = path.resolve(verzeichnis, hit[1]);
    if (!file.startsWith(REVEAL_DIR + path.sep) || !fs.existsSync(file)) return whole;
    // Replace both src declarations of the rule (first eot on its own,
    // then the list) with exactly one -- otherwise a reference would
    // survive pointing at a file that does not exist next to the
    // document.
    const withoutSrc = rule.replace(/src\s*:[^;]*;?/g, "").trim();
    const data = fs.readFileSync(file).toString("base64");
    return `@font-face{${withoutSrc}src:url(data:font/woff;base64,${data}) format("woff");}`;
  });
}

function themeCss(theme) {
  const file = path.join(REVEAL_DIR, "theme", `${theme}.css`);
  const css = read(file).replace(/@import\s+url\(\s*['"]?(\.\/[^'")\s]+)['"]?\s*\)\s*;/g, (whole, rel) => {
    const target = path.resolve(path.dirname(file), rel);
    if (!target.startsWith(REVEAL_DIR + path.sep) || !fs.existsSync(target)) return "";
    return embedFonts(read(target), path.dirname(target));
  });

  // Whatever @import is left by now fetches a font from the network. Those
  // lines have to move to the front: an @import only counts as long as no
  // other rule precedes it -- and the embedded @font-face rules now do.
  // Without this step beige, league, moon and solarized would lose their
  // base typeface.
  const remote = [];
  const rest = css.replace(/@import[^;]+;/g, (whole) => { remote.push(whole.trim()); return ""; });
  return remote.length ? remote.join("\n") + "\n" + rest : rest;
}

// --- Images ------------------------------------------------------------
// The renderer receives an image "base" that is already a finished URL; a
// data: URL cannot be slotted in there because it differs per image. Hence
// a separate pass over the finished markup instead of a special case
// inside the renderer.
function embedImages(slides, slug, imageBase) {
  for (const name of storage.images(slug)) {
    const p = storage.imagePath(slug, name);
    if (!p || !fs.existsSync(p)) continue;
    const kind = IMAGE_TYPES[path.extname(name).toLowerCase()];
    if (!kind) continue;
    const dataUrl = `data:${kind};base64,${fs.readFileSync(p).toString("base64")}`;
    slides = slides.split(imageBase + encodeURIComponent(name)).join(dataUrl);
  }
  return slides;
}

// --- reveal.js options -------------------------------------------------
function options(deck, print) {
  if (!print) return { hash: true, slideNumber: "c/t", transition: deck.transition };
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
// imageBase: the URL prefix the deck's images live under. By now it only
// appears in the document where an image referenced in the .md is missing
// -- every image that does exist is already a data: URL at this point.
function html({ slug, deck, imageBase, print = false }) {
  const slides = embedImages(render.slidesHtml(deck, imageBase), slug, imageBase);

  const opt = JSON.stringify(options(deck, print));

  // The syntax highlighter is half a megabyte -- as much as reveal.js
  // itself. A deck without a single code block would carry it for nothing,
  // so it only travels when there is something to colour. Its absence
  // changes nothing else: the code then shows in the theme's own type,
  // which is exactly what it looked like before there was a highlighter.
  const hasCode = /<pre[^>]*><code/.test(slides);

  // Only the styles this deck actually asks for travel with it.
  const stylesCss = code.cssFor(code.usedIn(slides));

  // When printing, reveal.js measures the height of every slide in order
  // to centre it on the page. A font that has not loaded yet yields a
  // different height than the finished one, so the start is delayed: two
  // frames of grace so the browser notices which fonts it needs at all,
  // then document.fonts.
  //
  // pdfReady is the signal to the PDF generator (pdf.js) that the page
  // breaking is done. Printing earlier would yield a single page.
  // The plugin cannot go into the options as JSON -- it is a global, not a
  // value -- so it is added to them in the document instead.
  const settings = hasCode
    ? `Object.assign(${opt}, { plugins: [RevealHighlight] })`
    : opt;

  const start = print
    ? `document.addEventListener("pdf-ready", function () { window.pdfReady = true; });
requestAnimationFrame(function () { requestAnimationFrame(function () {
  document.fonts.ready.then(function () { Reveal.initialize(${settings}); });
}); });`
    : `Reveal.initialize(${settings});`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${render.esc(deck.title || slug)}</title>
<style>${read(path.join(REVEAL_DIR, "reset.css"))}</style>
<style>${read(path.join(REVEAL_DIR, "reveal.css"))}</style>
<style>${themeCss(deck.theme)}</style>
${hasCode ? `<style>${read(HIGHLIGHT_CSS)}</style>` : ""}
${stylesCss ? `<style>${stylesCss}</style>` : ""}
<style>${read(SLIDES_CSS)}</style>
</head>
<body>
<div class="reveal"><div class="slides">
${slides}
</div></div>
<script>${read(path.join(REVEAL_DIR, "reveal.js"))}</script>
${hasCode ? `<script>${read(HIGHLIGHT_JS)}</script>` : ""}
<!-- Animated backgrounds: the same file the served pages use, inlined like
     everything else -- otherwise the effect would be the one thing in the
     document that needs a second file next to it. -->
<script>${read(EFFECTS_JS)}</script>
<script>${read(VIDEO_JS)}</script>
<!-- A header or a footer that is not to travel with the slide. It does
     nothing at all while printing, which is the other thing this document
     is used for (js/slide-bands.js). -->
<script>${read(BANDS_JS)}</script>
<!-- Steps the type down on a slide holding more than fits, the same file
     and therefore the same result as in the editor and on the wall. -->
<script>${read(FIT_JS)}</script>
<script>${start}</script>
</body>
</html>
`;
}

module.exports = { html };
