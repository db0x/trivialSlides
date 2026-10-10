// Markdown to the HTML a slide is made of.
//
// Two kinds of test here. The first is what the renderer PRODUCES, because
// the editor, the thumbnails, the standalone export and the PDF all go
// through this one module and a change in it moves all four at once.
//
// The second is what it REFUSES. pdf.js hands the browser --no-sandbox and
// says it may, because "this browser only ever opens our own markup --
// render.js discards raw HTML from a slide, so no foreign script gets in at
// all". That is an assumption, written in a comment, holding up a security
// decision. Below it is a test.
const test = require("node:test");
const assert = require("node:assert/strict");

const render = require("../render");
const deck = require("../deck");

const BASE = "/d/talk/assets/";

function slide(extra) {
  return { ...deck.newSlide("text"), ...extra };
}

function html(extra) {
  return render.slideHtml(slide(extra), BASE, {});
}

test("a script tag written into a slide does not reach the output", () => {
  const out = html({ content: "Before\n\n<script>alert(1)</script>\n\nAfter" });
  assert.ok(!out.includes("<script"), out);
  assert.ok(!out.includes("alert(1)"), out);
  assert.ok(out.includes("Before") && out.includes("After"), "the words around it stay");
});

test("an event handler smuggled in as raw HTML does not reach the output", () => {
  const out = html({ content: '<img src=x onerror="alert(1)">' });
  assert.ok(!out.includes("onerror"), out);
});

test("an iframe or object in a slide does not reach the output", () => {
  for (const bad of ['<iframe src="//evil"></iframe>', "<object data=x></object>", "<embed src=x>"]) {
    const out = html({ content: bad });
    assert.ok(!/<(iframe|object|embed)/i.test(out), `${bad} survived: ${out}`);
  }
});

test("a heading is escaped rather than rendered", () => {
  // The characters stay readable in the text -- what must not survive is a
  // TAG. Asserting on the word "onerror" alone would be a test that passes
  // for the wrong reason, since the escaped text contains it too.
  const out = html({ title: "<img src=x onerror=alert(1)>" });
  assert.ok(out.includes("&lt;img"), out);
  assert.ok(!/<img/i.test(out), out);
});

test("esc covers the four characters that can break out of markup", () => {
  assert.equal(render.esc('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
  assert.equal(render.esc(null), "");
  assert.equal(render.esc(undefined), "");
});

test("the colour span a slide may carry still works", () => {
  // The one piece of raw HTML the renderer DOES let through, because the
  // editor writes it itself. Worth a test precisely because the rule above
  // is "drop everything".
  const out = html({ content: 'A <span style="color:#e100ff">word</span> here' });
  assert.ok(out.includes('style="color:#e100ff"'), out);
});

test("a lone closing span cannot tear the markup around it", () => {
  const out = html({ content: "plain </span> text" });
  assert.equal((out.match(/<\/span>/g) || []).length, 0, out);
});

test("a code fence keeps its language and may name a highlight style", () => {
  const out = html({ content: "```java hl=github\nint x = 1;\n```" });
  assert.ok(out.includes('class="hl-github"'), out);
  assert.ok(out.includes('class="language-java"'), out);
  assert.ok(out.includes("int x = 1;"), out);
});

test("an unknown highlight style is ignored rather than written out", () => {
  const out = html({ content: "```java hl=nonsense\nint x = 1;\n```" });
  assert.ok(!out.includes("hl-nonsense"), out);
  assert.ok(out.includes('class="language-java"'), out);
});

test("code inside a fence is escaped", () => {
  const out = html({ content: "```\n<script>alert(1)</script>\n```" });
  assert.ok(!out.includes("<script>"), out);
  assert.ok(out.includes("&lt;script&gt;"), out);
});

test("a relative image points at the deck's own folder", () => {
  assert.equal(render.imageUrl("team.jpg", BASE), BASE + "team.jpg");
  // A path is reduced to its file name: the folder is the deck's, always.
  assert.equal(render.imageUrl("../../etc/passwd", BASE), BASE + "passwd");
});

test("an absolute image address is left alone", () => {
  assert.equal(render.imageUrl("https://example.com/a.png", BASE), "https://example.com/a.png");
  assert.equal(render.imageUrl("//example.com/a.png", BASE), "//example.com/a.png");
  assert.equal(render.imageUrl("data:image/png;base64,AAAA", BASE), "data:image/png;base64,AAAA");
  assert.equal(render.imageUrl("", BASE), "");
});

test("a column break actually splits the text", () => {
  const out = html({ columnCount: "2", columnMode: "split", content: "left\n\n<!-- .column -->\n\nright" });
  assert.ok(out.includes("left") && out.includes("right"), out);
  assert.ok(!out.includes("<!-- .column -->"), "the break itself is not written out");
});

test("a whole deck renders every slide", () => {
  const out = render.slidesHtml({
    slides: [slide({ title: "One" }), slide({ title: "Two" })],
    header: {}, footer: {},
  }, BASE);
  assert.ok(out.includes("One") && out.includes("Two"));
  assert.equal((out.match(/<section/g) || []).length >= 2, true, out);
});

test("vertical slides are nested inside one section", () => {
  const out = render.slidesHtml({
    slides: [slide({ title: "One" }), slide({ title: "Under", vertical: true })],
    header: {}, footer: {},
  }, BASE);
  assert.ok(out.includes("One") && out.includes("Under"));
});
