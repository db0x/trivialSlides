// Runtime parameters. Same names as in Relay, so nothing has to be
// relearned when this moves over there.
const path = require("path");

// Sub-path behind a reverse proxy ("" or e.g. "/slides"). Always without a
// trailing slash, so that BASE + "/path" never turns into "//path".
const BASE = String(process.env.BASE_PATH || "").replace(/\/+$/, "");

// Where the decks live. Mounted inside the container, next to the project
// folder outside it -- that way the app also runs straight from
// `npm start` without Docker.
const DECKS_DIR = process.env.DECKS_DIR || path.resolve(__dirname, "..", "decks");

const PORT = Number(process.env.PORT || 5000);

// The app's public address including BASE_PATH, e.g.
// https://talks.example.com/slides. Only the link preview cards need it:
// Open Graph demands absolute URLs, and behind a reverse proxy the app
// cannot know its own public name. Left empty, the address is derived from
// the request -- right when running locally, wrong behind a proxy, where
// the preview would then point at an unreachable host.
const PUBLIC_URL = String(process.env.PUBLIC_URL || "").replace(/\/+$/, "");

// The app's own version, shown next to the mark in the header. Read from
// package.json so there is one place to bump it.
const VERSION = require("./package.json").version;

// Upper limit for image uploads
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 16);

// --- Building a deck from a prompt -------------------------------------
// The one feature of this app that talks to a service outside it. It is
// therefore OFF unless it has been pointed at one: without a key or an
// address, no route is registered and the editor renders no button -- the
// same way the PDF export is simply absent where no browser was found
// (pdf.js, app.js).
//
// Which service is deliberately the user's choice. Two request shapes
// cover nearly the whole field (ai.js, DIALECTS):
//
//   anthropic  Claude, the default
//   openai     the shape OpenAI established and almost everyone else
//              speaks -- Mistral, Groq, Together, OpenRouter, vLLM, and
//              the local servers: Ollama, LM Studio, llama.cpp
//
// A deck editor that demanded an account with one particular company would
// be an editor with a mortgage on it. This way the answer is "use what you
// have" -- or nothing at all, and let it run on your own machine.
const AI_API = String(process.env.AI_API || "anthropic").trim().toLowerCase();

// The key. AI_KEY is the name that fits whatever is configured;
// ANTHROPIC_API_KEY is read as well, because a machine that already
// exports it for other tools should need nothing new. Deliberately may be
// empty: a model on localhost wants no key, and demanding one would shut
// the door on the one way of using this that costs nothing.
//
// Read here and nowhere else; ai.js asks through a function, because in
// Relay the key belongs to the USER and not to the process -- a change of
// one argument rather than of this file.
const AI_KEY = String(process.env.AI_KEY || process.env.ANTHROPIC_API_KEY || "").trim();

// Where to send it. Empty means the dialect's own address, which is what
// anybody using the hosted service wants; a local or self-hosted model is
// the case this exists for.
const AI_URL = String(process.env.AI_URL || "").trim();

// Which model writes the deck. Sonnet where nothing is said and the
// dialect is Claude's -- deliberately the fast one: the format is a
// grammar with a validator in front of it (check.js), which is exactly the
// case where a smaller model does the job and simply takes one more round
// when it slips. For any other dialect there is no sensible guess, so the
// name has to be given.
const AI_MODEL = String(process.env.AI_MODEL
  || (AI_API === "anthropic" ? "claude-sonnet-5-5" : "")).trim();

// How often the model may be handed its own faults before we give up and
// show what there is. Two is enough for the slips that happen in practice;
// a model that is still wrong after three rounds is wrong about something
// a fourth will not fix either.
const AI_ROUNDS = Number(process.env.AI_ROUNDS || 2);

// A ceiling, per process and per hour. Not a business model -- a fuse:
// this app has no login of its own, and an endpoint that spends money on
// every call must not be able to spend it faster than a person can click.
// Thirty decks an hour is far more than anyone writes and far less than a
// loop can run up. Raise it where the app sits behind a login.
const AI_PER_HOUR = Number(process.env.AI_PER_HOUR || 30);

module.exports = { BASE, DECKS_DIR, PORT, MAX_UPLOAD_MB, PUBLIC_URL, VERSION,
  AI_API, AI_KEY, AI_URL, AI_MODEL, AI_ROUNDS, AI_PER_HOUR };
