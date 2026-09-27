// Storage on disk. One folder per deck:
//
//   decks/quartalsbericht/vortrag.md
//   decks/quartalsbericht/images/team.jpg
//
// The folder is the unit you send, back up or copy into an existing
// reveal.js project -- Markdown and images together, and the image paths
// inside the .md are relative to the folder.
const fs = require("fs");
const path = require("path");
const deck = require("./deck");
const { DECKS_DIR } = require("./config");

const FILE = "vortrag.md";
const IMAGES = "bilder";

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

function load(slug) {
  const o = folderFor(slug);
  if (!o || !fs.existsSync(path.join(o, FILE))) return null;
  return deck.parse(fs.readFileSync(path.join(o, FILE), "utf8"));
}

function save(slug, model) {
  const o = folderFor(slug);
  if (!o) return false;
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
  return path.join(o, IMAGES, name);
}

function images(slug) {
  const o = folderFor(slug);
  if (!o || !fs.existsSync(path.join(o, IMAGES))) return [];
  return fs.readdirSync(path.join(o, IMAGES))
    .filter((n) => /\.(jpe?g|png|gif|webp|svg)$/i.test(n))
    .sort();
}

module.exports = { FILE, IMAGES, slugify, folderFor, exists, list, load, save, create, imagePath, images, ensure };
