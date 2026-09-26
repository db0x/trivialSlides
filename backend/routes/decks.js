// Every route of the editor. A single router, so that fitting it into
// Relay amounts to one app.use(...) line.
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const deck = require("../deck");
const dokument = require("../dokument");
const pdf = require("../pdf");
const layouts = require("../layouts");
const render = require("../render");
const storage = require("../storage");
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
function nurEigeneSeite(req, res, next) {
  if (req.get("X-Folien") !== "1") return res.status(403).json({ fehler: "Ungueltiger Aufruf" });
  next();
}

// Loads the deck belonging to the URL and puts it on req.deck.
function deckLaden(req, res, next) {
  const modell = storage.lade(req.params.slug);
  if (!modell) return res.status(404).send("Diesen Vortrag gibt es nicht.");
  req.slug = req.params.slug;
  req.deck = modell;
  next();
}

// URL prefix a deck's images live under. Kept in one place because the
// renderer, the editor and the export all need it.
function bildBasis(slug) {
  return `${BASE}/d/${slug}/bilder/`;
}

// The web app manifest, which lets the editor be placed on a home screen
// and started in a window of its own. Rendered rather than served as a
// file, because BASE_PATH has to appear in the paths inside it.
//
// The icons say "any maskable": they carry their own opaque background and
// keep the arrows well inside the edge, so Android may crop them to
// whatever shape it likes without cutting into the mark.
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
      { src: BASE + "/static/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: BASE + "/static/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
});

// --- Overview ----------------------------------------------------------
router.get("/", (req, res) => {
  res.render("index", { decks: storage.liste() });
});

router.post("/neu", (req, res) => {
  const slug = storage.erstelle(req.body.titel);
  res.redirect(`${BASE}/d/${slug}`);
});

// --- Editor ------------------------------------------------------------
router.get("/d/:slug", deckLaden, (req, res) => {
  res.render("editor", {
    slug: req.slug,
    deck: req.deck,
    layouts: layouts.LAYOUTS,
    themes: deck.THEMES,
    transitions: deck.TRANSITIONS,
    bilder: storage.bilder(req.slug),
  });
});

router.get("/d/:slug/deck.json", deckLaden, (req, res) => {
  res.json({ deck: req.deck, bilder: storage.bilder(req.slug) });
});

router.put("/d/:slug/deck.json", nurEigeneSeite, deckLaden, (req, res) => {
  const modell = deck.normalize(req.body && req.body.deck);
  storage.speichere(req.slug, modell);
  res.json({ ok: true, deck: modell });
});

// A single slide as HTML -- so that after every keystroke the preview
// redraws only what is needed instead of reloading the whole deck.
router.post("/d/:slug/folie.html", nurEigeneSeite, deckLaden, (req, res) => {
  const folie = deck.normalize({ folien: [req.body && req.body.folie] }).folien[0];
  res.json({ html: render.folieHtml(folie, bildBasis(req.slug)) });
});

// --- Viewing -----------------------------------------------------------
router.get("/d/:slug/vorschau", deckLaden, (req, res) => {
  res.render("reveal", {
    slug: req.slug,
    deck: req.deck,
    slides: render.slidesHtml(req.deck, bildBasis(req.slug)),
    indizes: render.indizes(req.deck.folien),
    vorschau: true,
  });
});

router.get("/d/:slug/praesentation", deckLaden, (req, res) => {
  res.render("reveal", {
    slug: req.slug,
    deck: req.deck,
    slides: render.slidesHtml(req.deck, bildBasis(req.slug)),
    indizes: render.indizes(req.deck.folien),
    vorschau: false,
  });
});

// --- Images --------------------------------------------------------------
router.get("/d/:slug/bilder/:name", (req, res) => {
  const p = storage.bildPfad(req.params.slug, req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p, { maxAge: "1h" });
});

router.post("/d/:slug/bilder", nurEigeneSeite, deckLaden, upload.array("bild", 20), (req, res) => {
  const namen = [];
  for (const f of req.files || []) {
    const endung = (path.extname(f.originalname || "").toLowerCase().match(/^\.(jpe?g|png|gif|webp|svg)$/) || [])[0];
    if (!endung) continue; // skip other file types quietly instead of rejecting the whole upload
    // Name taken from the original but forced into the same strict shape
    // as the folder names; on a collision a short tag is appended.
    const basis = storage.slugify(path.basename(f.originalname, endung)).slice(0, 40) || "bild";
    let name = basis + endung;
    let ziel = storage.bildPfad(req.slug, name);
    if (!ziel) continue;
    if (fs.existsSync(ziel)) {
      name = `${basis}-${Date.now().toString(36)}${endung}`;
      ziel = storage.bildPfad(req.slug, name);
    }
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, f.buffer);
    namen.push(name);
  }
  res.json({ ok: true, neu: namen, bilder: storage.bilder(req.slug) });
});

// --- Publishing --------------------------------------------------------
// The Markdown file itself. The way back into a reveal.js project of your
// own, or into version control.
router.get("/d/:slug/vortrag.md", deckLaden, (req, res) => {
  res.type("text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${req.slug}.md"`);
  res.send(deck.serialize(req.deck));
});

// A single HTML file that runs without a server and without a network:
// reveal.js, the theme, our layout CSS, the fonts and every image are
// inside it. This is the version to send around -- recipients double-click
// it and present.
router.get("/d/:slug/export.html", deckLaden, (req, res) => {
  res.type("html");
  res.setHeader("Content-Disposition", `attachment; filename="${req.slug}.html"`);
  res.send(dokument.html({ slug: req.slug, deck: req.deck, bildBasis: bildBasis(req.slug) }));
});

// A PDF to hand out: one slide per page, rendered from exactly the
// document above. reveal.js does the page breaking itself (the "print"
// view) and a browser without a window does the printing -- which is why
// the handout looks like the talk rather than like a replica of it.
//
// This takes a few seconds: a browser has to start up for it.
router.get("/d/:slug/export.pdf", deckLaden, async (req, res) => {
  const html = dokument.html({ slug: req.slug, deck: req.deck, bildBasis: bildBasis(req.slug), druck: true });
  try {
    const datei = await pdf.erzeuge(html);
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${req.slug}.pdf"`);
    res.send(datei);
  } catch (err) {
    // The only error to expect is a missing browser, and the user cannot
    // guess that one. So this says what is missing and what they can do
    // instead -- rather than "internal error".
    console.error(err);
    const fehlt = err && err.code === "KEIN_BROWSER";
    res.status(fehlt ? 503 : 500).type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>PDF nicht moeglich</title>
<p>${fehlt
  ? "Auf dem Server steht kein Browser, mit dem sich ein PDF erzeugen laesst. Chromium oder Chrome installieren (im Container macht das das Dockerfile), oder den Pfad in <code>BROWSER_PATH</code> setzen."
  : "Das PDF liess sich nicht erzeugen. Die Einzelheiten stehen im Server-Log."}</p>
<p>Bis dahin geht es auch von Hand: <a href="${BASE}/d/${req.slug}/praesentation?print-pdf">die Folien im Druckformat oeffnen</a> und im Druckdialog des Browsers &bdquo;Als PDF speichern&ldquo; waehlen.</p>
<p><a href="${BASE}/d/${req.slug}">Zurueck zum Vortrag</a></p>
`);
  }
});

// Two spellings for the same router: standalone, the export itself is
// enough; Relay mounts its routers as require("./routes/x").router. That
// way the file fits both worlds without a change.
module.exports = router;
module.exports.router = router;
