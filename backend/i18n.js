// Two languages, one dictionary format. The tables are JSON so that both
// sides can read them: the server with require(), the browser with the
// subset the page carries for the strings it builds itself.
//
// The chosen language lives in a cookie rather than in localStorage,
// because the server renders most of the text -- from the editor's form
// down to the error page when no browser is there to print a PDF. Only a
// cookie reaches it.
const SPRACHEN = {
  de: require("./i18n/de.json"),
  en: require("./i18n/en.json"),
};
const STANDARD = "de";
const KEKS = "trivialslides_sprache";

function sprachen() {
  return Object.keys(SPRACHEN);
}

// The cookie first, then what the browser asks for, then German. Parsed by
// hand: one cookie is not worth a dependency.
function ausAnfrage(req) {
  const roh = String(req.headers.cookie || "");
  const treffer = new RegExp("(?:^|;\\s*)" + KEKS + "=([a-z]{2})").exec(roh);
  if (treffer && SPRACHEN[treffer[1]]) return treffer[1];
  const wunsch = String(req.headers["accept-language"] || "").toLowerCase();
  for (const s of sprachen()) {
    if (wunsch.startsWith(s) || wunsch.includes("," + s)) return s;
  }
  return STANDARD;
}

// A missing key returns the key itself: on the page that is glaring, which
// is what one wants -- silence would let it slip through unnoticed.
function uebersetze(sprache, schluessel, werte) {
  const tafel = SPRACHEN[sprache] || SPRACHEN[STANDARD];
  let text = tafel[schluessel];
  if (text === undefined) text = SPRACHEN[STANDARD][schluessel];
  if (text === undefined) return schluessel;
  if (!werte) return text;
  return text.replace(/\{(\w+)\}/g, (ganz, name) =>
    Object.prototype.hasOwnProperty.call(werte, name) ? String(werte[name]) : ganz);
}

// Everything the browser needs for text it builds itself -- the slide
// cards, the dialogs, the colour picker. Deliberately not the whole table:
// what the server already rendered does not need sending twice.
const FUER_BROWSER = [
  "thema.zuHell", "thema.zuDunkel",
  "stand.gespeichert", "stand.speichert", "stand.fehler", "stand.offline",
  "farbe.ohne", "farbe.zuruecksetzen", "farbe.fertig",
  "karte.hoch", "karte.runter", "karte.einruecken", "karte.ausruecken",
  "karte.doppeln", "karte.loeschen", "karte.ohneTitel",
  "meldung.mindestensEine", "meldung.folieLoeschen", "meldung.bleibtQuelltext",
  "meldung.linkZiel", "meldung.bildFehler",
];

function fuerBrowser(sprache) {
  const out = {};
  FUER_BROWSER.forEach((k) => { out[k] = uebersetze(sprache, k); });
  return out;
}

// Layouts carry keys instead of words (see layouts.js); the labels are put
// in here, once, on the way to the page.
function layoutsUebersetzt(layouts, sprache) {
  return layouts.map((l) => Object.assign({}, l, {
    label: uebersetze(sprache, "layout." + l.id + ".label"),
    hilfe: uebersetze(sprache, "layout." + l.id + ".hilfe"),
  }));
}

// Puts t() and the language into every render and onto req, so routes can
// reach them too.
function middleware(req, res, next) {
  const sprache = ausAnfrage(req);
  req.sprache = sprache;
  req.t = (schluessel, werte) => uebersetze(sprache, schluessel, werte);
  res.locals.SPRACHE = sprache;
  res.locals.SPRACHEN = sprachen();
  res.locals.t = req.t;
  res.locals.TEXTE = fuerBrowser(sprache);
  next();
}

module.exports = { middleware, uebersetze, sprachen, fuerBrowser, layoutsUebersetzt, KEKS, STANDARD };
