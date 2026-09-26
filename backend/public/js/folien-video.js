// Starting the video by itself, a moment after the slide appears.
//
// Not through the address (autoplay=1 in the URL): that starts the player
// the instant it loads, in the middle of the slide transition. A second
// later is calmer, and it is also the moment at which the player is
// actually ready to be told anything.
//
// The command is YouTube's own postMessage API, which is why the address
// carries enablejsapi=1 (see video.js). reveal.js can do this too, but only
// for youtube.com -- our player comes from youtube-nocookie.com, which its
// check does not recognise, and it offers no delay.
//
// Every visit starts at the beginning: reveal takes the src away when the
// talk moves on, which tears the player down, and builds it again on the
// way back.
(function () {
  var VERZOEGERUNG = 1000;
  var NACHFASSEN = 1200;   // in case the player was still loading
  var uhr = null;

  // Not while editing: a video that starts talking every time one clicks a
  // slide in the editor would be unbearable. And not on paper, where the
  // player is hidden and nobody would hear it anyway.
  function stumm() {
    return document.body.classList.contains("ist-vorschau") ||
      document.documentElement.classList.contains("print-pdf");
  }

  function spielen(rahmen) {
    if (!rahmen.contentWindow) return;
    try {
      rahmen.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', "*");
    } catch (e) { /* not ready yet -- that is what the second knock is for */ }
  }

  function starten() {
    clearTimeout(uhr);
    if (stumm() || !window.Reveal || !Reveal.getCurrentSlide) return;
    var folie = Reveal.getCurrentSlide();
    var rahmen = folie && folie.querySelector(".folie-video iframe");
    if (!rahmen) return;
    uhr = setTimeout(function () {
      spielen(rahmen);
      uhr = setTimeout(function () { spielen(rahmen); }, NACHFASSEN);
    }, VERZOEGERUNG);
  }

  // Caught where they bubble to: before initialize() there is no reveal
  // element to hang a listener on.
  document.addEventListener("ready", starten);
  document.addEventListener("slidechanged", starten);
})();
