// Model -> reveal.js markup. One place for all three consumers: the live
// preview in the editor, the presentation view and the export. That way the
// preview cannot look different from the finished talk.
const { marked } = require("marked");
const layouts = require("./layouts");
const bands = require("./bands");
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
// The number behind it is reveal.js' own data-fragment-index: fragments
// carrying the SAME one arrive on the same click. That is the only way to
// show two items of one list together -- a list cannot be cut in half by a
// container, and two lists are not one list any more.
//
// Digits and nothing else, at most three of them, so the quotes cannot be
// closed early here either. Written by the editor for EVERY fragment of a
// slide or for none of it: reveal puts the ones without a number after the
// ones with it (fragments.js, sort()), so half a slide numbered would
// reorder the other half.
const FRAGMENT_RE = /^<!--\s*\.element:\s*class="([A-Za-z0-9 _-]+)"(?:\s+data-fragment-index="(\d{1,3})")?\s*-->$/;

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

// The third: a GROUP of elements that behaves as one. A heading and the
// code block under it appearing on a single click is the case it was
// written for -- reveal.js' own fragment marker sits on one element, and
// there is no element that holds both.
//
// So the file says so with a pair of comments and the renderer puts a
// <div> around what lies between them. Not a <div> written out in the
// file: raw HTML stays dropped, here as everywhere else, which is what
// keeps a <script> impossible. The class is read with exactly the pattern
// the fragment marker uses, so nothing but letters, digits, spaces,
// hyphens and underscores fits through the quotes.
//
// It is this project's own, like <!-- .column -->, and it is written so
// that it costs nothing elsewhere: a reveal.js that has never heard of it
// drops both comments and shows the blocks straight away, which is the
// honest fallback -- the slide says the same thing, it just says it all at
// once.
const GROUP_OPEN_RE = /^<!--\s*\.group:\s*class="([A-Za-z0-9 _-]+)"\s*-->$/;
const GROUP_CLOSE_RE = /^<!--\s*\/\.group\s*-->$/;

// Placeholder for the stretch between rendering and post-processing. Control
// characters, because they cannot occur in a slide's text.
const MARK_OPEN = "\u0001";
const MARK_CLOSE = "\u0002";

// The classes and, after a space, the fragment number -- one string,
// because the marker travels through the finished markup as one piece.
function brand(classes, index) {
  return MARK_OPEN + classes + (index == null ? "" : " " + index) + MARK_CLOSE;
}

// And apart again. A number cannot be a class name, so the two need no
// separator of their own -- the last word decides. Both ends of the marker
// go through here: the one that walks the finished markup
// (resolveFragments) and the one that catches a marker inside a list item
// before the item is built.
function unbrand(payload) {
  const t = /^(.*?)(?:\s+(\d{1,3}))?$/.exec(payload);
  return { classes: t[1], index: t[2] };
}

// Puts the class on the element that closes right before `ende`. Walks the
// opening and closing tags backwards counting depth, so that a marker after
// a nested list quiet lands on the outer one.
function setClass(html, ende, classes, index) {
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
      const nummer = index == null ? "" : ` data-fragment-index="${esc(index)}"`;
      const replaced = existing
        ? auf[0].replace(existing[0], ` class="${existing[1]} ${esc(classes)}"${nummer}`)
        : auf[0].replace(/^<([a-z][a-z0-9]*)/i, `<$1 class="${esc(classes)}"${nummer}`);
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
    const { classes, index } = unbrand(html.slice(i + 1, j));
    const without = html.slice(0, i) + html.slice(j + 1);
    // Marker removed first, so the scan sees the element unobstructed.
    html = setClass(without, i, classes, index) || without;
  }
}

// Only the Markdown part is rendered, raw HTML inside a slide is dropped.
// The reason: this markup later reaches colleagues who merely view the
// talk -- without raw HTML a smuggled-in <script> is impossible to begin
// with, and the editor does not offer HTML anyway. Anyone who does need it
// uses reveal.js directly; the .md stays readable either way.
function markdownRenderer(imageBase, open) {
  const r = new marked.Renderer();
  // How many colour spans are open. marked hands the opening tag and the
  // closing one over as two separate pieces, so the pair has to be counted
  // here -- otherwise a lone </span> in a file would close an element this
  // renderer never opened and tear the markup around it.
  let colored = 0;
  r.html = (raw) => {
    const text = String(raw).trim();
    const t = FRAGMENT_RE.exec(text);
    if (t) return brand(t[1], t[2]);
    const color = COLOR_OPEN_RE.exec(text);
    if (color) {
      colored++;
      return `<span style="color:${color[1]}">`;
    }
    if (COLOR_CLOSE_RE.test(text) && colored > 0) {
      colored--;
      return "</span>";
    }
    const group = GROUP_OPEN_RE.exec(text);
    if (group) {
      open.groups++;
      return `<div class="${esc(group[1])}">`;
    }
    // Counted like the colour spans above, and for the same reason: a
    // closing line without an opening one would close an element this
    // renderer never opened and tear the markup around it.
    if (GROUP_CLOSE_RE.test(text) && open.groups > 0) {
      open.groups--;
      return "</div>";
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
    const { classes, index } = unbrand(text.slice(i + 1, j));
    const without = text.slice(0, i) + text.slice(j + 1);
    const nummer = index == null ? "" : ` data-fragment-index="${esc(index)}"`;
    return itemOrig(without, ...rest).replace(/^<li/, `<li class="${esc(classes)}"${nummer}`);
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
  // A group that is opened and never closed is a typo, and the slide is
  // worth more than the complaint: the missing ends are added here so the
  // markup leaves this function whole either way. The source dialog says
  // what happened (check.js).
  const open = { groups: 0 };
  const html = marked.parse(String(text), { gfm: true, breaks: false, renderer: markdownRenderer(imageBase, open), mangle: false, headerIds: false });
  return resolveFragments(html + "</div>".repeat(open.groups));
}

// Dark ground or light one? The themes answer it -- each carries a rule
// for a slide whose colour runs against the theme's own, white type on a
// dark slide in a light theme and the other way round -- but somebody has
// to say which it is. reveal.js does it while the talk runs
// (backgrounds.js), and this is the same sum with the same weighting
// (util.js, colorBrightness): the eye's, not the average of the three.
//
// Only a colour the slide states itself is judged. Without one the theme's
// own ground is underneath, and the theme has already put its type on the
// right side of that.
const DARK_BELOW = 128;

function contrastClass(color) {
  const hit = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!hit) return "";
  const h = hit[1].length === 3 ? hit[1].replace(/./g, (c) => c + c) : hit[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < DARK_BELOW ? "has-dark-background" : "has-light-background";
}

// --- The bands ---------------------------------------------------------
// The two strips that are the same on every slide: a header along the top
// and a footer along the bottom (bands.js). They are drawn INTO every
// <section> rather than once over the deck, and that is the whole point of
// them working everywhere: the editor's preview redraws single slides, a
// card in the slide list is one slide on a page of its own, and reveal.js'
// print view puts every slide on a page of its own as well. A strip laid
// once over the presentation would be in none of those three.
//
// What it costs is that the logo's address appears once per slide, and in
// the standalone document that address is the picture itself
// (document.js) -- the same price the same picture on five slides has
// always paid there.
//
// Three cells, left, middle and right, and the two pieces placed in them
// (slides.css). Both in one cell is a case worth having: a logo with the
// name beside it is a letterhead, and it is what one reaches for first.
//
// The two flags the band carries as a whole are written onto the strip and
// nowhere else, because both of them are the stylesheet's business: whether
// there is a hairline between the strip and the slide, and whether the
// three cells spread across the slide or are pulled together into the
// middle of it. The markup is the SAME either way -- always three cells,
// always in reading order -- so the places keep saying what stands left of
// what even once there are no thirds left to stand in.
function bandHtml(band, name, imageBase) {
  if (bands.isEmpty(band)) return "";
  const cells = { left: "", center: "", right: "" };
  // The logo first, so a logo and a text sharing a cell read as a mark
  // with words beside it rather than the other way round.
  if (band.logo) {
    cells[band.logoPlace] += `<img class="band-logo" src="${esc(imageUrl(band.logo, imageBase))}" alt="">`;
  }
  if (band.text) cells[band.textPlace] += `<span class="band-text">${esc(band.text)}</span>`;
  // Every cell is written, empty ones included: they are what holds the
  // three columns apart, so a text in the middle stays in the middle
  // whatever stands beside it.
  const inner = ["left", "center", "right"]
    .map((place) => `<span class="band-cell" data-place="${place}">${cells[place]}</span>`)
    .join("");
  const flags = (band.center ? ' data-center=""' : "")
    + (band.noRule ? ' data-rule="none"' : "")
    // Read by the stylesheet AND by the one script that belongs to the
    // bands (js/slide-bands.js), which is what takes the strip out of
    // sight while the slide moves under it.
    + (band.still ? ' data-still=""' : "");
  return `<div class="slide-band" data-band="${name}"${flags}>${inner}</div>`;
}

// Which of the two bands this slide really shows: one the deck has
// something in, and that the slide has not sent away (deck.js, noHeader /
// noFooter).
function bandsOn(slide, deckBands) {
  const on = deckBands || {};
  return bands.BANDS.filter((name) =>
    !bands.isEmpty(on[name]) && !slide[bands.HIDDEN[name].field]);
}

// --- a single slide ----------------------------------------------------
// Always the same shape: <section> carries the layout class and the reveal
// attributes, inside it a .slide-text with title and body and -- depending
// on the layout -- a .slide-image next to it. The video layout is the one
// exception: there the heading sits beside .slide-text rather than in it,
// so that it can stay at the top while the text moves around the player. The arrangement is done
// entirely by the CSS (public/css/slides.css), not by this module. A layout
// can therefore be redesigned without touching the renderer.
// deckBands: the deck's two bands ({ header, footer }, see bands.js). They
// belong to the deck and not to the slide, so they are handed in rather
// than read off it -- which is what lets the editor's preview draw a
// single slide and still show the strips around it.
function slideHtml(slide, imageBase, deckBands) {
  const layout = layouts.get(slide.layout).id;
  // Whether the slide's own colour runs against the theme's, so the theme
  // can put its type on the right side of it. reveal.js marks the slide
  // for that while the talk is running (backgrounds.js); the thumbnails in
  // the editor's slide list show a slide standing still, without reveal.js,
  // so the mark is made here as well. Where reveal DOES run it puts the
  // same class on the same slides, so nothing changes there.
  const classes = [`layout-${layout}`];
  const contrast = contrastClass(slide.background);
  if (contrast) classes.push(contrast);
  const attrs = [`class="${classes.join(" ")}"`, `data-layout="${layout}"`];
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
  // Where the text box stands on a full-bleed picture. On the <section>
  // and as an attribute for the same reason as the side above: the
  // arrangement is the stylesheet's business (slides.css), the renderer
  // keeps putting out the same markup wherever the box ends up.
  if (layouts.hasField(layout, "textPlace")) {
    attrs.push(`data-text-place="${esc(layouts.onlyPlace(slide.textPlace))}"`);
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

  // Which bands this slide carries, named on the <section> so the
  // stylesheet can keep the room they need free (slides.css). A slide
  // without any gets no attribute, which is what leaves every deck written
  // before the bands existed untouched down to the markup.
  const bandsHere = bandsOn(slide, deckBands);
  if (bandsHere.length) attrs.push(`data-bands="${bandsHere.join(" ")}"`);

  // A full-bleed image is a slide background in reveal.js -- that way
  // reveal handles the scaling and the transition.
  if (layout === "image-full" && slide.image) {
    attrs.push(`data-background-image="${esc(imageUrl(slide.image, imageBase))}"`);
    attrs.push('data-background-size="cover"');
  }

  // An empty heading is still a heading: it holds the space one takes, and
  // a slide that asked for it (deck.js) gets the element even with nothing
  // in it. Only a slide with no heading at all gets none.
  const level = layout === "title" || layout === "section" ? 1 : 2;
  // The class is the hook the heading's alignment hangs on (slides.css). It
  // has to be the element itself and not "the first h2 in the slide": a
  // hand-written body may carry a second heading of the same level, and
  // that one is part of the text, not the slide's name.
  const heading = slide.title === null || slide.title === undefined
    ? ""
    : `<h${level} class="slide-title">${esc(slide.title)}</h${level}>`;

  // The whole text box on a click, rather than one block of it at a time.
  // A block says so for itself, with a class of its own out of the body
  // (the .element comment above); the box around it cannot -- it is built
  // here and the file has no line that points at it. So the slide says it,
  // and this is where that is answered.
  //
  // reveal.js asks no more of it than the class: any element carrying
  // `fragment` is a step, and a box is as good a step as a paragraph.
  // What it buys over marking the blocks inside is the box ITSELF -- on a
  // full-bleed image that box has a dark ground of its own (slides.css),
  // and marking only its contents leaves an empty dark rectangle standing
  // on the picture until the click comes.
  const textBox = `slide-text${slide.textFragment ? " fragment" : ""}`;

  let inner;
  if (layout === "quote") {
    inner =
      `<blockquote>${md(slide.content, imageBase) || "<p></p>"}</blockquote>` +
      (slide.source ? `<cite>${esc(slide.source)}</cite>` : "");
    inner = `<div class="${textBox}">${heading}${inner}</div>`;
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
    inner = heading + (body ? `<div class="${textBox}">${body}</div>` : "");
  } else if (split) {
    // One box per column, each holding its own text (layouts.js splits the
    // body). The heading stays a single element and runs across all of them
    // -- that is the grid's job, not the renderer's, so the markup keeps
    // the same reading order it has everywhere else: heading, then text.
    //
    // A column with nothing in it still gets its box. It holds the column
    // open, so two texts beside an empty middle column stay where the
    // writer put them instead of sliding over.
    inner = `<div class="${textBox}">${heading}` +
      layouts.splitColumns(slide.content, layouts.columnCount(layout))
        .map((part) => `<div class="slide-column">${md(part, imageBase)}</div>`)
        .join("") +
      `</div>`;
  } else {
    inner = `<div class="${textBox}">${heading}${md(slide.content, imageBase)}</div>`;
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

  if (layouts.hasField(layout, "image") && layout !== "image-full" && slide.image) {
    const image = `<div class="slide-image"><img src="${esc(imageUrl(slide.image, imageBase))}" alt=""></div>`;
    // Order in the markup = reading order; which side it appears on is
    // decided by the CSS grid columns.
    inner = layout === "image-left" ? image + inner : inner + image;
  }

  // The strips go last in the markup and are lifted to the slide's edges
  // by the stylesheet. Last because they are not what the slide says: a
  // screen reader reaches the heading and the text first and hears the
  // company name afterwards, which is the order one would read them in.
  const strips = bandsHere
    .map((name) => bandHtml(deckBands[name], name, imageBase))
    .join("");

  return `<section ${attrs.join(" ")}>\n${inner}${strips}\n</section>`;
}

// --- the ground a slide stands on --------------------------------------
// reveal.js builds a background element of its own for every slide and
// puts the data-background-* attributes into effect on it (backgrounds.js);
// the animated effects hang on that same element (js/slide-effects.js).
// The thumbnails in the editor's slide list show a slide WITHOUT reveal.js
// -- one still picture per card, so that a list of thirteen slides does not
// start thirteen presentations -- so the element they need is built here,
// out of the same model.
//
// Only what a still picture can show: the colour, the gradient, a
// full-bleed image, and the ground an effect brings with it. The effect's
// moving layers stay away. A dozen animations in a sidebar would cost more
// than they say, and at that size what tells one slide from another is its
// ground, not its motion.
function backgroundHtml(slide, imageBase) {
  const layout = layouts.get(slide.layout).id;
  const styles = [];
  // Colour first, gradient over it, a full-bleed picture over both -- the
  // order reveal lays them in.
  if (slide.background) styles.push(`background-color: ${slide.background}`);
  if (slide.gradient) styles.push(`background-image: ${slide.gradient}`);
  if (layout === "image-full" && slide.image) {
    // Single quotes inside: the whole list becomes one attribute below.
    styles.push(`background-image: url('${imageUrl(slide.image, imageBase)}')`);
    styles.push("background-size: cover");
    styles.push("background-position: 50% 50%");
  }
  const effect = slide.effect
    ? ` data-background-effect="${esc(slide.effect)}"`
    : "";
  return `<div class="backgrounds"><div class="slide-background present"${effect}` +
    (styles.length ? ` style="${esc(styles.join("; "))}"` : "") + ">" +
    (slide.effect ? `<div class="slide-effect"></div>` : "") +
    "</div></div>";
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
  const deckBands = { header: deck.header, footer: deck.footer };
  return slideGroups(deck.slides)
    .map((group) =>
      group.length === 1
        ? slideHtml(group[0], imageBase, deckBands)
        : `<section>\n${group.map((f) => slideHtml(f, imageBase, deckBands)).join("\n")}\n</section>`
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

module.exports = { slidesHtml, slideHtml, backgroundHtml, indices, esc, imageUrl };
