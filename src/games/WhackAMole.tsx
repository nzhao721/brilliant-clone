// Whack-a-Mole (id: whack-a-mole): a self-contained React + DOM game. Nine holes
// are scattered at random each game; moles pop up for a window that shrinks over
// the round — bonk a visible one (click/tap/Enter/Space/keys 1-9) to score. A
// TIMED game, so it never calls `onGameOver`; the shell owns timer/score chrome.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameSound } from './useGameSound';
import { useSound } from '../audio/SoundProvider';

// Shared game contract, re-declared locally so this file imports nothing shared.
type GameProps = {
  active: boolean;
  onScoreChange: (score: number) => void;
  onGameOver: () => void;
};

export const HOLE_COUNT = 9;

// --- Scatter layout geometry (every value is a PERCENT of the square board) ---
// Each hole is placed by its CENTER as a percentage of the play area. The board
// is a square (aspect-ratio 1 / 1), so one percent is the same distance on both
// axes — which keeps the min-distance check below isotropic.
export const HOLE_SIZE_PCT = 15; // hole diameter
const HOLE_RADIUS_PCT = HOLE_SIZE_PCT / 2;
const HOLE_GAP_PCT = 3.5; // required breathing room between two hole rims
// Min center-to-center distance so holes never overlap or even touch (> diameter).
const HOLE_MIN_DISTANCE = HOLE_SIZE_PCT + HOLE_GAP_PCT;
const EDGE_PAD_PCT = 2; // keep a hole's rim off the board edge
const TOP_HUD_PCT = 4; // extra reserve up top so moles never hide under the HUD
// Center bounds that keep every hole fully inside the play area.
export const HOLE_BOUNDS = {
  minX: HOLE_RADIUS_PCT + EDGE_PAD_PCT,
  maxX: 100 - HOLE_RADIUS_PCT - EDGE_PAD_PCT,
  minY: HOLE_RADIUS_PCT + EDGE_PAD_PCT + TOP_HUD_PCT,
  maxY: 100 - HOLE_RADIUS_PCT - EDGE_PAD_PCT,
};
const SCATTER_ATTEMPTS = 300; // rejection-sampling tries per hole before settling

export type HolePosition = { x: number; y: number };

// Difficulty ramp (milliseconds). The "up" window and the gap between spawns
// both interpolate from the easy end to the hard end across RAMP_MS of play.
const RAMP_MS = 26000;
const UP_MAX = 1150; // how long a mole stays up at the very start
const UP_MIN = 560; // ...and once fully ramped up
const GAP_MAX = 760; // delay between spawn attempts at the start
const GAP_MIN = 420; // ...and once fully ramped up
const BONK_MS = 190; // squish animation before a bonked mole drops

// At/above this final score the round ends on the win fanfare; below it, a
// softer game-over sting.
const GOOD_ROUND_SCORE = 15;

type Mole = { token: number; phase: 'up' | 'bonk' };
type Cell = Mole | null;

const EMPTY: Cell[] = new Array(HOLE_COUNT).fill(null);
const emptyBoard = (): Cell[] => new Array(HOLE_COUNT).fill(null);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Distance from `p` to its nearest already-placed hole (Infinity when none yet).
function nearestDistance(p: HolePosition, placed: HolePosition[]): number {
  let nearest = Infinity;
  for (const q of placed) {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * Scatter HOLE_COUNT holes across the play area with rejection sampling: for
 * each hole, sample random in-bounds centers and accept the first that sits at
 * least HOLE_MIN_DISTANCE from every hole already placed. If none of
 * SCATTER_ATTEMPTS candidates clears the bar (only likely on an unlucky run), we
 * fall back to the sampled candidate with the most spacing. Either way every
 * hole is placed and stays in bounds — at worst a touch closer than the ideal
 * gap, never overlapping given how roomy the area is for nine holes.
 */
export function scatterHoles(rng: () => number = Math.random): HolePosition[] {
  const sample = (): HolePosition => ({
    x: HOLE_BOUNDS.minX + rng() * (HOLE_BOUNDS.maxX - HOLE_BOUNDS.minX),
    y: HOLE_BOUNDS.minY + rng() * (HOLE_BOUNDS.maxY - HOLE_BOUNDS.minY),
  });

  const placed: HolePosition[] = [];
  for (let h = 0; h < HOLE_COUNT; h += 1) {
    let best = sample();
    let bestSpacing = nearestDistance(best, placed);
    for (
      let attempt = 1;
      attempt < SCATTER_ATTEMPTS && bestSpacing < HOLE_MIN_DISTANCE;
      attempt += 1
    ) {
      const candidate = sample();
      const spacing = nearestDistance(candidate, placed);
      if (spacing > bestSpacing) {
        best = candidate;
        bestSpacing = spacing;
      }
    }
    placed.push(best);
  }
  return placed;
}

function MoleFace({ dazed }: { dazed: boolean }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      {/* paws resting on the lip */}
      <ellipse cx="32" cy="106" rx="13" ry="9" fill="#c9a06d" />
      <ellipse cx="88" cy="106" rx="13" ry="9" fill="#c9a06d" />
      {/* ears */}
      <circle cx="26" cy="36" r="11" fill="#7c5233" />
      <circle cx="94" cy="36" r="11" fill="#7c5233" />
      <circle cx="26" cy="36" r="5" fill="#583624" />
      <circle cx="94" cy="36" r="5" fill="#583624" />
      {/* head */}
      <ellipse cx="60" cy="64" rx="41" ry="43" fill="#9c6a40" />
      {/* muzzle */}
      <ellipse cx="60" cy="82" rx="27" ry="22" fill="#e7c79a" />
      {/* eyes (open) or dazed crosses after a bonk */}
      {dazed ? (
        <g stroke="#3a2718" strokeWidth="4.5" strokeLinecap="round">
          <line x1="37" y1="52" x2="50" y2="65" />
          <line x1="50" y1="52" x2="37" y2="65" />
          <line x1="70" y1="52" x2="83" y2="65" />
          <line x1="83" y1="52" x2="70" y2="65" />
        </g>
      ) : (
        <g>
          <circle cx="44" cy="57" r="7.5" fill="#ffffff" />
          <circle cx="76" cy="57" r="7.5" fill="#ffffff" />
          <circle cx="45.5" cy="58.5" r="3.8" fill="#241a12" />
          <circle cx="77.5" cy="58.5" r="3.8" fill="#241a12" />
        </g>
      )}
      {/* nose */}
      <ellipse cx="60" cy="74" rx="8" ry="6" fill="#45291b" />
      {/* whiskers */}
      <g stroke="#583624" strokeWidth="2" strokeLinecap="round" opacity="0.65">
        <line x1="45" y1="80" x2="22" y2="76" />
        <line x1="45" y1="84" x2="22" y2="88" />
        <line x1="75" y1="80" x2="98" y2="76" />
        <line x1="75" y1="84" x2="98" y2="88" />
      </g>
    </svg>
  );
}

// --- Satisfying "CRUNCH" hit sound (self-contained) ------------------------
// A bonk needs filtered NOISE, which the shared engine (one-shots + single
// oscillators only) can't make, so it's synthesized here on its OWN AudioContext:
// a band-passed "crack" of power-shaped white noise plus a low sine "thump". A
// safe no-op without Web Audio (jsdom/SSR); reads the shared engine's mute +
// master volume (read-only) to stay in lockstep with the user's prefs.

// Overall crunch level before the user's master volume is applied — tuned to
// sit alongside the game's other one-shot cues without clipping.
const CRUNCH_LEVEL = 0.6;
// How much of the noise pool a single crunch consumes (seconds).
const CRUNCH_DURATION = 0.16;
// Reusable white-noise pool length (seconds); longer than one crunch so a random
// start offset makes back-to-back bonks vary instead of sounding cloned.
const NOISE_POOL_SECONDS = 0.4;

// `typeof globalThis` keeps the standard `AudioContext` constructor visible
// (it lives on the global scope, not the bare `Window` interface) while the
// extra member adds the older prefixed constructor some browsers still use.
type MaybeAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const w = window as MaybeAudioWindow;
  return w.AudioContext ?? w.webkitAudioContext;
}

// A short pool of "crackle" noise. Plain white noise reads as a smooth hiss, so
// each sample is power-shaped (exponent > 1) to thin it toward sparse, peaky
// values — which the ear hears as grit/crunch rather than "shhh".
function createCrunchNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_POOL_SECONDS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    data[i] = Math.sign(white) * Math.abs(white) ** 1.7;
  }
  return buffer;
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

// Build + fire one crunch from the noise pool into `destination`, scaled by
// `level` (0..1, already mute/volume-adjusted). Self-cleaning: every node is
// disconnected once the burst ends.
function fireCrunch(
  ctx: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  level: number,
): void {
  const now = ctx.currentTime;

  const out = ctx.createGain();
  out.gain.value = Math.min(1, Math.max(0, level));
  out.connect(destination);

  // Layer 1 — the crisp "crack". A noise slice (random offset for variety),
  // high-passed to drop rumble then band-passed with a center that falls across
  // the decay so the crunch "closes" as it fades. ~5ms attack, ~120ms decay.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const offset = Math.max(0, noise.duration - CRUNCH_DURATION) * Math.random();

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 240;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.value = 0.8;
  bandpass.frequency.setValueAtTime(2600, now);
  bandpass.frequency.exponentialRampToValueAtTime(820, now + 0.11);

  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.0001, now);
  crackGain.gain.exponentialRampToValueAtTime(0.85, now + 0.005);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  src.connect(highpass).connect(bandpass).connect(crackGain).connect(out);
  src.start(now, offset);
  src.stop(now + CRUNCH_DURATION);

  // Layer 2 — the low "thump" body. A short sine dropping in pitch gives the
  // crunch weight/impact (like biting down) instead of only hissing.
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, now);
  thump.frequency.exponentialRampToValueAtTime(58, now + 0.08);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.5, now + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  thump.connect(thumpGain).connect(out);
  thump.start(now);
  thump.stop(now + 0.12);

  // The noise slice outlasts the thump, so tear everything down when it ends.
  src.onended = () => {
    safeDisconnect(src);
    safeDisconnect(highpass);
    safeDisconnect(bandpass);
    safeDisconnect(crackGain);
    safeDisconnect(thump);
    safeDisconnect(thumpGain);
    safeDisconnect(out);
  };
}

// Returns a stable `playCrunch(level)` that lazily owns a private AudioContext +
// noise pool for this game and tears them down on unmount. A safe no-op (returns
// without touching audio) when muted/silent or wherever Web Audio is missing.
function useCrunch(): (level: number) => void {
  const ctxRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);

  useEffect(
    () => () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      noiseRef.current = null;
      if (ctx) {
        void ctx.close().catch(() => undefined);
      }
    },
    [],
  );

  return useCallback((level: number) => {
    if (!(level > 0)) {
      return; // muted or silent — nothing to play
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      return; // jsdom/SSR — no Web Audio; stay silent without crashing
    }

    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        ctx = new Ctor();
      } catch {
        return;
      }
      ctxRef.current = ctx;
    }
    // The bonk that triggers this IS a user gesture, so a context the autoplay
    // policy left suspended can be resumed right here.
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    let noise = noiseRef.current;
    if (!noise) {
      try {
        noise = createCrunchNoise(ctx);
      } catch {
        return;
      }
      noiseRef.current = noise;
    }

    try {
      fireCrunch(ctx, ctx.destination, noise, level);
    } catch {
      // Audio must never break gameplay.
    }
  }, []);
}

export function WhackAMole(props: GameProps) {
  const { active } = props;

  // Stable handle, safe in the timer/event closures below.
  const sound = useGameSound(active, 'carnival');

  // The in-game crunch reads the shared engine's mute + master volume (read-only),
  // mirrored into refs so the stable `whack` closure always sees fresh values.
  const { isMuted, volume } = useSound();
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const playCrunch = useCrunch();

  // Keep the latest onScoreChange in a ref so a new function identity from the
  // parent never restarts the game-loop effect below.
  const onScoreChangeRef = useRef(props.onScoreChange);
  onScoreChangeRef.current = props.onScoreChange;

  // The board lives in a ref (the single source of truth that the autonomous
  // timer callbacks read/write) and is mirrored into state to drive renders.
  const [board, setBoard] = useState<Cell[]>(emptyBoard);
  const boardRef = useRef<Cell[]>(board);
  const commit = useCallback((next: Cell[]) => {
    boardRef.current = next;
    setBoard(next);
  }, []);

  // Scatter the holes once per mount. GameShell remounts the game on every Play
  // (via a changing `key`), so a fresh layout is generated for each session and
  // then stays put for the whole run instead of re-scattering each frame.
  const [holes] = useState<HolePosition[]>(() => scatterHoles());

  const spawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const despawnTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const bonkTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const startAt = useRef(0);
  const tokenSeq = useRef(0);
  const scoreRef = useRef(0);
  const focusedIdx = useRef(0);
  const holeButtons = useRef<(HTMLButtonElement | null)[]>([]);

  // 0 -> 1 over RAMP_MS of play; drives the shrinking windows.
  const progress = useCallback(() => {
    if (!startAt.current) return 0;
    return Math.min(1, (performance.now() - startAt.current) / RAMP_MS);
  }, []);
  const upMs = useCallback(
    () => Math.round(lerp(UP_MAX, UP_MIN, progress()) * (0.85 + Math.random() * 0.3)),
    [progress],
  );
  const gapMs = useCallback(
    () => Math.round(lerp(GAP_MAX, GAP_MIN, progress()) * (0.8 + Math.random() * 0.4)),
    [progress],
  );
  // Allow a second simultaneous mole once the player has warmed up.
  const maxActive = useCallback(() => (progress() < 0.5 ? 1 : 2), [progress]);

  const clearDespawn = useCallback((i: number) => {
    const t = despawnTimers.current.get(i);
    if (t != null) {
      clearTimeout(t);
      despawnTimers.current.delete(i);
    }
  }, []);
  const clearBonk = useCallback((i: number) => {
    const t = bonkTimers.current.get(i);
    if (t != null) {
      clearTimeout(t);
      bonkTimers.current.delete(i);
    }
  }, []);

  // One soft "missed it" cue, shared by a mole escaping unhit and a swing at an
  // empty hole. A short per-hole dedupe collapses the pointerdown+click pair a
  // single tap produces into a single cue.
  const lastMissRef = useRef({ at: Number.NEGATIVE_INFINITY, idx: -1 });
  const registerMiss = useCallback(
    (i: number) => {
      const now = performance.now();
      const last = lastMissRef.current;
      if (last.idx === i && now - last.at < 140) return;
      lastMissRef.current = { at: now, idx: i };
      sound.playEffect('incorrect');
    },
    [sound],
  );

  // A mole timed out without being hit: send it back down (a clean miss).
  const expire = useCallback(
    (i: number, token: number) => {
      despawnTimers.current.delete(i);
      const cur = boardRef.current;
      const m = cur[i];
      if (!m || m.token !== token || m.phase !== 'up') return;
      const next = cur.slice();
      next[i] = null;
      commit(next);
      // The mole ducked back down before the player could bonk it.
      registerMiss(i);
    },
    [commit, registerMiss],
  );

  // Pop a fresh mole up at a random empty hole (respecting the concurrency cap).
  const spawnOne = useCallback(() => {
    const cur = boardRef.current;
    let upCount = 0;
    const empties: number[] = [];
    for (let i = 0; i < HOLE_COUNT; i += 1) {
      if (cur[i]) upCount += 1;
      else empties.push(i);
    }
    if (upCount >= maxActive() || empties.length === 0) return;
    const i = empties[Math.floor(Math.random() * empties.length)];
    const token = (tokenSeq.current += 1);
    const next = cur.slice();
    next[i] = { token, phase: 'up' };
    commit(next);
    // A quick rising "pop" as the mole emerges. Kept soft + short since it fires
    // on every spawn.
    sound.playCustom({ freq: 320, type: 'sine', duration: 0.1, gain: 0.12, sweepTo: 640 });
    clearDespawn(i);
    despawnTimers.current.set(
      i,
      setTimeout(() => expire(i, token), upMs()),
    );
  }, [clearDespawn, commit, expire, maxActive, sound, upMs]);

  // The player bonked hole i. Only a visible ('up') mole scores.
  const whack = useCallback(
    (i: number) => {
      const cur = boardRef.current;
      const m = cur[i];
      if (!m || m.phase !== 'up') {
        // A swing that connects with nothing is a real miss only on an EMPTY
        // hole; a 'bonk'-phase cell is just the no-op follow-up click right after
        // a successful hit (pointerdown already bonked it).
        if (!m) registerMiss(i);
        return;
      }
      clearDespawn(i);
      const token = m.token;
      const next = cur.slice();
      next[i] = { token, phase: 'bonk' };
      commit(next);

      scoreRef.current += 1;
      onScoreChangeRef.current(scoreRef.current);
      // Snappy, satisfying CRUNCH on a clean hit — a crisp noise crack with a
      // little low-end thump, synthesized in this file (see fireCrunch) and
      // scaled by the shared engine's mute + master volume.
      const level = isMutedRef.current ? 0 : CRUNCH_LEVEL * (volumeRef.current ?? 1);
      playCrunch(level);

      clearBonk(i);
      bonkTimers.current.set(
        i,
        setTimeout(() => {
          bonkTimers.current.delete(i);
          const c = boardRef.current;
          const cm = c[i];
          if (cm && cm.token === token) {
            const n = c.slice();
            n[i] = null;
            commit(n);
          }
        }, BONK_MS),
      );
    },
    [clearBonk, clearDespawn, commit, playCrunch, registerMiss],
  );

  // The game loop: runs ONLY while active, fully cleaned up on active=false / unmount.
  useEffect(() => {
    if (!active) return undefined;

    // Fresh board every time a paid session starts.
    startAt.current = performance.now();
    scoreRef.current = 0;
    tokenSeq.current = 0;
    commit(emptyBoard());
    onScoreChangeRef.current(0);

    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      spawnOne();
      spawnTimer.current = setTimeout(loop, gapMs());
    };
    spawnOne(); // first mole is up the instant the session starts
    spawnTimer.current = setTimeout(loop, gapMs());

    return () => {
      cancelled = true;
      if (spawnTimer.current != null) {
        clearTimeout(spawnTimer.current);
        spawnTimer.current = null;
      }
      despawnTimers.current.forEach((t) => clearTimeout(t));
      despawnTimers.current.clear();
      bonkTimers.current.forEach((t) => clearTimeout(t));
      bonkTimers.current.clear();
      commit(emptyBoard());
    };
  }, [active, commit, gapMs, spawnOne]);

  // End-of-round sting: when the timer runs out the shell flips active true→false
  // while we stay mounted, so this fires once per finished round (win fanfare for
  // a strong score, else game-over) — never on the first activate or on unmount.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (wasActiveRef.current && !active) {
      sound.playEffect(scoreRef.current >= GOOD_ROUND_SCORE ? 'win' : 'gameOver');
    }
    wasActiveRef.current = active;
  }, [active, sound]);

  // Window-level keyboard play so number-key bonks and arrow roaming work the
  // instant a round starts (no board focus needed). Space on a focused hole is
  // left to native button activation. Bound only while active.
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;

      // Number keys 1-9 = quick-bonk that hole (numpad-style fast play).
      if (key >= '1' && key <= '9') {
        const i = Number(key) - 1;
        if (i < HOLE_COUNT) {
          event.preventDefault();
          whack(i);
        }
        return;
      }

      // Arrow keys roam focus to the nearest hole in that direction. The holes
      // are scattered (no rows/columns), so we navigate by actual position.
      let dirX = 0;
      let dirY = 0;
      if (key === 'ArrowUp') dirY = -1;
      else if (key === 'ArrowDown') dirY = 1;
      else if (key === 'ArrowLeft') dirX = -1;
      else if (key === 'ArrowRight') dirX = 1;
      else return;

      event.preventDefault();
      const from = holes[focusedIdx.current];
      if (!from) return;
      let bestIdx = -1;
      let bestScore = Infinity;
      for (let i = 0; i < holes.length; i += 1) {
        if (i === focusedIdx.current) continue;
        const dx = holes[i].x - from.x;
        const dy = holes[i].y - from.y;
        const along = dx * dirX + dy * dirY; // progress in the pressed direction
        if (along <= 0) continue; // ignore holes that are behind / off to the side
        const lateral = Math.abs(dx * dirY - dy * dirX); // sideways offset
        const score = along + lateral * 2; // favor holes straight ahead
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        focusedIdx.current = bestIdx;
        holeButtons.current[bestIdx]?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, holes, whack]);

  const cells = active ? board : EMPTY;

  return (
    <div className="wam-root">
      <style>{WAM_CSS}</style>
      <div
        className="wam-board"
        role="group"
        aria-label="Whack-a-mole. Moles pop from the holes - click, tap, or press number keys 1 to 9 to bonk them."
      >
        {cells.map((cell, i) => {
          const phase = cell ? cell.phase : 'empty';
          const up = phase === 'up';
          return (
            <button
              key={i}
              type="button"
              className="wam-hole"
              style={{ left: `${holes[i].x}%`, top: `${holes[i].y}%` }}
              data-mole={phase}
              disabled={!active}
              ref={(el) => {
                holeButtons.current[i] = el;
              }}
              aria-label={`Hole ${i + 1}${up ? ' - mole up, bonk it!' : ''}`}
              onFocus={() => {
                focusedIdx.current = i;
              }}
              onPointerDown={(event) => {
                // Fast, snappy bonk on press (covers mouse + touch). The follow-up
                // click no-ops because the mole is already in its 'bonk' phase.
                event.preventDefault();
                whack(i);
              }}
              onClick={() => whack(i)}
            >
              <span className="wam-ground" aria-hidden="true" />
              <span className="wam-pit" aria-hidden="true">
                <span className="wam-mole">
                  <MoleFace dazed={phase === 'bonk'} />
                </span>
                <span className="wam-front" />
              </span>
              <span className="wam-stars" aria-hidden="true">
                {'\u2726 \u2726'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WAM_CSS = `
.wam-root {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 6px;
  user-select: none;
}
.wam-board {
  --wam-hole: ${HOLE_SIZE_PCT}%;
  position: relative;
  width: clamp(300px, 94vw, 460px);
  aspect-ratio: 1 / 1;
  border-radius: var(--r-lg, 24px);
  background:
    radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--brand-bright, #2fd27f) 20%, transparent), transparent 62%),
    linear-gradient(180deg, var(--brand-tint, #e4f3ea), var(--brand-tint-strong, #d2ebdc));
  box-shadow: var(--shadow-md, 0 16px 44px rgba(20, 33, 46, 0.09)),
    inset 0 0 0 1px color-mix(in srgb, var(--brand, #11815a) 14%, transparent);
  touch-action: manipulation;
}
.wam-hole {
  position: absolute;
  width: var(--wam-hole);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.wam-hole:disabled {
  cursor: default;
}
.wam-ground {
  position: absolute;
  left: 0;
  right: 0;
  top: 12%;
  bottom: 2%;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--brand-bright, #2fd27f), var(--brand, #11815a) 68%, var(--brand-deep, #0b5e3f));
  box-shadow: inset 0 -8px 12px color-mix(in srgb, var(--brand-deep, #0b5e3f) 55%, transparent),
    var(--shadow-sm, 0 2px 10px rgba(20, 33, 46, 0.06));
  transition: box-shadow 0.15s ease;
}
.wam-hole:focus-visible .wam-ground {
  box-shadow: 0 0 0 3px var(--surface, #fffdf8), 0 0 0 6px color-mix(in srgb, var(--brand, #11815a) 60%, transparent);
}
.wam-pit {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 19%;
  bottom: 17%;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(125% 120% at 50% 12%, #5b3f28 0%, #432e1d 52%, #2c1e12 100%);
  box-shadow: inset 0 7px 13px rgba(0, 0, 0, 0.55), inset 0 -3px 6px rgba(0, 0, 0, 0.4);
}
.wam-mole {
  position: absolute;
  left: 6%;
  right: 6%;
  bottom: -10%;
  height: 122%;
  transform: translateY(104%);
  transition: transform 0.15s var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  will-change: transform;
}
.wam-mole svg {
  display: block;
  width: 100%;
  height: 100%;
}
.wam-hole[data-mole='up'] .wam-mole {
  transform: translateY(4%);
}
.wam-hole[data-mole='bonk'] .wam-mole {
  transform: translateY(15%) scaleX(1.08) scaleY(0.84);
  transition-duration: 0.08s;
}
.wam-front {
  position: absolute;
  left: -2%;
  right: -2%;
  bottom: -8%;
  height: 30%;
  border-radius: 50%;
  background: linear-gradient(180deg, color-mix(in srgb, var(--brand, #11815a) 76%, #06381f), var(--brand-deep, #0b5e3f));
}
.wam-stars {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-size: clamp(10px, 3vw, 16px);
  line-height: 1;
  letter-spacing: 0.12em;
  color: var(--warn, #f5b13d);
  opacity: 0;
  pointer-events: none;
}
.wam-hole[data-mole='bonk'] .wam-stars {
  animation: wam-stars 0.42s var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}
@keyframes wam-stars {
  0% { opacity: 0; transform: translateY(8px) scale(0.6); }
  35% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-12px) scale(1.08); }
}
@media (prefers-reduced-motion: reduce) {
  .wam-mole { transition: none; }
  .wam-hole[data-mole='bonk'] .wam-stars { animation: none; }
}
`;
