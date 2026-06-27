import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BALL_DEPTH,
  BALL_Y,
  BASE_SPEED,
  type Colors,
  type Course,
  DEATH_TIME,
  DEFAULT_COURSE,
  FALL_GRAVITY,
  MAX_SPEED,
  MAX_VX,
  OB_NEAR_CLIP,
  RING_BOOST_SPACING,
  ROAD_W,
  SECTION_KINDS,
  SEG,
  SPEED_RAMP,
  STEP_DROP,
  type SectionKind,
  SlopeRun,
  TRANSITION_GAP,
  bankAccelOf,
  bankSlopeOf,
  centerOf,
  centerWorldX,
  elevationOf,
  extendCourse,
  halfFactorOf,
  hasSidePillars,
  hitsObstacleBand,
  inGapAt,
  isBoostGateSeg,
  isObstacleVisible,
  isTunnelOf,
  makeCourse,
  makeState,
  obstaclesAt,
  obstaclesOf,
  sectionAt,
  tubeRingColor,
  update,
} from './SlopeRun';

// The shared sound engine is finalized in parallel and needs a real provider /
// Web Audio. Stub it so SlopeRun's `useGameSound` hook gets a no-op engine: the
// component renders without a <SoundProvider>, and the audio cues never touch
// jsdom (which has no Web Audio). `playEffect` is a shared spy (created via
// `vi.hoisted` so it exists before the hoisted `vi.mock` factory runs) so a test
// can assert exactly which one-shot cues a run fires; every other method stays a
// no-op. Cleared between tests in `afterEach`.
const { playEffect } = vi.hoisted(() => ({ playEffect: vi.fn() }));
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect,
    playCustom: () => {},
    startMusic: () => {},
    stopMusic: () => {},
    isMuted: false,
    toggleMute: () => {},
    volume: 1,
    setVolume: () => {},
  }),
}));

// jsdom doesn't implement a real canvas context, so hand back a recursive Proxy
// whose every method is a chainable no-op (covers gradients, paths, text, etc.).
// This lets the draw path run without the "Not implemented" jsdom noise.
function installFakeCanvas() {
  const handler: ProxyHandler<() => unknown> = {
    get: (_target, prop) => (prop === 'canvas' ? { width: 480, height: 600 } : () => proxy),
    set: () => true,
  };
  const proxy = new Proxy(function () {}, handler);
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(proxy as unknown as CanvasRenderingContext2D);
}

describe('SlopeRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    playEffect.mockClear();
  });

  it('mounts while inactive without starting or scoring', () => {
    installFakeCanvas();
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { getByRole, container, unmount } = render(
      <SlopeRun active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    expect(getByRole('application', { name: /slope/i })).toBeInTheDocument();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(onScoreChange).not.toHaveBeenCalled();
    expect(onGameOver).not.toHaveBeenCalled();

    unmount();
  });

  it('survives mounting with a null canvas context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { getByRole, unmount } = render(
      <SlopeRun active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    // A fresh run still zeroes the score even when there's nothing to draw on.
    expect(onScoreChange).toHaveBeenCalledWith(0);
    expect(getByRole('application', { name: /slope/i })).toBeInTheDocument();

    unmount();
  });

  it('starts a fresh run when active, advances frames, and cleans up the loop', () => {
    installFakeCanvas();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <SlopeRun active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    // A fresh run reports a zeroed score and schedules the render loop.
    expect(onScoreChange).toHaveBeenCalledWith(0);
    expect(frames.length).toBeGreaterThan(0);

    // Drive a few frames; drawing runs against the fake 2d context.
    act(() => frames[frames.length - 1](16));
    act(() => frames[frames.length - 1](32));
    act(() => frames[frames.length - 1](64));

    // The ball can't fall off or hit a block this quickly (intro is a straight).
    expect(onGameOver).not.toHaveBeenCalled();

    // Arrow steering is prevented from scrolling the page while active.
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);

    unmount();
    expect(cancel).toHaveBeenCalled();
  });

  // Clearing/advancing a terrain level used to fire a rising 'levelUp' flourish;
  // that end-of-level cue was removed. Drive a real run far enough to step down
  // onto a lower terrain level (the score ticks up on the terrain-type change)
  // and confirm the level-up cue never plays, while the run's other one-shot SFX
  // (start, and the step-down leap/land) still fire as before.
  it('advances terrain levels without playing the removed level-up cue, other SFX intact', () => {
    installFakeCanvas();
    // Pin the per-run course seed (the component XORs Math.random with Date.now)
    // so the run deterministically steps down onto a new terrain level.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(4242);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <SlopeRun active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    // The fresh run still fires its start cue (the sound wiring is intact).
    const played = (name: string): boolean => playEffect.mock.calls.some((c) => c[0] === name);
    expect(played('gameStart')).toBe(true);

    // Drive the run to its end: the ball steps down onto a lower terrain level
    // (scoring the terrain-type change) before eventually rolling out. Capped so
    // a non-terminating run can't loop forever.
    let t = 0;
    for (let i = 0; i < 2000 && onGameOver.mock.calls.length === 0; i += 1) {
      t += 16;
      act(() => frames[frames.length - 1](t));
    }

    // The run cleared a terrain level: it scored the terrain-type change and cued
    // the step-down's leap + land (all kept SFX)...
    expect(onScoreChange).toHaveBeenCalledWith(1);
    expect(played('jump')).toBe(true);
    expect(played('land')).toBe(true);
    // ...while clearing that terrain level no longer plays the level-up flourish.
    expect(played('levelUp')).toBe(false);

    unmount();
  });
});

// The simulation is a pure function of (state, dt, dir), so collision behaviour
// is tested directly against `update`/`hitsObstacleBand` rather than through the
// rAF render loop. Obstacles are a deterministic function of the (default)
// course's segment layout.
describe('SlopeRun collision', () => {
  // First procedurally-generated row that holds exactly one block AND sits on
  // benign terrain — centred, full-width, and open from the obstacle through the
  // ball's whole depth band — so the depth-judged edge check can't fire for a
  // ball parked dead-centre on the block. Returns that segment plus the lateral
  // ball position that aligns with the block (obstacle x is relative to the track
  // centreline at the obstacle's own depth).
  function findObstacle(): { seg: number; alignX: number; elevation: number } {
    for (let n = 1; n < 20000; n += 1) {
      const obs = obstaclesAt(n);
      if (obs.length !== 1) continue;
      const front = n * SEG;
      const sec = sectionAt(DEFAULT_COURSE, n);
      // Require the WHOLE ball-depth band to stay inside this one section, so the
      // ball can be parked grounded on a single (constant) level for the test.
      if (sectionAt(DEFAULT_COURSE, Math.floor((front + BALL_DEPTH + SEG) / SEG)).startSeg !== sec.startSeg) {
        continue;
      }
      let benign = true;
      for (let z = front; z <= front + BALL_DEPTH + SEG; z += SEG) {
        if (Math.abs(centerOf(DEFAULT_COURSE, z)) > 1e-6) {
          benign = false;
          break;
        }
        if (halfFactorOf(DEFAULT_COURSE, z) < 1 - 1e-9) {
          benign = false;
          break;
        }
        if (isTunnelOf(DEFAULT_COURSE, z)) {
          benign = false;
          break;
        }
      }
      if (!benign) continue;
      return { seg: n, alignX: obs[0].x + centerWorldX(front) / ROAD_W, elevation: sec.elevation };
    }
    throw new Error('no benign single-block obstacle row found');
  }

  it('hitsObstacleBand only fires while the obstacle is inside the ball depth band', () => {
    const { seg, alignX } = findObstacle();
    const front = seg * SEG;

    // Approaching but not yet reached: band ends before the obstacle's front.
    expect(hitsObstacleBand(alignX, front - 60, front - 10)).toBe(false);
    // Crossing the front this tick while laterally overlapping: a genuine hit.
    expect(hitsObstacleBand(alignX, front - 2, front + 2)).toBe(true);
    // Already scrolled past the ball: band starts beyond the obstacle's front.
    expect(hitsObstacleBand(alignX, front + 10, front + 60)).toBe(false);
  });

  it('ends the game on a genuine same-depth lateral overlap', () => {
    const { seg, alignX, elevation } = findObstacle();
    const s = makeState();
    s.playerX = alignX;
    s.ballY = elevation; // grounded on the obstacle's level (so collision is live)
    // Park the ball's collision depth (pos + BALL_DEPTH) just short of the
    // obstacle's front so this tick carries it across.
    s.pos = seg * SEG - BALL_DEPTH - 1;

    update(s, 0.01, 0);

    expect(s.over).toBe(true);
  });

  it('does not end the game for an obstacle already passed, even steering into its old column', () => {
    const { seg, alignX, elevation } = findObstacle();
    const s = makeState();
    // Sit laterally dead-centre on the obstacle's column, grounded on its level...
    s.playerX = alignX;
    s.ballY = elevation;
    // ...with the CAMERA one unit short of the obstacle's segment front, so this
    // tick the camera crosses it. The buggy build judged collisions at the camera
    // plane and would end the game here; the ball's real depth (pos + BALL_DEPTH)
    // is already a full BALL_DEPTH beyond, having scrolled past long ago.
    s.pos = seg * SEG - 1;

    update(s, 0.01, 0);

    expect(s.over).toBe(false);
  });
});

// Helpers shared by the terrain/schedule tests.
function buildCourse(seed: number, throughSeg: number): Course {
  const course = makeCourse(seed);
  extendCourse(course, throughSeg);
  return course;
}

function firstSectionOfKind(course: Course, kind: SectionKind) {
  extendCourse(course, 60000);
  const found = course.sections.find((section) => section.kind === kind);
  if (!found) throw new Error(`no ${kind} section found within the scanned span`);
  return found;
}

// The endless course is assembled from self-contained sections placed in a
// RANDOM order (seeded per run). These tests pin down that schedule.
describe('SlopeRun terrain schedule', () => {
  it('opens with a straight intro and stays contiguous (gap-free)', () => {
    const course = buildCourse(123, 800);
    expect(course.sections[0].kind).toBe('straight');
    expect(course.sections[0].startSeg).toBe(0);
    for (let i = 1; i < course.sections.length; i += 1) {
      expect(course.sections[i].startSeg).toBe(course.sections[i - 1].endSeg);
    }
    expect(sectionAt(course, 0).kind).toBe('straight');
  });

  it('orders sections randomly: reproducible per seed, varied across seeds', () => {
    const a = buildCourse(7, 1200);
    const b = buildCourse(7, 1200);
    const ka = a.sections.map((s) => s.kind);
    const kb = b.sections.map((s) => s.kind);
    expect(ka).toEqual(kb); // same seed → identical order

    const c = buildCourse(8, 1200);
    const kc = c.sections.map((s) => s.kind);
    const span = Math.min(ka.length, kc.length);
    // Different seed → a different sequence within the same span.
    expect(ka.slice(0, span)).not.toEqual(kc.slice(0, span));
  });

  it('eventually produces every section kind', () => {
    const course = buildCourse(2024, 60000);
    const kinds = new Set(course.sections.map((s) => s.kind));
    for (const kind of SECTION_KINDS) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('joins consecutive sections at the neutral state (smooth transitions)', () => {
    const course = buildCourse(99, 6000);
    const count = Math.min(course.sections.length, 80);
    for (let i = 1; i < count; i += 1) {
      const z = course.sections[i].startSeg * SEG;
      // Exactly at a seam every section is centred, standard-width, unbanked.
      expect(Math.abs(centerOf(course, z))).toBeLessThan(1e-6);
      expect(Math.abs(halfFactorOf(course, z) - 1)).toBeLessThan(1e-6);
      expect(Math.abs(bankAccelOf(course, z))).toBeLessThan(1e-6);
      // Approaching the seam from the previous section is also ~neutral.
      const zBefore = z - 0.001;
      expect(Math.abs(centerOf(course, zBefore))).toBeLessThan(0.01);
      expect(Math.abs(halfFactorOf(course, zBefore) - 1)).toBeLessThan(0.01);
    }
  });
});

describe('SlopeRun terrain effects', () => {
  it('narrows the track in a pinch and widens it in a city', () => {
    const course = makeCourse(555);
    const pinch = firstSectionOfKind(course, 'pinch');
    const pinchMid = ((pinch.startSeg + pinch.endSeg) / 2) * SEG;
    expect(halfFactorOf(course, pinchMid)).toBeLessThan(1);
    expect(halfFactorOf(course, pinchMid)).toBeGreaterThan(0.4);

    const city = firstSectionOfKind(course, 'city');
    const cityMid = ((city.startSeg + city.endSeg) / 2) * SEG;
    expect(halfFactorOf(course, cityMid)).toBeGreaterThan(1);
  });

  it('sweeps the centreline through a curve and returns to centre at the seam', () => {
    const course = makeCourse(556);
    const curve = firstSectionOfKind(course, 'curve');
    const quarter = (curve.startSeg + (curve.endSeg - curve.startSeg) * 0.25) * SEG;
    expect(Math.abs(centerOf(course, quarter))).toBeGreaterThan(50);
    expect(Math.abs(centerOf(course, curve.endSeg * SEG))).toBeLessThan(1e-6);
  });

  it('contains the ball inside a tunnel with no fall (tube walls replace edges)', () => {
    const course = makeCourse(557);
    const tunnel = firstSectionOfKind(course, 'tunnel');
    const s = makeState(course);
    // Put the ball's true depth in the middle of the tunnel, grounded on its level.
    s.pos = ((tunnel.startSeg + tunnel.endSeg) / 2) * SEG - BALL_DEPTH;
    s.ballY = elevationOf(course, s.pos + BALL_DEPTH);
    s.playerX = 6; // far outside any open track
    s.vx = 0;

    update(s, 0.016, 1); // shove further into the wall

    expect(isTunnelOf(course, s.pos + BALL_DEPTH)).toBe(true);
    expect(s.over).toBe(false); // a tunnel never lets you fall off
    const center = centerOf(course, s.pos + BALL_DEPTH) / ROAD_W;
    expect(s.playerX).toBeLessThanOrEqual(center + 0.98 + 1e-6); // stopped by the wall
    expect(s.vx).toBe(0); // and the wall kills the into-wall velocity
  });

  it('pulls the ball toward the low side on a banked slope', () => {
    const course = makeCourse(558);
    const bank = firstSectionOfKind(course, 'bank');
    const s = makeState(course);
    s.pos = ((bank.startSeg + bank.endSeg) / 2) * SEG - BALL_DEPTH;
    s.ballY = elevationOf(course, s.pos + BALL_DEPTH); // grounded on the bank

    update(s, 0.016, 0); // no steering input at all

    expect(s.vx).not.toBe(0); // the bank still accelerates the ball sideways
    expect(Math.sign(s.vx)).toBe(bank.bankDir);
    expect(s.over).toBe(false);
  });
});

// Red blocks appear in EVERY terrain kind (city densest), with clearance after
// each step-down and kept within the track so a single block is always passable.
describe('SlopeRun obstacles', () => {
  it('near-plane culls obstacles so passed blocks never flash near the camera', () => {
    // Far ahead and at the ball's depth → drawn normally (hollow red wireframe).
    expect(isObstacleVisible(BALL_DEPTH)).toBe(true);
    expect(isObstacleVisible(BALL_DEPTH * 3)).toBe(true);
    expect(isObstacleVisible(OB_NEAR_CLIP)).toBe(true); // at the clip → still drawn
    // Closer than the clip (scrolled below the ball toward the camera) → NOT drawn,
    // so the perspective divide can't blow the box up into a red flash.
    expect(isObstacleVisible(OB_NEAR_CLIP - 1)).toBe(false);
    expect(isObstacleVisible(1)).toBe(false); // right at the camera plane → culled
    // The clip sits between the camera and the ball, so it only ever culls blocks
    // that have already passed the ball — approaching obstacles are untouched.
    expect(OB_NEAR_CLIP).toBeGreaterThan(1);
    expect(OB_NEAR_CLIP).toBeLessThan(BALL_DEPTH);
  });

  it('spawns red blocks in every terrain kind, with city the densest', () => {
    const course = makeCourse(2024);
    extendCourse(course, 60000);

    const obsCount: Record<SectionKind, number> = {
      straight: 0,
      tunnel: 0,
      bank: 0,
      curve: 0,
      city: 0,
      pinch: 0,
    };
    const segCount: Record<SectionKind, number> = {
      straight: 0,
      tunnel: 0,
      bank: 0,
      curve: 0,
      city: 0,
      pinch: 0,
    };
    for (const section of course.sections) {
      for (let seg = section.startSeg; seg < section.endSeg; seg += 1) {
        segCount[section.kind] += 1;
        if (obstaclesOf(course, seg).length > 0) obsCount[section.kind] += 1;
      }
    }

    // Every kind carries obstacles — none is obstacle-free.
    for (const kind of SECTION_KINDS) {
      expect(obsCount[kind]).toBeGreaterThan(0);
    }

    // City has the highest obstacle-rows-per-segment density.
    const rates = SECTION_KINDS.map((kind) => ({ kind, rate: obsCount[kind] / segCount[kind] }));
    const densest = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
    expect(densest.kind).toBe('city');
  });

  it('leaves a clearance after each terrain change (no block right at the transition)', () => {
    const course = makeCourse(2024);
    extendCourse(course, 60000);
    for (const section of course.sections) {
      for (let local = 0; local < 3; local += 1) {
        const seg = section.startSeg + local;
        if (seg < section.endSeg) {
          expect(obstaclesOf(course, seg)).toHaveLength(0); // transition seam kept clear
        }
      }
    }
  });

  it('keeps blocks within the track through pinches (always a passable side)', () => {
    const course = makeCourse(555);
    extendCourse(course, 60000);
    let sawPinchBlock = false;
    for (const section of course.sections) {
      if (section.kind !== 'pinch') continue;
      for (let seg = section.startSeg; seg < section.endSeg; seg += 1) {
        const half = halfFactorOf(course, seg * SEG);
        for (const ob of obstaclesOf(course, seg)) {
          sawPinchBlock = true;
          // The block stays within the narrowed track, not poking past the edge.
          expect(Math.abs(ob.x)).toBeLessThanOrEqual(0.7 * half + 1e-9);
        }
      }
    }
    expect(sawPinchBlock).toBe(true); // pinches really do carry blocks
  });
});

// Banks are part of the TRACK GEOMETRY (a world-space sideways tilt), not a camera
// roll keyed to the ball, so an approaching bank is visibly tilted in the distance.
describe('SlopeRun banked geometry', () => {
  it('tilts banked track in world space, easing in/out and neutral at the seams', () => {
    const course = makeCourse(558);
    const bank = firstSectionOfKind(course, 'bank');
    const startZ = bank.startSeg * SEG;
    const midZ = ((bank.startSeg + bank.endSeg) / 2) * SEG;
    const endZ = bank.endSeg * SEG;

    expect(Math.abs(bankSlopeOf(course, midZ))).toBeGreaterThan(0.1); // clearly tilted mid-bank
    expect(Math.abs(bankSlopeOf(course, startZ))).toBeLessThan(1e-9); // flat at the entry seam
    expect(Math.abs(bankSlopeOf(course, endZ - 1))).toBeLessThan(1e-3); // ~flat at the exit seam
  });

  it('leaves non-bank terrain flat (no tilt)', () => {
    const course = makeCourse(556);
    const straight = firstSectionOfKind(course, 'straight');
    const z = ((straight.startSeg + straight.endSeg) / 2) * SEG;
    expect(bankSlopeOf(course, z)).toBe(0);
  });

  it('is a pure function of depth, so distant approaching segments already tilt', () => {
    const course = makeCourse(558);
    const bank = firstSectionOfKind(course, 'bank');
    const midZ = ((bank.startSeg + bank.endSeg) / 2) * SEG;

    // No ball/state involved — the tilt exists for the depth itself, which is why
    // a far-ahead banked segment is drawn tilted long before the ball arrives.
    const tilt = bankSlopeOf(course, midZ);
    expect(tilt).not.toBe(0);
    expect(bankSlopeOf(course, midZ)).toBe(tilt); // stable, depth-keyed

    // Tilt grows from the seam toward the crest (visible ramp-in at distance).
    const quarterZ = (bank.startSeg + (bank.endSeg - bank.startSeg) * 0.25) * SEG;
    expect(Math.abs(bankSlopeOf(course, quarterZ))).toBeLessThan(Math.abs(tilt));
    expect(Math.abs(bankSlopeOf(course, quarterZ))).toBeGreaterThan(0);
  });

  it('tilts the low side toward the downhill pull', () => {
    const course = makeCourse(558);
    const bank = firstSectionOfKind(course, 'bank');
    const midZ = ((bank.startSeg + bank.endSeg) / 2) * SEG;

    // bankAccelOf pushes toward whichever side is LOW; the geometry slope (height
    // per lateral unit, ＋x = up) must therefore have the opposite sign.
    expect(Math.sign(bankSlopeOf(course, midZ))).toBe(-Math.sign(bankAccelOf(course, midZ)));
  });
});

// Lateral controls are ACCELERATION with no friction: release keeps drifting,
// the opposite key reverses, and the speed is clamped.
describe('SlopeRun momentum steering', () => {
  it('accelerates while held, keeps drifting on release, reverses on opposite input', () => {
    const s = makeState(makeCourse(321));
    s.pos = 200; // obstacle-free straight intro, centred

    update(s, 0.1, 1); // accelerate right
    expect(s.vx).toBeGreaterThan(0);
    const vxHeld = s.vx;
    const xAfterAccel = s.playerX;

    update(s, 0.1, 0); // release: velocity is RETAINED (no friction)
    expect(s.vx).toBeCloseTo(vxHeld, 10);
    expect(s.playerX).toBeGreaterThan(xAfterAccel); // still drifting right

    update(s, 0.1, -1); // opposite input decelerates
    expect(s.vx).toBeLessThan(vxHeld);
  });

  it('clamps lateral speed to MAX_VX', () => {
    const s = makeState(makeCourse(323));
    s.pos = 100; // straight intro
    s.vx = MAX_VX; // already at the ceiling
    update(s, 0.05, 1); // accelerating further can't push past the clamp

    expect(s.over).toBe(false);
    expect(s.vx).toBeLessThanOrEqual(MAX_VX + 1e-9);
    expect(s.vx).toBeCloseTo(MAX_VX, 6);
  });
});

describe('SlopeRun forward speed ramp', () => {
  it('ramps forward speed up over time, capped at MAX_SPEED', () => {
    const s = makeState(makeCourse(11));
    s.pos = 100;
    expect(s.speed).toBe(BASE_SPEED);

    update(s, 0.5, 0);
    expect(s.speed).toBeGreaterThan(BASE_SPEED);

    s.elapsed = 100_000; // force the ramp well past its ceiling
    update(s, 0.01, 0);
    expect(s.speed).toBe(MAX_SPEED);
  });
});

// At every terrain-type change the course steps DOWN a level: the ball runs off
// the higher edge and falls (weak gravity) onto the next, lower level. Each such
// change scores exactly +1.
describe('SlopeRun step-down transitions', () => {
  function firstJumpSection(course: Course) {
    extendCourse(course, 60000);
    const sec = course.sections.find((section) => section.jumpAtStart);
    if (!sec) throw new Error('no terrain-change boundary found');
    return sec;
  }

  it('builds a descending staircase: each terrain change is one STEP_DROP lower', () => {
    const course = buildCourse(909, 60000);
    expect(STEP_DROP).toBeGreaterThan(400); // a much greater drop than before
    expect(course.sections[0].elevation).toBe(0); // the intro is the top level
    for (let i = 1; i < Math.min(course.sections.length, 200); i += 1) {
      const prev = course.sections[i - 1];
      const cur = course.sections[i];
      if (cur.jumpAtStart) {
        expect(cur.elevation).toBeCloseTo(prev.elevation - STEP_DROP, 6); // dropped a step
      } else {
        expect(cur.elevation).toBe(prev.elevation); // same-kind merge: same level
      }
      expect(cur.elevation).toBeLessThanOrEqual(prev.elevation); // never climbs
    }
    expect(course.sections[150].elevation).toBeLessThan(course.sections[0].elevation);
  });

  it('renders lower levels lower ahead (elevation is a depth-keyed track property)', () => {
    const course = makeCourse(4242);
    const boundary = firstJumpSection(course).startSeg * SEG;
    const here = elevationOf(course, boundary); // the lower (new) level
    const before = elevationOf(course, boundary - 1); // the higher level just behind
    expect(here).toBeLessThan(before); // the step goes DOWN ahead
    expect(before - here).toBeCloseTo(STEP_DROP, 6);
  });

  it('drops the ball onto the lower level under gravity (no upward velocity), scoring +1', () => {
    const course = makeCourse(4242);
    const jumpSec = firstJumpSection(course);
    const boundary = jumpSec.startSeg * SEG;
    const s = makeState(course);
    // Grounded on the higher (previous) level, a hair before the seam.
    s.pos = boundary - BALL_DEPTH - 10;
    s.ballY = elevationOf(course, s.pos + BALL_DEPTH);
    s.curSectionStart = sectionAt(course, Math.floor((s.pos + BALL_DEPTH) / SEG)).startSeg;
    const startBallY = s.ballY;
    expect(s.score).toBe(0);

    let sawFalling = false;
    let maxVy = -Infinity; // the most-upward velocity seen while falling (must stay ≤ 0)
    let landed = false;
    for (let i = 0; i < 600; i += 1) {
      update(s, 1 / 120, 0);
      const ballZ = s.pos + BALL_DEPTH;
      const ge = elevationOf(course, ballZ);
      const stillFalling = inGapAt(course, ballZ) || s.ballY > ge + 1e-6;
      if (stillFalling) {
        sawFalling = true;
        maxVy = Math.max(maxVy, s.ballVy);
      }
      const onJumpSec = sectionAt(course, Math.floor(ballZ / SEG)).startSeg === jumpSec.startSeg;
      if (!stillFalling && s.score === 1 && onJumpSec) {
        landed = true;
        break; // came to rest on the lower platform (normal collision resumes here)
      }
      expect(s.over).toBe(false); // never a false loss WHILE falling across the drop
      expect(s.dying).toBe(0); // a step-down drop is never a death fall
    }

    expect(sawFalling).toBe(true); // it left the higher level and fell
    expect(maxVy).toBeLessThanOrEqual(0); // velocity was downward only — no upward push
    expect(s.score).toBe(1); // exactly +1 for the terrain change
    expect(landed).toBe(true);
    expect(s.ballY).toBeCloseTo(jumpSec.elevation, 6); // rest height = the lower level
    expect(jumpSec.elevation).toBeLessThan(startBallY); // ...which is lower than the start
  });

  it('suspends edge/obstacle collision while falling between levels', () => {
    const course = makeCourse(4242);
    const jumpSec = firstJumpSection(course);
    const boundary = jumpSec.startSeg * SEG;
    const s = makeState(course);
    s.pos = boundary - BALL_DEPTH + 5; // already crossed onto the lower section
    s.ballY = elevationOf(course, boundary - 1); // ...but still at the higher level → falling
    s.playerX = 5; // wildly off-track: an instant edge-fall if it were grounded
    s.vx = 0;

    update(s, 1 / 120, 0);

    expect(s.ballY).toBeGreaterThan(elevationOf(course, s.pos + BALL_DEPTH)); // still airborne
    expect(s.over).toBe(false); // suspended while falling: no loss despite playerX
  });

  it('uses a slightly heavier but still floaty gravity for the descent', () => {
    expect(FALL_GRAVITY).toBeGreaterThan(1500); // heavier than the old weak 1200...
    expect(FALL_GRAVITY).toBeLessThan(2500); // ...but still not a heavy value
    // From rest, only a small fraction of a step is covered in a short time...
    const dropIn = 0.5 * FALL_GRAVITY * 0.1 * 0.1;
    expect(dropIn).toBeLessThan(STEP_DROP * 0.5);
    // ...and a full step still takes a noticeable, floaty time to fall.
    const fallTime = Math.sqrt((2 * STEP_DROP) / FALL_GRAVITY);
    expect(fallTime).toBeGreaterThan(0.35);
  });

  it('scores exactly one point per terrain change across many sections', () => {
    const course = makeCourse(909);
    extendCourse(course, 60000);
    const s = makeState(course);

    // Roll forward through many sections. To isolate the SCORING rule from the
    // hazards, keep the ball centred and "revive" it each tick — so we can verify
    // the score across MANY terrain changes regardless of obstacle luck.
    for (let i = 0; i < 8000 && s.pos + BALL_DEPTH < 40000; i += 1) {
      s.playerX = centerOf(course, s.pos + BALL_DEPTH) / ROAD_W;
      s.vx = 0;
      s.over = false;
      s.dying = 0;
      update(s, 1 / 120, 0);
    }

    const finalSeg = Math.floor((s.pos + BALL_DEPTH) / SEG);
    // Every terrain-change boundary the ball has reached should have scored once.
    const crossed = course.sections.filter(
      (section) => section.jumpAtStart && section.startSeg <= finalSeg,
    ).length;

    expect(crossed).toBeGreaterThan(3); // we really crossed several changes
    expect(s.score).toBe(crossed); // exactly +1 per change, nothing from distance
  });
});

// Neon skyscraper side pillars flank every OPEN terrain, but not enclosed tunnels.
describe('SlopeRun side pillars', () => {
  it('flanks every open terrain with pillars, but not enclosed tunnels', () => {
    expect(hasSidePillars('tunnel')).toBe(false); // tube has solid walls — no open sides
    for (const kind of SECTION_KINDS) {
      if (kind === 'tunnel') continue;
      expect(hasSidePillars(kind)).toBe(true); // straight / curve / bank / city / pinch
    }
    // The open kinds that gained pillars are present in SECTION_KINDS.
    for (const kind of ['straight', 'curve', 'bank', 'pinch', 'city'] as const) {
      expect(SECTION_KINDS).toContain(kind);
      expect(hasSidePillars(kind)).toBe(true);
    }
  });
});

// The very first section of every run is a guaranteed safe start: a flat, unbanked
// straight with NO obstacles anywhere in it, before the randomised terrain begins.
describe('SlopeRun safe start', () => {
  it('makes the whole first section a flat, obstacle-free straight for any seed', () => {
    for (const seed of [1, 7, 42, 909, 2024, 557, 4242]) {
      const course = makeCourse(seed);
      extendCourse(course, 4000); // build several sections in
      const first = course.sections[0];
      expect(first.startSeg).toBe(0);
      expect(first.kind).toBe('straight'); // a plain straight (no bank/tilt)
      expect(first.elevation).toBe(0); // top of the descending staircase

      for (let seg = first.startSeg; seg < first.endSeg; seg += 1) {
        const z = seg * SEG;
        expect(obstaclesOf(course, seg)).toHaveLength(0); // NO obstacles, across the WHOLE section
        expect(centerOf(course, z)).toBe(0); // not curved
        expect(halfFactorOf(course, z)).toBe(1); // full width (no pinch / widen)
        expect(bankSlopeOf(course, z)).toBe(0); // no visual tilt
        expect(bankAccelOf(course, z)).toBe(0); // unbanked — no downhill pull
      }

      // ...and the randomised sections begin from the second section onward.
      expect(course.sections.length).toBeGreaterThan(1);
    }
  });
});

// A small void gap sits between each pair of platforms; the ball arcs across it on
// forward momentum and ALWAYS lands on the next platform (never falls into it).
describe('SlopeRun transition gap', () => {
  function firstJumpSection(course: Course) {
    extendCourse(course, 60000);
    const sec = course.sections.find((section) => section.jumpAtStart);
    if (!sec) throw new Error('no terrain-change boundary found');
    return sec;
  }

  it('is a void right after each terrain change, then the lower platform begins', () => {
    const course = makeCourse(4242);
    const boundary = firstJumpSection(course).startSeg * SEG;
    expect(inGapAt(course, boundary + 1)).toBe(true); // just past the seam → void
    expect(inGapAt(course, boundary + TRANSITION_GAP - 1)).toBe(true);
    expect(inGapAt(course, boundary + TRANSITION_GAP + 1)).toBe(false); // platform begins
    expect(inGapAt(course, boundary - 1)).toBe(false); // the higher platform behind
  });

  it('is always cleared by forward momentum, never falling into the gap', () => {
    // Worst case is the SLOWEST forward speed (least distance covered while
    // falling). Even then the drop accrued while over the gap is a tiny fraction
    // of a full step, so the ball reaches the far platform long before it could
    // descend to the lower level — it can never bottom out over the void.
    const fallWhileOverGap = 0.5 * FALL_GRAVITY * (TRANSITION_GAP / BASE_SPEED) ** 2;
    expect(fallWhileOverGap).toBeLessThan(STEP_DROP * 0.2); // stays FAR smaller than a step

    // Simulate the slowest crossing: it arcs over the void and lands, never over.
    const course = makeCourse(4242);
    const jumpSec = firstJumpSection(course);
    const boundary = jumpSec.startSeg * SEG;
    const s = makeState(course);
    s.pos = boundary - BALL_DEPTH - 10;
    s.ballY = elevationOf(course, s.pos + BALL_DEPTH);
    s.curSectionStart = sectionAt(course, Math.floor((s.pos + BALL_DEPTH) / SEG)).startSeg;

    let wasOverGap = false;
    let landed = false;
    for (let i = 0; i < 800; i += 1) {
      update(s, 1 / 120, 0);
      const ballZ = s.pos + BALL_DEPTH;
      const ge = elevationOf(course, ballZ);
      const overGap = inGapAt(course, ballZ);
      if (overGap) wasOverGap = true;
      const stillFalling = overGap || s.ballY > ge + 1e-6;
      if (!stillFalling && s.score === 1) {
        landed = true;
        break; // landed on the next platform
      }
      expect(s.over).toBe(false); // never a game-over while arcing across the void
    }
    expect(wasOverGap).toBe(true); // it really arced over the void
    expect(landed).toBe(true); // ...and landed on the next platform
  });
});

// Rolling off the SIDE plays a brief death fall before game over; obstacle hits
// (covered by the collision suite) end immediately. Step-down drops never die.
describe('SlopeRun death fall', () => {
  it('delays game over by a ~DEATH_TIME fall that keeps moving forward, frozen otherwise', () => {
    const s = makeState(makeCourse(321));
    s.pos = 200; // obstacle-free straight intro
    s.ballY = elevationOf(s.course, s.pos + BALL_DEPTH); // grounded on the level
    s.playerX = 1.6; // off the side (|x| > half = 1) → a genuine lateral edge fall

    update(s, 1 / 60, 0); // detects the edge fall
    expect(s.dying).toBeGreaterThan(0); // the death fall has started...
    expect(s.over).toBe(false); // ...but game over has NOT fired yet

    const startPos = s.pos;
    const frozenScore = s.score;
    const frozenX = s.playerX;

    let ticks = 0;
    let prevPos = s.pos;
    while (!s.over && ticks < 200) {
      update(s, 1 / 60, 1); // steering input during the fall must be ignored
      ticks += 1;
      expect(s.pos).toBeGreaterThan(prevPos); // the world keeps scrolling FORWARD
      prevPos = s.pos;
      expect(s.score).toBe(frozenScore); // scoring still frozen
      expect(s.playerX).toBe(frozenX); // input still frozen (no lateral steer)
    }

    expect(s.over).toBe(true); // game over fires only after the fall finishes
    expect(s.pos).toBeGreaterThan(startPos); // it flew off forward, not in place
    const animTime = ticks / 60;
    expect(animTime).toBeGreaterThanOrEqual(DEATH_TIME - 1e-9);
    expect(animTime).toBeLessThanOrEqual(DEATH_TIME + 2 / 60); // ≈ the full animation
  });

  it('seeds the fall from the ball’s exact screen spot and freezes it (no first-frame pop)', () => {
    const s = makeState(makeCourse(321));
    s.pos = 200; // flat, obstacle-free intro straight (no bank)
    s.ballY = elevationOf(s.course, s.pos + BALL_DEPTH);
    s.playerX = 1.6; // off the side → a genuine lateral edge fall

    update(s, 1 / 60, 0); // detects the edge fall and seeds the death base
    expect(s.dying).toBeGreaterThan(0);

    // On a flat straight the live ball sits exactly at BALL_Y, so the fall STARTS
    // at BALL_Y too — frame one is continuous, no vertical pop. X is the live lean
    // base, also where the ball already was.
    expect(s.dyingBaseY).toBe(BALL_Y);
    expect(Number.isFinite(s.dyingBaseX)).toBe(true);

    // The base is frozen for the whole fall, so the projectile arc never drifts as
    // the world keeps scrolling beneath the dying ball.
    const baseX = s.dyingBaseX;
    const baseY = s.dyingBaseY;
    for (let i = 0; i < 6 && !s.over; i += 1) update(s, 1 / 60, 1);
    expect(s.dyingBaseX).toBe(baseX);
    expect(s.dyingBaseY).toBe(baseY);
  });
});

// Tunnel boost gates are neon-green ARCHES (feet on the road edges) with forward
// chevrons on the floor leading up to them. Passing a gate gives a temporary
// forward-speed boost that decays back to the ramp — the same trigger as before;
// only the drawn shape changed from a full ring to an arch.
describe('SlopeRun tunnel rings', () => {
  it('renders the boost arch in neon green, never the red obstacle colour', () => {
    const colors = { edge: '#3af07a', obstacle: '#ff2a4d' } as unknown as Colors;
    expect(tubeRingColor(colors)).toBe(colors.edge); // always the green edge colour
    expect(tubeRingColor(colors)).not.toBe(colors.obstacle); // never the red variant
  });

  it('draws the boost ARCH on exactly the segments that trigger the boost', () => {
    // The arch is rendered on boost-gate segments and the SAME predicate gates the
    // boost trigger, so the gateway always lines up with where the boost fires.
    expect(isBoostGateSeg(RING_BOOST_SPACING)).toBe(true);
    expect(isBoostGateSeg(RING_BOOST_SPACING * 3)).toBe(true);
    expect(isBoostGateSeg(RING_BOOST_SPACING + 1)).toBe(false); // a chevron lead-up segment
    expect(isBoostGateSeg(RING_BOOST_SPACING - 1)).toBe(false);
  });

  it('grants a forward-speed boost when the ball passes a tunnel ring', () => {
    const course = makeCourse(557);
    const tunnel = firstSectionOfKind(course, 'tunnel');
    // Find a boost-gate ring well inside the tunnel (past the void gap).
    let ring = -1;
    for (let n = tunnel.startSeg + 2; n < tunnel.endSeg - 1; n += 1) {
      if (n % RING_BOOST_SPACING === 0 && !inGapAt(course, n * SEG)) {
        ring = n;
        break;
      }
    }
    expect(ring).toBeGreaterThan(0);

    const s = makeState(course);
    s.pos = ring * SEG - BALL_DEPTH - 4; // ball's depth just before the ring
    s.ballY = elevationOf(course, s.pos + BALL_DEPTH);
    s.curSectionStart = sectionAt(course, Math.floor((s.pos + BALL_DEPTH) / SEG)).startSeg;
    expect(s.boost).toBe(0);

    update(s, 0.02, 0); // the ball crosses the ring gate
    expect(s.boost).toBeGreaterThan(0); // ...and gets a boost
    expect(s.boostPulse).toBeGreaterThan(0); // ...with a ring flash
  });

  it('lifts forward speed above the ramp, then decays back to it', () => {
    const s = makeState(makeCourse(11));
    s.pos = 100; // obstacle-free straight intro: no tunnel rings to refresh the boost
    s.ballY = 0;
    s.boost = 600; // a fresh ring boost

    update(s, 0.05, 0);
    const rampedNow = Math.min(MAX_SPEED, BASE_SPEED + s.elapsed * SPEED_RAMP);
    expect(s.boost).toBeLessThan(600); // decaying
    expect(s.boost).toBeGreaterThan(0);
    expect(s.speed).toBeGreaterThan(rampedNow); // forward speed bumped above the ramp

    for (let i = 0; i < 10; i += 1) update(s, 0.05, 0); // ~0.5s more, still no rings
    expect(s.boost).toBe(0); // boost decayed fully
    const ramped = Math.min(MAX_SPEED, BASE_SPEED + s.elapsed * SPEED_RAMP);
    expect(s.speed).toBe(ramped); // forward speed back to the plain ramp
  });
});
