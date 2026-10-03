// The dialog behind the button in the editor's header: what the two strips
// on every slide hold -- a line of text, a logo out of the deck's folder,
// and where each of the two stands (backend/bands.js, partials/bands.ejs).
//
// Everything here works on the DECK, not on a slide, which is why it is a
// module of its own rather than another handful of fields in index.js: the
// whole file knows nothing about `active` and never touches a slide.
//
// What it is handed from index.js is the model and three things only the
// editor can do -- save, rebuild the preview, open the picture picker. The
// dialog never fetches and never saves by itself; otherwise there would be
// a second way to the server beside the one in index.js.
import { $, $$ } from "./base.js";

// Both ends of one word: the file writes "no header" on a slide, the form
// asks whether the header is shown. Said here, once, so the two cannot
// drift apart (deck.js: noHeader / noFooter).
export var HIDDEN_FIELD = { header: "noHeader", footer: "noFooter" };

// A band with neither words nor a picture is no band: nothing is drawn for
// it, nothing is written about it, and the switches that would hide it on a
// slide stay away. The twin of this lives on the server (bands.js,
// isEmpty) -- both halves are named after each other so the pair stays
// findable.
export function isEmpty(band) {
  return !band || (!band.text && !band.logo);
}

export function setupBands(options) {
  var dialog = $("#bands-dialog");
  var openButton = $("#bands-open");
  if (!dialog || !openButton) return { draw: function () {} };

  // Which of the two boxes is which band. Read off the markup rather than
  // written down here: the view builds one box per band from the server's
  // list, and this follows it.
  var boxes = $$(".band-box", dialog).map(function (box) {
    return { name: box.dataset.band, box: box };
  });

  // --- The model, into the fields --------------------------------------
  function drawBox(entry) {
    var band = options.read()[entry.name] || {};
    var text = $('[data-band-field="text"]', entry.box);
    text.value = band.text || "";
    drawPlace(entry, "textPlace", band.textPlace);
    drawPlace(entry, "logoPlace", band.logoPlace);
    drawLogo(entry, band.logo);
    drawFlags(entry, band);
  }

  // The two switches that are about the strip as a whole. One of them asks
  // the opposite of what the model holds -- the form asks whether the line
  // is SHOWN, the model keeps the band's wish to do without one -- and the
  // markup says which by carrying data-band-invert (partials/bands.ejs).
  function drawFlags(entry, band) {
    $$("[data-band-flag]", entry.box).forEach(function (box) {
      var on = !!band[box.dataset.bandFlag];
      box.checked = box.hasAttribute("data-band-invert") ? !on : on;
    });
  }

  // The button wears the place in force and the menu marks it -- the same
  // pair the heading's alignment chooser keeps (index.js, showTitleAlign).
  function drawPlace(entry, field, place) {
    var menu = $('.band-place[data-band-field="' + field + '"]', entry.box);
    var button = $("summary", menu);
    button.dataset.place = place || "";
    $$(".menu-item", menu).forEach(function (row) {
      var here = row.dataset.place === place;
      row.classList.toggle("is-active", here);
      row.setAttribute("aria-checked", here ? "true" : "false");
    });
  }

  function drawLogo(entry, name) {
    var preview = $(".band-logo-preview", entry.box);
    var none = $(".band-logo-none", entry.box);
    var remove = $('[data-band-action="remove"]', entry.box);
    preview.hidden = !name;
    none.hidden = !!name;
    remove.hidden = !name;
    if (name) preview.src = options.imageUrl(name);
  }

  function draw() {
    boxes.forEach(drawBox);
  }

  // --- The fields, into the model ---------------------------------------
  // Straight into it, field by field, rather than one harvest() over the
  // whole dialog: the dialog is closed most of the time and a sweep over
  // fields nobody can see would be a sweep over whatever was last in them.
  // Whether anything was touched since the dialog was opened. It decides
  // the one expensive thing here -- rebuilding the whole preview on the way
  // out -- so a dialog that was merely looked into costs nothing.
  var touched = false;

  function set(name, field, value) {
    var deck = options.read();
    if (!deck[name]) deck[name] = {};
    deck[name][field] = value;
    touched = true;
    options.changed();
  }

  boxes.forEach(function (entry) {
    $('[data-band-field="text"]', entry.box).addEventListener("input", function (ev) {
      set(entry.name, "text", ev.target.value);
    });

    ["textPlace", "logoPlace"].forEach(function (field) {
      var menu = $('.band-place[data-band-field="' + field + '"]', entry.box);
      menu.addEventListener("click", function (ev) {
        var row = ev.target.closest(".menu-item");
        if (!row) return;
        menu.open = false;
        set(entry.name, field, row.dataset.place);
        drawPlace(entry, field, row.dataset.place);
      });
    });

    $$("[data-band-flag]", entry.box).forEach(function (box) {
      box.addEventListener("change", function () {
        var on = box.hasAttribute("data-band-invert") ? !box.checked : box.checked;
        set(entry.name, box.dataset.bandFlag, on);
      });
    });

    entry.box.addEventListener("click", function (ev) {
      var button = ev.target.closest("[data-band-action]");
      if (!button) return;
      if (button.dataset.bandAction === "remove") {
        set(entry.name, "logo", "");
        drawLogo(entry, "");
        return;
      }
      // The same picker the slides use. It is modal, and so is this
      // dialog: a second showModal() over the first stacks, and closing
      // the picker brings this one back with the focus where it was.
      options.chooseLogo(function (name) {
        set(entry.name, "logo", name);
        drawLogo(entry, name);
      });
    });
  });

  // --- Opening and closing ---------------------------------------------
  openButton.addEventListener("click", function () {
    // Drawn on the way in and not on every save: the server normalises
    // what it is sent and the answer comes back built afresh (index.js),
    // and writing that into a field somebody is typing in would move the
    // caret under their hands.
    draw();
    touched = false;
    dialog.showModal();
  });

  // A band stands on every slide, so a change to one changes all of them.
  // While the dialog is open only the slide being looked at is redrawn
  // (options.changed, which is the editor's usual path) -- the others are
  // behind the dialog and nobody is looking. On the way out the whole
  // preview is rebuilt, which is also what settles the pictures in the
  // slide list.
  dialog.addEventListener("close", function () {
    if (!touched) return;
    touched = false;
    options.closed();
  });

  return { draw: draw };
}
