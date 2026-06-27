import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared sound engine is built in parallel; stub it so the game renders
// without a SoundProvider in the tree and audio calls become inert no-ops.
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: vi.fn(),
    playCustom: vi.fn(),
    startMusic: vi.fn(),
    stopMusic: vi.fn(),
    isMuted: false,
    toggleMute: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
  }),
}));

import {
  DinoRun,
  BASE_SPEED,
  MAX_SPEED,
  SPEED_RAMP,
  GAP_MIN_START,
  GAP_MIN_END,
  GAP_MAX_START,
  GAP_MAX_END,
  JUMP_AIRTIME,
  MIN_SPAWN_GAP,
  JUMP_CODES,
  DUCK_CODES,
  createState,
  stepPhysics,
  startJump,
  setDuck,
  isDucking,
  releaseHeldKeysIfHidden,
} from './DinoRun';

// Old (pre-difficulty-bump) tuning, kept here so the assertions document the
// direction of the change rather than just pinning the new magic numbers.
const OLD_SPEED_RAMP = 0.00028;
const OLD_MAX_SPEED = 12.6;
const OLD_GAP_MIN_START = 80;
const OLD_GAP_MIN_END = 52;
const OLD_GAP_MAX_START = 140;
const OLD_GAP_MAX_END = 90;

// Drive the pure simulation without the dino ever colliding: we only want to
// measure world tuning (spawn cadence + speed ramp), which is independent of the
// runner's vertical position, so we park it far above every obstacle each frame.
function advance(s: ReturnType<typeof createState>, frames: number) {
  for (let i = 0; i < frames; i += 1) {
    s.dino.y = -1e6;
    s.onGround = false;
    stepPhysics(s, 1);
  }
}

// jsdom has no real 2D canvas; stub getContext so the drawing code runs (and is
// exercised) without the "Not implemented" noise.
function stubGetContext() {
  const grad = { addColorStop: () => {} };
  const ctx = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => grad;
        }
        if (prop === 'canvas') return null;
        return () => {};
      },
      set: () => true,
    },
  );
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
}

describe('DinoRun', () => {
  let spy: ReturnType<typeof stubGetContext>;
  beforeEach(() => {
    spy = stubGetContext();
  });
  afterEach(() => {
    spy.mockRestore();
    vi.restoreAllMocks();
  });

  it('mounts inactive without crashing', () => {
    const { container, unmount } = render(
      <DinoRun active={false} onScoreChange={() => {}} onGameOver={() => {}} />,
    );
    expect(container.querySelector('canvas')).not.toBeNull();
    unmount();
  });

  it('starts a fresh game when active, reports an initial score, and survives input', () => {
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();
    const { container, rerender, unmount } = render(
      <DinoRun active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    rerender(<DinoRun active onScoreChange={onScoreChange} onGameOver={onGameOver} />);

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(onScoreChange).toHaveBeenCalledWith(0);

    // Game keys are handled on window and must not throw. Holding the duck key,
    // a stray in-page window blur (which must NOT release the hold), a real
    // keyup, and a genuine tab-hide all have to be handled cleanly.
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.keyDown(window, { code: 'ArrowDown' });
    fireEvent.blur(window);
    fireEvent.keyUp(window, { code: 'ArrowDown' });
    fireEvent(document, new Event('visibilitychange'));

    // Flipping inactive cleans up without firing a spurious game over.
    rerender(<DinoRun active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />);
    expect(onGameOver).not.toHaveBeenCalled();

    unmount();
  });

  it('does not wire a bare window blur release that could drop a held duck', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const onGameOver = vi.fn();
    const { rerender, unmount } = render(
      <DinoRun active={false} onScoreChange={() => {}} onGameOver={onGameOver} />,
    );
    rerender(<DinoRun active onScoreChange={() => {}} onGameOver={onGameOver} />);

    // The "momentary duck while holding" regression came from releasing held
    // keys on ANY window blur: an in-page focus shuffle blurs the window while
    // the key is still physically down, so the duck popped back up. The fix
    // relies on the window keydown/keyup stream (which survives in-window focus
    // changes) plus a visibilitychange tab-away guard, so no bare-blur release
    // listener should be registered at all.
    const blurListeners = addSpy.mock.calls.filter(([type]) => type === 'blur');
    expect(blurListeners).toHaveLength(0);

    // A stray window blur while the duck key is held is therefore a no-op: it
    // must neither crash nor end the run.
    fireEvent.keyDown(window, { code: 'ArrowDown' });
    fireEvent.blur(window);
    expect(onGameOver).not.toHaveBeenCalled();

    rerender(<DinoRun active={false} onScoreChange={() => {}} onGameOver={onGameOver} />);
    unmount();
  });
});

describe('DinoRun duck control', () => {
  it('maps the documented jump and duck keys to non-overlapping sets', () => {
    for (const code of ['Space', 'ArrowUp', 'KeyW']) {
      expect(JUMP_CODES.has(code)).toBe(true);
    }
    for (const code of ['ArrowDown', 'KeyS']) {
      expect(DUCK_CODES.has(code)).toBe(true);
    }
    // A key is only ever a jump OR a duck, never both.
    for (const code of DUCK_CODES) {
      expect(JUMP_CODES.has(code)).toBe(false);
    }
  });

  it('crouches only while the key is held AND grounded', () => {
    const s = createState();
    expect(isDucking(s)).toBe(false);

    setDuck(s, true);
    expect(s.duckHeld).toBe(true);
    expect(s.started).toBe(true); // first input clears the on-canvas hint
    expect(isDucking(s)).toBe(true);

    // Airborne: the same key fast-falls instead of crouching.
    s.onGround = false;
    expect(isDucking(s)).toBe(false);
    s.onGround = true;
    expect(isDucking(s)).toBe(true);

    // Releasing (a real keyup OR a genuine tab-hide) stands the runner up.
    setDuck(s, false);
    expect(s.duckHeld).toBe(false);
    expect(isDucking(s)).toBe(false);
  });

  it('stays crouched every frame while the key remains held (the loop never clears it)', () => {
    const s = createState();
    setDuck(s, true);
    for (let i = 0; i < 300; i += 1) {
      // Keep the lane clear so the wide crouch box can't collide; the point is
      // that the simulation never resets the held duck on its own.
      s.obstacles = [];
      s.spawnTimer = 1000;
      stepPhysics(s, 1);
      expect(isDucking(s)).toBe(true);
    }
    setDuck(s, false);
    expect(isDucking(s)).toBe(false);
  });

  it('keeps the crouch through an in-window focus shuffle while the page stays visible', () => {
    const s = createState();
    setDuck(s, true);
    expect(isDucking(s)).toBe(true);

    // An in-page focus steal (another element / iframe / devtools, or a
    // transient window blur) keeps the tab visible, so a still-held duck must
    // NOT be dropped — not on the focus event, and not across the frames that
    // follow with no keyup ever arriving.
    for (let i = 0; i < 200; i += 1) {
      s.obstacles = [];
      s.spawnTimer = 1000;
      releaseHeldKeysIfHidden(s, false);
      stepPhysics(s, 1);
      expect(isDucking(s)).toBe(true);
    }
    expect(s.duckHeld).toBe(true);
  });

  it('releases the crouch on a real keyup', () => {
    const s = createState();
    setDuck(s, true);
    expect(isDucking(s)).toBe(true);

    // The component's keyup handler is exactly this setter.
    setDuck(s, false);
    expect(s.duckHeld).toBe(false);
    expect(isDucking(s)).toBe(false);
  });

  it('releases a held crouch only on a genuine tab-hide (visibilitychange)', () => {
    const s = createState();
    setDuck(s, true);

    // Still visible (any in-window focus change): untouched.
    releaseHeldKeysIfHidden(s, false);
    expect(isDucking(s)).toBe(true);

    // Actually hidden (real tab-away / minimize): force it off so a
    // never-delivered keyup can't leave the runner stuck crouching.
    releaseHeldKeysIfHidden(s, true);
    expect(s.duckHeld).toBe(false);
    expect(isDucking(s)).toBe(false);
  });

  it('ducks UNDER a head-height flyer that hits a standing runner', () => {
    // A flyer sits at head height (GROUND_Y - HIGH_CLEARANCE up, HIGH_H tall),
    // lined up with the runner's fixed x.
    const flyer = () => ({
      kind: 'high' as const,
      x: 100,
      w: 38,
      h: 22,
      topY: 212 - 34 - 22,
      stalks: [],
      flap: 0,
    });

    // Standing into it: collision ends the run.
    const standing = createState();
    standing.spawnTimer = 1000;
    standing.obstacles = [flyer()];
    stepPhysics(standing, 1);
    expect(standing.dead).toBe(true);

    // Holding duck at the same spot slips under it: the run survives.
    const ducking = createState();
    ducking.spawnTimer = 1000;
    ducking.obstacles = [flyer()];
    setDuck(ducking, true);
    stepPhysics(ducking, 1);
    expect(ducking.dead).toBe(false);
  });

  it('starts a jump only when grounded and alive', () => {
    const s = createState();
    expect(startJump(s)).toBe(true);
    expect(s.onGround).toBe(false);
    expect(s.dino.vy).toBeLessThan(0);

    // Already airborne: no double jump.
    expect(startJump(s)).toBe(false);

    // A dead runner ignores input entirely.
    const dead = createState();
    dead.dead = true;
    expect(startJump(dead)).toBe(false);
    expect(dead.started).toBe(false);
  });
});

describe('DinoRun difficulty tuning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a steeper speed ramp and at least the old top speed', () => {
    expect(SPEED_RAMP).toBeGreaterThan(OLD_SPEED_RAMP);
    expect(MAX_SPEED).toBeGreaterThanOrEqual(OLD_MAX_SPEED);
  });

  it('spawns obstacles on a tighter cadence than before', () => {
    expect(GAP_MIN_START).toBeLessThan(OLD_GAP_MIN_START);
    expect(GAP_MIN_END).toBeLessThan(OLD_GAP_MIN_END);
    expect(GAP_MAX_START).toBeLessThan(OLD_GAP_MAX_START);
    expect(GAP_MAX_END).toBeLessThan(OLD_GAP_MAX_END);
  });

  it('keeps the minimum gap clearable within a single jump', () => {
    // Airtime is derived from the jump/gravity constants (~33 frames aloft).
    expect(JUMP_AIRTIME).toBeCloseTo((2 * 14.2) / 0.86, 5);
    // The hard floor exceeds airtime, and the tightest random draw respects it,
    // so two consecutive obstacles are never closer than one jump arc.
    expect(MIN_SPAWN_GAP).toBeGreaterThan(JUMP_AIRTIME);
    expect(GAP_MIN_END).toBeGreaterThanOrEqual(MIN_SPAWN_GAP);
    // Horizontal form: at top speed the closest pair is still farther apart than
    // the runner's airborne reach, so both stay jumpable (gap scales with speed).
    const jumpReach = MAX_SPEED * JUMP_AIRTIME;
    const minHorizontalGap = MAX_SPEED * GAP_MIN_END;
    expect(minHorizontalGap).toBeGreaterThan(jumpReach);
  });

  it('tightens spawn gaps as the run progresses, never below the clearable floor', () => {
    // random() -> 0 picks the lower (tightest) end of every gap range.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const s = createState();
    const gaps: number[] = [];
    let prev = s.spawnTimer;
    for (let i = 0; i < 4000; i += 1) {
      s.dino.y = -1e6;
      s.onGround = false;
      stepPhysics(s, 1);
      // A spawn resets the countdown upward; that reset value is the next gap.
      if (s.spawnTimer > prev) gaps.push(s.spawnTimer);
      prev = s.spawnTimer;
    }

    expect(gaps.length).toBeGreaterThan(8);
    const first = gaps[0];
    const last = gaps[gaps.length - 1];
    expect(last).toBeLessThan(first); // cadence tightens over distance
    expect(last).toBeLessThan(OLD_GAP_MIN_END); // tighter than the old floor (52)

    const minGap = Math.min(...gaps);
    expect(minGap).toBeGreaterThanOrEqual(MIN_SPAWN_GAP - 1e-9); // physics floor held
    expect(minGap).toBeGreaterThan(JUMP_AIRTIME); // still clearable in one jump
  });

  it('accelerates faster than the old ramp and saturates at MAX_SPEED', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const s = createState();

    // Mid-run: well before the cap, the new slope must outrun the old one.
    let guard = 0;
    while (s.distance < 8000 && guard < 5000) {
      advance(s, 1);
      guard += 1;
    }
    const expectedNew = Math.min(MAX_SPEED, BASE_SPEED + s.distance * SPEED_RAMP);
    const oldSpeed = Math.min(OLD_MAX_SPEED, BASE_SPEED + s.distance * OLD_SPEED_RAMP);
    expect(s.speed).toBeCloseTo(expectedNew, 5);
    expect(s.speed).toBeGreaterThan(oldSpeed);

    // Far enough out, speed must clamp exactly at the (raised) cap.
    guard = 0;
    while (s.distance < 40000 && guard < 20000) {
      advance(s, 1);
      guard += 1;
    }
    expect(s.speed).toBeCloseTo(MAX_SPEED, 5);
  });
});
