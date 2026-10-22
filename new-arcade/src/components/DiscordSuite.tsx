import React, {useState} from "react";
import {ShieldCheck, ExternalLink, LogOut} from "lucide-react";
import type {UserProfile} from "../game/types.ts";
import {arcadeRequest} from "../services/arcade-api.ts";
interface Props {currentUser:UserProfile;csrfToken:string|null;configured:boolean}
export default function DiscordSuite({currentUser,csrfToken,configured}:Props){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const connected=currentUser.isDiscordConnected;
  async function logout(){
    if(!csrfToken)return;
    setBusy(true);setError("");
    try{await arcadeRequest("/auth/logout",{},csrfToken);window.location.assign("/arcade.html");}
    catch(e){setError(e instanceof Error?e.message:"Could not sign out.");setBusy(false);}
  }
  return <section className="bg-[#10211b] border border-[#294637] rounded-xl p-6 max-w-3xl mx-auto space-y-5">
    <p className="text-[#87dcca] text-xs tracking-widest font-mono">THE 420 LOBBY / DISCORD CONNECTION</p>
    <h2 className="text-4xl font-heading text-white">YOUR DISCORD IDENTITY<span className="text-[#b8f875]">.</span></h2>
    <p className="text-[#b7c5b5] text-sm">The arcade uses the website’s existing Discord sign-in. No pretend connection, sample players, webhook credentials, or separate account database.</p>
    {connected?<div className="flex flex-wrap gap-4 items-center bg-[#080f0e] border border-[#294637] rounded p-4">
      <img src={currentUser.avatarUrl} alt="" width={64} height={64} className="rounded-full"/>
      <div className="flex-1 min-w-0"><strong className="text-lg text-[#eaf0dd] break-words">{currentUser.username}</strong>
        <p className="text-[#87dcca] text-xs flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> Connected Discord account</p>
      </div>
      <button type="button" disabled={busy} onClick={logout} className="flex items-center gap-2 px-4 py-2 border border-[#294637] hover:border-[#b8f875] rounded text-sm disabled:opacity-50">
        <LogOut className="w-4 h-4"/>{busy?"Signing out...":"Disconnect"}
      </button>
    </div>:<div className="space-y-3">
      <p className="text-[#b7c5b5] text-sm">{configured?"Play as a guest or sign in to record scores on the community board.":"Discord sign-in is not configured right now. Guest gameplay remains available."}</p>
      {configured&&<a href="/auth/discord" className="inline-flex items-center gap-2 bg-[#b8f875] text-[#080f0e] font-bold px-5 py-3 rounded">
        Sign in with Discord <ExternalLink className="w-4 h-4"/>
      </a>}
    </div>}
    {error&&<p role="alert" className="text-rose-300 text-sm">{error}</p>}
    <p className="text-[#b7c5b5] text-xs">Only signed-in scores are published. Results from the new cabinets are community rankings with plausibility checks, not cryptographically verified replays. No server roles or prizes are assigned.</p>
  </section>;
}
