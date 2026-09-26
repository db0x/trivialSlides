// Runtime parameters. Same names as in Relay, so nothing has to be
// relearned when this moves over there.
const path = require("path");

// Sub-path behind a reverse proxy ("" or e.g. "/folien"). Always without a
// trailing slash, so that BASE + "/path" never turns into "//path".
const BASE = String(process.env.BASE_PATH || "").replace(/\/+$/, "");

// Where the decks live. Mounted inside the container, next to the project
// folder outside it -- that way the app also runs straight from
// `npm start` without Docker.
const DECKS_DIR = process.env.DECKS_DIR || path.resolve(__dirname, "..", "decks");

const PORT = Number(process.env.PORT || 5000);

// Upper limit for image uploads
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 16);

module.exports = { BASE, DECKS_DIR, PORT, MAX_UPLOAD_MB };
