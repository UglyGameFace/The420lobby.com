/* Pre-rendered photograph-derived smoke loop, never an SVG or canvas effect.
   Render stills when users request reduced motion, save data or disable effects. */
(function(){
  "use strict";
  const root=document.documentElement;
  const smoke=[...document.querySelectorAll("img[data-smoke-motion][data-smoke-still]")];
  if(!smoke.length)return;
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection=navigator.connection;
  function update(){
    const enabled=!reduce.matches && !connection?.saveData && !root.classList.contains("fx-off");
    for(const img of smoke){
      const target=enabled?img.dataset.smokeMotion:img.dataset.smokeStill;
      if(img.getAttribute("src")!==target)img.setAttribute("src",target);
    }
  }
  update();
  const observer=new MutationObserver(update);
  observer.observe(root,{attributes:true,attributeFilter:["class"]});
  if(reduce.addEventListener)reduce.addEventListener("change",update);
  else if(reduce.addListener)reduce.addListener(update);
  if(connection?.addEventListener)connection.addEventListener("change",update);
  window.addEventListener("pageshow",update);
})();
