// Widget: taylor-approximation
//
// Renders a target function f (solid, brand colour) together with its
// Taylor/Maclaurin polynomial of an adjustable `degree` (dashed) expanded about
// `center`. A React-state slider raises the degree from 0..maxDegree and the
// approximation visibly hugs f over a widening interval. The expansion center is
// marked and a fixed sample point x0 shows the live value and the truncation
// error |f(x0) - P_d(x0)|.

import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  PLOT_HEIGHT,
  PLOT_PADDING,
  PlotFrame,
  WidgetFigure,
  clamp,
  createPlotScale,
  formatNumber,
  functionPath,
} from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';
import { MathText } from '../MathText';
import './widgetSlider.css';

/** Named functions with well-known Taylor series. */
export type TaylorFunctionPreset =
  | 'exp' // e^x
  | 'sin' // sin x
  | 'cos' // cos x
  | 'ln-1-plus-x' // ln(1 + x)
  | 'one-over-1-minus-x' // 1/(1 - x)
  | 'arctan'; // arctan x

export type TaylorApproximationVisual = {
  type: 'taylor-approximation';
  label: string;
  /** Target function preset (overridden by `targetFn` for the curve only). */
  func: TaylorFunctionPreset;
  /** Expansion center a; 0 gives a Maclaurin series (default 0). */
  center?: number;
  /** Initial polynomial degree (default 1). */
  degree?: number;
  /** Largest degree the slider allows (default 8). */
  maxDegree?: number;
  /** Visible domain (defaults symmetric about the center, e.g. -4..4). */
  xMin?: number;
  xMax?: number;
  /** Visible range (auto-fit when omitted). */
  yMin?: number;
  yMax?: number;
  /** Optional custom target for drawing f; the series still uses `func`. */
  targetFn?: (x: number) => number;
};

/** Upper bound on the slider degree (keeps factorials / powers numerically tame). */
const MAX_ALLOWED_DEGREE = 12;
const DEFAULT_HALF_WIDTH = 4;
const SAMPLE_COUNT = 240;

/** Sensible vertical clamps so fast-growing / singular presets stay framed. */
const PRESET_Y_CAP: Record<TaylorFunctionPreset, [number, number]> = {
  exp: [-3, 12],
  sin: [-1.6, 1.6],
  cos: [-1.6, 1.6],
  'ln-1-plus-x': [-3.5, 3],
  'one-over-1-minus-x': [-6, 6],
  arctan: [-2, 2],
};

const PRESET_LATEX: Record<TaylorFunctionPreset, string> = {
  exp: 'e^{x}',
  sin: '\\sin x',
  cos: '\\cos x',
  'ln-1-plus-x': '\\ln(1+x)',
  'one-over-1-minus-x': '\\frac{1}{1-x}',
  arctan: '\\arctan x',
};

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) {
    result *= i;
  }
  return result;
}

/** The drawn function f(x) for each preset. Returns NaN outside its domain. */
function targetValue(preset: TaylorFunctionPreset, x: number): number {
  switch (preset) {
    case 'exp':
      return Math.exp(x);
    case 'sin':
      return Math.sin(x);
    case 'cos':
      return Math.cos(x);
    case 'ln-1-plus-x':
      return x > -1 ? Math.log(1 + x) : Number.NaN;
    case 'one-over-1-minus-x':
      return x === 1 ? Number.NaN : 1 / (1 - x);
    case 'arctan':
      return Math.atan(x);
    default:
      return Number.NaN;
  }
}

/**
 * The k-th Taylor coefficient c_k = f^(k)(a)/k! about center a.
 *
 * At a = 0 these reduce to the standard Maclaurin series:
 *   exp -> 1/k!;  sin/cos -> alternating odd/even terms;
 *   ln(1+x) -> (-1)^(k+1)/k;  1/(1-x) -> 1;  arctan -> (-1)^m/(2m+1).
 * For a nonzero center the analytic derivative formulas below build the
 * polynomial directly, which is exactly f^(k)(a)/k!.
 */
function taylorCoefficient(preset: TaylorFunctionPreset, center: number, k: number): number {
  switch (preset) {
    case 'exp':
      return Math.exp(center) / factorial(k);
    case 'sin':
      return Math.sin(center + (k * Math.PI) / 2) / factorial(k);
    case 'cos':
      return Math.cos(center + (k * Math.PI) / 2) / factorial(k);
    case 'ln-1-plus-x': {
      if (k === 0) {
        return Math.log(1 + center);
      }
      const sign = k % 2 === 1 ? 1 : -1; // (-1)^(k-1)
      return sign / (k * Math.pow(1 + center, k));
    }
    case 'one-over-1-minus-x':
      // f^(k)(a)/k! = 1 / (1 - a)^(k+1).
      return 1 / Math.pow(1 - center, k + 1);
    case 'arctan': {
      if (k === 0) {
        return Math.atan(center);
      }
      // d^k/dx^k arctan x = (-1)^(k-1)(k-1)!(1+x^2)^(-k/2) sin(k·atan2(1,x)).
      const sign = k % 2 === 1 ? 1 : -1; // (-1)^(k-1)
      const phi = Math.atan2(1, center);
      return (sign * Math.sin(k * phi)) / (k * Math.pow(1 + center * center, k / 2));
    }
    default:
      return Number.NaN;
  }
}

/** Horner evaluation of P_d(x) = Σ_{k=0}^{d} c_k (x - a)^k. */
function evaluatePolynomial(
  coefficients: number[],
  center: number,
  degree: number,
  x: number,
): number {
  const shifted = x - center;
  let acc = 0;
  for (let k = Math.min(degree, coefficients.length - 1); k >= 0; k -= 1) {
    acc = acc * shifted + coefficients[k];
  }
  return acc;
}

/** Distance from the center to the nearest singularity (∞ for entire functions). */
function convergenceRadius(preset: TaylorFunctionPreset, center: number): number {
  switch (preset) {
    case 'ln-1-plus-x':
      return Math.max(0, 1 + center);
    case 'one-over-1-minus-x':
      return Math.abs(1 - center);
    case 'arctan':
      return Math.hypot(1, center);
    default:
      return Number.POSITIVE_INFINITY;
  }
}

/** A readout sample point offset from the center, kept inside convergence + frame. */
function computeSampleX0(
  preset: TaylorFunctionPreset,
  center: number,
  xMin: number,
  xMax: number,
): number {
  const isEntire = preset === 'exp' || preset === 'sin' || preset === 'cos';
  const base = isEntire ? 1.8 : 0.7;
  const radius = convergenceRadius(preset, center);
  const offset = Number.isFinite(radius) ? Math.min(base, 0.7 * radius) : base;
  const span = xMax - xMin || 1;
  const candidate = center + (offset > 1e-6 ? offset : 0.4);
  return clamp(candidate, xMin + span * 0.04, xMax - span * 0.04);
}

/** Auto-fit the vertical window to the drawn curve, clamped to a sensible cap. */
function computeYWindow(
  preset: TaylorFunctionPreset,
  drawF: (x: number) => number,
  center: number,
  xMin: number,
  xMax: number,
  overrideMin?: number,
  overrideMax?: number,
): { yMin: number; yMax: number } {
  const [capLo, capHi] = PRESET_Y_CAP[preset] ?? [-10, 10];
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  const samples = 200;
  for (let i = 0; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const y = drawF(x);
    if (Number.isFinite(y)) {
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = capLo;
    hi = capHi;
  }
  lo = Math.max(lo, capLo);
  hi = Math.min(hi, capHi);
  const centerValue = drawF(center);
  if (Number.isFinite(centerValue)) {
    lo = Math.min(lo, centerValue);
    hi = Math.max(hi, centerValue);
  }
  if (hi - lo < 0.5) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  const pad = 0.12 * (hi - lo);
  let yMin = lo - pad;
  let yMax = hi + pad;
  if (overrideMin != null) yMin = overrideMin;
  if (overrideMax != null) yMax = overrideMax;
  if (yMin >= yMax) {
    yMin = lo - 1;
    yMax = hi + 1;
  }
  return { yMin, yMax };
}

function formatError(value: number): string {
  if (!Number.isFinite(value)) {
    return '∞';
  }
  if (value === 0) {
    return '0';
  }
  if (value < 0.01) {
    return value.toExponential(1);
  }
  return formatNumber(value);
}

const controlsStyle: CSSProperties = {
  display: 'grid',
  gap: '0.35rem',
  marginTop: '0.2rem',
};

const sliderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
};

const sliderLabelStyle: CSSProperties = {
  fontWeight: 700,
  color: 'var(--brand-strong)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const sliderStyle: CSSProperties = {
  flex: '1 1 160px',
  accentColor: 'var(--brand)',
};

const readoutStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignContent: 'center',
  gap: '0.2rem 1.1rem',
  fontSize: '0.85rem',
  color: 'var(--ink-soft)',
  fontVariantNumeric: 'tabular-nums',
  // Reserve two lines so the x0 / f / P / error values (whose widths change as
  // the degree slider moves) can wrap without nudging the rest of the page.
  minHeight: '2.8em',
};

const errorValueStyle: CSSProperties = {
  fontWeight: 700,
  color: 'var(--accent)',
};

export function TaylorApproximation({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: TaylorApproximationVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const preset = visual.func;
  const center = visual.center ?? 0;
  const maxDegree = clamp(Math.round(visual.maxDegree ?? 8), 0, MAX_ALLOWED_DEGREE);
  const initialDegree = clamp(Math.round(visual.degree ?? 1), 0, maxDegree);
  const [degree, setDegree] = useState(initialDegree);
  const activeDegree = clamp(degree, 0, maxDegree);

  // Filled portion of the slider track (0..1) → percentage for the shared
  // WebKit track-fill gradient (Firefox fills its progress natively).
  const sliderProgress = maxDegree > 0 ? (activeDegree / maxDegree) * 100 : 0;

  // Interaction gating: fire once when the learner adjusts the degree control
  // (slider drag or keyboard both surface through its onChange). When the degree
  // is fixed (maxDegree 0) the slider can't move, so the figure's first pointer
  // interaction becomes the fallback path so completion can never get stuck.
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Self-demo: ramp the degree up to its maximum so the dashed polynomial visibly
  // hugs f over a widening interval and the truncation error shrinks.
  const demo = useScalarDemonstration({
    demonstrate,
    value: activeDegree,
    initial: initialDegree,
    target: maxDegree,
    apply: setDegree,
    enabled: maxDegree > 0,
    round: (value) => clamp(Math.round(value), 0, maxDegree),
    onInteraction: fireInteractionComplete,
  });

  const xMin = visual.xMin ?? center - DEFAULT_HALF_WIDTH;
  const xMax = visual.xMax ?? center + DEFAULT_HALF_WIDTH;

  const { targetFn } = visual;
  const drawF = useMemo(
    () => targetFn ?? ((x: number) => targetValue(preset, x)),
    [targetFn, preset],
  );

  const coefficients = useMemo(
    () => Array.from({ length: maxDegree + 1 }, (_, k) => taylorCoefficient(preset, center, k)),
    [preset, center, maxDegree],
  );

  const { yMin, yMax } = useMemo(
    () => computeYWindow(preset, drawF, center, xMin, xMax, visual.yMin, visual.yMax),
    [preset, drawF, center, xMin, xMax, visual.yMin, visual.yMax],
  );

  const scale = useMemo(
    () => createPlotScale({ xMin, xMax, yMin, yMax }),
    [xMin, xMax, yMin, yMax],
  );

  const polynomialAt = (x: number) => evaluatePolynomial(coefficients, center, activeDegree, x);

  const clipMargin = (yMax - yMin) * 0.04;
  const clipY = (y: number) =>
    Number.isFinite(y) && y >= yMin - clipMargin && y <= yMax + clipMargin ? y : Number.NaN;

  const functionPathData = functionPath((x) => clipY(drawF(x)), scale, { samples: SAMPLE_COUNT });
  const polynomialPathData = functionPath((x) => clipY(polynomialAt(x)), scale, {
    samples: SAMPLE_COUNT,
  });

  const centerValue = drawF(center);
  const hasCenter =
    Number.isFinite(centerValue) && center >= xMin && center <= xMax;

  const sampleX0 = computeSampleX0(preset, center, xMin, xMax);
  const fAtSample = drawF(sampleX0);
  const pAtSample = polynomialAt(sampleX0);
  const sampleError = Math.abs(fAtSample - pAtSample);
  const showSample = Number.isFinite(fAtSample) && Number.isFinite(pAtSample);

  const sampleSvgX = scale.toSvgX(sampleX0);
  const sampleFSvgY = scale.toSvgY(clamp(fAtSample, yMin, yMax));
  const samplePSvgY = scale.toSvgY(clamp(pAtSample, yMin, yMax));

  const isMaclaurin = center === 0;
  const presetLatex = PRESET_LATEX[preset];
  const evalPoint = isMaclaurin ? '0' : formatNumber(center);
  const powerTerm = isMaclaurin
    ? 'x^{k}'
    : center > 0
      ? `(x-${formatNumber(center)})^{k}`
      : `(x+${formatNumber(-center)})^{k}`;
  const captionLatex = `P_{${activeDegree}}(x)=\\sum_{k=0}^{${activeDegree}}\\frac{f^{(k)}(${evalPoint})}{k!}\\,${powerTerm}`;

  return (
    <WidgetFigure
      label={visual.label}
      caption={<MathText text={`$${captionLatex}$`} />}
      instruction={
        <>
          Drag the slider to raise the degree {isMaclaurin ? '(Maclaurin series)' : 'of the Taylor series'};
          the dashed polynomial hugs <MathText text={`$${presetLatex}$`} /> over a widening interval.
        </>
      }
    >
      <PlotFrame
        scale={scale}
        ariaLabel={`${visual.label} - Taylor approximation`}
        onPointerDown={maxDegree === 0 ? fireInteractionComplete : undefined}
      >
        <path className="graph-curve" d={functionPathData} aria-label={`f(x) = ${presetLatex}`} />
        <path
          className="widget-approx-curve"
          d={polynomialPathData}
          aria-label={`degree ${activeDegree} Taylor polynomial`}
        />
        {showSample ? (
          <>
            <line
              x1={sampleSvgX}
              y1={PLOT_HEIGHT - PLOT_PADDING}
              x2={sampleSvgX}
              y2={Math.min(sampleFSvgY, samplePSvgY)}
              className="widget-grid-line"
            />
            <line
              x1={sampleSvgX}
              y1={sampleFSvgY}
              x2={sampleSvgX}
              y2={samplePSvgY}
              style={{ stroke: 'var(--accent)', strokeWidth: 2.5 }}
            />
            <circle
              cx={sampleSvgX}
              cy={samplePSvgY}
              r={4.5}
              aria-label={`polynomial value at x = ${formatNumber(sampleX0)}`}
              style={{ fill: 'var(--info)' }}
            />
            <circle
              className="graph-point"
              cx={sampleSvgX}
              cy={sampleFSvgY}
              r={4.5}
              aria-label={`function value at x = ${formatNumber(sampleX0)}`}
            />
          </>
        ) : null}
        {hasCenter ? (
          <circle
            className="graph-point"
            cx={scale.toSvgX(center)}
            cy={scale.toSvgY(clamp(centerValue, yMin, yMax))}
            r={6}
            aria-label={`expansion center at x = ${formatNumber(center)}`}
          />
        ) : null}
      </PlotFrame>

      <div style={controlsStyle}>
        <label style={sliderRowStyle}>
          <span style={sliderLabelStyle}>
            Degree d = {activeDegree}
          </span>
          <input
            className="widget-slider"
            type="range"
            min={0}
            max={maxDegree}
            step={1}
            value={activeDegree}
            style={{ ...sliderStyle, '--widget-slider-progress': `${sliderProgress}%` } as CSSProperties}
            aria-label="Taylor polynomial degree"
            onPointerDown={() => demo.cancel()}
            onChange={(event) => {
              demo.cancel();
              setDegree(clamp(Number(event.target.value), 0, maxDegree));
              fireInteractionComplete();
            }}
          />
          <span style={sliderLabelStyle}>max {maxDegree}</span>
        </label>
        <div style={readoutStyle} role="status" aria-live="polite">
          <span>x₀ = {formatNumber(sampleX0)}</span>
          <span>f(x₀) = {formatNumber(fAtSample)}</span>
          <span>
            P<sub>{activeDegree}</sub>(x₀) = {formatNumber(pAtSample)}
          </span>
          <span>
            error |f − P| = <span style={errorValueStyle}>{formatError(sampleError)}</span>
          </span>
        </div>
      </div>
    </WidgetFigure>
  );
}
