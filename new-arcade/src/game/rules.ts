import type { GameId, GameDifficulty, DifficultyConfig, ScoreRecord, Achievement } from './types.ts';

export const DIFFICULTY_CONFIGS: Record<GameDifficulty, DifficultyConfig> = {
  Chill: {
    id: 'Chill',
    label: 'Chill Sesh (0.75x Score)',
    shortLabel: 'Chill · 0.75x',
    scoreMultiplier: 0.75,
    spawnRateMultiplier: 0.75,
    enemySpeedMultiplier: 0.8,
    accentColor: '#48bb78',
    description: 'Relaxed enemy spawns, slower pace, 0.75x score multiplier.'
  },
  Normal: {
    id: 'Normal',
    label: 'Standard Sesh (1.0x Score)',
    shortLabel: 'Normal · 1.0x',
    scoreMultiplier: 1.0,
    spawnRateMultiplier: 1.0,
    enemySpeedMultiplier: 1.0,
    accentColor: '#b8f875',
    description: 'Balanced arcade challenge and standard 1.0x score multiplier.'
  },
  Fever: {
    id: 'Fever',
    label: '420 Fever (1.5x Score)',
    shortLabel: 'Fever · 1.5x',
    scoreMultiplier: 1.5,
    spawnRateMultiplier: 1.35,
    enemySpeedMultiplier: 1.25,
    accentColor: '#87dcca',
    description: 'High-intensity spawns, faster hazards, and 1.5x score multiplier!'
  }
};

export function getDifficultyConfig(difficulty: GameDifficulty = 'Normal'): DifficultyConfig {
  return DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS.Normal;
}

/**
 * Pure helper to determine whether an eliminated invader should drop a power-up.
 * Prevents power-up flooding by enforcing active cap, per-wave limit, cooldown, and low probability.
 */
export function shouldSpawnPowerUp(params: {
  activePowerUpsOnScreen: number;
  powerUpsSpawnedThisWave: number;
  maxPerWave?: number;
  msSinceLastSpawn: number;
  minCooldownMs?: number;
  isBoss: boolean;
  randomRoll: number;
}): boolean {
  const {
    activePowerUpsOnScreen,
    powerUpsSpawnedThisWave,
    maxPerWave = 2,
    msSinceLastSpawn,
    minCooldownMs = 9000,
    isBoss,
    randomRoll
  } = params;

  if (activePowerUpsOnScreen >= 1) return false;
  if (powerUpsSpawnedThisWave >= maxPerWave) return false;
  if (msSinceLastSpawn < minCooldownMs) return false;

  const threshold = isBoss ? 0.35 : 0.055;
  return randomRoll < threshold;
}

export const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-spark',
    title: 'First Spark',
    description: 'Complete your very first game round in The 420 Lobby Arcade.',
    icon: '✨',
    unlocked: false,
    points: 50,
    gameId: 'all'
  },
  {
    id: 'sesh-master',
    title: 'Sesh Master',
    description: 'Score over 1,500 points in Neon Sesh Invaders.',
    icon: '🚀',
    unlocked: false,
    points: 150,
    gameId: 'sesh-invaders'
  },
  {
    id: 'clean-blaster',
    title: 'Clean Blaster',
    description: 'Eliminate 25 enemies in Sesh Invaders without taking shield damage.',
    icon: '🛡️',
    unlocked: false,
    points: 200,
    gameId: 'sesh-invaders'
  },
  {
    id: 'rhythm-perfectionist',
    title: 'Sweet Spot God',
    description: 'Achieve 10 PERFECT timing hits in Bong Blitz: Rhythm Rush.',
    icon: '🎯',
    unlocked: false,
    points: 200,
    gameId: 'bong-blitz'
  },
  {
    id: 'fever-pitch',
    title: 'Fever Mode Activated',
    description: 'Reach an 8x combo streak in Bong Blitz.',
    icon: '🔥',
    unlocked: false,
    points: 250,
    gameId: 'bong-blitz'
  },
  {
    id: 'high-roller',
    title: 'High Roller',
    description: 'Reach 2,500 points in any single arcade game.',
    icon: '👑',
    unlocked: false,
    points: 300,
    gameId: 'all'
  },
  {
    id: 'green-voyager',
    title: 'Green Room Voyager',
    description: 'Survive for 45 seconds in Canna-Runner.',
    icon: '🌿',
    unlocked: false,
    points: 150,
    gameId: 'canna-runner'
  },
  {
    id: 'trichome-hoarder',
    title: 'Trichome Hunter',
    description: 'Collect 30 golden trichomes in a single run.',
    icon: '💎',
    unlocked: false,
    points: 175,
    gameId: 'canna-runner'
  },
  {
    id: 'discord-certified',
    title: 'Lobby Verified',
    description: 'Link your Discord profile to sync high scores with the server.',
    icon: '💬',
    unlocked: false,
    points: 100,
    gameId: 'all'
  },
  {
    id: 'lobby-legend',
    title: 'Lobby Legend',
    description: 'Place in the Top 3 on any global leaderboard.',
    icon: '🏆',
    unlocked: false,
    points: 500,
    gameId: 'all'
  }
];

/**
 * Calculates score for a target hit based on timing offset in milliseconds.
 * Offset is the absolute difference between player action time and perfect target time.
 */
export function calculateTimingScore(
  offsetMs: number,
  comboStreak: number,
  difficulty: GameDifficulty = 'Normal'
): {
  rating: 'PERFECT' | 'NICE' | 'EARLY' | 'LATE' | 'MISS';
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  newCombo: number;
} {
  const absOffset = Math.abs(offsetMs);
  const mult = getDifficultyConfig(difficulty).scoreMultiplier;
  
  if (absOffset <= 50) {
    const base = 120;
    const bonus = Math.min(comboStreak * 15, 150);
    const total = Math.round((base + bonus) * mult);
    return {
      rating: 'PERFECT',
      basePoints: base,
      bonusPoints: bonus,
      totalPoints: total,
      newCombo: comboStreak + 1
    };
  } else if (absOffset <= 120) {
    const base = 75;
    const bonus = Math.min(comboStreak * 10, 100);
    const total = Math.round((base + bonus) * mult);
    return {
      rating: 'NICE',
      basePoints: base,
      bonusPoints: bonus,
      totalPoints: total,
      newCombo: comboStreak + 1
    };
  } else if (absOffset <= 240) {
    const base = 35;
    const total = Math.round(base * mult);
    return {
      rating: offsetMs < 0 ? 'EARLY' : 'LATE',
      basePoints: base,
      bonusPoints: 0,
      totalPoints: total,
      newCombo: Math.max(1, Math.floor(comboStreak / 2))
    };
  } else {
    return {
      rating: 'MISS',
      basePoints: 0,
      bonusPoints: 0,
      totalPoints: 0,
      newCombo: 0
    };
  }
}

/**
 * Calculates enemy elimination points in Sesh Invaders
 */
export function calculateInvaderScore(
  enemyType: 'drifter' | 'buzzkill' | 'mothership',
  wave: number,
  isPoweredUp: boolean,
  difficulty: GameDifficulty = 'Normal'
): number {
  let base = 50;
  if (enemyType === 'drifter') base = 50;
  if (enemyType === 'buzzkill') base = 120;
  if (enemyType === 'mothership') base = 400;

  const waveMultiplier = 1 + (wave - 1) * 0.2;
  const powerMultiplier = isPoweredUp ? 1.5 : 1.0;
  const diffMultiplier = getDifficultyConfig(difficulty).scoreMultiplier;

  return Math.round(base * waveMultiplier * powerMultiplier * diffMultiplier);
}

/**
 * Evaluates which achievements a run unlocks given run stats and current unlocked set.
 */
export function evaluateRunAchievements(
  gameId: GameId,
  score: number,
  stats: Record<string, number>,
  currentlyUnlocked: string[]
): string[] {
  const newlyUnlocked: string[] = [];
  const has = (id: string) => currentlyUnlocked.includes(id) || newlyUnlocked.includes(id);

  if (!has('first-spark')) {
    newlyUnlocked.push('first-spark');
  }

  if (score >= 2500 && !has('high-roller')) {
    newlyUnlocked.push('high-roller');
  }

  if (gameId === 'sesh-invaders') {
    if (score >= 1500 && !has('sesh-master')) {
      newlyUnlocked.push('sesh-master');
    }
    if ((stats.cleanKills || 0) >= 25 && !has('clean-blaster')) {
      newlyUnlocked.push('clean-blaster');
    }
  }

  if (gameId === 'bong-blitz') {
    if ((stats.perfectHits || 0) >= 10 && !has('rhythm-perfectionist')) {
      newlyUnlocked.push('rhythm-perfectionist');
    }
    if ((stats.maxCombo || 0) >= 8 && !has('fever-pitch')) {
      newlyUnlocked.push('fever-pitch');
    }
  }

  if (gameId === 'canna-runner') {
    if ((stats.durationSeconds || 0) >= 45 && !has('green-voyager')) {
      newlyUnlocked.push('green-voyager');
    }
    if ((stats.trichomes || 0) >= 30 && !has('trichome-hoarder')) {
      newlyUnlocked.push('trichome-hoarder');
    }
  }

  return newlyUnlocked;
}

/**
 * Sorts and filters leaderboard scores.
 */
export function filterLeaderboard(
  scores: ScoreRecord[],
  gameId: GameId | 'all',
  period: 'today' | 'week' | 'all'
): ScoreRecord[] {
  let filtered = [...scores];
  if (gameId !== 'all') {
    filtered = filtered.filter(s => s.gameId === gameId);
  }
  if (period !== 'all') {
    filtered = filtered.filter(s => s.period === period || s.period === 'today');
  }
  return filtered.sort((a, b) => b.score - a.score);
}

