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

module.exports = { BASE, DECKS_DIR, PORT, MAX_UPLOAD_MB, PUBLIC_URL, VERSION };
