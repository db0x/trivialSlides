// The picture in the readme, made by the machine instead of by hand.
//
// It is one image but two screenshots: the editor in dark and the editor in
// light, cut along a slanted seam. A readme that shows only one of the two
// shows half the app, and the half it shows is whichever one the person
// taking the screenshot happened to be sitting in front of. Nobody
// remembers to take the other one -- hence this file.
//
// Nothing here touches a real deck. The app is started a second time, on a
// port of its own, pointed at a COPY of the deck in a temporary folder: the
// editor autosaves, and a browser driven across a deck will save it, so the
// deck that gets driven must be one nobody minds losing.
//
//   node tools/screenshot.js                  -> ../current.png
//   node tools/screenshot.js --language en    -> the English editor
//   node tools/screenshot.js --split vertical -> a straight cut, no slant
//
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");
const { browserPath } = require("../pdf");
const { DECKS_DIR } = require("../config");

const ROOT = path.resolve(__dirname, "..");

// The window the editor is photographed in. Not a phone and not a
// billboard: a laptop, which is what the readme's reader has in front of
// them and therefore what the picture should look like. deviceScaleFactor
// stays at 1 -- a sharper image would be four times the bytes in a file
// that git keeps every version of.
const DEFAULTS = {
  deck: "example",
  // -1 is the last slide. The example deck ends on the QR layout, which
  // happens to show the most of the editor at once: a layout with its own
  // fields, a preview with something in it, a full list beside it.
  slide: -1,
  width: 1600,
  height: 820,
  scale: 1,
  language: "de",
  split: "diagonal",
  // Where the seam crosses the middle of the picture, as a share of the
  // width, and how far it leans from there. Deliberately not 0.5: the
  // editor is three unequal columns, and a cut down the exact middle would
  // leave the light half holding little but the preview's empty surround.
  // At 0.40 the seam runs through the FORM, so the same fields appear in
  // both themes and the two can actually be compared.
  seam: 0.40,
  slant: 0.14,
  out: path.resolve(ROOT, "..", "current.png"),
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const name = String(argv[i]).replace(/^--/, "");
    const value = argv[i + 1];
    if (!(name in options) || value === undefined) {
      throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    }
    options[name] = typeof DEFAULTS[name] === "number" ? Number(value) : value;
  }
  if (!["diagonal", "vertical"].includes(options.split)) {
    throw new Error(`--split is either "diagonal" or "vertical", not "${options.split}"`);
  }
  options.out = path.resolve(options.out);
  return options;
}

// A port the kernel just told us is free. There is a gap between closing
// this listener and the app opening the same port, but on a developer's
// machine nothing is racing us for it.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// The deck the browser will be driven across -- a copy, in a folder that is
// thrown away afterwards. The assets come along: the slides reference them,
// and a deck whose pictures are missing photographs badly.
function copyDeck(slug) {
  const source = path.join(DECKS_DIR, slug);
  if (!fs.existsSync(source)) {
    throw new Error(`No deck "${slug}" in ${DECKS_DIR}`);
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "trivialslides-shot-"));
  fs.cpSync(source, path.join(folder, slug), { recursive: true });
  return folder;
}

async function startServer(decksDir, port) {
  const child = spawn(process.execPath, [path.join(ROOT, "app.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      DECKS_DIR: decksDir,
      PORT: String(port),
      BASE_PATH: "",
      // The picture should show the editor, not an AI button that only
      // appears on machines that happen to have a key lying around. One
      // readme image for everyone means the same editor for everyone.
      AI_KEY: "",
      ANTHROPIC_API_KEY: "",
      AI_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let noise = "";
  child.stdout.on("data", (d) => { noise += d; });
  child.stderr.on("data", (d) => { noise += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`The app stopped before it answered:\n${noise}`);
    }
    try {
      const answer = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (answer.ok) break;
    } catch (e) { /* not up yet -- that is what the loop is for */ }
    if (Date.now() > deadline) {
      throw new Error(`The app did not answer on ${base} within 20s:\n${noise}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { child, base };
}

// One screenshot: the editor, in the theme asked for, standing on the slide
// asked for.
async function shoot(browser, { base, options, theme }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.scale,
    });

    // Both of these before the first paint, and both for the same reason:
    // what the picture shows must not depend on the machine taking it.
    // reduce kills the editor's opening animation, so there is no moment at
    // which half the page is still sliding in (views/editor.ejs); the
    // colour scheme is the system setting the page falls back to when it
    // finds no choice of its own.
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: theme },
    ]);
    // The choice itself, in the place the page looks for it
    // (views/partials/head.ejs). It is set per origin, which is why it has
    // to be written here rather than handed over as a URL.
    await page.evaluateOnNewDocument((mode) => {
      try { localStorage.setItem("trivialslides:theme", mode); } catch (e) { /* no store, system setting stands */ }
    }, theme);
    // The editor's language lives in a cookie, because the server renders
    // most of its words (i18n.js).
    await page.setCookie({
      name: "trivialslides_language",
      value: options.language,
      domain: "127.0.0.1",
      path: "/",
    });

    await page.goto(`${base}/d/${options.deck}`, { waitUntil: "networkidle2", timeout: 30000 });

    // The slide cards are built in the browser from the deck, so they are
    // not in the markup the server sent (js/editor/slide-list.js).
    await page.waitForFunction(
      () => document.querySelectorAll("#slide-list .slide-card").length > 0,
      { timeout: 15000 },
    );

    const index = await page.evaluate((wanted) => {
      const cards = document.querySelectorAll("#slide-list .slide-card");
      const at = wanted < 0 ? cards.length + wanted : wanted;
      const card = cards[Math.max(0, Math.min(at, cards.length - 1))];
      card.scrollIntoView({ block: "nearest" });
      card.click();
      return Math.max(0, Math.min(at, cards.length - 1));
    }, options.slide);

    // The preview is an iframe that reloads when the slide changes, and the
    // thumbnails are images that arrive one by one. Waiting for the network
    // to go quiet covers both; the pause after it is for the last paint,
    // which no event announces.
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    const image = await page.screenshot({ type: "png" });
    return { image, index };
  } finally {
    await page.close();
  }
}

// The two halves into one picture. Done in the browser that just took them
// rather than with an image library, because the browser is already running
// and a second renderer would be a second dependency to install -- the same
// argument pdf.js makes for not bringing its own PDF writer.
async function compose(browser, { dark, light, options }) {
  const page = await browser.newPage();
  try {
    const url = await page.evaluate(async (data) => {
      const load = (bytes) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = "data:image/png;base64," + bytes;
      });
      const [a, b] = await Promise.all([load(data.dark), load(data.light)]);

      const canvas = document.createElement("canvas");
      canvas.width = a.naturalWidth;
      canvas.height = a.naturalHeight;
      const g = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      // Half the slant above the middle, half below, so the seam crosses
      // the centre however far it leans -- each theme keeps its half.
      const lean = data.slant * w / 2;
      const middle = data.seam * w;

      // Light underneath, dark clipped on top of it. Either order works;
      // this one means the polygon describes the dark half, which is the
      // half the seam is drawn along anyway.
      g.drawImage(b, 0, 0);
      g.save();
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(middle + lean, 0);
      g.lineTo(middle - lean, h);
      g.lineTo(0, h);
      g.closePath();
      g.clip();
      g.drawImage(a, 0, 0);
      g.restore();

      // A line on the seam. Without it the cut reads as a rendering fault
      // on the screenshots rather than as something somebody meant; a mid
      // grey is the one tone that stays visible against both sides.
      g.strokeStyle = "rgba(128, 140, 160, 0.9)";
      g.lineWidth = Math.max(2, Math.round(w / 800));
      g.beginPath();
      g.moveTo(middle + lean, 0);
      g.lineTo(middle - lean, h);
      g.stroke();

      return canvas.toDataURL("image/png");
    }, {
      dark: dark.toString("base64"),
      light: light.toString("base64"),
      seam: options.seam,
      slant: options.split === "vertical" ? 0 : options.slant,
    });
    return Buffer.from(url.split(",")[1], "base64");
  } finally {
    await page.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const chrome = browserPath();
  if (!chrome) {
    throw new Error("No browser found to take the screenshot with. Set BROWSER_PATH.");
  }

  const decksDir = copyDeck(options.deck);
  let server = null;
  let browser = null;
  try {
    const port = await freePort();
    server = await startServer(decksDir, port);
    console.log(`Editor running on ${server.base} against a copy of "${options.deck}".`);

    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=" + options.scale],
    });

    const shots = {};
    for (const theme of ["dark", "light"]) {
      const { image, index } = await shoot(browser, { base: server.base, options, theme });
      shots[theme] = image;
      console.log(`  ${theme}: slide ${index + 1}, ${image.length} bytes`);
    }

    const picture = await compose(browser, { dark: shots.dark, light: shots.light, options });
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, picture);
    console.log(`Wrote ${options.out} (${picture.length} bytes, ${options.split}).`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.child.kill("SIGTERM");
    fs.rmSync(decksDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
