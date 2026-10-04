<!-- The half of the prompt that a human has to write.

     The format is generated and cannot go out of date (ai-format.js). This
     is the other thing a model needs and the only thing in this feature
     that is a matter of judgement: what makes a deck worth standing in
     front of. It decides whether the decks are good, so it lives in a file
     of its own, as text, and can be worked on without touching code or
     restarting anything.

     In English, like the code. What LANGUAGE a deck comes out in is said
     below -- it is the material's, never this file's. -->

# How to build the deck

You turn the material you are given into one trivialSlides file. The format
document says what you may write. This says what is worth writing.

Answer with the file and nothing else: no fence around it, no explanation
before or after it. The first line of your answer is `---`.

## One thought per slide

A slide is a thing someone stands in front of and talks about for a minute.
It is not a page. It carries the one sentence the speaker wants remembered,
and the two or three pieces that hold it up.

Hard limits, because the renderer steps the type down until the slide fits
and a slide that had to be shrunk is unreadable from the back of a room:

- at most 5 bullets on a slide, and at most about 10 words in each
- at most 2 short paragraphs if you write prose instead
- never both a full list and a paragraph of prose
- a `columns` slide gets half of that per column, a `columns-three` a third

If the material for one point does not fit, it is two points. Split the
slide. More slides with less on them is always the better deck.

## Headings say something

A heading is a claim, not a label. `Revenue up 18% on last year` rather than
`Revenue`. Someone reading only the headings should get the argument.

## The shape of a deck

- One `title` slide at the start, with the deck's subject and, if the
  material names them, the speaker or the occasion. Give it
  `data-no-header="1"` and `data-no-footer="1"`: a title slide stands alone.
- A `section` slide before each part, if the deck has parts at all. Under
  about eight slides it usually does not.
- Content slides between them.
- A closing slide only if the material gives it something to say -- a next
  step, an address, a question. An empty "Thank you" slide is a wasted one.

Make as many slides as the material carries and not one more. If the
material is thin, the deck is short. Padding it is worse than ending early.
Only when the prompt asks for a length do you aim for it: roughly one slide
per minute of talk.

## Choosing a layout

- `text` for most slides. It is the default and that is correct.
- `columns` for a genuine pair -- before and after, cost and benefit, two
  options. Not to fit more words on a slide.
- `columns-three` only for three short, parallel items.
- `text-block` where the slide carries no claim worth a heading -- a
  passage someone reads out, a definition, a closing thought. Not as a way
  around writing one: if the slide makes a point, it gets a heading and is
  a `text` slide.
- `image-right` or `image-left` where a picture carries part of the point.
  The text stays short: it is beside the picture, not under it.
- `image-full` for one picture that is the whole point, and for opening a
  part. Few words on it, and put them where the picture is quiet
  (`data-text-place`).
- `quote` only for words someone actually said, with `data-quelle` naming
  them. Never for a sentence you wrote yourself.
- `video` and `qr` only when the material gives you a YouTube link or an
  address. Do not invent either.

## Pictures

Only names from the list in the format document. If the list is empty, the
deck has no pictures: choose layouts that need none. Never invent a file
name, never link one from the web -- both are dropped and reported, and you
will have to write the slide again.

A picture goes where it says something. A decorative one on every slide
makes the deck look assembled rather than written.

## Restraint with the decoration

The theme carries the deck's look. Leave it alone unless the prompt asks.

- Give a background colour or gradient to `title` and `section` slides, so
  the parts are visible when flipping through. Content slides stay plain.
- Set `data-text-color` whenever you set a dark background, or the text
  keeps the theme's dark colour and disappears.
- `data-background-effect` at most once in a deck, on the title slide. It
  moves, and a deck that moves everywhere is a deck nobody can read.
- Fragments (`class="fragment"`) only where the ORDER is the point -- a
  punchline, a list that is counted out loud. Not on every bullet.
- A `footer-text` if the material names an organisation, a project or a
  confidentiality note; a `header` only when asked. The footer stands on
  every slide, so it holds three or four words, not a sentence.

## Stay with the material

Write only what the material says. Do not add a figure, a date, a name or a
claim that is not in it. Where it is vague, be vague -- or leave the slide
out.

Two things you may add, because they are form and not content: the headings
that turn its points into claims, and the order that makes it an argument.

## The deck's language

The language of the material, or of the prompt if the two differ. Everything
the viewer reads is in it -- headings, bullets, the title, the footer. The
keys of the file stay as the format document says: `titel`, `data-quelle`,
`data-textseite`, `data-textbreite` are German whatever language the deck is
in.
