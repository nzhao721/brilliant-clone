// Widget: parametric-curve
//
// Traces (x(t), y(t)) for t in [tMin, tMax] as a smooth path, with a tracer the
// learner can drag along the curve (or scrub with the slider). A single, bold
// direction / velocity arrow is drawn AT THE TRACER so the direction of travel
// reads at a glance: when `showTangent` it is the true velocity (x'(t), y'(t))
// whose length is the speed, otherwise it is a fixed-length heading arrow. A few
// faint ticks along the curve give static context without cluttering the plot.
// The readout shows the current t and the point (x, y).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { MathText } from '../MathText';
import {
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  WidgetFigure,
  capturePointer,
  clamp,
  createPlotScale,
  defaultTicks,
  formatNumber,
  pointerToData,
  snapToStep,
} from './plotFrame';
import type { PlotScale } from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';
import './widgetSlider.css';

/** Named parametric paths. */
export type ParametricPreset =
  | 'circle' // (cos t, sin t)
  | 'ellipse' // (a cos t, b sin t)
  | 'parabola-sideways' // (t^2, 2t)
  | 'semicubical' // (t^2, t^3)
  | 'lissajous' // (sin 2t, sin 3t)
  | 'cycloid' // (t - sin t, 1 - cos t)
  | 'spiral' // (t cos t, t sin t)
  | 'line'; // (1 + 2t, 1 + t)

export type ParametricCurveVisual = {
  type: 'parametric-curve';
  label: string;
  /** Path preset (overridden by `xOfT` / `yOfT`). */
  curve: ParametricPreset;
  /** Parameter start. */
  tMin: number;
  /** Parameter end. */
  tMax: number;
  /** Initial tracer position (default tMin). */
  initialT?: number;
  /** Draw the tangent / velocity vector at the tracer (default false). */
  showTangent?: boolean;
  /** Draw arrowheads indicating direction of travel (default true). */
  showDirection?: boolean;
  /** Visible domain (defaults to fit the curve, often symmetric). */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  /** Optional custom components; presets remain the serializable default. */
  xOfT?: (t: number) => number;
  yOfT?: (t: number) => number;
};

type ParametricFn = (t: number) => number;
type Sample = { t: number; x: number; y: number };

const INNER_WIDTH = PLOT_WIDTH - PLOT_PADDING * 2;
const INNER_HEIGHT = PLOT_HEIGHT - PLOT_PADDING * 2;
const SAMPLE_COUNT = 240;

// Direction / velocity arrow geometry (all in 360x220 viewBox units, so they
// stay proportionate after the shared figure is scaled down to the height cap).
const ARROW_HALF_ANGLE = 0.46; // half opening of the arrowhead wedge
const PATH_ARROW_COUNT = 3; // faint "increasing t" ticks spaced along the curve
const PATH_ARROW_SIZE = 7; // small + subtle, clearly secondary to the tracer arrow
const HEADING_ARROW_LEN = 36; // fixed length of the tracer heading arrow (no tangent)
const HEADING_HEAD_SIZE = 14; // big, solid arrowhead on the heading arrow
const VELOCITY_TARGET_LEN = 66; // longest velocity arrow (scales by speed)
const VELOCITY_HEAD_MIN = 8;
const VELOCITY_HEAD_MAX = 16;

/** Preset (x(t), y(t)) pairs. Ellipse uses a = 3, b = 2. */
const PRESETS: Record<ParametricPreset, { x: ParametricFn; y: ParametricFn }> = {
  circle: { x: (t) => Math.cos(t), y: (t) => Math.sin(t) },
  ellipse: { x: (t) => 3 * Math.cos(t), y: (t) => 2 * Math.sin(t) },
  'parabola-sideways': { x: (t) => t * t, y: (t) => 2 * t },
  semicubical: { x: (t) => t * t, y: (t) => t * t * t },
  lissajous: { x: (t) => Math.sin(2 * t), y: (t) => Math.sin(3 * t) },
  cycloid: { x: (t) => t - Math.sin(t), y: (t) => 1 - Math.cos(t) },
  spiral: { x: (t) => t * Math.cos(t), y: (t) => t * Math.sin(t) },
  line: { x: (t) => 1 + 2 * t, y: (t) => 1 + t },
};

/** Pad a [min, max] data range by 12%, widening degenerate ranges to a unit. */
function fitRange(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [-1, 1];
  }
  const span = max - min;
  if (span < 1e-6) {
    const center = (min + max) / 2;
    return [center - 1, center + 1];
  }
  const pad = span * 0.12;
  return [min - pad, max + pad];
}

type ParametricModel = {
  samples: Sample[];
  domain: { xMin: number; xMax: number; yMin: number; yMax: number };
  xOfT: ParametricFn;
  yOfT: ParametricFn;
  velocity: (t: number) => { vx: number; vy: number };
  tMin: number;
  tMax: number;
};

function buildModel(visual: ParametricCurveVisual): ParametricModel {
  const { tMin, tMax } = visual;
  const preset = PRESETS[visual.curve] ?? PRESETS.circle;
  const xOfT = visual.xOfT ?? preset.x;
  const yOfT = visual.yOfT ?? preset.y;

  const samples: Sample[] = [];
  let xLo = Infinity;
  let xHi = -Infinity;
  let yLo = Infinity;
  let yHi = -Infinity;

  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const t = tMin + ((tMax - tMin) * index) / SAMPLE_COUNT;
    const x = xOfT(t);
    const y = yOfT(t);
    samples.push({ t, x, y });
    if (Number.isFinite(x)) {
      xLo = Math.min(xLo, x);
      xHi = Math.max(xHi, x);
    }
    if (Number.isFinite(y)) {
      yLo = Math.min(yLo, y);
      yHi = Math.max(yHi, y);
    }
  }

  let [fitXMin, fitXMax] = fitRange(xLo, xHi);
  let [fitYMin, fitYMax] = fitRange(yLo, yHi);

  // Equalise the scale so circles look circular: stretch the narrower axis until
  // the data aspect ratio matches the (wider-than-tall) canvas aspect ratio.
  const pixelAspect = INNER_WIDTH / INNER_HEIGHT;
  const spanX = fitXMax - fitXMin;
  const spanY = fitYMax - fitYMin;
  if (spanX / spanY < pixelAspect) {
    const target = spanY * pixelAspect;
    const center = (fitXMin + fitXMax) / 2;
    fitXMin = center - target / 2;
    fitXMax = center + target / 2;
  } else {
    const target = spanX / pixelAspect;
    const center = (fitYMin + fitYMax) / 2;
    fitYMin = center - target / 2;
    fitYMax = center + target / 2;
  }

  const domain = {
    xMin: visual.xMin ?? fitXMin,
    xMax: visual.xMax ?? fitXMax,
    yMin: visual.yMin ?? fitYMin,
    yMax: visual.yMax ?? fitYMax,
  };

  // Central-difference derivative works for every preset and any custom x/y.
  const h = Math.max(Math.abs(tMax - tMin) / 1e4, 1e-5);
  const velocity = (t: number) => ({
    vx: (xOfT(t + h) - xOfT(t - h)) / (2 * h),
    vy: (yOfT(t + h) - yOfT(t - h)) / (2 * h),
  });

  return { samples, domain, xOfT, yOfT, velocity, tMin, tMax };
}

/** Polyline path through the samples; the pen lifts on non-finite points. */
function buildPath(samples: Sample[], scale: PlotScale): string {
  let path = '';
  let penDown = false;
  for (const sample of samples) {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      penDown = false;
      continue;
    }
    const sx = scale.toSvgX(sample.x).toFixed(2);
    const sy = scale.toSvgY(sample.y).toFixed(2);
    path += `${penDown ? 'L' : 'M'} ${sx} ${sy} `;
    penDown = true;
  }
  return path.trim();
}

/** Triangle `points` for a solid arrowhead whose tip sits at (tipX, tipY). */
function arrowHead(tipX: number, tipY: number, angle: number, size: number): string {
  const back = angle + Math.PI;
  const lx = tipX + size * Math.cos(back - ARROW_HALF_ANGLE);
  const ly = tipY + size * Math.sin(back - ARROW_HALF_ANGLE);
  const rx = tipX + size * Math.cos(back + ARROW_HALF_ANGLE);
  const ry = tipY + size * Math.sin(back + ARROW_HALF_ANGLE);
  return `${tipX.toFixed(2)},${tipY.toFixed(2)} ${lx.toFixed(2)},${ly.toFixed(2)} ${rx.toFixed(2)},${ry.toFixed(2)}`;
}

type Arrow = { x1: number; y1: number; x2: number; y2: number; head: string; size: number };

/**
 * An arrow from (sx, sy) to the tip (tx, ty): the shaft stops at the BASE of the
 * solid arrowhead (so the round line cap never pokes through it) and the head is
 * a filled triangle of `headSize`. Pure, so the geometry is unit-testable.
 */
function buildArrow(sx: number, sy: number, tx: number, ty: number, headSize: number): Arrow {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy);
  const ux = len > 1e-6 ? dx / len : 1;
  const uy = len > 1e-6 ? dy / len : 0;
  const angle = Math.atan2(dy, dx);
  const shaftLen = Math.max(0, len - headSize * Math.cos(ARROW_HALF_ANGLE));
  return {
    x1: sx,
    y1: sy,
    x2: sx + ux * shaftLen,
    y2: sy + uy * shaftLen,
    head: arrowHead(tx, ty, angle, headSize),
    size: headSize,
  };
}

/**
 * Thin a dense default-tick list to about half, always keeping the tick nearest
 * zero (so the origin stays labelled). Sparse axes (<= 6 ticks) are untouched.
 * This keeps the grid/labels subtle on wide-range curves like the spiral.
 */
function thinTicks(ticks: number[]): number[] {
  if (ticks.length <= 6) {
    return ticks;
  }
  let zeroIndex = 0;
  let closest = Infinity;
  ticks.forEach((tick, index) => {
    const distance = Math.abs(tick);
    if (distance < closest) {
      closest = distance;
      zeroIndex = index;
    }
  });
  return ticks.filter((_, index) => Math.abs(index - zeroIndex) % 2 === 0);
}

export function ParametricCurve({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: ParametricCurveVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const showDirection = visual.showDirection ?? true;
  const showTangent = visual.showTangent ?? false;

  const model = useMemo(() => buildModel(visual), [visual]);
  const scale = useMemo(() => createPlotScale(model.domain), [model]);

  const tLo = Math.min(model.tMin, model.tMax);
  const tHi = Math.max(model.tMin, model.tMax);

  const initialT = clamp(visual.initialT ?? model.tMin, tLo, tHi);
  const [t, setT] = useState(initialT);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction gating: fire once when the learner actually moves the tracer:
  // either by dragging it / the curve so t changes, or by scrubbing the slider.
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Self-demo: run the tracer across the whole parameter range, so the point
  // travels the entire curve (and the velocity vector, when shown, with it).
  const demo = useScalarDemonstration({
    demonstrate,
    value: clamp(t, tLo, tHi),
    initial: initialT,
    target: clamp(snapToStep(tHi), tLo, tHi),
    apply: (value) => setT(clamp(value, tLo, tHi)),
    enabled: tHi > tLo,
    onInteraction: fireInteractionComplete,
  });

  // Reset the tracer if the curve definition changes (kept primitive-only so an
  // inline xOfT/yOfT does not re-trigger this on every render and block drags).
  useEffect(() => {
    const lo = Math.min(visual.tMin, visual.tMax);
    const hi = Math.max(visual.tMin, visual.tMax);
    setT(clamp(visual.initialT ?? visual.tMin, lo, hi));
    setIsDragging(false);
  }, [visual.curve, visual.tMin, visual.tMax, visual.initialT]);

  const spanX = model.domain.xMax - model.domain.xMin || 1;
  const spanY = model.domain.yMax - model.domain.yMin || 1;
  const unitX = INNER_WIDTH / spanX;
  const unitY = INNER_HEIGHT / spanY;
  const dirSign = Math.sign(model.tMax - model.tMin) || 1;

  const pathD = useMemo(() => buildPath(model.samples, scale), [model, scale]);

  // Fewer ticks on dense axes keeps the grid + tick numbers quiet behind the curve.
  const xTicks = useMemo(
    () => thinTicks(defaultTicks(model.domain.xMin, model.domain.xMax)),
    [model.domain.xMin, model.domain.xMax],
  );
  const yTicks = useMemo(
    () => thinTicks(defaultTicks(model.domain.yMin, model.domain.yMax)),
    [model.domain.yMin, model.domain.yMax],
  );

  // One velocity scale for the whole curve (longest arrow ~VELOCITY_TARGET_LEN px)
  // so the drawn vectors keep honest relative lengths (e.g. the cycloid slows at
  // its cusps).
  const velScale = useMemo(() => {
    let maxSpeed = 0;
    for (const sample of model.samples) {
      const { vx, vy } = model.velocity(sample.t);
      const speed = Math.hypot(vx * unitX, vy * unitY);
      if (Number.isFinite(speed)) {
        maxSpeed = Math.max(maxSpeed, speed);
      }
    }
    return maxSpeed > 1e-9 ? VELOCITY_TARGET_LEN / maxSpeed : 0;
  }, [model, unitX, unitY]);

  // Faint "direction of increasing t" ticks spaced along the curve. Suppressed
  // when the tangent vector is shown, so that single bold arrow owns the plot.
  const pathArrows = useMemo(() => {
    if (!showDirection || showTangent) {
      return [] as Array<{ key: number; points: string }>;
    }
    const marks: Array<{ key: number; points: string }> = [];
    for (let index = 1; index <= PATH_ARROW_COUNT; index += 1) {
      const markT = model.tMin + ((model.tMax - model.tMin) * index) / (PATH_ARROW_COUNT + 1);
      const x = model.xOfT(markT);
      const y = model.yOfT(markT);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      const { vx, vy } = model.velocity(markT);
      const sdx = vx * unitX * dirSign;
      const sdy = -vy * unitY * dirSign;
      if (Math.hypot(sdx, sdy) < 1e-6) {
        continue;
      }
      const angle = Math.atan2(sdy, sdx);
      marks.push({ key: index, points: arrowHead(scale.toSvgX(x), scale.toSvgY(y), angle, PATH_ARROW_SIZE) });
    }
    return marks;
  }, [showDirection, showTangent, model, scale, unitX, unitY, dirSign]);

  const x = model.xOfT(t);
  const y = model.yOfT(t);
  const px = scale.toSvgX(x);
  const py = scale.toSvgY(y);
  const { vx, vy } = model.velocity(t);

  // Velocity / tangent vector, mapped into screen space (y inverted). Its length
  // is the speed; the longest one across the curve is VELOCITY_TARGET_LEN px.
  const screenVx = vx * unitX;
  const screenVy = -vy * unitY;
  const vecEndX = px + screenVx * velScale;
  const vecEndY = py + screenVy * velScale;
  const vecLen = Math.hypot(vecEndX - px, vecEndY - py);
  const showVelocity = showTangent && Number.isFinite(vecLen) && vecLen > 1.5;

  // Direction of travel (increasing t) at the tracer, in screen space.
  const travelDx = vx * unitX * dirSign;
  const travelDy = -vy * unitY * dirSign;
  const travelLen = Math.hypot(travelDx, travelDy);
  const showHeading = !showTangent && showDirection && Number.isFinite(travelLen) && travelLen > 1e-6;

  // The single bold arrow at the tracer: the true velocity when shown, otherwise
  // a fixed-length heading arrow. Either way it carries a big, solid arrowhead.
  let tracerArrow: Arrow | null = null;
  if (showVelocity) {
    const headSize = clamp(vecLen * 0.5, VELOCITY_HEAD_MIN, VELOCITY_HEAD_MAX);
    tracerArrow = buildArrow(px, py, vecEndX, vecEndY, headSize);
  } else if (showHeading) {
    const tipX = px + (travelDx / travelLen) * HEADING_ARROW_LEN;
    const tipY = py + (travelDy / travelLen) * HEADING_ARROW_LEN;
    tracerArrow = buildArrow(px, py, tipX, tipY, HEADING_HEAD_SIZE);
  }

  function nearestSampleT(event: PointerEvent<SVGSVGElement>): number {
    const target = pointerToData(event, scale);
    const targetX = scale.toSvgX(target.x);
    const targetY = scale.toSvgY(target.y);
    let bestT = model.samples.length > 0 ? model.samples[0].t : model.tMin;
    let bestDist = Infinity;
    for (const sample of model.samples) {
      if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
        continue;
      }
      const dx = scale.toSvgX(sample.x) - targetX;
      const dy = scale.toSvgY(sample.y) - targetY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestT = sample.t;
      }
    }
    return bestT;
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    demo.cancel();
    capturePointer(event);
    setIsDragging(true);
    // A degenerate parameter range (tMin === tMax) can never change t by
    // dragging, so count the pointer interaction itself to guarantee a path.
    if (tHi === tLo) {
      fireInteractionComplete();
    }
    setT(clamp(snapToStep(nearestSampleT(event)), tLo, tHi));
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }
    // Snap the parameter onto the 0.1 grid so dragging steps t in clean tenths;
    // (x(t), y(t)) is recomputed for the snapped t so the tracer stays on the curve.
    const next = clamp(snapToStep(nearestSampleT(event)), tLo, tHi);
    if (next !== t) {
      fireInteractionComplete();
    }
    setT(next);
  }

  const sliderStep = Math.abs(model.tMax - model.tMin) / 200 || 0.01;
  // Filled portion of the slider track (0..1) → percentage for the shared
  // WebKit track-fill gradient (Firefox fills its progress natively).
  const sliderProgress = tHi > tLo ? ((clamp(t, tLo, tHi) - tLo) / (tHi - tLo)) * 100 : 0;
  // Readout rendered as KaTeX (t, the point (x, y), and the optional velocity
  // (x', y')), with a thin muted rule between parts instead of a middle dot that
  // could be misread as multiplication.
  const readout = (
    <>
      <MathText text={`$t = ${formatNumber(t)}$`} />
      <span className="widget-readout-sep" aria-hidden="true" />
      <MathText text={`$(x, y) = (${formatNumber(x)}, ${formatNumber(y)})$`} />
      {showTangent ? (
        <>
          <span className="widget-readout-sep" aria-hidden="true" />
          <MathText text={`$(x', y') = (${formatNumber(vx)}, ${formatNumber(vy)})$`} />
        </>
      ) : null}
    </>
  );

  return (
    <WidgetFigure
      label={visual.label}
      // t / (x, y) [/ (x', y')] readout changes width as the tracer moves; reserve
      // an extra line when the velocity vector adds a third coordinate pair.
      captionLines={showTangent ? 3 : 2}
      caption={readout}
      instruction="Drag the point along the curve, or scrub the slider, to move t."
    >
      <PlotFrame
        scale={scale}
        ariaLabel={visual.label}
        xTicks={xTicks}
        yTicks={yTicks}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
      >
        <path className="graph-curve" d={pathD} />

        {pathArrows.map((mark) => (
          <polygon
            key={`dir-${mark.key}`}
            data-arrow="path"
            points={mark.points}
            style={{ fill: 'var(--brand-strong)', opacity: 0.45 }}
            aria-hidden="true"
          />
        ))}

        {tracerArrow ? (
          <>
            <line
              x1={tracerArrow.x1}
              y1={tracerArrow.y1}
              x2={tracerArrow.x2}
              y2={tracerArrow.y2}
              style={{ stroke: 'var(--info)', strokeWidth: 4.5, strokeLinecap: 'round' }}
            />
            <polygon
              data-arrow="tracer"
              points={tracerArrow.head}
              style={{
                fill: 'var(--info)',
                stroke: 'var(--surface)',
                strokeWidth: 1.25,
                strokeLinejoin: 'round',
              }}
              aria-hidden="true"
            />
          </>
        ) : null}

        <circle
          aria-label="draggable parameter tracer"
          className="graph-point graph-handle"
          cx={px}
          cy={py}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setIsDragging(true);
          }}
        />
      </PlotFrame>

      <label
        style={{
          alignItems: 'center',
          color: 'var(--ink-soft)',
          display: 'flex',
          fontSize: '0.85rem',
          fontWeight: 700,
          gap: '0.5rem',
          marginTop: '0.35rem',
        }}
      >
        <span>t</span>
        <input
          className="widget-slider"
          type="range"
          min={tLo}
          max={tHi}
          step={sliderStep}
          value={t}
          onPointerDown={() => demo.cancel()}
          onChange={(event) => {
            demo.cancel();
            setT(clamp(snapToStep(Number(event.target.value)), tLo, tHi));
            fireInteractionComplete();
          }}
          aria-label="parameter t"
          style={{ flex: 1, '--widget-slider-progress': `${sliderProgress}%` } as CSSProperties}
        />
      </label>
    </WidgetFigure>
  );
}
