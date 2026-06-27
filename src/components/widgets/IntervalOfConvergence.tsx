// Widget: interval-of-convergence
//
// A number-line visualisation of a power series' interval of convergence.
// The convergence interval (center - R, center + R) is highlighted, the center
// is marked, and the endpoints are drawn as filled dots when included or open
// dots when excluded. With `allReals` the whole visible line is highlighted and
// the radius is reported as infinite. An optional draggable test point reports
// "converges" inside the interval (respecting endpoint inclusion) or "diverges"
// outside it.
//
// This is a 1-D widget, so it draws its own short SVG number line (PLOT_WIDTH
// wide) instead of the full PlotFrame, but it still reuses the shared scale /
// pointer / formatting helpers and the WidgetFigure chrome for a consistent look.

import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { MathText } from '../MathText';
import {
  PLOT_PADDING,
  PLOT_WIDTH,
  WidgetFigure,
  capturePointer,
  clamp,
  createPlotScale,
  formatNumber,
  pointerToData,
  snapToStep,
} from './plotFrame';
import {
  DemoPulseOverlay,
  pulseEnvelope,
  useDemonstration,
  useScalarDemonstration,
} from './useDemonstration';

export type IntervalOfConvergenceVisual = {
  type: 'interval-of-convergence';
  label: string;
  /** Center of the power series. */
  center: number;
  /** Radius of convergence (ignored when `allReals` is true). */
  radius: number;
  /** Left endpoint converges -> filled dot (default false). */
  includeLeft?: boolean;
  /** Right endpoint converges -> filled dot (default false). */
  includeRight?: boolean;
  /** Series converges for all real x (infinite radius; default false). */
  allReals?: boolean;
  /** Visible number-line bounds (default center ± (radius + 2)). */
  lineMin?: number;
  lineMax?: number;
  /** Explicit tick marks (defaults to integers across the visible range). */
  ticks?: number[];
  /** Initial position of an optional draggable test point. */
  initialTestX?: number;
  /** Render the draggable converge/diverge test point (default false). */
  showTestPoint?: boolean;
};

const VIEW_HEIGHT = 120;
const LINE_Y = 54;
const VALUE_LABEL_Y = 16;
const VERDICT_LABEL_Y = 32;
const TICK_LABEL_Y = 76;
const CENTER_LABEL_Y = 92;

const CONVERGE_COLOR = '#15803d';
const DIVERGE_COLOR = '#b91c1c';
const NEUTRAL_COLOR = '#475569';
const AXIS_COLOR = '#9aa4b2';
const SNAP_TOLERANCE = 0.12;

/** Integer ticks across [min, max], thinning the step for very wide ranges. */
function numberLineTicks(min: number, max: number): number[] {
  const span = max - min;
  const step = span > 16 ? Math.max(1, Math.ceil(span / 12)) : 1;
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let tick = start; tick <= max + 1e-9; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return ticks;
}

export function IntervalOfConvergence({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: IntervalOfConvergenceVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const {
    label,
    center,
    includeLeft = false,
    includeRight = false,
    allReals = false,
    showTestPoint = false,
  } = visual;

  // Guard against malformed input so the widget never crashes (radius 0, NaN…).
  const radius = Number.isFinite(visual.radius) ? Math.max(0, visual.radius) : 0;
  const leftEnd = center - radius;
  const rightEnd = center + radius;

  const rawMin = visual.lineMin ?? center - (radius + 2);
  const rawMax = visual.lineMax ?? center + (radius + 2);
  let domMin = Math.min(rawMin, rawMax);
  let domMax = Math.max(rawMin, rawMax);
  if (domMax - domMin < 1e-9) {
    domMin -= 1;
    domMax += 1;
  }

  const scale = createPlotScale({ xMin: domMin, xMax: domMax, yMin: 0, yMax: 1 });
  const toX = (value: number) => scale.toSvgX(value);

  const providedTicks = visual.ticks ?? numberLineTicks(domMin, domMax);
  const ticks = providedTicks.filter((tick) => tick >= domMin - 1e-9 && tick <= domMax + 1e-9);

  const [testX, setTestX] = useState(() => clamp(visual.initialTestX ?? center, domMin, domMax));

  const [isDragging, setIsDragging] = useState(false);

  // Interaction gating: the draggable test point is this widget's control, so
  // fire once when the learner actually moves it (drag past a value change or a
  // keyboard nudge). When there is no test point there is no control, so the
  // figure's first pointer interaction is the fallback completion path.
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Self-demo: glide the test point to a convergence-interval endpoint so the
  // verdict flips right at the boundary (filled = included, open = excluded).
  // With no test point (a static interval) play a brief highlight pulse instead.
  const leftInView = leftEnd >= domMin - 1e-9 && leftEnd <= domMax + 1e-9;
  const rightInView = rightEnd >= domMin - 1e-9 && rightEnd <= domMax + 1e-9;
  let demoTargetX: number;
  if (!allReals && radius > 0) {
    demoTargetX = rightInView ? rightEnd : leftInView ? leftEnd : center;
  } else if (allReals) {
    demoTargetX = domMax - (domMax - center) * 0.4;
  } else {
    demoTargetX = center; // R = 0: the series converges only at its center
  }
  demoTargetX = clamp(snapToStep(demoTargetX), domMin, domMax);
  const initialTestX = clamp(visual.initialTestX ?? center, domMin, domMax);
  const [demoPulse, setDemoPulse] = useState(0);
  const demo = useScalarDemonstration({
    demonstrate,
    value: testX,
    initial: initialTestX,
    target: demoTargetX,
    apply: (value) => setTestX(clamp(value, domMin, domMax)),
    enabled: showTestPoint,
    onInteraction: fireInteractionComplete,
  });
  useDemonstration(demonstrate, (progress) => setDemoPulse(pulseEnvelope(progress)), {
    enabled: !showTestPoint,
  });

  function convergesAt(x: number): boolean {
    if (allReals) {
      return true;
    }
    if (radius <= 0) {
      // A power series always converges at (and only at) its center when R = 0.
      return x === center;
    }
    const leftOk = includeLeft ? x >= leftEnd : x > leftEnd;
    const rightOk = includeRight ? x <= rightEnd : x < rightEnd;
    return leftOk && rightOk;
  }

  function snapTestX(raw: number): number {
    const targets = allReals || radius <= 0 ? [center] : [leftEnd, center, rightEnd];
    for (const target of targets) {
      if (Math.abs(raw - target) <= SNAP_TOLERANCE) {
        return clamp(target, domMin, domMax);
      }
    }
    return clamp(snapToStep(raw), domMin, domMax);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }
    const next = snapTestX(pointerToData(event, scale).x);
    if (next !== testX) {
      fireInteractionComplete();
    }
    setTestX(next);
  }

  function handleSvgPointerDown() {
    // No draggable control means the only completion path is touching the figure.
    if (!showTestPoint) {
      fireInteractionComplete();
    }
  }

  function handleKeyDown(event: KeyboardEvent<SVGCircleElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
      demo.cancel();
      fireInteractionComplete();
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setTestX((prev) => clamp(snapToStep(prev - 0.1), domMin, domMax));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setTestX((prev) => clamp(snapToStep(prev + 0.1), domMin, domMax));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setTestX(domMin);
    } else if (event.key === 'End') {
      event.preventDefault();
      setTestX(domMax);
    }
  }

  const converges = convergesAt(testX);
  const verdict = converges ? 'converges' : 'diverges';
  const verdictColor = converges ? CONVERGE_COLOR : DIVERGE_COLOR;

  const minPx = toX(domMin);
  const maxPx = toX(domMax);
  const centerPx = toX(clamp(center, domMin, domMax));
  const leftPx = toX(clamp(leftEnd, domMin, domMax));
  const rightPx = toX(clamp(rightEnd, domMin, domMax));
  const labelX = clamp(toX(testX), PLOT_PADDING + 24, PLOT_WIDTH - PLOT_PADDING - 24);
  const clampLabel = (px: number) => clamp(px, PLOT_PADDING + 4, PLOT_WIDTH - PLOT_PADDING - 4);

  const leftVisible = leftEnd >= domMin - 1e-9 && leftEnd <= domMax + 1e-9;
  const rightVisible = rightEnd >= domMin - 1e-9 && rightEnd <= domMax + 1e-9;

  const intervalText = allReals
    ? '(-∞, ∞)'
    : radius <= 0
      ? `only x = ${formatNumber(center)}`
      : `${includeLeft ? '[' : '('}${formatNumber(leftEnd)}, ${formatNumber(rightEnd)}${includeRight ? ']' : ')'}`;
  // TeX radius value so an infinite radius renders as a real ∞ glyph.
  const radiusTex = allReals ? '\\infty' : formatNumber(radius);

  // Readouts rendered as KaTeX (R = …, x = …) and separated by a thin muted
  // rule rather than a middle dot, which a learner can misread as multiplication.
  const caption = (
    <>
      Converges on <strong>{intervalText}</strong>
      <span className="widget-readout-sep" aria-hidden="true" />
      <MathText text={`$R = ${radiusTex}$`} />
      {showTestPoint ? (
        <>
          <span className="widget-readout-sep" aria-hidden="true" />
          <MathText text={`$x = ${formatNumber(testX)}$`} />:{' '}
          <span style={{ color: verdictColor, fontWeight: 700 }}>{verdict}</span>
        </>
      ) : null}
    </>
  );

  const instruction = showTestPoint
    ? 'Drag the test point across an endpoint. Filled dots are included; open dots are excluded.'
    : 'Filled dots are included endpoints; open dots are excluded.';

  return (
    <WidgetFigure label={label} caption={caption} instruction={instruction}>
      <svg
        className="interactive-graph-svg"
        viewBox={`0 0 ${PLOT_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`Number line showing the interval of convergence ${intervalText}`}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
      >
        <line x1={minPx} y1={LINE_Y} x2={maxPx} y2={LINE_Y} stroke={AXIS_COLOR} strokeWidth={2} />

        {(allReals || radius > 0) && (
          <line
            x1={allReals ? minPx : leftPx}
            y1={LINE_Y}
            x2={allReals ? maxPx : rightPx}
            y2={LINE_Y}
            stroke="var(--accent)"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.45}
          />
        )}

        {allReals && (
          <>
            <polygon
              points={`${minPx},${LINE_Y} ${minPx + 11},${LINE_Y - 6} ${minPx + 11},${LINE_Y + 6}`}
              fill="var(--accent)"
              opacity={0.7}
            />
            <polygon
              points={`${maxPx},${LINE_Y} ${maxPx - 11},${LINE_Y - 6} ${maxPx - 11},${LINE_Y + 6}`}
              fill="var(--accent)"
              opacity={0.7}
            />
          </>
        )}

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={toX(tick)}
              y1={LINE_Y - 5}
              x2={toX(tick)}
              y2={LINE_Y + 5}
              stroke={AXIS_COLOR}
              strokeWidth={1.5}
            />
            <text x={toX(tick)} y={TICK_LABEL_Y} textAnchor="middle" fontSize={11} fill="#6b7280">
              {formatNumber(tick)}
            </text>
          </g>
        ))}

        <line x1={centerPx} y1={LINE_Y - 12} x2={centerPx} y2={LINE_Y + 12} stroke={NEUTRAL_COLOR} strokeWidth={2} />
        <text x={clampLabel(centerPx)} y={CENTER_LABEL_Y} textAnchor="middle" fontSize={10} fill={NEUTRAL_COLOR}>
          center
        </text>

        {!allReals && radius <= 0 && (
          <circle
            aria-label={`convergence point x = ${formatNumber(center)}`}
            className="graph-point"
            cx={centerPx}
            cy={LINE_Y}
            r={7}
          />
        )}

        {!allReals && radius > 0 && leftVisible && (
          <circle
            aria-label={`left endpoint x = ${formatNumber(leftEnd)} (${includeLeft ? 'included' : 'excluded'})`}
            className={includeLeft ? 'graph-point' : 'graph-open-point'}
            cx={leftPx}
            cy={LINE_Y}
            r={7}
          />
        )}
        {!allReals && radius > 0 && rightVisible && (
          <circle
            aria-label={`right endpoint x = ${formatNumber(rightEnd)} (${includeRight ? 'included' : 'excluded'})`}
            className={includeRight ? 'graph-point' : 'graph-open-point'}
            cx={rightPx}
            cy={LINE_Y}
            r={7}
          />
        )}

        {showTestPoint && (
          <>
            <text x={labelX} y={VALUE_LABEL_Y} textAnchor="middle" fontSize={11} fill="#374151">
              x = {formatNumber(testX)}
            </text>
            <text
              x={labelX}
              y={VERDICT_LABEL_Y}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill={verdictColor}
            >
              {verdict}
            </text>
            <circle
              aria-label={`Draggable convergence test point at x = ${formatNumber(testX)}; series ${verdict}`}
              className="graph-point graph-handle"
              style={{ fill: verdictColor }}
              cx={toX(testX)}
              cy={LINE_Y}
              r={9}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => {
                demo.cancel();
                capturePointer(event);
                setIsDragging(true);
              }}
              onKeyDown={handleKeyDown}
            />
          </>
        )}
        <DemoPulseOverlay pulse={demoPulse} width={PLOT_WIDTH} height={VIEW_HEIGHT} padding={18} />
      </svg>
    </WidgetFigure>
  );
}
