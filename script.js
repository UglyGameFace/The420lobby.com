/* The 420 Lobby v3: scroll story, UI, parallax and safe animation controls. */
(function () {
  "use strict";
  const root = document.documentElement;
  const fxButton = document.getElementById("fx-toggle");
  const fxLabel = document.getElementById("fx-label");
  const menuButton = document.getElementById("menu-toggle");
  const menu = document.getElementById("primary-nav");
  const progress = document.getElementById("scroll-progress");
  const hero = document.getElementById("hero-scene");
  const reality = document.getElementById("after-dark");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const elements = document.querySelectorAll(".entrance, .reveal");
  const atmosphere = window.LobbyAtmosphere;
  let effects = !motionPreference.matches && !saveData;
  let scheduledScroll = false;
  let pointer = [0,0];
  let observer = null;

  function unhide() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    root.classList.remove("motion-ready");
    elements.forEach(function(element) { element.classList.add("visible"); });
  }

  function installReveal() {
    if (!effects || !("IntersectionObserver" in window)) {
      unhide();
      return;
    }
    if (observer) observer.disconnect();
    elements.forEach(function(element) { element.classList.remove("visible"); });
    observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, {threshold:0.04,rootMargin:"0px 0px -3% 0px"});
    root.classList.add("motion-ready");
    elements.forEach(function(element) { observer.observe(element); });
  }

  function setEffects(value) {
    effects = !!value && !motionPreference.matches && !saveData;
    root.classList.toggle("fx-off", !effects);
    if (fxButton) {
      fxButton.setAttribute("aria-pressed", String(effects));
      fxButton.disabled = motionPreference.matches || saveData;
      fxButton.title = fxButton.disabled ? "Effects disabled by reduced-motion or data-saving preference" : "Toggle animations";
    }
    if (fxLabel) fxLabel.textContent = effects ? "EFFECTS ON" : (motionPreference.matches || saveData ? "LOW MOTION" : "EFFECTS OFF");
    if (atmosphere) atmosphere.setEnabled(effects);
    if (effects) installReveal();
    else unhide();
    updateScroll();
  }

  if (fxButton) fxButton.addEventListener("click", function(){ setEffects(!effects); });
  function onMotionChange() { setEffects(!motionPreference.matches); }
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", onMotionChange);
  else if (motionPreference.addListener) motionPreference.addListener(onMotionChange);

  if (menu && menuButton) {
    function closeMenu() {
      menu.classList.remove("open");
      menuButton.setAttribute("aria-expanded","false");
      menuButton.setAttribute("aria-label","Open navigation");
    }
    menuButton.addEventListener("click", function() {
      const open = menu.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });
    menu.querySelectorAll("a").forEach(function(link) { link.addEventListener("click",closeMenu); });
    document.addEventListener("keydown", function(event) { if (event.key === "Escape") closeMenu(); });
    window.addEventListener("resize", function() { if (window.innerWidth > 1050) closeMenu(); }, {passive:true});
  }

  function updateScroll() {
    scheduledScroll = false;
    const scrollTop = Math.max(0,window.scrollY || window.pageYOffset || 0);
    const maxScroll = Math.max(1,root.scrollHeight-window.innerHeight);
    if (progress) progress.style.transform = "scaleX("+Math.min(1,scrollTop/maxScroll)+")";
    if (!effects) {
      root.style.setProperty("--hero-shift","0px");
      root.style.setProperty("--rotation","0deg");
      root.style.setProperty("--twist","0deg");
      root.style.setProperty("--reality-y","0px");
      root.style.setProperty("--leaf-x","0px");
      root.style.setProperty("--leaf-y","0px");
      if (atmosphere) atmosphere.setScroll(0);
      return;
    }
    const position = Math.min(1.5,scrollTop/Math.max(window.innerHeight,1));
    root.style.setProperty("--hero-shift",(position*105).toFixed(1)+"px");
    if (atmosphere) atmosphere.setScroll(Math.min(1,position));
    if (reality) {
      const rect = reality.getBoundingClientRect();
      const progress = Math.max(-1,Math.min(1,(window.innerHeight*.5-(rect.top+rect.height*.5))/(Math.max(window.innerHeight,1))));
      root.style.setProperty("--rotation",(progress*22).toFixed(2)+"deg");
      root.style.setProperty("--twist",(progress*17).toFixed(2)+"deg");
      root.style.setProperty("--reality-y",(progress*55).toFixed(1)+"px");
      root.style.setProperty("--leaf-y",(progress*125).toFixed(1)+"px");
      root.style.setProperty("--leaf-x",(progress*-55).toFixed(1)+"px");
    }
  }

  window.addEventListener("scroll", function() {
    if (!scheduledScroll) {
      scheduledScroll = true;
      requestAnimationFrame(updateScroll);
    }
  }, {passive:true});

  if (finePointer.matches) {
    window.addEventListener("pointermove", function(event) {
      if (!effects) return;
      pointer = [
        event.clientX/Math.max(1,window.innerWidth)*2-1,
        event.clientY/Math.max(1,window.innerHeight)*2-1
      ];
      if (hero) {
        root.style.setProperty("--x",(pointer[0]*9).toFixed(1)+"px");
        root.style.setProperty("--y",(pointer[1]*9).toFixed(1)+"px");
        hero.querySelectorAll(".scene-layer[data-depth]").forEach(function(layer) {
          const amount = Number(layer.getAttribute("data-depth")) || 0;
          layer.style.setProperty("--px",(pointer[0]*amount*24).toFixed(1)+"px");
          layer.style.setProperty("--py",(pointer[1]*amount*20).toFixed(1)+"px");
        });
      }
    }, {passive:true});
    document.querySelectorAll(".interactive-card").forEach(function(card) {
      card.addEventListener("pointermove",function(event) {
        if (!effects) return;
        const b = card.getBoundingClientRect();
        const x = (event.clientX-b.left)/Math.max(1,b.width);
        const y = (event.clientY-b.top)/Math.max(1,b.height);
        card.style.setProperty("--ry",((x-.5)*7).toFixed(2)+"deg");
        card.style.setProperty("--rx",((.5-y)*7).toFixed(2)+"deg");
        card.style.setProperty("--gx",(x*100).toFixed(1)+"%");
        card.style.setProperty("--gy",(y*100).toFixed(1)+"%");
      }, {passive:true});
      card.addEventListener("pointerleave",function() {
        card.style.setProperty("--ry","0deg");
        card.style.setProperty("--rx","0deg");
      });
    });
  }

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  setEffects(effects);
  updateScroll();
})();