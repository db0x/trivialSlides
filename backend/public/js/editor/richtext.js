import { t } from "./base.js";

// The piece that hides the Markdown syntax from the user: marrying a
// contenteditable field to Markdown in both directions.
//
// Deliberately ONLY a small subset -- paragraph, bold, italic, list, link,
// fragment. Those are the things there are buttons for. Anything beyond
// that the field cannot convert back without loss, so isSimple() spots
// such slides and the editor shows them as source instead (see index.js).
// Better an honest fallback than a field that silently eats the user's
// content.

// reveal.js' syntax for "this element gets these classes". A line of its
// own after the element it refers to, and the ONE line of raw HTML this
// field puts into the .md -- render.js reads it back and puts the classes
// on that element, nothing else about it survives.
//
// Two things ride on it, and they ride together: "reveal on click" and the
// alignment of a block. A centred bullet that appears on click is one
// comment with two classes.
var ALIGNS = ["left", "center", "right", "fill"];
var ALIGN_CLASSES = ALIGNS.map(function (a) { return "align-" + a; });
var MARKER_CLASSES = ["fragment"].concat(ALIGN_CLASSES);

function elementLine(classes) {
  return '<!-- .element: class="' + classes.join(" ") + '" -->';
}

var FRAGMENT = elementLine(["fragment"]);

// The number behind the classes is reveal.js' own data-fragment-index:
// blocks carrying the SAME one arrive on the same click. It is the only
// way to show two items of ONE list together -- a list cannot be cut in
// half by a container, and two lists are no longer one list.
var ELEMENT_LINE = /^<!--\s*\.element:\s*class="([A-Za-z0-9 _-]+)"(?:\s+data-fragment-index="(\d{1,3})")?\s*-->$/;

function elementLineWith(classes, index) {
  return '<!-- .element: class="' + classes.join(" ") + '"'
    + (index == null || index === "" ? "" : ' data-fragment-index="' + index + '"') + " -->";
}

// A GROUP of blocks that appears on one click (render.js holds the other
// end of this pair). In the field it is a real <div> with the classes the
// file gave it, so the blocks inside stay ordinary blocks one can type in
// -- which is the whole reason this field knows about groups at all: a
// slide with one used to go to source mode, and then a heading and a code
// block cost the user the entire field.
//
// The class is kept WORD FOR WORD in a data attribute and written back
// unchanged. The field itself only ever makes "fragment", but a file may
// say "fragment fade-up" or anything else reveal.js knows, and a class
// this field does not recognise must still survive a round trip -- losing
// something is exactly what source mode is there to prevent.
var GROUP_OPEN_RE = /^<!--\s*\.group:\s*class="([A-Za-z0-9 _-]+)"\s*-->$/;
var GROUP_CLOSE_RE = /^<!--\s*\/\.group\s*-->$/;
var GROUP_CLASS = "slide-group";

function groupOpenLine(classes) {
  return '<!-- .group: class="' + classes + '" -->';
}

var GROUP_CLOSE_LINE = "<!-- /.group -->";

// The classes of such a line -- or null if the line is not one, or carries
// a class this field could not put back. A class it does not know would be
// lost on the way out, and losing something is exactly what source mode is
// there to prevent (isSimple).
function markerClasses(line) {
  var t = ELEMENT_LINE.exec(String(line).trim());
  if (!t) return null;
  var classes = t[1].trim().split(/\s+/);
  var known = classes.every(function (c) { return MARKER_CLASSES.indexOf(c) !== -1; });
  if (!known) return null;
  // The number rides along on the list rather than in a second return
  // value: every caller but one wants the classes alone.
  classes.index = t[2] === undefined ? null : t[2];
  return classes;
}

// Markdown the buttons cannot express. Anyone who has such a thing in
// their file should be allowed to keep it.
//
// A fenced code block is NOT such a thing, although it is nothing the
// buttons could write letter by letter: the field shows it as a sealed
// object with its own dialog (see below), and it travels back into the .md
// exactly as it came. Everything between the fences is skipped here --
// inside a code block a hash or a backtick is code, not Markdown.
// --- Text in a colour of its own ---------------------------------------
// The one piece of formatting with no Markdown of its own. The file says
// it in reveal.js' own currency -- inline HTML -- so any other renderer
// shows it the same way, and our own renderer lets exactly this shape
// through and nothing else (render.js holds the other end of this pair,
// COLOR_OPEN_RE; what the one writes the other has to read back).
//
// Twice here, because the text passes through this file in two states: raw
// on the way in from the file, and escaped once inlineZuHtml has been at
// it.
var FARBE_ROH = /<span style="color:(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)">/g;
var FARBE_AUF = /&lt;span style="color:(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)"&gt;/g;
var FARBE_ZU = /&lt;\/span&gt;/g;

// The colour an element carries, as the file writes it -- or "" for an
// element that carries none of ours. The browser writes rgb() after
// execCommand and "currentcolor" after it has been cleared again; only a
// real colour becomes a span in the file, which is what makes clearing
// work without anything having to be unwrapped by hand.
function farbeVon(el) {
  var raw = String((el.style && el.style.color)
    || (el.tagName.toLowerCase() === "font" && el.getAttribute("color")) || "").trim();
  var hex = /^#([0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)$/.exec(raw);
  if (hex) return "#" + hex[1].toLowerCase();
  var rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(raw);
  if (!rgb) return "";
  var zwei = function (n) { return ("0" + Math.round(n).toString(16)).slice(-2); };
  var out = "#" + zwei(rgb[1]) + zwei(rgb[2]) + zwei(rgb[3]);
  var a = rgb[4] === undefined ? 1 : parseFloat(rgb[4]);
  return a >= 1 ? out : out + zwei(a * 255);
}

function isSimple(md) {
  var text = String(md || "");
  if (!text.trim()) return true;
  var lines = text.split("\n");
  var imCode = false;
  var group = 0;
  for (var i = 0; i < lines.length; i++) {
    var z = lines[i];
    if (ZAUN.test(z)) { imCode = !imCode; continue; }
    if (imCode) continue;
    if (z.trim() === "" || markerClasses(z)) continue;
    if (GROUP_OPEN_RE.test(z.trim())) { group++; continue; }
    // A closing line with nothing open is a typo the field cannot show --
    // it would simply vanish on the way back, so the slide keeps its
    // source. The same for a group nobody closed, checked at the end.
    if (GROUP_CLOSE_RE.test(z.trim())) { if (!group) return false; group--; continue; }
    if (/^\s{0,3}(#{1,6}\s|>|~~~|\||!\[)/.test(z)) return false; // heading, quote, code, table, image
    // Raw HTML, other than the fragment line above and the colour spans
    // this field writes itself. Those are taken out of the line first --
    // what is left has to be free of tags, so a <div> or a <span> of any
    // other shape still sends the slide to source mode.
    if (/<[a-z!/]/i.test(z.replace(FARBE_ROH, "").replace(/<\/span>/g, ""))) return false;
    // Inline code. The field cannot show it, and on the way back the
    // backticks would be escaped into literal characters -- turning
    // `code` into visible backticks. Source mode keeps it intact.
    if (/`/.test(z)) return false;
    if (/^\s{4,}\S/.test(z)) return false;   // indented code block
    if (/^\s*([-*_])\s*\1\s*\1/.test(z)) return false; // horizontal rule
  }
  // A fence that was opened and never closed is not a code block but a
  // typo, and the field would swallow the rest of the slide into it. The
  // same goes for a group: the renderer closes it at the end of the slide,
  // the field would close it where the text does -- so the two would not
  // agree, and source mode is the honest answer.
  return !imCode && !group;
}

// --- Code blocks -------------------------------------------------------
// The one thing in the field that is not text with formatting but an
// OBJECT. It is shown sealed -- contenteditable="false", so the browser
// treats it as a single indivisible thing that can be selected and deleted
// but not typed into -- and it is edited through the dialog that made it.
// That way the code cannot be damaged by the rich-text field, and the fence
// goes back into the .md exactly as it came.
var ZAUN = /^\s*```/;

function codeInfoLesen(info) {
  var parts = String(info || "").trim().split(/\s+/).filter(Boolean);
  var language = parts.length && parts[0].indexOf("=") === -1 ? parts[0] : "";
  var style = "";
  parts.forEach(function (teil) {
    var hit = /^hl=([a-z0-9-]+)$/.exec(teil);
    if (hit) style = hit[1];
  });
  return { language: language, style: style };
}

// The label says what the block is, because the field shows no syntax and
// the colours only appear in the preview.
function codeBlockHtml(language, style, sourceText, fragment) {
  var brand = [language || t("code.noLanguage"), style].filter(Boolean).join(" \u00b7 ");
  return '<div class="code-block' + (fragment ? " fragment" : "") + '" contenteditable="false"' +
    ' data-language="' + escHtml(language) + '" data-style="' + escHtml(style) + '"' +
    ' data-tip="' + escHtml(t("code.click")) + '">' +
    '<span class="code-mark">' + escHtml(brand) + "</span>" +
    // A sealed block cannot be deleted with the keyboard the way a
    // paragraph can -- the caret has no place inside it to delete from. So
    // it carries its own way out.
    '<button type="button" class="code-remove" tabindex="-1"' +
    ' data-tip="' + escHtml(t("code.remove")) + '"' +
    ' aria-label="' + escHtml(t("code.remove")) + '">\u00d7</button>' +
    "<pre>" + escHtml(sourceText) + "</pre></div>";
}

function codeBlockZuMd(el) {
  var pre = el.querySelector("pre");
  var language = el.dataset.language || "";
  var style = el.dataset.style || "";
  var info = language + (style ? (language ? " " : "") + "hl=" + style : "");
  return "```" + info + "\n" + (pre ? pre.textContent : "") + "\n```";
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Markdown -> HTML --------------------------------------------------
function inlineZuHtml(text) {
  var s = escHtml(text);
  // The colour spans back into elements. Counted, and no more closing tags
  // let back than there were opening ones -- a lone </span> in a file is
  // text, not markup, and turning it into a tag would tear the field's own
  // structure. The same counting the renderer does (render.js).
  var offen = 0;
  s = s.replace(FARBE_AUF, function (_, hex) {
    offen++;
    return '<span style="color:' + hex + '">';
  });
  if (offen) {
    s = s.replace(FARBE_ZU, function (whole) {
      if (offen <= 0) return whole;
      offen--;
      return "</span>";
    });
  }
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, url) {
    return '<a href="' + url.replace(/"/g, "%22") + '">' + t + "</a>";
  });
  s = s.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

function mdToHtml(md) {
  var lines = String(md || "").split("\n");
  var out = [];
  var list = null;    // "ul" | "ol" | null
  var paragraph = [];

  function paragraphClose() {
    if (!paragraph.length) return;
    out.push("<p>" + paragraph.join("<br>") + "</p>");
    paragraph = [];
  }
  function listClose() {
    if (list) { out.push("</" + list + ">"); list = null; }
  }
  // The comment refers to the element written last -- so its classes are
  // attached to that one after the fact.
  function attachMarkers(classes, index) {
    var list = classes.join(" ");
    var nummer = index == null ? "" : ' data-fragment-index="' + index + '"';
    for (var i = out.length - 1; i >= 0; i--) {
      if (/^<div class="code-block/.test(out[i])) {
        out[i] = out[i].replace('class="code-block', 'class="code-block ' + list).replace(/>$/, nummer + ">");
        return;
      }
      // A group that has just closed: the comment belongs to the DIV, the
      // same way the server reads it (render.js walks back over the
      // closing tag, whatever tag that is).
      if (out[i] === "</div>") {
        var tief = 0;
        for (var g = i; g >= 0; g--) {
          if (out[g] === "</div>") tief++;
          else if (/^<div class="/.test(out[g]) && !/^<div class="code-block/.test(out[g])) {
            tief--;
            if (!tief) { out[g] = out[g].replace(/class="([^"]*)"/, 'class="$1 ' + list + '"').replace(/>$/, nummer + ">"); return; }
          }
        }
        return;
      }
      // A closed list right before the comment: then the comment belongs to
      // the LIST, not to its last item. That is the difference a blank line
      // makes in the .md, and it is the same difference marked makes of it
      // on the server (render.js walks back over the closing tag).
      var zu = /^<\/(ul|ol)>$/.exec(out[i]);
      if (zu) {
        for (var j = i - 1; j >= 0; j--) {
          if (out[j] === "<" + zu[1] + ">") {
            out[j] = "<" + zu[1] + ' class="' + list + '"' + nummer + ">";
            return;
          }
        }
        return;
      }
      var t = /^<(p|li)>/.exec(out[i]);
      if (t) { out[i] = "<" + t[1] + ' class="' + list + '"' + nummer + ">" + out[i].slice(t[0].length); return; }
    }
  }

  var imCode = false;
  var codeLines = [];
  var codeInfo = "";

  function codeClose() {
    out.push(codeBlockHtml(codeInfo.language, codeInfo.style, codeLines.join("\n"), false));
    imCode = false;
    codeLines = [];
  }

  lines.forEach(function (line) {
    if (imCode) {
      if (ZAUN.test(line)) codeClose();
      else codeLines.push(line);
      return;
    }
    if (ZAUN.test(line)) {
      paragraphClose();
      listClose();
      imCode = true;
      codeInfo = codeInfoLesen(line.replace(/^\s*```/, ""));
      codeLines = [];
      return;
    }
    var auf = GROUP_OPEN_RE.exec(line.trim());
    if (auf) {
      paragraphClose();
      listClose();
      out.push('<div class="' + GROUP_CLASS + " " + escHtml(auf[1]) + '" data-classes="' + escHtml(auf[1]) + '">');
      return;
    }
    if (GROUP_CLOSE_RE.test(line.trim())) {
      paragraphClose();
      listClose();
      out.push("</div>");
      return;
    }
    var marks = markerClasses(line);
    if (marks) {
      // Close the running paragraph first -- otherwise the classes land on
      // the paragraph BEFORE it. The list, by contrast, stays open: a
      // marker may well belong to a single item mid-list.
      paragraphClose();
      attachMarkers(marks, marks.index);
      return;
    }
    var ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    var ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      paragraphClose();
      var art = ul ? "ul" : "ol";
      if (list !== art) { listClose(); out.push("<" + art + ">"); list = art; }
      out.push("<li>" + inlineZuHtml((ul || ol)[1]) + "</li>");
      return;
    }
    listClose();
    if (line.trim() === "") paragraphClose();
    else paragraph.push(inlineZuHtml(line));
  });
  if (imCode) codeClose();   // a fence nobody closed
  paragraphClose();
  listClose();
  return out.join("");
}

// --- HTML -> Markdown --------------------------------------------------
// Characters that would otherwise read as formatting have to be defused in
// the text -- otherwise a typed "5 * 3" turns into italics on the next
// load.
function mdEscape(s) {
  return String(s).replace(/([*_[\]`~\\])/g, "\\$1");
}

function inlineZuMd(knoten) {
  var out = "";
  knoten.childNodes.forEach(function (k) {
    if (k.nodeType === 3) { out += mdEscape(k.nodeValue); return; }
    if (k.nodeType !== 1) return;
    var tag = k.tagName.toLowerCase();
    if (tag === "br") out += "\n";
    else if (tag === "strong" || tag === "b") out += "**" + inlineZuMd(k) + "**";
    else if (tag === "em" || tag === "i") out += "*" + inlineZuMd(k) + "*";
    // The browser writes <strike>, marked reads ~~ and renders <del> -- all
    // three mean the same thing and meet here.
    else if (tag === "s" || tag === "strike" || tag === "del") out += "~~" + inlineZuMd(k) + "~~";
    else if (tag === "a") out += "[" + inlineZuMd(k) + "](" + (k.getAttribute("href") || "") + ")";
    else {
      // span, font and friends -- which the browser creates on paste, and
      // which the colour button creates on purpose. Only a colour of ours
      // is written out; everything else about such an element is dropped,
      // exactly as it was before there was a colour button. That is also
      // what makes clearing a colour work: the browser leaves the span
      // standing with "currentcolor" in it, and a span with no colour of
      // ours is not written at all.
      var farbe = farbeVon(k);
      var inner = inlineZuMd(k);
      out += farbe ? '<span style="color:' + farbe + '">' + inner + "</span>" : inner;
    }
  });
  return out;
}

// Elements that mean something in themselves rather than framing a block.
var INLINE = /^(a|b|strong|i|em|s|strike|del|code|span|font)$/;

function htmlToMd(wurzel) {
  var blocks = [];
  // The comment line for whatever markers a block carries -- both of them
  // in one line, in the order they are written above, so the .md of the
  // same slide always reads the same.
  function marker(el) {
    if (!el.classList) return "";
    var found = MARKER_CLASSES.filter(function (c) { return el.classList.contains(c); });
    if (!found.length) return "";
    // Only a fragment can carry a number, and only then is it written: an
    // alignment with a fragment index would be a line nobody can read.
    var index = el.classList.contains("fragment") ? el.getAttribute("data-fragment-index") : null;
    return "\n" + elementLineWith(found, index);
  }
  Array.prototype.forEach.call(wurzel.childNodes, function (k) {
    if (k.nodeType === 3) {
      if (k.nodeValue.trim()) blocks.push(mdEscape(k.nodeValue.trim()));
      return;
    }
    if (k.nodeType !== 1) return;
    if (k.classList && k.classList.contains("code-block")) {
      blocks.push(codeBlockZuMd(k) + marker(k));
      return;
    }
    // A group: its own two lines around whatever stands in it, read by the
    // same walk one level down. The classes come back exactly as the file
    // wrote them -- what the field does not understand it has carried
    // along untouched rather than dropped (data-classes, mdToHtml).
    if (k.classList && k.classList.contains(GROUP_CLASS)) {
      var inner = htmlToMd(k);
      var classes = k.dataset.classes || "fragment";
      // The opening line already says what the group carries, so marker()
      // is not simply appended -- it would write those same classes a
      // second time. What it may still have to say is a class the group
      // picked up from an .element line of its own, which stands AFTER the
      // closing line in the file and is read back onto the div
      // (attachMarkers). Only those are written out again.
      var own = classes.trim().split(/\s+/);
      var extra = MARKER_CLASSES.filter(function (c) {
        return k.classList.contains(c) && own.indexOf(c) === -1;
      });
      blocks.push(groupOpenLine(classes) + "\n\n" + inner + "\n\n" + GROUP_CLOSE_LINE
        + (extra.length ? "\n" + elementLine(extra) : ""));
      return;
    }
    var tag = k.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      var lines = [];
      Array.prototype.forEach.call(k.children, function (li, i) {
        var text = inlineZuMd(li).replace(/\n/g, " ").trim();
        if (text) lines.push((tag === "ul" ? "- " : i + 1 + ". ") + text + marker(li));
      });
      if (lines.length) {
        blocks.push(lines.join("\n"));
        // A line of its own, separated by a blank one: directly under the
        // last item it would read as part of that item (which is exactly
        // how an item's own marker gets there).
        var own = marker(k);
        if (own) blocks.push(own.slice(1));
      }
    } else if (tag === "br") {
      // a lone <br> between blocks: the browser keeps an empty line open
      // with it, in Markdown it is nothing
    } else {
      // An inline element sitting straight at top level: the browser makes
      // one whenever formatting is applied to text in a field that had no
      // paragraph yet. Its own tag carries meaning, so it has to go through
      // the inline path as a CHILD -- passed as a block, only its contents
      // would be read and the formatting would be dropped on saving.
      var t = (INLINE.test(tag) ? inlineZuMd({ childNodes: [k] }) : inlineZuMd(k)).trim();
      if (t) blocks.push(t + marker(k));
    }
  });
  return blocks.join("\n\n").trim();
}

// --- Buttons -----------------------------------------------------------
// execCommand is officially deprecated, but present in every browser and
// the only thing that applies bold/italic/list correctly across a selection
// with working undo. Rebuilding that would be far more code with far more
// rough edges.
function befehl(field, name) {
  field.focus();
  if (name === "link") {
    var url = window.prompt(t("message.linkTarget"), "https://");
    if (url) document.execCommand("createLink", false, url);
    return;
  }
  if (name === "fragment") {
    fragmentToggle(field);
    return;
  }
  if (name === "together") {
    togetherToggle(field);
    return;
  }
  var align = /^align-(left|center|right|fill)$/.exec(name);
  if (align) {
    alignToggle(field, align[1]);
    return;
  }
  document.execCommand(name, false, null);
}

// Bare text straight in the field: the browser only wraps a line in a
// paragraph once there is a second one. Without a paragraph there is
// nothing to hang a class on, so one is made here -- otherwise the buttons
// would quietly do nothing on a slide someone has just started.
function forceParagraph(field) {
  if (!field.firstChild) return null;
  var paragraph = document.createElement("p");
  while (field.firstChild) paragraph.appendChild(field.firstChild);
  field.appendChild(paragraph);
  // The DOM surgery loses the caret, so it is put back at the end.
  var sel = window.getSelection();
  if (sel) {
    var scope = document.createRange();
    scope.selectNodeContents(paragraph);
    scope.collapse(false);
    sel.removeAllRanges();
    sel.addRange(scope);
  }
  return paragraph;
}

// The block the cursor is in: a paragraph, a list item, a code block.
// Those three are exactly the ones whose classes survive the way out into
// the .md (htmlToMd), which is why a class goes nowhere else.
function blockAt(field) {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  var k = sel.getRangeAt(0).startContainer;
  while (k && k !== field && !(k.nodeType === 1 && /^(P|LI|DIV)$/.test(k.tagName))) k = k.parentNode;
  if (!k) return null;
  return k === field ? forceParagraph(field) : k;
}

// Every block the selection touches -- so aligning a whole text is select
// all and one press, the way it is in any other editor. A selection inside
// one block is that block.
function blocksInSelection(field) {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  var range = sel.getRangeAt(0);
  var found = Array.prototype.filter.call(
    field.querySelectorAll("p, li, .code-block"),
    function (el) { return range.intersectsNode(el); }
  );
  if (found.length) return found;
  var one = blockAt(field);
  return one ? [one] : [];
}

// "Reveal one by one" applies to the paragraph or list item the cursor is
// in.
function fragmentToggle(field) {
  var k = blockAt(field);
  if (!k) return;
  // Switched off, the block leaves its step as well: a number on something
  // that is not a fragment any more means nothing, and leaving it behind
  // would make the row that reads it say the wrong thing.
  if (k.classList.contains("fragment")) k.removeAttribute("data-fragment-index");
  k.classList.toggle("fragment");
}

// --- Several blocks on ONE click ---------------------------------------
// Not a container: a number. reveal.js shows every fragment carrying the
// same data-fragment-index on the same click, and that is the only thing
// that reaches INTO a list -- two items of one list cannot be wrapped in
// anything without becoming two lists, which is a different slide.
//
// The numbers written here are provisional: they only have to tell the
// blocks of one step apart from the rest WITHIN this field. The field holds
// one column, and a slide may have three -- so the final numbering is done
// on the whole slide's text afterwards (normalizeSteps, called from
// js/editor/index.js on the way out of the field).
function fragmentsIn(field) {
  return Array.prototype.filter.call(field.querySelectorAll("p, li, pre, .code-block, ." + GROUP_CLASS),
    function (el) { return el.classList.contains("fragment"); });
}

function freeIndex(field) {
  var hoechste = -1;
  fragmentsIn(field).forEach(function (el) {
    var n = parseInt(el.getAttribute("data-fragment-index"), 10);
    if (!isNaN(n) && n > hoechste) hoechste = n;
  });
  return String(hoechste + 1);
}

// Puts what the selection covers on one click, or takes such a step apart
// again -- the same press, the way the fragment and the alignment work.
function togetherToggle(field) {
  var blocks = blocksInSelection(field);
  if (!blocks.length) return;

  // Already one step: every block selected is a fragment and they all
  // carry the same number. Then this takes the number off again and each
  // of them goes back to a click of its own.
  var first = blocks[0].getAttribute("data-fragment-index");
  var same = first !== null && blocks.every(function (el) {
    return el.classList.contains("fragment") && el.getAttribute("data-fragment-index") === first;
  });
  if (same) {
    blocks.forEach(function (el) { el.removeAttribute("data-fragment-index"); });
    return;
  }

  // One block alone cannot be a step: what it would mean is "appears on a
  // click", which is the first row of this menu and not this one.
  if (blocks.length < 2) return;
  var nummer = freeIndex(field);
  blocks.forEach(function (el) {
    el.classList.add("fragment");
    el.setAttribute("data-fragment-index", nummer);
  });
}

// Whether the point stands in such a step -- a fragment that shares its
// number with another one. Like fragmentHere() it only reads: a menu
// asking what the state is must not change it.
function togetherHere(field, node) {
  var k = node;
  if (!k) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    k = sel.getRangeAt(0).startContainer;
  }
  while (k && k !== field && !(k.nodeType === 1 && k.getAttribute && k.getAttribute("data-fragment-index") !== null)) k = k.parentNode;
  if (!k || k === field || !k.getAttribute) return false;
  var mine = k.getAttribute("data-fragment-index");
  if (mine === null) return false;
  return fragmentsIn(field).filter(function (el) {
    return el.getAttribute("data-fragment-index") === mine;
  }).length > 1;
}

// The slide's final numbering, done on the TEXT rather than in the field:
// the steps of a slide run across all its columns, and the field only ever
// holds one of them.
//
// `parts` is one text per column (one for a slide that has none) and comes
// back the same way. Two rules:
//   - a marker's number is a grouping key, nothing else: markers sharing
//     one within a column are one step, and the steps are numbered in the
//     order they first appear.
//   - if every step holds exactly ONE block, the numbers are dropped
//     altogether. A slide that does not need them should not carry them,
//     and without them reveal.js counts the fragments itself.
function normalizeSteps(parts) {
  var marks = [];        // { col, line, classes, key }
  var texts = (parts || []).map(function (text) { return String(text == null ? "" : text).split("\n"); });

  texts.forEach(function (lines, col) {
    var imCode = false;
    lines.forEach(function (line, i) {
      if (ZAUN.test(line)) { imCode = !imCode; return; }
      if (imCode) return;
      var marker = markerClasses(line);
      if (!marker || marker.indexOf("fragment") === -1) return;
      marks.push({
        col: col,
        line: i,
        classes: marker,
        // Without a number the block is a step of its own, which is what
        // the line number makes it.
        key: col + ":" + (marker.index === null ? "x" + i : marker.index),
      });
    });
  });

  var steps = [];
  marks.forEach(function (m) {
    if (steps.indexOf(m.key) === -1) steps.push(m.key);
  });
  var grouped = steps.length < marks.length;

  marks.forEach(function (m) {
    texts[m.col][m.line] = elementLineWith(m.classes, grouped ? String(steps.indexOf(m.key)) : null);
  });
  return texts.map(function (lines) { return lines.join("\n"); });
}

// Whether the block at a given point waits for a click. The menu that
// offers the toggle shows it as a checkmark, and only this file knows
// which element "this paragraph" means.
//
// Read only, and deliberately not blockAt(): that one MAKES a paragraph
// where the field holds bare text, and a menu asking what the state is
// must not change it. The point comes from outside because by the time the
// menu is open the caret is no longer in the field (js/editor/index.js
// writes it down beforehand).
function fragmentHere(field, node) {
  var k = node;
  if (!k) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    k = sel.getRangeAt(0).startContainer;
  }
  while (k && k !== field && !(k.nodeType === 1 && /^(P|LI|DIV)$/.test(k.tagName))) k = k.parentNode;
  return !!(k && k !== field && k.classList && k.classList.contains("fragment"));
}

// What an alignment applies to. In a list that is the LIST and not the
// single item: reveal.js lays a list out as wide as its longest line, so
// centring one bullet inside it does nothing anybody can see -- and
// "centre this list" is what the button is reached for anyway. A fragment
// is the opposite case: it belongs to the one item (fragmentToggle).
function alignTarget(el) {
  return (el.closest && el.closest("ul, ol")) || el;
}

// left / center / right / fill on the blocks the selection touches. One at
// a time: a new alignment replaces the one before it, and pressing the one
// already in force takes it off again -- back to whatever the slide gives
// the text by itself. That is also the only way back to "no choice", and a
// block without a class is what keeps the .md clean.
function alignToggle(field, align) {
  var blocks = [];
  blocksInSelection(field).forEach(function (el) {
    var target = alignTarget(el);
    // Several items of one list come out as that one list.
    if (blocks.indexOf(target) === -1) blocks.push(target);
  });
  if (!blocks.length) return;
  var klasse = "align-" + align;
  var alreadyAll = blocks.every(function (el) { return el.classList.contains(klasse); });
  blocks.forEach(function (el) {
    ALIGN_CLASSES.forEach(function (c) { el.classList.remove(c); });
    if (!alreadyAll) el.classList.add(klasse);
  });
}

// Paints the selection, or takes the paint off it again.
//
// styleWithCSS, because without it the browser reaches for <font color>,
// which is older than this project and would have to be translated twice.
// An empty colour is not an unwrapping: the browser is asked for
// "currentColor" instead, which leaves the span standing but makes it
// inherit -- and a span with no colour of ours never reaches the file
// (inlineZuMd). So clearing needs no DOM surgery, and the browser keeps
// doing the hard part of splitting a selection that crosses elements.
function farbe(field, value) {
  field.focus();
  try { document.execCommand("styleWithCSS", false, true); } catch (e) { /* older browsers */ }
  document.execCommand("foreColor", false, value || "currentColor");
}

export { isSimple, mdToHtml, htmlToMd, befehl, fragmentHere, togetherHere, normalizeSteps, farbe, farbeVon, codeBlockHtml, FRAGMENT, ALIGNS };
