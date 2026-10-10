// Every command in the header, findable by typing its name
// (partials/palette.ejs). Ctrl+K, or Cmd+K on a Mac.
//
// This is the piece that lets the bar above stay short. A toolbar is always
// a bet about which handful of things are worth standing there all day, and
// every such bet is wrong for somebody. A palette is the answer to "where
// did they put it", and it costs the bar nothing.
//
// Nothing here holds a LIST of commands. The rows are read off the header
// every time the palette opens, which is worth saying plainly because it is
// the whole design:
//
//   * a button added to the bar is a command here without anybody saying so
//   * a button taken off the bar is gone from here with it
//   * a row can never name something this editor does not have -- the AI
//     button is absent where no key is configured, and so is its row
//   * a row never shows a stale value: the pills are read at open time, so
//     "Aussehen: simple" is a tick beside the theme that is really set
//
// Which is the failure every hand-kept command list comes to in the end,
// and it is avoided by not keeping one.
//
// A command RUNS by clicking the control it was read from. That matters
// for two of them: the three export rows and the two ways into the talk are
// plain links whose click handler flushes what the delayed save still owes
// before the tab goes anywhere (index.js), and reproducing that here would
// be the same dance written twice.
import { $, $$, t } from "./base.js";

// The words of a control, without the pieces that are drawn rather than
// read: the icon in front of a menu row, the caret after a pill, the two
// letters of the language code. All of them are aria-hidden already --
// that is exactly what the attribute means -- so one rule finds them all.
function wordOf(node) {
  var copy = node.cloneNode(true);
  $$("[aria-hidden='true']", copy).forEach(function (piece) { piece.remove(); });
  return (copy.textContent || "").replace(/\s+/g, " ").trim();
}

export function setupPalette() {
  var dialog = $("#palette-dialog");
  if (!dialog) return;
  var field = $("#palette-field");
  var list = $("#palette-list");
  var empty = $("#palette-empty");

  var commands = [];   // built afresh on every open
  var shown = [];      // what the filter left, in the order drawn
  var at = 0;          // which of those is current

  function add(group, name, hint, run, ticked) {
    if (!name) return;
    commands.push({
      group: group,
      name: name,
      hint: hint && hint !== name ? hint : "",
      run: run,
      ticked: !!ticked,
      // Matched against, once, so the filter is a substring test per
      // keystroke rather than three.
      haystack: (group + " " + name + " " + (hint || "")).toLowerCase(),
    });
  }

  // Clicking the control is the command. Wrapped so that a control which
  // has gone from the page between opening the palette and pressing Enter
  // -- the Save button does exactly that when autosave is switched on in
  // another tab -- comes to nothing instead of an exception.
  function clicks(node) {
    return function () { if (node && node.isConnected) node.click(); };
  }

  // The order the groups come out in is the order they are drawn in, and
  // it is the order of how often one wants them -- not the order they
  // stand in the bar. Opening something first, presenting second, and the
  // fifteen theme names LAST: they are the longest list in here by far,
  // and with the palette just opened and nothing typed, a reader should be
  // looking at four commands rather than scrolling past a theme gallery to
  // find them.
  function gather() {
    commands = [];

    // The four that open something. Their word is on the button; the long
    // form is in the tooltip, and it is worth searching -- somebody typing
    // "fuss" has to find "Kopf & Fuss", whose tooltip is the only place the
    // whole word stands.
    $$(".head-open button.head-tool").forEach(function (button) {
      add(t("palette.groupOpen"), wordOf(button), button.dataset.tip || "", clicks(button));
    });

    // Presenting is one command or two, and which it is depends on where
    // the editor stands: on the first slide the two are the same thing and
    // index.js leaves the plain link in place. Reading whichever of the
    // two is on the page keeps that decision in the one file that makes it.
    var menu = $(".present-menu");
    if (menu && !menu.hidden) {
      $$(".menu-item", menu).forEach(function (row) {
        add(t("palette.groupPresent"), wordOf(row), "", clicks(row));
      });
    } else {
      var direct = $(".present-direct");
      if (direct) add(t("palette.groupPresent"), wordOf(direct), direct.dataset.tip || "", clicks(direct));
    }

    $$("#deck-export-menu .menu-content a").forEach(function (link) {
      add(t("palette.groupExport"), wordOf(link), "", clicks(link));
    });

    // Saving, while there is a button for it at all -- with autosave on
    // there is not, and neither is there a command. First of the group,
    // because it is the only thing in it that DOES something; the rest are
    // values to choose between.
    var save = $("#deck-save");
    if (save && !save.hidden) {
      add(t("palette.groupDeck"), save.getAttribute("aria-label"), "", clicks(save));
    }

    // The pills: one command per value, with the one in force ticked. The
    // name of the setting rides on data-label (app.css draws it), which is
    // also what makes "Uebergang: fade" read as a sentence in the list.
    $$(".head-deck .header-menu").forEach(function (pill) {
      var button = $("summary", pill);
      if (!button) return;
      var label = button.dataset.label || "";
      var now = button.dataset.value;
      $$(".menu-item", pill).forEach(function (row) {
        var value = row.dataset.value;
        add(t("palette.groupDeck"), label + ": " + value, "", clicks(row), value === now);
      });
    });

    // Light and dark, the language and the settings dialog. Not the row
    // that opens THIS -- a command for the thing one is already looking at
    // is a row that can only disappoint.
    $$(".head-menu .menu-item").forEach(function (row) {
      if (row.classList.contains("menu-item-skip")) return;
      add(t("palette.groupSettings"), wordOf(row), "", clicks(row));
    });
  }

  function draw() {
    var query = field.value.toLowerCase().trim();
    // Every word of the query has to appear somewhere in the row, in any
    // order: "pdf export" and "export pdf" find the same line.
    var words = query ? query.split(/\s+/) : [];
    shown = commands.filter(function (cmd) {
      return words.every(function (word) { return cmd.haystack.indexOf(word) !== -1; });
    });
    if (at >= shown.length) at = shown.length - 1;
    if (at < 0) at = 0;

    list.textContent = "";
    var group = null;
    shown.forEach(function (cmd, i) {
      if (cmd.group !== group) {
        group = cmd.group;
        var head = document.createElement("li");
        head.className = "palette-group";
        head.setAttribute("role", "presentation");
        head.textContent = group;
        list.appendChild(head);
      }
      var row = document.createElement("li");
      row.className = "palette-row" + (i === at ? " is-at" : "") + (cmd.ticked ? " is-ticked" : "");
      row.id = "palette-row-" + i;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", i === at ? "true" : "false");

      var name = document.createElement("span");
      name.className = "palette-name";
      name.textContent = cmd.name;
      row.appendChild(name);

      if (cmd.hint) {
        var hint = document.createElement("span");
        hint.className = "palette-hint";
        hint.textContent = cmd.hint;
        row.appendChild(hint);
      }

      // The pointer picks a row by moving over it and runs it by clicking,
      // which is how every other list in this editor behaves. Mousedown
      // and not click, so the field never loses the caret.
      row.addEventListener("mousemove", function () {
        if (at === i) return;
        at = i;
        draw();
      });
      row.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        at = i;
        run();
      });
      list.appendChild(row);
    });

    empty.hidden = shown.length > 0;
    field.setAttribute("aria-activedescendant", shown.length ? "palette-row-" + at : "");
    var current = $(".palette-row.is-at", list);
    if (current) current.scrollIntoView({ block: "nearest" });
  }

  function move(by) {
    if (!shown.length) return;
    at = (at + by + shown.length) % shown.length;
    draw();
  }

  // Closed FIRST, and the command run straight after without waiting for a
  // frame. Both halves matter: a command that opens a dialog of its own
  // cannot do it under a modal that is still open, and three of these
  // commands open a tab -- which a browser only allows while the keypress
  // that asked for it is still being handled.
  function run() {
    var cmd = shown[at];
    if (!cmd) return;
    dialog.close();
    cmd.run();
  }

  function open() {
    if (dialog.open) return;
    gather();
    field.value = "";
    at = 0;
    draw();
    dialog.showModal();
    field.focus();
  }

  field.addEventListener("input", function () { at = 0; draw(); });

  field.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
    else if (ev.key === "Home") { ev.preventDefault(); at = 0; draw(); }
    else if (ev.key === "End") { ev.preventDefault(); at = shown.length - 1; draw(); }
    else if (ev.key === "Enter") { ev.preventDefault(); run(); }
    // Escape is the dialog's own, and needs nothing from here.
  });

  // Clicking the veil closes it: the click lands on the <dialog> itself,
  // because everything inside is in a child.
  dialog.addEventListener("mousedown", function (ev) {
    if (ev.target === dialog) dialog.close();
  });

  var fromMenu = $("#palette-open");
  if (fromMenu) {
    fromMenu.addEventListener("click", function () {
      var menu = fromMenu.closest("details");
      if (menu) menu.open = false;
      open();
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    if ((ev.key || "").toLowerCase() !== "k") return;
    // Another dialog has the floor -- the source may be half written in
    // it, and every command in here would pull the ground from under it.
    if (document.querySelector("dialog[open]") && !dialog.open) return;
    // Firefox puts the caret in its search bar on this one, so the key has
    // to be taken rather than merely heard.
    ev.preventDefault();
    if (dialog.open) dialog.close();
    else open();
  });
}
