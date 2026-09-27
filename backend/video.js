// Video on a slide: a YouTube player, embedded.
//
// What the file stores is the bare video id, never a URL. That is the whole
// security of this feature: the id is checked against a shape (eleven
// characters out of a known alphabet) and the address around it is built
// here, so nothing a user types can decide where the iframe points. A URL
// in the .md would put that decision back into the file.
//
// The editor accepts what people actually have in the clipboard -- a watch
// link, a youtu.be link, a /shorts/ link, an /embed/ link, or the id on its
// own -- and the pattern below is what picks the id out of it. It is handed
// to the page as well, so the browser and the server read a link the same
// way rather than each having their own idea of one.
const MUSTER = "(?:youtu\\.be/|[?&]v=|/embed/|/shorts/|/live/)?([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])";

const ID = /^[A-Za-z0-9_-]{11}$/;

function isId(wert) {
  return ID.test(String(wert || ""));
}

// Anything to an id, or "" if there is no id in it.
function toId(wert) {
  const s = String(wert == null ? "" : wert).trim();
  if (isId(s)) return s;
  const treffer = new RegExp(MUSTER).exec(s);
  return treffer ? treffer[1] : "";
}

// The player, trimmed down to what belongs on a wall:
//
//   rel=0             suggestions at the end stay with the same channel --
//                     a talk should not end in whatever the algorithm has
//                     in stock
//   controls=0        no control bar along the bottom. A click on the
//                     picture still pauses, which is the one thing a
//                     speaker needs mid-sentence
//   disablekb=1       the arrow keys belong to the talk, not to the player
//   iv_load_policy=3  no annotation overlays
//   enablejsapi=1     lets the slide start the player (js/folien-video.js)
//   playsinline=1     keeps a phone from throwing it into its own
//                     full screen
//
// What CANNOT be taken away is the title bar across the top, with the
// video's name, the channel and the YouTube mark: that is the branding
// YouTube requires in return for embedding. modestbranding=1 used to soften
// it and does nothing at all since 2023, so it is not in this list --
// a parameter with no effect only suggests it has one. The bar fades a few
// seconds after playback starts and comes back whenever the mouse passes
// over the player.
//
// youtube-nocookie: nothing is set until someone presses play.
function embedUrl(id) {
  return `https://www.youtube-nocookie.com/embed/${id}` +
    "?rel=0&controls=0&disablekb=1&iv_load_policy=3&enablejsapi=1&playsinline=1";
}

// The address for people: shown where the player cannot be, on paper above
// all.
function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

// The video's still image. Stands in for the player where there cannot be
// one -- in the exported file above all (js/folien-video.js).
//
// hqdefault rather than maxresdefault: it exists for every video, while
// maxres only exists for those uploaded in HD and otherwise answers with a
// placeholder. 480x360 is little for a whole slide, but it is a still
// behind a play mark, not the picture the talk is about.
function thumbUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// --- Where the text sits ------------------------------------------------
// A video slide has a heading and a body like any other, and they have to
// go somewhere in relation to the player. The arrangement itself is in
// slides.css, as with the layouts -- what is decided here is only which
// names a file may carry.
//
// "oben" is what a video slide looked like before there was a choice, so it
// is the default and the one a file does not have to spell out. An unknown
// name falls back to it rather than leaving the slide without an
// arrangement at all.
const SEITEN = ["oben", "unten", "links", "rechts"];
const SEITE_STANDARD = "oben";

function nurSeite(wert) {
  const s = String(wert == null ? "" : wert).trim();
  return SEITEN.includes(s) ? s : SEITE_STANDARD;
}

module.exports = { MUSTER, isId, toId, embedUrl, watchUrl, thumbUrl, SEITEN, SEITE_STANDARD, nurSeite };
