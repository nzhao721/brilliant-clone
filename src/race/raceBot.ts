// Local, fully deterministic bot for the offline "play a bot" mode. A bot is a
// metronome of simulated answers feeding the SHARED physics: every
// `answerIntervalSeconds` it "answers", correct with probability `accuracy` (which
// refuels the car); between answers stepCar advances it under the same
// fuel/friction/hill rules as the player. The PRNG state is threaded through
// BotState as a plain number so stepBot is pure — the same (difficulty, seed)
// always yields the identical trajectory.

import { addFuel, type CarState, FUEL_PER_CORRECT, stepCar } from './racePhysics';

export type BotDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'master';

/** Difficulties ordered easiest -> hardest (also the order shown in any picker). */
export const BOT_DIFFICULTIES: BotDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
  'master',
];

/** Human-readable labels for the difficulty picker. */
export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
  master: 'Master',
};

/** How a difficulty "answers": seconds between answers and chance each is right. */
export type BotConfig = {
  /** Seconds between the bot's answers (smaller = answers more often). */
  answerIntervalSeconds: number;
  /** Probability in [0, 1] that a given answer is correct (and earns fuel). */
  accuracy: number;
};

// Faster cadence + higher accuracy = more fuel income = higher sustained speed,
// so this table is monotonic in pace from beginner to master. A bot's pace is set
// almost entirely by how often it refuels (each correct answer buys 2.5s of
// thrust); the long intervals make the car coast/stall between answers, keeping
// the whole field comfortably beatable. Seed-averaged finishes over RACE_DISTANCE
// (2500 m) land ~beginner 496s, intermediate 393s, advanced 259s, expert 214s,
// master 167s — vs ~43s for a strong human cruise. The "difficulty finish times"
// tests lock in these bands and the beginner-slowest -> master-fastest ordering.
export const BOT_DIFFICULTY_CONFIG: Record<BotDifficulty, BotConfig> = {
  beginner: { answerIntervalSeconds: 18.0, accuracy: 0.45 },
  intermediate: { answerIntervalSeconds: 16.5, accuracy: 0.51 },
  advanced: { answerIntervalSeconds: 13.6, accuracy: 0.62 },
  expert: { answerIntervalSeconds: 12.8, accuracy: 0.7 },
  master: { answerIntervalSeconds: 11.5, accuracy: 0.78 },
};

// Bots start with a dry tank (like the player) so they must earn their first fuel.
const BOT_STARTING_FUEL = 0;

export type BotState = {
  /** The bot's car, advanced by the shared physics. */
  car: CarState;
  /** Which difficulty this bot is playing at. */
  difficulty: BotDifficulty;
  /** Countdown (seconds) until the bot answers its next question. */
  secondsUntilNextAnswer: number;
  /** Threaded mulberry32 state, kept in the struct so stepBot stays pure. */
  rngState: number;
};

// FNV-1a string hash -> unsigned 32-bit (same helper used across the app).
function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// One pure mulberry32 step: returns the next float in [0, 1) AND the advanced
// state, so the generator can live inside BotState instead of a closure.
function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/**
 * Builds a bot's initial state: a car at rest with an empty tank, the answer timer
 * set to the difficulty's interval, and the PRNG seeded from `seed` mixed with the
 * difficulty (so two bots of different levels don't share an answer stream).
 */
export function createBot(difficulty: BotDifficulty, seed: number): BotState {
  const config = BOT_DIFFICULTY_CONFIG[difficulty];
  return {
    car: { position: 0, velocity: 0, fuel: BOT_STARTING_FUEL },
    difficulty,
    secondsUntilNextAnswer: config.answerIntervalSeconds,
    rngState: hashString(`race-bot:${difficulty}:${seed}`),
  };
}

/**
 * Advances a bot by `dtSeconds`, returning a NEW state (never mutates input):
 *   1. Count the answer timer down; each elapse "answers" (draw PRNG, refuel when
 *      value < accuracy) and rolls the timer forward by one interval (carrying the
 *      remainder so cadence doesn't drift).
 *   2. Advance the car with the shared stepCar (identical rules to the player).
 * `seed` is the track seed for stepCar's hill profile, separate from the answer RNG.
 */
export function stepBot(bot: BotState, dtSeconds: number, seed: number): BotState {
  const config = BOT_DIFFICULTY_CONFIG[bot.difficulty];
  let car = bot.car;
  let secondsUntilNextAnswer = bot.secondsUntilNextAnswer - dtSeconds;
  let rngState = bot.rngState;

  while (secondsUntilNextAnswer <= 0) {
    const draw = nextRandom(rngState);
    rngState = draw.state;
    if (draw.value < config.accuracy) {
      car = addFuel(car, FUEL_PER_CORRECT);
    }
    secondsUntilNextAnswer += config.answerIntervalSeconds;
  }

  car = stepCar(car, dtSeconds, seed);

  return {
    car,
    difficulty: bot.difficulty,
    secondsUntilNextAnswer,
    rngState,
  };
}
