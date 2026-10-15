(function () {
  "use strict";

  var root = document.documentElement;
  var progress = document.getElementById("scroll-progress");
  var menuButton = document.getElementById("menu-toggle");
  var menu = document.getElementById("nav-links");
  var fxButton = document.getElementById("fx-toggle");
  var fxLabel = document.getElementById("fx-label");
  var canvas = document.getElementById("starfield");
  var ctx = canvas && canvas.getContext ? canvas.getContext("2d", { alpha: true }) : null;
  var motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var motionOn = !motionPreference.matches && !saveData;
  var frame = 0;
  var lastFrame = 0;
  var stars = [];
  var width = 0;
  var height = 0;
  var heroVisible = true;
  var scrollPending = false;
  var pointerX = 0;
  var pointerY = 0;
  var revealElements = document.querySelectorAll(".reveal");
  var revealObserver = null;

  function showAllReveals() {
    root.classList.remove("motion-ready");
    revealElements.forEach(function (el) { el.classList.add("visible"); });
  }

  if ("IntersectionObserver" in window && motionOn) {
    root.classList.add("motion-ready");
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.04, rootMargin: "0px 0px -4% 0px" });
    revealElements.forEach(function (el) { revealObserver.observe(el); });
  } else {
    showAllReveals();
  }

  function stopStars() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (ctx) ctx.clearRect(0, 0, width, height);
  }

  function prepareStars() {
    if (!ctx) return;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = saveData ? 22 : width < 760 ? 55 : 125;
    stars = Array.from({ length: count }, function () {
      return {
        angle: Math.random() * Math.PI * 2,
        radius: Math.sqrt(Math.random()),
        depth: 0.22 + Math.random() * 0.75,
        size: 0.4 + Math.random() * 1.55,
        phase: Math.random() * Math.PI * 2
      };
    });
  }

  function drawStars(time) {
    frame = 0;
    if (!motionOn || !ctx || !heroVisible || document.hidden) return;
    var targetFrameInterval = width < 760 ? 34 : 24;
    if (time - lastFrame < targetFrameInterval) {
      frame = requestAnimationFrame(drawStars);
      return;
    }
    lastFrame = time;
    ctx.clearRect(0, 0, width, height);
    var centerX = width * (width < 760 ? 0.67 : 0.78) - pointerX * 18;
    var centerY = height * 0.44 - pointerY * 16;
    var radius = Math.max(width, height) * 0.83;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var advance = (time * 0.000014 * (s.depth + 0.3)) % 1;
      var distance = ((s.radius + advance) % 1) * radius;
      var x = centerX + Math.cos(s.angle) * distance;
      var y = centerY + Math.sin(s.angle) * distance * 0.69;
      if (x < 0 || x > width || y < 0 || y > height) continue;
      var opacity = Math.max(0.11, Math.min(0.76, (0.48 + 0.3 * Math.sin(time * 0.0007 + s.phase)) * (distance / radius + 0.15)));
      ctx.globalAlpha = opacity;
      ctx.fillStyle = i % 10 === 0 ? "#c4ff4a" : i % 4 === 0 ? "#dbadff" : "#f1e6ff";
      ctx.beginPath();
      ctx.arc(x, y, s.size * (0.6 + distance / radius), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    frame = requestAnimationFrame(drawStars);
  }

  function startStars() {
    if (ctx && motionOn && heroVisible && !document.hidden && !frame) frame = requestAnimationFrame(drawStars);
  }

  function setMotion(enabled) {
    motionOn = !!enabled && !motionPreference.matches && !saveData;
    root.classList.toggle("fx-off", !motionOn);
    if (fxButton) fxButton.setAttribute("aria-pressed", String(motionOn));
    if (fxLabel) fxLabel.textContent = motionOn ? "FX ON" : "FX OFF";
    if (motionOn) startStars();
    else {
      stopStars();
      root.style.setProperty("--hero-shift", "0px");
      root.style.setProperty("--interlude-shift", "0px");
      root.style.setProperty("--mouse-x", "0px");
      root.style.setProperty("--mouse-y", "0px");
      showAllReveals();
    }
  }

  if (fxButton) {
    fxButton.addEventListener("click", function () {
      if (saveData || motionPreference.matches) return;
      setMotion(!motionOn);
    });
    if (saveData || motionPreference.matches) {
      fxButton.title = "Visual effects disabled by your motion or data-saving preferences";
    }
  }
  function handleMotionPreference() { setMotion(!motionPreference.matches); }
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", handleMotionPreference);
  else if (motionPreference.addListener) motionPreference.addListener(handleMotionPreference);

  if (menu && menuButton) {
    function closeMenu() {
      menu.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open menu");
    }
    menuButton.addEventListener("click", function () {
      var opened = menu.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(opened));
      menuButton.setAttribute("aria-label", opened ? "Close menu" : "Open menu");
    });
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 760) closeMenu();
    }, { passive: true });
  }

  function updateScroll() {
    scrollPending = false;
    var y = window.scrollY || window.pageYOffset || 0;
    var scrollRange = Math.max(1, root.scrollHeight - window.innerHeight);
    if (progress) progress.style.transform = "scaleX(" + Math.min(1, y / scrollRange) + ")";
    if (motionOn) {
      root.style.setProperty("--hero-shift", Math.min(300, y * 0.23).toFixed(1) + "px");
      var section = document.querySelector(".interlude");
      if (section) {
        var bounds = section.getBoundingClientRect();
        var midpoint = bounds.top + bounds.height / 2;
        var offset = (window.innerHeight / 2 - midpoint) * 0.06;
        root.style.setProperty("--interlude-shift", Math.max(-45, Math.min(45, offset)).toFixed(1) + "px");
      }
    }
  }
  window.addEventListener("scroll", function () {
    if (!scrollPending) {
      scrollPending = true;
      requestAnimationFrame(updateScroll);
    }
  }, { passive: true });

  if (finePointer.matches) {
    window.addEventListener("pointermove", function (event) {
      if (!motionOn) return;
      pointerX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointerY = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      root.style.setProperty("--mouse-x", (pointerX * 13).toFixed(2) + "px");
      root.style.setProperty("--mouse-y", (pointerY * 11).toFixed(2) + "px");
    }, { passive: true });

    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        if (!motionOn) return;
        var box = card.getBoundingClientRect();
        var x = (event.clientX - box.left) / box.width;
        var y = (event.clientY - box.top) / box.height;
        card.style.setProperty("--card-ry", ((x - 0.5) * 7).toFixed(2) + "deg");
        card.style.setProperty("--card-rx", ((0.5 - y) * 7).toFixed(2) + "deg");
        card.style.setProperty("--pointer-x", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--pointer-y", (y * 100).toFixed(1) + "%");
      }, { passive: true });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--card-rx", "0deg");
        card.style.setProperty("--card-ry", "0deg");
      });
    });
  }

  var signalData = {
    community: ["001", "FREQUENCY 001 // CONNECT", "FIND YOUR PEOPLE.", "Hang out, squad up, discover shared interests, and build a community that feels like your corner of the internet."],
    shield: ["002", "FREQUENCY 002 // PROTECT", "GOOD VIBES. SMART GUARDRAILS.", "Dank Shield combines Discord moderation, onboarding, roles, profiles, sharing, and community management into one toolkit."],
    cinema: ["003", "FREQUENCY 003 // WATCH", "MAKE IT A MOVIE NIGHT.", "Dank Cinema adds a shared entertainment dimension to the community. Pick a screen, bring your people, and make a night of it."],
    minecraft: ["004", "FREQUENCY 004 // BUILD", "GET LOST IN A NEW WORLD.", "The 420 Server connects Java and Bedrock players for survival, exploring, building, and creating stories together."]
  };
  var tabs = Array.from(document.querySelectorAll(".signal-tab"));
  var panel = document.getElementById("signal-panel");

  function selectSignal(name, focusTab) {
    if (!Object.prototype.hasOwnProperty.call(signalData, name)) return;
    var data = signalData[name];
    var ids = ["signal-code", "signal-kicker", "signal-headline", "signal-description"];
    for (var i = 0; i < ids.length; i++) {
      var element = document.getElementById(ids[i]);
      if (element) element.textContent = data[i];
    }
    tabs.forEach(function (tab) {
      var selected = tab.getAttribute("data-signal") === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle("active", selected);
      if (selected && focusTab) tab.focus();
    });
    if (panel) panel.setAttribute("aria-labelledby", "tab-" + name);
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      selectSignal(tab.getAttribute("data-signal"), false);
    });
    tab.addEventListener("keydown", function (event) {
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].indexOf(event.key) === -1) return;
      event.preventDefault();
      var next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      selectSignal(tabs[next].getAttribute("data-signal"), true);
    });
  });

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  if (ctx) {
    prepareStars();
    window.addEventListener("resize", function () {
      prepareStars();
      startStars();
    }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopStars();
      else startStars();
    });
    if ("IntersectionObserver" in window) {
      var hero = document.querySelector(".hero");
      if (hero) {
        var heroObserver = new IntersectionObserver(function (entries) {
          heroVisible = entries[0].isIntersecting;
          if (heroVisible) startStars();
          else stopStars();
        }, { threshold: 0 });
        heroObserver.observe(hero);
      }
    }
  }

  selectSignal("community", false);
  setMotion(motionOn);
  updateScroll();
})();