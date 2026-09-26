// The slide list on the left. Shows every slide as a card with a number, a
// heading and a small hint of the layout -- the user should take in the
// whole talk without having to page through the preview.
//
// Vertical slides (reveal.js stacks) are drawn indented. Whether a slide
// hangs vertically can be toggled with a button on the card; that is the
// only place where this concept surfaces at all.
import { $$ } from "./base.js";

export function zeichneListe(ol, deck, aktiv, layoutsById) {
  ol.innerHTML = "";
  deck.folien.forEach(function (folie, i) {
    var li = document.createElement("li");
    li.className = "folie-karte" + (i === aktiv ? " ist-aktiv" : "") + (folie.vertikal ? " ist-vertikal" : "");
    li.draggable = true;
    li.dataset.index = String(i);

    var nummer = document.createElement("span");
    nummer.className = "karte-nummer";
    nummer.textContent = String(i + 1);

    var text = document.createElement("span");
    text.className = "karte-text";
    var titel = document.createElement("span");
    titel.className = "karte-titel";
    titel.textContent = folie.titel || vorschautext(folie) || "(ohne Titel)";
    var art = document.createElement("span");
    art.className = "karte-art";
    art.textContent = (layoutsById[folie.layout] || {}).label || folie.layout;
    text.appendChild(titel);
    text.appendChild(art);

    var knoepfe = document.createElement("span");
    knoepfe.className = "karte-knoepfe";
    knoepfe.appendChild(kartenKnopf("hoch", "↑", "Nach oben"));
    knoepfe.appendChild(kartenKnopf("runter", "↓", "Nach unten"));
    knoepfe.appendChild(kartenKnopf("einruecken", folie.vertikal ? "↰" : "↳",
      folie.vertikal ? "Wieder eigenstaendig machen" : "Unter die Folie darueber haengen"));
    knoepfe.appendChild(kartenKnopf("doppeln", "⧉", "Duplizieren"));
    knoepfe.appendChild(kartenKnopf("loeschen", "×", "Loeschen"));

    li.appendChild(nummer);
    li.appendChild(text);
    li.appendChild(knoepfe);
    ol.appendChild(li);
  });
}

function kartenKnopf(aktion, zeichen, titel) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "karte-knopf";
  b.dataset.aktion = aktion;
  b.title = titel;
  b.setAttribute("aria-label", titel);
  b.textContent = zeichen;
  return b;
}

// The first line of body text stands in for a missing heading -- a card
// with no label at all would be impossible to find again in the list.
function vorschautext(folie) {
  var zeile = String(folie.inhalt || "").split("\n").find(function (z) {
    return z.trim() && !/^<!--/.test(z.trim());
  });
  return zeile ? zeile.replace(/^[-*+]\s+/, "").replace(/[*_[\]`]/g, "").trim().slice(0, 60) : "";
}

// Reordering by dragging. Hands the target position to the caller, who
// changes the model and triggers a redraw.
export function ziehenAktivieren(ol, beiVerschieben) {
  var quelle = null;

  ol.addEventListener("dragstart", function (ev) {
    var karte = ev.target.closest(".folie-karte");
    if (!karte) return;
    quelle = Number(karte.dataset.index);
    karte.classList.add("wird-gezogen");
    ev.dataTransfer.effectAllowed = "move";
    // Firefox only starts the drag if data has been set.
    ev.dataTransfer.setData("text/plain", String(quelle));
  });

  ol.addEventListener("dragover", function (ev) {
    if (quelle === null) return;
    ev.preventDefault();
    var karte = ev.target.closest(".folie-karte");
    $$(".folie-karte", ol).forEach(function (k) { k.classList.remove("ist-ziel"); });
    if (karte) karte.classList.add("ist-ziel");
  });

  ol.addEventListener("drop", function (ev) {
    if (quelle === null) return;
    ev.preventDefault();
    var karte = ev.target.closest(".folie-karte");
    if (karte) {
      var ziel = Number(karte.dataset.index);
      if (ziel !== quelle) beiVerschieben(quelle, ziel);
    }
    aufraeumen();
  });

  ol.addEventListener("dragend", aufraeumen);

  function aufraeumen() {
    quelle = null;
    $$(".folie-karte", ol).forEach(function (k) {
      k.classList.remove("wird-gezogen");
      k.classList.remove("ist-ziel");
    });
  }
}
