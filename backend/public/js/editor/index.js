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
import * as places from "./places.js";
import { drawLibrary } from "./library.js";
import { setupBands, isEmpty as bandEmpty, HIDDEN_FIELD } from "./bands.js";
import { setupAi } from "./ai.js";
import { setupPalette } from "./palette.js";
import { judge, themeText } from "./contrast.js";
import Coloris from "../../../coloris/dist/esm/coloris.js";

var BASE = window.SLIDES_BASE;
var deck = JSON.parse($("#data-deck").textContent);
var LAYOUTS = JSON.parse($("#data-layouts").textContent);
var images = JSON.parse($("#data-images").textContent);
// What each theme colours a slide that chooses nothing of its own, read
// off reveal.js' stylesheets on the server (themes.js). Without it the
// contrast line can only say that the theme decides.
var THEME_COLORS = {};
try { THEME_COLORS = JSON.parse($("#data-themes").textContent); } catch (e) { /* then it says so */ }
// And what each effect lays under the writing instead of the colour the
// slide chose (effects.js). Keyed by name, the way the slide carries it.
var EFFECT_COLORS = {};
try {
  JSON.parse($("#data-effects").textContent).forEach(function (e) { EFFECT_COLORS[e.id] = e; });
} catch (e) { /* then it says so */ }
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
  levelMenu: $("#level-menu"),
  levelButton: $("#level-button"),
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
  layoutMenu: $("#layout-menu"),
  layoutMini: $("#layout-current-mini"),
  layoutName: $("#layout-current-name"),
  state: $("#save-state"),
  saveButton: $("#deck-save"),
  customColor: $("#background-custom"),
  customTextColor: $("#text-color-custom"),
  textColorTool: $("#text-color-tool"),
  gradient: $("#slide-gradient"),
  gradientHint: $("#gradient-hint"),
  gradientName: $("#gradient-name"),
  effectName: $("#effect-name"),
  textColorName: $("#text-color-name"),
  backgroundColorName: $("#background-color-name"),
  sample: $("#look-sample"),
  contrast: $("#look-contrast"),
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
  fieldHeading: $("#field-heading"),
  fieldColumns: $(".field-columns"),
  fieldColumnCount: $("#field-column-count"),
  fieldText: $("#field-text"),
  freestyleTools: $("#freestyle-tools"),
  placeList: $("#place-list"),
  placeCount: $("#place-count"),
  placeEmpty: $("#place-empty"),
  placeOrder: $("#place-order"),
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

var preview = createPreview($("#preview"), BASE, placed, function (n) {
  // The pencil on a selected block, or two clicks on it. The preview
  // knows which block it was; the words are over here, in its row.
  var slide = deck.slides[active];
  if (!slide || !n || n.block < 0) return;
  harvest();
  if (!places.placeable(slide.content) || places.count(slide.content) !== n.count) {
    return note(t("editor.placeLost"));
  }
  openElement(n.block);
});

// Something in the preview was moved, widened or turned. The gesture is
// over; what arrives is which block and where it now stands, and the only
// thing to do here is write it into the slide's text (places.js).
//
// harvest() FIRST, as everywhere else on this path: the text field may be
// a keystroke ahead of the model, and a placement written onto the older
// text would take that keystroke back.
function placed(n) {
  var slide = deck.slides[active];
  if (!slide || !n || n.block < 0) return;
  harvest();
  // The two sides count the blocks of this slide separately -- the editor
  // in the text, the preview in the markup (js/slide-place.js) -- and if
  // they disagree, the number that came back points at a block other than
  // the one under the mouse. Then nothing is placed: moving the wrong
  // block is worse than moving none.
  if (!places.placeable(slide.content) || places.count(slide.content) !== n.count) {
    return note(t("editor.placeLost"));
  }
  var text = places.place(slide.content, n.block, n.at, n.turn);
  if (text == null) return;
  slide.content = text;
  // With a row open the form is being written in, and filling it afresh
  // would take that very field apart under the words going into it. Where
  // a block stands is not on the form anyway -- it belongs to the mouse,
  // which has just said it.
  if (elementAt < 0) {
    // The body has changed under the field, and a body carrying placements
    // is beyond what the rich-text field can show -- so which field is in
    // front is decided afresh (contentSimple), exactly as it is when a
    // slide is opened.
    sourceMode = !contentSimple(slide);
    showSlide();
  }
  remember();
}

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
// The word is there in every state, which it was not. With autosave on the
// header used to say NOTHING -- and the one question a writer asks all day
// is whether the work is safe, so the state everybody is in most of the
// time was the one the bar would not report on. A word that only ever
// appears when something is wrong teaches nobody where to look for it.
//
// It says "saved" through the second or so between a keystroke and the
// delayed write, and that is deliberate rather than overlooked: the gap is
// shorter than the glance, nothing can be done about it in the meantime,
// and a word that flickered between two states while one typed would be
// the noisiest thing in the editor. What it is reporting is the FILE, not
// the keystroke -- and if the file cannot be written, saveNow() says so in
// the same place, in red.
//
// Switched off, the opposite holds: nothing is written unless one presses
// the button, so the bar has to say what is owed, and the button has to be
// there to press. It comes and goes with the setting -- but the slot it
// stands in holds its width either way (app.css), so nothing beside it
// moves when it does.
function drawSaveState() {
  el.saveButton.hidden = autosaveOn;
  var owed = !autosaveOn && (schmutzig || ungesichert);
  el.saveButton.classList.toggle("is-owed", owed);
  stateShow(owed ? t("state.unsaved") : t("state.saved"), owed ? "is-owed" : "is-saved");
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

// The slide as the preview is to show it: what the model holds, and
// nothing else. An open element is no exception any more -- its row writes
// into the slide as it is typed (harvest), so there is no half-finished
// version anywhere for the preview to be told about separately.
function previewNow() {
  var slide = deck.slides[active];
  // The bands travel with the slide: they belong to the deck, and the
  // server would otherwise draw the strips as they stood at the last save
  // (routes/decks.js, js/editor/bands.js).
  if (slide) preview.slideZeichnen(active, slide, deck);
}

var previewSoon = verzoegert(350, previewNow);

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
  // A layout with no heading has none to read either, and the field is
  // not on the form for it (showSlide). Its alignment goes with it: where
  // there is no heading, an attribute saying where it stands is a line in
  // the file for nothing.
  if (!hasTitle(slide)) slide.title = null;
  else slide.title = el.title.value === "" && slide.title == null ? null : el.title.value;
  // On a freestyle slide the text is not in one field at all: it is in the
  // elements, and those are written by the open row and by the mouse
  // (places.js). Reading a field that is not on the form would put back
  // whatever it happened to be holding.
  //
  // The open row IS read here, which is what makes it an ordinary field of
  // this form: typed into, harvested before every save and every slide
  // change, and never a keystroke behind. Only while it belongs to the
  // slide in front -- during a slide change this runs before `active`
  // moves (select), so the row is read into its own slide and not into the
  // next one.
  if (!placing(slide)) slide.content = sourceMode ? el.sourceText.value : harvestText(slide);
  else if (elementAt >= 0 && elementOn === active) {
    var written = elementWritten(slide);
    if (written != null) slide.content = written;
  }
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
  slide.titleAlign = hasTitle(slide) ? (el.titleAlignButton.dataset.choice || "") : "";
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

// Whether this slide is arranged rather than written through: the one
// layout whose text is a set of elements, each standing somewhere of its
// own (layouts.js, slides.css, js/slide-place.js).
function placing(slide) {
  return !!(layoutsById[(slide || {}).layout] || {}).places;
}

// Whether the slide has a heading of its own. The exception speaks, as it
// does on the server (layouts.js, hasTitle): a layout without one says so,
// and on such a slide a heading is one of the blocks in the text.
function hasTitle(slide) {
  return (layoutsById[(slide || {}).layout] || {}).heading !== false;
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
    var here = k.dataset.layout === slide.layout;
    k.classList.toggle("is-active", here);
    k.setAttribute("aria-checked", here ? "true" : "false");
  });
  // The tiles live in a sheet behind the row now, so the row has to say
  // which of them is in force -- the same picture and the same word the
  // tile carries, because they are the one thing the sheet was opened to
  // choose. Without this the form would show a layout nobody can see.
  var chosen = layoutsById[slide.layout] || {};
  el.layoutMini.className = "mini mini-" + slide.layout;
  el.layoutName.textContent = chosen.label || slide.layout || "";
  el.layoutHint.textContent = chosen.hint || "";

  var def = layoutsById[slide.layout] || { fields: [] };
  // The layout that has no heading puts the whole field away -- an input
  // that cannot end up anywhere is worse than no input.
  el.fieldHeading.hidden = !hasTitle(slide);
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
  effectShow();
  lookShow();
}

function setContentMode(slide) {
  var count = splitCount(slide);
  // A slide that is arranged rather than written through shows the list of
  // its elements where the text field stands, and no field at all: its
  // text is in those elements, and each of them is opened in its own row.
  var arranged = placing(slide);
  el.freestyleTools.hidden = !arranged;
  el.fieldText.hidden = arranged;
  if (arranged) {
    el.contentFrame.hidden = true;
    el.sourceFrame.hidden = true;
    drawPlaceList();
    return;
  }
  // A row left standing open on a slide that is no longer arranged would
  // be writing into a text that is now one field's worth.
  closeElement();
  // The frames carry the visible border, so those are what get hidden --
  // hiding the field alone would leave an empty box behind.
  el.contentFrame.hidden = sourceMode;
  el.sourceFrame.hidden = !sourceMode;
  // The notice only appears when source mode was not chosen freely but
  // forced by the slide.
  el.sourceNote.hidden = !sourceMode || contentSimple(slide);
  el.sourceButton.classList.toggle("is-active", sourceMode);
  $$("#text-toolbar button[data-command]").forEach(function (b) { b.disabled = sourceMode; });
  // The heading menu is a <details> rather than a button with a command,
  // so the sweep above does not reach it. In source mode there are no
  // blocks to be a heading -- only text -- so it greys out the same way
  // the width menu does when there is no width to choose, and for the
  // same reason: a button that vanishes and comes back is harder to find
  // again than one that goes quiet.
  el.levelMenu.setAttribute("aria-disabled", sourceMode ? "true" : "false");
  if (sourceMode) el.levelMenu.open = false;
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
  // The contrast line rests on the theme's own colours wherever a slide
  // names none, so the verdict belongs to the theme as much as to the
  // slide and has to be said again here (lookShow, contrast.js).
  lookShow();
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

// --- A heading inside the text -----------------------------------------
// One of four, and which one is a question about the block the caret is
// in -- so the menu answers it on the way open, the same as the one
// beside it (js/editor/richtext.js, levelHere). Radio rows and not
// checkmarks: a block is one of the four at a time.
function drawLevel() {
  var node = markedRange && markedRange.startContainer;
  var level = sourceMode ? null : rt.levelHere(el.content, node);
  $$("#level-menu .menu-item").forEach(function (row) {
    var here = level !== null && String(level) === row.dataset.level;
    row.classList.toggle("is-active", here);
    row.setAttribute("aria-checked", here ? "true" : "false");
  });
}

// <details> has no disabled state of its own, so the click that would open
// it is the one that has to be turned away -- the same as the width menu
// further down.
el.levelButton.addEventListener("click", function (ev) {
  if (el.levelMenu.getAttribute("aria-disabled") === "true") ev.preventDefault();
});
el.levelButton.addEventListener("mousedown", rememberRange);
el.levelMenu.addEventListener("toggle", function () {
  if (el.levelMenu.open) drawLevel();
});

$$("#level-menu .menu-item").forEach(function (row) {
  row.addEventListener("click", function () {
    if (!sourceMode && markedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(markedRange);
      rt.befehl(el.content, "level-" + row.dataset.level);
    }
    el.levelMenu.open = false;
    remember();
    drawLevel();
  });
});

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
    // The sheet has done its job the moment one of the eleven is pressed:
    // leaving it open would hide the form it has just changed.
    el.layoutMenu.open = false;
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

// --- The elements of an arranged slide ---------------------------------
// Where a new element lands before anybody has moved it. Not in a corner
// and not on top of the last one: in the middle of the slide, stepped
// along a little for each one already there, so that two in a row do not
// hide one another and neither of them has to be hunted for.
function freeSpot(slide) {
  var taken = places.count(slide.content);
  var step = taken % 6;
  return [20 + step * 4, 18 + step * 9, 40].join(",");
}

// --- The list of them, in the form -------------------------------------
// Every element the slide carries has a row: what kind of thing it is,
// what it says, and the two buttons that make a second one of it and take
// it away. A row opens into the element's own editor -- the template in
// views/editor.ejs, stamped out into the row that is open.
//
// Here and not in a window of its own, which is what this was: a dialog
// floating over the preview has to be pushed somewhere before one can
// work, it covers the very slide it is writing, and nothing in it says
// what ELSE is standing on that slide. The form has the room, the preview
// keeps the whole of its own, and "what is on this slide" is answered by
// reading rather than by hunting over the picture for handles.
//
// One row at a time. Two rich-text fields writing into one slide are two
// answers to the question of what its text is, and the numbers the blocks
// are addressed by (places.js) would be read off a text the other field
// had already changed.

// Which element is open, which slide it belongs to, and the editor
// standing in its row. The slide is kept as a NUMBER: the model is
// replaced wholesale by every save (saveNow), so the object would be a
// different one a second later while the index is the same one.
var elementAt = -1;
var elementOn = -1;
var elementBox = null;
// Whether that editor is showing Markdown rather than rich text -- the
// same question the slide's own text field asks (contentSimple), asked of
// a single block.
var elementSourceMode = false;
// And the third answer: the element is a picture. Then neither field is
// shown -- the picture is -- and this is what the row holds in their
// stead, { alt, src }, until it is written back as a line
// (js/editor/places.js, image).
var elementPicture = null;

// The word under a row's text. The three headings and the text block have
// one already -- it is what the size buttons are named after -- and the
// four shapes that have no size to be asked about are named here.
function kindWord(kind) {
  if (kind === "h1" || kind === "h2" || kind === "h3") return t("editor.placeAdd" + kind.slice(1));
  if (kind === "text") return t("editor.placeAdd0");
  return t("editor.placeKind." + kind);
}

// What a row says about its element, filled in place. In place because
// this is also what runs while one types in the open row: rebuilding the
// list under a field somebody is writing in would take the field away.
function drawPlaceRow(row, slide, n) {
  var kind = places.kind(slide.content, n);
  var said = places.summary(slide.content, n);
  var marks = places.classes(slide.content, n);
  var meta = [kindWord(kind)];
  if (marks.indexOf("fragment") !== -1) meta.push(t("dialog.elementFragment"));
  $(".place-item-kind", row).dataset.kind = kind;
  var text = $(".place-item-text", row);
  text.textContent = said || t("editor.placeUntitled");
  text.classList.toggle("is-empty", !said);
  // The one thing here that can outrun its column: cut off at the end by
  // the CSS, with the whole of it in the tooltip.
  $(".place-item-open", row).dataset.tip = said || t("editor.placeUntitled");
  $(".place-item-meta", row).textContent = meta.join(" · ");
  // The first row has nothing above it and the last nothing below: a
  // button that cannot do anything says so rather than doing nothing.
  var count = places.count(slide.content);
  $(".place-item-up", row).disabled = n === 0;
  $(".place-item-down", row).disabled = n === count - 1;
}

function placeRow(slide, n) {
  var row = document.createElement("li");
  row.className = "place-item";
  row.dataset.block = String(n);

  var head = document.createElement("div");
  head.className = "place-item-head";

  // The whole line is the button, not a pencil at the end of it: the row
  // is there to be opened, and a target the width of the column is one
  // nobody has to aim at.
  var open = document.createElement("button");
  open.type = "button";
  open.className = "place-item-open";
  open.id = "place-head-" + n;
  open.setAttribute("aria-expanded", "false");
  open.setAttribute("aria-controls", "place-body-" + n);
  var icon = document.createElement("span");
  icon.className = "place-item-kind";
  icon.setAttribute("aria-hidden", "true");
  open.appendChild(icon);
  var words = document.createElement("span");
  words.className = "place-item-words";
  var text = document.createElement("span");
  text.className = "place-item-text";
  words.appendChild(text);
  var meta = document.createElement("span");
  meta.className = "place-item-meta";
  words.appendChild(meta);
  open.appendChild(words);
  head.appendChild(open);

  var tools = document.createElement("span");
  tools.className = "place-item-tools";
  // Up and down before the other two, the way a slide card carries them
  // (js/editor/slide-list.js): the same pair of questions one step down.
  // Here they do a second thing besides ordering a list -- they are what
  // decides which block lies over which (places.js, move).
  [["up", t("editor.placeUp")], ["down", t("editor.placeDown")],
   ["copy", t("editor.placeDuplicate")], ["remove", t("dialog.elementRemove")]].forEach(function (b) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "place-item-tool place-item-" + b[0];
    button.dataset.tip = b[1];
    button.setAttribute("aria-label", b[1]);
    tools.appendChild(button);
  });
  head.appendChild(tools);
  row.appendChild(head);

  var body = document.createElement("div");
  body.className = "place-item-body";
  body.id = "place-body-" + n;
  body.setAttribute("role", "region");
  body.setAttribute("aria-labelledby", "place-head-" + n);
  body.hidden = true;
  row.appendChild(body);

  drawPlaceRow(row, slide, n);
  return row;
}

// The list, built afresh from the slide's own text -- which is the only
// place the elements live. Whatever row was open is shut first: it is
// about to be thrown away with the list it stands in.
function drawPlaceList() {
  var slide = deck.slides[active];
  if (!slide) return;
  closeElement();
  var count = places.count(slide.content);
  el.placeList.textContent = "";
  for (var n = 0; n < count; n++) el.placeList.appendChild(placeRow(slide, n));
  el.placeList.hidden = !count;
  el.placeEmpty.hidden = !!count;
  // What the order of the rows means. Only where there are two of them to
  // order: on a slide with one block nothing lies over anything.
  el.placeOrder.hidden = count < 2;
  el.placeCount.textContent = count
    ? t(count === 1 ? "editor.placeCountOne" : "editor.placeCount", { n: count })
    : "";
}

// --- One element, open -------------------------------------------------
// The fields of the open row, reached through the box they were stamped
// into: nothing in there is an id, because there is a copy of it per
// element (views/editor.ejs).
function elementBody(box) {
  if (elementPicture) return places.imageLine(elementPicture);
  return elementSourceMode
    ? $(".element-text", box).value
    : rt.htmlToMd($(".element-content", box));
}

// The picture on the row, from whatever the file says it is.
function showElementPicture() {
  $(".element-image-preview", elementBox).src = imageUrl(elementPicture.src);
}

function showElementText(body) {
  // A block that is nothing but a picture is SHOWN, not spelled out:
  // ![](logo.svg) is a file name dressed as Markdown, and a row that
  // offers it as text asks to have the one thing typed in it that cannot
  // be seen going wrong. The picture and the button to swap it take the
  // field's place, and the sentence under them changes with it -- blank
  // lines and what is "written along" say nothing about a photograph.
  elementPicture = places.image(body);
  $(".element-field", elementBox).hidden = !!elementPicture;
  $(".element-image-field", elementBox).hidden = !elementPicture;
  $(".element-note", elementBox).hidden = !!elementPicture;
  $(".element-image-note", elementBox).hidden = !elementPicture;
  if (elementPicture) {
    elementSourceMode = false;
    showElementPicture();
    return;
  }
  elementSourceMode = !rt.isSimple(body);
  $(".element-frame", elementBox).hidden = elementSourceMode;
  $(".element-source", elementBox).hidden = !elementSourceMode;
  $(".element-source-note", elementBox).hidden = !elementSourceMode;
  // Only the commands that need a rich field. The four alignments are
  // marks on the element and not commands on its text, so they work in
  // either mode; the code button writes a fence and works in either mode
  // too, which is the whole reason it is not an execCommand. The colour
  // paints marked words and has none to paint in a textarea.
  $$(".element-toolbar button[data-command]", elementBox).forEach(function (b) {
    b.disabled = elementSourceMode;
  });
  $(".element-color", elementBox).disabled = elementSourceMode;
  if (elementSourceMode) $(".element-text", elementBox).value = body;
  else $(".element-content", elementBox).innerHTML = rt.mdToHtml(body);
}

// What the element says about itself besides its words: how it is
// aligned, and whether it waits for a click. Both are classes on its own
// comment line (places.js), so both are read and written here rather than
// typed into the text.
function showElementMarks(list) {
  var align = (list || []).filter(function (c) { return c.indexOf("align-") === 0; })[0] || "";
  $$(".element-toolbar button[data-align]", elementBox).forEach(function (b) {
    b.classList.toggle("is-active", "align-" + b.dataset.align === align);
  });
  $(".element-fragment", elementBox).checked = (list || []).indexOf("fragment") !== -1;
}

function elementMarks() {
  var out = [];
  var chosen = $(".element-toolbar button[data-align].is-active", elementBox);
  if (chosen) out.push("align-" + chosen.dataset.align);
  if ($(".element-fragment", elementBox).checked) out.push("fragment");
  return out;
}

function showElementLevel(level) {
  $(".element-level-field", elementBox).hidden = level == null;
  $$(".element-level .count-option", elementBox).forEach(function (b) {
    var is = Number(b.dataset.level) === level;
    b.classList.toggle("is-active", is);
    b.setAttribute("aria-pressed", is ? "true" : "false");
  });
}

// The open row as the slide's whole text. Read by harvest() and by
// nobody else: the row writes into the model as it is typed, exactly as
// the text field of every other layout does, and from there the preview,
// the save and the file all read the same one thing. That is what the
// Apply button of the old dialog was for, and why there is none here.
//
// An empty field writes NOTHING. A block with nothing in it is no block
// at all (places.js, blocks), so writing one back would take the element
// off the slide in the middle of somebody retyping it and shift the
// number of every element behind it. Emptying a row and leaving it is
// what deletes the element (closeElement) -- once, at the end, instead of
// on the keystroke that cleared the last letter.
function elementWritten(slide) {
  if (!elementBox) return null;
  var chosen = $(".element-level .count-option.is-active", elementBox);
  var level = $(".element-level-field", elementBox).hidden
    ? null
    : Number(chosen && chosen.dataset.level);
  var body = elementBody(elementBox);
  if (!body.trim()) return null;
  var text = places.write(slide.content, elementAt, level, body);
  if (text != null) text = places.setClasses(text, elementAt, elementMarks());
  return text;
}

function elementChanged() {
  if (elementAt < 0) return;
  // The row of sizes belongs to what stands in the field NOW. Press the
  // list button over a text element and it is a list from that moment: it
  // has no heading size any more, and a row left standing over it offers
  // four buttons that do nothing (places.js, write, refuses the one that
  // would do harm). Empty the bullets back into a sentence and the sizes
  // come back. A picture answers no to the same question, which is how it
  // keeps the row it never had.
  //
  // Asked here and not only when the row opens, because that is the whole
  // of the difference somebody notices: a list made in this row used to
  // keep the sizes of the text it was a minute ago, while the same list
  // opened again the next day had none.
  $(".element-level-field", elementBox).hidden = !places.sized(elementBody(elementBox));
  remember();
  var slide = deck.slides[active];
  var row = elementBox && elementBox.closest(".place-item");
  if (row && slide) drawPlaceRow(row, slide, elementAt);
}

function wireElement(box) {
  $$(".element-toolbar button[data-command]", box).forEach(function (b) {
    // mousedown rather than click, as in the slide's own bar: otherwise
    // the field loses the selection the command is meant to act on.
    b.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      rt.befehl($(".element-content", box), b.dataset.command);
      elementChanged();
    });
  });
  // The alignment is a mark on the element, not a command on its text:
  // one of the four or none of them, and pressing the one in force takes
  // it off again.
  $$(".element-toolbar button[data-align]", box).forEach(function (b) {
    b.addEventListener("click", function () {
      var on = b.classList.contains("is-active");
      $$(".element-toolbar button[data-align]", box).forEach(function (o) { o.classList.remove("is-active"); });
      b.classList.toggle("is-active", !on);
      elementChanged();
    });
  });
  $$(".element-level .count-option", box).forEach(function (b) {
    b.addEventListener("click", function () {
      showElementLevel(Number(b.dataset.level));
      elementChanged();
    });
  });
  // The three that write into the field rather than formatting it. Each
  // one is the slide bar's tool pointed at this row (see writtenIn): the
  // panel of characters, the dialog that builds a code block, and the
  // picker that paints a few words.
  //
  // The emoji panel is filled the first time it is opened and not before:
  // 450 keys per row, for rows that mostly never ask for one, is a cost
  // paid every time a line is clicked.
  var emoji = $(".element-emoji", box);
  var filled = false;
  emoji.addEventListener("toggle", function () {
    if (!emoji.open || filled) return;
    filled = true;
    fillEmojiGrid($(".emoji-grid", emoji));
    // The panel is measured to be placed, and it has just been given
    // something to measure.
    placeEmojiPanel(emoji);
  });
  wireEmojiPanel(emoji);
  $(".element-code", box).addEventListener("click", function () { codeDialogOeffnen(null); });
  // A code block in this field is opened by a click on it, exactly as one
  // in the slide's field is: the block is sealed, so the click lands on it
  // rather than inside it.
  $(".element-content", box).addEventListener("click", function (ev) {
    if (!ev.target.closest) return;
    var block = ev.target.closest(".code-block");
    if (!block || !$(".element-content", box).contains(block)) return;
    if (ev.target.closest(".code-remove")) {
      block.remove();
      elementChanged();
      return;
    }
    codeDialogOeffnen(block);
  });
  // The colour picker hangs itself on the field, and this one was stamped
  // out after the picker was set up -- so it is handed over by name. Its
  // listeners are on the document and find it by themselves (Coloris,
  // bindFields).
  var colour = $(".element-color", box);
  Coloris.wrap(colour);
  colour.addEventListener("mousedown", rememberRange);
  $(".element-content", box).addEventListener("keyup", rememberRange);
  $(".element-content", box).addEventListener("mouseup", rememberRange);
  // The picture, swapped for another out of the same picker the rest of
  // the editor uses. What it says about itself -- its alt text -- is
  // carried over: the picker asks for a file and nothing else, and this
  // is not the place to quietly drop a line the file already had.
  $(".element-image-choose", box).addEventListener("click", function () {
    askForImage(function (name) {
      if (!elementPicture || elementBox !== box) return;
      elementPicture = { alt: elementPicture.alt, src: name };
      showElementPicture();
      elementChanged();
    });
  });
  // Per keystroke, exactly as the slide's own text field is read
  // (el.content above): what holds the keystrokes back from the preview is
  // remember()'s own delay, which is one delay for the whole editor.
  $(".element-content", box).addEventListener("input", elementChanged);
  $(".element-text", box).addEventListener("input", elementChanged);
  $(".element-fragment", box).addEventListener("change", elementChanged);
  // The way out for whoever reached the row with the keyboard: the row
  // shuts and the line that opened it has the focus again, which is where
  // one was before.
  box.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    ev.stopPropagation();
    var row = box.closest(".place-item");
    var gone = closeElement();
    if (gone >= 0) { drawPlaceList(); remember(); return; }
    if (row) $(".place-item-open", row).focus();
  });
}

// Shut, and nothing else: the list is rebuilt by whoever asked for this.
// Returns the element that went with the row -- an emptied one -- or -1,
// so that a caller holding a number knows whether it still means the same
// element.
function closeElement() {
  var box = elementBox;
  var n = elementAt;
  var on = elementOn;
  // Read before the row is let go of: a picture's body is held here and
  // nowhere else, so emptying this first would make every picture look
  // like an emptied row and take it off the slide.
  var empty = box ? !elementBody(box).trim() : true;
  elementBox = null;
  elementAt = -1;
  elementOn = -1;
  elementPicture = null;
  if (!box) return -1;
  var row = box.closest(".place-item");
  box.remove();
  if (row) {
    row.classList.remove("is-open");
    $(".place-item-open", row).setAttribute("aria-expanded", "false");
    $(".place-item-body", row).hidden = true;
  }
  // Only for the slide it was opened on. A row still standing open when
  // the editor is put on another slide is simply taken down -- what it
  // held was written into its own slide at the last keystroke.
  if (!empty || on !== active) return -1;
  var slide = deck.slides[active];
  var text = slide && places.remove(slide.content, n);
  if (text == null) return -1;
  slide.content = text;
  return n;
}

// Shuts whatever is open and says where the element asked for stands
// afterwards: an emptied row takes its element with it and everything
// behind it moves up one. -1 where the element asked for was that one.
function settle(n) {
  var gone = closeElement();
  if (gone < 0) return n;
  drawPlaceList();
  remember();
  if (gone === n) return -1;
  return gone < n ? n - 1 : n;
}

// `fresh` for an element that has just been made: it carries a
// placeholder word and the first thing anybody does is type over it, so
// the words are taken. An old one is opened to be changed, and there the
// cursor goes to the end, where nothing is lost by a keystroke.
function openElement(n, fresh) {
  var slide = deck.slides[active];
  if (!slide || !placing(slide)) return;
  var same = elementAt === n;
  harvest();
  n = settle(n);
  // A second press on the row that is open is what shuts it again.
  if (same || n < 0) return;
  var said = places.read(slide.content, n);
  var row = $('.place-item[data-block="' + n + '"]', el.placeList);
  if (!said || !row) return;
  elementAt = n;
  elementOn = active;
  elementBox = document.importNode($("#element-editor").content, true).firstElementChild;
  var body = $(".place-item-body", row);
  body.appendChild(elementBox);
  body.hidden = false;
  row.classList.add("is-open");
  $(".place-item-open", row).setAttribute("aria-expanded", "true");
  wireElement(elementBox);
  showElementLevel(said.level);
  showElementText(said.body);
  showElementMarks(places.classes(slide.content, n));
  // Hold of it over there as well: the handles go on, so the element can
  // be moved and turned while its words are being written. That the two
  // halves stand side by side is the whole point of writing here rather
  // than in a window over the picture.
  //
  // Not where a group has made the blocks of the text and the elements on
  // the slide two different lists (places.js, placeable): the number means
  // something here and nothing over there, and handles put on the wrong
  // element would be an invitation to drag it.
  if (places.placeable(slide.content)) preview.pick(n);
  row.scrollIntoView({ block: "nearest" });
  // A picture has no field to type in, so the focus goes to the one thing
  // there is to do with it. (A fresh element is never a picture: one
  // chosen in the picker lands on the slide without a row opening at all.)
  if (elementPicture) { $(".element-image-choose", elementBox).focus(); return; }
  var field = elementSourceMode ? $(".element-text", elementBox) : $(".element-content", elementBox);
  field.focus();
  if (fresh) {
    if (elementSourceMode) field.select();
    else document.execCommand("selectAll", false, null);
  } else if (!elementSourceMode) {
    var range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

// --- What the rows are for ---------------------------------------------
el.placeList.addEventListener("click", function (ev) {
  var row = ev.target.closest(".place-item");
  if (!row) return;
  var n = Number(row.dataset.block);
  if (ev.target.closest(".place-item-up")) return placeMove(n, -1);
  if (ev.target.closest(".place-item-down")) return placeMove(n, 1);
  if (ev.target.closest(".place-item-copy")) return placeCopy(n);
  if (ev.target.closest(".place-item-remove")) return placeRemove(n);
  // Anything else inside the row is the open editor minding its own
  // business.
  if (ev.target.closest(".place-item-open")) openElement(n);
});

// One place up or down the list, which on the slide is one step back or
// forward: the blocks are drawn in the order they stand, so the row at the
// bottom is the block on top (places.js, move). Nothing else about either
// element changes -- not its words, not where it stands, not how far it is
// turned. This is the only way to say what covers what, and without it two
// blocks that overlap are stacked in the order they happened to be typed.
function placeMove(n, dir) {
  var slide = deck.slides[active];
  if (!slide || !placing(slide)) return;
  harvest();
  n = settle(n);
  if (n < 0) return;
  var text = places.move(slide.content, n, dir);
  // No neighbour that way. The button is shut in that case (drawPlaceRow),
  // so this is the keyboard and the list redrawing under it.
  if (text == null) return;
  slide.content = text;
  showSlide();
  remember();
  var now = n + (dir < 0 ? -1 : 1);
  // The hands stay on the element: one step is rarely the whole ordering,
  // and the handles over there have to follow the block they are on.
  if (places.placeable(slide.content)) preview.pick(now);
  // And the focus stays on the button that was pressed -- it has just
  // moved to another row with the element it belongs to. At the end of
  // the list that button is shut, and then the row itself takes the
  // focus rather than leaving it on the body.
  var row = $('.place-item[data-block="' + now + '"]', el.placeList);
  if (!row) return;
  var again = $(dir < 0 ? ".place-item-up" : ".place-item-down", row);
  if (again && !again.disabled) again.focus();
  else $(".place-item-open", row).focus();
}

// A second one of the same, standing a step away from it: everything the
// element is travels with it -- its words, its size, where it is aligned,
// whether it waits for a click -- and only its place is moved, so that one
// can see there are now two (places.js, duplicate).
function placeCopy(n) {
  var slide = deck.slides[active];
  if (!slide || !placing(slide)) return;
  harvest();
  n = settle(n);
  if (n < 0) return;
  var text = places.duplicate(slide.content, n, freeSpot(slide));
  if (text == null) return;
  slide.content = text;
  showSlide();
  remember();
  // The copy is the last element on the slide and the one the hands are
  // reaching for: it is taken hold of over there rather than opened here,
  // because what one does with a copy first is put it where it belongs.
  preview.pick(places.count(slide.content) - 1);
}

function placeRemove(n) {
  var slide = deck.slides[active];
  if (!slide || !placing(slide)) return;
  harvest();
  n = settle(n);
  if (n < 0) return;
  var text = places.remove(slide.content, n);
  if (text == null) return;
  slide.content = text;
  showSlide();
  remember();
}

// A new text. It is made as a plain block and the row that opens with it
// asks how large it should be -- which is where that question has to be
// asked anyway, since a size can be changed afterwards. One button here,
// one question there, instead of the same question twice.
$(".place-add-button").addEventListener("click", function () {
  var slide = deck.slides[active];
  if (!slide || !placing(slide)) return;
  harvest();
  closeElement();
  slide.content = places.add(slide.content, 0, t("editor.placeNewText"), freeSpot(slide));
  showSlide();
  remember();
  // Straight into the words: the element exists, and the only thing
  // anybody wants from it now is to say what it reads and how large.
  openElement(places.count(slide.content) - 1, true);
});

// And a picture, which is the same move with the other half left out: it
// is chosen in the picker, lands in the middle like a new text does, and
// then there is nothing to type about it. So no row opens -- what one
// wants of a picture one has just put down is to drag it, pull it to size
// and turn it, and all three are over there. The handles are asked for in
// its stead, so it is already taken hold of when it appears.
//
// Its width and nothing else is given. A picture's height follows its
// width (slides.css), which is the whole of how its proportions are kept:
// there is no number for a height to disagree with.
$(".place-add-image").addEventListener("click", function () {
  var slide = deck.slides[active];
  if (!slide || !placing(slide)) return;
  askForImage(function (name) {
    var now = deck.slides[active];
    if (!now || !placing(now)) return;
    harvest();
    closeElement();
    now.content = places.add(now.content, 0, "![](" + name + ")", freeSpot(now));
    showSlide();
    remember();
    preview.pick(places.count(now.content) - 1);
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

$$("#text-toolbar button[data-command]").forEach(function (b) {
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
  var field = writtenIn().rich;
  if (field && field.contains(range.commonAncestorContainer)) markedRange = range.cloneRange();
}

// While the picker is open the field is not focused, so nothing else moves
// the selection -- writing it down on the way in is enough.
el.textColorTool.addEventListener("mousedown", rememberRange);
el.content.addEventListener("keyup", rememberRange);
el.content.addEventListener("mouseup", rememberRange);

// coloris:pick comes with every change while the picker is open, so the
// colour is seen on the words as it is chosen rather than after the fact.
document.addEventListener("coloris:pick", function (ev) {
  // Any of the bar's colour tools -- the slide's or an element row's --
  // and none of the pickers that set a colour of the SLIDE: those write a
  // value into a field, this one paints the words that are marked.
  var tool = ev.detail && ev.detail.currentEl;
  if (!tool || !tool.closest || !tool.closest(".tool-color")) return;
  var where = writtenIn();
  if (where.plain || !markedRange) return;
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(markedRange);
  rt.farbe(where.rich, ev.detail.color);
  // The command leaves a selection of its own over the same words; it is
  // the one the next change has to act on.
  if (sel.rangeCount) markedRange = sel.getRangeAt(0).cloneRange();
  where.changed();
});

// The button wears the colour of the text the caret is in, the way the
// heading's chooser wears the alignment in force. Text in no colour of its
// own reads as the field's own colour -- which is what an empty field
// means here, so the drop goes back to grey rather than to near-black.
function drawTextColor() {
  var where = writtenIn();
  var tool = where.tool;
  if (!tool || document.activeElement !== where.rich) return;
  var here = "";
  try { here = String(document.queryCommandValue("foreColor") || ""); } catch (e) { /* not asked */ }
  var own = window.getComputedStyle(where.rich).color;
  var value = !here || here === own ? "" : rt.farbeVon({ style: { color: here }, tagName: "span" });
  if (value === tool.value) return;
  tool.value = value;
  // quiet: this follows the caret, it is not somebody choosing a colour.
  tool.dataset.quiet = "1";
  tool.dispatchEvent(new Event("input", { bubbles: true }));
  delete tool.dataset.quiet;
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

// --- The field that is being written in --------------------------------
// Three of the bar's tools do not format a selection, they put something
// where the cursor is: a character, a block of code, a colour on a few
// words. Which field that is depends on which bar they were pressed in --
// the slide's own, or the bar of the one element row that is open. On a
// freestyle slide there is no third answer: the slide's text field is not
// on the screen at all while the elements are (setContentMode).
//
// `changed` is the pair's other half: the slide's field tells the editor
// it has been written in by remember(), an element's row by its own
// elementChanged(), which also redraws the line in the list.
function writtenIn() {
  if (elementBox) {
    return {
      rich: $(".element-content", elementBox),
      plainField: $(".element-text", elementBox),
      plain: elementSourceMode,
      tool: $(".element-color", elementBox),
      changed: elementChanged,
    };
  }
  return {
    rich: el.content,
    plainField: el.sourceText,
    plain: sourceMode,
    tool: el.textColorTool,
    changed: remember,
  };
}

// --- Emoji -------------------------------------------------------------
// An emoji is a character, not a formatting: it goes in where the cursor
// is and into the .md as itself -- no attribute, no class, nothing for the
// renderer to know about.
var emojiMenu = $("#emoji-menu");

// The panel is built once, from the table the page carries (emoji.js).
// Groups with their word above them, so 450 characters can be scanned
// instead of searched.
function fillEmojiGrid(grid) {
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
}
fillEmojiGrid($("#emoji-grid"));

// mousedown with preventDefault throughout, on the summary as well as on
// the keys: that keeps the focus -- and with it the place the character is
// meant to go -- in the text field. A <summary> still opens its menu on
// the click that follows, so the menu loses nothing by it.
//
// Said once for both panels: the slide's, and the one in the bar of an
// element row (views/editor.ejs). Everything about them is the same bar
// twice over, and a second copy of these three handlers is a second place
// for them to drift.
function wireEmojiPanel(menu) {
  menu.querySelector("summary").addEventListener("mousedown", function (ev) {
    ev.preventDefault();
  });
  // One listener for all of them, on the panel: 450 buttons with a
  // listener each would be 450 listeners for the same three lines.
  menu.querySelector(".emoji-panel").addEventListener("mousedown", function (ev) {
    var key = ev.target.closest(".emoji-key");
    if (!key) return;
    ev.preventDefault();
    insertEmoji(key.textContent);
  });
  menu.addEventListener("toggle", function () {
    if (!menu.open) return;
    placeEmojiPanel(menu);
  });
}

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
function placeEmojiPanel(menu) {
  var panel = menu.querySelector(".emoji-panel");
  var bar = menu.closest(".toolbar");
  var button = menu.querySelector("summary");
  if (!panel || !bar || !button) return;
  var barBox = bar.getBoundingClientRect();
  var buttonBox = button.getBoundingClientRect();
  var width = panel.offsetWidth;
  var room = bar.clientWidth - width;
  var left = buttonBox.left - barBox.left;
  if (left > room) left = buttonBox.right - barBox.left - width;
  panel.style.left = Math.max(0, Math.min(left, room)) + "px";
}

wireEmojiPanel(emojiMenu);

function insertEmoji(character) {
  var where = writtenIn();
  if (where.plain) {
    // The same place the code button writes to when the text is source.
    var field = where.plainField;
    var start = field.selectionStart;
    var end = field.selectionEnd;
    field.value = field.value.slice(0, start) + character + field.value.slice(end);
    field.selectionStart = field.selectionEnd = start + character.length;
    field.focus();
  } else {
    where.rich.focus();
    // insertText and not innerHTML: it lands at the cursor, and the
    // browser's own undo knows about it.
    document.execCommand("insertText", false, character);
  }
  where.changed();
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
  var where = writtenIn();

  // A text that is in source mode for some OTHER reason -- a table, say --
  // has no rich field to put a block into. There the fence goes in as text.
  if (where.plain) {
    var zaun = "```" + language + (style ? " hl=" + style : "");
    var block = zaun + "\n" + sourceText + "\n```" + (fragment ? "\n" + rt.FRAGMENT : "");
    // An element's source is a field and is written straight; the slide's
    // is a copy of the model, so there the model is written and the field
    // is filled from it again.
    if (elementBox) {
      var field = where.plainField;
      var text = field.value.replace(/\s+$/, "");
      field.value = text ? text + "\n\n" + block : block;
      elementChanged();
      return;
    }
    var slide = deck.slides[active];
    var before = (slide.content || "").replace(/\s+$/, "");
    slide.content = before ? before + "\n\n" + block : block;
    setContentMode(slide);
    remember();
    return;
  }

  var huelle = document.createElement("div");
  huelle.innerHTML = rt.codeBlockHtml(language, style, sourceText, fragment);
  var fresh = huelle.firstElementChild;
  if (codeBearbeitet && where.rich.contains(codeBearbeitet)) {
    codeBearbeitet.replaceWith(fresh);
  } else {
    where.rich.appendChild(fresh);
    // Something to carry on typing in: after a sealed block at the very end
    // of the field there is otherwise nowhere for the caret to go.
    var danach = document.createElement("p");
    danach.appendChild(document.createElement("br"));
    where.rich.appendChild(danach);
  }
  where.changed();
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

// --- What the slide will look like -------------------------------------
// The sample at the top of the colours panel, and the one line under it
// that says whether the writing can be read on it (views/editor.ejs).
//
// Colour, gradient and effect STACK on a slide -- the ground first, each
// of the others over it (render.js) -- and the panel used to show them as
// three rows of swatches and the result nowhere. Here the three are laid
// on in the same order, so the sample is the arrangement itself rather
// than a picture of it.
//
// A colour nobody has chosen is the THEME's, and the theme's colours are
// read off its stylesheet and handed to this page (themes.js) -- so the
// sample wears them too rather than falling back on the editor's own. It
// has to: the line underneath judges the slide in the colours it will
// really have, and a sample in different ones would stand there arguing
// with the sentence beside it -- pale type on a pale card under the words
// "easy to read". Which colour of the theme's it is depends on the
// ground, and that rule is asked of contrast.js rather than written here
// a second time.
//
// The one thing the sample still cannot show is an effect's own ground:
// that is built of layers in slides.css. The line says so in words, and
// the sample keeps the colour underneath, which is what the layers drift
// over.
function lookShow() {
  var slide = deck.slides[active];
  if (!slide) return;

  var theme = THEME_COLORS[deck.theme];
  var wears = theme ? themeText(theme, slide.background) : null;
  el.sample.style.backgroundColor = slide.background
    || (theme && !slide.gradient ? theme.background : "");
  el.sample.style.backgroundImage = slide.gradient || "";
  el.sample.style.color = slide.textColor || (wears ? wears.main : "");
  $(".look-sample-title", el.sample).style.color = slide.textColor
    || (wears ? wears.heading : "");
  // The quiet of the effect is the tiles' own, worn at another size
  // (app.css) -- one definition, so the sample cannot drift away from the
  // row of tiles that sets it.
  if (slide.effect) el.sample.setAttribute("data-effect", slide.effect);
  else el.sample.removeAttribute("data-effect");

  var said = judge({
    text: slide.textColor,
    background: slide.background,
    gradient: slide.gradient,
    effect: slide.effect,
  }, theme, EFFECT_COLORS[slide.effect]);
  var word = said.state === "unknown"
    ? t(said.see === "text" ? "contrast.noText"
      : said.see === "ground" ? "contrast.noGround"
      : said.see === "effect" ? "contrast.effect" : "contrast.alpha")
    // The number in the reader's own notation: 8.2 in English, 8,2 in
    // German. The same locale the overview dates are written in. Whose
    // doing the number is gets its own sentence, because a number resting
    // on the theme or on an effect changes when that does -- and because
    // the effect's is the WORST of several, which the reader would
    // otherwise have no way of knowing.
    : t("contrast." + said.state + (said.via === "effect" ? "Effect"
      : said.via === "theme" ? "Theme" : ""),
    { n: said.value.toLocaleString(t("date.locale")) });
  el.contrast.textContent = word;
  el.contrast.className = "look-contrast"
    + (said.state === "unknown" ? "" : " is-" + said.state);

  // The name of what is set, at the end of each row. Without a value of
  // its own a slide follows the deck's theme, and that is what the row
  // says rather than standing empty -- an empty line reads as "nothing
  // here to set" and the opposite is true.
  el.textColorName.textContent = slide.textColor || t("editor.colorTheme");
  el.backgroundColorName.textContent = slide.background || t("editor.colorTheme");
}

// --- The effect --------------------------------------------------------
// Radio rows, so the chosen one is said in the markup and not only in a
// class: before this a screen reader had no way at all of learning which
// effect a slide carried (views/editor.ejs).
function effectShow() {
  var slide = deck.slides[active];
  var now = (slide && slide.effect) || "";
  var name = "";
  $$(".effect-tile").forEach(function (k) {
    var here = k.dataset.effect === now;
    k.classList.toggle("is-active", here);
    k.setAttribute("aria-checked", here ? "true" : "false");
    // Only the chosen tile is a tab stop; the arrow keys move inside the
    // row. Thirteen stops across this panel were thirteen presses of Tab
    // to reach the field under it.
    k.tabIndex = here ? 0 : -1;
    if (here) name = k.getAttribute("aria-label");
  });
  el.effectName.textContent = name;
}

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
  // hand-written gradient simply marks none of them, and then the row
  // says so in words rather than leaving the name blank.
  var name = "";
  var any = false;
  $$(".gradient-probe").forEach(function (p) {
    var here = p.dataset.gradient === value;
    p.classList.toggle("is-active", here);
    p.setAttribute("aria-checked", here ? "true" : "false");
    p.tabIndex = here ? 0 : -1;
    if (here) { name = p.getAttribute("aria-label"); any = true; }
  });
  // A radiogroup with nothing checked still has to have ONE tab stop, or
  // the keyboard cannot get into the row at all.
  if (!any) {
    var first = $(".gradient-probe");
    if (first) first.tabIndex = 0;
    name = t("editor.gradientCustom");
  }
  el.gradientName.textContent = name;
}

// Left and right walk a row of swatches and take the choice with them:
// pressing one and arriving at it are the same thing here, there is
// nothing to confirm. The same keys the tabs over this panel answer to,
// and the same reason -- a row is one stop, not thirteen.
function swatchKeys(row, pick) {
  row.addEventListener("keydown", function (ev) {
    var all = $$("[role='radio']", row);
    var here = all.indexOf(document.activeElement);
    if (here === -1) return;
    var there = null;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") there = (here - 1 + all.length) % all.length;
    else if (ev.key === "ArrowRight" || ev.key === "ArrowDown") there = (here + 1) % all.length;
    else if (ev.key === "Home") there = 0;
    else if (ev.key === "End") there = all.length - 1;
    if (there === null) return;
    ev.preventDefault();
    pick(all[there]);
    all[there].focus();
  });
}

el.gradient.addEventListener("input", function () {
  harvest();
  gradientShow();
  remember();
});

function gradientPick(probe) {
  harvest();
  el.gradient.value = probe.dataset.gradient;
  deck.slides[active].gradient = probe.dataset.gradient;
  gradientShow();
  lookShow();
  remember();
}

el.gradientVorlagen.addEventListener("click", function (ev) {
  var probe = ev.target.closest(".gradient-probe");
  if (probe) gradientPick(probe);
});
swatchKeys(el.gradientVorlagen, gradientPick);

// An animated background carries a name, so there is nothing to type: the
// tiles are the whole control.
function effectPick(tile) {
  harvest();
  deck.slides[active].effect = tile.dataset.effect;
  showSlide();
  remember();
}

el.effectTiles.addEventListener("click", function (ev) {
  var tile = ev.target.closest(".effect-tile");
  if (tile) effectPick(tile);
});
swatchKeys(el.effectTiles, effectPick);

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
  var s = String(name == null ? "" : name);
  // What the renderer does with the same name (render.js, imageUrl): a
  // picture written into the file by hand may point anywhere, and the
  // folder of this deck is only where the picker's answers live.
  if (/^(https?:)?\/\//i.test(s) || s.indexOf("data:") === 0) return s;
  return BASE + "/assets/" + encodeURIComponent(s.replace(/^.*\//, ""));
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
  // The frame beside the panel: while a slide is written in over there, it
  // is the one the preview shows. No frame has to be handed over any more
  // -- the preview keeps its own column and nothing is laid over it.
  preview: preview,
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

// Everything the header can do, findable by its name (js/editor/palette.js).
// Set up LAST of the lot, because it reads the header off the page rather
// than being told what is in it -- and by here everything that puts itself
// there has been.
setupPalette();

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
