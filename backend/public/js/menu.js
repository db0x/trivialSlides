// A <details> menu only closes where it opened: on its own summary. That
// is not how a menu behaves anywhere else -- a click beside it, or Escape,
// is expected to close it, and so is choosing something from it.
(function () {
  function close(ausser) {
    document.querySelectorAll("details.menu[open]").forEach(function (d) {
      if (d !== ausser) d.open = false;
    });
  }

  document.addEventListener("click", function (ev) {
    var inner = ev.target.closest("details.menu");
    // Beside it: everything closes. Inside it: choosing an entry closes it
    // too, the summary is left to the browser.
    if (!inner) return close(null);
    // Inside it: choosing something closes it too -- unless it is a panel
    // one picks several things from in a row and says so. Then everything
    // else closes and it stays.
    if (ev.target.closest(".menu-content")) {
      return close(ev.target.closest("details.menu[data-keep-open]"));
    }
    close(inner);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    var open = document.querySelector("details.menu[open]");
    if (!open) return;
    open.open = false;
    // Back to where it was opened from, or the focus would be nowhere.
    var head = open.querySelector("summary");
    if (head) head.focus();
  });
})();
