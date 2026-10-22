import React, { useEffect, useRef, useState, useCallback } from 'react';
import { sounds } from '../game/audio.ts';
import { calculateTimingScore, getDifficultyConfig } from '../game/rules.ts';
import { GameDifficulty, RunResult } from '../game/types.ts';
import { Play, RotateCcw, Volume2, VolumeX, Flame, Pause } from 'lucide-react';

interface RhythmBeat {
  id: number;
  targetTime: number;
  travelDuration: number;
  radius: number;
  hit: boolean;
  missed: boolean;
  color: string;
  terpene: string;
  strain: string;
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
}

interface SmokeCloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  maxLife: number;
  life: number;
}

interface HitSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
}

const TERPENE_PROFILES = [
  { name: 'LIMONENE', desc: 'Citrus & Euphoria', strain: 'Super Lemon Haze', color: '#ecc94b' },
  { name: 'MYRCENE', desc: 'Deep Couchlock', strain: 'Granddaddy Purple', color: '#87dcca' },
  { name: 'CARYOPHYLLENE', desc: 'Spicy Terp Profile', strain: 'Girl Scout Cookies', color: '#ed8936' },
  { name: 'TERPINOLENE', desc: 'Fresh Pine & Haze', strain: 'Jack Herer', color: '#b8f875' },
  { name: 'LINALOOL', desc: 'Floral Calming Chill', strain: 'Lavender Kush', color: '#d6bcfa' }
];

export default function BongBlitz({
  onGameOver,
  isMuted,
  onToggleMute,
  difficulty = 'Normal',
  onChangeDifficulty
}: {
  onGameOver: (result: RunResult) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  difficulty?: GameDifficulty;
  onChangeDifficulty?: (d: GameDifficulty) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>('title');
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [feverActive, setFeverActive] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(35);
  const [currentTerpene, setCurrentTerpene] = useState<string>('MYRCENE');
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('arcade:hiscore:bong-blitz')) || 0;
    } catch {
      return 3200;
    }
  });

  const diffConfig = getDifficultyConfig(difficulty);

  const stateRef = useRef({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfectHits: 0,
    niceHits: 0,
    misses: 0,
    totalHits: 0,
    elapsedMs: 0,
    durationMs: 35000,
    beats: [] as RhythmBeat[],
    floatingTexts: [] as FloatingText[],
    smokeClouds: [] as SmokeCloud[],
    sparks: [] as HitSpark[],
    pulseScale: 1.0,
    bowlMilkAlpha: 0,
    lastBeatSpawnTime: 0,
    nextBeatId: 0,
    lighterFlameActive: false,
    lighterFlameTimer: 0
  });

  const triggerStart = useCallback(() => {
    sounds.playCoin();
    stateRef.current = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfectHits: 0,
      niceHits: 0,
      misses: 0,
      totalHits: 0,
      elapsedMs: 0,
      durationMs: 35000,
      beats: [],
      floatingTexts: [],
      smokeClouds: [],
      sparks: [],
      pulseScale: 1.0,
      bowlMilkAlpha: 0,
      lastBeatSpawnTime: 0,
      nextBeatId: 0,
      lighterFlameActive: false,
      lighterFlameTimer: 0
    };

    setScore(0);
    setCombo(0);
    setFeverActive(false);
    setTimeLeft(35);
    setGameState('playing');
    document.body.dataset.state = 'playing';
  }, []);

  const handleHit = useCallback(() => {
    if (gameState !== 'playing') return;

    const st = stateRef.current;
    const elapsed = st.elapsedMs;

    let closestBeat: RhythmBeat | null = null;
    let closestDiff = Infinity;

    for (const beat of st.beats) {
      if (beat.hit || beat.missed) continue;
      const diff = Math.abs(elapsed - beat.targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestBeat = beat;
      }
    }

    const hitWindow = difficulty === 'Chill' ? 280 : difficulty === 'Fever' ? 220 : 250;

    if (closestBeat && closestDiff <= hitWindow) {
      closestBeat.hit = true;
      const offsetMs = elapsed - closestBeat.targetTime;
      const result = calculateTimingScore(offsetMs, st.combo, difficulty);

      st.score += result.totalPoints;
      st.combo = result.newCombo;
      st.maxCombo = Math.max(st.maxCombo, st.combo);
      st.totalHits++;

      setScore(st.score);
      setCombo(st.combo);
      setFeverActive(st.combo >= 8);

      st.pulseScale = 1.38;
      st.bowlMilkAlpha = Math.min(1.0, st.bowlMilkAlpha + 0.35);
      st.lighterFlameActive = true;
      st.lighterFlameTimer = 0.28;

      // Dense milky bong smoke burst
      for (let s = 0; s < 14; s++) {
        st.smokeClouds.push({
          x: 250 + (Math.random() - 0.5) * 44,
          y: 205 + (Math.random() - 0.5) * 32,
          vx: (Math.random() - 0.5) * 65,
          vy: -Math.random() * 85 - 45,
          radius: Math.random() * 18 + 12,
          alpha: 0.85,
          maxLife: 0.85,
          life: 0
        });
      }

      // Terp spark burst around target ring
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const spd = Math.random() * 130 + 60;
        st.sparks.push({
          x: 250 + Math.cos(ang) * 48,
          y: 220 + Math.sin(ang) * 48,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          color: result.rating === 'PERFECT' ? '#b8f875' : closestBeat.color,
          life: 0,
          maxLife: 0.38
        });
      }

      sounds.playBongBubble();

      let color = '#b8f875';
      if (result.rating === 'PERFECT') {
        color = '#b8f875';
        st.perfectHits++;
        sounds.playPerfect();
      } else if (result.rating === 'NICE') {
        color = '#87dcca';
        st.niceHits++;
        sounds.playHit();
      } else {
        color = '#ecc94b';
        sounds.playHit();
      }

      setCurrentTerpene(closestBeat.terpene);

      st.floatingTexts.push({
        id: Math.random(),
        text: `${result.rating} +${result.totalPoints}! (${closestBeat.terpene})`,
        x: 250,
        y: 175,
        color,
        life: 0.85
      });
    } else {
      st.combo = 0;
      st.misses++;
      st.bowlMilkAlpha = Math.max(0, st.bowlMilkAlpha - 0.4);
      setCombo(0);
      setFeverActive(false);
      sounds.playDefeat();

      st.floatingTexts.push({
        id: Math.random(),
        text: 'HARSH RIP · TIMING MISS!',
        x: 250,
        y: 175,
        color: '#ef4444',
        life: 0.65
      });
    }
  }, [gameState, difficulty]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === 'playing' || gameState === 'paused') {
          setGameState(prev => {
            const next = prev === 'playing' ? 'paused' : 'playing';
            document.body.dataset.state = next;
            return next;
          });
          return;
        }
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (gameState === 'title') {
          triggerStart();
        } else if (gameState === 'playing') {
          handleHit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, handleHit, triggerStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const st = stateRef.current;
      const cfg = getDifficultyConfig(difficulty);

      if (gameState === 'playing') {
        st.elapsedMs += dt * 1000;
        const elapsed = st.elapsedMs;
        const remaining = Math.max(0, Math.ceil((st.durationMs - elapsed) / 1000));
        setTimeLeft(remaining);

        if (st.lighterFlameTimer > 0) {
          st.lighterFlameTimer -= dt;
          if (st.lighterFlameTimer <= 0) st.lighterFlameActive = false;
        }

        st.bowlMilkAlpha = Math.max(0, st.bowlMilkAlpha - dt * 0.35);

        if (elapsed >= st.durationMs) {
          setGameState('gameover');
          document.body.dataset.state = 'gameover';
          sounds.playAchievement();

          if (st.score > highScore) {
            setHighScore(st.score);
            try {
              localStorage.setItem('arcade:hiscore:bong-blitz', String(st.score));
            } catch {}
          }

          const accuracy =
            st.totalHits + st.misses > 0
              ? Math.round((st.totalHits / (st.totalHits + st.misses)) * 100)
              : 0;

          onGameOver({
            gameId: 'bong-blitz',
            score: st.score,
            maxCombo: st.maxCombo,
            durationMs: st.durationMs,
            difficulty,
            stats: {
              perfectHits: st.perfectHits,
              niceHits: st.niceHits,
              misses: st.misses,
              accuracy,
              durationSeconds: 35
            },
            newAchievements: []
          });
          return;
        }

        // Beat rhythm frequency scaled by difficulty & fever mode
        const baseInterval = st.combo >= 8 ? 500 : 680;
        const beatInterval = baseInterval / cfg.spawnRateMultiplier;
        const travelDuration = Math.round(1380 / cfg.enemySpeedMultiplier);

        if (elapsed - st.lastBeatSpawnTime >= beatInterval) {
          st.lastBeatSpawnTime = elapsed;
          const terpPick = TERPENE_PROFILES[Math.floor(Math.random() * TERPENE_PROFILES.length)];

          st.beats.push({
            id: st.nextBeatId++,
            targetTime: elapsed + travelDuration,
            travelDuration,
            radius: 210,
            hit: false,
            missed: false,
            color: st.combo >= 8 ? '#87dcca' : terpPick.color,
            terpene: terpPick.name,
            strain: terpPick.strain
          });
        }

        const sweetSpotRadius = 50;
        for (const beat of st.beats) {
          if (beat.hit || beat.missed) continue;
          const timeUntilTarget = beat.targetTime - elapsed;
          const progress = timeUntilTarget / beat.travelDuration;
          beat.radius = sweetSpotRadius + progress * 160;

          if (timeUntilTarget < -240) {
            beat.missed = true;
            st.combo = 0;
            st.misses++;
            setCombo(0);
            setFeverActive(false);
          }
        }

        st.beats = st.beats.filter(b => !b.missed && !b.hit);

        for (let i = st.floatingTexts.length - 1; i >= 0; i--) {
          const ft = st.floatingTexts[i];
          ft.y -= dt * 55;
          ft.life -= dt;
          if (ft.life <= 0) {
            st.floatingTexts.splice(i, 1);
          }
        }

        for (let i = st.smokeClouds.length - 1; i >= 0; i--) {
          const sc = st.smokeClouds[i];
          sc.x += sc.vx * dt;
          sc.y += sc.vy * dt;
          sc.radius += dt * 16;
          sc.life += dt;
          sc.alpha = Math.max(0, 1 - sc.life / sc.maxLife);
          if (sc.life >= sc.maxLife) {
            st.smokeClouds.splice(i, 1);
          }
        }

        for (let i = st.sparks.length - 1; i >= 0; i--) {
          const sp = st.sparks[i];
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          sp.life += dt;
          if (sp.life >= sp.maxLife) {
            st.sparks.splice(i, 1);
          }
        }

        st.pulseScale = Math.max(1.0, st.pulseScale - dt * 2.6);
      }

      // ==========================================
      // STUDIO-GRADE BONG BLITZ RENDERING
      // ==========================================
      ctx.save();
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#07090d');
      bgGrad.addColorStop(1, '#101712');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const isFever = st.combo >= 8;

      // Radial Terpene Aura Glow
      const gradient = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
      gradient.addColorStop(0, isFever ? 'rgba(179, 138, 249, 0.30)' : 'rgba(187, 255, 100, 0.18)');
      gradient.addColorStop(1, 'rgba(10, 13, 10, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 1. DIGITAL E-NAIL PID TEMPERATURE CONTROLLER (Left Side Equipment)
      ctx.save();
      ctx.translate(22, 340);
      ctx.fillStyle = '#10211b';
      ctx.strokeStyle = '#294637';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(0, 0, 106, 68, 6);
      ctx.fill();
      ctx.stroke();

      // Digital LED Screen
      ctx.fillStyle = '#090c0a';
      ctx.fillRect(8, 8, 90, 34);
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillStyle = '#b8f875';
      ctx.fillText('520°F', 14, 26);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#87dcca';
      ctx.fillText('SET: 520°F PID', 14, 37);

      // Power & Coil Status Indicator
      ctx.fillStyle = '#b7c5b5';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`TERP: ${currentTerpene.slice(0, 9)}`, 10, 56);
      ctx.restore();

      // 2. SCIENTIFIC PERCOLATOR BEAKER BONG WITH ICE PINCHES
      ctx.save();
      ctx.translate(cx, cy + 45);

      ctx.strokeStyle = isFever ? '#87dcca' : '#b8f875';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = isFever ? '#87dcca' : '#b8f875';
      ctx.shadowBlur = 18;

      // Thick flared mouthpiece lip at top
      ctx.beginPath();
      ctx.roundRect(-22, -162, 44, 9, 4);
      ctx.fill();
      ctx.stroke();

      // Main Borosilicate Beaker Silhouette
      ctx.beginPath();
      ctx.moveTo(-17, -153);
      ctx.lineTo(17, -153);
      ctx.lineTo(17, -38);
      ctx.lineTo(68, 72);
      ctx.lineTo(-68, 72);
      ctx.lineTo(-17, -38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Thick Borosilicate Base Foot
      ctx.fillStyle = isFever ? 'rgba(179, 138, 249, 0.35)' : 'rgba(187, 255, 100, 0.35)';
      ctx.beginPath();
      ctx.roundRect(-72, 70, 144, 7, 3);
      ctx.fill();

      // Translucent Ice Cubes Resting on Ice Pinch Notches in Neck
      ctx.fillStyle = 'rgba(190, 227, 248, 0.28)';
      ctx.strokeStyle = 'rgba(190, 227, 248, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-11, -95, 22, 18, 4);
      ctx.roundRect(-10, -118, 20, 18, 4);
      ctx.fill();
      ctx.stroke();

      // Percolator Water Reservoir
      ctx.fillStyle = isFever ? 'rgba(179, 138, 249, 0.45)' : 'rgba(56, 161, 105, 0.48)';
      ctx.beginPath();
      ctx.moveTo(-54, 38);
      ctx.lineTo(54, 38);
      ctx.lineTo(66, 70);
      ctx.lineTo(-66, 70);
      ctx.closePath();
      ctx.fill();

      // Tree / Showerhead Percolator Arms
      ctx.strokeStyle = '#b8f875';
      ctx.lineWidth = 2.2;
      for (let p = -30; p <= 30; p += 15) {
        ctx.beginPath();
        ctx.moveTo(0, 28);
        ctx.lineTo(p, 44);
        ctx.lineTo(p, 62);
        ctx.stroke();
      }

      // Animated Percolation Water Bubbles
      const bubY = (time * 0.045) % 26;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-22, 62 - bubY, 3, 0, Math.PI * 2);
      ctx.arc(18, 64 - ((bubY * 1.25) % 26), 2.5, 0, Math.PI * 2);
      ctx.arc(0, 60 - ((bubY * 0.85) % 26), 3.5, 0, Math.PI * 2);
      ctx.arc(-8, 63 - ((bubY * 1.5) % 26), 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Milky White Dense Chamber Smoke (scales with combo & hit)
      const smokeDensity = Math.min(0.88, st.bowlMilkAlpha * 0.75 + Math.min(st.combo * 0.04, 0.35));
      if (smokeDensity > 0.04) {
        const smokeGrad = ctx.createLinearGradient(0, -150, 0, 38);
        smokeGrad.addColorStop(0, `rgba(245, 250, 245, ${smokeDensity * 0.65})`);
        smokeGrad.addColorStop(1, `rgba(225, 255, 230, ${smokeDensity})`);
        ctx.fillStyle = smokeGrad;
        ctx.beginPath();
        ctx.moveTo(-15, -150);
        ctx.lineTo(15, -150);
        ctx.lineTo(15, -38);
        ctx.lineTo(52, 38);
        ctx.lineTo(-52, 38);
        ctx.lineTo(-15, -38);
        ctx.closePath();
        ctx.fill();
      }

      // 14mm Diffused Glass Downstem & Flower Bowl Piece
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(4, 52);
      ctx.lineTo(48, 8);
      ctx.stroke();

      // Conical 14mm Glass Bowl Piece
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.beginPath();
      ctx.arc(48, 8, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Frosty Gelato 33 Kush Packed in Bowl
      ctx.fillStyle = st.lighterFlameActive ? '#e53e3e' : '#2f855a';
      ctx.shadowColor = st.lighterFlameActive ? '#ef4444' : '#48bb78';
      ctx.shadowBlur = st.lighterFlameActive ? 14 : 6;
      ctx.beginPath();
      ctx.arc(48, 6, 9.5, 0, Math.PI * 2);
      ctx.fill();

      // Clipper Lighter / Jet Torch Flame Igniting Bowl
      if (st.lighterFlameActive) {
        ctx.fillStyle = '#f6ad55';
        ctx.shadowColor = '#ed8936';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(48, -2);
        ctx.quadraticCurveTo(56, -20, 48, -32);
        ctx.quadraticCurveTo(40, -20, 48, -2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(48, -9, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // 3. Active Volumetric Smoke Clouds
      for (const sc of st.smokeClouds) {
        ctx.fillStyle = `rgba(240, 248, 240, ${sc.alpha * 0.58})`;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, sc.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Sweet-Spot Terpene Target Ring (520°F)
      const ringCenterY = cy - 40;
      ctx.save();
      ctx.translate(cx, ringCenterY);
      ctx.scale(st.pulseScale, st.pulseScale);

      // Outer Sweet-Spot Halo
      ctx.strokeStyle = isFever ? 'rgba(179, 138, 249, 0.35)' : 'rgba(187, 255, 100, 0.30)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = isFever ? '#87dcca' : '#b8f875';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = isFever ? '#87dcca' : '#b8f875';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();

      // Center Sweet Spot Core
      ctx.fillStyle = isFever ? '#d6bcfa' : '#b8f875';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#0a0d0a';
      ctx.textAlign = 'center';
      ctx.fillText('520°F', 0, 3);
      ctx.restore();

      // 5. Contracting Rhythm Rings (Highlight bright green when inside PERFECT window!)
      for (const beat of st.beats) {
        if (beat.radius <= 0) continue;
        const inSweetSpot = Math.abs(beat.radius - 50) <= 14;
        ctx.save();
        ctx.strokeStyle = inSweetSpot ? '#b8f875' : beat.color;
        ctx.lineWidth = inSweetSpot ? 5 : 3.5;
        ctx.shadowColor = inSweetSpot ? '#b8f875' : beat.color;
        ctx.shadowBlur = inSweetSpot ? 22 : 12;
        ctx.beginPath();
        ctx.arc(cx, ringCenterY, Math.max(10, beat.radius), 0, Math.PI * 2);
        ctx.stroke();

        if (beat.radius > 75) {
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.fillStyle = beat.color;
          ctx.textAlign = 'center';
          ctx.fillText(`${beat.terpene} · ${beat.strain}`, cx, ringCenterY - beat.radius - 7);
        }
        ctx.restore();
      }

      // 6. Hit Sparks
      for (const sp of st.sparks) {
        const alpha = 1 - sp.life / sp.maxLife;
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // 7. Floating Feedback Text
      for (const ft of st.floatingTexts) {
        ctx.save();
        ctx.font = 'bold 21px "Barlow Condensed", sans-serif';
        ctx.fillStyle = ft.color;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, highScore, onGameOver, difficulty, currentTerpene]);

  return (
    <div className="relative w-full max-w-[540px] mx-auto bg-[#10211b] border border-[#294637] rounded-xl overflow-hidden shadow-2xl">
      {/* Top HUD */}
      <div className="bg-[#080f0e] border-b border-[#294637] px-4 py-2.5 flex items-center justify-between text-xs font-heading tracking-wider">
        <div className="flex items-center space-x-4">
          <div>
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Sesh Score ({diffConfig.scoreMultiplier}x)</span>
            <span className="text-[#b8f875] font-arcade text-base tabular-nums">
              {score.toString().padStart(5, '0')}
            </span>
          </div>
          <div>
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Best Streak</span>
            <span className="text-[#eaf0dd] font-arcade text-xs tabular-nums">
              {stateRef.current.maxCombo}x
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-center">
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Timer</span>
            <span
              className={`font-arcade text-base tabular-nums ${
                timeLeft <= 10 ? 'text-[#ef4444] animate-pulse' : 'text-[#b8f875]'
              }`}
            >
              {timeLeft}s
            </span>
          </div>

          <div className="text-center pl-1">
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Combo</span>
            <span
              className={`font-bold font-mono text-sm tabular-nums ${
                feverActive ? 'text-[#87dcca]' : 'text-[#b8f875]'
              }`}
            >
              {combo}x {feverActive && '🔥'}
            </span>
          </div>

          {gameState === 'playing' && (
            <button
              onClick={() => {
                setGameState('paused');
                document.body.dataset.state = 'paused';
              }}
              className="p-1.5 text-[#b7c5b5] hover:text-white transition"
              aria-label="Pause Game"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onToggleMute}
            className="p-1.5 text-[#b7c5b5] hover:text-[#b8f875] transition"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Terpene Monitor Strip */}
      <div className="bg-[#121813] border-b border-[#233527] px-3 py-1 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-1.5 text-[#b8f875]">
          <Flame className="w-3.5 h-3.5 fill-current text-[#ecc94b]" />
          <span>
            TERPENE: <b className="text-white">{currentTerpene}</b>
          </span>
        </div>
        <span className="text-[10px] text-[#87dcca] font-semibold">
          {difficulty.toUpperCase()} ({diffConfig.scoreMultiplier}x) · 520°F SWEET SPOT
        </span>
      </div>

      {/* Canvas Viewport */}
      <div
        onClick={handleHit}
        className="relative aspect-[500/500] w-full bg-[#080f0e] cursor-pointer select-none touch-none"
      >
        <canvas ref={canvasRef} width={500} height={500} className="w-full h-full block" />

        {/* Start / Title Overlay */}
        {gameState === 'title' && (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute inset-0 bg-[#080f0e]/92 flex flex-col items-center justify-center p-6 text-center z-30"
          >
            <span className="text-[#87dcca] text-xs font-mono uppercase tracking-widest mb-1">
              SCIENTIFIC PERCOLATOR RHYTHM
            </span>
            <h2 className="text-4xl sm:text-5xl font-heading text-white tracking-tight mb-2">
              BONG BLITZ: TERP MASTER<span className="text-[#b8f875]">.</span>
            </h2>
            <p className="text-[#b7c5b5] text-xs max-w-sm mb-4 font-sans leading-relaxed">
              Hit the 520°F terpene vaporization sweet spot! Spark the 14mm flower bowl right as contracting terp rings align with the target ring to milk the beaker chamber.
            </p>

            {onChangeDifficulty && (
              <div className="w-full max-w-xs mb-4 bg-[#10211b] border border-[#294637] rounded-lg p-2.5">
                <div className="text-[10px] font-mono uppercase text-[#b7c5b5] mb-1.5">
                  Select Sesh Intensity (Difficulty)
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Chill', 'Normal', 'Fever'] as GameDifficulty[]).map(lvl => {
                    const c = getDifficultyConfig(lvl);
                    const active = difficulty === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => onChangeDifficulty(lvl)}
                        className={`py-1.5 px-2 rounded text-xs font-heading font-bold transition whitespace-nowrap ${
                          active
                            ? 'bg-[#b8f875] text-[#080f0e] shadow-sm'
                            : 'bg-[#080f0e] text-[#b7c5b5] hover:text-white border border-[#294637]'
                        }`}
                      >
                        {lvl} · {c.scoreMultiplier}x
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[#b7c5b5] mt-1.5 font-mono">{diffConfig.description}</p>
              </div>
            )}

            <button
              onClick={triggerStart}
              data-start="true"
              className="px-8 py-3.5 bg-[#b8f875] hover:bg-[#a0e465] text-[#080f0e] font-heading font-extrabold text-lg tracking-wider rounded-lg transition transform hover:scale-105 shadow-[0_0_20px_rgba(184,248,117,0.4)] flex items-center space-x-2"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>START SESH</span>
            </button>

            <div className="mt-4 text-[#b7c5b5] text-[11px] font-mono">
              Tap Canvas or Rip Button · Space / Enter · P to Pause
            </div>
          </div>
        )}

        {/* Paused Overlay */}
        {gameState === 'paused' && (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute inset-0 bg-[#080f0e]/90 flex flex-col items-center justify-center p-6 text-center z-30"
          >
            <h3 className="text-3xl font-heading text-[#b8f875] mb-4 tracking-widest">
              SESH PAUSED<span>.</span>
            </h3>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setGameState('playing');
                  document.body.dataset.state = 'playing';
                }}
                className="px-5 py-2.5 bg-[#b8f875] text-[#080f0e] font-heading text-base font-bold rounded"
              >
                Resume
              </button>
              <button
                onClick={triggerStart}
                className="px-5 py-2.5 bg-[#10211b] border border-[#294637] hover:border-[#87dcca] text-white font-heading text-base font-bold rounded"
              >
                Restart
              </button>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'gameover' && (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute inset-0 bg-[#080f0e]/95 flex flex-col items-center justify-center p-6 text-center z-30"
          >
            <span className="text-[#87dcca] text-xs font-mono tracking-widest uppercase mb-1">
              BOWL CLEARED · {difficulty.toUpperCase()} MODE
            </span>
            <h3 className="text-4xl font-heading text-white mb-4">
              SESH COMPLETE<span className="text-[#b8f875]">.</span>
            </h3>

            <div className="bg-[#10211b] border border-[#294637] rounded-lg p-4 w-full max-w-xs mb-5 space-y-1.5 text-xs tabular-nums">
              <div className="flex justify-between py-1 border-b border-[#294637]">
                <span className="text-[#b7c5b5]">Final Score ({diffConfig.scoreMultiplier}x):</span>
                <span className="font-arcade text-base text-[#b8f875]">{score}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#294637]">
                <span className="text-[#b7c5b5]">Perfect 520°F Rips:</span>
                <span className="text-[#b8f875] font-bold font-mono">{stateRef.current.perfectHits}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#b7c5b5]">Max Combo Streak:</span>
                <span className="text-[#87dcca] font-bold font-mono">{stateRef.current.maxCombo}x</span>
              </div>
            </div>

            <button
              onClick={triggerStart}
              data-start="true"
              className="px-8 py-3 bg-[#b8f875] hover:bg-[#a0e465] text-[#080f0e] font-heading text-base font-bold rounded transition transform hover:scale-105 flex items-center space-x-2 shadow-[0_0_15px_rgba(184,248,117,0.3)]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>PACK ANOTHER BOWL</span>
            </button>
          </div>
        )}
      </div>

      {/* Dedicated Bottom Action Button for Mobile & Desktop */}
      <div className="bg-[#080f0e] border-t border-[#294637] p-3">
        <button
          type="button"
          onPointerDown={e => {
            e.preventDefault();
            if (gameState === 'playing') handleHit();
          }}
          className="w-full py-3 bg-[#b8f875] active:bg-[#a0e465] text-[#080f0e] font-heading font-extrabold text-sm tracking-wider rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(184,248,117,0.25)] transition active:scale-98 select-none touch-none"
        >
          <Flame className="w-4 h-4 fill-current" />
          <span>IGNITE BOWL & RIP (TAP / SPACE)</span>
        </button>
      </div>
    </div>
  );
}
