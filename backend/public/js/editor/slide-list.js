// The slide list on the left. Shows every slide as a card with a number, a
// heading and a small hint of the layout -- the user should take in the
// whole talk without having to page through the preview.
//
// Vertical slides (reveal.js stacks) are drawn indented. Whether a slide
// hangs vertically can be toggled with a button on the card; that is the
// only place where this concept surfaces at all.
import { $$, t } from "./base.js";

export function drawList(ol, deck, active, layoutsById) {
  ol.innerHTML = "";
  deck.slides.forEach(function (slide, i) {
    var li = document.createElement("li");
    li.className = "slide-card" + (i === active ? " is-active" : "") + (slide.vertical ? " is-vertical" : "");
    li.draggable = true;
    li.dataset.index = String(i);

    var number = document.createElement("span");
    number.className = "card-number";
    number.textContent = String(i + 1);

    var text = document.createElement("span");
    text.className = "card-text";
    var title = document.createElement("span");
    title.className = "card-title";
    title.textContent = slide.title || previewText(slide) || t("card.untitled");
    var art = document.createElement("span");
    art.className = "card-art";
    art.textContent = (layoutsById[slide.layout] || {}).label || slide.layout;
    text.appendChild(title);
    text.appendChild(art);

    var buttons = document.createElement("span");
    buttons.className = "card-buttons";
    buttons.appendChild(cardButton("up", t("card.up")));
    buttons.appendChild(cardButton("down", t("card.down")));
    // One icon, two directions: a slide that already hangs vertically is
    // detached again by the same button, which is why it shows as engaged
    // rather than carrying a second icon nobody would tell apart.
    buttons.appendChild(cardButton("indent",
      slide.vertical ? t("card.outdent") : t("card.indent"),
      slide.vertical));
    buttons.appendChild(cardButton("duplicate", t("card.duplicate")));
    buttons.appendChild(cardButton("delete", t("card.delete")));

    li.appendChild(number);
    li.appendChild(text);
    li.appendChild(buttons);
    ol.appendChild(li);
  });
}

// The icon itself comes from the stylesheet, picked by data-action -- so
// the button carries no text at all and title/aria-label are its only
// readable name.
function cardButton(action, title, active) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "card-button" + (active ? " is-active" : "");
  b.dataset.action = action;
  b.dataset.tip = title;
  b.setAttribute("aria-label", title);
  if (active) b.setAttribute("aria-pressed", "true");
  return b;
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
