// The speaker view that has an address (views/speaker.ejs).
//
// It listens to the talk over server-sent events (backend/speaker.js) and
// shows three things: the slide on the wall, the one after it, and the
// time. It does not control the talk -- the presenter's hand is on the
// stick, and the stick talks to the window on the beamer. What this is for
// is the glance down between two sentences.
//
// Plain script, no module and no build step, like everything else the
// pages here carry.
(function () {
  var body = document.body;
  var BASE = body.dataset.base || "";
  var SLUG = body.dataset.slug;
  var TOTAL = Number(body.dataset.total) || 0;

  var TEXTS = {};
  try {
    var table = document.getElementById("data-texte");
    if (table) TEXTS = JSON.parse(table.textContent);
  } catch (e) { /* the key showing through is loud enough */ }

  function t(key, values) {
    var text = TEXTS[key];
    if (text === undefined) return key;
    if (!values) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole;
    });
  }

  var nowFrame = document.getElementById("speaker-now");
  var nextFrame = document.getElementById("speaker-next");
  var countEl = document.getElementById("speaker-count");
  var clockEl = document.getElementById("speaker-clock");
  var timerEl = document.getElementById("speaker-timer");
  var resetButton = document.getElementById("speaker-timer-reset");
  var notesEl = document.getElementById("speaker-notes");
  var noNotesEl = document.getElementById("speaker-notes-none");
  var stateEl = document.getElementById("speaker-state");
  var nextPane = document.querySelector(".speaker-next");
  var nextBox = nextFrame.parentElement;
  // The word in the empty box at the end, handed to the stylesheet: a
  // ::after can be given content from an attribute, which keeps the
  // sentence in the language table where every other one lives.
  nextBox.dataset.end = t("speaker.end");

  // --- The two pictures --------------------------------------------------

  // A frame is only reloaded when it has to show a different slide.
  // Otherwise every fragment of a slide would restart two pages, and the
  // picture would blink through the whole talk.
  var showing = { now: null, next: null };

  function thumb(frame, which, index) {
    if (index === null) {
      if (showing[which] === null) return;
      showing[which] = null;
      frame.removeAttribute("src");
      frame.classList.add("is-empty");
      return;
    }
    if (showing[which] === index) return;
    showing[which] = index;
    frame.classList.remove("is-empty");
    frame.src = BASE + "/d/" + encodeURIComponent(SLUG) + "/thumb/" + index;
  }

  // The page inside a frame is 960 wide whatever this window comes to --
  // reveal's own layout width, which inside the frame IS the window
  // (css/thumb.css). So the frame is scaled from out here, by the only
  // one who knows how wide it came out: the browser.
  var SLIDE_WIDTH = 960;
  function fit() {
    document.querySelectorAll(".speaker-frame").forEach(function (box) {
      var width = box.clientWidth;
      if (width) box.style.setProperty("--thumb-scale", width / SLIDE_WIDTH);
    });
  }
  if (window.ResizeObserver) {
    var watcher = new ResizeObserver(fit);
    document.querySelectorAll(".speaker-frame").forEach(function (box) { watcher.observe(box); });
  }
  window.addEventListener("resize", fit);
  fit();

  // --- The time ----------------------------------------------------------

  // 24h, stated rather than left to the locale: this view is read at a
  // glance and in a hurry. hourCycle rather than hour12:false, because
  // the latter reads midnight as 24:05 in an en-US browser.
  function clock() {
    clockEl.textContent = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  }

  var start = Date.now();
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function stopwatch() {
    var seconds = Math.max(0, Math.round((Date.now() - start) / 1000));
    timerEl.textContent = pad(Math.floor(seconds / 3600)) + ":" +
      pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60);
  }
  resetButton.addEventListener("click", function () { start = Date.now(); stopwatch(); });

  function tick() { clock(); stopwatch(); }
  tick();
  setInterval(tick, 1000);

  // --- What the talk says ------------------------------------------------

  function show(state) {
    var index = state.index;
    var total = state.total || TOTAL;
    thumb(nowFrame, "now", index);
    thumb(nextFrame, "next", index + 1 < total ? index + 1 : null);
    countEl.textContent = t("speaker.slideOf", { n: index + 1, total: total });
    // The last slide has nothing after it. The box says so rather than
    // standing there empty, which reads as something gone wrong.
    nextPane.classList.toggle("is-end", index + 1 >= total);

    var notes = state.notes || "";
    notesEl.textContent = notes;
    notesEl.hidden = !notes;
    noNotesEl.hidden = !!notes;
    notesEl.parentElement.classList.toggle("is-empty", !notes);
  }

  function says(text, kind) {
    stateEl.textContent = text;
    stateEl.dataset.kind = kind;
  }

  // EventSource reconnects by itself, which is the whole reason for
  // choosing it: a laptop that slept, a proxy that dropped a quiet
  // connection, a server restarted between two talks -- none of that
  // needs a presenter to press anything.
  var stream = new EventSource(BASE + "/d/" + encodeURIComponent(SLUG) + "/speaker/stream");
  var ever = false;

  stream.addEventListener("open", function () {
    says(ever ? t("speaker.connected") : t("speaker.waiting"), "open");
  });

  stream.addEventListener("message", function (ev) {
    var state;
    try { state = JSON.parse(ev.data); } catch (e) { return; }
    if (!state || typeof state !== "object") return;
    ever = true;
    says(t("speaker.connected"), "live");
    show(state);
  });

  // Not an error worth shouting about: the browser is already trying
  // again, and the last picture stays on the screen meanwhile.
  stream.addEventListener("error", function () {
    says(t("speaker.lost"), "lost");
  });

  // The talk has not started yet, so there is nothing to show but the
  // first slide -- which is the one that will be on the wall in a moment.
  show({ index: 0, total: TOTAL, notes: "" });
})();
