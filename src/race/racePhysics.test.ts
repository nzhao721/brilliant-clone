import { describe, expect, it } from 'vitest';
import {
  ACCELERATION,
  addFuel,
  type CarState,
  DRAG_COEFF,
  FUEL_BURN_RATE,
  FUEL_PER_CORRECT,
  GRAVITY,
  hasFinished,
  MAX_SPEED,
  RACE_DISTANCE,
  ROLLING_FRICTION,
  SLOPE_LIMIT,
  slopeAt,
  stepCar,
  TANK_CAPACITY,
} from './racePhysics';

const DT = 1 / 60;
const SEED = 12345;

/* Scan for a position whose slope satisfies `predicate`, so tests sample known-signed terrain instead of hard-coding positions. */
function findPosition(seed: number, predicate: (slope: number) => boolean): number {
  for (let position = 0; position < RACE_DISTANCE; position += 0.5) {
    if (predicate(slopeAt(position, seed))) {
      return position;
    }
  }
  throw new Error('no position matched predicate for this seed');
}

/* Steepest uphill (largest positive grade) for a seed, so tests exercise the worst real hill. */
function findSteepestUphill(seed: number): { position: number; slope: number } {
  let best = { position: 0, slope: -Infinity };
  for (let position = 0; position < RACE_DISTANCE; position += 0.5) {
    const slope = slopeAt(position, seed);
    if (slope > best.slope) {
      best = { position, slope };
    }
  }
  return best;
}

// Mirror of findSteepestUphill for the steepest descent (most negative grade).
function findSteepestDownhill(seed: number): { position: number; slope: number } {
  let best = { position: 0, slope: Infinity };
  for (let position = 0; position < RACE_DISTANCE; position += 0.5) {
    const slope = slopeAt(position, seed);
    if (slope < best.slope) {
      best = { position, slope };
    }
  }
  return best;
}

/* Flattest point (smallest |grade|) so flat-ground tests aren't skewed by a residual hill term: GRAVITY is large, so the coarse scan is refined by a local descent on |slope| until the residual is negligible. */
function findFlattest(seed: number): number {
  let best = { position: 0, magnitude: Infinity };
  for (let position = 0; position < RACE_DISTANCE; position += 0.5) {
    const magnitude = Math.abs(slopeAt(position, seed));
    if (magnitude < best.magnitude) {
      best = { position, magnitude };
    }
  }

  /* Refine toward the zero-crossing: step left/right while it lowers |slope|, else halve the step. Converges to a near-exact flat spot, so GRAVITY * slopeAt(here) is negligible. */
  let position = best.position;
  let step = 0.25;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const here = Math.abs(slopeAt(position, seed));
    const left = Math.abs(slopeAt(position - step, seed));
    const right = Math.abs(slopeAt(position + step, seed));
    if (left < here && left <= right) {
      position -= step;
    } else if (right < here) {
      position += step;
    } else {
      step /= 2;
    }
  }
  return position;
}

/* Terminal velocity at a FIXED grade: drive a throttling, full-tank car (position pinned) until speed stops changing — the steady state where thrust balances drag + the hill term. */
function terminalVelocityAt(position: number, seed: number): number {
  let velocity = 0;
  /* Approach to terminal is slow (1/DRAG_COEFF ~= 25s); converges in ~490s, well inside the 60000-tick (1000s) budget. */
  for (let tick = 0; tick < 60000; tick += 1) {
    const next = stepCar({ position, velocity, fuel: TANK_CAPACITY }, DT, seed).velocity;
    if (Math.abs(next - velocity) < 1e-9) {
      return next;
    }
    velocity = next;
  }
  return velocity;
}

/* A real hill BOTTOM: a downhill -> uphill grade zero-crossing, where a coasting car is at peak speed but slope ~0 so drag is the only brake — the spot the momentum fix targets. */
function findTrough(seed: number): number {
  for (let position = 1; position < RACE_DISTANCE; position += 0.5) {
    if (slopeAt(position - 0.5, seed) < 0 && slopeAt(position + 0.5, seed) > 0) {
      return position;
    }
  }
  return findFlattest(seed);
}

describe('slopeAt', () => {
  it('is deterministic for the same (position, seed)', () => {
    for (const position of [0, 17.5, 123, 456.25, 999]) {
      expect(slopeAt(position, SEED)).toBe(slopeAt(position, SEED));
    }
  });

  it('varies along the track (not constant)', () => {
    const samples = [];
    for (let position = 0; position < RACE_DISTANCE; position += 5) {
      samples.push(slopeAt(position, SEED));
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    /* Genuinely undulating; relative to SLOPE_LIMIT so it keeps testing "not flat" if the band is retuned. */
    expect(max - min).toBeGreaterThan(SLOPE_LIMIT * 0.5);
  });

  it('stays within the gentle rolling-hill band [-SLOPE_LIMIT, SLOPE_LIMIT]', () => {
    const EPS = 1e-9;
    let maxMagnitude = 0;
    for (let position = 0; position < RACE_DISTANCE; position += 5) {
      const slope = slopeAt(position, SEED);
      expect(slope).toBeGreaterThanOrEqual(-SLOPE_LIMIT - EPS);
      expect(slope).toBeLessThanOrEqual(SLOPE_LIMIT + EPS);
      maxMagnitude = Math.max(maxMagnitude, Math.abs(slope));
    }
    /* Hills are gentle (band well below the old 0.3) yet still use a good fraction of it (not trivially flat). */
    expect(SLOPE_LIMIT).toBeLessThanOrEqual(0.12);
    expect(maxMagnitude).toBeGreaterThan(SLOPE_LIMIT * 0.5);
  });

  it('produces different terrain for different seeds', () => {
    let anyDifference = false;
    for (let position = 0; position < RACE_DISTANCE; position += 5) {
      if (slopeAt(position, 1) !== slopeAt(position, 2)) {
        anyDifference = true;
        break;
      }
    }
    expect(anyDifference).toBe(true);
  });
});

describe('stepCar', () => {
  it('accelerates and burns fuel when fuelled on near-flat ground', () => {
    const flat = findPosition(SEED, (slope) => Math.abs(slope) < 0.02);
    const start: CarState = { position: flat, velocity: 0, fuel: 50 };

    const next = stepCar(start, DT, SEED);
    expect(next.velocity).toBeGreaterThan(start.velocity);
    expect(next.fuel).toBeLessThan(start.fuel);
    // Fuel drains at the burn rate while accelerating.
    expect(next.fuel).toBeCloseTo(50 - FUEL_BURN_RATE * DT, 6);

    // Velocity keeps climbing over a short fuelled run.
    let car = start;
    for (let tick = 0; tick < 30; tick += 1) {
      const previous = car.velocity;
      car = stepCar(car, DT, SEED);
      expect(car.velocity).toBeGreaterThanOrEqual(previous);
    }
    expect(car.velocity).toBeGreaterThan(0.25);
  });

  it('does not mutate the input state', () => {
    const start: CarState = { position: 10, velocity: 4, fuel: 30 };
    const snapshot = { ...start };
    stepCar(start, DT, SEED);
    expect(start).toEqual(snapshot);
  });

  it('with throttle off, does not accelerate or burn fuel (only coasts)', () => {
    /* Pin a TRUE flat spot: strong GRAVITY means a slight downhill would speed a coasting car up, so isolate friction-only coasting. */
    const flat = findFlattest(SEED);
    const start: CarState = { position: flat, velocity: 2.5, fuel: 50 };

    /* Throttle off: even with a near-full tank it loses speed to friction and spends NO fuel. */
    const coasted = stepCar(start, DT, SEED, false);
    expect(coasted.fuel).toBe(start.fuel);
    expect(coasted.velocity).toBeLessThan(start.velocity);
    /* Same as an empty tank under default throttle, since neither applies thrust. */
    const empty = stepCar({ ...start, fuel: 0 }, DT, SEED);
    expect(coasted.velocity).toBeCloseTo(empty.velocity, 9);

    // Over a longer no-throttle run the tank never drains a drop.
    let car = start;
    for (let tick = 0; tick < 120; tick += 1) {
      car = stepCar(car, DT, SEED, false);
      expect(car.fuel).toBe(50);
    }
  });

  it('with throttle on (explicit), accelerates and burns fuel like the default', () => {
    const flat = findPosition(SEED, (slope) => Math.abs(slope) < 0.02);
    const start: CarState = { position: flat, velocity: 0, fuel: 50 };

    const onExplicit = stepCar(start, DT, SEED, true);
    const onDefault = stepCar(start, DT, SEED);
    // Passing throttle=true is identical to the default behaviour.
    expect(onExplicit).toEqual(onDefault);
    expect(onExplicit.velocity).toBeGreaterThan(start.velocity);
    expect(onExplicit.fuel).toBeCloseTo(50 - FUEL_BURN_RATE * DT, 6);
  });

  it('coasts to a complete stop once out of fuel (and never reverses)', () => {
    /* Pin the steepest uphill so friction + gravity guarantee a full stop (unpinned, it could drift onto a downslope). Empty tank => no thrust; long window since friction is tiny. */
    const uphill = findSteepestUphill(SEED);
    expect(uphill.slope).toBeGreaterThan(SLOPE_LIMIT * 0.5);
    let car: CarState = { position: uphill.position, velocity: 4.5, fuel: 0 };

    for (let tick = 0; tick < Math.round(60 / DT); tick += 1) {
      car = stepCar({ ...car, position: uphill.position }, DT, SEED);
      expect(car.velocity).toBeGreaterThanOrEqual(0);
    }
    expect(car.velocity).toBe(0);

    // A stalled car on an incline stays put — position no longer advances.
    const stalled = stepCar({ ...car, position: uphill.position }, DT, SEED);
    expect(stalled.velocity).toBe(0);
    expect(stalled.position).toBe(uphill.position);
  });

  it('slows more uphill and gains speed downhill versus flat', () => {
    const uphill = findPosition(SEED, (slope) => slope > SLOPE_LIMIT * 0.5);
    const flat = findPosition(SEED, (slope) => Math.abs(slope) < 0.02);
    const downhill = findPosition(SEED, (slope) => slope < -SLOPE_LIMIT * 0.5);

    /* Identical motion at each spot; only the grade differs. Empty tank so thrust can't mask the hill term. */
    const base = { velocity: 3, fuel: 0 };
    const up = stepCar({ ...base, position: uphill }, DT, SEED);
    const level = stepCar({ ...base, position: flat }, DT, SEED);
    const down = stepCar({ ...base, position: downhill }, DT, SEED);

    expect(up.velocity).toBeLessThan(level.velocity);
    expect(level.velocity).toBeLessThan(down.velocity);
    // Same ordering shows up in distance covered this tick.
    expect(up.position - uphill).toBeLessThan(down.position - downhill);
  });

  it('applies a STRONG gravity term: downhill speeds up and uphill slows by a wide margin', () => {
    /* Hills are gentle in SHAPE (small SLOPE_LIMIT) but GRAVITY is large, so the grade dominates. Empty tank + identical incoming motion at all three spots means drag + rolling friction cancel in the differences, leaving only GRAVITY * Δslope. */
    const up = findSteepestUphill(SEED);
    const down = findSteepestDownhill(SEED);
    const flat = findFlattest(SEED);
    const base = { velocity: 10, fuel: 0 };

    const dvAt = (position: number): number =>
      stepCar({ ...base, position }, DT, SEED).velocity - base.velocity;
    const dvUp = dvAt(up.position);
    const dvFlat = dvAt(flat);
    const dvDown = dvAt(down.position);

    // Clear ordering: downhill gains relative to flat, uphill loses relative to flat.
    expect(dvDown).toBeGreaterThan(dvFlat);
    expect(dvFlat).toBeGreaterThan(dvUp);

    /* The swing is exactly the analytic GRAVITY * Δslope (equal incoming speed makes drag + rolling friction cancel in the differences). */
    expect(dvDown - dvFlat).toBeCloseTo(
      GRAVITY * (slopeAt(flat, SEED) - slopeAt(down.position, SEED)) * DT,
      9,
    );
    expect(dvFlat - dvUp).toBeCloseTo(
      GRAVITY * (slopeAt(up.position, SEED) - slopeAt(flat, SEED)) * DT,
      9,
    );

    /* STRONG, not subtle: the downhill boost and uphill brake EACH exceed 2x the flat-ground friction loss, so the grade dominates on a hill. */
    const flatFrictionLoss = Math.abs(dvFlat); // drag + rolling at v=40 on level ground
    expect(dvDown - dvFlat).toBeGreaterThan(flatFrictionLoss * 2);
    expect(dvFlat - dvUp).toBeGreaterThan(flatFrictionLoss * 2);
  });

  it('carries momentum at a hill bottom while gravity stays the dominant hill force', () => {
    /* Regression guard for the "decelerates too fast at a hill BOTTOM" bug: drag is largest at the bottom's peak speed, and at the OLD DRAG_COEFF (0.06) it reached ~3 m/s² at ~50 m/s — as strong as the steepest gravity term (GRAVITY * SLOPE_LIMIT = 3) — so the car shed its speed entering the next climb. The fix eases drag only; gravity is untouched. */
    const trough = findTrough(SEED); // a true hill bottom: slope ~ 0, drag-dominated
    const flat = findFlattest(SEED);
    const down = findSteepestDownhill(SEED);
    const HILL_BOTTOM_SPEED = 50; // representative peak speed coming off a downhill

    /* (1) MOMENTUM: coasting a FULL second at the hill bottom keeps most of the speed (gentle decel, not a wall). */
    let car: CarState = { position: trough, velocity: HILL_BOTTOM_SPEED, fuel: 0 };
    for (let tick = 0; tick < Math.round(1 / DT); tick += 1) {
      car = stepCar({ ...car, position: trough }, DT, SEED, false);
    }
    expect(car.velocity / HILL_BOTTOM_SPEED).toBeGreaterThan(0.9);

    /* ...because drag at that speed now sits below both the steepest gravity term AND half the thrust. The old DRAG_COEFF made drag EQUAL the gravity term (3 m/s²), walling off the bottom; the eased ~2 m/s² is the heart of the fix. */
    expect(DRAG_COEFF * HILL_BOTTOM_SPEED).toBeLessThan(GRAVITY * SLOPE_LIMIT);
    expect(DRAG_COEFF * HILL_BOTTOM_SPEED).toBeLessThan(ACCELERATION * 0.5);

    /* (2) GRAVITY STILL DOMINATES at that speed: the steepest descent's gravity term beats drag, so a coasting car STILL gains speed downhill (the old heavier drag would have lost speed) and outruns the flat coast. */
    expect(GRAVITY * Math.abs(slopeAt(down.position, SEED))).toBeGreaterThan(
      DRAG_COEFF * HILL_BOTTOM_SPEED,
    );
    const coastingBase = { velocity: HILL_BOTTOM_SPEED, fuel: 0 };
    const dvDown =
      stepCar({ ...coastingBase, position: down.position }, DT, SEED).velocity -
      HILL_BOTTOM_SPEED;
    const dvFlat =
      stepCar({ ...coastingBase, position: flat }, DT, SEED).velocity - HILL_BOTTOM_SPEED;
    expect(dvDown).toBeGreaterThan(0); // gravity overpowers the eased drag on a descent
    expect(dvDown).toBeGreaterThan(dvFlat); // and the descent clearly beats the flat coast
  });

  it('still climbs the steepest uphill while throttling with fuel (net speed-up)', () => {
    /* Even with high gravity, a fuelled car on the gas must accelerate THROUGH the worst hill, not stall. From a dead stop on the steepest uphill, velocity must rise every tick while fuelled. */
    const steepest = findSteepestUphill(SEED);
    expect(steepest.slope).toBeGreaterThan(SLOPE_LIMIT * 0.5); // the worst real grade

    let car: CarState = { position: steepest.position, velocity: 0, fuel: TANK_CAPACITY };
    for (let tick = 0; tick < 30; tick += 1) {
      const previous = car.velocity;
      car = stepCar(car, DT, SEED);
      expect(car.velocity).toBeGreaterThan(previous);
    }
    /* Actually moving, not creeping: net accel at rest on the worst grade is ACCELERATION - ROLLING_FRICTION - GRAVITY * SLOPE_LIMIT ~= 1.49 m/s², clearing 0.25 m/s over 0.5s with room to spare. */
    expect(car.velocity).toBeGreaterThan(0.25);

    /* The full SLOPE_LIMIT grade (worst the terrain can present) is still net acceleration from rest with throttle + fuel, regardless of seed. */
    expect(ACCELERATION - ROLLING_FRICTION - GRAVITY * SLOPE_LIMIT).toBeGreaterThan(0);
  });

  it('converges toward a flat-ground terminal velocity under continuous throttle (no hard cap)', () => {
    /* No hard cap: drag grows with speed until it balances thrust, so the per-tick gain shrinks and velocity settles at a terminal (~112 m/s, slow approach ~25s). Pin the flattest grade + full tank to isolate flat dynamics. */
    const flat = findFlattest(SEED);
    const step = (v: number): number =>
      stepCar({ position: flat, velocity: v, fuel: TANK_CAPACITY }, DT, SEED).velocity;

    const seconds = 300;
    const velocities = [0];
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
      velocities.push(step(velocities[velocities.length - 1]));
    }

    // Strictly rising the whole way (still accelerating, just by less each tick)...
    for (let index = 1; index < velocities.length; index += 1) {
      expect(velocities[index]).toBeGreaterThan(velocities[index - 1]);
    }
    /* ...with the per-second gain shrinking as drag grows: the 100th second's gain is a tiny fraction of the 1st's. */
    const gainAcross = (secondMark: number): number =>
      velocities[Math.round(secondMark / DT)] -
      velocities[Math.round((secondMark - 1) / DT)];
    const earlyGain = gainAcross(1);
    const lateGain = gainAcross(100);
    expect(lateGain).toBeLessThan(earlyGain * 0.05);
    expect(lateGain).toBeGreaterThan(0);

    /* Steady state lands in the "fast" band and matches the analytic terminal (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF (tiny gap = Euler discretisation), approached from below. */
    const terminal = terminalVelocityAt(flat, SEED);
    const analytic = (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF;
    expect(terminal).toBeGreaterThan(105);
    expect(terminal).toBeLessThan(118);
    expect(Math.abs(terminal - analytic)).toBeLessThan(0.5);
    const finalVelocity = velocities[velocities.length - 1];
    expect(finalVelocity).toBeLessThan(analytic);
    expect(finalVelocity).toBeGreaterThan(analytic - 0.25);
    /* Generous timeout: 300s of integration + terminalVelocityAt's long convergence is compute-heavy on a slow host. */
  }, 20000);

  it('brakes with speed-proportional drag: the linear term at 2v is twice that at v', () => {
    const flat = findFlattest(SEED);
    /* Subtract the known constant decelerations (rolling friction + residual hill term) to isolate the velocity-proportional drag. Empty tank => no thrust. */
    const constantDecel = (ROLLING_FRICTION + GRAVITY * slopeAt(flat, SEED)) * DT;
    const dragDecelAt = (v: number): number => {
      const after = stepCar({ position: flat, velocity: v, fuel: 0 }, DT, SEED).velocity;
      return v - after - constantDecel;
    };

    const atV = dragDecelAt(2.5);
    const at2V = dragDecelAt(5);
    /* The isolated drag term is exactly DRAG_COEFF * v * dt — linear in v, so doubling speed doubles it. */
    expect(atV).toBeCloseTo(DRAG_COEFF * 2.5 * DT, 9);
    expect(at2V).toBeCloseTo(DRAG_COEFF * 5 * DT, 9);
    expect(at2V).toBeCloseTo(2 * atV, 9);
  });

  it('can exceed the flat-ground terminal velocity on a downhill (no hard cap)', () => {
    const flat = findFlattest(SEED);
    const flatTerminal = terminalVelocityAt(flat, SEED);

    const downhill = findSteepestDownhill(SEED);
    expect(downhill.slope).toBeLessThan(-SLOPE_LIMIT * 0.5); // the worst real descent
    const downhillTerminal = terminalVelocityAt(downhill.position, SEED);

    /* Gravity adds to thrust on a descent, so the balance point sits higher — past both the flat terminal AND the HUD top speed. */
    expect(downhillTerminal).toBeGreaterThan(flatTerminal);
    expect(downhillTerminal).toBeGreaterThan(MAX_SPEED);

    /* And it gets there: fuelled and pinned on the descent, the car climbs past the flat cruise speed (slow approach under low drag, so a long pull). */
    let velocity = 0;
    let peak = 0;
    for (let tick = 0; tick < Math.round(90 / DT); tick += 1) {
      velocity = stepCar(
        { position: downhill.position, velocity, fuel: TANK_CAPACITY },
        DT,
        SEED,
      ).velocity;
      peak = Math.max(peak, velocity);
    }
    expect(peak).toBeGreaterThan(flatTerminal);
    /* Generous timeout: two terminalVelocityAt convergences + a 90s pull are compute-heavy on a slow host. */
  }, 20000);

  it('coasts to a COMPLETE stop on flat ground once out of fuel', () => {
    /* Linear drag only asymptotes toward 0; the constant rolling friction is what brings an empty-tank car to a true stop. Pin the flattest grade; low drag makes the glide long. */
    const flat = findFlattest(SEED);
    let car: CarState = { position: flat, velocity: 5, fuel: 0 };
    for (let tick = 0; tick < Math.round(90 / DT); tick += 1) {
      car = stepCar({ ...car, position: flat }, DT, SEED);
      expect(car.velocity).toBeGreaterThanOrEqual(0);
    }
    expect(car.velocity).toBe(0);

    // Once stopped on the flat it stays put (no creeping forward, no reversing).
    const held = stepCar({ ...car, position: flat }, DT, SEED);
    expect(held.velocity).toBe(0);
  });

  it('glides for ~80s before stopping from v=30 on flat with no throttle', () => {
    /* Headline low-friction target: an out-of-gas car coasts a long time. From 7.5 m/s on the flat with throttle OFF it takes ~80s to fully stop. Pin the flattest grade to isolate flat coasting. */
    const flat = findFlattest(SEED);
    let car: CarState = { position: flat, velocity: 7.5, fuel: 0 };
    let stopSeconds = -1;
    const maxTicks = Math.round(150 / DT);
    for (let tick = 0; tick < maxTicks; tick += 1) {
      car = stepCar({ ...car, position: flat }, DT, SEED, false);
      if (car.velocity === 0) {
        stopSeconds = (tick + 1) * DT;
        break;
      }
    }
    expect(stopSeconds).toBeGreaterThan(75);
    expect(stopSeconds).toBeLessThan(86);
  });

  it('never produces a negative velocity across varied terrain', () => {
    /* Sweep many start positions, empty tank; the clamp must hold even where friction + gravity exceed forward motion. */
    for (let position = 0; position < RACE_DISTANCE; position += 25) {
      let car: CarState = { position, velocity: 1.5, fuel: 0 };
      for (let tick = 0; tick < 240; tick += 1) {
        car = stepCar(car, DT, SEED);
        expect(car.velocity).toBeGreaterThanOrEqual(0);
      }
    }
    /* Generous timeout: ~24k stepCar/slopeAt evaluations, heavy on a slow host. */
  }, 20000);
});

describe('addFuel', () => {
  it('adds fuel without exceeding the tank capacity', () => {
    // Well below the cap, a correct answer's fuel simply adds.
    expect(addFuel({ position: 0, velocity: 0, fuel: 10 }, FUEL_PER_CORRECT).fuel).toBe(
      10 + FUEL_PER_CORRECT,
    );
    /* Topping a near-full tank saturates at TANK_CAPACITY. Computed from the constants so it keeps testing the cap if they're retuned. */
    const nearlyFull = TANK_CAPACITY - FUEL_PER_CORRECT / 2;
    // Guard: this really is an overflow case (raw sum exceeds the tank).
    expect(nearlyFull + FUEL_PER_CORRECT).toBeGreaterThan(TANK_CAPACITY);
    expect(addFuel({ position: 0, velocity: 0, fuel: nearlyFull }, FUEL_PER_CORRECT).fuel).toBe(
      TANK_CAPACITY,
    );
    // A full tank stays full.
    expect(addFuel({ position: 0, velocity: 0, fuel: TANK_CAPACITY }, FUEL_PER_CORRECT).fuel).toBe(
      TANK_CAPACITY,
    );
  });

  it('returns a new state and preserves position/velocity', () => {
    const start: CarState = { position: 42, velocity: 7, fuel: 5 };
    const next = addFuel(start, 20);
    expect(next).not.toBe(start);
    expect(start.fuel).toBe(5);
    expect(next).toEqual({ position: 42, velocity: 7, fuel: 25 });
  });
});

describe('hasFinished', () => {
  it('is false just before the finish line and true at/after it', () => {
    expect(hasFinished({ position: RACE_DISTANCE - 0.01, velocity: 0, fuel: 0 })).toBe(false);
    expect(hasFinished({ position: RACE_DISTANCE, velocity: 0, fuel: 0 })).toBe(true);
    expect(hasFinished({ position: RACE_DISTANCE + 50, velocity: 0, fuel: 0 })).toBe(true);
  });

  it('honours a custom race distance', () => {
    expect(hasFinished({ position: 30, velocity: 0, fuel: 0 }, 40)).toBe(false);
    expect(hasFinished({ position: 40, velocity: 0, fuel: 0 }, 40)).toBe(true);
  });
});

describe('constants', () => {
  it('are internally consistent for the intended feel', () => {
    /* Net forward push at rest on the flat must be positive (or no car pulls away); both brake terms must be positive for the model to make sense. */
    expect(ACCELERATION).toBeGreaterThan(ROLLING_FRICTION);
    expect(ROLLING_FRICTION).toBeGreaterThan(0);
    expect(DRAG_COEFF).toBeGreaterThan(0);
    expect(GRAVITY).toBeGreaterThan(0);

    /* Flat terminal (thrust == drag + rolling friction) lands in the "very fast" band of the low-drag rework — far above the old ~11.75 m/s cruise (and older hard cap of 6). */
    const terminal = (ACCELERATION - ROLLING_FRICTION) / DRAG_COEFF;
    expect(terminal).toBeGreaterThan(105);
    expect(terminal).toBeLessThan(118);
    expect(terminal).toBeGreaterThan(11);

    /* MAX_SPEED is the HUD reference top speed, not a cap; kept near the flat terminal so the gauge reads ~full at cruise. */
    expect(MAX_SPEED).toBeGreaterThan(terminal - 1.25);
    expect(MAX_SPEED).toBeLessThan(terminal + 1.25);

    /* The tank banks a healthy thrust reserve yet is far short of a whole race at cruise, so steady refuelling — not one fill — wins. */
    const fullTankThrustSeconds = TANK_CAPACITY / FUEL_BURN_RATE;
    expect(fullTankThrustSeconds).toBeGreaterThan(8);
    expect(fullTankThrustSeconds).toBeLessThan(RACE_DISTANCE / MAX_SPEED);

    /* Climbability invariant: at rest on the steepest grade (drag ~0), a fuelled throttling car still has net forward accel (thrust beats rolling friction + worst hill), so no hill is a wall. */
    expect(ACCELERATION - ROLLING_FRICTION - GRAVITY * SLOPE_LIMIT).toBeGreaterThan(0);

    /* Gravity is DELIBERATELY STRONG vs friction: gentle SHAPE (small SLOPE_LIMIT) but raised GRAVITY so the grade dominates. The steepest-grade accel/decel dwarfs rolling friction and exceeds drag at a brisk cruise. */
    const hillAccelAtSteepest = GRAVITY * SLOPE_LIMIT; // m/s^2 on the worst grade
    expect(hillAccelAtSteepest).toBeGreaterThan(ROLLING_FRICTION * 100);
    expect(hillAccelAtSteepest).toBeGreaterThan(DRAG_COEFF * 25); // drag at ~25 m/s

    /* ...yet the climb from rest on the worst grade keeps a comfortable margin (always climbable) while still being clearly FELT — gravity bites without walling. */
    const climbMargin = ACCELERATION - ROLLING_FRICTION - hillAccelAtSteepest;
    expect(climbMargin).toBeGreaterThan(0.5);
    expect(climbMargin).toBeLessThan(ACCELERATION * 0.6);
  });
});
