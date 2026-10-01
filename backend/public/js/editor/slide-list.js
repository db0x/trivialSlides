// The slide list on the left. Shows every slide as a card: a picture of the
// slide with its number, its heading and a small hint of the layout written
// across it -- the user should take in the whole talk without having to page
// through the preview.
//
// The picture is a page of its own inside a frame (views/thumb.ejs): one
// slide, standing still, with the deck's theme and the layout stylesheet
// behind it, and without reveal.js, the highlighter or a player. So the card
// shows the slide rather than a sketch of it, and a list of thirteen slides
// does not become thirteen running presentations.
//
// Vertical slides (reveal.js stacks) are drawn indented. Whether a slide
// hangs vertically can be toggled with a button on the card; that is the
// only place where this concept surfaces at all.
import { $$, t } from "./base.js";

// The width the page inside a frame is laid out in -- reveal.js' own, and
// the same number thumb.css states from the inside.
var SLIDE_WIDTH = 960;

// How far a picture has to be shrunk. The page in the frame is 960 wide and
// has to STAY 960 wide: inside the frame that width is the window, and the
// layouts read the window (slides.css puts picture and text one above the
// other below 640px). Shrinking the page would not shrink the slide, it
// would rearrange it. So the frame keeps its size and the card scales it --
// by how much only the browser knows, which is why it is asked.
var watcher = window.ResizeObserver && new ResizeObserver(function (entries) {
  entries.forEach(function (e) {
    var width = e.contentRect.width;
    if (width) e.target.style.setProperty("--thumb-scale", width / SLIDE_WIDTH);
  });
});

export function drawList(ol, deck, active, layoutsById) {
  // The cards are filled in place rather than built afresh. Each carries a
  // frame, and a frame that is built a second time -- or merely moved
  // within the document -- loads its page again. Rebuilding the list, which
  // happens on every click in it, would blank all thirteen pictures for a
  // moment each time.
  while (ol.children.length > deck.slides.length) ol.removeChild(ol.lastChild);
  while (ol.children.length < deck.slides.length) ol.appendChild(emptyCard());
  deck.slides.forEach(function (slide, i) {
    fillCard(ol.children[i], deck, slide, i, i === active, layoutsById);
  });
}

// The pictures, once the deck has been saved (index.js). That is the one
// moment at which a picture CAN be right: the server draws it from the
// file, so it can show nothing that has not been written yet.
//
// Which is also why drawing the list does not touch them. The list is
// redrawn on every click in it, and the model it is drawn from differs
// from the file in ways that change nothing about a slide -- a field the
// server fills in on its way through, a line the rich-text field hands
// back with other whitespace. A picture fetched again for one of those
// would make the list blink for nothing.
export function drawPictures(ol, deck) {
  deck.slides.forEach(function (slide, i) {
    if (ol.children[i]) setThumb(ol.children[i], deck, slide, i, true);
  });
}

function emptyCard() {
  var li = document.createElement("li");
  li.draggable = true;

  var thumb = document.createElement("span");
  thumb.className = "card-thumb";
  var frame = document.createElement("iframe");
  // A picture and nothing more: no keyboard reaches into it, no screen
  // reader reads the slide twice.
  //
  // The sandbox keeps a card from doing any of the things a card has no
  // business doing -- opening a window, submitting a form, navigating the
  // editor away from itself. What it does allow is the two the picture
  // needs: a script, for the video's still image and for a slide with more
  // text than fits (views/thumb.ejs), and its own origin, without which the
  // theme's fonts would be refused as if they came from a stranger and
  // every thumbnail would be set in the wrong typeface.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.setAttribute("inert", "");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("scrolling", "no");
  // A deck of eighty slides must not fetch eighty pages to show its first
  // six; the cards further down fetch theirs when they are scrolled to.
  frame.loading = "lazy";
  thumb.appendChild(frame);
  if (watcher) watcher.observe(thumb);

  var number = document.createElement("span");
  number.className = "card-number";

  // The heading and the layout, for a reader that cannot see the picture.
  // The card itself says both -- in the picture, which is the whole point
  // of it -- but a picture is not read out, and a list that announces
  // nothing but "1, 2, 3" would be no list at all.
  var title = document.createElement("span");
  title.className = "card-title";

  var buttons = document.createElement("span");
  buttons.className = "card-buttons";
  buttons.appendChild(cardButton("up", t("card.up")));
  buttons.appendChild(cardButton("down", t("card.down")));
  // One icon, two directions: a slide that already hangs vertically is
  // detached again by the same button, which is why it shows as engaged
  // rather than carrying a second icon nobody would tell apart. Which of
  // the two words it wears is settled per slide, below.
  buttons.appendChild(cardButton("indent", t("card.indent")));
  buttons.appendChild(cardButton("duplicate", t("card.duplicate")));
  buttons.appendChild(cardButton("delete", t("card.delete")));

  li.appendChild(thumb);
  li.appendChild(number);
  li.appendChild(title);
  li.appendChild(buttons);
  return li;
}

function fillCard(li, deck, slide, index, active, layoutsById) {
  // Written rather than added to: the marks a drag leaves behind (see
  // below) go with it, which is what the rebuilt list used to do.
  li.className = "slide-card" + (active ? " is-active" : "") + (slide.vertical ? " is-vertical" : "");
  li.dataset.index = String(index);

  li.querySelector(".card-number").textContent = String(index + 1);
  li.querySelector(".card-title").textContent =
    (slide.title || previewText(slide) || t("card.untitled")) +
    ", " + ((layoutsById[slide.layout] || {}).label || slide.layout);

  var indent = li.querySelector('.card-button[data-action="indent"]');
  nameButton(indent, slide.vertical ? t("card.outdent") : t("card.indent"));
  indent.classList.toggle("is-active", !!slide.vertical);
  if (slide.vertical) indent.setAttribute("aria-pressed", "true");
  else indent.removeAttribute("aria-pressed");

  setThumb(li, deck, slide, index, false);
}

// The picture's address carries a mark of what the slide says. So a frame
// is only sent back to the server once what it shows has really changed,
// and stays untouched -- which is to say unflickering -- whenever the list
// is redrawn for some other reason.
function setThumb(li, deck, slide, index, saved) {
  // The property would answer with the full address, the attribute with
  // what was put there -- which is what there is to compare.
  var frame = li.firstElementChild.firstElementChild;
  var now = frame.getAttribute("src");
  // Off a save, only two cards need a picture at once: one that has just
  // been made and has none, and one that has moved and is therefore
  // showing its neighbour's. The rest wait for the file.
  if (!saved && now && now.indexOf("/thumb/" + index + "?") !== -1) return;
  var address = window.SLIDES_BASE + "/thumb/" + index + "?v=" + mark(deck, slide);
  if (now !== address) frame.setAttribute("src", address);
}

// What a slide LOOKS like, in one short string. Deliberately not
// JSON.stringify of the slide: the model travels to the server and comes
// back built afresh on every save (index.js), and a field that arrives in
// another position, or arrives empty where it was missing before, would
// make every picture in the list look new and fetch all of them again.
//
// So the fields are read in one order, and a field that draws nothing
// counts as a field that is not there. The heading is the exception it
// looks like: an empty heading is a heading and holds its space, a missing
// one does not (deck.js), and the two must not come out the same.
var NO_TITLE = "\u0000";

function mark(deck, slide) {
  var parts = [deck.theme];
  Object.keys(slide).sort().forEach(function (key) {
    var value = slide[key];
    if (key === "title") return parts.push("title=" + (value == null ? NO_TITLE : value));
    if (value === "" || value == null || value === false) return;
    parts.push(key + "=" + value);
  });
  return hash(parts.join("\n"));
}

// Not a checksum and not meant to be one: enough that two different slides
// come out with two different addresses (djb2).
function hash(text) {
  var h = 5381;
  for (var i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// The icon itself comes from the stylesheet, picked by data-action -- so
// the button carries no text at all and title/aria-label are its only
// readable name.
function cardButton(action, title) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "card-button";
  b.dataset.action = action;
  nameButton(b, title);
  return b;
}

function nameButton(b, title) {
  b.dataset.tip = title;
  b.setAttribute("aria-label", title);
}

// The first line of body text stands in for a missing heading -- a card
// with no label at all would be impossible to find again in the list.
function previewText(slide) {
  var line = String(slide.content || "").split("\n").find(function (z) {
    return z.trim() && !/^<!--/.test(z.trim());
  });
  return line ? line.replace(/^[-*+]\s+/, "").replace(/[*_[\]`]/g, "").trim().slice(0, 60) : "";
}

// Reordering by dragging. Hands the target position to the caller, who
// changes the model and triggers a redraw.
export function dragEnable(ol, beiVerschieben) {
  var source = null;

  ol.addEventListener("dragstart", function (ev) {
    var card = ev.target.closest(".slide-card");
    if (!card) return;
    source = Number(card.dataset.index);
    card.classList.add("wird-gezogen");
    ev.dataTransfer.effectAllowed = "move";
    // Firefox only starts the drag if data has been set.
    ev.dataTransfer.setData("text/plain", String(source));
  });

  ol.addEventListener("dragover", function (ev) {
    if (source === null) return;
    ev.preventDefault();
    var card = ev.target.closest(".slide-card");
    $$(".slide-card", ol).forEach(function (k) { k.classList.remove("is-target"); });
    if (card) card.classList.add("is-target");
  });

  ol.addEventListener("drop", function (ev) {
    if (source === null) return;
    ev.preventDefault();
    var card = ev.target.closest(".slide-card");
    if (card) {
      var target = Number(card.dataset.index);
      if (target !== source) beiVerschieben(source, target);
    }
    aufraeumen();
  });

  ol.addEventListener("dragend", aufraeumen);

  function aufraeumen() {
    source = null;
    $$(".slide-card", ol).forEach(function (k) {
      k.classList.remove("wird-gezogen");
      k.classList.remove("is-target");
    });
  }
}
