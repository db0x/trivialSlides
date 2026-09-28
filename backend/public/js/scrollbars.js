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
  instanzen.push(OverlayScrollbars(el, {
    scrollbars: {
      theme: thema(),
      // Visible while scrolling and on hover, gone otherwise -- the point
      // is to give the space back to the content.
      autoHide: "leave",
      autoHideDelay: 700,
    },
  }));
}

// The page itself, the three editor columns, the two input frames, the
// image gallery in the dialog and the emoji panel in the text bar.
// Selectors rather than ids, because the same file serves the overview and
// the editor.
// The editor fills the window and has no page scroll of its own -- only
// its columns scroll. Attaching one there would be a scrollbar for nothing.
// (Below 1100px the editor stacks and the page does scroll, natively.)
var sideScrolls = !document.body.classList.contains("side-editor");

[
  sideScrolls ? document.body : null,
  ...document.querySelectorAll(".column, .field-frame, .image-gallery, .emoji-panel, .menu-scroll"),
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
