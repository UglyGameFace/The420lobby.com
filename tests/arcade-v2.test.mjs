import {test} from "node:test";
import assert from "node:assert/strict";
import {validateCommunityResult, NEW_GAME_IDS, ARCADE_V2_RULES} from "../functions/_lib/arcade-v2.mjs";
import {HttpError} from "../functions/_lib/http.mjs";

const bong={score:520,difficulty:"Normal",elapsedMs:35000,stats:{perfectHits:3,niceHits:1,misses:4,accuracy:50,durationSeconds:35}};
const runner={score:850,difficulty:"Normal",elapsedMs:11000,stats:{trichomes:4,distance:180,durationSeconds:11}};
const invaders={score:3400,difficulty:"Fever",elapsedMs:24000,stats:{wave:2,cleanKills:9,durationSeconds:24}};
function rejects(game,body,wall=40000){
  assert.throws(()=>validateCommunityResult(game,body,wall),e=>e instanceof HttpError&&e.status===422);
}

test("the new Arcade has a distinct rules-version namespace to protect replay-verified historical rankings",()=>{
  assert.deepEqual(NEW_GAME_IDS,["sesh-invaders","bong-blitz","canna-runner"]);
  assert.equal(ARCADE_V2_RULES,"arcade-v2:1");
});
test("signed-in community result checks accept plausible rounds in all three cabinets",()=>{
  assert.equal(validateCommunityResult("bong-blitz",bong,38000).score,520);
  assert.equal(validateCommunityResult("canna-runner",runner,12000).score,850);
  assert.equal(validateCommunityResult("sesh-invaders",invaders,26000).score,3400);
});
test("community score checks reject fabricated timing, inflated results, and malformed statistics",()=>{
  rejects("bong-blitz",{...bong,score:900000});
  rejects("bong-blitz",{...bong,elapsedMs:5000});
  rejects("bong-blitz",{...bong,stats:{perfectHits:300,niceHits:1,misses:0}});
  rejects("canna-runner",{...runner,stats:{trichomes:9999,distance:180}});
  rejects("canna-runner",{...runner,stats:{trichomes:3,distance:100000}});
  rejects("sesh-invaders",{...invaders,score:999999});
  rejects("sesh-invaders",{...invaders,stats:{wave:999,cleanKills:2}});
  rejects("sesh-invaders",{...invaders,stats:{wave:2,cleanKills:"9"}});
  rejects("sesh-invaders",{...invaders,elapsedMs:50000},20000);
  rejects("sesh-invaders",{...invaders,difficulty:"Impossible"});
  rejects("sesh-invaders",{...invaders,extra:"untrusted"});
  rejects("bong-blitz",{...bong,stats:{...bong.stats,__proto__:null,evil:Infinity}});
});
