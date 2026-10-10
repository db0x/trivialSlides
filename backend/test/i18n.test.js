// Every name the editor shows, in both languages.
//
// translate() answers a missing key WITH THE KEY, deliberately: on the page
// that is glaring, where silence would let it slip through. Glaring,
// though, only if somebody looks -- and the thing most likely to add a
// layout or an effect is also the thing least likely to open the editor in
// the other language afterwards. So this file looks instead.
const test = require("node:test");
const assert = require("node:assert/strict");

const i18n = require("../i18n");
const layouts = require("../layouts");
const effects = require("../effects");
const gradients = require("../gradients");
const bands = require("../bands");

const LANGUAGES = i18n.languages();

// A key is present when it does not translate to itself.
function missing(language, key) {
  return i18n.translate(language, key) === key;
}

function everywhere(keys) {
  const gaps = [];
  for (const language of LANGUAGES) {
    for (const key of keys) {
      if (missing(language, key)) gaps.push(`${language}: ${key}`);
    }
  }
  return gaps;
}

test("both languages exist", () => {
  assert.deepEqual(LANGUAGES.sort(), ["de", "en"]);
});

test("every layout has a name and a hint in every language", () => {
  const keys = layouts.LAYOUTS.flatMap((l) => [`layout.${l.id}.label`, `layout.${l.id}.hint`]);
  assert.deepEqual(everywhere(keys), []);
});

test("every animated background has a name in every language", () => {
  assert.deepEqual(everywhere(effects.EFFECTS.map((e) => `effect.${e.id}`)), []);
});

test("every gradient has a name in every language", () => {
  // A gradient may carry its own name, in which case none is looked up.
  const keys = gradients.list().filter((g) => !g.name).map((g) => `gradient.${g.id}`);
  assert.deepEqual(everywhere(keys), []);
});

test("every place a text box or a strip can take has a name", () => {
  const keys = [
    ...layouts.PLACES.map((p) => `textPlace.${p}`),
    ...bands.PLACES.map((p) => `bandPlace.${p}`),
    ...layouts.SIDES.map((s) => `textSide.video.${s}`),
    ...layouts.SIDES.map((s) => `textSide.qr.${s}`),
  ];
  assert.deepEqual(everywhere(keys), []);
});

test("the two tables hold the same keys", () => {
  // A string added to one language and forgotten in the other falls back to
  // German, which reads as a bug rather than as a translation.
  const tables = Object.fromEntries(LANGUAGES.map((l) => [l, require(`../i18n/${l}.json`)]));
  const all = new Set(LANGUAGES.flatMap((l) => Object.keys(tables[l])));
  const gaps = [];
  for (const key of all) {
    for (const language of LANGUAGES) {
      if (!(key in tables[language])) gaps.push(`${language} lacks ${key}`);
    }
  }
  assert.deepEqual(gaps, []);
});

test("everything the browser builds text from travels with the page", () => {
  // forBrowser() is the subset the editor's own scripts look up. A key
  // listed there but absent from the table shows up as the key itself in
  // the interface.
  for (const language of LANGUAGES) {
    const table = i18n.forBrowser(language);
    const bad = Object.entries(table).filter(([key, value]) => value === key);
    assert.deepEqual(bad.map(([k]) => `${language}: ${k}`), []);
  }
});

test("a missing key comes back as itself rather than as empty", () => {
  assert.equal(i18n.translate("en", "no.such.key.at.all"), "no.such.key.at.all");
});

test("placeholders in a string are filled", () => {
  const filled = i18n.translate("en", "check.attrUnknown", { name: "data-wat" });
  assert.ok(filled.includes("data-wat"), filled);
});
