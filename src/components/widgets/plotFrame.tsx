// Shared, read-only plotting helpers for the chapter 5-11 interactive widgets.
//
// Every widget under `src/components/widgets/` is built and rendered by an
// INDEPENDENT builder that edits ONLY its own file. To make that possible this
// module is the single shared toolbox they all import: the SVG frame, the
// coordinate scaling math, a few path helpers, and the placeholder stub the
// scaffold ships with. Builders should treat this file as READ-ONLY: if you
// need a one-off style, set SVG presentation attributes inline rather than
// editing this module or the stylesheet.
//
// House style matches the original `InteractiveGraph` SVGs: a 360x220 canvas
// with 32px padding, thin grey axes/ticks, and the brand-coloured curve.

import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { MathText } from '../MathText';
import './plotFrame.css';

export const PLOT_WIDTH = 360;
export const PLOT_HEIGHT = 220;
export const PLOT_PADDING = 32;

const INNER_WIDTH = PLOT_WIDTH - PLOT_PADDING * 2;
const INNER_HEIGHT = PLOT_HEIGHT - PLOT_PADDING * 2;

/** The data-space rectangle a plot maps onto the SVG canvas. */
export type PlotDomain = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

/** Bidirectional mapping between data coordinates and SVG pixel coordinates. */
export type PlotScale = {
  domain: PlotDomain;
  toSvgX: (x: number) => number;
  toSvgY: (y: number) => number;
  fromSvgX: (svgX: number) => number;
  fromSvgY: (svgY: number) => number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Snap a data-space coordinate to the nearest multiple of `step` (default 0.1).
 *
 * Every draggable handle on the interactive graphs runs the dragged coordinate
 * through this right after converting the pointer to data space (and arrow-key
 * nudges step by `step` too), so both pointer drags and keyboard nudges advance
 * in clean 0.1 increments (…, 4.8, 4.9, 5.0, …). The result is re-rounded to the
 * step's precision so binary-float drift (e.g. 0.1 * 3 = 0.30000000000000004)
 * never leaks into the dot position or the readout.
 */
export function snapToStep(value: number, step = 0.1): number {
  if (!Number.isFinite(value) || !(step > 0)) {
    return value;
  }
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toPrecision(12));
}

/** Compact number formatting shared with the original graphs (integers stay bare). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '∞';
  }
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
}

/** Build a linear scale that maps `domain` onto the padded SVG canvas. */
export function createPlotScale(domain: PlotDomain): PlotScale {
  const spanX = domain.xMax - domain.xMin || 1;
  const spanY = domain.yMax - domain.yMin || 1;

  return {
    domain,
    toSvgX: (x) => PLOT_PADDING + ((x - domain.xMin) / spanX) * INNER_WIDTH,
    toSvgY: (y) => PLOT_HEIGHT - PLOT_PADDING - ((y - domain.yMin) / spanY) * INNER_HEIGHT,
    fromSvgX: (svgX) => domain.xMin + ((svgX - PLOT_PADDING) / INNER_WIDTH) * spanX,
    fromSvgY: (svgY) => domain.yMin + ((PLOT_HEIGHT - PLOT_PADDING - svgY) / INNER_HEIGHT) * spanY,
  };
}

/** "Nice" integer-ish tick positions inside [min, max] (~6 ticks). */
export function defaultTicks(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) {
    return [min];
  }

  const rawStep = span / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude);
  const step = candidates.find((candidate) => candidate >= rawStep) ?? candidates[candidates.length - 1];

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let tick = start; tick <= max + step * 1e-6; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return ticks;
}

/** A positioned label box in SVG pixel space (top-left corner + size). */
export type LabelBox = { x: number; y: number; width: number; height: number };

/** Rough rendered width (px) of a short SVG label at the house label style. */
export function estimateLabelWidth(label: string, fontSize = 11): number {
  // ~0.62em per glyph for the bold label font, plus horizontal padding so the
  // rounded halo never crowds the first/last character.
  return Math.max(16, label.length * fontSize * 0.62 + 12);
}

const overlap1D = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
  Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));

/**
 * Choose a screen position for a marked-point's text label so it clears the axis
 * lines, the axis tick numbers, and the "x"/"y" axis letters, and stays fully
 * inside the plotting area. Pure + deterministic, so it can be unit-tested.
 *
 * The box is tried on each side of the point (right, the two right diagonals,
 * below, above, then the mirrored left placements). Every candidate is clamped
 * into the plot and scored by how much it still overlaps the axis "keep-out"
 * bands — the vertical y-axis plus its left-hand tick numbers, and the horizontal
 * x-axis plus the tick numbers beneath it. The lowest-overlap candidate wins,
 * with a stable right-first preference, so the common case (a point sitting on
 * the y-axis, like the limit graph's `(0, 1)`) pushes its label into the open
 * space beside the curve instead of onto the axis line and the "1" tick.
 */
export function placePointLabel(options: {
  /** Marker centre in SVG px. */
  px: number;
  py: number;
  /** Label box size (use estimateLabelWidth for the width). */
  width: number;
  height: number;
  /** SVG x of the vertical (y) axis line, when it is on screen. */
  axisXPx?: number;
  /** SVG y of the horizontal (x) axis line, when it is on screen. */
  axisYPx?: number;
  /** Marker radius, so the label sits off the dot rather than over it. */
  pointRadius?: number;
  /** Extra gap between the marker / axis furniture and the label box. */
  gap?: number;
}): LabelBox {
  const { px, py, width, height } = options;
  const radius = options.pointRadius ?? 5;
  const gap = options.gap ?? 6;
  const offset = radius + gap;

  const innerLeft = PLOT_PADDING;
  const innerRight = PLOT_WIDTH - PLOT_PADDING;
  const innerTop = PLOT_PADDING;
  const innerBottom = PLOT_HEIGHT - PLOT_PADDING;

  // Keep-out bands: the axis line itself plus the tick numbers hugging it. y-tick
  // numbers are right-anchored ~10px left of the y-axis; x-tick numbers sit ~20px
  // below the x-axis. A little over-reservation keeps multi-char ticks ("0.5",
  // "-2") clear too. Bands span the full cross-axis since the axis runs edge to
  // edge, so a 1D overlap on the relevant axis is a real collision.
  const yTickBand = 26;
  const xTickBand = 24;
  const axisLineHalf = 3;
  const vBand =
    options.axisXPx != null
      ? { min: options.axisXPx - yTickBand, max: options.axisXPx + axisLineHalf }
      : null;
  const hBand =
    options.axisYPx != null
      ? { min: options.axisYPx - axisLineHalf, max: options.axisYPx + xTickBand }
      : null;

  const candidates = [
    { x: px + offset, y: py - height / 2 }, // right
    { x: px + offset, y: py + offset }, // below-right
    { x: px + offset, y: py - offset - height }, // above-right
    { x: px - width / 2, y: py + offset }, // below
    { x: px - width / 2, y: py - offset - height }, // above
    { x: px - offset - width, y: py - height / 2 }, // left
    { x: px - offset - width, y: py + offset }, // below-left
    { x: px - offset - width, y: py - offset - height }, // above-left
  ];

  let best: LabelBox = { x: innerLeft, y: innerTop, width, height };
  let bestScore = Infinity;
  candidates.forEach((candidate, priority) => {
    const x = clamp(candidate.x, innerLeft, Math.max(innerLeft, innerRight - width));
    const y = clamp(candidate.y, innerTop, Math.max(innerTop, innerBottom - height));
    const clampPenalty = Math.abs(x - candidate.x) + Math.abs(y - candidate.y);
    const vOverlap = vBand ? overlap1D(x, x + width, vBand.min, vBand.max) : 0;
    const hOverlap = hBand ? overlap1D(y, y + height, hBand.min, hBand.max) : 0;
    // Overlaps dominate, then how far we had to clamp, then the side preference.
    const score = (vOverlap + hOverlap) * 1000 + clampPenalty + priority * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = { x, y, width, height };
    }
  });

  return best;
}

/** SVG path string through data points (no smoothing). */
export function linePath(points: Array<{ x: number; y: number }>, scale: PlotScale): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${scale.toSvgX(point.x).toFixed(2)} ${scale.toSvgY(point.y).toFixed(2)}`,
    )
    .join(' ');
}

/**
 * Sample `fn` across the x-domain and return an SVG path. The pen lifts on
 * non-finite samples so reciprocals / asymptotes render as separate strokes.
 */
export function functionPath(
  fn: (x: number) => number,
  scale: PlotScale,
  options: { samples?: number; from?: number; to?: number } = {},
): string {
  const samples = options.samples ?? 96;
  const from = options.from ?? scale.domain.xMin;
  const to = options.to ?? scale.domain.xMax;

  let path = '';
  let penDown = false;
  for (let index = 0; index <= samples; index += 1) {
    const x = from + ((to - from) * index) / samples;
    const y = fn(x);
    if (!Number.isFinite(y)) {
      penDown = false;
      continue;
    }
    path += `${penDown ? 'L' : 'M'} ${scale.toSvgX(x).toFixed(2)} ${scale.toSvgY(y).toFixed(2)} `;
    penDown = true;
  }
  return path.trim();
}

/** Convert a pointer event on the plot SVG into clamped data coordinates. */
export function pointerToData(event: PointerEvent<SVGSVGElement>, scale: PlotScale): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const svgX = ((event.clientX - rect.left) / rect.width) * PLOT_WIDTH;
  const svgY = ((event.clientY - rect.top) / rect.height) * PLOT_HEIGHT;
  return {
    x: clamp(scale.fromSvgX(svgX), scale.domain.xMin, scale.domain.xMax),
    y: clamp(scale.fromSvgY(svgY), scale.domain.yMin, scale.domain.yMax),
  };
}

/** Pointer-capture helper for draggable handles (mirrors the original graphs). */
export function capturePointer(event: PointerEvent<SVGElement>): void {
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

type PlotFrameProps = {
  scale: PlotScale;
  ariaLabel?: string;
  /** Override the auto-generated x ticks. */
  xTicks?: number[];
  /** Override the auto-generated y ticks. */
  yTicks?: number[];
  /** Draw the small "x" / "y" axis letters (default true). */
  showAxisLetters?: boolean;
  children: ReactNode;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  onPointerCancel?: () => void;
};

/**
 * The shared SVG canvas: grey axes through the origin (or along the edges when
 * the origin is off-screen), tick marks, and whatever the widget draws on top.
 */
export function PlotFrame({
  scale,
  ariaLabel,
  xTicks,
  yTicks,
  showAxisLetters = true,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: PlotFrameProps) {
  const { domain } = scale;
  const resolvedXTicks = xTicks ?? defaultTicks(domain.xMin, domain.xMax);
  const resolvedYTicks = yTicks ?? defaultTicks(domain.yMin, domain.yMax);
  const axisY = domain.yMin <= 0 && domain.yMax >= 0 ? scale.toSvgY(0) : PLOT_HEIGHT - PLOT_PADDING;
  const axisX = domain.xMin <= 0 && domain.xMax >= 0 ? scale.toSvgX(0) : PLOT_PADDING;

  return (
    <svg
      className="interactive-graph-svg"
      viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
    >
      <line x1={PLOT_PADDING} y1={axisY} x2={PLOT_WIDTH - PLOT_PADDING} y2={axisY} />
      <line x1={axisX} y1={PLOT_PADDING} x2={axisX} y2={PLOT_HEIGHT - PLOT_PADDING} />
      {resolvedXTicks.map((tick) => (
        <g key={`x-${tick}`} className="axis-tick">
          <line x1={scale.toSvgX(tick)} y1={axisY} x2={scale.toSvgX(tick)} y2={axisY + 6} />
          <text x={scale.toSvgX(tick)} y={axisY + 20} textAnchor="middle">
            {formatNumber(tick)}
          </text>
        </g>
      ))}
      {resolvedYTicks.map((tick) => (
        <g key={`y-${tick}`} className="axis-tick">
          <line x1={axisX - 6} y1={scale.toSvgY(tick)} x2={axisX} y2={scale.toSvgY(tick)} />
          <text x={axisX - 10} y={scale.toSvgY(tick) + 4} textAnchor="end">
            {formatNumber(tick)}
          </text>
        </g>
      ))}
      {showAxisLetters ? (
        <>
          <text x={PLOT_WIDTH - PLOT_PADDING + 8} y={axisY + 4}>
            x
          </text>
          <text x={axisX - 10} y={PLOT_PADDING - 10}>
            y
          </text>
        </>
      ) : null}
      {children}
    </svg>
  );
}

/**
 * A marked-point text label with a rounded halo, positioned by `placePointLabel`
 * so it never lands on the axes, the tick numbers, or the axis letters and never
 * spills outside the plot. Shared so every widget that labels a point on the
 * curve gets the same legible, collision-free placement; it reuses the global
 * `.graph-point-label*` chrome (surface-filled rounded rect behind bold text),
 * so it needs no new CSS.
 */
export function PointLabel({
  px,
  py,
  label,
  axisXPx,
  axisYPx,
  pointRadius,
}: {
  px: number;
  py: number;
  label: string;
  axisXPx?: number;
  axisYPx?: number;
  pointRadius?: number;
}) {
  const width = estimateLabelWidth(label);
  const height = 18;
  const box = placePointLabel({ px, py, width, height, axisXPx, axisYPx, pointRadius });

  return (
    <g className="graph-point-label-group" aria-hidden="true">
      <rect className="graph-point-label-bg" x={box.x} y={box.y} width={box.width} height={box.height} rx={7} />
      <text
        className="graph-point-label"
        x={box.x + box.width / 2}
        y={box.y + box.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

type WidgetFigureProps = {
  label: string;
  /** Optional secondary readout line under the bold label. */
  caption?: ReactNode;
  /** Optional instruction line under the plot (e.g. "Drag the handle"). */
  instruction?: ReactNode;
  /**
   * Reserve a constant block of this many text lines for the readout caption so
   * a caption whose text changes length (e.g. a value gaining a decimal digit,
   * or a verdict word getting longer) can never grow/shrink and reflow the SVG
   * below it. Defaults to 2 lines (see plotFrame.css). Widgets with a longer
   * worst-case caption pass a higher number here.
   */
  captionLines?: number;
  children: ReactNode;
};

/**
 * House chrome for a finished widget: the `<section>` wrapper, the MathText
 * label, an optional readout caption, the plot, and an optional instruction.
 * Builders can use this so their markup matches the original graphs, or render
 * their own `<section className="interactive-graph">` if they need more control.
 *
 * The caption sits in a height-reserved block (see `captionLines`) so a live
 * readout never shifts the plot, the single most common cause of figure "shake".
 */
export function WidgetFigure({ label, caption, instruction, captionLines, children }: WidgetFigureProps) {
  const captionStyle: CSSProperties | undefined =
    captionLines != null ? { minHeight: `${(captionLines * 1.3).toFixed(3)}em` } : undefined;

  return (
    <section className="interactive-graph" aria-label={label}>
      <div className="graph-copy">
        <strong>
          <MathText text={label} />
        </strong>
        {caption != null ? (
          <span className="widget-figure-caption" style={captionStyle}>
            {caption}
          </span>
        ) : null}
      </div>
      {children}
      {instruction != null ? <p className="graph-instruction">{instruction}</p> : null}
    </section>
  );
}

/**
 * Compiling stub shipped by the scaffold. Each widget renders this until its
 * builder replaces the component body with the real interactive rendering.
 */
export function WidgetPlaceholder({ label, note }: { label: string; note?: string }) {
  const scale = createPlotScale({ xMin: 0, xMax: 6, yMin: 0, yMax: 10 });

  return (
    <section className="interactive-graph widget-placeholder" aria-label={label}>
      <div className="graph-copy">
        <strong>
          <MathText text={label} />
        </strong>
        <span className="widget-placeholder-note">{note ?? 'Interactive preview coming soon'}</span>
      </div>
      <PlotFrame scale={scale} ariaLabel={label}>
        <text
          className="widget-placeholder-text"
          x={PLOT_WIDTH / 2}
          y={PLOT_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          preview coming soon
        </text>
      </PlotFrame>
    </section>
  );
}
