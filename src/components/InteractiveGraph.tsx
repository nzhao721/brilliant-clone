import { useEffect, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import type { FunctionCurveShape, InteractiveVisual } from '../data/lessons';
import { MathText } from './MathText';
import './InteractiveGraph.css';

type InteractiveGraphProps = {
  visual: InteractiveVisual;
};

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

export function InteractiveGraph({ visual }: InteractiveGraphProps) {
  switch (visual.type) {
    case 'function-cursor':
      return <FunctionCursorGraph visual={visual} />;
    case 'linear-cursor':
      return <LinearCursorGraph visual={visual} />;
    case 'rate-window':
      return <RateWindowGraph visual={visual} />;
    case 'slope-triangle':
      return <SlopeTriangleGraph visual={visual} />;
    case 'tangent-cursor':
      return <TangentCursorGraph visual={visual} />;
    case 'function-derivative-overlay':
      return <FunctionDerivativeOverlayGraph visual={visual} />;
    case 'nonsmooth-example':
      return <NonsmoothExampleGraph visual={visual} />;
    default:
      return null;
  }
}

function FunctionDerivativeOverlayGraph({
  visual,
}: {
  visual: Extract<InteractiveVisual, { type: 'function-derivative-overlay' }>;
}) {
  const curveShape = visual.curveShape ?? 'valley';

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
      <GraphFrame bounds={derivativeOverlayBounds}>
        <path
          aria-label="function graph f"
          className="graph-curve graph-function-curve"
          d={curvePath((graphX) => functionValue(graphX, curveShape), derivativeOverlayBounds)}
        />
        <path
          aria-label="derivative graph f prime"
          className="graph-derivative-curve"
          d={curvePath((graphX) => derivativeValue(graphX, curveShape), derivativeOverlayBounds)}
        />
        <g className="graph-inline-legend" aria-hidden="true">
          <rect className="graph-inline-legend-bg" x="204" y="3" width="120" height="25" rx="12" />
          <line className="graph-inline-legend-fn" x1="214" y1="15.5" x2="238" y2="15.5" />
          <text className="graph-inline-legend-text" x="245" y="15.5" dominantBaseline="middle">
            f
          </text>
          <line className="graph-inline-legend-deriv" x1="267" y1="15.5" x2="291" y2="15.5" />
          <text className="graph-inline-legend-text" x="298" y="15.5" dominantBaseline="middle">
            f'
          </text>
        </g>
      </GraphFrame>
    </section>
  );
}

function NonsmoothExampleGraph({
  visual,
}: {
  visual: Extract<InteractiveVisual, { type: 'nonsmooth-example' }>;
}) {
  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span>No derivative at the marked point</span>
      </div>
      <GraphFrame>
        <NonsmoothShape shape={visual.shape} />
      </GraphFrame>
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
        <path
          d={pointPath([
            { x: 0.8, y: 7 },
            { x: 3, y: 3 },
            { x: 5.2, y: 7 },
          ])}
          className="graph-curve"
        />
        <circle aria-label="corner point" className="graph-point" cx={toSvgX(3)} cy={toSvgY(3)} r="7" />
        <StaticAnnotationLabel label="corner" x={3} y={1.5} />
      </>
    );
  }

  if (shape === 'cusp') {
    const cuspPoints = Array.from({ length: 49 }, (_, index) => {
      const x = 0.6 + (index / 48) * 4.8;
      const centeredX = x - 3;

      return {
        x,
        y: 2.4 + 3.2 * Math.abs(centeredX) ** (2 / 3),
      };
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
        <path
          d={pointPath([
            { x: 0.8, y: 3 },
            { x: 1.7, y: 3.2 },
            { x: 2.5, y: 3.6 },
            { x: 3, y: 4 },
          ])}
          className="graph-curve"
        />
        <path
          d={pointPath([
            { x: 3, y: 6.8 },
            { x: 3.8, y: 7.2 },
            { x: 4.6, y: 7.5 },
            { x: 5.2, y: 7.8 },
          ])}
          className="graph-curve"
        />
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
}: {
  visual: Extract<InteractiveVisual, { type: 'function-cursor' }>;
}) {
  const [x, setX] = useState(visual.initialX);
  const [isDragging, setIsDragging] = useState(false);
  const curveShape = visual.curveShape ?? 'valley';
  const y = functionValue(x, curveShape);

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    setX(Number(pointerToGraphPoint(event).x.toFixed(1)));
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
}: {
  visual: Extract<InteractiveVisual, { type: 'linear-cursor' }>;
}) {
  const yIntercept = visual.yIntercept ?? 0;
  const lineRange = getVisibleLinearXRange(visual.slope, yIntercept);
  const [x, setX] = useState(() => clamp(visual.initialX, lineRange.startX, lineRange.endX));
  const [isDragging, setIsDragging] = useState(false);
  const y = visual.slope * x + yIntercept;

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    const nextX = Number(pointerToGraphPoint(event).x.toFixed(1));

    setX(clamp(nextX, lineRange.startX, lineRange.endX));
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
}: {
  visual: Extract<InteractiveVisual, { type: 'rate-window' }>;
}) {
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  const [startX, setStartX] = useState(visual.initialStartX);
  const [endX, setEndX] = useState(visual.initialEndX);
  const safeEndX = endX === startX ? startX + 0.1 : endX;
  const startY = functionValue(startX);
  const endY = functionValue(safeEndX);
  const averageRate = (endY - startY) / (safeEndX - startX);

  function updateStart(value: number) {
    setStartX(clamp(value, minX, endX - 0.1));
  }

  function updateEnd(value: number) {
    setEndX(clamp(value, startX + 0.1, maxX));
  }

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!activeHandle) {
      return;
    }

    const nextX = Number(pointerToGraphPoint(event).x.toFixed(1));

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
}: {
  visual: Extract<InteractiveVisual, { type: 'slope-triangle' }>;
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
  const rise = end.y - start.y;
  const run = end.x - start.x;
  const slopeLabel = run === 0 ? 'undefined' : formatNumber(rise / run);

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!activeHandle) {
      return;
    }

    const point = pointerToGraphPoint(event);

    if (activeHandle === 'start') {
      setStart({
        x: Number(clamp(point.x, minX, end.x).toFixed(1)),
        y: Number(clamp(point.y, minY, maxY).toFixed(1)),
      });
      return;
    }

    setEnd({
      x: Number(clamp(point.x, start.x, maxX).toFixed(1)),
      y: Number(clamp(point.y, minY, maxY).toFixed(1)),
    });
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
}: {
  visual: Extract<InteractiveVisual, { type: 'tangent-cursor' }>;
}) {
  const [x, setX] = useState(visual.initialX);
  const [isDragging, setIsDragging] = useState(false);
  const curveShape = visual.curveShape ?? 'valley';
  const y = functionValue(x, curveShape);
  const slope = tangentSlope(x, curveShape);
  const tangentStartX = clamp(x - 1.2, minX, maxX);
  const tangentEndX = clamp(x + 1.2, minX, maxX);
  const tangentStartY = y + slope * (tangentStartX - x);
  const tangentEndY = y + slope * (tangentEndX - x);

  useEffect(() => {
    setX(visual.initialX);
    setIsDragging(false);
  }, [curveShape, visual.initialX]);

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }

    setX(Number(pointerToGraphPoint(event).x.toFixed(1)));
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
