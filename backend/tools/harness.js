// Starting the app for something that is not a user: a test, or the script
// that photographs the editor for the readme.
//
// Both need the same three things and neither of them may have the real
// decks. The editor SAVES BY ITSELF -- a browser driven across a deck will
// rewrite it, and a test that saves is a test that destroys -- so what gets
// started here is always pointed at a throwaway folder. decks/example is in
// the repository and must come out of a run untouched.
//
// Lives in tools/ rather than in test/ because the screenshot script is its
// other reader, and that one is not a test. It was written there first
// (screenshot.js) and moved here once there were two callers; nothing in it
// is new.
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// The decks the repository ships, by their place on disk rather than
// through config.DECKS_DIR. A test has to copy the same deck on every
// machine, and DECKS_DIR is whatever the person running it has set.
const REPO_DECKS = path.resolve(ROOT, "..", "decks");

// What never reaches a server started from here, whatever the machine has
// in its environment.
//
// The key is the point: a developer who has ANTHROPIC_API_KEY exported for
// other tools would otherwise have their test run talk to a real service
// and bill them for it. The feature is deliberately out of the test suite,
// and the only way to be sure of that is to take the key away rather than
// to avoid calling it (config.js reads both names).
const NO_AI = {
  AI_KEY: "",
  ANTHROPIC_API_KEY: "",
  AI_URL: "",
  AI_MODEL: "",
};

// A port the kernel just told us is free. There is a gap between closing
// this listener and the app opening the same port, but nothing on a
// developer's machine or a CI runner is racing us for it.
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

// An empty decks folder, for whoever wants to create decks rather than find
// them. Thrown away by the caller (removeDecks).
function emptyDecks() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trivialslides-decks-"));
}

// A decks folder holding a COPY of one deck. The assets come along: the
// slides point at them, and a deck whose pictures are missing behaves
// differently from the one that was copied.
function copyDeck(slug, from) {
  const source = path.join(from || REPO_DECKS, slug);
  if (!fs.existsSync(source)) {
    throw new Error(`No deck "${slug}" in ${from || REPO_DECKS}`);
  }
  const folder = emptyDecks();
  fs.cpSync(source, path.join(folder, slug), { recursive: true });
  return folder;
}

function removeDecks(folder) {
  if (folder) fs.rmSync(folder, { recursive: true, force: true });
}

// The app, as a process of its own, on a port of its own, against the decks
// folder it is handed.
//
// A child process rather than requiring app.js: app.js listens as soon as
// it is required and reads DECKS_DIR at that moment (config.js), so a
// second decks folder in the same process would need the module cache
// cleared. Starting it the way a user starts it is both simpler and a truer
// test -- storage.ensure() and the startup checks run as they really do.
async function startServer(options) {
  const settings = options || {};
  const port = settings.port || (await freePort());
  const child = spawn(process.execPath, [path.join(ROOT, "app.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...NO_AI,
      DECKS_DIR: settings.decksDir,
      PORT: String(port),
      BASE_PATH: settings.basePath || "",
      ...(settings.env || {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Kept so that a server which dies on startup can say why. Without this
  // the failure is a timeout, which names nothing.
  let noise = "";
  child.stdout.on("data", (d) => { noise += d; });
  child.stderr.on("data", (d) => { noise += d; });

  const base = `http://127.0.0.1:${port}${settings.basePath || ""}`;
  const deadline = Date.now() + (settings.timeout || 20000);
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`The app stopped before it answered:\n${noise}`);
    }
    try {
      const answer = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (answer.ok) break;
    } catch (e) { /* not up yet -- that is what the loop is for */ }
    if (Date.now() > deadline) {
      throw new Error(`The app did not answer on ${base} in time:\n${noise}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    base,
    port,
    child,
    log: () => noise,
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    }),
  };
}

// The header routes that CHANGE something insist on (routes/decks.js,
// sameOriginOnly). Here so that a test which forgets it fails for the
// reason it meant to test, and not everywhere by accident.
const SAME_ORIGIN = { "X-Slides": "1" };

module.exports = {
  ROOT, REPO_DECKS, SAME_ORIGIN,
  freePort, emptyDecks, copyDeck, removeDecks, startServer,
};
