/*
 * Widget: conic-section — draws a conic (circle/ellipse/hyperbola/parabola) in
 * standard position, with optional foci, asymptotes, and directrix. When
 * `interactive`, dragging a vertex/focus reshapes it as the eccentricity updates.
 */

import { useRef, useState } from 'react';
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
import {
  DemoPulseOverlay,
  pulseEnvelope,
  useDemonstration,
  useScalarDemonstration,
} from './useDemonstration';

export type ConicSectionVisual = {
  type: 'conic-section';
  label: string;
  /** Which conic to draw. */
  conic: 'ellipse' | 'hyperbola' | 'parabola' | 'circle';
  /** Semi-major axis / radius (default 3). */
  a?: number;
  /** Semi-minor axis (ellipse/hyperbola; default 2). */
  b?: number;
  /** Focal parameter for the parabola y = x^2/(4p) (default 1). */
  p?: number;
  /** Orientation of the major/opening axis (default 'horizontal'). */
  orientation?: 'horizontal' | 'vertical';
  /** Mark the foci (default false). */
  showFoci?: boolean;
  /** Draw hyperbola asymptotes (default true for hyperbolas). */
  showAsymptotes?: boolean;
  /** Draw the parabola directrix (default false). */
  showDirectrix?: boolean;
  /** Allow dragging a vertex to reshape and update eccentricity (default false). */
  interactive?: boolean;
  /** Half-width of the square visible window in data units (default 6). */
  viewRadius?: number;
};

type Pt = { x: number; y: number };
type Handle = { id: string; label: string; pos: Pt };

const MIN_AXIS = 0.4;
const ELLIPSE_SAMPLES = 160;
const HYPERBOLA_SAMPLES = 90;
const PARABOLA_SAMPLES = 80;

/** Keep author-supplied axes positive, falling back when zero/blank. */
function sanitizeAxis(value: number | undefined, fallback: number): number {
  const magnitude = Math.abs(value ?? fallback);
  return magnitude > 0 ? magnitude : fallback;
}

/** Keep the parabola focal length non-zero while preserving its sign. */
function sanitizeFocal(value: number | undefined, fallback: number): number {
  const next = value ?? fallback;
  return next === 0 ? fallback : next;
}

/** Closed ellipse / circle sampled as (semiX cos t, semiY sin t). */
function ellipsePoints(semiX: number, semiY: number): Pt[] {
  const points: Pt[] = [];
  for (let index = 0; index <= ELLIPSE_SAMPLES; index += 1) {
    const t = (index / ELLIPSE_SAMPLES) * Math.PI * 2;
    points.push({ x: semiX * Math.cos(t), y: semiY * Math.sin(t) });
  }
  return points;
}

/**
 * Both hyperbola branches sampled with cosh/sinh (`transverse` = vertex semi-axis,
 * `conjugate` = asymptote spread); sampling stops once a branch leaves the window.
 */
function hyperbolaBranches(
  transverse: number,
  conjugate: number,
  view: number,
  vertical: boolean,
): Pt[][] {
  if (transverse >= view) {
    return [];
  }
  const tForTransverse = Math.acosh(view / transverse);
  const tForConjugate = Math.asinh(view / Math.max(conjugate, 1e-6));
  const limit = Math.min(tForTransverse, tForConjugate);
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  const branches: Pt[][] = [];
  for (const sign of [1, -1]) {
    const points: Pt[] = [];
    for (let index = 0; index <= HYPERBOLA_SAMPLES; index += 1) {
      const t = -limit + (2 * limit * index) / HYPERBOLA_SAMPLES;
      const along = sign * transverse * Math.cosh(t);
      const across = conjugate * Math.sinh(t);
      points.push(vertical ? { x: across, y: along } : { x: along, y: across });
    }
    branches.push(points);
  }
  return branches;
}

/** Parabola sampled so the opening coordinate just fills the window. */
function parabolaPoints(focal: number, view: number, vertical: boolean): Pt[] {
  const span = Math.min(view, 2 * Math.sqrt(Math.abs(focal) * view));
  const points: Pt[] = [];
  for (let index = 0; index <= PARABOLA_SAMPLES; index += 1) {
    const input = -span + (2 * span * index) / PARABOLA_SAMPLES;
    const output = (input * input) / (4 * focal);
    points.push(vertical ? { x: output, y: input } : { x: input, y: output });
  }
  return points;
}

/** Clip the line y = slope·x through the origin to the square window. */
function lineThroughOrigin(slope: number, view: number): [Pt, Pt] {
  const reach = Math.min(view, view / Math.abs(slope || 1e-9));
  return [
    { x: -reach, y: -slope * reach },
    { x: reach, y: slope * reach },
  ];
}

export function ConicSection({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: ConicSectionVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const conic = visual.conic;
  const orientation = visual.orientation ?? 'horizontal';
  const vertical = orientation === 'vertical';
  const view = Math.max(1, visual.viewRadius ?? 6);
  /* Interactive by default; authors opt out with `interactive: false`. */
  const interactive = visual.interactive ?? true;
  const showFoci = visual.showFoci ?? false;
  const showAsymptotes = visual.showAsymptotes ?? true;
  const showDirectrix = visual.showDirectrix ?? false;

  const [a, setA] = useState(() => sanitizeAxis(visual.a, 3));
  const [b, setB] = useState(() => sanitizeAxis(visual.b, 2));
  const [p, setP] = useState(() => sanitizeFocal(visual.p, 1));
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  /* Fire once on the gating action: a real handle drag, or the first pointer touch
     when non-interactive. */
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  /* Self-demo: grow the primary axis (focal length for a parabola, else a) so the
     conic morphs; a non-interactive diagram pulses. */
  const isParabola = conic === 'parabola';
  const [demoPulse, setDemoPulse] = useState(0);
  const parabolaSign = p < 0 ? -1 : 1;
  const demoTarget = isParabola
    ? snapToStep(parabolaSign * clamp(Math.abs(p) + (view - Math.abs(p)) * 0.5, MIN_AXIS, view))
    : clamp(snapToStep(a + (view - a) * 0.45), MIN_AXIS, view);
  const demo = useScalarDemonstration({
    demonstrate,
    value: isParabola ? p : a,
    initial: isParabola ? sanitizeFocal(visual.p, 1) : sanitizeAxis(visual.a, 3),
    target: demoTarget,
    apply: (value) => {
      if (isParabola) {
        const sign = value < 0 ? -1 : 1;
        setP(sign * clamp(Math.abs(value), MIN_AXIS, view));
      } else {
        setA(clamp(value, MIN_AXIS, view));
      }
    },
    enabled: interactive,
    onInteraction: fireInteractionComplete,
  });
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    enabled: !interactive,
  });

  const scale = createPlotScale({ xMin: -view, xMax: view, yMin: -view, yMax: view });

  // Drawing-safe magnitudes (never zero); display keeps the raw state values.
  const aDraw = Math.max(a, 1e-3);
  const bDraw = Math.max(b, 1e-3);
  const pDraw = Math.abs(p) < 1e-3 ? (p < 0 ? -1e-3 : 1e-3) : p;

  // Horizontal/vertical semi-axes for the closed conics.
  const semiX = conic === 'circle' ? aDraw : vertical ? bDraw : aDraw;
  const semiY = conic === 'circle' ? aDraw : vertical ? aDraw : bDraw;

  const curves: Pt[][] = [];
  const foci: Pt[] = [];
  const vertices: Pt[] = [];
  const asymptotes: Array<[Pt, Pt]> = [];
  const handles: Handle[] = [];
  let directrix: [Pt, Pt] | null = null;
  let eccentricity = 0;
  let caption = '';

  if (conic === 'circle') {
    curves.push(ellipsePoints(semiX, semiY));
    eccentricity = 0;
    caption = `radius r = ${formatNumber(a)}, eccentricity e = 0`;
    if (interactive) {
      handles.push({ id: 'r', label: 'draggable circle radius', pos: { x: aDraw, y: 0 } });
    }
  } else if (conic === 'ellipse') {
    curves.push(ellipsePoints(semiX, semiY));
    const semiMajor = Math.max(semiX, semiY);
    const semiMinor = Math.min(semiX, semiY);
    const c = Math.sqrt(Math.max(semiMajor * semiMajor - semiMinor * semiMinor, 0));
    eccentricity = semiMajor > 0 ? c / semiMajor : 0;
    const majorHorizontal = semiX >= semiY;
    vertices.push(
      { x: semiX, y: 0 },
      { x: -semiX, y: 0 },
      { x: 0, y: semiY },
      { x: 0, y: -semiY },
    );
    if (showFoci && c > 1e-6) {
      if (majorHorizontal) {
        foci.push({ x: c, y: 0 }, { x: -c, y: 0 });
      } else {
        foci.push({ x: 0, y: c }, { x: 0, y: -c });
      }
    }
    caption =
      `a = ${formatNumber(a)}, b = ${formatNumber(b)}, ` +
      `c = ${formatNumber(c)}, eccentricity e = ${formatNumber(eccentricity)}`;
    if (interactive) {
      handles.push({ id: 'semiX', label: 'draggable horizontal vertex', pos: { x: semiX, y: 0 } });
      handles.push({ id: 'semiY', label: 'draggable vertical vertex', pos: { x: 0, y: semiY } });
    }
  } else if (conic === 'hyperbola') {
    curves.push(...hyperbolaBranches(aDraw, bDraw, view, vertical));
    const c = Math.sqrt(aDraw * aDraw + bDraw * bDraw);
    eccentricity = aDraw > 0 ? c / aDraw : 0;
    if (vertical) {
      vertices.push({ x: 0, y: aDraw }, { x: 0, y: -aDraw });
      if (showFoci) {
        foci.push({ x: 0, y: c }, { x: 0, y: -c });
      }
      if (showAsymptotes) {
        const slope = aDraw / bDraw;
        asymptotes.push(lineThroughOrigin(slope, view), lineThroughOrigin(-slope, view));
      }
      if (interactive) {
        handles.push({ id: 'a', label: 'draggable vertex', pos: { x: 0, y: aDraw } });
        handles.push({ id: 'b', label: 'draggable conjugate axis', pos: { x: bDraw, y: 0 } });
      }
    } else {
      vertices.push({ x: aDraw, y: 0 }, { x: -aDraw, y: 0 });
      if (showFoci) {
        foci.push({ x: c, y: 0 }, { x: -c, y: 0 });
      }
      if (showAsymptotes) {
        const slope = bDraw / aDraw;
        asymptotes.push(lineThroughOrigin(slope, view), lineThroughOrigin(-slope, view));
      }
      if (interactive) {
        handles.push({ id: 'a', label: 'draggable vertex', pos: { x: aDraw, y: 0 } });
        handles.push({ id: 'b', label: 'draggable conjugate axis', pos: { x: 0, y: bDraw } });
      }
    }
    caption =
      `a = ${formatNumber(a)}, b = ${formatNumber(b)}, ` +
      `c = ${formatNumber(c)}, eccentricity e = ${formatNumber(eccentricity)}`;
  } else {
    curves.push(parabolaPoints(pDraw, view, vertical));
    eccentricity = 1;
    vertices.push({ x: 0, y: 0 });
    const focus: Pt = vertical ? { x: pDraw, y: 0 } : { x: 0, y: pDraw };
    if (showFoci) {
      foci.push(focus);
    }
    if (showDirectrix && Math.abs(pDraw) <= view) {
      directrix = vertical
        ? [
            { x: -pDraw, y: -view },
            { x: -pDraw, y: view },
          ]
        : [
            { x: -view, y: -pDraw },
            { x: view, y: -pDraw },
          ];
    }
    caption =
      `p = ${formatNumber(p)}, focus (${formatNumber(focus.x)}, ${formatNumber(focus.y)}), ` +
      `eccentricity e = 1`;
    if (interactive) {
      handles.push({ id: 'p', label: 'draggable focus', pos: focus });
    }
  }

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!activeHandle) {
      return;
    }
    const point = pointerToData(event, scale);
    /* Snap axis values to the 0.1 grid so the conic resizes in clean tenths. */
    const round = (value: number) => snapToStep(value);
    const axisValue = (value: number) => round(clamp(Math.abs(value), MIN_AXIS, view));
    const focalValue = (value: number) => {
      const magnitude = clamp(Math.abs(value), MIN_AXIS, view);
      return round(value < 0 ? -magnitude : magnitude);
    };

    /* Count the interaction only once the handle moves a value (no-op clicks don't). */
    let valueChanged = false;

    switch (activeHandle) {
      case 'r': {
        const next = round(clamp(Math.hypot(point.x, point.y), MIN_AXIS, view));
        valueChanged = next !== a;
        setA(next);
        break;
      }
      case 'semiX': {
        const next = axisValue(point.x);
        if (vertical) {
          valueChanged = next !== b;
          setB(next);
        } else {
          valueChanged = next !== a;
          setA(next);
        }
        break;
      }
      case 'semiY': {
        const next = axisValue(point.y);
        if (vertical) {
          valueChanged = next !== a;
          setA(next);
        } else {
          valueChanged = next !== b;
          setB(next);
        }
        break;
      }
      case 'a': {
        const next = axisValue(vertical ? point.y : point.x);
        valueChanged = next !== a;
        setA(next);
        break;
      }
      case 'b': {
        const next = axisValue(vertical ? point.x : point.y);
        valueChanged = next !== b;
        setB(next);
        break;
      }
      case 'p': {
        const next = focalValue(vertical ? point.x : point.y);
        valueChanged = next !== p;
        setP(next);
        break;
      }
      default:
        break;
    }

    if (valueChanged) {
      fireInteractionComplete();
    }
  }

  const stopDragging = () => setActiveHandle(null);

  return (
    <WidgetFigure
      label={visual.label}
      caption={caption}
      instruction={
        interactive
          ? 'Drag a highlighted point to reshape the conic and watch the eccentricity update.'
          : undefined
      }
    >
      <PlotFrame
        scale={scale}
        ariaLabel={visual.label}
        onPointerDown={interactive ? undefined : fireInteractionComplete}
        onPointerMove={interactive ? updateFromPointer : undefined}
        onPointerUp={interactive ? stopDragging : undefined}
        onPointerLeave={interactive ? stopDragging : undefined}
        onPointerCancel={interactive ? stopDragging : undefined}
      >
        {asymptotes.map((segment, index) => (
          <line
            key={`asymptote-${index}`}
            x1={scale.toSvgX(segment[0].x)}
            y1={scale.toSvgY(segment[0].y)}
            x2={scale.toSvgX(segment[1].x)}
            y2={scale.toSvgY(segment[1].y)}
            stroke="#8b95a3"
            strokeWidth={1.5}
            strokeDasharray="6 5"
          />
        ))}

        {directrix != null ? (
          <>
            <line
              className="graph-helper"
              x1={scale.toSvgX(directrix[0].x)}
              y1={scale.toSvgY(directrix[0].y)}
              x2={scale.toSvgX(directrix[1].x)}
              y2={scale.toSvgY(directrix[1].y)}
            />
            {/* Keep the directrix label in-plot: centered near the top (vertical) or near its right end (horizontal). */}
            <text
              x={clamp(scale.toSvgX(directrix[1].x), PLOT_PADDING + 28, PLOT_WIDTH - PLOT_PADDING - 28)}
              y={clamp(
                vertical ? scale.toSvgY(directrix[1].y) - 6 : PLOT_PADDING + 12,
                PLOT_PADDING + 12,
                PLOT_HEIGHT - PLOT_PADDING - 6,
              )}
              textAnchor="middle"
              fontSize={11}
              fontWeight={800}
              fill="#374151"
            >
              directrix
            </text>
          </>
        ) : null}

        {curves.map((points, index) => (
          <path key={`curve-${index}`} className="graph-curve" d={linePath(points, scale)} />
        ))}

        {conic !== 'parabola' ? (
          <circle
            cx={scale.toSvgX(0)}
            cy={scale.toSvgY(0)}
            r={3}
            fill="#8b95a3"
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        ) : null}

        {vertices.map((vertex, index) => (
          <circle
            key={`vertex-${index}`}
            className="graph-point"
            cx={scale.toSvgX(vertex.x)}
            cy={scale.toSvgY(vertex.y)}
            r={3.5}
          />
        ))}

        {foci.map((focus, index) => {
          /* Label the focus toward the origin, kept inside the frame. */
          const fx = scale.toSvgX(focus.x);
          const fy = scale.toSvgY(focus.y);
          const labelX = clamp(fx - (focus.x > 0 ? 14 : -8), PLOT_PADDING + 4, PLOT_WIDTH - PLOT_PADDING - 12);
          const labelY = clamp(fy - 8, PLOT_PADDING + 12, PLOT_HEIGHT - PLOT_PADDING - 4);
          return (
            <g key={`focus-${index}`}>
              <circle className="graph-point" cx={fx} cy={fy} r={5} aria-label="focus" />
              <text x={labelX} y={labelY} fontSize={12} fontWeight={800} fill="#374151">
                F
              </text>
            </g>
          );
        })}

        {handles.map((handle) => (
          <circle
            key={`handle-${handle.id}`}
            className="graph-point graph-handle"
            cx={scale.toSvgX(handle.pos.x)}
            cy={scale.toSvgY(handle.pos.y)}
            r={8}
            role="button"
            tabIndex={0}
            aria-label={handle.label}
            onPointerDown={(event) => {
              demo.cancel();
              capturePointer(event);
              setActiveHandle(handle.id);
            }}
          />
        ))}
        <DemoPulseOverlay pulse={demoPulse} />
      </PlotFrame>
    </WidgetFigure>
  );
}
