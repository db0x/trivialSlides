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
// A plain script, not a module: it touches one element and needs nothing
// from the editor's own files.
(function () {
  var KEY = "trivialslides:form-width";
  // Percent of the editor's width. The floors in app.css (340px for the
  // form, 320px for the preview) are the second line of defence, for a
  // window so narrow that a quarter of it is less than that.
  var MIN = 25;
  var MAX = 75;
  var STEP = 2;

  var editor = document.querySelector(".editor");
  var handle = document.getElementById("column-split");
  var form = document.getElementById("slide-form");
  if (!editor || !handle || !form) return;

  function clamp(percent) {
    return Math.min(MAX, Math.max(MIN, percent));
  }

  // What the form takes at this moment, read off the page rather than
  // remembered: that way the untouched default -- which is no stored value
  // at all, just the fallback in the stylesheet -- can answer too.
  function share() {
    var total = editor.clientWidth;
    if (!total) return MIN;
    return (form.getBoundingClientRect().width / total) * 100;
  }

  function told(percent) {
    handle.setAttribute("aria-valuenow", String(Math.round(percent)));
  }

  function apply(percent, remember) {
    var p = clamp(percent);
    editor.style.setProperty("--form-width", p.toFixed(2) + "%");
    told(p);
    if (remember) {
      try { localStorage.setItem(KEY, p.toFixed(2)); } catch (e) { /* private window */ }
    }
  }

  // Back to the layout the stylesheet describes: the variable goes away
  // rather than being set to some number that merely looks like the
  // default.
  function reset() {
    editor.style.removeProperty("--form-width");
    told(share());
    try { localStorage.removeItem(KEY); } catch (e) { /* private window */ }
  }

  var saved = NaN;
  try { saved = parseFloat(localStorage.getItem(KEY)); } catch (e) { /* private window */ }
  // A value from an older version, or one edited by hand, is not allowed to
  // take the form below its quarter either.
  if (saved >= MIN && saved <= MAX) apply(saved, false);
  else told(share());

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
    var left = form.getBoundingClientRect().left;
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
