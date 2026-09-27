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
bold/italic/list/link, plus image and attribution. What those buttons
produce lands in the file as perfectly ordinary Markdown.

Colour, gradient and animated background sit in a group of their own at the
foot of the form, and that group starts **folded**. They are what one
reaches for after a while, not at the start, and a first slide should not
open onto a wall of settings. Whoever unfolds it once keeps it unfolded --
the choice lives in the browser, like the light/dark setting, because it
belongs to the person and not to the deck. A slide that carries any of them
says so with a dot on the folded label, so nothing can hide in there
unnoticed.

## The layouts

| Layout | What for |
|---|---|
| Title slide (`titel`) | Large title centred, subtitle or speaker below |
| Section (`abschnitt`) | Divider between two topics, often with a coloured background |
| Text (`text`) | Heading and body — the common case |
| Two columns (`spalten`) | Like text, but the body runs in two columns |
| Three columns (`spalten-drei`) | The same in three, at a smaller type size — for short points |
| Image right / left (`bild-rechts`, `bild-links`) | Text and image side by side |
| Full-bleed image (`bild-voll`) | Image across the whole slide, text readable on top |
| Video (`video`) | A heading with a YouTube player below it |
| Quote (`zitat`) | Large quotation with an attribution |

### How wide the text stands beside a picture

Where the text stands *beside* something — a picture in `bild-rechts` and
`bild-links`, a player in `video` — `data-textbreite` says how much of the
slide it may take: `25`, `33` or `50`.

```markdown
<!-- .slide: data-layout="bild-rechts" data-image="chart.svg" data-textbreite="25" -->
```

A cap and not a width: whatever the cap leaves over goes to the picture, so
a narrower column of text is a larger picture, not an empty gap.

The default belongs to the **layout**, not to the list of values: an image
layout has always split the slide down the middle, a video slide has always
given the player two thirds. Those are what they look like before anybody
chooses, so those are their defaults — `50` and `33` — and a deck written
before this existed reads exactly as it did. A slide left at its layout's
default says nothing about it in the file.

In the editor it is the second of the two buttons at the end of the text
toolbar, and it wears its value rather than an icon. On a video slide it is
greyed out until the text is put left or right of the player; above and
below, the text has the full width and there is nothing to choose.

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
understands `data-background-color` and `data-background-gradient`
directly; `data-layout`, `data-image` and `data-text-color` are this
project's addition and do no harm there. A plain text slide gets no
attribute line at all, so that a hand-written file is still recognisable
after its first save.

Two things behave differently under a stock reveal.js. For *full-bleed
image* the picture sits in the file as `data-image` and only becomes
`data-background-image` when rendered, so that slide comes out without its
background image. And `data-text-color` is ours alone -- reveal has no text
colour of its own, so elsewhere the slide simply keeps the theme's colour.
Links keep the theme's colour here too, deliberately: their colour is what
makes them recognisable as links.

## Video on a slide

The *video* layout embeds a YouTube player. The editor's field takes
whatever is in the clipboard — a watch link, a youtu.be link, /shorts/,
/embed/, or the bare id — and what the file stores is the **id alone**:

```markdown
<!-- .slide: data-layout="video" data-video="aqz-KE-bpKQ" -->

## Big Buck Bunny
```

That is the whole security of the feature. The id is checked against a
shape — eleven characters out of a known alphabet — and the address around
it is built by [`backend/video.js`](backend/video.js), so nothing anyone
types decides where the iframe points. A URL in the file would put that
decision back into the file.

### Where the text goes

A video slide has a heading and a body like any other, and `data-textseite`
says where they sit in relation to the player — `oben`, `unten`, `links` or
`rechts`. In the editor it is the last button of the text toolbar, and only
on a video slide: the bar shows the icon of the side in force, the menu
behind it shows all four with their names.

```markdown
<!-- .slide: data-layout="video" data-video="aqz-KE-bpKQ" data-textseite="links" -->

## Big Buck Bunny

A line about what is worth watching for.
```

`oben` is what a video slide looked like before there was a choice, so it is
the default and stays out of the file — an old deck reads exactly as it
did. Above and below share the full width and the player gets what height
is left. Left and right divide it in thirds — one to the text, two to the
player — and the 16:9 gives the player its height from there. The player is
what the slide is for, and a third is enough for the handful of lines that
belong beside it.

Beside the player, `data-textbreite` caps how much of the slide the text
may take — see [How wide the text stands beside a
picture](#how-wide-the-text-stands-beside-a-picture), which the image
layouts share. A video slide gives the player two thirds unless told
otherwise.

**The heading does not move.** It names the slide, not the text beside the
player, so it stays across the top in all four arrangements — only the body
travels. This is the one layout whose heading therefore sits *outside*
`.folie-text` in the markup: it could not stay put inside a box that moves.
What moves below it moves by `order`, not by turning the box around, which
would have taken the heading along.

The markup is the same in all four cases and always in reading order —
heading, body, player. Which side that ends up on is the stylesheet's
business, the same division of labour as the image layouts, so a screen
reader gets the slide in the order it was written whichever arrangement is
chosen. A slide with no body gets no empty `.folie-text` either — beside
the player that box is half the width, and an empty half would take the
room from the picture for nothing.

The player is embedded with `data-src` rather than `src`: reveal.js loads
it when the slide comes up and takes it away again when the talk moves on,
which is what stops the sound at the right moment and what keeps ten videos
in a deck from all loading at the start. Because the player is torn down
that way, every visit to the slide starts the video at the beginning.

**It starts by itself, one second after the slide appears**
([`public/js/folien-video.js`](backend/public/js/folien-video.js)). Not
through `autoplay=1` in the address: that starts the player the instant it
loads, in the middle of the slide transition. A second later is calmer, and
it is also the moment at which the player is ready to be told anything —
the command is YouTube's own postMessage API, which is what `enablejsapi=1`
is for. reveal.js can do this too, but only for youtube.com addresses, and
without a delay.

Not in the editor's preview, though: a video that starts talking every time
one clicks a slide while writing would be unbearable. And not on paper.

The player is trimmed to what belongs on a wall: no control bar along the
bottom (`controls=0` — a click on the picture still pauses, which is the one
thing a speaker needs mid-sentence), no annotations, and the arrow keys stay
with the talk instead of seeking the video (`disablekb=1`). What cannot be
taken away is the **title bar across the top**, with the video's name, the
channel and the YouTube mark: that is the branding YouTube requires in
return for embedding. It fades a few seconds after playback starts and
comes back whenever the mouse passes over the player. `modestbranding=1`
used to soften it and has done nothing since 2023, so it is deliberately not
among the parameters — one with no effect only suggests it has one. The address is
`youtube-nocookie.com`, so nothing is set until someone presses play, and
`rel=0` keeps the suggestions at the end to the same channel — a talk
should not end in whatever the algorithm has in stock.

Two places where a video cannot be what it is. The **PDF**, where an iframe
shows nothing at all, so the handout gets the black box with the address in
it. And the **single HTML file**, which is opened from the file system and
therefore has no origin of its own: YouTube will not configure a player for
a page without one and puts a "player configuration error" in the box
instead of the video. No parameter changes that — it is the referrer
YouTube wants, and a `file://` page sends none. So the exported file shows
the video's still image with a play mark on it, and a click opens the video
on youtube.com, where it plays. Served over http(s) — the same file put on
a web server — the export has an origin and embeds the player as usual.

Both need a network for this one slide. Everything else in the file still
runs without one.

## Background gradients

A slide takes a CSS gradient besides its background colour — the editor
offers swatches to click and, below them, a field for writing one by hand:

```markdown
<!-- .slide: data-layout="titel" data-background-color="#003057" data-background-gradient="linear-gradient(180deg, #003057 0%, #0072ce 100%)" -->
```

This is reveal.js' own `data-background-gradient`, so the gradient also
shows up in a stock reveal.js. Keeping the background **colour** alongside
it is worth the second attribute: reveal reads only the colour to decide
whether a slide is light or dark, and that is what puts the theme's text on
the right side of the contrast.

The value is not free CSS but a shape: one gradient function
(`linear-`, `radial-`, `conic-`, each also as a `repeating-` variant),
whose arguments are plain tokens plus, nested, nothing but the colour
functions. That rules out `url()`, a second declaration and a stray quote
by construction rather than by escaping — and the same grammar checks the
field in the browser and the value on the server
([`backend/deck.js`](backend/deck.js)). Whatever does not fit is refused,
the slide keeps the gradient it has, and the field says so.

Seven gradients ship with the editor. A deck collection adds its own
without touching the code, through a file next to the decks:

`decks/verlaeufe.json`:

```json
[
  { "id": "firma", "name": "Corporate blue",
    "css": "linear-gradient(180deg, #003057 0%, #0072ce 100%)" },
  { "id": "nacht", "name": "Night, but ours",
    "css": "linear-gradient(180deg, #000000 0%, #202020 100%)" }
]
```

An entry carrying the id of one of the seven replaces it — that is how a
default is corrected rather than doubled; everything else is appended in
the file's order. The file is read every time an editor is opened, so a new
gradient is there on the next reload, no restart. A broken entry is skipped
with a line in the log instead of taking the editor down
([`backend/verlaeufe.js`](backend/verlaeufe.js)).

## Animated backgrounds

Besides a colour and a gradient a slide takes an *effect*. Both are taken
from a CodePen and reproduced rather than adapted:

| Effect | |
|---|---|
| `waves` | Three near-black discs, far larger than the slide, hanging in from above so that only the bottom of their rim is on show, each turning at its own speed. A turning rim rises and falls, which is the movement of water; three at different speeds are what keep it from reading as one turning disc. On its own blue ground. |
| `starfield` | Three star fields drifting upwards at three speeds — near stars quickly, far ones slowly, which is what makes the sky look deep. A field is a single pixel wearing a few hundred box-shadows, on a night-sky gradient. |
| `blobs` | Four shapes turning about two points, one pair in the upper left, one in the lower right, each of the pair at its own speed so they drift apart and together again. On yellow, and loud with it. The drawing is an inline SVG; its viewBox is smaller than the shapes on purpose, so they hang over the edges of the slide rather than sitting in it. |

```markdown
<!-- .slide: data-layout="titel" data-background-effect="starfield" data-text-color="#ffffff" -->
```

All of them bring their background with them, so unlike a gradient they
cover the slide's own colour — that is part of the picture, not an
oversight. What they do not bring is a text colour: `waves` and `starfield`
want a light one, `blobs` the theme's dark one.

Two of them need something the stylesheet cannot give them, and that is the
whole reason
[`folien-effekte.js`](backend/public/js/folien-effekte.js) knows any of them
by name: the blobs need their SVG in the document (an SVG used as a
background image does not animate), and the stars need their positions.
The pen has its SCSS compiler roll those, and this project has no build
step, so they are scattered here instead — from a *seeded* generator, so the same slide shows the same sky in
the editor, on the wall and in the handout. A wider screen gets more stars
rather than a bare right-hand edge: it is the density that makes a sky, not
the number. Each field repeats itself one field-height below, so at the
moment the first has travelled its own height off the top, the copy stands
exactly where it began and the sky loops without a seam.

Unlike a gradient this cannot travel as a value: an animation is a rule with
keyframes, not a value. So the file carries a NAME and the stylesheet
carries the effect — the same division of labour as the layouts. The names
are listed in [`backend/effekte.js`](backend/effekte.js), what they look
like is in [`public/css/slides.css`](backend/public/css/slides.css); a name
nothing answers to becomes no effect at all, and an effect can be redrawn
without touching a single deck.

`data-background-effect` is this project's own, like `data-text-color`: a
stock reveal.js ignores it and shows the slide without the movement. The
effect is not drawn on the `<section>` — that box is only as tall as its
text — but on the background element reveal builds for every slide, where
[`public/js/folien-effekte.js`](backend/public/js/folien-effekte.js) hangs
the layers and carries the name across. That is what makes it span the whole
slide, lie behind everything and survive into the print view.

Two places where it deliberately stands still: in the **PDF**, where a
frozen frame is all paper can hold, and for anyone whose system asks for
less motion (`prefers-reduced-motion`). The picture stays in both cases,
only the movement goes.

For print it is also drawn a different way, and that is worth knowing before
someone "tidies up" the duplicate rules: the print renderer drops both a
rounded box and a gradient once the element is this much larger than the
page and carries a transform — what comes out is a straight band across the
handout. So the print rules keep each layer inside the page and without a
transform, and arrive at the same picture by the one route that survives the
trip to paper.

## Code on a slide

A fenced code block in the Markdown comes out coloured — reveal.js' own
highlighter (highlight.js) does the work, and the language is whatever the
fence says:

````markdown
```java
public int getAge() {
    return this.age;
}
```
````

The toolbar has a button for it: language, colour scheme and the code
itself, and on closing the dialog the block lands at the end of the slide.
Language and scheme are remembered for the next one.

In the text field the block is **an object, not syntax**: sealed
(`contenteditable="false"`), labelled with its language and scheme, opened
for editing by a click, removed by the × in its corner or by emptying it in
the dialog. The rest of the slide stays perfectly ordinary rich text — a
slide with code is no longer a slide one can only edit as source. Sealing it
is what makes that safe: a code block is the one thing in the field where a
stray keystroke would change the meaning, and where the way back into the
file has to be exact, down to the indentation.

No syntax colours in the field, on purpose: the field is for writing, the
preview beside it shows what the wall shows.

The dialog also holds the code itself — it is the place where a block is
written and rewritten, Tab included — and a checkbox for *reveal on click*.
That last one has to live here rather than on the toolbar button: the button
works from where the caret is, and inside a sealed block there is no caret.
In the file it is the same `<!-- .element: class="fragment" -->` that a
paragraph or a list item gets.

A **colour scheme belongs to the single block**, and that is not how
highlight.js works: its themes are stylesheets for a whole page. So each of
the offered themes is fenced into a class of its own at runtime
(`pre.hl-github .hljs { … }`, see
[`backend/code.js`](backend/code.js)) and they are served together. Two
blocks on one slide can therefore wear different schemes. A block without
one keeps the plain monokai reveal.js brings along.

```markdown
```java hl=github
public int getAge() {
    return this.age;
}
```
```

The `hl=` is ours alone; every other renderer reads the first word of the
fence and ignores the rest, so the block stays a plain Java block anywhere
else.

It all runs in the preview as well, because the preview is meant to show
what the wall will show. A slide redrawn while typing is not part of the
deck the highlighter saw at startup, so it is coloured again by hand
([`views/reveal.ejs`](backend/views/reveal.ejs)).

The highlighter is half a megabyte — as much as reveal.js itself — so the
**single-file export carries it only when the deck holds a code block at
all** ([`backend/dokument.js`](backend/dokument.js)), and of the colour
schemes only those the deck actually uses. A deck without code exports
exactly as small as it did before. Without the highlighter the code still
shows, in the theme's own type.

## When a slide holds more than fits

reveal.js lays every slide out in a box of a fixed size — 960 by 700 by
default — and scales that box to the window. What does not fit *inside* the
box is not scaled with it: it is cut off at the bottom, in the editor, on
the wall and in the handout alike, and nothing on the slide says so.

So a slide that runs over has its type stepped down until it fits
([`backend/public/js/folien-passform.js`](backend/public/js/folien-passform.js)).
Measured rather than guessed — how much is too much depends on the theme,
the layout, the window and the words themselves, none of which is known
while the stylesheet is written. A binary search over seven steps finds the
largest size that still fits; the size goes on the `<section>`, so the
headings follow it along with the body text.

A slide that fits is not touched at all. This is the rescue for the odd
slide, not a layout rule — and it stops at **0.55**, because below that a
slide is unreadable from the back of the room and the honest answer is to
put less on it. From there the slide is allowed to run over again, which is
what shows you there is a problem.

A slide that came out smaller carries `data-passform="0.75"` — so a slide
that was shrunk can be told apart from one that was written small.

On paper it is measured against a different box. reveal.js puts every slide
in a page of its own there, that page clips what sticks out, and the slide
does not begin at its top edge — so what is available is the page minus
that offset. Against the 700 of the screen a slide that just fits on the
wall would come out of the printer a line short.

It applies to every layout, in the editor's preview, in the presentation,
in the exported file and in the PDF alike — one file, so all four agree.
How far it carries differs by layout, because a picture or a player takes
room the type cannot have and the quote layout starts a size larger.
Measured with a body of plain prose, at 960 × 700:

| Layout | fits up to | runs over from |
|---|---|---|
| `titel`, `abschnitt` | beyond 300 words | — |
| `text`, `spalten`, `spalten-drei` | beyond 300 words | — |
| `bild-voll` | 200 words | 250 |
| `video` | 175 words | 200 |
| `bild-rechts`, `bild-links` | 150 words | 175 |
| `zitat` | 125 words | 150 |

Which is a long way past what belongs on a slide — but it is where the
floor is, and past it a slide is cut off again.

## When the text field is not enough

The formatting buttons cover paragraphs, bold, italic, lists, links,
"reveal on click" and code blocks. If a slide contains Markdown beyond that
— a table, a block quote, headings of its own — the rich-text field cannot
convert it back without loss. The editor then switches that slide to
**source mode** by itself, and says why.

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


## Licence

[MIT](LICENSE) — take it, change it, pass it on, commercially too; the
copyright notice has to come along.

Every dependency is permissively licensed as well (MIT, ISC, Apache-2.0,
BSD-3-Clause), none of them demands copyleft. reveal.js and
OverlayScrollbars are both MIT too and are only served here as static
files. For the planned move into Relay
that is the right direction: MIT code may travel into an AGPL project, the
other way round it could not.
