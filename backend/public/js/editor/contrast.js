// How well the writing on a slide stands out from what is behind it.
//
// Dark text on a dark ground is the commonest way to ruin a talk, and it
// is a mistake nobody makes on purpose: the two are chosen minutes apart,
// on the same panel, and nothing has ever put them side by side. This
// does, in one line under the sample (views/editor.ejs).
//
// The arithmetic is WCAG's own -- relative luminance, then
// (lighter + 0.05) / (darker + 0.05). The THRESHOLD is not WCAG's usual
// one: a slide is read from the back of a room at a size no web page uses,
// which is exactly the case the standard calls "large text" and allows
// 3:1 for. 4.5 is comfortable, 3 is the floor, under that it is a problem
// on the wall whatever it looks like on a 27-inch screen a foot away.
//
// What it will NOT do is guess. A colour that was never set follows the
// deck's theme -- but following the theme is not the same as being
// unknown: the theme's colours are declared in its stylesheet, and they
// are read off it and handed to this page with the rest (themes.js). So a
// slide that chooses nothing is judged like any other, in the colours it
// will actually wear.
//
// Two grounds stay genuinely unreadable, and those still get no verdict: a
// see-through colour, where what shows through is the stack underneath,
// and an effect, which is built of layers in slides.css rather than of a
// colour in this model. A verdict built on a guess is worse than no
// verdict -- it would be believed.

// #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(). Written out rather than
// handed to the browser, because the gradients arrive as a STRING of CSS
// and the colours have to be picked out of it one by one.
var HEX = /#([0-9a-f]{3,8})\b/gi;
var RGB = /rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*(?:[,/]\s*([\d.%]+)\s*)?\)/gi;

function fromHex(digits) {
  var d = digits.toLowerCase();
  if (d.length === 3 || d.length === 4) {
    d = d.split("").map(function (c) { return c + c; }).join("");
  }
  if (d.length !== 6 && d.length !== 8) return null;
  return {
    r: parseInt(d.slice(0, 2), 16),
    g: parseInt(d.slice(2, 4), 16),
    b: parseInt(d.slice(4, 6), 16),
    a: d.length === 8 ? parseInt(d.slice(6, 8), 16) / 255 : 1,
  };
}

// Every colour in a piece of CSS, in the order they stand. One colour for
// a plain value, several for a gradient -- and a gradient is judged by its
// WORST stop, because the writing crosses all of them.
export function colorsIn(css) {
  var text = String(css || "");
  var found = [];
  var hit;
  HEX.lastIndex = 0;
  while ((hit = HEX.exec(text))) {
    var c = fromHex(hit[1]);
    if (c) found.push(c);
  }
  RGB.lastIndex = 0;
  while ((hit = RGB.exec(text))) {
    var alpha = hit[4] === undefined ? 1
      : (String(hit[4]).indexOf("%") !== -1 ? parseFloat(hit[4]) / 100 : parseFloat(hit[4]));
    found.push({
      r: Number(hit[1]), g: Number(hit[2]), b: Number(hit[3]),
      a: isNaN(alpha) ? 1 : alpha,
    });
  }
  return found;
}

function luminance(c) {
  var channel = function (v) {
    var s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

// A see-through colour laid over one that is known. This is the sum the
// browser does when it paints the second over the first, and it is only
// allowed where what lies underneath is actually known -- an effect's own
// layers over an effect's own ground (effects.js). Everywhere else a
// see-through colour still stops the judgement, because there the stack
// underneath is the theme's business and nobody here has seen it.
function over(top, bottom) {
  if (top.a >= 1) return top;
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

export function ratio(one, two) {
  var a = luminance(one);
  var b = luminance(two);
  var light = Math.max(a, b);
  var dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

// Dark ground or light one? reveal.js asks this of every slide while the
// talk runs, to decide whether the theme's contrast rule applies
// (backgrounds.js, util.js colorBrightness), and render.js asks it again
// on the server so a standing thumbnail shows what the talk will. This is
// the third asking of the same question, in the same weighting -- the
// eye's, not the average of the three. All three are copies of reveal's
// rule rather than of each other, which is why the number may stand here
// as well as in render.js.
var DARK_BELOW = 128;

function brightness(c) {
  return (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
}

// The colour the writing will have where the slide names none: the
// theme's. WHICH of the theme's depends on the ground it stands on. A
// slide whose own background runs against the theme's own is marked for
// it (render.js, contrastClass) and the theme carries one rule for exactly
// that case -- white type on a dark slide in a light theme, and the other
// way round. Where the slide's ground agrees with the theme's, or where
// the slide names no ground at all, no such rule applies and the theme's
// ordinary colours stand.
//
// Only the background COLOUR decides it, not a gradient: that is the one
// value reveal.js reads for this, so a slide with nothing but a gradient
// keeps the theme's ordinary type (render.js says the same).
//
// Body and heading come back separately, because several themes colour
// them apart (serif, moon, dracula), and the verdict is the worse of the
// two. Exported because the sample above the
// line wears the same colours (index.js, lookShow) -- one rule for what
// the writing will be, so the picture and the sentence beside it cannot
// come to different conclusions.
export function themeText(theme, background) {
  var own = colorsIn(background)[0];
  if (own && theme.flip) {
    var side = brightness(own) < DARK_BELOW ? "dark" : "light";
    // The theme's contrast rule paints body and headings alike, so where
    // it applies there is only one colour to have.
    if (side === theme.flip.on) return { main: theme.flip.color, heading: theme.flip.color };
  }
  return { main: theme.main, heading: theme.heading };
}

// Every colour an effect can put under the writing: its own ground, and
// each of the large shapes that drift across it -- a half-transparent
// shape counted over each ground it can cross, since both are the
// effect's and both are known (effects.js).
//
// The animation is what makes this a LIST rather than a colour. A letter
// stands still while the layers move under it, so over the course of the
// talk it will have sat on all of them, and the one that matters is the
// worst. That is the same reason a gradient is judged by its worst stop,
// only here the slide does the moving.
function effectGround(effect) {
  var grounds = [];
  (effect.ground || []).forEach(function (one) {
    grounds = grounds.concat(colorsIn(one));
  });
  var all = grounds.slice();
  (effect.over || []).forEach(function (shape) {
    colorsIn(shape).forEach(function (c) {
      grounds.forEach(function (under) { all.push(over(c, under)); });
    });
  });
  return all;
}

// The verdict, as something the panel can show without knowing any of
// this. `state` is what to colour it: "good", "thin", "poor", or "unknown"
// where the question cannot honestly be answered. `value` is the ratio
// where there is one, so the caller can put the number in its own
// sentence.
//
// `look` is the slide as far as this cares: { text, background, gradient,
// effect }. `theme` is that deck's entry from the table the page was
// handed (themes.js), `effect` that effect's colours (effects.js) -- each
// of them nothing where it could not be read.
//
// `via` names whose doing the number is where it is not the author's:
// "effect", "theme", or nothing. It is worth saying out loud, because a
// number that rests on either will change when that does.
//
// `see` is why it could not be answered, so the panel says the right
// sentence rather than a shrug:
//   "effect" the ground is an effect whose colours did not arrive
//   "alpha"  a colour here is see-through, and what shows through it is
//            the stack underneath, which this does not know either
//   "text" / "ground" nobody gave that side a colour AND the theme could
//            not be read -- the old answer, now the rare one
export function judge(look, theme, effect) {
  var want = look || {};
  var ground = colorsIn(want.background).concat(colorsIn(want.gradient));
  var via = null;

  // An effect covers whatever the slide chose and lays its own ground
  // (slides.css). So where there is one it is not one ground among
  // several -- it is THE ground, and the colour under it is a colour
  // nobody will ever see. Judging the writing against that would be a
  // number about a slide that is not the one on the wall.
  if (want.effect) {
    if (!effect) return { state: "unknown", see: "effect" };
    ground = effectGround(effect);
    via = "effect";
  }

  var text = colorsIn(want.text);

  if (!text.length) {
    if (!theme) return { state: "unknown", see: "text" };
    // Which of the theme's colours still turns on the slide's OWN
    // background: reveal.js decides that from the colour attribute, which
    // an effect does not touch (render.js).
    var wears = themeText(theme, want.background);
    text = colorsIn(wears.main).concat(colorsIn(wears.heading));
    via = via || "theme";
  }
  if (!ground.length) {
    if (!theme) return { state: "unknown", see: "ground" };
    ground = colorsIn(theme.background);
    via = via || "theme";
  }
  if (!text.length || !ground.length) {
    return { state: "unknown", see: text.length ? "ground" : "text" };
  }

  // See-through anywhere and the real ground is whatever lies under the
  // slide. Rather than compositing against a stack nobody has named,
  // this stops.
  var clear = function (c) { return c.a < 1; };
  if (text.some(clear) || ground.some(clear)) {
    return { state: "unknown", see: "alpha" };
  }

  var worst = Infinity;
  text.forEach(function (one) {
    ground.forEach(function (c) { worst = Math.min(worst, ratio(one, c)); });
  });

  // One decimal: the second would be noise in a judgement whose thresholds
  // are whole numbers. Rounded BEFORE the verdict, so that the two cannot
  // contradict each other -- 2.97 shown as "3:1" and called too little is
  // a line that argues with itself in front of the reader.
  var value = Math.round(worst * 10) / 10;

  return {
    state: value >= 4.5 ? "good" : (value >= 3 ? "thin" : "poor"),
    value: value,
    via: via,
  };
}
