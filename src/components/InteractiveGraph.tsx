import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import type { FunctionCurveShape, InteractiveVisual } from '../data/lessons';
import { MathText } from './MathText';
import { WidgetRenderer } from './widgets';
import { snapToStep } from './widgets/plotFrame';
import {
  DemoPulseOverlay,
  lerp,
  pulseEnvelope,
  useDemonstration,
  useScalarDemonstration,
} from './widgets/useDemonstration';
import './InteractiveGraph.css';

type InteractiveGraphProps = {
  visual: InteractiveVisual;
  onInteractionComplete?: () => void;
  /**
   * "Show me" self-demonstration counter. Each increment asks the figure to play
   * a one-shot animation of its primary handle to the position/state that
   * illustrates the concept. Undefined/unchanged = no demo (default behavior).
   */
  demonstrate?: number;
};

/**
 * Returns a "signal once" callback for the interaction-gating feature. Each
 * graph keeps its own ref so it notifies the lesson player the first time the
 * learner performs the graph's required action (a real drag that changes a
 * value, or a pointer-down on a figure that has no draggable handle) and never
 * again, even across re-renders. Safe to call on every pointer move.
 */
function useInteractionSignal(onInteractionComplete?: () => void) {
  const hasFiredRef = useRef(false);

  return useCallback(() => {
    if (hasFiredRef.current) {
      return;
    }

    hasFiredRef.current = true;
    onInteractionComplete?.();
  }, [onInteractionComplete]);
}

const width = 360;
const height = 220;
const padding = 32;
const minX = 0;
const maxX = 6;
const minY = 0;
const maxY = 10;
type GraphBounds = {
  minY: number;
  maxY: number;
};
const defaultGraphBounds: GraphBounds = { minY, maxY };
const derivativeOverlayBounds: GraphBounds = { minY: -3, maxY: 10 };
type TangentCurveShape = NonNullable<
  Extract<InteractiveVisual, { type: 'tangent-cursor' }>['curveShape']
>;

function functionValue(x: number, shape: FunctionCurveShape = 'valley') {
  if (shape === 'peak') {
    return -0.5 * (x - 4) ** 2 + 8;
  }

  if (shape === 'quadratic') {
    return x ** 2 / 4;
  }

  if (shape === 'cubic') {
    return 1 + 8 * (x / maxX) ** 3;
  }

  if (shape === 'quartic') {
    return 1 + 8 * (x / maxX) ** 4;
  }

  if (shape === 'linear') {
    return x + 1;
  }

  if (shape === 'constant') {
    return 4;
  }

  return 0.5 * (x - 2) ** 2 + 2;
}

function tangentSlope(x: number, shape: TangentCurveShape) {
  if (shape === 'peak') {
    return 4 - x;
  }

  if (shape === 'quadratic') {
    return x / 2;
  }

  if (shape === 'cubic') {
    return x ** 2 / 9;
  }

  if (shape === 'quartic') {
    return (8 * 4 * x ** 3) / maxX ** 4;
  }

  if (shape === 'linear') {
    return 1;
  }

  if (shape === 'constant') {
    return 0;
  }

  return x - 2;
}

/**
 * A "telling" x for a curve shape: the feature a self-demonstration should glide
 * the cursor/tangent to. Valleys/peaks go to their extremum (where the tangent
 * is horizontal); monotone shapes go to a clear, in-window feature.
 */
function functionFeatureX(shape: FunctionCurveShape): number {
  switch (shape) {
    case 'peak':
      return 4; // maximum of -0.5(x-4)^2 + 8
    case 'quadratic':
      return 0; // vertex/minimum of x^2/4
    case 'cubic':
    case 'quartic':
      return maxX; // steepest end of the monotone rise
    case 'linear':
    case 'constant':
      return 3; // middle of the window
    case 'valley':
    default:
      return 2; // minimum of 0.5(x-2)^2 + 2
  }
}

function toSvgX(x: number) {
  return padding + ((x - minX) / (maxX - minX)) * (width - padding * 2);
}

function toSvgY(y: number, bounds = defaultGraphBounds) {
  return height - padding - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * (height - padding * 2);
}

function fromSvgX(svgX: number) {
  return minX + ((svgX - padding) / (width - padding * 2)) * (maxX - minX);
}

function fromSvgY(svgY: number, bounds = defaultGraphBounds) {
  return bounds.minY + ((height - padding - svgY) / (height - padding * 2)) * (bounds.maxY - bounds.minY);
}

function pointerToGraphPoint(event: PointerEvent<SVGSVGElement>, bounds = defaultGraphBounds) {
  const svgBounds = event.currentTarget.getBoundingClientRect();
  const svgX = ((event.clientX - svgBounds.left) / svgBounds.width) * width;
  const svgY = ((event.clientY - svgBounds.top) / svgBounds.height) * height;

  return {
    x: clamp(fromSvgX(svgX), minX, maxX),
    y: clamp(fromSvgY(svgY, bounds), bounds.minY, bounds.maxY),
  };
}

function derivativeValue(x: number, shape: TangentCurveShape) {
  return tangentSlope(x, shape);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPointLabel(x: number, y: number) {
  return `(${formatNumber(x)}, ${formatNumber(y)})`;
}

function getVisibleLinearXRange(slope: number, yIntercept: number) {
  if (slope === 0) {
    return { startX: minX, endX: maxX };
  }

  const xAtMinY = (minY - yIntercept) / slope;
  const xAtMaxY = (maxY - yIntercept) / slope;

  return {
    startX: clamp(Math.min(xAtMinY, xAtMaxY), minX, maxX),
    endX: clamp(Math.max(xAtMinY, xAtMaxY), minX, maxX),
  };
}

function curvePath(valueAt = functionValue, bounds = defaultGraphBounds) {
  const points = Array.from({ length: 49 }, (_, index) => {
    const x = minX + (index / 48) * (maxX - minX);
    return `${index === 0 ? 'M' : 'L'} ${toSvgX(x)} ${toSvgY(valueAt(x), bounds)}`;
  });

  return points.join(' ');
}

function pointPath(points: Array<{ x: number; y: number }>, bounds = defaultGraphBounds) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toSvgX(point.x)} ${toSvgY(point.y, bounds)}`)
    .join(' ');
}

function verticalTangentPath() {
  const points = Array.from({ length: 49 }, (_, index) => {
    const y = 1.4 + (index / 48) * 7.2;
    const x = 3 + 0.035 * (y - 5) ** 3;

    return { x, y };
  });

  return pointPath(points);
}

function PointCoordinateLabel({
  x,
  y,
  verticalPlacement = 'auto',
}: {
  x: number;
  y: number;
  verticalPlacement?: 'above' | 'below' | 'auto';
}) {
  const label = formatPointLabel(x, y);
  const svgX = toSvgX(x);
  const svgY = toSvgY(y);
  const labelHeight = 18;
  const labelHorizontalPadding = 7;
  const labelWidth = label.length * 6.5 + labelHorizontalPadding;
  const labelX = clamp(svgX + (x > maxX - 1.2 ? -labelWidth - 12 : 12), padding, width - padding - labelWidth);
  const labelYOffset =
    verticalPlacement === 'below' || (verticalPlacement === 'auto' && y > maxY - 1.2)
      ? 10
      : -28;
  const labelY = clamp(svgY + labelYOffset, padding, height - padding - labelHeight);

  return (
    <g aria-hidden="true" className="graph-point-label-group">
      <rect className="graph-point-label-bg" x={labelX} y={labelY} width={labelWidth} height={labelHeight} rx="7" />
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

function StaticAnnotationLabel({
  label,
  x,
  y,
}: {
  label: string;
  x: number;
  y: number;
}) {
  const labelHeight = 20;
  const labelWidth = label.length * 7 + 14;
  const labelX = clamp(toSvgX(x) - labelWidth / 2, padding, width - padding - labelWidth);
  const labelY = clamp(toSvgY(y) - labelHeight / 2, padding, height - padding - labelHeight);

  return (
    <g className="graph-annotation-label-group">
      <rect className="graph-annotation-label-bg" x={labelX} y={labelY} width={labelWidth} height={labelHeight} rx="7" />
      <text
        className="graph-annotation-label"
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

type GraphFrameProps = {
  bounds?: GraphBounds;
  children: ReactNode;
  onPointerCancel?: () => void;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerLeave?: () => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: () => void;
};

function capturePointer(event: PointerEvent<SVGCircleElement>) {
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function GraphFrame({
  bounds = defaultGraphBounds,
  children,
  onPointerCancel,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
}: GraphFrameProps) {
  const xTicks = [0, 1, 2, 3, 4, 5, 6];
  const yTicks = bounds.minY < 0 ? [-2, 0, 2, 4, 6, 8, 10] : [0, 2, 4, 6, 8, 10];
  const xAxisY = toSvgY(0, bounds);

  return (
    <svg
      className="interactive-graph-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <line x1={padding} y1={xAxisY} x2={width - padding} y2={xAxisY} />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
      {xTicks.map((tick) => (
        <g key={`x-${tick}`} className="axis-tick">
          <line x1={toSvgX(tick)} y1={height - padding} x2={toSvgX(tick)} y2={height - padding + 6} />
          <text x={toSvgX(tick)} y={height - padding + 22} textAnchor="middle">
            {tick}
          </text>
        </g>
      ))}
      {yTicks.map((tick) => (
        <g key={`y-${tick}`} className="axis-tick">
          <line x1={padding - 6} y1={toSvgY(tick, bounds)} x2={padding} y2={toSvgY(tick, bounds)} />
          <text x={padding - 12} y={toSvgY(tick, bounds) + 4} textAnchor="end">
            {tick}
          </text>
        </g>
      ))}
      <text x={width - padding + 8} y={xAxisY + 4}>
        x
      </text>
      <text x={padding - 10} y={padding - 10}>
        y
      </text>
      {children}
    </svg>
  );
}

export function InteractiveGraph({ visual, onInteractionComplete, demonstrate }: InteractiveGraphProps) {
  switch (visual.type) {
    case 'function-cursor':
      return (
        <FunctionCursorGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    case 'linear-cursor':
      return (
        <LinearCursorGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    case 'rate-window':
      return (
        <RateWindowGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    case 'slope-triangle':
      return (
        <SlopeTriangleGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    case 'tangent-cursor':
      return (
        <TangentCursorGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    case 'function-derivative-overlay':
      return (
        <FunctionDerivativeOverlayGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    case 'nonsmooth-example':
      return (
        <NonsmoothExampleGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
    default:
      // Any visual outside the original 7 graph types is a chapter 5-11 widget;
      // hand it to the widget registry. `visual` is narrowed to the new union.
      return (
        <WidgetRenderer
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
      );
  }
}

function FunctionDerivativeOverlayGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'function-derivative-overlay' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const curveShape = visual.curveShape ?? 'valley';
  // This overlay is read-only (no draggable handle), so per the gating contract
  // it completes on the first pointer interaction anywhere on the figure.
  const signalInteraction = useInteractionSignal(onInteractionComplete);

  // Let the learner show f, f', or both. Default = both (original behavior). At
  // least one curve always stays visible.
  const [showFn, setShowFn] = useState(true);
  const [showDeriv, setShowDeriv] = useState(true);

  // Read-only figure: a "Show me" plays a brief highlight pulse and counts as
  // the gated interaction (there is no handle to glide).
  const [demoPulse, setDemoPulse] = useState(0);
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    onStart: signalInteraction,
  });
  const toggleFn = () => {
    setShowFn((prev) => (prev && showDeriv ? false : true));
    signalInteraction();
  };
  const toggleDeriv = () => {
    setShowDeriv((prev) => (prev && showFn ? false : true));
    signalInteraction();
  };

  const legendCaption = "Green is $f$; blue dashed is $f'$ on the same axes.";

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        {visual.label !== legendCaption ? (
          <span>
            <MathText text={legendCaption} />
          </span>
        ) : null}
      </div>
      <div className="graph-curve-toggle" role="group" aria-label="Show or hide each curve">
        <button
          type="button"
          className={`graph-curve-toggle-btn graph-curve-toggle-fn${showFn ? ' is-active' : ''}`}
          aria-pressed={showFn}
          onClick={toggleFn}
        >
          f
        </button>
        <button
          type="button"
          className={`graph-curve-toggle-btn graph-curve-toggle-deriv${showDeriv ? ' is-active' : ''}`}
          aria-pressed={showDeriv}
          onClick={toggleDeriv}
        >
          f&prime;
        </button>
      </div>
      <GraphFrame bounds={derivativeOverlayBounds} onPointerDown={signalInteraction}>
        {showFn ? (
          <path
            aria-label="function graph f"
            className="graph-curve graph-function-curve"
            d={curvePath((graphX) => functionValue(graphX, curveShape), derivativeOverlayBounds)}
          />
        ) : null}
        {showDeriv ? (
          <path
            aria-label="derivative graph f prime"
            className="graph-derivative-curve"
            d={curvePath((graphX) => derivativeValue(graphX, curveShape), derivativeOverlayBounds)}
          />
        ) : null}
        <g className="graph-inline-legend" aria-hidden="true">
          <rect className="graph-inline-legend-bg" x="204" y="3" width="120" height="25" rx="12" />
          {showFn ? (
            <>
              <line className="graph-inline-legend-fn" x1="214" y1="15.5" x2="238" y2="15.5" />
              <text className="graph-inline-legend-text" x="245" y="15.5" dominantBaseline="middle">
                f
              </text>
            </>
          ) : null}
          {showDeriv ? (
            <>
              <line className="graph-inline-legend-deriv" x1="267" y1="15.5" x2="291" y2="15.5" />
              <text className="graph-inline-legend-text" x="298" y="15.5" dominantBaseline="middle">
                f'
              </text>
            </>
          ) : null}
        </g>
        <DemoPulseOverlay pulse={demoPulse} />
      </GraphFrame>
    </section>
  );
}

type NonsmoothShapeKind = Extract<InteractiveVisual, { type: 'nonsmooth-example' }>['shape'];

// Shared piecewise definitions so the draggable dot rides the exact same stroke
// that `NonsmoothShape` draws.
const cornerPoints = [
  { x: 0.8, y: 7 },
  { x: 3, y: 3 },
  { x: 5.2, y: 7 },
];

const jumpLeftPoints = [
  { x: 0.8, y: 3 },
  { x: 1.7, y: 3.2 },
  { x: 2.5, y: 3.6 },
  { x: 3, y: 4 },
];

const jumpRightPoints = [
  { x: 3, y: 6.8 },
  { x: 3.8, y: 7.2 },
  { x: 4.6, y: 7.5 },
  { x: 5.2, y: 7.8 },
];

function cuspValue(x: number) {
  return 2.4 + 3.2 * Math.abs(x - 3) ** (2 / 3);
}

function verticalTangentValue(x: number) {
  // Inverse of x = 3 + 0.035 (y - 5)^3, the curve drawn by verticalTangentPath().
  return 5 + Math.cbrt((x - 3) / 0.035);
}

function interpolatePolyline(points: ReadonlyArray<{ x: number; y: number }>, x: number) {
  const first = points[0];
  const last = points[points.length - 1];

  if (x <= first.x) {
    return first.y;
  }

  if (x >= last.x) {
    return last.y;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    if (x >= start.x && x <= end.x) {
      const t = end.x === start.x ? 0 : (x - start.x) / (end.x - start.x);
      return start.y + t * (end.y - start.y);
    }
  }

  return last.y;
}

type NonsmoothCurve = {
  valueAt: (x: number) => number;
  domain: { startX: number; endX: number };
  initialX: number;
  // When set, the curve has a hole/jump at this x and the dot must leap across it.
  discontinuityX?: number;
};

function getNonsmoothCurve(shape: NonsmoothShapeKind): NonsmoothCurve {
  switch (shape) {
    case 'corner':
      return {
        valueAt: (x) => interpolatePolyline(cornerPoints, x),
        domain: { startX: 0.8, endX: 5.2 },
        initialX: 1.6,
      };
    case 'cusp':
      return {
        valueAt: cuspValue,
        domain: { startX: 0.6, endX: 5.4 },
        initialX: 1.6,
      };
    case 'jump':
      return {
        valueAt: (x) =>
          x < 3 ? interpolatePolyline(jumpLeftPoints, x) : interpolatePolyline(jumpRightPoints, x),
        domain: { startX: 0.8, endX: 5.2 },
        initialX: 1.6,
        discontinuityX: 3,
      };
    case 'hole':
      return {
        valueAt: (x) => functionValue(x, 'valley'),
        domain: { startX: minX, endX: maxX },
        initialX: 2,
        discontinuityX: 4,
      };
    case 'vertical-tangent':
    default:
      return {
        valueAt: verticalTangentValue,
        domain: { startX: 1.4, endX: 4.6 },
        initialX: 2,
      };
  }
}

// Keep the dot off the discontinuity: if the rounded target lands on the gap,
// snap to the grid point on the far side in the direction of travel so the dot
// leaps from just-left to just-right (or back) and never sits in the hole.
function skipDiscontinuity(curve: NonsmoothCurve, currentX: number, targetX: number) {
  if (curve.discontinuityX === undefined) {
    return targetX;
  }

  if (Math.abs(targetX - curve.discontinuityX) < 0.05) {
    const movingRight = targetX >= currentX;
    const landed = curve.discontinuityX + (movingRight ? 0.1 : -0.1);
    return Number(clamp(landed, curve.domain.startX, curve.domain.endX).toFixed(1));
  }

  return targetX;
}

function NonsmoothExampleGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'nonsmooth-example' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const curve = useMemo(() => getNonsmoothCurve(visual.shape), [visual.shape]);
  const [x, setX] = useState(curve.initialX);
  const [isDragging, setIsDragging] = useState(false);
  const signalInteraction = useInteractionSignal(onInteractionComplete);
  const y = curve.valueAt(x);

  // Self-demo: glide the dot onto the non-smooth feature. For jump/hole curves
  // it lands just past the gap (the existing skip logic), so the dot visibly
  // leaps the discontinuity; for corner/cusp/vertical-tangent it lands on x = 3.
  const demoTween = useRef({ from: x, to: x });
  const demo = useDemonstration(
    demonstrate,
    (progress) => {
      const tween = demoTween.current;
      setX(lerp(tween.from, tween.to, progress));
    },
    {
      onStart: () => {
        const featureX = curve.discontinuityX ?? 3;
        const from = curve.initialX;
        const to = clamp(
          skipDiscontinuity(curve, from, snapToStep(featureX)),
          curve.domain.startX,
          curve.domain.endX,
        );
        demoTween.current = { from, to };
        // Start the visible glide from the authored point so the leap reads clearly.
        setX(from);
        signalInteraction();
      },
    },
  );

  useEffect(() => {
    setX(curve.initialX);
    setIsDragging(false);
  }, [curve]);

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    const targetX = clamp(snapToStep(pointerToGraphPoint(event).x), curve.domain.startX, curve.domain.endX);
    const nextX = skipDiscontinuity(curve, x, targetX);

    if (nextX !== x) {
      signalInteraction();
    }

    setX(nextX);
  }

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>No derivative at the marked point</span>
      </div>
      <GraphFrame
        onPointerCancel={() => setIsDragging(false)}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setIsDragging(false)}
      >
        <NonsmoothShape shape={visual.shape} />
        <circle
          aria-label="draggable curve point"
          className="graph-point graph-handle"
          cx={toSvgX(x)}
          cy={toSvgY(y)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setIsDragging(true);
          }}
        />
        <PointCoordinateLabel x={x} y={y} />
      </GraphFrame>
      <p className="graph-instruction">
        {curve.discontinuityX !== undefined
          ? 'Drag the red point - it leaps over the gap.'
          : 'Drag the red point along the curve.'}
      </p>
    </section>
  );
}

function NonsmoothShape({
  shape,
}: {
  shape: Extract<InteractiveVisual, { type: 'nonsmooth-example' }>['shape'];
}) {
  if (shape === 'corner') {
    return (
      <>
        <path d={pointPath(cornerPoints)} className="graph-curve" />
        <circle aria-label="corner point" className="graph-point" cx={toSvgX(3)} cy={toSvgY(3)} r="7" />
        <StaticAnnotationLabel label="corner" x={3} y={1.5} />
      </>
    );
  }

  if (shape === 'cusp') {
    const cuspPoints = Array.from({ length: 49 }, (_, index) => {
      const x = 0.6 + (index / 48) * 4.8;

      return { x, y: cuspValue(x) };
    });

    return (
      <>
        <path d={pointPath(cuspPoints)} className="graph-curve" />
        <circle aria-label="cusp point" className="graph-point" cx={toSvgX(3)} cy={toSvgY(2.4)} r="7" />
        <StaticAnnotationLabel label="|x|^(2/3)" x={3} y={1.1} />
      </>
    );
  }

  if (shape === 'jump') {
    return (
      <>
        <path d={pointPath(jumpLeftPoints)} className="graph-curve" />
        <path d={pointPath(jumpRightPoints)} className="graph-curve" />
        <line className="graph-y-guide" x1={toSvgX(3)} y1={toSvgY(4)} x2={toSvgX(3)} y2={toSvgY(6.8)} />
        <circle aria-label="open jump point" className="graph-open-point" cx={toSvgX(3)} cy={toSvgY(4)} r="7" />
        <circle aria-label="filled jump point" className="graph-point" cx={toSvgX(3)} cy={toSvgY(6.8)} r="7" />
        <StaticAnnotationLabel label="jump" x={4.2} y={5.4} />
      </>
    );
  }

  if (shape === 'hole') {
    return (
      <>
        <path d={curvePath()} className="graph-curve" />
        <circle aria-label="hole point" className="graph-open-point" cx={toSvgX(4)} cy={toSvgY(4)} r="8" />
        <StaticAnnotationLabel label="hole" x={5.25} y={4.4} />
      </>
    );
  }

  return (
    <>
      <path d={verticalTangentPath()} className="graph-curve" />
      <line
        className="graph-cursor"
        x1={toSvgX(3)}
        y1={toSvgY(2.6)}
        x2={toSvgX(3)}
        y2={toSvgY(7.4)}
      />
      <circle
        aria-label="vertical tangent point"
        className="graph-point"
        cx={toSvgX(3)}
        cy={toSvgY(5)}
        r="7"
      />
      <StaticAnnotationLabel label="vertical tangent" x={5.1} y={6.2} />
    </>
  );
}

function FunctionCursorGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'function-cursor' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const [x, setX] = useState(visual.initialX);
  const [isDragging, setIsDragging] = useState(false);
  const signalInteraction = useInteractionSignal(onInteractionComplete);
  const curveShape = visual.curveShape ?? 'valley';
  const y = functionValue(x, curveShape);

  // Self-demo: glide the cursor to a telling x (the curve's vertex/feature).
  const demoTargetX = clamp(snapToStep(functionFeatureX(curveShape)), minX, maxX);
  const demo = useScalarDemonstration({
    demonstrate,
    value: x,
    initial: visual.initialX,
    target: demoTargetX,
    apply: setX,
    onInteraction: signalInteraction,
  });

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    const nextX = snapToStep(pointerToGraphPoint(event).x);

    if (nextX !== x) {
      signalInteraction();
    }

    setX(nextX);
  }

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>
          x = {formatNumber(x)}, f(x) = {formatNumber(y)}
        </span>
      </div>
      <GraphFrame
        onPointerCancel={() => setIsDragging(false)}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setIsDragging(false)}
      >
        <path d={curvePath((graphX) => functionValue(graphX, curveShape))} className="graph-curve" />
        <line
          x1={toSvgX(x)}
          y1={toSvgY(y)}
          x2={toSvgX(x)}
          y2={height - padding}
          className="graph-cursor"
        />
        <line
          aria-hidden="true"
          className="graph-y-guide"
          x1={padding}
          y1={toSvgY(y)}
          x2={toSvgX(x)}
          y2={toSvgY(y)}
        />
        <circle
          aria-label="draggable x-coordinate cursor"
          className="graph-point graph-handle"
          cx={toSvgX(x)}
          cy={toSvgY(y)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setIsDragging(true);
          }}
        />
        <PointCoordinateLabel x={x} y={y} />
      </GraphFrame>
      <p className="graph-instruction">Drag the red point on the graph.</p>
    </section>
  );
}

function LinearCursorGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'linear-cursor' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const yIntercept = visual.yIntercept ?? 0;
  const lineRange = getVisibleLinearXRange(visual.slope, yIntercept);
  const initialX = clamp(visual.initialX, lineRange.startX, lineRange.endX);
  const [x, setX] = useState(initialX);
  const [isDragging, setIsDragging] = useState(false);
  const signalInteraction = useInteractionSignal(onInteractionComplete);
  const y = visual.slope * x + yIntercept;

  // Self-demo: glide the cursor along the whole line to the endpoint that is
  // farthest from where it sits now (the most telling sweep of constant slope).
  const demoTargetX =
    Math.abs(lineRange.endX - x) >= Math.abs(x - lineRange.startX)
      ? snapToStep(lineRange.endX)
      : snapToStep(lineRange.startX);
  const demo = useScalarDemonstration({
    demonstrate,
    value: x,
    initial: initialX,
    target: clamp(demoTargetX, lineRange.startX, lineRange.endX),
    apply: setX,
    onInteraction: signalInteraction,
  });

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    const nextX = clamp(snapToStep(pointerToGraphPoint(event).x), lineRange.startX, lineRange.endX);

    if (nextX !== x) {
      signalInteraction();
    }

    setX(nextX);
  }

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>
          x = {formatNumber(x)}, f(x) = {formatNumber(y)}
        </span>
      </div>
      <GraphFrame
        onPointerCancel={() => setIsDragging(false)}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setIsDragging(false)}
      >
        <line
          x1={toSvgX(lineRange.startX)}
          y1={toSvgY(visual.slope * lineRange.startX + yIntercept)}
          x2={toSvgX(lineRange.endX)}
          y2={toSvgY(visual.slope * lineRange.endX + yIntercept)}
          className="graph-curve"
        />
        <line x1={toSvgX(x)} y1={toSvgY(y)} x2={toSvgX(x)} y2={height - padding} className="graph-cursor" />
        <line
          aria-hidden="true"
          className="graph-y-guide"
          x1={padding}
          y1={toSvgY(y)}
          x2={toSvgX(x)}
          y2={toSvgY(y)}
        />
        <circle
          aria-label="draggable linear point"
          className="graph-point graph-handle"
          cx={toSvgX(x)}
          cy={toSvgY(y)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setIsDragging(true);
          }}
        />
        <PointCoordinateLabel x={x} y={y} />
      </GraphFrame>
      <p className="graph-instruction">Drag the red point along the line.</p>
    </section>
  );
}

function RateWindowGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'rate-window' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  const [startX, setStartX] = useState(visual.initialStartX);
  const [endX, setEndX] = useState(visual.initialEndX);
  const signalInteraction = useInteractionSignal(onInteractionComplete);
  const safeEndX = endX === startX ? startX + 0.1 : endX;

  // Self-demo: shrink the interval toward its midpoint so the secant collapses
  // onto the tangent (the average rate approaches the instantaneous rate).
  const demoTween = useRef({
    fromStart: startX,
    fromEnd: endX,
    toStart: startX,
    toEnd: endX,
  });
  const demo = useDemonstration(
    demonstrate,
    (progress) => {
      const tween = demoTween.current;
      setStartX(lerp(tween.fromStart, tween.toStart, progress));
      setEndX(lerp(tween.fromEnd, tween.toEnd, progress));
    },
    {
      onStart: () => {
        // Collapse around the current midpoint, leaving a tiny readable window.
        const center = snapToStep((startX + endX) / 2);
        const toStart = clamp(snapToStep(center - 0.2), minX, maxX - 0.2);
        const toEnd = clamp(snapToStep(center + 0.2), toStart + 0.1, maxX);
        demoTween.current = { fromStart: startX, fromEnd: endX, toStart, toEnd };
        signalInteraction();
      },
    },
  );
  const startY = functionValue(startX);
  const endY = functionValue(safeEndX);
  const averageRate = (endY - startY) / (safeEndX - startX);

  function updateStart(value: number) {
    const nextStartX = clamp(value, minX, endX - 0.1);

    if (nextStartX !== startX) {
      signalInteraction();
    }

    setStartX(nextStartX);
  }

  function updateEnd(value: number) {
    const nextEndX = clamp(value, startX + 0.1, maxX);

    if (nextEndX !== endX) {
      signalInteraction();
    }

    setEndX(nextEndX);
  }

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!activeHandle) {
      return;
    }

    const nextX = snapToStep(pointerToGraphPoint(event).x);

    if (activeHandle === 'start') {
      updateStart(nextX);
      return;
    }

    updateEnd(nextX);
  }

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>
          Output change = {formatNumber(endY - startY)}, input change ={' '}
          {formatNumber(safeEndX - startX)}, average rate = {formatNumber(averageRate)}
        </span>
      </div>
      <GraphFrame
        onPointerCancel={() => setActiveHandle(null)}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setActiveHandle(null)}
      >
        <path d={curvePath()} className="graph-curve" />
        <line
          x1={toSvgX(startX)}
          y1={toSvgY(startY)}
          x2={toSvgX(safeEndX)}
          y2={toSvgY(endY)}
          className="graph-secant"
        />
        <circle
          aria-label="draggable start point"
          className="graph-point graph-handle"
          cx={toSvgX(startX)}
          cy={toSvgY(startY)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setActiveHandle('start');
          }}
        />
        <PointCoordinateLabel x={startX} y={startY} verticalPlacement="below" />
        <circle
          aria-label="draggable end point"
          className="graph-point graph-handle"
          cx={toSvgX(safeEndX)}
          cy={toSvgY(endY)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setActiveHandle('end');
          }}
        />
        <PointCoordinateLabel x={safeEndX} y={endY} verticalPlacement="above" />
      </GraphFrame>
      <p className="graph-instruction">Drag either red endpoint to change the interval.</p>
    </section>
  );
}

function SlopeTriangleGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'slope-triangle' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  const [start, setStart] = useState({
    x: visual.initialStartX ?? 1,
    y: visual.initialStartY ?? 1,
  });
  const [end, setEnd] = useState({
    x: start.x + visual.initialRun,
    y: start.y + visual.initialRise,
  });
  const signalInteraction = useInteractionSignal(onInteractionComplete);
  const rise = end.y - start.y;
  const run = end.x - start.x;
  const slopeLabel = run === 0 ? 'undefined' : formatNumber(rise / run);

  // Self-demo: grow the triangle along the SAME line (scale rise & run together)
  // so the slope readout stays put while the triangle enlarges — slope is the
  // same for any triangle on a line. Only the end handle moves.
  const demoTween = useRef({ from: end, to: end });
  const demo = useDemonstration(
    demonstrate,
    (progress) => {
      const tween = demoTween.current;
      setEnd({
        x: lerp(tween.from.x, tween.to.x, progress),
        y: lerp(tween.from.y, tween.to.y, progress),
      });
    },
    {
      onStart: () => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        // Largest scale s >= 1 that keeps the end point inside the window.
        let scale = Infinity;
        if (dx > 1e-9) scale = Math.min(scale, (maxX - start.x) / dx);
        if (dx < -1e-9) scale = Math.min(scale, (minX - start.x) / dx);
        if (dy > 1e-9) scale = Math.min(scale, (maxY - start.y) / dy);
        if (dy < -1e-9) scale = Math.min(scale, (minY - start.y) / dy);
        if (!Number.isFinite(scale) || scale < 1) scale = 1;
        const to = {
          x: clamp(snapToStep(start.x + dx * scale), minX, maxX),
          y: clamp(snapToStep(start.y + dy * scale), minY, maxY),
        };
        // If already maxed out, shrink toward the start instead so a replay still moves.
        const grew = Math.hypot(to.x - end.x, to.y - end.y) > 1e-6;
        demoTween.current = {
          from: end,
          to: grew
            ? to
            : {
                x: clamp(snapToStep(start.x + dx * 0.5), minX, maxX),
                y: clamp(snapToStep(start.y + dy * 0.5), minY, maxY),
              },
        };
        signalInteraction();
      },
    },
  );

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!activeHandle) {
      return;
    }

    const point = pointerToGraphPoint(event);
    const snappedX = snapToStep(point.x);
    const snappedY = snapToStep(point.y);

    if (activeHandle === 'start') {
      const nextStart = {
        x: clamp(snappedX, minX, end.x),
        y: clamp(snappedY, minY, maxY),
      };

      if (nextStart.x !== start.x || nextStart.y !== start.y) {
        signalInteraction();
      }

      setStart(nextStart);
      return;
    }

    const nextEnd = {
      x: clamp(snappedX, start.x, maxX),
      y: clamp(snappedY, minY, maxY),
    };

    if (nextEnd.x !== end.x || nextEnd.y !== end.y) {
      signalInteraction();
    }

    setEnd(nextEnd);
  }

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>
          rise = {formatNumber(rise)}, run = {formatNumber(run)}, slope ={' '}
          {slopeLabel}
        </span>
      </div>
      <GraphFrame
        onPointerCancel={() => setActiveHandle(null)}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setActiveHandle(null)}
      >
        <line x1={toSvgX(start.x)} y1={toSvgY(start.y)} x2={toSvgX(end.x)} y2={toSvgY(end.y)} className="graph-secant" />
        <line x1={toSvgX(start.x)} y1={toSvgY(start.y)} x2={toSvgX(end.x)} y2={toSvgY(start.y)} className="graph-helper" />
        <line x1={toSvgX(end.x)} y1={toSvgY(start.y)} x2={toSvgX(end.x)} y2={toSvgY(end.y)} className="graph-helper" />
        <circle
          aria-label="draggable slope start point"
          className="graph-point graph-handle"
          cx={toSvgX(start.x)}
          cy={toSvgY(start.y)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setActiveHandle('start');
          }}
        />
        <PointCoordinateLabel x={start.x} y={start.y} verticalPlacement="below" />
        <circle
          aria-label="draggable slope point"
          className="graph-point graph-handle"
          cx={toSvgX(end.x)}
          cy={toSvgY(end.y)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setActiveHandle('end');
          }}
        />
        <PointCoordinateLabel x={end.x} y={end.y} verticalPlacement="above" />
      </GraphFrame>
      <p className="graph-instruction">Drag either red endpoint to change rise and run.</p>
    </section>
  );
}

function TangentCursorGraph({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: Extract<InteractiveVisual, { type: 'tangent-cursor' }>;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const [x, setX] = useState(visual.initialX);
  const [isDragging, setIsDragging] = useState(false);
  const signalInteraction = useInteractionSignal(onInteractionComplete);
  const curveShape = visual.curveShape ?? 'valley';
  const y = functionValue(x, curveShape);
  const slope = tangentSlope(x, curveShape);
  const tangentStartX = clamp(x - 1.2, minX, maxX);
  const tangentEndX = clamp(x + 1.2, minX, maxX);
  const tangentStartY = y + slope * (tangentStartX - x);
  const tangentEndY = y + slope * (tangentEndX - x);

  // Self-demo: glide the tangent point to the curve's feature (its extremum,
  // where the tangent line is horizontal — the most telling place to land).
  const demoTargetX = clamp(snapToStep(functionFeatureX(curveShape)), minX, maxX);
  const demo = useScalarDemonstration({
    demonstrate,
    value: x,
    initial: visual.initialX,
    target: demoTargetX,
    apply: setX,
    onInteraction: signalInteraction,
  });

  useEffect(() => {
    setX(visual.initialX);
    setIsDragging(false);
  }, [curveShape, visual.initialX]);

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    const nextX = snapToStep(pointerToGraphPoint(event).x);

    if (nextX !== x) {
      signalInteraction();
    }

    setX(nextX);
  }

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>
          x = {formatNumber(x)}, local slope = {formatNumber(slope)}
        </span>
      </div>
      <GraphFrame
        onPointerCancel={() => setIsDragging(false)}
        onPointerMove={updateFromPointer}
        onPointerUp={() => setIsDragging(false)}
      >
        <path d={curvePath((graphX) => functionValue(graphX, curveShape))} className="graph-curve" />
        <line
          x1={toSvgX(tangentStartX)}
          y1={toSvgY(tangentStartY)}
          x2={toSvgX(tangentEndX)}
          y2={toSvgY(tangentEndY)}
          className="graph-secant"
        />
        <circle
          aria-label="draggable tangent point"
          className="graph-point graph-handle"
          cx={toSvgX(x)}
          cy={toSvgY(y)}
          r="8"
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setIsDragging(true);
          }}
        />
        <PointCoordinateLabel x={x} y={y} />
      </GraphFrame>
      <p className="graph-instruction">Drag the red point along the curve.</p>
    </section>
  );
}
