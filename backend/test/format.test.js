// What a deck says it takes to read it.
//
// min-version is the line that protects an older trivialSlides from
// silently eating a newer deck. It is computed from the deck itself, out of
// the FEATURES table -- and the failure mode of that table is SILENCE: a
// feature added without a line there makes every deck using it understate
// what it needs, and nobody finds out until a file has already lost
// something. Hence the table test below, which refuses to pass while a
// feature has no sample.
const test = require("node:test");
const assert = require("node:assert/strict");

const format = require("../format");
const deck = require("../deck");

function slide(extra) {
  return { ...deck.newSlide("text"), ...extra };
}

function model(slides, extra) {
  return { title: "T", theme: "simple", transition: "none", slides, ...extra };
}

// One deck per entry in FEATURES, in the same order, each exercising that
// entry and nothing newer. Adding a feature means adding a sample here --
// which is the whole point: the count is asserted below.
const SAMPLES = [
  { what: "an animated background", deck: model([slide({ effect: "starfield" })]) },
  { what: "a QR code", deck: model([slide({ layout: "qr", url: "https://example.com" })]) },
  { what: "a heading that is not where it was", deck: model([slide({ titleAlign: "center" })]) },
  { what: "a text box that waits for a click", deck: model([slide({ textFragment: true })]) },
  { what: "a group of blocks", deck: model([slide({ content: '<!-- .group: fragment -->\na\n<!-- .group -->' })]) },
  { what: "a slide sending a strip away", deck: model([slide({ noFooter: true })]) },
  { what: "text in more than one column", deck: model([slide({ columnCount: "2" })]) },
  { what: "blocks that stand where they were put", deck: model([slide({ layout: "freestyle" })]) },
];

test("every entry in FEATURES has a sample deck", () => {
  // The forcing function. A new line in format.js without a line here is a
  // feature whose version nothing checks.
  assert.equal(SAMPLES.length, format.FEATURES.length,
    "FEATURES and SAMPLES have drifted apart -- add the missing sample");
});

test("each feature asks for the version it was introduced in", () => {
  format.FEATURES.forEach((feature, i) => {
    const sample = SAMPLES[i];
    assert.equal(format.minVersion(sample.deck), feature.version,
      `${sample.what} should ask for ${feature.version}`);
  });
});

test("a deck using nothing special asks for the base version", () => {
  // However new the editor that saved it. The number is a claim about the
  // DECK, not about who wrote it.
  assert.equal(format.minVersion(model([slide({ title: "T", content: "Just words." })])), format.BASE);
});

test("the newest thing in a deck decides", () => {
  const mixed = model([
    slide({ effect: "starfield" }),
    slide({ layout: "freestyle" }),
  ]);
  assert.equal(format.minVersion(mixed), "0.10.1");
});

test("a half-built model costs the deck no head line", () => {
  // minVersion runs over models that are still being assembled; a feature
  // that throws must answer "does not apply" rather than take the whole
  // line down.
  assert.equal(format.minVersion(null), format.BASE);
  assert.equal(format.minVersion({}), format.BASE);
  assert.equal(format.minVersion({ slides: "not an array" }), format.BASE);
});

test("versions compare as numbers, not as text", () => {
  assert.ok(format.older("0.9.0", "0.10.1"), "0.9.0 is older than 0.10.1");
  assert.ok(!format.older("0.10.1", "0.9.0"));
  assert.ok(format.older("0.2.1", "0.3.1"));
  assert.equal(format.older("1.0.0", "1.0.0"), false);
});

test("anything that is not a version sorts as the oldest", () => {
  assert.ok(format.older("neu", "0.1.0"));
  assert.equal(format.isVersion("0.10.1"), true);
  assert.equal(format.isVersion("neu"), false);
});

test("the generator line names the project", () => {
  assert.equal(format.GENERATOR, "trivialSlides");
});
