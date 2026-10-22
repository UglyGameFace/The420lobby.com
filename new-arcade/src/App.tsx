import React, { useState, useEffect, useCallback, useRef } from 'react';
import {arcadeRequest, type ArcadeSession, type ArcadeProfile, type ArcadeRunStart, type ArcadeRunSaved} from './services/arcade-api.ts';
import SeshInvaders from './components/SeshInvaders.tsx';
import BongBlitz from './components/BongBlitz.tsx';
import CannaRunner from './components/CannaRunner.tsx';
import LeaderboardView from './components/LeaderboardView.tsx';
import DiscordSuite from './components/DiscordSuite.tsx';
import TrophyShelf from './components/TrophyShelf.tsx';
import SiteHeader from './components/SiteHeader.tsx';
import IndieSpotlight from './components/IndieSpotlight.tsx';
import {siteLinks} from './site-links.ts';
import { GameId, GameDifficulty, ScoreRecord, UserProfile, Achievement, RunResult } from './game/types.ts';
import { INITIAL_ACHIEVEMENTS, evaluateRunAchievements, getDifficultyConfig } from './game/rules.ts';
import { sounds } from './game/audio.ts';
import {
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldCheck,
  Send,
  Sparkles,
  RotateCcw,
  X
} from 'lucide-react';

export default function App() {
  const links = siteLinks();
  const [activeGameModal, setActiveGameModal] = useState<GameId | null>(null);
  const [gameDifficulty, setGameDifficulty] = useState<GameDifficulty>('Normal');
  const [activeTab, setActiveTab] = useState<'main' | 'discord'>('main');
  const [isMuted, setIsMuted] = useState<boolean>(() => sounds.getMuted());
  const [session,setSession] = useState<ArcadeSession|null>(null);
  const [recordStatus,setRecordStatus] = useState('Local score.');
  const activeRunRef = useRef<{id:string;game:GameId}|null>(null);
  const openingRef = useRef(false);
  const roomOpenRef = useRef(false);
  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    try {
      const saved = localStorage.getItem('lobby:achievements:v3');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_ACHIEVEMENTS;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>({
    id:'guest',username:'Guest Player',tag:'',avatarUrl:'/favicon.svg',
    isDiscordConnected:false,roles:[],totalGamesPlayed:0,totalScore:0,
    achievementsUnlocked:[],favoriteGame:'sesh-invaders'
  });
  const [recentRun, setRecentRun] = useState<ScoreRecord | null>(null);
  const [showScoreCelebration, setShowScoreCelebration] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

useEffect(() => {
    try {
      localStorage.setItem('lobby:achievements:v3', JSON.stringify(achievements));
    } catch {}
  }, [achievements]);

  useEffect(() => {
    let active=true;
    (async()=>{
      try{
        const s=await arcadeRequest<ArcadeSession>('/api/session');
        if(!active)return;
        setSession(s);
        if(s.user){
          const p=await arcadeRequest<ArcadeProfile>('/api/arcade-v2/profile');
          if(active)setCurrentUser(prev=>({...prev,id:p.user.id,username:p.user.username,
            avatarUrl:p.user.avatarUrl,tag:'',isDiscordConnected:true,roles:[],
            totalGamesPlayed:p.stats.runs,totalScore:p.stats.totalScore}));
        }
      }catch(e){if(active)setSession({user:null,csrfToken:null,configured:false});}
    })();
    return()=>{active=false};
  },[]);

const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleToggleMute = () => {
    const next = sounds.toggleMute();
    setIsMuted(next);
  };

  const handleGameOver = useCallback((result: RunResult) => {
    sounds.playVictory();
    const newRecord:ScoreRecord={
      id:'local-'+Date.now(),gameId:result.gameId,playerName:currentUser.username,
      playerTag:'',avatarUrl:currentUser.avatarUrl,isDiscordVerified:Boolean(session?.user),
      score:result.score,maxCombo:result.maxCombo,durationSeconds:Math.round(result.durationMs/1000),
      timestamp:new Date().toISOString(),period:'today',difficulty:result.difficulty
    };
    setRecentRun(newRecord);
    setRecordStatus('Local score. Sign in with Discord before playing to enter community rankings.');
    setShowScoreCelebration(true);
    const unlockedIds=achievements.filter(a=>a.unlocked).map(a=>a.id);
    const earned=evaluateRunAchievements(result.gameId,result.score,result.stats,unlockedIds);
    if(earned.length){
      sounds.playAchievement();
      setAchievements(prev=>prev.map(a=>earned.includes(a.id)?{...a,unlocked:true}:a));
      showToast('Local trophy shelf updated: '+earned.length+' unlocked.');
    }
    const run=activeRunRef.current;
    activeRunRef.current=null;
    if(!run || !session?.csrfToken || run.game!==result.gameId)return;
    setRecordStatus('Submitting score under your Discord account...');
    void (async()=>{
      try{
        const saved=await arcadeRequest<ArcadeRunSaved>('/api/arcade-v2/runs/'+encodeURIComponent(run.id)+'/finish',{
          score:result.score,stats:result.stats,elapsedMs:Math.round(result.durationMs),
          difficulty:result.difficulty||'Normal'
        },session.csrfToken!);
        setRecordStatus('Saved to the Discord community leaderboard. Full replay verification is not enabled.');
        setRecentRun(prev=>prev?.id===newRecord.id?{...prev,score:saved.score}:prev);
        window.dispatchEvent(new Event('arcade:v2:saved'));
        const p=await arcadeRequest<ArcadeProfile>('/api/arcade-v2/profile');
        setCurrentUser(prev=>({...prev,totalGamesPlayed:p.stats.runs,totalScore:p.stats.totalScore}));
      }catch(error){
        setRecordStatus('Could not publish this score. '+(error instanceof Error?error.message:'Please try another round.'));
      }finally{
        if(roomOpenRef.current && session?.csrfToken){
          try{
            const next=await arcadeRequest<ArcadeRunStart>('/api/arcade-v2/runs',{game:result.gameId},session.csrfToken);
            if(roomOpenRef.current)activeRunRef.current={id:next.id,game:result.gameId};
          }catch{/* Replay continues locally if the ranking API fails. */}
        }
      }
    })();
  },[achievements,currentUser,session]);

  const openGame=async (id:GameId)=>{
    if(openingRef.current)return;
    openingRef.current=true;
    try{
      activeRunRef.current=null;
      if(session?.user && session.csrfToken){
        const start=await arcadeRequest<ArcadeRunStart>('/api/arcade-v2/runs',{game:id},session.csrfToken);
        activeRunRef.current={id:start.id,game:id};
      }
      sounds.playCoin();
      roomOpenRef.current=true;
      setActiveGameModal(id);
    }catch(error){
      showToast('Could not start a ranked round: '+(error instanceof Error?error.message:'Try again.'));
    }finally{openingRef.current=false;}
  };

  const closeGame=()=>{
    roomOpenRef.current=false;
    activeRunRef.current=null;
    setActiveGameModal(null);
  };

  return (
    <div className="arcade-site min-h-screen bg-[#080f0e] text-[#eaf0dd] flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#10211b] border border-[#b8f875] text-[#b8f875] px-4 py-2.5 rounded shadow-2xl flex items-center space-x-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-[#b8f875]" />
          <span className="text-xs font-mono font-bold">{toastMessage}</span>
        </div>
      )}

      <SiteHeader />

      {/* Main Body */}
      <main id="main" className="flex-1">
        {activeTab === 'main' && (
          <div className="space-y-16 pb-20">
            {/* HERO SECTION matching the420lobby.com/arcade.html */}
            <section className="max-w-[1376px] w-[calc(100%-48px)] sm:w-[calc(100%-96px)] mx-auto pt-12 sm:pt-16 pb-8 border-b border-[#294637]">
              <div className="max-w-2xl">
                <p className="text-[10px] text-[#b7c5b5] font-mono tracking-widest uppercase mb-4 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#b8f875] inline-block animate-pulse" />
                  <span>420 LOBBY ARCADE · EDITION 01</span>
                </p>

                <h1 className="text-6xl sm:text-8xl font-heading font-extrabold text-[#eaf0dd] tracking-tight leading-[0.9] mb-6">
                  AFTER CHEERS,<br />
                  WE PLAY<span className="text-[#b8f875]">.</span>
                </h1>

                <p className="text-[#b7c5b5] text-sm sm:text-base leading-relaxed mb-8 font-sans max-w-xl">
                  The new arcade cabinets are live. Sign in with Discord to save community scores, or play locally as a guest.
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => {
                      const el = document.getElementById('games');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-6 py-3.5 bg-[#b8f875] hover:bg-[#a0e465] text-[#080f0e] font-heading font-bold text-base tracking-wider rounded transition flex items-center space-x-2"
                  >
                    <span>Choose a game</span>
                    <span>↓</span>
                  </button>

                  <button
                    onClick={() => {
                      const el = document.getElementById('leaderboard');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-xs font-mono text-[#eaf0dd] hover:text-[#b8f875] transition underline underline-offset-4"
                  >
                    View high scores ↗
                  </button>
                  <button type="button"
                    onClick={() => {setActiveTab('discord');window.scrollTo({top:0,behavior:'instant'});}}
                    className="text-xs font-mono text-[#87dcca] hover:text-[#b8f875] transition underline underline-offset-4">
                    {currentUser.isDiscordConnected ? 'My Discord Profile ↗' : 'Connect Discord ↗'}
                  </button>
                  <button type="button" onClick={handleToggleMute}
                    aria-label={isMuted?'Unmute arcade sounds':'Mute arcade sounds'}
                    aria-pressed={!isMuted}
                    className="inline-flex items-center gap-2 px-4 py-3 border border-[#294637] rounded text-xs font-mono text-[#eaf0dd] hover:border-[#b8f875] transition">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    {isMuted?'SOUND OFF':'SOUND ON'}
                  </button>

                </div>

                <div className="flex flex-wrap gap-4 text-[9px] font-mono text-[#b7c5b5] mt-10 pt-6 border-t border-[#294637]">
                  <span>✦ DISCORD-ACCOUNT SCORES</span>
                  <span>✦ SHARED LEADERBOARDS</span>
                  <span>✦ NO PAY-TO-WIN</span>
                  <span>✦ GUEST PLAY AVAILABLE</span>
                </div>
              </div>
            </section>

            {/* Official site artwork, shared with the homepage instead of a substitute logo. */}
            <section className="lobby-brand-banner" aria-label="The 420 Lobby branded lounge artwork">
              <div className="lobby-brand-banner-frame">
                <img src="/assets/the420lobby-neon-lounge.webp"
                  alt="The 420 Lobby smoke-formed 420, game controller, and green gaming lounge"
                  width={2172} height={724} loading="lazy" decoding="async" />
              </div>
            </section>

            {/* MARQUEE TICKER matching the420lobby */}
            <div className="overflow-hidden border-y border-[#294637] bg-[#10211b] py-3 text-xs font-mono tracking-widest text-[#eaf0dd]">
              <div className="animate-marquee flex items-center gap-8 whitespace-nowrap">
                <span>SMOKE. GAME. CHILL.</span>
                <b className="text-[#b8f875]">✦</b>
                <span>LATE NIGHTS. GOOD PEOPLE.</span>
                <b className="text-[#b8f875]">✦</b>
                <span>THE 420 LOBBY ARCADE</span>
                <b className="text-[#b8f875]">✦</b>
                <span>COMMUNITY SESH SCORES</span>
                <b className="text-[#b8f875]">✦</b>
                <span>AFTER CHEERS, WE PLAY</span>
                <b className="text-[#b8f875]">✦</b>
                <span>SMOKE. GAME. CHILL.</span>
                <b className="text-[#b8f875]">✦</b>
                <span>LATE NIGHTS. GOOD PEOPLE.</span>
                <b className="text-[#b8f875]">✦</b>
                <span>THE 420 LOBBY ARCADE</span>
                <b className="text-[#b8f875]">✦</b>
              </div>
            </div>

            {/* GAMES SECTION matching the420lobby.com/arcade.html */}
            <section id="games" className="max-w-[1376px] w-[calc(100%-48px)] sm:w-[calc(100%-96px)] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-3">
                <div>
                  <p className="text-[#b7c5b5] text-[10px] tracking-widest uppercase font-mono mb-1">
                    01 / THE SELECTION
                  </p>
                  <h2 className="text-4xl sm:text-5xl font-heading text-white tracking-tight">
                    CHOOSE YOUR SESH<span className="text-[#b8f875]">.</span>
                  </h2>
                </div>
                <p className="text-xs text-[#b7c5b5] max-w-xs font-sans">
                  Every game is built for the vibe. Quick sessions, high skill ceiling, no filler.
                </p>
              </div>

              {/* 3 Game Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Game Card 1: Sesh Invaders */}
                <article className="bg-[#10211b] border border-[#294637] rounded-xl overflow-hidden flex flex-col group hover:border-[#b8f875]/50 transition">
                  <div className="relative h-56 bg-radial from-[#3b7265]/40 via-[#142a27]/60 to-[#080f0e] p-4 flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-center z-10">
                      <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-[#080f0e]/80 border border-[#294637] text-[#b8f875]">
                        ZERO-TAP AUTO-BLASTER
                      </span>
                      <span className="text-xs font-mono text-[#b7c5b5]">01</span>
                    </div>

                    <div className="text-center my-auto z-10">
                      <div className="w-16 h-16 mx-auto rounded-full border border-[#b8f875]/40 flex items-center justify-center bg-[#080f0e]/50 shadow-[0_0_20px_rgba(184,248,117,0.2)]">
                        <span className="text-2xl">🍯</span>
                      </div>
                      <span className="font-heading text-2xl text-white tracking-tight mt-2 block">
                        SESH INVADERS
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] font-mono text-[#b7c5b5] z-10">
                      <span>GLASS RIG / SHOOTER</span>
                      <span>AUTO-BLASTER</span>
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-2xl font-heading text-white mb-2">
                        Neon Sesh Invaders
                      </h3>
                      <p className="text-xs text-[#b7c5b5] leading-relaxed mb-6 font-sans">
                        Pilot the Glass Dab Rig Cruiser with continuous zero-tap auto-fire. Clear waves of Frosty Purple Haze Nugs, Live Rosin Jars, 510 Carts, and Heavy Grinder Bosses!
                      </p>
                    </div>

                    <button
                      onClick={() => openGame('sesh-invaders')}
                      className="pt-4 border-t border-[#294637] flex items-center justify-between text-xs font-heading font-bold text-white hover:text-[#b8f875] transition group"
                    >
                      <span>Launch Sesh Invaders</span>
                      <span className="text-[#b8f875] text-base group-hover:translate-x-1 transition-transform">↗</span>
                    </button>
                  </div>
                </article>

                {/* Game Card 2: Bong Blitz */}
                <article className="bg-[#10211b] border border-[#294637] rounded-xl overflow-hidden flex flex-col group hover:border-[#87dcca]/50 transition">
                  <div className="relative h-56 bg-radial from-[#704295]/40 via-[#23172f]/60 to-[#080f0e] p-4 flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-center z-10">
                      <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-[#080f0e]/80 border border-[#294637] text-[#87dcca]">
                        520°F SWEET SPOT
                      </span>
                      <span className="text-xs font-mono text-[#b7c5b5]">02</span>
                    </div>

                    <div className="text-center my-auto z-10">
                      <div className="w-16 h-16 mx-auto rounded-full border border-[#87dcca]/40 flex items-center justify-center bg-[#080f0e]/50 shadow-[0_0_20px_rgba(135,220,202,0.2)]">
                        <span className="text-2xl">💨</span>
                      </div>
                      <span className="font-heading text-2xl text-white tracking-tight mt-2 block">
                        BONG BLITZ
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] font-mono text-[#b7c5b5] z-10">
                      <span>PERCOLATOR RHYTHM</span>
                      <span>35 SECONDS</span>
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-2xl font-heading text-white mb-2">
                        Bong Blitz: Terp Master
                      </h3>
                      <p className="text-xs text-[#b7c5b5] leading-relaxed mb-6 font-sans">
                        Milk the scientific beaker bong at the 520°F terpene vaporization zone. Land clean hits on the beat to unlock Limonene, Myrcene, and 8x Fever Sesh!
                      </p>
                    </div>

                    <button
                      onClick={() => openGame('bong-blitz')}
                      className="pt-4 border-t border-[#294637] flex items-center justify-between text-xs font-heading font-bold text-white hover:text-[#87dcca] transition group"
                    >
                      <span>Play Bong Blitz</span>
                      <span className="text-[#87dcca] text-base group-hover:translate-x-1 transition-transform">↗</span>
                    </button>
                  </div>
                </article>

                {/* Game Card 3: Green Room Runner */}
                <article className="bg-[#10211b] border border-[#294637] rounded-xl overflow-hidden flex flex-col group hover:border-[#b8f875]/50 transition">
                  <div className="relative h-56 bg-radial from-[#3b7265]/40 via-[#142a27]/60 to-[#080f0e] p-4 flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between items-center z-10">
                      <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-[#080f0e]/80 border border-[#294637] text-[#b8f875]">
                        RAW TRAY SKATER
                      </span>
                      <span className="text-xs font-mono text-[#b7c5b5]">03</span>
                    </div>

                    <div className="text-center my-auto z-10">
                      <div className="w-16 h-16 mx-auto rounded-full border border-[#b8f875]/40 flex items-center justify-center bg-[#080f0e]/50 shadow-[0_0_20px_rgba(184,248,117,0.2)]">
                        <span className="text-2xl">🌿</span>
                      </div>
                      <span className="font-heading text-2xl text-white tracking-tight mt-2 block">
                        CANNA-RUNNER
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] font-mono text-[#b7c5b5] z-10">
                      <span>DISPENSARY RUNNER</span>
                      <span>ENDLESS</span>
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-2xl font-heading text-white mb-2">
                        Canna-Runner: Dispensary Express
                      </h3>
                      <p className="text-xs text-[#b7c5b5] leading-relaxed mb-6 font-sans">
                        Skate the RAW Rolling Tray down the dispensary tunnel. Harvest Kush Nugs, Live Rosin, and 100mg THC Gummies while dodging Spilled Bong Water and Sizzling Bangers!
                      </p>
                    </div>

                    <button
                      onClick={() => openGame('canna-runner')}
                      className="pt-4 border-t border-[#294637] flex items-center justify-between text-xs font-heading font-bold text-white hover:text-[#b8f875] transition group"
                    >
                      <span>Launch Canna-Runner</span>
                      <span className="text-[#b8f875] text-base group-hover:translate-x-1 transition-transform">↗</span>
                    </button>
                  </div>
                </article>
              </div>

              {/* Sign-in Banner matching the420lobby.com/arcade.html */}
              <div className="mt-8 p-6 bg-[#10211b] border border-[#294637] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <span className="text-3xl text-[#b8f875]">✳</span>
                  <div>
                    <strong className="text-lg font-heading text-white block">
                      SAME CREW. A REAL WAY TO PLAY.
                    </strong>
                    <p className="text-xs text-[#b7c5b5] font-sans">
                      Play as a guest for fun. Sign in with Discord to save scores on the community leaderboards.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('discord')}
                  className="px-6 py-2.5 bg-[#87dcca] hover:bg-[#6bcdb8] text-[#080f0e] font-heading font-bold text-xs rounded transition flex items-center space-x-1.5 shrink-0"
                >
                  <span>Connect Discord</span>
                  <span>↗</span>
                </button>
              </div>
            </section>

            <IndieSpotlight />

            {/* TWO-COLUMN PLAYER GRID: Leaderboard + Trophy Shelf */}
            <section className="max-w-[1376px] w-[calc(100%-48px)] sm:w-[calc(100%-96px)] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div id="leaderboard" className="lg:col-span-7">
                <LeaderboardView />
              </div>

              <div id="profile" className="lg:col-span-5 space-y-6">
                {/* Player Profile Card */}
                <div className="bg-[#10211b] border border-[#294637] rounded-xl p-5 md:p-6 shadow-xl">
                  <p className="text-[#b7c5b5] text-[10px] tracking-widest uppercase font-mono mb-1">
                    03 / YOUR CORNER OF THE LOBBY
                  </p>
                  <h3 className="text-2xl font-heading text-white mb-4">
                    PLAYER ONE<span className="text-[#b8f875]">.</span>
                  </h3>

                  <div className="flex items-center space-x-3.5 pb-4 border-b border-[#294637]">
                    <img
                      src={currentUser.avatarUrl}
                      alt=""
                      className="w-12 h-12 rounded-full border border-[#87dcca] object-cover bg-[#080f0e]"
                    />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-base">{currentUser.username}</span>
                        <span className="text-[#b7c5b5] text-xs font-mono">{currentUser.tag}</span>
                      </div>
                      <span className="text-xs text-[#87dcca] font-mono block">
                        {currentUser.roles.join(' · ')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 text-center font-mono">
                    <div className="bg-[#080f0e] p-2 rounded border border-[#294637]">
                      <span className="text-[9px] text-[#b7c5b5] block">ROUNDS</span>
                      <strong className="text-lg text-[#b8f875] font-arcade">{currentUser.totalGamesPlayed}</strong>
                    </div>
                    <div className="bg-[#080f0e] p-2 rounded border border-[#294637]">
                      <span className="text-[9px] text-[#b7c5b5] block">SCORE</span>
                      <strong className="text-lg text-[#b8f875] font-arcade">{currentUser.totalScore.toLocaleString()}</strong>
                    </div>
                    <div className="bg-[#080f0e] p-2 rounded border border-[#294637]">
                      <span className="text-[9px] text-[#b7c5b5] block">STATUS</span>
                      <strong className="text-xs text-[#87dcca] block mt-1">{currentUser.isDiscordConnected?'CONNECTED':'GUEST'}</strong>
                    </div>
                  </div>
                </div>

                {/* Trophy Shelf */}
                <TrophyShelf achievements={achievements} />
              </div>
            </section>

            {/* COMMUNITY CARDS SECTION matching the420lobby.com/arcade.html */}
            <section className="max-w-[1376px] w-[calc(100%-48px)] sm:w-[calc(100%-96px)] mx-auto pt-6 border-t border-[#294637]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <p className="text-[#b7c5b5] text-[10px] tracking-widest uppercase font-mono mb-1">
                    THE NIGHT DOESN'T END HERE
                  </p>
                  <h2 className="text-3xl font-heading text-white">
                    BACK TO THE LOBBY<span className="text-[#b8f875]">.</span>
                  </h2>
                </div>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#b8f875] hover:underline font-mono"
                >
                  Explore the community ↗
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <a
                  href={links.experiences}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#10211b] border border-[#294637] hover:border-[#b8f875]/50 p-5 rounded-xl flex items-center space-x-4 transition group"
                >
                  <span className="text-2xl text-[#b8f875] font-mono">▦</span>
                  <div className="flex-1">
                    <h4 className="text-lg font-heading text-white group-hover:text-[#b8f875] transition">
                      MINECRAFT HUB
                    </h4>
                    <p className="text-xs text-[#b7c5b5] font-sans">Java + Bedrock. A world for the crew.</p>
                    <small className="text-[9px] text-[#8ea79a] font-mono">Connection details coming soon</small>
                  </div>
                  <span className="text-[#b7c5b5] group-hover:text-[#b8f875] transition">↗</span>
                </a>

                <a
                  href="/#after-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#10211b] border border-[#294637] hover:border-[#87dcca]/50 p-5 rounded-xl flex items-center space-x-4 transition group"
                >
                  <span className="text-2xl text-[#87dcca] font-mono">▷</span>
                  <div className="flex-1">
                    <h4 className="text-lg font-heading text-white group-hover:text-[#87dcca] transition">
                      DANK CINEMA
                    </h4>
                    <p className="text-xs text-[#b7c5b5] font-sans">Movie nights hit different together.</p>
                    <small className="text-[9px] text-[#8ea79a] font-mono">Find watch parties in Discord</small>
                  </div>
                  <span className="text-[#b7c5b5] group-hover:text-[#87dcca] transition">↗</span>
                </a>

                <a
                  href="https://discord.gg/the420lobby"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#10211b] border border-[#294637] hover:border-[#b8f875]/50 p-5 rounded-xl flex items-center space-x-4 transition group"
                >
                  <span className="text-2xl text-[#b8f875] font-mono">☻</span>
                  <div className="flex-1">
                    <h4 className="text-lg font-heading text-white group-hover:text-[#b8f875] transition">
                      FIND YOUR PEOPLE
                    </h4>
                    <p className="text-xs text-[#b7c5b5] font-sans">Gaming, hanging out, and good company.</p>
                    <small className="text-[9px] text-[#8ea79a] font-mono">Join The 420 Lobby on Discord</small>
                  </div>
                  <span className="text-[#b7c5b5] group-hover:text-[#b8f875] transition">↗</span>
                </a>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: Discord Suite */}
        {activeTab === 'discord' && (
          <div className="max-w-[1376px] w-[calc(100%-48px)] sm:w-[calc(100%-96px)] mx-auto py-10">
            <button type="button" onClick={()=>setActiveTab('main')}
              className="text-[#b8f875] font-mono text-xs mb-6 hover:underline">← BACK TO THE ARCADE</button>
            <DiscordSuite currentUser={currentUser} csrfToken={session?.csrfToken||null} configured={Boolean(session?.configured)} />
          </div>
        )}

        
      </main>

      {/* GAME ROOM MODAL DIALOG matching .game-dialog in arcade.css */}
      {activeGameModal && (
        <div className="fixed inset-0 z-50 bg-[#080f0e]/90 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-[#10211b] border border-[#294637] rounded-xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#294637] mb-4">
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-lg">🎮</span>
                <h3 className="font-heading text-lg sm:text-xl text-white whitespace-nowrap">
                  THE GAME ROOM<span className="text-[#b8f875]">.</span>
                </h3>
              </div>

              {/* Difficulty Dropdown & Quick Toggle in Modal Header */}
              <div className="flex items-center gap-2 ml-auto">
                <label
                  htmlFor="modal-difficulty-select"
                  className="text-[10px] font-mono uppercase tracking-wider text-[#b7c5b5] hidden sm:inline whitespace-nowrap"
                >
                  Difficulty:
                </label>
                <select
                  id="modal-difficulty-select"
                  aria-label="Difficulty"
                  value={gameDifficulty}
                  onChange={e => {
                    e.currentTarget.blur();
                    sounds.playCoin();
                    setGameDifficulty(e.target.value as GameDifficulty);
                  }}
                  className="bg-[#080f0e] border border-[#294637] hover:border-[#b8f875] text-xs font-mono font-bold text-[#b8f875] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#b8f875] transition cursor-pointer whitespace-nowrap"
                >
                  <option value="Chill">Chill (0.75x)</option>
                  <option value="Normal">Normal (1.0x)</option>
                  <option value="Fever">420 Fever (1.5x)</option>
                </select>
              </div>

              <button
                onClick={closeGame}
                className="p-1.5 text-[#b7c5b5] hover:text-white hover:bg-[#294637] rounded transition shrink-0"
                aria-label="Close game"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Game Canvas */}
            <div className="flex justify-center">
              {activeGameModal === 'sesh-invaders' && (
                <SeshInvaders
                  onGameOver={handleGameOver}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                  difficulty={gameDifficulty}
                  onChangeDifficulty={setGameDifficulty}
                />
              )}
              {activeGameModal === 'bong-blitz' && (
                <BongBlitz
                  onGameOver={handleGameOver}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                  difficulty={gameDifficulty}
                  onChangeDifficulty={setGameDifficulty}
                />
              )}
              {activeGameModal === 'canna-runner' && (
                <CannaRunner
                  onGameOver={handleGameOver}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                  difficulty={gameDifficulty}
                  onChangeDifficulty={setGameDifficulty}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Score Celebration Modal */}
      {showScoreCelebration && recentRun && (
        <div className="fixed inset-0 z-50 bg-[#080f0e]/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#10211b] border border-[#b8f875] rounded-xl p-6 max-w-sm w-full text-center space-y-4 shadow-[0_0_30px_rgba(184,248,117,0.25)]">
            <span className="text-3xl text-yellow-300">🏆</span>
            <div>
              <span className="text-[#87dcca] text-[10px] uppercase font-mono tracking-widest block">
                ROUND COMPLETED
              </span>
              <h3 className="text-3xl font-heading text-white">
                {recentRun.score.toLocaleString()} PTS<span className="text-[#b8f875]">.</span>
              </h3>
              <p className="text-xs text-[#b7c5b5] mt-1 font-sans">
                {recordStatus}
              </p>
            </div>

            <div className="bg-[#080f0e] border border-[#294637] rounded p-3 text-xs space-y-1.5 text-[#b7c5b5] font-mono">
              <div className="flex justify-between">
                <span>Max Combo Streak:</span>
                <span className="text-[#b8f875] font-bold">{recentRun.maxCombo}x</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="text-white">{recentRun.durationSeconds}s</span>
              </div>
              <div className="flex justify-between">
                <span>Score identity:</span><span className="text-[#87dcca]">{session?.user?'Discord account':'Guest (local only)'}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button type="button" onClick={() => {setShowScoreCelebration(false);setActiveTab('main');document.getElementById('leaderboard')?.scrollIntoView({behavior:'smooth'});}} className="w-full py-2.5 bg-[#87dcca] text-[#080f0e] font-heading font-bold rounded">View Community Leaderboard</button>

              <button
                onClick={() => setShowScoreCelebration(false)}
                className="w-full py-2 bg-[#080f0e] border border-[#294637] hover:bg-[#294637] text-[#eaf0dd] font-heading text-xs rounded transition"
              >
                Back to Arcade
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="arcade-site-footer">
        <div className="footer-shell">
          <div>
            <a className="footer-logo" href={links.home}>THE 420 <strong>LOBBY.</strong></a>
            <p>Game. Sesh. Repeat.</p>
            <p className="arcade-disclaimer">Just for fun. No real-world prizes or Discord roles. Community scores are account-linked, not replay-verified.</p>
          </div>
          <div className="footer-links">
            <a href={links.vibe}>THE VIBE</a>
            <a href="/#experiences">WHAT WE DO</a>
            <a href={links.top}>BACK TO TOP ↑</a>
            <a href="https://discord.gg/the420lobby" target="_blank" rel="noopener noreferrer">JOIN THE SERVER ↗</a>
            <small>© 2026 THE 420 LOBBY.</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
