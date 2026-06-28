/*
 * Widget: area-between-curves — shades the region between two boundaries on [a, b],
 * optionally marks intersections, and drags a vertical strip to read the gap
 * top(x) - bottom(x). Caption reports that gap and A = ∫(top - bottom) dx.
 */

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

/* Auto-framing: pad the x-view by this fraction of the region span (and at least
   MIN_REGION_PAD) on each side, so the bounded region fills most of the plot while
   leaving the draggable limit handles a little room to move. */
const REGION_PAD_FRACTION = 0.2;
const MIN_REGION_PAD = 0.2;
/* Smallest gap (in x) kept between the lower and upper integration limits. */
const MIN_LIMIT_GAP = 0.1;

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

  // Configured integration bounds, normalised so a <= b for framing + sampling.
  const aRaw = Math.min(visual.a, visual.b);
  const bRaw = Math.max(visual.a, visual.b);

  /* AUTO-FRAME the x-view to the bounded region [aRaw, bRaw] (where the curves
     enclose their area) plus padding, instead of a hardcoded 0..6 window — so a
     small region such as [0, 1] fills the plot instead of sitting in a sliver. The
     padding also gives the two draggable limit handles room to move. An explicit
     xMin/xMax still wins, and the view is always widened to contain the region. */
  const regionPad = Math.max((bRaw - aRaw) * REGION_PAD_FRACTION, MIN_REGION_PAD);
  const xMin = Math.min(visual.xMin ?? aRaw - regionPad, aRaw);
  const xMax = Math.max(visual.xMax ?? bRaw + regionPad, bRaw);

  /* Configured region clamped into the view: the initial handle positions AND the
     window the y-fit frames to. Kept off the *configured* bounds (not the live
     dragged ones) so the view never rescales mid-drag. */
  const frameLo = clamp(aRaw, xMin, xMax);
  const frameHi = clamp(bRaw, xMin, xMax);

  /* Auto-fit y to the curves on the framed region, then grow toward the full
     (now tightly framed) domain, capping a steep far-off curve. */
  let yMin: number;
  let yMax: number;
  if (visual.yMin != null && visual.yMax != null) {
    yMin = Math.min(visual.yMin, visual.yMax);
    yMax = Math.max(visual.yMin, visual.yMax);
  } else {
    const region = sampleRange(topFn, bottomFn, frameLo, frameHi);
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
  const axisSvgY = scale.toSvgY(clamp(0, yMin, yMax));

  /* Both integration limits are draggable; the live [regionLo, regionHi] drives the
     shaded band, the area readout and the strip's range. */
  const [a, setA] = useState(frameLo);
  const [b, setB] = useState(frameHi);
  const regionLo = Math.min(a, b);
  const regionHi = Math.max(a, b);

  // Draggable strip + which handle (strip / lower limit / upper limit) is active.
  const [stripX, setStripX] = useState(() => (frameLo + frameHi) / 2);
  const [dragging, setDragging] = useState<'strip' | 'a' | 'b' | null>(null);

  /* Fire once after a real strip drag/nudge; with no strip, fall back to the
     first pointer interaction. */
  const interactionFiredRef = useRef(false);
  const dragStartRef = useRef<number | null>(null);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Re-seed the limits + strip if the author swaps the interval/curves on the same instance.
  useEffect(() => {
    setA(frameLo);
    setB(frameHi);
    setStripX((frameLo + frameHi) / 2);
    setDragging(null);
  }, [frameLo, frameHi]);

  const safeStripX = clamp(stripX, regionLo, regionHi);
  const stripTop = topFn(safeStripX);
  const stripBottom = bottomFn(safeStripX);
  const stripHeight = stripTop - stripBottom;

  /* Self-demo: sweep the strip across the region, or pulse a static band. */
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

  /* Drag the strip OR either integration limit. The strip stays inside the live
     region; each limit is clamped into the view and kept on its own side of the
     other (a at least MIN_LIMIT_GAP left of b) so the interval never inverts. */
  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) {
      return;
    }
    const snapped = snapToStep(pointerToData(event, scale).x);
    let next: number;
    if (dragging === 'strip') {
      next = clamp(snapped, regionLo, regionHi);
      setStripX(next);
    } else if (dragging === 'a') {
      next = clamp(snapped, xMin, Math.max(xMin, b - MIN_LIMIT_GAP));
      setA(next);
    } else {
      next = clamp(snapped, Math.min(xMax, a + MIN_LIMIT_GAP), xMax);
      setB(next);
    }
    const start = dragStartRef.current;
    const refSpan = dragging === 'strip' ? regionHi - regionLo : xMax - xMin;
    if (start != null && Math.abs(next - start) > Math.max(refSpan, 1e-9) / 100) {
      fireInteractionComplete();
    }
  }

  /* No strip: any pointer press counts as the interaction so Next can't get stuck. */
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

  /* Keyboard nudge for an integration limit (mirrors the strip), keeping a < b and
     inside the view. */
  function nudgeLimit(which: 'a' | 'b', event: KeyboardEvent<SVGCircleElement>) {
    const step = 0.1;
    let delta = 0;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      delta = -step;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      delta = step;
    } else {
      return;
    }
    event.preventDefault();
    if (which === 'a') {
      setA((prev) => clamp(snapToStep(prev + delta), xMin, Math.max(xMin, b - MIN_LIMIT_GAP)));
    } else {
      setB((prev) => clamp(snapToStep(prev + delta), Math.min(xMax, a + MIN_LIMIT_GAP), xMax));
    }
    fireInteractionComplete();
  }

  const area = numericIntegral(diff, regionLo, regionHi);
  const intersections = showIntersections ? findIntersections(diff, xMin, xMax) : [];

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
      /* Reserve three lines: the area + live gap readout is long and changes as the strip drags. */
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
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
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

        {/* Draggable integration limits: a vertical boundary at each end with a grab
            handle, so the learner can resize the region itself (not only slide the strip). */}
        {[
          { which: 'a' as const, value: a },
          { which: 'b' as const, value: b },
        ].map(({ which, value }) => {
          const xPx = scale.toSvgX(value);
          const topVal = topFn(value);
          const bottomVal = bottomFn(value);
          const topPx = scale.toSvgY(Number.isFinite(topVal) ? clamp(topVal, yMin, yMax) : yMax);
          const bottomPx = scale.toSvgY(Number.isFinite(bottomVal) ? clamp(bottomVal, yMin, yMax) : yMin);
          const midPx = (topPx + bottomPx) / 2;
          const labelX = clamp(
            which === 'a' ? xPx - 9 : xPx + 9,
            PLOT_PADDING + 2,
            PLOT_WIDTH - PLOT_PADDING - 2,
          );
          return (
            <g key={`limit-${which}`}>
              <line
                className="graph-y-guide"
                x1={xPx}
                y1={Math.min(topPx, bottomPx)}
                x2={xPx}
                y2={Math.max(topPx, bottomPx)}
              />
              <text
                x={labelX}
                y={axisSvgY - 7}
                textAnchor={which === 'a' ? 'end' : 'start'}
                fontSize={12}
                fontWeight={800}
                fill="#6b7280"
              >
                {which}
              </text>
              <circle
                aria-label={`draggable ${which === 'a' ? 'lower' : 'upper'} limit ${which}`}
                className="graph-handle"
                cx={xPx}
                cy={midPx}
                r={7}
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth={2.5}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => {
                  stripDemo.cancel();
                  capturePointer(event);
                  dragStartRef.current = value;
                  setDragging(which);
                }}
                onKeyDown={(event) => nudgeLimit(which, event)}
              />
            </g>
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
                dragStartRef.current = safeStripX;
                setDragging('strip');
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
