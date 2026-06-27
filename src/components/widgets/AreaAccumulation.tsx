/*
 * Widget: area-accumulation — shades the signed area ∫_a^b f from a fixed `a` to a
 * draggable `b` (brand above the axis, warn below). In `accumulation` mode (or with
 * `showAccumulationCurve`) it overlays g(x) = ∫_a^x f and traces (b, g(b)): the FTC picture.
 */

import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { MathText } from '../MathText';
import {
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  WidgetFigure,
  capturePointer,
  clamp,
  createPlotScale,
  formatNumber,
  functionPath,
  linePath,
  pointerToData,
  snapToStep,
} from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';

/** Named integrands; several cross the axis so the signed area can go negative. */
export type AccumulationCurvePreset =
  | 'parabola' // opens up, dips below axis when shifted
  | 'line' // a + bx
  | 'sine' // crosses the axis -> signed area
  | 'cosine'
  | 'cubic'
  | 'shifted-parabola' // (x-3)^2 - k, dips negative in the middle
  | 'reciprocal-square'; // 1 / x^2 for improper-integral tails

export type AreaAccumulationVisual = {
  type: 'area-accumulation';
  label: string;
  /** Integrand preset (overridden by `fn` when supplied). */
  curve: AccumulationCurvePreset;
  /** Fixed lower limit where accumulation starts. */
  a: number;
  /** Initial position of the draggable upper limit. */
  initialB: number;
  /** 'signed-area' shades ∫_a^b f; 'accumulation' adds the g(x) overlay (default 'signed-area'). */
  mode?: 'signed-area' | 'accumulation';
  /** Force-draw the accumulation curve g(x) = ∫_a^x f even in signed-area mode. */
  showAccumulationCurve?: boolean;
  /** Visible domain (defaults: 0..6). */
  xMin?: number;
  xMax?: number;
  /** Visible range (auto-fit when omitted). */
  yMin?: number;
  yMax?: number;
  /** Optional custom integrand; presets remain the serializable default. */
  fn?: (x: number) => number;
};

/** Serializable integrands. `fn` overrides these when provided. */
const CURVE_FUNCTIONS: Record<AccumulationCurvePreset, (x: number) => number> = {
  parabola: (x) => x * x,
  line: (x) => x,
  sine: (x) => Math.sin(x),
  cosine: (x) => Math.cos(x),
  cubic: (x) => 0.25 * x ** 3 - 2 * x,
  'shifted-parabola': (x) => (x - 3) ** 2 - 2,
  'reciprocal-square': (x) => 1 / (x * x),
};

const PREFIX_STEPS = 600;
const AREA_SAMPLES = 160;
const CURVE_SAMPLES = 160;
const FIT_SAMPLES = 200;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function AreaAccumulation({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: AreaAccumulationVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const xMin = visual.xMin ?? 0;
  const xMax = visual.xMax ?? 6;
  const f = visual.fn ?? CURVE_FUNCTIONS[visual.curve];
  const a = clamp(visual.a, xMin, xMax);
  const showAccumulation = (visual.showAccumulationCurve ?? false) || visual.mode === 'accumulation';

  const initialB = clamp(visual.initialB, xMin, xMax);
  const [b, setB] = useState(initialB);
  const [isDragging, setIsDragging] = useState(false);

  /* Fire once after a real drag of b past a tiny threshold (not just a click). */
  const interactionFiredRef = useRef(false);
  const dragStartBRef = useRef<number | null>(null);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  /* Self-demo: sweep the upper limit b to xMax so the shaded area grows. */
  const demo = useScalarDemonstration({
    demonstrate,
    value: b,
    initial: initialB,
    target: clamp(snapToStep(xMax), xMin, xMax),
    apply: setB,
    onInteraction: fireInteractionComplete,
  });

  /* Trapezoid prefix sums: g(x) = ∫_a^x f = prefix(x) - prefix(a). Non-finite
     samples contribute nothing so poles never produce NaN. */
  const step = (xMax - xMin) / PREFIX_STEPS;
  const prefix = new Array<number>(PREFIX_STEPS + 1);
  prefix[0] = 0;
  let previous = finiteOrZero(f(xMin));
  for (let i = 1; i <= PREFIX_STEPS; i += 1) {
    const current = finiteOrZero(f(xMin + i * step));
    prefix[i] = prefix[i - 1] + ((previous + current) / 2) * step;
    previous = current;
  }

  const prefixAt = (x: number): number => {
    const t = clamp((x - xMin) / step, 0, PREFIX_STEPS);
    const index = Math.floor(t);
    if (index >= PREFIX_STEPS) {
      return prefix[PREFIX_STEPS];
    }
    return prefix[index] + (prefix[index + 1] - prefix[index]) * (t - index);
  };

  const baseline = prefixAt(a);
  const accumulatedAt = (x: number): number => prefixAt(x) - baseline;
  const signedArea = accumulatedAt(b);

  /* Auto-fit the range to f (and g when shown), capped so singular integrands don't blow it up. */
  const fitSamples: number[] = [];
  const wantsAutoFit = visual.yMin === undefined || visual.yMax === undefined;
  if (wantsAutoFit) {
    for (let i = 0; i <= FIT_SAMPLES; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / FIT_SAMPLES;
      const y = f(x);
      if (Number.isFinite(y)) {
        fitSamples.push(y);
      }
      if (showAccumulation) {
        fitSamples.push(accumulatedAt(x));
      }
    }
  }
  const sortedAbs = fitSamples.map((value) => Math.abs(value)).sort((p, q) => p - q);
  const medianAbs = sortedAbs.length > 0 ? sortedAbs[Math.floor(sortedAbs.length / 2)] : 1;
  const cap = Math.max(10, medianAbs * 20);
  const bounded = fitSamples.filter((value) => Math.abs(value) <= cap);
  const dataLow = bounded.length > 0 ? Math.min(0, ...bounded) : 0;
  const dataHigh = bounded.length > 0 ? Math.max(0, ...bounded) : 1;
  const pad = (dataHigh - dataLow) * 0.12 || 1;
  const yMin = visual.yMin ?? dataLow - pad;
  const yMax = visual.yMax ?? dataHigh + pad;

  const scale = createPlotScale({ xMin, xMax, yMin, yMax });
  const axisSvgY = scale.toSvgY(clamp(0, yMin, yMax));

  /** Keep marker / boundary coordinates finite and inside the canvas. */
  const viewY = (y: number): number => {
    if (!Number.isFinite(y)) {
      return y > 0 ? yMax : yMin;
    }
    return clamp(y, yMin, yMax);
  };

  /* Signed-area bands: closed strips between curve and axis, split into positive
     (brand) and negative (warn) parts. */
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const areaPoints: Array<{ x: number; y: number }> = [];
  if (hi > lo) {
    for (let i = 0; i <= AREA_SAMPLES; i += 1) {
      const x = lo + ((hi - lo) * i) / AREA_SAMPLES;
      areaPoints.push({ x, y: finiteOrZero(f(x)) });
    }
  }

  const buildBand = (keepSign: 1 | -1): string => {
    if (areaPoints.length === 0) {
      return '';
    }
    const clampSign = (y: number) => (keepSign > 0 ? Math.max(y, 0) : Math.min(y, 0));
    const first = areaPoints[0];
    const last = areaPoints[areaPoints.length - 1];
    let path = `M ${scale.toSvgX(first.x).toFixed(2)} ${axisSvgY.toFixed(2)}`;
    for (const point of areaPoints) {
      path += ` L ${scale.toSvgX(point.x).toFixed(2)} ${scale.toSvgY(viewY(clampSign(point.y))).toFixed(2)}`;
    }
    path += ` L ${scale.toSvgX(last.x).toFixed(2)} ${axisSvgY.toFixed(2)} Z`;
    return path;
  };

  const positiveBand = buildBand(1);
  const negativeBand = buildBand(-1);

  const gCurvePoints: Array<{ x: number; y: number }> = [];
  if (showAccumulation) {
    for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / CURVE_SAMPLES;
      gCurvePoints.push({ x, y: viewY(accumulatedAt(x)) });
    }
  }

  const fAtA = f(a);
  const fAtB = f(b);

  function moveUpperLimit(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }
    const next = pointerToData(event, scale);
    const nextB = clamp(snapToStep(next.x), xMin, xMax);
    setB(nextB);
    const start = dragStartBRef.current;
    if (start != null && Math.abs(nextB - start) > (xMax - xMin) / 100) {
      fireInteractionComplete();
    }
  }

  const caption = (
    <MathText
      text={
        showAccumulation
          ? `$g(${formatNumber(b)}) = \\int_{${formatNumber(a)}}^{${formatNumber(b)}} f\\,dx = ${formatNumber(signedArea)}$`
          : `$\\int_{${formatNumber(a)}}^{${formatNumber(b)}} f(x)\\,dx = ${formatNumber(signedArea)}$`
      }
    />
  );

  return (
    <WidgetFigure
      label={visual.label}
      caption={caption}
      instruction="Drag the point on the curve to move the upper limit b."
    >
      <PlotFrame
        scale={scale}
        ariaLabel={visual.label}
        onPointerMove={moveUpperLimit}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
      >
        {negativeBand ? <path className="widget-area-negative" d={negativeBand} /> : null}
        {positiveBand ? <path className="widget-area-fill" d={positiveBand} /> : null}

        <path className="graph-curve" d={functionPath(f, scale)} />

        {showAccumulation && gCurvePoints.length > 0 ? (
          <path
            className="widget-approx-curve"
            d={linePath(gCurvePoints, scale)}
            aria-label="accumulation curve g"
          />
        ) : null}

        <line
          x1={scale.toSvgX(a)}
          y1={axisSvgY}
          x2={scale.toSvgX(a)}
          y2={scale.toSvgY(viewY(fAtA))}
          stroke="#9aa4b2"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        <line
          className="graph-cursor"
          x1={scale.toSvgX(b)}
          y1={axisSvgY}
          x2={scale.toSvgX(b)}
          y2={scale.toSvgY(viewY(fAtB))}
        />

        {showAccumulation ? (
          <>
            <line
              className="graph-y-guide"
              x1={scale.toSvgX(xMin)}
              y1={scale.toSvgY(viewY(signedArea))}
              x2={scale.toSvgX(b)}
              y2={scale.toSvgY(viewY(signedArea))}
            />
            <circle
              aria-label="accumulated area point"
              cx={scale.toSvgX(b)}
              cy={scale.toSvgY(viewY(signedArea))}
              r={6}
              fill="var(--info)"
              stroke="var(--surface)"
              strokeWidth={3}
            />
          </>
        ) : null}

        {/* Endpoint letters just above the axis, nudged sideways to clear the b handle and kept in-plot. */}
        <text
          x={clamp(scale.toSvgX(a) - 10, PLOT_PADDING + 2, PLOT_WIDTH - PLOT_PADDING - 2)}
          y={axisSvgY - 7}
          textAnchor="end"
          fontSize={12}
          fontWeight={800}
          fill="#6b7280"
        >
          a
        </text>
        <text
          x={clamp(scale.toSvgX(b) + 10, PLOT_PADDING + 2, PLOT_WIDTH - PLOT_PADDING - 2)}
          y={axisSvgY - 7}
          textAnchor="start"
          fontSize={12}
          fontWeight={800}
          fill="#6b7280"
        >
          b
        </text>

        <circle
          aria-label="draggable upper limit b"
          className="graph-point graph-handle"
          cx={scale.toSvgX(b)}
          cy={scale.toSvgY(viewY(fAtB))}
          r={8}
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            dragStartBRef.current = b;
            setIsDragging(true);
          }}
        />
      </PlotFrame>
    </WidgetFigure>
  );
}
