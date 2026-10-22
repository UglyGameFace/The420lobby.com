import React from 'react';
import { Achievement } from '../game/types.ts';
import { Lock } from 'lucide-react';

interface TrophyShelfProps {
  achievements: Achievement[];
}

export default function TrophyShelf({ achievements }: TrophyShelfProps) {
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="bg-[#10211b] border border-[#294637] rounded-xl p-5 md:p-6 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-[#294637] mb-4">
        <div>
          <p className="text-[#b7c5b5] text-[10px] tracking-widest uppercase font-mono mb-0.5">
            03 / YOUR CORNER OF THE LOBBY
          </p>
          <h3 className="text-xl sm:text-2xl font-heading text-white tracking-tight">
            THE TROPHY SHELF<span className="text-[#b8f875]">.</span>
          </h3>
        </div>
        <span className="font-mono text-xs text-[#b8f875] bg-[#080f0e] px-2.5 py-1 rounded border border-[#294637]">
          {unlockedCount} / {achievements.length} UNLOCKED
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[#080f0e] h-1.5 rounded-full overflow-hidden border border-[#294637] mb-5">
        <div
          className="bg-[#b8f875] h-full transition-all duration-500 shadow-[0_0_8px_#b8f875]"
          style={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
        />
      </div>

      {/* Grid matching the420lobby.com/arcade.html */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {achievements.map(ach => (
          <div
            key={ach.id}
            className={`flex flex-col items-center text-center p-3 rounded-lg border transition ${
              ach.unlocked
                ? 'bg-[#b8f875]/5 border-[#b8f875]/40 text-[#b8f875]'
                : 'bg-[#080f0e]/60 border-[#294637]/60 text-[#b7c5b5] opacity-65'
            }`}
          >
            <span
              className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl mb-2 border ${
                ach.unlocked
                  ? 'bg-[#b8f875]/10 border-[#b8f875]/40 text-[#b8f875] shadow-[0_0_10px_rgba(184,248,117,0.2)]'
                  : 'bg-[#10211b] border-[#294637] text-[#8ea79a]'
              }`}
            >
              {ach.unlocked ? ach.icon : <Lock className="w-4 h-4 text-[#8ea79a]" />}
            </span>
            <b className="font-heading text-xs tracking-wide text-white uppercase block leading-tight">
              {ach.title}
            </b>
            <small className="text-[10px] text-[#b7c5b5] mt-1 leading-snug line-clamp-2">
              {ach.description}
            </small>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-center text-[#b7c5b5] mt-5 pt-3 border-t border-[#294637] font-sans">
        Local trophies are saved on this device. They do not grant server roles or prizes.
      </p>
    </div>
  );
}
