// The header and the footer, lifted out of the slides and hung on the
// screen.
//
// The two strips sit INSIDE every <section> (render.js), and that is what
// makes them appear in the preview, on a card in the editor's slide list
// and on a printed page without anything being drawn a second time. Where
// a presentation is RUNNING, though, that is the wrong place for them
// twice over.
//
// They travel. reveal.js moves the <section>, so a slide flying out to the
// left takes its footer with it -- and there is no counter-move for a
// slide that rotates through a perspective. Lifted out, the strip simply
// stands there while the slides change behind it.
//
// And they stop at the slide's edge rather than the screen's. reveal lays
// every slide out in a box of 960 by 700 and paints the slide's ground
// across the whole display: on a 21:9 screen the slide is the middle half
// of what the eye sees, and a footer on its edge floats in the colour with
// nothing under it. Lifted out, the strip runs the full width and sits on
// the screen's own edge, while its words stay in the slide's column --
// which is what a letterhead on a wide sheet does.
//
// So the copy inside the slide is drawn only where nothing can be lifted:
// on paper, where the page IS the slide, and on a card, which is one still
// slide and never loads this file.
//
// What is left to this file is what the strip looks like at any moment,
// and measuring the screen again whenever it changes shape.
(function () {
  var BANDS = ["header", "footer"];

  // reveal.js' own layout size (config.js, width/height). The strips are
  // written in these units throughout (slides.css), and this file is where
  // they are turned into the screen's.
  var STAGE_HEIGHT = 700;

  function start() {
    var stage = document.querySelector(".reveal");
    var slides = stage && stage.querySelector(".slides");
    if (!slides || !window.Reveal || !Reveal.getConfig) return;

    // Printing, every slide gets a page of its own and nothing moves. The
    // strips inside the slides are what belongs on those pages -- and a
    // copy hung on the screen would be on the first page alone.
    if (Reveal.getConfig().view === "print"
        || document.documentElement.classList.contains("reveal-print")) return;

    // One standing copy per band the deck has. Taken from the first slide
    // that carries it: a band is the same on every slide, which is the
    // whole premise of the thing (bands.js).
    var stands = [];
    BANDS.forEach(function (name) {
      var sample = slides.querySelector('.slide-band[data-band="' + name + '"]');
      if (!sample) return;
      var holder = document.createElement("div");
      holder.className = "band-stand";
      holder.appendChild(sample.cloneNode(true));
      stage.appendChild(holder);
      stands.push({ name: name, holder: holder });
    });
    if (!stands.length) return;

    // Said here and not in the markup: a page where this script never ran
    // -- a card, a printed page -- has to keep showing the strips the
    // slides themselves carry.
    stage.classList.add("bands-standing");

    // --- The screen, in the slide's units --------------------------------
    // The holder is the whole window, measured in stage pixels and scaled
    // by what reveal scales the slide by. Everything inside it is then
    // written in the same units as the strip inside a slide -- one set of
    // measurements, whichever of the two is on the screen.
    //
    // The one number that cannot be written in advance is how wide the
    // bars beside the slide are. That is what keeps the words in the
    // slide's column while the line runs out to the edge (slides.css).
    function place() {
      var box = slides.getBoundingClientRect();
      var scale = box.height / STAGE_HEIGHT;
      if (!scale) return;
      var width = window.innerWidth;
      var height = window.innerHeight;
      stands.forEach(function (stand) {
        var style = stand.holder.style;
        style.width = (width / scale) + "px";
        style.height = (height / scale) + "px";
        style.transform = "scale(" + scale + ")";
        style.setProperty("--band-column", (box.left / scale) + "px");
      });
    }

    // --- What it looks like ----------------------------------------------
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

    function draw() {
      place();
      follow();
    }

    Reveal.on("slidechanged", draw);
    // reveal's own, fired whenever it has laid the stage out afresh: a
    // window resized, a browser gone fullscreen, the editor's preview put
    // into another shape (js/preview-format.js). Where the stage moves,
    // the strip hung beside it has to move with it.
    document.addEventListener("resize", place);
    window.addEventListener("resize", place);
    draw();

    // The editor redraws single slides in its preview and calls the pieces
    // that hang off a slide by name afterwards (views/reveal.ejs) -- the
    // effects, the fit, and this.
    window.slideBands = draw;
  }

  // "ready" is reveal's own, and the first moment getConfig() and the
  // stage's size answer. Caught on the document, where it bubbles to --
  // before initialize() there is no reveal element to listen on (the same
  // handshake js/slide-fit.js makes).
  if (window.Reveal && Reveal.isReady && Reveal.isReady()) start();
  else document.addEventListener("ready", start);
})();
