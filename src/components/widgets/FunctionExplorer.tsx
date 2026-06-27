// Widget: function-explorer
//
// A general-purpose function visualiser shared by dozens of calculus questions.
// It plots a single curve (from an inline `fn` or a named `preset`) inside the
// shared 360x220 PlotFrame and layers on whichever teaching overlays the author
// enables:
//
//   • a draggable cursor that rides the curve and reads out (x, f(x));
//   • a marked input `markedX` with dashed projections to both axes and the
//     exact f(markedX) value in the caption;
//   • a draggable tangent line whose slope is read with a central difference and
//     which can extend to the x-axis to illustrate a Newton's-method step;
//   • horizontal / vertical asymptote guides;
//   • a secondary curve + the identity line y = x + labelled points, to show an
//     inverse reflected across y = x;
//   • a faint family of vertically shifted copies to illustrate the "+C" family.

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { MathText } from '../MathText';
import {
  capturePointer,
  clamp,
  createPlotScale,
  formatNumber,
  functionPath,
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  pointerToData,
  PointLabel,
  snapToStep,
  WidgetFigure,
} from './plotFrame';
import {
  DemoPulseOverlay,
  pulseEnvelope,
  useDemonstration,
  useScalarDemonstration,
} from './useDemonstration';

/** Named curves resolved when no inline `fn` is supplied. */
export type FunctionExplorerPreset =
  | 'linear'
  | 'quadratic'
  | 'cubic'
  | 'quartic'
  | 'sqrt'
  | 'reciprocal'
  | 'exp'
  | 'exp2'
  | 'ln'
  | 'log2'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'abs';

export type FunctionExplorerVisual = {
  type: 'function-explorer';
  label: string;
  /** Inline curve (general escape hatch; lesson files are .ts so inline fns are allowed). */
  fn?: (x: number) => number;
  /** Named curve used when `fn` is omitted. */
  preset?: FunctionExplorerPreset;
  /** Visible window. y auto-fits to the curve when yMin/yMax are omitted. */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  /** Draggable (x, f(x)) readout point (default true). */
  showCursor?: boolean;
  initialX?: number;
  /** Highlight a specific input and read the exact f(markedX). */
  markedX?: number;
  /** Draggable tangent line + slope readout. */
  showTangent?: boolean;
  tangentAtX?: number;
  /** Extend the tangent to the x-axis and mark the intercept (Newton's method). */
  extendTangentToAxis?: boolean;
  /** Dashed asymptote guides. */
  asymptotes?: { horizontal?: number[]; vertical?: number[] };
  /** Inverse overlay: a second curve, the mirror line y = x, and labelled points. */
  secondaryFn?: (x: number) => number;
  showIdentityLine?: boolean;
  markedPoints?: Array<{ x: number; y: number; label?: string }>;
  /** Faint vertically shifted copies of the base curve to illustrate "+C". */
  constantFamily?: number[];
  /**
   * A jump / removable discontinuity. The draggable cursor SNAPS up to
   * (x, value) when it gets near x, an open hole is drawn where the curve would
   * have been (x, holeY), and a filled dot marks the true value (x, value).
   * Used for "limit vs value" graphs where f(x) heads to holeY but f(x) = value.
   */
  holePoint?: { x: number; value: number; holeY: number };
};

type PresetSpec = {
  fn: (x: number) => number;
  /** KaTeX source for f(x). */
  tex: string;
  /** Plain-text mirror for the SVG aria description. */
  plain: string;
};

const PRESETS: Record<FunctionExplorerPreset, PresetSpec> = {
  linear: { fn: (x) => x, tex: 'x', plain: 'x' },
  quadratic: { fn: (x) => x * x, tex: 'x^2', plain: 'x^2' },
  cubic: { fn: (x) => x * x * x, tex: 'x^3', plain: 'x^3' },
  quartic: { fn: (x) => x * x * x * x, tex: 'x^4', plain: 'x^4' },
  sqrt: { fn: (x) => Math.sqrt(x), tex: '\\sqrt{x}', plain: 'sqrt(x)' },
  reciprocal: { fn: (x) => 1 / x, tex: '\\dfrac{1}{x}', plain: '1/x' },
  exp: { fn: (x) => Math.exp(x), tex: 'e^{x}', plain: 'e^x' },
  exp2: { fn: (x) => Math.pow(2, x), tex: '2^{x}', plain: '2^x' },
  ln: { fn: (x) => Math.log(x), tex: '\\ln x', plain: 'ln(x)' },
  log2: { fn: (x) => Math.log2(x), tex: '\\log_2 x', plain: 'log2(x)' },
  sin: { fn: (x) => Math.sin(x), tex: '\\sin x', plain: 'sin(x)' },
  cos: { fn: (x) => Math.cos(x), tex: '\\cos x', plain: 'cos(x)' },
  tan: { fn: (x) => Math.tan(x), tex: '\\tan x', plain: 'tan(x)' },
  abs: { fn: (x) => Math.abs(x), tex: '|x|', plain: '|x|' },
};

const COLOR_SECONDARY = 'var(--info)';
const COLOR_CURSOR = 'var(--accent)';
const COLOR_TANGENT = 'var(--warn)';
const COLOR_FAINT = '#c9d2dc';
const COLOR_GUIDE = '#8b95a3';

/** Pill style for the "which curve to show" toggle buttons. */
function toggleStyle(active: boolean, color: string): CSSProperties {
  return {
    fontSize: '0.8rem',
    fontWeight: 700,
    padding: '2px 10px',
    borderRadius: 999,
    border: `1.5px solid ${color}`,
    color: active ? 'var(--surface)' : color,
    background: active ? color : 'transparent',
    cursor: 'pointer',
    lineHeight: 1.4,
  };
}

/** Resolve the curve: inline `fn` wins, else the named preset, else identity. */
function resolveFn(visual: FunctionExplorerVisual): (x: number) => number {
  if (visual.fn) {
    return visual.fn;
  }
  if (visual.preset) {
    return PRESETS[visual.preset].fn;
  }
  return (x) => x;
}

/** Value at percentile `p` (0..1) of an ascending-sorted array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) {
    return 0;
  }
  const index = clamp(Math.round(p * (sortedAsc.length - 1)), 0, sortedAsc.length - 1);
  return sortedAsc[index];
}

/**
 * Auto-fit a y-window to the supplied functions across [xMin, xMax]. Non-finite
 * samples (reciprocal / tan / ln / sqrt domains) are skipped, and a 2nd–98th
 * percentile band tames the spikes near vertical asymptotes so one blow-up can't
 * crush the rest of the curve into a flat line.
 */
function autoFitY(fns: Array<(x: number) => number>, xMin: number, xMax: number): { yMin: number; yMax: number } {
  const ys: number[] = [];
  const samples = 240;
  for (const fn of fns) {
    for (let i = 0; i <= samples; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      const y = fn(x);
      if (Number.isFinite(y)) {
        ys.push(y);
      }
    }
  }
  if (ys.length === 0) {
    return { yMin: -5, yMax: 5 };
  }
  ys.sort((a, b) => a - b);
  let lo = percentile(ys, 0.02);
  let hi = percentile(ys, 0.98);
  if (!(hi > lo)) {
    lo = ys[0];
    hi = ys[ys.length - 1];
  }
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  return { yMin: lo - pad, yMax: hi + pad };
}

/** Central-difference slope, with a one-sided fallback near a domain edge. */
function slopeAt(fn: (x: number) => number, x: number, h: number): number {
  const right = fn(x + h);
  const left = fn(x - h);
  if (Number.isFinite(right) && Number.isFinite(left)) {
    return (right - left) / (2 * h);
  }
  const here = fn(x);
  if (Number.isFinite(right) && Number.isFinite(here)) {
    return (right - here) / h;
  }
  if (Number.isFinite(left) && Number.isFinite(here)) {
    return (here - left) / h;
  }
  return NaN;
}

export function FunctionExplorer({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: FunctionExplorerVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const reactId = useId();
  const clipId = `fx-clip-${reactId.replace(/:/g, '')}`;

  const fn = resolveFn(visual);
  const presetSpec = !visual.fn && visual.preset ? PRESETS[visual.preset] : null;

  const showCursor = visual.showCursor ?? true;
  const showTangent = visual.showTangent ?? false;
  const secondaryFn = visual.secondaryFn;
  // Inverse mode = a function, its inverse, and the y = x mirror together. It
  // drives the two linked draggable dots: drag one and its mirror image moves
  // along the other curve, showing f(a) = b <=> f^{-1}(b) = a.
  const inverseMode = secondaryFn != null && visual.showIdentityLine === true;
  const effectiveShowCursor = showCursor && !inverseMode;

  // --- Window ---------------------------------------------------------------
  const xLo = Math.min(visual.xMin ?? -5, visual.xMax ?? 5);
  const xHiRaw = Math.max(visual.xMin ?? -5, visual.xMax ?? 5);
  const xHi = xHiRaw - xLo < 1e-9 ? xLo + 1 : xHiRaw;

  let yLo: number;
  let yHi: number;
  if (visual.yMin != null && visual.yMax != null) {
    yLo = Math.min(visual.yMin, visual.yMax);
    yHi = Math.max(visual.yMin, visual.yMax);
  } else {
    const fit = autoFitY(secondaryFn ? [fn, secondaryFn] : [fn], xLo, xHi);
    yLo = visual.yMin ?? fit.yMin;
    yHi = visual.yMax ?? fit.yMax;
    if (yHi < yLo) {
      [yLo, yHi] = [yHi, yLo];
    }
  }
  if (yHi - yLo < 1e-9) {
    yHi = yLo + 1;
  }

  const scale = createPlotScale({ xMin: xLo, xMax: xHi, yMin: yLo, yMax: yHi });
  const midX = (xLo + xHi) / 2;

  // Resolve a starting x whose point is actually ON the visible curve, so a
  // draggable handle always renders. Falls back to scanning outward when the
  // requested x is undefined/off-screen (e.g. the default centre x = 0 for
  // sin(x)/x, which is 0/0 and would otherwise leave no dot to grab).
  const startFromX = (preferred: number): number => {
    const p = clamp(preferred, xLo, xHi);
    const onScreen = (x: number) => {
      const y = fn(x);
      return Number.isFinite(y) && y >= yLo && y <= yHi;
    };
    if (onScreen(p)) {
      return p;
    }
    const samples = 96;
    const dx = (xHi - xLo) / samples;
    for (let i = 1; i <= samples; i += 1) {
      if (p + i * dx <= xHi && onScreen(p + i * dx)) {
        return p + i * dx;
      }
      if (p - i * dx >= xLo && onScreen(p - i * dx)) {
        return p - i * dx;
      }
    }
    return p;
  };

  // --- Self-demonstration seeds --------------------------------------------
  // Each "Show me" glides the ANIMATED handle to the feature that illustrates
  // the concept (the cursor onto a hole / marked input / telling x, or the
  // tangent point to tangentAtX). If the authored start already sits on that
  // feature the glide would be invisible, so in a Show-me context (demonstrate
  // defined, i.e. a concept slide) we seed that handle a clear step AWAY from
  // its target. The demo target itself is unchanged, and questions / previews
  // (no demonstrate) keep their authored start exactly as before.
  const holePoint = visual.holePoint;
  const markedXRaw = visual.markedX;
  const markedYRaw = markedXRaw != null ? fn(markedXRaw) : null;
  const showMarked = markedXRaw != null && markedYRaw != null && Number.isFinite(markedYRaw);
  const animateCursor = effectiveShowCursor || inverseMode;
  const animateTangent = !animateCursor && showTangent;
  const demoMeaningfulX = clamp(xLo + (xHi - xLo) * 0.72, xLo, xHi);
  const rawCursorTarget = snapToStep(
    clamp(holePoint ? holePoint.x : showMarked ? (markedXRaw as number) : demoMeaningfulX, xLo, xHi),
  );
  const rawTangentTarget = snapToStep(clamp(visual.tangentAtX ?? demoMeaningfulX, xLo, xHi));
  const inDemoContext = demonstrate != null;
  const seedAwayFromTarget = (requested: number, target: number, guard: boolean): number => {
    if (!guard) {
      return requested;
    }
    const span = xHi - xLo || 1;
    // Already a clearly visible distance from the target: keep the authored start.
    if (Math.abs(requested - target) > span * 0.08) {
      return requested;
    }
    const candidate = xHi - target >= target - xLo ? target + span * 0.4 : target - span * 0.4;
    return startFromX(clamp(candidate, xLo, xHi));
  };
  const cursorSeed = seedAwayFromTarget(
    startFromX(visual.initialX ?? midX),
    rawCursorTarget,
    inDemoContext && animateCursor,
  );
  const tangentSeed = seedAwayFromTarget(
    startFromX(visual.tangentAtX ?? midX),
    rawTangentTarget,
    inDemoContext && animateTangent,
  );

  // --- Draggable state ------------------------------------------------------
  const [cursorX, setCursorX] = useState(() => cursorSeed);
  const [tangentX, setTangentX] = useState(() => tangentSeed);
  const [activeDrag, setActiveDrag] = useState<'cursor' | 'tangent' | 'inverse' | null>(null);
  // Which of the two curves are visible (only meaningful when secondaryFn is set).
  const [showPrimary, setShowPrimary] = useState(true);
  const [showSecondary, setShowSecondary] = useState(true);

  // Interaction gating: signal completion once the learner performs a *real*
  // drag (value moves past a tiny threshold) of either handle, or nudges one
  // with the keyboard. Guarded so the callback fires at most once.
  const interactionFiredRef = useRef(false);
  const dragStartXRef = useRef<number | null>(null);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Follow the author's seeds if they change on a mounted instance (kept clear
  // of the demo target in a Show-me context, exactly like the initial seed).
  useEffect(() => {
    setCursorX(cursorSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual.initialX, xLo, xHi]);
  useEffect(() => {
    setTangentX(tangentSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual.tangentAtX, xLo, xHi]);

  const safeCursorX = clamp(cursorX, xLo, xHi);
  const cursorY = fn(safeCursorX);

  // Jump discontinuity: once the cursor is within a snap band of holePoint.x, it
  // leaves the curve and lands on the true value (x, value) instead of holeY.
  const holeSnapped =
    holePoint != null && Math.abs(safeCursorX - holePoint.x) <= (xHi - xLo) / 40;
  const shownCursorX = holeSnapped && holePoint ? holePoint.x : safeCursorX;
  const shownCursorY = holeSnapped && holePoint ? holePoint.value : cursorY;

  const safeTangentX = clamp(tangentX, xLo, xHi);
  const tangentY = fn(safeTangentX);
  const slope = slopeAt(fn, safeTangentX, Math.max((xHi - xLo) / 2000, 1e-4));
  const tangentLineY = (x: number) => tangentY + slope * (x - safeTangentX);
  const xIntercept =
    showTangent && visual.extendTangentToAxis && Number.isFinite(slope) && Math.abs(slope) > 1e-9
      ? safeTangentX - tangentY / slope
      : null;

  // Keep an on-curve handle from leaving the visible window. If f(targetX) would
  // fall outside [yLo, yHi], stop at the screen edge (the furthest x toward the
  // target whose point is still on-screen) instead of letting the dot detach and
  // slide along the top/bottom border.
  const clampToVisible = (targetX: number, fromX: number): number => {
    const t = clamp(targetX, xLo, xHi);
    const onScreen = (x: number) => {
      const y = fn(x);
      return Number.isFinite(y) && y >= yLo && y <= yHi;
    };
    if (onScreen(t) || !onScreen(fromX)) {
      return t;
    }
    let visible = fromX;
    let hidden = t;
    for (let i = 0; i < 24; i += 1) {
      const mid = (visible + hidden) / 2;
      if (onScreen(mid)) {
        visible = mid;
      } else {
        hidden = mid;
      }
    }
    return visible;
  };

  // --- Self-demonstration ---------------------------------------------------
  // Glide the animated handle to the feature that illustrates the concept (the
  // cursor onto a hole / marked input / telling x, or the tangent to tangentAtX),
  // clamped so it never leaves the visible curve. A read-only figure (no handle)
  // just plays a brief highlight pulse. Either way it counts as the interaction.
  // The seed above starts the handle clear of this target so the glide is visible.
  const cursorDemoTarget = clampToVisible(rawCursorTarget, safeCursorX);
  const tangentDemoTarget = clampToVisible(rawTangentTarget, safeTangentX);
  const [demoPulse, setDemoPulse] = useState(0);
  const demo = useScalarDemonstration({
    demonstrate,
    value: animateCursor ? safeCursorX : safeTangentX,
    initial: animateCursor ? cursorSeed : tangentSeed,
    target: animateCursor ? cursorDemoTarget : tangentDemoTarget,
    apply: animateCursor ? setCursorX : setTangentX,
    enabled: animateCursor || animateTangent,
    onInteraction: fireInteractionComplete,
  });
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    enabled: !animateCursor && !animateTangent,
  });

  // --- Pointer + keyboard ---------------------------------------------------
  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!activeDrag) {
      return;
    }
    // Snap the dragged x onto the 0.1 grid the instant it leaves pointer space,
    // before any clamping, so the dot AND the (x, f(x)) readout land on a clean
    // tenth. clampToVisible still stops the handle at the screen edge afterward.
    const pointerX = snapToStep(pointerToData(event, scale).x);
    const next = clamp(pointerX, xLo, xHi);
    if (activeDrag === 'cursor') {
      setCursorX(clampToVisible(next, safeCursorX));
    } else if (activeDrag === 'inverse' && secondaryFn) {
      // Dragging the inverse dot Q (at horizontal position b) sets a = f^{-1}(b),
      // so the partner dot P follows along f and the reflection stays exact.
      setCursorX(clamp(secondaryFn(clamp(pointerX, yLo, yHi)), xLo, xHi));
    } else {
      setTangentX(clampToVisible(next, safeTangentX));
    }
    const start = dragStartXRef.current;
    if (start != null && Math.abs(next - start) > (xHi - xLo) / 100) {
      fireInteractionComplete();
    }
  }
  const stopDrag = () => setActiveDrag(null);

  function makeNudge(setX: (updater: (prev: number) => number) => void) {
    return (event: KeyboardEvent<SVGCircleElement>) => {
      const step = 0.1;
      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowDown'
      ) {
        demo.cancel();
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        setX((prev) => clampToVisible(clamp(snapToStep(prev + step), xLo, xHi), prev));
        fireInteractionComplete();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        setX((prev) => clampToVisible(clamp(snapToStep(prev - step), xLo, xHi), prev));
        fireInteractionComplete();
      }
    };
  }

  // --- Caption readouts -----------------------------------------------------
  // Every readout is rendered as KaTeX via <MathText> (the numeric values still
  // come from formatNumber) so the math reads as math (e.g. f(2) = 5, f^{-1}(…),
  // (x, y)) rather than ambiguous plain text. Colour-carrying readouts keep their
  // colour on the wrapper span; KaTeX inherits currentColor.
  const readouts: ReactNode[] = [];
  if (presetSpec) {
    readouts.push(<MathText key="fx" text={`$f(x) = ${presetSpec.tex}$`} />);
  }
  if (inverseMode) {
    readouts.push(
      <span key="inv-f" style={{ color: COLOR_CURSOR }}>
        <MathText text={`$f(${formatNumber(safeCursorX)}) = ${formatNumber(cursorY)}$`} />
      </span>,
    );
    readouts.push(
      <span key="inv-g" style={{ color: COLOR_SECONDARY }}>
        <MathText text={`$f^{-1}(${formatNumber(cursorY)}) = ${formatNumber(safeCursorX)}$`} />
      </span>,
    );
  } else if (showCursor) {
    readouts.push(
      <span key="cursor">
        <MathText text={`$f(${formatNumber(shownCursorX)}) = ${formatNumber(shownCursorY)}$`} />
      </span>,
    );
  }
  if (showMarked) {
    readouts.push(
      <span key="marked">
        <MathText text={`$f(${formatNumber(markedXRaw as number)}) = ${formatNumber(markedYRaw as number)}$`} />
      </span>,
    );
  }
  if (showTangent && Number.isFinite(slope)) {
    readouts.push(
      <span key="slope">
        slope <MathText text={`$f'(${formatNumber(safeTangentX)}) = ${formatNumber(slope)}$`} />
      </span>,
    );
    if (xIntercept != null) {
      readouts.push(
        <span key="intercept">
          <MathText text={`$x\\text{-intercept} = ${formatNumber(xIntercept)}$`} />
        </span>,
      );
    }
  }

  // Reserve only the caption lines the readouts actually need. A short one- or
  // two-readout caption (e.g. "f(2) = 4 | f(2) = 4") never wraps, so it holds a
  // single line and the dead space between the readout and the plot disappears;
  // three or more readouts (preset + cursor + marked + slope + intercept) can
  // wrap, so they keep two. Either way the block is height-locked, so a value
  // changing width as the learner drags still can't reflow the SVG.
  const captionLineCount = inverseMode ? 2 : readouts.length >= 3 ? 2 : 1;

  const instruction = inverseMode
    ? 'Drag either dot - its mirror image moves to the matching point on the other curve.'
    : showCursor
      ? 'Drag the point along the curve to read (x, f(x)).'
      : showTangent
        ? 'Drag the tangent point along the curve to read the slope.'
        : undefined;

  const fnDesc = presetSpec ? `f(x) = ${presetSpec.plain}` : 'a function';
  const ariaLabel =
    `Graph of ${fnDesc} for x from ${formatNumber(xLo)} to ${formatNumber(xHi)}.` +
    (showCursor ? ` Draggable cursor at x = ${formatNumber(shownCursorX)}, f(x) = ${formatNumber(shownCursorY)}.` : '') +
    (showTangent && Number.isFinite(slope)
      ? ` Tangent at x = ${formatNumber(safeTangentX)} has slope ${formatNumber(slope)}.`
      : '') +
    (showMarked ? ` Marked f(${formatNumber(markedXRaw as number)}) = ${formatNumber(markedYRaw as number)}.` : '');

  // --- Geometry helpers -----------------------------------------------------
  const axisYPx = scale.toSvgY(clamp(0, yLo, yHi));
  const axisXPx = scale.toSvgX(clamp(0, xLo, xHi));

  const cursorPx = scale.toSvgX(shownCursorX);
  const cursorPy = Number.isFinite(shownCursorY)
    ? clamp(scale.toSvgY(shownCursorY), PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING)
    : null;

  // Inverse mode: dot Q is the reflection of P = (a, f(a)) across y = x, i.e.
  // (f(a), a). It rides the inverse curve and stays linked to the same state.
  const invQpx = scale.toSvgX(clamp(cursorY, xLo, xHi));
  const invQpy = Number.isFinite(cursorY)
    ? clamp(scale.toSvgY(clamp(safeCursorX, yLo, yHi)), PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING)
    : null;

  const tangentPx = scale.toSvgX(safeTangentX);
  const tangentPy = Number.isFinite(tangentY)
    ? clamp(scale.toSvgY(tangentY), PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING)
    : null;

  const markedPx = showMarked ? scale.toSvgX(clamp(markedXRaw as number, xLo, xHi)) : 0;
  const markedPy = showMarked ? scale.toSvgY(clamp(markedYRaw as number, yLo, yHi)) : 0;

  const idLo = Math.max(xLo, yLo);
  const idHi = Math.min(xHi, yHi);

  // "Show which curve" toggle, only when there are two curves to choose between.
  // It lives on its own constant-height row ABOVE the plot (not inline with the
  // changing readouts) so toggling — which only swaps button colours — can never
  // reflow the figure, and the pills never crowd the live coordinate readouts.
  const secondaryLabel = inverseMode ? 'f\u207B\u00B9' : 'g';
  const curveToggle = secondaryFn ? (
    <div className="widget-toggle-row" role="group" aria-label="Show or hide each curve">
      <button
        type="button"
        aria-pressed={showPrimary}
        onClick={() => setShowPrimary((p) => (p && showSecondary ? false : true))}
        style={toggleStyle(showPrimary, COLOR_CURSOR)}
      >
        f
      </button>
      <button
        type="button"
        aria-pressed={showSecondary}
        onClick={() => setShowSecondary((s) => (s && showPrimary ? false : true))}
        style={toggleStyle(showSecondary, COLOR_SECONDARY)}
      >
        {secondaryLabel}
      </button>
    </div>
  ) : null;

  return (
    <WidgetFigure
      label={visual.label}
      // Reserve lines to match the actual readout count (see captionLineCount):
      // short captions hold one line and stop wasting space above the plot, while
      // multi-readout captions keep two so a wrap can never shake the figure.
      captionLines={captionLineCount}
      caption={
        readouts.length > 0 ? (
          <>
            {readouts.map((node, index) => (
              <Fragment key={index}>
                {index > 0 ? <span className="widget-readout-sep" aria-hidden="true" /> : null}
                {node}
              </Fragment>
            ))}
          </>
        ) : undefined
      }
      instruction={instruction}
    >
      {curveToggle}
      <PlotFrame
        scale={scale}
        ariaLabel={ariaLabel}
        onPointerMove={updateFromPointer}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
        onPointerCancel={stopDrag}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={PLOT_PADDING}
              y={PLOT_PADDING}
              width={PLOT_WIDTH - PLOT_PADDING * 2}
              height={PLOT_HEIGHT - PLOT_PADDING * 2}
            />
          </clipPath>
        </defs>

        {/* Asymptote guides. */}
        {(visual.asymptotes?.horizontal ?? []).map((y, index) =>
          y >= yLo && y <= yHi ? (
            <line
              key={`ah-${index}`}
              aria-hidden="true"
              x1={PLOT_PADDING}
              y1={scale.toSvgY(y)}
              x2={PLOT_WIDTH - PLOT_PADDING}
              y2={scale.toSvgY(y)}
              stroke={COLOR_GUIDE}
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
          ) : null,
        )}
        {(visual.asymptotes?.vertical ?? []).map((x, index) =>
          x >= xLo && x <= xHi ? (
            <line
              key={`av-${index}`}
              aria-hidden="true"
              x1={scale.toSvgX(x)}
              y1={PLOT_PADDING}
              x2={scale.toSvgX(x)}
              y2={PLOT_HEIGHT - PLOT_PADDING}
              stroke={COLOR_GUIDE}
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
          ) : null,
        )}

        {/* Mirror line y = x for inverse overlays. */}
        {visual.showIdentityLine && idLo < idHi ? (
          <line
            aria-label="identity line y = x"
            x1={scale.toSvgX(idLo)}
            y1={scale.toSvgY(idLo)}
            x2={scale.toSvgX(idHi)}
            y2={scale.toSvgY(idHi)}
            stroke={COLOR_GUIDE}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        ) : null}

        {/* Faint "+C" family behind the main curve. */}
        <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
          {(visual.constantFamily ?? []).map((c, index) => (
            <path
              key={`family-${index}`}
              aria-hidden="true"
              d={functionPath((x) => fn(x) + c, scale, { samples: 160 })}
              fill="none"
              stroke={COLOR_FAINT}
              strokeWidth={2}
            />
          ))}
        </g>

        {/* Secondary curve (e.g. the inverse). */}
        {secondaryFn && showSecondary ? (
          <path
            aria-label="secondary function"
            d={functionPath(secondaryFn, scale, { samples: 200 })}
            fill="none"
            stroke={COLOR_SECONDARY}
            strokeWidth={3.5}
            strokeLinecap="round"
            clipPath={`url(#${clipId})`}
            style={{ pointerEvents: 'none' }}
          />
        ) : null}

        {/* The primary curve. */}
        {showPrimary ? (
          <path
            className="graph-curve"
            d={functionPath(fn, scale, { samples: 240 })}
            clipPath={`url(#${clipId})`}
            style={{ pointerEvents: 'none' }}
          />
        ) : null}

        {/* Marked input: dashed projections to both axes + a dot. */}
        {showMarked ? (
          <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
            <line x1={markedPx} y1={markedPy} x2={markedPx} y2={axisYPx} stroke={COLOR_GUIDE} strokeWidth={1.5} strokeDasharray="4 4" />
            <line x1={markedPx} y1={markedPy} x2={axisXPx} y2={markedPy} stroke={COLOR_GUIDE} strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={markedPx} cy={markedPy} r={5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} />
          </g>
        ) : null}

        {/* Marked points (inverse reflections, limits, extrema, …). The label is
            placed by the shared `placePointLabel` helper so it clears the axis
            line, the axis tick numbers, and the "x"/"y" letters, flips to the
            open side near an edge or the y-axis, and stays inside the frame —
            with a rounded halo so it never visually merges with a nearby tick. */}
        {(visual.markedPoints ?? []).map((pt, index) => {
          const px = scale.toSvgX(clamp(pt.x, xLo, xHi));
          const py = scale.toSvgY(clamp(pt.y, yLo, yHi));
          return (
            <g key={`mp-${index}`} style={{ pointerEvents: 'none' }}>
              <circle cx={px} cy={py} r={4.5} fill={COLOR_SECONDARY} stroke="var(--surface)" strokeWidth={2} />
              {pt.label ? (
                <PointLabel px={px} py={py} label={pt.label} axisXPx={axisXPx} axisYPx={axisYPx} pointRadius={4.5} />
              ) : null}
            </g>
          );
        })}

        {/* Jump/removable discontinuity: open hole at the limit height, filled
            dot at the true value. The draggable cursor snaps onto the value. */}
        {holePoint ? (
          <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
            <circle
              cx={scale.toSvgX(holePoint.x)}
              cy={scale.toSvgY(clamp(holePoint.holeY, yLo, yHi))}
              r={5}
              fill="var(--surface)"
              stroke={COLOR_CURSOR}
              strokeWidth={2}
            />
            <circle
              cx={scale.toSvgX(holePoint.x)}
              cy={scale.toSvgY(clamp(holePoint.value, yLo, yHi))}
              r={5}
              fill={COLOR_CURSOR}
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        ) : null}

        {/* Tangent line (clipped) + optional x-intercept marker. */}
        {showTangent && tangentPy != null && Number.isFinite(slope) ? (
          <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
            <line
              x1={scale.toSvgX(xLo)}
              y1={scale.toSvgY(tangentLineY(xLo))}
              x2={scale.toSvgX(xHi)}
              y2={scale.toSvgY(tangentLineY(xHi))}
              stroke={COLOR_TANGENT}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </g>
        ) : null}
        {xIntercept != null && xIntercept >= xLo && xIntercept <= xHi ? (
          <circle
            aria-hidden="true"
            cx={scale.toSvgX(xIntercept)}
            cy={axisYPx}
            r={4.5}
            fill={COLOR_TANGENT}
            stroke="var(--surface)"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        ) : null}

        {/* Draggable cursor riding the curve (single-curve mode). */}
        {effectiveShowCursor && showPrimary && cursorPy != null ? (
          <>
            <line
              aria-hidden="true"
              x1={cursorPx}
              y1={cursorPy}
              x2={cursorPx}
              y2={axisYPx}
              stroke={COLOR_CURSOR}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              style={{ pointerEvents: 'none' }}
            />
            <circle
              className="graph-point graph-handle"
              cx={cursorPx}
              cy={cursorPy}
              r={8}
              role="button"
              tabIndex={0}
              aria-label={`Draggable point on the curve at x = ${formatNumber(safeCursorX)}. Use the left and right arrow keys to move along the curve.`}
              onPointerDown={(event) => {
                demo.cancel();
                capturePointer(event);
                dragStartXRef.current = safeCursorX;
                setActiveDrag('cursor');
              }}
              onKeyDown={makeNudge(setCursorX)}
            />
          </>
        ) : null}

        {/* Inverse mode: two linked draggable dots (P on f, Q on f^{-1}). */}
        {inverseMode && cursorPy != null ? (
          <>
            {showPrimary && showSecondary && invQpy != null ? (
              <line
                aria-hidden="true"
                x1={cursorPx}
                y1={cursorPy}
                x2={invQpx}
                y2={invQpy}
                stroke={COLOR_GUIDE}
                strokeWidth={1.5}
                strokeDasharray="3 4"
                style={{ pointerEvents: 'none' }}
              />
            ) : null}
            {showPrimary ? (
              <circle
                className="graph-point graph-handle"
                cx={cursorPx}
                cy={cursorPy}
                r={8}
                fill={COLOR_CURSOR}
                stroke="var(--surface)"
                strokeWidth={2}
                role="button"
                tabIndex={0}
                aria-label={`Draggable point on f at x = ${formatNumber(safeCursorX)}, f(x) = ${formatNumber(cursorY)}. Arrow keys move along the curve.`}
                onPointerDown={(event) => {
                  demo.cancel();
                  capturePointer(event);
                  dragStartXRef.current = safeCursorX;
                  setActiveDrag('cursor');
                }}
                onKeyDown={makeNudge(setCursorX)}
              />
            ) : null}
            {showSecondary && invQpy != null ? (
              <circle
                className="graph-point graph-handle"
                cx={invQpx}
                cy={invQpy}
                r={8}
                fill={COLOR_SECONDARY}
                stroke="var(--surface)"
                strokeWidth={2}
                role="button"
                tabIndex={0}
                aria-label={`Draggable point on the inverse at x = ${formatNumber(cursorY)}, value ${formatNumber(safeCursorX)}. Arrow keys move along the curve.`}
                onPointerDown={(event) => {
                  demo.cancel();
                  capturePointer(event);
                  dragStartXRef.current = cursorY;
                  setActiveDrag('inverse');
                }}
                onKeyDown={(event) => {
                  const stepB = 0.1;
                  if (!secondaryFn) {
                    return;
                  }
                  if (
                    event.key === 'ArrowRight' ||
                    event.key === 'ArrowUp' ||
                    event.key === 'ArrowLeft' ||
                    event.key === 'ArrowDown'
                  ) {
                    demo.cancel();
                  }
                  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCursorX(clamp(secondaryFn(clamp(snapToStep(cursorY + stepB), yLo, yHi)), xLo, xHi));
                    fireInteractionComplete();
                  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCursorX(clamp(secondaryFn(clamp(snapToStep(cursorY - stepB), yLo, yHi)), xLo, xHi));
                    fireInteractionComplete();
                  }
                }}
              />
            ) : null}
          </>
        ) : null}

        {/* Draggable tangent point. */}
        {showTangent && tangentPy != null ? (
          <circle
            className="graph-handle"
            cx={tangentPx}
            cy={tangentPy}
            r={8}
            fill={COLOR_TANGENT}
            stroke="var(--surface)"
            strokeWidth={2}
            role="button"
            tabIndex={0}
            aria-label={`Draggable tangent point at x = ${formatNumber(safeTangentX)}, slope ${formatNumber(slope)}. Use the left and right arrow keys to move it.`}
            onPointerDown={(event) => {
              demo.cancel();
              capturePointer(event);
              dragStartXRef.current = safeTangentX;
              setActiveDrag('tangent');
            }}
            onKeyDown={makeNudge(setTangentX)}
          />
        ) : null}
        <DemoPulseOverlay pulse={demoPulse} />
      </PlotFrame>
    </WidgetFigure>
  );
}
