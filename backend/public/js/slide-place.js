// Moving, widening and turning a block with the mouse -- the freestyle
// layout's other half.
//
// This runs INSIDE the preview, not in the editor: the thing being dragged
// has to be the slide itself, at the size and in the typeface it will have
// on the wall, or what one arranges is a drawing of a slide rather than the
// slide. The editor never sees the mouse. It is told the result and nothing
// else, in one message per drop (js/editor/places.js writes it into the
// text).
//
// So the whole gesture lives here and nothing of it reaches the file until
// the mouse is let go. While dragging, the block's own custom properties
// are written straight onto the element -- the same four the renderer
// writes (render.js, boxStyle), so the picture under the mouse is already
// the picture the file will describe.
//
// Loaded by the preview document alone (views/reveal.ejs). The presentation
// and the export never see this file, which is why no handle can ever end
// up in a finished talk.
(function () {
  if (!document.body.classList.contains("is-preview")) return;

  // What the file can hold (render.js). Rounding here rather than there:
  // the file is written in whole per cent and whole degrees, so that is
  // what the mouse may produce -- otherwise the preview would show a
  // placement the next save cannot write down.
  var TURN_MAX = 359;
  // The step the mouse snaps to. A quarter of a per cent would be honest
  // and useless: two blocks meant to line up have to be able to MEET, and
  // they only do that if there are not too many places to miss by.
  var STEP = 1;      // per cent
  var TURN_STEP = 5; // degrees -- with Alt held down, one
  // Nothing happens below this: a click that moves two pixels is a click,
  // not a drag, and a block one merely wanted to look at must not be
  // placed by looking at it.
  var SLOP = 3;      // screen pixels

  var picked = null;  // the block the handles are on
  var drag = null;    // the gesture in progress
  var lastPicked = -1; // which one, so it survives the slide being redrawn

  function slide() {
    return document.querySelector(".reveal .slides section.present.layout-freestyle");
  }

  // The area the numbers are a percentage of: the box the slide's text may
  // use (slides.css). Everything below is measured against this one rect,
  // so reveal's scaling needs no undoing -- the pointer and the box are in
  // the same scaled space, and a ratio of the two is the same number at
  // any size.
  function area(block) {
    var box = block.closest(".slide-text");
    return box && box.getBoundingClientRect();
  }

  function round(value, step) {
    return Math.round(value / step) * step;
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  // What the block says about itself, or -- where it has never been placed
  // -- where it happens to stand right now. That is what makes the first
  // drag work: a block in the flow is picked up from where it was and
  // keeps standing there.
  function placement(block) {
    var rect = block.getBoundingClientRect();
    var ref = area(block);
    if (!ref || !ref.width) return { x: 0, y: 0, w: 50, turn: 0 };
    var style = block.style;
    var turn = parseFloat(style.getPropertyValue("--turn")) || 0;
    if (block.classList.contains("slide-box") && style.getPropertyValue("--w")) {
      return {
        x: parseFloat(style.getPropertyValue("--x")) || 0,
        y: parseFloat(style.getPropertyValue("--y")) || 0,
        w: parseFloat(style.getPropertyValue("--w")) || 0,
        turn: turn,
      };
    }
    // Never placed: it is picked up from where it stands, and it is given
    // the width of its TEXT rather than of its box. A block in the flow is
    // as wide as the slide whatever it says -- taking that width would
    // hand a three-word heading the whole slide and push it out of the
    // right edge at the first nudge. The text's own extent is what the eye
    // sees as the thing being picked up, so that is what it keeps.
    var inner = document.createRange();
    inner.selectNodeContents(block);
    var text = inner.getBoundingClientRect();
    var wide = (text.width || rect.width) / ref.width * 100;
    var x = round((rect.left - ref.left) / ref.width * 100, STEP);
    return {
      x: x,
      y: round((rect.top - ref.top) / ref.height * 100, STEP),
      // One per cent of air, so that a line measured to the letter does
      // not wrap the moment it is written down.
      w: clamp(Math.ceil(wide) + 1, 5, 100 - x),
      turn: 0,
    };
  }

  // The only place that writes the picture. Everything else works out
  // numbers and hands them here.
  function show(block, p) {
    block.classList.add("slide-box");
    block.style.setProperty("--x", p.x + "%");
    block.style.setProperty("--y", p.y + "%");
    block.style.setProperty("--w", p.w + "%");
    if (p.turn) block.style.setProperty("--turn", p.turn + "deg");
    else block.style.removeProperty("--turn");
  }

  // --- The handles -------------------------------------------------------
  // Children of the block itself, so they travel with it -- including
  // through its rotation, which is what makes the width handle stay on the
  // block's right edge however far it has been turned. They are built here
  // and nowhere else, so no handle can reach the file, the export or the
  // wall.
  function handles(block) {
    clearHandles();
    // Three: what the block SAYS, how wide it is, and how far it is
    // turned. The first of them is the way back to the words -- a block
    // one can move but not rewrite would be furniture, not text.
    ["edit", "width", "turn"].forEach(function (what) {
      var grip = document.createElement("span");
      grip.className = "place-grip place-grip-" + what;
      grip.dataset.grip = what;
      block.appendChild(grip);
    });
    block.classList.add("is-picked");
  }

  function clearHandles() {
    var old = document.querySelectorAll(".place-grip");
    [].forEach.call(old, function (g) { g.remove(); });
    var marked = document.querySelectorAll(".is-picked");
    [].forEach.call(marked, function (b) { b.classList.remove("is-picked"); });
  }

  function pick(block) {
    if (picked === block) return;
    picked = block;
    if (block) handles(block);
    else clearHandles();
  }

  // Which blocks can be taken hold of: the top children of the text box,
  // and the handles are not among them.
  function blocks(section) {
    var box = section && section.querySelector(".slide-text");
    if (!box) return [];
    return [].filter.call(box.children, function (el) {
      return !el.classList.contains("place-grip");
    });
  }

  function blockAt(target) {
    var section = slide();
    if (!section) return null;
    var all = blocks(section);
    for (var el = target; el && el !== section; el = el.parentElement) {
      if (all.indexOf(el) !== -1) return el;
    }
    return null;
  }

  // --- The gesture -------------------------------------------------------
  // The way back to the words. Said to the editor, which has the text and
  // the dialog (js/editor/index.js); this side knows only which block was
  // asked for.
  function edit(block) {
    var all = blocks(slide());
    var n = all.indexOf(block);
    if (n < 0) return;
    lastPicked = n;
    window.parent.postMessage({ kind: "bearbeiten", block: n, count: all.length }, "*");
  }

  function start(ev) {
    var section = slide();
    if (!section || ev.button !== 0) return;
    var grip = ev.target.classList && ev.target.classList.contains("place-grip")
      ? ev.target.dataset.grip : "";
    // The pencil is not a handle to pull on. It is pressed, and what
    // follows is a dialog rather than a gesture.
    if (grip === "edit") {
      if (picked) edit(picked);
      ev.preventDefault();
      return;
    }
    var block = grip ? picked : blockAt(ev.target);
    if (!block) { pick(null); return; }
    var ref = area(block);
    if (!ref || !ref.width) return;
    // Measured BEFORE the handles go on: they are children of the block,
    // and a block is measured by what is written in it.
    var from = placement(block);
    var rect = block.getBoundingClientRect();
    pick(block);
    drag = {
      block: block,
      what: grip || "move",
      ref: ref,
      from: from,
      startX: ev.clientX,
      startY: ev.clientY,
      // The middle of the block, for the angle: it is what the block turns
      // about (slides.css), so it has to be what the mouse turns it about.
      midX: rect.left + rect.width / 2,
      midY: rect.top + rect.height / 2,
      moved: false,
    };
    drag.startAngle = angle(drag, ev);
    // Nothing else may be selected while this is going on (place.css).
    document.body.classList.add("is-placing");
    ev.preventDefault();
  }

  function angle(d, ev) {
    return Math.atan2(ev.clientY - d.midY, ev.clientX - d.midX) * 180 / Math.PI;
  }

  function move(ev) {
    if (!drag) return;
    var dx = ev.clientX - drag.startX;
    var dy = ev.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
    drag.moved = true;
    var p = { x: drag.from.x, y: drag.from.y, w: drag.from.w, turn: drag.from.turn };
    if (drag.what === "move") {
      p.x = clamp(round(drag.from.x + dx / drag.ref.width * 100, STEP), 0, 100);
      p.y = clamp(round(drag.from.y + dy / drag.ref.height * 100, STEP), 0, 100);
    } else if (drag.what === "width") {
      // Five per cent is about one word; below that a text box is a column
      // of single letters and the handle has stopped being useful.
      p.w = clamp(round(drag.from.w + dx / drag.ref.width * 100, STEP), 5, 100);
    } else {
      var step = ev.altKey ? 1 : TURN_STEP;
      var turned = drag.from.turn + (angle(drag, ev) - drag.startAngle);
      // Degrees are kept positive, because that is the only shape the file
      // holds: three digits and no sign (render.js).
      p.turn = ((round(turned, step) % 360) + 360) % 360;
      if (p.turn > TURN_MAX) p.turn = TURN_MAX;
    }
    drag.last = p;
    show(drag.block, p);
    ev.preventDefault();
  }

  function stop() {
    if (!drag) return;
    var done = drag;
    drag = null;
    document.body.classList.remove("is-placing");
    if (!done.moved || !done.last) return;
    // Which block it was, counted the way the editor counts the blocks of
    // the text (js/editor/places.js). The count travels with it: if the
    // two sides disagree about how many blocks this slide has, the editor
    // would place the wrong one, and then it had better place none.
    var all = blocks(slide());
    var p = done.last;
    // So that the handles come back on the same block after the slide has
    // been drawn afresh: one drag is rarely the whole arrangement, and
    // hunting for the block one just moved is no part of arranging it.
    lastPicked = all.indexOf(done.block);
    window.parent.postMessage({
      kind: "platziert",
      block: lastPicked,
      count: all.length,
      at: [p.x, p.y, p.w].join(","),
      turn: p.turn || 0,
    }, "*");
  }

  // And the gesture everyone tries first on something placed: two clicks
  // on the thing itself. The same door as the pencil, for whoever does
  // not look for a pencil.
  document.addEventListener("dblclick", function (ev) {
    var block = blockAt(ev.target);
    if (!block) return;
    pick(block);
    edit(block);
    ev.preventDefault();
  });

  document.addEventListener("mousedown", start);
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", stop);
  // A slide redrawn while typing is a new element, and the old handles went
  // with the old one.
  // Called with the slide that was just drawn, because at that moment it
  // is not yet the one reveal calls present -- it is handed over rather
  // than looked for (views/reveal.ejs).
  window.slidePlace = function (section) {
    picked = null;
    clearHandles();
    if (lastPicked < 0) return;
    var sec = section || slide();
    if (!sec || !sec.classList.contains("layout-freestyle")) return;
    var all = blocks(sec);
    if (all[lastPicked]) pick(all[lastPicked]);
  };
})();
