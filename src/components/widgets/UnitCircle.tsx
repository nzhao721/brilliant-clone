/*
 * Widget: unit-circle — drag a point around the circle and read the right triangle
 * it forms (cos θ leg, sin θ leg, hypotenuse 1, angle θ). The point snaps to
 * multiples of π/6 so every readout is an exact special-angle value (KaTeX
 * fractions/radicals, colour-coded sides). Custom square SVG so the circle stays round.
 */

import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { MathText } from '../MathText';
import { clientToSvg } from './plotFrame';
import { useScalarDemonstration } from './useDemonstration';

export type UnitCircleVisual = {
  type: 'unit-circle';
  /** Bold heading above the figure (MathText). */
  label: string;
  /** Starting angle as an integer multiple of pi/6 (0-11). Defaults to 1 (pi/6). */
  initialStepIndex?: number;
};

// 12 snap positions, one every pi/6 (30 degrees).
const STEPS = 12;
const STEP = Math.PI / 6;
const TWO_PI = Math.PI * 2;

// Exact special-angle values, indexed by the pi/6 multiple. KaTeX source.
const ANGLE_TEX = [
  '0',
  '\\dfrac{\\pi}{6}',
  '\\dfrac{\\pi}{3}',
  '\\dfrac{\\pi}{2}',
  '\\dfrac{2\\pi}{3}',
  '\\dfrac{5\\pi}{6}',
  '\\pi',
  '\\dfrac{7\\pi}{6}',
  '\\dfrac{4\\pi}{3}',
  '\\dfrac{3\\pi}{2}',
  '\\dfrac{5\\pi}{3}',
  '\\dfrac{11\\pi}{6}',
];
const COS_TEX = [
  '1',
  '\\dfrac{\\sqrt{3}}{2}',
  '\\dfrac{1}{2}',
  '0',
  '-\\dfrac{1}{2}',
  '-\\dfrac{\\sqrt{3}}{2}',
  '-1',
  '-\\dfrac{\\sqrt{3}}{2}',
  '-\\dfrac{1}{2}',
  '0',
  '\\dfrac{1}{2}',
  '\\dfrac{\\sqrt{3}}{2}',
];
const SIN_TEX = [
  '0',
  '\\dfrac{1}{2}',
  '\\dfrac{\\sqrt{3}}{2}',
  '1',
  '\\dfrac{\\sqrt{3}}{2}',
  '\\dfrac{1}{2}',
  '0',
  '-\\dfrac{1}{2}',
  '-\\dfrac{\\sqrt{3}}{2}',
  '-1',
  '-\\dfrac{\\sqrt{3}}{2}',
  '-\\dfrac{1}{2}',
];
// Plain-text mirrors for the SVG aria-label (no KaTeX in accessibility text).
const ANGLE_PLAIN = ['0', 'pi/6', 'pi/3', 'pi/2', '2pi/3', '5pi/6', 'pi', '7pi/6', '4pi/3', '3pi/2', '5pi/3', '11pi/6'];
const COS_PLAIN = ['1', '\u221a3/2', '1/2', '0', '-1/2', '-\u221a3/2', '-1', '-\u221a3/2', '-1/2', '0', '1/2', '\u221a3/2'];
const SIN_PLAIN = ['0', '1/2', '\u221a3/2', '1', '\u221a3/2', '1/2', '0', '-1/2', '-\u221a3/2', '-1', '-\u221a3/2', '-1/2'];

// Colour roles (match src/styles.css palette).
const COLOR_COS = 'var(--info)'; // horizontal leg
const COLOR_SIN = 'var(--accent)'; // vertical leg
const COLOR_HYP = 'var(--brand)'; // hypotenuse / radius + point

// Square SVG geometry.
const SIZE = 300;
const CENTER = SIZE / 2;
const UNIT = 92; // pixels per data unit (radius 1)
const AXIS = 1.42; // axis half-length in data units
const ARC_R = 0.34; // angle arc radius in data units

const toX = (x: number) => CENTER + x * UNIT;
const toY = (y: number) => CENTER - y * UNIT;

function normalizeIndex(value: number): number {
  return ((Math.round(value) % STEPS) + STEPS) % STEPS;
}

/** Nearest pi/6 snap index for a data-space point relative to the origin. */
function indexForPoint(dx: number, dy: number): number {
  let angle = Math.atan2(dy, dx);
  if (angle < 0) {
    angle += TWO_PI;
  }
  return normalizeIndex(angle / STEP);
}

/** Sampled points along the angle arc from 0 to `angle` at radius `r` (data units). */
function arcSvgPoints(angle: number, r: number): string {
  const steps = Math.max(1, Math.round((angle / TWO_PI) * 72));
  const points: string[] = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = (angle * k) / steps;
    points.push(`${toX(r * Math.cos(t)).toFixed(2)} ${toY(r * Math.sin(t)).toFixed(2)}`);
  }
  return points.join(' L ');
}

export function UnitCircle({
  visual,
  onInteractionComplete,
  demonstrate,
}: {
  visual: UnitCircleVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
}) {
  const initialIndex = normalizeIndex(visual.initialStepIndex ?? 1);
  const [stepIndex, setStepIndex] = useState(initialIndex);
  const [dragging, setDragging] = useState(false);

  /* Fire once when the learner first moves the point to a new angle. */
  const interactionFiredRef = useRef(false);
  const fireInteractionComplete = () => {
    if (interactionFiredRef.current) {
      return;
    }
    interactionFiredRef.current = true;
    onInteractionComplete?.();
  };

  /* Self-demo: rotate to π/2 (or 3π/2 if already there) in whole π/6 steps. */
  const demoTargetIndex = stepIndex === 3 ? 9 : 3;
  const demo = useScalarDemonstration({
    demonstrate,
    value: stepIndex,
    initial: initialIndex,
    target: demoTargetIndex,
    apply: setStepIndex,
    round: (value) => normalizeIndex(Math.round(value)),
    onInteraction: fireInteractionComplete,
  });

  const angle = stepIndex * STEP;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const pointX = toX(cos);
  const pointY = toY(sin);
  const footX = toX(cos); // foot of the vertical leg sits on the x-axis at (cos, 0)
  const footY = toY(0);

  const hasHorizontalLeg = Math.abs(cos) > 1e-6;
  const hasVerticalLeg = Math.abs(sin) > 1e-6;
  const showRightAngle = hasHorizontalLeg && hasVerticalLeg;

  function updateFromPointer(event: PointerEvent<SVGSVGElement>) {
    /* Use the shared rendered-box + viewBox mapping so the point tracks the pointer
       1:1 even when the square SVG is letterboxed at its on-screen size. */
    const { x: px, y: py } = clientToSvg(event.currentTarget, event.clientX, event.clientY);
    const nextIndex = indexForPoint((px - CENTER) / UNIT, (CENTER - py) / UNIT);
    if (nextIndex !== stepIndex) {
      fireInteractionComplete();
    }
    setStepIndex(nextIndex);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    demo.cancel();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    updateFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (dragging) {
      updateFromPointer(event);
    }
  }

  function handleKeyDown(event: KeyboardEvent<SVGCircleElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      demo.cancel();
      setStepIndex((index) => normalizeIndex(index + 1));
      fireInteractionComplete();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      demo.cancel();
      setStepIndex((index) => normalizeIndex(index - 1));
      fireInteractionComplete();
    }
  }

  const ariaLabel =
    `Unit circle with a draggable point. Angle theta = ${ANGLE_PLAIN[stepIndex]} radians. ` +
    `Horizontal leg cos theta = ${COS_PLAIN[stepIndex]}, vertical leg sin theta = ${SIN_PLAIN[stepIndex]}, hypotenuse = 1.`;

  const midHypX = toX(cos / 2);
  const midHypY = toY(sin / 2);

  /* Place the hypotenuse "1" offset perpendicular to OP, away from the foot, so it
     clears the legs/marker/labels; at quadrantal angles push it opposite the
     surviving leg. Offsets are unit vectors (y down). */
  const HYP_LABEL_OFFSET = 15;
  let hypDir: { x: number; y: number };
  if (!hasVerticalLeg) {
    /* θ = 0 or π: only the horizontal leg (value below the axis), so lift "1" above. */
    hypDir = { x: 0, y: -1 };
  } else if (!hasHorizontalLeg) {
    /* θ = π/2 or 3π/2: only the vertical leg (value at right), so push "1" left. */
    hypDir = { x: -1, y: 0 };
  } else {
    /* General: foot lies on the sin*cos side of OP, so label the opposite side. */
    hypDir = sin * cos > 0 ? { x: -sin, y: -cos } : { x: sin, y: cos };
  }
  const hypLabelX = midHypX + hypDir.x * HYP_LABEL_OFFSET;
  const hypLabelY = midHypY + hypDir.y * HYP_LABEL_OFFSET;

  return (
    <section className="interactive-graph" aria-label={visual.label}>
      <div className="graph-copy">
        <strong>
          <MathText text={visual.label} />
        </strong>
        <span style={{ display: 'flex', alignItems: 'center', minHeight: '2.1em' }}>
          {/* Text-style fractions keep this caption one line tall at every angle (the grid below uses display fractions). */}
          <MathText
            text={`Point: $(\\cos\\theta,\\ \\sin\\theta) = \\left(${COS_TEX[stepIndex].replace(
              /\\dfrac/g,
              '\\tfrac',
            )},\\ ${SIN_TEX[stepIndex].replace(/\\dfrac/g, '\\tfrac')}\\right)$`}
          />
        </span>
      </div>

      <svg
        className="interactive-graph-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={ariaLabel}
        style={{ width: '100%', maxWidth: 400, height: 'auto', display: 'block', margin: '0 auto', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {/* axes */}
        <line x1={toX(-AXIS)} y1={toY(0)} x2={toX(AXIS)} y2={toY(0)} stroke="#c2c8d0" strokeWidth={1} />
        <line x1={toX(0)} y1={toY(-AXIS)} x2={toX(0)} y2={toY(AXIS)} stroke="#c2c8d0" strokeWidth={1} />

        {/* unit circle track */}
        <circle cx={toX(0)} cy={toY(0)} r={UNIT} fill="none" stroke="#cdd3db" strokeWidth={2} />

        {/* angle sector + arc */}
        {stepIndex !== 0 ? (
          <>
            <path
              d={`M ${toX(0)} ${toY(0)} L ${arcSvgPoints(angle, ARC_R)} Z`}
              fill="var(--warn)"
              fillOpacity={0.18}
              stroke="none"
            />
            <path
              d={`M ${arcSvgPoints(angle, ARC_R)}`}
              fill="none"
              stroke="#9aa1ab"
              strokeWidth={1.5}
            />
          </>
        ) : null}
        {stepIndex !== 0 ? (
          <text
            x={toX(ARC_R * 1.6 * Math.cos(angle / 2))}
            y={toY(ARC_R * 1.6 * Math.sin(angle / 2))}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontStyle="italic"
            fill="#46505c"
          >
            {'\u03b8'}
          </text>
        ) : null}

        {/* horizontal leg = cos(theta) */}
        {hasHorizontalLeg ? (
          <line x1={toX(0)} y1={toY(0)} x2={footX} y2={footY} stroke={COLOR_COS} strokeWidth={4} strokeLinecap="round" />
        ) : null}

        {/* vertical leg = sin(theta) */}
        {hasVerticalLeg ? (
          <line x1={footX} y1={footY} x2={pointX} y2={pointY} stroke={COLOR_SIN} strokeWidth={4} strokeLinecap="round" />
        ) : null}

        {/* right-angle marker where the legs meet */}
        {showRightAngle ? (
          <path
            d={`M ${footX + (cos > 0 ? -10 : 10)} ${footY} L ${footX + (cos > 0 ? -10 : 10)} ${footY + (sin > 0 ? -10 : 10)} L ${footX} ${footY + (sin > 0 ? -10 : 10)}`}
            fill="none"
            stroke="#9aa1ab"
            strokeWidth={1.5}
          />
        ) : null}

        {/* hypotenuse = radius = 1 */}
        <line x1={toX(0)} y1={toY(0)} x2={pointX} y2={pointY} stroke={COLOR_HYP} strokeWidth={4} strokeLinecap="round" />
        <text
          x={hypLabelX}
          y={hypLabelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={13}
          fontWeight={700}
          fill={COLOR_HYP}
        >
          1
        </text>

        {/* cos θ value, colour-matched, kept opposite the point across the x-axis to clear the legs/marker/"1". */}
        {hasHorizontalLeg ? (
          <text
            x={toX(cos / 2)}
            y={toY(0) + (sin >= 0 ? 16 : -16)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontWeight={700}
            fill={COLOR_COS}
          >
            {COS_PLAIN[stepIndex]}
          </text>
        ) : null}

        {/* sin θ value, colour-matched, kept just outside the leg so it clears the point and "1". */}
        {hasVerticalLeg ? (
          <text
            x={footX + (cos >= 0 ? 13 : -13)}
            y={toY(sin / 2)}
            textAnchor={cos >= 0 ? 'start' : 'end'}
            dominantBaseline="middle"
            fontSize={13}
            fontWeight={700}
            fill={COLOR_SIN}
          >
            {SIN_PLAIN[stepIndex]}
          </text>
        ) : null}

        {/* origin */}
        <circle cx={toX(0)} cy={toY(0)} r={3} fill="#8b95a3" />

        {/* draggable point */}
        <circle
          className="graph-handle"
          cx={pointX}
          cy={pointY}
          r={9}
          fill={COLOR_HYP}
          stroke="var(--surface)"
          strokeWidth={2}
          role="button"
          tabIndex={0}
          aria-label="Draggable point on the unit circle. Use the arrow keys to change the angle."
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => event.currentTarget.setPointerCapture?.(event.pointerId)}
          style={{ cursor: 'grab' }}
        />
      </svg>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          /* Fixed 2.6em rows (clears a display fraction) so the figure height stays constant between angles. */
          gridAutoRows: '2.6em',
          alignItems: 'center',
          gap: '3px 18px',
          margin: '6px 0 0',
          fontSize: '0.98rem',
          fontWeight: 600,
        }}
      >
        <span style={{ color: 'var(--ink)' }}>
          <MathText text={`$\\theta = ${ANGLE_TEX[stepIndex]}$`} />
        </span>
        <span style={{ color: COLOR_HYP }}>
          <MathText text={'hypotenuse $= 1$'} />
        </span>
        <span style={{ color: COLOR_COS }}>
          <MathText text={`horizontal leg $\\cos\\theta = ${COS_TEX[stepIndex]}$`} />
        </span>
        <span style={{ color: COLOR_SIN }}>
          <MathText text={`vertical leg $\\sin\\theta = ${SIN_TEX[stepIndex]}$`} />
        </span>
      </div>

      <p className="graph-instruction">
        <MathText text={'Drag the point around the circle - it snaps to multiples of $\\tfrac{\\pi}{6}$.'} />
      </p>
    </section>
  );
}
