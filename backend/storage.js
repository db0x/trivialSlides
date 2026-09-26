// Storage on disk. One folder per deck:
//
//   decks/quartalsbericht/vortrag.md
//   decks/quartalsbericht/bilder/team.jpg
//
// The folder is the unit you send, back up or copy into an existing
// reveal.js project -- Markdown and images together, and the image paths
// inside the .md are relative to the folder.
const fs = require("fs");
const path = require("path");
const deck = require("./deck");
const { DECKS_DIR } = require("./config");

const DATEI = "vortrag.md";
const BILDER = "bilder";

// Turns a title into a folder name: ASCII, lower case, no path tricks.
// Deliberately strict -- the value ends up in a file path, and the title's
// proper spelling lives in the .md header anyway.
function slugify(titel) {
  const s = String(titel || "")
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
function ordnerFor(slug) {
  const s = String(slug || "");
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(s)) return null;
  return path.join(DECKS_DIR, s);
}

function sicherstellen() {
  fs.mkdirSync(DECKS_DIR, { recursive: true });
}

function existiert(slug) {
  const o = ordnerFor(slug);
  return !!o && fs.existsSync(path.join(o, DATEI));
}

// A free slug: "-2", "-3", ... is appended to "bericht" until one is
// no longer taken.
function freierSlug(titel) {
  const basis = slugify(titel);
  if (!existiert(basis)) return basis;
  for (let n = 2; n < 1000; n++) {
    if (!existiert(`${basis}-${n}`)) return `${basis}-${n}`;
  }
  return `${basis}-${Date.now().toString(36)}`;
}

function liste() {
  sicherstellen();
  return fs.readdirSync(DECKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existiert(e.name))
    .map((e) => {
      const datei = path.join(DECKS_DIR, e.name, DATEI);
      const m = deck.parse(fs.readFileSync(datei, "utf8"));
      return {
        slug: e.name,
        titel: m.titel || e.name,
        folien: m.folien.length,
        geaendert: fs.statSync(datei).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.geaendert.localeCompare(a.geaendert));
}

function lade(slug) {
  const o = ordnerFor(slug);
  if (!o || !fs.existsSync(path.join(o, DATEI))) return null;
  return deck.parse(fs.readFileSync(path.join(o, DATEI), "utf8"));
}

function speichere(slug, modell) {
  const o = ordnerFor(slug);
  if (!o) return false;
  fs.mkdirSync(o, { recursive: true });
  // Write alongside first, then rename: an interrupted write then leaves
  // the previous version behind rather than half a file.
  const tmp = path.join(o, `.${DATEI}.tmp`);
  fs.writeFileSync(tmp, deck.serialize(modell), "utf8");
  fs.renameSync(tmp, path.join(o, DATEI));
  return true;
}

function erstelle(titel) {
  sicherstellen();
  const slug = freierSlug(titel);
  const modell = {
    titel: String(titel || "").trim() || "Neuer Vortrag",
    theme: "white",
    transition: "slide",
    folien: [Object.assign(deck.neueFolie("titel"), { titel: String(titel || "").trim() || "Neuer Vortrag" })],
  };
  speichere(slug, modell);
  return slug;
}

// Images live in the deck's subfolder. The file name is generated on
// upload (routes/decks.js); here it is only checked against the same
// strict pattern as the slug.
function bildPfad(slug, name) {
  const o = ordnerFor(slug);
  if (!o) return null;
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(String(name || ""))) return null;
  if (String(name).includes("..")) return null;
  return path.join(o, BILDER, name);
}

function bilder(slug) {
  const o = ordnerFor(slug);
  if (!o || !fs.existsSync(path.join(o, BILDER))) return [];
  return fs.readdirSync(path.join(o, BILDER))
    .filter((n) => /\.(jpe?g|png|gif|webp|svg)$/i.test(n))
    .sort();
}

module.exports = { DATEI, BILDER, slugify, ordnerFor, existiert, liste, lade, speichere, erstelle, bildPfad, bilder, sicherstellen };
