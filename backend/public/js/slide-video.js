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
  var DELAY = 1000;
  var RETRY = 1200;   // in case the player was quiet loading
  var timer = null;

  // Not while editing: a video that starts talking every time one clicks a
  // slide in the editor would be unbearable. And not on paper, where the
  // player is hidden and nobody would hear it anyway.
  function silent() {
    return document.body.classList.contains("is-preview") ||
      document.documentElement.classList.contains("print-pdf");
  }

  function play(frame) {
    if (!frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', "*");
    } catch (e) { /* not ready yet -- that is what the second knock is for */ }
  }

  function start() {
    clearTimeout(timer);
    if (silent() || !window.Reveal || !Reveal.getCurrentSlide) return;
    var slide = Reveal.getCurrentSlide();
    var frame = slide && slide.querySelector(".slide-video iframe");
    if (!frame) return;
    timer = setTimeout(function () {
      play(frame);
      timer = setTimeout(function () { play(frame); }, RETRY);
    }, DELAY);
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
  // place: the quiet image, a play mark, and a click that opens the video on
  // youtube.com -- where it plays. The served pages have an origin and never
  // come through here.
  //
  // A thumbnail in the editor's slide list is the other place with no
  // player: it is a still picture of a slide, a dozen of them side by side
  // (views/thumb.ejs), and a dozen players started to fill a sidebar would
  // be the one thing that made the list cost more than the editor. It gets
  // the same treatment, which is also the better picture -- a video's own
  // still says what is on the slide, an empty player says nothing.
  function canPlay() {
    return location.protocol !== "file:"
      && !document.body.classList.contains("is-thumb");
  }

  function stateIn() {
    [].forEach.call(document.querySelectorAll(".slide-video"), function (box) {
      var frame = box.querySelector("iframe");
      if (!frame) return;
      // The address is already on the slide, as the link below the player
      // (render.js). Taking it from there means this file builds no YouTube
      // URL of its own -- and if it is missing, the box stays as it is
      // rather than becoming a link to nowhere.
      var address = box.querySelector(".video-address");
      if (!address) return;
      frame.parentNode.removeChild(frame);
      box.classList.add("without-player");
      var button = document.createElement("a");
      button.className = "video-standin";
      button.href = address.href;
      button.target = "_blank";
      button.rel = "noopener";
      button.setAttribute("aria-label", address.textContent);
      var image = box.getAttribute("data-image");
      // Without a network the quiet image stays away too and the box is
      // black with the address in it -- which is what it looked like before.
      if (image) button.style.backgroundImage = 'url("' + image + '")';
      box.insertBefore(button, box.firstChild);
    });
  }

  // Caught where they bubble to: before initialize() there is no reveal
  // element to hang a listener on.
  if (canPlay()) {
    document.addEventListener("ready", start);
    document.addEventListener("slidechanged", start);
  } else {
    // Right away: this file is loaded below the slides, so they are there by
    // now -- and the box should not show an error for a moment first. Once
    // more when the document is finished, in case it is ever loaded from the
    // head instead; the second pass then finds nothing left to do.
    stateIn();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", stateIn);
  }
})();
