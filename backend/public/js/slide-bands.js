// A header or a footer that stays where it is while the slides change.
//
// The two strips sit INSIDE every <section> (render.js), and that is what
// makes them appear in the preview, on a card in the editor's slide list
// and on a printed page without anything being drawn a second time. The
// price is paid here: reveal.js moves that <section>, so a slide flying
// out to the left takes its footer with it -- and a line that is the same
// on every slide has no business flying anywhere.
//
// It cannot be held still where it stands. A slide that rotates through a
// perspective carries its whole contents with it, and there is no
// counter-move for that. So where a presentation is RUNNING, one copy of
// the strip is lifted out of the slides and hung on the stage instead: the
// stage does not move between slides, and neither, then, does the strip.
// The copies inside the slides give way to it (slides.css).
//
// Which leaves exactly one moment at which the strip may fade: when the
// slide underneath is one that sends this band away (deck.js,
// data-no-header / data-no-footer). Then it has to appear or disappear,
// and that is what the quick ease in the stylesheet is for.
//
// Not on paper and not on a card: there is nothing to stand out of there,
// the strip inside the slide is what gets drawn, and this file is simply
// not asked (views/thumb.ejs does not load it, and the print view leaves
// at the first line below).
(function () {
  var BANDS = ["header", "footer"];

  function start() {
    var stage = document.querySelector(".reveal");
    var slides = stage && stage.querySelector(".slides");
    if (!slides || !window.Reveal || !Reveal.getConfig) return;

    // Printing, every slide gets a page of its own and nothing moves. The
    // strips inside the slides are what belongs on those pages -- and a
    // copy hung on the stage would be on the first page alone.
    if (Reveal.getConfig().view === "print"
        || document.documentElement.classList.contains("reveal-print")) return;

    // One standing copy per band that asked for it. Taken from the first
    // slide that carries it: a band is the same on every slide, which is
    // the whole premise of the thing (bands.js).
    var stands = [];
    BANDS.forEach(function (name) {
      var sample = slides.querySelector('.slide-band[data-still][data-band="' + name + '"]');
      if (!sample) return;
      var holder = document.createElement("div");
      holder.className = "band-stand";
      holder.appendChild(sample.cloneNode(true));
      slides.appendChild(holder);
      stands.push({ name: name, holder: holder });
    });
    if (!stands.length) return;

    // Said here and not in the markup: a page where this script never ran
    // -- a card, a printed page -- has to keep showing the strips the
    // slides themselves carry.
    stage.classList.add("bands-standing");

    // The strip takes the LOOK of the slide it stands over, which is not
    // the same as moving with it: its layout, so a full-bleed picture gets
    // the white type and the shadow the stylesheet has for it, and the
    // colour the slide's text has. Between two slides that look alike --
    // which is most pairs in most decks -- this changes nothing at all,
    // and nothing is what should happen.
    //
    // The colour is READ off the slide rather than copied from its style
    // attribute, because three things can decide it and only one of them
    // is written there: the theme, the theme's own rule for a slide whose
    // ground runs against it (has-dark-background), and the colour the
    // slide was given. Asking for the computed one asks all three at once
    // -- and those rules name a <section>, which the strip standing over
    // the slides is not.
    // Which slide is on screen. Read off the DOM rather than asked of
    // reveal: the editor's preview REPLACES a slide's element while it is
    // being typed in (views/reveal.ejs), and reveal goes on holding the
    // element it had -- which is now out of the document and still carries
    // the band that was just switched off. The innermost one, because a
    // slide hanging below another sits in a stack and the stack is marked
    // present as well.
    function current() {
      var present = document.querySelectorAll(".reveal .slides section.present");
      if (present.length) return present[present.length - 1];
      return Reveal.getCurrentSlide ? Reveal.getCurrentSlide() : null;
    }

    function follow() {
      var slide = current();
      stands.forEach(function (stand) {
        var band = slide && slide.querySelector('.slide-band[data-band="' + stand.name + '"]');
        var here = !!band;
        var layout = slide && slide.dataset.layout ? " layout-" + slide.dataset.layout : "";
        // What the strip SAYS, taken from the slide afresh. On the wall
        // this never changes -- a band is the same on every slide, which
        // is the whole premise -- and the comparison costs nothing. In the
        // editor it is the point: the dialog that holds the band is worked
        // in while the preview is watched, and the preview answers by
        // redrawing the one slide (js/editor/bands.js). Without this the
        // standing copy would still be showing what was typed a minute
        // ago.
        if (band && stand.holder.firstChild.outerHTML !== band.outerHTML) {
          stand.holder.replaceChild(band.cloneNode(true), stand.holder.firstChild);
        }
        // Written rather than added to, so the layout of the slide before
        // goes with it. Only reveal's own state classes are left out:
        // present and past say where a SLIDE is in the talk, and the strip
        // is in none of it.
        stand.holder.className = "band-stand" + (here ? "" : " is-away") + layout;
        stand.holder.style.color = slide ? getComputedStyle(slide).color : "";
      });
    }

    Reveal.on("slidechanged", follow);
    follow();

    // The editor redraws single slides in its preview and calls the pieces
    // that hang off a slide by name afterwards (views/reveal.ejs) -- the
    // effects, the fit, and now this: switching a band off on the slide
    // being edited has to show at once.
    window.slideBands = follow;
  }

  // "ready" is reveal's own, and the first moment getConfig() and
  // getCurrentSlide() answer. Caught on the document, where it bubbles to
  // -- before initialize() there is no reveal element to listen on (the
  // same handshake js/slide-fit.js makes).
  if (window.Reveal && Reveal.isReady && Reveal.isReady()) start();
  else document.addEventListener("ready", start);
})();
