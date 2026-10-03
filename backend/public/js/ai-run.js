// One request to /compose, read as it arrives.
//
// Shared, because by now two pages ask for a deck to be written and they
// ask in the same way: the overview, where a deck is BUILT from material
// (js/overview-ai.js), and the editor, where one is CHANGED by instruction
// (js/editor/ai.js). What differs between them is what they collect
// beforehand and what they do with the answer -- not the half minute in
// between, which is this file.
//
// The answer is newline-delimited JSON, one object per line
// (routes/decks.js):
//
//   {"text": "..."}      a piece of the file, as it is written
//   {"round": 1}         the check found faults; the model starts over
//   {"done": true, ...}  the whole file, and what is left wrong with it
//   {"error": "..."}     one sentence, already in the user's language
//
// A chunk off the network may hold half a line and a line may span two
// chunks, so the remainder is carried over -- the same bookkeeping the
// server does on the way in (backend/ai.js).
import { schreibHead } from "./editor/base.js";

// --- Handing a suggestion across a page load ----------------------------
// The overview builds a deck and then leaves for the editor, and a file
// the check still has something to say about must not be lost on the way:
// it is put down here and picked up over there, where the source dialog
// can show it with its findings beside it.
//
// sessionStorage and not the address bar: a whole deck does not belong in
// a URL, and this is meant for exactly one tab making exactly one journey.
// Keyed by the deck, so a suggestion can never surface in a different one.
var HANDOVER = "trivialslides:composed:";

export function keepComposed(slug, text) {
  try { sessionStorage.setItem(HANDOVER + slug, text); } catch (e) { /* storage blocked */ }
}

// Read AND removed: a suggestion is handed over once. Reloading the editor
// afterwards must show the deck, not the suggestion again.
export function takeComposed(slug) {
  try {
    var text = sessionStorage.getItem(HANDOVER + slug);
    sessionStorage.removeItem(HANDOVER + slug);
    return text || "";
  } catch (e) { return ""; }
}

// parts: url, body, signal, onText, onRound. Resolves with the done frame,
// or null where the stream ended without one.
export function runCompose(parts) {
  return fetch(parts.url, {
    method: "POST",
    signal: parts.signal,
    headers: schreibHead({ "Content-Type": "application/json" }),
    body: JSON.stringify(parts.body),
  }).then(function (answer) {
    // A refusal before the first token -- a job already running for this
    // deck, the hour's ceiling -- comes back as plain JSON with a status,
    // not as a stream.
    if (!answer.ok) {
      return answer.json().catch(function () { return {}; }).then(function (body) {
        throw new Error(body.error || "");
      });
    }
    return read(answer, parts);
  });
}

function read(answer, parts) {
  var reader = answer.body.getReader();
  var decode = new TextDecoder();
  var rest = "";
  var done = null;

  function take(event) {
    if (event.done) { done = event; return; }
    if (event.text !== undefined && parts.onText) return parts.onText(event.text);
    if (event.round && parts.onRound) return parts.onRound(event.round);
    // An error inside the stream: the request itself succeeded and went
    // wrong afterwards, which reads the same to whoever called.
    if (event.error) throw new Error(event.error);
  }

  function step() {
    return reader.read().then(function (piece) {
      if (piece.done) {
        if (rest.trim()) take(JSON.parse(rest));
        return done;
      }
      rest += decode.decode(piece.value, { stream: true });
      var lines = rest.split("\n");
      rest = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        take(JSON.parse(lines[i]));
      }
      return step();
    });
  }
  return step();
}
