/*
 * Widget: solid-of-revolution — schematic by disk (dV = πR² dx), washer
 * (π(R²-r²) dx), or shell (faux-3D nest, dV = 2πx·f(x) dx). A draggable
 * representative element along [a, b] reads out its volume term and the total
 * volume (numeric integral).
 */

import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { MathText } from '../MathText';
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
  type PlotScale,
} from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';

/** Named generating curves. */
export type RevolutionCurvePreset =
  | 'sqrt' // y = sqrt(x)
  | 'line' // y = x
  | 'parabola' // y = x^2
  | 'cubic' // y = x^3 / 12 (gentle)
  | 'sine' // y = 2 + sin(x) (positive hump)
  | 'constant'; // y = c (uses the curve's own scaling)

export type SolidOfRevolutionVisual = {
  type: 'solid-of-revolution';
  label: string;
  /** Disk, washer (needs `innerCurve`), or cylindrical shell. */
  method: 'disk' | 'washer' | 'shell';
  /** Outer / generating boundary (overridden by `outerFn`). */
  outerCurve: RevolutionCurvePreset;
  /** Inner boundary for washers / shell holes (overridden by `innerFn`). */
  innerCurve?: RevolutionCurvePreset;
  /** Axis the region is revolved about (default 'x'). */
  axis?: 'x' | 'y';
  /** Lower bound of the solid. */
  a: number;
  /** Upper bound of the solid. */
  b: number;
  /** Initial position of the draggable representative slice/shell. */
  initialSlice?: number;
  /** Visible domain (defaults: 0..6). */
  xMin?: number;
  xMax?: number;
  /** Visible range (defaults to fit the curve). */
  yMin?: number;
  yMax?: number;
  /** Optional custom boundaries; presets remain the serializable default. */
  outerFn?: (x: number) => number;
  innerFn?: (x: number) => number;
};

const CONSTANT_VALUE = 3;
const REGION_SAMPLES = 72;
const INTEGRATION_STEPS = 600;
const TAU = Math.PI * 2;

type Pt = { x: number; y: number };

function presetToFn(preset: RevolutionCurvePreset): (x: number) => number {
  switch (preset) {
    case 'sqrt':
      return (x) => Math.sqrt(Math.max(0, x));
    case 'line':
      return (x) => x;
    case 'parabola':
      return (x) => x * x;
    case 'cubic':
      return (x) => (x * x * x) / 12;
    case 'sine':
      return (x) => 2 + Math.sin(x);
    case 'constant':
      return () => CONSTANT_VALUE;
    default:
      return (x) => x;
  }
}

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Trapezoidal numeric integral with non-finite samples treated as zero. */
function integrate(fn: (x: number) => number, lo: number, hi: number): number {
  if (hi === lo) {
    return 0;
  }
  const step = (hi - lo) / INTEGRATION_STEPS;
  let total = 0.5 * (finiteOr(fn(lo)) + finiteOr(fn(hi)));
  for (let i = 1; i < INTEGRATION_STEPS; i += 1) {
    total += finiteOr(fn(lo + step * i));
  }
  return total * step;
}

function samplePoints(fn: (x: number) => number, lo: number, hi: number): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= REGION_SAMPLES; i += 1) {
    const x = lo + ((hi - lo) * i) / REGION_SAMPLES;
    points.push({ x, y: finiteOr(fn(x)) });
  }
  return points;
}

/** Closed SVG path for the band between `topPts` and `bottomPts`. */
function bandPath(topPts: Pt[], bottomPts: Pt[], scale: PlotScale): string {
  const ordered = [...topPts, ...[...bottomPts].reverse()];
  return `${linePath(ordered, scale)} Z`;
}

/*
 * Faux-3D shell scene under an oblique projection: a horizontal circle of radius r
 * at height h maps to an axis-centred ellipse (semi-axes r*sx and r*sx*tilt) raised
 * by h*sy; the near half of each ellipse is its lower (larger screen-y) half.
 */

const SCENE_MARGIN_X = 30;
const SCENE_MARGIN_TOP = 14;
const SCENE_MARGIN_BOTTOM = 14;
const SCENE_TILT = 0.3; // rim foreshortening: vertical semi-axis = horizontal * tilt
const NEST_SHELLS = 7;

type ShellScene = {
  /** Screen x of the revolution (y-)axis. */
  cx: number;
  /** Screen y of the base plane (data height 0) at the axis. */
  baseY: number;
  /** Pixels per unit radius (horizontal). */
  sx: number;
  /** Pixels per unit height (vertical). */
  sy: number;
  /** Rim foreshortening factor. */
  tilt: number;
  rMax: number;
  hMax: number;
};

/** Fit the nest (radius rMax, tallest height hMax) into the 360x220 canvas. */
function makeShellScene(rMax: number, hMax: number): ShellScene {
  const cx = PLOT_WIDTH / 2;
  const availHalfW = cx - SCENE_MARGIN_X;
  const safeR = Math.max(rMax, 1e-6);
  const sx = availHalfW / safeR;
  const tilt = SCENE_TILT;
  /* Reserve 2*bOuter of vertical room for the outermost rim's bulge. */
  const bOuter = availHalfW * tilt;
  const baseY = PLOT_HEIGHT - SCENE_MARGIN_BOTTOM - bOuter;
  const safeH = Math.max(hMax, 1e-6);
  const sy = Math.max(2, (baseY - SCENE_MARGIN_TOP - bOuter) / safeH);
  return { cx, baseY, sx, sy, tilt, rMax: safeR, hMax: safeH };
}

const aOf = (s: ShellScene, r: number) => Math.max(0, r) * s.sx;
const bOf = (s: ShellScene, r: number) => Math.max(0, r) * s.sx * s.tilt;
const topYOf = (s: ShellScene, h: number) => s.baseY - Math.max(0, h) * s.sy;

/** Closed full-ellipse path, sampled (so it can fill an annulus via evenodd). */
function ellipseLoop(cx: number, cy: number, a: number, b: number, steps = 48): string {
  let d = '';
  for (let i = 0; i < steps; i += 1) {
    const t = (TAU * i) / steps;
    d += `${i === 0 ? 'M' : 'L'} ${(cx + a * Math.cos(t)).toFixed(2)} ${(cy + b * Math.sin(t)).toFixed(2)} `;
  }
  return `${d}Z`;
}

/**
 * Front-visible lateral wall of an upright cylinder, bounded by the near halves
 * of the top and base rims and the silhouette edges at cx +/- a.
 */
function cylinderWallPath(
  cx: number,
  topY: number,
  baseY: number,
  a: number,
  b: number,
  steps = 28,
): string {
  let d = `M ${(cx + a).toFixed(2)} ${topY.toFixed(2)} `;
  for (let i = 1; i <= steps; i += 1) {
    const t = (Math.PI * i) / steps; // 0 -> pi, sweeping the lower (front) half
    d += `L ${(cx + a * Math.cos(t)).toFixed(2)} ${(topY + b * Math.sin(t)).toFixed(2)} `;
  }
  d += `L ${(cx - a).toFixed(2)} ${baseY.toFixed(2)} `;
  for (let i = steps - 1; i >= 0; i -= 1) {
    const t = (Math.PI * i) / steps;
    d += `L ${(cx + a * Math.cos(t)).toFixed(2)} ${(baseY + b * Math.sin(t)).toFixed(2)} `;
  }
  return `${d}Z`;
}

export function SolidOfRevolution({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: SolidOfRevolutionVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const clipId = useId();
  const aboutYAxis = visual.method === 'shell';
  const axisName = visual.axis ?? (aboutYAxis ? 'y' : 'x');

  const lo = Math.min(visual.a, visual.b);
  const hi = Math.max(visual.a, visual.b);

  const outerFn = visual.outerFn ?? presetToFn(visual.outerCurve);
  const hasInner = visual.innerFn != null || visual.innerCurve != null;
  const innerFn =
    visual.innerFn ?? (visual.innerCurve != null ? presetToFn(visual.innerCurve) : () => 0);

  const initialSlice = clamp(visual.initialSlice ?? (lo + hi) / 2, lo, hi);
  const [slice, setSlice] = useState(initialSlice);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction-completion: fire once after the user actually drags the slice.
  const interactionFired = useRef(false);
  function fireInteractionComplete() {
    if (!interactionFired.current) {
      interactionFired.current = true;
      onInteractionComplete?.();
    }
  }

  /* Self-demo: sweep the representative slice/shell across [a, b]. */
  const demo = useScalarDemonstration({
    demonstrate,
    value: slice,
    initial: initialSlice,
    target: clamp(snapToStep(hi), lo, hi),
    apply: setSlice,
    enabled: hi > lo,
    onInteraction: fireInteractionComplete,
  });

  // Fit the vertical range to the region over [a, b].
  let fitMax = 0;
  let fitMin = 0;
  for (let i = 0; i <= REGION_SAMPLES; i += 1) {
    const x = lo + ((hi - lo) * i) / REGION_SAMPLES;
    const outer = finiteOr(outerFn(x));
    const inner = hasInner ? finiteOr(innerFn(x)) : 0;
    fitMax = Math.max(fitMax, outer, inner);
    fitMin = Math.min(fitMin, outer, inner);
  }
  const reach = Math.max(Math.abs(fitMax), Math.abs(fitMin), 1) * 1.18;

  const xMin = Math.min(visual.xMin ?? 0, lo);
  const xMax = Math.max(visual.xMax ?? 6, hi);
  const computedYMin = aboutYAxis ? Math.min(0, fitMin * 1.18) : -reach;
  const computedYMax = reach;
  const yMin = visual.yMin ?? computedYMin;
  const yMax = visual.yMax ?? computedYMax;

  const scale = createPlotScale({
    xMin,
    xMax: xMax > xMin ? xMax : xMin + 1,
    yMin,
    yMax: yMax > yMin ? yMax : yMin + 1,
  });

  // Representative-element quantities at the current slice.
  const outerR = Math.abs(finiteOr(outerFn(slice)));
  const innerR = hasInner ? Math.abs(finiteOr(innerFn(slice))) : 0;
  const shellHeight = Math.max(0, outerR - innerR);
  const dx = (hi - lo) / 10 || 0.1;

  let elementVolume: number;
  let totalVolume: number;
  let elementFormula: string;
  if (visual.method === 'shell') {
    elementVolume = 2 * Math.PI * slice * shellHeight * dx;
    totalVolume =
      2 *
      Math.PI *
      integrate(
        (x) => x * (finiteOr(outerFn(x)) - (hasInner ? finiteOr(innerFn(x)) : 0)),
        lo,
        hi,
      );
    elementFormula = `\\Delta V = 2\\pi x\\,f(x)\\,\\Delta x \\approx ${formatNumber(elementVolume)}`;
  } else if (visual.method === 'washer') {
    elementVolume = Math.PI * (outerR * outerR - innerR * innerR) * dx;
    totalVolume =
      Math.PI *
      integrate((x) => {
        const o = finiteOr(outerFn(x));
        const inr = hasInner ? finiteOr(innerFn(x)) : 0;
        return o * o - inr * inr;
      }, lo, hi);
    elementFormula = `\\Delta V = \\pi\\,(R^2 - r^2)\\,\\Delta x \\approx ${formatNumber(elementVolume)}`;
  } else {
    elementVolume = Math.PI * outerR * outerR * dx;
    totalVolume =
      Math.PI *
      integrate((x) => {
        const o = finiteOr(outerFn(x));
        return o * o;
      }, lo, hi);
    elementFormula = `\\Delta V = \\pi R^2\\,\\Delta x \\approx ${formatNumber(elementVolume)}`;
  }

  // The faux-3D scene mapping (shell only; cheap, computed unconditionally).
  const scene = makeShellScene(hi, fitMax);

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) {
      return;
    }
    let next: number;
    if (aboutYAxis) {
      // Map the pointer's distance from the axis to a shell radius.
      const rect = event.currentTarget.getBoundingClientRect();
      const svgX = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * PLOT_WIDTH : scene.cx;
      next = clamp(snapToStep(Math.abs(svgX - scene.cx) / scene.sx), lo, hi);
    } else {
      next = clamp(snapToStep(pointerToData(event, scale).x), lo, hi);
    }
    // A real drag changes the slice value; a no-op click leaves it untouched.
    if (next !== slice) {
      fireInteractionComplete();
    }
    setSlice(next);
  }

  function nudge(event: KeyboardEvent<SVGElement>) {
    const step = event.shiftKey ? 0.5 : 0.1;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      delta = step;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      delta = -step;
    } else {
      return;
    }
    event.preventDefault();
    demo.cancel();
    const next = clamp(snapToStep(slice + delta), lo, hi);
    if (next !== slice) {
      fireInteractionComplete();
    }
    setSlice(next);
  }

  // Disk/washer (2D cross-section) geometry on the shared plot scale.
  const outerPts = samplePoints((x) => Math.abs(finiteOr(outerFn(x))), lo, hi);
  const bottomFn =
    visual.method === 'disk'
      ? () => 0
      : (x: number) => (hasInner ? Math.abs(finiteOr(innerFn(x))) : 0);
  const bottomPts = samplePoints(bottomFn, lo, hi);

  const sliceSvgX = scale.toSvgX(slice);
  const axisSvgY = scale.toSvgY(0);
  const radiusPx = Math.max(0, axisSvgY - scale.toSvgY(outerR));
  const innerRadiusPx = Math.max(0, axisSvgY - scale.toSvgY(innerR));
  const thicknessPx = clamp((dx / (xMax - xMin)) * (PLOT_WIDTH - PLOT_PADDING * 2), 6, 24);

  const caption = (
    <MathText
      text={
        `${aboutYAxis ? 'Shell' : visual.method === 'washer' ? 'Washer' : 'Disk'} at $x = ${formatNumber(slice)}$:` +
        ` $${aboutYAxis ? `\\text{radius}=${formatNumber(slice)},\\ \\text{height}=${formatNumber(shellHeight)}` : visual.method === 'washer' ? `R=${formatNumber(outerR)},\\ r=${formatNumber(innerR)}` : `R=${formatNumber(outerR)}`}$.` +
        ` $${elementFormula}$. Total $V \\approx ${formatNumber(totalVolume)}$.`
      }
    />
  );

  return (
    <WidgetFigure
      label={visual.label}
      /* Reserve three lines: the readout is long and its numbers change as the slice drags. */
      captionLines={3}
      caption={caption}
      instruction={
        <MathText
          text={`Drag the representative ${aboutYAxis ? 'shell' : 'slice'} along $[${formatNumber(lo)}, ${formatNumber(hi)}]$, revolving about the $${axisName}$-axis. ${aboutYAxis ? 'Shell' : 'Slab'} thickness $\\Delta x = ${formatNumber(dx)}$.`}
        />
      }
    >
      {aboutYAxis ? (
        <ShellScene3D
          scene={scene}
          clipId={clipId}
          ariaLabel={visual.label}
          lo={lo}
          hi={hi}
          slice={slice}
          dx={dx}
          outerFn={(x) => Math.abs(finiteOr(outerFn(x)))}
          shellHeight={shellHeight}
          isDragging={isDragging}
          onPointerMove={updateFromPointer}
          onPointerUp={() => setIsDragging(false)}
          onPointerLeave={() => setIsDragging(false)}
          onPointerCancel={() => setIsDragging(false)}
          onHandleDown={(event) => {
            demo.cancel();
            capturePointer(event);
            setIsDragging(true);
            if (lo === hi) {
              fireInteractionComplete();
            }
          }}
          onHandleKey={nudge}
        />
      ) : (
        <PlotFrame
          scale={scale}
          ariaLabel={visual.label}
          onPointerMove={updateFromPointer}
          onPointerUp={() => setIsDragging(false)}
          onPointerLeave={() => setIsDragging(false)}
          onPointerCancel={() => setIsDragging(false)}
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

          {/* Interval boundaries. */}
          <line
            className="widget-grid-line"
            x1={scale.toSvgX(lo)}
            y1={PLOT_PADDING}
            x2={scale.toSvgX(lo)}
            y2={PLOT_HEIGHT - PLOT_PADDING}
            strokeDasharray="4 4"
          />
          <line
            className="widget-grid-line"
            x1={scale.toSvgX(hi)}
            y1={PLOT_PADDING}
            x2={scale.toSvgX(hi)}
            y2={PLOT_HEIGHT - PLOT_PADDING}
            strokeDasharray="4 4"
          />

          {/* Mirror silhouette of the revolved solid. */}
          <path
            className="widget-area-fill"
            d={bandPath(
              outerPts.map((p) => ({ x: p.x, y: -p.y })),
              bottomPts.map((p) => ({ x: p.x, y: -p.y })),
              scale,
            )}
            opacity={0.5}
          />

          {/* Generating region. */}
          <path className="widget-area-fill" d={bandPath(outerPts, bottomPts, scale)} />

          {/* Boundary curves. */}
          <path
            className="graph-curve"
            d={linePath(
              outerPts.map((p) => ({ x: p.x, y: -p.y })),
              scale,
            )}
            opacity={0.35}
            fill="none"
          />
          <path className="graph-curve" d={linePath(outerPts, scale)} fill="none" />
          {hasInner && visual.method !== 'disk' ? (
            <path className="widget-approx-curve" d={linePath(bottomPts, scale)} fill="none" />
          ) : null}

          {/* Axis of revolution (the x-axis). */}
          <line
            x1={PLOT_PADDING}
            y1={axisSvgY}
            x2={PLOT_WIDTH - PLOT_PADDING}
            y2={axisSvgY}
            stroke="var(--ink)"
            strokeWidth={3}
            strokeLinecap="round"
          />

          {/* Representative disk / washer. */}
          <g>
            <ellipse
              cx={sliceSvgX}
              cy={axisSvgY}
              rx={thicknessPx / 2}
              ry={radiusPx}
              fill="var(--brand)"
              fillOpacity={0.22}
              stroke="var(--brand)"
              strokeWidth={2}
            />
            {visual.method === 'washer' && innerR > 0 ? (
              <ellipse
                cx={sliceSvgX}
                cy={axisSvgY}
                rx={thicknessPx / 2}
                ry={innerRadiusPx}
                fill="var(--surface)"
                stroke="var(--info)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            ) : null}
            <line
              x1={sliceSvgX}
              y1={axisSvgY}
              x2={sliceSvgX}
              y2={scale.toSvgY(outerR)}
              stroke="var(--ink-soft)"
              strokeWidth={1.5}
            />
          </g>

          {/* Draggable handle (sits on the outer boundary at the slice). */}
          <circle
            aria-label="draggable representative element"
            className="graph-point graph-handle"
            cx={sliceSvgX}
            cy={scale.toSvgY(outerR)}
            r={8}
            role="button"
            tabIndex={0}
            onPointerDown={(event) => {
              demo.cancel();
              capturePointer(event);
              setIsDragging(true);
              if (lo === hi) {
                fireInteractionComplete();
              }
            }}
            onKeyDown={nudge}
          />
        </PlotFrame>
      )}
    </WidgetFigure>
  );
}

/**
 * Faux-3D nest of concentric cylindrical shells (shell method), with the draggable
 * representative shell highlighted as a hollow tube (radius x, height f(x),
 * thickness dx) plus radius/height guides for dV = 2*pi*x*f(x)*dx.
 */
function ShellScene3D({
  scene,
  clipId,
  ariaLabel,
  lo,
  hi,
  slice,
  dx,
  outerFn,
  shellHeight,
  isDragging,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onHandleDown,
  onHandleKey,
}: {
  scene: ShellScene;
  clipId: string;
  ariaLabel: string;
  lo: number;
  hi: number;
  slice: number;
  dx: number;
  outerFn: (x: number) => number;
  shellHeight: number;
  isDragging: boolean;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onHandleDown: (event: PointerEvent<SVGElement>) => void;
  onHandleKey: (event: KeyboardEvent<SVGElement>) => void;
}) {
  const { cx, baseY, tilt } = scene;

  // The solid's outer wall reaches the height of the boundary shell at r = hi.
  const hOuter = outerFn(hi);
  const aOuter = aOf(scene, hi);
  const bOuterRim = bOf(scene, hi);
  const topYOuter = topYOf(scene, hOuter);

  /* Concentric shells across the domain, each a thin cylinder topped at f(r). */
  const ghosts = [];
  for (let k = 1; k <= NEST_SHELLS; k += 1) {
    const r = lo + ((hi - lo) * k) / NEST_SHELLS;
    if (r <= 0) {
      continue;
    }
    ghosts.push({ r, h: outerFn(r) });
  }

  /* Representative shell (tube of thickness dx): wall exaggerated to a legible minimum. */
  const aCenter = aOf(scene, slice);
  const halfThick = Math.max((dx * scene.sx) / 2, 5);
  const aShellOuter = aCenter + halfThick;
  const aShellInner = Math.max(0, aCenter - halfThick);
  const topYShell = topYOf(scene, shellHeight);

  const handleX = cx + aCenter;
  const handleY = topYShell;

  return (
    <svg
      className="interactive-graph-svg"
      viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      style={{ touchAction: 'none' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={PLOT_WIDTH} height={PLOT_HEIGHT} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Revolution axis (faint, behind the solid). */}
        <line
          x1={cx}
          y1={SCENE_MARGIN_TOP - 2}
          x2={cx}
          y2={baseY + bOuterRim}
          stroke="var(--ink-soft)"
          strokeWidth={1.25}
          strokeDasharray="3 4"
          opacity={0.55}
        />

        {/* Base disk of the solid (footprint). */}
        <ellipse
          cx={cx}
          cy={baseY}
          rx={aOuter}
          ry={bOuterRim}
          fill="var(--brand)"
          fillOpacity={0.06}
          stroke="var(--brand)"
          strokeOpacity={0.25}
          strokeWidth={1}
        />

        {/* Nested shells: translucent walls (back-to-front) then crisp top rims, so nesting stays legible. */}
        {ghosts.map((g, index) =>
          g.r >= hi ? null : (
            <path
              key={`wall-${index}`}
              d={cylinderWallPath(cx, topYOf(scene, g.h), baseY, aOf(scene, g.r), bOf(scene, g.r))}
              fill="var(--brand)"
              fillOpacity={0.07}
              stroke="var(--brand)"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ),
        )}
        {ghosts.map((g, index) =>
          g.r >= hi ? null : (
            <ellipse
              key={`rim-${index}`}
              cx={cx}
              cy={topYOf(scene, g.h)}
              rx={aOf(scene, g.r)}
              ry={bOf(scene, g.r)}
              fill="none"
              stroke="var(--brand)"
              strokeOpacity={0.55}
              strokeWidth={1.3}
            />
          ),
        )}

        {/* Outer wall + mouth (3D silhouette), translucent so inner shells show through. */}
        <path
          d={cylinderWallPath(cx, topYOuter, baseY, aOuter, bOuterRim)}
          fill="var(--brand)"
          fillOpacity={0.08}
          stroke="var(--brand)"
          strokeOpacity={0.6}
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        <ellipse
          cx={cx}
          cy={topYOuter}
          rx={aOuter}
          ry={bOuterRim}
          fill="none"
          stroke="var(--brand)"
          strokeOpacity={0.75}
          strokeWidth={1.75}
        />

        {/* Representative shell: highlighted hollow tube (radius x, height f(x), thickness Δx). */}
        <g>
          {/* Outer lateral wall (front-facing). */}
          <path
            d={cylinderWallPath(cx, topYShell, baseY, aShellOuter, aShellOuter * tilt)}
            fill="var(--brand)"
            fillOpacity={0.42}
            stroke="var(--brand-strong)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* Hollow base ring (footprint). */}
          <path
            d={`${ellipseLoop(cx, baseY, aShellOuter, aShellOuter * tilt)} ${ellipseLoop(cx, baseY, aShellInner, aShellInner * tilt)}`}
            fillRule="evenodd"
            fill="var(--brand-strong)"
            fillOpacity={0.3}
            stroke="var(--brand-strong)"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          {/* Top annulus: the wall thickness Δx seen from above (shows it is hollow). */}
          <path
            d={`${ellipseLoop(cx, topYShell, aShellOuter, aShellOuter * tilt)} ${ellipseLoop(cx, topYShell, aShellInner, aShellInner * tilt)}`}
            fillRule="evenodd"
            fill="var(--brand-strong)"
            fillOpacity={0.9}
            stroke="var(--brand-strong)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </g>

        {/* Radius (x) and height (f(x)) guides for the representative shell. */}
        <line
          x1={cx}
          y1={baseY}
          x2={cx + aCenter}
          y2={baseY}
          stroke="var(--ink-soft)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          x1={cx + aShellOuter}
          y1={baseY}
          x2={cx + aShellOuter}
          y2={topYShell}
          stroke="var(--ink-soft)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {aCenter > 12 ? (
          <text
            x={cx + aCenter / 2}
            y={baseY + 13}
            fill="var(--ink-soft)"
            fontSize={11}
            fontWeight={700}
            textAnchor="middle"
          >
            x
          </text>
        ) : null}
        {baseY - topYShell > 12 ? (
          <text
            x={cx + aShellOuter + 4}
            y={(baseY + topYShell) / 2 + 4}
            fill="var(--ink-soft)"
            fontSize={11}
            fontWeight={700}
          >
            h
          </text>
        ) : null}

        {/* Axis cap label. */}
        <text x={cx + 5} y={SCENE_MARGIN_TOP + 6} fill="var(--ink-soft)" fontSize={11} fontWeight={700}>
          y
        </text>

        {/* Draggable handle on the shell's rim. */}
        <circle
          aria-label={`draggable representative shell at x = ${formatNumber(slice)}`}
          className="graph-point graph-handle"
          cx={handleX}
          cy={handleY}
          r={8}
          role="button"
          tabIndex={0}
          aria-grabbed={isDragging}
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKey}
        />
      </g>
    </svg>
  );
}
