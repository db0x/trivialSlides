// The settings dialog (views/partials/prefs.ejs). What it holds belongs to
// the browser, not to a deck -- today the keys a presenter's spare button
// sends, which the presentation reads back (views/reveal.ejs).
//
// A key is not typed in here, it is PRESSED: nobody knows what their stick
// sends, and "Tab" or "F5" is a name one would have to look up. So the
// dialog listens once and keeps whatever arrives.
//
// A plain script, not a module, so it cannot import base.js -- it reads the
// same table the page carries for everyone else (theme.js does likewise).
(function () {
  var dialog = document.getElementById("prefs-dialog");
  if (!dialog) return;

  var TEXTS = {};
  try {
    var table = document.getElementById("data-texte");
    if (table) TEXTS = JSON.parse(table.textContent);
  } catch (e) { /* the key showing through is loud enough */ }

  function t(schluessel, values) {
    var text = TEXTS[schluessel];
    if (text === undefined) return schluessel;
    if (!values) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole;
    });
  }

  // reveal.js pages with these, and a key that pages cannot also be the one
  // that switches the screen: the slide would jump every time. Escape is
  // reveal's overview and the browser's way out of fullscreen.
  var RESERVIERT = ["PageDown", "PageUp", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape"];

  // A space has no visible name, and "Tab" printed as a word is what the
  // dialog can be read as.
  function name(key) {
    return key === " " ? "Space" : key;
  }

  // Two keys, two drawers, one piece of code. What differs between the
  // block for the presenter's spare key and the block for the one that
  // starts the talk is the drawer it writes to and the three elements it
  // draws into -- nothing else, so nothing else is written twice.
  function block(store, ids) {
    var liste = document.getElementById(ids.list);
    var state = document.getElementById(ids.state);
    var recordButton = document.getElementById(ids.record);
    var resetButton = document.getElementById(ids.reset);
    if (!liste) return null;
    var recording = false;

    function draw() {
      var keys = store.read();
      liste.textContent = "";
      if (!keys.length) {
        var leer = document.createElement("span");
        leer.className = "hint";
        leer.textContent = t("prefs.none");
        liste.appendChild(leer);
        return;
      }
      keys.forEach(function (key) {
        var chip = document.createElement("span");
        chip.className = "key-chip";
        var wort = document.createElement("kbd");
        wort.textContent = name(key);
        chip.appendChild(wort);
        var weg = document.createElement("button");
        weg.type = "button";
        weg.className = "key-remove";
        weg.dataset.key = key;
        weg.setAttribute("aria-label", t("prefs.remove", { key: name(key) }));
        weg.dataset.tip = t("prefs.remove", { key: name(key) });
        chip.appendChild(weg);
        liste.appendChild(chip);
      });
    }

    function melde(text) {
      state.textContent = text || "";
    }

    function stopRecording() {
      recording = false;
      recordButton.classList.remove("is-active");
    }

    liste.addEventListener("click", function (ev) {
      var weg = ev.target.closest(".key-remove");
      if (!weg) return;
      store.write(store.read().filter(function (key) { return key !== weg.dataset.key; }));
      draw();
      melde("");
    });

    recordButton.addEventListener("click", function () {
      if (recording) { stopRecording(); melde(""); return; }
      // Only one of the two blocks may be listening at a time, or one
      // press would land in both lists.
      blocks.forEach(function (other) { if (other !== self) other.stop(); });
      recording = true;
      recordButton.classList.add("is-active");
      melde(t("prefs.recording"));
    });

    resetButton.addEventListener("click", function () {
      store.reset();
      stopRecording();
      draw();
      melde("");
    });

    // Takes the key, or says why it will not. Answers whether the press
    // was this block's business at all.
    function nimm(key) {
      if (!recording) return false;
      stopRecording();
      if (RESERVIERT.indexOf(key) !== -1) { melde(t("prefs.reserved", { key: name(key) })); return true; }
      var keys = store.read();
      if (keys.indexOf(key) !== -1) { melde(t("prefs.taken", { key: name(key) })); return true; }
      keys.push(key);
      store.write(keys);
      draw();
      melde(t("prefs.recorded", { key: name(key) }));
      return true;
    }

    var self = {
      draw: draw,
      stop: function () { stopRecording(); melde(""); },
      records: function () { return recording; },
      nimm: nimm,
    };
    return self;
  }

  var blocks = [];
  blocks.push(block(window.presenterKeys,
    { list: "prefs-keys", state: "prefs-state", record: "prefs-record", reset: "prefs-reset" }));
  blocks.push(block(window.startKeys,
    { list: "prefs-start-keys", state: "prefs-start-state", record: "prefs-start-record", reset: "prefs-start-reset" }));
  blocks = blocks.filter(Boolean);

  function recordingAnywhere() {
    return blocks.some(function (b) { return b.records(); });
  }

  // Capture phase: while recording, the key belongs to this dialog and to
  // nothing else -- Tab would otherwise move the focus out of it before we
  // ever saw it.
  document.addEventListener("keydown", function (ev) {
    if (!recordingAnywhere() || !dialog.open) return;
    // Every key, Escape included, belongs to the recording while it runs --
    // Escape ends the recording and nothing else. Without this the dialog's
    // own Escape would close the whole thing, which is not what the line
    // above the button promises.
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.key === "Escape") { blocks.forEach(function (b) { b.stop(); }); return; }
    // A modifier on its own is somebody halfway through a shortcut, not a
    // key of its own.
    if (["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"].indexOf(ev.key) !== -1) return;
    blocks.some(function (b) { return b.nimm(ev.key); });
  }, true);

  // The row in the settings menu opens it. Delegated, because the menu is
  // the same partial on both pages and closes itself on the click.
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest || !ev.target.closest("#prefs-open")) return;
    blocks.forEach(function (b) { b.draw(); b.stop(); });
    dialog.showModal();
  });

  // Belt and braces for the Escape above: a dialog closes on its own
  // "cancel" signal, and not every browser routes that through the keydown
  // we just swallowed.
  dialog.addEventListener("cancel", function (ev) {
    if (!recordingAnywhere()) return;
    ev.preventDefault();
    blocks.forEach(function (b) { b.stop(); });
  });

  dialog.addEventListener("close", function () {
    blocks.forEach(function (b) { b.stop(); });
  });
})();
