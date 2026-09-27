// Tooltips of our own. The browser's cannot be styled at all -- not their
// colour, not their delay, not their shape -- so on a surface that comes in
// a light and a dark mode they always look like a visitor from another
// program.
//
// Anything carrying data-tip gets one. The bubble lives on <body> and is
// positioned fixed, because the editor's columns scroll: a bubble placed
// inside one would be cut off at its edge.
(function () {
  var DELAY = 350;   // long enough not to flash while passing over
  var GAP = 8;
  var bubble = null;
  var timer = null;
  var active = null;

  function bubbleGet() {
    if (bubble) return bubble;
    bubble = document.createElement("div");
    bubble.className = "tooltip";
    bubble.setAttribute("role", "tooltip");
    // The text repeats the element's own accessible name, so a screen
    // reader must not read it a second time.
    bubble.setAttribute("aria-hidden", "true");
    document.body.appendChild(bubble);
    return bubble;
  }

  function hide() {
    clearTimeout(timer);
    active = null;
    if (bubble) bubble.classList.remove("is-visible");
  }

  function place(el) {
    var text = el.getAttribute("data-tip");
    if (!text) return;
    var b = bubbleGet();
    b.textContent = text;
    b.classList.add("is-visible");

    // Measured only once it carries its text, otherwise the size is wrong.
    var target = el.getBoundingClientRect();
    var custom = b.getBoundingClientRect();
    var links = target.left + target.width / 2 - custom.width / 2;
    var oben = target.top - custom.height - GAP;
    // No room above: below it instead.
    if (oben < 4) oben = target.bottom + GAP;
    // And never past the edge of the window.
    links = Math.max(4, Math.min(links, window.innerWidth - custom.width - 4));
    b.style.left = Math.round(links) + "px";
    b.style.top = Math.round(oben) + "px";
  }

  function show(el, sofort) {
    if (el === active) return;
    clearTimeout(timer);
    active = el;
    if (sofort) place(el);
    else timer = setTimeout(function () { if (active === el) place(el); }, DELAY);
  }

  document.addEventListener("mouseover", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) show(el, false);
    else hide();
  });

  // Keyboard users get it without waiting -- they arrived on purpose.
  document.addEventListener("focusin", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) show(el, true);
  });

  document.addEventListener("focusout", hide);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hide(); });
  // After a click the label has served its purpose, and anything that moves
  // the page would leave the bubble behind.
  document.addEventListener("click", hide);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
})();
