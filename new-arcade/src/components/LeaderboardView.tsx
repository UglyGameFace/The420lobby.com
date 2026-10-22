import React, {useCallback, useEffect, useState} from "react";
import {RefreshCw, ShieldCheck} from "lucide-react";
import {arcadeRequest, type ArcadeBoard, type ArcadeBoardEntry} from "../services/arcade-api.ts";

const labels:Record<string,string>={
  "sesh-invaders":"Sesh Invaders",
  "bong-blitz":"Bong Blitz",
  "canna-runner":"Canna-Runner"
};
export default function LeaderboardView(){
  const [game,setGame]=useState("all");
  const [period,setPeriod]=useState<"today"|"week"|"all">("week");
  const [entries,setEntries]=useState<ArcadeBoardEntry[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{
    const updated=()=>refresh();
    window.addEventListener("arcade:v2:saved",updated);
    return()=>window.removeEventListener("arcade:v2:saved",updated);
  },[refresh]);
  useEffect(()=>{
    let active=true;
    setBusy(true);setError("");
    arcadeRequest<ArcadeBoard>("/api/arcade-v2/leaderboards?game="+encodeURIComponent(game)+"&period="+period)
      .then(data=>{if(active)setEntries(data.entries);})
      .catch((err:unknown)=>{if(active){setEntries([]);setError(err instanceof Error?err.message:"Could not load rankings.");}})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[game,period,revision]);
  return <section className="bg-[#10211b] border border-[#294637] rounded-xl p-5 md:p-7 shadow-xl" aria-label="Community leaderboards">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#294637] gap-3">
      <div>
        <p className="text-[#b7c5b5] text-[10px] tracking-widest uppercase font-mono mb-1">02 / THE BRAGGING RIGHTS</p>
        <h2 className="text-3xl sm:text-4xl font-heading text-white">HIGH ROLLERS<span className="text-[#b8f875]">.</span></h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="px-2 py-1 border border-[#294637] rounded flex items-center gap-1.5 text-[10px] text-[#87dcca]">
          <ShieldCheck className="w-3.5 h-3.5"/> DISCORD ACCOUNT SCORES
        </span>
        <button type="button" onClick={refresh} disabled={busy} aria-label="Refresh leaderboard"
          className="p-2 rounded border border-[#294637] hover:border-[#b8f875] disabled:opacity-50">
          <RefreshCw className="w-4 h-4"/>
        </button>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <label className="text-xs text-[#b7c5b5]">Game{" "}
        <select value={game} onChange={e=>setGame(e.target.value)} className="bg-[#080f0e] border border-[#294637] rounded p-2 text-[#eaf0dd]">
          <option value="all">All cabinets</option>
          {Object.entries(labels).map(([id,name])=><option value={id} key={id}>{name}</option>)}
        </select>
      </label>
      <div className="flex gap-1 flex-wrap" aria-label="Leaderboard period">
        {(["today","week","all"] as const).map(p=><button type="button" key={p} onClick={()=>setPeriod(p)}
          aria-pressed={period===p} className={"px-3 py-2 text-xs rounded border border-[#294637] "+(period===p?"bg-[#b8f875] text-[#080f0e]":"bg-[#080f0e] text-[#eaf0dd]")}>
          {p==="today"?"Last 24 hours":p==="week"?"This week":"All time"}
        </button>)}
      </div>
    </div>
    <div aria-live="polite" role="status" className="text-xs text-[#b7c5b5] mb-3">
      {busy?"Loading community scores...":error||"Best signed-in score per player and cabinet."}
    </div>
    <div className="overflow-x-auto min-h-[160px]">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead><tr className="border-b border-[#294637] text-[#b7c5b5]">
          <th className="py-2">RANK</th><th>PLAYER</th><th>CABINET</th><th className="text-right">SCORE</th>
        </tr></thead>
        <tbody>
          {!busy&&!entries.length?<tr><td colSpan={4} className="text-center py-10 text-[#b7c5b5]">No community scores for this selection yet.</td></tr>:
          entries.map(entry=><tr key={entry.user.id+":"+entry.game} className="border-b border-[#294637]/50">
            <td className="py-3 font-arcade text-[#b8f875]">#{entry.rank}</td>
            <td><div className="flex gap-2 items-center">
              <img src={entry.user.avatarUrl||"/favicon.svg"} alt="" width={28} height={28} className="rounded-full border border-[#294637]"/>
              <span className="font-bold break-words">{entry.user.username}</span>
            </div></td>
            <td className="text-[#b7c5b5]">{labels[entry.game]||entry.game}</td>
            <td className="font-arcade text-[#b8f875] text-right tabular-nums">{entry.score.toLocaleString()}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="text-[11px] text-[#b7c5b5] mt-4 pt-4 border-t border-[#294637]">
      Scores belong to signed-in Discord accounts and pass basic server plausibility checks. Full gameplay replay verification and Discord roles are not enabled for these new cabinets.
    </p>
  </section>;
}
