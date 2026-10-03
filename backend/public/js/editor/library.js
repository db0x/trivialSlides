// The library: every picture in the deck's folder, and where it stands.
//
// Three places can name a picture -- the image field of a slide, an image
// written into the body as Markdown, and the logo of one of the deck's two
// bands (js/editor/bands.js) -- and all three are counted here, because a
// file that any of them points at leaves a hole when it goes. The twin of
// this sum lives on the server (deck.js, imageUses), which is the one that
// has the last word when a file is actually deleted; this one answers
// while the deck is being edited, from the model in the page, which is the
// only thing that knows what the deck looks like right now.
//
// A picture nobody uses is dimmed and carries a button to delete it. One
// in use carries none: the way to be rid of it is to take it off the slide
// -- or out of the band -- which is a step whose effect one can see.
import { t } from "./base.js";

// Markdown images in the body. Reference-style ones are not seen -- the
// editor never writes one, and a file that carries one keeps its picture,
// it is only missing from this list.
var BODY_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

// The name as the renderer resolves it (render.js, imageUrl): the path in
// front is dropped, and an address pointing at somebody else's server is
// no business of this folder.
function imageName(href) {
  var s = String(href == null ? "" : href).trim();
  if (!s || /^(https?:)?\/\//i.test(s) || s.indexOf("data:") === 0) return "";
  return s.replace(/^.*\//, "");
}

// name -> where it stands: { slides, bands }. The numbers count from 1,
// the bands are named ("header", "footer"). Two lists rather than one,
// because the two read differently: "slide 3, 7" names places in the deck,
// a band names the whole of it.
export function imageUses(deck) {
  var out = {};
  function place(name) {
    if (!out[name]) out[name] = { slides: [], bands: [] };
    return out[name];
  }
  function add(name, nr) {
    if (!name) return;
    var on = place(name).slides;
    if (on[on.length - 1] !== nr) on.push(nr);
  }
  ["header", "footer"].forEach(function (which) {
    var logo = imageName((deck && deck[which] && deck[which].logo) || "");
    if (logo) place(logo).bands.push(which);
  });
  ((deck && deck.slides) || []).forEach(function (slide, i) {
    add(imageName(slide.image), i + 1);
    var hit;
    BODY_IMAGE.lastIndex = 0;
    while ((hit = BODY_IMAGE.exec(String(slide.content || "")))) add(imageName(hit[1]), i + 1);
  });
  return out;
}

// Where a picture stands, in one line. A band first and the slides after
// it: the band is the whole deck, and what holds for all of it belongs in
// front of what holds for three slides of it.
export function whereText(use) {
  var parts = ((use && use.bands) || []).map(function (which) { return t("bands." + which); });
  if (use && use.slides.length) parts.push(t("library.usedOn", { slides: use.slides.join(", ") }));
  return parts.length ? parts.join(" \u00b7 ") : t("library.unused");
}

// The list, drawn afresh. Short enough that there is nothing to gain from
// filling the rows in place the way the slide list has to (slide-list.js):
// the pictures here are <img> tags with a src, not pages in a frame, so a
// row that is built a second time costs the browser nothing it has not
// already got.
export function drawLibrary(list, deck, images, base, onDelete) {
  var uses = imageUses(deck);
  list.textContent = "";
  (images || []).forEach(function (name) {
    var use = uses[name];
    var used = !!(use && (use.slides.length || use.bands.length));
    var row = document.createElement("li");
    row.className = "library-row" + (used ? "" : " is-unused");
    row.dataset.name = name;

    var thumb = document.createElement("img");
    thumb.className = "library-thumb";
    thumb.src = base + "/assets/" + encodeURIComponent(name);
    thumb.alt = "";
    thumb.loading = "lazy";
    row.appendChild(thumb);

    var words = document.createElement("span");
    words.className = "library-words";
    var title = document.createElement("span");
    title.className = "library-name";
    title.textContent = name;
    // The file name is the one thing here that can be longer than the
    // column, and it is cut off in the middle of a word by the CSS -- so
    // the whole of it is in the tooltip.
    title.dataset.tip = name;
    words.appendChild(title);
    var where = document.createElement("span");
    where.className = "library-where";
    where.textContent = whereText(use);
    words.appendChild(where);
    row.appendChild(words);

    if (!used) {
      var weg = document.createElement("button");
      weg.type = "button";
      weg.className = "library-delete";
      weg.dataset.name = name;
      weg.setAttribute("aria-label", t("library.delete", { name: name }));
      weg.dataset.tip = t("library.delete", { name: name });
      weg.addEventListener("click", function () { onDelete(name); });
      row.appendChild(weg);
    }

    list.appendChild(row);
  });
}
