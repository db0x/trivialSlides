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
  var select = document.getElementById("preview-format");
  if (!select) return;

  function apply(format) {
    // The menu says "16:9", CSS wants "16 / 9".
    document.documentElement.style.setProperty("--preview-ratio", format.replace(":", " / "));
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  // Only a format the menu really offers. A value left over from an older
  // list -- or edited by hand -- would otherwise land in the stylesheet,
  // where a wrong one takes the frame with it.
  var saved = stored();
  var known = [].some.call(select.options, function (o) { return o.value === saved; });
  if (known) select.value = saved;
  apply(select.value);

  select.addEventListener("change", function () {
    apply(select.value);
    try { localStorage.setItem(KEY, select.value); } catch (e) { /* private window */ }
  });
})();
