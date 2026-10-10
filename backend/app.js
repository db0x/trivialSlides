// trivialSlides -- a presentation editor built on reveal.js.
//
// Runs on its own (docker compose up), but is deliberately cut so that
// moving it into Relay is a copy rather than a rewrite: the whole editor
// hangs off ONE router (routes/decks.js). Inside Relay that becomes
//
//     app.use(BASE + "/slides", loginRequired, require("./routes/slides"));
//
// with authentication, layout and sharing all coming from Relay.
const fs = require("fs");
const path = require("path");
const express = require("express");
const { BASE, PORT, PUBLIC_URL, VERSION } = require("./config");
const pdf = require("./pdf");
const ai = require("./ai");
const storage = require("./storage");
const i18n = require("./i18n");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.locals.BASE = BASE;
app.locals.VERSION = VERSION;

app.use(i18n.middleware);

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));

// Our own files plus reveal.js. reveal is served straight from
// node_modules instead of being copied -- inside Relay it moves to
// public/vendor/ instead, where the other third-party libraries live.
//
// Our own files carry max-age=0, so the browser asks before reusing them
// and gets a 304 when nothing changed. They are a few kilobytes, the ask is
// one conditional request -- and it is the difference between an edited
// stylesheet showing up at once and showing up an hour later. The
// dependencies below keep the long cache: they only change on npm install.
app.use(BASE + "/static", express.static(path.join(__dirname, "public"), { maxAge: 0 }));
app.use(BASE + "/reveal", express.static(path.join(__dirname, "node_modules", "reveal.js", "dist"), { maxAge: "1h" }));
// The speaker view -- S during a presentation -- is not a file of reveal's
// that we could override: the whole page sits inlined in its notes plugin,
// and nothing about it is configurable. So the two things that are wrong
// for a presenter here are rewritten on the way out, which leaves the
// plugin an untouched dependency that npm install cannot undo. A line not
// found means reveal changed it: then the bundle goes out as it is and
// says so in the log, rather than the speaker view failing to load.
const NOTES_PLUGIN = path.join(__dirname, "node_modules", "reveal.js", "plugin", "notes", "notes.js");
const NOTES_REWRITES = [
  // 1. The clock, hard-wired to en-US 12h time: AM/PM in front of a German
  // audience. Two places say it -- the line that ticks every second, and
  // the markup the window starts with, which stands until the first tick.
  // hourCycle rather than hour12: false, because en-US reads midnight as
  // 24:05 that way, and h23 reads it as 00:05.
  ["'en-US', { hour12: true, hour: '2-digit', minute:'2-digit' }", "'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }"],
  [">0:00 AM<", ">00:00<"],
  // 2. The window. A width and a height in that third argument are what
  // make a browser open a popup rather than an ordinary tab, and a popup
  // under Wayland comes up with a frame the window manager did not draw.
  // Which way is wanted depends on the screens plugged in, so the choice
  // belongs to the presenter: the settings hold it and the page acts on
  // it (public/js/speaker-window.js) -- including the third way, where no
  // browser window opens at all and the application in desktop/ shows the
  // view instead. Without that script -- nobody else loads this plugin
  // today, but reveal's own default is the honest fallback -- it stays
  // the popup it has always been.
  ['window.open("about:blank","reveal.js - Notes","width=1100,height=700")',
    '(window.speakerWindow?window.speakerWindow.open():window.open("about:blank","reveal.js - Notes","width=1100,height=700"))'],
];
let notesPlugin = null;
app.get(BASE + "/reveal-plugin/notes/notes.js", (req, res) => {
  if (notesPlugin === null) {
    notesPlugin = fs.readFileSync(NOTES_PLUGIN, "utf8");
    for (const [theirs, ours] of NOTES_REWRITES) {
      if (!notesPlugin.includes(theirs)) console.warn("reveal notes plugin: line not found, serving unchanged:", theirs);
      notesPlugin = notesPlugin.replace(theirs, ours);
    }
  }
  // max-age=0 rather than the hour the other dependencies get: this bundle
  // is no longer one of theirs, it is a file of ours that happens to be
  // mostly reveal's -- and a cached copy of the 12h clock would sit in the
  // browser for an hour after the fix. res.send adds an ETag, so the ask
  // costs one conditional request and answers 304 while nothing changes.
  res.type("application/javascript").set("Cache-Control", "public, max-age=0").send(notesPlugin);
});
app.use(BASE + "/reveal-plugin", express.static(path.join(__dirname, "node_modules", "reveal.js", "plugin"), { maxAge: "1h" }));
// OverlayScrollbars, served the same way: the ES module and its stylesheet
// straight from node_modules, no build step in between.
app.use(BASE + "/overlayscrollbars", express.static(path.join(__dirname, "node_modules", "overlayscrollbars"), { maxAge: "1h" }));
app.use(BASE + "/coloris", express.static(path.join(__dirname, "node_modules", "@melloware", "coloris"), { maxAge: "1h" }));

// Absolute addresses for the link preview cards (see views/partials/head.ejs).
// PUBLIC_URL wins; without it the requested host is the best guess there is.
// Deliberately no "trust proxy": that would mean believing X-Forwarded-*
// headers from anyone, and PUBLIC_URL answers the same question without the
// risk.
app.use((req, res, next) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get("host")}${BASE}`;
  res.locals.ABS = (path) => base + path;
  res.locals.HIER = base + (req.originalUrl.slice(BASE.length).split("?")[0] || "/");
  next();
});

app.use(BASE || "/", require("./routes/decks"));

app.use((req, res) => res.status(404).send(req.t("server.notFound")));

// Never hand a raw error to the browser: the details go to the log, the
// user gets a single sentence.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).send(req.t("server.serverError"));
});

storage.ensure();
app.listen(PORT, () => {
  console.log(`trivialSlides is listening on port ${PORT}${BASE ? ` (sub-path ${BASE})` : ""}`);
  // Report a missing browser once at startup rather than surprising
  // whoever clicks "PDF". Everything else keeps working without it.
  if (!pdf.browserPath()) {
    console.log("Note: no browser found, so PDF export is unavailable. Set BROWSER_PATH if yours lives elsewhere.");
  }
  // The same courtesy for the one feature that needs a key: said once at
  // startup rather than discovered by looking for a button that is not
  // there. Without it the editor is exactly what it has always been.
  if (ai.available()) {
    console.log(`Building a deck from a prompt is available: ${ai.describe()}.`);
  } else {
    console.log(`Note: building a deck from a prompt is unavailable -- ${ai.missing()}. Everything else is unaffected.`);
  }
});
