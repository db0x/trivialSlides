---
titel: Example
theme: white
transition: convex
---

<!-- .slide: data-layout="titel" data-background-gradient="linear-gradient(160deg, #0b3d4c 0%, #2b3a55 100%)" data-text-color="#ffffff" -->

# Example

Every <span style="color:#e100ff">slide</span> layout, once 👀
<!-- .element: class="align-center" -->

---

<!-- .slide: data-layout="abschnitt" data-background-color="#122233" -->

# Section divider

---

## Text

The common case: a heading and a body. This is a paragraph with **bold**
and *italic* text, and a [link](https://revealjs.com).

- Lists work the way you expect
- Every point is plain Markdown
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
to get here.
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

<!-- .slide: data-layout="spalten" data-columns="split" -->

## Two columns

- Mercury
- Venus
- Earth
- Mars

<!-- .column -->

- Jupiter
- Saturn
- Uranus
<!-- .element: class="fragment" -->
- Neptune
<!-- .element: class="fragment" -->

---

<!-- .slide: data-layout="spalten-drei" data-columns="split" data-title-align="center" -->

## Three columns

- C
- C++
- C#
- Rust
- Go

<!-- .column -->

- Java
- Kotlin
- Scala
- Groovy

<!-- .column -->

- Basic
- VB
- JavaScript

---

<!-- .slide: data-layout="bild-rechts" data-image="chart.svg" -->

## Image on the right

Text on one side, a picture on the other. The markup stays in reading
order — which column the image lands in is decided by the CSS alone.

---

<!-- .slide: data-layout="bild-links" data-image="chart.svg" data-title-align="right" -->

## Image on the left

The same layout mirrored. Nothing about the slide's text changes, only its
`data-layout` attribute.

---

<!-- .slide: data-layout="bild-voll" data-image="1.svg" data-title-align="left" -->

## Full-bleed image

⭐ The picture covers the whole slide, the text stays readable on top of it.

---

## Code

getAge()

```java hl=github
public int getAge() {
    return this.age;
}
```

getFactor()

```java hl=github
static final int getFactor() {
    return 1;
}
```
<!-- .element: class="fragment" -->

---

<!-- .slide: data-layout="zitat" data-quelle="Antoine de Saint-Exupéry" data-background-gradient="radial-gradient(circle at 50% 30%, #2b3a55 0%, #1b1f23 70%)" data-text-color="#ffffff" -->

## Quote

> Perfection is achieved, not when there is nothing more to add, but when
> there is nothing left to take away.

----

<!-- .slide: data-layout="qr" data-url="https://github.com/db0x/trivialSlides" data-qr-color="#ffffff" data-qr-background="#ffffff00" data-text-color="#ffffff" -->

##

## That was all of them
