// The overview page: everything around creating a new deck.
//
// The dialog is a plain <dialog>, so Escape, the backdrop and focus
// handling come from the browser rather than from here.
(function () {
  var button = document.getElementById("deck-fresh");
  var dialog = document.getElementById("fresh-dialog");
  var field = document.getElementById("fresh-title");
  if (!button || !dialog) return;

  button.addEventListener("click", function () {
    dialog.showModal();
    // Straight into the field: the dialog exists for this one input, so
    // anyone opening it can start typing right away.
    if (field) { field.value = ""; field.focus(); }
  });

  // "Cancel" must not submit the form it sits in, hence a button of its own
  // rather than a second method="dialog" form around the buttons.
  dialog.addEventListener("click", function (ev) {
    if (ev.target.closest("[data-close]")) dialog.close();
  });
})();
