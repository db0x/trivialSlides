// The colours each reveal.js theme brings with it.
//
// A slide that sets no colour of its own is not colourless: it wears the
// theme's. Nothing here knew which those were, so the contrast line under
// the editor's sample had to answer every such slide with "the theme
// decides" and judge nothing (public/js/editor/contrast.js) -- which is
// most slides, since leaving the colours alone is the normal way to use a
// theme. The colours are not hidden, though. Every theme declares them as
// custom properties at the top of its stylesheet, and carries one rule for
// the case where a slide's own background runs against the theme's own.
// Both are read here, once, when the server starts, and travel to the
// editor with the rest of the page (routes/decks.js).
//
// READ rather than written down. A table typed out here would be a copy of
// fourteen stylesheets that reveal.js is free to change at the next
// upgrade, and a copy that has quietly gone wrong is worse than none: it
// would be believed. The same reason contrast.js gives for never guessing
// a colour.
//
// A theme whose stylesheet cannot be read or does not declare its colours
// is simply left out of the table, and the editor falls back to saying the
// theme decides -- the answer it used to give for all of them.

const fs = require("fs");
const path = require("path");
const deck = require("./deck");

const THEME_DIR = path.join(__dirname, "node_modules", "reveal.js", "dist", "theme");

// --r-main-color and friends, as the themes declare them. The first
// occurrence is the one in :root; later ones belong to print or to a
// media query and are not what a slide on the wall wears.
function property(css, name) {
  const hit = new RegExp("--r-" + name + "\\s*:\\s*([^;]+);").exec(css);
  if (!hit) return "";
  const value = hit[1].trim();
  // A value pointing at another property is not a colour this can resolve,
  // and half a table is worse than an honest gap.
  return value.indexOf("var(") === 0 ? "" : value;
}

// The one rule every theme carries for a slide whose ground runs against
// its own: white type on a dark slide in a light theme, and the other way
// round. reveal.js decides which slides those are while the talk runs
// (backgrounds.js) and render.js marks the same ones for the thumbnails;
// here only the colour and the case it applies to are picked up.
//
// solarized has no such rule, and that absence is worth reading correctly
// rather than papering over: on a dark background of its own choosing its
// type really does stay where it is, which is exactly the kind of thing
// the contrast line exists to catch.
function flip(css) {
  const hit = /section\.has-(light|dark)-background[^{]*\{\s*color:\s*([^;}]+)/.exec(css);
  return hit ? { on: hit[1], color: hit[2].trim() } : null;
}

function read(name) {
  let css;
  try {
    css = fs.readFileSync(path.join(THEME_DIR, name + ".css"), "utf8");
  } catch (e) {
    return null;
  }
  const background = property(css, "background-color");
  const main = property(css, "main-color");
  if (!background || !main) return null;
  return {
    background,
    main,
    // Headings are coloured apart from the body in several themes (serif,
    // moon, dracula). Both go over, and the editor judges the worse of
    // them -- the same reason a gradient is judged by its worst stop.
    heading: property(css, "heading-color") || main,
    flip: flip(css),
  };
}

const COLORS = {};
deck.THEMES.forEach((name) => {
  const colors = read(name);
  if (colors) COLORS[name] = colors;
});

module.exports = { COLORS };
