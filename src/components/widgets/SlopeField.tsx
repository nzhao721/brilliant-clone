// Widget: slope-field
//
// A grid of short segments whose slopes come from dy/dx = F(x, y) for the chosen
// `equation`, each normalized to equal visual length. When `showSolution` is set
// a solution curve threads through the draggable `initial` point: an Euler
// polyline of step `eulerStep` when `method` is 'euler', otherwise a smooth RK4
// approximation of the exact integral curve. The logistic preset reads
// `growthRate` (k) and `carryingCapacity` (K).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

import {
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  WidgetFigure,
  capturePointer,
  clamp,
  createPlotScale,
  formatNumber,
  linePath,
  pointerToData,
  snapToStep,
} from './plotFrame';
import type { PlotDomain, PlotScale } from './plotFrame';
import {
  DemoPulseOverlay,
  lerp,
  pulseEnvelope,
  useDemonstration,
} from './useDemonstration';

/** Named right-hand sides F(x, y) for dy/dx = F(x, y). */
export type SlopeFieldPreset =
  | 'y' // dy/dx = y (exponential)
  | 'x' // dy/dx = x
  | 'xy' // dy/dx = x*y
  | 'x-plus-y' // dy/dx = x + y
  | 'x-minus-y'
  | 'logistic' // dy/dx = k*y*(1 - y/K)
  | 'sine-x' // dy/dx = sin(x)
  | 'neg-x-over-y' // circular field
  | 'constant'; // dy/dx = c

export type SlopeFieldVisual = {
  type: 'slope-field';
  label: string;
  /** Right-hand side preset (overridden by `fn`). */
  equation: SlopeFieldPreset;
  /** Visible domain (defaults: -6..6 / -6..6 unless overridden). */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  /** Number of field segments per axis (default 9). */
  density?: number;
  /** Draw a solution curve through `initial` (default false). */
  showSolution?: boolean;
  /** Initial condition for the solution curve / Euler walk. */
  initial?: { x: number; y: number };
  /** Exact integral curve or an Euler approximation (default 'exact'). */
  method?: 'exact' | 'euler';
  /** Euler step size h when method is 'euler' (default 0.5). */
  eulerStep?: number;
  /** Logistic growth rate k (logistic preset only, default 1). */
  growthRate?: number;
  /** Logistic carrying capacity K (logistic preset only, default 6). */
  carryingCapacity?: number;
  /** Optional custom field; presets remain the serializable default. */
  fn?: (x: number, y: number) => number;
};

type Point = { x: number; y: number };
type FieldFn = (x: number, y: number) => number;

const INNER_WIDTH = PLOT_WIDTH - PLOT_PADDING * 2;
const INNER_HEIGHT = PLOT_HEIGHT - PLOT_PADDING * 2;

// Below this |y| the reciprocal field is treated as vertical instead of dividing.
const SINGULARITY_EPS = 1e-6;

/** dy/dx = F(x, y) for each named preset. */
function presetSlope(
  preset: SlopeFieldPreset,
  x: number,
  y: number,
  growthRate: number,
  carryingCapacity: number,
): number {
  switch (preset) {
    case 'y':
      return y;
    case 'x':
      return x;
    case 'xy':
      return x * y;
    case 'x-plus-y':
      return x + y;
    case 'x-minus-y':
      return x - y;
    case 'logistic':
      return growthRate * y * (1 - y / carryingCapacity);
    case 'sine-x':
      return Math.sin(x);
    case 'neg-x-over-y':
      // Circular field: vertical tangents on the x-axis (guard the divide).
      return Math.abs(y) < SINGULARITY_EPS ? Number.POSITIVE_INFINITY : -x / y;
    case 'constant':
      return 1;
    default:
      return 0;
  }
}

type FieldSegment = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Build the density x density grid of equal-length direction segments. */
function buildSegments(field: FieldFn, scale: PlotScale, domain: PlotDomain, density: number): FieldSegment[] {
  const spanX = domain.xMax - domain.xMin;
  const spanY = domain.yMax - domain.yMin;

  // Pixel deltas for a one-unit step in data space (dy is negative: SVG y is flipped).
  const unitDx = scale.toSvgX(domain.xMin + 1) - scale.toSvgX(domain.xMin);
  const unitDy = scale.toSvgY(domain.yMin + 1) - scale.toSvgY(domain.yMin);
  const half = (0.8 * Math.min(INNER_WIDTH / density, INNER_HEIGHT / density)) / 2;

  const segments: FieldSegment[] = [];
  for (let i = 0; i < density; i += 1) {
    const gx = domain.xMin + ((i + 0.5) / density) * spanX;
    for (let j = 0; j < density; j += 1) {
      const gy = domain.yMin + ((j + 0.5) / density) * spanY;
      const slope = field(gx, gy);

      // Convert the data direction (1, slope) into pixels; verticals when slope blows up.
      let dirX: number;
      let dirY: number;
      if (Number.isFinite(slope)) {
        dirX = unitDx;
        dirY = unitDy * slope;
      } else {
        dirX = 0;
        dirY = unitDy;
      }

      const norm = Math.hypot(dirX, dirY) || 1;
      const hx = (dirX / norm) * half;
      const hy = (dirY / norm) * half;
      const cx = scale.toSvgX(gx);
      const cy = scale.toSvgY(gy);

      segments.push({
        key: `${i}-${j}`,
        x1: cx - hx,
        y1: cy - hy,
        x2: cx + hx,
        y2: cy + hy,
      });
    }
  }
  return segments;
}

/** One integration step (forward when h > 0, backward when h < 0). */
function stepOnce(field: FieldFn, x: number, y: number, h: number, method: 'exact' | 'euler'): Point | null {
  if (method === 'euler') {
    const slope = field(x, y);
    if (!Number.isFinite(slope)) {
      return null;
    }
    return { x: x + h, y: y + h * slope };
  }

  // Classic RK4: works with negative h to integrate backward too.
  const k1 = field(x, y);
  if (!Number.isFinite(k1)) {
    return null;
  }
  const k2 = field(x + h / 2, y + (h / 2) * k1);
  if (!Number.isFinite(k2)) {
    return null;
  }
  const k3 = field(x + h / 2, y + (h / 2) * k2);
  if (!Number.isFinite(k3)) {
    return null;
  }
  const k4 = field(x + h, y + h * k3);
  if (!Number.isFinite(k4)) {
    return null;
  }
  return { x: x + h, y: y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4) };
}

/** Walk one direction until leaving the frame, a singularity, or the step cap. */
function walk(
  field: FieldFn,
  start: Point,
  h: number,
  method: 'exact' | 'euler',
  domain: PlotDomain,
  maxSteps: number,
): Point[] {
  const points: Point[] = [];
  let x = start.x;
  let y = start.y;
  const yMargin = domain.yMax - domain.yMin;
  const yLow = domain.yMin - yMargin;
  const yHigh = domain.yMax + yMargin;

  for (let i = 0; i < maxSteps; i += 1) {
    const next = stepOnce(field, x, y, h, method);
    if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) {
      break;
    }
    x = next.x;
    y = next.y;
    points.push({ x, y });
    if (x <= domain.xMin || x >= domain.xMax || y < yLow || y > yHigh) {
      break;
    }
  }
  return points;
}

/** Solution curve through `start`, integrated forward and backward. */
function solutionCurve(
  field: FieldFn,
  start: Point,
  method: 'exact' | 'euler',
  h: number,
  domain: PlotDomain,
): Point[] {
  const spanX = domain.xMax - domain.xMin;
  const maxSteps = method === 'euler' ? Math.min(600, Math.ceil(spanX / h) + 2) : 460;
  const forward = walk(field, start, h, method, domain, maxSteps);
  const backward = walk(field, start, -h, method, domain, maxSteps);
  return [...backward.reverse(), start, ...forward];
}

/** Small rounded coordinate chip drawn next to the draggable handle. */
function PointLabel({ point, scale }: { point: Point; scale: PlotScale }) {
  const label = `(${formatNumber(point.x)}, ${formatNumber(point.y)})`;
  const svgX = scale.toSvgX(point.x);
  const svgY = scale.toSvgY(point.y);
  const labelHeight = 18;
  const labelWidth = label.length * 6.5 + 8;
  const nearRightEdge = svgX > PLOT_WIDTH - PLOT_PADDING - labelWidth - 14;
  const labelX = clamp(
    svgX + (nearRightEdge ? -labelWidth - 12 : 12),
    PLOT_PADDING,
    PLOT_WIDTH - PLOT_PADDING - labelWidth,
  );
  const labelY = clamp(svgY - 28, PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING - labelHeight);

  return (
    <g aria-hidden="true" className="graph-point-label-group">
      <rect className="graph-point-label-bg" x={labelX} y={labelY} width={labelWidth} height={labelHeight} rx={7} />
      <text
        className="graph-point-label"
        dominantBaseline="middle"
        x={labelX + labelWidth / 2}
        y={labelY + labelHeight / 2}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

export function SlopeField({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: SlopeFieldVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const domain = useMemo<PlotDomain>(
    () => ({
      xMin: visual.xMin ?? -6,
      xMax: visual.xMax ?? 6,
      yMin: visual.yMin ?? -6,
      yMax: visual.yMax ?? 6,
    }),
    [visual.xMin, visual.xMax, visual.yMin, visual.yMax],
  );
  const scale = useMemo(() => createPlotScale(domain), [domain]);

  const density = clamp(Math.round(visual.density ?? 9), 2, 21);
  const method = visual.method ?? 'exact';
  const showSolution = visual.showSolution ?? false;
  const growthRate = visual.growthRate ?? 1;
  const carryingCapacity = visual.carryingCapacity ?? 6;
  const eulerStep = clamp(visual.eulerStep ?? 0.5, 0.05, Math.max(0.1, domain.xMax - domain.xMin));

  const field = useMemo<FieldFn>(() => {
    if (visual.fn) {
      return visual.fn;
    }
    return (x, y) => presetSlope(visual.equation, x, y, growthRate, carryingCapacity);
  }, [visual.fn, visual.equation, growthRate, carryingCapacity]);

  const initialX = visual.initial?.x ?? 0;
  const initialY = visual.initial?.y ?? 1;
  const [point, setPoint] = useState<Point>(() => ({
    x: clamp(initialX, domain.xMin, domain.xMax),
    y: clamp(initialY, domain.yMin, domain.yMax),
  }));
  const [isDragging, setIsDragging] = useState(false);

  // Interaction-completion: fire once when the required action first happens.
  const interactionFired = useRef(false);
  function fireInteractionComplete() {
    if (!interactionFired.current) {
      interactionFired.current = true;
      onInteractionComplete?.();
    }
  }

  // Self-demo: drift the initial-condition point to a new spot so its solution
  // curve redraws on its own (every point rides its own curve through the field).
  // A bare field with no solution curve plays a brief highlight pulse instead.
  const [demoPulse, setDemoPulse] = useState(0);
  const demoTween = useRef({ from: point, to: point });
  const demo = useDemonstration(
    demonstrate,
    (progress) => {
      const tween = demoTween.current;
      setPoint({
        x: lerp(tween.from.x, tween.to.x, progress),
        y: lerp(tween.from.y, tween.to.y, progress),
      });
    },
    {
      enabled: showSolution,
      onStart: () => {
        const to = {
          x: clamp(snapToStep(lerp(domain.xMin, domain.xMax, 0.35)), domain.xMin, domain.xMax),
          y: clamp(snapToStep(lerp(domain.yMin, domain.yMax, 0.65)), domain.yMin, domain.yMax),
        };
        const samePlace = Math.hypot(point.x - to.x, point.y - to.y) < 1e-6;
        const from = samePlace
          ? {
              x: clamp(initialX, domain.xMin, domain.xMax),
              y: clamp(initialY, domain.yMin, domain.yMax),
            }
          : point;
        demoTween.current = { from, to };
        fireInteractionComplete();
      },
    },
  );
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    enabled: !showSolution,
  });

  // Re-seed the handle if the authored initial point or domain changes.
  useEffect(() => {
    setPoint({
      x: clamp(initialX, domain.xMin, domain.xMax),
      y: clamp(initialY, domain.yMin, domain.yMax),
    });
  }, [initialX, initialY, domain]);

  const segments = useMemo(
    () => buildSegments(field, scale, domain, density),
    [field, scale, domain, density],
  );

  const solution = useMemo(() => {
    if (!showSolution) {
      return [] as Point[];
    }
    const h = method === 'euler' ? eulerStep : (domain.xMax - domain.xMin) / 400;
    return solutionCurve(field, point, method, h, domain);
  }, [showSolution, method, eulerStep, field, point, domain]);

  const solutionPath = solution.length > 1 ? linePath(solution, scale) : '';

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }
    const next = pointerToData(event, scale);
    const rounded = { x: snapToStep(next.x), y: snapToStep(next.y) };
    // A real drag moves the initial-condition point; a no-op click does not.
    if (rounded.x !== point.x || rounded.y !== point.y) {
      fireInteractionComplete();
    }
    setPoint(rounded);
  }

  function stopDragging() {
    setIsDragging(false);
  }

  // Without a solution curve there is no draggable seed, so any pointer press
  // on the field counts as the required interaction.
  function handleFigurePointerDown() {
    if (!showSolution) {
      fireInteractionComplete();
    }
  }

  const caption = showSolution ? (
    <>
      Initial point (x₀, y₀) = ({formatNumber(point.x)}, {formatNumber(point.y)})
    </>
  ) : undefined;
  const instruction = showSolution
    ? 'Drag the point to move the initial condition.'
    : 'Each segment shows the slope dy/dx at that grid point.';

  return (
    <WidgetFigure label={visual.label} caption={caption} instruction={instruction}>
      <PlotFrame
        scale={scale}
        ariaLabel={visual.label}
        onPointerDown={handleFigurePointerDown}
        onPointerMove={updateFromPointer}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        onPointerCancel={stopDragging}
      >
        {segments.map((segment) => (
          <line
            key={segment.key}
            className="widget-field-segment"
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
          />
        ))}
        {showSolution && solutionPath ? (
          <path
            aria-label="solution curve"
            className={method === 'euler' ? 'widget-approx-curve' : 'graph-curve'}
            d={solutionPath}
          />
        ) : null}
        {showSolution ? (
          <>
            <circle
              aria-label="draggable initial condition"
              className="graph-point graph-handle"
              cx={scale.toSvgX(point.x)}
              cy={scale.toSvgY(point.y)}
              r={8}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => {
                demo.cancel();
                capturePointer(event);
                setIsDragging(true);
              }}
            />
            <PointLabel point={point} scale={scale} />
          </>
        ) : null}
        <DemoPulseOverlay pulse={demoPulse} />
      </PlotFrame>
    </WidgetFigure>
  );
}
