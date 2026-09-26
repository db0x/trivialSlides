import { t } from "./base.js";

// The piece that hides the Markdown syntax from the user: marrying a
// contenteditable field to Markdown in both directions.
//
// Deliberately ONLY a small subset -- paragraph, bold, italic, list, link,
// fragment. Those are the things there are buttons for. Anything beyond
// that the field cannot convert back without loss, so istEinfach() spots
// such slides and the editor shows them as source instead (see index.js).
// Better an honest fallback than a field that silently eats the user's
// content.

// reveal.js' syntax for "reveal on click". Sits on a line of its own after
// the element it refers to.
var FRAGMENT = '<!-- .element: class="fragment" -->';

// Markdown the buttons cannot express. Anyone who has such a thing in
// their file should be allowed to keep it.
//
// A fenced code block is NOT such a thing, although it is nothing the
// buttons could write letter by letter: the field shows it as a sealed
// object with its own dialog (see below), and it travels back into the .md
// exactly as it came. Everything between the fences is skipped here --
// inside a code block a hash or a backtick is code, not Markdown.
function istEinfach(md) {
  var text = String(md || "");
  if (!text.trim()) return true;
  var zeilen = text.split("\n");
  var imCode = false;
  for (var i = 0; i < zeilen.length; i++) {
    var z = zeilen[i];
    if (ZAUN.test(z)) { imCode = !imCode; continue; }
    if (imCode) continue;
    if (z.trim() === "" || z.trim() === FRAGMENT) continue;
    if (/^\s{0,3}(#{1,6}\s|>|~~~|\||!\[)/.test(z)) return false; // heading, quote, code, table, image
    if (/<[a-z!/]/i.test(z)) return false;   // raw HTML (other than the fragment above)
    // Inline code. The field cannot show it, and on the way back the
    // backticks would be escaped into literal characters -- turning
    // `code` into visible backticks. Source mode keeps it intact.
    if (/`/.test(z)) return false;
    if (/^\s{4,}\S/.test(z)) return false;   // indented code block
    if (/^\s*([-*_])\s*\1\s*\1/.test(z)) return false; // horizontal rule
  }
  // A fence that was opened and never closed is not a code block but a
  // typo, and the field would swallow the rest of the slide into it.
  return !imCode;
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
  var teile = String(info || "").trim().split(/\s+/).filter(Boolean);
  var sprache = teile.length && teile[0].indexOf("=") === -1 ? teile[0] : "";
  var stil = "";
  teile.forEach(function (teil) {
    var treffer = /^hl=([a-z0-9-]+)$/.exec(teil);
    if (treffer) stil = treffer[1];
  });
  return { sprache: sprache, stil: stil };
}

// The label says what the block is, because the field shows no syntax and
// the colours only appear in the preview.
function codeBlockHtml(sprache, stil, quelltext, fragment) {
  var marke = [sprache || t("code.ohneSprache"), stil].filter(Boolean).join(" \u00b7 ");
  return '<div class="code-block' + (fragment ? " fragment" : "") + '" contenteditable="false"' +
    ' data-sprache="' + escHtml(sprache) + '" data-stil="' + escHtml(stil) + '"' +
    ' data-tip="' + escHtml(t("code.klicken")) + '">' +
    '<span class="code-marke">' + escHtml(marke) + "</span>" +
    // A sealed block cannot be deleted with the keyboard the way a
    // paragraph can -- the caret has no place inside it to delete from. So
    // it carries its own way out.
    '<button type="button" class="code-weg" tabindex="-1"' +
    ' data-tip="' + escHtml(t("code.entfernen")) + '"' +
    ' aria-label="' + escHtml(t("code.entfernen")) + '">\u00d7</button>' +
    "<pre>" + escHtml(quelltext) + "</pre></div>";
}

function codeBlockZuMd(el) {
  var pre = el.querySelector("pre");
  var sprache = el.dataset.sprache || "";
  var stil = el.dataset.stil || "";
  var info = sprache + (stil ? (sprache ? " " : "") + "hl=" + stil : "");
  return "```" + info + "\n" + (pre ? pre.textContent : "") + "\n```";
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Markdown -> HTML --------------------------------------------------
function inlineZuHtml(text) {
  var s = escHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, url) {
    return '<a href="' + url.replace(/"/g, "%22") + '">' + t + "</a>";
  });
  s = s.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

function mdZuHtml(md) {
  var zeilen = String(md || "").split("\n");
  var out = [];
  var liste = null;    // "ul" | "ol" | null
  var absatz = [];

  function absatzSchliessen() {
    if (!absatz.length) return;
    out.push("<p>" + absatz.join("<br>") + "</p>");
    absatz = [];
  }
  function listeSchliessen() {
    if (liste) { out.push("</" + liste + ">"); liste = null; }
  }
  // The fragment refers to the element written last -- so the class is
  // attached to that one after the fact.
  function fragmentAnhaengen() {
    for (var i = out.length - 1; i >= 0; i--) {
      if (/^<div class="code-block/.test(out[i])) {
        out[i] = out[i].replace('class="code-block', 'class="code-block fragment');
        return;
      }
      var t = /^<(p|li)>/.exec(out[i]);
      if (t) { out[i] = "<" + t[1] + ' class="fragment">' + out[i].slice(t[0].length); return; }
    }
  }

  var imCode = false;
  var codeZeilen = [];
  var codeInfo = "";

  function codeSchliessen() {
    out.push(codeBlockHtml(codeInfo.sprache, codeInfo.stil, codeZeilen.join("\n"), false));
    imCode = false;
    codeZeilen = [];
  }

  zeilen.forEach(function (zeile) {
    if (imCode) {
      if (ZAUN.test(zeile)) codeSchliessen();
      else codeZeilen.push(zeile);
      return;
    }
    if (ZAUN.test(zeile)) {
      absatzSchliessen();
      listeSchliessen();
      imCode = true;
      codeInfo = codeInfoLesen(zeile.replace(/^\s*```/, ""));
      codeZeilen = [];
      return;
    }
    if (zeile.trim() === FRAGMENT) {
      // Close the running paragraph first -- otherwise the class lands on
      // the paragraph BEFORE it. The list, by contrast, stays open: a
      // fragment may well belong to a single item mid-list.
      absatzSchliessen();
      fragmentAnhaengen();
      return;
    }
    var ul = /^\s*[-*+]\s+(.*)$/.exec(zeile);
    var ol = /^\s*\d+[.)]\s+(.*)$/.exec(zeile);
    if (ul || ol) {
      absatzSchliessen();
      var art = ul ? "ul" : "ol";
      if (liste !== art) { listeSchliessen(); out.push("<" + art + ">"); liste = art; }
      out.push("<li>" + inlineZuHtml((ul || ol)[1]) + "</li>");
      return;
    }
    listeSchliessen();
    if (zeile.trim() === "") absatzSchliessen();
    else absatz.push(inlineZuHtml(zeile));
  });
  if (imCode) codeSchliessen();   // a fence nobody closed
  absatzSchliessen();
  listeSchliessen();
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
    else out += inlineZuMd(k); // span, font and friends, which the browser creates on paste
  });
  return out;
}

// Elements that mean something in themselves rather than framing a block.
var INLINE = /^(a|b|strong|i|em|s|strike|del|code|span|font)$/;

function htmlZuMd(wurzel) {
  var bloecke = [];
  function fragment(el) {
    return el.classList && el.classList.contains("fragment") ? "\n" + FRAGMENT : "";
  }
  Array.prototype.forEach.call(wurzel.childNodes, function (k) {
    if (k.nodeType === 3) {
      if (k.nodeValue.trim()) bloecke.push(mdEscape(k.nodeValue.trim()));
      return;
    }
    if (k.nodeType !== 1) return;
    if (k.classList && k.classList.contains("code-block")) {
      bloecke.push(codeBlockZuMd(k) + fragment(k));
      return;
    }
    var tag = k.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      var zeilen = [];
      Array.prototype.forEach.call(k.children, function (li, i) {
        var text = inlineZuMd(li).replace(/\n/g, " ").trim();
        if (text) zeilen.push((tag === "ul" ? "- " : i + 1 + ". ") + text + fragment(li));
      });
      if (zeilen.length) bloecke.push(zeilen.join("\n"));
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
      if (t) bloecke.push(t + fragment(k));
    }
  });
  return bloecke.join("\n\n").trim();
}

// --- Buttons -----------------------------------------------------------
// execCommand is officially deprecated, but present in every browser and
// the only thing that applies bold/italic/list correctly across a selection
// with working undo. Rebuilding that would be far more code with far more
// rough edges.
function befehl(feld, name) {
  feld.focus();
  if (name === "link") {
    var url = window.prompt(t("meldung.linkZiel"), "https://");
    if (url) document.execCommand("createLink", false, url);
    return;
  }
  if (name === "fragment") {
    fragmentUmschalten(feld);
    return;
  }
  document.execCommand(name, false, null);
}

// "Reveal one by one" applies to the paragraph or list item the cursor is
// in.
function fragmentUmschalten(feld) {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var k = sel.getRangeAt(0).startContainer;
  while (k && k !== feld && !(k.nodeType === 1 && /^(P|LI|DIV)$/.test(k.tagName))) k = k.parentNode;
  if (!k) return;
  if (k === feld) {
    // Bare text straight in the field: the browser only wraps a line in a
    // paragraph once there is a second one. Without a paragraph there is
    // nothing to hang the class on, so one is made here -- otherwise the
    // button would quietly do nothing on a slide someone has just started.
    if (!feld.firstChild) return;
    var absatz = document.createElement("p");
    while (feld.firstChild) absatz.appendChild(feld.firstChild);
    feld.appendChild(absatz);
    // The DOM surgery loses the caret, so it is put back at the end.
    var bereich = document.createRange();
    bereich.selectNodeContents(absatz);
    bereich.collapse(false);
    sel.removeAllRanges();
    sel.addRange(bereich);
    k = absatz;
  }
  k.classList.toggle("fragment");
}

export { istEinfach, mdZuHtml, htmlZuMd, befehl, codeBlockHtml, FRAGMENT };
