/*
 * Shared plotting toolbox for the interactive widgets: SVG frame, coordinate
 * scaling, and path helpers. Treat as READ-ONLY — for a one-off style, set SVG
 * attributes inline. House style: 360x220 canvas, 32px padding, grey axes/ticks.
 */

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
 * Snap a data-space coordinate to the nearest multiple of `step` (default 0.1),
 * re-rounded to the step's precision so binary-float drift never leaks into the
 * dot position or readout.
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
  /* ~0.62em per glyph plus padding so the halo never crowds the end characters. */
  return Math.max(16, label.length * fontSize * 0.62 + 12);
}

const overlap1D = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
  Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));

/**
 * Position a marked point's label clear of the axes, tick numbers, and axis
 * letters and inside the plot. Pure/deterministic (unit-testable): each side is
 * tried, clamped, and scored by keep-out overlap; lowest wins (right-first).
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

  /* Keep-out bands around each axis line + its tick numbers, slightly over-
     reserved so multi-char ticks ("0.5", "-2") stay clear. */
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
 * Sample `fn` across the x-domain into an SVG path; the pen lifts on non-finite
 * samples so asymptotes render as separate strokes.
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
 * Marked-point label with a rounded halo, positioned by `placePointLabel` to
 * avoid the axes/ticks/letters and stay in-plot. Reuses global
 * `.graph-point-label*` chrome.
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
   * Reserve this many caption lines so a changing-length caption can't reflow the
   * SVG below it. Defaults to 2 (see plotFrame.css).
   */
  captionLines?: number;
  children: ReactNode;
};

/**
 * House chrome for a widget: `<section>` wrapper, MathText label, optional caption
 * and instruction, and the plot. The caption block is height-reserved (see
 * `captionLines`) so a live readout never shifts the plot.
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
