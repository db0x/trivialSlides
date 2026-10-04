// The words out of a PDF, for the material a deck is built from (ai.js).
//
// A PDF somebody drops into the prompt dialog is SOURCE -- a paper, a
// report, a handout -- and not a picture to put on a slide. So nothing of
// it is kept: the text is pulled out, handed back to the dialog and
// appended to the material field, where it can be read, shortened and
// corrected before anything is sent. The file itself never reaches the
// deck's folder and never reaches the model.
//
// Done on the server rather than by passing the PDF to the model, and that
// is a decision with a reason: a model that reads PDFs natively is one
// particular model, and this app lets the user choose theirs (config.js,
// AI_API). Text works everywhere -- with Claude, with whatever speaks the
// openai shape, and with a model running on the user's own machine. It is
// also far cheaper in tokens, and it is the only one of the two where the
// user gets to SEE what the model will be working from.
//
// What it costs is the layout: columns, tables and the figures in the PDF
// do not survive. For the job at hand -- turning a document into talking
// points -- that is the part one would have thrown away anyway.
//
// The library is an OPTIONAL dependency. Without it installed this module
// says so and the dialog hides the PDF button; everything else in the app,
// this feature included, goes on working. That is the same promise the
// rest of the project makes about Chromium and about the model itself:
// what is not there is absent, not broken.
const MAX_CHARS = 200000;

// ESM, so it is imported rather than required -- and lazily, once, on the
// first PDF anybody drops in. Nothing is loaded in an instance where no
// PDF is ever dropped, which is most of them.
//
// What is kept is the PROMISE and not a flag beside the result. With a
// flag, a second caller arriving while the first import is still in the
// air finds "already tried" and an answer that has not been written yet,
// and concludes the library is missing -- which is exactly what the
// dialog asking "can you read PDFs" does a moment before the upload that
// needs it.
let loading = null;

function library() {
  if (!loading) {
    loading = import("unpdf").catch((err) => {
      console.error("unpdf is not installed, so PDFs cannot be read: " + err.message);
      return null;
    });
  }
  return loading;
}

// Whether a PDF can be read at all. Asked before the dialog offers it, so
// a missing library is a button that is not there rather than one that
// fails when pressed.
async function available() {
  return !!(await library());
}

// The pages, run together with a blank line between them. Not one long
// run: a paragraph that ends a page and one that starts the next are two
// paragraphs, and a model reading them as one sentence would invent a
// connection the document does not make.
function join(pages) {
  return (Array.isArray(pages) ? pages : [pages])
    .map((page) => String(page || "")
      // pdf.js puts a line break at every line of the ORIGINAL layout, so
      // a wrapped sentence arrives in pieces. Single breaks are folded
      // back into spaces, doubled ones -- which is where a paragraph
      // really ended -- are kept.
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/([^\n])\n([^\n])/g, "$1 $2")
      .replace(/\n{3,}/g, "\n\n")
      .trim())
    .filter(Boolean)
    .join("\n\n");
}

// buffer -> { text, pages } or an error. Deliberately gives back how many
// pages it read: a PDF that yields nothing is usually a scan, and that is
// worth telling the user rather than handing them an empty field.
async function read(buffer) {
  const un = await library();
  if (!un) {
    const err = new Error("unpdf is not installed");
    err.missing = true;
    throw err;
  }
  const file = new Uint8Array(buffer);
  const pdf = await un.getDocumentProxy(file);
  const out = await un.extractText(pdf, { mergePages: false });
  const text = join(out && out.text !== undefined ? out.text : out);
  return {
    text: text.slice(0, MAX_CHARS),
    pages: (out && out.totalPages) || (pdf && pdf.numPages) || 0,
    cut: text.length > MAX_CHARS,
  };
}

module.exports = { read, available, MAX_CHARS };
