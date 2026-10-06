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
    spyMenu(screen);
  }

  // CX-4 scroll-spy: the row of category buttons marks the section being read
  // and keeps that button in view.
  function spyMenu(screen) {
    var bar = child(screen, ".cx-catbar");
    if (!bar) return;
    var top = screen.getBoundingClientRect().top;
    var barBox = bar.getBoundingClientRect();
    var padTop = parseFloat(getComputedStyle(screen).paddingTop) || 0;
    var stickAt = parseFloat(getComputedStyle(bar).top) || 0;
    screen.classList.toggle("cx-cat-stuck", screen.scrollTop > 6 && barBox.top <= top + padTop + stickAt + 0.5);
    var sections = screen.querySelectorAll("[data-sec]");
    if (!sections.length) return;
    var key = sections[0].getAttribute("data-sec");
    var jump = window.cxMenuJump;
    if (jump && Date.now() < jump.until) key = jump.key;
    else if (screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 2 && screen.scrollTop > 6) key = sections[sections.length - 1].getAttribute("data-sec");
    else {
      var line = barBox.bottom + 28;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) key = sections[i].getAttribute("data-sec");
      }
    }
    var chips = bar.querySelectorAll("[data-chip]");
    for (var n = 0; n < chips.length; n++) {
      var chip = chips[n], on = chip.getAttribute("data-chip") === key;
      if (on === chip.classList.contains("on") && bar.getAttribute("data-cx-on") === key) continue;
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
      if (on && bar.getAttribute("data-cx-on") !== key) {
        bar.setAttribute("data-cx-on", key);
        var left = bar.scrollLeft + chip.getBoundingClientRect().left - barBox.left - (barBox.width - chip.offsetWidth) / 2;
        if (bar.scrollTo) bar.scrollTo({left: left, behavior: calm() ? "auto" : "smooth"});
      }
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

  // Photos fade in when they arrive; a cached photo shows at once.
  function watchImages(screen) {
    screen.querySelectorAll("img:not([data-cx-img])").forEach(function (img) {
      img.setAttribute("data-cx-img", "1");
      if (img.complete) return;
      img.classList.add("cx-img-wait");
      var show = function () { img.classList.remove("cx-img-wait"); };
      img.addEventListener("load", show, {once: true});
      img.addEventListener("error", show, {once: true});
    });
  }

  // The cart count gives a small bump when it goes up.
  var lastCartCount = null;
  function bumpCart() {
    var badge = document.querySelector(".cart-count-badge");
    var count = badge ? parseInt(badge.textContent, 10) || 0 : 0;
    if (lastCartCount !== null && count > lastCartCount) {
      document.querySelectorAll(".cart-count-badge").forEach(function (el) {
        el.classList.remove("cx-bump");
        void el.offsetWidth;
        el.classList.add("cx-bump");
      });
    }
    lastCartCount = count;
  }

  // A screen plays its entrance once, when the customer arrives; a redraw of the same screen does not.
  var lastScreenKey = "";
  function markEntrance(screen) {
    var key = screen.className.replace(/\s*cx-[\w-]+/g, "");
    if (key !== lastScreenKey) screen.classList.add("cx-enter");
    lastScreenKey = key;
  }

  // Smart cart dock: slide up on first arrival, answer an "add" with one pulse,
  // a new thumbnail and a count-up of the amount. The final text is always the app's own.
  var dockCount = null, dockTotal = 0, dockRun = 0;
  function calm() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function countUp(el, from, to, finalText) {
    var run = ++dockRun, started = null, span = 520;
    if (!/\d/.test(finalText) || from === to) return;
    function frame(now) {
      if (run !== dockRun || !el.isConnected) return;
      if (started === null) started = now;
      var p = Math.min(1, (now - started) / span), eased = 1 - Math.pow(1 - p, 3);
      var text = p >= 1 ? finalText : finalText.replace(/\d[\d.,]*/, (from + (to - from) * eased).toFixed(2));
      if (el.textContent !== text) el.textContent = text;
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }
  function tendDock(screen) {
    var dock = child(screen, ".cx-cart-bar");
    if (!dock) return;                       // this screen has no dock: keep what we knew
    var count = parseInt(dock.getAttribute("data-count"), 10) || 0;
    var total = parseFloat(dock.getAttribute("data-total")) || 0;
    if (dockCount !== null && !calm() && !dock.hidden && window.requestAnimationFrame) {
      if (dockCount === 0 && count > 0) dock.classList.add("cx-dock-in");
      if (count > dockCount) {
        dock.classList.add("cx-dock-added");
        var amount = dock.querySelector(".cx-dock-total");
        if (amount && dockCount > 0) countUp(amount, dockTotal, total, amount.textContent);
      }
    }
    dockCount = count;
    dockTotal = total;
  }

  function measure() {
    queued = false;
    var screen = currentScreen();
    if (!screen) return;
    markEntrance(screen);
    var style = getComputedStyle(screen);
    setVar(screen, "--cx-pad-l", style.paddingLeft);
    setVar(screen, "--cx-pad-r", style.paddingRight);
    setVar(screen, "--cx-pad-t", style.paddingTop);
    setVar(screen, "--cx-pad-b", style.paddingBottom);
    var bar = child(screen, ".topbar");
    var row = child(screen, ".orders-tabs, .menu-subcategories, .cx-catbar");
    screen.classList.toggle("cx-has-subrow", !!(bar && row));
    if (bar && row) {
      var barTop = parseFloat(getComputedStyle(bar).top) || 0;
      setVar(screen, "--cx-subrow-top", Math.round(barTop + bar.offsetHeight + 8) + "px");
      setVar(screen, "--cx-subrow-h", row.offsetHeight + "px");
    }
    onScroll(screen);
    syncTotals(screen);
    tendDock(screen);
    watchImages(screen);
    bumpCart();
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
