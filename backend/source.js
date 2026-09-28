// The deck's own Markdown, dressed for reading: the same text the download
// hands over (deck.serialize), but coloured and cut into the blocks it is
// made of, for the dialog in the editor.
//
// Two jobs, and they are the same walk through the file.
//
// The colouring is not highlight.js alone. Its Markdown grammar knows
// headings, lists and emphasis, but it does not know THIS dialect: the
// front matter reads to it as a setext heading, the separators between
// slides are nothing to it, and the attribute comments that carry half the
// meaning of a trivialSlides file are plain text. So the lines that belong
// to the FORMAT are taken out first -- line by line, on the plain text,
// never with a regex over finished markup -- and each run of ordinary
// Markdown between them is handed to the highlighter as the ordinary
// Markdown it is.
//
// The blocks are the same three shapes seen from further back: the head,
// and then one block per slide, each opened by the separator that starts
// it. What arrives here always comes from deck.serialize, so the blocks
// stand one for one against the slide list in the editor -- the fifth block
// is the fifth card.
const hljs = require("highlight.js");

// A separator between two slides -- three dashes horizontally, four
// vertically (deck.js parse()).
const SEPARATOR = /^(-{3}|-{4})$/;
// The comment lines that carry a slide's or a paragraph's attributes.
const ATTRIBUTES = /^\s*<!--\s*\.(?:slide|element):.*-->\s*$/;
// A fence opens and closes a code block; nothing inside one is ours.
const FENCE = /^\s*(?:```|~~~)/;
// A line of the front matter: "theme: white".
const HEAD_LINE = /^([A-Za-z_-]+)(\s*:\s*)(.*)$/;

function escape(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// --- The file into blocks ----------------------------------------------
// How many lines the front matter takes, if there is one. Read exactly as
// deck.js reads it: an opening "---" on the first line and a closing one
// further down -- without the closing line the first "---" was a slide
// separator after all and the file has no head.
function headLength(lines) {
  if (lines[0] === undefined || lines[0].trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

function blocksOf(lines) {
  const blocks = [];
  let i = headLength(lines);
  if (i) {
    const head = lines.slice(0, i);
    // The empty lines after the head belong with it. They are what
    // serialize() puts between the head and the first slide, and left to
    // the slide they would push its mark two lines above its first line.
    while (lines[i] !== undefined && lines[i].trim() === "") head.push(lines[i++]);
    blocks.push({ head: true, lines: head });
  }

  // A separator OPENS the block it introduces, so the mark of a slide
  // stands where its first line in the file stands.
  let current = { head: false, vertical: false, lines: [] };
  let fence = false;
  for (const line of lines.slice(i)) {
    if (FENCE.test(line)) {
      fence = !fence;
    } else if (!fence && SEPARATOR.test(line.trim())) {
      blocks.push(current);
      current = { head: false, vertical: line.trim() === "----", lines: [line] };
      continue;
    }
    current.lines.push(line);
  }
  blocks.push(current);
  return blocks;
}

// --- The lines of a block into markup ----------------------------------
function headHtml(lines) {
  return lines.map((line) => {
    if (line.trim() === "---") return `<span class="md-rule">${escape(line)}</span>`;
    const hit = HEAD_LINE.exec(line);
    if (!hit) return escape(line);
    return `<span class="md-key">${escape(hit[1])}</span>${escape(hit[2])}`
      + `<span class="md-value">${escape(hit[3])}</span>`;
  }).join("\n");
}

// An attribute comment, quiet as a whole with its values lifted out of it:
// these lines are long, and what one looks for in them is the values.
// Escaped first, then wrapped -- the pattern only ever sees text, and the
// quotation marks survive escaping untouched.
function attributesHtml(line) {
  const inner = escape(line).replace(/="([^"]*)"/g,
    (whole, value) => `="<span class="md-value">${value}</span>"`);
  return `<span class="md-attribute">${inner}</span>`;
}

function slideHtml(lines) {
  const out = [];
  // Markdown lines waiting for the highlighter. They are only handed over
  // once a line that is ours interrupts them, so a list or a paragraph
  // reaches the grammar in one piece.
  let block = [];
  let fence = false;
  const flush = () => {
    if (block.length) out.push(hljs.highlight(block.join("\n"), { language: "markdown" }).value);
    block = [];
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      fence = !fence;
      block.push(line);
      continue;
    }
    if (!fence && SEPARATOR.test(line.trim())) {
      flush();
      out.push(`<span class="md-rule">${escape(line)}</span>`);
      continue;
    }
    if (!fence && ATTRIBUTES.test(line)) {
      flush();
      out.push(attributesHtml(line));
      continue;
    }
    block.push(line);
  }
  flush();
  return out.join("\n");
}

// The whole file: one row per block, a mark on the left and the lines on
// the right. t translates the marks; without it they fall back to English,
// so the module stays usable on its own.
function highlight(md, t) {
  const say = t || ((key, values) => (key === "source.head" ? "Header" : "Slide " + values.n));
  const lines = String(md == null ? "" : md).replace(/\r\n/g, "\n").split("\n");
  let number = 0;
  return blocksOf(lines).map((block) => {
    const mark = block.head ? say("source.head") : say("source.slide", { n: ++number });
    // Attached below rather than after: the mark is indented for it, the
    // way the slide list indents the card (js/editor/slide-list.js).
    const kind = block.head ? " is-head" : (block.vertical ? " is-vertical" : "");
    const lines = block.head ? headHtml(block.lines) : slideHtml(block.lines);
    // The closing newline is not decoration. A block's last line is
    // usually the empty one before the next separator, and an unterminated
    // empty line draws no line box at all -- without this every block
    // would lose exactly the blank line that separates it from the next,
    // and the file would read denser here than it is.
    return `<div class="source-block"><span class="source-mark${kind}">${escape(mark)}</span>`
      + `<pre class="source-lines">${lines}\n</pre></div>`;
  }).join("");
}

module.exports = { highlight };
