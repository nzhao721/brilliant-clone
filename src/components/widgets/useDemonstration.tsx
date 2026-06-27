/*
 * Shared "Show me" self-demonstration toolbox. LessonPlayer increments a
 * `demonstrate` counter; each figure watches it and, on a new value, plays a
 * one-shot animation gliding its handle to a concept-illustrating target. Exports:
 *   - useDemonstration: one-shot eased tween driver (progress 0->1)
 *   - useScalarDemonstration: tween a single numeric value (common case)
 *   - DemoPulseOverlay: highlight for read-only figures with no handle
 *   - prefersReducedMotion / easeInOut / lerp: supporting primitives
 * Inert while `demonstrate` is absent or unchanged.
 */

import { useCallback, useEffect, useRef } from 'react';

/** Default self-demo duration (ms). Kept in the 1–1.5s band the contract asks for. */
export const DEMO_DURATION_MS = 1150;

/**
 * True when the OS requests reduced motion or `matchMedia` is unavailable
 * (jsdom/SSR); callers then jump straight to the target instead of animating.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cubic ease-in-out on t in [0, 1]; pinned so f(0) = 0 and f(1) = 1 exactly. */
export function easeInOut(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/** Linear interpolation; lerp(from, to, 1) === to exactly (clean final value). */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

type DemonstrationOptions = {
  /** Tween length in ms (default DEMO_DURATION_MS). */
  durationMs?: number;
  /**
   * When false, skip the animation but still fire `onStart`/`onSettle` so the demo
   * counts as the interaction (e.g. a single-step slider).
   */
  enabled?: boolean;
  /** Fires once when a demo is triggered (capture the start state, signal interaction). */
  onStart?: () => void;
  /** Fires once when a demo finishes (or immediately for the reduced-motion jump). */
  onSettle?: () => void;
};

/**
 * One-shot, interruptible, eased demonstration driver. On each new `demonstrate`
 * value it runs `run(p)` with eased progress 0 -> 1 over ~`durationMs` via rAF,
 * ending on `run(1)`; reduced-motion/headless calls `run(1)` once. Returns
 * `cancel()` and `isRunning()`. Inert while `demonstrate` is undefined/unchanged.
 */
export function useDemonstration(
  demonstrate: number | undefined,
  run: (progress: number) => void,
  options: DemonstrationOptions = {},
): { cancel: () => void; isRunning: () => boolean } {
  /* Latest-closure refs so the rAF loop uses the current run/options without restarting. */
  const runRef = useRef(run);
  runRef.current = run;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  /* Run token; bumping it invalidates any in-flight frame loop (even if
     cancelAnimationFrame is a no-op, e.g. in tests). */
  const runIdRef = useRef(0);
  // Seed with the initial value so the very first render never triggers a demo.
  const handledRef = useRef(demonstrate);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    runningRef.current = false;
  }, []);

  useEffect(() => {
    // Only react to a genuine change of the counter (skip mount + unrelated renders).
    if (demonstrate === handledRef.current) {
      return;
    }
    handledRef.current = demonstrate;
    if (demonstrate == null) {
      return;
    }

    const { durationMs = DEMO_DURATION_MS, enabled = true, onStart, onSettle } = optionsRef.current;
    // A fresh demo always supersedes any in-flight one (re-click replays).
    cancel();
    onStart?.();

    if (!enabled) {
      onSettle?.();
      return;
    }

    if (prefersReducedMotion()) {
      runRef.current(1);
      onSettle?.();
      return;
    }

    runIdRef.current += 1;
    const myRun = runIdRef.current;
    runningRef.current = true;
    let startTime: number | null = null;
    const tick = (now: number) => {
      // A newer run (or a cancel) has superseded this loop: stop without effect.
      if (runIdRef.current !== myRun) {
        return;
      }
      if (startTime === null) {
        startTime = now;
      }
      const elapsed = now - startTime;
      const t = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 1;
      runRef.current(easeInOut(t));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        runningRef.current = false;
        onSettle?.();
      }
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [demonstrate, cancel]);

  // Abort any in-flight animation if the figure unmounts mid-demo.
  useEffect(() => cancel, [cancel]);

  return { cancel, isRunning: () => runningRef.current };
}

type ScalarDemonstrationConfig = {
  demonstrate: number | undefined;
  /** Current value of the animated control (the tween's start point). */
  value: number;
  /** Authored/default value; used as the start on a replay when value is already at target. */
  initial: number;
  /** The value that demonstrates the concept (pre-snapped/clean; reached exactly at p = 1). */
  target: number;
  /** Apply an interpolated value to the control's state. */
  apply: (value: number) => void;
  /** Skip the animation when false (still fires onInteraction). */
  enabled?: boolean;
  durationMs?: number;
  /** Quantizer for discrete controls (e.g. Math.round for an integer slider). */
  round?: (value: number) => number;
  /** Signal that the demo counts as performing the gated interaction. */
  onInteraction?: () => void;
  /** Optional hook for when the tween settles. */
  onSettle?: () => void;
};

/**
 * Common case: tween a single numeric control from its current value to `target`
 * (captured at trigger time); a replay already on target restarts from `initial`.
 */
export function useScalarDemonstration(config: ScalarDemonstrationConfig): {
  cancel: () => void;
  isRunning: () => boolean;
} {
  const configRef = useRef(config);
  configRef.current = config;
  const tweenRef = useRef({ from: config.value, to: config.target });

  return useDemonstration(
    config.demonstrate,
    (progress) => {
      const { from, to } = tweenRef.current;
      const raw = lerp(from, to, progress);
      const { round, apply } = configRef.current;
      apply(round ? round(raw) : raw);
    },
    {
      enabled: config.enabled,
      durationMs: config.durationMs,
      onSettle: () => configRef.current.onSettle?.(),
      onStart: () => {
        const current = configRef.current;
        const from =
          Math.abs(current.value - current.target) > 1e-6 ? current.value : current.initial;
        tweenRef.current = { from, to: current.target };
        current.onInteraction?.();
      },
    },
  );
}

/* All figures share a 360x220 canvas with 32px padding, so one inner-plot rectangle fits all. */
const OVERLAY_WIDTH = 360;
const OVERLAY_HEIGHT = 220;
const OVERLAY_PADDING = 32;

/**
 * Brief highlight for read-only figures with no handle: a translucent brand wash
 * whose opacity follows `pulse` (0..1). Renders nothing at rest.
 */
export function DemoPulseOverlay({
  pulse,
  width = OVERLAY_WIDTH,
  height = OVERLAY_HEIGHT,
  padding = OVERLAY_PADDING,
}: {
  pulse: number;
  width?: number;
  height?: number;
  padding?: number;
}) {
  if (!(pulse > 0)) {
    return null;
  }
  return (
    <rect
      aria-hidden="true"
      x={padding}
      y={padding}
      width={width - padding * 2}
      height={height - padding * 2}
      rx={10}
      fill="var(--brand)"
      opacity={Math.min(0.22, pulse * 0.22)}
      style={{ pointerEvents: 'none' }}
    />
  );
}

/** Triangle envelope (0 -> 1 -> 0) for a swell-and-fade pulse from eased progress. */
export function pulseEnvelope(progress: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
}
