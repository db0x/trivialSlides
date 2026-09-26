// Driving the preview. Two paths, deliberately kept apart:
//
//   folieZeichnen()  - while typing. Fetches ONLY the one slide as HTML and
//                      has the iframe swap it in. The frame stays put,
//                      nothing flickers, the slide is live as you write.
//   neuLaden()       - when the structure changes (a slide added, deleted,
//                      moved, a different look). The iframe has to be
//                      rebuilt anyway, and the state must be saved first
//                      because the preview reads from the file.
//
// The handshake is deliberately a repeated knock rather than a single
// shout: the iframe can be finished before this module has even loaded (it
// sits behind several rounds of imports). Its "bereit" would then have gone
// unheard and the preview would stay mute for the rest of the session.
import { schreibKopf } from "./base.js";

export function createVorschau(iframe, basis) {
  var bereit = false;
  var warteschlange = []; // messages that arrived before "bereit"
  var klopfen = null;

  function sende(nachricht) {
    if (!bereit) { vormerken(nachricht); return; }
    iframe.contentWindow.postMessage(nachricht, "*");
  }

  // Of each kind only the last message counts -- someone who switches
  // slides three times while the frame loads wants to see the third.
  function vormerken(nachricht) {
    warteschlange = warteschlange.filter(function (n) {
      return n.typ !== nachricht.typ || n.index !== nachricht.index;
    });
    warteschlange.push(nachricht);
  }

  function anklopfen() {
    if (bereit) return;
    try { iframe.contentWindow.postMessage({ typ: "hallo" }, "*"); } catch (e) { /* still loading */ }
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
    if (ev.data && ev.data.typ === "bereit") {
      bereit = true;
      clearInterval(klopfen);
      var offen = warteschlange;
      warteschlange = [];
      offen.forEach(sende);
    }
  });

  ersteBegruessung();

  return {
    zeigeFolie: function (index) {
      sende({ typ: "gehezu", index: index });
    },
    folieZeichnen: function (index, folie) {
      return fetch(basis + "/folie.html", {
        method: "POST",
        headers: schreibKopf({ "Content-Type": "application/json" }),
        body: JSON.stringify({ folie: folie }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { sende({ typ: "folie", index: index, html: d.html }); });
    },
    neuLaden: function (index) {
      bereit = false;
      clearInterval(klopfen);
      if (index != null) vormerken({ typ: "gehezu", index: index });
      iframe.src = basis + "/vorschau?t=" + Date.now();
    },
  };
}
