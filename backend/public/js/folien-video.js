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

  // --- where there can be no player ------------------------------------
  // A document opened from the file system has no origin, and YouTube
  // answers a player request without one with "player configuration error"
  // -- a black box with an error number in it where the video should be. No
  // parameter changes that: it is the referrer YouTube wants, and a file://
  // page sends none. Which hits precisely the export, the file that is meant
  // to be double-clicked.
  //
  // So there the player is taken out and what CAN be had is put in its
  // place: the still image, a play mark, and a click that opens the video on
  // youtube.com -- where it plays. The served pages have an origin and never
  // come through here.
  function kannPlayer() {
    return location.protocol !== "file:";
  }

  function ersatz() {
    [].forEach.call(document.querySelectorAll(".folie-video"), function (kasten) {
      var rahmen = kasten.querySelector("iframe");
      if (!rahmen) return;
      // The address is already on the slide, as the link below the player
      // (render.js). Taking it from there means this file builds no YouTube
      // URL of its own -- and if it is missing, the box stays as it is
      // rather than becoming a link to nowhere.
      var adresse = kasten.querySelector(".video-adresse");
      if (!adresse) return;
      rahmen.parentNode.removeChild(rahmen);
      kasten.classList.add("ohne-player");
      var knopf = document.createElement("a");
      knopf.className = "video-ersatz";
      knopf.href = adresse.href;
      knopf.target = "_blank";
      knopf.rel = "noopener";
      knopf.setAttribute("aria-label", adresse.textContent);
      var bild = kasten.getAttribute("data-bild");
      // Without a network the still image stays away too and the box is
      // black with the address in it -- which is what it looked like before.
      if (bild) knopf.style.backgroundImage = 'url("' + bild + '")';
      kasten.insertBefore(knopf, kasten.firstChild);
    });
  }

  // Caught where they bubble to: before initialize() there is no reveal
  // element to hang a listener on.
  if (kannPlayer()) {
    document.addEventListener("ready", starten);
    document.addEventListener("slidechanged", starten);
  } else {
    // Right away: this file is loaded below the slides, so they are there by
    // now -- and the box should not show an error for a moment first. Once
    // more when the document is finished, in case it is ever loaded from the
    // head instead; the second pass then finds nothing left to do.
    ersatz();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ersatz);
  }
})();
