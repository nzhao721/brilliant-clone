/*
 * Widget: sequence-plot — a stem plot over integer n of a_n ('terms') or partial
 * sums S_N ('partial-sums'). A slider reveals terms left-to-right (1..maxCount);
 * an optional dashed `limit` line marks the value approached.
 */

import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { MathText } from '../MathText';
import {
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  WidgetFigure,
  clamp,
  createPlotScale,
  formatNumber,
} from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';
import './widgetSlider.css';

/** Named term formulas a_n. */
export type SequencePreset =
  | 'one-over-n' // 1/n -> 0
  | 'n-over-n-plus-1' // n/(n+1) -> 1
  | 'geometric-half' // firstTerm * ratio^(n-1)
  | 'alternating-harmonic' // (-1)^{n+1}/n
  | 'powers-two' // 2^(n-1) (diverges)
  | 'one-over-n-squared' // 1/n^2
  | 'one-over-factorial' // 1/n!
  | 'constant'; // a_n = c

export type SequencePlotVisual = {
  type: 'sequence-plot';
  label: string;
  /** Term formula preset (overridden by `term`). */
  sequence: SequencePreset;
  /** Plot the terms themselves or their partial sums (default 'terms'). */
  mode?: 'terms' | 'partial-sums';
  /** Initial number of terms shown (default 8). */
  count?: number;
  /** Largest count the slider allows (default 20). */
  maxCount?: number;
  /** Dashed target line the values approach (omit if none / divergent). */
  limit?: number;
  /** First term for the geometric/constant presets (default 1). */
  firstTerm?: number;
  /** Common ratio for the geometric preset (default 0.5). */
  ratio?: number;
  /** Visible range override (auto-fit when omitted). */
  yMin?: number;
  yMax?: number;
  /** Optional custom term formula; presets remain the serializable default. */
  term?: (n: number) => number;
};

const DEFAULT_COUNT = 8;
const DEFAULT_MAX_COUNT = 20;
const POINT_RADIUS = 4.5;

/** n! for small integer n (n grows slowly here; 1/n! shrinks fast). */
function factorial(n: number): number {
  let result = 1;
  for (let k = 2; k <= n; k += 1) {
    result *= k;
  }
  return result;
}

/** Resolve the term formula a_n from the preset + tuning knobs. */
function presetTerm(visual: SequencePlotVisual): (n: number) => number {
  const firstTerm = visual.firstTerm ?? 1;
  const ratio = visual.ratio ?? 0.5;

  switch (visual.sequence) {
    case 'one-over-n':
      return (n) => 1 / n;
    case 'n-over-n-plus-1':
      return (n) => n / (n + 1);
    case 'geometric-half':
      return (n) => firstTerm * ratio ** (n - 1);
    case 'alternating-harmonic':
      return (n) => (n % 2 === 0 ? -1 : 1) / n;
    case 'powers-two':
      return (n) => 2 ** (n - 1);
    case 'one-over-n-squared':
      return (n) => 1 / n ** 2;
    case 'one-over-factorial':
      return (n) => 1 / factorial(n);
    case 'constant':
      return () => firstTerm;
    default:
      return (n) => 1 / n;
  }
}

export function SequencePlot({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: SequencePlotVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const mode = visual.mode ?? 'terms';
  const maxCount = Math.max(1, Math.round(visual.maxCount ?? DEFAULT_MAX_COUNT));
  const initialCount = clamp(Math.round(visual.count ?? DEFAULT_COUNT), 1, maxCount);
  const [shownCount, setShownCount] = useState(initialCount);
  const count = clamp(shownCount, 1, maxCount);

  // Interaction-completion: fire once after the user adjusts the term slider.
  const interactionFired = useRef(false);
  function fireInteractionComplete() {
    if (!interactionFired.current) {
      interactionFired.current = true;
      onInteractionComplete?.();
    }
  }

  /* Self-demo: ramp the count to its maximum, revealing terms left-to-right. */
  const demo = useScalarDemonstration({
    demonstrate,
    value: count,
    initial: initialCount,
    target: maxCount,
    apply: setShownCount,
    enabled: maxCount > 1,
    round: (value) => clamp(Math.round(value), 1, maxCount),
    onInteraction: fireInteractionComplete,
  });

  /* Compute every value up to maxCount once; the slider only reveals more of them. */
  const termFn = useMemo(() => visual.term ?? presetTerm(visual), [visual]);
  const values = useMemo(() => {
    const out: number[] = [];
    let runningSum = 0;
    for (let n = 1; n <= maxCount; n += 1) {
      runningSum += termFn(n);
      out.push(mode === 'partial-sums' ? runningSum : termFn(n));
    }
    return out;
  }, [termFn, maxCount, mode]);

  const shownValues = values.slice(0, count);
  const limit = typeof visual.limit === 'number' && Number.isFinite(visual.limit) ? visual.limit : undefined;

  // Auto-fit y to the revealed values (plus the 0 baseline and the limit line).
  const finiteShown = shownValues.filter((value) => Number.isFinite(value));
  const candidates = [0, ...finiteShown];
  if (limit !== undefined) {
    candidates.push(limit);
  }
  const rawMin = visual.yMin ?? Math.min(...candidates);
  const rawMax = visual.yMax ?? Math.max(...candidates);
  const span = rawMax - rawMin || 1;
  const yMin = visual.yMin ?? rawMin - span * 0.08;
  const yMax = visual.yMax ?? rawMax + span * 0.08;

  // The frame spans the full slider range so terms reveal into a stable canvas.
  const scale = createPlotScale({ xMin: 0, xMax: maxCount + 1, yMin, yMax });
  const baselineY = clamp(scale.toSvgY(0), PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING);

  const points = shownValues.map((value, index) => {
    const n = index + 1;
    const finite = Number.isFinite(value);
    return {
      n,
      finite,
      cx: scale.toSvgX(n),
      cy: finite ? clamp(scale.toSvgY(value), PLOT_PADDING, PLOT_HEIGHT - PLOT_PADDING) : PLOT_PADDING,
    };
  });

  const symbol = mode === 'partial-sums' ? 'S' : 'a';
  const currentValue = shownValues[shownValues.length - 1];
  const currentText = Number.isFinite(currentValue) ? formatNumber(currentValue) : '\\infty';
  const readout = `$${symbol}_{${count}} = ${currentText}$`;

  const sliderAriaLabel =
    mode === 'partial-sums' ? 'Number of terms summed' : 'Number of terms shown';

  /* Slider track-fill percentage for the shared WebKit gradient (Firefox fills natively). */
  const sliderProgress = maxCount > 1 ? ((count - 1) / (maxCount - 1)) * 100 : 0;
  const plotAriaLabel = `${mode === 'partial-sums' ? 'Partial sums' : 'Sequence terms'} stem plot${
    limit !== undefined ? ` approaching ${formatNumber(limit)}` : ''
  }`;
  const instruction = `Drag to reveal ${
    mode === 'partial-sums' ? 'partial sums' : 'terms'
  } from left to right${limit !== undefined ? '; the dashed line marks the value they approach.' : '.'}`;

  const limitY = limit !== undefined ? scale.toSvgY(limit) : 0;
  const showLimitLine = limit !== undefined && limit >= yMin && limit <= yMax;

  return (
    <WidgetFigure label={visual.label} caption={<MathText text={readout} />} instruction={instruction}>
      <PlotFrame scale={scale} ariaLabel={plotAriaLabel} showAxisLetters={false}>
        {showLimitLine ? (
          <g>
            <line
              x1={PLOT_PADDING}
              x2={PLOT_WIDTH - PLOT_PADDING}
              y1={limitY}
              y2={limitY}
              style={{ stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 5' }}
            />
            {/* Label at the left end, where converging terms don't crowd. */}
            <text
              x={PLOT_PADDING + 2}
              y={clamp(limitY - 6, PLOT_PADDING + 12, PLOT_HEIGHT - PLOT_PADDING - 4)}
              textAnchor="start"
              style={{ fill: 'var(--accent)', fontSize: 12 }}
            >
              {`limit ${formatNumber(limit)}`}
            </text>
          </g>
        ) : null}

        {points.map((point) =>
          point.finite ? (
            <g key={point.n}>
              <line className="widget-stem" x1={point.cx} y1={baselineY} x2={point.cx} y2={point.cy} />
              <circle className="graph-point" cx={point.cx} cy={point.cy} r={POINT_RADIUS} />
            </g>
          ) : null,
        )}

        <text x={PLOT_WIDTH - PLOT_PADDING + 8} y={baselineY + 4}>
          n
        </text>
      </PlotFrame>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: '0.6rem',
          marginTop: '0.35rem',
        }}
      >
        <span
          style={{
            color: 'var(--ink-soft)',
            fontSize: '0.85rem',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {mode === 'partial-sums' ? 'Terms summed' : 'Terms shown'}: {count}
        </span>
        <input
          className="widget-slider"
          type="range"
          min={1}
          max={maxCount}
          step={1}
          value={count}
          onChange={(event) => {
            demo.cancel();
            setShownCount(Number(event.target.value));
            // A range input only fires onChange on a real value change.
            fireInteractionComplete();
          }}
          onPointerDown={() => {
            demo.cancel();
            // Safety: a single-step slider can't change, so the press counts.
            if (maxCount <= 1) {
              fireInteractionComplete();
            }
          }}
          aria-label={sliderAriaLabel}
          style={{ flex: 1, '--widget-slider-progress': `${sliderProgress}%` } as CSSProperties}
        />
      </div>
    </WidgetFigure>
  );
}
