// The one question server-side tests cannot reach: does what somebody types
// into the editor actually arrive in the file?
//
// Everything between the keystroke and the disk is browser code -- the form
// reading, the 900ms delay, the PUT, the save state in the header -- and
// none of it is required-in testable. So this drives a real browser over a
// real editor and then reads the .md off the disk.
//
// It skips itself where there is no browser, the way the PDF export is
// simply absent on such a machine rather than broken (pdf.js). CI has
// Chrome, so it runs there; a laptop without one still gets a green suite.
//
// The deck it drives is a COPY. The editor saves by itself: a browser
// driven over a deck rewrites it, and decks/example is in the repository.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const puppeteer = require("puppeteer-core");
const { browserPath } = require("../pdf");
const harness = require("../tools/harness");

const SLUG = "example";
const chrome = browserPath();

// Long enough for the editor's 900ms delay plus the round trip, with room
// for a loaded CI runner.
const SAVED = 4000;

test.describe("the editor in a real browser", { skip: chrome ? false : "no browser on this machine" }, () => {
  let decks;
  let server;
  let browser;
  let page;

  const deckFile = () => path.join(decks, SLUG, "deck.md");

  test.before(async () => {
    decks = harness.copyDeck(SLUG);
    server = await harness.startServer({ decksDir: decks });
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    // No opening animation, so nothing is half-way in when a click lands.
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto(`${server.base}/d/${SLUG}`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelectorAll("#slide-list .slide-card").length > 0,
      { timeout: 20000 });
  });

  test.after(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.stop();
    harness.removeDecks(decks);
  });

  test("the deck arrives with all its slides as cards", async () => {
    const cards = await page.$$eval("#slide-list .slide-card", (els) => els.length);
    const onDisk = fs.readFileSync(deckFile(), "utf8").match(/^-{3,4}$/gm) || [];
    assert.ok(cards > 1, `only ${cards} cards`);
    // The separators in the file, plus the first slide, minus the head's two.
    assert.equal(cards, onDisk.length - 1, `${cards} cards against ${onDisk.length} separators`);
  });

  test("a heading typed into the form reaches the file", async () => {
    // The whole point of this file.
    const wording = "Typed By A Test " + Date.now().toString(36);
    await page.click("#slide-list .slide-card");
    await page.waitForSelector("#slide-title", { visible: true });
    await page.$eval("#slide-title", (el) => { el.value = ""; });
    await page.click("#slide-title");
    await page.type("#slide-title", wording, { delay: 10 });

    await page.waitForFunction(
      (text, file) => fetch(file).then((r) => r.text()).then((t) => t.includes(text)),
      { timeout: SAVED, polling: 200 },
      wording, `${server.base}/d/${SLUG}/deck.md`);

    assert.match(fs.readFileSync(deckFile(), "utf8"), new RegExp(wording),
      "the words should be in the file on disk");
  });

  test("choosing another slide shows that slide's text", async () => {
    const handles = await page.$$("#slide-list .slide-card");
    await handles[handles.length - 1].click();
    await page.waitForFunction(
      () => document.querySelector("#slide-list .slide-card.is-active:last-child") !== null,
      { timeout: 5000 });
    const active = await page.$$eval("#slide-list .slide-card",
      (els) => els.findIndex((e) => e.classList.contains("is-active")));
    assert.equal(active, handles.length - 1);
  });

  test("the preview shows the slide rather than an empty frame", async () => {
    const frame = await (await page.$("#preview")).contentFrame();
    await frame.waitForSelector(".reveal .slides section", { timeout: 20000 });
    const text = await frame.$eval(".reveal .slides", (el) => el.textContent.trim());
    assert.ok(text.length > 0, "the preview is empty");
  });

  test("nothing in the browser console was an error", async () => {
    // A page that works but logs a TypeError on every keystroke is a page
    // on its way to not working.
    const messages = [];
    page.on("console", (m) => { if (m.type() === "error") messages.push(m.text()); });
    await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelectorAll("#slide-list .slide-card").length > 0,
      { timeout: 20000 });
    assert.deepEqual(messages, []);
  });

  test("the PDF export is a PDF", async () => {
    const res = await fetch(`${server.base}/d/${SLUG}/export.pdf`);
    assert.equal(res.status, 200);
    const head = Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString("latin1");
    assert.equal(head, "%PDF-");
  });
});
