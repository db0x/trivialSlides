// The live channel between a talk that is running and a speaker view that
// is not in the browser running it.
//
// Until now the two were the same browser: reveal.js opens its speaker
// window itself and talks to it through window.opener, which is why that
// view cannot be a URL and cannot be an application. Here the talk says
// where it is and anyone listening hears it -- another window, another
// machine on the same network, or the GTK application in desktop/.
//
// Server-sent events and not a WebSocket: this is one-directional by
// nature (the talk speaks, the view listens), SSE is plain HTTP, it
// reconnects by itself, and it needs no dependency. A WebSocket would need
// all three of those the other way round.
//
// What is kept is one small object per deck and the list of listeners.
// Nothing is written to disk: where a talk stands is true for as long as
// it runs and worthless afterwards.
const KEEPALIVE_MS = 20000;

// A talk has a handful of listeners -- the presenter's own view, maybe a
// second screen. The cap is not a feature, it is the line past which
// somebody is pointing a script at this.
const MAX_LISTENERS = 8;

// Notes a slide may carry. Nothing produces them today (the deck format
// has none), but the pipe carries the field so that the day it does, no
// second one has to be dug. Capped because it goes out to every listener.
const MAX_NOTES = 20000;

const channels = new Map();

function channel(slug) {
  let found = channels.get(slug);
  if (!found) {
    found = { state: null, listeners: new Set() };
    channels.set(slug, found);
  }
  return found;
}

// What a talk is allowed to say about itself. Everything is rebuilt rather
// than passed through: what arrives here went through a browser, and what
// leaves here is read by a page and by an application.
function clean(raw) {
  const said = raw && typeof raw === "object" ? raw : {};
  const whole = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);
  return {
    index: whole(said.index),
    total: whole(said.total),
    notes: typeof said.notes === "string" ? said.notes.slice(0, MAX_NOTES) : "",
    // Where the slide stands within itself: a slide can hold back a part
    // until it is asked for, and the speaker view should not show the
    // whole of it as though it were already on the wall.
    fragment: whole(said.fragment),
    fragments: whole(said.fragments),
    // Set here and not by the sender: a clock the listener can trust.
    at: Date.now(),
  };
}

function line(state) {
  return "data: " + JSON.stringify(state) + "\n\n";
}

// The talk has moved. Everyone hears it, and whoever arrives later is told
// the same thing as their first word.
function publish(slug, raw) {
  const here = channel(slug);
  here.state = clean(raw);
  const text = line(here.state);
  here.listeners.forEach((res) => {
    try { res.write(text); } catch (e) { /* gone; the close handler clears it */ }
  });
  return here.state;
}

// One listener, for as long as its connection lives. Returns false when
// the cap above was reached, which the route answers with a 503 -- a
// refusal the listener can retry, not an error in what it asked for.
function subscribe(slug, req, res) {
  const here = channel(slug);
  if (here.listeners.size >= MAX_LISTENERS) return false;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // For a reverse proxy in front of this. nginx buffers a response by
    // default, and a buffered stream of events is no stream at all.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // How long to wait before trying again, said once. The browser's own
  // EventSource honours it; the application in desktop/ reads it too.
  res.write("retry: 2000\n\n");

  // Whoever joins mid-talk should see the slide that is on the wall, not
  // the next move.
  if (here.state) res.write(line(here.state));

  // A proxy or a laptop lid can drop a quiet connection. A comment line
  // is not an event: EventSource ignores it, and the connection lives.
  const beat = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch (e) { /* as above */ }
  }, KEEPALIVE_MS);

  here.listeners.add(res);

  const stop = () => {
    clearInterval(beat);
    here.listeners.delete(res);
    // Nobody listening and nothing said: the deck leaves no trace here.
    if (!here.listeners.size && !here.state) channels.delete(slug);
  };
  req.on("close", stop);
  req.on("error", stop);
  return true;
}

// For the tests, and for a deck that was renamed or deleted under us.
function forget(slug) {
  const here = channels.get(slug);
  if (!here) return;
  here.listeners.forEach((res) => { try { res.end(); } catch (e) { /* already gone */ } });
  channels.delete(slug);
}

function state(slug) {
  const here = channels.get(slug);
  return here ? here.state : null;
}

function listeners(slug) {
  const here = channels.get(slug);
  return here ? here.listeners.size : 0;
}

module.exports = { publish, subscribe, forget, state, listeners, MAX_LISTENERS };
