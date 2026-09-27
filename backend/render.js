// Model -> reveal.js markup. One place for all three consumers: the live
// preview in the editor, the presentation view and the export. That way the
// preview cannot look different from the finished talk.
const { marked } = require("marked");
const layouts = require("./layouts");
const code = require("./code");
const video = require("./video");

// reveal.js' syntax for "reveal on click": a comment on a line of its own,
// directly after the element it belongs to. This is the ONE piece of raw
// HTML that survives -- and it survives as a class on that element, never
// as markup. The pattern is deliberately narrow: a class attribute holding
// nothing but letters, digits, spaces, hyphens and underscores. Anything
// else is dropped like all other raw HTML, so there is no way to smuggle a
// second attribute in through the quotes.
const FRAGMENT_RE = /^<!--\s*\.element:\s*class="([A-Za-z0-9 _-]+)"\s*-->$/;

// Placeholder for the stretch between rendering and post-processing. Control
// characters, because they cannot occur in a slide's text.
const MARKE_AUF = "\u0001";
const MARKE_ZU = "\u0002";

function marke(klassen) {
  return MARKE_AUF + klassen + MARKE_ZU;
}

// Puts the class on the element that closes right before `ende`. Walks the
// opening and closing tags backwards counting depth, so that a marker after
// a nested list still lands on the outer one.
function klasseSetzen(html, ende, klassen) {
  const vor = html.slice(0, ende).replace(/\s+$/, "");
  const zu = /<\/([a-z][a-z0-9]*)>$/i.exec(vor);
  if (!zu) return null;
  const tag = zu[1];
  const re = new RegExp("<(/?)" + tag + "\\b[^>]*>", "gi");
  const treffer = [];
  let m;
  while ((m = re.exec(vor)) !== null) treffer.push(m);
  let tiefe = 0;
  for (let i = treffer.length - 1; i >= 0; i--) {
    tiefe += treffer[i][1] ? 1 : -1;
    if (tiefe === 0) {
      const auf = treffer[i];
      // The element may already have a class of its own -- a code block
      // carries its colour scheme there. A second class attribute would be
      // ignored by every browser, so the two are merged.
      const vorhanden = /\sclass="([^"]*)"/i.exec(auf[0]);
      const ersetzt = vorhanden
        ? auf[0].replace(vorhanden[0], ` class="${vorhanden[1]} ${esc(klassen)}"`)
        : auf[0].replace(/^<([a-z][a-z0-9]*)/i, `<$1 class="${esc(klassen)}"`);
      return html.slice(0, auf.index) + ersetzt + html.slice(auf.index + auf[0].length);
    }
  }
  return null;
}

// Resolves the placeholders left by the renderer. A marker inside a list
// item is handled by the listitem renderer itself; what arrives here is the
// block-level case, the marker standing after a finished element.
function fragmenteAufloesen(html) {
  for (;;) {
    const i = html.indexOf(MARKE_AUF);
    if (i < 0) return html;
    const j = html.indexOf(MARKE_ZU, i);
    if (j < 0) return html.slice(0, i) + html.slice(i + 1);
    const klassen = html.slice(i + 1, j);
    const ohne = html.slice(0, i) + html.slice(j + 1);
    // Marker removed first, so the scan sees the element unobstructed.
    html = klasseSetzen(ohne, i, klassen) || ohne;
  }
}

// Only the Markdown part is rendered, raw HTML inside a slide is dropped.
// The reason: this markup later reaches colleagues who merely view the
// talk -- without raw HTML a smuggled-in <script> is impossible to begin
// with, and the editor does not offer HTML anyway. Anyone who does need it
// uses reveal.js directly; the .md stays readable either way.
function markdownRenderer(bildBasis) {
  const r = new marked.Renderer();
  r.html = (roh) => {
    const t = FRAGMENT_RE.exec(String(roh).trim());
    return t ? marke(t[1]) : "";
  };
  // Inside a list item the marker ends up in the item's own text, where it
  // is easier to catch here than to dig out of the finished markup.
  const punktOrig = r.listitem.bind(r);
  r.listitem = (text, ...rest) => {
    const i = text.indexOf(MARKE_AUF);
    if (i < 0) return punktOrig(text, ...rest);
    const j = text.indexOf(MARKE_ZU, i);
    const klassen = text.slice(i + 1, j);
    const ohne = text.slice(0, i) + text.slice(j + 1);
    return punktOrig(ohne, ...rest).replace(/^<li/, `<li class="${esc(klassen)}"`);
  };
  // Code blocks. The fence says the language, and after it may stand a
  // style for this one block (```java hl=github). Other renderers read the
  // first word and ignore the rest, so the block stays a plain Java block
  // anywhere else -- the style is ours alone, like data-text-color.
  r.code = (quelltext, info) => {
    const teile = String(info || "").trim().split(/\s+/).filter(Boolean);
    const sprache = teile.length && teile[0].indexOf("=") === -1 ? teile[0] : "";
    let stil = "";
    teile.forEach((t) => {
      const treffer = /^hl=([a-z0-9-]+)$/.exec(t);
      if (treffer && code.isStyle(treffer[1])) stil = treffer[1];
    });
    const preKlasse = stil ? ` class="hl-${stil}"` : "";
    const codeKlasse = sprache ? ` class="language-${esc(sprache)}"` : "";
    return `<pre${preKlasse}><code${codeKlasse}>${esc(quelltext)}\n</code></pre>\n`;
  };

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
  const html = marked.parse(String(text), { gfm: true, breaks: false, renderer: markdownRenderer(bildBasis), mangle: false, headerIds: false });
  return fragmenteAufloesen(html);
}

// --- a single slide ----------------------------------------------------
// Always the same shape: <section> carries the layout class and the reveal
// attributes, inside it a .folie-text with title and body and -- depending
// on the layout -- a .folie-bild next to it. The video layout is the one
// exception: there the heading sits beside .folie-text rather than in it,
// so that it can stay at the top while the text moves around the player. The arrangement is done
// entirely by the CSS (public/css/slides.css), not by this module. A layout
// can therefore be redesigned without touching the renderer.
function folieHtml(folie, bildBasis) {
  const layout = layouts.get(folie.layout).id;
  const attrs = [`class="layout-${layout}"`, `data-layout="${layout}"`];
  if (folie.hintergrund) attrs.push(`data-background-color="${esc(folie.hintergrund)}"`);
  // reveal.js lays the gradient over the background colour by itself
  // (backgrounds.js: style.backgroundImage). Keeping the colour underneath
  // is worth it: reveal reads only the colour to decide whether a slide is
  // light or dark, so that is what still puts the theme's text on the right
  // side of the contrast.
  if (folie.verlauf) attrs.push(`data-background-gradient="${esc(folie.verlauf)}"`);
  // An animated background is a NAME, not a value: the rules behind it are
  // in slides.css. It sits on the <section> here and is copied from there
  // onto reveal's own background element (js/folien-effekte.js), which is
  // the surface that spans the whole slide.
  if (folie.effekt) attrs.push(`data-background-effect="${esc(folie.effekt)}"`);
  // reveal knows nothing about a text colour of its own, so besides the
  // attribute -- which keeps the file readable and round-trips -- the
  // colour is set right on the slide. The themes colour every heading
  // themselves; slides.css hands those the slide's colour instead.
  if (folie.textfarbe) {
    attrs.push(`data-text-color="${esc(folie.textfarbe)}"`);
    attrs.push(`style="color: ${esc(folie.textfarbe)}"`);
  }
  // Where the text goes in relation to the player. On the <section>
  // because that is the box the arrangement happens in, and as an
  // attribute because the arrangement itself is the stylesheet's business
  // (slides.css) -- the renderer keeps putting out the same markup in the
  // same reading order, heading first, whichever side is chosen.
  if (layout === "video") {
    attrs.push(`data-textseite="${esc(video.nurSeite(folie.textseite))}"`);
  }
  // How wide the text may get where it stands beside something -- a picture
  // or a player. On a video slide it says nothing while the text is above
  // or below, but it goes on the slide all the same, so switching sides
  // needs nothing but the one other attribute.
  if (layouts.hatFeld(layout, "textbreite")) {
    attrs.push(`data-textbreite="${esc(layouts.nurBreite(folie.textbreite, layout))}"`);
  }
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
  } else if (layout === "video") {
    // The one layout whose heading sits OUTSIDE .folie-text. It names the
    // slide, not the text next to the player, so it stays at the top
    // whichever side the text is put on (data-textseite) -- and it can only
    // stay there if it is not inside the box that moves.
    //
    // And no empty .folie-text when there is no body: beside the player that
    // box is half the width, and an empty half would take the room from the
    // picture for nothing.
    const koerper = md(folie.inhalt, bildBasis);
    innen = ueberschrift + (koerper ? `<div class="folie-text">${koerper}</div>` : "");
  } else {
    innen = `<div class="folie-text">${ueberschrift}${md(folie.inhalt, bildBasis)}</div>`;
  }

  // The player. data-src rather than src: reveal.js loads it when the slide
  // comes up and takes it away again when it leaves -- which is what stops
  // the sound when the talk moves on, and what keeps ten videos in a deck
  // from all loading at the start.
  //
  // The link below it is not decoration: on paper an iframe shows nothing,
  // so that is where the address has to be readable (see slides.css).
  // data-bild is the still image, for the case where there can be no player
  // at all: YouTube refuses to configure one for a document opened from the
  // file system, which is exactly what the export is (js/folien-video.js).
  // The address is built here like the other two -- the page never composes
  // a YouTube URL of its own.
  if (layout === "video" && folie.video) {
    const adresse = esc(video.watchUrl(folie.video));
    innen += `<div class="folie-video" data-bild="${esc(video.thumbUrl(folie.video))}">` +
      `<iframe data-src="${esc(video.embedUrl(folie.video))}" title="${esc(folie.titel || "Video")}"` +
      ` allow="autoplay; accelerometer; clipboard-write; encrypted-media; picture-in-picture"` +
      ` allowfullscreen loading="lazy"></iframe>` +
      `<a class="video-adresse" href="${adresse}">${adresse}</a>` +
      `</div>`;
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
