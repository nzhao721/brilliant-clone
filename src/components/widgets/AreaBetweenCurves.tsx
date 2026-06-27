// Widget: area-between-curves
//
// Interactive "area between two curves" explorer. Plots the top and bottom
// boundaries, shades the enclosed region on [a, b], optionally marks the curve
// intersections, and lets the learner drag a representative vertical strip to
// read the gap top(x) - bottom(x). The caption reports that strip height and the
// enclosed area A = ∫_a^b (top - bottom) dx, computed numerically.

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { MathText } from '../MathText';
import {
  capturePointer,
  clamp,
  createPlotScale,
  functionPath,
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  pointerToData,
  snapToStep,
  WidgetFigure,
} from './plotFrame';
import {
  DemoPulseOverlay,
  pulseEnvelope,
  useDemonstration,
  useScalarDemonstration,
} from './useDemonstration';

/** Named curves for either boundary. */
export type BetweenCurvePreset =
  | 'line' // y = x
  | 'parabola' // y = x^2
  | 'sqrt' // y = sqrt(x)
  | 'cubic' // y = x^3
  | 'sine'
  | 'cosine'
  | 'constant' // y = c (uses `constantValue`)
  | 'upper-parabola'; // downward parabola 4 - (x - 2)^2 used as a top boundary

export type AreaBetweenCurvesVisual = {
  type: 'area-between-curves';
  label: string;
  /** Upper boundary preset (overridden by `topFn`). */
  top: BetweenCurvePreset;
  /** Lower boundary preset (overridden by `bottomFn`). */
  bottom: BetweenCurvePreset;
  /** Left integration bound (usually the left intersection). */
  a: number;
  /** Right integration bound (usually the right intersection). */
  b: number;
  /** Value for either boundary when its preset is 'constant' (default 0). */
  constantValue?: number;
  /** Mark the curve intersections (default true). */
  showIntersections?: boolean;
  /** Show a draggable representative strip top(x) - bottom(x) (default true). */
  showStrip?: boolean;
  /** Visible domain (defaults: 0..6). */
  xMin?: number;
  xMax?: number;
  /** Visible range (auto-fit when omitted). */
  yMin?: number;
  yMax?: number;
  /** Optional custom boundaries; presets remain the serializable default. */
  topFn?: (x: number) => number;
  bottomFn?: (x: number) => number;
};

/** Preset boundary expressions. `c` is the author's `constantValue`. */
const PRESETS: Record<BetweenCurvePreset, (x: number, c: number) => number> = {
  line: (x) => x,
  parabola: (x) => x * x,
  sqrt: (x) => Math.sqrt(x),
  cubic: (x) => x * x * x,
  sine: (x) => Math.sin(x),
  cosine: (x) => Math.cos(x),
  constant: (_x, c) => c,
  'upper-parabola': (x) => 4 - (x - 2) * (x - 2),
};

/** Short plain-text names for the aria description. */
const PRESET_LABEL: Record<BetweenCurvePreset, string> = {
  line: 'x',
  parabola: 'x^2',
  sqrt: 'sqrt(x)',
  cubic: 'x^3',
  sine: 'sin x',
  cosine: 'cos x',
  constant: 'c',
  'upper-parabola': '4 - (x - 2)^2',
};

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Format with up to `digits` significant figures, trimming trailing zeros. */
function trim(value: number, digits = 4): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return String(Number(value.toPrecision(digits)));
}

/** Composite-Simpson integral of `fn` over [lo, hi]; robust to a stray NaN. */
function numericIntegral(fn: (x: number) => number, lo: number, hi: number): number {
  if (Math.abs(hi - lo) < 1e-12) {
    return 0;
  }
  const steps = 1000;
  const dx = (hi - lo) / steps;
  let sum = finiteOrZero(fn(lo)) + finiteOrZero(fn(hi));
  for (let i = 1; i < steps; i += 1) {
    sum += (i % 2 === 0 ? 2 : 4) * finiteOrZero(fn(lo + i * dx));
  }
  return (dx / 3) * sum;
}

/** Refine a single root of `d` bracketed by [lo, hi] (opposite signs). */
function bisect(d: (x: number) => number, lo: number, hi: number): number {
  let left = lo;
  let right = hi;
  let fLeft = d(left);
  for (let i = 0; i < 60; i += 1) {
    const mid = (left + right) / 2;
    const fMid = d(mid);
    if (fMid === 0 || (right - left) / 2 < 1e-7) {
      return mid;
    }
    if ((fLeft < 0 && fMid < 0) || (fLeft > 0 && fMid > 0)) {
      left = mid;
      fLeft = fMid;
    } else {
      right = mid;
    }
  }
  return (left + right) / 2;
}

/** Locate x-values where top = bottom across the visible domain. */
function findIntersections(d: (x: number) => number, xMin: number, xMax: number): number[] {
  const samples = 400;
  const xs: number[] = [];
  const ds: number[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    xs.push(x);
    ds.push(d(x));
  }

  const roots: number[] = [];
  const touchTol = 1e-4;

  // Clean crossings: a sign flip brackets a root we can bisect to.
  for (let i = 1; i <= samples; i += 1) {
    const prev = ds[i - 1];
    const curr = ds[i];
    if (Number.isFinite(prev) && Number.isFinite(curr) && prev * curr < 0) {
      roots.push(bisect(d, xs[i - 1], xs[i]));
    }
  }
  // Tangential touches: |d| dips to ~0 at a local minimum without flipping sign.
  for (let i = 1; i < samples; i += 1) {
    const prev = Math.abs(ds[i - 1]);
    const curr = Math.abs(ds[i]);
    const next = Math.abs(ds[i + 1]);
    if (
      Number.isFinite(prev) &&
      Number.isFinite(curr) &&
      Number.isFinite(next) &&
      curr <= prev &&
      curr <= next &&
      curr < touchTol
    ) {
      roots.push(xs[i]);
    }
  }
  if (Math.abs(ds[0]) < touchTol) {
    roots.push(xs[0]);
  }
  if (Math.abs(ds[samples]) < touchTol) {
    roots.push(xs[samples]);
  }

  roots.sort((p, q) => p - q);
  const merged: number[] = [];
  const gap = (xMax - xMin) * 0.01;
  for (const root of roots) {
    if (merged.length === 0 || Math.abs(merged[merged.length - 1] - root) > gap) {
      merged.push(root);
    }
  }
  // Two near-identical curves manufacture a forest of "roots"; suppress them.
  return merged.length > 16 ? [] : merged;
}

/** Min/max of both boundaries sampled across [lo, hi] (finite values only). */
function sampleRange(
  topFn: (x: number) => number,
  bottomFn: (x: number) => number,
  lo: number,
  hi: number,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= 200; i += 1) {
    const x = lo + ((hi - lo) * i) / 200;
    const yTop = topFn(x);
    const yBottom = bottomFn(x);
    if (Number.isFinite(yTop)) {
      min = Math.min(min, yTop);
      max = Math.max(max, yTop);
    }
    if (Number.isFinite(yBottom)) {
      min = Math.min(min, yBottom);
      max = Math.max(max, yBottom);
    }
  }
  return { min, max };
}

/** A small rounded readout tag, reusing the shared point-label chrome. */
function ValueTag({ x, y, text }: { x: number; y: number; text: string }) {
  const width = text.length * 6.4 + 14;
  const height = 18;
  const flip = x > PLOT_WIDTH - PLOT_PADDING - width - 14;
  const tagX = clamp(flip ? x - width - 12 : x + 12, PLOT_PADDING, PLOT_WIDTH - PLOT_PADDING - width);
  const tagY = clamp(y - height / 2, PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING - height);
  return (
    <g className="graph-point-label-group" aria-hidden="true">
      <rect className="graph-point-label-bg" x={tagX} y={tagY} width={width} height={height} rx={7} />
      <text
        className="graph-point-label"
        x={tagX + width / 2}
        y={tagY + height / 2}
        dominantBaseline="middle"
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

export function AreaBetweenCurves({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: AreaBetweenCurvesVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const reactId = useId();
  const clipId = `abc-clip-${reactId.replace(/:/g, '')}`;

  const constantValue = visual.constantValue ?? 0;
  const showIntersections = visual.showIntersections ?? true;
  const showStrip = visual.showStrip ?? true;

  const topFn = visual.topFn ?? ((x: number) => PRESETS[visual.top](x, constantValue));
  const bottomFn = visual.bottomFn ?? ((x: number) => PRESETS[visual.bottom](x, constantValue));
  const diff = (x: number) => topFn(x) - bottomFn(x);

  // Integration bounds, normalised so a <= b for drawing + sampling.
  const aRaw = Math.min(visual.a, visual.b);
  const bRaw = Math.max(visual.a, visual.b);

  // Visible domain: spec default 0..6, always widened to include [a, b].
  const xMin = Math.min(visual.xMin ?? 0, aRaw);
  const xMax = Math.max(visual.xMax ?? 6, bRaw);
  const regionLo = clamp(aRaw, xMin, xMax);
  const regionHi = clamp(bRaw, xMin, xMax);

  // --- Auto-fit the y-range -------------------------------------------------
  // Fit primarily to the curves on [a, b] so the shaded region and strip stay
  // legible, then grow toward the full domain so the curves don't appear to stop
  // at the region edge. A steep curve far from [a, b] is capped so it can't
  // squash the enclosed region down to a sliver.
  let yMin: number;
  let yMax: number;
  if (visual.yMin != null && visual.yMax != null) {
    yMin = Math.min(visual.yMin, visual.yMax);
    yMax = Math.max(visual.yMin, visual.yMax);
  } else {
    const region = sampleRange(topFn, bottomFn, regionLo, regionHi);
    const full = sampleRange(topFn, bottomFn, xMin, xMax);
    let lo = Number.isFinite(region.min) ? region.min : Number.isFinite(full.min) ? full.min : 0;
    let hi = Number.isFinite(region.max) ? region.max : Number.isFinite(full.max) ? full.max : 1;
    const regionSpan = Math.max(hi - lo, 1);
    if (Number.isFinite(full.min)) {
      lo = Math.min(lo, Math.max(full.min, lo - 1.5 * regionSpan));
    }
    if (Number.isFinite(full.max)) {
      hi = Math.max(hi, Math.min(full.max, hi + 1.5 * regionSpan));
    }
    const span = Math.max(hi - lo, 1);
    yMin = lo - span * 0.12;
    yMax = hi + span * 0.12;
  }
  if (yMax - yMin < 1e-9) {
    yMax = yMin + 1;
  }

  const scale = createPlotScale({ xMin, xMax, yMin, yMax });

  // --- Draggable strip ------------------------------------------------------
  const [stripX, setStripX] = useState(() => (regionLo + regionHi) / 2);
  const [dragging, setDragging] = useState(false);

  // Interaction gating: when the draggable strip is shown, fire once after a
  // *real* drag (or keyboard nudge) of it; otherwise there is no handle, so
  // fall back to firing on the first pointer interaction with the figure.
  const interactionFiredRef = useRef(false);
  const dragStartStripRef = useRef<number | null>(null);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Re-centre the strip if the author swaps the interval on the same instance.
  useEffect(() => {
    setStripX((regionLo + regionHi) / 2);
    setDragging(false);
  }, [regionLo, regionHi]);

  const safeStripX = clamp(stripX, regionLo, regionHi);
  const stripTop = topFn(safeStripX);
  const stripBottom = bottomFn(safeStripX);
  const stripHeight = stripTop - stripBottom;

  // Self-demo: when the representative strip is shown, sweep it across the whole
  // region to read the gap at every x; otherwise (a static band) pulse the shape.
  const [demoPulse, setDemoPulse] = useState(0);
  const stripDemo = useScalarDemonstration({
    demonstrate,
    value: safeStripX,
    initial: (regionLo + regionHi) / 2,
    target: clamp(snapToStep(regionHi), regionLo, regionHi),
    apply: setStripX,
    enabled: showStrip,
    onInteraction: fireInteractionComplete,
  });
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    enabled: !showStrip,
  });

  function moveStrip(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) {
      return;
    }
    const { x } = pointerToData(event, scale);
    const nextX = clamp(snapToStep(x), regionLo, regionHi);
    setStripX(nextX);
    const start = dragStartStripRef.current;
    if (start != null && Math.abs(nextX - start) > (regionHi - regionLo) / 100) {
      fireInteractionComplete();
    }
  }

  // No draggable handle when the strip is hidden: any pointer press on the
  // figure counts as the required interaction so Next can never get stuck.
  function handleFigurePointerDown() {
    if (!showStrip) {
      fireInteractionComplete();
    }
  }

  function nudgeStrip(event: KeyboardEvent<SVGCircleElement>) {
    const step = 0.1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setStripX((prev) => clamp(snapToStep(prev - step), regionLo, regionHi));
      fireInteractionComplete();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setStripX((prev) => clamp(snapToStep(prev + step), regionLo, regionHi));
      fireInteractionComplete();
    }
  }

  const area = numericIntegral(diff, regionLo, regionHi);
  const intersections = showIntersections ? findIntersections(diff, xMin, xMax) : [];

  // --- Geometry -------------------------------------------------------------
  const fillPath = buildRegionPath(topFn, bottomFn, regionLo, regionHi, scale);
  const fillClass = area < -1e-9 ? 'widget-area-negative' : 'widget-area-fill';

  const stripXPx = scale.toSvgX(safeStripX);
  const stripTopPx = scale.toSvgY(stripTop);
  const stripBottomPx = scale.toSvgY(stripBottom);
  const stripMidPx = (stripTopPx + stripBottomPx) / 2;
  const stripColor = stripHeight >= 0 ? 'var(--brand-strong)' : 'var(--warn)';

  const ariaLabel =
    `Area between ${PRESET_LABEL[visual.top]} on top and ${PRESET_LABEL[visual.bottom]} on the bottom, ` +
    `from x = ${trim(regionLo)} to x = ${trim(regionHi)}; enclosed area ${trim(area)}.`;

  return (
    <WidgetFigure
      label={visual.label}
      // Area + live strip-gap readout is long and its digits change as the strip
      // is dragged, so reserve three lines so it never reflows the plot.
      captionLines={3}
      caption={
        <>
          Enclosed area{' '}
          <strong>
            <MathText text={`$A = \\int(\\text{top} - \\text{bottom})\\,dx = ${trim(area)}$`} />
          </strong>{' '}
          on <MathText text={`$[${trim(regionLo)}, ${trim(regionHi)}]$`} />
          {showStrip ? (
            <>
              <span className="widget-readout-sep" aria-hidden="true" />
              at <MathText text={`$x = ${trim(safeStripX)}$`} />,{' '}
              <strong>
                <MathText text={`$\\text{top} - \\text{bottom} = ${trim(stripHeight)}$`} />
              </strong>
            </>
          ) : null}
        </>
      }
      instruction={
        showStrip
          ? 'Drag the strip across the region to read the gap top(x) − bottom(x) at each x.'
          : 'The shaded band is the area between the two curves.'
      }
    >
      <PlotFrame
        scale={scale}
        ariaLabel={ariaLabel}
        onPointerDown={handleFigurePointerDown}
        onPointerMove={moveStrip}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
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

        {fillPath ? <path className={fillClass} d={fillPath} /> : null}

        {/* Curves can leave the focused y-window, so clip them to the plot box. */}
        <g clipPath={`url(#${clipId})`}>
          <path
            className="graph-curve"
            d={functionPath(topFn, scale, { from: xMin, to: xMax, samples: 160 })}
          />
          <path
            d={functionPath(bottomFn, scale, { from: xMin, to: xMax, samples: 160 })}
            style={{ fill: 'none', stroke: 'var(--info)', strokeWidth: 3.5, strokeLinecap: 'round' }}
          />
        </g>

        {intersections.map((root, index) => {
          const y = topFn(root);
          if (!Number.isFinite(y) || y < yMin || y > yMax) {
            return null;
          }
          return (
            <circle
              key={`intersection-${index}`}
              aria-hidden="true"
              cx={scale.toSvgX(root)}
              cy={scale.toSvgY(y)}
              r={4.5}
              fill="var(--surface)"
              stroke="var(--ink)"
              strokeWidth={2}
            />
          );
        })}

        {showStrip ? (
          <>
            <g aria-hidden="true">
              <rect
                x={stripXPx - 4}
                y={Math.min(stripTopPx, stripBottomPx)}
                width={8}
                height={Math.abs(stripBottomPx - stripTopPx)}
                fill={stripColor}
                opacity={0.3}
              />
              <line
                x1={stripXPx}
                y1={stripTopPx}
                x2={stripXPx}
                y2={stripBottomPx}
                stroke={stripColor}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <line x1={stripXPx - 6} y1={stripTopPx} x2={stripXPx + 6} y2={stripTopPx} stroke={stripColor} strokeWidth={2.5} />
              <line
                x1={stripXPx - 6}
                y1={stripBottomPx}
                x2={stripXPx + 6}
                y2={stripBottomPx}
                stroke={stripColor}
                strokeWidth={2.5}
              />
            </g>
            <circle
              aria-label="draggable area strip"
              className="graph-point graph-handle"
              cx={stripXPx}
              cy={stripMidPx}
              r={8}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => {
                stripDemo.cancel();
                capturePointer(event);
                dragStartStripRef.current = safeStripX;
                setDragging(true);
              }}
              onKeyDown={nudgeStrip}
            />
            <ValueTag x={stripXPx} y={stripMidPx} text={`gap = ${trim(stripHeight)}`} />
          </>
        ) : null}
        <DemoPulseOverlay pulse={demoPulse} />
      </PlotFrame>
    </WidgetFigure>
  );
}

/** Closed polygon: along the top curve a -> b, then back along the bottom. */
function buildRegionPath(
  topFn: (x: number) => number,
  bottomFn: (x: number) => number,
  lo: number,
  hi: number,
  scale: ReturnType<typeof createPlotScale>,
): string {
  if (hi - lo < 1e-9) {
    return '';
  }
  const samples = 96;
  const commands: string[] = [];
  let started = false;
  for (let i = 0; i <= samples; i += 1) {
    const x = lo + ((hi - lo) * i) / samples;
    const y = topFn(x);
    if (!Number.isFinite(y)) {
      continue;
    }
    commands.push(`${started ? 'L' : 'M'} ${scale.toSvgX(x).toFixed(2)} ${scale.toSvgY(y).toFixed(2)}`);
    started = true;
  }
  for (let i = samples; i >= 0; i -= 1) {
    const x = lo + ((hi - lo) * i) / samples;
    const y = bottomFn(x);
    if (!Number.isFinite(y)) {
      continue;
    }
    commands.push(`L ${scale.toSvgX(x).toFixed(2)} ${scale.toSvgY(y).toFixed(2)}`);
  }
  return commands.length > 2 ? `${commands.join(' ')} Z` : '';
}
