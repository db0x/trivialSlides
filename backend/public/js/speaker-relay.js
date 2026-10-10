// What a running talk tells the world about itself.
//
// One POST per slide, to the channel in backend/speaker.js, from where a
// speaker view outside this browser hears it (js/speaker-view.js, and the
// application in desktop/). reveal.js' own speaker window needs none of
// this -- it is the window the talk opened and speaks to directly. This is
// for the one it did not.
//
// Only while PRESENTING: the editor's preview is a picture of a slide, not
// a talk, and nobody is following it from a lectern (views/reveal.ejs
// loads this script for the one and not the other).
(function () {
  var page = document.body;
  var BASE = page.dataset.base || "";
  var SLUG = page.dataset.slug;
  if (!SLUG || typeof Reveal === "undefined") return;

  // reveal.js counts in two dimensions, this app in one: the list in the
  // editor, the thumbnails, the deck file. The page already carries the
  // table that maps the one to the other (views/reveal.ejs, render.js).
  var INDICES = Array.isArray(window.indices) ? window.indices : [];
  var flat = {};
  INDICES.forEach(function (pair, i) { flat[pair[0] + ":" + pair[1]] = i; });

  function where() {
    var at = Reveal.getIndices();
    var index = flat[at.h + ":" + at.v];
    return typeof index === "number" ? index : 0;
  }

  // Speaker notes, the day the deck format has them. reveal.js reads them
  // off the slide as an aside.notes, so that is where this looks: nothing
  // produces one today, and this returns "" until something does.
  function notes() {
    var slide = Reveal.getCurrentSlide();
    var aside = slide && slide.querySelector("aside.notes");
    return aside ? aside.textContent.trim() : "";
  }

  var last = null;
  var pending = false;

  function send() {
    var at = Reveal.getIndices();
    var state = {
      index: where(),
      total: INDICES.length,
      notes: notes(),
      fragment: typeof at.f === "number" && at.f >= 0 ? at.f + 1 : 0,
      fragments: (Reveal.getCurrentSlide() &&
        Reveal.getCurrentSlide().querySelectorAll(".fragment").length) || 0,
    };
    var text = JSON.stringify(state);
    // A slide that has not moved is not news. reveal fires several events
    // for one step, and the talk should not spend the evening posting the
    // same sentence.
    if (text === last) return;
    last = text;

    // keepalive, so the last one still goes out while the window is being
    // closed: a talk that ended should not leave a speaker view believing
    // it is on slide nine forever.
    fetch(BASE + "/d/" + encodeURIComponent(SLUG) + "/speaker/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Slides": "1" },
      body: text,
      keepalive: true,
    }).catch(function () {
      // No listener, no server, no network: the talk goes on. The view
      // reconnects by itself and asks again (backend/speaker.js).
      last = null;
    });
  }

  // Several events can arrive for one movement -- a slide change and the
  // fragment on it. One frame is enough to let them settle.
  function soon() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; send(); });
  }

  ["ready", "slidechanged", "fragmentshown", "fragmenthidden", "overviewhidden"]
    .forEach(function (name) { Reveal.on(name, soon); });

  // Reveal may have been ready before this script was.
  if (Reveal.isReady()) soon();
})();
