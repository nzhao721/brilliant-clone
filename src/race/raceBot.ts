/*
 * Local, deterministic bot for offline mode: a metronome of simulated answers feeding
 * the SHARED physics — every `answerIntervalSeconds` it answers (correct w.p. `accuracy`,
 * which refuels) and stepCar advances it under the player's rules between answers. PRNG
 * state lives in BotState so stepBot is pure: (difficulty, seed) -> identical trajectory.
 */

import { addFuel, type CarState, FUEL_PER_CORRECT, stepCar } from './racePhysics';
import { hashString } from './raceRandom';

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

/*
 * Monotonic in pace beginner->master (faster cadence + higher accuracy = more fuel =
 * faster); long intervals keep the whole field beatable. The "difficulty finish times"
 * tests lock in the seed-averaged bands and ordering.
 */
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

/* One pure mulberry32 step: next float + advanced state, so the generator can live in BotState, not a closure. */
function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Initial bot state: car at rest, empty tank, timer at the difficulty's interval, PRNG seeded from `seed`+difficulty (so levels don't share an answer stream). */
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
 * Advances a bot by `dtSeconds`, returning a NEW state. Each elapsed answer interval
 * draws the PRNG (refuel when value < accuracy) and carries the remainder so cadence
 * doesn't drift; then stepCar advances the car. `seed` is the track seed (stepCar's
 * hills), separate from the answer RNG.
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
