// A dialog that is meant to be worked in WHILE the preview is watched.
//
// Two of them by now -- the deck as Markdown and the deck's two bands --
// and both want the same three things that a <dialog> does not give: it is
// centred by the browser, which puts it over the very preview it is meant
// to be judged against; it veils the page behind it, and a slide judged
// through a veil is judged wrongly; and once it has been dragged aside,
// nobody wants to drag it aside again tomorrow.
//
// So this is that, once, for both:
//
//   moving     by the head, with the buttons in the head left alone -- a
//              drag that began on "Apply" would be a press that never
//              arrives.
//   remembering  where it was put, per browser, like the theme and the
//              presenter's keys (js/theme.js and neighbours).
//   the hole   in the veil: where the preview stands, written onto the
//              dialog as four custom properties for its backdrop to cut
//              out of itself (app.css, .dialog-aside::backdrop).
//
// The dialog decides whether it may also be PULLED at the corner. The
// source dialog may -- it shows a file, and how much of it one can see is
// the point. The bands dialog may not: it holds a handful of fields, and
// stretching them says nothing.
//
// And one of them decides to stay LIVE: a modal dialog makes the whole
// page behind it inert, the preview with it, and the element dialog is
// the one where that is wrong -- the element being written is on that
// preview and wants to be turned and pulled while its words are chosen.
// So that one is opened unmodal and veiled by hand (see veil below).
import { $ } from "./base.js";

// The corner the browser puts its own resizer in.
var GRIP = 18;

function between(value, low, high) {
  return Math.max(low, Math.min(value, high));
}

// dialog: the <dialog> itself. parts: key (where the box is remembered),
// frame (the box the veil is kept off, or nothing), resizable, live
// (opened unmodal, with a veil of this module's own making).
export function setupAside(dialog, parts) {
  var key = parts.key;
  var frame = parts.frame;
  var head = $(".dialog-head", dialog);
  if (!dialog || !head) return { opened: function () {} };

  function keep() {
    var box = dialog.getBoundingClientRect();
    try {
      localStorage.setItem(key, JSON.stringify({
        left: Math.round(box.left), top: Math.round(box.top),
        width: Math.round(box.width), height: Math.round(box.height),
      }));
    } catch (e) { /* private window, storage blocked */ }
  }

  // Taking the dialog over from the browser: from here on it is placed by
  // hand, so the centring margin has to go and the height has to be a
  // number -- a max-height would otherwise refuse every pull past it.
  function takeOver() {
    if (dialog.dataset.placed) return;
    var box = dialog.getBoundingClientRect();
    dialog.dataset.placed = "1";
    dialog.style.margin = "0";
    dialog.style.maxHeight = "none";
    dialog.style.left = box.left + "px";
    dialog.style.top = box.top + "px";
    dialog.style.width = box.width + "px";
    if (parts.resizable) dialog.style.height = box.height + "px";
  }

  // Back where it was last left, as far as the window still allows: a box
  // remembered on a wide screen must not put the dialog off a narrow one.
  function restore() {
    var box;
    try { box = JSON.parse(localStorage.getItem(key)); } catch (e) { box = null; }
    if (!box) return;
    var width = Math.min(box.width, window.innerWidth - 16);
    var height = Math.min(box.height, window.innerHeight - 16);
    dialog.dataset.placed = "1";
    dialog.style.margin = "0";
    dialog.style.maxHeight = "none";
    dialog.style.width = width + "px";
    // Only where a pull can have changed it. A dialog that is merely moved
    // keeps the height its fields come to, so that adding a line to it
    // later does not leave the dialog cut off at a height remembered from
    // a version that had one field less.
    if (parts.resizable) dialog.style.height = height + "px";
    dialog.style.left = between(box.left, 0, window.innerWidth - width) + "px";
    dialog.style.top = between(box.top, 0, window.innerHeight - (parts.resizable ? height : 0)) + "px";
  }

  // --- The hole in the veil ---------------------------------------------
  // Measured rather than assumed, and measured again whenever it can have
  // moved: the frame changes shape with the format chooser beside it, and
  // with the window.
  function clear() {
    if (!frame) return;
    var box = frame.getBoundingClientRect();
    var where = [dialog].concat(panes || []);
    where.forEach(function (el) {
      el.style.setProperty("--clear-x", Math.round(box.left) + "px");
      el.style.setProperty("--clear-y", Math.round(box.top) + "px");
      el.style.setProperty("--clear-w", Math.round(box.width) + "px");
      el.style.setProperty("--clear-h", Math.round(box.height) + "px");
    });
  }

  // --- The veil, where the dialog is live --------------------------------
  // ::backdrop is the browser's, and the browser only gives one to a modal
  // dialog -- which is exactly the kind this one may not be. So the veil is
  // built here: FOUR panes around the frame rather than one sheet with a
  // hole masked out of it, because a mask is only paint. The hole in a
  // masked sheet can be seen through and not reached through, and reaching
  // through it is the whole reason this dialog is live.
  var panes = null;

  function veil(on) {
    if (!parts.live) return;
    if (!panes) {
      panes = ["top", "bottom", "left", "right"].map(function (side) {
        var pane = document.createElement("div");
        pane.className = "dialog-veil dialog-veil-" + side;
        pane.hidden = true;
        document.body.appendChild(pane);
        return pane;
      });
    }
    panes.forEach(function (pane) { pane.hidden = !on; });
  }

  if (parts.live) {
    // The browser closes a modal dialog on Escape and an unmodal one not at
    // all. This one promises Escape either way (ext_readme), so it says so
    // itself.
    dialog.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      dialog.close();
    });
    dialog.addEventListener("close", function () { veil(false); });
  }

  if (frame && window.ResizeObserver) new ResizeObserver(clear).observe(frame);
  window.addEventListener("resize", clear);

  // --- Pulling at the corner --------------------------------------------
  // The browser's own resizer (CSS resize) does the pulling; all this does
  // is get out of its way in time and write down the result.
  if (parts.resizable) {
    var grabbed = null;
    dialog.addEventListener("pointerdown", function (ev) {
      var box = dialog.getBoundingClientRect();
      if (ev.clientX < box.right - GRIP || ev.clientY < box.bottom - GRIP) return;
      takeOver();
      grabbed = [dialog.offsetWidth, dialog.offsetHeight];
    });
    window.addEventListener("pointerup", function () {
      if (!grabbed) return;
      if (dialog.offsetWidth !== grabbed[0] || dialog.offsetHeight !== grabbed[1]) keep();
      grabbed = null;
    });
  }

  // --- Dragging by the head ---------------------------------------------
  var carry = null;
  head.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0 || ev.target.closest("button, input, a, textarea")) return;
    takeOver();
    var box = dialog.getBoundingClientRect();
    carry = { x: ev.clientX - box.left, y: ev.clientY - box.top, w: box.width, h: box.height };
    head.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  head.addEventListener("pointermove", function (ev) {
    if (!carry) return;
    dialog.style.left = between(ev.clientX - carry.x, 0, window.innerWidth - carry.w) + "px";
    dialog.style.top = between(ev.clientY - carry.y, 0, window.innerHeight - carry.h) + "px";
  });
  head.addEventListener("pointerup", function (ev) {
    if (!carry) return;
    carry = null;
    head.releasePointerCapture(ev.pointerId);
    keep();
  });

  // What the caller has to say after showModal(): put it back where it was
  // and measure the hole afresh. Both only make sense once the dialog is
  // on the screen and has a box of its own.
  return {
    opened: function () {
      restore();
      // Before the measuring: the panes are what gets measured into.
      veil(true);
      clear();
    },
  };
}
