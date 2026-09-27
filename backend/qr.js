// QR codes on a slide: the address is turned into a code here, on the
// server, and travels as finished markup.
//
// Generated rather than fetched from one of the public QR services: a
// service would put the address of every deck through somebody else's log,
// and it would break the one promise the exported file makes -- that it
// works without a network. A code drawn into the slide keeps working on a
// train.
//
// qrcode-generator does the encoding. It is the one thing here worth a
// dependency: the format is Reed-Solomon plus a mask chosen by penalty
// score, which is a week of work to get subtly wrong.
const qrcode = require("qrcode-generator");

// Long enough for any address anybody puts on a slide, short enough that
// the code stays scannable from the back of a room -- past roughly this a
// QR needs so many modules that a projector can no longer resolve them.
const MAX_LENGTH = 300;

// http and https only. The code is scanned by a stranger's phone, and
// javascript:, data: or file: in a slide deck has no honest use -- the
// address is also shown as text below the code, where it has to be a link
// somebody can follow safely.
const SCHEME = /^https?:\/\/[^\s<>"']+$/i;

function isUrl(value) {
  const s = String(value == null ? "" : value).trim();
  return s.length <= MAX_LENGTH && SCHEME.test(s);
}

// Anything to a usable address, or "" -- the same shape as video.toId:
// the editor may pass on whatever was typed and gets back either something
// storable or nothing.
function toUrl(value) {
  const s = String(value == null ? "" : value).trim();
  if (isUrl(s)) return s;
  // A bare "example.com/x" is what people paste; https is the only sensible
  // reading of it and the only one worth encoding into a code.
  if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s) && isUrl("https://" + s)) return "https://" + s;
  return "";
}

// Error correction level M: recovers a quarter of the code. A slide is not
// a sticker on a crate -- nothing is going to scratch it -- but a hand or a
// reflection can cover a corner, and M costs only a few modules over L.
const LEVEL = "M";

// The quiet zone the specification asks for. Drawn into the picture rather
// than left to the stylesheet, so the code stays scannable whatever the
// slide does around it.
const QUIET = 4;

// --- Colours ------------------------------------------------------------
// Black on white is what a scanner expects and what every phone reads
// fastest, so that is what a code gets unless somebody says otherwise.
// Those two are therefore the defaults, and a slide that keeps them says
// nothing about them in the file.
const COLOR_DEFAULT = "#000000";
const BACKGROUND_DEFAULT = "#ffffff";

// "transparent" is a value of its own and not simply "no colour": the file
// has to be able to tell "nobody chose" (white) from "chosen to be see-
// through", and an absent attribute already means the first.
const TRANSPARENT = "transparent";

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

function onlyColor(value) {
  const s = String(value == null ? "" : value).trim();
  return HEX.test(s) ? s : COLOR_DEFAULT;
}

// undefined means "not set" and gives white; "" is what the editor's colour
// field sends when somebody clears it, and that is the see-through one. A
// slide switched to this layout has no value at all yet, which is why the
// two cannot be the same thing.
function onlyBackground(value) {
  if (value === undefined || value === null) return BACKGROUND_DEFAULT;
  const s = String(value).trim();
  if (s === TRANSPARENT || s === "") return "";
  return HEX.test(s) ? s : BACKGROUND_DEFAULT;
}

// The writing under the code follows the slide unless it is given a colour
// of its own -- "" means "whatever the slide's text is", which is what a
// caption should do.
function onlyTextColor(value) {
  const s = String(value == null ? "" : value).trim();
  return HEX.test(s) ? s : "";
}

// One <path> and not a <rect> per module. A code of this size is several
// hundred modules, every one of them would be its own element, and the
// exported file carries the finished markup of every slide -- the path
// costs about a tenth of that.
//
// No width or height on the <svg>: the box in the slide decides how big
// the code is (slides.css), the viewBox decides what is drawn.
function svg(url, color, background) {
  const vorn = onlyColor(color);
  const hinten = onlyBackground(background);
  const code = qrcode(0, LEVEL);   // 0 = pick the smallest version that fits
  code.addData(String(url));
  code.make();
  const n = code.getModuleCount();
  const edge = n + QUIET * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (code.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }
  }
  // No rectangle at all rather than fill="transparent": what is not drawn
  // cannot be printed either, and the quiet zone around the code is then
  // whatever the slide is -- which is the point of asking for it.
  const flaeche = hinten
    ? `<rect width="${edge}" height="${edge}" fill="${escAttr(hinten)}"/>`
    : "";
  return `<svg class="qr-code" viewBox="0 0 ${edge} ${edge}" role="img" aria-label="${escAttr(url)}">` +
    flaeche + `<path d="${d}" fill="${escAttr(vorn)}"/></svg>`;
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = { MAX_LENGTH, isUrl, toUrl, svg,
  COLOR_DEFAULT, BACKGROUND_DEFAULT, TRANSPARENT,
  onlyColor, onlyBackground, onlyTextColor };
