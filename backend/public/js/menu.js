// A <details> menu only closes where it opened: on its own summary. That
// is not how a menu behaves anywhere else -- a click beside it, or Escape,
// is expected to close it, and so is choosing something from it.
(function () {
  function schliessen(ausser) {
    document.querySelectorAll("details.menue[open]").forEach(function (d) {
      if (d !== ausser) d.open = false;
    });
  }

  document.addEventListener("click", function (ev) {
    var innen = ev.target.closest("details.menue");
    // Beside it: everything closes. Inside it: choosing an entry closes it
    // too, the summary is left to the browser.
    if (!innen) return schliessen(null);
    if (ev.target.closest(".menue-inhalt")) return schliessen(null);
    schliessen(innen);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    var offen = document.querySelector("details.menue[open]");
    if (!offen) return;
    offen.open = false;
    // Back to where it was opened from, or the focus would be nowhere.
    var kopf = offen.querySelector("summary");
    if (kopf) kopf.focus();
  });
})();
