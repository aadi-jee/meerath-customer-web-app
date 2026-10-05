/* ORACY customer app - theme behaviour (CX-1).
 * Presentation only: it never reads or writes orders, prices or the cart.
 * The app redraws a screen by replacing its HTML, so everything here is
 * re-applied after each redraw. If this file fails to load, the app still
 * works; only the frozen-bar polish is lost. */
(function () {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  var queued = false;

  function currentScreen() {
    return document.querySelector("#app > .screen");
  }
  function setVar(el, name, value) {
    if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
  }
  function child(screen, selector) {
    for (var i = 0; i < screen.children.length; i++) {
      if (screen.children[i].matches(selector)) return screen.children[i];
    }
    return null;
  }

  function onScroll(screen) {
    screen.classList.toggle("cx-scrolled", screen.scrollTop > 6);
    var search = child(screen, ".home-search-wrap");
    if (search) {
      var stickAt = parseFloat(getComputedStyle(search).top) || 0;
      var padTop = parseFloat(getComputedStyle(screen).paddingTop) || 0;
      var stuck = screen.scrollTop > 6 &&
        search.getBoundingClientRect().top <= screen.getBoundingClientRect().top + padTop + stickAt + 0.5;
      screen.classList.toggle("cx-search-stuck", stuck);
    }
  }

  function syncTotals(screen) {
    var source = screen.querySelector(".breakdown .total span:last-child");
    if (!source) return;
    var text = source.textContent.trim();
    screen.querySelectorAll("[data-cx-total]").forEach(function (target) {
      if (target.textContent !== text) target.textContent = text;
    });
  }

  function measure() {
    queued = false;
    var screen = currentScreen();
    if (!screen) return;
    var style = getComputedStyle(screen);
    setVar(screen, "--cx-pad-l", style.paddingLeft);
    setVar(screen, "--cx-pad-r", style.paddingRight);
    setVar(screen, "--cx-pad-t", style.paddingTop);
    var bar = child(screen, ".topbar");
    var row = child(screen, ".orders-tabs, .menu-subcategories");
    screen.classList.toggle("cx-has-subrow", !!(bar && row));
    if (bar && row) {
      var barTop = parseFloat(getComputedStyle(bar).top) || 0;
      setVar(screen, "--cx-subrow-top", Math.round(barTop + bar.offsetHeight + 8) + "px");
      setVar(screen, "--cx-subrow-h", row.offsetHeight + "px");
    }
    onScroll(screen);
    syncTotals(screen);
  }
  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || window.setTimeout)(measure, 16);
  }

  function start() {
    var app = document.getElementById("app");
    if (!app) return;
    if (typeof MutationObserver === "function") {
      new MutationObserver(schedule).observe(app, {childList: true, subtree: true, characterData: true});
    }
    document.addEventListener("scroll", function (event) {
      var target = event.target;
      if (target && target.parentNode === app && target.classList && target.classList.contains("screen")) onScroll(target);
    }, {capture: true, passive: true});
    window.addEventListener("resize", schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
