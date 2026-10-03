// The whole deck as Markdown, in a dialog (views/editor.ejs) -- and
// editable there, block by block.
//
// Why block by block and not the whole file in one field: the marks and the
// colours are what make a file of a few hundred lines readable at all, and
// a single text field would throw both away the moment one starts typing.
// A click turns ONE block into a plain field and leaves the rest as it is,
// so the slide being edited keeps its neighbours around it. It also spares
// this module the hardest part of a coloured editor: with only one block
// plain at a time, there is no second layer that has to line up with the
// text to the pixel.
//
// What is shown is always the SAVED file. Anything the delayed save still
// owes is flushed before it is fetched, and what comes back after applying
// is the file as it was written -- not the text that was typed at it.
//
// Nothing is saved along the way. Half-typed Markdown parses to nonsense,
// so applying is a deliberate act; what runs while typing is the check
// (check.js), and until it is quiet, applying stays shut.
import { $, $$, t, schreibHead, verzoegert } from "./base.js";

// An object rather than five arguments in a row: base is the deck's
// address, flush settles what the delayed save still owes, adopt hands a
// freshly written deck back to the editor, preview drives the frame behind
// the dialog (js/editor/preview.js), and frame is the box that frame
// stands in -- the one piece of the page the dialog's veil is kept off.
export function setupDeckSource(parts) {
  var base = parts.base;
  var flush = parts.flush;
  var adopt = parts.adopt;
  var preview = parts.preview;
  var frame = parts.frame;
  var button = $("#deck-source-open");
  var dialog = $("#deck-source-dialog");
  if (!button || !dialog) return;

  var code = $("#deck-source-code");
  var applyButton = $("#deck-source-apply");
  var discardButton = $("#deck-source-discard");
  var closeButton = $("#deck-source-close");
  var findingList = $("#deck-source-findings");

  // The file as it last came from the server, to go back to. Kept as
  // markup rather than as text: putting it back is one assignment then,
  // and the colours come with it.
  var saved = "";
  var dirty = false;
  var findings = [];

  // --- What the dialog says for itself ---------------------------------
  function say(text, cls) {
    code.textContent = text;
    code.className = cls || "";
  }

  function render(html) {
    code.className = "";
    code.innerHTML = html;
    dirty = false;
    lastSlide = null;
    showFindings([]);
    drawButtons();
  }

  function drawButtons() {
    closeButton.hidden = dirty;
    discardButton.hidden = !dirty;
    applyButton.hidden = !dirty;
    applyButton.disabled = findings.length > 0;
  }

  // --- The file, out of the blocks and back in -------------------------
  function blocks() {
    return $$(".source-block", code);
  }

  // The text of a block. The coloured lines carry one newline more than
  // the block has (source.js adds it so the last, empty line draws at all);
  // that one is taken off here, because a field holding it would show an
  // extra line the file does not have and stand a line taller than the
  // colours beneath it.
  function textOf(block) {
    return block.querySelector(".source-lines").textContent.replace(/\n$/, "");
  }

  // The lines of every block, back into one file. Each block's text ends
  // where the next begins, and the newline between them is the join.
  function fileText() {
    return blocks().map(textOf).join("\n");
  }

  // The coloured lines are also where the text LIVES: the field on top is
  // see-through and holds nothing but the caret. So a keystroke is written
  // through to them at once -- plain, because the colours have to be
  // fetched -- and that keeps the block the right height under the field
  // while the colours are still on their way.
  function writeThrough(field) {
    field.parentNode.querySelector(".source-lines").textContent = field.value + "\n";
  }

  // Where in the text the click landed. The coloured lines and the field
  // hold the same characters, so an offset counted in the one is the same
  // offset in the other -- which is the whole reason the caret can be put
  // where the eye was rather than at the end of the block.
  function offsetAt(pre, x, y) {
    var range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      var spot = document.caretPositionFromPoint(x, y);
      if (spot) {
        range = document.createRange();
        range.setStart(spot.offsetNode, spot.offset);
      }
    }
    if (!range || !pre.contains(range.startContainer)) return null;
    var upto = document.createRange();
    upto.setStart(pre, 0);
    upto.setEnd(range.startContainer, range.startOffset);
    return upto.toString().length;
  }

  // Which slide of the deck a block is. The head belongs to none, and
  // neither does a block holding nothing but its separator -- the server
  // counts that out and says so on the element (source.js).
  function slideOf(block) {
    var n = block.dataset.slide;
    return n === undefined || n === "" ? null : Number(n);
  }

  // The slide last written in. Kept rather than looked up when it is
  // wanted: a click on "Apply" takes the focus out of the field first, so
  // by the time that click is handled there is no open block left to ask.
  var lastSlide = null;

  // The preview stands behind the dialog, and while a slide is being
  // written in it should be showing that slide. Only a jump: what the
  // frame holds is the saved file, and the typing has not been saved.
  function showInPreview(block) {
    lastSlide = slideOf(block);
    if (lastSlide != null && preview) preview.showSlide(lastSlide);
  }

  // The field is laid OVER the lines, not put in their place: that is what
  // keeps the colours while the text is typed. It carries the caret and
  // the selection, the lines underneath carry everything one can see.
  function edit(block, offset) {
    var field = block.querySelector(".source-input");
    if (!field) {
      var cell = block.querySelector(".source-cell");
      if (!cell) return null;
      field = document.createElement("textarea");
      field.className = "source-input";
      field.spellcheck = false;
      field.value = textOf(block);
      cell.appendChild(field);
      block.classList.add("is-editing");
    }
    showInPreview(block);
    field.focus();
    if (offset != null) field.setSelectionRange(offset, offset);
    return field;
  }

  // Leaving takes the field away again and leaves the lines standing --
  // they hold the text, changed or not, so nothing is lost by it and the
  // block goes back to being something one can select across.
  function leave(block) {
    var field = block.querySelector(".source-input");
    if (field) field.remove();
    block.classList.remove("is-editing");
  }

  // On click rather than on mousedown: a drag across the view is somebody
  // marking text, not somebody asking to edit, and laying a field over the
  // text under a held mouse button would break the drag half way.
  code.addEventListener("click", function (ev) {
    var block = ev.target.closest(".source-block");
    if (!block || block.querySelector(".source-input")) return;
    var marking = window.getSelection();
    if (marking && !marking.isCollapsed) return;
    var pre = block.querySelector(".source-lines");
    if (!pre) return;
    // Where the click landed, counted in the text of the lines -- which is
    // the same count the field uses, so the caret starts where the eye was.
    edit(block, offsetAt(pre, ev.clientX, ev.clientY));
  });

  code.addEventListener("input", function (ev) {
    if (!ev.target.classList.contains("source-input")) return;
    writeThrough(ev.target);
    dirty = true;
    drawButtons();
    checkSoon();
  });

  code.addEventListener("focusout", function (ev) {
    if (!ev.target.classList.contains("source-input")) return;
    leave(ev.target.closest(".source-block"));
  });

  // --- The check -------------------------------------------------------
  function showFindings(list) {
    findings = list || [];
    var rows = findingList.querySelector("ul");
    rows.innerHTML = "";
    findingList.hidden = !findings.length;
    findings.forEach(function (finding) {
      var row = document.createElement("li");
      var go = document.createElement("button");
      go.type = "button";
      go.className = "finding";
      go.dataset.line = finding.line;
      var where = document.createElement("span");
      where.className = "finding-line";
      where.textContent = t("source.line", { n: finding.line });
      go.appendChild(where);
      go.appendChild(document.createTextNode(finding.text));
      row.appendChild(go);
      rows.appendChild(row);
    });
  }

  function ask(apply) {
    return fetch(base + "/source", {
      method: "POST",
      headers: schreibHead({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text: fileText(), apply: !!apply }),
    }).then(function (r) {
      if (!r.ok) throw new Error("Status " + r.status);
      return r.json();
    });
  }

  // The colours, back from the server -- the page has no highlighter of
  // its own, and this is the round trip the check makes anyway.
  //
  // A block only takes them if it is still showing exactly the text they
  // were made from. Between the question and the answer somebody may have
  // typed on, and painting an older answer over newer text would set the
  // file back by a keystroke; the next round catches up. Where the cut of
  // the file itself moved -- a separator typed or removed -- the blocks no
  // longer line up at all, and then none of them takes anything until the
  // text is applied and the view is built afresh.
  function recolour(list) {
    if (!list) return;
    var here = blocks();
    if (list.length !== here.length) return;
    var judge = document.createElement("pre");
    here.forEach(function (block, i) {
      var pre = block.querySelector(".source-lines");
      judge.innerHTML = list[i].html;
      if (judge.textContent !== pre.textContent) return;
      pre.innerHTML = list[i].html;
      // Which slide a block is can move as the text does -- a separator
      // taken out makes every block below it one slide earlier.
      if (list[i].slide == null) delete block.dataset.slide;
      else block.dataset.slide = list[i].slide;
    });
  }

  // The preview follows the typing, the same way it follows the form: the
  // one slide being written in is redrawn from the model the server made
  // of the text, without anything being saved for it. A structure that
  // moved under the typing leaves the block without a slide, and then
  // there is nothing to redraw until it is applied.
  function redrawInPreview(fresh) {
    if (lastSlide == null || !fresh || !preview) return;
    if (!fresh.slides || !fresh.slides[lastSlide]) return;
    // The whole deck goes along, not only the slide: the two bands that
    // stand on every slide are in its head, and the text being typed in
    // may have just changed them (js/editor/bands.js).
    preview.slideZeichnen(lastSlide, fresh.slides[lastSlide], fresh);
  }

  var checkSoon = verzoegert(400, function () {
    if (!dirty) return;
    ask(false).then(function (answer) {
      showFindings(answer.findings);
      recolour(answer.blocks);
      redrawInPreview(answer.deck);
      drawButtons();
    }).catch(function (e) { console.error(e); });
  });

  // Jumping to a finding: the line is counted across the whole file, the
  // blocks are what hold it -- so the block is found by adding their lines
  // up, and the caret goes to the start of the line inside it.
  function locate(line) {
    var seen = 0;
    var list = blocks();
    for (var i = 0; i < list.length; i++) {
      var text = textOf(list[i]);
      var count = text.split("\n").length;
      if (line <= seen + count) {
        // Which line inside this block, and how many characters stand
        // before it -- plus the newline that ends the line above.
        var index = line - seen - 1;
        var before = text.split("\n").slice(0, index).join("\n");
        return { block: list[i], offset: index ? before.length + 1 : 0 };
      }
      seen += count;
    }
    return null;
  }

  findingList.addEventListener("click", function (ev) {
    var go = ev.target.closest(".finding");
    if (!go) return;
    var spot = locate(Number(go.dataset.line));
    if (spot) edit(spot.block, spot.offset);
  });

  // --- Opening, applying, discarding -----------------------------------
  button.addEventListener("click", function () {
    // Open first, fetch after: the dialog is the answer to the click, and
    // waiting for the network with nothing on the screen would look like
    // the click had missed.
    say(t("source.loading"));
    dirty = false;
    showFindings([]);
    drawButtons();
    dialog.showModal();
    restore();
    clearPreview();
    Promise.resolve(flush())
      .then(function () { return fetch(base + "/source.html"); })
      .then(function (r) {
        if (!r.ok) throw new Error("Status " + r.status);
        return r.text();
      })
      .then(function (html) {
        // Markup from our own server: the file escaped there, and the
        // marks beside the blocks the only words added (source.js). The
        // text of the deck never reaches this line unescaped.
        saved = html;
        render(html);
      })
      .catch(function (e) {
        console.error(e);
        say(t("source.failed"), "is-error");
      });
  });

  applyButton.addEventListener("click", function () {
    ask(true).then(function (answer) {
      if (answer.findings.length) {
        showFindings(answer.findings);
        recolour(answer.blocks);
        redrawInPreview(answer.deck);
        return drawButtons();
      }
      // Which slide was being written in -- read before the view is built
      // afresh, because that forgets it.
      var wrote = lastSlide;
      saved = answer.html;
      render(answer.html);
      // The editor has been working from a model that is now out of date,
      // and it should come back standing on the slide that was worked on.
      adopt(answer.deck, wrote);
    }).catch(function (e) {
      console.error(e);
      say(t("source.applyFailed"), "is-error");
    });
  });

  discardButton.addEventListener("click", function () {
    render(saved);
  });

  // --- The hole in the veil ---------------------------------------------
  // Where the preview stands, written down for the backdrop to cut out of
  // itself (app.css). A colour judged through a veil is judged wrongly,
  // and judging colours is what the preview is for.
  //
  // Measured rather than assumed, and measured again whenever it can have
  // moved: the frame changes shape with the format chooser beside it, and
  // with the window.
  function clearPreview() {
    if (!frame) return;
    var box = frame.getBoundingClientRect();
    dialog.style.setProperty("--clear-x", Math.round(box.left) + "px");
    dialog.style.setProperty("--clear-y", Math.round(box.top) + "px");
    dialog.style.setProperty("--clear-w", Math.round(box.width) + "px");
    dialog.style.setProperty("--clear-h", Math.round(box.height) + "px");
  }

  if (frame && window.ResizeObserver) new ResizeObserver(clearPreview).observe(frame);
  window.addEventListener("resize", clearPreview);

  // --- Where the dialog stands, and how big -----------------------------
  // A dialog the browser centres sits over the very preview it is meant to
  // be watched beside. So it can be dragged by its head and pulled at its
  // corner, and where it was put is remembered per browser, like the other
  // things that are set once and then forgotten (js/theme.js and
  // neighbours).
  var BOX = "trivialslides:source-box";
  var GRIP = 18;   // the corner the browser puts its resizer in

  function keep() {
    var box = dialog.getBoundingClientRect();
    try {
      localStorage.setItem(BOX, JSON.stringify({
        left: Math.round(box.left), top: Math.round(box.top),
        width: Math.round(box.width), height: Math.round(box.height),
      }));
    } catch (e) { /* private window, storage blocked */ }
  }

  function between(value, low, high) {
    return Math.max(low, Math.min(value, high));
  }

  // Taking the dialog over from the browser: from here on it is placed by
  // hand, so the centring margin has to go and the height has to be a
  // number -- a max-height would otherwise refuse every pull past it.
  function takeOver() {
    if (dialog.dataset.placed) return;
    var box = dialog.getBoundingClientRect();
    dialog.dataset.placed = "1";
    dialog.style.margin = "0";
    dialog.style.maxHeight = "none";
    dialog.style.left = box.left + "px";
    dialog.style.top = box.top + "px";
    dialog.style.width = box.width + "px";
    dialog.style.height = box.height + "px";
  }

  // Back where it was last left, as far as the window still allows: a box
  // remembered on a wide screen must not put the dialog off a narrow one.
  function restore() {
    var box;
    try { box = JSON.parse(localStorage.getItem(BOX)); } catch (e) { box = null; }
    if (!box) return;
    var width = Math.min(box.width, window.innerWidth - 16);
    var height = Math.min(box.height, window.innerHeight - 16);
    dialog.dataset.placed = "1";
    dialog.style.margin = "0";
    dialog.style.maxHeight = "none";
    dialog.style.width = width + "px";
    dialog.style.height = height + "px";
    dialog.style.left = between(box.left, 0, window.innerWidth - width) + "px";
    dialog.style.top = between(box.top, 0, window.innerHeight - height) + "px";
  }

  // Pulling at the corner is the browser's own resizer (CSS resize) -- all
  // this does is get out of its way in time and write down the result.
  var grabbed = null;
  dialog.addEventListener("pointerdown", function (ev) {
    var box = dialog.getBoundingClientRect();
    if (ev.clientX < box.right - GRIP || ev.clientY < box.bottom - GRIP) return;
    takeOver();
    grabbed = [dialog.offsetWidth, dialog.offsetHeight];
  });
  window.addEventListener("pointerup", function () {
    if (!grabbed) return;
    if (dialog.offsetWidth !== grabbed[0] || dialog.offsetHeight !== grabbed[1]) keep();
    grabbed = null;
  });

  // Dragging by the head. Not from the buttons in it -- a drag that began
  // on "Apply" would be a press that never arrives.
  var carry = null;
  var head = $(".dialog-head", dialog);
  head.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0 || ev.target.closest("button, input, a, textarea")) return;
    takeOver();
    var box = dialog.getBoundingClientRect();
    carry = { x: ev.clientX - box.left, y: ev.clientY - box.top, w: box.width, h: box.height };
    head.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  head.addEventListener("pointermove", function (ev) {
    if (!carry) return;
    dialog.style.left = between(ev.clientX - carry.x, 0, window.innerWidth - carry.w) + "px";
    dialog.style.top = between(ev.clientY - carry.y, 0, window.innerHeight - carry.h) + "px";
  });
  head.addEventListener("pointerup", function (ev) {
    if (!carry) return;
    carry = null;
    head.releasePointerCapture(ev.pointerId);
    keep();
  });

  // Escape closes a dialog, and here it would close it over unapplied
  // text. The editor guards the same thing on leaving the page
  // (beforeunload in index.js); this is that guard for this dialog. The
  // way out is not blocked, only named: while anything is unapplied, the
  // head carries "Discard" instead of "Close".
  dialog.addEventListener("cancel", function (ev) {
    if (dirty) ev.preventDefault();
  });
}
