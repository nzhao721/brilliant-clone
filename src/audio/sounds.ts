// Audio recipes for the SlopeWise sound engine — PURE DATA: the public type
// contract plus the synthesis recipe for every sound effect and music track.
// Consumed at BUILD TIME by `scripts/generate-audio.ts` (`npm run audio:gen`),
// which renders each recipe to a committed MP3 via the pure synth in `./synth`.
// The RUNTIME engine (`./SoundProvider`) never imports these recipes; it only
// loads + plays the pregenerated assets, so changing a sound is a regenerate
// step, not a runtime cost.

// Public contract — consumed VERBATIM by the per-game audio workers. Do not
// rename these or change their shape.

export type SoundEffectName =
  | 'correct' | 'incorrect' | 'xp' | 'coin' | 'lessonComplete' | 'select'
  | 'gameStart' | 'gameOver' | 'point' | 'jump' | 'land' | 'crash'
  | 'levelUp' | 'powerup' | 'rotate' | 'clearLine' | 'move' | 'click' | 'win' | 'tick';

// One distinct track per arcade game (plus the shared 'menu' bed). Each has its
// own key, tempo, timbre, and an evolving multi-section melody so it never
// sounds like a tiny loop. See `musicTracks` below for the per-game character.
export type MusicTrackName =
  | 'menu'
  | 'runner'
  | 'flappy'
  | 'slope'
  | 'serpent'
  | 'puzzle'
  | 'carnival'
  | 'tower'
  | 'pulse'
  | 'lounge';

export type ToneSpec = {
  freq: number;
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  sweepTo?: number;
};

// Recipe shapes (build-time only). Exported so the synth can interpret them.

/** A tone within an effect recipe, with an onset offset (seconds) from start. */
export type RecipeTone = ToneSpec & { at?: number };

/** A filtered white-noise burst — used for percussive/impact effects. */
export type RecipeNoise = {
  noise: true;
  at?: number;
  duration?: number;
  gain?: number;
  /** Low-pass cutoff in Hz; omit for full-band noise. */
  filterHz?: number;
};

export type RecipeStep = RecipeTone | RecipeNoise;

/** One voice of a music track: a frequency (Hz) per step, null = rest. */
export type MusicVoice = {
  type: OscillatorType;
  gain: number;
  /**
   * Note length measured in STEPS (default 0.9 → crisp notes that decay just
   * before the next step). Use >1 for sustained pads that ring across bars; the
   * renderer wraps any ring past the loop end back to the start for a seamless
   * loop.
   */
  sustain?: number;
  notes: (number | null)[];
};

export type MusicTrackSpec = {
  /** Seconds per step (tempo). */
  stepDuration: number;
  /** Layered voices, all the same length, summed into one seamless loop. */
  voices: MusicVoice[];
};

export function isNoiseStep(step: RecipeStep): step is RecipeNoise {
  return 'noise' in step;
}

// Note table (equal-tempered, A4 = 440). Named for readable recipes below.

const E2 = 82.41, F2 = 87.31, G2 = 98.0, A2 = 110.0;
const C3 = 130.81, D3 = 146.83, G3 = 196.0;
const C4 = 261.63, E4 = 329.63, G4 = 392.0, A4 = 440.0, B4 = 493.88;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0, B5 = 987.77;
const C6 = 1046.5, E6 = 1318.51;

// Effect recipes — one for EVERY SoundEffectName. Learning cues (correct,
// incorrect, xp, coin, lessonComplete, select) are deliberately soft and short;
// the arcade cues are punchier. Gains are conservative since the master volume
// scales them on top at runtime.

export const soundEffects: Record<SoundEffectName, RecipeStep[]> = {
  // `correct`/`incorrect` ship as REAL recordings, not these recipes:
  // `scripts/generate-audio.ts` copies the committed samples (a "ding" + a
  // "buzzer"; see src/audio/samples/NOTICE.md) over the synthesized output. The
  // recipes below are kept only as a fallback / to satisfy the Record contract.
  //
  // Fallback: pleasant rising two-note "ding".
  correct: [
    { freq: E5, type: 'triangle', duration: 0.12, gain: 0.32, at: 0 },
    { freq: A5, type: 'triangle', duration: 0.2, gain: 0.32, at: 0.1 },
  ],
  // Fallback: soft low buzz that sags downward.
  incorrect: [{ freq: G3, type: 'sawtooth', duration: 0.26, gain: 0.2, sweepTo: D3, at: 0 }],
  // Quick ascending arpeggio.
  xp: [
    { freq: C5, type: 'triangle', duration: 0.08, gain: 0.24, at: 0 },
    { freq: E5, type: 'triangle', duration: 0.08, gain: 0.24, at: 0.05 },
    { freq: G5, type: 'triangle', duration: 0.08, gain: 0.24, at: 0.1 },
    { freq: C6, type: 'triangle', duration: 0.14, gain: 0.24, at: 0.15 },
  ],
  // Bright two-note blip — the classic coin pickup.
  coin: [
    { freq: B5, type: 'square', duration: 0.06, gain: 0.2, at: 0 },
    { freq: E6, type: 'square', duration: 0.15, gain: 0.2, at: 0.06 },
  ],
  // Celebratory major arpeggio resolving onto a held chord.
  lessonComplete: [
    { freq: C5, type: 'triangle', duration: 0.12, gain: 0.3, at: 0 },
    { freq: E5, type: 'triangle', duration: 0.12, gain: 0.3, at: 0.12 },
    { freq: G5, type: 'triangle', duration: 0.12, gain: 0.3, at: 0.24 },
    { freq: C6, type: 'triangle', duration: 0.36, gain: 0.32, at: 0.36 },
    { freq: G5, type: 'sine', duration: 0.36, gain: 0.16, at: 0.36 },
  ],
  // Barely-there UI tick for navigation.
  select: [{ freq: A4, type: 'sine', duration: 0.05, gain: 0.12 }],
  // Punchy three-note ramp into a game.
  gameStart: [
    { freq: C4, type: 'square', duration: 0.1, gain: 0.26, at: 0 },
    { freq: G4, type: 'square', duration: 0.1, gain: 0.26, at: 0.1 },
    { freq: C5, type: 'square', duration: 0.22, gain: 0.28, sweepTo: E5, at: 0.2 },
  ],
  // Descending "aww" that bottoms out low.
  gameOver: [
    { freq: G4, type: 'sawtooth', duration: 0.18, gain: 0.28, at: 0 },
    { freq: E4, type: 'sawtooth', duration: 0.18, gain: 0.28, at: 0.16 },
    { freq: C4, type: 'sawtooth', duration: 0.42, gain: 0.28, sweepTo: A2, at: 0.32 },
  ],
  point: [{ freq: G5, type: 'square', duration: 0.08, gain: 0.26 }],
  jump: [{ freq: 330, type: 'square', duration: 0.16, gain: 0.26, sweepTo: 760 }],
  // Short low thud: a falling tone layered with a clipped noise transient.
  land: [
    { freq: 180, type: 'triangle', duration: 0.12, gain: 0.34, sweepTo: 90, at: 0 },
    { noise: true, duration: 0.08, gain: 0.16, filterHz: 400, at: 0 },
  ],
  // Impact: broadband noise burst plus a dissonant low sweep.
  crash: [
    { noise: true, duration: 0.3, gain: 0.32, filterHz: 1800, at: 0 },
    { freq: 150, type: 'sawtooth', duration: 0.3, gain: 0.22, sweepTo: 60, at: 0 },
  ],
  // Bright ascending run that pops at the top.
  levelUp: [
    { freq: C5, type: 'square', duration: 0.08, gain: 0.24, at: 0 },
    { freq: E5, type: 'square', duration: 0.08, gain: 0.24, at: 0.07 },
    { freq: G5, type: 'square', duration: 0.08, gain: 0.24, at: 0.14 },
    { freq: C6, type: 'square', duration: 0.1, gain: 0.26, at: 0.21 },
    { freq: E6, type: 'square', duration: 0.24, gain: 0.26, at: 0.31 },
  ],
  // Shimmering upward glissando.
  powerup: [
    { freq: A4, type: 'triangle', duration: 0.26, gain: 0.26, sweepTo: A5, at: 0 },
    { freq: E5, type: 'triangle', duration: 0.22, gain: 0.18, sweepTo: E6, at: 0.08 },
  ],
  rotate: [{ freq: 330, type: 'square', duration: 0.05, gain: 0.18 }],
  // Sweep up plus a bright noise sparkle, like a row vanishing.
  clearLine: [
    { freq: C5, type: 'square', duration: 0.2, gain: 0.24, sweepTo: C6, at: 0 },
    { noise: true, duration: 0.2, gain: 0.12, filterHz: 3200, at: 0 },
  ],
  move: [{ freq: 220, type: 'square', duration: 0.04, gain: 0.16 }],
  click: [{ freq: 660, type: 'square', duration: 0.04, gain: 0.16 }],
  // Triumphant five-note fanfare.
  win: [
    { freq: C5, type: 'square', duration: 0.12, gain: 0.3, at: 0 },
    { freq: E5, type: 'square', duration: 0.12, gain: 0.3, at: 0.12 },
    { freq: G5, type: 'square', duration: 0.12, gain: 0.3, at: 0.24 },
    { freq: C6, type: 'square', duration: 0.12, gain: 0.3, at: 0.36 },
    { freq: E6, type: 'square', duration: 0.32, gain: 0.32, at: 0.48 },
  ],
  tick: [{ freq: 1000, type: 'square', duration: 0.03, gain: 0.14 }],
};

// Build-time music composition toolkit. These helpers run ONLY when the
// generator imports `musicTracks` (the runtime imports types only): they turn
// terse note-name strings into the concrete frequency grids each `MusicVoice`
// needs, so an evolving multi-section track is authored as a handful of phrases.

const A4_HZ = 440;
// Semitone distance of each pitch class from A within the same octave number.
const SEMITONES_FROM_A: Record<string, number> = {
  C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4,
  'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2,
};

/** Scientific pitch name (e.g. "A4", "F#5", "Bb2") → frequency in Hz. */
function pitch(name: string): number {
  const match = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!match) {
    throw new Error(`Invalid pitch name: "${name}"`);
  }
  const semitones = SEMITONES_FROM_A[match[1]] + (Number(match[2]) - 4) * 12;
  return A4_HZ * Math.pow(2, semitones / 12);
}

/** Whitespace-separated note names → step grid; "." is a one-step rest. */
function mel(spec: string): (number | null)[] {
  return spec
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === '.' ? null : pitch(token)));
}

/** Concatenate phrases/sections into one longer line. */
function seq(...parts: (number | null)[][]): (number | null)[] {
  return ([] as (number | null)[]).concat(...parts);
}

/** Repeat a phrase `times` times. */
function rep(part: (number | null)[], times: number): (number | null)[] {
  return seq(...Array.from({ length: times }, () => part));
}

/** Transpose a phrase by `semitones` (e.g. -12 = down an octave). */
function up(part: (number | null)[], semitones: number): (number | null)[] {
  const ratio = Math.pow(2, semitones / 12);
  return part.map((freq) => (freq == null ? null : freq * ratio));
}

type BassStyle = 'drive' | 'pulse' | 'oom' | 'walk' | 'roll';

/**
 * Build a bass line from one root note name per bar (8 steps/bar). The `style`
 * picks the per-bar rhythm so different games get distinct grooves from the same
 * progression data.
 */
function bassLine(roots: string[], style: BassStyle): (number | null)[] {
  const out: (number | null)[] = [];
  for (const name of roots) {
    const root = pitch(name);
    const fifth = root * Math.pow(2, 7 / 12);
    const octave = root * 2;
    switch (style) {
      case 'drive':
        out.push(root, null, root, fifth, root, null, root, fifth);
        break;
      case 'pulse':
        out.push(root, null, null, null, root, null, null, null);
        break;
      case 'oom':
        out.push(root, null, fifth, null, root, null, fifth, null);
        break;
      case 'walk':
        out.push(root, null, fifth, null, octave, null, fifth, null);
        break;
      case 'roll':
        out.push(root, root, fifth, root, octave, root, fifth, root);
        break;
    }
  }
  return out;
}

/** One sustained pad note per bar (8 steps/bar). Pair with a high `sustain`. */
function padLine(spec: string, barSteps = 8): (number | null)[] {
  const out: (number | null)[] = [];
  for (const token of spec.trim().split(/\s+/).filter(Boolean)) {
    out.push(token === '.' ? null : pitch(token));
    for (let i = 1; i < barSteps; i += 1) {
      out.push(null);
    }
  }
  return out;
}

/** Broken-chord arpeggio: cycle each bar's chord tones across `barSteps`. */
function arpLine(chordsPerBar: string[][], barSteps = 8): (number | null)[] {
  const out: (number | null)[] = [];
  for (const chord of chordsPerBar) {
    for (let i = 0; i < barSteps; i += 1) {
      out.push(pitch(chord[i % chord.length]));
    }
  }
  return out;
}

// Music tracks — one per game (plus 'menu'). Each layers 3 voices (lead +
// accompaniment + bass) over an evolving multi-section melody, summed by the
// renderer into one seamless loop the runtime just loops. Gains are low (a quiet
// bed under the SFX). Distinct key/tempo/timbre per game:
//
//   runner   G major, fast square chiptune        → DinoRun
//   flappy   D major, light bouncy triangle        → FlappyBird
//   slope    E minor, fast aggressive synth-saw     → SlopeRun
//   serpent  C minor, hypnotic slinky groove        → Snake
//   puzzle   A minor, folk-puzzle square march      → TetrisGame
//   carnival F major, comedic oom-pah               → WhackAMole
//   tower    D minor, slow suspenseful pad build     → StackTower
//   pulse    B minor, alert electronic pulse         → ReactionTrainer
//   lounge   F major7, slow jazzy lo-fi chill        → Game2048

// Calm, welcoming C-major bed for menus/home (gentle triangle over a sine pad).
const menuTrack: MusicTrackSpec = (() => {
  const roots = ['C3', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'G2'];
  const m1 = mel('C5 . E5 . G5 . E5 . D5 . C5 . . . . .');
  const m2 = mel('E5 . G5 . A5 . G5 . E5 . D5 . C5 . . .');
  const m3 = mel('G5 . A5 . G5 . E5 . D5 . E5 . G5 . A5 .');
  const m4 = mel('G5 . E5 . D5 . C5 . A4 . G4 . . . . .');
  return {
    stepDuration: 0.3,
    voices: [
      { type: 'triangle', gain: 0.14, notes: seq(m1, m2, m3, m4) },
      { type: 'sine', gain: 0.06, sustain: 7.6, notes: padLine('E4 C4 A4 D4 E4 C4 A4 G4') },
      { type: 'sine', gain: 0.12, sustain: 3.6, notes: bassLine(roots, 'pulse') },
    ],
  };
})();

// DinoRun — driving G-major retro runner, square lead + triangle arp.
const runnerTrack: MusicTrackSpec = (() => {
  const roots = ['G2', 'E2', 'C3', 'D3', 'G2', 'E2', 'A2', 'D3'];
  const arp = arpLine([
    ['G3', 'B3', 'D4'], ['E3', 'G3', 'B3'], ['C4', 'E4', 'G4'], ['D4', 'F#4', 'A4'],
    ['G3', 'B3', 'D4'], ['E3', 'G3', 'B3'], ['A3', 'C4', 'E4'], ['D4', 'F#4', 'A4'],
  ]);
  const p1 = mel('G4 . B4 D5 G5 . D5 B4 E5 . B4 E5 G5 . E5 B4');
  const p2 = mel('C5 . E5 G5 E5 . C5 . D5 . F#5 A5 F#5 . D5 .');
  const p3 = mel('D5 . G5 D5 B4 . G4 . E5 . G5 B4 E5 . G4 .');
  const p4 = mel('A4 . C5 E5 C5 . A4 . D5 . F#5 . A5 . D5 .');
  const p5 = mel('B4 D5 G5 . F#5 . D5 . G4 B4 E5 . D5 . B4 .');
  const p6 = mel('G4 C5 E5 G5 E5 . C5 . A4 D5 F#5 A5 F#5 . D5 .');
  const p7 = mel('G5 F#5 E5 D5 B4 . G4 . B4 . E5 D5 B4 . G4 .');
  const p8 = mel('A4 C5 E5 A5 G5 . E5 . F#5 . D5 . A4 . D5 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.14,
    voices: [
      { type: 'square', gain: 0.11, notes: seq(c1, c2, up(c1, -12)) },
      { type: 'triangle', gain: 0.06, notes: rep(arp, 3) },
      { type: 'square', gain: 0.1, notes: rep(bassLine(roots, 'drive'), 3) },
    ],
  };
})();

// FlappyBird — light, bouncy D-major; soft triangle lead + square pluck arp.
const flappyTrack: MusicTrackSpec = (() => {
  const roots = ['D3', 'B2', 'G2', 'A2', 'D3', 'G2', 'A2', 'A2'];
  const arp = arpLine([
    ['D4', 'F#4', 'A4'], ['B3', 'D4', 'F#4'], ['G3', 'B3', 'D4'], ['A3', 'C#4', 'E4'],
    ['D4', 'F#4', 'A4'], ['G3', 'B3', 'D4'], ['A3', 'C#4', 'E4'], ['A3', 'C#4', 'E4'],
  ]);
  const p1 = mel('D5 . F#5 . A5 . F#5 . B4 . D5 . F#5 . D5 .');
  const p2 = mel('G4 . B4 . D5 . B4 . A4 . C#5 . E5 . C#5 .');
  const p3 = mel('A4 . D5 . F#5 . A5 . G4 . B4 . D5 . G5 .');
  const p4 = mel('A4 . C#5 . E5 . A5 . G5 . E5 . C#5 . A4 .');
  const p5 = mel('A5 . F#5 . D5 . F#5 . F#5 . D5 . B4 . F#4 .');
  const p6 = mel('D5 . B4 . G4 . B4 . C#5 . A4 . E5 . A4 .');
  const p7 = mel('F#5 . E5 . D5 . A4 . B4 . D5 . G5 . D5 .');
  const p8 = mel('E5 . A5 . C#5 . E5 . A5 . G5 . E5 . A4 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.16,
    voices: [
      { type: 'triangle', gain: 0.12, notes: seq(c1, c2, up(c1, -12)) },
      { type: 'square', gain: 0.05, notes: rep(arp, 3) },
      { type: 'sine', gain: 0.12, sustain: 3.6, notes: rep(bassLine(roots, 'pulse'), 3) },
    ],
  };
})();

// SlopeRun — fast, aggressive E-minor synthwave; saw lead + square arp.
const slopeTrack: MusicTrackSpec = (() => {
  const roots = ['E2', 'C3', 'G2', 'D3', 'E2', 'C3', 'A2', 'B2'];
  const arp = arpLine([
    ['E3', 'B3', 'E4'], ['E3', 'G3', 'C4'], ['D3', 'G3', 'B3'], ['D3', 'A3', 'D4'],
    ['E3', 'B3', 'E4'], ['E3', 'G3', 'C4'], ['A3', 'C4', 'E4'], ['B3', 'D4', 'F#4'],
  ]);
  const p1 = mel('E5 . B4 E5 G5 . E5 B4 C5 . G4 C5 E5 . C5 G4');
  const p2 = mel('D5 . G4 D5 B4 . G4 . D5 . A4 D5 F#5 . D5 A4');
  const p3 = mel('B4 E5 G5 E5 D5 . B4 . C5 E5 G5 E5 C5 . G4 .');
  const p4 = mel('A4 C5 E5 C5 A4 . E5 . B4 D#5 F#5 D#5 B4 . F#4 .');
  const p5 = mel('E5 D5 B4 G4 B4 . E5 . G5 . E5 C5 G4 . C5 .');
  const p6 = mel('G5 . D5 B4 G4 . D5 . F#5 . D5 A4 D5 . F#5 .');
  const p7 = mel('B4 . E5 . G5 . E5 . C5 . E5 . G5 . E5 .');
  const p8 = mel('A4 . E5 . C5 . A4 . F#5 . D#5 . B4 . F#4 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.12,
    voices: [
      { type: 'sawtooth', gain: 0.1, notes: seq(c1, c2, up(c1, -12), up(c2, -12)) },
      { type: 'square', gain: 0.06, notes: rep(arp, 4) },
      { type: 'sawtooth', gain: 0.1, notes: rep(bassLine(roots, 'roll'), 4) },
    ],
  };
})();

// Snake — hypnotic, slinky C-minor groove; triangle lead + square blips.
const serpentTrack: MusicTrackSpec = (() => {
  const roots = ['C3', 'Ab2', 'Bb2', 'G2', 'C3', 'Ab2', 'F2', 'G2'];
  const arp = arpLine([
    ['C4', 'Eb4', 'G4'], ['Ab3', 'C4', 'Eb4'], ['Bb3', 'D4', 'F4'], ['G3', 'Bb3', 'D4'],
    ['C4', 'Eb4', 'G4'], ['Ab3', 'C4', 'Eb4'], ['F3', 'Ab3', 'C4'], ['G3', 'Bb3', 'D4'],
  ]);
  const p1 = mel('C5 . Eb5 D5 C5 . Bb4 C5 Ab4 . C5 Eb5 C5 . Ab4 .');
  const p2 = mel('Bb4 . D5 F5 D5 . Bb4 . G4 . Bb4 D5 Bb4 . G4 .');
  const p3 = mel('G4 . C5 Eb5 G5 . Eb5 C5 Ab4 . C5 . Eb5 . C5 .');
  const p4 = mel('F4 . Ab4 C5 Ab4 . F4 . G4 . Bb4 D5 G5 . D5 .');
  const p5 = mel('Eb5 . D5 C5 G4 . C5 . Eb5 . C5 Ab4 C5 . Eb5 .');
  const p6 = mel('F5 . D5 Bb4 D5 . F5 . D5 . Bb4 G4 Bb4 . D5 .');
  const p7 = mel('C5 D5 Eb5 F5 G5 . Eb5 . C5 . Ab4 . C5 . Eb5 .');
  const p8 = mel('Ab4 . C5 . F5 . C5 . D5 . G5 . D5 . G4 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.165,
    voices: [
      { type: 'triangle', gain: 0.12, notes: seq(c1, c2, up(c1, -12)) },
      { type: 'square', gain: 0.05, notes: rep(arp, 3) },
      { type: 'sine', gain: 0.12, notes: rep(bassLine(roots, 'walk'), 3) },
    ],
  };
})();

// TetrisGame — folk-puzzle A-minor march; square lead + triangle harmony pad.
const puzzleTrack: MusicTrackSpec = (() => {
  const roots = ['A2', 'E2', 'A2', 'E2', 'D3', 'A2', 'E2', 'A2'];
  const pad = padLine('C4 B3 C4 B3 D4 C4 E4 A3');
  const p1 = mel('E5 . B4 C5 D5 . C5 B4 B4 . G#4 . E5 . B4 .');
  const p2 = mel('A4 . C5 E5 C5 . A4 . B4 . G#4 B4 E5 . B4 .');
  const p3 = mel('D5 . F5 A5 F5 . D5 . C5 . E5 A4 C5 . A4 .');
  const p4 = mel('B4 . E5 . G#4 . B4 . A4 . C5 . E5 . A4 .');
  const p5 = mel('C5 . E5 A5 E5 . C5 . B4 . G#4 . B4 . E5 .');
  const p6 = mel('E5 . D5 C5 B4 . A4 . G#4 . B4 . E5 . G#4 .');
  const p7 = mel('A4 . D5 F5 A5 . F5 D5 E5 . C5 A4 C5 . A4 .');
  const p8 = mel('E5 . G#4 B4 E5 . B4 . A4 . C5 E5 A5 . A4 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.15,
    voices: [
      { type: 'square', gain: 0.11, notes: seq(c1, c2, up(c1, -12)) },
      { type: 'triangle', gain: 0.06, sustain: 7.6, notes: rep(pad, 3) },
      { type: 'square', gain: 0.1, notes: rep(bassLine(roots, 'oom'), 3) },
    ],
  };
})();

// WhackAMole — comedic F-major carnival oom-pah; square lead + triangle pad.
const carnivalTrack: MusicTrackSpec = (() => {
  const roots = ['F2', 'C3', 'F2', 'C3', 'Bb2', 'F2', 'C3', 'F2'];
  const pad = padLine('A4 G4 A4 G4 D4 A4 G4 A4');
  const p1 = mel('F5 . A5 F5 C5 . A4 . C5 . E5 G5 E5 . C5 .');
  const p2 = mel('A4 . C5 F5 A5 . F5 . G5 . E5 C5 E5 . G5 .');
  const p3 = mel('Bb4 . D5 F5 D5 . Bb4 . A4 . C5 F5 C5 . A4 .');
  const p4 = mel('C5 . E5 G5 E5 . C5 . F5 . A5 . F5 . C5 .');
  const p5 = mel('C5 F5 A5 . G5 . F5 . G5 E5 C5 . E5 . G5 .');
  const p6 = mel('F5 . E5 . D5 . C5 . E5 . D5 . C5 . G4 .');
  const p7 = mel('Bb4 . D5 F5 A5 . F5 D5 C5 . A4 C5 F5 . C5 .');
  const p8 = mel('E5 . G5 . C5 . E5 . F5 . C5 A4 C5 . F5 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.16,
    voices: [
      { type: 'square', gain: 0.11, notes: seq(c1, c2, up(c1, -12)) },
      { type: 'triangle', gain: 0.06, sustain: 7.6, notes: rep(pad, 3) },
      { type: 'square', gain: 0.1, notes: rep(bassLine(roots, 'oom'), 3) },
    ],
  };
})();

// StackTower — slow, suspenseful D-minor build; triangle lead over a sine pad.
const towerTrack: MusicTrackSpec = (() => {
  const roots = ['D3', 'D3', 'Bb2', 'C3', 'D3', 'A2', 'Bb2', 'A2'];
  const pad = padLine('F4 F4 D4 E4 F4 E4 D4 C#4');
  const p1 = mel('D5 . . A4 . . F5 . E5 . . D5 . . A4 .');
  const p2 = mel('F5 . . D5 . . Bb4 . E5 . . C5 . . G4 .');
  const p3 = mel('A4 . D5 . F5 . A5 . E5 . C#5 . A4 . E5 .');
  const p4 = mel('Bb4 . D5 . F5 . D5 . C#5 . E5 . A4 . C#5 .');
  const p5 = mel('A4 . D5 F5 A5 . F5 . D5 . E5 . F5 . A4 .');
  const p6 = mel('Bb4 . D5 F5 D5 . Bb4 . C5 . E5 G5 E5 . C5 .');
  const p7 = mel('F5 . E5 . D5 . A4 . C#5 . E5 . A5 . E5 .');
  const p8 = mel('D5 . Bb4 . F4 . Bb4 . C#5 . A4 . E5 . A4 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.22,
    voices: [
      { type: 'triangle', gain: 0.12, notes: seq(c1, c2) },
      { type: 'sine', gain: 0.06, sustain: 7.6, notes: rep(pad, 2) },
      { type: 'sawtooth', gain: 0.09, sustain: 3.6, notes: rep(bassLine(roots, 'pulse'), 2) },
    ],
  };
})();

// ReactionTrainer — alert B-minor electronic pulse; saw stabs + square pulse.
const pulseTrack: MusicTrackSpec = (() => {
  const roots = ['B2', 'B2', 'F#2', 'F#2', 'G2', 'G2', 'F#2', 'F#2'];
  const arp = arpLine([
    ['F#4', 'B4'], ['F#4', 'B4'], ['C#4', 'F#4'], ['C#4', 'F#4'],
    ['D4', 'G4'], ['D4', 'G4'], ['C#4', 'F#4'], ['C#4', 'F#4'],
  ]);
  const p1 = mel('B4 . . D5 . . F#5 . E5 . D5 . B4 . . .');
  const p2 = mel('F#5 . . F#5 . . E5 . C#5 . A#4 . F#4 . . .');
  const p3 = mel('G5 . . F#5 . . D5 . B4 . D5 . G5 . . .');
  const p4 = mel('F#5 . . C#5 . . A#4 . F#4 . A#4 . C#5 . F#5 .');
  const p5 = mel('F#5 . D5 . B4 . F#4 . B4 . D5 . F#5 . D5 .');
  const p6 = mel('C#5 . F#5 . E5 . C#5 . A#4 . C#5 . F#5 . C#5 .');
  const p7 = mel('B4 . D5 . G5 . D5 . E5 . D5 . B4 . G4 .');
  const p8 = mel('F#5 . E5 . C#5 . A#4 . F#4 . C#5 . F#5 . F#4 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.13,
    voices: [
      { type: 'sawtooth', gain: 0.1, notes: seq(c1, c2, up(c1, -12)) },
      { type: 'square', gain: 0.06, notes: rep(arp, 3) },
      { type: 'square', gain: 0.1, notes: rep(bassLine(roots, 'drive'), 3) },
    ],
  };
})();

// Game2048 — smooth, jazzy F-major7 lo-fi chill; sine lead over a Rhodes pad.
const loungeTrack: MusicTrackSpec = (() => {
  const roots = ['F2', 'D2', 'G2', 'C3', 'F2', 'D2', 'G2', 'C3'];
  const pad = padLine('A4 F4 Bb4 E4 A4 F4 Bb4 E4');
  const p1 = mel('A4 . C5 . E5 . C5 A4 A4 . D5 . F#5 . C5 .');
  const p2 = mel('B4 . D5 . F5 . D5 B4 C5 . E5 . G5 . Bb4 .');
  const p3 = mel('C5 . E5 . A5 . G5 E5 C5 . A4 . F#5 . D5 .');
  const p4 = mel('D5 . F5 . B4 . D5 . E5 . G5 . Bb4 . C5 .');
  const p5 = mel('E5 . C5 . A4 . C5 E5 F#5 . A4 . C5 . D5 .');
  const p6 = mel('F5 . D5 . B4 . G4 . G5 . E5 . C5 . Bb4 .');
  const p7 = mel('A4 . C5 E5 G5 . E5 C5 A4 . C5 . D5 . F#5 .');
  const p8 = mel('B4 . D5 F5 D5 . B4 . C5 . Bb4 G5 E5 . C5 .');
  const c1 = seq(p1, p2, p3, p4);
  const c2 = seq(p5, p6, p7, p8);
  return {
    stepDuration: 0.26,
    voices: [
      { type: 'sine', gain: 0.13, notes: seq(c1, c2) },
      { type: 'triangle', gain: 0.07, sustain: 3.8, notes: rep(pad, 2) },
      { type: 'sine', gain: 0.12, sustain: 1.6, notes: rep(bassLine(roots, 'walk'), 2) },
    ],
  };
})();

export const musicTracks: Record<MusicTrackName, MusicTrackSpec> = {
  menu: menuTrack,
  runner: runnerTrack,
  flappy: flappyTrack,
  slope: slopeTrack,
  serpent: serpentTrack,
  puzzle: puzzleTrack,
  carnival: carnivalTrack,
  tower: towerTrack,
  pulse: pulseTrack,
  lounge: loungeTrack,
};
