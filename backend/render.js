// Model -> reveal.js markup. One place for all three consumers: the live
// preview in the editor, the presentation view and the export. That way the
// preview cannot look different from the finished talk.
const { marked } = require("marked");
const layouts = require("./layouts");
const code = require("./code");
const video = require("./video");
const qr = require("./qr");

// reveal.js' syntax for "reveal on click": a comment on a line of its own,
// directly after the element it belongs to. This is the ONE piece of raw
// HTML that survives -- and it survives as a class on that element, never
// as markup. The pattern is deliberately narrow: a class attribute holding
// nothing but letters, digits, spaces, hyphens and underscores. Anything
// else is dropped like all other raw HTML, so there is no way to smuggle a
// second attribute in through the quotes.
const FRAGMENT_RE = /^<!--\s*\.element:\s*class="([A-Za-z0-9 _-]+)"\s*-->$/;

// The second, and only other, thing let through: a run of text in a colour
// of its own. It is the one piece of formatting that has no Markdown of its
// own, so the file says it in reveal.js' own currency -- inline HTML, which
// any other renderer shows the same way.
//
// Strict for the same reason the fragment line above is strict: nothing but
// six or eight hex digits fits through, so the quotes cannot be closed
// early and a second attribute cannot follow. Everything that is not
// exactly this shape stays dropped, <script> included.
//
// The browser end of the same pair is FARBE_AUF in js/editor/richtext.js;
// what the one writes the other has to read back.
const COLOR_OPEN_RE = /^<span\s+style="color:\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*;?"\s*>$/;
const COLOR_CLOSE_RE = /^<\/span>$/;

// Placeholder for the stretch between rendering and post-processing. Control
// characters, because they cannot occur in a slide's text.
const MARK_OPEN = "\u0001";
const MARK_CLOSE = "\u0002";

function brand(classes) {
  return MARK_OPEN + classes + MARK_CLOSE;
}

// Puts the class on the element that closes right before `ende`. Walks the
// opening and closing tags backwards counting depth, so that a marker after
// a nested list quiet lands on the outer one.
function setClass(html, ende, classes) {
  const vor = html.slice(0, ende).replace(/\s+$/, "");
  const zu = /<\/([a-z][a-z0-9]*)>$/i.exec(vor);
  if (!zu) return null;
  const tag = zu[1];
  const re = new RegExp("<(/?)" + tag + "\\b[^>]*>", "gi");
  const hit = [];
  let m;
  while ((m = re.exec(vor)) !== null) hit.push(m);
  let depth = 0;
  for (let i = hit.length - 1; i >= 0; i--) {
    depth += hit[i][1] ? 1 : -1;
    if (depth === 0) {
      const auf = hit[i];
      // The element may already have a class of its own -- a code block
      // carries its colour scheme there. A second class attribute would be
      // ignored by every browser, so the two are merged.
      const existing = /\sclass="([^"]*)"/i.exec(auf[0]);
      const replaced = existing
        ? auf[0].replace(existing[0], ` class="${existing[1]} ${esc(classes)}"`)
        : auf[0].replace(/^<([a-z][a-z0-9]*)/i, `<$1 class="${esc(classes)}"`);
      return html.slice(0, auf.index) + replaced + html.slice(auf.index + auf[0].length);
    }
  }
  return null;
}

// Resolves the placeholders left by the renderer. A marker inside a list
// item is handled by the listitem renderer itself; what arrives here is the
// block-level case, the marker standing after a finished element.
function resolveFragments(html) {
  for (;;) {
    const i = html.indexOf(MARK_OPEN);
    if (i < 0) return html;
    const j = html.indexOf(MARK_CLOSE, i);
    if (j < 0) return html.slice(0, i) + html.slice(i + 1);
    const classes = html.slice(i + 1, j);
    const without = html.slice(0, i) + html.slice(j + 1);
    // Marker removed first, so the scan sees the element unobstructed.
    html = setClass(without, i, classes) || without;
  }
}

// Only the Markdown part is rendered, raw HTML inside a slide is dropped.
// The reason: this markup later reaches colleagues who merely view the
// talk -- without raw HTML a smuggled-in <script> is impossible to begin
// with, and the editor does not offer HTML anyway. Anyone who does need it
// uses reveal.js directly; the .md stays readable either way.
function markdownRenderer(imageBase) {
  const r = new marked.Renderer();
  // How many colour spans are open. marked hands the opening tag and the
  // closing one over as two separate pieces, so the pair has to be counted
  // here -- otherwise a lone </span> in a file would close an element this
  // renderer never opened and tear the markup around it.
  let colored = 0;
  r.html = (raw) => {
    const text = String(raw).trim();
    const t = FRAGMENT_RE.exec(text);
    if (t) return brand(t[1]);
    const color = COLOR_OPEN_RE.exec(text);
    if (color) {
      colored++;
      return `<span style="color:${color[1]}">`;
    }
    if (COLOR_CLOSE_RE.test(text) && colored > 0) {
      colored--;
      return "</span>";
    }
    return "";
  };
  // Inside a list item the marker ends up in the item's own text, where it
  // is easier to catch here than to dig out of the finished markup.
  const itemOrig = r.listitem.bind(r);
  r.listitem = (text, ...rest) => {
    const i = text.indexOf(MARK_OPEN);
    if (i < 0) return itemOrig(text, ...rest);
    const j = text.indexOf(MARK_CLOSE, i);
    const classes = text.slice(i + 1, j);
    const without = text.slice(0, i) + text.slice(j + 1);
    return itemOrig(without, ...rest).replace(/^<li/, `<li class="${esc(classes)}"`);
  };
  // Code blocks. The fence says the language, and after it may state a
  // style for this one block (```java hl=github). Other renderers read the
  // first word and ignore the rest, so the block stays a plain Java block
  // anywhere else -- the style is ours alone, like data-text-color.
  r.code = (sourceText, info) => {
    const parts = String(info || "").trim().split(/\s+/).filter(Boolean);
    const language = parts.length && parts[0].indexOf("=") === -1 ? parts[0] : "";
    let style = "";
    parts.forEach((t) => {
      const hit = /^hl=([a-z0-9-]+)$/.exec(t);
      if (hit && code.isStyle(hit[1])) style = hit[1];
    });
    const preClass = style ? ` class="hl-${style}"` : "";
    const codeClass = language ? ` class="language-${esc(language)}"` : "";
    return `<pre${preClass}><code${codeClass}>${esc(sourceText)}\n</code></pre>\n`;
  };

  const imageOrig = r.image.bind(r);
  // Images in body text: relative paths point at the deck's image folder,
  // absolute ones (http(s)) are left alone.
  r.image = (href, title, text) => imageOrig(imageUrl(href, imageBase), title, text);
  return r;
}

function imageUrl(name, base) {
  const s = String(name || "");
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:")) return s;
  return base + encodeURIComponent(s.replace(/^.*\//, ""));
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function md(text, imageBase) {
  if (!String(text || "").trim()) return "";
  const html = marked.parse(String(text), { gfm: true, breaks: false, renderer: markdownRenderer(imageBase), mangle: false, headerIds: false });
  return resolveFragments(html);
}

// --- a single slide ----------------------------------------------------
// Always the same shape: <section> carries the layout class and the reveal
// attributes, inside it a .slide-text with title and body and -- depending
// on the layout -- a .slide-image next to it. The video layout is the one
// exception: there the heading sits beside .slide-text rather than in it,
// so that it can stay at the top while the text moves around the player. The arrangement is done
// entirely by the CSS (public/css/slides.css), not by this module. A layout
// can therefore be redesigned without touching the renderer.
function slideHtml(slide, imageBase) {
  const layout = layouts.get(slide.layout).id;
  const attrs = [`class="layout-${layout}"`, `data-layout="${layout}"`];
  if (slide.background) attrs.push(`data-background-color="${esc(slide.background)}"`);
  // reveal.js lays the gradient over the background colour by itself
  // (backgrounds.js: style.backgroundImage). Keeping the colour underneath
  // is worth it: reveal reads only the colour to decide whether a slide is
  // light or dark, so that is what quiet puts the theme's text on the right
  // side of the contrast.
  if (slide.gradient) attrs.push(`data-background-gradient="${esc(slide.gradient)}"`);
  // An animated background is a NAME, not a value: the rules behind it are
  // in slides.css. It sits on the <section> here and is copied from there
  // onto reveal's own background element (js/slide-effects.js), which is
  // the surface that spans the whole slide.
  if (slide.effect) attrs.push(`data-background-effect="${esc(slide.effect)}"`);
  // reveal knows nothing about a text colour of its own, so besides the
  // attribute -- which keeps the file readable and round-trips -- the
  // colour is set right on the slide. The themes colour every heading
  // themselves; slides.css hands those the slide's colour instead.
  if (slide.textColor) {
    attrs.push(`data-text-color="${esc(slide.textColor)}"`);
    attrs.push(`style="color: ${esc(slide.textColor)}"`);
  }
  // Where the text goes in relation to the player. On the <section>
  // because that is the box the arrangement happens in, and as an
  // attribute because the arrangement itself is the stylesheet's business
  // (slides.css) -- the renderer keeps putting out the same markup in the
  // same reading order, heading first, whichever side is chosen.
  if (layouts.hasField(layout, "textSide")) {
    attrs.push(`data-textseite="${esc(layouts.onlySide(slide.textSide, layout))}"`);
  }
  // How wide the text may get where it stands beside something -- a picture
  // or a player. On a video slide it says nothing while the text is above
  // or below, but it goes on the slide all the same, so switching sides
  // needs nothing but the one other attribute.
  if (layouts.hasField(layout, "textWidth")) {
    attrs.push(`data-textbreite="${esc(layouts.onlyWidth(slide.textWidth, layout))}"`);
  }
  // Columns filled one by one rather than by the browser. On the <section>
  // because the arrangement -- grid instead of column-count, and the text
  // at the top of the slide -- is the stylesheet's business (slides.css),
  // as with every other layout decision here.
  // Where the heading stands, if the slide says so at all. Without the
  // attribute the layout decides, which it does through its own text-align
  // (slides.css) -- so there is nothing to write here for it.
  if (slide.titleAlign) attrs.push(`data-title-align="${esc(layouts.onlyTitleAlign(slide.titleAlign))}"`);

  const split = layouts.hasField(layout, "columnMode")
    && slide.columnMode === layouts.COLUMN_SPLIT;
  if (split) attrs.push(`data-columns="${layouts.COLUMN_SPLIT}"`);

  // A full-bleed image is a slide background in reveal.js -- that way
  // reveal handles the scaling and the transition.
  if (layout === "bild-voll" && slide.image) {
    attrs.push(`data-background-image="${esc(imageUrl(slide.image, imageBase))}"`);
    attrs.push('data-background-size="cover"');
  }

  // An empty heading is still a heading: it holds the space one takes, and
  // a slide that asked for it (deck.js) gets the element even with nothing
  // in it. Only a slide with no heading at all gets none.
  const level = layout === "titel" || layout === "abschnitt" ? 1 : 2;
  // The class is the hook the heading's alignment hangs on (slides.css). It
  // has to be the element itself and not "the first h2 in the slide": a
  // hand-written body may carry a second heading of the same level, and
  // that one is part of the text, not the slide's name.
  const heading = slide.title === null || slide.title === undefined
    ? ""
    : `<h${level} class="slide-title">${esc(slide.title)}</h${level}>`;

  let inner;
  if (layout === "zitat") {
    inner =
      `<blockquote>${md(slide.content, imageBase) || "<p></p>"}</blockquote>` +
      (slide.source ? `<cite>${esc(slide.source)}</cite>` : "");
    inner = `<div class="slide-text">${heading}${inner}</div>`;
  } else if (layouts.hasField(layout, "textSide")) {
    // The layouts whose heading sits OUTSIDE .slide-text -- video and qr.
    // It names the slide, not the text next to the player or the code, so
    // it stays at the top whichever side the text is put on
    // (data-textseite), and it can only stay there if it is not inside the
    // box that moves.
    //
    // And no empty .slide-text when there is no body: beside the picture
    // that box is a share of the width, and an empty share would take the
    // room from the picture for nothing.
    const body = md(slide.content, imageBase);
    inner = heading + (body ? `<div class="slide-text">${body}</div>` : "");
  } else if (split) {
    // One box per column, each holding its own text (layouts.js splits the
    // body). The heading stays a single element and runs across all of them
    // -- that is the grid's job, not the renderer's, so the markup keeps
    // the same reading order it has everywhere else: heading, then text.
    //
    // A column with nothing in it still gets its box. It holds the column
    // open, so two texts beside an empty middle column stay where the
    // writer put them instead of sliding over.
    inner = `<div class="slide-text">${heading}` +
      layouts.splitColumns(slide.content, layouts.columnCount(layout))
        .map((part) => `<div class="slide-column">${md(part, imageBase)}</div>`)
        .join("") +
      `</div>`;
  } else {
    inner = `<div class="slide-text">${heading}${md(slide.content, imageBase)}</div>`;
  }

  // The player. data-src rather than src: reveal.js loads it when the slide
  // comes up and takes it away again when it leaves -- which is what stops
  // the sound when the talk moves on, and what keeps ten videos in a deck
  // from all loading at the start.
  //
  // The link below it is not decoration: on paper an iframe shows nothing,
  // so that is where the address has to be readable (see slides.css).
  // data-image is the quiet image, for the case where there can be no player
  // at all: YouTube refuses to configure one for a document opened from the
  // file system, which is exactly what the export is (js/slide-video.js).
  // The address is built here like the other two -- the page never composes
  // a YouTube URL of its own.
  if (layout === "video" && slide.video) {
    const address = esc(video.watchUrl(slide.video));
    inner += `<div class="slide-video slide-beside" data-image="${esc(video.thumbUrl(slide.video))}">` +
      `<iframe data-src="${esc(video.embedUrl(slide.video))}" title="${esc(slide.title || "Video")}"` +
      ` allow="autoplay; accelerometer; clipboard-write; encrypted-media; picture-in-picture"` +
      ` allowfullscreen loading="lazy"></iframe>` +
      `<a class="video-address" href="${address}">${address}</a>` +
      `</div>`;
  }

  // The code itself, drawn on the server and carried as markup (qr.js) --
  // no file beside the slide, nothing fetched when it is shown, so it works
  // in the exported file on a train.
  //
  // The address below it is not decoration either: not everyone in the room
  // has a phone in their hand, and a code says nothing to anybody reading
  // the handout on paper.
  if (layout === "qr" && slide.url) {
    // The writing under the code takes the slide's own colour unless it was
    // given one (slides.css does the inheriting), so only a chosen one is
    // written onto the element.
    const schrift = qr.onlyTextColor(slide.qrTextColor);
    inner += `<div class="slide-qr slide-beside">` +
      qr.svg(slide.url, slide.qrColor, slide.qrBackground) +
      `<a class="qr-address"${schrift ? ` style="color: ${esc(schrift)}"` : ""}` +
      ` href="${esc(slide.url)}">${esc(slide.url)}</a>` +
      `</div>`;
  }

  if (layouts.hasField(layout, "image") && layout !== "bild-voll" && slide.image) {
    const image = `<div class="slide-image"><img src="${esc(imageUrl(slide.image, imageBase))}" alt=""></div>`;
    // Order in the markup = reading order; which side it appears on is
    // decided by the CSS grid columns.
    inner = layout === "bild-links" ? image + inner : inner + image;
  }

  return `<section ${attrs.join(" ")}>\n${inner}\n</section>`;
}

// --- all slides --------------------------------------------------------
// Vertical slides are grouped into a nested <section> in reveal.js
// (a "stack").
function slideGroups(slides) {
  const groups = [];
  (slides || []).forEach((f, i) => {
    if (i > 0 && f.vertical && groups.length) groups[groups.length - 1].push(f);
    else groups.push([f]);
  });
  return groups;
}

// imageBase: URL prefix the image file name is appended to. A route in the
// editor and the presentation, the "images/" subfolder in the export.
function slidesHtml(deck, imageBase) {
  return slideGroups(deck.slides)
    .map((group) =>
      group.length === 1
        ? slideHtml(group[0], imageBase)
        : `<section>\n${group.map((f) => slideHtml(f, imageBase)).join("\n")}\n</section>`
    )
    .join("\n");
}

// Index of each slide in the flat list -> [horizontal, vertical] for
// Reveal.slide(). The preview uses it to jump to the slide being edited.
function indices(slides) {
  const out = [];
  let h = -1;
  let v = 0;
  (slides || []).forEach((f, i) => {
    if (i > 0 && f.vertical) v++;
    else { h++; v = 0; }
    out.push([h, v]);
  });
  return out;
}

module.exports = { slidesHtml, slideHtml, indices, esc, imageUrl };
