// Driving the preview. Two paths, deliberately kept apart:
//
//   slideZeichnen()  - while typing. Fetches ONLY the one slide as HTML and
//                      has the iframe swap it in. The frame stays put,
//                      nothing flickers, the slide is live as you write.
//   newLoad()       - when the structure changes (a slide added, deleted,
//                      moved, a different look). The iframe has to be
//                      rebuilt anyway, and the state must be saved first
//                      because the preview reads from the file.
//
// The handshake is deliberately a repeated knock rather than a single
// shout: the iframe can be finished before this module has even loaded (it
// sits behind several rounds of imports). Its "bereit" would then have gone
// unheard and the preview would stay mute for the rest of the session.
import { schreibHead } from "./base.js";

export function createPreview(iframe, base) {
  var bereit = false;
  var queue = []; // messages that arrived before "bereit"
  var klopfen = null;

  function sende(nachricht) {
    if (!bereit) { schedule(nachricht); return; }
    iframe.contentWindow.postMessage(nachricht, "*");
  }

  // Of each kind only the last message counts -- someone who switches
  // slides three times while the frame loads wants to see the third.
  function schedule(nachricht) {
    queue = queue.filter(function (n) {
      return n.kind !== nachricht.kind || n.index !== nachricht.index;
    });
    queue.push(nachricht);
  }

  function anklopfen() {
    if (bereit) return;
    try { iframe.contentWindow.postMessage({ kind: "hallo" }, "*"); } catch (e) { /* quiet loading */ }
  }

  // Only the first time is there any knocking: that is when the frame can
  // be ready before this listener exists. Before a reload there must be
  // none -- the old document, about to disappear, would answer, and the
  // queued messages would come to nothing.
  function ersteBegruessung() {
    klopfen = setInterval(anklopfen, 150);
    anklopfen();
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== iframe.contentWindow) return;
    if (ev.data && ev.data.kind === "bereit") {
      bereit = true;
      clearInterval(klopfen);
      var open = queue;
      queue = [];
      open.forEach(sende);
    }
  });

  ersteBegruessung();

  return {
    showSlide: function (index) {
      sende({ kind: "gehezu", index: index });
    },
    slideZeichnen: function (index, slide) {
      return fetch(base + "/slide.html", {
        method: "POST",
        headers: schreibHead({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slide: slide }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { sende({ kind: "slide", index: index, html: d.html }); });
    },
    newLoad: function (index) {
      bereit = false;
      clearInterval(klopfen);
      if (index != null) schedule({ kind: "gehezu", index: index });
      iframe.src = base + "/preview?t=" + Date.now();
    },
  };
}
