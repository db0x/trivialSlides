// HTML -> PDF using a browser that is on the machine anyway.
//
// Why a browser and not a PDF library: the PDF should not REBUILD the
// slides but show exactly what the HTML version shows -- the same fonts,
// the same layouts, reveal.js' own page breaking. Only the engine that also
// displays the HTML version can do that. Any library would be a second
// renderer and therefore a second appearance.
//
// Hence puppeteer-core rather than puppeteer: just the remote control
// (about a megabyte), without its own Chromium download. The browser comes
// from the system -- inside the container the Dockerfile installs it.
const fs = require("fs");
const puppeteer = require("puppeteer-core");

// Where a browser may live. BROWSER_PATH beats the list, so a path it does
// not know about works too. The order is deliberate: the real executables
// first, the Snap packaging last -- it runs in its own view of the file
// system and cannot always create the working directory the browser
// needs.
const KANDIDATEN = [
  process.env.BROWSER_PATH,
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/brave-browser",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

// reveal.js' slide format. The PDF's page size is set by reveal itself via
// @page (slide plus margin); what follows is only the window the layout is
// computed in.
const BREITE = 960;
const HOEHE = 700;

function browserPfad() {
  return KANDIDATEN.find((p) => p && fs.existsSync(p)) || null;
}

function keinBrowser() {
  const err = new Error("Kein Browser gefunden, mit dem sich ein PDF erzeugen laesst.");
  err.code = "KEIN_BROWSER";
  return err;
}

// A browser costs memory and CPU time. Several requests at once would
// knock over a small server, so they run one after another -- an export
// takes seconds, nobody notices.
let warteschlange = Promise.resolve();

function nacheinander(arbeit) {
  const ergebnis = warteschlange.then(arbeit, arbeit);
  warteschlange = ergebnis.then(() => {}, () => {});
  return ergebnis;
}

async function erzeuge(html) {
  const pfad = browserPfad();
  if (!pfad) throw keinBrowser();

  return nacheinander(async () => {
    const browser = await puppeteer.launch({
      executablePath: pfad,
      headless: true,
      // --no-sandbox: inside the container the process runs as root, and
      // Chrome's sandbox needs privileges a container usually does not
      // have. Defensible here because this browser only ever opens our own
      // markup -- render.js discards raw HTML from a slide, so no foreign
      // script gets in at all.
      // --disable-dev-shm-usage: /dev/shm is small inside the container.
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const seite = await browser.newPage();
      await seite.setViewport({ width: BREITE, height: HOEHE });
      await seite.setContent(html, { waitUntil: "load", timeout: 30000 });
      // Do not print as soon as the page is up: reveal.js builds the page
      // breaks afterwards and announces itself with "pdf-ready". Printing
      // earlier yields a single page holding the first slide.
      await seite.waitForFunction("window.pdfFertig === true", { timeout: 30000 });
      // Buffer.from: puppeteer returns a Uint8Array, which express would
      // read as an object and send as JSON -- the recipient would get a
      // file full of numbers instead of a PDF.
      return Buffer.from(await seite.pdf({
        // Background colours and images belong to the slide, not to
        // decoration -- without this a section slide would come out white.
        printBackground: true,
        // The page size comes from reveal's @page rule: one page is
        // exactly one slide. Without it the browser uses A4 and scales.
        preferCSSPageSize: true,
        timeout: 60000,
      }));
    } finally {
      await browser.close();
    }
  });
}

module.exports = { erzeuge, browserPfad };
