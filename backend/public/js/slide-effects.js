// Animated slide backgrounds, the part that cannot be done in CSS alone.
//
// reveal.js builds a background element of its own for every slide, and
// THAT is the surface such an effect belongs on: it spans the whole slide
// (a <section> is only as tall as its text), it sits behind everything, it
// follows the slide transitions, and it is what reveal moves onto the page
// when printing. But reveal copies only its own data-background-* over
// there -- ours has to be carried across by hand, which is all this does.
(function () {
  // Every effect gets the same carrier; what goes inside is its own affair,
  // which is what the table at the bottom says. What it LOOKS like is the
  // stylesheet's business throughout -- nothing here paints.
  function buildCarrier() {
    var carrier = document.createElement("div");
    carrier.className = "slide-effect";
    return carrier;
  }

  // Three layers: the same shape at three speeds, and the offset between
  // them is what keeps the movement from reading as one turning disc.
  // ::before and ::after would give two -- hence real elements.
  function threeLayers(carrier) {
    for (var i = 0; i < 3; i++) carrier.appendChild(document.createElement("span"));
  }

  // --- Star fields ------------------------------------------------------
  // A few hundred dots per layer, drawn as box-shadows on a single pixel --
  // the trick the effect is built on, and the reason it cannot live in the
  // stylesheet alone: the positions have to be drawn from somewhere. The
  // pen this comes from has its SCSS compiler roll them; without a build
  // step that job lands here.
  //
  // Seeded rather than Math.random, so the same slide shows the same sky in
  // the editor, on the wall and in the handout -- a star that wanders
  // between preview and presentation would be a bug nobody can reproduce.
  var STARS_HEIGHT = 2000;     // how far a field travels before it repeats
  var STARS_PER_LAYER = [700, 200, 100];
  var STARS_SEED = 20260926;

  function rng(seed) {
    var z = seed >>> 0;
    return function () {
      z = (z * 1664525 + 1013904223) >>> 0;
      return z / 4294967296;
    };
  }

  function scatterStars(carrier, width) {
    threeLayers(carrier);
    carrier.style.setProperty("--stars-height", STARS_HEIGHT + "px");
    var random = rng(STARS_SEED);
    for (var i = 0; i < carrier.children.length; i++) {
      // The pen scatters its stars over 2000px. A wider screen gets more of
      // them rather than a bare right-hand edge: it is the density that
      // makes a sky, not the number.
      var wie_viele = Math.max(1, Math.round(STARS_PER_LAYER[i] * width / STARS_HEIGHT));
      var dots = [];
      for (var k = 0; k < wie_viele; k++) {
        dots.push(Math.round(random() * width) + "px " + Math.round(random() * STARS_HEIGHT) + "px #fff");
      }
      carrier.children[i].style.setProperty("--stars-field", dots.join(","));
    }
  }

  // --- Blobs --------------------------------------------------------------
  // Four shapes turning about two points, as drawn in the pen this comes
  // from -- its path data, its colours, its class names. Inline and not a
  // background image: an SVG used as a background does not animate. Which
  // shape turns how fast, and around what, is in the stylesheet with
  // everything else.
  var BLOBS_SVG = [
    '<svg preserveAspectRatio="xMidYMid slice" viewBox="10 10 80 80">',
    '<path fill="#9b5de5" class="out-top" d="M37-5C25.1-14.7,5.7-19.1-9.2-10-28.5,1.8-32.7,31.1-19.8,49c15.5,21.5,52.6,22,67.2,2.3C59.4,35,53.7,8.5,37-5Z"/>',
    '<path fill="#f15bb5" class="in-top" d="M20.6,4.1C11.6,1.5-1.9,2.5-8,11.2-16.3,23.1-8.2,45.6,7.4,50S42.1,38.9,41,24.5C40.2,14.1,29.4,6.6,20.6,4.1Z"/>',
    '<path fill="#00bbf9" class="out-bottom" d="M105.9,48.6c-12.4-8.2-29.3-4.8-39.4.8-23.4,12.8-37.7,51.9-19.1,74.1s63.9,15.3,76-5.6c7.6-13.3,1.8-31.1-2.3-43.8C117.6,63.3,114.7,54.3,105.9,48.6Z"/>',
    '<path fill="#00f5d4" class="in-bottom" d="M102,67.1c-9.6-6.1-22-3.1-29.5,2-15.4,10.7-19.6,37.5-7.6,47.8s35.9,3.9,44.5-12.5C115.5,92.6,113.9,74.6,102,67.1Z"/>',
    '</svg>',
  ].join("");

  function drawBlobs(carrier) {
    carrier.innerHTML = BLOBS_SVG;
  }

  // What each effect is made of.
  var PREPARE = {
    waves: threeLayers,
    starfield: scatterStars,
    blobs: drawBlobs,
  };

  function transfer() {
    var backgrounds = document.querySelectorAll(".reveal .slide-background");
    for (var i = 0; i < backgrounds.length; i++) {
      backgrounds[i].removeAttribute("data-background-effect");
      var alt = backgrounds[i].querySelector(":scope > .slide-effect");
      if (alt) alt.remove();
    }
    var slides = document.querySelectorAll(".reveal .slides section[data-background-effect]");
    for (var j = 0; j < slides.length; j++) {
      var slide = slides[j];
      var background = slide.slideBackgroundElement;
      if (!background) continue;
      var name = slide.getAttribute("data-background-effect");
      background.setAttribute("data-background-effect", name);
      var carrier = buildCarrier();
      background.appendChild(carrier);
      // An effect nobody knows here quiet gets its carrier and its name on
      // the element: whatever the stylesheet can do with that alone, it
      // does.
      if (PREPARE[name]) PREPARE[name](carrier, background.clientWidth || STARS_HEIGHT);
    }
  }

  // Before initialize() there is no reveal element to hang a listener on,
  // so the events are caught where they bubble to instead. Reveal.sync()
  // rebuilds the background elements without an event of its own -- the
  // editor's preview calls this function itself after one, which is why it
  // has a name on window (views/reveal.ejs).
  document.addEventListener("ready", transfer);
  document.addEventListener("slidechanged", transfer);
  window.slideEffects = transfer;
})();
