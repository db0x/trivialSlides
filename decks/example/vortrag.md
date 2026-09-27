---
titel: Example
theme: white
transition: concave
---

<!-- .slide: data-layout="titel" -->

# Example

Every slide layout, once

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

Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.
<!-- .element: class="fragment" -->

----

## A vertical slide

Four dashes instead of three attach a slide *below* the previous one
rather than after it. reveal.js calls that a stack; press the down arrow
to get here.

---

<!-- .slide: data-layout="video" data-video="4ApMS8qYWo0" data-textseite="rechts" data-textbreite="25" data-background-effect="starfield" data-text-color="#ffffff" -->

Lorem ipsum dolor sit amet,

consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat,

sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum.

---

<!-- .slide: data-layout="spalten" -->

## Two columns

- Mercury
- Venus
- Earth
- Mars
- Jupiter
- Saturn
- Uranus
<!-- .element: class="fragment" -->
- Neptune
<!-- .element: class="fragment" -->

---

<!-- .slide: data-layout="spalten-drei" -->

## Three columns

- C
- C++
- Java
- JavaScript
- C#
- Rust
- Go
- Pascal
- COBOL

---

<!-- .slide: data-layout="bild-rechts" data-image="chart.svg" -->

## Image on the right

Text on one side, a picture on the other. The markup stays in reading
order — which column the image lands in is decided by the CSS alone.

---

<!-- .slide: data-layout="bild-links" data-image="chart.svg" -->

## Image on the left

The same layout mirrored. Nothing about the slide's text changes, only its
`data-layout` attribute.

---

<!-- .slide: data-layout="bild-voll" data-image="1.svg" -->

## Full-bleed image

The picture covers the whole slide, the text stays readable on top of it.

---

## Code

getAge()
<!-- .element: class="fragment" -->

```java hl=github
public int getAge() {
    return this.age;
}
```
<!-- .element: class="fragment" -->

getFactor()
<!-- .element: class="fragment" -->

```java hl=github
static final int getFactor() {
    return 1;
}
```
<!-- .element: class="fragment" -->

---

<!-- .slide: data-layout="zitat" data-quelle="Antoine de Saint-Exupéry" -->

## Quote

> Perfection is achieved, not when there is nothing more to add, but when
> there is nothing left to take away.

----

<!-- .slide: data-layout="abschnitt" data-background-effect="starfield" data-text-color="#ffffff" -->

# That was all of them
