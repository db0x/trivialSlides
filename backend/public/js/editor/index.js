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
import { drawList, drawPictures, dragEnable } from "./slide-list.js";
import { SPLIT, splitColumns, joinColumns, mergeColumns } from "./columns.js";
import { setupDeckSource } from "./deck-source.js";
import { drawLibrary } from "./library.js";
import { setupBands, isEmpty as bandEmpty, HIDDEN_FIELD } from "./bands.js";
import { setupAi } from "./ai.js";
import Coloris from "../../../coloris/dist/esm/coloris.js";

var BASE = window.SLIDES_BASE;
var deck = JSON.parse($("#data-deck").textContent);
var LAYOUTS = JSON.parse($("#data-layouts").textContent);
var images = JSON.parse($("#data-images").textContent);
var layoutsById = {};
LAYOUTS.forEach(function (l) { layoutsById[l.id] = l; });

var active = 0;
var sourceMode = false; // shows the current slide as Markdown
// Two different kinds of "behind", and with autosave off they are not the
// same thing:
//   schmutzig    the model here is ahead of the SERVER. Drives the delayed
//                send, and has to be nil before the talk is opened.
//   ungesichert  the FILE is behind. Only ever true with autosave off, and
//                only the Save button clears it.
var schmutzig = false;
var ungesichert = false;
var autosaveOn = window.autosave ? window.autosave.read() : true;
// Whether the dialog for the deck's two bands is open. It is the one place
// in this editor where a change touches every slide at once, which is the
// one case the slide list's pictures must not be redrawn for -- see
// saveNow() below.
var bandsOpen = false;

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
  fragmentMenu: $("#fragment-menu"),
  fragmentButton: $("#fragment-button"),
  textSideMenu: $("#text-side-menu"),
  textSideButton: $("#text-side-button"),
  textPlaceMenu: $("#text-place-menu"),
  textPlaceButton: $("#text-place-button"),
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
  layoutLocked: $("#layout-locked"),
  state: $("#save-state"),
  saveButton: $("#deck-save"),
  customColor: $("#background-custom"),
  customTextColor: $("#text-color-custom"),
  textColorTool: $("#text-color-tool"),
  gradient: $("#slide-gradient"),
  gradientHint: $("#gradient-hint"),
  gradientVorlagen: $("#gradient-presets"),
  effectTiles: $("#effect-tiles"),
  codeButton: $("#code-insert"),
  codeDialog: $("#code-dialog"),
  codeLanguage: $("#code-language"),
  codeStyle: $("#code-style"),
  codeText: $("#code-text"),
  codeTitle: $("#code-title"),
  codeOk: $("#code-ok"),
  codeNote: $("#code-note"),
  codeFragment: $("#code-fragment"),
  titleAlignMenu: $("#title-align-menu"),
  titleAlignButton: $("#title-align-button"),
  textLabel: $("#text-label"),
  columnTabs: $("#column-tabs"),
  columnsSplit: $("#slide-columns-split"),
  fieldColumns: $(".field-columns"),
  fieldColumnCount: $("#field-column-count"),
  slideBands: $("#slide-bands"),
  headerOn: $("#slide-header-on"),
  footerOn: $("#slide-footer-on"),
  presentDirect: $(".present-direct"),
  presentMenu: $(".present-menu"),
  presentFromCurrent: $("#present-from-current"),
};

// Which column the one text field is showing, 0-based. Only ever anything
// but 0 while the slide keeps its columns apart.
var activeColumn = 0;

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

// One way to the server, two things it may mean. With autosave on, and
// whenever the Save button asks for it, the deck is written. Otherwise it
// is HELD there (backend/storage.js) -- which is why paging through the
// slides, the preview and the talk in its own tab all show what was typed
// although no file has been touched: they all read the one deck the server
// has, and the server has this one.
function saveNow(toFile) {
  harvest();
  return fetch(BASE + "/deck.json", {
    method: "PUT",
    headers: schreibHead({ "Content-Type": "application/json" }),
    body: JSON.stringify({ deck: deck, draft: !autosaveOn && !toFile }),
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
      // The server says whether it is still holding this deck rather than
      // having written it -- that, and not what was asked for, is what the
      // word in the header has to report.
      ungesichert = !!d.draft;
      // Now the list can show what the file holds -- the card's name, its
      // layout and its picture. The picture especially: the server draws
      // it FROM the saved file (views/thumb.ejs), so this is the first
      // moment it can be right. Both are filled in place, so nothing in
      // the list moves and only a slide that really looks different is
      // fetched again (js/editor/slide-list.js).
      drawList(el.list, deck, active, layoutsById);
      // Except while the bands are being written. A header or a footer
      // stands on EVERY slide, so every card in the list really does look
      // different after every keystroke in that dialog -- and every card
      // is a page in a frame, so all of them would blink, once a second,
      // for as long as one types. They are worth exactly one round, and
      // that round is on the way out (js/editor/bands.js).
      if (!bandsOpen) drawPictures(el.list, deck);
      drawSaveState();
    })
    .catch(function (e) {
      console.error(e);
      stateShow(t("state.offline"), "is-error");
    });
}

var saveSoon = verzoegert(900, saveNow);

// --- Saved, or owed ----------------------------------------------------
// With autosave on this says nothing at all: writing the file is the normal
// course of things, and a word after every keystroke would be a complaint
// about it. Switched off, the opposite holds -- nothing is written unless
// one presses the button, so the header has to say that something is owed,
// and the button has to be there to press.
function drawSaveState() {
  el.saveButton.hidden = autosaveOn;
  var owed = !autosaveOn && (schmutzig || ungesichert);
  el.saveButton.classList.toggle("is-owed", owed);
  stateShow(owed ? t("state.unsaved") : "");
}

el.saveButton.addEventListener("click", function () { saveNow(true); });

// Switched in the settings dialog while the editor stands open
// (js/autosave.js). Turning it ON with something owed writes it at once --
// that is what the words on the switch promise.
document.addEventListener("autosave", function (ev) {
  autosaveOn = !!(ev.detail && ev.detail.on);
  if (autosaveOn && (schmutzig || ungesichert)) saveNow(true);
  else drawSaveState();
});

drawSaveState();

// Anything that wants to leave the page -- the language switch, for one --
// has to be able to flush what is quiet owed. Saving is on a delay, and a
// reload inside that window would throw the last keystroke away.
window.trivialSlidesSave = function () {
  return schmutzig ? saveNow() : Promise.resolve();
};

// And a page that is about to reload itself on purpose says so, so that the
// browser's own warning stays out of it: what was typed is with the server
// either way (saveNow above holds it there), and it comes back into the
// field on the next load. The language switch is the one caller
// (js/language.js); the overview has no such function and asks for none.
window.trivialSlidesLeaving = function () { leaving = true; };

function remember() {
  harvest();
  // Taking a picture off a slide is what makes it deletable, and the row
  // saying so is right there on the next tab -- so it is redrawn with the
  // model rather than only when the tab is opened again.
  if (libraryPanel && !libraryPanel.hidden) libraryDraw();
  // Owed from the first keystroke, not from the first send: the word in the
  // header would otherwise appear a second late, which on a manual save is
  // exactly the second that matters.
  if (!autosaveOn && !ungesichert) { ungesichert = true; drawSaveState(); }
  // The first word typed locks the layout, the last one deleted frees it
  // again -- so this belongs on the typing path, not only on a redraw.
  drawLayoutLock();
  schmutzig = true;
  // Deliberately silent. Saving follows within the second, and a label
  // reading "not saved" after every keystroke would be a complaint about
  // the normal course of things. What guards the real risk -- leaving with
  // something unsaved -- is the beforeunload below.
  saveSoon();
  previewSoon();
}

var previewSoon = verzoegert(350, function () {
  // The bands travel with the slide: they belong to the deck, and the
  // server would otherwise draw the strips as they stood at the last save
  // (routes/decks.js, js/editor/bands.js).
  preview.slideZeichnen(active, deck.slides[active], deck);
});

// Structural changes: save first, then rebuild the preview completely --
// it renders from the file, not from the browser's memory.
function structureChanged(newIndex) {
  active = Math.max(0, Math.min(newIndex == null ? active : newIndex, deck.slides.length - 1));
  drawAll();
  saveNow().then(function () { preview.newLoad(active); });
}

// --- Leaving with something owed ---------------------------------------
// Two warnings for one risk, and they divide the work: the browser's own
// catches what this page never hears about -- the tab being closed, a
// reload, an address typed over the one in the bar -- and cannot be
// styled, cannot say what is owed and offers nothing but "leave" and
// "stay". Every way out that the page DOES control is caught before it is
// taken and asked in a dialog of our own (views/editor.ejs), where saving
// is one of the answers and the usual one.
var leaveDialog = $("#leave-dialog");
// Set while a leaving of our own is under way, so the browser's warning
// stays out of a departure that has just been agreed to.
var leaving = false;

window.addEventListener("beforeunload", function (ev) {
  if (leaving || (!schmutzig && !ungesichert)) return;
  ev.preventDefault();
  ev.returnValue = "";
});

function goTo(url) {
  leaving = true;
  window.location.href = url;
}

// A link that leaves this page: same window, same site, and not one of the
// links that hand a file over or open the talk in a tab of its own --
// those leave the editor standing where it is.
function leavingLink(a) {
  if (!a || !a.getAttribute("href")) return false;
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  if (a.origin !== window.location.origin) return false;
  return a.pathname !== window.location.pathname;
}

document.addEventListener("click", function (ev) {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  var a = ev.target.closest && ev.target.closest("a[href]");
  if (!leavingLink(a)) return;
  // With autosave on there is nothing to ask about: what is owed is at most
  // the delayed save, and that is flushed on the way out. The question
  // belongs to the other case alone -- autosave off, where only the button
  // writes the file.
  if (autosaveOn || (!schmutzig && !ungesichert)) {
    if (!schmutzig) return;
    ev.preventDefault();
    saveNow(true).then(function () { goTo(a.href); }, function () { goTo(a.href); });
    return;
  }
  ev.preventDefault();
  leaveDialog.returnValue = "stay";
  leaveDialog.showModal();
  leaveDialog.addEventListener("close", function einmal() {
    leaveDialog.removeEventListener("close", einmal);
    if (leaveDialog.returnValue === "save") {
      saveNow(true).then(function () { goTo(a.href); }, function () { goTo(a.href); });
    } else if (leaveDialog.returnValue === "leave") {
      goTo(a.href);
    }
  });
});

// --- Fields <-> model --------------------------------------------------
// harvest(): reads the form fields into the model. Called before every save
// and before every slide change, so that no input is ever lost that the
// delayed save has not seen yet.
function harvest() {
  var slide = deck.slides[active];
  if (!slide) return;
  deck.title = $("#deck-title").value;
  // The two header menus keep their value on the button, not in a field
  // (views/editor.ejs) -- a <summary> has no value of its own.
  deck.theme = $("#deck-theme").dataset.value;
  deck.transition = $("#deck-transition").dataset.value;
  // An empty field on a slide that never had a heading leaves it without
  // one; on a slide that has an empty heading it keeps that heading. The
  // one field cannot say which is meant, so what the slide already is
  // decides -- which is what makes a hand-written "##" survive being opened
  // here (deck.js).
  slide.title = el.title.value === "" && slide.title == null ? null : el.title.value;
  slide.content = sourceMode ? el.sourceText.value : harvestText(slide);
  slide.source = el.source.value;
  // Passed on as typed: the server picks the id out of it (video.js), and
  // it does so for the live preview too. So a pasted link is a video
  // before it has been saved anywhere.
  slide.video = el.video.value;
  slide.url = el.url.value;
  // The bar shows the side as an icon, so the chosen one lives on the
  // button rather than in a field value.
  slide.textSide = el.textSideButton.dataset.side || "oben";
  slide.textPlace = el.textPlaceButton.dataset.place || "center";
  slide.textWidth = el.textWidthButton.dataset.width || defaultWidth();
  // The chooser beside the heading keeps two things apart: what the slide
  // has CHOSEN (which may be nothing) and what the button SHOWS, which is
  // never nothing. Only the choice belongs in the model.
  slide.titleAlign = el.titleAlignButton.dataset.choice || "";
  // The gradient field takes CSS, so at any moment it may hold something
  // half-typed. Only a complete gradient goes into the model -- the rest
  // stays in the field and is named as unfinished, instead of quietly
  // stripping the slide of the background it quiet has.
  var gradient = el.gradient.value.trim();
  if (!gradient || el.gradient.checkValidity()) slide.gradient = gradient;
}

// --- Columns -----------------------------------------------------------
// How many columns the slide stands in, 0 for a layout that has none at
// all. The twin of layouts.js' columnCount(): the number belongs to the
// slide, the field to the layout.
function columnCount(slide) {
  var def = layoutsById[(slide || {}).layout] || {};
  return has(def, "columnCount") ? Number(slide.columnCount || 1) : 0;
}

// Whether the layout has this field at all -- the browser's half of
// layouts.js' hasField(), asked of the definition the page was handed.
function has(def, field) {
  return ((def || {}).fields || []).indexOf(field) !== -1;
}

// How many text fields the slide's body is written in: one, unless the
// slide has columns AND keeps them apart.
function splitCount(slide) {
  if (!slide || slide.columnMode !== SPLIT) return 0;
  return columnCount(slide);
}

// The body as the field holds it. Kept apart, the field holds ONE column --
// so what comes out of it replaces that column and the others stay as they
// stand in the body, joined by the break line the renderer splits on again
// (columns.js). The body is the only place the columns live; there is no
// second copy of them anywhere in the page.
function harvestText(slide) {
  var count = splitCount(slide);
  var text = rt.htmlToMd(el.content);
  // The numbers that put several blocks on one click are settled here and
  // nowhere else: they run across the WHOLE slide, and the field only ever
  // holds one column of it (js/editor/richtext.js, normalizeSteps). A
  // slide that needs none comes back without any.
  if (!count) return rt.normalizeSteps([text])[0];
  var parts = splitColumns(slide.content, count);
  parts[Math.min(activeColumn, count - 1)] = text;
  return joinColumns(rt.normalizeSteps(parts));
}

// Can the rich-text field show this body, or does it have to be source?
// Kept apart it is the COLUMNS that land in the fields, so each of them has
// to be simple on its own -- the break lines between them never reach a
// field. Which is also why a break in a body that is NOT kept apart makes
// the slide source: there it would have to stand in the field as text.
function contentSimple(slide) {
  var count = splitCount(slide);
  if (!count) return rt.isSimple(slide.content);
  return splitColumns(slide.content, count).every(rt.isSimple);
}

// The moment a slide stops keeping its columns apart -- the box unticked, a
// layout without columns chosen. The breaks then mean nothing, and leaving
// them in the body would push the slide into source mode over lines the
// user never typed. So they go, and what they separated becomes one text:
// which is exactly the arrangement the slide now has.
function dropColumnBreaks(slide) {
  slide.columnMode = "";
  slide.content = mergeColumns(slide.content);
}

function showSlide() {
  var slide = deck.slides[active];
  if (!slide) return;
  el.title.value = slide.title || "";   // null and "" both show as empty
  // A slide is opened on its first column -- the one that was chosen on the
  // slide before says nothing about this one.
  activeColumn = 0;

  // Rich text or source? Slides with Markdown outside our subset are
  // shown as source rather than damaged on the way back.
  var einfach = contentSimple(slide);
  sourceMode = !einfach;
  setContentMode(slide);

  el.source.value = slide.source || "";
  el.video.value = slide.video || "";
  el.url.value = slide.url || "";
  showUrl();
  // A slide that has never been arranged is arranged the way it has always
  // looked, so the button shows the same thing the slide does.
  showTextSide(slide.textSide || "oben");
  showTextPlace(slide.textPlace || "center");
  drawFragment();
  showTitleAlign(slide.titleAlign || "");
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
  showColumnCount(slide, def);
  // Keeping columns apart is a question only where there is more than one
  // of them: on a slide standing in a single column there is nothing to
  // keep apart, so the switch is not there to be asked.
  el.fieldColumns.hidden = def.fields.indexOf("columnMode") === -1 || columnCount(slide) < 2;
  el.columnsSplit.checked = slide.columnMode === SPLIT;
  drawSlideBands(slide);
  el.textSideMenu.hidden = def.fields.indexOf("textSide") === -1;
  el.textPlaceMenu.hidden = def.fields.indexOf("textPlace") === -1;
  el.textWidthMenu.hidden = def.fields.indexOf("textWidth") === -1;
  // A menu left standing open over a layout that no longer has the button
  // would hang in the bar with nothing under it.
  if (el.textSideMenu.hidden) el.textSideMenu.open = false;
  if (el.textPlaceMenu.hidden) el.textPlaceMenu.open = false;
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
}

function setContentMode(slide) {
  var count = splitCount(slide);
  // The frames carry the visible border, so those are what get hidden --
  // hiding the field alone would leave an empty box behind.
  el.contentFrame.hidden = sourceMode;
  el.sourceFrame.hidden = !sourceMode;
  // The notice only appears when source mode was not chosen freely but
  // forced by the slide.
  el.sourceNote.hidden = !sourceMode || contentSimple(slide);
  el.sourceButton.classList.toggle("is-active", sourceMode);
  $$(".toolbar button[data-command]").forEach(function (b) { b.disabled = sourceMode; });
  // "This paragraph" needs a paragraph, and in source mode there is none --
  // only text. The slide's own text box is a different matter: it is an
  // attribute of the slide and can be set from either mode.
  $('.menu-item[data-fragment="block"]').disabled = sourceMode;
  // The colour is not a button but a field, so it is shut separately --
  // it acts on a selection in the rich-text field, and in source mode
  // there is none.
  el.textColorTool.disabled = sourceMode;
  // In source mode the whole body stands in one place, breaks and all --
  // that is what source mode is for -- so there is no column to choose.
  var chooser = !!count && !sourceMode;
  el.columnTabs.hidden = !chooser;
  // One or the other holds that line: the chooser says which column this
  // is, which is what the label would otherwise have said.
  el.textLabel.hidden = chooser;
  if (sourceMode) {
    el.sourceText.value = slide.content || "";
    return;
  }
  var parts = count ? splitColumns(slide.content, count) : [slide.content];
  if (count) activeColumn = Math.min(activeColumn, count - 1);
  el.content.innerHTML = rt.mdToHtml(parts[count ? activeColumn : 0] || "");
  if (chooser) drawColumnTabs(parts, count);
}

// Which columns there are, which one is being written, and which of them
// hold nothing yet -- with one field that last part is the only thing
// saying what is in the columns one cannot see.
function drawColumnTabs(parts, count) {
  $$(".column-tab", el.columnTabs).forEach(function (tab, i) {
    tab.hidden = i >= count;
    var here = i === activeColumn;
    tab.classList.toggle("is-active", here);
    tab.classList.toggle("is-empty", !String(parts[i] || "").trim());
    tab.setAttribute("aria-selected", here ? "true" : "false");
  });
}

// --- The deck's bands, on this one slide -------------------------------
// A switch per band the DECK has something in, and none for a band it has
// not: a switch for a line that does not exist would be a promise the
// slide cannot keep. Worded the positive way round -- "show it" -- while
// the file says the opposite (deck.js, data-no-header): in front of the
// slide the question is whether the line is on it.
function drawSlideBands(slide) {
  var any = false;
  $$(".switch-line[data-band]", el.slideBands).forEach(function (line) {
    var name = line.dataset.band;
    var there = !bandEmpty(deck[name]);
    line.hidden = !there;
    if (there) any = true;
    $(".switch", line).checked = !slide[HIDDEN_FIELD[name]];
  });
  el.slideBands.hidden = !any;
}

[el.headerOn, el.footerOn].forEach(function (box, i) {
  box.addEventListener("change", function () {
    harvest();
    deck.slides[active][i === 0 ? "noHeader" : "noFooter"] = !box.checked;
    // A line appearing or going takes room off the slide, so the whole
    // slide is redrawn rather than only its text -- and the card in the
    // list has to be fetched again, which the save does.
    remember();
  });
});

// --- The layout, once there is text ------------------------------------
// A slide that already says something keeps its layout. Switching it is
// what quietly costs a picture, a video, an address or the breaks between
// columns -- the new layout has no field for them and they are gone with
// the next save. On an empty slide there is nothing to lose, so there the
// tiles work as they always have.
//
// The tile of the layout in force stays alive: pressing it changes nothing
// anyway, and a row of tiles with none of them pressable reads like a
// fault rather than like a decision.
function drawLayoutLock() {
  var slide = deck.slides[active] || {};
  var locked = !!String(slide.content || "").trim();
  $$(".layout-tile").forEach(function (tile) {
    tile.disabled = locked && tile.dataset.layout !== slide.layout;
  });
  el.layoutLocked.hidden = !locked;
}

function drawAll() {
  drawList(el.list, deck, active, layoutsById);
  showSlide();
  drawPresentMenu();
  drawLayoutLock();
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
// the first. On the first there is nothing to choose, so the menu gives way
// to the plain button and one click presents.
function drawPresentMenu() {
  var choice = active > 0;
  el.presentDirect.hidden = choice;
  el.presentMenu.hidden = !choice;
  // An open menu that is put away would come back open later.
  if (!choice) el.presentMenu.open = false;
  else el.presentFromCurrent.href = BASE + "/present" + slideHash(active);
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

// The two menus in the header. Both hold a property of the DECK, so a pick
// goes through harvest() and is saved at once rather than on the delay --
// this is a decision, not typing.
//
// The button wears the value and keeps it in data-value, because a
// <summary> has none of its own. `after` is what the one difference
// between the two is: the look is a stylesheet the preview frame loads, so
// it has to be loaded again; the transition is a reveal setting the frame
// reads for itself at the next start.
function headerMenu(id, after) {
  var menu = $("#" + id + "-menu");
  var button = $("#" + id);
  var rows = $$(".menu-item", menu);
  rows.forEach(function (row) {
    row.addEventListener("click", function () {
      button.dataset.value = row.dataset.value;
      button.textContent = row.dataset.value;
      rows.forEach(function (other) {
        var here = other === row;
        other.classList.toggle("is-active", here);
        other.setAttribute("aria-checked", here ? "true" : "false");
      });
      menu.open = false;
      harvest();
      after();
    });
  });
}

headerMenu("deck-theme", function () {
  saveNow().then(function () { preview.newLoad(active); });
});
headerMenu("deck-transition", function () { saveNow(); });

el.title.addEventListener("input", remember);
el.content.addEventListener("input", remember);

// Ctrl+B / Ctrl+I in the body field -- the browser does this by itself,
// but the model has to hear about it.
el.content.addEventListener("keyup", function (ev) {
  if (ev.ctrlKey || ev.metaKey) remember();
});

// A click on a code block in the field opens it. The block is sealed, so
// the click cannot land inside it -- it lands on it.
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

// Choosing a column. What stands in the field goes into the column it was
// written for FIRST -- harvest() does that with the column still current --
// and only then does the field show the next one. Switching is not itself a
// change to the deck, so nothing is marked unsaved here.
$$(".column-tab", el.columnTabs).forEach(function (tab) {
  tab.addEventListener("click", function () {
    harvest();
    activeColumn = Number(tab.dataset.column) - 1;
    setContentMode(deck.slides[active]);
    el.content.focus();
  });
});
el.sourceText.addEventListener("input", remember);
el.source.addEventListener("input", remember);

// --- Where the text box stands on a full-bleed picture -----------------
// Nine places. The one in force is marked in the menu, and it also rides on
// the button -- not to be seen there, but because that is where harvest()
// reads it from, the way the side button next to it holds its side. The
// words come from the menu entries, which the server has already put into
// the page.
function showTextPlace(place) {
  el.textPlaceButton.dataset.place = place;
  var chosen = null;
  $$("#text-place-menu .place-cell").forEach(function (cell) {
    var is = cell.dataset.place === place;
    cell.setAttribute("aria-checked", is ? "true" : "false");
    if (is) chosen = cell;
  });
  var name = el.textPlaceMenu.dataset.name + (chosen ? ": " + chosen.dataset.tip : "");
  el.textPlaceButton.setAttribute("aria-label", name);
  el.textPlaceButton.dataset.tip = name;
}

$$("#text-place-menu .place-cell").forEach(function (cell) {
  cell.addEventListener("click", function () {
    showTextPlace(cell.dataset.place);
    el.textPlaceMenu.open = false;
    remember();
  });
});

// --- Where the text sits on a video slide ------------------------------
// The bar has room for an icon and no more, so the name of the side has to
// reach it as its label and its tooltip -- otherwise the button says
// nothing at all to a screen reader or to a mouse that rests on it. The
// names come from the menu entries, which the server has already put words
// into; nothing has to be translated a second time here.
function showTextSide(side) {
  el.textSideButton.dataset.side = side;
  showSideNames();
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

// What the text stands beside differs by layout -- a player on a video
// slide, a code on a QR one -- and the words in the menu say which. Read
// off the layout's fields rather than off its name, the same way the width
// button does: a layout added later gets the right wording by declaring
// the field it already has to declare (layouts.js).
function showSideNames() {
  var slide = deck.slides[active];
  var def = layoutsById[slide && slide.layout] || { fields: [] };
  var qr = def.fields.indexOf("url") !== -1;
  $$("#text-side-menu .menu-item").forEach(function (b) {
    b.querySelector(".menu-item-text").textContent = qr ? b.dataset.nameQr : b.dataset.nameVideo;
  });
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

// How many columns the text runs in. Buttons and not a menu: there are
// three values and they are single digits, so the whole question fits in
// the room a closed menu would take -- and a chooser one has to open to
// see "1 2 3" in is a lid on a box holding nothing.
function showColumnCount(slide, def) {
  var here = has(def, "columnCount");
  el.fieldColumnCount.hidden = !here;
  if (!here) return;
  var count = String(slide.columnCount || "1");
  $$(".count-option", el.fieldColumnCount).forEach(function (b) {
    var is = b.dataset.count === count;
    b.classList.toggle("is-active", is);
    b.setAttribute("aria-pressed", is ? "true" : "false");
  });
}

// Where the heading stands. The choice may be empty -- then the layout
// decides (layouts.js) and the button shows what the layout does, because
// the question this button answers is "where is my heading", not "have I
// pressed something".
function showTitleAlign(choice) {
  var layout = layoutsById[(deck.slides[active] || {}).layout] || {};
  el.titleAlignButton.dataset.choice = choice;
  el.titleAlignButton.dataset.align = choice || layout.titleAlign || "left";
  var chosen = null;
  $$("#title-align-menu .menu-item").forEach(function (b) {
    var is = b.dataset.align === choice;
    b.classList.toggle("is-active", is);
    b.setAttribute("aria-checked", is ? "true" : "false");
    if (is) chosen = b;
  });
  var name = el.titleAlignMenu.dataset.name + (chosen ? ": " + chosen.textContent.trim() : "");
  el.titleAlignButton.setAttribute("aria-label", name);
  el.titleAlignButton.dataset.tip = name;
}

$$("#title-align-menu .menu-item").forEach(function (button) {
  button.addEventListener("click", function () {
    showTitleAlign(button.dataset.align);
    el.titleAlignMenu.open = false;
    remember();
  });
});

// --- Reveal on a click --------------------------------------------------
// Three different things behind one icon (views/editor.ejs): one block of
// the text, which is a class in the body; the slide's whole text box,
// which is an attribute of the slide; and several blocks on one click,
// which is a number they share. Checkmarks and not a choice -- a slide may
// have all three.
function drawFragment() {
  var slide = deck.slides[active];
  var node = markedRange && markedRange.startContainer;
  // A block in a shared step is a fragment too -- that is what it is made
  // of -- but saying so in both rows would read as two things being on
  // when there is one. The step is the more precise answer, so it wins and
  // the first row speaks only for a block that appears on a click of its
  // OWN.
  var zusammen = !sourceMode && rt.togetherHere(el.content, node);
  mark('.menu-item[data-fragment="block"]',
    !sourceMode && !zusammen && rt.fragmentHere(el.content, node));
  mark('.menu-item[data-fragment="text"]', !!(slide && slide.textFragment));
  mark('.menu-item[data-fragment="together"]', zusammen);
}

function mark(selector, on) {
  var row = $(selector);
  row.classList.toggle("is-active", on);
  row.setAttribute("aria-checked", on ? "true" : "false");
}

// The caret is what "this paragraph" means, and opening a menu takes the
// focus off it. So the range is written down on the way in -- the same
// trick the colour tool plays further down -- and put back before the
// command runs.
el.fragmentButton.addEventListener("mousedown", rememberRange);
el.fragmentMenu.addEventListener("toggle", function () {
  if (el.fragmentMenu.open) drawFragment();
});

$$("#fragment-menu .menu-item").forEach(function (row) {
  row.addEventListener("click", function () {
    if (row.dataset.fragment === "text") {
      var slide = deck.slides[active];
      if (slide) slide.textFragment = !slide.textFragment;
    } else if (!sourceMode && markedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(markedRange);
      rt.befehl(el.content, row.dataset.fragment === "together" ? "together" : "fragment");
    }
    el.fragmentMenu.open = false;
    remember();
    drawFragment();
  });
});

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
  [el.textSideMenu, el.textWidthMenu, el.titleAlignMenu].forEach(function (m) {
    if (m.open && !m.contains(ev.target)) m.open = false;
  });
});

$$(".layout-tile").forEach(function (tile) {
  tile.addEventListener("click", function () {
    harvest();
    var slide = deck.slides[active];
    slide.layout = tile.dataset.layout;
    // A layout without columns -- or with one single column -- cannot keep
    // any apart, so the breaks in the body go with the layout that had
    // them.
    if (splitCount(slide) < 2) dropColumnBreaks(slide);
    drawAll();
    remember();
  });
});

// How many columns. Like the switch below it this is read BEFORE the
// change and the fields are filled again after it: going down to one
// column leaves nothing to keep apart, so the breaks in the body go the
// same way they go when the switch is unticked -- the texts become one,
// which is exactly the arrangement the slide now has. Going from three
// columns to two is the same walk one step shorter: what stood in the
// third joins the second rather than being dropped (columns.js).
//
// Unlike the layout tiles above, this is NOT taken away once there is
// text on the slide. It cannot cost anything: no field goes, nothing is
// unwritten, and changing one's mind about the number of columns is the
// most ordinary thing to do while writing them.
$$(".count-option", el.fieldColumnCount).forEach(function (button) {
  button.addEventListener("click", function () {
    harvest();
    var slide = deck.slides[active];
    slide.columnCount = button.dataset.count;
    if (columnCount(slide) < 2) dropColumnBreaks(slide);
    // The whole form, not only the field: the switch under the buttons
    // comes and goes with the second column, and the body has to go back
    // into the fields -- two texts become one, or the other way round.
    showSlide();
    remember();
  });
});

// One text per column, or one text through all of them. Read BEFORE the
// switch is flipped and written back after it -- otherwise the fields as
// they stand now would be read with the new arrangement's rule.
el.columnsSplit.addEventListener("change", function () {
  harvest();
  var slide = deck.slides[active];
  if (el.columnsSplit.checked) slide.columnMode = SPLIT;
  else dropColumnBreaks(slide);
  // The body has to go back into the fields: one text becomes two or three,
  // or the other way round.
  sourceMode = !contentSimple(slide);
  setContentMode(slide);
  remember();
});

$$(".toolbar button[data-command]").forEach(function (b) {
  // mousedown rather than click: otherwise the field loses focus first,
  // and with it the selection the command is meant to act on.
  b.addEventListener("mousedown", function (ev) {
    ev.preventDefault();
    rt.befehl(el.content, b.dataset.command);
    remember();
  });
});

// --- Colour for a few words --------------------------------------------
// The other tools in the bar can refuse the focus (mousedown, prevented)
// and act on the selection that is still standing. This one cannot: the
// picker is a field, it MUST take the focus, and the selection in the
// rich-text field goes with it. So the selection is written down before
// the focus leaves, and put back before the colour is applied.
var markedRange = null;

function rememberRange() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var range = sel.getRangeAt(0);
  if (el.content.contains(range.commonAncestorContainer)) markedRange = range.cloneRange();
}

// While the picker is open the field is not focused, so nothing else moves
// the selection -- writing it down on the way in is enough.
el.textColorTool.addEventListener("mousedown", rememberRange);
el.content.addEventListener("keyup", rememberRange);
el.content.addEventListener("mouseup", rememberRange);

// coloris:pick comes with every change while the picker is open, so the
// colour is seen on the words as it is chosen rather than after the fact.
document.addEventListener("coloris:pick", function (ev) {
  if (!ev.detail || ev.detail.currentEl !== el.textColorTool) return;
  if (sourceMode || !markedRange) return;
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(markedRange);
  rt.farbe(el.content, ev.detail.color);
  // The command leaves a selection of its own over the same words; it is
  // the one the next change has to act on.
  if (sel.rangeCount) markedRange = sel.getRangeAt(0).cloneRange();
  remember();
});

// The button wears the colour of the text the caret is in, the way the
// heading's chooser wears the alignment in force. Text in no colour of its
// own reads as the field's own colour -- which is what an empty field
// means here, so the drop goes back to grey rather than to near-black.
function drawTextColor() {
  if (document.activeElement !== el.content) return;
  var here = "";
  try { here = String(document.queryCommandValue("foreColor") || ""); } catch (e) { /* not asked */ }
  var own = window.getComputedStyle(el.content).color;
  var value = !here || here === own ? "" : rt.farbeVon({ style: { color: here }, tagName: "span" });
  if (value === el.textColorTool.value) return;
  el.textColorTool.value = value;
  // quiet: this follows the caret, it is not somebody choosing a colour.
  el.textColorTool.dataset.quiet = "1";
  el.textColorTool.dispatchEvent(new Event("input", { bubbles: true }));
  delete el.textColorTool.dataset.quiet;
}

document.addEventListener("selectionchange", drawTextColor);

el.sourceButton.addEventListener("click", function () {
  harvest();
  var slide = deck.slides[active];
  // contentSimple and not isSimple: on a slide whose columns are kept
  // apart, the body carries the break lines between them -- and those are
  // exactly what never reaches a field, because each column goes into the
  // field on its own. Asking the whole body would refuse the way back from
  // source mode on every one of those slides.
  if (sourceMode && !contentSimple(slide)) {
    note(t("message.staysSource"));
    return;
  }
  sourceMode = !sourceMode;
  setContentMode(slide);
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

// --- Emoji -------------------------------------------------------------
// An emoji is a character, not a formatting: it goes in where the cursor
// is and into the .md as itself -- no attribute, no class, nothing for the
// renderer to know about.
var emojiMenu = $("#emoji-menu");

// The panel is built once, from the table the page carries (emoji.js).
// Groups with their word above them, so 450 characters can be scanned
// instead of searched.
(function buildEmojiPanel() {
  var grid = $("#emoji-grid");
  var groups = [];
  try { groups = JSON.parse($("#data-emoji").textContent); } catch (e) { /* no panel then */ }
  groups.forEach(function (group) {
    var head = document.createElement("span");
    head.className = "emoji-group";
    head.textContent = group.name;
    grid.appendChild(head);
    group.emoji.forEach(function (character) {
      var key = document.createElement("button");
      key.type = "button";
      key.className = "emoji-key";
      key.setAttribute("role", "menuitem");
      // No label: a screen reader announces an emoji by its own Unicode
      // name, in more languages than this project could keep up to date.
      key.textContent = character;
      grid.appendChild(key);
    });
  });
})();

// mousedown with preventDefault throughout, on the summary as well as on
// the keys: that keeps the focus -- and with it the place the character is
// meant to go -- in the text field. A <summary> still opens its menu on
// the click that follows, so the menu loses nothing by it.
$("#emoji-menu > summary").addEventListener("mousedown", function (ev) {
  ev.preventDefault();
});

// One listener for all of them, on the panel: 450 buttons with a listener
// each would be 450 listeners for the same three lines.
$(".emoji-panel").addEventListener("mousedown", function (ev) {
  var key = ev.target.closest(".emoji-key");
  if (!key) return;
  ev.preventDefault();
  insertEmoji(key.textContent);
});

// Under the button, and inside the column. Those two pull against each
// other: the panel is ten keys wide, and the bar wraps at narrow widths so
// the button stands anywhere in it. Hung from the button alone the panel
// would reach out of the column.
//
// So it hangs from the BAR -- which spans the column and can therefore
// always hold it -- and is placed under the button: from its left edge
// where there is room to the right, from its RIGHT edge where there is
// not (which is what every menu does), and flush left if even that does
// not fit.
emojiMenu.addEventListener("toggle", function () {
  if (!emojiMenu.open) return;
  var panel = $(".emoji-panel");
  var bar = emojiMenu.closest(".toolbar");
  var button = $("#emoji-menu > summary");
  var barBox = bar.getBoundingClientRect();
  var buttonBox = button.getBoundingClientRect();
  var width = panel.offsetWidth;
  var room = bar.clientWidth - width;
  var left = buttonBox.left - barBox.left;
  if (left > room) left = buttonBox.right - barBox.left - width;
  panel.style.left = Math.max(0, Math.min(left, room)) + "px";
});

function insertEmoji(character) {
  if (sourceMode) {
    // The same place the code button writes to when a slide is source.
    var field = el.sourceText;
    var start = field.selectionStart;
    var end = field.selectionEnd;
    field.value = field.value.slice(0, start) + character + field.value.slice(end);
    field.selectionStart = field.selectionEnd = start + character.length;
    field.focus();
  } else {
    el.content.focus();
    // insertText and not innerHTML: it lands at the cursor, and the
    // browser's own undo knows about it.
    document.execCommand("insertText", false, character);
  }
  remember();
}

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

// --- The form's tabs ---------------------------------------------------
// What the slide says, what it looks like, and the deck's picture library,
// one in front of the other
// (views/editor.ejs). The chosen tab belongs to the person and not to the
// slide, so it stays put while one slide after another is worked through
// -- someone giving a whole deck its colours should not have to choose the
// tab thirteen times.
//
// It is NOT kept past a reload, though, and that is the one place where
// this differs from the group it replaces. The editor opening onto
// anything but the text of the first slide would be a worse start than the
// one thing the old fold could not do, which was to be in the way.
function tabShow(tab) {
  $$(".tab").forEach(function (b) {
    var front = b === tab;
    b.setAttribute("aria-selected", front ? "true" : "false");
    // Out of the tab order, all but the one in front: a row of tabs is one
    // stop, and the arrow keys move inside it (below). That is what a
    // screen reader expects of a tablist, and it saves four presses of Tab
    // on the way to the text field.
    b.tabIndex = front ? 0 : -1;
    $("#" + b.dataset.panel).hidden = !front;
  });
  // The library is a picture of the whole deck, so it is put together at
  // the moment it is asked for rather than kept up to date behind a tab
  // nobody is looking at.
  if (!libraryPanel.hidden) libraryDraw();
}

$$(".tab").forEach(function (tab) {
  tab.addEventListener("click", function () { tabShow(tab); });
});

// Left and right walk the row and take the focus with them -- pressing a
// tab and arriving at it are the same thing here, there is nothing to
// confirm. Home and End for the ends of the row.
$(".tab-row").addEventListener("keydown", function (ev) {
  var tabs = $$(".tab");
  var here = tabs.indexOf(document.activeElement);
  if (here === -1) return;
  var there = null;
  if (ev.key === "ArrowLeft") there = (here - 1 + tabs.length) % tabs.length;
  else if (ev.key === "ArrowRight") there = (here + 1) % tabs.length;
  else if (ev.key === "Home") there = 0;
  else if (ev.key === "End") there = tabs.length - 1;
  if (there === null) return;
  ev.preventDefault();
  tabShow(tabs[there]);
  tabs[there].focus();
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
// One picker, two callers by now: the picture of the slide in front, and
// the logo of one of the deck's two bands (js/editor/bands.js). So whoever
// opened it says what is to happen with the choice, instead of the gallery
// knowing a slide.
var imageDialog = $("#image-dialog");
var imageWanted = null;

function askForImage(onPick) {
  imageWanted = onPick;
  drawGallery();
  imageDialog.showModal();
}

// What the picker does when nobody said otherwise: the picture goes onto
// the slide being edited.
function pickForSlide(name) {
  harvest();
  deck.slides[active].image = name;
  showImage(name);
  remember();
}

// The address a picture in this deck's folder has. One place for it: the
// form shows it, the library shows it and so does the band dialog.
function imageUrl(name) {
  return BASE + "/assets/" + encodeURIComponent(name);
}

function showImage(name) {
  el.imagePreview.hidden = !name;
  el.imageRemove.hidden = !name;
  if (name) el.imagePreview.src = imageUrl(name);
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
    img.src = imageUrl(name);
    img.alt = name;
    img.loading = "lazy";
    b.appendChild(img);
    gallery.appendChild(b);
  });
}

$("#image-choose").addEventListener("click", function () {
  askForImage(pickForSlide);
});

$("#image-gallery").addEventListener("click", function (ev) {
  var b = ev.target.closest(".gallery-image");
  if (!b) return;
  imageDialog.close();
  (imageWanted || pickForSlide)(b.dataset.name);
});

el.imageRemove.addEventListener("click", function () {
  harvest();
  deck.slides[active].image = "";
  showImage("");
  remember();
});

// --- The library -------------------------------------------------------
// The third tab: every picture in the folder, and where it stands
// (js/editor/library.js). Drawn on the way in and after anything that can
// change the answer -- while it is behind another tab there is nobody to
// draw it for.
var libraryList = $("#library-list");
var libraryEmpty = $("#library-empty");
var libraryPanel = $("#panel-library");

function libraryDraw() {
  libraryEmpty.hidden = images.length > 0;
  drawLibrary(libraryList, deck, images, BASE, libraryDelete);
}

// Only ever called for a picture the list has just shown as unused, and
// the server asks the same question again of the SAVED file -- which is
// the one that counts, since that is what the folder belongs to. With
// autosave off the two can disagree for a moment, and then the answer is
// to save first rather than to delete something a slide still points at.
function libraryDelete(name) {
  if (!window.confirm(t("library.deleteConfirm", { name: name }))) return;
  fetch(BASE + "/assets/" + encodeURIComponent(name), { method: "DELETE", headers: schreibHead() })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (a) {
      if (a.ok && a.d.ok) {
        images = a.d.images || images.filter(function (n) { return n !== name; });
        libraryDraw();
        // The prompt dialog names the pictures a model may choose from, and
        // one that has just gone is not one of them any more (ai.js).
        if (aiDialog) aiDialog.pictures(images);
        return;
      }
      // The server names both ways of being in use, and they are two
      // different sentences: a picture on three slides is taken off those
      // slides, a band's logo is taken out of the band.
      var inBand = a.d && a.d.bands && a.d.bands.length;
      if (inBand) {
        note(t("library.deleteUsedBand", {
          name: name,
          bands: a.d.bands.map(function (which) { return t("bands." + which); }).join(", "),
        }));
        return;
      }
      note(a.d && a.d.used && a.d.used.length
        ? t("library.deleteUsed", { name: name, slides: a.d.used.join(", ") })
        : t("library.deleteFailed", { name: name }));
    })
    .catch(function () { note(t("library.deleteFailed", { name: name })); });
}

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
      if (!libraryPanel.hidden) libraryDraw();
      if (aiDialog) aiDialog.pictures(images);
      // A freshly uploaded image is almost always wanted right away -- by
      // whoever opened the picker, which may be a band rather than the
      // slide (askForImage above).
      if (d.fresh && d.fresh.length) {
        imageDialog.close();
        (imageWanted || pickForSlide)(d.fresh[0]);
      }
    })
    .catch(function (e) { console.error(e); note(t("message.imageError")); });
  ev.target.value = "";
});

// --- The deck's two bands ----------------------------------------------
// The dialog behind the button in the header (js/editor/bands.js). It
// works on the model and hands the three things back that only this file
// can do: save, rebuild the preview, open the picture picker.
setupBands({
  read: function () { return deck; },
  // The usual path of every change in this editor: into the model, then
  // the delayed save and the slide in the preview redrawn. The strips
  // stand on every slide, but only the one being looked at is behind the
  // dialog -- the rest are settled on the way out.
  changed: function () {
    remember();
    // The switches in the form appear with the band and go with it: a deck
    // whose footer has just been emptied has nothing left to hide.
    drawSlideBands(deck.slides[active] || {});
  },
  opened: function () { bandsOpen = true; },
  // A band changed, so every slide looks different: the whole preview is
  // rebuilt and every card in the list fetched again -- once, here, rather
  // than after every keystroke while the dialog stood open.
  // untouched: the dialog was only looked into. The flag still has to come
  // off -- the pictures are held back by it -- but there is nothing to
  // save and nothing to rebuild.
  closed: function (untouched) {
    bandsOpen = false;
    if (untouched) return;
    structureChanged();
  },
  chooseLogo: askForImage,
  imageUrl: imageUrl,
  // The box the preview stands in. The dialog is dragged aside and this
  // is the one piece of the page its veil is kept off -- the same as for
  // the source dialog below.
  frame: $(".preview-frame"),
});

// --- F5 starts the talk ------------------------------------------------
// The key every presentation program has had for thirty years, and the one
// a presenter stick can usually be taught to send. Deliberately NOT the
// stick's spare key from the settings: that one is Tab or Enter out of the
// box, and in the editor both of those already belong to somebody -- Tab
// to whoever is working with the keyboard, Enter to every field and button
// it lands on. A key that means three things means none of them.
//
// It costs the browser's reload, which F5 otherwise is. That is the trade
// this key has always been: Ctrl+R still reloads, and in an editor whose
// whole point is the talk, starting the talk is the better F5.
//
// The talk cannot arrive in fullscreen: a freshly opened tab has no user
// activation of its own, and without one no browser hands over the screen
// (measured at six moments, for window.open plain, named, with noopener,
// and for a real click on a target="_blank" link -- hasBeenActive false
// throughout). So the tab is asked to take the screen at the first touch
// it gets there, whatever that touch is (views/reveal.ejs).
//
// The tab is opened EMPTY, inside the keypress, and sent on its way once
// what the delayed save still owes has been written -- opening it after
// the save would leave it to the popup blocker, and opening it with the
// address straight away would show a file one keystroke old.
// The talk has to show what stands on the screen here, written or not --
// with autosave off that is the whole point of being able to present
// without saving first. These three are plain links, so the flush has to be
// hung on the click: the tab is opened INSIDE it and sent on its way once
// the server has what it is owed. Opening it after the wait would leave it
// to the popup blocker, which is the same dance presentFromStart does below
// for the key that starts the talk.
$$("a.present-direct, a.present-from-start, #present-from-current").forEach(function (link) {
  link.addEventListener("click", function (ev) {
    if (!schmutzig) return;   // the server is level; the link does its own job
    ev.preventDefault();
    var tab = window.open("", "_blank");
    if (!tab) { window.trivialSlidesSave(); return; }
    var los = function () { tab.location = link.href; };
    Promise.resolve(window.trivialSlidesSave()).then(los, los);
  });
});

function presentFromStart() {
  var tab = window.open("", "_blank");
  if (!tab) return;   // a blocker said no; nothing to be done about it here
  var los = function () { tab.location = BASE + "/present?vollbild=1"; };
  Promise.resolve(window.trivialSlidesSave()).then(los, los);
}

// Which key that is comes from the settings, where it is pressed once and
// whatever arrives is kept (js/presenter-keys.js). F5 out of the box;
// removing every key there switches the whole thing off.
document.addEventListener("keydown", function (ev) {
  if (ev.repeat) return;
  // With a modifier held it is somebody's shortcut -- the browser's reload
  // among them -- and not the talk.
  if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
  // A dialog on top has the floor: the source may be half written in it.
  if (document.querySelector("dialog[open]")) return;
  var keys = window.startKeys ? window.startKeys.read() : [];
  if (keys.indexOf(ev.key) === -1) return;
  // A function key means nothing to a field, so it may be taken wherever
  // the cursor stands -- which is what makes F5 work in the middle of a
  // sentence. Anything else a field might want to receive is left to it:
  // somebody who records the letter "b" must still be able to type one.
  if (!/^F\d{1,2}$/.test(ev.key) && ev.target && ev.target.closest
      && ev.target.closest("input, textarea, select, [contenteditable]")) return;
  ev.preventDefault();
  presentFromStart();
});

// --- The deck as Markdown ----------------------------------------------
// Its own file, because it shares little with the rest of the editor: the
// address of the deck, the promise that everything owed has been saved,
// and the way back in below (js/editor/deck-source.js).

// The three header fields are not part of drawAll(): nothing in the editor
// has ever changed them behind the user's back. A source that was edited
// by hand can, so they are written here.
function drawHeader() {
  $("#deck-title").value = deck.title;
  [["deck-theme", deck.theme], ["deck-transition", deck.transition]].forEach(function (pair) {
    var button = $("#" + pair[0]);
    button.dataset.value = pair[1];
    button.textContent = pair[1];
    $$(".menu-item", $("#" + pair[0] + "-menu")).forEach(function (row) {
      var here = row.dataset.value === pair[1];
      row.classList.toggle("is-active", here);
      row.setAttribute("aria-checked", here ? "true" : "false");
    });
  });
}

// A file written from the source dialog leaves the editor holding a model
// that is one version behind -- and its next keystroke would save that old
// model over the new file. So the new one is taken on here, and everything
// showing it is drawn again.
//
// `wrote` is the slide that was being written in over there, and the
// editor comes back standing on it: having applied a change to slide
// seven, seven is the slide one wants in front of one. Without it -- and
// where the slide it names is gone -- the nearest one that still exists
// takes its place.
function adoptDeck(fresh, wrote) {
  deck = fresh;
  active = Math.max(0, Math.min(wrote == null ? active : wrote, deck.slides.length - 1));
  activeColumn = 0;
  schmutzig = false;
  // That dialog writes the FILE, whatever autosave says -- it is the file
  // one is editing over there. So nothing is owed any more.
  ungesichert = false;
  drawSaveState();
  drawHeader();
  drawAll();
  // The file has just been written, so this is a moment at which the
  // pictures on the cards can be right -- the same reason the preview is
  // reloaded on the next line: both render from the file, not from the
  // model here.
  drawPictures(el.list, deck);
  preview.newLoad(active);
}

var deckSource = setupDeckSource({
  base: BASE,
  flush: window.trivialSlidesSave,
  adopt: adoptDeck,
  // The frame behind the dialog: while a slide is written in over there,
  // it is the one the preview shows.
  preview: preview,
  // And the box it stands in, which the dialog's veil is kept off -- a
  // slide seen through a veil is a slide judged wrongly.
  frame: $(".preview-frame"),
});

// This deck, changed by instruction, where the server has a key for it
// (js/editor/ai.js) -- and the place a deck BUILT on the overview is
// received, which is why it is wired up whether or not the dialog exists.
// It is handed the source dialog rather than the model: what a model
// writes is a FILE, and it is judged and applied over there, through the
// one door that saves and never saves past a finding. Nothing about the
// deck in this page is touched until the user applies it -- which is also
// what keeps it out of the way of the autosave.
var aiDialog = setupAi({
  base: BASE,
  slug: window.SLIDES_SLUG,
  images: images,
  source: deckSource,
  flush: window.trivialSlidesSave,
  frame: $(".preview-frame"),
});

// --- Startup -----------------------------------------------------------
// Paragraphs rather than <div> on line break: only then does the field
// produce the same structure mdToHtml does, keeping the round trip
// lossless.
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* aeltere Browser */ }
drawAll();

// A deck that wants a newer trivialSlides than this one says so in its
// head, and this is where that is passed on (format.js, views/editor.ejs).
// After the first draw, so the editor stands finished behind the notice
// rather than building itself while it is read.
//
// Said once and not again: it is not an error to be fixed here, it is
// something to know before typing -- what this version does not
// understand is already gone from the model, and saving would write the
// deck without it.
if (window.SLIDES_TOO_NEW) note(window.SLIDES_TOO_NEW);
