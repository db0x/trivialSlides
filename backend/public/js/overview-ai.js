// Building a deck out of material, from the overview (partials/ai-new.ejs).
//
// Three steps, and the order of them is the whole design:
//
//   1. the deck is created, because the model needs somewhere to write to
//      and the answer needs somewhere to go
//   2. it is written, streamed into the dialog -- the half minute this
//      takes is spent watching rather than waiting
//   3. the editor is opened on it
//
// What happens between 2 and 3 depends on the check, and that is the one
// decision worth reading twice. A file the check is quiet about is SAVED
// and the editor opens on a finished deck: the deck was created seconds
// ago and holds nothing, so there is no work that applying could destroy,
// and making somebody press a button to receive what they just asked for
// is ceremony. A file the check still has something to say about is not
// saved at all -- it travels to the editor and appears in the source
// dialog with its findings beside it, which is the one place in this app
// where a faulty file can be read, fixed and applied.
//
// Either way the rule holds that nothing is written past a finding, and it
// holds where it always has: in POST /source on the server, not here.
import { $, t } from "./editor/base.js";
import { runCompose, keepComposed } from "./ai-run.js";

(function () {
  var BASE = window.SLIDES_BASE === undefined ? "" : window.SLIDES_BASE;
  var openButton = $("#deck-compose");
  var dialog = $("#ai-new-dialog");
  if (!openButton || !dialog) return;

  var nameField = $("#ai-new-name");
  var promptField = $("#ai-new-prompt");
  var materialField = $("#ai-new-material");
  var startButton = $("#ai-new-start");
  var stopButton = $("#ai-new-stop");
  var closeButton = $("#ai-new-close");
  var stream = $("#ai-new-stream");
  var state = $("#ai-new-state");

  var pictureInput = $("#ai-new-pictures");
  var pdfInput = $("#ai-new-pdf");
  var fileList = $("#ai-new-files");

  var running = null;
  // The pictures chosen, held here until there is a deck to put them in.
  // Nothing is uploaded while the dialog is merely open: somebody who
  // changes their mind must not leave files behind in a talk that was
  // never built.
  var pictures = [];

  function say(text, cls) {
    state.textContent = text || "";
    state.className = "ai-state" + (cls ? " " + cls : "");
  }

  function working(on) {
    startButton.hidden = on;
    stopButton.hidden = !on;
    closeButton.disabled = on;
    nameField.disabled = on;
    promptField.disabled = on;
    materialField.disabled = on;
    if (pictureInput) pictureInput.disabled = on;
    if (pdfInput) pdfInput.disabled = on;
  }

  // --- The files one brings along -----------------------------------------
  // Two kinds, and the list shows which is which, because they end up in
  // different places: a picture goes into the deck and is shown to the
  // model, a PDF has already become the words in the field above and is
  // gone.
  function drawFiles(extra) {
    fileList.innerHTML = "";
    var rows = pictures.map(function (file, i) {
      return { text: file.name, drop: i };
    }).concat(extra || []);
    fileList.hidden = !rows.length;
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = row.text;
      li.appendChild(name);
      if (row.drop !== undefined) {
        var off = document.createElement("button");
        off.type = "button";
        off.className = "button button-small button-quiet";
        off.textContent = t("ai.fileRemove");
        off.addEventListener("click", function () {
          pictures.splice(row.drop, 1);
          drawFiles(kept);
        });
        li.appendChild(off);
      }
      fileList.appendChild(li);
    });
  }

  // What the PDFs left behind, so the list goes on saying where the text in
  // the material field came from. They cannot be taken back off the list:
  // their words are in the field, and that is where one removes them.
  var kept = [];

  if (pictureInput) {
    pictureInput.addEventListener("change", function (ev) {
      Array.prototype.forEach.call(ev.target.files || [], function (file) {
        pictures.push(file);
      });
      ev.target.value = "";
      drawFiles(kept);
      if (pictures.length > Number(fileList.dataset.lookMax || 8)) say(t("ai.tooManyPictures"));
    });
  }

  // A PDF is read at once rather than at build time, and that is the point
  // of doing it on the server: what comes back is visible in the material
  // field, where it can be read, cut and corrected before a single token
  // of it is sent anywhere.
  if (pdfInput) {
    pdfInput.addEventListener("change", function (ev) {
      var files = Array.prototype.slice.call(ev.target.files || []);
      ev.target.value = "";
      files.reduce(function (wait, file) {
        return wait.then(function () {
          say(t("ai.pdfReading", { name: file.name }));
          var data = new FormData();
          data.append("pdf", file);
          return fetch(BASE + "/material/pdf", {
            method: "POST", headers: { "X-Slides": "1" }, body: data,
          }).then(function (r) {
            return r.json().then(function (body) {
              if (!r.ok) throw new Error(body.error || t("ai.pdfFailed"));
              return body;
            });
          }).then(function (out) {
            // Appended, never replacing: somebody may have typed in there
            // already, and two PDFs are two pieces of material.
            var before = materialField.value.trim();
            materialField.value = (before ? before + "\n\n" : "") + out.text;
            kept.push({ text: t("ai.pdfTaken", { name: file.name, pages: out.pages }) });
            drawFiles(kept);
            say(out.cut ? t("ai.pdfCut", { name: file.name }) : "");
          }).catch(function (err) {
            console.error(err);
            say(err.message || t("ai.pdfFailed"), "is-error");
          });
        });
      }, Promise.resolve());
    });
  }

  // The pictures, once there is a deck to put them in. The same route the
  // editor's library uses, so a picture handed over here is in the deck
  // exactly as if it had been uploaded there.
  function uploadPictures(slug) {
    if (!pictures.length) return Promise.resolve([]);
    var data = new FormData();
    pictures.forEach(function (file) { data.append("image", file); });
    return fetch(BASE + "/d/" + slug + "/assets", {
      method: "POST", headers: { "X-Slides": "1" }, body: data,
    }).then(function (r) {
      if (!r.ok) throw new Error(t("ai.failed"));
      return r.json();
    }).then(function (out) { return out.fresh || []; });
  }

  // The deck, before anything is written into it. Created only once the
  // button is pressed and not when the dialog is opened: a dialog somebody
  // looked into and closed again must not leave an empty talk behind in
  // the list.
  function createDeck() {
    return fetch(BASE + "/new", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Slides": "1" },
      body: JSON.stringify({
        // The deck can be renamed in the editor, and the model writes a
        // title of its own into the file anyway -- so an empty field is
        // not worth refusing anybody for.
        title: nameField.value.trim() || t("ai.newName"),
        json: true,
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error(t("ai.failed"));
      return r.json();
    });
  }

  // A file the check is quiet about, saved through the same door the
  // source dialog uses -- which refuses to save past a finding whatever
  // this page believes about it.
  function apply(slug, text) {
    return fetch(BASE + "/d/" + slug + "/source", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Slides": "1" },
      body: JSON.stringify({ text: text, apply: true }),
    }).then(function (r) {
      if (!r.ok) throw new Error(t("ai.failed"));
      return r.json();
    });
  }

  startButton.addEventListener("click", function () {
    var prompt = promptField.value.trim();
    if (!prompt) {
      say(t("ai.needPrompt"), "is-error");
      promptField.focus();
      return;
    }

    stream.textContent = "";
    stream.hidden = true;
    say(t("ai.newCreating"));
    working(true);

    var stop = new AbortController();
    running = stop;
    var slug = "";

    createDeck()
      .then(function (fresh) {
        slug = fresh.slug;
        if (!pictures.length) return [];
        say(t("ai.uploading"));
        return uploadPictures(slug);
      })
      .then(function (names) {
        say(t("ai.working"));
        return runCompose({
          url: BASE + "/d/" + slug + "/compose",
          signal: stop.signal,
          body: {
            prompt: prompt,
            material: materialField.value,
            change: false,
            // Which pictures the model is to SEE. Only the ones just
            // handed over, which for a new deck is all of them -- the
            // server reads them off the folder and caps how many go
            // (routes/decks.js).
            look: names,
          },
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
        running = null;
        if (!done) throw new Error(t("ai.failed"));
        if (done.findings.length) {
          // Not saved. It goes with us and the source dialog takes over.
          keepComposed(slug, done.text);
          say(t("ai.newReadyFaults", { n: done.findings.length }));
          window.location.href = BASE + "/d/" + slug;
          return;
        }
        say(t("ai.newReady"));
        return apply(slug, done.text).then(function () {
          window.location.href = BASE + "/d/" + slug;
        });
      })
      .catch(function (err) {
        working(false);
        running = null;
        if (!stream.textContent) stream.hidden = true;
        if (err.name === "AbortError") {
          // The deck exists by now, and it is empty. Said rather than
          // tidied away: deleting something somebody may have meant to
          // keep is worse than a line in a list they can remove.
          say(slug ? t("ai.abortedKept") : t("ai.aborted"));
          return;
        }
        console.error(err);
        say(err.message || t("ai.failed"), "is-error");
      });
  });

  stopButton.addEventListener("click", function () {
    if (running) running.abort();
  });

  openButton.addEventListener("click", function () {
    say("");
    stream.textContent = "";
    stream.hidden = true;
    // A fresh start every time: the files of a talk built a minute ago are
    // not the files of this one, and the material field still holding the
    // last PDF's words would be worse than empty.
    pictures = [];
    kept = [];
    drawFiles(kept);
    dialog.showModal();
    promptField.focus();
  });

  dialog.addEventListener("close", function () {
    if (running) running.abort();
  });
})();
