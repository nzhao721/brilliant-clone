// Widget: horizontal-line-test
//
// Interactive "horizontal line test" for invertibility. Plots a function curve
// and lets the learner DRAG a horizontal line y = level up and down across the
// plot. The intersections of the line with the curve are found numerically and
// marked with dots; the readout shows the live intersection COUNT plus the
// verdict for that height. The teaching point: a single intersection at every
// height means the function is one-to-one / invertible, while any height with
// two or more intersections proves it FAILS the test (not invertible without
// first restricting the domain).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { MathText } from '../MathText';
import {
  capturePointer,
  clamp,
  createPlotScale,
  formatNumber,
  functionPath,
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  PlotFrame,
  pointerToData,
  WidgetFigure,
} from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';

/** The curve shapes the horizontal line test can be run against. */
export type HorizontalLineTestCurve = 'parabola' | 'cubic' | 'abs' | 'cosine';

export type HorizontalLineTestVisual = {
  type: 'horizontal-line-test';
  /** Bold heading above the figure (MathText). */
  label: string;
  /** Which curve to plot. Default 'parabola', which FAILS the test. */
  curve?: HorizontalLineTestCurve;
  /** Starting height of the draggable line (defaults to a telling value). */
  initialLevel?: number;
  /**
   * If provided with more than one shape, render buttons that let the learner
   * switch the plotted function so they can compare passing vs failing cases.
   */
  selectableShapes?: HorizontalLineTestCurve[];
  /** Visible-window overrides (each curve ships sensible defaults otherwise). */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
};

type CurveSpec = {
  fn: (x: number) => number;
  /** KaTeX source for f(x), e.g. 'x^2'. */
  tex: string;
  /** Plain-text mirror for the SVG aria description, e.g. 'x^2'. */
  plain: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Telling starting height: failing curves start where >= 2 hits are visible. */
  defaultLevel: number;
};

const TWO_PI = Math.PI * 2;

// Windows are chosen so each curve stays inside its y-range and so the line can
// be dragged into the "0 intersections" zone above/below the curve as well.
const CURVES: Record<HorizontalLineTestCurve, CurveSpec> = {
  parabola: { fn: (x) => x * x, tex: 'x^2', plain: 'x^2', xMin: -3, xMax: 3, yMin: -1, yMax: 9.5, defaultLevel: 4 },
  cubic: { fn: (x) => x * x * x, tex: 'x^3', plain: 'x^3', xMin: -2, xMax: 2, yMin: -8.5, yMax: 8.5, defaultLevel: 3 },
  abs: { fn: (x) => Math.abs(x), tex: '|x|', plain: '|x|', xMin: -4, xMax: 4, yMin: -1, yMax: 4.5, defaultLevel: 2 },
  cosine: { fn: (x) => Math.cos(x), tex: '\\cos x', plain: 'cos x', xMin: -TWO_PI, xMax: TWO_PI, yMin: -1.4, yMax: 1.4, defaultLevel: 0.5 },
};

/** Short button captions (plain unicode so the pills stay compact). */
const SHAPE_BUTTON_LABEL: Record<HorizontalLineTestCurve, string> = {
  parabola: 'x\u00B2',
  cubic: 'x\u00B3',
  abs: '|x|',
  cosine: 'cos x',
};

/** Refine a single root of g bracketed by [lo, hi] (opposite signs) via bisection. */
function bisect(g: (x: number) => number, lo: number, hi: number): number {
  let left = lo;
  let right = hi;
  let fLeft = g(left);
  for (let i = 0; i < 40; i += 1) {
    const mid = (left + right) / 2;
    const fMid = g(mid);
    if (fMid === 0 || (right - left) / 2 < 1e-7) {
      return mid;
    }
    if (fLeft < 0 === fMid < 0) {
      left = mid;
      fLeft = fMid;
    } else {
      right = mid;
    }
  }
  return (left + right) / 2;
}

/**
 * x-values in [xMin, xMax] where fn(x) === level. Dense sampling brackets clean
 * crossings (sign changes, refined by bisection) and also catches tangential
 * touches where |fn - level| dips to ~0 without flipping sign (e.g. a parabola
 * grazed at its vertex). Near-duplicate roots are merged.
 */
export function findIntersections(
  fn: (x: number) => number,
  level: number,
  xMin: number,
  xMax: number,
): number[] {
  const g = (x: number) => fn(x) - level;
  const samples = 600;
  const xs: number[] = [];
  const gs: number[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    xs.push(x);
    gs.push(g(x));
  }

  const roots: number[] = [];
  const touchTol = 1e-4;

  // Clean crossings: a sign flip between neighbours brackets a root.
  for (let i = 1; i <= samples; i += 1) {
    const prev = gs[i - 1];
    const curr = gs[i];
    if (Number.isFinite(prev) && Number.isFinite(curr) && prev * curr < 0) {
      roots.push(bisect(g, xs[i - 1], xs[i]));
    }
  }
  // Tangential touches: |g| reaches a near-zero local minimum without crossing.
  for (let i = 1; i < samples; i += 1) {
    const prev = Math.abs(gs[i - 1]);
    const curr = Math.abs(gs[i]);
    const next = Math.abs(gs[i + 1]);
    if (
      Number.isFinite(prev) &&
      Number.isFinite(curr) &&
      Number.isFinite(next) &&
      curr <= prev &&
      curr <= next &&
      curr < touchTol
    ) {
      roots.push(xs[i]);
    }
  }
  if (Number.isFinite(gs[0]) && Math.abs(gs[0]) < touchTol) {
    roots.push(xs[0]);
  }
  if (Number.isFinite(gs[samples]) && Math.abs(gs[samples]) < touchTol) {
    roots.push(xs[samples]);
  }

  roots.sort((p, q) => p - q);
  const merged: number[] = [];
  const gap = (xMax - xMin) * 0.01;
  for (const root of roots) {
    if (merged.length === 0 || Math.abs(merged[merged.length - 1] - root) > gap) {
      merged.push(root);
    }
  }
  return merged;
}

/** True when SOME height meets the curve at two or more points (fails the test). */
function curveFailsTest(spec: CurveSpec, xMin: number, xMax: number, yMin: number, yMax: number): boolean {
  const steps = 96;
  for (let i = 0; i <= steps; i += 1) {
    const lv = yMin + ((yMax - yMin) * i) / steps;
    if (findIntersections(spec.fn, lv, xMin, xMax).length >= 2) {
      return true;
    }
  }
  return false;
}

export function HorizontalLineTest({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: HorizontalLineTestVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const reactId = useId();
  const clipId = `hlt-clip-${reactId.replace(/:/g, '')}`;

  const selectable =
    visual.selectableShapes && visual.selectableShapes.length > 1 ? visual.selectableShapes : null;
  const initialCurve = visual.curve ?? selectable?.[0] ?? 'parabola';

  const [curveKind, setCurveKind] = useState<HorizontalLineTestCurve>(initialCurve);
  // Follow the author's prop if it changes on a mounted instance.
  useEffect(() => {
    setCurveKind(initialCurve);
  }, [initialCurve]);

  const spec = CURVES[curveKind];
  const xMin = visual.xMin ?? spec.xMin;
  const xMax = visual.xMax ?? spec.xMax;
  const yMin = visual.yMin ?? spec.yMin;
  const yMax = visual.yMax ?? spec.yMax;

  const scale = createPlotScale({ xMin, xMax, yMin, yMax });

  const [level, setLevel] = useState(() => clamp(visual.initialLevel ?? spec.defaultLevel, yMin, yMax));
  const [dragging, setDragging] = useState(false);

  // Fire the completion callback once, the first time the learner actually
  // drags the line to a new height (or nudges it with the keyboard handle).
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  // Self-demo: glide the horizontal line to the height that meets the curve the
  // MOST times — the telling case (a failing curve lands on a height with two or
  // more intersections; a one-to-one curve simply shows its single crossing).
  const demoTargetLevel = useMemo(() => {
    const steps = 96;
    let bestLevel = (yMin + yMax) / 2;
    let bestCount = -1;
    for (let i = 0; i <= steps; i += 1) {
      const candidate = yMin + ((yMax - yMin) * i) / steps;
      const count = findIntersections(spec.fn, candidate, xMin, xMax).length;
      if (count > bestCount) {
        bestCount = count;
        bestLevel = candidate;
      }
    }
    return clamp(Number(bestLevel.toFixed(1)), yMin, yMax);
  }, [spec, xMin, xMax, yMin, yMax]);
  const demo = useScalarDemonstration({
    demonstrate,
    value: level,
    initial: clamp(visual.initialLevel ?? spec.defaultLevel, yMin, yMax),
    target: demoTargetLevel,
    apply: (value) => setLevel(clamp(value, yMin, yMax)),
    onInteraction: fireInteractionComplete,
  });

  // Reset the line to the new curve's telling default whenever the shape swaps.
  useEffect(() => {
    const next = CURVES[curveKind];
    const lo = visual.yMin ?? next.yMin;
    const hi = visual.yMax ?? next.yMax;
    setLevel(clamp(visual.initialLevel ?? next.defaultLevel, lo, hi));
    setDragging(false);
  }, [curveKind, visual.initialLevel, visual.yMin, visual.yMax]);

  const safeLevel = clamp(level, yMin, yMax);

  const roots = useMemo(
    () => findIntersections(spec.fn, safeLevel, xMin, xMax),
    [spec.fn, safeLevel, xMin, xMax],
  );
  const count = roots.length;
  const fails = count >= 2;

  const overallFails = useMemo(
    () => curveFailsTest(spec, xMin, xMax, yMin, yMax),
    [spec, xMin, xMax, yMin, yMax],
  );

  function moveLine(event: PointerEvent<SVGSVGElement>) {
    if (!dragging) {
      return;
    }
    const { y } = pointerToData(event, scale);
    const next = Number(y.toFixed(1));
    if (next !== level) {
      fireInteractionComplete();
    }
    setLevel(next);
  }

  function nudge(event: KeyboardEvent<SVGCircleElement>) {
    const step = (yMax - yMin) / 40;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      demo.cancel();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      setLevel((prev) => Number(clamp(prev + step, yMin, yMax).toFixed(2)));
      fireInteractionComplete();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setLevel((prev) => Number(clamp(prev - step, yMin, yMax).toFixed(2)));
      fireInteractionComplete();
    }
  }

  const startDragging = (event: PointerEvent<SVGElement>) => {
    demo.cancel();
    capturePointer(event);
    setDragging(true);
  };
  const stopDragging = () => setDragging(false);

  // --- Geometry -------------------------------------------------------------
  const lineY = scale.toSvgY(safeLevel);
  const lineX1 = PLOT_PADDING;
  const lineX2 = PLOT_WIDTH - PLOT_PADDING;
  const handleX = lineX2 - 6;
  const axisY = scale.toSvgY(0);

  // Small "y = level" tag riding the left end of the line. It sits just OFF the
  // line (above it, flipping below only when the line is near the top) so it
  // never covers an intersection dot that rides the line itself, and is clamped
  // clear of the x-axis number row in the bottom padding.
  const tagText = `y = ${formatNumber(safeLevel)}`;
  const tagWidth = tagText.length * 6.3 + 12;
  const tagHeight = 17;
  const tagX = lineX1 + 2;
  const tagNearTop = lineY < PLOT_PADDING + tagHeight + 10;
  const tagY = clamp(
    tagNearTop ? lineY + 7 : lineY - tagHeight - 7,
    PLOT_PADDING,
    PLOT_HEIGHT - PLOT_PADDING - tagHeight - 6,
  );

  const pointWord = count === 1 ? 'point' : 'points';
  const verdictPhrase =
    count === 0 ? 'no intersection here' : count === 1 ? 'passes here' : 'fails the horizontal line test';
  const verdictColor = fails ? 'var(--warn)' : count === 1 ? 'var(--brand-strong)' : 'var(--ink-soft)';

  const ariaLabel =
    `Graph of f(x) = ${spec.plain} with a draggable horizontal line at y = ${formatNumber(safeLevel)}. ` +
    `The line meets the curve at ${count} ${pointWord}. ` +
    (overallFails
      ? `f(x) = ${spec.plain} repeats outputs, so it fails the horizontal line test and is not one-to-one.`
      : `f(x) = ${spec.plain} meets each height at most once, so it passes the horizontal line test and is one-to-one.`);

  const buttonBase = {
    appearance: 'none' as const,
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 800,
    padding: '4px 12px',
  };

  return (
    <WidgetFigure
      label={visual.label}
      caption={
        <>
          <MathText text={`$y = ${formatNumber(safeLevel)}$`} /> meets{' '}
          <MathText text={`$f(x) = ${spec.tex}$`} /> at <strong>{count}</strong> {pointWord}
          {' \u2014 '}
          <span style={{ color: verdictColor, fontWeight: 800 }}>{verdictPhrase}</span>
        </>
      }
    >
      {selectable ? (
        <div
          role="group"
          aria-label="Choose a function to test"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '0 0 4px' }}
        >
          {selectable.map((kind) => {
            const active = kind === curveKind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() => setCurveKind(kind)}
                style={{
                  ...buttonBase,
                  background: active ? 'var(--brand)' : 'var(--surface)',
                  border: active ? '1px solid var(--brand)' : '1px solid var(--line)',
                  color: active ? 'var(--surface)' : 'var(--ink-soft)',
                }}
              >
                {SHAPE_BUTTON_LABEL[kind]}
              </button>
            );
          })}
        </div>
      ) : null}

      <PlotFrame
        scale={scale}
        ariaLabel={ariaLabel}
        onPointerMove={moveLine}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        onPointerCancel={stopDragging}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={PLOT_PADDING}
              y={PLOT_PADDING}
              width={PLOT_WIDTH - PLOT_PADDING * 2}
              height={PLOT_HEIGHT - PLOT_PADDING * 2}
            />
          </clipPath>
        </defs>

        <path
          className="graph-curve"
          d={functionPath(spec.fn, scale, { samples: 220 })}
          clipPath={`url(#${clipId})`}
          style={{ pointerEvents: 'none' }}
        />

        {/* Faint guides from each intersection down to the x-axis: one height, many x's. */}
        {roots.map((rootX, index) => (
          <line
            key={`guide-${index}`}
            aria-hidden="true"
            x1={scale.toSvgX(rootX)}
            y1={lineY}
            x2={scale.toSvgX(rootX)}
            y2={axisY}
            stroke="#9aa1ab"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            style={{ pointerEvents: 'none' }}
          />
        ))}

        {/* The draggable horizontal line: a fat invisible hit-area plus the visible stroke. */}
        <line
          x1={lineX1}
          y1={lineY}
          x2={lineX2}
          y2={lineY}
          stroke="transparent"
          strokeWidth={22}
          style={{ cursor: 'grab', pointerEvents: 'stroke' }}
          onPointerDown={startDragging}
        />
        <line
          x1={lineX1}
          y1={lineY}
          x2={lineX2}
          y2={lineY}
          stroke="var(--accent)"
          strokeWidth={3}
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />

        {/* Intersection dots sit on the line at each crossing x. */}
        {roots.map((rootX, index) => (
          <circle
            key={`hit-${index}`}
            className="hlt-intersection"
            aria-hidden="true"
            cx={scale.toSvgX(rootX)}
            cy={lineY}
            r={5}
            fill="var(--surface)"
            stroke="var(--ink)"
            strokeWidth={2.5}
            style={{ pointerEvents: 'none' }}
          />
        ))}

        {/* "y = level" tag at the left end. */}
        <g className="graph-point-label-group" aria-hidden="true">
          <rect className="graph-point-label-bg" x={tagX} y={tagY} width={tagWidth} height={tagHeight} rx={7} />
          <text
            className="graph-point-label"
            x={tagX + tagWidth / 2}
            y={tagY + tagHeight / 2}
            dominantBaseline="middle"
            textAnchor="middle"
          >
            {tagText}
          </text>
        </g>

        {/* Grab knob (keyboard focusable). */}
        <circle
          className="graph-point graph-handle"
          cx={handleX}
          cy={lineY}
          r={8}
          role="button"
          tabIndex={0}
          aria-label={`Draggable horizontal line at y = ${formatNumber(safeLevel)}. Use the up and down arrow keys to change its height.`}
          onPointerDown={startDragging}
          onKeyDown={nudge}
        />
      </PlotFrame>

      <p className="graph-instruction">Drag the horizontal line up and down across the curve.</p>

      <p
        style={{
          margin: '6px auto 0',
          maxWidth: 460,
          textAlign: 'center',
          fontSize: '0.92rem',
          fontWeight: 800,
          color: overallFails ? 'var(--warn)' : 'var(--brand-strong)',
        }}
      >
        <MathText
          text={
            overallFails
              ? `Some height is hit twice, so $f(x) = ${spec.tex}$ is not one-to-one: no inverse unless you restrict the domain.`
              : `Every height is hit at most once, so $f(x) = ${spec.tex}$ is one-to-one and has an inverse.`
          }
        />
      </p>
    </WidgetFigure>
  );
}
