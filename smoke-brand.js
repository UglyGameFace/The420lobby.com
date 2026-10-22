/* Pre-rendered photographic smoke-flow frames: no bobbing, element movement,
   synthetic vector, or opacity-only animation. Both CHEERS and 420 use this
   same still/motion controller, respecting reduced motion, saveData and FX off. */
(function(){
  "use strict";
  const root=document.documentElement;
  const smoke=()=>[...document.querySelectorAll("img[data-smoke-motion][data-smoke-still]")];
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection=navigator.connection;
  function update(){
    const enabled=!reduce.matches && !connection?.saveData && !root.classList.contains("fx-off");
    for(const img of smoke()){
      const target=enabled?img.dataset.smokeMotion:img.dataset.smokeStill;
      if(img.getAttribute("src")!==target)img.setAttribute("src",target);
    }
  }
  update();
  // React mounts its header after deferred scripts; use the same smoke controller
  // when a page adds a real smoke image later instead of duplicating animation logic.
  document.addEventListener("lobby:smoke-refresh",update);
  const observer=new MutationObserver(update);
  observer.observe(root,{attributes:true,attributeFilter:["class"]});
  if(reduce.addEventListener)reduce.addEventListener("change",update);
  else if(reduce.addListener)reduce.addListener(update);
  if(connection?.addEventListener)connection.addEventListener("change",update);
  window.addEventListener("pageshow",update);
})();
