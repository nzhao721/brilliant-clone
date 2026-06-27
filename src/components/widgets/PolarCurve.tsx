/*
 * Widget: polar-curve — plots r = f(θ) on a centred polar grid. `mode`: 'curve'
 * traces the whole curve, 'point' drags one angle showing (r, θ) and (x, y), and
 * 'area-sweep' shades the sector from thetaMin to a draggable θ with its ½∫r²dθ.
 */

import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import {
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PointLabel,
  WidgetFigure,
  capturePointer,
  clamp,
  createPlotScale,
  formatNumber,
  linePath,
  pointerToData,
  snapToStep,
} from './plotFrame';
import type { PlotScale } from './plotFrame';
import {
  DemoPulseOverlay,
  pulseEnvelope,
  useDemonstration,
  useScalarDemonstration,
} from './useDemonstration';

/** Named polar curves r(theta). */
export type PolarPreset =
  | 'circle' // r = radius
  | 'cardioid' // r = a(1 + cos θ)
  | 'rose' // r = a cos(petals · θ)
  | 'spiral' // r = a·θ (Archimedean)
  | 'limacon' // r = a + b cos θ
  | 'line-through-origin'; // θ = const ray

export type PolarCurveVisual = {
  type: 'polar-curve';
  label: string;
  /** Curve preset (overridden by `rOfTheta`). */
  curve: PolarPreset;
  /** Angle sweep start in radians (default 0). */
  thetaMin?: number;
  /** Angle sweep end in radians (default 2π). */
  thetaMax?: number;
  /** Scalar radius for the circle preset (default 2). */
  radius?: number;
  /** Leading coefficient a for cardioid/rose/limaçon/spiral (default 2). */
  a?: number;
  /** Secondary coefficient b for the limaçon (default 1). */
  b?: number;
  /** Petal count for the rose preset (default 3). */
  petals?: number;
  /** Interaction mode (default 'curve'). */
  mode?: 'curve' | 'area-sweep' | 'point';
  /** Initial angle for sweep/point modes (default thetaMin). */
  initialTheta?: number;
  /** Draw the polar grid of circles and rays (default true). */
  showGrid?: boolean;
  /** Half-width of the square visible window in data units (default 6). */
  viewRadius?: number;
  /** Optional custom radius function; presets remain the serializable default. */
  rOfTheta?: (theta: number) => number;
};

const TWO_PI = Math.PI * 2;
const INNER_WIDTH = PLOT_WIDTH - PLOT_PADDING * 2;
const INNER_HEIGHT = PLOT_HEIGHT - PLOT_PADDING * 2;

/** r(θ) for the active preset, or the caller-supplied `rOfTheta`. */
function radiusFor(visual: PolarCurveVisual, theta: number): number {
  if (visual.rOfTheta) {
    return visual.rOfTheta(theta);
  }
  const a = visual.a ?? 2;
  const b = visual.b ?? 1;
  const radius = visual.radius ?? 2;
  const petals = visual.petals ?? 3;
  switch (visual.curve) {
    case 'circle':
      return radius;
    case 'cardioid':
      return a * (1 + Math.cos(theta));
    case 'rose':
      return a * Math.cos(petals * theta);
    case 'spiral':
      return a * theta;
    case 'limacon':
      return a + b * Math.cos(theta);
    case 'line-through-origin':
      return radius;
    default:
      return radius;
  }
}

function normalizeAngle(theta: number): number {
  const t = theta % TWO_PI;
  return t < 0 ? t + TWO_PI : t;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/**
 * Render k·(π/12) as a reduced multiple-of-π string (e.g. 2 -> "π/6", 12 -> "π"),
 * for the angle spoke labels and the tracer's θ readout on the π/12 grid.
 */
function piTwelfthsLabel(k: number): string {
  if (k === 0) {
    return '0';
  }
  const sign = k < 0 ? '-' : '';
  const n = Math.abs(k);
  const g = gcd(n, 12);
  const num = n / g;
  const den = 12 / g;
  const numerator = num === 1 ? 'π' : `${num}π`;
  return den === 1 ? `${sign}${numerator}` : `${sign}${numerator}/${den}`;
}

/**
 * Describe an angle for the readouts: an exact multiple of π when θ lands on the
 * π/12 grid, else decimal radians. `exact` lets callers append "rad" only for decimals.
 */
function describeAngle(theta: number): { text: string; exact: boolean } {
  const step = Math.PI / 12;
  const k = Math.round(theta / step);
  if (snapToStep(k * step) === snapToStep(theta)) {
    return { text: piTwelfthsLabel(k), exact: true };
  }
  return { text: formatNumber(theta), exact: false };
}

/** "θ = π/2" for grid angles, "θ = 1.5 rad" otherwise. */
function angleReadout(theta: number): string {
  const { text, exact } = describeAngle(theta);
  return exact ? `θ = ${text}` : `θ = ${text} rad`;
}

/** Clean (r, θ) chip text for the tracer label, e.g. "(3, π/6)". */
function polarPairText(r: number, theta: number): string {
  return `(${formatNumber(r)}, ${describeAngle(theta).text})`;
}

/** Numeric 1/2 ∫_from^to r(θ)^2 dθ via the trapezoid rule (~1° steps). */
function sweptArea(visual: PolarCurveVisual, from: number, to: number): number {
  const span = to - from;
  if (span === 0) {
    return 0;
  }
  const steps = Math.max(2, Math.min(720, Math.ceil(Math.abs(span) / (Math.PI / 180))));
  const h = span / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i += 1) {
    const r = radiusFor(visual, from + h * i);
    if (!Number.isFinite(r)) {
      continue;
    }
    sum += (i === 0 || i === steps ? 0.5 : 1) * r * r;
  }
  return Math.abs(0.5 * sum * h);
}

/** SVG path through r=f(θ) in (r cosθ, r sinθ) space; lifts the pen on blowups. */
function polarPath(
  visual: PolarCurveVisual,
  from: number,
  to: number,
  scale: PlotScale,
  samples: number,
): string {
  let path = '';
  let penDown = false;
  for (let i = 0; i <= samples; i += 1) {
    const theta = from + ((to - from) * i) / samples;
    const r = radiusFor(visual, theta);
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      penDown = false;
      continue;
    }
    path += `${penDown ? 'L' : 'M'} ${scale.toSvgX(x).toFixed(2)} ${scale.toSvgY(y).toFixed(2)} `;
    penDown = true;
  }
  return path.trim();
}

/** Filled sector origin → curve(from..to) → origin (the ½∫r²dθ region). */
function sectorPath(
  visual: PolarCurveVisual,
  from: number,
  to: number,
  scale: PlotScale,
  samples: number,
): string {
  const ox = scale.toSvgX(0).toFixed(2);
  const oy = scale.toSvgY(0).toFixed(2);
  let path = `M ${ox} ${oy} `;
  for (let i = 0; i <= samples; i += 1) {
    const theta = from + ((to - from) * i) / samples;
    const r = Number.isFinite(radiusFor(visual, theta)) ? radiusFor(visual, theta) : 0;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    path += `L ${scale.toSvgX(x).toFixed(2)} ${scale.toSvgY(y).toFixed(2)} `;
  }
  return `${path}L ${ox} ${oy} Z`;
}

/** Human-readable polar equation for the curve-mode readout. */
function equationText(visual: PolarCurveVisual): string {
  if (visual.rOfTheta) {
    return 'r = f(θ)';
  }
  const a = visual.a ?? 2;
  const b = visual.b ?? 1;
  const radius = visual.radius ?? 2;
  const petals = visual.petals ?? 3;
  switch (visual.curve) {
    case 'circle':
      return `r = ${formatNumber(radius)}`;
    case 'cardioid':
      return `r = ${formatNumber(a)}(1 + cos θ)`;
    case 'rose':
      return `r = ${formatNumber(a)} cos(${formatNumber(petals)}θ)`;
    case 'spiral':
      return `r = ${formatNumber(a)}θ`;
    case 'limacon':
      return `r = ${formatNumber(a)} + ${formatNumber(b)} cos θ`;
    case 'line-through-origin':
      return `θ = ${formatNumber(normalizeAngle(visual.initialTheta ?? visual.thetaMin ?? Math.PI / 4))} rad`;
    default:
      return 'r = f(θ)';
  }
}

/** Concentric integer-radius circles + 30° spokes, in `widget-grid-line`. */
function PolarGrid({ scale, viewRadius }: { scale: PlotScale; viewRadius: number }) {
  const ox = scale.toSvgX(0);
  const oy = scale.toSvgY(0);
  const pxPerUnit = scale.toSvgX(1) - scale.toSvgX(0);
  const rings: number[] = [];
  for (let r = 1; r <= Math.floor(viewRadius); r += 1) {
    rings.push(r);
  }
  const spokes: number[] = [];
  for (let k = 0; k < 12; k += 1) {
    spokes.push((k * Math.PI) / 6);
  }
  return (
    <g aria-hidden="true">
      {rings.map((r) => (
        <circle key={`ring-${r}`} className="widget-grid-line" cx={ox} cy={oy} r={r * pxPerUnit} />
      ))}
      {spokes.map((angle) => (
        <line
          key={`spoke-${angle.toFixed(3)}`}
          className="widget-grid-line"
          x1={ox}
          y1={oy}
          x2={scale.toSvgX(viewRadius * Math.cos(angle))}
          y2={scale.toSvgY(viewRadius * Math.sin(angle))}
        />
      ))}
    </g>
  );
}

/**
 * Polar grid labels (drawn over the curve): radius values along a 15° ray
 * (haloed, thinned when rings crowd), and angle labels just outside the outer
 * ring at each multiple of π/6.
 */
function PolarGridLabels({ scale, viewRadius }: { scale: PlotScale; viewRadius: number }) {
  const ox = scale.toSvgX(0);
  const oy = scale.toSvgY(0);
  const pxPerUnit = scale.toSvgX(1) - scale.toSvgX(0);
  const maxRing = Math.floor(viewRadius);

  /* Label every ring, or every other when crowded (~22px min spacing). */
  const labelStep = Math.max(1, Math.round(22 / pxPerUnit));
  const R_LABEL_ANGLE = Math.PI / 12; // 15°, between the 0 and π/6 spokes
  const rLabels: number[] = [];
  for (let r = labelStep; r <= maxRing; r += labelStep) {
    rLabels.push(r);
  }

  /* Place angle labels just beyond the outer ring. */
  const spokeLabelRadius = viewRadius * pxPerUnit + 12;

  return (
    <g aria-hidden="true">
      {rLabels.map((r) => {
        const lx = ox + r * pxPerUnit * Math.cos(R_LABEL_ANGLE);
        const ly = oy - r * pxPerUnit * Math.sin(R_LABEL_ANGLE);
        const text = formatNumber(r);
        const halfWidth = Math.max(8, text.length * 3.5 + 4);
        return (
          <g key={`r-label-${r}`}>
            <rect
              className="graph-point-label-bg"
              x={lx - halfWidth}
              y={ly - 8}
              width={halfWidth * 2}
              height={16}
              rx={4}
            />
            <text
              className="polar-r-label"
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 10, fontWeight: 700, fill: 'var(--ink-faint)' }}
            >
              {text}
            </text>
          </g>
        );
      })}
      {Array.from({ length: 12 }, (_, j) => {
        const angle = (j * Math.PI) / 6;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const lx = ox + spokeLabelRadius * ux;
        const ly = oy - spokeLabelRadius * uy;
        const textAnchor: 'start' | 'middle' | 'end' =
          ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
        const dominantBaseline: 'auto' | 'hanging' | 'central' =
          uy > 0.3 ? 'auto' : uy < -0.3 ? 'hanging' : 'central';
        return (
          <text
            key={`angle-label-${j}`}
            className="polar-angle-label"
            x={lx}
            y={ly}
            textAnchor={textAnchor}
            dominantBaseline={dominantBaseline}
            style={{ fontSize: 10, fontWeight: 600, fill: 'var(--ink-faint)' }}
          >
            {piTwelfthsLabel(2 * j)}
          </text>
        );
      })}
    </g>
  );
}

export function PolarCurve({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: PolarCurveVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const viewRadius = visual.viewRadius && visual.viewRadius > 0 ? visual.viewRadius : 6;
  const showGrid = visual.showGrid ?? true;
  const mode = visual.mode ?? 'curve';
  const thetaMin = visual.thetaMin ?? 0;
  const thetaMax = visual.thetaMax ?? TWO_PI;
  const lowTheta = Math.min(thetaMin, thetaMax);
  const highTheta = Math.max(thetaMin, thetaMax);
  const initialTheta = clamp(visual.initialTheta ?? thetaMin, lowTheta, highTheta);

  /* Square pixels (so circles read round): pin y to ±viewRadius and widen x to match. */
  const unit = INNER_HEIGHT / (2 * viewRadius);
  const xHalf = INNER_WIDTH / 2 / unit;
  const scale = createPlotScale({ xMin: -xHalf, xMax: xHalf, yMin: -viewRadius, yMax: viewRadius });

  const isLine = visual.curve === 'line-through-origin';
  const lineAngle = visual.initialTheta ?? visual.thetaMin ?? Math.PI / 4;

  const [theta, setTheta] = useState(initialTheta);
  const [lineT, setLineT] = useState(() => visual.radius ?? 2);
  const [dragging, setDragging] = useState(false);

  /* Fire once when the handle's value changes; in 'curve' mode (no handle) the
     first pointer interaction is the fallback. */
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  /* Self-demo by mode: sweep θ, slide the point along the ray, or pulse a static
     curve. Each counts as the gated interaction. */
  const hasAngleHandle = !isLine && (mode === 'area-sweep' || mode === 'point');
  const hasLineHandle = isLine && mode === 'point';
  const [demoPulse, setDemoPulse] = useState(0);
  const angleDemo = useScalarDemonstration({
    demonstrate,
    value: theta,
    initial: initialTheta,
    target: clamp(snapToStep(highTheta), lowTheta, highTheta),
    apply: (value) => setTheta(clamp(value, lowTheta, highTheta)),
    enabled: hasAngleHandle,
    onInteraction: fireInteractionComplete,
  });
  const lineDemo = useScalarDemonstration({
    demonstrate,
    value: lineT,
    initial: visual.radius ?? 2,
    target: snapToStep(viewRadius * 0.7),
    apply: setLineT,
    enabled: hasLineHandle,
    onInteraction: fireInteractionComplete,
  });
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    enabled: !hasAngleHandle && !hasLineHandle,
  });
  const cancelDemos = () => {
    angleDemo.cancel();
    lineDemo.cancel();
  };

  const stopDrag = () => setDragging(false);

  function updateAngle(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) {
      return;
    }
    const { x, y } = pointerToData(event, scale);
    /* Unwrap toward the current θ so multi-turn curves don't jump at the ±π cut. */
    let candidate = Math.atan2(y, x);
    while (candidate - theta > Math.PI) {
      candidate -= TWO_PI;
    }
    while (theta - candidate > Math.PI) {
      candidate += TWO_PI;
    }
    const next = clamp(snapToStep(candidate), lowTheta, highTheta);
    if (next !== theta) {
      fireInteractionComplete();
    }
    setTheta(next);
  }

  function updateLine(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) {
      return;
    }
    const { x, y } = pointerToData(event, scale);
    const next = snapToStep(x * Math.cos(lineAngle) + y * Math.sin(lineAngle));
    if (next !== lineT) {
      fireInteractionComplete();
    }
    setLineT(next);
  }

  const grid = showGrid ? <PolarGrid scale={scale} viewRadius={viewRadius} /> : null;
  const gridLabels = showGrid ? <PolarGridLabels scale={scale} viewRadius={viewRadius} /> : null;

  let caption: string;
  let instruction: string | null = null;
  let onMove: ((event: PointerEvent<SVGSVGElement>) => void) | undefined;
  let content: ReactNode;
  /* (r, θ) chip for the tracer, drawn above grid labels; null when no tracer. */
  let tracerLabel: ReactNode = null;

  if (isLine) {
    const reach = Math.hypot(xHalf, viewRadius) + 1;
    const dirX = Math.cos(lineAngle);
    const dirY = Math.sin(lineAngle);
    const lineD = linePath(
      [
        { x: -reach * dirX, y: -reach * dirY },
        { x: reach * dirX, y: reach * dirY },
      ],
      scale,
    );

    if (mode === 'point') {
      const px = lineT * dirX;
      const py = lineT * dirY;
      const shownTheta = lineT >= 0 ? normalizeAngle(lineAngle) : normalizeAngle(lineAngle + Math.PI);
      caption = `r = ${formatNumber(lineT)},  ${angleReadout(shownTheta)},  (x, y) = (${formatNumber(px)}, ${formatNumber(py)})`;
      instruction = 'Drag the point along the line through the origin.';
      onMove = updateLine;
      tracerLabel = (
        <PointLabel
          px={scale.toSvgX(px)}
          py={scale.toSvgY(py)}
          label={polarPairText(lineT, shownTheta)}
          pointRadius={8}
        />
      );
      content = (
        <>
          {grid}
          <path className="graph-curve" d={lineD} />
          <line
            className="graph-cursor"
            x1={scale.toSvgX(px)}
            y1={scale.toSvgY(py)}
            x2={scale.toSvgX(px)}
            y2={scale.toSvgY(0)}
          />
          <line
            className="graph-cursor"
            x1={scale.toSvgX(px)}
            y1={scale.toSvgY(py)}
            x2={scale.toSvgX(0)}
            y2={scale.toSvgY(py)}
          />
          <circle
            aria-label="draggable point on the line"
            className="graph-point graph-handle"
            role="button"
            tabIndex={0}
            cx={scale.toSvgX(px)}
            cy={scale.toSvgY(py)}
            r={8}
            onPointerDown={(event) => {
              cancelDemos();
              capturePointer(event);
              setDragging(true);
            }}
          />
        </>
      );
    } else {
      caption = equationText(visual);
      content = (
        <>
          {grid}
          <path className="graph-curve" d={lineD} />
        </>
      );
    }
  } else {
    const curveD = polarPath(visual, thetaMin, thetaMax, scale, 300);
    const r = radiusFor(visual, theta);
    const px = r * Math.cos(theta);
    const py = r * Math.sin(theta);
    const handle = (
      <circle
        aria-label="draggable angle handle"
        className="graph-point graph-handle"
        role="button"
        tabIndex={0}
        cx={scale.toSvgX(px)}
        cy={scale.toSvgY(py)}
        r={8}
        onPointerDown={(event) => {
          cancelDemos();
          capturePointer(event);
          setDragging(true);
        }}
      />
    );

    if (mode === 'area-sweep') {
      const samples = Math.max(2, Math.min(360, Math.ceil(Math.abs(theta - thetaMin) / (Math.PI / 90))));
      const sectorD = sectorPath(visual, thetaMin, theta, scale, samples);
      const area = sweptArea(visual, thetaMin, theta);
      caption = `Swept area = ½∫r²dθ ≈ ${formatNumber(area)}  (θ: ${describeAngle(thetaMin).text} → ${describeAngle(theta).text})`;
      instruction = 'Drag the point to sweep the shaded sector.';
      onMove = updateAngle;
      content = (
        <>
          {grid}
          <path className="widget-area-fill" d={sectorD} />
          <path className="graph-curve" d={curveD} />
          <line
            className="graph-secant"
            x1={scale.toSvgX(0)}
            y1={scale.toSvgY(0)}
            x2={scale.toSvgX(px)}
            y2={scale.toSvgY(py)}
          />
          {handle}
        </>
      );
    } else if (mode === 'point') {
      caption = `r = ${formatNumber(r)},  ${angleReadout(theta)},  (x, y) = (${formatNumber(px)}, ${formatNumber(py)})`;
      instruction = 'Drag the point around the curve.';
      onMove = updateAngle;
      tracerLabel = (
        <PointLabel
          px={scale.toSvgX(px)}
          py={scale.toSvgY(py)}
          label={polarPairText(r, theta)}
          pointRadius={8}
        />
      );
      content = (
        <>
          {grid}
          <path className="graph-curve" d={curveD} />
          <line
            className="graph-secant"
            x1={scale.toSvgX(0)}
            y1={scale.toSvgY(0)}
            x2={scale.toSvgX(px)}
            y2={scale.toSvgY(py)}
          />
          <line
            className="graph-cursor"
            x1={scale.toSvgX(px)}
            y1={scale.toSvgY(py)}
            x2={scale.toSvgX(px)}
            y2={scale.toSvgY(0)}
          />
          <line
            className="graph-cursor"
            x1={scale.toSvgX(px)}
            y1={scale.toSvgY(py)}
            x2={scale.toSvgX(0)}
            y2={scale.toSvgY(py)}
          />
          {handle}
        </>
      );
    } else {
      caption = equationText(visual);
      content = (
        <>
          {grid}
          <path className="graph-curve" d={curveD} />
        </>
      );
    }
  }

  return (
    <WidgetFigure label={visual.label} caption={caption} instruction={instruction}>
      {/* Draws its own polar grid instead of PlotFrame's cartesian axes, inside the 360×220 viewBox. */}
      <svg
        className="interactive-graph-svg"
        viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
        role="img"
        aria-label={visual.label}
        onPointerDown={onMove ? undefined : fireInteractionComplete}
        onPointerMove={onMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
        onPointerCancel={stopDrag}
      >
        {content}
        {gridLabels}
        {tracerLabel}
        <DemoPulseOverlay pulse={demoPulse} />
      </svg>
    </WidgetFigure>
  );
}
