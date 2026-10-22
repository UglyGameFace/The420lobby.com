import React, { useEffect, useRef, useState, useCallback } from 'react';
import { sounds } from '../game/audio.ts';
import { calculateInvaderScore, getDifficultyConfig, shouldSpawnPowerUp } from '../game/rules.ts';
import { GameDifficulty, RunResult } from '../game/types.ts';
import { Play, RotateCcw, Volume2, VolumeX, Sparkles, Zap, ArrowLeft, ArrowRight, Pause } from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingScore {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface Bullet {
  x: number;
  y: number;
  vy: number;
  vx?: number;
  isEnemy: boolean;
  color: string;
  size?: number;
}

export type THCEnemyType = 'frosty-nug' | 'rosin-jar' | 'vape-cart' | 'raw-cone' | 'grinder-boss';

interface Enemy {
  id: number;
  type: THCEnemyType;
  x: number;
  y: number;
  baseY: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  shootCooldown: number;
  hitFlash: number;
  phaseOffset: number;
  color: string;
  label: string;
  subLabel: string;
}

export type THCPowerUpType = 'rosin' | 'pearls' | 'torch' | 'stash-jar';

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  type: THCPowerUpType;
  color: string;
  label: string;
  icon: string;
}

interface DabMatBunker {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
}

export default function SeshInvaders({
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
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('arcade:hiscore:sesh-invaders')) || 0;
    } catch {
      return 2400;
    }
  });
  const [wave, setWave] = useState<number>(1);
  const [lives, setLives] = useState<number>(3);
  const [activePowerUp, setActivePowerUp] = useState<string | null>(null);
  const [powerUpTimeLeft, setPowerUpTimeLeft] = useState<number>(0);

  const [holdingLeft, setHoldingLeft] = useState<boolean>(false);
  const [holdingRight, setHoldingRight] = useState<boolean>(false);

  const diffConfig = getDifficultyConfig(difficulty);

  const stateRef = useRef({
    score: 0,
    wave: 1,
    lives: 3,
    maxCombo: 0,
    currentCombo: 0,
    cleanKills: 0,
    startTime: 0,
    autoFire: true,
    lastPowerUpSpawnTime: 0,
    powerUpsSpawnedThisWave: 0,
    player: {
      x: 226,
      y: 442,
      width: 48,
      height: 52,
      speed: 430,
      bankAngle: 0,
      hasShield: false,
      tripleShotUntil: 0,
      torchBoostUntil: 0,
      invulnerableUntil: 0
    },
    bunkers: [] as DabMatBunker[],
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    powerUps: [] as PowerUp[],
    particles: [] as Particle[],
    floatingScores: [] as FloatingScore[],
    keys: new Set<string>(),
    touchButtons: { left: false, right: false },
    lastShootTime: 0,
    waveSpawned: false,
    hitstop: 0,
    screenShake: 0
  });

  const spawnWave = useCallback(
    (currentWave: number) => {
      const cfg = getDifficultyConfig(difficulty);
      const enemies: Enemy[] = [];
      const rows = Math.min(3 + Math.floor(currentWave / 2), 5);
      const cols = difficulty === 'Chill' ? 6 : 7;
      const startX = difficulty === 'Chill' ? 50 : 25;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let type: THCEnemyType = 'frosty-nug';
          let hp = 1;
          let color = '#48bb78';
          let label = 'Frosty Nug';
          let subLabel = 'Purple Haze';
          let width = 36;
          let height = 30;

          if (r === 0) {
            if (c === Math.floor(cols / 2) && currentWave >= 2) {
              type = 'grinder-boss';
              hp = Math.round((10 + currentWave * 4) * cfg.spawnRateMultiplier);
              color = '#f6ad55';
              label = 'Grinder Boss';
              subLabel = '4-Piece CNC Alloy';
              width = 54;
              height = 42;
            } else {
              type = 'rosin-jar';
              hp = difficulty === 'Chill' ? 2 : 3;
              color = '#ecc94b';
              label = 'Live Rosin';
              subLabel = 'Cold Cure 90u';
              width = 38;
              height = 32;
            }
          } else if (r === 1) {
            type = 'vape-cart';
            hp = 2;
            color = '#ed8936';
            label = '510 Vape Cart';
            subLabel = 'Live Resin';
            width = 32;
            height = 34;
          } else if (r === 2) {
            type = 'raw-cone';
            hp = 1;
            color = '#d69e2e';
            label = 'RAW Cone';
            subLabel = 'King Size';
            width = 34;
            height = 28;
          } else {
            type = 'frosty-nug';
            hp = 1;
            color = '#38a169';
            label = 'Kush Nug';
            subLabel = 'OG Kush 28%';
            width = 36;
            height = 30;
          }

          const baseY = 38 + r * 45;
          enemies.push({
            id: r * cols + c,
            type,
            x: startX + c * 64,
            y: baseY,
            baseY,
            width,
            height,
            hp,
            maxHp: hp,
            vx: (36 + currentWave * 6.5) * cfg.enemySpeedMultiplier,
            vy: 0,
            shootCooldown: (Math.random() * 3.2 + 1.6) / cfg.spawnRateMultiplier,
            hitFlash: 0,
            phaseOffset: (r * 0.7) + (c * 0.45),
            color,
            label,
            subLabel
          });
        }
      }
      stateRef.current.enemies = enemies;
      stateRef.current.powerUpsSpawnedThisWave = 0;
      stateRef.current.waveSpawned = true;
    },
    [difficulty]
  );

  const triggerStart = useCallback(() => {
    sounds.playCoin();
    const now = Date.now();
    stateRef.current = {
      score: 0,
      wave: 1,
      lives: 3,
      maxCombo: 0,
      currentCombo: 0,
      cleanKills: 0,
      startTime: now,
      autoFire: true,
      lastPowerUpSpawnTime: now - 3000, // Initial grace period before first powerup can drop
      powerUpsSpawnedThisWave: 0,
      player: {
        x: 226,
        y: 442,
        width: 48,
        height: 52,
        speed: 430,
        bankAngle: 0,
        hasShield: false,
        tripleShotUntil: 0,
        torchBoostUntil: 0,
        invulnerableUntil: 0
      },
      bunkers: [
        { x: 95, y: 392, width: 76, height: 14, hp: 8, maxHp: 8 },
        { x: 329, y: 392, width: 76, height: 14, hp: 8, maxHp: 8 }
      ],
      bullets: [],
      enemies: [],
      powerUps: [],
      particles: [],
      floatingScores: [],
      keys: new Set(),
      touchButtons: { left: false, right: false },
      lastShootTime: 0,
      waveSpawned: false,
      hitstop: 0,
      screenShake: 0
    };
    spawnWave(1);
    setScore(0);
    setWave(1);
    setLives(3);
    setActivePowerUp(null);
    setPowerUpTimeLeft(0);
    setGameState('playing');
    document.body.dataset.state = 'playing';
  }, [spawnWave]);

  const shoot = useCallback(() => {
    const now = Date.now();
    const st = stateRef.current;
    const isTorch = now < st.player.torchBoostUntil;
    const fireInterval = isTorch ? 95 : 165;

    if (now - st.lastShootTime < fireInterval) return;
    st.lastShootTime = now;

    if (isTorch) {
      sounds.playLighterClick();
    } else {
      sounds.playLaser();
    }

    const p = st.player;
    const isTriple = now < p.tripleShotUntil;

    if (isTriple) {
      st.bullets.push(
        { x: p.x + p.width / 2, y: p.y, vy: -600, vx: 0, isEnemy: false, color: '#b8f875', size: 4.5 },
        { x: p.x + p.width / 2 - 12, y: p.y + 6, vy: -560, vx: -135, isEnemy: false, color: '#f6ad55', size: 3.5 },
        { x: p.x + p.width / 2 + 12, y: p.y + 6, vy: -560, vx: 135, isEnemy: false, color: '#f6ad55', size: 3.5 }
      );
    } else {
      st.bullets.push({
        x: p.x + p.width / 2,
        y: p.y,
        vy: -600,
        vx: 0,
        isEnemy: false,
        color: isTorch ? '#fbd38d' : '#b8f875',
        size: isTorch ? 5 : 4
      });
    }
  }, []);

  const addParticles = (x: number, y: number, color: string, count = 12) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 150 + 40;
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 0.42 + 0.18,
        color,
        size: Math.random() * 3 + 2
      });
    }
  };

  const addFloatingScore = (x: number, y: number, text: string, color: string) => {
    stateRef.current.floatingScores.push({
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
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
      }

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          triggerStart();
          return;
        }
      }

      if (gameState === 'playing' || gameState === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          setGameState(prev => {
            const next = prev === 'playing' ? 'paused' : 'playing';
            document.body.dataset.state = next;
            return next;
          });
          return;
        }
      }

      if (gameState === 'playing') {
        stateRef.current.keys.add(e.code);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, triggerStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const rawDt = (time - lastTime) / 1000;
      lastTime = time;
      const dt = Math.min(rawDt, 0.05);
      const st = stateRef.current;
      const cfg = getDifficultyConfig(difficulty);

      if (gameState === 'playing') {
        if (st.autoFire) {
          shoot();
        }

        if (st.hitstop > 0) {
          st.hitstop -= dt;
        } else {
          const simDt = dt;

          if (st.enemies.length === 0) {
            st.wave++;
            setWave(st.wave);
            spawnWave(st.wave);
            sounds.playBongBubble();
            addFloatingScore(canvas.width / 2, 220, `WAVE ${st.wave} · FRESH BATCH!`, '#b8f875');
          }

          const p = st.player;
          let moveDir = 0;
          if (st.keys.has('ArrowLeft') || st.keys.has('KeyA') || st.touchButtons.left) moveDir -= 1;
          if (st.keys.has('ArrowRight') || st.keys.has('KeyD') || st.touchButtons.right) moveDir += 1;

          p.x += moveDir * p.speed * dt;
          p.x = Math.max(12, Math.min(canvas.width - p.width - 12, p.x));
          // Smooth ship banking angle
          const targetBank = moveDir * 0.16;
          p.bankAngle += (targetBank - p.bankAngle) * Math.min(1, dt * 14);

          // Bullet updates
          for (let i = st.bullets.length - 1; i >= 0; i--) {
            const b = st.bullets[i];
            b.y += b.vy * simDt;
            if (b.vx) b.x += b.vx * simDt;

            if (b.y < -15 || b.y > canvas.height + 15 || b.x < -15 || b.x > canvas.width + 15) {
              st.bullets.splice(i, 1);
              continue;
            }

            // Check enemy bullets hitting Silicone Dab Mat Bunkers
            if (b.isEnemy) {
              let hitBunker = false;
              for (const bk of st.bunkers) {
                if (bk.hp > 0 && b.x >= bk.x && b.x <= bk.x + bk.width && b.y >= bk.y && b.y <= bk.y + bk.height) {
                  bk.hp--;
                  hitBunker = true;
                  addParticles(b.x, b.y, '#b8f875', 5);
                  break;
                }
              }
              if (hitBunker) {
                st.bullets.splice(i, 1);
                continue;
              }
            }

            // Player hits enemy
            if (!b.isEnemy) {
              let hitEnemy = false;
              for (let j = st.enemies.length - 1; j >= 0; j--) {
                const en = st.enemies[j];
                if (
                  b.x >= en.x &&
                  b.x <= en.x + en.width &&
                  b.y >= en.y &&
                  b.y <= en.y + en.height
                ) {
                  hitEnemy = true;
                  en.hp--;
                  en.hitFlash = 0.08;
                  addParticles(b.x, b.y, en.color, 5);

                  if (en.hp <= 0) {
                    sounds.playExplosion();
                    st.hitstop = 0.035;
                    st.screenShake = en.type === 'grinder-boss' ? 12 : 4.5;
                    addParticles(
                      en.x + en.width / 2,
                      en.y + en.height / 2,
                      en.color,
                      en.type === 'grinder-boss' ? 30 : 15
                    );

                    const now = Date.now();
                    // Strictly throttled power-up drop logic (no more power-up spam!)
                    if (
                      shouldSpawnPowerUp({
                        activePowerUpsOnScreen: st.powerUps.length,
                        powerUpsSpawnedThisWave: st.powerUpsSpawnedThisWave,
                        maxPerWave: 2,
                        msSinceLastSpawn: now - st.lastPowerUpSpawnTime,
                        minCooldownMs: 9000,
                        isBoss: en.type === 'grinder-boss',
                        randomRoll: Math.random()
                      })
                    ) {
                      const drops: { type: THCPowerUpType; color: string; label: string; icon: string }[] = [
                        { type: 'rosin', color: '#ecc94b', label: 'Live Rosin Dab (Triple Spread)', icon: '🍯' },
                        { type: 'pearls', color: '#87dcca', label: 'Ruby Terp Pearls (Quartz Shield)', icon: '🔮' },
                        { type: 'torch', color: '#f6ad55', label: 'Big Shot Torch (Hyper Heat)', icon: '🔥' },
                        { type: 'stash-jar', color: '#48bb78', label: 'Stash Jar (+1 Rig Life)', icon: '🫙' }
                      ];
                      const pick = drops[Math.floor(Math.random() * drops.length)];
                      st.powerUps.push({
                        x: en.x + en.width / 2,
                        y: en.y,
                        vy: 90,
                        type: pick.type,
                        color: pick.color,
                        label: pick.label,
                        icon: pick.icon
                      });
                      st.lastPowerUpSpawnTime = now;
                      st.powerUpsSpawnedThisWave++;
                    }

                    const enemyKind =
                      en.type === 'grinder-boss'
                        ? 'mothership'
                        : en.type === 'rosin-jar'
                        ? 'buzzkill'
                        : 'drifter';
                    const pts = calculateInvaderScore(
                      enemyKind,
                      st.wave,
                      now < p.tripleShotUntil,
                      difficulty
                    );
                    st.score += pts;
                    st.currentCombo++;
                    st.maxCombo = Math.max(st.maxCombo, st.currentCombo);
                    st.cleanKills++;
                    setScore(st.score);

                    addFloatingScore(en.x + en.width / 2, en.y, `+${pts}`, en.color);
                    st.enemies.splice(j, 1);
                  } else {
                    sounds.playHit();
                  }
                  break;
                }
              }
              if (hitEnemy) {
                st.bullets.splice(i, 1);
              }
            } else {
              // Enemy bullet hits player
              const now = Date.now();
              if (
                now > p.invulnerableUntil &&
                b.x >= p.x &&
                b.x <= p.x + p.width &&
                b.y >= p.y &&
                b.y <= p.y + p.height
              ) {
                st.bullets.splice(i, 1);
                if (p.hasShield) {
                  p.hasShield = false;
                  p.invulnerableUntil = now + 1200;
                  addParticles(p.x + p.width / 2, p.y + p.height / 2, '#87dcca', 22);
                  addFloatingScore(p.x + p.width / 2, p.y - 10, 'SHIELD ABSORBED!', '#87dcca');
                  sounds.playHit();
                } else {
                  st.lives--;
                  st.currentCombo = 0;
                  setLives(st.lives);
                  p.invulnerableUntil = now + 1800;
                  st.screenShake = 12;
                  addParticles(p.x + p.width / 2, p.y + p.height / 2, '#ef4444', 26);
                  addFloatingScore(p.x + p.width / 2, p.y - 10, 'RIG DAMAGED!', '#ef4444');
                  sounds.playDefeat();

                  if (st.lives <= 0) {
                    setGameState('gameover');
                    document.body.dataset.state = 'gameover';
                    const runDuration = Math.round((Date.now() - st.startTime) / 1000);
                    if (st.score > highScore) {
                      setHighScore(st.score);
                      try {
                        localStorage.setItem('arcade:hiscore:sesh-invaders', String(st.score));
                      } catch {}
                    }
                    onGameOver({
                      gameId: 'sesh-invaders',
                      score: st.score,
                      maxCombo: st.maxCombo,
                      durationMs: Date.now() - st.startTime,
                      difficulty,
                      stats: {
                        wave: st.wave,
                        cleanKills: st.cleanKills,
                        durationSeconds: runDuration
                      },
                      newAchievements: []
                    });
                  }
                }
              }
            }
          }

          // Enemy march logic
          let hitWall = false;
          for (const en of st.enemies) {
            en.x += en.vx * simDt;
            en.hitFlash = Math.max(0, en.hitFlash - simDt);
            if (en.x < 14 || en.x + en.width > canvas.width - 14) {
              hitWall = true;
            }

            // Enemy firing scaled by difficulty
            en.shootCooldown -= simDt;
            if (en.shootCooldown <= 0) {
              en.shootCooldown = (Math.random() * 3.6 + 2.1) / cfg.spawnRateMultiplier;
              const fireChance = 0.36 * cfg.spawnRateMultiplier;
              if (Math.random() < fireChance) {
                st.bullets.push({
                  x: en.x + en.width / 2,
                  y: en.y + en.height,
                  vy: (185 + st.wave * 14) * cfg.enemySpeedMultiplier,
                  isEnemy: true,
                  color: en.color,
                  size: en.type === 'grinder-boss' ? 4.5 : 3.2
                });
              }
            }

            // Invaders reached bottom line
            if (en.y + en.height >= p.y) {
              st.lives = 0;
              setLives(0);
              setGameState('gameover');
              document.body.dataset.state = 'gameover';
              onGameOver({
                gameId: 'sesh-invaders',
                score: st.score,
                maxCombo: st.maxCombo,
                durationMs: Date.now() - st.startTime,
                difficulty,
                stats: {
                  wave: st.wave,
                  cleanKills: st.cleanKills,
                  durationSeconds: Math.round((Date.now() - st.startTime) / 1000)
                },
                newAchievements: []
              });
              break;
            }
          }

          if (hitWall) {
            for (const en of st.enemies) {
              en.vx = -en.vx;
              en.y += 17;
            }
          }

          // Power-up updates
          for (let i = st.powerUps.length - 1; i >= 0; i--) {
            const pw = st.powerUps[i];
            pw.y += pw.vy * simDt;

            if (pw.y > canvas.height + 20) {
              st.powerUps.splice(i, 1);
              continue;
            }

            if (
              pw.x >= p.x - 10 &&
              pw.x <= p.x + p.width + 10 &&
              pw.y >= p.y - 10 &&
              pw.y <= p.y + p.height + 10
            ) {
              sounds.playPowerUp();
              const now = Date.now();

              if (pw.type === 'rosin') {
                p.tripleShotUntil = now + 8000;
                setActivePowerUp('LIVE ROSIN 90u (Triple Spread)');
                addFloatingScore(p.x + p.width / 2, p.y - 14, 'TRIPLE DAB SPREAD!', '#ecc94b');
              } else if (pw.type === 'pearls') {
                p.hasShield = true;
                setActivePowerUp('RUBY TERP PEARLS (Quartz Shield)');
                addFloatingScore(p.x + p.width / 2, p.y - 14, 'TERP PEARL SHIELD!', '#87dcca');
              } else if (pw.type === 'torch') {
                p.torchBoostUntil = now + 7500;
                setActivePowerUp('BIG SHOT JET TORCH (Hyper-Fire)');
                addFloatingScore(p.x + p.width / 2, p.y - 14, 'JET TORCH OVERDRIVE!', '#f6ad55');
              } else if (pw.type === 'stash-jar') {
                if (st.lives < 4) {
                  st.lives++;
                  setLives(st.lives);
                  setActivePowerUp('STASH JAR RESTOCK (+1 Rig Life)');
                  addFloatingScore(p.x + p.width / 2, p.y - 14, '+1 DAB RIG LIFE!', '#48bb78');
                } else {
                  st.score += Math.round(250 * cfg.scoreMultiplier);
                  setScore(st.score);
                  addFloatingScore(p.x + p.width / 2, p.y - 14, '+250 BONUS STASH!', '#48bb78');
                }
              }

              addParticles(pw.x, pw.y, pw.color, 18);
              st.powerUps.splice(i, 1);
            }
          }

          // Update active power-up timer display
          const now = Date.now();
          const pLeft = Math.max(
            0,
            Math.ceil(Math.max(p.tripleShotUntil - now, p.torchBoostUntil - now) / 1000)
          );
          setPowerUpTimeLeft(pLeft);
          if (pLeft === 0 && !p.hasShield) {
            setActivePowerUp(null);
          }

          // Particle updates
          for (let i = st.particles.length - 1; i >= 0; i--) {
            const pt = st.particles[i];
            pt.x += pt.vx * simDt;
            pt.y += pt.vy * simDt;
            pt.life += simDt;
            if (pt.life >= pt.maxLife) {
              st.particles.splice(i, 1);
            }
          }

          // Floating score updates
          for (let i = st.floatingScores.length - 1; i >= 0; i--) {
            const fs = st.floatingScores[i];
            fs.y -= 42 * simDt;
            fs.life += simDt;
            if (fs.life >= fs.maxLife) {
              st.floatingScores.splice(i, 1);
            }
          }
        }
      }

      // ==========================================
      // HIGH-DEFINITION CANVAS RENDERING
      // ==========================================
      ctx.save();
      if (st.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * st.screenShake;
        const shakeY = (Math.random() - 0.5) * st.screenShake;
        ctx.translate(shakeX, shakeY);
        st.screenShake = Math.max(0, st.screenShake - dt * 26);
      }

      // 1. Deep Atmospheric Dispensary Lounge Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#07090c');
      bgGrad.addColorStop(0.65, '#0b100e');
      bgGrad.addColorStop(1, '#111b15');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Ambient Nebula Glow
      const nebGrad = ctx.createRadialGradient(canvas.width / 2, 160, 20, canvas.width / 2, 160, 260);
      nebGrad.addColorStop(0, 'rgba(179, 138, 249, 0.09)');
      nebGrad.addColorStop(0.5, 'rgba(187, 255, 100, 0.04)');
      nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Perspective Horizon Grid at bottom
      ctx.strokeStyle = 'rgba(187, 255, 100, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= canvas.width; gx += 50) {
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 + (gx - canvas.width / 2) * 0.4, 380);
        ctx.lineTo(gx, canvas.height);
        ctx.stroke();
      }
      for (let gy = 395; gy < canvas.height; gy += 28) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvas.width, gy);
        ctx.stroke();
      }

      // 3. Drifting Trichome Starfield
      for (let i = 0; i < 26; i++) {
        const sx = (i * 43 + time * (i % 2 === 0 ? 0.015 : 0.008)) % canvas.width;
        const sy = (i * 59 + time * (0.02 + (i % 3) * 0.01)) % canvas.height;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(179, 138, 249, 0.22)' : 'rgba(187, 255, 100, 0.18)';
        ctx.beginPath();
        ctx.arc(sx, sy, (i % 2) + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Silicone Dab Mat Shield Bunkers
      for (const bk of st.bunkers) {
        if (bk.hp <= 0) continue;
        const hpRatio = bk.hp / bk.maxHp;
        ctx.save();
        ctx.fillStyle = `rgba(21, 19, 27, 0.9)`;
        ctx.strokeStyle = hpRatio > 0.5 ? '#b8f875' : hpRatio > 0.25 ? '#ecc94b' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(bk.x, bk.y, bk.width, bk.height, 4);
        ctx.fill();
        ctx.stroke();

        // Honeycomb silicone dab mat pattern
        ctx.fillStyle = ctx.strokeStyle;
        ctx.globalAlpha = 0.28 * hpRatio + 0.1;
        ctx.fillRect(bk.x + 4, bk.y + 3, (bk.width - 8) * hpRatio, bk.height - 6);
        ctx.globalAlpha = 1;

        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#eaf0dd';
        ctx.textAlign = 'center';
        ctx.fillText(`DAB MAT ${bk.hp}/${bk.maxHp}`, bk.x + bk.width / 2, bk.y + 10);
        ctx.restore();
      }

      // 5. DRAW ACTUAL THC PRODUCTS & OBJECTS (THE INVADERS)
      for (const en of st.enemies) {
        const bobOffset = Math.sin(time * 0.005 + en.phaseOffset) * 2.5;
        ctx.save();
        ctx.translate(en.x, en.y + bobOffset);

        const isFlashing = en.hitFlash > 0;

        if (en.type === 'frosty-nug') {
          // 🌿 FROSTY PURPLE HAZE / OG KUSH FLOWER NUG
          ctx.fillStyle = isFlashing ? '#ffffff' : '#276749';
          ctx.shadowColor = '#48bb78';
          ctx.shadowBlur = 10;

          // Dense multi-calyx bud structure
          ctx.beginPath();
          ctx.arc(18, 16, 12, 0, Math.PI * 2);
          ctx.arc(10, 14, 8.5, 0, Math.PI * 2);
          ctx.arc(26, 14, 8.5, 0, Math.PI * 2);
          ctx.arc(18, 8, 9.5, 0, Math.PI * 2);
          ctx.fill();

          if (!isFlashing) {
            // Lighter lime calyx highlights
            ctx.fillStyle = '#48bb78';
            ctx.beginPath();
            ctx.arc(16, 12, 5.5, 0, Math.PI * 2);
            ctx.arc(22, 15, 5, 0, Math.PI * 2);
            ctx.fill();

            // Purple anthocyanin sugar leaves
            ctx.fillStyle = '#6b46c1';
            ctx.beginPath();
            ctx.ellipse(7, 19, 5.5, 3, Math.PI / 4, 0, Math.PI * 2);
            ctx.ellipse(29, 19, 5.5, 3, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();

            // Fiery orange terpenoid pistils
            ctx.strokeStyle = '#ed8936';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(13, 9);
            ctx.quadraticCurveTo(18, 4, 23, 10);
            ctx.moveTo(10, 16);
            ctx.quadraticCurveTo(16, 22, 22, 17);
            ctx.stroke();

            // Sparkling resin trichome crystals
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(15, 11, 2, 2);
            ctx.fillRect(21, 14, 2, 2);
            ctx.fillRect(17, 18, 1.5, 1.5);
          }
        } else if (en.type === 'rosin-jar') {
          // 🍯 COLD CURE LIVE ROSIN CONCENTRATE GLASS JAR
          ctx.fillStyle = isFlashing ? '#ffffff' : 'rgba(255, 255, 255, 0.16)';
          ctx.strokeStyle = isFlashing ? '#ffffff' : '#ecc94b';
          ctx.lineWidth = 1.6;
          ctx.shadowColor = '#ecc94b';
          ctx.shadowBlur = 11;

          ctx.beginPath();
          ctx.roundRect(4, 8, 30, 22, 5);
          ctx.fill();
          ctx.stroke();

          if (!isFlashing) {
            // Golden Cold-Cure Rosin Badder pool
            ctx.fillStyle = '#d69e2e';
            ctx.beginPath();
            ctx.roundRect(7, 15, 24, 12, 3);
            ctx.fill();

            // Wet terpene puddle sheen
            ctx.fillStyle = '#fefcbf';
            ctx.beginPath();
            ctx.ellipse(15, 19, 5, 2.2, -0.2, 0, Math.PI * 2);
            ctx.fill();

            // Ribbed Child-Resistant Black Cap
            ctx.fillStyle = '#1a202c';
            ctx.strokeStyle = '#718096';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(2, 2, 34, 6.5, 2);
            ctx.fill();
            ctx.stroke();
          }
        } else if (en.type === 'vape-cart') {
          // 💨 510 THREAD LIVE RESIN CARTRIDGE
          // Ceramic Duckbill Mouthpiece
          ctx.fillStyle = isFlashing ? '#ffffff' : '#f7fafc';
          ctx.beginPath();
          ctx.roundRect(11, 1, 10, 8, 3);
          ctx.fill();

          // Borosilicate Tank Housing
          ctx.fillStyle = isFlashing ? '#ffffff' : 'rgba(255, 255, 255, 0.22)';
          ctx.strokeStyle = '#cbd5e0';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.rect(9, 9, 14, 17);
          ctx.fill();
          ctx.stroke();

          if (!isFlashing) {
            // Golden Amber Live Resin Oil
            ctx.fillStyle = '#dd6b20';
            ctx.fillRect(10, 12, 12, 13);

            // Air bubble inside oil tank
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.beginPath();
            ctx.arc(13, 14, 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Center Vapor Chimney & Wicking Holes
            ctx.fillStyle = '#a0aec0';
            ctx.fillRect(14.5, 9, 3, 17);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(16, 23, 1.2, 0, Math.PI * 2);
            ctx.fill();

            // 510 Gold Thread Connector
            ctx.fillStyle = '#ecc94b';
            ctx.fillRect(11, 26, 10, 5);
          }
        } else if (en.type === 'raw-cone') {
          // 📜 KING-SIZE RAW PRE-ROLL CONE
          ctx.fillStyle = isFlashing ? '#ffffff' : '#c89d54';
          ctx.shadowColor = '#d69e2e';
          ctx.shadowBlur = 7;
          ctx.beginPath();
          ctx.moveTo(6, 4);
          ctx.lineTo(28, 4);
          ctx.lineTo(20, 23);
          ctx.lineTo(14, 23);
          ctx.closePath();
          ctx.fill();

          if (!isFlashing) {
            // Unbleached W-Filter Tip Crutch
            ctx.fillStyle = '#e2d5b5';
            ctx.fillRect(14, 23, 6, 5);

            // Glowing Red-Orange Cherry Ember Tip
            ctx.fillStyle = '#ef4444';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.ellipse(17, 4, 11, 3.2, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fbd38d';
            ctx.beginPath();
            ctx.arc(17, 4, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (en.type === 'grinder-boss') {
          // ⚙️ 4-PIECE HEAVY CNC ALUMINUM GRINDER BOSS
          ctx.fillStyle = isFlashing ? '#ffffff' : '#1e293b';
          ctx.strokeStyle = '#f6ad55';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#f6ad55';
          ctx.shadowBlur = 16;

          ctx.beginPath();
          ctx.arc(27, 21, 21, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (!isFlashing) {
            // Inner CNC chamber ring
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(27, 21, 15, 0, Math.PI * 2);
            ctx.stroke();

            // Rotating Diamond Cutting Teeth
            const angle = time * 0.004;
            ctx.fillStyle = '#e2e8f0';
            for (let t = 0; t < 8; t++) {
              const ta = angle + (t * Math.PI) / 4;
              const tx = 27 + Math.cos(ta) * 11;
              const ty = 21 + Math.sin(ta) * 11;
              ctx.beginPath();
              ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }

            // Center Neodymium Lid Magnet
            ctx.fillStyle = '#f6ad55';
            ctx.beginPath();
            ctx.arc(27, 21, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Boss HP Bar
          const hpPct = Math.max(0, en.hp / en.maxHp);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(5, -8, 44, 5);
          ctx.fillStyle = hpPct > 0.4 ? '#f6ad55' : '#ef4444';
          ctx.fillRect(5, -8, 44 * hpPct, 5);
        }

        ctx.restore();
      }

      // 6. Bullets (Concentrate Terp Beams & Enemy Embers)
      for (const b of st.bullets) {
        ctx.save();
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        if (b.isEnemy) {
          ctx.arc(b.x, b.y, b.size || 3.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Glowing terpene plasma bolt with bright core
          ctx.roundRect(b.x - 2.5, b.y - 10, b.size || 4.5, 18, 2.5);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(b.x - 1, b.y - 7, 2, 10);
        }
        ctx.restore();
      }

      // 7. Collectible THC Power-Ups (Rare, High-Value Drops)
      for (const pw of st.powerUps) {
        ctx.save();
        ctx.fillStyle = 'rgba(21, 19, 27, 0.92)';
        ctx.strokeStyle = pw.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = pw.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.roundRect(pw.x - 15, pw.y - 15, 30, 30, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pw.icon, pw.x, pw.y + 6);
        ctx.restore();
      }

      // 8. Particles
      for (const pt of st.particles) {
        const alpha = 1 - pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // 9. Floating Score Popups
      for (const fs of st.floatingScores) {
        const alpha = 1 - fs.life / fs.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = fs.color;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(fs.text, fs.x, fs.y);
        ctx.restore();
      }

      // 10. DRAW PLAYER: HEADY SCIENTIFIC RECYCLER DAB RIG CRUISER
      const p = st.player;
      const isInvuln = Date.now() < p.invulnerableUntil;
      if (!isInvuln || Math.floor(time / 90) % 2 === 0) {
        ctx.save();
        ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
        ctx.rotate(p.bankAngle);

        const isTorch = Date.now() < p.torchBoostUntil;

        // Dual Underneath Butane Thruster Flames
        const flameFlicker = Math.sin(time * 0.04) * 3;
        ctx.fillStyle = isTorch ? '#f6ad55' : '#b8f875';
        ctx.shadowColor = isTorch ? '#f6ad55' : '#b8f875';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-12, 18);
        ctx.lineTo(-8, 26 + flameFlicker);
        ctx.lineTo(-4, 18);
        ctx.moveTo(4, 18);
        ctx.lineTo(8, 26 - flameFlicker);
        ctx.lineTo(12, 18);
        ctx.fill();

        // Borosilicate Glass Beaker Body
        ctx.fillStyle = 'rgba(187, 255, 100, 0.22)';
        ctx.strokeStyle = '#b8f875';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = '#b8f875';
        ctx.shadowBlur = 15;

        ctx.beginPath();
        ctx.moveTo(-5, -23); // Mouthpiece rim
        ctx.lineTo(5, -23);
        ctx.lineTo(7, -8);
        ctx.lineTo(21, 18); // Wide beaker base
        ctx.lineTo(-21, 18);
        ctx.lineTo(-7, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Recycler Side Uptake Loop
        ctx.strokeStyle = '#87dcca';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, 8);
        ctx.quadraticCurveTo(-22, -2, -6, -12);
        ctx.stroke();

        // Green Percolator Water Chamber
        ctx.fillStyle = '#38a169';
        ctx.beginPath();
        ctx.moveTo(-15, 7);
        ctx.lineTo(15, 7);
        ctx.lineTo(19, 16);
        ctx.lineTo(-19, 16);
        ctx.closePath();
        ctx.fill();

        // Animated Percolator Bubbles
        const bub1 = Math.sin(time * 0.012) * 3;
        const bub2 = Math.cos(time * 0.015) * 3;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-4 + bub1, 11, 2.2, 0, Math.PI * 2);
        ctx.arc(5 + bub2, 13, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 14mm Quartz Banger Joint & Bucket
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(6, 2);
        ctx.lineTo(17, -4);
        ctx.stroke();

        // Glowing Heated Quartz Banger Cup
        ctx.fillStyle = '#ff7b54';
        ctx.shadowColor = '#ff7b54';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(15, -12, 9, 11, 2);
        ctx.fill();

        // Spinning Directional Bubble Carb Cap on Banger
        ctx.fillStyle = '#87dcca';
        ctx.beginPath();
        ctx.arc(19.5, -13, 4, 0, Math.PI * 2);
        ctx.fill();

        // Ruby Terp Pearls Orbiting Shield
        if (p.hasShield) {
          ctx.strokeStyle = '#87dcca';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#87dcca';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, 31, 0, Math.PI * 2);
          ctx.stroke();

          const pearlAngle = time * 0.007;
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(Math.cos(pearlAngle) * 31, Math.sin(pearlAngle) * 31, 4.2, 0, Math.PI * 2);
          ctx.arc(Math.cos(pearlAngle + Math.PI) * 31, Math.sin(pearlAngle + Math.PI) * 31, 4.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, highScore, onGameOver, shoot, spawnWave, difficulty]);

  const handlePointerMove = (clientX: number) => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchX = ((clientX - rect.left) / rect.width) * canvas.width;
    stateRef.current.player.x = Math.max(
      12,
      Math.min(canvas.width - stateRef.current.player.width - 12, touchX - 24)
    );
  };

  return (
    <div className="relative w-full max-w-[540px] mx-auto bg-[#10211b] border border-[#294637] rounded-xl overflow-hidden shadow-2xl">
      {/* Top HUD */}
      <div className="bg-[#080f0e] border-b border-[#294637] px-4 py-2.5 flex items-center justify-between text-xs font-heading tracking-wider">
        <div className="flex items-center space-x-4">
          <div>
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Score ({diffConfig.scoreMultiplier}x)</span>
            <span className="text-[#b8f875] font-arcade text-base tabular-nums">
              {score.toString().padStart(5, '0')}
            </span>
          </div>
          <div>
            <span className="text-[#b7c5b5] uppercase block text-[9px]">High</span>
            <span className="text-[#eaf0dd] font-arcade text-xs tabular-nums">
              {highScore.toString().padStart(5, '0')}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-center">
            <span className="text-[#b7c5b5] uppercase block text-[9px]">Wave</span>
            <span className="text-[#87dcca] font-bold text-sm tabular-nums">WAVE {wave}</span>
          </div>

          <div className="flex items-center space-x-1 pl-1" title={`${lives} Rig Lives Remaining`}>
            {[...Array(4)].map((_, i) => (
              <span
                key={i}
                className={`inline-block w-2.5 h-3.5 rounded-sm transition-all ${
                  i < lives ? 'bg-[#b8f875] shadow-[0_0_8px_#b8f875]' : 'bg-[#10211b] border border-[#294637]'
                }`}
              />
            ))}
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

      {/* Status Strip */}
      <div className="bg-[#121813] border-b border-[#233527] px-3 py-1 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-1.5 text-[#b8f875]">
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span className="font-bold">ZERO-TAP AUTO-BLASTER</span>
          <span className="text-[#b7c5b5] hidden sm:inline">· Just steer to clear waves</span>
        </div>
        <span className="text-[10px] text-[#87dcca] font-semibold">
          {difficulty.toUpperCase()} ({diffConfig.scoreMultiplier}x)
        </span>
      </div>

      {/* Canvas Viewport */}
      <div className="relative aspect-[500/520] w-full bg-[#080f0e] touch-none">
        <canvas
          ref={canvasRef}
          width={500}
          height={520}
          onTouchMove={e => {
            e.preventDefault();
            handlePointerMove(e.touches[0].clientX);
          }}
          onTouchStart={e => {
            handlePointerMove(e.touches[0].clientX);
          }}
          onMouseMove={e => handlePointerMove(e.clientX)}
          className="w-full h-full block cursor-ew-resize select-none"
        />

        {/* Active THC Power-Up Banner */}
        {activePowerUp && gameState === 'playing' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#10211b]/95 border border-[#b8f875]/70 px-3.5 py-1 rounded-lg text-xs text-[#b8f875] flex items-center space-x-2 pointer-events-none shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-[#b8f875]" />
            <span className="font-bold">{activePowerUp}</span>
            {powerUpTimeLeft > 0 && (
              <span className="text-[11px] text-[#eaf0dd] tabular-nums">({powerUpTimeLeft}s)</span>
            )}
          </div>
        )}

        {/* Start / Title Overlay */}
        {gameState === 'title' && (
          <div className="absolute inset-0 bg-[#080f0e]/92 flex flex-col items-center justify-center p-6 text-center z-30">
            <span className="text-[#87dcca] text-xs font-mono uppercase tracking-widest mb-1">
              HEAVY GLASS RECYCLER BLASTER
            </span>
            <h2 className="text-4xl sm:text-5xl font-heading text-white tracking-tight mb-2">
              NEON SESH INVADERS<span className="text-[#b8f875]">.</span>
            </h2>
            <p className="text-[#b7c5b5] text-xs max-w-sm mb-4 font-sans leading-relaxed">
              Glide the Borosilicate Dab Rig Cruiser across the dispensary floor. Continuous auto-blaster vaporizes Frosty Kush Nugs, 90u Live Rosin Jars, 510 Carts, RAW Cones, and CNC Grinder Bosses.
            </p>

            {/* In-Title Difficulty Selector */}
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
              <span>INSERT COIN & PLAY</span>
            </button>

            <div className="mt-4 text-[#b7c5b5] text-[11px] font-mono">
              Touch Drag · Mouse Hover · A/D or Arrow Keys · P to Pause
            </div>
          </div>
        )}

        {/* Paused Overlay */}
        {gameState === 'paused' && (
          <div className="absolute inset-0 bg-[#080f0e]/90 flex flex-col items-center justify-center p-6 text-center z-30">
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
          <div className="absolute inset-0 bg-[#080f0e]/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <span className="text-[#87dcca] text-xs font-mono tracking-widest uppercase mb-1">
              CHAMBER EMPTIED · {difficulty.toUpperCase()} MODE
            </span>
            <h3 className="text-4xl font-heading text-white mb-4">
              SESH OVER<span className="text-[#b8f875]">.</span>
            </h3>

            <div className="bg-[#10211b] border border-[#294637] rounded-lg p-4 w-full max-w-xs mb-5 tabular-nums">
              <div className="flex justify-between py-1.5 text-xs border-b border-[#294637]">
                <span className="text-[#b7c5b5]">Final Score ({diffConfig.scoreMultiplier}x):</span>
                <span className="font-arcade text-base text-[#b8f875]">{score}</span>
              </div>
              <div className="flex justify-between py-1.5 text-xs border-b border-[#294637]">
                <span className="text-[#b7c5b5]">Waves Reached:</span>
                <span className="text-[#87dcca] font-bold font-mono">Wave {wave}</span>
              </div>
              <div className="flex justify-between py-1.5 text-xs">
                <span className="text-[#b7c5b5]">THC Targets Cleared:</span>
                <span className="text-white font-bold font-mono">{stateRef.current.cleanKills}</span>
              </div>
            </div>

            <button
              onClick={triggerStart}
              data-start="true"
              className="px-8 py-3 bg-[#b8f875] hover:bg-[#a0e465] text-[#080f0e] font-heading text-base font-bold rounded transition transform hover:scale-105 flex items-center space-x-2 shadow-[0_0_15px_rgba(184,248,117,0.3)]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>PLAY AGAIN</span>
            </button>
          </div>
        )}
      </div>

      {/* DEDICATED STEERING CONTROLS */}
      <div className="bg-[#080f0e] border-t border-[#294637] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <button
            onPointerDown={() => {
              stateRef.current.touchButtons.left = true;
              setHoldingLeft(true);
            }}
            onPointerUp={() => {
              stateRef.current.touchButtons.left = false;
              setHoldingLeft(false);
            }}
            onPointerLeave={() => {
              stateRef.current.touchButtons.left = false;
              setHoldingLeft(false);
            }}
            className={`flex-1 py-3 px-4 rounded-lg font-heading font-bold text-sm flex items-center justify-center gap-2 select-none touch-none border transition active:scale-95 ${
              holdingLeft
                ? 'bg-[#b8f875] text-[#080f0e] border-[#b8f875] shadow-[0_0_12px_#b8f875]'
                : 'bg-[#10211b] text-white border-[#294637] hover:border-[#b8f875]/50'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>SLIDE LEFT</span>
          </button>

          <button
            onPointerDown={() => {
              stateRef.current.touchButtons.right = true;
              setHoldingRight(true);
            }}
            onPointerUp={() => {
              stateRef.current.touchButtons.right = false;
              setHoldingRight(false);
            }}
            onPointerLeave={() => {
              stateRef.current.touchButtons.right = false;
              setHoldingRight(false);
            }}
            className={`flex-1 py-3 px-4 rounded-lg font-heading font-bold text-sm flex items-center justify-center gap-2 select-none touch-none border transition active:scale-95 ${
              holdingRight
                ? 'bg-[#b8f875] text-[#080f0e] border-[#b8f875] shadow-[0_0_12px_#b8f875]'
                : 'bg-[#10211b] text-white border-[#294637] hover:border-[#b8f875]/50'
            }`}
          >
            <span>SLIDE RIGHT</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#b7c5b5] px-1">
          <span className="flex items-center gap-1 text-[#b8f875] whitespace-nowrap">
            <Zap className="w-3 h-3 fill-current shrink-0" />
            <span>Auto-Blaster Active</span>
          </span>
          <span className="whitespace-nowrap">Drag or hold buttons</span>
        </div>
      </div>
    </div>
  );
}
