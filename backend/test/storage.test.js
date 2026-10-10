// Decks on disk, and the one place where user input becomes a path.
//
// DECKS_DIR is read when config.js is required, so it is set here before
// anything else is pulled in. node:test gives every file its own process,
// which is what makes that safe.
process.env.DECKS_DIR = require("node:fs")
  .mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "trivialslides-storage-"));

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const storage = require("../storage");
const deck = require("../deck");

const DECKS = process.env.DECKS_DIR;

test.after(() => fs.rmSync(DECKS, { recursive: true, force: true }));

test("folderFor refuses anything that is not a slug we made ourselves", () => {
  // The comment in storage.js calls this "the only place where user input
  // becomes a path", and it is: everything below would be a directory
  // traversal if it got through.
  for (const bad of [
    "..", "../..", "../../etc/passwd", "/etc/passwd", "a/b", "a\\b",
    "", " ", "-leading", "Upper", "ümlaut", "with space", "dot.dot",
    "x".repeat(61), "a%2f..%2fb", "a\0b",
  ]) {
    assert.equal(storage.folderFor(bad), null, `${JSON.stringify(bad)} should be refused`);
  }
});

test("folderFor accepts an ordinary slug and keeps it inside the decks folder", () => {
  for (const good of ["talk", "a", "quartalsbericht-2", "x".repeat(60)]) {
    const folder = storage.folderFor(good);
    assert.ok(folder, `${good} should be accepted`);
    assert.equal(path.dirname(folder), path.resolve(DECKS));
  }
});

test("slugify turns a title into something that can be a folder name", () => {
  assert.equal(storage.slugify("Quartalsbericht 2026"), "quartalsbericht-2026");
  assert.equal(storage.slugify("Äpfel, Öl & Übermut"), "aepfel-oel-uebermut");
  assert.equal(storage.slugify("Straße"), "strasse");
  assert.equal(storage.slugify("  "), "vortrag");
  assert.equal(storage.slugify(""), "vortrag");
  assert.equal(storage.slugify("///"), "vortrag");
  assert.ok(storage.slugify("x".repeat(200)).length <= 60);
});

test("every slug slugify produces is one folderFor accepts", () => {
  // The two halves of the same promise. A title that slugified into
  // something folderFor then refused would be a deck nobody could open.
  for (const title of [
    "Hello World", "Äpfel", "2026", "---", "a.b.c", "Ein sehr langer Titel " + "x".repeat(100),
    "!!!", "Ümlaut Straße Öl",
  ]) {
    const slug = storage.slugify(title);
    assert.ok(storage.folderFor(slug), `${title} -> ${slug} was refused`);
  }
});

test("a deck saved is a deck loaded back", () => {
  const model = deck.normalize(deck.parse("---\ntitel: Round Trip\ntheme: simple\ntransition: none\n---\n\n## A\n\nBody.\n"));
  storage.save("round-trip", model);
  assert.ok(fs.existsSync(path.join(DECKS, "round-trip", "deck.md")));
  const back = storage.load("round-trip");
  assert.equal(back.title, "Round Trip");
  assert.equal(back.slides.length, 1);
  assert.equal(back.slides[0].title, "A");
});

test("loading a deck that is not there answers with nothing, not with a throw", () => {
  assert.equal(storage.load("no-such-deck"), null);
  assert.equal(storage.load("../escape"), null);
  assert.equal(storage.exists("no-such-deck"), false);
});

test("create makes a deck and list finds it", () => {
  // create() answers with the slug it chose, which is the only thing the
  // caller cannot work out for itself (the title may already be taken).
  const slug = storage.create("A Fresh Talk");
  assert.equal(typeof slug, "string");
  assert.ok(storage.exists(slug));
  const found = storage.list().find((d) => d.slug === slug);
  assert.ok(found, "the new deck should be in the list");
  assert.equal(found.title, "A Fresh Talk");
});

test("a second deck of the same name gets a slug of its own", () => {
  const first = storage.create("Same Name");
  const second = storage.create("Same Name");
  assert.notEqual(first, second);
  assert.match(second, /-2$/);
  assert.ok(storage.exists(first) && storage.exists(second));
});

test("imagePath stays inside the deck's own assets folder", () => {
  // The second half of the path question: a file name arriving from a URL.
  for (const bad of ["../../etc/passwd", "../deck.md", "/etc/passwd"]) {
    const p = storage.imagePath("round-trip", bad);
    if (p === null) continue;
    assert.ok(path.resolve(p).startsWith(path.resolve(DECKS, "round-trip")),
      `${bad} escaped to ${p}`);
  }
});

test("list ignores a folder that holds no deck", () => {
  fs.mkdirSync(path.join(DECKS, "empty-folder"), { recursive: true });
  assert.ok(!storage.list().some((d) => d.slug === "empty-folder"));
});
