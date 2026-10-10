// The two fields that take whatever is in somebody's clipboard.
//
// A QR code and a video id both end up inside an HTML attribute that the
// renderer writes WITHOUT escaping -- serializeAttrs says so in as many
// words: "No escaping here, and none needed: toUrl lets nothing through
// that is not http(s) followed by characters that cannot close an
// attribute". These tests are the "and none needed" half of that sentence.
const test = require("node:test");
const assert = require("node:assert/strict");

const qr = require("../qr");
const video = require("../video");

test("a QR address that is not http(s) is refused", () => {
  for (const bad of [
    "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>x</script>",
    "vbscript:x", "file:///etc/passwd", "ftp://example.com",
  ]) {
    assert.equal(qr.toUrl(bad), "", `${bad} should be refused`);
  }
});

test("a QR address cannot carry a quotation mark out of its attribute", () => {
  for (const bad of ['https://example.com/" onclick="alert(1)', 'https://example.com/"', "https://example.com/'"]) {
    const out = qr.toUrl(bad);
    assert.ok(!out.includes('"'), `${bad} -> ${out}`);
  }
});

test("an ordinary address comes through as it is", () => {
  assert.equal(qr.toUrl("https://example.com"), "https://example.com");
  assert.equal(qr.toUrl("http://example.com/a/b?c=d"), "http://example.com/a/b?c=d");
  assert.equal(qr.toUrl("  https://example.com  "), "https://example.com", "surrounding space is trimmed");
});

test("a bare domain is read as https, which is what people paste", () => {
  assert.equal(qr.toUrl("example.com/x"), "https://example.com/x");
  assert.equal(qr.toUrl("github.com/db0x/trivialSlides"), "https://github.com/db0x/trivialSlides");
});

test("nothing at all stays nothing", () => {
  assert.equal(qr.toUrl(""), "");
  assert.equal(qr.toUrl(null), "");
  assert.equal(qr.toUrl(undefined), "");
});

test("an address longer than a code can hold is refused", () => {
  assert.equal(qr.toUrl("https://example.com/" + "x".repeat(qr.MAX_LENGTH + 10)), "");
});

test("a QR code is drawable and is an SVG", () => {
  const svg = qr.svg("https://example.com", {});
  assert.match(svg, /^<svg/);
  assert.ok(!svg.includes("<script"));
});

test("a video id is found in every shape YouTube hands out", () => {
  const id = "4ApMS8qYWo0";
  for (const shape of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=30`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    id,
  ]) {
    assert.equal(video.toId(shape), id, `${shape} should yield ${id}`);
  }
});

test("what is not a YouTube video yields nothing", () => {
  for (const bad of ["", "nonsense", "https://vimeo.com/123", "https://example.com/watch?v=x", null]) {
    assert.equal(video.toId(bad), "", `${JSON.stringify(bad)} should yield nothing`);
  }
});

test("a video id cannot carry anything out of its attribute", () => {
  const out = video.toId('abc" onload="alert(1)');
  assert.ok(!out.includes('"'), out);
});

test("the stored id becomes the addresses the page needs", () => {
  const id = "4ApMS8qYWo0";
  assert.ok(video.embedUrl(id).includes(id));
  assert.ok(video.watchUrl(id).includes(id));
  assert.match(video.embedUrl(id), /^https:\/\//);
  assert.match(video.watchUrl(id), /^https:\/\//);
});
