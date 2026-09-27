// Slides with more on them than fits.
//
// reveal.js lays every slide out in a box of a fixed size -- 960 by 700 by
// default -- and scales that box to the window. What does not fit INSIDE
// the box is not scaled with it: it is cut off at the bottom. reveal has no
// notion of "too much text", so a paragraph too many loses its last lines
// in the editor, on the wall and in the handout alike, and nothing on the
// slide says so.
//
// So the type on such a slide is stepped down until it fits. Measured
// rather than guessed: how much is too much depends on the theme, the
// layout, the window and the words themselves, and none of that is known
// while the stylesheet is written. A slide that fits is not touched at all
// -- this is the rescue for the odd slide, not a layout rule.
//
// The size goes on the <section>, so everything on the slide follows it:
// the themes size their headings in em, and ours do too (slides.css).
(function () {
  // Where the shrinking stops. Below this a slide is unreadable from the
  // back of the room, and the honest answer is "put less on it" rather than
  // a smaller size -- so from here on the slide is allowed to run over
  // again, which is what shows the author that there is a problem.
  var SMALLEST = 0.55;

  // Halving the interval seven times lands within a thousandth of the
  // largest size that quiet fits -- finer than anyone can see, and seven
  // measurements cost nothing.
  var STEPS = 7;

  // The box a slide has to fit in.
  //
  // On screen that is the one reveal lays it out in, not the window: the
  // window only decides what that box is scaled BY afterwards.
  //
  // On paper it is a different box. reveal puts every slide in a .pdf-page
  // of its own, that page CLIPS whatever sticks out (overflow: hidden), and
  // the slide does not begin at its top edge -- reveal places it a little
  // way down. What is available there is therefore the page minus that
  // offset. Measured against the 700 of the screen instead, a slide that
  // just fits on the wall comes out of the printer a line short.
  function targetHeight(slide) {
    var side = slide.closest ? slide.closest(".pdf-page") : null;
    if (side) {
      var oben = slide.getBoundingClientRect().top - side.getBoundingClientRect().top;
      return Math.max(1, side.clientHeight - Math.max(0, oben));
    }
    var masse = window.Reveal && Reveal.getComputedSlideSize && Reveal.getComputedSlideSize();
    return (masse && masse.height) || 700;
  }

  // No slack: scrollHeight is already rounded to whole pixels, and a pixel
  // granted here is a pixel the print view cuts off -- its page clips what
  // sticks out.
  function fits(slide, height) {
    return slide.scrollHeight <= height;
  }

  // A slide that is not on screen is display:none, and something that is
  // not laid out has no height to measure. So it is laid out for the length
  // of the measurement and put back immediately: reading scrollHeight
  // forces layout, not a repaint, and nothing is painted before the style
  // is back -- so none of this reaches the screen.
  //
  // Only the plain layouts ever get here. The ones carrying a display of
  // their own in the stylesheet -- the grids and the flex boxes -- do so
  // with !important, which outranks reveal's display:none, so those are
  // laid out even while reveal has them hidden.
  // Up to .slides and not just the slide itself: a slide with others
  // beneath it sits in a stack, and reveal hides the STACK. A child of
  // something that is display:none is not laid out however it is set
  // itself, so the whole chain has to be opened, or the measurement comes
  // back as zero -- which reads as "fits" and leaves the slide cut off.
  function layOut(slide) {
    var back = [];
    for (var el = slide; el && !el.classList.contains("slides"); el = el.parentElement) {
      if (getComputedStyle(el).display !== "none") continue;
      back.push({ el: el, display: el.style.display, visibility: el.style.visibility });
      el.style.display = "block";
      el.style.visibility = "hidden";
    }
    return back;
  }

  function restore(back) {
    back.forEach(function (n) {
      n.el.style.display = n.display;
      n.el.style.visibility = n.visibility;
    });
  }

  function fitSlide(slide, height) {
    // Always measured at full size first -- otherwise a slide that has been
    // shortened since would keep the size it needed when it was long.
    slide.style.fontSize = "";
    slide.removeAttribute("data-fit");
    var before = layOut(slide);
    // Nothing may be mid-transition while this measures -- a fragment
    // carries `transition: all`, and that includes the size being set here
    // (slides.css).
    slide.classList.add("is-measuring");
    try {
      if (fits(slide, height)) return;

      var low = SMALLEST;   // taken as fitting; where it does not, it is the floor
      var high = 1;          // known not to fit -- just measured
      for (var i = 0; i < STEPS; i++) {
        var mid = (low + high) / 2;
        slide.style.fontSize = mid + "em";
        if (fits(slide, height)) low = mid; else high = mid;
      }
      slide.style.fontSize = low + "em";
      // Visible in the inspector, so a slide that came out small can be
      // told apart from one that was written small.
      slide.setAttribute("data-fit", low.toFixed(3));
    } finally {
      slide.classList.remove("is-measuring");
      restore(before);
    }
  }

  function collect(scope) {
    // A stack is a <section> as well and carries no data-layout: it holds
    // slides, not text of its own (render.js).
    if (scope && scope.matches && scope.matches("section[data-layout]")) return [scope];
    return [].slice.call((scope || document).querySelectorAll(".reveal .slides section[data-layout]"));
  }

  function all(scope) {
    // The height is asked for per slide, not once for all of them: on paper
    // every slide sits in a page of its own and starts at its own offset
    // inside it.
    collect(scope).forEach(function (slide) { fitSlide(slide, targetHeight(slide)); });
  }

  // ready: the first layout is done. resize: on a narrow window the image
  // layouts stack text under picture (slides.css), which changes what fits.
  // Caught where they bubble to -- before initialize() there is no reveal
  // element to hang a listener on.
  document.addEventListener("ready", function () { all(); });
  document.addEventListener("resize", function () { all(); });
  // Pictures and fonts arrive after the first measurement and change the
  // height with them. A second pass costs nothing on a deck that fits.
  window.addEventListener("load", function () { all(); });
  // The print view is a second layout in a second kind of box (see
  // targetHeight), and reveal builds it after "ready". Caught before the
  // export's own pdf-ready listener, which reports the page fit to print:
  // this file is loaded first and listeners run in the order they were
  // added (document.js).
  document.addEventListener("pdf-ready", function () { all(); });
  // The editor's preview redraws single slides and calls this by name
  // afterwards, the same way it does for the effects (views/reveal.ejs).
  window.slideFit = all;
})();
