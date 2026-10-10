// One kind of scrollbar everywhere, on every platform: the native ones
// differ between Windows, macOS and the Linux desktops, and on the editor's
// three columns that difference is the loudest thing on the screen.
//
// Deliberately NOT applied to the content field itself. OverlayScrollbars
// moves the children of its target into a viewport of its own and appends
// two scrollbar elements beside them -- and the editor reads that field's
// innerHTML back as Markdown (see editor/index.js). Its frame scrolls
// instead, which leaves the field itself untouched.
import { OverlayScrollbars } from "../../overlayscrollbars/overlayscrollbars.mjs";

// The library's own naming is the other way round from ours: os-theme-dark
// is the DARK scrollbar, meant for a light surface.
function thema() {
  var dunkel = document.documentElement.getAttribute("data-theme");
  if (!dunkel) dunkel = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return dunkel === "dark" ? "os-theme-light" : "os-theme-dark";
}

var instanzen = [];

function anhaengen(el) {
  if (!el) return;
  var options = {
    scrollbars: {
      theme: thema(),
      // Visible while scrolling and on hover, gone otherwise -- the point
      // is to give the space back to the content.
      autoHide: "leave",
      autoHideDelay: 700,
    },
  };
  // The preview column scrolls up and down and never sideways: there is
  // nothing beside a slide to scroll to. Said outright rather than left to
  // the measurement, because the editor's opening brings the preview in
  // from the right (app.css) -- eighteen pixels past the edge for a quarter
  // of a second, which the library takes for content and then keeps a
  // horizontal bar for, long after the pixels have gone.
  if (el.classList.contains("preview")) options.overflow = { x: "hidden" };
  instanzen.push(OverlayScrollbars(el, options));
}

// The page itself, the editor columns that scroll as a whole, the two
// input frames, the image gallery, the deck's source and the emoji panel
// in the text bar.
// Selectors rather than ids, because the same file serves the overview and
// the editor.
// The editor fills the window and has no page scroll of its own -- only
// its columns scroll. Attaching one there would be a scrollbar for nothing.
// (Below 1100px the editor stacks and the page does scroll, natively.)
var sideScrolls = !document.body.classList.contains("side-editor");

[
  sideScrolls ? document.body : null,
  // Two columns are left out, for the same reason in both cases: neither
  // scrolls as a whole, and attaching one would move its children into a
  // viewport of its own and take the flex layout they stand in with it.
  //
  // The slide list does not scroll itself any more -- the list inside it is
  // scrolled by its own two buttons (js/slide-list-scroll.js). The source
  // column is a head, a scrolling middle and a foot, and it is the middle
  // that scrolls: .deck-source, which is in the list below on its own
  // account (js/editor/deck-source.js).
  ...document.querySelectorAll(".column:not(.slide-list):not(.source-view), .field-frame, .image-gallery, .deck-source, .emoji-panel, .menu-scroll"),
].forEach(anhaengen);

// The theme switch has to reach the scrollbars too, otherwise a dark
// scrollbar stays sitting on the newly dark surface.
function nachfuehren() {
  var t = thema();
  instanzen.forEach(function (i) {
    if (i) i.options({ scrollbars: { theme: t } });
  });
}
new MutationObserver(nachfuehren).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", nachfuehren);
