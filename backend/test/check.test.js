// What a hand-written source would COST when it is saved.
//
// deck.js is forgiving by design: it drops what it does not understand
// rather than refusing the file. That is right for a deck arriving from
// elsewhere and exactly wrong for one somebody is editing in front of us --
// they would press "apply" and watch a line disappear. check.js is what
// stands in between, and the route that saves refuses to write while it has
// found anything (routes/decks.js).
//
// So these tests are the other half of deck.test.js: that one asserts what
// is dropped, this one asserts that the dropping is REPORTED.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const check = require("../check");
const i18n = require("../i18n");
const { REPO_DECKS } = require("../tools/harness");

const HEAD = ["---", "titel: T", "theme: simple", "transition: none", "---", ""].join("\n");

function source(...body) {
  return HEAD + "\n" + body.join("\n") + "\n";
}

function keys(findings) {
  return findings.map((f) => f.key);
}

test("the example deck the repository ships is clean", () => {
  // Worth more than it looks: it means every layout, attribute and strip in
  // that file is one check.js recognises. A feature added without a rule
  // here turns the example red.
  const text = fs.readFileSync(path.join(REPO_DECKS, "example", "deck.md"), "utf8");
  const images = fs.readdirSync(path.join(REPO_DECKS, "example", "assets"));
  assert.deepEqual(check.check(text, images), []);
});

test("a source with nothing wrong with it reports nothing", () => {
  assert.deepEqual(check.check(source("## A", "", "Body text."), []), []);
});

test("a missing head is reported", () => {
  assert.ok(keys(check.check("## A\n", [])).includes("check.headMissing"));
});

test("an attribute line that is mistyped is reported", () => {
  // The cruellest silence in the format: the slide keeps every attribute's
  // effect in the editor until the next save, then loses all of them at
  // once. Note the missing colon after .slide.
  const found = check.check(source('<!-- .slide data-layout="text" -->', "", "## A"), []);
  assert.ok(keys(found).includes("check.attrBroken"), JSON.stringify(found));
});

test("an unknown attribute is reported by name", () => {
  const found = check.check(source('<!-- .slide: data-wat="1" -->', "", "## A"), []);
  const hit = found.find((f) => f.key === "check.attrUnknown");
  assert.ok(hit, JSON.stringify(found));
  assert.equal(hit.values.name, "data-wat");
});

test("a slide block with nothing in it is reported", () => {
  const found = check.check(source("## A", "", "---", "", "---", "", "## B"), []);
  assert.ok(keys(found).includes("check.slideEmpty"), JSON.stringify(found));
});

test("a finding points at the line it is about", () => {
  const found = check.check(source("## A", "", "---", "", '<!-- .slide: data-wat="1" -->', "", "## B"), []);
  const hit = found.find((f) => f.key === "check.attrUnknown");
  assert.ok(hit);
  // The head is six lines; the attribute stands on the eleventh.
  const lines = source("## A", "", "---", "", '<!-- .slide: data-wat="1" -->', "", "## B").split("\n");
  assert.equal(lines[hit.line - 1].includes("data-wat"), true,
    `line ${hit.line} is ${JSON.stringify(lines[hit.line - 1])}`);
});

test("a heading written at the wrong level is reported as a loss", () => {
  // Surprising but right: on a text slide the editor writes "## A", so a
  // source saying "# A" would not come back as written. check.lost is how
  // the dialog says "this line will not survive", which is the whole
  // contract -- the file you see after saving is the file on disk.
  const found = check.check(source("# A", "", "Body text."), []);
  assert.ok(keys(found).includes("check.lost"), JSON.stringify(found));
  // On a title slide the same line is exactly right.
  assert.deepEqual(check.check(source('<!-- .slide: data-layout="title" -->', "", "# A"), []), []);
});

test("a logo the folder does not hold is reported", () => {
  const text = ["---", "titel: T", "theme: simple", "transition: none",
    "footer-logo: nowhere.svg", "---", "", "## A", ""].join("\n");
  assert.ok(keys(check.check(text, [])).includes("check.bandLogo"));
});

test("the same source is clean once the picture is there", () => {
  const text = ["---", "titel: T", "theme: simple", "transition: none",
    "footer-logo: there.svg", "---", "", "## A", ""].join("\n");
  assert.deepEqual(keys(check.check(text, ["there.svg"])), []);
});

test("every finding check.js can raise has words in both languages", () => {
  // Read off the module rather than listed here, so a rule added with a new
  // key cannot pass without a sentence to go with it. A finding whose key
  // is missing reaches the dialog as the key itself.
  const module = fs.readFileSync(path.join(__dirname, "..", "check.js"), "utf8");
  const used = [...module.matchAll(/"(check\.[A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 5, `only found ${used.length} keys -- has check.js been rewritten?`);
  const gaps = [];
  for (const language of i18n.languages()) {
    for (const key of new Set(used)) {
      if (i18n.translate(language, key) === key) gaps.push(`${language}: ${key}`);
    }
  }
  assert.deepEqual(gaps, []);
});
