/* ALBUKHR Admin Core Workspace — Project Updates link status.
 * Presentation-only helper. All authority remains in Admin Auth and the API.
 */
(function (window, document) {
  "use strict";

  function attach() {
    const state = document.getElementById("updatesState");
    const link = document.getElementById("openProjectUpdatesLink");
    if (!state || !link) return;

    const markReady = function () {
      const label = "PUBLISHER GATEWAY AVAILABLE";
      if (state.textContent !== label) state.textContent = label;
      state.classList.remove("locked");
    };

    markReady();
    const observer = new MutationObserver(markReady);
    observer.observe(state, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }
})(window, document);
