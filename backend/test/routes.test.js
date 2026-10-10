// The app over HTTP, the way a browser meets it.
//
// One server for the whole file, started against a decks folder that is
// thrown away afterwards (tools/harness.js). Started as a process of its
// own rather than required in, so what is tested is the app as it really
// boots -- storage.ensure(), the i18n middleware, the error handler.
//
// No AI anywhere in here: the harness blanks the keys, so ai.available() is
// false and those routes are never registered. That absence is asserted
// once, because "absent rather than disabled" is a decision the app makes
// on purpose (app.js, ai.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const harness = require("../tools/harness");

const SLUG = "example";
let decks;
let server;
let base;

// The deck's file on disk, which is what most of these tests are really
// about: the HTTP answer matters less than what it left behind.
function onDisk(slug = SLUG) {
  return fs.readFileSync(path.join(decks, slug, "deck.md"), "utf8");
}

function get(url, init) {
  return fetch(base + url, init);
}

function send(url, body, extra) {
  return fetch(base + url, {
    method: (extra && extra.method) || "POST",
    headers: { "Content-Type": "application/json", ...harness.SAME_ORIGIN, ...((extra && extra.headers) || {}) },
    body: JSON.stringify(body),
    ...(extra && extra.raw ? extra.raw : {}),
  });
}

// A request built by hand, because fetch (like a browser) normalises a
// path away before sending it -- see the traversal test at the foot of this
// file for why that matters.
function rawStatus(line) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(server.port, "127.0.0.1", () => {
      socket.write(`GET ${line} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let answer = "";
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error(`no answer for ${line}`)); });
    socket.on("data", (chunk) => { answer += chunk; });
    socket.on("error", reject);
    socket.on("end", () => resolve(Number((/^HTTP\/1\.\d (\d+)/.exec(answer) || [])[1])));
  });
}

test.before(async () => {
  decks = harness.copyDeck(SLUG);
  server = await harness.startServer({ decksDir: decks });
  base = server.base;
});

test.after(async () => {
  if (server) await server.stop();
  harness.removeDecks(decks);
});

// --- Getting about -----------------------------------------------------

test("the overview answers", async () => {
  const res = await get("/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /example/i);
});

test("the editor renders the deck it was asked for", async () => {
  const res = await get(`/d/${SLUG}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>/);
  assert.ok(html.includes("slide-list"), "the list the cards are built into");
});

test("the preview, the talk and a thumbnail all render", async () => {
  for (const url of [`/d/${SLUG}/preview`, `/d/${SLUG}/present`, `/d/${SLUG}/thumb/0`]) {
    const res = await get(url);
    assert.equal(res.status, 200, `${url} answered ${res.status}`);
  }
});

test("the deck is served as JSON and as the Markdown file itself", async () => {
  const json = await (await get(`/d/${SLUG}/deck.json`)).json();
  assert.ok(Array.isArray(json.deck.slides));
  assert.ok(json.deck.slides.length > 1);

  const md = await (await get(`/d/${SLUG}/deck.md`)).text();
  assert.equal(md, onDisk(), "the download is the file on disk");
});

test("a deck that is not there is a 404, not a crash", async () => {
  assert.equal((await get("/d/no-such-deck")).status, 404);
  assert.equal((await get("/d/no-such-deck/deck.json")).status, 404);
});

// --- The doors that change something -----------------------------------

test("saving without the same-origin header is refused", async () => {
  // sameOriginOnly is the whole of this app's CSRF defence: it has no
  // login, so the one thing it can insist on is that the request came from
  // its own page (routes/decks.js).
  const before = onDisk();
  const res = await fetch(`${base}/d/${SLUG}/deck.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck: { title: "Hijacked", theme: "simple", transition: "none", slides: [] } }),
  });
  assert.equal(res.status, 403);
  assert.equal(onDisk(), before, "nothing was written");
});

test("saving with the header writes the file", async () => {
  const model = (await (await get(`/d/${SLUG}/deck.json`)).json()).deck;
  model.title = "Renamed By A Test";
  const res = await send(`/d/${SLUG}/deck.json`, { deck: model }, { method: "PUT" });
  assert.equal(res.status, 200);
  assert.match(onDisk(), /titel: Renamed By A Test/);

  model.title = "Example";
  await send(`/d/${SLUG}/deck.json`, { deck: model }, { method: "PUT" });
});

test("a draft is held rather than written", async () => {
  // Autosave off: the editor keeps sending its model, the server holds it.
  // "Not saved" has to mean that nothing was written.
  const before = onDisk();
  const model = (await (await get(`/d/${SLUG}/deck.json`)).json()).deck;
  model.title = "Only A Draft";
  const res = await send(`/d/${SLUG}/deck.json`, { deck: model, draft: true }, { method: "PUT" });
  assert.equal(res.status, 200);
  assert.equal(onDisk(), before, "a draft must not touch the file");
});

// --- The one door that checks and saves in a single call ---------------

test("a source with a fault comes back with findings and saves nothing", async () => {
  // The most important promise in the app: "Nothing is saved while anything
  // was found", because deck.js repairs in silence and a save past a
  // finding is the moment a line disappears without anybody being told.
  const before = onDisk();
  const broken = before + '\n---\n\n<!-- .slide: data-wat="1" -->\n\n## Gone\n';
  const res = await send(`/d/${SLUG}/source`, { text: broken, apply: true });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.findings.length > 0, "the fault should be reported");
  assert.ok(body.findings[0].text, "a finding carries words, not just a key");
  assert.equal(onDisk(), before, "the file must be untouched");
});

test("a clean source with apply is written", async () => {
  const before = onDisk();
  const clean = before.replace(/^titel: .*$/m, "titel: Saved Through The Door");
  const res = await send(`/d/${SLUG}/source`, { text: clean, apply: true });
  const body = await res.json();
  assert.deepEqual(body.findings, [], JSON.stringify(body.findings));
  assert.match(onDisk(), /titel: Saved Through The Door/);

  await send(`/d/${SLUG}/source`, { text: before, apply: true });
  assert.match(onDisk(), /titel: Example/, "and put back for the tests after this one");
});

test("a source without apply is only ever checked", async () => {
  const before = onDisk();
  const changed = before.replace(/^titel: .*$/m, "titel: Checked Only");
  const body = await (await send(`/d/${SLUG}/source`, { text: changed })).json();
  assert.deepEqual(body.findings, []);
  assert.equal(onDisk(), before, "checking is not saving");
});

// --- Pictures ----------------------------------------------------------

test("an uploaded picture lands in the deck's own folder", async () => {
  // A one-pixel PNG, written out here so the test carries its own fixture.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  const form = new FormData();
  form.append("image", new Blob([png], { type: "image/png" }), "A Test Picture.png");
  const res = await fetch(`${base}/d/${SLUG}/assets`, {
    method: "POST", headers: harness.SAME_ORIGIN, body: form,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fresh.length, 1);
  assert.equal(body.fresh[0], "a-test-picture.png", "the name is forced into a slug");
  assert.ok(fs.existsSync(path.join(decks, SLUG, "assets", body.fresh[0])));
});

test("a file that is not a picture is not written", async () => {
  const form = new FormData();
  form.append("image", new Blob([Buffer.from("#!/bin/sh\nrm -rf /\n")], { type: "text/plain" }), "evil.sh");
  const body = await (await fetch(`${base}/d/${SLUG}/assets`, {
    method: "POST", headers: harness.SAME_ORIGIN, body: form,
  })).json();
  assert.deepEqual(body.fresh, []);
  assert.ok(!fs.existsSync(path.join(decks, SLUG, "assets", "evil.sh")));
});

test("an uploaded picture cannot be named its way out of the folder", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  const form = new FormData();
  form.append("image", new Blob([png], { type: "image/png" }), "../../../escaped.png");
  const body = await (await fetch(`${base}/d/${SLUG}/assets`, {
    method: "POST", headers: harness.SAME_ORIGIN, body: form,
  })).json();
  for (const name of body.fresh) {
    const where = path.resolve(decks, SLUG, "assets", name);
    assert.ok(where.startsWith(path.resolve(decks, SLUG, "assets")), `${name} escaped`);
  }
  assert.ok(!fs.existsSync(path.resolve(decks, "escaped.png")));
  assert.ok(!fs.existsSync(path.resolve(decks, "..", "escaped.png")));
});

test("an asset is served, and only from inside the deck", async () => {
  assert.equal((await get(`/d/${SLUG}/assets/trivialslides.svg`)).status, 200);
  for (const bad of ["..%2F..%2Fdeck.md", "..%2Fdeck.md", "%2Fetc%2Fpasswd"]) {
    const res = await get(`/d/${SLUG}/assets/${bad}`);
    assert.ok(res.status >= 400, `${bad} answered ${res.status}`);
  }
});

// --- Publishing --------------------------------------------------------

test("the standalone export carries its own everything", async () => {
  // The readme promises "a single HTML file (runs without anything)". A
  // link back to this server would make that false the moment the file is
  // mailed to somebody.
  const html = await (await get(`/d/${SLUG}/export.html`)).text();
  assert.match(html, /<html/i);
  assert.ok(!html.includes("127.0.0.1"), "no address of the machine that made it");
  assert.ok(!/(src|href)="\/(?!\/)/.test(html), "no root-relative link back to us");
});

// --- The feature that is deliberately not here -------------------------

test("without a key the AI routes do not exist at all", async () => {
  // Absent, not disabled. The harness blanks AI_KEY and ANTHROPIC_API_KEY
  // so a developer's own key cannot make the suite call a real service.
  const res = await send(`/d/${SLUG}/compose`, { prompt: "a deck about bees" });
  assert.equal(res.status, 404, `compose answered ${res.status}`);
  assert.equal((await send("/material/pdf", {})).status, 404);
});

// --- Odds and ends -----------------------------------------------------

test("the language is remembered in a cookie", async () => {
  const res = await fetch(`${base}/language/en`, { method: "POST", headers: harness.SAME_ORIGIN, redirect: "manual" });
  assert.ok(res.status < 400, `answered ${res.status}`);
  assert.match(String(res.headers.get("set-cookie") || ""), /trivialslides_language=en/);
});

test("a new deck can be made and is then openable", async () => {
  const res = await fetch(`${base}/new`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...harness.SAME_ORIGIN },
    body: new URLSearchParams({ title: "Made By A Test" }),
    redirect: "manual",
  });
  assert.ok(res.status < 400, `answered ${res.status}`);
  assert.ok(fs.existsSync(path.join(decks, "made-by-a-test", "deck.md")));
  assert.equal((await get("/d/made-by-a-test")).status, 200);
});

test("a path that climbs out of the decks folder is refused", async () => {
  // Sent down a socket by hand rather than through fetch. fetch resolves
  // "/d/.." and even "/d/%2E%2E" away to "/" before anything leaves the
  // process, exactly as a browser's address bar would -- so testing this
  // through fetch would test the URL parser and pass while the server had
  // no defence at all. An attacker does not use fetch.
  for (const line of [
    "/d/..",
    "/d/%2E%2E",
    "/d/../../etc/passwd",
    "/d/example/assets/..%2F..%2Fdeck.md",
    "/d/example/assets/../../../../etc/passwd",
    "/d/Upper",
  ]) {
    const status = await rawStatus(line);
    assert.ok(status >= 400, `${line} answered ${status}`);
  }
});
