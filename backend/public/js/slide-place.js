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
  // How near the eye counts as the same line. Screen pixels and not per
  // cent, so the pull is the same whether the preview stands in a corner
  // or fills the window.
  var SNAP = 6;      // screen pixels

  // The grips are drawn INSIDE the slide, and reveal scales the slide down
  // to fit the frame it stands in. At the size a preview usually has, that
  // took a grip of eighteen pixels to nine and the picture inside it to a
  // smudge -- which is why the one for turning was the one nobody found.
  // So the scaling is given back to them: --place-scale is its undo, every
  // measurement in css/place.css is counted in it, and a grip is the same
  // size under the hand whatever the preview is doing.
  //
  // Asked again whenever the frame changes size, and once more each time
  // the handles are put on -- that is the moment it has to be right, and
  // it costs one number.
  function keepSize() {
    var scale = window.Reveal && Reveal.getScale ? Reveal.getScale() : 1;
    if (!scale || !isFinite(scale)) scale = 1;
    document.documentElement.style.setProperty("--place-scale", String(1 / scale));
  }
  // After reveal has worked out its own scaling rather than before: the
  // window event reaches us first, and the number we want is the one it
  // leaves behind.
  window.addEventListener("resize", function () {
    requestAnimationFrame(function () { keepSize(); keepInside(); });
  });
  try { if (window.Reveal && Reveal.on) Reveal.on("resize", keepSize); } catch (e) { /* not up yet */ }
  keepSize();

  // What each handle is, in words. The shapes say it first -- a bar on the
   // edge, a knob on a stem, a pencil (css/place.css) -- and this is for
   // whoever points at one anyway. The title attribute and not the
   // editor's own tooltip: that one lives in the other document and
   // cannot be shown over this one.
  var WORDS = (function () {
    var block = document.getElementById("data-grips");
    try { return JSON.parse(block.textContent); } catch (e) { return {}; }
  })();

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

  // --- The guide lines ---------------------------------------------------
  // What a block may line up with while it is being moved: the middle and
  // the two edges of the area, and the near edge, the middle and the far
  // edge of every other block on the slide. Worked out once as the gesture
  // begins -- nothing but the dragged block moves while it lasts.
  //
  // A turned block is left out. Its corners no longer follow its edges, so
  // a line drawn through the box around it would promise an alignment
  // nobody can see.
  function marks(section, block, ref) {
    var x = [0, 50, 100];
    var y = [0, 50, 100];
    blocks(section).forEach(function (el) {
      if (el === block || el.style.getPropertyValue("--turn")) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var left = (r.left - ref.left) / ref.width * 100;
      var right = (r.right - ref.left) / ref.width * 100;
      var top = (r.top - ref.top) / ref.height * 100;
      var bottom = (r.bottom - ref.top) / ref.height * 100;
      x.push(left, (left + right) / 2, right);
      y.push(top, (top + bottom) / 2, bottom);
    });
    return { x: x, y: y };
  }

  // The mark this block comes nearest to on one axis, or null where it is
  // near none of them. Its near edge, its middle and its far edge are all
  // tried: any of the three may be the one the eye is lining up, and the
  // middle is the one this was built for.
  //   line -- where the mark stands, which is where the line is drawn
  //   at   -- what the block's own number has to be to meet it
  function near(value, size, list, tol) {
    var best = null;
    [0, size / 2, size].forEach(function (off) {
      list.forEach(function (mark) {
        var d = Math.abs(value + off - mark);
        if (d <= tol && (!best || d < best.d)) best = { d: d, line: mark, at: mark - off };
      });
    });
    return best;
  }

  // The lines themselves: two numbers written onto the text box, drawn by
  // its own ::before and ::after (place.css). Where they are is said in
  // the same per cent everything else here is said in, so a line at 50%
  // needs no arithmetic to land in the middle of the slide.
  //
  // Nothing is ADDED to the box, and that is the whole reason for the
  // pseudo-elements: the stylesheet steps the type down by how many
  // children the box has (slides.css), so a layer appearing the moment a
  // line does would shrink the slide under the mouse -- and shrink it
  // against measurements this gesture took before it started.
  function guides(box, x, y) {
    if (!box) return;
    box.classList.toggle("has-guide-x", x != null);
    box.classList.toggle("has-guide-y", y != null);
    if (x != null) box.style.setProperty("--guide-x", x + "%");
    if (y != null) box.style.setProperty("--guide-y", y + "%");
  }

  function clearGuides() {
    var boxes = document.querySelectorAll(".has-guide-x, .has-guide-y");
    [].forEach.call(boxes, function (box) {
      box.classList.remove("has-guide-x", "has-guide-y");
      box.style.removeProperty("--guide-x");
      box.style.removeProperty("--guide-y");
    });
  }

  // --- The handles -------------------------------------------------------
  // Children of the block itself, so they travel with it -- including
  // through its rotation, which is what makes the width handle stay on the
  // block's right edge however far it has been turned. They are built here
  // and nowhere else, so no handle can reach the file, the export or the
  // wall.
  function handles(block) {
    clearHandles();
    keepSize();
    // Three: what the block SAYS, how wide it is, and how far it is
    // turned. The first of them is the way back to the words -- a block
    // one can move but not rewrite would be furniture, not text.
    ["edit", "width", "turn"].forEach(function (what) {
      var grip = document.createElement("span");
      grip.className = "place-grip place-grip-" + what;
      grip.dataset.grip = what;
      if (WORDS[what]) grip.title = WORDS[what];
      block.appendChild(grip);
    });
    block.classList.add("is-picked");
    keepInk(block.closest("section"));
    keepInside();
  }

  // Light handles on a dark slide, dark handles on a light one -- the
  // pictures carry no ground of their own any more, so the only thing
  // keeping them visible is standing opposite what they are drawn on.
  //
  // reveal says which of the two it is, but only where it knows the
  // slide's background COLOUR: it says nothing about a gradient, a picture
  // or the moving background of an effect, which is most of what a slide
  // like this has. So the question is asked the other way round -- what
  // colour is the slide's own text? A slide is written in something that
  // can be read on it, so its text is the one honest answer about its
  // background that is always there.
  function keepInk(section) {
    var light = true;
    if (section && section.classList.contains("has-light-background")) {
      light = false;
    } else if (section && !section.classList.contains("has-dark-background")) {
      var rgb = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(window.getComputedStyle(section).color);
      // The eye's own weighting of the three, the one every contrast rule
      // of thumb is written in.
      if (rgb) light = (rgb[1] * 299 + rgb[2] * 587 + rgb[3] * 114) / 1000 >= 128;
    }
    var root = document.documentElement.style;
    root.setProperty("--place-ink", light ? "#ffffff" : "#15181d");
    root.setProperty("--place-halo", light ? "rgba(0, 0, 0, 0.65)" : "rgba(255, 255, 255, 0.75)");
  }

  // A grip that lands outside the slide is a grip nobody can reach: this
  // page shows the slide and nothing around it, so whatever crosses the
  // edge is simply gone -- and a block pushed into a corner is exactly
  // when one wants to take hold of it. Each handle that would fall off is
  // turned inwards instead, onto the block's own corner. A worse place for
  // it than just outside, and better than no place at all.
  function keepInside() {
    var wide = document.documentElement.clientWidth;
    var high = document.documentElement.clientHeight;
    [].forEach.call(document.querySelectorAll(".place-grip"), function (grip) {
      grip.classList.remove("is-inside");
      var r = grip.getBoundingClientRect();
      if (r.top < 0 || r.left < 0 || r.right > wide || r.bottom > high) {
        grip.classList.add("is-inside");
      }
    });
  }

  function clearHandles() {
    var old = document.querySelectorAll(".place-grip");
    [].forEach.call(old, function (g) { g.remove(); });
    var marked = document.querySelectorAll(".is-picked");
    [].forEach.call(marked, function (b) { b.classList.remove("is-picked"); });
    clearGuides();
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
  // the row that element is written in (js/editor/index.js); this side
  // knows only which block was asked for.
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
      section: section,
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
    // The marks are gathered at the first movement rather than at the
    // press, and only for moving. A block that has never been placed is
    // still in the flow when it is picked up, and every block under it
    // moves up the moment it leaves -- marks taken before that would draw
    // lines where nothing stands any more. So it is put where it already
    // stands first, and the others are measured after.
    //
    // A block being widened or turned gets none at all: it changes shape
    // under the mouse, and a line it happened to touch on the way would
    // say nothing about where it ends up.
    if (drag.what === "move" && !drag.marks) {
      show(drag.block, drag.from);
      drag.marks = marks(drag.section, drag.block, drag.ref);
    }
    var p = { x: drag.from.x, y: drag.from.y, w: drag.from.w, turn: drag.from.turn };
    if (drag.what === "move") {
      var x = drag.from.x + dx / drag.ref.width * 100;
      var y = drag.from.y + dy / drag.ref.height * 100;
      // The height is measured now and not at the start: a block that has
      // never been placed is given a width with the first move, and its
      // text wraps into a different height the moment it is. offsetHeight
      // and not the rect, because the rect of a turned block is the box
      // around it rather than the block.
      var high = drag.block.offsetHeight / drag.ref.height * 100;
      var hitX = near(x, drag.from.w, drag.marks.x, SNAP / drag.ref.width * 100);
      var hitY = near(y, high, drag.marks.y, SNAP / drag.ref.height * 100);
      p.x = clamp(round(hitX ? hitX.at : x, STEP), 0, 100);
      p.y = clamp(round(hitY ? hitY.at : y, STEP), 0, 100);
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
    // Drawn from where the block ENDED UP rather than from where it was
    // pulled: the file holds whole per cent, so a block snapped to the
    // middle of an odd-numbered width still sits half a per cent off it,
    // and the line is only shown once there is nothing further the numbers
    // could do about it. Half a per cent is the whole of what the grid can
    // miss by -- a block that is more than that out is not lined up.
    if (drag.what === "move") {
      var seen = drag.block.offsetHeight / drag.ref.height * 100;
      var onX = near(p.x, p.w, drag.marks.x, STEP / 2 + 0.01);
      var onY = near(p.y, seen, drag.marks.y, STEP / 2 + 0.01);
      guides(drag.block.closest(".slide-text"), onX && onX.line, onY && onY.line);
    }
    ev.preventDefault();
  }

  function stop() {
    if (!drag) return;
    var done = drag;
    drag = null;
    document.body.classList.remove("is-placing");
    clearGuides();
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
  // The handles, put on a block: the element whose row the editor has just
  // opened, or a picture just added -- both are about to be dragged,
  // scaled and turned, and would otherwise have to be found on the slide
  // first (views/reveal.ejs).
  //
  // Nothing is locked out by it. While a row is open every other element
  // is still there to be taken hold of, and pressing one opens ITS row:
  // what is written is written as it is typed (js/editor/index.js), so
  // there is no half-finished answer anywhere that moving the neighbour
  // could be applied over the top of.
  window.slidePlacePick = function (n) {
    if (n >= 0) handTo(n);
  };

  function handTo(n) {
    // Remembered as well as picked, so the handles are still on it after
    // the slide has been drawn afresh -- which is what happens next, since
    // adding or opening an element is a change to the text.
    lastPicked = n;
    var all = blocks(slide());
    if (all[n]) pick(all[n]);
  }

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
