import React, { useEffect, useRef, useState, useCallback } from 'react';
import { sounds } from '../game/audio.ts';
import { getDifficultyConfig } from '../game/rules.ts';
import { GameDifficulty, RunResult } from '../game/types.ts';
import { Play, RotateCcw, Volume2, VolumeX, Sparkles, ArrowLeft, ArrowRight, ArrowUp, Pause } from 'lucide-react';

export type CannaObstacleType = 'spilled-water' | 'hot-banger' | 'burnt-coil' | 'rolling-grinder';

interface Obstacle {
  id: number;
  lane: number;
  y: number;
  type: CannaObstacleType;
  label: string;
  canJumpOver: boolean;
  passed: boolean;
}

export type CannaCollectibleType = 'kush-nug' | 'rosin-jar' | 'thc-gummy' | 'vape-cart' | 'kief-coin' | 'clipper-turbo';

interface Collectible {
  id: number;
  lane: number;
  y: number;
  type: CannaCollectibleType;
  label: string;
  points: number;
  collected: boolean;
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface RunnerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export default function CannaRunner({
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
  const [distance, setDistance] = useState<number>(0);
  const [trichomes, setTrichomes] = useState<number>(0);
  const [turboActive, setTurboActive] = useState<boolean>(false);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('arcade:hiscore:canna-runner')) || 0;
    } catch {
      return 2800;
    }
  });

  const diffConfig = getDifficultyConfig(difficulty);
  const lanePositions = [110, 250, 390];

  const stateRef = useRef({
    score: 0,
    distance: 0,
    trichomes: 0,
    lane: 1,
    targetX: 250,
    playerX: 250,
    playerY: 412,
    tiltAngle: 0,
    isJumping: false,
    jumpY: 0,
    jumpVy: 0,
    speed: 380,
    turboUntil: 0,
    startTime: 0,
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    popups: [] as FloatingPopup[],
    particles: [] as RunnerParticle[],
    nextObstacleDist: 170,
    nextCollectibleDist: 75,
    nextId: 0,
    touchStartX: 0,
    touchStartY: 0
  });

  const triggerStart = useCallback(() => {
    const cfg = getDifficultyConfig(difficulty);
    sounds.playCoin();
    stateRef.current = {
      score: 0,
      distance: 0,
      trichomes: 0,
      lane: 1,
      targetX: 250,
      playerX: 250,
      playerY: 412,
      tiltAngle: 0,
      isJumping: false,
      jumpY: 0,
      jumpVy: 0,
      speed: 375 * cfg.enemySpeedMultiplier,
      turboUntil: 0,
      startTime: Date.now(),
      obstacles: [],
      collectibles: [],
      popups: [],
      particles: [],
      nextObstacleDist: 170,
      nextCollectibleDist: 75,
      nextId: 0,
      touchStartX: 0,
      touchStartY: 0
    };
    setScore(0);
    setDistance(0);
    setTrichomes(0);
    setTurboActive(false);
    setGameState('playing');
    document.body.dataset.state = 'playing';
  }, [difficulty]);

  const moveLane = useCallback(
    (dir: -1 | 1) => {
      const st = stateRef.current;
      const newLane = Math.max(0, Math.min(2, st.lane + dir));
      if (newLane !== st.lane) {
        st.lane = newLane;
        st.targetX = lanePositions[newLane];
        st.tiltAngle = dir * 0.22;
        sounds.playHit();
      }
    },
    [lanePositions]
  );

  const jump = useCallback(() => {
    const st = stateRef.current;
    if (!st.isJumping) {
      st.isJumping = true;
      st.jumpVy = -520;
      sounds.playLaser();
    }
  }, []);

  const addBurst = (x: number, y: number, color: string, count = 12) => {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 140 + 40;
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: Math.random() * 3 + 2,
        life: 0,
        maxLife: 0.38
      });
    }
  };

  const addPopup = (x: number, y: number, text: string, color: string) => {
    stateRef.current.popups.push({
      x,
      y,
      text,
      color,
      life: 0,
      maxLife: 0.75
    });
  };

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

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code)) {
        e.preventDefault();
      }

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          triggerStart();
        }
      } else if (gameState === 'playing') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') moveLane(-1);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') moveLane(1);
        if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') jump();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, moveLane, jump, triggerStart]);

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
        const now = Date.now();
        const isTurbo = now < st.turboUntil;
        setTurboActive(isTurbo);

        const currentSpeed = isTurbo ? st.speed * 1.38 : st.speed;

        st.playerX += (st.targetX - st.playerX) * Math.min(1, dt * 16);
        st.tiltAngle += (0 - st.tiltAngle) * Math.min(1, dt * 10);

        if (st.isJumping) {
          st.jumpY += st.jumpVy * dt;
          st.jumpVy += 1450 * dt;
          if (st.jumpY >= 0) {
            st.jumpY = 0;
            st.isJumping = false;
          }
        }

        const movedDist = currentSpeed * dt * 0.12;
        st.distance += movedDist;
        setDistance(Math.floor(st.distance));

        // Speed ramp up over distance scaled by difficulty
        const baseSpeed = 375 * cfg.enemySpeedMultiplier;
        const maxSpeed = 590 * cfg.enemySpeedMultiplier;
        st.speed = Math.min(maxSpeed, baseSpeed + st.distance * 0.35);

        // Spawn actual THC Products as Collectibles
        st.nextCollectibleDist -= movedDist;
        if (st.nextCollectibleDist <= 0) {
          st.nextCollectibleDist = Math.random() * 42 + 32;
          const lane = Math.floor(Math.random() * 3);

          const collectiblePool: { type: CannaCollectibleType; label: string; points: number }[] = [
            { type: 'kush-nug', label: 'OG Kush Nug', points: 50 },
            { type: 'rosin-jar', label: 'Live Rosin 90u', points: 150 },
            { type: 'thc-gummy', label: '100mg THC Gummy', points: 200 },
            { type: 'vape-cart', label: '510 Live Cart', points: 250 },
            { type: 'kief-coin', label: 'Pressed Kief Coin', points: 100 }
          ];

          // Balanced 6% chance for Clipper Turbo Lighter
          if (Math.random() < 0.06 && !isTurbo) {
            collectiblePool.push({ type: 'clipper-turbo', label: 'Clipper Turbo', points: 300 });
          }

          const pick = collectiblePool[Math.floor(Math.random() * collectiblePool.length)];
          const scaledPts = Math.round(pick.points * cfg.scoreMultiplier);

          st.collectibles.push({
            id: st.nextId++,
            lane,
            y: -30,
            type: pick.type,
            label: pick.label,
            points: scaledPts,
            collected: false
          });
        }

        // Spawn actual Sesh Hazards as Obstacles (scaled by difficulty, never blocking all 3 lanes)
        st.nextObstacleDist -= movedDist;
        if (st.nextObstacleDist <= 0) {
          st.nextObstacleDist = (Math.random() * 82 + 74) / cfg.spawnRateMultiplier;

          // Ensure we don't form an impassable 3-lane wall near top of screen
          const occupiedLanes = new Set(
            st.obstacles.filter(o => o.y < 110).map(o => o.lane)
          );
          const availableLanes = [0, 1, 2].filter(l => !occupiedLanes.has(l));
          if (availableLanes.length > 0) {
            const lane = availableLanes[Math.floor(Math.random() * availableLanes.length)];

            const obstaclePool: { type: CannaObstacleType; label: string; canJumpOver: boolean }[] = [
              { type: 'spilled-water', label: 'Spilled Bong Water', canJumpOver: true },
              { type: 'hot-banger', label: '710°F Quartz Banger', canJumpOver: true },
              { type: 'burnt-coil', label: 'Burnt Coil Cloud', canJumpOver: false },
              { type: 'rolling-grinder', label: 'Heavy Rolling Grinder', canJumpOver: false }
            ];
            const pick = obstaclePool[Math.floor(Math.random() * obstaclePool.length)];

            st.obstacles.push({
              id: st.nextId++,
              lane,
              y: -30,
              type: pick.type,
              label: pick.label,
              canJumpOver: pick.canJumpOver,
              passed: false
            });
          }
        }

        // Update Collectibles
        for (let i = st.collectibles.length - 1; i >= 0; i--) {
          const col = st.collectibles[i];
          col.y += currentSpeed * dt;

          if (
            !col.collected &&
            col.lane === st.lane &&
            Math.abs(col.y - (st.playerY + st.jumpY)) < 38
          ) {
            col.collected = true;
            sounds.playCollect();

            if (col.type === 'clipper-turbo') {
              st.turboUntil = Date.now() + 4500;
              sounds.playPowerUp();
              addPopup(lanePositions[col.lane], col.y - 10, 'SATIVA TURBO!', '#f6ad55');
            } else {
              addPopup(lanePositions[col.lane], col.y - 10, `+${col.points}`, '#b8f875');
            }

            addBurst(lanePositions[col.lane], col.y, '#b8f875', 12);
            st.trichomes++;
            st.score += col.points;
            setTrichomes(st.trichomes);
            setScore(st.score);
          }

          if (col.y > canvas.height + 40 || col.collected) {
            st.collectibles.splice(i, 1);
          }
        }

        // Update Obstacles & Collision Check
        for (let i = st.obstacles.length - 1; i >= 0; i--) {
          const obs = st.obstacles[i];
          obs.y += currentSpeed * dt;

          const isJumpingOver = st.isJumping && st.jumpY < -24 && obs.canJumpOver;
          const isCollision =
            obs.lane === st.lane &&
            Math.abs(obs.y - st.playerY) < 30 &&
            !isJumpingOver;

          if (isCollision) {
            if (isTurbo) {
              sounds.playExplosion();
              const bonus = Math.round(100 * cfg.scoreMultiplier);
              addBurst(lanePositions[obs.lane], obs.y, '#f6ad55', 18);
              addPopup(lanePositions[obs.lane], obs.y - 12, `SMASH +${bonus}!`, '#f6ad55');
              st.obstacles.splice(i, 1);
              st.score += bonus;
              setScore(st.score);
              continue;
            }

            sounds.playDefeat();
            setGameState('gameover');
            document.body.dataset.state = 'gameover';

            if (st.score > highScore) {
              setHighScore(st.score);
              try {
                localStorage.setItem('arcade:hiscore:canna-runner', String(st.score));
              } catch {}
            }

            onGameOver({
              gameId: 'canna-runner',
              score: st.score,
              maxCombo: Math.floor(st.trichomes / 2),
              durationMs: Date.now() - st.startTime,
              difficulty,
              stats: {
                distance: Math.floor(st.distance),
                trichomes: st.trichomes,
                durationSeconds: Math.round((Date.now() - st.startTime) / 1000)
              },
              newAchievements: []
            });
            return;
          }

          if (obs.y > canvas.height + 40) {
            st.obstacles.splice(i, 1);
          }
        }

        // Update particles & popups
        for (let i = st.particles.length - 1; i >= 0; i--) {
          const pt = st.particles[i];
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.life += dt;
          if (pt.life >= pt.maxLife) st.particles.splice(i, 1);
        }

        for (let i = st.popups.length - 1; i >= 0; i--) {
          const pp = st.popups[i];
          pp.y -= 45 * dt;
          pp.life += dt;
          if (pp.life >= pp.maxLife) st.popups.splice(i, 1);
        }
      }

      // ==========================================
      // 3D-PERSPECTIVE DISPENSARY GROW TUNNEL RENDER
      // ==========================================
      ctx.save();
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#07080d');
      bgGrad.addColorStop(0.5, '#0b100e');
      bgGrad.addColorStop(1, '#121a15');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const isTurbo = Date.now() < st.turboUntil;

      // Overhead Full-Spectrum LED Grow Light Bars scrolling perspective
      const stripeOffset = (time * (st.speed * 0.0022)) % 60;
      ctx.strokeStyle = isTurbo ? 'rgba(251, 211, 141, 0.28)' : 'rgba(187, 255, 100, 0.14)';
      ctx.lineWidth = 2;
      for (let y = -60 + stripeOffset; y < canvas.height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(35, y);
        ctx.lineTo(canvas.width - 35, y);
        ctx.stroke();
      }

      // Outer Tunnel Walls & 3-Lane Dividers
      ctx.strokeStyle = isTurbo ? '#ecc94b' : 'rgba(179, 138, 249, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(40, canvas.height);
      ctx.moveTo(canvas.width - 40, 0);
      ctx.lineTo(canvas.width - 40, canvas.height);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(48, 43, 59, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 10]);
      for (const lx of [180, 320]) {
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, canvas.height);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // DRAW ACTUAL THC COLLECTIBLES
      for (const col of st.collectibles) {
        if (col.collected) continue;
        const cx = lanePositions[col.lane];
        const bob = Math.sin(time * 0.008 + col.id) * 3;
        ctx.save();
        ctx.translate(cx, col.y + bob);

        // Subtle collectible aura ring
        ctx.strokeStyle = 'rgba(187, 255, 100, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 19, 0, Math.PI * 2);
        ctx.stroke();

        if (col.type === 'kush-nug') {
          // 🌿 Frosty OG Kush Flower Nug
          ctx.fillStyle = '#276749';
          ctx.shadowColor = '#48bb78';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.arc(-6, -4, 8.5, 0, Math.PI * 2);
          ctx.arc(6, -4, 8.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#48bb78';
          ctx.beginPath();
          ctx.arc(-2, -2, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ed8936';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(6, -3);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-2, -5, 2, 2);
          ctx.fillRect(3, 3, 2, 2);
        } else if (col.type === 'rosin-jar') {
          // 🍯 Cold Cure Live Rosin Jar
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.strokeStyle = '#ecc94b';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#ecc94b';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.roundRect(-14, -8, 28, 19, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#d69e2e';
          ctx.beginPath();
          ctx.roundRect(-10, -1, 20, 9, 2);
          ctx.fill();

          ctx.fillStyle = '#1a202c';
          ctx.fillRect(-15, -13, 30, 5);
        } else if (col.type === 'thc-gummy') {
          // 🍬 100mg THC Sour Gummy Cube
          ctx.fillStyle = '#e53e3e';
          ctx.shadowColor = '#e53e3e';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.roundRect(-11, -11, 22, 22, 6);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('THC', 0, 3);
        } else if (col.type === 'vape-cart') {
          // 💨 510 Live Resin Vape Cart
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.roundRect(-5, -16, 10, 6, 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.strokeStyle = '#ecc94b';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.rect(-6, -10, 12, 18);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#dd6b20';
          ctx.fillRect(-5, -7, 10, 14);
        } else if (col.type === 'clipper-turbo') {
          // 🔥 Clipper Lighter Turbo
          ctx.fillStyle = '#f6ad55';
          ctx.shadowColor = '#ed8936';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.roundRect(-8, -12, 16, 26, 4);
          ctx.fill();

          ctx.fillStyle = '#feebc8';
          ctx.beginPath();
          ctx.arc(0, -17, 5.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 🪙 Pressed Kief Coin
          ctx.fillStyle = '#d69e2e';
          ctx.shadowColor = '#d69e2e';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#fefcbf';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.restore();
      }

      // DRAW ACTUAL SESH HAZARDS (OBSTACLES) WITH ACTION CUES
      for (const obs of st.obstacles) {
        const ox = lanePositions[obs.lane];
        ctx.save();
        ctx.translate(ox, obs.y);

        if (obs.type === 'spilled-water') {
          // ⚠️ Spilled Bong Water Puddle (Can Jump Over)
          ctx.fillStyle = 'rgba(49, 130, 206, 0.48)';
          ctx.strokeStyle = '#63b3ed';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#3182ce';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.ellipse(0, 0, 38, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-16, -4);
          ctx.lineTo(-5, 5);
          ctx.moveTo(5, -5);
          ctx.lineTo(15, 4);
          ctx.stroke();
        } else if (obs.type === 'hot-banger') {
          // ⚠️ Red-Hot Quartz Banger 710°F (Can Jump Over)
          ctx.fillStyle = '#e53e3e';
          ctx.shadowColor = '#f56565';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.roundRect(-15, -10, 30, 20, 4);
          ctx.fill();

          ctx.strokeStyle = '#f6ad55';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-10, -16);
          ctx.quadraticCurveTo(-6, -24, -2, -16);
          ctx.moveTo(2, -16);
          ctx.quadraticCurveTo(6, -24, 10, -16);
          ctx.stroke();
        } else if (obs.type === 'burnt-coil') {
          // ⚠️ Burnt Vape Coil Smoke Cloud (Switch Lane)
          ctx.fillStyle = 'rgba(100, 116, 139, 0.78)';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, 24, 0, Math.PI * 2);
          ctx.arc(-11, -6, 16, 0, Math.PI * 2);
          ctx.arc(11, -6, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // ⚠️ Heavy Rolling 4-Piece Grinder (Switch Lane)
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(-14, -3, 28, 6);
        }

        // Clear Tactical Badge (JUMP vs DODGE)
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillStyle = obs.canJumpOver ? '#b8f875' : '#fca5a5';
        ctx.textAlign = 'center';
        ctx.fillText(obs.canJumpOver ? '⬆ JUMP' : '⇄ DODGE', 0, 25);

        ctx.restore();
      }

      // Jump Shadow on Ground
      if (st.isJumping) {
        const shadowScale = Math.max(0.45, 1 + st.jumpY / 160);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(st.playerX, st.playerY + 14, 26 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // DRAW PLAYER: HOVERING RAW ROLLING TRAY SKATER WITH LIT JOINT
      const py = st.playerY + st.jumpY;
      ctx.save();
      ctx.translate(st.playerX, py);
      ctx.rotate(st.tiltAngle);

      // Hover Thruster Glow underneath tray
      ctx.fillStyle = isTurbo ? '#f6ad55' : '#b8f875';
      ctx.shadowColor = isTurbo ? '#f6ad55' : '#b8f875';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.ellipse(-16, 13, 6, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(16, 13, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Metallic Gold / Hemp RAW Rolling Tray Deck
      ctx.fillStyle = isTurbo ? '#ecc94b' : '#c89d54';
      ctx.strokeStyle = isTurbo ? '#ffffff' : '#b8f875';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-30, -13, 60, 25, 7);
      ctx.fill();
      ctx.stroke();

      // Inner Tray Rim
      ctx.strokeStyle = 'rgba(20, 16, 12, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-25, -9, 50, 17, 4);
      ctx.stroke();

      // King-Size Rolled Joint Resting on Tray
      ctx.fillStyle = '#f7fafc';
      ctx.beginPath();
      ctx.roundRect(-19, -4, 36, 8, 2);
      ctx.fill();

      // Brown Cardboard Filter Tip
      ctx.fillStyle = '#d69e2e';
      ctx.fillRect(-19, -4, 8, 8);

      // Glowing Red Cherry Ember at Tip
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(18, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Trailing Smoke Wisps
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(23, -8, 3, 0, Math.PI * 2);
      ctx.arc(27, -16, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Particles & Floating Popups
      for (const pt of st.particles) {
        const alpha = 1 - pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      for (const pp of st.popups) {
        const alpha = 1 - pp.life / pp.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = pp.color;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(pp.text, pp.x, pp.y);
        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, highScore, lanePositions, onGameOver, difficulty]);

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
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Distance</span>
            <span className="text-[#eaf0dd] font-arcade text-xs tabular-nums">{distance}m</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-center">
            <span className="text-[#b7c5b5] uppercase block text-[9px]">THC Harvest</span>
            <span className="text-[#b8f875] font-bold text-sm tabular-nums">🌿 {trichomes}</span>
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

      {/* Turbo Status Banner */}
      <div className="bg-[#121813] border-b border-[#233527] px-3 py-1 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-1.5 text-[#b8f875]">
          <Sparkles className="w-3.5 h-3.5 fill-current text-[#ecc94b]" />
          <span>
            {turboActive ? '🔥 SATIVA TURBO OVERDRIVE: INVINCIBLE!' : 'RAW TRAY SKATER · SWIPE OR BUTTONS'}
          </span>
        </div>
        <span className="text-[10px] text-[#87dcca] font-semibold">
          {difficulty.toUpperCase()} ({diffConfig.scoreMultiplier}x)
        </span>
      </div>

      {/* Main Runner Stage with Touch Swipe Support */}
      <div
        onTouchStart={e => {
          stateRef.current.touchStartX = e.touches[0].clientX;
          stateRef.current.touchStartY = e.touches[0].clientY;
        }}
        onTouchEnd={e => {
          if (gameState !== 'playing') return;
          const dx = e.changedTouches[0].clientX - stateRef.current.touchStartX;
          const dy = e.changedTouches[0].clientY - stateRef.current.touchStartY;
          if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
            moveLane(dx > 0 ? 1 : -1);
          } else if (dy < -25) {
            jump();
          }
        }}
        className="relative aspect-[500/500] w-full bg-[#080f0e] select-none touch-none"
      >
        <canvas ref={canvasRef} width={500} height={500} className="w-full h-full block" />

        {/* Start Overlay */}
        {gameState === 'title' && (
          <div className="absolute inset-0 bg-[#080f0e]/92 flex flex-col items-center justify-center p-6 text-center z-30">
            <span className="text-[#87dcca] text-xs font-mono uppercase tracking-widest mb-1">
              DISPENSARY EXPRESS RUNNER
            </span>
            <h2 className="text-4xl sm:text-5xl font-heading text-white tracking-tight mb-2">
              CANNA-RUNNER<span className="text-[#b8f875]">.</span>
            </h2>
            <p className="text-[#b7c5b5] text-xs max-w-sm mb-4 font-sans leading-relaxed">
              Hover-skate the RAW Rolling Tray through the hydroponic tunnel. Harvest OG Kush Nugs, 90u Live Rosin, and 100mg Gummies. Jump over low puddles & bangers, and switch lanes to dodge tall grinders!
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
              <span>LAUNCH RUNNER</span>
            </button>

            <div className="mt-4 text-[#b7c5b5] text-[11px] font-mono">
              ← → / A D : Switch Lanes · Space / ↑ : Jump · P to Pause
            </div>
          </div>
        )}

        {/* Paused Overlay */}
        {gameState === 'paused' && (
          <div className="absolute inset-0 bg-[#080f0e]/90 flex flex-col items-center justify-center p-6 text-center z-30">
            <h3 className="text-3xl font-heading text-[#b8f875] mb-4 tracking-widest">
              RUN PAUSED<span>.</span>
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
          <div className="absolute inset-0 bg-[#080f0e]/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <span className="text-[#87dcca] text-xs font-mono tracking-widest uppercase mb-1">
              RUN COMPLETED · {difficulty.toUpperCase()} MODE
            </span>
            <h3 className="text-4xl font-heading text-white mb-4">
              CRASH DETECTED<span className="text-[#b8f875]">.</span>
            </h3>

            <div className="bg-[#10211b] border border-[#294637] rounded-lg p-4 w-full max-w-xs mb-5 tabular-nums">
              <div className="flex justify-between py-1.5 text-xs border-b border-[#294637]">
                <span className="text-[#b7c5b5]">Total Score ({diffConfig.scoreMultiplier}x):</span>
                <span className="font-arcade text-base text-[#b8f875]">{score}</span>
              </div>
              <div className="flex justify-between py-1.5 text-xs border-b border-[#294637]">
                <span className="text-[#b7c5b5]">Distance Travelled:</span>
                <span className="text-[#b8f875] font-bold font-mono">{distance}m</span>
              </div>
              <div className="flex justify-between py-1.5 text-xs">
                <span className="text-[#b7c5b5]">THC Products Collected:</span>
                <span className="text-white font-bold font-mono">{trichomes}</span>
              </div>
            </div>

            <button
              onClick={triggerStart}
              data-start="true"
              className="px-8 py-3 bg-[#b8f875] hover:bg-[#a0e465] text-[#080f0e] font-heading text-base font-bold rounded transition transform hover:scale-105 flex items-center space-x-2 shadow-[0_0_15px_rgba(184,248,117,0.3)]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>TRY AGAIN</span>
            </button>
          </div>
        )}
      </div>

      {/* Responsive Touch Navigation Controls for Mobile & Desktop */}
      <div className="bg-[#080f0e] border-t border-[#294637] p-3 flex items-center justify-between gap-2">
        <div className="flex space-x-2">
          <button
            onClick={() => moveLane(-1)}
            className="w-16 h-12 bg-[#10211b] border border-[#294637] active:bg-[#b8f875] active:text-[#080f0e] rounded-lg text-lg font-bold flex items-center justify-center text-white transition active:scale-95"
            aria-label="Move Lane Left"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => moveLane(1)}
            className="w-16 h-12 bg-[#10211b] border border-[#294637] active:bg-[#b8f875] active:text-[#080f0e] rounded-lg text-lg font-bold flex items-center justify-center text-white transition active:scale-95"
            aria-label="Move Lane Right"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={jump}
          className="flex-1 ml-2 h-12 bg-[#b8f875] active:bg-[#a0e465] text-[#080f0e] font-heading font-extrabold rounded-lg flex items-center justify-center text-sm tracking-wider gap-2 shadow-[0_0_12px_rgba(184,248,117,0.25)] transition active:scale-98"
        >
          <ArrowUp className="w-4 h-4" />
          <span>VAULT / JUMP (SPACE)</span>
        </button>
      </div>
    </div>
  );
}
