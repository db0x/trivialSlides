// The editor. Keeps the deck's model in memory, mirrors it into the form
// fields and back, saves on a delay and keeps the preview current.
//
// Guiding idea: the model (deck) is the truth, the fields are merely its
// display. Every change takes the same route
//   field -> harvest() -> deck -> remember() -> save + preview
// so that no second, half-baked state can exist.
import { $, $$, t, schreibHead, verzoegert } from "./base.js";
import * as rt from "./richtext.js";
import { createPreview } from "./preview.js";
import { drawList, dragEnable } from "./slide-list.js";
import Coloris from "../../../coloris/dist/esm/coloris.js";

var BASE = window.SLIDES_BASE;
var deck = JSON.parse($("#data-deck").textContent);
var LAYOUTS = JSON.parse($("#data-layouts").textContent);
var images = JSON.parse($("#data-images").textContent);
var layoutsById = {};
LAYOUTS.forEach(function (l) { layoutsById[l.id] = l; });

var active = 0;
var sourceMode = false; // shows the current slide as Markdown
var schmutzig = false;

var el = {
  list: $("#slide-list"),
  title: $("#slide-title"),
  content: $("#slide-content"),
  contentFrame: $("#content-frame"),
  sourceText: $("#slide-source-text"),
  sourceFrame: $("#source-frame"),
  sourceNote: $("#source-note"),
  sourceButton: $("#source-toggle"),
  source: $("#slide-source"),
  video: $("#slide-video"),
  url: $("#slide-url"),
  urlNote: $("#url-note"),
  qrColor: $("#qr-color"),
  qrBackground: $("#qr-background"),
  qrTextColor: $("#qr-text-color"),
  videoNote: $("#video-note"),
  textSideMenu: $("#text-side-menu"),
  textSideButton: $("#text-side-button"),
  textWidthMenu: $("#text-width-menu"),
  textWidthButton: $("#text-width-button"),
  fieldImage: $(".field-image"),
  fieldSource: $(".field-source"),
  fieldVideo: $(".field-video"),
  fieldUrl: $(".field-url"),
  fieldQrColors: $(".field-qr-colors"),
  imagePreview: $("#image-preview"),
  imageRemove: $("#image-remove"),
  layoutHint: $("#layout-hint"),
  state: $("#save-state"),
  customColor: $("#background-custom"),
  customTextColor: $("#text-color-custom"),
  gradient: $("#slide-gradient"),
  gradientHint: $("#gradient-hint"),
  gradientVorlagen: $("#gradient-presets"),
  effectTiles: $("#effect-tiles"),
  colorsGroup: $("#colors-group"),
  codeButton: $("#code-insert"),
  codeDialog: $("#code-dialog"),
  codeLanguage: $("#code-language"),
  codeStyle: $("#code-style"),
  codeText: $("#code-text"),
  codeTitle: $("#code-title"),
  codeOk: $("#code-ok"),
  codeNote: $("#code-note"),
  codeFragment: $("#code-fragment"),
  presentFromCurrent: $("#present-from-current"),
};

var preview = createPreview($("#preview"), BASE);

// --- Notices -------------------------------------------------------------
// One dialog, one line of text. The browser's alert would do the same job,
// but it cannot be styled, it announces the host it comes from, and it
// stops the page dead -- see views/editor.ejs.
var noteDialog = $("#note-dialog");
var noteText = $("#note-text");

function note(text) {
  noteText.textContent = text;
  noteDialog.showModal();
}

// --- Saving ------------------------------------------------------------
function stateShow(text, cls) {
  el.state.textContent = text;
  el.state.className = "save-state " + (cls || "");
}

function saveNow() {
  harvest();
  return fetch(BASE + "/deck.json", {
    method: "PUT",
    headers: schreibHead({ "Content-Type": "application/json" }),
    body: JSON.stringify({ deck: deck }),
  })
    .then(function (r) {
      if (!r.ok) throw new Error("Status " + r.status);
      return r.json();
    })
    .then(function (d) {
      // The server normalises (truncates, drops values that are not
      // allowed). Its version is the truth from here on -- otherwise the
      // editor would show something other than what the file holds.
      deck = d.deck;
      schmutzig = false;
      // Saved is the normal state, and the normal state says nothing.
      // What is worth a word is the wait and the failure.
      stateShow("");
    })
    .catch(function (e) {
      console.error(e);
      stateShow(t("state.offline"), "is-error");
    });
}

var saveSoon = verzoegert(900, saveNow);

// Anything that wants to leave the page -- the language switch, for one --
// has to be able to flush what is quiet owed. Saving is on a delay, and a
// reload inside that window would throw the last keystroke away.
window.trivialSlidesSave = function () {
  return schmutzig ? saveNow() : Promise.resolve();
};

function remember() {
  harvest();
  schmutzig = true;
  // Deliberately silent. Saving follows within the second, and a label
  // reading "not saved" after every keystroke would be a complaint about
  // the normal course of things. What guards the real risk -- leaving with
  // something unsaved -- is the beforeunload below.
  saveSoon();
  previewSoon();
}

var previewSoon = verzoegert(350, function () {
  preview.slideZeichnen(active, deck.slides[active]);
});

// Structural changes: save first, then rebuild the preview completely --
// it renders from the file, not from the browser's memory.
function structureChanged(newIndex) {
  active = Math.max(0, Math.min(newIndex == null ? active : newIndex, deck.slides.length - 1));
  drawAll();
  saveNow().then(function () { preview.newLoad(active); });
}

window.addEventListener("beforeunload", function (ev) {
  if (!schmutzig) return;
  ev.preventDefault();
  ev.returnValue = "";
});

// --- Fields <-> model --------------------------------------------------
// harvest(): reads the form fields into the model. Called before every save
// and before every slide change, so that no input is ever lost that the
// delayed save has not seen yet.
function harvest() {
  var slide = deck.slides[active];
  if (!slide) return;
  deck.title = $("#deck-title").value;
  deck.theme = $("#deck-theme").value;
  deck.transition = $("#deck-transition").value;
  // An empty field on a slide that never had a heading leaves it without
  // one; on a slide that has an empty heading it keeps that heading. The
  // one field cannot say which is meant, so what the slide already is
  // decides -- which is what makes a hand-written "##" survive being opened
  // here (deck.js).
  slide.title = el.title.value === "" && slide.title == null ? null : el.title.value;
  slide.content = sourceMode ? el.sourceText.value : rt.htmlToMd(el.content);
  slide.source = el.source.value;
  // Passed on as typed: the server picks the id out of it (video.js), and
  // it does so for the live preview too. So a pasted link is a video
  // before it has been saved anywhere.
  slide.video = el.video.value;
  slide.url = el.url.value;
  // The bar shows the side as an icon, so the chosen one lives on the
  // button rather than in a field value.
  slide.textSide = el.textSideButton.dataset.side || "oben";
  slide.textWidth = el.textWidthButton.dataset.width || defaultWidth();
  // The gradient field takes CSS, so at any moment it may hold something
  // half-typed. Only a complete gradient goes into the model -- the rest
  // stays in the field and is named as unfinished, instead of quietly
  // stripping the slide of the background it quiet has.
  var gradient = el.gradient.value.trim();
  if (!gradient || el.gradient.checkValidity()) slide.gradient = gradient;
}

function showSlide() {
  var slide = deck.slides[active];
  if (!slide) return;
  el.title.value = slide.title || "";   // null and "" both show as empty

  // Rich text or source? Slides with Markdown outside our subset are
  // shown as source rather than damaged on the way back.
  var einfach = rt.isSimple(slide.content);
  sourceMode = !einfach;
  setContentMode(slide);

  el.source.value = slide.source || "";
  el.video.value = slide.video || "";
  el.url.value = slide.url || "";
  showUrl();
  // A slide that has never been arranged is arranged the way it has always
  // looked, so the button shows the same thing the slide does.
  showTextSide(slide.textSide || "oben");
  showTextWidth(slide.textWidth || defaultWidth());
  showVideo();

  $$(".layout-tile").forEach(function (k) {
    k.classList.toggle("is-active", k.dataset.layout === slide.layout);
  });
  el.layoutHint.textContent = (layoutsById[slide.layout] || {}).hint || "";

  var def = layoutsById[slide.layout] || { fields: [] };
  el.fieldImage.hidden = def.fields.indexOf("image") === -1;
  el.fieldSource.hidden = def.fields.indexOf("source") === -1;
  el.fieldVideo.hidden = def.fields.indexOf("video") === -1;
  el.fieldUrl.hidden = def.fields.indexOf("url") === -1;
  el.fieldQrColors.hidden = def.fields.indexOf("qrColor") === -1;
  el.textSideMenu.hidden = def.fields.indexOf("textSide") === -1;
  el.textWidthMenu.hidden = def.fields.indexOf("textWidth") === -1;
  // A menu left standing open over a layout that no longer has the button
  // would hang in the bar with nothing under it.
  if (el.textSideMenu.hidden) el.textSideMenu.open = false;
  if (el.textWidthMenu.hidden) el.textWidthMenu.open = false;
  showImage(slide.image);

  // The code's colours show what the slide will actually look like, so an
  // unset one shows the value it falls back to rather than nothing. The
  // file stays clean all the same: a value equal to the default is not
  // written (deck.js).
  showColorField(el.qrColor, slide.qrColor || "#000000");
  showColorField(el.qrBackground, slide.qrBackground === undefined ? "#ffffff" : slide.qrBackground);
  showColorField(el.qrTextColor, slide.qrTextColor || "");
  showColorField(el.customColor, slide.background);
  showColorField(el.customTextColor, slide.textColor);
  el.gradient.value = slide.gradient || "";
  gradientShow();
  $$(".effect-tile").forEach(function (k) {
    k.classList.toggle("is-active", k.dataset.effect === (slide.effect || ""));
  });
  // Folded, the group shows nothing of what the slide carries. The mark on
  // its label says that there is something to unfold.
  el.colorsGroup.classList.toggle("has-own",
    !!(slide.background || slide.textColor || slide.gradient || slide.effect));
}

function setContentMode(slide) {
  // The frames carry the visible border, so those are what get hidden --
  // hiding the field alone would leave an empty box behind.
  el.contentFrame.hidden = sourceMode;
  el.sourceFrame.hidden = !sourceMode;
  // The notice only appears when source mode was not chosen freely but
  // forced by the slide.
  el.sourceNote.hidden = !sourceMode || rt.isSimple(slide.content);
  el.sourceButton.classList.toggle("is-active", sourceMode);
  $$(".toolbar button[data-command]").forEach(function (b) { b.disabled = sourceMode; });
  if (sourceMode) el.sourceText.value = slide.content || "";
  else el.content.innerHTML = rt.mdToHtml(slide.content);
}

function drawAll() {
  drawList(el.list, deck, active, layoutsById);
  showSlide();
  drawPresentMenu();
}

// --- Presenting --------------------------------------------------------
// Reveal addresses a slide as horizontal/vertical, the editor's list is
// flat -- the same walk the server does for the preview (render.js,
// indices()), only for the one slide that is wanted.
function slideHash(index) {
  var h = -1;
  var v = 0;
  for (var i = 0; i <= index; i++) {
    if (i > 0 && deck.slides[i].vertical) v++;
    else { h++; v = 0; }
  }
  return "#/" + h + "/" + v;
}

// Starting at the current slide only says something on a slide other than
// the first. Elsewhere the entry is greyed out and, more to the point,
// stops being a link -- so the click does nothing at all.
function drawPresentMenu() {
  var possible = active > 0;
  el.presentFromCurrent.setAttribute("aria-disabled", possible ? "false" : "true");
  if (possible) el.presentFromCurrent.href = BASE + "/present" + slideHash(active);
  else el.presentFromCurrent.removeAttribute("href");
}

function select(i) {
  if (i === active || i < 0 || i >= deck.slides.length) return;
  harvest();
  active = i;
  drawAll();
  preview.showSlide(active);
}

// --- Slide list --------------------------------------------------------
function emptySlide(layout) {
  return { layout: layout || "text", vertical: false, title: null, content: "", image: "", source: "", url: "", qrColor: "#000000", qrBackground: "#ffffff", qrTextColor: "", textSide: "oben", background: "", textColor: "", gradient: "", effect: "" };
}

el.list.addEventListener("click", function (ev) {
  var card = ev.target.closest(".slide-card");
  if (!card) return;
  var i = Number(card.dataset.index);
  var button = ev.target.closest(".card-button");
  if (!button) { select(i); return; }

  var action = button.dataset.action;
  harvest();
  if (action === "delete") {
    if (deck.slides.length === 1) { note(t("message.atLeastOne")); return; }
    if (!window.confirm(t("message.deleteSlide"))) return;
    deck.slides.splice(i, 1);
    structureChanged(Math.min(i, deck.slides.length - 1));
  } else if (action === "duplicate") {
    deck.slides.splice(i + 1, 0, JSON.parse(JSON.stringify(deck.slides[i])));
    structureChanged(i + 1);
  } else if (action === "up" && i > 0) {
    deck.slides.splice(i - 1, 0, deck.slides.splice(i, 1)[0]);
    structureChanged(i - 1);
  } else if (action === "down" && i < deck.slides.length - 1) {
    deck.slides.splice(i + 1, 0, deck.slides.splice(i, 1)[0]);
    structureChanged(i + 1);
  } else if (action === "indent") {
    if (i === 0) return; // the first slide has nothing it could hang from
    deck.slides[i].vertical = !deck.slides[i].vertical;
    structureChanged(i);
  }
});

dragEnable(el.list, function (von, nach) {
  harvest();
  deck.slides.splice(nach, 0, deck.slides.splice(von, 1)[0]);
  structureChanged(nach);
});

$("#slide-new").addEventListener("click", function () {
  harvest();
  deck.slides.splice(active + 1, 0, emptySlide("text"));
  structureChanged(active + 1);
});

// --- Form fields -------------------------------------------------------
$("#deck-title").addEventListener("input", remember);
$("#deck-theme").addEventListener("change", function () { harvest(); saveNow().then(function () { preview.newLoad(active); }); });
$("#deck-transition").addEventListener("change", function () { harvest(); saveNow(); });

el.title.addEventListener("input", function () {
  remember();
  // The card in the list carries the heading -- it has to follow along as
  // you type, otherwise the list looks frozen.
  var card = el.list.children[active];
  // The same wording the card uses when it is drawn (slide-list.js), and
  // out of the table rather than written here in one language.
  if (card) $(".card-title", card).textContent = el.title.value || t("card.untitled");
});
el.content.addEventListener("input", remember);
el.sourceText.addEventListener("input", remember);
el.source.addEventListener("input", remember);

// --- Where the text sits on a video slide ------------------------------
// The bar has room for an icon and no more, so the name of the side has to
// reach it as its label and its tooltip -- otherwise the button says
// nothing at all to a screen reader or to a mouse that rests on it. The
// names come from the menu entries, which the server has already put words
// into; nothing has to be translated a second time here.
function showTextSide(side) {
  el.textSideButton.dataset.side = side;
  var chosen = null;
  $$("#text-side-menu .menu-item").forEach(function (b) {
    var is = b.dataset.side === side;
    b.classList.toggle("is-active", is);
    b.setAttribute("aria-checked", is ? "true" : "false");
    if (is) chosen = b;
  });
  var name = el.textSideMenu.dataset.name + (chosen ? ": " + chosen.textContent.trim() : "");
  el.textSideButton.setAttribute("aria-label", name);
  el.textSideButton.dataset.tip = name;
  // The button next door follows the side: beside the player the width is a
  // choice, above and below it is not one (slides.css).
  toggleTextWidth();
}

// --- How wide the text may get beside the picture or the player --------
// A choice only where the text actually stands beside something. On the
// image layouts it always does; on a video slide only once the text has
// been put left or right of the player.
function toggleTextWidth() {
  var slide = deck.slides[active];
  var def = layoutsById[slide && slide.layout] || { fields: [] };
  var seitlich = def.fields.indexOf("textSide") === -1 ||
    el.textSideButton.dataset.side === "links" || el.textSideButton.dataset.side === "rechts";
  var an = def.fields.indexOf("textWidth") !== -1 && seitlich;
  el.textWidthMenu.setAttribute("aria-disabled", an ? "false" : "true");
  if (!an) el.textWidthMenu.open = false;
}

// What the slide has before anybody chooses differs by layout: half and
// half beside a picture, a third beside a player (layouts.js). The tiles
// carry it into the page along with the rest of the layout definition.
function defaultWidth() {
  var slide = deck.slides[active];
  return ((layoutsById[slide && slide.layout] || {}).width) || "33";
}

// What the text stands beside depends on the layout -- a picture here, a
// player there -- and the button says so. Read off the layout's fields
// rather than off its name, so a layout added later gets the right wording
// by declaring the field it already has to declare (layouts.js).
function widthName() {
  var slide = deck.slides[active];
  var def = layoutsById[slide && slide.layout] || { fields: [] };
  var d = el.textWidthMenu.dataset;
  if (def.fields.indexOf("video") !== -1) return d.nameVideo;
  if (def.fields.indexOf("url") !== -1) return d.nameQr;
  return d.nameImage;
}

function showTextWidth(width) {
  el.textWidthButton.dataset.width = width;
  var chosen = null;
  $$("#text-width-menu .menu-item").forEach(function (b) {
    var is = b.dataset.width === width;
    b.classList.toggle("is-active", is);
    b.setAttribute("aria-checked", is ? "true" : "false");
    if (is) chosen = b;
  });
  // The button wears the value, so it needs no icon -- but it quiet needs
  // to say what the value MEANS, and that goes in the label and the tooltip.
  var value = chosen ? chosen.textContent.trim() : width + "\u00a0%";
  el.textWidthButton.textContent = value;
  var name = widthName() + ": " + value;
  el.textWidthButton.setAttribute("aria-label", name);
  el.textWidthButton.dataset.tip = name;
}

$$("#text-side-menu .menu-item").forEach(function (button) {
  button.addEventListener("click", function () {
    showTextSide(button.dataset.side);
    el.textSideMenu.open = false;
    remember();
  });
});

$$("#text-width-menu .menu-item").forEach(function (button) {
  button.addEventListener("click", function () {
    showTextWidth(button.dataset.width);
    el.textWidthMenu.open = false;
    remember();
  });
});

// <details> has no disabled state of its own, so the click that would open
// it is the one that has to be turned away.
el.textWidthButton.addEventListener("click", function (ev) {
  if (el.textWidthMenu.getAttribute("aria-disabled") === "true") ev.preventDefault();
});

// A menu left open would sit over the very field one types in next. Both
// of them, and each closes only when the click was somewhere outside it --
// so opening one closes the other.
document.addEventListener("click", function (ev) {
  [el.textSideMenu, el.textWidthMenu].forEach(function (m) {
    if (m.open && !m.contains(ev.target)) m.open = false;
  });
});

$$(".layout-tile").forEach(function (tile) {
  tile.addEventListener("click", function () {
    harvest();
    deck.slides[active].layout = tile.dataset.layout;
    drawAll();
    remember();
  });
});

$$(".toolbar button[data-command]").forEach(function (b) {
  // mousedown rather than click: otherwise the field loses focus first,
  // and with it the selection the command is meant to act on.
  b.addEventListener("mousedown", function (ev) {
    ev.preventDefault();
    rt.befehl(el.content, b.dataset.befehl);
    remember();
  });
});

el.sourceButton.addEventListener("click", function () {
  harvest();
  var slide = deck.slides[active];
  if (sourceMode && !rt.isSimple(slide.content)) {
    note(t("message.staysSource"));
    return;
  }
  sourceMode = !sourceMode;
  setContentMode(slide);
});

// Ctrl+B / Ctrl+I in the body field -- the browser does this by itself,
// but the model has to hear about it.
el.content.addEventListener("keyup", function (ev) {
  if (ev.ctrlKey || ev.metaKey) remember();
});

// --- Video ---------------------------------------------------------------
// The field takes whatever is in the clipboard. Whether there is a video id
// in it is decided by the server's own pattern, handed to the page -- so
// the field says "no video in this" with the same rule that would later
// drop the value on saving.
var videoPattern = new RegExp(el.video.dataset.pattern || "");

function showVideo() {
  var value = el.video.value.trim();
  var gefunden = !value || videoPattern.test(value);
  el.video.setAttribute("aria-invalid", gefunden ? "false" : "true");
  el.videoNote.textContent = gefunden ? "" : t("editor.videoUnknown");
  el.videoNote.classList.toggle("hint-error", !gefunden);
}

// The field takes whatever is in the clipboard. Whether an address can be
// made of it is the server's rule (qr.js), and the page only says so --
// http and https are the only schemes a code on a slide may carry, because
// a stranger's phone is what opens it.
function showUrl() {
  var value = el.url.value.trim();
  var ok = !value || /^(https?:\/\/)?[^\s<>"']+\.[^\s<>"']+$/i.test(value);
  el.url.setAttribute("aria-invalid", ok ? "false" : "true");
  el.urlNote.textContent = ok ? "" : t("editor.urlInvalid");
  el.urlNote.classList.toggle("hint-error", !ok);
}

el.url.addEventListener("input", function () {
  showUrl();
  remember();
});

el.video.addEventListener("input", function () {
  showVideo();
  remember();
});

// --- Code blocks --------------------------------------------------------
// The one thing in the toolbar the rich-text field cannot hold as text. So
// it is not a formatting command but a dialog, and what it leaves behind in
// the field is a sealed block (richtext.js) rather than a fence anyone
// could damage with a stray keystroke. Clicking the block opens the same
// dialog again.
//
// Language and scheme are remembered for the next block: someone writing a
// talk about Rust writes Rust on the next slide too.
var CODE_LETZTE = "trivialslides:code-zuletzt";
var codeBearbeitet = null;   // the block being edited, or null for a new one

function codeZuletzt() {
  try { return JSON.parse(localStorage.getItem(CODE_LETZTE)) || {}; } catch (e) { return {}; }
}

function codeDialogOeffnen(block) {
  codeBearbeitet = block || null;
  var letzte = codeZuletzt();
  el.codeLanguage.value = block ? (block.dataset.language || "") : (letzte.language || "");
  el.codeStyle.value = block ? (block.dataset.style || "") : (letzte.style || "");
  var pre = block && block.querySelector("pre");
  el.codeText.value = pre ? pre.textContent : "";
  el.codeFragment.checked = !!(block && block.classList.contains("fragment"));
  // The same dialog does both jobs, so it says which one it is doing.
  el.codeTitle.textContent = t(block ? "dialog.codeEdit" : "dialog.codeTitle");
  el.codeOk.textContent = t(block ? "dialog.codeApply" : "dialog.codeInsert");
  el.codeNote.hidden = !!block;
  el.codeDialog.returnValue = "";
  el.codeDialog.showModal();
}

el.codeButton.addEventListener("click", function () { codeDialogOeffnen(null); });

// A click on a block in the field opens it. The block is sealed, so the
// click cannot land inside it -- it lands on it.
el.content.addEventListener("click", function (ev) {
  if (!ev.target.closest) return;
  var block = ev.target.closest(".code-block");
  if (!block || !el.content.contains(block)) return;
  if (ev.target.closest(".code-remove")) {
    block.remove();
    remember();
    return;
  }
  codeDialogOeffnen(block);
});

// In a code field Tab is indentation, not "on to the next control". Shift
// and Escape quiet get out, so the field is not a trap.
el.codeText.addEventListener("keydown", function (ev) {
  if (ev.key !== "Tab" || ev.shiftKey) return;
  ev.preventDefault();
  var von = el.codeText.selectionStart;
  var bis = el.codeText.selectionEnd;
  var value = el.codeText.value;
  el.codeText.value = value.slice(0, von) + "    " + value.slice(bis);
  el.codeText.setSelectionRange(von + 4, von + 4);
});

el.codeDialog.addEventListener("click", function (ev) {
  if (ev.target.closest("[data-close]")) el.codeDialog.close();
});

// On close, not on submit: a dialog hands the focus back to whatever had it
// before, and it does so AFTER the submit handler.
el.codeDialog.addEventListener("close", function () {
  if (el.codeDialog.returnValue !== "einfuegen") { codeBearbeitet = null; return; }
  var language = el.codeLanguage.value;
  var style = el.codeStyle.value;
  try {
    localStorage.setItem(CODE_LETZTE, JSON.stringify({ language: language, style: style }));
  } catch (e) { /* private window, storage blocked */ }
  // Emptied out: that is how one gets rid of a block from inside the
  // dialog, and it beats leaving an empty fence on the slide.
  var sourceText = el.codeText.value.replace(/\s+$/, "");
  if (!sourceText.trim() && codeBearbeitet) {
    codeBearbeitet.remove();
    remember();
    codeBearbeitet = null;
    return;
  }
  codeUebernehmen(language, style, sourceText, el.codeFragment.checked);
  codeBearbeitet = null;
});

function codeUebernehmen(language, style, sourceText, fragment) {
  harvest();
  var slide = deck.slides[active];

  // A slide that is in source mode for some OTHER reason -- a table, say --
  // has no field to put a block into. There the fence goes in as text.
  if (sourceMode) {
    var zaun = "```" + language + (style ? " hl=" + style : "");
    var block = zaun + "\n" + sourceText + "\n```" + (fragment ? "\n" + rt.FRAGMENT : "");
    var before = (slide.content || "").replace(/\s+$/, "");
    slide.content = before ? before + "\n\n" + block : block;
    setContentMode(slide);
    remember();
    return;
  }

  var huelle = document.createElement("div");
  huelle.innerHTML = rt.codeBlockHtml(language, style, sourceText, fragment);
  var fresh = huelle.firstElementChild;
  if (codeBearbeitet && el.content.contains(codeBearbeitet)) {
    codeBearbeitet.replaceWith(fresh);
  } else {
    el.content.appendChild(fresh);
    // Something to carry on typing in: after a sealed block at the very end
    // of the field there is otherwise nowhere for the caret to go.
    var danach = document.createElement("p");
    danach.appendChild(document.createElement("br"));
    el.content.appendChild(danach);
  }
  remember();
}

// --- Colours -----------------------------------------------------------
// A small, muted selection, offered for the background and for the text
// alike: the same eight tones work in both roles, dark on light and light
// on dark. They are the picker's swatches; anything else comes out of its
// colour area.
var COLORS = ["#1b1f23", "#0b3d4c", "#2b3a55", "#4a3b52", "#5c3d2e", "#2f4f3a", "#f5f0e6", "#ffffff"];

// "No colour of its own" is a state the picker cannot express through a
// colour, so its clear button carries it: an empty field means the slide
// follows the theme, which is what the placeholder says as well.
function colorisSetUp() {
  Coloris.init();
  Coloris({
    el: ".color-field",
    themeMode: document.documentElement.getAttribute("data-theme")
      || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    theme: "polaroid",
    format: "hex",
    alpha: true,
    swatches: COLORS,
    clearButton: true,
    clearLabel: t("color.reset"),
    closeButton: true,
    closeLabel: t("color.done"),
  });
  // The picker's own light and dark have to follow the editor's.
  new MutationObserver(function () {
    Coloris({ themeMode: document.documentElement.getAttribute("data-theme") || "light" });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

// Both fields work the same way -- `fieldName` is all that differs.
function colorFieldWire(field, fieldName) {
  field.addEventListener("input", function () {
    if (field.dataset.quiet) return;   // set from the model, not by a person
    harvest();
    deck.slides[active][fieldName] = field.value.trim();
    showSlide();
    remember();
  });
}

// Coloris keeps the swatch beside the field in sync by listening for input
// events, so the value cannot simply be assigned -- it has to be announced.
// The flag keeps that announcement from counting as an edit.
function showColorField(field, value) {
  field.dataset.quiet = "1";
  field.value = value || "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  delete field.dataset.quiet;
  // The dot shows the colour, the tooltip names it -- and without a colour
  // it has to show that too, which no colour can express.
  var dot = field.closest(".clr-field");
  if (dot) dot.classList.toggle("is-empty", !value);
  field.dataset.tip = value || t("color.none");
}

colorisSetUp();
colorFieldWire(el.customColor, "background");
colorFieldWire(el.customTextColor, "textColor");
colorFieldWire(el.qrColor, "qrColor");
colorFieldWire(el.qrBackground, "qrBackground");
colorFieldWire(el.qrTextColor, "qrTextColor");

// --- The colour group ---------------------------------------------------
// Closed to begin with: colours, gradients and effects are what one reaches
// for after a while, and the editor should not open with them. Whoever has
// opened it once is past that point, so the choice is kept -- in the
// browser, like the light/dark setting, because it belongs to the person
// and not to the deck.
var COLORS_OPEN = "trivialslides:colors-open";

try {
  el.colorsGroup.open = localStorage.getItem(COLORS_OPEN) === "1";
} catch (e) { /* private window, storage blocked */ }

el.colorsGroup.addEventListener("toggle", function () {
  try {
    localStorage.setItem(COLORS_OPEN, el.colorsGroup.open ? "1" : "0");
  } catch (e) { /* see above */ }
});

// --- Gradient ----------------------------------------------------------
// Two ways to the same value: a swatch to click, and the field below it for
// anyone who writes their own CSS. The field's pattern is the grammar from
// deck.js (put there by the page), so the browser checks with exactly the
// rule the server applies -- no second grammar living here.

// The one hint line does double duty -- rule of the field, and complaint
// when it is broken -- so the original wording is kept before anything
// overwrites it.
var gradientNote = el.gradientHint.textContent;

function gradientShow() {
  var value = el.gradient.value.trim();
  var falsch = !!value && !el.gradient.checkValidity();
  el.gradient.setAttribute("aria-invalid", falsch ? "true" : "false");
  el.gradientHint.classList.toggle("hint-error", falsch);
  el.gradientHint.textContent = falsch ? t("editor.gradientInvalid") : gradientNote;
  // The active swatch is whichever one holds exactly this value -- a
  // hand-written gradient simply marks none of them.
  $$(".gradient-probe").forEach(function (p) {
    p.classList.toggle("is-active", p.dataset.gradient === value);
  });
}

el.gradient.addEventListener("input", function () {
  harvest();
  gradientShow();
  remember();
});

el.gradientVorlagen.addEventListener("click", function (ev) {
  var probe = ev.target.closest(".gradient-probe");
  if (!probe) return;
  harvest();
  el.gradient.value = probe.dataset.gradient;
  deck.slides[active].gradient = probe.dataset.gradient;
  gradientShow();
  remember();
});

// An animated background carries a name, so there is nothing to type: the
// tiles are the whole control.
el.effectTiles.addEventListener("click", function (ev) {
  var tile = ev.target.closest(".effect-tile");
  if (!tile) return;
  harvest();
  deck.slides[active].effect = tile.dataset.effect;
  showSlide();
  remember();
});

// --- Images ------------------------------------------------------------
var imageDialog = $("#image-dialog");

function showImage(name) {
  el.imagePreview.hidden = !name;
  el.imageRemove.hidden = !name;
  if (name) el.imagePreview.src = BASE + "/assets/" + encodeURIComponent(name);
}

function drawGallery() {
  var gallery = $("#image-gallery");
  gallery.innerHTML = "";
  $("#image-empty").hidden = images.length > 0;
  images.forEach(function (name) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "gallery-image";
    b.dataset.name = name;
    b.dataset.tip = name;
    var img = document.createElement("img");
    img.src = BASE + "/assets/" + encodeURIComponent(name);
    img.alt = name;
    img.loading = "lazy";
    b.appendChild(img);
    gallery.appendChild(b);
  });
}

$("#image-choose").addEventListener("click", function () {
  drawGallery();
  imageDialog.showModal();
});

$("#image-gallery").addEventListener("click", function (ev) {
  var b = ev.target.closest(".gallery-image");
  if (!b) return;
  harvest();
  deck.slides[active].image = b.dataset.name;
  showImage(b.dataset.name);
  imageDialog.close();
  remember();
});

el.imageRemove.addEventListener("click", function () {
  harvest();
  deck.slides[active].image = "";
  showImage("");
  remember();
});

$("#image-file").addEventListener("change", function (ev) {
  var files = ev.target.files;
  if (!files || !files.length) return;
  var data = new FormData();
  Array.prototype.forEach.call(files, function (f) { data.append("image", f); });
  fetch(BASE + "/assets", { method: "POST", headers: schreibHead(), body: data })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      images = d.images || images;
      drawGallery();
      // A freshly uploaded image is almost always wanted right away.
      if (d.fresh && d.fresh.length) {
        harvest();
        deck.slides[active].image = d.fresh[0];
        showImage(d.fresh[0]);
        imageDialog.close();
        remember();
      }
    })
    .catch(function (e) { console.error(e); note(t("message.imageError")); });
  ev.target.value = "";
});

// --- Startup -----------------------------------------------------------
// Paragraphs rather than <div> on line break: only then does the field
// produce the same structure mdToHtml does, keeping the round trip
// lossless.
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* aeltere Browser */ }
drawAll();
