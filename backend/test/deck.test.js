// The file format, read and written.
//
// This is the module the whole project rests on: the editor is a view onto
// a .md, and every mistake here is a line that disappears out of a file
// somebody owns. Which is also why the tests below are mostly about LOSS --
// what survives a round trip, and what is dropped on purpose.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const deck = require("../deck");
const layouts = require("../layouts");
const { REPO_DECKS } = require("../tools/harness");

const EXAMPLE = path.join(REPO_DECKS, "example", "deck.md");

test("the example deck survives parse -> serialize -> parse unchanged", () => {
  // The one test that covers the format as a whole rather than a corner of
  // it: every layout, both strips, gradients, effects, columns, a QR code
  // and a quote are in that file. If saving changed any of them, this is
  // where it shows -- and it reads the deck the repository ships, so the
  // test grows with the example.
  const once = deck.parse(fs.readFileSync(EXAMPLE, "utf8"));
  const twice = deck.parse(deck.serialize(once));
  assert.deepEqual(twice, once);
});

test("the example deck is not trivially small", () => {
  // Guards the test above: were the example ever emptied, the round trip
  // would still pass and would be saying nothing at all.
  const model = deck.parse(fs.readFileSync(EXAMPLE, "utf8"));
  assert.ok(model.slides.length >= 10, `only ${model.slides.length} slides`);
  const used = new Set(model.slides.map((s) => s.layout));
  assert.ok(used.size >= 8, `only ${used.size} different layouts`);
});

test("--- separates horizontally, ---- vertically", () => {
  const model = deck.parse([
    "# One", "", "---", "", "# Two", "", "----", "", "# Under two",
  ].join("\n"));
  assert.equal(model.slides.length, 3);
  assert.deepEqual(model.slides.map((s) => s.vertical), [false, false, true]);
});

test("an unknown attribute is dropped rather than carried", () => {
  // Deliberate: a file from elsewhere must not break the editor. The cost
  // of that forgiveness is what check.js exists to report.
  const model = deck.parse('<!-- .slide: data-layout="text" data-wat="1" -->\n\n# Title\n');
  assert.equal(model.slides[0].layout, "text");
  assert.ok(!("data-wat" in model.slides[0]));
  assert.ok(!deck.serialize(model).includes("data-wat"));
});

test("an unknown layout falls back to the default rather than vanishing", () => {
  const model = deck.parse('<!-- .slide: data-layout="nonsense" -->\n\n# Title\n\nBody\n');
  assert.equal(model.slides[0].layout, layouts.DEFAULT_LAYOUT);
  assert.equal(model.slides[0].title, "Title");
});

test("the old German layout names are still read", () => {
  // Decks written before the ids were renamed. Without this table a
  // bild-voll slide would become a text slide and lose its PICTURE
  // (layouts.js, RENAMED) -- and the next save would make that permanent.
  for (const [old, now] of Object.entries(layouts.RENAMED)) {
    const model = deck.parse(`<!-- .slide: data-layout="${old}" -->\n\n# T\n\nBody\n`);
    const expected = layouts.wasLayout(old) ? layouts.wasLayout(old).layout : now;
    assert.equal(model.slides[0].layout, expected, `${old} should read as ${expected}`);
  }
});

test("a two-column slide written as a layout keeps its second column", () => {
  // "columns" was a layout and is a field now. Reading only the layout off
  // such a deck would leave a plain text slide -- the second column gone,
  // silently, and for good at the next save.
  const model = deck.parse('<!-- .slide: data-layout="columns" -->\n\n# T\n\nleft\n\n<!-- .column -->\n\nright\n');
  const slide = model.slides[0];
  assert.equal(slide.layout, "text");
  assert.equal(slide.columnCount, "2");
  assert.ok(slide.content.includes("left"));
  assert.ok(slide.content.includes("right"));
});

test("a three-column slide written as a layout keeps all three", () => {
  const model = deck.parse('<!-- .slide: data-layout="spalten-drei" -->\n\n# T\n\na\n\n<!-- .column -->\n\nb\n\n<!-- .column -->\n\nc\n');
  assert.equal(model.slides[0].layout, "text");
  assert.equal(model.slides[0].columnCount, "3");
});

test("normalize cuts an over-long title instead of saving it whole", () => {
  const model = deck.normalize(deck.parse(`# ${"x".repeat(400)}\n`));
  assert.ok(model.slides[0].title.length < 400);
});

test("a gradient that is not one is refused", () => {
  assert.equal(deck.isGradient("linear-gradient(160deg, #0b3d4c 0%, #2b3a55 100%)"), true);
  assert.equal(deck.isGradient("url(http://example.com/x.png)"), false);
  assert.equal(deck.isGradient("red; background: url(x)"), false);
  assert.equal(deck.isGradient(""), false);
});

test("the head keeps title, theme and transition", () => {
  const written = deck.serialize(deck.normalize(deck.parse(
    "---\ntitel: Hello\ntheme: simple\ntransition: convex\n---\n\n# One\n",
  )));
  assert.match(written, /^---\n/);
  assert.match(written, /titel: Hello/);
  assert.match(written, /theme: simple/);
  assert.match(written, /transition: convex/);
});

test("a title with a newline in it cannot break the head open", () => {
  // The head is line-based; a title carrying a line break would end it
  // early and turn the rest of the deck into body text.
  const written = deck.serialize(deck.normalize({
    title: "One\nTwo", theme: "simple", transition: "none", slides: [],
  }));
  const head = written.split("\n---")[0];
  assert.ok(head.includes("One"));
  assert.ok(!/^Two/m.test(head));
  assert.equal(deck.parse(written).title.includes("\n"), false);
});

test("an empty document still yields a usable deck", () => {
  const model = deck.normalize(deck.parse(""));
  assert.ok(Array.isArray(model.slides));
  assert.equal(typeof model.title, "string");
});
