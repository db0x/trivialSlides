// The line between the form and the preview, and the dragging of it.
//
// Which of the two wants the room changes from minute to minute: writing a
// long text wants the form wide, judging a layout by eye wants the preview
// wide. Only the person in front of the screen knows which it is right now,
// so this is theirs to set -- and it belongs to the browser, not to a deck,
// which is why it lives in localStorage like the preview's format and the
// light/dark choice do (js/preview-format.js, js/theme.js).
//
// Kept as a PERCENTAGE of the editor's width, not in pixels: a window that
// is made narrower or wider then divides what it has in the same
// proportion, with nothing to recompute. The form keeps a quarter whatever
// happens -- below that it stops being a form one can work in -- and the
// preview keeps the same quarter for the same reason, from the other side.
//
// ONE width, and the deck's source column shares it. That column stands in
// the tracks the list and the form leave behind (app.css) rather than in a
// grid of its own, so the seam is in the same place whether the form or
// the file is open -- and the preview beside it keeps its width across the
// switch. A second number for the file moved the preview every time the
// mode changed, which is the one thing it must not do: a slide cannot be
// judged in a frame that resizes under the eye.
//
// A plain script, not a module: it touches one element and needs nothing
// from the editor's own files.
(function () {
  // Percent of the editor's width. The floors in app.css (340px for the
  // form, 320px for the preview) are the second line of defence, for a
  // window so narrow that a quarter of it is less than that.
  var MIN = 25;
  var MAX = 75;
  var STEP = 2;

  var PROP = "--form-width";
  var KEY = "trivialslides:form-width";

  var editor = document.querySelector(".editor");
  var handle = document.getElementById("column-split");
  if (!editor || !handle) return;

  // The middle track of the grid and the one before it, in pixels as the
  // browser has worked them out. Read off the GRID rather than off the
  // form: while the file is open the form is not displayed and has no
  // width to measure, and the track it leaves behind is the very one the
  // seam still divides.
  function tracks() {
    var list = getComputedStyle(editor).gridTemplateColumns.split(" ").map(parseFloat);
    return { before: list[0] || 0, width: list[1] || 0 };
  }

  // The seam between the two is the grid's gap, and the drag has to count
  // it in -- one pixel, but one pixel is what the eye catches on a line it
  // put somewhere itself.
  function gap() {
    return parseFloat(getComputedStyle(editor).columnGap) || 0;
  }

  function clamp(percent) {
    return Math.min(MAX, Math.max(MIN, percent));
  }

  // What the middle track takes at this moment, read off the page rather
  // than remembered: that way the untouched default -- which is no stored
  // value at all, just the fallback in the stylesheet -- can answer too.
  function share() {
    var total = editor.clientWidth;
    if (!total) return MIN;
    return (tracks().width / total) * 100;
  }

  function told(percent) {
    handle.setAttribute("aria-valuenow", String(Math.round(percent)));
  }

  function apply(percent, remember) {
    var p = clamp(percent);
    editor.style.setProperty(PROP, p.toFixed(2) + "%");
    told(p);
    if (remember) {
      try { localStorage.setItem(KEY, p.toFixed(2)); } catch (e) { /* private window */ }
    }
  }

  // Back to the layout the stylesheet describes: the variable goes away
  // rather than being set to some number that merely looks like the
  // default.
  function reset() {
    editor.style.removeProperty(PROP);
    told(share());
    try { localStorage.removeItem(KEY); } catch (e) { /* private window */ }
  }

  // What was set last visit, back on the page. A value from an older
  // version, or one edited by hand, is not allowed to take either pane
  // below its quarter.
  var stored = NaN;
  try { stored = parseFloat(localStorage.getItem(KEY)); } catch (e) { /* private window */ }
  if (stored >= MIN && stored <= MAX) editor.style.setProperty(PROP, stored.toFixed(2) + "%");
  told(share());

  handle.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    // Pointer capture is what keeps the moves coming once the mouse has
    // crossed into the preview's iframe -- a document of its own, which
    // would otherwise keep them to itself.
    handle.setPointerCapture(ev.pointerId);
    handle.classList.add("is-dragging");
    document.body.classList.add("is-splitting");
    ev.preventDefault();
  });

  handle.addEventListener("pointermove", function (ev) {
    if (!handle.classList.contains("is-dragging")) return;
    var total = editor.clientWidth;
    if (!total) return;
    // Where the track being resized begins: the editor's own left edge,
    // plus the slide list in front of it and the seam between the two --
    // which is where the form starts, and where the file starts in its
    // place.
    var left = editor.getBoundingClientRect().left + tracks().before + gap();
    apply(((ev.clientX - left) / total) * 100, false);
  });

  function letGo(ev) {
    if (!handle.classList.contains("is-dragging")) return;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("is-splitting");
    if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
    // What is saved is where the line ENDED UP, not where it was dragged
    // to: on a narrow window the floors in the stylesheet have the last
    // word, and remembering a width that was never shown would move the
    // line on the next visit.
    apply(share(), true);
  }

  handle.addEventListener("pointerup", letGo);
  handle.addEventListener("pointercancel", letGo);

  // For whoever is not holding a mouse. Home is the way back, the same as
  // the double click.
  handle.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowLeft") apply(share() - STEP, true);
    else if (ev.key === "ArrowRight") apply(share() + STEP, true);
    else if (ev.key === "Home") reset();
    else return;
    ev.preventDefault();
  });

  handle.addEventListener("dblclick", reset);

  // The number a screen reader reads has to be the number on the screen,
  // and the screen can have changed since it was last set: a window resized
  // against one of the floors, or nothing dragged here ever.
  handle.addEventListener("focus", function () { told(share()); });
})();
