// Widget: riemann-sum
//
// Interactive Riemann-sum explorer. Renders the chosen integrand on [a, b],
// draws `n` approximating panels according to `rule` (left/right/midpoint
// rectangles, trapezoids, or Simpson parabolas) and lets the learner drag a
// slider to change `n`. The readout reports the running estimate and, when
// `showExactArea` is set, the true integral and the shrinking error.
//
// Builder-owned file. The shared modules (plotFrame, the widget registry, the
// lessons union, InteractiveGraph, and the stylesheets) stay read-only here.

import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { MathText } from '../MathText';
import {
  clamp,
  createPlotScale,
  functionPath,
  PlotFrame,
  WidgetFigure,
} from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';
import './widgetSlider.css';
import './RiemannSum.css';

/** Named integrands the author can choose without writing a function. */
export type RiemannCurvePreset =
  | 'parabola' // x^2
  | 'line' // x + 1
  | 'cubic' // x^3
  | 'sqrt' // sqrt(x)
  | 'sine' // sin(x)
  | 'gaussian' // e^{-x^2} (no elementary antiderivative)
  | 'reciprocal' // 1 / x
  | 'reciprocal-square'; // 1 / x^2

/** How each rectangle / panel height is chosen. */
export type RiemannRule = 'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson';

export type RiemannSumVisual = {
  type: 'riemann-sum';
  label: string;
  /** Integrand preset (overridden by `fn` when supplied). */
  curve: RiemannCurvePreset;
  /** Lower integration bound. */
  a: number;
  /** Upper integration bound. */
  b: number;
  /** Initial number of subintervals (default 4). */
  n?: number;
  /** Largest n the slider allows (default 20). */
  maxN?: number;
  /** Sampling rule for rectangle/panel heights (default 'left'). */
  rule?: RiemannRule;
  /** Show the exact area + error alongside the estimate (default false). */
  showExactArea?: boolean;
  /** Optional custom integrand; presets remain the serializable default. */
  fn?: (x: number) => number;
};

type Integrand = {
  fn: (x: number) => number;
  /** Elementary antiderivative, where one exists, for an exact integral. */
  antiderivative?: (x: number) => number;
};

const PRESETS: Record<RiemannCurvePreset, Integrand> = {
  parabola: { fn: (x) => x * x, antiderivative: (x) => (x * x * x) / 3 },
  line: { fn: (x) => x + 1, antiderivative: (x) => (x * x) / 2 + x },
  cubic: { fn: (x) => x * x * x, antiderivative: (x) => (x * x * x * x) / 4 },
  sqrt: { fn: (x) => Math.sqrt(x), antiderivative: (x) => (2 / 3) * Math.pow(x, 1.5) },
  sine: { fn: (x) => Math.sin(x), antiderivative: (x) => -Math.cos(x) },
  gaussian: { fn: (x) => Math.exp(-x * x) },
  reciprocal: { fn: (x) => 1 / x, antiderivative: (x) => Math.log(Math.abs(x)) },
  'reciprocal-square': { fn: (x) => 1 / (x * x), antiderivative: (x) => -1 / x },
};

const RULE_NOUN: Record<RiemannRule, string> = {
  left: 'Left Riemann sum',
  right: 'Right Riemann sum',
  midpoint: 'Midpoint Riemann sum',
  trapezoid: 'Trapezoidal estimate',
  simpson: "Simpson's estimate",
};

const RULE_HINT: Record<RiemannRule, string> = {
  left: 'Each strip is a rectangle whose height comes from its left edge.',
  right: 'Each strip is a rectangle whose height comes from its right edge.',
  midpoint: 'Each strip is a rectangle whose height comes from its midpoint.',
  trapezoid: 'Each strip is a trapezoid joining the curve at both edges.',
  simpson: 'Each pair of strips is capped by a parabola through three points.',
};

const PANEL_NOUN: Record<RiemannRule, string> = {
  left: 'rectangles',
  right: 'rectangles',
  midpoint: 'rectangles',
  trapezoid: 'trapezoids',
  simpson: 'parabolic panels',
};

/** Replace non-finite samples with 0 so a stray asymptote can't poison a sum. */
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

/** Numerically correct estimate for the chosen rule over `n` subintervals. */
function approximateArea(
  fn: (x: number) => number,
  lo: number,
  hi: number,
  n: number,
  rule: RiemannRule,
): number {
  const dx = (hi - lo) / n;
  if (!Number.isFinite(dx) || dx <= 0) {
    return 0;
  }

  if (rule === 'simpson') {
    let sum = 0;
    let i = 0;
    for (; i + 2 <= n; i += 2) {
      const x0 = lo + i * dx;
      sum += (dx / 3) * (finiteOrZero(fn(x0)) + 4 * finiteOrZero(fn(x0 + dx)) + finiteOrZero(fn(x0 + 2 * dx)));
    }
    // Odd n leaves one strip: close it with a trapezoid (still a valid rule).
    if (i < n) {
      const x0 = lo + i * dx;
      sum += (dx / 2) * (finiteOrZero(fn(x0)) + finiteOrZero(fn(x0 + dx)));
    }
    return sum;
  }

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const xl = lo + i * dx;
    const xr = xl + dx;
    if (rule === 'left') {
      sum += finiteOrZero(fn(xl)) * dx;
    } else if (rule === 'right') {
      sum += finiteOrZero(fn(xr)) * dx;
    } else if (rule === 'midpoint') {
      sum += finiteOrZero(fn((xl + xr) / 2)) * dx;
    } else {
      sum += ((finiteOrZero(fn(xl)) + finiteOrZero(fn(xr))) / 2) * dx;
    }
  }
  return sum;
}

/** Fine composite-Simpson reference integral for presets without a closed form. */
function numericIntegral(fn: (x: number) => number, lo: number, hi: number): number {
  const steps = 2000;
  const dx = (hi - lo) / steps;
  if (!Number.isFinite(dx) || dx <= 0) {
    return Number.NaN;
  }
  let sum = finiteOrZero(fn(lo)) + finiteOrZero(fn(hi));
  for (let i = 1; i < steps; i += 1) {
    sum += (i % 2 === 0 ? 2 : 4) * finiteOrZero(fn(lo + i * dx));
  }
  return (dx / 3) * sum;
}

/** Exact area: closed form for presets that have one, else a fine numeric value. */
function exactArea(integrand: Integrand, override: ((x: number) => number) | undefined, lo: number, hi: number): number {
  if (!override && integrand.antiderivative) {
    const value = integrand.antiderivative(hi) - integrand.antiderivative(lo);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return numericIntegral(override ?? integrand.fn, lo, hi);
}

const controlsStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  marginTop: '0.3rem',
};

export function RiemannSum({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: RiemannSumVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const maxN = Math.max(1, Math.round(visual.maxN ?? 20));
  const initialN = clamp(Math.round(visual.n ?? 4), 1, maxN);
  const rule = visual.rule ?? 'left';
  const showExactArea = visual.showExactArea ?? false;

  const [n, setN] = useState(initialN);
  const sliderId = useId();
  // Unique, url(#…)-safe ids for the per-instance area hatch patterns.
  const hatchUid = useId().replace(/:/g, '');
  const positiveHatchId = `riemann-area-pos-${hatchUid}`;
  const negativeHatchId = `riemann-area-neg-${hatchUid}`;

  // Lesson interaction-gating signal (shared contract): fire once when the
  // learner actually moves the rectangle count off its initial value. A pointer
  // fallback covers the degenerate single-step slider (maxN === 1) so the
  // lesson's Next button can never get permanently stuck.
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };
  const sliderCanMove = maxN > 1;

  // Self-demo: ramp n up to its maximum so more, finer panels visibly converge
  // on the exact area. Each frame snaps to a whole number of subintervals.
  const demo = useScalarDemonstration({
    demonstrate,
    value: clamp(Math.round(n), 1, maxN),
    initial: initialN,
    target: maxN,
    apply: setN,
    enabled: sliderCanMove,
    round: (value) => clamp(Math.round(value), 1, maxN),
    onInteraction: fireInteractionComplete,
  });

  // Re-seed n if the author swaps in a different problem on the same instance.
  useEffect(() => {
    setN(initialN);
  }, [initialN, visual.curve, visual.a, visual.b, rule]);

  const safeN = clamp(Math.round(n), 1, maxN);

  // Filled portion of the slider track (0..1), as both a fraction (for the
  // bubble position) and a percentage (for the WebKit gradient fill).
  const sliderFraction = maxN > 1 ? (safeN - 1) / (maxN - 1) : 0;
  const sliderTrackStyle = {
    '--widget-slider-progress': `${sliderFraction * 100}%`,
    '--riemann-fraction': sliderFraction,
  } as CSSProperties;

  // Normalise the domain so a <= b (and never degenerate) for drawing + sums.
  const lo = Math.min(visual.a, visual.b);
  const hiRaw = Math.max(visual.a, visual.b);
  const hi = hiRaw - lo < 1e-9 ? lo + 1 : hiRaw;

  const integrand = PRESETS[visual.curve] ?? PRESETS.parabola;
  const fn = visual.fn ?? integrand.fn;

  // Auto-fit the y-range to the curve on [lo, hi], always including the axis.
  let rawMin = Infinity;
  let rawMax = -Infinity;
  for (let i = 0; i <= 240; i += 1) {
    const y = fn(lo + ((hi - lo) * i) / 240);
    if (!Number.isFinite(y)) {
      continue;
    }
    rawMin = Math.min(rawMin, y);
    rawMax = Math.max(rawMax, y);
  }
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    rawMin = 0;
    rawMax = 1;
  }
  let yMin = Math.min(0, rawMin);
  let yMax = Math.max(0, rawMax);
  const span = yMax - yMin || 1;
  yMin -= yMin < 0 ? span * 0.1 : 0;
  yMax += yMax > 0 ? span * 0.1 : 0;
  if (yMax - yMin < 1e-9) {
    yMax = yMin + 1;
  }

  const scale = createPlotScale({ xMin: lo, xMax: hi, yMin, yMax });
  const baselineY = scale.toSvgY(0);
  const dx = (hi - lo) / safeN;

  const approx = approximateArea(fn, lo, hi, safeN, rule);
  const exact = showExactArea ? exactArea(integrand, visual.fn, lo, hi) : Number.NaN;
  const error = Number.isFinite(exact) ? Math.abs(exact - approx) : Number.NaN;

  // Panels are always filled (semi-transparent brand) with crisp dark-green
  // borders. The true area sits behind them as a distinct blue hatch, so the
  // over-/under-shoot slivers against the curve stay readable on their own.
  const panels: ReactElement[] = [];
  const markers: ReactElement[] = [];

  if (rule === 'trapezoid') {
    for (let i = 0; i < safeN; i += 1) {
      const xl = lo + i * dx;
      const xr = xl + dx;
      const yl = fn(xl);
      const yr = fn(xr);
      if (!Number.isFinite(yl) || !Number.isFinite(yr)) {
        continue;
      }
      const xlPx = scale.toSvgX(xl);
      const xrPx = scale.toSvgX(xr);
      panels.push(
        <path
          key={`trap-${i}`}
          className="riemann-panel"
          d={`M ${xlPx} ${baselineY} L ${xlPx} ${scale.toSvgY(yl)} L ${xrPx} ${scale.toSvgY(yr)} L ${xrPx} ${baselineY} Z`}
        />,
      );
    }
  } else if (rule === 'simpson') {
    let i = 0;
    for (; i + 2 <= safeN; i += 2) {
      const x0 = lo + i * dx;
      const x2 = x0 + 2 * dx;
      const y0 = fn(x0);
      const y1 = fn(x0 + dx);
      const y2 = fn(x2);
      if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2)) {
        continue;
      }
      const x0Px = scale.toSvgX(x0);
      const x2Px = scale.toSvgX(x2);
      const y0Px = scale.toSvgY(y0);
      const y2Px = scale.toSvgY(y2);
      // Quadratic Bézier whose control point reproduces the interpolating
      // parabola at the midpoint: B(0.5) = (P0 + 2Q + P2)/4 = midpoint sample.
      const cx = scale.toSvgX(x0 + dx);
      const cy = 2 * scale.toSvgY(y1) - (y0Px + y2Px) / 2;
      panels.push(
        <path
          key={`simp-${i}`}
          className="riemann-panel"
          d={`M ${x0Px} ${baselineY} L ${x0Px} ${y0Px} Q ${cx} ${cy} ${x2Px} ${y2Px} L ${x2Px} ${baselineY} Z`}
        />,
      );
    }
    if (i < safeN) {
      const xl = lo + i * dx;
      const xr = xl + dx;
      const yl = fn(xl);
      const yr = fn(xr);
      if (Number.isFinite(yl) && Number.isFinite(yr)) {
        const xlPx = scale.toSvgX(xl);
        const xrPx = scale.toSvgX(xr);
        panels.push(
        <path
          key={`simp-tail-${i}`}
          className="riemann-panel"
          d={`M ${xlPx} ${baselineY} L ${xlPx} ${scale.toSvgY(yl)} L ${xrPx} ${scale.toSvgY(yr)} L ${xrPx} ${baselineY} Z`}
        />,
        );
      }
    }
  } else {
    for (let i = 0; i < safeN; i += 1) {
      const xl = lo + i * dx;
      const xr = xl + dx;
      const sampleX = rule === 'left' ? xl : rule === 'right' ? xr : (xl + xr) / 2;
      const height = fn(sampleX);
      if (!Number.isFinite(height)) {
        continue;
      }
      const heightPx = scale.toSvgY(height);
      const top = Math.min(heightPx, baselineY);
      const xlPx = scale.toSvgX(xl);
      panels.push(
        <rect
          key={`rect-${i}`}
          className="riemann-panel"
          x={xlPx}
          y={top}
          width={Math.max(0, scale.toSvgX(xr) - xlPx)}
          height={Math.abs(heightPx - baselineY)}
        />,
      );
      if (safeN <= 10) {
        markers.push(
          <circle
            key={`dot-${i}`}
            cx={scale.toSvgX(sampleX)}
            cy={heightPx}
            r={2.6}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={1.5}
          />,
        );
      }
    }
  }

  // Exact area: one filled region per maximal run of finite samples, tinted by
  // sign so signed-area examples read correctly.
  const areaRegions: ReactElement[] = [];
  if (showExactArea) {
    let run: Array<{ xPx: number; yPx: number }> = [];
    let valueSum = 0;
    let regionIndex = 0;
    const flush = () => {
      if (run.length >= 2) {
        const first = run[0];
        const last = run[run.length - 1];
        const d =
          `M ${first.xPx} ${baselineY} ` +
          run.map((point) => `L ${point.xPx} ${point.yPx}`).join(' ') +
          ` L ${last.xPx} ${baselineY} Z`;
        const negative = valueSum < 0;
        areaRegions.push(
          <path
            key={`area-${regionIndex}`}
            className={negative ? 'riemann-true-area-negative' : 'riemann-true-area'}
            fill={`url(#${negative ? negativeHatchId : positiveHatchId})`}
            d={d}
          />,
        );
        regionIndex += 1;
      }
      run = [];
      valueSum = 0;
    };
    for (let i = 0; i <= 160; i += 1) {
      const x = lo + ((hi - lo) * i) / 160;
      const y = fn(x);
      if (!Number.isFinite(y)) {
        flush();
        continue;
      }
      run.push({ xPx: scale.toSvgX(x), yPx: scale.toSvgY(y) });
      valueSum += y;
    }
    flush();
  }

  const panelNoun = PANEL_NOUN[rule];
  const ariaLabel =
    `${RULE_NOUN[rule]} of the ${visual.curve} curve on [${trim(lo)}, ${trim(hi)}] ` +
    `using ${safeN} ${panelNoun}; estimate ${trim(approx)}` +
    (showExactArea && Number.isFinite(exact) ? `, exact area ${trim(exact)}` : '');

  return (
    <WidgetFigure
      label={visual.label}
      // The estimate / exact-area / error readout is long and its digit counts
      // change as the learner drags n, so reserve enough lines that it never
      // reflows the plot (three lines when the exact-area + error terms show).
      captionLines={showExactArea ? 3 : 2}
      caption={
        <>
          <strong>{RULE_NOUN[rule]}</strong> with <MathText text={`$n = ${safeN}$`} /> {panelNoun}{' '}
          (<MathText text={`$\\Delta x = ${trim(dx)}$`} />):{' '}
          <strong>
            <MathText text={`$${trim(approx)}$`} />
          </strong>
          {showExactArea ? (
            Number.isFinite(exact) ? (
              <>
                <span className="widget-readout-sep" aria-hidden="true" />
                exact{' '}
                <strong>
                  <MathText text={`$\\text{area} = ${trim(exact)}$`} />
                </strong>
                <span className="widget-readout-sep" aria-hidden="true" />
                <MathText text={`$|\\text{error}| = ${trim(error)}$`} />
              </>
            ) : (
              <>
                <span className="widget-readout-sep" aria-hidden="true" />
                exact area unavailable on this interval
              </>
            )
          ) : null}
        </>
      }
      instruction={`Drag the slider to change n. ${RULE_HINT[rule]}`}
    >
      <PlotFrame
        scale={scale}
        ariaLabel={ariaLabel}
        onPointerDown={sliderCanMove ? undefined : () => fireInteractionComplete()}
      >
        {showExactArea ? (
          <defs>
            <pattern
              id={positiveHatchId}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect className="riemann-hatch-bg" width={6} height={6} />
              <line className="riemann-hatch-line" x1={0} y1={0} x2={0} y2={6} />
            </pattern>
            <pattern
              id={negativeHatchId}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect className="riemann-hatch-bg riemann-hatch-bg--neg" width={6} height={6} />
              <line className="riemann-hatch-line riemann-hatch-line--neg" x1={0} y1={0} x2={0} y2={6} />
            </pattern>
          </defs>
        ) : null}
        {areaRegions}
        {panels}
        <path className="graph-curve" d={functionPath(fn, scale, { from: lo, to: hi, samples: 160 })} />
        {markers}
      </PlotFrame>
      {showExactArea ? (
        <ul className="riemann-legend">
          <li className="riemann-legend-item">
            <span className="riemann-legend-swatch riemann-legend-swatch--rect" aria-hidden="true" />
            <span>Estimate ({panelNoun})</span>
          </li>
          <li className="riemann-legend-item">
            <span className="riemann-legend-swatch riemann-legend-swatch--area" aria-hidden="true" />
            <span>Exact area under curve</span>
          </li>
        </ul>
      ) : null}
      <div style={controlsStyle}>
        <div className="riemann-slider-field">
          <label htmlFor={sliderId} className="riemann-slider-label">
            Subintervals (n): {safeN}
          </label>
          <div className="riemann-slider-track" style={sliderTrackStyle}>
            <input
              id={sliderId}
              className="widget-slider riemann-slider-input"
              type="range"
              min={1}
              max={maxN}
              step={1}
              value={safeN}
              aria-label="Number of subintervals"
              onPointerDown={() => demo.cancel()}
              onChange={(event) => {
                demo.cancel();
                const next = clamp(Math.round(Number(event.target.value)), 1, maxN);
                setN(next);
                if (next !== initialN) {
                  fireInteractionComplete();
                }
              }}
            />
            <span className="riemann-slider-bubble" aria-hidden="true">
              {safeN}
            </span>
          </div>
          <div className="riemann-slider-scale" aria-hidden="true">
            <span>1</span>
            <span>{maxN}</span>
          </div>
        </div>
      </div>
    </WidgetFigure>
  );
}
