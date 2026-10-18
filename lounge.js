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
 const scene=section.querySelector(".lounge-scene");
 const sceneImage=document.getElementById("lounge-scene-photo");
 const photoStatus=document.getElementById("lounge-photo-status");
 function showPhoto(){
   sceneImage.dataset.photoState="ready";
   photoStatus.hidden=true;
   photoStatus.textContent="";
 }
 sceneImage.addEventListener("load",showPhoto);
 sceneImage.addEventListener("error",()=>{
   sceneImage.dataset.photoState="error";
   photoStatus.textContent="The selected room photo couldn't load. Try another room or check your connection.";
   photoStatus.hidden=false;
 });
 if(sceneImage.complete&&sceneImage.naturalWidth>0)showPhoto();
 function selectSpot(button){
   if(!spots.includes(button))return;
   spots.forEach(item=>item.setAttribute("aria-pressed",String(item===button)));
   roomTitle.textContent=button.dataset.roomTitle;
   roomCopy.textContent=button.dataset.roomCopy;
   roomLink.setAttribute("href",button.dataset.roomHref);
   scene.dataset.activeRoom=button.dataset.roomKey;
   const nextImage=button.dataset.roomImage;
   if(sceneImage.getAttribute("src")!==nextImage){
     sceneImage.dataset.photoState="loading";
     photoStatus.hidden=true;
     photoStatus.textContent="";
     sceneImage.alt=button.dataset.roomAlt;
     sceneImage.setAttribute("src",nextImage);
     if(sceneImage.complete&&sceneImage.naturalWidth>0)showPhoto();
   }
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
 /* Spark Relay: a real shared reaction game, no fake participants or client scores. */
 const joinButton=document.getElementById("lounge-cheers-join");
 const sparkButton=document.getElementById("lounge-spark-button");
 const signIn=document.getElementById("lounge-cheers-signin");
 const cheerStatus=document.getElementById("lounge-cheers-status");
 const players=document.getElementById("lounge-cheers-participants");
 const clock=document.getElementById("lounge-cheers-clock");
 const progress=document.getElementById("lounge-cheers-progress");
 const arena=document.getElementById("spark-arena");
 const stagePhase=document.getElementById("spark-stage-phase");
 const stageLabel=document.getElementById("spark-stage-label");
 const sparkLabel=document.getElementById("spark-target-label");
 const sparkCountdown=document.getElementById("spark-target-countdown");
 const cue=document.getElementById("spark-cue");
 const scoreboard={
   score:document.getElementById("spark-score"),
   combo:document.getElementById("spark-combo"),
   caught:document.getElementById("spark-captured"),
   record:document.getElementById("spark-record")
 };
 const steps=Array.from(document.querySelectorAll("#spark-round-track .spark-step"));
 const onlineCount=document.getElementById("spark-online");
 const lookingCount=document.getElementById("spark-looking");
 const onlineToggle=document.getElementById("spark-presence-toggle");
 const calls=["LIGHT THE SPARK","PASS THE GLOW","KEEP IT LIT","FAN THE FLAME","DON'T BREAK THE CHAIN",
   "PASS IT FORWARD","LIGHTNING HANDS","KEEP THE COMBO","ONE MORE SPARK","CHEERS TO THE CREW"];
 const defaultRules={durationMs:42000,firstBeatMs:3000,beatIntervalMs:3800,beatOffsetsMs:[3000,6800,9500,12400,14950,17850,20400,24200,27800,32500],hitWindowMs:550,beatCount:10};
 let rules=defaultRules,api=null,session=null,active=null,serverOffset=0;
 let available=false,pending=false,playing=false,bestScore=0,joinedRound=null,lastRefresh=0;
 let online=false,looking=false,heartbeatBusy=false,lastHeartbeat=0;
 const restored=(()=>{
   try{return Number(sessionStorage.getItem("lobby:spark-round:v1"))||null;}
   catch(_){return null;}
 })();
 joinedRound=restored;
 let lastPhaseText="";
 function showCue(message){
   if(cue.textContent!==message)cue.textContent=message;
 }
 function currentMillis(){return Date.now()+serverOffset;}
 function setJoinedRound(id){
   joinedRound=id;
   try{
     if(id)sessionStorage.setItem("lobby:spark-round:v1",String(id));
     else sessionStorage.removeItem("lobby:spark-round:v1");
   }catch(_){}
 }
 function currentBeat(now){
   if(!active)return null;
   const beats=rules.beatOffsetsMs||defaultRules.beatOffsetsMs;
   let nearest=null;
   for(let i=0;i<beats.length;i++){
     const target=active.startedAt+beats[i],delta=now-target;
     if(!nearest||Math.abs(delta)<Math.abs(nearest.delta))nearest={beat:i,target,delta};
   }
   return nearest;
 }
 function changePhase(phase,label){
   arena.dataset.phase=phase;
   stagePhase.textContent=label;
 }
 function render(){
   if(document.hidden)return;
   const now=currentMillis();
   const remaining=active?Math.max(0,Math.ceil((active.endsAt-now)/1000)):0;
   const inRound=Boolean(active&&remaining>0);
   const joined=Boolean(inRound&&joinedRound===active.id);
   players.textContent=inRound?String(active.participants):"—";
   clock.textContent=inRound?remaining+"s":"READY";
   progress.style.width=inRound?(100*remaining/rules.durationMs*1000).toFixed(1)+"%":"0%";
   scoreboard.score.textContent=String(inRound?active.teamScore||0:0);
   scoreboard.combo.textContent=String(inRound?active.maxCombo||0:0);
   scoreboard.caught.textContent=(inRound?(active.hits||[]).length:0)+"/"+rules.beatCount;
   scoreboard.record.textContent=String(Math.max(bestScore,inRound?active.teamScore||0:0));
   joinButton.disabled=!available||pending||joined;
   if(available&&!pending)
     joinButton.textContent=joined?"YOU'RE IN · CATCH THE NEXT SPARK":inRound?"JOIN THIS RELAY":"START A SPARK RELAY";
   if(!inRound){
     changePhase("idle","READY TO PLAY");
     sparkButton.disabled=true;
     sparkButton.setAttribute("aria-label","Join a relay round to catch sparks");
     sparkLabel.textContent="JOIN TO PLAY";
     sparkCountdown.textContent="READY";
     stageLabel.textContent="THE CREW'S SPARK";
     steps.forEach(s=>s.dataset.state="waiting");
     showCue("Start a round, then catch the glowing ember on each beat. Take turns for bonus points.");
     return;
   }
   const caught=new Set((active.hits||[]).map(x=>x.beat));
   if(playing){changePhase("verifying","VERIFYING TAP");sparkButton.disabled=true;return;}
   const timing=currentBeat(now);
   const live=timing&&Math.abs(timing.delta)<=rules.hitWindowMs;
   const claimable=live&&!caught.has(timing.beat);
   steps.forEach((step,i)=>{
     const target=active.startedAt+(rules.beatOffsetsMs||defaultRules.beatOffsetsMs)[i];
     step.dataset.state=caught.has(i)?"caught":target+rules.hitWindowMs<now?"missed":timing&&timing.beat===i?"current":"waiting";
   });
   sparkButton.disabled=!joined||!claimable||playing;
   if(live){
     changePhase(claimable?"live":"caught",claimable?"THE SPARK IS LIVE":"SPARK SECURED");
     stageLabel.textContent=calls[timing.beat];
     sparkLabel.textContent=claimable?(joined?"CATCH SPARK":"JOIN TO PLAY"):"ALREADY CAUGHT";
     sparkButton.setAttribute("aria-label",claimable?"Catch spark "+(timing.beat+1):"Spark already caught");
     sparkCountdown.textContent=claimable?"NOW!":"PASSED";
     showCue(claimable?"Tap the ember now! A handoff from another player earns a relay bonus.":"The crew caught this one. Get ready for the next beat.");
   }else{
     changePhase("waiting",joined?"WAIT FOR THE GLOW":"JOIN THE ROUND");
     stageLabel.textContent="KEEP THE CHAIN ALIVE";
     sparkLabel.textContent=joined?"WATCH THE EMBER":"JOIN TO PLAY";
     sparkButton.setAttribute("aria-label","Wait for the next timed spark");
     const next=Array.from({length:rules.beatCount},(_,i)=>({i,
       time:active.startedAt+(rules.beatOffsetsMs||defaultRules.beatOffsetsMs)[i]}))
       .find(x=>x.time+rules.hitWindowMs>=now);
     sparkCountdown.textContent=next?Math.max(0,(next.time-now)/1000).toFixed(1)+"s":"ROUND ENDING";
     showCue(next?(joined?"Wait for the glow, then tap. Timing matters more than speed.":"Join the relay to help build the crew score."):"Great run. The next round is coming up.");
   }
 }
 function applyStatus(data,sentAt=Date.now()){
   serverOffset=data.serverTime-(sentAt+Date.now())/2;
   active=data.round;
   rules=data.rules||defaultRules;
   bestScore=data.bestScore||0;
   onlineCount.textContent=String(data.onlinePlayers||0);
   lookingCount.textContent=String(data.lookingPlayers||0);
   onlineToggle.disabled=false;
   onlineToggle.textContent=online?(looking?"LEAVE LOOKING LIST":"GO OFFLINE"):"JOIN ONLINE LOBBY";
   available=true;
   if(active?.id!==joinedRound&&joinedRound&&!active)setJoinedRound(null);
   signIn.hidden=true;
   render();
 }
 async function client(){
   api=api||await import("/arcade-api.js");
   return api;
 }
 async function refresh(force=false){
   if(document.hidden||pending||playing)return;
   const now=Date.now();
   if(!force&&now-lastRefresh<(active?1800:9500))return;
   lastRefresh=now;
   try{
     const sdk=await client(),sentAt=Date.now();
     const data=await sdk.arcadeRequest("/api/cheers");
     applyStatus(data,sentAt);
     if(data.round&&!data.gameReady)
       cheerStatus.textContent="Spark Relay setup is finishing. Join to activate the game.";
     else if(data.round)
       cheerStatus.textContent="Crew relay in progress. "+data.round.participants+" player(s), "+
         data.round.teamScore+" points. Catch the next glow!";
     else
       cheerStatus.textContent="No round running. Be the first to light up the scoreboard.";
   }catch(_){
     available=false;active=null;
     joinButton.disabled=true;joinButton.textContent="GAME OFFLINE";
     sparkButton.disabled=true;arena.dataset.phase="idle";
     cheerStatus.textContent="The shared game is currently unavailable. The Arcade and Discord community still work.";
   }
 }
 async function authenticated(){
   const sdk=await client();
   session=session||await sdk.arcadeRequest("/api/session");
   if(!session.configured){
     available=false;
     cheerStatus.textContent="The website's Discord login is not configured yet.";
     return null;
   }
   if(!session.user||!session.csrfToken){
     signIn.hidden=false;
     cheerStatus.textContent="Sign in with Discord, then come back to play.";
     return null;
   }
   return session;
 }
 async function publishPresence(isOnline,isLooking){
   if(heartbeatBusy)return;
   heartbeatBusy=true;
   try {
     const auth=await authenticated();
     if(!auth)return;
     const data=await api.arcadeRequest("/api/cheers/presence",{
       body:{online:isOnline,looking:isOnline&&isLooking},csrfToken:auth.csrfToken
     });
     online=isOnline;looking=isOnline&&isLooking;lastHeartbeat=Date.now();
     applyStatus(data);
     cheerStatus.textContent=isOnline?
       isLooking?"You're visible in the live looking-for-players lobby.":"You're online in the live lounge.":
       "You're no longer listed as online.";
   }catch(error){
     cheerStatus.textContent=error.message||"Couldn't update live lobby. Retry.";
   }finally{heartbeatBusy=false;}
 }
 onlineToggle.addEventListener("click",async()=>{
   if(heartbeatBusy)return;
   onlineToggle.disabled=true;
   await publishPresence(!online,!online);
   onlineToggle.disabled=false;
 });
 joinButton.addEventListener("click",async()=>{
   if(pending||!available)return;
   pending=true;joinButton.disabled=true;joinButton.textContent="JOINING THE CREW…";
   try{
     const auth=await authenticated();
     if(!auth)return;
     const sentAt=Date.now();
     const data=await api.arcadeRequest("/api/cheers",{body:{},csrfToken:auth.csrfToken});
     if(data.round)setJoinedRound(data.round.id);
     applyStatus(data,sentAt);
     if(!online)void publishPresence(true,false);
     cheerStatus.textContent=data.joined?"You're in! Catch the ember when it glows.":"You're already in this round. Catch the next spark!";
   }catch(error){
     if(["invalid_csrf","sign_in_required"].includes(error.code))session=null;
     cheerStatus.textContent=error.message||"Could not join. Try again.";
   }finally{pending=false;render();}
 });
 sparkButton.addEventListener("click",async()=>{
   if(playing||!active||joinedRound!==active.id)return;
   const now=currentMillis(),timing=currentBeat(now);
   if(!timing||Math.abs(timing.delta)>rules.hitWindowMs||
     (active.hits||[]).some(h=>h.beat===timing.beat))return;
   const roundId=active.id,beat=timing.beat;
   playing=true;sparkButton.disabled=true;
   changePhase("verifying","VERIFYING TAP");sparkLabel.textContent="GOOD TAP · CHECKING";
   showCue("Tap registered instantly. Checking the server timing and crew score…");
   try{
     const auth=await authenticated();
     if(!auth)return;
     const sentAt=Date.now();
     const data=await api.arcadeRequest("/api/cheers/spark",
       {body:{roundId,beat},csrfToken:auth.csrfToken});
     applyStatus(data,sentAt);
     cheerStatus.textContent=data.captured?
       "SPARK CAUGHT! +"+data.awarded+" crew points. Keep the chain going!":
       "Someone caught that spark first. Get the next one!";
   }catch(error){
     if(["invalid_csrf","sign_in_required"].includes(error.code))session=null;
     cheerStatus.textContent=error.code==="off_beat"?
       "Close! Catch the next glow when the ember lights up.":
       error.message||"That spark didn't register. Try the next one.";
     refresh(true);
   }finally{playing=false;render();}
 });
 // Only animate the countdown during a live round; idle pages should not
 // repaint ten markers eight times a second on low-power tablets.
 setInterval(()=>{if(active&&!document.hidden)render();},60);
 setInterval(()=>refresh(),1000);
 setInterval(()=>{
   if(online&&!document.hidden&&!heartbeatBusy&&Date.now()-lastHeartbeat>=17000)
     void publishPresence(true,looking);
 },5000);
 document.addEventListener("visibilitychange",()=>{
   if(!document.hidden&&online)void publishPresence(true,looking);
 });
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh(true);});
 refresh(true);
})();
