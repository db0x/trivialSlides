// What shape the editor's preview is fitted into: 16:9, 4:3 and the like.
//
// This is a matter of the screen the talk will run on, not of the deck. The
// deck is laid out at 960x700 whatever happens and reveal.js fits that into
// whatever room it is given -- exactly as it will on the wall later. So the
// only thing changed here is the box the preview stands in; nothing is
// saved into the .md, and the presentation itself never sees this.
//
// The choice lives in localStorage and therefore per browser, the same way
// the light/dark one does (theme.js): it belongs to the screen in front of
// you, not to the talk.
(function () {
  var KEY = "trivialslides:preview-format";
  var menu = document.getElementById("preview-format-menu");
  if (!menu) return;
  var word = document.getElementById("preview-format-word");
  var rows = Array.prototype.slice.call(menu.querySelectorAll(".format-row"));

  // The button starts out wearing the default the server rendered into it,
  // so that is also what an unreadable or unknown stored value falls back
  // to -- one default, named in one place (routes/decks.js).
  var fallback = word.textContent.trim();

  function apply(format) {
    // The menu says "16:9", CSS wants "16 / 9".
    document.documentElement.style.setProperty("--preview-ratio", format.replace(":", " / "));
    word.textContent = format;
    rows.forEach(function (row) {
      var here = row.dataset.format === format;
      row.classList.toggle("is-active", here);
      row.setAttribute("aria-checked", here ? "true" : "false");
    });
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  // Only a format the menu really offers. A value left over from an older
  // list -- or edited by hand -- would otherwise land in the stylesheet,
  // where a wrong one takes the frame with it.
  var saved = stored();
  var known = rows.some(function (row) { return row.dataset.format === saved; });
  apply(known ? saved : fallback);

  rows.forEach(function (row) {
    row.addEventListener("click", function () {
      apply(row.dataset.format);
      menu.open = false;
      try { localStorage.setItem(KEY, row.dataset.format); } catch (e) { /* private window */ }
    });
  });
})();
