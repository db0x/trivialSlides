# trivialSlides

[![tests](https://github.com/db0x/trivialSlides/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/db0x/trivialSlides/actions/workflows/ci.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![node 22](https://img.shields.io/badge/node-22-5FA04E.svg)](backend/package.json)
[![built on reveal.js](https://img.shields.io/badge/built%20on-reveal.js-E1A82E.svg)](https://revealjs.com)
[![no database](https://img.shields.io/badge/database-none-lightgrey.svg)](#the-storage-format)

<img align="left" width="128" height="128" src="https://raw.githubusercontent.com/db0x/trivialSlides/ff729b91452f8d4b6b49c5cfd73269c431c013d1/trivialSlides.svg">

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
per deck, one Markdown file inside it + assets, done.

The editor is a **view** onto a `.md` file, not its owner. You can work
around it at any time: open the file in a text editor, put it under version
control, copy it into an existing reveal.js project. Those who prefer typing
type. Those who prefer clicking click. Both work on the same file.

![](current.png)

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

## Your first five minutes

A deck called *Example* is already there — every layout once, to click apart
rather than read about. Nothing needs saving; the editor writes as you type.
`F5` or the **Present** button starts the talk, and a USB presenter works as
it comes. `Ctrl+K` reaches every command by name. When you want the deck
elsewhere, **Export** gives you a single self-contained HTML file, a PDF, or
the Markdown itself.

## What it looks like

Three areas: the slides as a list on the left (drag to reorder), the form
for the selected slide in the middle, a live preview running real reveal.js
on the right — not a replica, but exactly what will be on the wall later.

The form asks for no Markdown: the layout as a clickable tile, a field for
the heading, a text field with buttons for bold/italic/list/link, plus
image and attribution. What those buttons produce lands in the file as
perfectly ordinary Markdown.

It is not hidden from you either. A button on the text field shows the
slide as Markdown and lets you write it straight — and a slide carrying
something the buttons cannot express, a table or a code block, opens that
way by itself rather than pretending the markup is not there.

The form is tabbed, and the tab you land on is **Content**. Colour,
gradient and animated background sit one tab over, on **Colours and
effects**: they are what one reaches for after a while, not at the start,
and a first slide should not open onto a wall of settings. That tab shows a
live sample of the slide's writing on its own ground, with a line beneath
it saying whether the one can still be read against the other.

The third tab, **Library**, is about the deck rather than the slide in
front of you: every picture the folder holds, and which slides stand on
it.

## Decks from a prompt

Built in, and off until you point it at a model. With a key in `.env` the
overview grows a button that writes a whole deck from a prompt — with notes,
pasted text, a PDF or pictures to work from — and the editor grows one that
changes the open deck by instruction.

What comes back is **Markdown**, shown for you to read and apply or throw
away. Nothing is written behind your back.

```bash
AI_API=anthropic     # or openai, the shape Ollama and most others speak too
AI_KEY=sk-ant-...
```

Nothing configured, no button: the feature is absent rather than disabled.
A model on your own machine wants no key at all, only its address —
`.env.example` has that case and the rest, though the dialog itself is the
quicker way to find out what it does.

## The layouts

| Layout | What for |
|---|---|
| Title slide | Large title centred, subtitle or speaker below |
| Section | Divider between two topics, often with a coloured background |
| Text | Heading and body — the common case. The body runs in one, two or three columns, and with the heading left empty this is the slide that is text alone |
| Freestyle | Nothing is arranged: every block stands where you dragged it in the preview, at the width and angle you gave it. A block nobody has touched simply flows |
| Image right / left | Text and image side by side |
| Full-bleed image | Image across the whole slide, text readable on top |
| Video | A heading with a YouTube player below it |
| QR code | Text with a QR code beside it, drawn from an address |
| Quote | Large quotation with an attribution |

Two columns and three used to be layouts of their own. The number is a
**field** of the text layout now: the layout tiles go dead as soon as a
slide has text on it, so a written slide could never have been moved from
two columns to three — which is the one change of mind this slide invites.
Decks that still say `data-layout="columns"` are read as before and repair
themselves the next time they are saved.

## The storage format

One folder per deck:

```
decks/quartalsbericht/deck.md
decks/quartalsbericht/assets/team.jpg
```

The folder is the unit you send or back up — Markdown and images together,
the image paths relative.

The file is compatible with reveal.js and `reveal-md`:

## Video on a slide

The *video* layout embeds a YouTube player. The editor's field takes
whatever is in the clipboard — a watch link, a youtu.be link, /shorts/,
/embed/, or the bare id — and what the file stores is the **id alone**:

## Background gradients

A slide takes a CSS gradient besides its background colour — the editor
offers swatches to click and, below them, a field for writing one by hand:


## Animated backgrounds

Besides a colour and a gradient a slide takes an *effect*. All four are
taken from a CodePen and reproduced rather than adapted:

| Effect | |
|---|---|
| `waves` | Three near-black discs, far larger than the slide, hanging in from above so that only the bottom of their rim is on show, each turning at its own speed. A turning rim rises and falls, which is the movement of water; three at different speeds are what keep it from reading as one turning disc. On its own blue ground. |
| `starfield` | Three star fields drifting upwards at three speeds — near stars quickly, far ones slowly, which is what makes the sky look deep. A field is a single pixel wearing a few hundred box-shadows, on a night-sky gradient. |
| `blobs` | Four shapes turning about two points, one pair in the upper left, one in the lower right, each of the pair at its own speed so they drift apart and together again. On yellow, and loud with it. The drawing is an inline SVG; its viewBox is smaller than the shapes on purpose, so they hang over the edges of the slide rather than sitting in it. |
| `stripes` | One diagonal edge between green and blue, laid down three times and slid left and right at three speeds that do not divide into one another, so the picture never repeats itself where anybody is looking. Each layer is half transparent, so where two edges cross a third colour appears — that crossing *is* the effect: one layer alone would be a wiping bar, three are a slow weather. On its own white ground, which the two colours are chosen to be seen against. |

## Code on a slide

A fenced code block in the Markdown comes out coloured — reveal.js' own
highlighter (highlight.js) does the work, and the language is whatever the
fence says:

```java hl=github
public int getAge() {
    return this.age;
}
```

## Licence

[MIT](LICENSE) — take it, change it, pass it on, commercially too; the
copyright notice has to come along.

Every dependency is permissively licensed as well (MIT, ISC, Apache-2.0,
BSD-3-Clause), none of them demands copyleft. reveal.js and
OverlayScrollbars are both MIT too and are only served here as static
files. For the planned move into Relay
that is the right direction: MIT code may travel into an AGPL project, the
other way round it could not.
