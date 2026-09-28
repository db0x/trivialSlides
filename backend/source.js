// The deck's own Markdown, dressed for reading: the same text the download
// hands over (deck.serialize), but coloured, for the dialog in the editor.
//
// Not highlight.js alone. Its Markdown grammar knows headings, lists and
// emphasis, but it does not know THIS dialect: the front matter reads to it
// as a setext heading, the separators between slides are nothing to it, and
// the attribute comments that carry half the meaning of a trivialSlides
// file are plain text. So the lines that belong to the FORMAT are taken out
// first -- line by line, on the plain text, never with a regex over
// finished markup -- and each run of ordinary Markdown between them is
// handed to the highlighter as the ordinary Markdown it is.
//
// The same three shapes the reader (deck.js) knows, and no more: whatever
// is not one of them is Markdown and is treated as such.
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

// The front matter, if there is one. Read exactly as deck.js reads it: an
// opening "---" on the first line and a closing one further down -- without
// the closing line the first "---" was a slide separator after all and the
// file has no head.
function headLength(lines) {
  if (lines[0] === undefined || lines[0].trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

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

function markdownHtml(lines) {
  return hljs.highlight(lines.join("\n"), { language: "markdown" }).value;
}

// The whole file as one piece of markup, ready to be dropped into a <pre>.
function highlight(md) {
  const lines = String(md == null ? "" : md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const head = headLength(lines);
  if (head) out.push(headHtml(lines.slice(0, head)));

  // Markdown lines waiting for the highlighter. They are only handed over
  // once a line that is ours interrupts them, so a list or a paragraph
  // reaches the grammar in one piece.
  let block = [];
  let fence = false;
  const flush = () => {
    if (block.length) out.push(markdownHtml(block));
    block = [];
  };

  for (const line of lines.slice(head)) {
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

module.exports = { highlight };
