// The slide list is scrolled by two buttons, not by a bar beside it.
//
// The list is the one place in this app where a scrollbar would stand ON
// the content: the cards are pictures 226 pixels wide, and a bar takes a
// strip off every one of them for as long as it is visible. Two buttons
// instead, above the list and below it, where they cost the cards nothing
// -- and they say by being there at all that there is more list further
// on, which a bar that hides itself does not.
//
// The wheel, the trackpad and the keyboard still scroll the list the way
// they always did. Nothing here takes that away; this only adds a way of
// doing it with the mouse alone.
//
// A plain script, not a module: it touches two buttons and a list, and
// needs nothing from the editor's own files.
(function () {
  var list = document.getElementById("slide-list");
  if (!list) return;
  var steps = Array.prototype.slice.call(document.querySelectorAll(".slides-step"));
  if (!steps.length) return;

  // Holding a button on: the first step on the press, then one every tenth
  // of a second until it is let go. Without it a list of forty slides is
  // forty clicks.
  var FIRST_WAIT = 400;
  var THEN_EVERY = 100;

  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");

  // One card, margin and all -- the step by which the list reads as having
  // moved on by one slide rather than by some number of pixels. Asked of
  // the card itself, because its height follows the column's width.
  function cardHeight() {
    var card = list.firstElementChild;
    if (!card) return 80;
    var box = card.getBoundingClientRect();
    var gap = parseFloat(getComputedStyle(card).marginBottom) || 0;
    return box.height + gap;
  }

  function step(dir) {
    list.scrollBy({
      top: dir === "up" ? -cardHeight() : cardHeight(),
      behavior: calm.matches ? "auto" : "smooth",
    });
  }

  // Both buttons are there, or neither is: a list that fits needs no
  // furniture at all. The one that can go no further only goes quiet --
  // removing it would move the list by its own height under a mouse that
  // is in the middle of clicking it.
  function update() {
    var over = list.scrollHeight - list.clientHeight;
    // A pixel of slack: scrollTop is a fraction on a scaled display, and
    // without it the lower button never quite believes it has arrived.
    var room = over > 1;
    steps.forEach(function (button) {
      button.hidden = !room;
      button.disabled = !room || (button.dataset.dir === "up"
        ? list.scrollTop <= 1
        : list.scrollTop >= over - 1);
    });
  }

  steps.forEach(function (button) {
    var timer = null;
    var repeat = null;

    function stop() {
      clearTimeout(timer);
      clearInterval(repeat);
      timer = repeat = null;
    }

    button.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      // The button may go quiet under the finger that is holding it, and a
      // disabled button sends no events of its own -- so the repeat asks
      // on every turn whether it is still allowed to run.
      step(button.dataset.dir);
      timer = setTimeout(function () {
        repeat = setInterval(function () {
          if (button.disabled) { stop(); return; }
          step(button.dataset.dir);
        }, THEN_EVERY);
      }, FIRST_WAIT);
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
      button.addEventListener(name, stop);
    });

    // The keyboard's own repeat does the holding here, so a press is one
    // step and nothing else. click, not keydown: that way Enter and Space
    // both arrive, each as the browser means them.
    button.addEventListener("click", function (ev) {
      // The pointer has already stepped by the time the click arrives.
      if (ev.detail !== 0) return;
      step(button.dataset.dir);
    });
  });

  list.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  // The list is redrawn on every click in it and grows and shrinks with the
  // deck (js/editor/slide-list.js). Watching it is what keeps this out of
  // that file: nothing there has to remember to say when a slide was added.
  if (window.MutationObserver) {
    new MutationObserver(update).observe(list, { childList: true });
  }
  update();
})();
