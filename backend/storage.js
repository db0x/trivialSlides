// Storage on disk. One folder per deck:
//
//   decks/quartalsbericht/deck.md
//   decks/quartalsbericht/assets/team.jpg
//
// The folder is the unit you send, back up or copy into an existing
// reveal.js project -- Markdown and pictures together, and the paths inside
// the .md are relative to the folder.
//
// "assets" rather than "images": pictures are what goes in there today, but
// the folder is the deck's luggage and there is no reason the name should
// have to change the first time something else travels with it.
const fs = require("fs");
const path = require("path");
const deck = require("./deck");
const { DECKS_DIR } = require("./config");

const FILE = "deck.md";
const ASSETS = "assets";

// Turns a title into a folder name: ASCII, lower case, no path tricks.
// Deliberately strict -- the value ends up in a file path, and the title's
// proper spelling lives in the .md header anyway.
function slugify(title) {
  const s = String(title || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "vortrag";
}

// The only place where user input becomes a path. Anything that does not
// look exactly like a slug we generated ourselves is rejected -- which
// deals with "..", absolute paths and special characters in one go.
function folderFor(slug) {
  const s = String(slug || "");
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(s)) return null;
  return path.join(DECKS_DIR, s);
}

function ensure() {
  fs.mkdirSync(DECKS_DIR, { recursive: true });
}

function exists(slug) {
  const o = folderFor(slug);
  return !!o && fs.existsSync(path.join(o, FILE));
}

// A free slug: "-2", "-3", ... is appended to "bericht" until one is
// no longer taken.
function freeSlug(title) {
  const base = slugify(title);
  if (!exists(base)) return base;
  for (let n = 2; n < 1000; n++) {
    if (!exists(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function list() {
  ensure();
  return fs.readdirSync(DECKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists(e.name))
    .map((e) => {
      const file = path.join(DECKS_DIR, e.name, FILE);
      const m = deck.parse(fs.readFileSync(file, "utf8"));
      return {
        slug: e.name,
        title: m.title || e.name,
        slides: m.slides.length,
        changed: fs.statSync(file).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.changed.localeCompare(a.changed));
}

// --- A deck being written in with autosave off -------------------------
// With autosave on, every pause in the typing writes the file. Switched
// off, the editor keeps sending its model exactly as before -- what
// changes is where this module puts it: here, until the Save button says
// otherwise.
//
// In memory and not in a second file beside the deck, because "not saved"
// has to mean that nothing was written or the word is worth nothing. What
// it costs is that a restart of the server drops what was never saved;
// what it buys is that everything else in this app -- the preview, the
// cards, the talk in its own tab, the export -- goes on reading ONE deck
// through load() below and needs to know nothing about any of this.
const drafts = new Map();

function keepDraft(slug, model) {
  if (!folderFor(slug)) return false;
  drafts.set(slug, model);
  return true;
}

function dropDraft(slug) {
  drafts.delete(slug);
}

function hasDraft(slug) {
  return drafts.has(slug);
}

function load(slug) {
  const o = folderFor(slug);
  if (!o || !fs.existsSync(path.join(o, FILE))) return null;
  // What is being written in beats what is on disk. Reopening the editor
  // therefore shows the unsaved work rather than the version before it,
  // and so does the talk -- which is the point of being able to present
  // without saving first.
  if (drafts.has(slug)) return drafts.get(slug);
  return deck.parse(fs.readFileSync(path.join(o, FILE), "utf8"));
}

function save(slug, model) {
  const o = folderFor(slug);
  if (!o) return false;
  // Written is written: whatever was being held for this deck is now the
  // file, and holding a copy of it would only be a second truth.
  drafts.delete(slug);
  fs.mkdirSync(o, { recursive: true });
  // Write alongside first, then rename: an interrupted write then leaves
  // the previous version behind rather than half a file.
  const tmp = path.join(o, `.${FILE}.tmp`);
  fs.writeFileSync(tmp, deck.serialize(model), "utf8");
  fs.renameSync(tmp, path.join(o, FILE));
  return true;
}

function create(title) {
  ensure();
  const slug = freeSlug(title);
  const model = {
    title: String(title || "").trim() || "New Vortrag",
    theme: "white",
    transition: "slide",
    slides: [Object.assign(deck.newSlide("titel"), { title: String(title || "").trim() || "New Vortrag" })],
  };
  save(slug, model);
  return slug;
}

// Images live in the deck's subfolder. The file name is generated on
// upload (routes/decks.js); here it is only checked against the same
// strict pattern as the slug.
function imagePath(slug, name) {
  const o = folderFor(slug);
  if (!o) return null;
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(String(name || ""))) return null;
  if (String(name).includes("..")) return null;
  return path.join(o, ASSETS, name);
}

function images(slug) {
  const o = folderFor(slug);
  if (!o || !fs.existsSync(path.join(o, ASSETS))) return [];
  return fs.readdirSync(path.join(o, ASSETS))
    .filter((n) => /\.(jpe?g|png|gif|webp|svg)$/i.test(n))
    .sort();
}

module.exports = { FILE, ASSETS, slugify, folderFor, exists, list, load, save, create, imagePath, images, ensure,
  keepDraft, dropDraft, hasDraft };
