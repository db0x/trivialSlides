// The editor. Keeps the deck's model in memory, mirrors it into the form
// fields and back, saves on a delay and keeps the preview current.
//
// Guiding idea: the model (deck) is the truth, the fields are merely its
// display. Every change takes the same route
//   field -> ernte() -> deck -> merken() -> save + preview
// so that no second, half-baked state can exist.
import { $, $$, t, schreibKopf, verzoegert } from "./base.js";
import * as rt from "./richtext.js";
import { createVorschau } from "./preview.js";
import { zeichneListe, ziehenAktivieren } from "./slide-list.js";
import Coloris from "../../../coloris/dist/esm/coloris.js";

var BASIS = window.FOLIEN_BASIS;
var deck = JSON.parse($("#daten-deck").textContent);
var LAYOUTS = JSON.parse($("#daten-layouts").textContent);
var bilder = JSON.parse($("#daten-bilder").textContent);
var layoutsById = {};
LAYOUTS.forEach(function (l) { layoutsById[l.id] = l; });

var aktiv = 0;
var quelltextModus = false; // shows the current slide as Markdown
var schmutzig = false;

var el = {
  liste: $("#folienliste"),
  titel: $("#folie-titel"),
  inhalt: $("#folie-inhalt"),
  inhaltRahmen: $("#inhalt-rahmen"),
  quelltext: $("#folie-quelltext"),
  quelltextRahmen: $("#quelltext-rahmen"),
  quelltextHinweis: $("#quelltext-hinweis"),
  quelltextKnopf: $("#quelltext-umschalten"),
  quelle: $("#folie-quelle"),
  video: $("#folie-video"),
  videoHinweis: $("#video-hinweis"),
  textseiteMenue: $("#textseite-menue"),
  textseiteKnopf: $("#textseite-knopf"),
  textbreiteMenue: $("#textbreite-menue"),
  textbreiteKnopf: $("#textbreite-knopf"),
  feldBild: $(".feld-bild"),
  feldQuelle: $(".feld-quelle"),
  feldVideo: $(".feld-video"),
  bildVorschau: $("#bild-vorschau"),
  bildEntfernen: $("#bild-entfernen"),
  layoutHilfe: $("#layout-hilfe"),
  stand: $("#speicherstand"),
  eigenfarbe: $("#hintergrund-eigen"),
  eigenTextfarbe: $("#textfarbe-eigen"),
  verlauf: $("#folie-verlauf"),
  verlaufHilfe: $("#verlauf-hilfe"),
  verlaufVorlagen: $("#verlauf-vorlagen"),
  effektKacheln: $("#effekt-kacheln"),
  farbenGruppe: $("#farben-gruppe"),
  codeKnopf: $("#code-einfuegen"),
  codeDialog: $("#code-dialog"),
  codeSprache: $("#code-sprache"),
  codeStil: $("#code-stil"),
  codeText: $("#code-text"),
  codeTitel: $("#code-titel"),
  codeOk: $("#code-ok"),
  codeHinweis: $("#code-hinweis"),
  codeFragment: $("#code-fragment"),
};

var vorschau = createVorschau($("#vorschau"), BASIS);

// --- Notices -------------------------------------------------------------
// One dialog, one line of text. The browser's alert would do the same job,
// but it cannot be styled, it announces the host it comes from, and it
// stops the page dead -- see views/editor.ejs.
var hinweisDialog = $("#hinweis-dialog");
var hinweisText = $("#hinweis-text");

function hinweis(text) {
  hinweisText.textContent = text;
  hinweisDialog.showModal();
}

// --- Saving ------------------------------------------------------------
function standAnzeigen(text, klasse) {
  el.stand.textContent = text;
  el.stand.className = "speicherstand " + (klasse || "");
}

function speichernJetzt() {
  ernte();
  return fetch(BASIS + "/deck.json", {
    method: "PUT",
    headers: schreibKopf({ "Content-Type": "application/json" }),
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
      standAnzeigen("");
    })
    .catch(function (e) {
      console.error(e);
      standAnzeigen(t("stand.offline"), "ist-fehler");
    });
}

var speichernBald = verzoegert(900, speichernJetzt);

// Anything that wants to leave the page -- the language switch, for one --
// has to be able to flush what is still owed. Saving is on a delay, and a
// reload inside that window would throw the last keystroke away.
window.trivialSlidesSpeichern = function () {
  return schmutzig ? speichernJetzt() : Promise.resolve();
};

function merken() {
  ernte();
  schmutzig = true;
  // Deliberately silent. Saving follows within the second, and a label
  // reading "not saved" after every keystroke would be a complaint about
  // the normal course of things. What guards the real risk -- leaving with
  // something unsaved -- is the beforeunload below.
  speichernBald();
  vorschauBald();
}

var vorschauBald = verzoegert(350, function () {
  vorschau.folieZeichnen(aktiv, deck.folien[aktiv]);
});

// Structural changes: save first, then rebuild the preview completely --
// it renders from the file, not from the browser's memory.
function aufbauGeaendert(neuerIndex) {
  aktiv = Math.max(0, Math.min(neuerIndex == null ? aktiv : neuerIndex, deck.folien.length - 1));
  zeichneAlles();
  speichernJetzt().then(function () { vorschau.neuLaden(aktiv); });
}

window.addEventListener("beforeunload", function (ev) {
  if (!schmutzig) return;
  ev.preventDefault();
  ev.returnValue = "";
});

// --- Fields <-> model --------------------------------------------------
// ernte(): reads the form fields into the model. Called before every save
// and before every slide change, so that no input is ever lost that the
// delayed save has not seen yet.
function ernte() {
  var folie = deck.folien[aktiv];
  if (!folie) return;
  deck.titel = $("#deck-titel").value;
  deck.theme = $("#deck-theme").value;
  deck.transition = $("#deck-transition").value;
  folie.titel = el.titel.value;
  folie.inhalt = quelltextModus ? el.quelltext.value : rt.htmlZuMd(el.inhalt);
  folie.quelle = el.quelle.value;
  // Passed on as typed: the server picks the id out of it (video.js), and
  // it does so for the live preview too. So a pasted link is a video
  // before it has been saved anywhere.
  folie.video = el.video.value;
  // The bar shows the side as an icon, so the chosen one lives on the
  // button rather than in a field value.
  folie.textseite = el.textseiteKnopf.dataset.seite || "oben";
  folie.textbreite = el.textbreiteKnopf.dataset.breite || standardBreite();
  // The gradient field takes CSS, so at any moment it may hold something
  // half-typed. Only a complete gradient goes into the model -- the rest
  // stays in the field and is named as unfinished, instead of quietly
  // stripping the slide of the background it still has.
  var verlauf = el.verlauf.value.trim();
  if (!verlauf || el.verlauf.checkValidity()) folie.verlauf = verlauf;
}

function zeigeFolie() {
  var folie = deck.folien[aktiv];
  if (!folie) return;
  el.titel.value = folie.titel || "";

  // Rich text or source? Slides with Markdown outside our subset are
  // shown as source rather than damaged on the way back.
  var einfach = rt.istEinfach(folie.inhalt);
  quelltextModus = !einfach;
  setzeInhaltsModus(folie);

  el.quelle.value = folie.quelle || "";
  el.video.value = folie.video || "";
  // A slide that has never been arranged is arranged the way it has always
  // looked, so the button shows the same thing the slide does.
  zeigeTextseite(folie.textseite || "oben");
  zeigeTextbreite(folie.textbreite || standardBreite());
  videoZeigen();

  $$(".layout-kachel").forEach(function (k) {
    k.classList.toggle("ist-aktiv", k.dataset.layout === folie.layout);
  });
  el.layoutHilfe.textContent = (layoutsById[folie.layout] || {}).hilfe || "";

  var def = layoutsById[folie.layout] || { felder: [] };
  el.feldBild.hidden = def.felder.indexOf("bild") === -1;
  el.feldQuelle.hidden = def.felder.indexOf("quelle") === -1;
  el.feldVideo.hidden = def.felder.indexOf("video") === -1;
  el.textseiteMenue.hidden = def.felder.indexOf("textseite") === -1;
  el.textbreiteMenue.hidden = def.felder.indexOf("textbreite") === -1;
  // A menu left standing open over a layout that no longer has the button
  // would hang in the bar with nothing under it.
  if (el.textseiteMenue.hidden) el.textseiteMenue.open = false;
  if (el.textbreiteMenue.hidden) el.textbreiteMenue.open = false;
  zeigeBild(folie.bild);

  farbfeldZeigen(el.eigenfarbe, folie.hintergrund);
  farbfeldZeigen(el.eigenTextfarbe, folie.textfarbe);
  el.verlauf.value = folie.verlauf || "";
  verlaufZeigen();
  $$(".effekt-kachel").forEach(function (k) {
    k.classList.toggle("ist-aktiv", k.dataset.effect === (folie.effekt || ""));
  });
  // Folded, the group shows nothing of what the slide carries. The mark on
  // its label says that there is something to unfold.
  el.farbenGruppe.classList.toggle("hat-eigenes",
    !!(folie.hintergrund || folie.textfarbe || folie.verlauf || folie.effekt));
}

function setzeInhaltsModus(folie) {
  // The frames carry the visible border, so those are what get hidden --
  // hiding the field alone would leave an empty box behind.
  el.inhaltRahmen.hidden = quelltextModus;
  el.quelltextRahmen.hidden = !quelltextModus;
  // The notice only appears when source mode was not chosen freely but
  // forced by the slide.
  el.quelltextHinweis.hidden = !quelltextModus || rt.istEinfach(folie.inhalt);
  el.quelltextKnopf.classList.toggle("ist-aktiv", quelltextModus);
  $$(".werkzeugleiste button[data-befehl]").forEach(function (b) { b.disabled = quelltextModus; });
  if (quelltextModus) el.quelltext.value = folie.inhalt || "";
  else el.inhalt.innerHTML = rt.mdZuHtml(folie.inhalt);
}

function zeichneAlles() {
  zeichneListe(el.liste, deck, aktiv, layoutsById);
  zeigeFolie();
}

function waehle(i) {
  if (i === aktiv || i < 0 || i >= deck.folien.length) return;
  ernte();
  aktiv = i;
  zeichneAlles();
  vorschau.zeigeFolie(aktiv);
}

// --- Slide list --------------------------------------------------------
function leereFolie(layout) {
  return { layout: layout || "text", vertikal: false, titel: "", inhalt: "", bild: "", quelle: "", textseite: "oben", hintergrund: "", textfarbe: "", verlauf: "", effekt: "" };
}

el.liste.addEventListener("click", function (ev) {
  var karte = ev.target.closest(".folie-karte");
  if (!karte) return;
  var i = Number(karte.dataset.index);
  var knopf = ev.target.closest(".karte-knopf");
  if (!knopf) { waehle(i); return; }

  var aktion = knopf.dataset.aktion;
  ernte();
  if (aktion === "loeschen") {
    if (deck.folien.length === 1) { hinweis(t("meldung.mindestensEine")); return; }
    if (!window.confirm(t("meldung.folieLoeschen"))) return;
    deck.folien.splice(i, 1);
    aufbauGeaendert(Math.min(i, deck.folien.length - 1));
  } else if (aktion === "doppeln") {
    deck.folien.splice(i + 1, 0, JSON.parse(JSON.stringify(deck.folien[i])));
    aufbauGeaendert(i + 1);
  } else if (aktion === "hoch" && i > 0) {
    deck.folien.splice(i - 1, 0, deck.folien.splice(i, 1)[0]);
    aufbauGeaendert(i - 1);
  } else if (aktion === "runter" && i < deck.folien.length - 1) {
    deck.folien.splice(i + 1, 0, deck.folien.splice(i, 1)[0]);
    aufbauGeaendert(i + 1);
  } else if (aktion === "einruecken") {
    if (i === 0) return; // the first slide has nothing it could hang from
    deck.folien[i].vertikal = !deck.folien[i].vertikal;
    aufbauGeaendert(i);
  }
});

ziehenAktivieren(el.liste, function (von, nach) {
  ernte();
  deck.folien.splice(nach, 0, deck.folien.splice(von, 1)[0]);
  aufbauGeaendert(nach);
});

$("#folie-neu").addEventListener("click", function () {
  ernte();
  deck.folien.splice(aktiv + 1, 0, leereFolie("text"));
  aufbauGeaendert(aktiv + 1);
});

// --- Form fields -------------------------------------------------------
$("#deck-titel").addEventListener("input", merken);
$("#deck-theme").addEventListener("change", function () { ernte(); speichernJetzt().then(function () { vorschau.neuLaden(aktiv); }); });
$("#deck-transition").addEventListener("change", function () { ernte(); speichernJetzt(); });

el.titel.addEventListener("input", function () {
  merken();
  // The card in the list carries the heading -- it has to follow along as
  // you type, otherwise the list looks frozen.
  var karte = el.liste.children[aktiv];
  if (karte) $(".karte-titel", karte).textContent = el.titel.value || "(ohne Titel)";
});
el.inhalt.addEventListener("input", merken);
el.quelltext.addEventListener("input", merken);
el.quelle.addEventListener("input", merken);

// --- Where the text sits on a video slide ------------------------------
// The bar has room for an icon and no more, so the name of the side has to
// reach it as its label and its tooltip -- otherwise the button says
// nothing at all to a screen reader or to a mouse that rests on it. The
// names come from the menu entries, which the server has already put words
// into; nothing has to be translated a second time here.
function zeigeTextseite(seite) {
  el.textseiteKnopf.dataset.seite = seite;
  var gewaehlt = null;
  $$("#textseite-menue .menue-eintrag").forEach(function (b) {
    var ist = b.dataset.seite === seite;
    b.classList.toggle("ist-aktiv", ist);
    b.setAttribute("aria-checked", ist ? "true" : "false");
    if (ist) gewaehlt = b;
  });
  var name = el.textseiteMenue.dataset.name + (gewaehlt ? ": " + gewaehlt.textContent.trim() : "");
  el.textseiteKnopf.setAttribute("aria-label", name);
  el.textseiteKnopf.dataset.tip = name;
  // The button next door follows the side: beside the player the width is a
  // choice, above and below it is not one (slides.css).
  schalteTextbreite();
}

// --- How wide the text may get beside the picture or the player --------
// A choice only where the text actually stands beside something. On the
// image layouts it always does; on a video slide only once the text has
// been put left or right of the player.
function schalteTextbreite() {
  var folie = deck.folien[aktiv];
  var def = layoutsById[folie && folie.layout] || { felder: [] };
  var seitlich = def.felder.indexOf("textseite") === -1 ||
    el.textseiteKnopf.dataset.seite === "links" || el.textseiteKnopf.dataset.seite === "rechts";
  var an = def.felder.indexOf("textbreite") !== -1 && seitlich;
  el.textbreiteMenue.setAttribute("aria-disabled", an ? "false" : "true");
  if (!an) el.textbreiteMenue.open = false;
}

// What the slide has before anybody chooses differs by layout: half and
// half beside a picture, a third beside a player (layouts.js). The tiles
// carry it into the page along with the rest of the layout definition.
function standardBreite() {
  var folie = deck.folien[aktiv];
  return ((layoutsById[folie && folie.layout] || {}).breite) || "33";
}

// What the text stands beside depends on the layout -- a picture here, a
// player there -- and the button says so. Read off the layout's fields
// rather than off its name, so a layout added later gets the right wording
// by declaring the field it already has to declare (layouts.js).
function breiteName() {
  var folie = deck.folien[aktiv];
  var def = layoutsById[folie && folie.layout] || { felder: [] };
  var d = el.textbreiteMenue.dataset;
  return def.felder.indexOf("video") !== -1 ? d.nameVideo : d.nameBild;
}

function zeigeTextbreite(breite) {
  el.textbreiteKnopf.dataset.breite = breite;
  var gewaehlt = null;
  $$("#textbreite-menue .menue-eintrag").forEach(function (b) {
    var ist = b.dataset.breite === breite;
    b.classList.toggle("ist-aktiv", ist);
    b.setAttribute("aria-checked", ist ? "true" : "false");
    if (ist) gewaehlt = b;
  });
  // The button wears the value, so it needs no icon -- but it still needs
  // to say what the value MEANS, and that goes in the label and the tooltip.
  var wert = gewaehlt ? gewaehlt.textContent.trim() : breite + "\u00a0%";
  el.textbreiteKnopf.textContent = wert;
  var name = breiteName() + ": " + wert;
  el.textbreiteKnopf.setAttribute("aria-label", name);
  el.textbreiteKnopf.dataset.tip = name;
}

$$("#textseite-menue .menue-eintrag").forEach(function (knopf) {
  knopf.addEventListener("click", function () {
    zeigeTextseite(knopf.dataset.seite);
    el.textseiteMenue.open = false;
    merken();
  });
});

$$("#textbreite-menue .menue-eintrag").forEach(function (knopf) {
  knopf.addEventListener("click", function () {
    zeigeTextbreite(knopf.dataset.breite);
    el.textbreiteMenue.open = false;
    merken();
  });
});

// <details> has no disabled state of its own, so the click that would open
// it is the one that has to be turned away.
el.textbreiteKnopf.addEventListener("click", function (ev) {
  if (el.textbreiteMenue.getAttribute("aria-disabled") === "true") ev.preventDefault();
});

// A menu left open would sit over the very field one types in next. Both
// of them, and each closes only when the click was somewhere outside it --
// so opening one closes the other.
document.addEventListener("click", function (ev) {
  [el.textseiteMenue, el.textbreiteMenue].forEach(function (m) {
    if (m.open && !m.contains(ev.target)) m.open = false;
  });
});

$$(".layout-kachel").forEach(function (kachel) {
  kachel.addEventListener("click", function () {
    ernte();
    deck.folien[aktiv].layout = kachel.dataset.layout;
    zeichneAlles();
    merken();
  });
});

$$(".werkzeugleiste button[data-befehl]").forEach(function (b) {
  // mousedown rather than click: otherwise the field loses focus first,
  // and with it the selection the command is meant to act on.
  b.addEventListener("mousedown", function (ev) {
    ev.preventDefault();
    rt.befehl(el.inhalt, b.dataset.befehl);
    merken();
  });
});

el.quelltextKnopf.addEventListener("click", function () {
  ernte();
  var folie = deck.folien[aktiv];
  if (quelltextModus && !rt.istEinfach(folie.inhalt)) {
    hinweis(t("meldung.bleibtQuelltext"));
    return;
  }
  quelltextModus = !quelltextModus;
  setzeInhaltsModus(folie);
});

// Ctrl+B / Ctrl+I in the body field -- the browser does this by itself,
// but the model has to hear about it.
el.inhalt.addEventListener("keyup", function (ev) {
  if (ev.ctrlKey || ev.metaKey) merken();
});

// --- Video ---------------------------------------------------------------
// The field takes whatever is in the clipboard. Whether there is a video id
// in it is decided by the server's own pattern, handed to the page -- so
// the field says "no video in this" with the same rule that would later
// drop the value on saving.
var videoMuster = new RegExp(el.video.dataset.muster || "");

function videoZeigen() {
  var wert = el.video.value.trim();
  var gefunden = !wert || videoMuster.test(wert);
  el.video.setAttribute("aria-invalid", gefunden ? "false" : "true");
  el.videoHinweis.textContent = gefunden ? "" : t("editor.videoUnbekannt");
  el.videoHinweis.classList.toggle("hilfe-fehler", !gefunden);
}

el.video.addEventListener("input", function () {
  videoZeigen();
  merken();
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
  el.codeSprache.value = block ? (block.dataset.sprache || "") : (letzte.sprache || "");
  el.codeStil.value = block ? (block.dataset.stil || "") : (letzte.stil || "");
  var pre = block && block.querySelector("pre");
  el.codeText.value = pre ? pre.textContent : "";
  el.codeFragment.checked = !!(block && block.classList.contains("fragment"));
  // The same dialog does both jobs, so it says which one it is doing.
  el.codeTitel.textContent = t(block ? "dialog.codeBearbeiten" : "dialog.codeTitel");
  el.codeOk.textContent = t(block ? "dialog.codeUebernehmen" : "dialog.codeEinfuegen");
  el.codeHinweis.hidden = !!block;
  el.codeDialog.returnValue = "";
  el.codeDialog.showModal();
}

el.codeKnopf.addEventListener("click", function () { codeDialogOeffnen(null); });

// A click on a block in the field opens it. The block is sealed, so the
// click cannot land inside it -- it lands on it.
el.inhalt.addEventListener("click", function (ev) {
  if (!ev.target.closest) return;
  var block = ev.target.closest(".code-block");
  if (!block || !el.inhalt.contains(block)) return;
  if (ev.target.closest(".code-weg")) {
    block.remove();
    merken();
    return;
  }
  codeDialogOeffnen(block);
});

// In a code field Tab is indentation, not "on to the next control". Shift
// and Escape still get out, so the field is not a trap.
el.codeText.addEventListener("keydown", function (ev) {
  if (ev.key !== "Tab" || ev.shiftKey) return;
  ev.preventDefault();
  var von = el.codeText.selectionStart;
  var bis = el.codeText.selectionEnd;
  var wert = el.codeText.value;
  el.codeText.value = wert.slice(0, von) + "    " + wert.slice(bis);
  el.codeText.setSelectionRange(von + 4, von + 4);
});

el.codeDialog.addEventListener("click", function (ev) {
  if (ev.target.closest("[data-schliessen]")) el.codeDialog.close();
});

// On close, not on submit: a dialog hands the focus back to whatever had it
// before, and it does so AFTER the submit handler.
el.codeDialog.addEventListener("close", function () {
  if (el.codeDialog.returnValue !== "einfuegen") { codeBearbeitet = null; return; }
  var sprache = el.codeSprache.value;
  var stil = el.codeStil.value;
  try {
    localStorage.setItem(CODE_LETZTE, JSON.stringify({ sprache: sprache, stil: stil }));
  } catch (e) { /* private window, storage blocked */ }
  // Emptied out: that is how one gets rid of a block from inside the
  // dialog, and it beats leaving an empty fence on the slide.
  var quelltext = el.codeText.value.replace(/\s+$/, "");
  if (!quelltext.trim() && codeBearbeitet) {
    codeBearbeitet.remove();
    merken();
    codeBearbeitet = null;
    return;
  }
  codeUebernehmen(sprache, stil, quelltext, el.codeFragment.checked);
  codeBearbeitet = null;
});

function codeUebernehmen(sprache, stil, quelltext, fragment) {
  ernte();
  var folie = deck.folien[aktiv];

  // A slide that is in source mode for some OTHER reason -- a table, say --
  // has no field to put a block into. There the fence goes in as text.
  if (quelltextModus) {
    var zaun = "```" + sprache + (stil ? " hl=" + stil : "");
    var block = zaun + "\n" + quelltext + "\n```" + (fragment ? "\n" + rt.FRAGMENT : "");
    var vorher = (folie.inhalt || "").replace(/\s+$/, "");
    folie.inhalt = vorher ? vorher + "\n\n" + block : block;
    setzeInhaltsModus(folie);
    merken();
    return;
  }

  var huelle = document.createElement("div");
  huelle.innerHTML = rt.codeBlockHtml(sprache, stil, quelltext, fragment);
  var neu = huelle.firstElementChild;
  if (codeBearbeitet && el.inhalt.contains(codeBearbeitet)) {
    codeBearbeitet.replaceWith(neu);
  } else {
    el.inhalt.appendChild(neu);
    // Something to carry on typing in: after a sealed block at the very end
    // of the field there is otherwise nowhere for the caret to go.
    var danach = document.createElement("p");
    danach.appendChild(document.createElement("br"));
    el.inhalt.appendChild(danach);
  }
  merken();
}

// --- Colours -----------------------------------------------------------
// A small, muted selection, offered for the background and for the text
// alike: the same eight tones work in both roles, dark on light and light
// on dark. They are the picker's swatches; anything else comes out of its
// colour area.
var FARBEN = ["#1b1f23", "#0b3d4c", "#2b3a55", "#4a3b52", "#5c3d2e", "#2f4f3a", "#f5f0e6", "#ffffff"];

// "No colour of its own" is a state the picker cannot express through a
// colour, so its clear button carries it: an empty field means the slide
// follows the theme, which is what the placeholder says as well.
function colorisEinrichten() {
  Coloris.init();
  Coloris({
    el: ".farbfeld",
    themeMode: document.documentElement.getAttribute("data-theme")
      || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    theme: "polaroid",
    format: "hex",
    alpha: true,
    swatches: FARBEN,
    clearButton: true,
    clearLabel: t("farbe.zuruecksetzen"),
    closeButton: true,
    closeLabel: t("farbe.fertig"),
  });
  // The picker's own light and dark have to follow the editor's.
  new MutationObserver(function () {
    Coloris({ themeMode: document.documentElement.getAttribute("data-theme") || "light" });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

// Both fields work the same way -- `feldName` is all that differs.
function farbfeldVerdrahten(feld, feldName) {
  feld.addEventListener("input", function () {
    if (feld.dataset.still) return;   // set from the model, not by a person
    ernte();
    deck.folien[aktiv][feldName] = feld.value.trim();
    zeigeFolie();
    merken();
  });
}

// Coloris keeps the swatch beside the field in sync by listening for input
// events, so the value cannot simply be assigned -- it has to be announced.
// The flag keeps that announcement from counting as an edit.
function farbfeldZeigen(feld, wert) {
  feld.dataset.still = "1";
  feld.value = wert || "";
  feld.dispatchEvent(new Event("input", { bubbles: true }));
  delete feld.dataset.still;
  // The dot shows the colour, the tooltip names it -- and without a colour
  // it has to show that too, which no colour can express.
  var punkt = feld.closest(".clr-field");
  if (punkt) punkt.classList.toggle("ist-leer", !wert);
  feld.dataset.tip = wert || t("farbe.ohne");
}

colorisEinrichten();
farbfeldVerdrahten(el.eigenfarbe, "hintergrund");
farbfeldVerdrahten(el.eigenTextfarbe, "textfarbe");

// --- The colour group ---------------------------------------------------
// Closed to begin with: colours, gradients and effects are what one reaches
// for after a while, and the editor should not open with them. Whoever has
// opened it once is past that point, so the choice is kept -- in the
// browser, like the light/dark setting, because it belongs to the person
// and not to the deck.
var FARBEN_OFFEN = "trivialslides:farben-offen";

try {
  el.farbenGruppe.open = localStorage.getItem(FARBEN_OFFEN) === "1";
} catch (e) { /* private window, storage blocked */ }

el.farbenGruppe.addEventListener("toggle", function () {
  try {
    localStorage.setItem(FARBEN_OFFEN, el.farbenGruppe.open ? "1" : "0");
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
var verlaufHinweis = el.verlaufHilfe.textContent;

function verlaufZeigen() {
  var wert = el.verlauf.value.trim();
  var falsch = !!wert && !el.verlauf.checkValidity();
  el.verlauf.setAttribute("aria-invalid", falsch ? "true" : "false");
  el.verlaufHilfe.classList.toggle("hilfe-fehler", falsch);
  el.verlaufHilfe.textContent = falsch ? t("editor.verlaufUngueltig") : verlaufHinweis;
  // The active swatch is whichever one holds exactly this value -- a
  // hand-written gradient simply marks none of them.
  $$(".verlauf-probe").forEach(function (p) {
    p.classList.toggle("ist-aktiv", p.dataset.verlauf === wert);
  });
}

el.verlauf.addEventListener("input", function () {
  ernte();
  verlaufZeigen();
  merken();
});

el.verlaufVorlagen.addEventListener("click", function (ev) {
  var probe = ev.target.closest(".verlauf-probe");
  if (!probe) return;
  ernte();
  el.verlauf.value = probe.dataset.verlauf;
  deck.folien[aktiv].verlauf = probe.dataset.verlauf;
  verlaufZeigen();
  merken();
});

// An animated background carries a name, so there is nothing to type: the
// tiles are the whole control.
el.effektKacheln.addEventListener("click", function (ev) {
  var kachel = ev.target.closest(".effekt-kachel");
  if (!kachel) return;
  ernte();
  deck.folien[aktiv].effekt = kachel.dataset.effect;
  zeigeFolie();
  merken();
});

// --- Images ------------------------------------------------------------
var bildDialog = $("#bild-dialog");

function zeigeBild(name) {
  el.bildVorschau.hidden = !name;
  el.bildEntfernen.hidden = !name;
  if (name) el.bildVorschau.src = BASIS + "/bilder/" + encodeURIComponent(name);
}

function zeichneGalerie() {
  var galerie = $("#bild-galerie");
  galerie.innerHTML = "";
  $("#bild-leer").hidden = bilder.length > 0;
  bilder.forEach(function (name) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "galerie-bild";
    b.dataset.name = name;
    b.dataset.tip = name;
    var img = document.createElement("img");
    img.src = BASIS + "/bilder/" + encodeURIComponent(name);
    img.alt = name;
    img.loading = "lazy";
    b.appendChild(img);
    galerie.appendChild(b);
  });
}

$("#bild-waehlen").addEventListener("click", function () {
  zeichneGalerie();
  bildDialog.showModal();
});

$("#bild-galerie").addEventListener("click", function (ev) {
  var b = ev.target.closest(".galerie-bild");
  if (!b) return;
  ernte();
  deck.folien[aktiv].bild = b.dataset.name;
  zeigeBild(b.dataset.name);
  bildDialog.close();
  merken();
});

el.bildEntfernen.addEventListener("click", function () {
  ernte();
  deck.folien[aktiv].bild = "";
  zeigeBild("");
  merken();
});

$("#bild-datei").addEventListener("change", function (ev) {
  var dateien = ev.target.files;
  if (!dateien || !dateien.length) return;
  var daten = new FormData();
  Array.prototype.forEach.call(dateien, function (f) { daten.append("bild", f); });
  fetch(BASIS + "/bilder", { method: "POST", headers: schreibKopf(), body: daten })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      bilder = d.bilder || bilder;
      zeichneGalerie();
      // A freshly uploaded image is almost always wanted right away.
      if (d.neu && d.neu.length) {
        ernte();
        deck.folien[aktiv].bild = d.neu[0];
        zeigeBild(d.neu[0]);
        bildDialog.close();
        merken();
      }
    })
    .catch(function (e) { console.error(e); hinweis(t("meldung.bildFehler")); });
  ev.target.value = "";
});

// --- Startup -----------------------------------------------------------
// Paragraphs rather than <div> on line break: only then does the field
// produce the same structure mdZuHtml does, keeping the round trip
// lossless.
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* aeltere Browser */ }
zeichneAlles();
