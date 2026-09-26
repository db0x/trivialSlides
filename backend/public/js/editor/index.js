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
  feldBild: $(".feld-bild"),
  feldQuelle: $(".feld-quelle"),
  bildVorschau: $("#bild-vorschau"),
  bildEntfernen: $("#bild-entfernen"),
  layoutHilfe: $("#layout-hilfe"),
  stand: $("#speicherstand"),
  eigenfarbe: $("#hintergrund-eigen"),
  eigenTextfarbe: $("#textfarbe-eigen"),
};

var vorschau = createVorschau($("#vorschau"), BASIS);

// --- Saving ------------------------------------------------------------
function standAnzeigen(text, klasse) {
  el.stand.textContent = text;
  el.stand.className = "speicherstand " + (klasse || "");
}

function speichernJetzt() {
  ernte();
  standAnzeigen(t("stand.speichert"), "ist-aktiv");
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
      standAnzeigen(t("stand.gespeichert"));
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
  standAnzeigen(t("stand.fehler"), "ist-offen");
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

  $$(".layout-kachel").forEach(function (k) {
    k.classList.toggle("ist-aktiv", k.dataset.layout === folie.layout);
  });
  el.layoutHilfe.textContent = (layoutsById[folie.layout] || {}).hilfe || "";

  var def = layoutsById[folie.layout] || { felder: [] };
  el.feldBild.hidden = def.felder.indexOf("bild") === -1;
  el.feldQuelle.hidden = def.felder.indexOf("quelle") === -1;
  zeigeBild(folie.bild);

  farbfeldZeigen(el.eigenfarbe, folie.hintergrund);
  farbfeldZeigen(el.eigenTextfarbe, folie.textfarbe);
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
  return { layout: layout || "text", vertikal: false, titel: "", inhalt: "", bild: "", quelle: "", hintergrund: "", textfarbe: "" };
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
    if (deck.folien.length === 1) { window.alert(t("meldung.mindestensEine")); return; }
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
    window.alert(t("meldung.bleibtQuelltext"));
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
    .catch(function (e) { console.error(e); window.alert(t("meldung.bildFehler")); });
  ev.target.value = "";
});

// --- Startup -----------------------------------------------------------
// Paragraphs rather than <div> on line break: only then does the field
// produce the same structure mdZuHtml does, keeping the round trip
// lossless.
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* aeltere Browser */ }
zeichneAlles();
