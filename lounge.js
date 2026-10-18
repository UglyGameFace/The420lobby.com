/* Real shared CHEERS and browser-local theme preferences. */
(function(){
 "use strict";
 const section=document.getElementById("interactive-lounge");
 if(!section)return;
 const root=document.documentElement;
 const themes={lounge:"Smoky Lounge",midnight:"Midnight",halloween:"After Dark"};
 const choices=Array.from(section.querySelectorAll("[data-lounge-theme]"));
 const moodStatus=document.getElementById("lounge-mood-status");
 const secret=document.getElementById("lounge-secret");
 const secretMessage=document.getElementById("lounge-secret-message");
 const join=document.getElementById("lounge-cheers-join");
 const signin=document.getElementById("lounge-cheers-signin");
 const status=document.getElementById("lounge-cheers-status");
 const count=document.getElementById("lounge-cheers-participants");
 const clock=document.getElementById("lounge-cheers-clock");
 const progress=document.getElementById("lounge-cheers-progress");
 let theme="lounge";
 try{const saved=localStorage.getItem("lobby:theme:v1");if(Object.hasOwn(themes,saved))theme=saved;}
 catch(_){/* Storage can be unavailable in private browsing. */}
 function setTheme(value){
   if(!Object.hasOwn(themes,value))return;
   theme=value;root.dataset.loungeTheme=value;
   choices.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.loungeTheme===value)));
   moodStatus.textContent=themes[value]+" selected. Saved on this device when storage is available.";
   try{localStorage.setItem("lobby:theme:v1",value);}catch(_){}
 }
 choices.forEach(button=>button.addEventListener("click",()=>setTheme(button.dataset.loungeTheme)));
 setTheme(theme);
 let taps=0;
 secret.addEventListener("click",()=>{
   taps++;
   if(taps<4){secretMessage.textContent=["Something is hidden…","Two more taps.","Almost there…"][taps-1];return;}
   taps=0;setTheme("halloween");secretMessage.textContent="Secret found: After Dark atmosphere activated. ✳";
 });
 /* One authoritative set of hotspot metadata lives on the existing room controls. */
 const spots=Array.from(section.querySelectorAll(".lounge-hotspot"));
 const roomTitle=document.getElementById("lounge-preview-title");
 const roomCopy=document.getElementById("lounge-preview-description");
 const roomLink=document.getElementById("lounge-preview-link");
 function selectSpot(button){
   if(!spots.includes(button))return;
   spots.forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
   roomTitle.textContent=button.dataset.roomTitle;
   roomCopy.textContent=button.dataset.roomCopy;
   roomLink.setAttribute("href",button.dataset.roomHref);
 }
 spots.forEach((button,index)=>{
   button.addEventListener("click",()=>selectSpot(button));
   button.addEventListener("keydown",event=>{
     let next=null;
     if(event.key==="ArrowRight"||event.key==="ArrowDown")next=spots[(index+1)%spots.length];
     if(event.key==="ArrowLeft"||event.key==="ArrowUp")next=spots[(index+spots.length-1)%spots.length];
     if(event.key==="Home")next=spots[0];
     if(event.key==="End")next=spots[spots.length-1];
     if(!next)return;
     event.preventDefault();
     selectSpot(next);
     next.focus();
   });
 });
 if(spots.length)selectSpot(spots[0]);
 let api=null,session=null,active=null,serverOffset=0,available=false,pending=false;
 function render(){
   const remaining=active?Math.max(0,Math.ceil((active.endsAt-Date.now()-serverOffset)/1000)):0;
   count.textContent=remaining>0?String(active.participants):"—";
   clock.textContent=remaining>0?String(remaining)+"s":"READY";
   progress.style.width=(remaining>0?Math.min(100,remaining/42*100).toFixed(1):"0")+"%";
   if(available&&!pending){join.disabled=false;join.textContent=remaining>0?"JOIN THE SHARED CHEERS":"START A SHARED CHEERS";}
 }
 function applyState(data){
   serverOffset=data.serverTime-Date.now();
   active=data.round;available=true;
   render();
   status.textContent=active?"A real 42-second Cheers is happening. Join the crew!":"No active round. Start one and other visitors can join.";
 }
 async function refresh(){
   if(document.hidden||pending)return;
   try{
     api=api||await import("/arcade-api.js");
     const data=await api.arcadeRequest("/api/cheers");
     applyState(data);
   }catch(_){
     available=false;active=null;count.textContent="—";clock.textContent="—";
     progress.style.width="0%";join.disabled=true;join.textContent="CHEERS UNAVAILABLE";
     status.textContent="The shared lounge is offline for now. Arcade and community links still work.";
   }
 }
 join.addEventListener("click",async()=>{
   if(pending||!available)return;
   pending=true;join.disabled=true;join.textContent="JOINING…";
   try{
     api=api||await import("/arcade-api.js");
     session=session||await api.arcadeRequest("/api/session");
     if(!session.user||!session.csrfToken){
       signin.hidden=false;status.textContent="Sign in with Discord, then return here to join Cheers.";
       return;
     }
     const result=await api.arcadeRequest("/api/cheers",{body:{},csrfToken:session.csrfToken});
     signin.hidden=true;applyState(result);
     status.textContent=result.joined?"You're in! CHEERS to the crew.":"You're already in this round. CHEERS!";
   }catch(error){
     if(["invalid_csrf","sign_in_required"].includes(error.code))session=null;
     status.textContent=error.message||"Could not join this round. Try again.";
   }finally{pending=false;render();}
 });
 setInterval(render,1000);
 setInterval(refresh,12000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
 refresh();
})();
