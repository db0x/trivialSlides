// trivialSlides -- a presentation editor built on reveal.js.
//
// Runs on its own (docker compose up), but is deliberately cut so that
// moving it into Relay is a copy rather than a rewrite: the whole editor
// hangs off ONE router (routes/decks.js). Inside Relay that becomes
//
//     app.use(BASE + "/folien", loginRequired, require("./routes/folien"));
//
// with authentication, layout and sharing all coming from Relay.
const path = require("path");
const express = require("express");
const { BASE, PORT, PUBLIC_URL } = require("./config");
const pdf = require("./pdf");
const storage = require("./storage");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.locals.BASE = BASE;

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));

// Our own files plus reveal.js. reveal is served straight from
// node_modules instead of being copied -- inside Relay it moves to
// public/vendor/ instead, where the other third-party libraries live.
app.use(BASE + "/static", express.static(path.join(__dirname, "public"), { maxAge: "1h" }));
app.use(BASE + "/reveal", express.static(path.join(__dirname, "node_modules", "reveal.js", "dist"), { maxAge: "1h" }));
app.use(BASE + "/reveal-plugin", express.static(path.join(__dirname, "node_modules", "reveal.js", "plugin"), { maxAge: "1h" }));
// OverlayScrollbars, served the same way: the ES module and its stylesheet
// straight from node_modules, no build step in between.
app.use(BASE + "/overlayscrollbars", express.static(path.join(__dirname, "node_modules", "overlayscrollbars"), { maxAge: "1h" }));

// Absolute addresses for the link preview cards (see views/partials/head.ejs).
// PUBLIC_URL wins; without it the requested host is the best guess there is.
// Deliberately no "trust proxy": that would mean believing X-Forwarded-*
// headers from anyone, and PUBLIC_URL answers the same question without the
// risk.
app.use((req, res, next) => {
  const basis = PUBLIC_URL || `${req.protocol}://${req.get("host")}${BASE}`;
  res.locals.ABS = (pfad) => basis + pfad;
  res.locals.HIER = basis + (req.originalUrl.slice(BASE.length).split("?")[0] || "/");
  next();
});

app.use(BASE || "/", require("./routes/decks"));

app.use((req, res) => res.status(404).send("Nicht gefunden"));

// Never hand a raw error to the browser: the details go to the log, the
// user gets a single sentence.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).send("Da ist serverseitig etwas schiefgegangen.");
});

storage.sicherstellen();
app.listen(PORT, () => {
  console.log(`trivialSlides is listening on port ${PORT}${BASE ? ` (sub-path ${BASE})` : ""}`);
  // Report a missing browser once at startup rather than surprising
  // whoever clicks "PDF". Everything else keeps working without it.
  if (!pdf.browserPfad()) {
    console.log("Note: no browser found, so PDF export is unavailable. Set BROWSER_PATH if yours lives elsewhere.");
  }
});
