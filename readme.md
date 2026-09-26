# trivialSlides

```
  __      _      _      _________    __      
 / /_____(_)  __(_)__ _/ / __/ (_)__/ /__ ___
/ __/ __/ / |/ / / _ `/ /\ \/ / / _  / -_|_-<
\__/_/ /_/|___/_/\_,_/_/___/_/_/\_,_/\__/___/
                           based on revealJS   
```

**trivialSlides** is a presentation editor built on reveal.js, made usable
by people who do not want to write Markdown — and it still stores nothing
but Markdown.

The name is the promise: no database, no build step, no accounts. One folder
per talk, one Markdown file inside it, done.

The editor is a **view** onto a `.md` file, not its owner. You can work
around it at any time: open the file in a text editor, put it under version
control, copy it into an existing reveal.js project. Those who prefer typing
type. Those who prefer clicking click. Both work on the same file.

## Getting started

```bash
cp .env.example .env        # adjust the port and where decks are kept
docker compose up -d
```

Then open `http://127.0.0.1:8080` in a browser — or whichever port you set
in `.env`. The container is called `trivialSlides`, so `docker logs -f
trivialSlides` shows you what it is doing. (The *service* in the compose
file is lower-case `trivialslides` — that is the name for `docker compose`
commands, while Docker itself addresses the container by the capitalised
one.)

Two things to watch when picking a port, both quickly explained:

* Browsers refuse a handful of ports outright and report `ERR_UNSAFE_PORT`
  — among them the IRC block `6665–6669` plus `6679` and `6697`. The server
  runs perfectly well in that case, it is just that nobody knocks.
* `BIND_ADDR=127.0.0.1` listens on IPv4 only. If `localhost` resolves to
  IPv6 first on your machine and the browser does not fall back, use
  `127.0.0.1` directly.

To let colleagues on the same network join in, set `BIND_ADDR=0.0.0.0` in
`.env`.

It also runs without Docker:

```bash
cd backend && npm install && npm start
```

## What it looks like

Three areas: the slides as a list on the left (drag to reorder), the form
for the selected slide in the middle, a live preview running real reveal.js
on the right — not a replica, but exactly what will be on the wall later.

The form shows no Markdown syntax anywhere: the layout as a clickable tile,
a field for the heading, a text field with buttons for
bold/italic/list/link, plus image, attribution and background colour. What
those buttons produce lands in the file as perfectly ordinary Markdown.

## The layouts

| Layout | What for |
|---|---|
| Title slide (`titel`) | Large title centred, subtitle or speaker below |
| Section (`abschnitt`) | Divider between two topics, often with a coloured background |
| Text (`text`) | Heading and body — the common case |
| Two columns (`spalten`) | Like text, but the body runs in two columns |
| Image right / left (`bild-rechts`, `bild-links`) | Text and image side by side |
| Full-bleed image (`bild-voll`) | Image across the whole slide, text readable on top |
| Quote (`zitat`) | Large quotation with an attribution |

A layout **never** changes a slide's text, only its attributes. That is what
keeps the slide body plain Markdown, which still reads sensibly without this
project — just without the finer points of the arrangement. The arrangement
itself is done entirely by
[`public/css/slides.css`](backend/public/css/slides.css); a layout can be
redesigned there without touching a line of JavaScript.

## The storage format

One folder per talk:

```
decks/quartalsbericht/vortrag.md
decks/quartalsbericht/bilder/team.jpg
```

The folder is the unit you send or back up — Markdown and images together,
the image paths relative.

The file is compatible with reveal.js and `reveal-md`:

```markdown
---
titel: Quarterly report
theme: white
transition: slide
---

<!-- .slide: data-layout="titel" -->

# Quarterly report

Thomas Schwerdt

---

<!-- .slide: data-layout="bild-rechts" data-image="chart.svg" -->

## Revenue

- Q1: 120
- Q2: 140
```

`---` separates horizontally, `----` vertically (a reveal.js stack) — the
same convention as reveal-md and HedgeDoc.

The slide attributes use reveal.js' own comment syntax. Any other reveal.js
understands `data-background-color` directly; `data-layout` and `data-image`
are this project's addition and do no harm there. A plain text slide gets no
attribute line at all, so that a hand-written file is still recognisable
after its first save.

The one deviation from stock reveal.js: for *full-bleed image* the picture
sits in the file as `data-image` and only becomes `data-background-image`
when rendered. Another reveal.js therefore shows that one slide without its
background image.

## When the text field is not enough

The formatting buttons cover paragraphs, bold, italic, lists, links and
"reveal on click". If a slide contains Markdown beyond that — a table, code,
a block quote, headings of its own — the rich-text field cannot convert it
back without loss. The editor then switches that slide to **source mode** by
itself, and says why.

That is deliberate: better a visible fallback than a field that silently
eats content. The *source* button also switches over voluntarily.

## Publishing

* **A single HTML file** — reveal.js, the theme, the layout CSS, the fonts
  and every image are inside it. A double-click is enough: no server, no
  network. This is the version to send around.
* **A PDF** — one slide per page, to hand out. Takes a few seconds, because
  a browser has to start up for it.
* **The Markdown file** — the way back into a reveal.js project of your own,
  or into version control.
* **Presenting** — the normal reveal.js view with speaker notes (`S`),
  overview (`Esc`) and PDF export via `?print-pdf` plus the print dialog.

### Why the PDF looks like the talk

The PDF is not *rebuilt*, it is printed: the same HTML that is also the
sendable file goes through a browser without a window (Chromium or Chrome,
driven by `puppeteer-core`). reveal.js does the page breaking itself — it
has a print view for exactly that, the same one behind `?print-pdf`. One
page is therefore exactly one slide, in slide format rather than A4.

Because the document is the same for both routes
([`dokument.js`](backend/dokument.js)), the handout cannot look different
from the HTML version. The fonts of the reveal.js themes now travel inside
the file as `data:` URLs too; previously a file sent without its `fonts`
folder alongside showed a substitute typeface.

Two things stay different from the screen, both unavoidable: fragments
("reveal one by one") all sit on a single page in the handout — otherwise
every step would get a sheet of its own — and the soft blur behind the text
of a *full-bleed image* is missing, because browsers do not draw it when
printing. The text box itself remains.

Themes that fetch their font from Google (`sky`, `night`, `simple`,
`blood`) need a network for it, both when generating the PDF and when
opening the HTML file. Without one, both fall back to the same substitute
font, so they still match each other.

### What the server needs for it

A browser. The container already has one: the Dockerfile installs Chromium
along with font packages. Without Docker, [`pdf.js`](backend/pdf.js) looks
in the usual places for Chromium, Chrome, Brave or Edge; anyone keeping
theirs elsewhere sets `BROWSER_PATH`. If no browser is found, the editor
says so on a click of *PDF* and names the manual route: present, append
`?print-pdf` to the address, print.

## Fitting it into Relay

The project deliberately follows Relay's conventions — CommonJS on the
server, native ES modules in the browser, EJS, no build step — so that
moving it over is a copy rather than a rewrite. The whole editor hangs off
*one* router.

1. Put `deck.js`, `layouts.js`, `render.js`, `dokument.js` and `pdf.js`
   next to Relay's other modules, `routes/decks.js` as `routes/folien.js`,
   the views and `public/` files accordingly.
2. Mount it in Relay's `app.js` the way it is done there:
   ```js
   app.use(mount, loginRequired, require("./routes/folien").router);
   ```
3. Replace `storage.js` with Relay's own: the deck folders then belong to
   the respective user, and sharing runs through `shares.js` as it does for
   the notes.
4. `nurEigeneSeite` in `routes/decks.js` and `schreibKopf()` in
   `public/js/editor/base.js` fall away — Relay's `csrfSchutz` and its
   `base.js` take over. That is why both sit in exactly one place.
5. Copy reveal.js out of `node_modules` into `public/vendor/reveal/`, the
   way the other third-party libraries live there, and adjust the paths in
   `app.js`. `dokument.js` reads reveal.js and the themes from disk as
   well -- the path is in one place there, as `REVEAL_DIR`.
6. The Relay server needs a Chromium, otherwise publishing is reduced to
   HTML and Markdown. Everything else keeps working.

## What is deliberately missing

* **Simultaneous editing.** Two people on the same slide overwrite each
  other. Real collaborative writing would need Relay's session handling --
  worth doing only after the move over there.
* **Raw HTML in slides** is discarded when rendering. The editor does not
  offer it, and without raw HTML a smuggled-in `<script>` in a talk passed
  around is not possible in the first place.
* **Custom themes.** The reveal.js themes that ship with it are the choice
  on offer. A house theme would be one more CSS file plus an entry in
  `deck.js`.

## Licence

[MIT](LICENSE) — take it, change it, pass it on, commercially too; the
copyright notice has to come along.

Every dependency is permissively licensed as well (MIT, ISC, Apache-2.0,
BSD-3-Clause), none of them demands copyleft. reveal.js itself is MIT too
and is only served here as a static file. For the planned move into Relay
that is the right direction: MIT code may travel into an AGPL project, the
other way round it could not.
