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
function istEinfach(md) {
  var text = String(md || "");
  if (!text.trim()) return true;
  var zeilen = text.split("\n");
  for (var i = 0; i < zeilen.length; i++) {
    var z = zeilen[i];
    if (z.trim() === "" || z.trim() === FRAGMENT) continue;
    if (/^\s{0,3}(#{1,6}\s|>|```|~~~|\||!\[)/.test(z)) return false; // heading, quote, code, table, image
    if (/<[a-z!/]/i.test(z)) return false;   // raw HTML (other than the fragment above)
    if (/^\s{4,}\S/.test(z)) return false;   // indented code block
    if (/^\s*([-*_])\s*\1\s*\1/.test(z)) return false; // horizontal rule
  }
  return true;
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
      var t = /^<(p|li)>/.exec(out[i]);
      if (t) { out[i] = "<" + t[1] + ' class="fragment">' + out[i].slice(t[0].length); return; }
    }
  }

  zeilen.forEach(function (zeile) {
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
  absatzSchliessen();
  listeSchliessen();
  return out.join("");
}

// --- HTML -> Markdown --------------------------------------------------
// Characters that would otherwise read as formatting have to be defused in
// the text -- otherwise a typed "5 * 3" turns into italics on the next
// load.
function mdEscape(s) {
  return String(s).replace(/([*_[\]`\\])/g, "\\$1");
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
    else if (tag === "a") out += "[" + inlineZuMd(k) + "](" + (k.getAttribute("href") || "") + ")";
    else out += inlineZuMd(k); // span, font and friends, which the browser creates on paste
  });
  return out;
}

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
      var t = inlineZuMd(k).trim();
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
    var url = window.prompt("Wohin soll der Link fuehren?", "https://");
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
  if (!k || k === feld) return;
  k.classList.toggle("fragment");
}

export { istEinfach, mdZuHtml, htmlZuMd, befehl, FRAGMENT };
