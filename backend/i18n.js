// Two languages, one dictionary format. The tables are JSON so that both
// sides can read them: the server with require(), the browser with the
// subset the page carries for the strings it builds itself.
//
// The chosen language lives in a cookie rather than in localStorage,
// because the server renders most of the text -- from the editor's form
// down to the error page when no browser is there to print a PDF. Only a
// cookie reaches it.
const LANGUAGES = {
  de: require("./i18n/de.json"),
  en: require("./i18n/en.json"),
};
const DEFAULT = "de";
const COOKIE = "trivialslides_language";

function languages() {
  return Object.keys(LANGUAGES);
}

// The cookie first, then what the browser asks for, then German. Parsed by
// hand: one cookie is not worth a dependency.
function fromRequest(req) {
  const raw = String(req.headers.cookie || "");
  const hit = new RegExp("(?:^|;\\s*)" + COOKIE + "=([a-z]{2})").exec(raw);
  if (hit && LANGUAGES[hit[1]]) return hit[1];
  const wanted = String(req.headers["accept-language"] || "").toLowerCase();
  for (const s of languages()) {
    if (wanted.startsWith(s) || wanted.includes("," + s)) return s;
  }
  return DEFAULT;
}

// A missing key returns the key itself: on the page that is glaring, which
// is what one wants -- silence would let it slip through unnoticed.
function translate(language, schluessel, values) {
  const table = LANGUAGES[language] || LANGUAGES[DEFAULT];
  let text = table[schluessel];
  if (text === undefined) text = LANGUAGES[DEFAULT][schluessel];
  if (text === undefined) return schluessel;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole);
}

// Everything the browser needs for text it builds itself -- the slide
// cards, the dialogs, the colour picker. Deliberately not the whole table:
// what the server already rendered does not need sending twice.
const FOR_BROWSER = [
  "theme.tooLight", "theme.tooDark",
  "state.offline", "state.unsaved",
  "color.none", "color.reset", "color.done",
  "editor.gradientInvalid",
  "dialog.codeTitle", "dialog.codeEdit", "dialog.codeInsert", "dialog.codeApply",
  "code.click", "code.noLanguage", "code.remove",
  "editor.videoUnknown", "editor.urlInvalid",
  "card.up", "card.down", "card.indent", "card.outdent",
  "card.duplicate", "card.delete", "card.untitled",
  "message.atLeastOne", "message.deleteSlide", "message.staysSource",
  "message.linkTarget", "message.imageError",
  // The settings dialog says what it just recorded, and the keys it lists
  // are only known once they have been pressed (js/prefs.js).
  "prefs.recording", "prefs.recorded", "prefs.taken", "prefs.reserved",
  "prefs.remove", "prefs.none", "prefs.record",
  // The source dialog says what it is waiting for, and if the file never
  // comes, that too. The findings themselves arrive already worded from
  // the server -- only the line in front of each one is built here
  // (js/editor/deck-source.js).
  "source.loading", "source.failed", "source.applyFailed", "source.line",
  // The library's rows are built from the deck as it stands in the page,
  // so every word in them is put together here (js/editor/library.js).
  "library.unused", "library.usedOn", "library.delete",
  "library.deleteConfirm", "library.deleteUsed", "library.deleteFailed",
  "library.deleteUsedBand",
  // A picture may be the logo of one of the two bands, and then the
  // library names the band rather than a list of slides (bands.js).
  "bands.header", "bands.footer",
  // The two prompt dialogs say what they are doing while they wait, and
  // what came of it afterwards -- all of it built in the page as the
  // answer arrives. The first group is shared, then the one that BUILDS a
  // deck on the overview (js/overview-ai.js) and the one that CHANGES it
  // in the editor (js/editor/ai.js).
  "ai.working", "ai.round", "ai.needPrompt", "ai.aborted", "ai.failed",
  "ai.newName", "ai.newCreating", "ai.newReady", "ai.newReadyFaults", "ai.abortedKept",
  "ai.pictures", "ai.picturesNone", "ai.ready", "ai.readyFaults",
  // The files brought along: the row for each one, and what a PDF turns
  // into. The list is built as they are chosen (js/overview-ai.js).
  "ai.fileRemove", "ai.uploading", "ai.tooManyPictures",
  "ai.pdfReading", "ai.pdfTaken", "ai.pdfCut", "ai.pdfFailed",
  "ai.textTaken", "ai.fileEmpty", "ai.fileKind",
];

function forBrowser(language) {
  const out = {};
  FOR_BROWSER.forEach((k) => { out[k] = translate(language, k); });
  return out;
}

// Layouts carry keys instead of words (see layouts.js); the labels are put
// in here, once, on the way to the page.
function layoutsTranslated(layouts, language) {
  return layouts.map((l) => Object.assign({}, l, {
    label: translate(language, "layout." + l.id + ".label"),
    hint: translate(language, "layout." + l.id + ".hint"),
  }));
}

// Gradients the same way, except that one brought in from gradients.json
// carries its own name -- see gradients.js.
function gradientsTranslated(gradients, language) {
  return gradients.map((v) => Object.assign({}, v, {
    name: v.name || translate(language, "gradient." + v.id),
  }));
}

// The four places the text may sit beside a player or a code
// (layouts.js) -- ids there, words here. Two wordings per place, because
// what the text stands beside differs by layout: the page picks the
// fitting one when the layout changes (js/editor/index.js), the same way
// the width button does.
function textSidesTranslated(sides, language) {
  return sides.map((id) => ({
    id,
    nameVideo: translate(language, "textSide.video." + id),
    nameQr: translate(language, "textSide.qr." + id),
  }));
}

// The three places a band's text or logo may stand in (bands.js) -- ids
// there, words here. The same shape as the places above, because the
// editor's menus are built from both the same way.
function bandPlacesTranslated(places, language) {
  return places.map((id) => ({ id, name: translate(language, "bandPlace." + id) }));
}

// The nine places a text box may take on a full-bleed picture
// (layouts.js) -- ids there, words here. The words are not written on the
// buttons, which are a map rather than a list; they are what the tooltip
// and a screen reader get.
function placesTranslated(places, language) {
  return places.map((id) => ({ id, name: translate(language, "textPlace." + id) }));
}

// The emoji groups (emoji.js): characters there, the word for the group
// here. It travels to the page as JSON and the panel is built from it
// (js/editor/index.js) -- 450 buttons in the markup would be 30 kB of
// page for something most of which is never looked at.
function emojiTranslated(groups, language) {
  return groups.map((g) => ({ id: g.id, name: translate(language, "emoji." + g.id), emoji: g.emoji }));
}

// And the effects, which carry nothing but an id either (effects.js).
function effectsTranslated(effects, language) {
  return effects.map((e) => Object.assign({}, e, {
    name: translate(language, "effect." + e.id),
  }));
}

// Puts t() and the language into every render and onto req, so routes can
// reach them too.
function middleware(req, res, next) {
  const language = fromRequest(req);
  req.language = language;
  req.t = (schluessel, values) => translate(language, schluessel, values);
  res.locals.LANGUAGE = language;
  res.locals.LANGUAGES = languages();
  res.locals.t = req.t;
  res.locals.TEXTS = forBrowser(language);
  next();
}

module.exports = { middleware, translate, languages, forBrowser, layoutsTranslated, gradientsTranslated, effectsTranslated, textSidesTranslated, placesTranslated, bandPlacesTranslated, emojiTranslated, COOKIE, DEFAULT };
