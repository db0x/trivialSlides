// Every route of the editor. A single router, so that fitting it into
// Relay amounts to one app.use(...) line.
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const deck = require("../deck");
const document = require("../document");
const pdf = require("../pdf");
const layouts = require("../layouts");
const render = require("../render");
const gradients = require("../gradients");
const effects = require("../effects");
const code = require("../code");
const source = require("../source");
const check = require("../check");
const emoji = require("../emoji");
const video = require("../video");
const storage = require("../storage");
const i18n = require("../i18n");
const { BASE, MAX_UPLOAD_MB } = require("../config");

const router = express.Router();

// Images go to memory first and are only written after validation -- that
// way a rejected upload never creates a file at all.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
});

// Mutating calls only ever arrive as JSON/FormData via fetch carrying a
// header of our own. A foreign document cannot set that header without a
// CORS grant -- that is the protection against forged calls here. Inside
// Relay its csrf.js takes over this job instead.
function sameOriginOnly(req, res, next) {
  if (req.get("X-Slides") !== "1") return res.status(403).json({ error: req.t("server.invalid") });
  next();
}

// Loads the deck belonging to the URL and puts it on req.deck.
function loadDeck(req, res, next) {
  const model = storage.load(req.params.slug);
  if (!model) return res.status(404).send(req.t("server.deckMissing"));
  req.slug = req.params.slug;
  req.deck = model;
  next();
}

// URL prefix a deck's images live under. Kept in one place because the
// renderer, the editor and the export all need it.
function imageBase(slug) {
  return `${BASE}/d/${slug}/assets/`;
}

// The web app manifest, which lets the editor be placed on a home screen
// and started in a window of its own. Rendered rather than served as a
// file, because BASE_PATH has to appear in the paths inside it.
//
// One SVG for every size, declared as sizes: "any". The project keeps no
// raster images, so there is nothing to offer a browser that wants PNG --
// it falls back to its own placeholder then.
router.get("/manifest.webmanifest", (req, res) => {
  res.type("application/manifest+json").json({
    name: "trivialSlides",
    short_name: "trivialSlides",
    description: "A presentation editor on reveal.js that stores nothing but Markdown.",
    start_url: BASE + "/",
    scope: BASE + "/",
    display: "standalone",
    background_color: "#1c1f23",
    theme_color: "#1c1f23",
    icons: [
      { src: BASE + "/static/trivialSlides.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  });
});

// Switching the language. A cookie rather than a stored setting in the
// browser, because the server renders most of the text and only a cookie
// reaches it. A year is long enough that nobody has to choose twice, and
// SameSite=Lax keeps it out of requests coming from elsewhere.
router.post("/language/:code", (req, res) => {
  const code = String(req.params.code || "");
  if (!i18n.languages().includes(code)) return res.status(400).end();
  res.setHeader("Set-Cookie",
    `${i18n.COOKIE}=${code}; Path=${BASE || "/"}; Max-Age=31536000; SameSite=Lax`);
  res.json({ ok: true, language: code });
});

// The code styles, fenced into one class each (see code.js). Generated
// rather than a file on disk, so it is served from here instead of from
// public/. It changes only when the highlight.js package does, hence the
// long cache.
router.get("/code-styles.css", (req, res) => {
  res.type("text/css").set("Cache-Control", "public, max-age=3600").send(code.css());
});

// --- Overview ----------------------------------------------------------
router.get("/", (req, res) => {
  res.render("index", { decks: storage.list() });
});

router.post("/new", (req, res) => {
  const slug = storage.create(req.body.title || req.t("server.newTalk"));
  res.redirect(`${BASE}/d/${slug}`);
});

// --- Editor ------------------------------------------------------------
// The shapes a screen comes in. Nothing here touches the deck: reveal.js
// lays every slide out at 960x700 and fits that into whatever it is given,
// so this list only says what the editor's preview is fitted into -- which
// is the one way to see beforehand what a 4:3 projector will make of a
// slide.
//
// Sorted by shape, from the widest to the nearly square: that is the one
// order in which a list of five ratios says anything, and the numbers
// alone suggest no other. Which of them a browser starts with is said
// separately -- tying the default to a position in the list would make
// reordering the list change the default.
const PREVIEW_FORMATS = ["21:9", "16:9", "16:10", "3:2", "4:3"];
const PREVIEW_DEFAULT = "16:9";

router.get("/d/:slug", loadDeck, (req, res) => {
  res.render("editor", {
    slug: req.slug,
    deck: req.deck,
    layouts: i18n.layoutsTranslated(layouts.LAYOUTS, req.language),
    gradients: i18n.gradientsTranslated(gradients.list(), req.language),
    effects: i18n.effectsTranslated(effects.EFFECTS, req.language),
    videoPattern: video.PATTERN,
    textSides: i18n.textSidesTranslated(layouts.SIDES, req.language),
    textWidths: layouts.WIDTHS,
    codeLanguages: code.LANGUAGES,
    emoji: i18n.emojiTranslated(emoji.GROUPS, req.language),
    codeStyles: code.STYLES,
    // The grammar travels with the page and becomes the input's pattern --
    // so the browser refuses a broken gradient with the same rule the
    // server would have applied (deck.js).
    gradientPattern: deck.GRADIENT_PATTERN,
    gradientMax: deck.GRADIENT_MAX,
    themes: deck.THEMES,
    transitions: deck.TRANSITIONS,
    previewFormats: PREVIEW_FORMATS,
    previewDefault: PREVIEW_DEFAULT,
    // What the page needs to take a column slide's body apart the same way
    // the renderer does (layouts.js, js/editor/columns.js).
    columns: { break: layouts.COLUMN_BREAK, split: layouts.COLUMN_SPLIT },
    images: storage.images(req.slug),
  });
});

router.get("/d/:slug/deck.json", loadDeck, (req, res) => {
  res.json({ deck: req.deck, images: storage.images(req.slug) });
});

router.put("/d/:slug/deck.json", sameOriginOnly, loadDeck, (req, res) => {
  const model = deck.normalize(req.body && req.body.deck);
  storage.save(req.slug, model);
  res.json({ ok: true, deck: model });
});

// A single slide as HTML -- so that after every keystroke the preview
// redraws only what is needed instead of reloading the whole deck.
router.post("/d/:slug/slide.html", sameOriginOnly, loadDeck, (req, res) => {
  const slide = deck.normalize({ slides: [req.body && req.body.slide] }).slides[0];
  res.json({ html: render.slideHtml(slide, imageBase(req.slug)) });
});

// A single slide as a picture standing still -- what a card in the
// editor's slide list carries behind its words (js/editor/slide-list.js).
//
// A page of its own rather than the preview's: the preview is a running
// presentation, and a list of thirteen slides cannot be thirteen running
// presentations. This one brings the theme and the layout stylesheet, so
// the card shows the slide rather than a sketch of it, and brings neither
// reveal.js nor the highlighter nor a player (views/thumb.ejs).
router.get("/d/:slug/thumb/:index", loadDeck, (req, res) => {
  const slide = req.deck.slides[Number(req.params.index)];
  if (!slide) return res.status(404).end();
  res.render("thumb", {
    deck: req.deck,
    slide: render.slideHtml(slide, imageBase(req.slug)),
    background: render.backgroundHtml(slide, imageBase(req.slug)),
  });
});

// --- Viewing -----------------------------------------------------------
router.get("/d/:slug/preview", loadDeck, (req, res) => {
  res.render("reveal", {
    slug: req.slug,
    deck: req.deck,
    slides: render.slidesHtml(req.deck, imageBase(req.slug)),
    indices: render.indices(req.deck.slides),
    preview: true,
  });
});

router.get("/d/:slug/present", loadDeck, (req, res) => {
  res.render("reveal", {
    slug: req.slug,
    deck: req.deck,
    slides: render.slidesHtml(req.deck, imageBase(req.slug)),
    indices: render.indices(req.deck.slides),
    preview: false,
  });
});

// A standalone SVG needs its namespace, or no browser will draw it -- it
// arrives, it is served, and the slide stays empty. Several drawing
// programs leave it out when exporting a fragment rather than a document.
// The file is otherwise sound, so it is repaired here rather than refused;
// adding the namespace to a root element that has none changes nothing
// about the picture.
//
// A .svg whose content is not an SVG at all is a different matter and is
// dropped: storing it would only produce the same empty slide later.
const SVG_NS = "http://www.w3.org/2000/svg";

function repairSvg(puffer) {
  const text = puffer.toString("utf8");
  const auf = text.match(/<svg\b[^>]*>/i);
  if (!auf) return null;
  if (/\sxmlns\s*=/i.test(auf[0])) return puffer;
  const repaired = auf[0].replace(/^<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  return Buffer.from(text.replace(auf[0], repaired), "utf8");
}

// --- Images --------------------------------------------------------------
router.get("/d/:slug/assets/:name", (req, res) => {
  const p = storage.imagePath(req.params.slug, req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).end();
  // An SVG is a document, and a document can carry a <script>. As a
  // picture that script never runs, but opening the address directly
  // would run it in this app's own origin. The sandbox forbids that while
  // leaving the drawing untouched.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  res.sendFile(p, { maxAge: "1h" });
});

router.post("/d/:slug/assets", sameOriginOnly, loadDeck, upload.array("image", 20), (req, res) => {
  const names = [];
  for (const f of req.files || []) {
    const ext = (path.extname(f.originalname || "").toLowerCase().match(/^\.(jpe?g|png|gif|webp|svg)$/) || [])[0];
    if (!ext) continue; // skip other file types quietly instead of rejecting the whole upload
    // Name taken from the original but forced into the same strict shape
    // as the folder names; on a collision a short tag is appended.
    const base = storage.slugify(path.basename(f.originalname, ext)).slice(0, 40) || "image";
    let name = base + ext;
    let target = storage.imagePath(req.slug, name);
    if (!target) continue;
    if (fs.existsSync(target)) {
      name = `${base}-${Date.now().toString(36)}${ext}`;
      target = storage.imagePath(req.slug, name);
    }
    let data = f.buffer;
    if (ext === ".svg") {
      data = repairSvg(f.buffer);
      if (!data) continue;   // called .svg, is not one
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    names.push(name);
  }
  res.json({ ok: true, fresh: names, images: storage.images(req.slug) });
});

// --- Publishing --------------------------------------------------------
// The Markdown file itself. The way back into a reveal.js project of your
// own, or into version control.
router.get("/d/:slug/deck.md", loadDeck, (req, res) => {
  res.type("text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${req.slug}.md"`);
  res.send(deck.serialize(req.deck));
});

// The same Markdown once more, but to be READ rather than saved: coloured
// markup for the dialog in the editor (source.js), without the
// Content-Disposition that would make a browser offer it as a file.
//
// A fragment, not a page: it goes straight into the box the dialog keeps
// ready. Serialised here rather than in the browser, because the format
// lives in deck.js -- a second implementation over there could only drift
// away from this one. req.t comes along for the marks beside the blocks:
// they are the only words in the fragment that are not the file itself.
router.get("/d/:slug/source.html", loadDeck, (req, res) => {
  res.type("html").send(source.highlight(deck.serialize(req.deck), req.t));
});

// The way back: a file edited by hand in that dialog.
//
// Checking and saving are one call rather than two, because they are one
// question -- "may this be saved, and if so, do it". The check runs either
// way and its findings come back either way; only `apply` decides whether
// a clean text is also written. That leaves no window in which a text
// could be judged clean and saved as something else.
//
// Nothing is saved while anything was found. deck.js repairs in silence
// (see check.js), so a save past a finding is exactly the moment a line
// would disappear without anybody being told.
//
// What comes back on success is the SAVED file, freshly coloured, not the
// text that was sent: saving rewrites the attribute order and the blank
// lines, and the dialog should show what is on disk rather than what was
// typed at it.
router.post("/d/:slug/source", sameOriginOnly, loadDeck, (req, res) => {
  const text = String((req.body && req.body.text) || "");
  const findings = check.check(text, storage.images(req.slug))
    .map((f) => ({ line: f.line, text: req.t(f.key, f.values) }));
  // The colours travel back with the findings, and so does the deck the
  // text would become. The page is being typed in and has neither a
  // highlighter nor a reader of its own; this is the same round trip it
  // already makes for the check, so both come free of a second one. The
  // deck is what lets the preview behind the dialog show the slide being
  // written in -- unsaved, exactly as the form does while typing.
  //
  // Of the blocks only their lines go back, never the blocks around them:
  // one of them is under the field the caret sits in (see source.parts).
  if (findings.length || !(req.body && req.body.apply)) {
    return res.json({
      findings,
      blocks: source.parts(text).map((b) => ({ html: b.html, slide: b.slide })),
      deck: deck.normalize(deck.parse(text)),
    });
  }

  const model = deck.normalize(deck.parse(text));
  storage.save(req.slug, model);
  res.json({
    findings: [],
    deck: model,
    html: source.highlight(deck.serialize(model), req.t),
  });
});

// A single HTML file that runs without a server and without a network:
// reveal.js, the theme, our layout CSS, the fonts and every image are
// inside it. This is the version to send around -- recipients double-click
// it and present.
router.get("/d/:slug/export.html", loadDeck, (req, res) => {
  res.type("html");
  res.setHeader("Content-Disposition", `attachment; filename="${req.slug}.html"`);
  res.send(document.html({ slug: req.slug, deck: req.deck, imageBase: imageBase(req.slug) }));
});

// A PDF to hand out: one slide per page, rendered from exactly the
// document above. reveal.js does the page breaking itself (the "print"
// view) and a browser without a window does the printing -- which is why
// the handout looks like the talk rather than like a replica of it.
//
// This takes a few seconds: a browser has to start up for it.
router.get("/d/:slug/export.pdf", loadDeck, async (req, res) => {
  const html = document.html({ slug: req.slug, deck: req.deck, imageBase: imageBase(req.slug), print: true });
  try {
    const file = await pdf.generate(html);
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${req.slug}.pdf"`);
    res.send(file);
  } catch (err) {
    // The only error to expect is a missing browser, and the user cannot
    // guess that one. So this says what is missing and what they can do
    // instead -- rather than "internal error".
    console.error(err);
    const missing = err && err.code === "KEIN_BROWSER";
    res.status(missing ? 503 : 500).type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>${req.t("server.pdfTitle")}</title>
<p>${missing ? req.t("server.pdfNoBrowser") : req.t("server.pdfError")}</p>
<p>${req.t("server.pdfByHand", { url: `${BASE}/d/${req.slug}/present?print-pdf` })}</p>
<p><a href="${BASE}/d/${req.slug}">${req.t("server.back")}</a></p>
`);
  }
});

// Two spellings for the same router: standalone, the export itself is
// enough; Relay mounts its routers as require("./routes/x").router. That
// way the file fits both worlds without a change.
module.exports = router;
module.exports.router = router;
