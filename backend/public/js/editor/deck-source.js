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
import { setupAside } from "./dialog-aside.js";

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
    aside.opened();
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

  // --- Standing beside the preview --------------------------------------
  // Dragged by its head, pulled at its corner, put back where it was left,
  // and the preview kept out of its veil -- all of it the same for the
  // other dialog that is worked in while the preview is watched
  // (js/editor/dialog-aside.js). Pullable, because what this one shows is
  // a file and how much of it one can see is the whole point.
  var aside = setupAside(dialog, {
    key: "trivialslides:source-box",
    frame: frame,
    resizable: true,
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
