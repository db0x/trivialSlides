// Which slide cards take part in the opening (app.css), and when the whole
// thing is over.
//
// The cards are not in the page the server sends -- the list is built in
// the browser from the deck (js/editor/slide-list.js) -- so the one thing
// CSS cannot do here is say "the first six, 45 milliseconds apart". That
// is all this file is for.
//
// Only the cards standing in the visible part of the list take part. A
// stagger running on down a list of eighty is three seconds of animation
// nobody can see, and the one card at the top that a reader IS looking at
// would be no livelier for it.
//
// A plain script, not a module: it waits for a list to fill and then takes
// an attribute off, and needs nothing from the editor's own files.
(function () {
  var root = document.documentElement;
  // No attribute means reduced motion, or a browser that could not be
  // asked (views/editor.ejs). Then there is nothing here to do either.
  if (root.getAttribute("data-enter") !== "1") return;

  var list = document.getElementById("slide-list");
  if (!list) { root.removeAttribute("data-enter"); return; }

  // Long enough for the last card of a full column and its 240ms to be
  // done with. It only has to be LATE -- what it ends is the one-off
  // nature of the thing, not the animation itself.
  var OVER = 1500;

  function stop() {
    root.removeAttribute("data-enter");
    Array.prototype.forEach.call(list.children, function (card) {
      card.classList.remove("is-entering");
      card.style.removeProperty("--enter-index");
    });
  }

  // The cards arrive in one go, all of them appended before the browser
  // paints anything -- so this runs while they are still invisible, which
  // is the only moment at which they can be told to arrive from somewhere.
  function tag() {
    var floor = list.getBoundingClientRect().top + list.clientHeight;
    var index = 0;
    Array.prototype.some.call(list.children, function (card) {
      // The first card that begins below the fold ends it: everything
      // after that one is further down still.
      if (card.getBoundingClientRect().top >= floor) return true;
      card.style.setProperty("--enter-index", index++);
      card.classList.add("is-entering");
      return false;
    });
    setTimeout(stop, OVER);
  }

  if (list.children.length) { tag(); return; }

  if (!window.MutationObserver) { stop(); return; }
  // A deck with no slides at all, or a list that never fills: the attribute
  // may not be left on the page for the rest of the session. Called off as
  // soon as the cards do arrive, so that it cannot cut their own run short.
  var net = setTimeout(function () { watcher.disconnect(); stop(); }, OVER);
  var watcher = new MutationObserver(function () {
    if (!list.children.length) return;
    watcher.disconnect();
    clearTimeout(net);
    tag();
  });
  watcher.observe(list, { childList: true });
})();
