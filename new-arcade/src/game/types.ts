export type GameId = 'sesh-invaders' | 'bong-blitz' | 'canna-runner';

export type GameDifficulty = 'Chill' | 'Normal' | 'Fever';

export interface DifficultyConfig {
  id: GameDifficulty;
  label: string;
  shortLabel: string;
  scoreMultiplier: number;
  spawnRateMultiplier: number;
  enemySpeedMultiplier: number;
  accentColor: string;
  description: string;
}

export interface GameMetadata {
  id: GameId;
  title: string;
  tagline: string;
  genre: string;
  category: 'shooter' | 'rhythm' | 'runner';
  cabinetColor: string;
  accentColor: string;
  difficulty: 'Chill' | 'Medium' | 'Fever';
  controls: string[];
  description: string;
  highScore: number;
}

export interface ScoreRecord {
  id: string;
  gameId: GameId;
  playerName: string;
  playerTag: string;
  avatarUrl: string;
  isDiscordVerified: boolean;
  score: number;
  maxCombo: number;
  accuracy?: number; // percentage
  durationSeconds: number;
  timestamp: string; // ISO string
  period: 'today' | 'week' | 'all';
  discordRole?: string;
  difficulty?: GameDifficulty;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  points: number;
  gameId?: GameId | 'all';
}

export interface UserProfile {
  id: string;
  username: string;
  tag: string;
  avatarUrl: string;
  isDiscordConnected: boolean;
  discordId?: string;
  roles: string[];
  totalGamesPlayed: number;
  totalScore: number;
  achievementsUnlocked: string[];
  favoriteGame: GameId;
}

export interface RunResult {
  gameId: GameId;
  score: number;
  maxCombo: number;
  durationMs: number;
  stats: Record<string, number>;
  newAchievements: string[];
  rank?: number;
  difficulty?: GameDifficulty;
}
