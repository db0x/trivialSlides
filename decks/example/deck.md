---
titel: Example
theme: simple
transition: convex
generator: trivialSlides
min-version: 0.10.1
footer-text: trivialSlides
footer-logo: trivialslides.svg
footer-logo-place: left
footer-no-rule: 1
---

<!-- .slide: data-layout="title" data-no-footer="1" data-background-gradient="linear-gradient(160deg, #0b3d4c 0%, #2b3a55 100%)" data-text-color="#ffffff" -->

# Example

Every <span style="color:#e100ff">slide</span> layout, once 👀
<!-- .element: class="align-center" -->

---

<!-- .slide: data-layout="section" data-background-color="#122233" -->

# Section divider

---

<!-- .slide: data-layout="freestyle" data-background-effect="starfield" data-text-color="#ffffff" -->

- FREESTYLE ...
- syxdcvsdx
- lala
- test

<!-- .element: data-at="5,31,28" data-turn="350" -->

# Test
<!-- .element: data-at="37,34,26" data-turn="20" -->

![](trivialslides.svg)
<!-- .element: data-at="82,11,15" data-turn="345" -->

---

## Text

The common case: a heading and a body. This is a paragraph with **bold**
and *italic* text, and a [link](https://revealjs.com).

- Lists work the way you expect
- Every point is plain Markdown
- TEST
- This one only appears on click
<!-- .element: class="fragment" -->

<!-- .element: class="align-left" -->

Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.
<!-- .element: class="fragment align-fill" -->

----

<!-- .slide: data-title-align="center" -->

## A vertical slide

Four dashes instead of three attach a slide *below* the previous one
rather than after it. reveal.js calls that a stack; press the down arrow
to get here. 🙃
<!-- .element: class="align-center" -->

---

<!-- .slide: data-layout="video" data-video="4ApMS8qYWo0" data-textseite="rechts" data-textbreite="25" data-background-effect="starfield" data-text-color="#ffffff" -->

Lorem ipsum dolor sit amet,
<!-- .element: class="align-left" -->

consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat,
<!-- .element: class="align-left" -->

sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum.
<!-- .element: class="align-left" -->

---

<!-- .slide: data-columns="split" data-column-count="2" -->

## Two columns

- Mercury
- Venus
- Earth
- Mars

<!-- .column -->

- Jupiter
- Saturn
- Uranus
- Neptune

---

<!-- .slide: data-columns="split" data-column-count="3" data-title-align="center" -->

## Three columns

- C
<!-- .element: data-at="80,60,11" data-turn="20" -->

- C++
<!-- .element: class="fragment" data-fragment-index="0" -->
- C#
<!-- .element: class="fragment" data-fragment-index="0" -->
- Rust
<!-- .element: class="fragment" data-fragment-index="0" -->
- Go
<!-- .element: class="fragment" data-fragment-index="0" -->

<!-- .column -->

- Java
<!-- .element: class="fragment" data-fragment-index="1" -->
- Kotlin
<!-- .element: class="fragment" data-fragment-index="1" -->
- Scala
<!-- .element: class="fragment" data-fragment-index="1" -->
- Groovy
<!-- .element: class="fragment" data-fragment-index="1" -->

<!-- .column -->

- Basic
<!-- .element: class="fragment" data-fragment-index="2" -->
- VB
<!-- .element: class="fragment" data-fragment-index="2" -->
- JavaScript
<!-- .element: class="fragment" data-fragment-index="2" -->

---

<!-- .slide: data-layout="image-right" data-image="chart.svg" data-textbreite="66" -->

## Image on the right

Text on one side, a picture on the other. The markup stays in reading
order — which column the image lands in is decided by the CSS alone.

---

<!-- .slide: data-layout="image-left" data-image="floppy-black.svg" data-textbreite="75" data-title-align="right" -->

## Image on the left

The same layout mirrored. Nothing about the slide's text changes, only its
`data-layout` attribute.

---

<!-- .slide: data-layout="image-full" data-image="background.svg" data-title-align="center" -->

## Full-bleed image

⭐ The picture covers the whole slide, the text stays readable on top of it.
<!-- .element: class="align-fill" -->

---

## Code

getAge()

```java hl=github
public int getAge() {
    return this.age * getFactor();
}
```

<!-- .group: class="fragment" -->

getFactor()

```java hl=github
private int getFactor() {
    return 5;
}
```

<!-- /.group -->

---

<!-- .slide: data-background-gradient="linear-gradient(200deg, #2f4f3a 0%, #1b1f23 100%)" data-text-color="#ffffff" -->

Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.
<!-- .element: class="align-fill" -->

Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et iusto odio dignissim qui blandit praesent luptatum zzril delenit augue duis dolore te feugait nulla facilisi. Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat.
<!-- .element: class="align-fill" -->

Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et iusto odio dignissim qui blandit praesent luptatum zzril delenit augue duis dolore te feugait nulla facilisi.
<!-- .element: class="align-fill" -->

Nam liber tempor cum soluta nobis eleifend option congue nihil imperdiet doming id quod mazim placerat facer possim assum. Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.
<!-- .element: class="align-fill" -->

Duis autem vel eum iriure dolor in hendrerit in
<!-- .element: class="align-fill" -->

---

<!-- .slide: data-layout="quote" data-quelle="Antoine de Saint-Exupéry" data-background-gradient="radial-gradient(circle at 50% 30%, #2b3a55 0%, #1b1f23 70%)" data-text-color="#ffffff" -->

## Quote

> Perfection is achieved, not when there is nothing more to add, but when
> there is nothing left to take away.

----

<!-- .slide: data-layout="qr" data-url="https://github.com/db0x/trivialSlides" data-qr-color="#ffffff" data-qr-background="#ffffff00" data-no-footer="1" data-background-effect="starfield" data-text-color="#ffffff" -->

##

## That was all of them 🏁
