import { describe, expect, it } from 'vitest';
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_CONFIG,
  BOT_DIFFICULTY_LABELS,
  type BotDifficulty,
  type BotState,
  createBot,
  stepBot,
} from './raceBot';
import { RACE_DISTANCE } from './racePhysics';

const DT = 1 / 60;

/* Steps a fresh bot until it crosses RACE_DISTANCE, returning elapsed seconds (or `cap`). Pure in (difficulty, seed), so timing is reproducible. */
function finishSeconds(difficulty: BotDifficulty, seed: number, cap = 900): number {
  let bot = createBot(difficulty, seed);
  const maxTicks = Math.round(cap / DT);
  for (let tick = 0; tick < maxTicks; tick += 1) {
    bot = stepBot(bot, DT, seed);
    if (bot.car.position >= RACE_DISTANCE) {
      return (tick + 1) * DT;
    }
  }
  return cap;
}

/* Average finish time over a fixed seed set (smooths answer-RNG + per-seed hill luck, still deterministic). */
function averageFinishSeconds(difficulty: BotDifficulty, seeds: number[]): number {
  const total = seeds.reduce((sum, seed) => sum + finishSeconds(difficulty, seed), 0);
  return total / seeds.length;
}

const PACING_SEEDS = Array.from({ length: 24 }, (_, index) => index + 1);

/* Computed once so several tests share the same finish times without re-running the integration. Under the momentum-fix physics bots finish ~496s beginner, ~393s intermediate, ~259s advanced, ~214s expert, ~167s master. */
const AVERAGE_FINISH_SECONDS = Object.fromEntries(
  BOT_DIFFICULTIES.map((difficulty) => [
    difficulty,
    averageFinishSeconds(difficulty, PACING_SEEDS),
  ]),
) as Record<BotDifficulty, number>;

/* Steps a fresh bot for `durationSeconds` and returns the final state. Pure in (difficulty, seed). */
function runBot(difficulty: BotDifficulty, seed: number, durationSeconds: number): BotState {
  let bot = createBot(difficulty, seed);
  const ticks = Math.round(durationSeconds / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    bot = stepBot(bot, DT, seed);
  }
  return bot;
}

describe('bot difficulty metadata', () => {
  it('lists the five difficulties easiest -> hardest', () => {
    expect(BOT_DIFFICULTIES).toEqual([
      'beginner',
      'intermediate',
      'advanced',
      'expert',
      'master',
    ]);
  });

  it('maps every difficulty to its label', () => {
    expect(BOT_DIFFICULTY_LABELS).toEqual({
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
      expert: 'Expert',
      master: 'Master',
    });
  });

  it('has a config for each difficulty that is harder as you go up', () => {
    for (const difficulty of BOT_DIFFICULTIES) {
      const config = BOT_DIFFICULTY_CONFIG[difficulty];
      expect(config.answerIntervalSeconds).toBeGreaterThan(0);
      expect(config.accuracy).toBeGreaterThan(0);
      expect(config.accuracy).toBeLessThanOrEqual(1);
    }
    // Harder difficulty -> answers more often AND more accurately.
    for (let index = 1; index < BOT_DIFFICULTIES.length; index += 1) {
      const easier = BOT_DIFFICULTY_CONFIG[BOT_DIFFICULTIES[index - 1]];
      const harder = BOT_DIFFICULTY_CONFIG[BOT_DIFFICULTIES[index]];
      expect(harder.answerIntervalSeconds).toBeLessThan(easier.answerIntervalSeconds);
      expect(harder.accuracy).toBeGreaterThan(easier.accuracy);
    }
  });
});

describe('createBot', () => {
  it('starts at rest with an empty tank and the answer timer armed', () => {
    const bot = createBot('advanced', 7);
    expect(bot.car.position).toBe(0);
    expect(bot.car.velocity).toBe(0);
    // Bots start with a dry tank, so they must earn fuel by answering.
    expect(bot.car.fuel).toBe(0);
    expect(bot.secondsUntilNextAnswer).toBe(
      BOT_DIFFICULTY_CONFIG.advanced.answerIntervalSeconds,
    );
    expect(bot.difficulty).toBe('advanced');
  });
});

describe('stepBot', () => {
  it('earns fuel from correct answers and drives the car forward', () => {
    /* Even master answers only every ~11.5s, so use a long window where several answers fire — one unlucky first miss shouldn't make this flaky. */
    let bot = createBot('master', 3);
    let refuelled = false;
    for (let tick = 0; tick < Math.round(60 / DT); tick += 1) {
      const previousFuel = bot.car.fuel;
      bot = stepBot(bot, DT, 3);
      // Only addFuel (a correct answer) can raise fuel; stepCar only burns it.
      if (bot.car.fuel > previousFuel) {
        refuelled = true;
      }
    }
    expect(refuelled).toBe(true);
    expect(bot.car.position).toBeGreaterThan(0);
  });

  it('is deterministic: same (difficulty, seed) -> identical trajectory', () => {
    const trace = (): Array<[number, number, number]> => {
      let bot = createBot('intermediate', 99);
      const out: Array<[number, number, number]> = [];
      for (let tick = 0; tick < Math.round(12 / DT); tick += 1) {
        bot = stepBot(bot, DT, 99);
        out.push([bot.car.position, bot.car.velocity, bot.car.fuel]);
      }
      return out;
    };
    expect(trace()).toEqual(trace());
  });

  it('does not mutate the input state (plain step)', () => {
    const bot = createBot('expert', 11);
    const snapshot = JSON.parse(JSON.stringify(bot));
    const next = stepBot(bot, DT, 11);
    expect(bot).toEqual(snapshot);
    expect(next).not.toBe(bot);
    expect(next.car).not.toBe(bot.car);
  });

  it('does not mutate the input state when it answers (refuel path)', () => {
    /* Force the answer branch: arm the timer to expire with a seed known to draw a correct answer so addFuel runs. */
    const armed: BotState = {
      car: { position: 25, velocity: 8, fuel: 20 },
      difficulty: 'master',
      secondsUntilNextAnswer: 0.0001,
      rngState: 123456,
    };
    const snapshot = JSON.parse(JSON.stringify(armed));
    const next = stepBot(armed, DT, 1);
    expect(armed).toEqual(snapshot);
    expect(next.car).not.toBe(armed.car);
  });

  it('keeps the answer cadence by carrying the timer remainder', () => {
    const bot = createBot('beginner', 5);
    const stepped = stepBot(bot, DT, 5);
    expect(stepped.secondsUntilNextAnswer).toBeCloseTo(
      BOT_DIFFICULTY_CONFIG.beginner.answerIntervalSeconds - DT,
      6,
    );
  });
});

describe('difficulty pacing', () => {
  it('ranks final position monotonically by difficulty (averaged over seeds)', () => {
    /* Single seeds can swap adjacent levels on lucky draws, so average over a fixed seed set. The velocity time-constant is long (~25s) and bots start dry, so a longer window lets steady pace — not startup — set the ranking. */
    const SEEDS = Array.from({ length: 24 }, (_, index) => index + 1);
    const DURATION = 90;

    const averagePosition = (difficulty: BotDifficulty): number => {
      const total = SEEDS.reduce(
        (sum, seed) => sum + runBot(difficulty, seed, DURATION).car.position,
        0,
      );
      return total / SEEDS.length;
    };

    const averages = BOT_DIFFICULTIES.map(averagePosition);
    for (let index = 1; index < averages.length; index += 1) {
      expect(averages[index]).toBeGreaterThan(averages[index - 1]);
    }
  });
});

describe('difficulty finish times', () => {
  /* Beatable target bands (seconds to cover 2500 m). The ladder is deliberately slow: even Master (~167s) is ~4x a strong human's ~43s cruise. Update these if you retune BOT_DIFFICULTY_CONFIG or the physics constants. */
  const TARGET_BANDS: Record<BotDifficulty, [number, number]> = {
    beginner: [470, 525],
    intermediate: [375, 415],
    advanced: [240, 275],
    expert: [195, 225],
    master: [155, 180],
  };

  it('lands every difficulty inside its beatable target band (averaged over seeds)', () => {
    for (const difficulty of BOT_DIFFICULTIES) {
      const [low, high] = TARGET_BANDS[difficulty];
      const avg = AVERAGE_FINISH_SECONDS[difficulty];
      expect(avg).toBeGreaterThanOrEqual(low);
      expect(avg).toBeLessThanOrEqual(high);
    }
  });

  it('finishes strictly slower the easier the difficulty (beginner slowest -> master fastest)', () => {
    const finishesByDifficulty = BOT_DIFFICULTIES.map((d) => AVERAGE_FINISH_SECONDS[d]);
    // beginner first -> master last, so finish time must strictly DECREASE.
    for (let index = 1; index < finishesByDifficulty.length; index += 1) {
      expect(finishesByDifficulty[index]).toBeLessThan(finishesByDifficulty[index - 1]);
    }
  });

  it('keeps bots far slower than a strong human cruise (regression guard)', () => {
    /* An always-fuelled car (~112 m/s) covers 2500 m in ~43s. These floors lock in the slow-bot retune: even master (~167s) stays well above ~150s and beginner (~496s) far slower, so a change can't silently speed the field back to "beats a human". Floors sit below the bands so they keep guarding. */
    expect(AVERAGE_FINISH_SECONDS.master).toBeGreaterThan(150);
    expect(AVERAGE_FINISH_SECONDS.beginner).toBeGreaterThan(450);
    /* Nothing comes near the ~43s human cruise; the fastest bot is well over 3x it. */
    const fastest = Math.min(...BOT_DIFFICULTIES.map((d) => AVERAGE_FINISH_SECONDS[d]));
    expect(fastest).toBeGreaterThan(150);
  });

  it('starts bots with a dry tank so they cannot launch off the line', () => {
    for (const difficulty of BOT_DIFFICULTIES) {
      expect(createBot(difficulty, 1).car.fuel).toBe(0);
    }
  });
});
