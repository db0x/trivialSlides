// Code blocks: which languages the editor offers, which highlight.js styles
// a block may carry, and the stylesheet that makes per-block styles
// possible at all.
//
// A highlight.js style is a stylesheet for a whole page -- it says what
// .hljs and its two dozen token classes look like. To let two blocks on one
// slide wear different styles, every style is fenced into a class of its
// own here ("pre.hl-github ...") and they are served together. A block
// without a style keeps the plain monokai reveal.js brings along.
//
// Rewritten at runtime rather than checked in pre-scoped: this project has
// no build step, the files belong to the highlight.js package, and a copy
// would quietly go stale the next time that package is updated.
const fs = require("fs");
const path = require("path");

const STYLE_DIR = path.join(__dirname, "node_modules", "highlight.js", "styles");

// A handful rather than all 167: enough to find one that suits the slide
// theme, few enough to pick from a list without scrolling. Light ones
// first -- they are the ones the shipped default cannot offer.
const STYLES = [
  { id: "github", light: true },
  { id: "atom-one-light", light: true },
  { id: "stackoverflow-light", light: true },
  { id: "monokai", light: false },
  { id: "atom-one-dark", light: false },
  { id: "github-dark", light: false },
  { id: "nord", light: false },
];

// What the editor offers as a language. highlight.js knows around 170; this
// is the short list, and anything else can quiet be typed into the fence by
// hand -- the highlighter takes the name from there, not from this list.
// The label is what the dialog shows, the id is what goes into the .md.
const LANGUAGES = [
  { id: "", label: "Plain text" },
  { id: "bash", label: "Bash" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "kotlin", label: "Kotlin" },
  { id: "markdown", label: "Markdown" },
  { id: "php", label: "PHP" },
  { id: "python", label: "Python" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "sql", label: "SQL" },
  { id: "typescript", label: "TypeScript" },
  { id: "xml", label: "HTML / XML" },
  { id: "yaml", label: "YAML" },
];

const ids = new Set(STYLES.map((s) => s.id));

function isStyle(id) {
  return ids.has(String(id || ""));
}

// The themes address the code element in three shapes: ".hljs", "code.hljs"
// and "pre code.hljs". The class that carries the scope sits on the <pre>,
// so a plain descendant prefix would leave the third shape behind -- there
// is no <pre> inside a <pre>. Hence: a selector that already starts with
// "pre" has the class fused onto that "pre", everything else is scoped as a
// descendant of it.
function fence(css, id) {
  const scope = `pre.hl-${id}`;
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\})\s*([^{}]+?)\s*\{/g, (whole, close, selectors) => {
      const scoped = selectors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (/^pre\b/.test(s) ? s.replace(/^pre\b/, scope) : `${scope} ${s}`))
        .join(", ");
      return `${close}\n${scoped} {`;
    })
    .trim();
}

// Read and rewritten once. The files do not change while the app runs, and
// every editor and every presentation asks for them.
let cache = null;

function all() {
  if (cache) return cache;
  cache = {};
  for (const style of STYLES) {
    const file = path.join(STYLE_DIR, `${style.id}.css`);
    try {
      cache[style.id] = fence(fs.readFileSync(file, "utf8"), style.id);
    } catch (err) {
      // A style that is not there is one the editor should not offer, but
      // it must not take the page down with it.
      console.error(`code style ${style.id}: ${err.message}`);
      cache[style.id] = "";
    }
  }
  return cache;
}

// Every style, for the served pages: a handful of kilobytes, cached by the
// browser, and then any deck can use any of them.
function css() {
  const table = all();
  return STYLES.map((s) => table[s.id]).filter(Boolean).join("\n\n");
}

// Only the ones asked for, for the single-file export: what a deck does not
// use has no business travelling with it.
function cssFor(wanted) {
  const table = all();
  return wanted.filter((id) => table[id]).map((id) => table[id]).join("\n\n");
}

// Which styles a finished piece of slide markup actually uses.
//
// The class is read out of the whole class attribute, not off its own: a
// code block that is also a reveal step carries class="hl-github fragment"
// (render.js merges the two), and looking for the class alone would find
// nothing there -- the export would then leave the style behind and the
// block would show in the shipped default instead.
function usedIn(html) {
  const found = new Set();
  for (const hit of String(html).matchAll(/\sclass="([^"]*)"/g)) {
    for (const cls of hit[1].split(/\s+/)) {
      const name = /^hl-([a-z0-9-]+)$/.exec(cls);
      if (name && isStyle(name[1])) found.add(name[1]);
    }
  }
  return [...found];
}

module.exports = { STYLES, LANGUAGES, isStyle, css, cssFor, usedIn };
