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
  "state.offline",
  "color.none", "color.reset", "color.done",
  "editor.gradientInvalid",
  "dialog.codeTitle", "dialog.codeEdit", "dialog.codeInsert", "dialog.codeApply",
  "code.click", "code.noLanguage", "code.remove",
  "editor.videoUnknown", "editor.urlInvalid",
  "card.up", "card.down", "card.indent", "card.outdent",
  "card.duplicate", "card.delete", "card.untitled",
  "message.atLeastOne", "message.deleteSlide", "message.staysSource",
  "message.linkTarget", "message.imageError",
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
// (layouts.js) -- ids there, words here.
function textSidesTranslated(sides, language) {
  return sides.map((id) => ({ id, name: translate(language, "textSide." + id) }));
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

module.exports = { middleware, translate, languages, forBrowser, layoutsTranslated, gradientsTranslated, effectsTranslated, textSidesTranslated, emojiTranslated, COOKIE, DEFAULT };
