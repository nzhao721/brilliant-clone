// Local, fully deterministic bot for "Slipstream" (the offline "play a bot"
// mode). A bot is just a metronome of simulated answers feeding the SHARED
// physics: every `answerIntervalSeconds` it "answers" a question, and with
// probability `accuracy` that answer is correct and refuels the car. Between
// answers its car is advanced by racePhysics.stepCar, so the bot obeys the exact
// same fuel/friction/hill rules as the human player — only its answer cadence
// and accuracy (set by difficulty) decide how fast it goes.
//
// Determinism: the PRNG state is threaded through BotState as a plain number, so
// stepBot is pure (no closures, no Math.random). The same (difficulty, seed)
// therefore always produces the identical trajectory, which keeps the bot
// testable and reproducible.

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
// so this table is monotonic in pace from beginner to master.
//
// Tuning note: the whole ladder was deliberately shifted MUCH slower (much worse,
// easier-to-beat bots). The hardest bot (master) is now anchored to roughly the
// OLD beginner pace, and every easier level steps down from there, so the field is
// far behind the player. The physics are unchanged (the low-friction MOMENTUM-fix
// model: DRAG_COEFF 0.04, flat-ground terminal velocity ~112 m/s, a coasting car
// glides ~80s before stopping, over RACE_DISTANCE = 2500 m with a STRONG gravity
// term GRAVITY = 37.5). A bot's pace is set almost entirely by how often it refuels:
// each correct answer buys 2.5s of thrust, and with the much longer intervals the
// car now coasts (and often fully stalls) between answers, which is what makes the
// retuned field so slow. The primary lever was lengthening answerIntervalSeconds
// substantially (accuracy was also lowered a little); effective time-between-correct
// (interval / accuracy) now ranges ~14.7s for master up to ~40s for beginner.
// The TWO EASIEST levels (beginner, intermediate) were then slowed even further so a
// low-difficulty win is extra comfortable; the upper three are left unchanged, so the
// curve still runs from very-easy to hard. Seed-averaged finish times (over
// RACE_DISTANCE = 2500 m) land at roughly beginner ~496s, intermediate ~393s,
// advanced ~259s, expert ~214s, master ~167s. A strong human cruising near the
// terminal velocity finishes the same track in ~43s, so the new Master (~167s, ~4x a
// strong human) is comfortably beatable and the easier levels are trivially so. See the "difficulty finish times" tests, which simulate
// these deterministically and lock in the (much slower) bands, the beginner-slowest
// -> master-fastest ordering, and floors far slower than a human cruise.
export const BOT_DIFFICULTY_CONFIG: Record<BotDifficulty, BotConfig> = {
  beginner: { answerIntervalSeconds: 18.0, accuracy: 0.45 },
  intermediate: { answerIntervalSeconds: 16.5, accuracy: 0.51 },
  advanced: { answerIntervalSeconds: 13.6, accuracy: 0.62 },
  expert: { answerIntervalSeconds: 12.8, accuracy: 0.7 },
  master: { answerIntervalSeconds: 11.5, accuracy: 0.78 },
};

// Bots start with a dry tank so they don't launch off the line — they must earn
// their first fuel by answering, just like the player. (Previously they began
// with one correct answer's worth of fuel, a free head start.)
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

// FNV-1a string hash -> unsigned 32-bit (same helper used elsewhere in the app)
// so a bot's RNG seed is a stable function of its difficulty + the race seed.
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
 * Builds a bot's initial state: a car at rest with an empty tank (it must earn
 * its first fuel by answering), the answer timer set to the difficulty's
 * interval, and the PRNG seeded from `seed` (mixed with the difficulty so two
 * bots of different levels in the same race don't share an identical
 * answer-correctness stream).
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
 *   1. Count the answer timer down; each time it elapses, "answer" a question —
 *      draw the next PRNG value, refuel on a correct answer (value < accuracy),
 *      and roll the timer forward by one interval (carrying any remainder so the
 *      cadence doesn't drift). A while-loop covers the (unused in practice) case
 *      of a dt larger than a whole interval.
 *   2. Advance the car with the shared stepCar, so the bot obeys identical
 *      fuel/friction/hill rules to the player.
 * `seed` is the track seed handed to stepCar (the hill profile), separate from
 * the bot's own answer RNG.
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
