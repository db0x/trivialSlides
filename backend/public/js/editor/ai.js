// Changing a deck by instruction (partials/ai.ejs, backend/ai.js).
//
// The other half of the job lives on the overview, where a deck is BUILT
// out of material (js/overview-ai.js) -- because that is an act of
// creating a talk, and this is an act of working on one. Each page has the
// one of the two that belongs to it, and neither dialog has to ask which
// of them was meant.
//
// What this module does NOT do is save. The deck here is work somebody has
// already done, so a suggestion stops at the source dialog: coloured, cut
// into slides and checked, with "apply" and "discard" over it
// (js/editor/deck-source.js). That is also what keeps it out of the way of
// the editor's autosave -- two authors on one file is the one thing this
// feature must never become.
import { $, t } from "./base.js";
import { setupAside } from "./dialog-aside.js";
import { runCompose, takeComposed } from "../ai-run.js";

// parts: base (the deck's address), slug, images (the names in its
// folder), frame (the box the dialog's veil is kept off), source (the
// source dialog's handle), flush (settle what the delayed save owes).
export function setupAi(parts) {
  // --- Arriving with a deck that was just written ------------------------
  // The overview builds a deck and comes here. Where the check was quiet
  // it has already been saved and there is nothing to do; where it was
  // not, the file travelled with us and this is where it is read
  // (js/ai-run.js). Done before anything else, and whether or not the
  // dialog below exists at all.
  var brought = takeComposed(parts.slug);
  if (brought && parts.source) parts.source.show(brought);

  var dialog = $("#ai-dialog");
  var openButton = $("#ai-open");
  if (!dialog || !openButton) return { pictures: function () {} };

  var promptField = $("#ai-prompt");
  var startButton = $("#ai-start");
  var stopButton = $("#ai-stop");
  var closeButton = $("#ai-close");
  var stream = $("#ai-stream");
  var state = $("#ai-state");
  var pictureLine = $("#ai-pictures");

  // The one request that may be in flight, so it can be called off -- by
  // the button, and by closing the dialog, which is the same wish said
  // differently.
  var running = null;

  function say(text, cls) {
    state.textContent = text || "";
    state.className = "ai-state" + (cls ? " " + cls : "");
  }

  // Which pictures the model may choose from. Said in the dialog rather
  // than left to be discovered, because it is the one thing about the
  // answer that can be changed BEFORE asking: a deck that should use its
  // pictures wants them uploaded first. This is also the answer to the
  // limit the overview has -- a deck built there has no pictures yet, and
  // "put the logo on the title slide" is an instruction for here.
  function pictures(names) {
    var list = (names || []).filter(Boolean);
    pictureLine.textContent = list.length
      ? t("ai.pictures", { names: list.join(", ") })
      : t("ai.picturesNone");
  }

  function working(on) {
    startButton.hidden = on;
    stopButton.hidden = !on;
    closeButton.disabled = on;
    promptField.disabled = on;
  }

  startButton.addEventListener("click", function () {
    var prompt = promptField.value.trim();
    if (!prompt) {
      say(t("ai.needPrompt"), "is-error");
      promptField.focus();
      return;
    }

    stream.textContent = "";
    // Shown by the first piece that arrives and not before: a refusal that
    // comes back instead -- no credit, the hour's ceiling -- would
    // otherwise leave an empty box standing over its own error message.
    stream.hidden = true;
    say(t("ai.working"));
    working(true);

    var stop = new AbortController();
    running = stop;

    // Settled first: the editor may owe the server a save, and the model
    // must be handed the talk as it stands on the screen rather than the
    // one before the last keystroke.
    Promise.resolve(parts.flush ? parts.flush() : null)
      .then(function () {
        return runCompose({
          url: parts.base + "/compose",
          signal: stop.signal,
          body: { prompt: prompt, change: true },
          onText: function (piece) {
            stream.hidden = false;
            stream.textContent += piece;
            stream.scrollTop = stream.scrollHeight;
          },
          onRound: function (n) {
            stream.textContent = "";
            say(t("ai.round", { n: n }));
          },
        });
      })
      .then(function (done) {
        working(false);
        running = null;
        if (!done) return;
        // Out of this dialog and into the one that judges files. Closed
        // first, because the two are both modal and the suggestion is now
        // the thing being looked at.
        stream.hidden = true;
        dialog.close();
        return parts.source.show(done.text).then(function (findings) {
          // Said in the dialog that is now behind, so reopening it tells
          // what came of the last instruction.
          say(findings && findings.length
            ? t("ai.readyFaults", { n: findings.length })
            : t("ai.ready"));
        });
      })
      .catch(function (err) {
        working(false);
        running = null;
        if (!stream.textContent) stream.hidden = true;
        if (err.name === "AbortError") return say(t("ai.aborted"));
        console.error(err);
        say(err.message || t("ai.failed"), "is-error");
      });
  });

  stopButton.addEventListener("click", function () {
    if (running) running.abort();
  });

  // --- Standing beside the preview ---------------------------------------
  // Dragged by its head and put back where it was left, like the other two
  // dialogs one works in rather than through (js/editor/dialog-aside.js).
  // Not pullable: it holds one field, and a wider box would only make it
  // wider. It matters more here than on the overview -- what one asks to
  // be changed is judged against the slide one is looking at.
  var aside = setupAside(dialog, {
    key: "trivialslides:ai-box",
    frame: parts.frame,
    resizable: false,
  });

  openButton.addEventListener("click", function () {
    dialog.showModal();
    aside.opened();
    promptField.focus();
  });

  // A request nobody is going to read should not go on being paid for.
  dialog.addEventListener("close", function () {
    if (running) running.abort();
  });

  pictures(parts.images);
  return { pictures: pictures };
}
