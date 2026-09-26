// Tooltips of our own. The browser's cannot be styled at all -- not their
// colour, not their delay, not their shape -- so on a surface that comes in
// a light and a dark mode they always look like a visitor from another
// program.
//
// Anything carrying data-tip gets one. The bubble lives on <body> and is
// positioned fixed, because the editor's columns scroll: a bubble placed
// inside one would be cut off at its edge.
(function () {
  var VERZOEGERUNG = 350;   // long enough not to flash while passing over
  var ABSTAND = 8;
  var blase = null;
  var uhr = null;
  var aktiv = null;

  function blaseHolen() {
    if (blase) return blase;
    blase = document.createElement("div");
    blase.className = "tooltip";
    blase.setAttribute("role", "tooltip");
    // The text repeats the element's own accessible name, so a screen
    // reader must not read it a second time.
    blase.setAttribute("aria-hidden", "true");
    document.body.appendChild(blase);
    return blase;
  }

  function verbergen() {
    clearTimeout(uhr);
    aktiv = null;
    if (blase) blase.classList.remove("ist-sichtbar");
  }

  function setzen(el) {
    var text = el.getAttribute("data-tip");
    if (!text) return;
    var b = blaseHolen();
    b.textContent = text;
    b.classList.add("ist-sichtbar");

    // Measured only once it carries its text, otherwise the size is wrong.
    var ziel = el.getBoundingClientRect();
    var eigen = b.getBoundingClientRect();
    var links = ziel.left + ziel.width / 2 - eigen.width / 2;
    var oben = ziel.top - eigen.height - ABSTAND;
    // No room above: below it instead.
    if (oben < 4) oben = ziel.bottom + ABSTAND;
    // And never past the edge of the window.
    links = Math.max(4, Math.min(links, window.innerWidth - eigen.width - 4));
    b.style.left = Math.round(links) + "px";
    b.style.top = Math.round(oben) + "px";
  }

  function zeigen(el, sofort) {
    if (el === aktiv) return;
    clearTimeout(uhr);
    aktiv = el;
    if (sofort) setzen(el);
    else uhr = setTimeout(function () { if (aktiv === el) setzen(el); }, VERZOEGERUNG);
  }

  document.addEventListener("mouseover", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) zeigen(el, false);
    else verbergen();
  });

  // Keyboard users get it without waiting -- they arrived on purpose.
  document.addEventListener("focusin", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) zeigen(el, true);
  });

  document.addEventListener("focusout", verbergen);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") verbergen(); });
  // After a click the label has served its purpose, and anything that moves
  // the page would leave the bubble behind.
  document.addEventListener("click", verbergen);
  document.addEventListener("scroll", verbergen, true);
  window.addEventListener("resize", verbergen);
})();
