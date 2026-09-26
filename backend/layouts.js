// Slide layouts. One definition, two consumers: the editor builds its
// layout tiles from it (handed into the page as JSON), the renderer picks
// the CSS class with it and decides whether an image element is needed.
//
// Important for the storage format: a layout NEVER changes a slide's
// Markdown text, only its attributes. That keeps the body plain Markdown,
// which a stock reveal.js (or a text editor) still renders sensibly --
// just without the finer points of the arrangement.
//
// felder: which input fields the editor shows for this layout.
//   bild   - image picker (data-image)
//   quelle - attribution below the quote (data-quelle)
// Every layout has a title and a body, so those are not in the list.
const LAYOUTS = [
  {
    id: "titel",
    label: "Titelfolie",
    hilfe: "Grosser Titel, darunter Untertitel oder Referent. Fuer den Anfang.",
    felder: [],
  },
  {
    id: "abschnitt",
    label: "Abschnitt",
    hilfe: "Trennfolie zwischen zwei Themen. Farbiger Hintergrund, nur Titel.",
    felder: [],
  },
  {
    id: "text",
    label: "Text",
    hilfe: "Ueberschrift und Inhalt. Der Normalfall.",
    felder: [],
  },
  {
    id: "spalten",
    label: "Zwei Spalten",
    hilfe: "Wie Text, der Inhalt laeuft aber in zwei Spalten nebeneinander.",
    felder: [],
  },
  {
    id: "bild-rechts",
    label: "Bild rechts",
    hilfe: "Text links, Bild rechts daneben.",
    felder: ["bild"],
  },
  {
    id: "bild-links",
    label: "Bild links",
    hilfe: "Bild links, Text rechts daneben.",
    felder: ["bild"],
  },
  {
    id: "bild-voll",
    label: "Bild formatfuellend",
    hilfe: "Bild ueber die ganze Folie, Text lesbar darueber gelegt.",
    felder: ["bild"],
  },
  {
    id: "zitat",
    label: "Zitat",
    hilfe: "Grosses Zitat mit Quellenangabe.",
    felder: ["quelle"],
  },
];

const DEFAULT_LAYOUT = "text";

const byId = new Map(LAYOUTS.map((l) => [l.id, l]));

// Unknown layout names (hand-written Markdown, an older deck) fall back to
// "text" instead of swallowing the slide.
function get(id) {
  return byId.get(String(id || "")) || byId.get(DEFAULT_LAYOUT);
}

function hatFeld(id, feld) {
  return get(id).felder.includes(feld);
}

module.exports = { LAYOUTS, DEFAULT_LAYOUT, get, hatFeld };
