import { useMemo, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// DashboardGauges — the player's instrument cluster for the race HUD: an analog
// SPEEDOMETER (270° sweep, redline, digital readout) plus a classic E—F FUEL gauge.
// Purely presentational: the parent feeds live velocity + fuel every frame, with
// scaling supplied by the caller so the source of truth stays in racePhysics.
// Per-frame cost is tiny — the face/ticks/labels are memoized and only the needle
// rotate, the value-arc dash-offset, and the readout text change — so it is safe at 60fps.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** Point on a circle. SVG y grows downward, so angles increase CLOCKWISE on
 *  screen and 0° points east (right), 90° south (down), 270° north (up). */
function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = deg * DEG;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** An SVG arc path from `startDeg` to `endDeg` along radius `r` (clockwise). */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg >= startDeg ? 1 : 0;
  return `M${start.x.toFixed(3)} ${start.y.toFixed(3)} A${r} ${r} 0 ${largeArc} ${sweep} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

type RadialGaugeProps = {
  /** Unique prefix for this gauge's gradient ids (two gauges share a document). */
  idPrefix: string;
  /** Extra class on the <svg> for per-gauge sizing. */
  className: string;
  /** Live value and the full-scale value it is shown against. */
  value: number;
  max: number;
  /** Needle angle at value=0, and the total clockwise sweep to value=max. */
  startDeg: number;
  sweepDeg: number;
  /** viewBox + dial geometry. */
  viewW: number;
  viewH: number;
  cx: number;
  cy: number;
  radius: number;
  /** Major divisions and how many minor ticks sit within each. */
  majorCount: number;
  minorPerMajor: number;
  /** Label for a major tick, by its 0-based major index; null = no label. */
  labelFor: (majorIndex: number) => string | null;
  /** Highlight ticks at/above this value fraction (e.g. a speedo redline). */
  dangerFromT?: number;
  /** Highlight ticks at/below this value fraction (e.g. a near-empty fuel zone). */
  dangerBelowT?: number;
  /** Needle + value-arc colour (switched to a warning colour when low). */
  accent: string;
  /** Accessible name carrying the live value (role="img"). */
  ariaLabel: string;
  /** Digital readout, drawn in the dial's open lower area. */
  children: ReactNode;
};

const DANGER_COLOR = 'var(--accent, #ff5a4d)';
const MAJOR_TICK_LEN = 9;
const MINOR_TICK_LEN = 5;

function RadialGauge({
  idPrefix,
  className,
  value,
  max,
  startDeg,
  sweepDeg,
  viewW,
  viewH,
  cx,
  cy,
  radius,
  majorCount,
  minorPerMajor,
  labelFor,
  dangerFromT,
  dangerBelowT,
  accent,
  ariaLabel,
  children,
}: RadialGaugeProps) {
  // Clamp so the needle pegs at the ends (e.g. a brief downhill over-speed) and
  // never sweeps past the dial.
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const needleAngle = startDeg + fraction * sweepDeg;

  // Static dial furniture (face arc length, tick geometry, labels) — rebuilt only
  // when the gauge's SHAPE changes, never per value-frame.
  const arcRadius = radius - 1;
  const { trackPath, arcLength, ticks } = useMemo(() => {
    const total = majorCount * minorPerMajor;
    const built: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      major: boolean;
      danger: boolean;
      label: string | null;
      lx: number;
      ly: number;
    }[] = [];
    for (let i = 0; i <= total; i += 1) {
      const t = i / total;
      const deg = startDeg + t * sweepDeg;
      const major = i % minorPerMajor === 0;
      const outer = polar(cx, cy, radius, deg);
      const inner = polar(cx, cy, radius - (major ? MAJOR_TICK_LEN : MINOR_TICK_LEN), deg);
      const danger =
        (dangerFromT != null && t >= dangerFromT - 1e-6) ||
        (dangerBelowT != null && t <= dangerBelowT + 1e-6);
      const label = major ? labelFor(i / minorPerMajor) : null;
      const labelPoint = polar(cx, cy, radius - MAJOR_TICK_LEN - 7, deg);
      built.push({
        x1: outer.x,
        y1: outer.y,
        x2: inner.x,
        y2: inner.y,
        major,
        danger,
        label,
        lx: labelPoint.x,
        ly: labelPoint.y,
      });
    }
    return {
      trackPath: arcPath(cx, cy, arcRadius, startDeg, startDeg + sweepDeg),
      arcLength: sweepDeg * DEG * arcRadius,
      ticks: built,
    };
  }, [
    cx,
    cy,
    radius,
    arcRadius,
    startDeg,
    sweepDeg,
    majorCount,
    minorPerMajor,
    labelFor,
    dangerFromT,
    dangerBelowT,
  ]);

  // The value arc fills from the start of the sweep up to the current value via a
  // single dash-offset (cheaper than rebuilding the path each frame).
  const valueOffset = arcLength * (1 - fraction);
  const needleLength = radius - 6;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${viewW} ${viewH}`}
      role="img"
      aria-label={ariaLabel}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${idPrefix}-face`} cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#243a4d" />
          <stop offset="68%" stopColor="#101d27" />
          <stop offset="100%" stopColor="#070d12" />
        </radialGradient>
      </defs>

      {/* Dark dial face + bezel (a subtle inner highlight reads as glass). */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + 6}
        fill={`url(#${idPrefix}-face)`}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="2"
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius + 5}
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="1"
      />

      {/* Inactive track + the glowing value arc that fills toward the needle. */}
      <path
        d={trackPath}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        className="race-gauge-arc-glow"
        d={trackPath}
        fill="none"
        stroke={accent}
        strokeOpacity="0.3"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeDasharray={arcLength}
        strokeDashoffset={valueOffset}
      />
      <path
        className="race-gauge-arc"
        d={trackPath}
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={arcLength}
        strokeDashoffset={valueOffset}
      />

      {/* Tick marks (major + minor; danger zones picked out in the warning hue). */}
      {ticks.map((tick, i) => (
        <line
          key={`t-${i}`}
          x1={tick.x1.toFixed(2)}
          y1={tick.y1.toFixed(2)}
          x2={tick.x2.toFixed(2)}
          y2={tick.y2.toFixed(2)}
          stroke={
            tick.danger
              ? DANGER_COLOR
              : tick.major
                ? 'rgba(255,255,255,0.78)'
                : 'rgba(255,255,255,0.3)'
          }
          strokeWidth={tick.major ? 1.7 : 1}
          strokeLinecap="round"
        />
      ))}
      {ticks.map((tick, i) =>
        tick.label != null ? (
          <text
            key={`l-${i}`}
            className="race-gauge-tick-label"
            x={tick.lx.toFixed(2)}
            y={tick.ly.toFixed(2)}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {tick.label}
          </text>
        ) : null,
      )}

      {/* Needle — the ONLY part that rotates each frame. Drawn pointing east and
          rotated to the value's angle; a soft wide ghost underneath gives it glow. */}
      <g
        className="race-gauge-needle"
        transform={`rotate(${needleAngle.toFixed(2)} ${cx} ${cy})`}
      >
        <polygon
          points={`${cx - 9},${cy} ${cx},${cy - 3.2} ${cx + needleLength},${cy} ${cx},${cy + 3.2}`}
          fill={accent}
        />
      </g>
      {/* Hub cap over the needle's base. */}
      <circle cx={cx} cy={cy} r="5.2" fill="#0b1218" stroke={accent} strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r="1.9" fill={accent} />

      {children}
    </svg>
  );
}

// --- Speedometer: 270° dial, redline near full-scale, six labelled majors. -----
const SPEED_START_DEG = 135;
const SPEED_SWEEP_DEG = 270;
const SPEED_MAJORS = 5; // 6 major ticks → 5 segments
const SPEED_REDLINE_T = 0.82;
// Internal speed is m/s; the dial and readout DISPLAY km/h (the unit drivers read).
const MS_TO_KMH = 3.6;

function Speedometer({ velocity, speedMax }: { velocity: number; speedMax: number }) {
  // Readout shows TRUE km/h (can run past the dial on a downhill, pegging the
  // needle); the dial max rounds the full-scale up to a clean km/h number.
  const kmh = Math.max(0, Math.round(velocity * MS_TO_KMH));
  const dialMaxKmh = Math.max(20, Math.round((speedMax * MS_TO_KMH) / 20) * 20);
  // Stable label fn (memoized) so the gauge's static furniture isn't rebuilt.
  const labelFor = useMemo(
    () => (majorIndex: number) => `${Math.round((majorIndex / SPEED_MAJORS) * dialMaxKmh)}`,
    [dialMaxKmh],
  );
  return (
    <div className="race-gauge-instrument race-gauge-instrument-speed">
      <RadialGauge
        idPrefix="race-speed"
        className="race-gauge-svg race-gauge-svg-speed"
        value={velocity * MS_TO_KMH}
        max={dialMaxKmh}
        startDeg={SPEED_START_DEG}
        sweepDeg={SPEED_SWEEP_DEG}
        viewW={100}
        viewH={100}
        cx={50}
        cy={50}
        radius={40}
        majorCount={SPEED_MAJORS}
        minorPerMajor={4}
        labelFor={labelFor}
        dangerFromT={SPEED_REDLINE_T}
        accent="var(--brand-bright, #2fe0a6)"
        ariaLabel={`Speed: ${kmh} km/h`}
      >
        <text className="race-gauge-digit" x="50" y="89" textAnchor="middle">
          {kmh}
        </text>
      </RadialGauge>
      <span className="race-gauge-caption" style={{ textTransform: 'none' }}>km/h</span>
    </div>
  );
}

// --- Fuel gauge: 180° E—F dial, near-empty red zone, percentage readout. -------
const FUEL_START_DEG = 180;
const FUEL_SWEEP_DEG = 180;
const FUEL_LOW_T = 0.15;
const FUEL_LABELS = ['E', '½', 'F'];

function FuelGauge({ fuel, fuelMax }: { fuel: number; fuelMax: number }) {
  const percent = fuelMax > 0 ? Math.max(0, Math.min(100, Math.round((fuel / fuelMax) * 100))) : 0;
  const low = percent <= FUEL_LOW_T * 100;
  const labelFor = useMemo(() => (majorIndex: number) => FUEL_LABELS[majorIndex] ?? null, []);
  return (
    <div
      className={`race-gauge-instrument race-gauge-instrument-fuel${low ? ' is-low' : ''}`}
    >
      <RadialGauge
        idPrefix="race-fuel"
        className="race-gauge-svg race-gauge-svg-fuel"
        value={fuel}
        max={fuelMax}
        startDeg={FUEL_START_DEG}
        sweepDeg={FUEL_SWEEP_DEG}
        viewW={100}
        viewH={72}
        cx={50}
        cy={46}
        radius={36}
        majorCount={2}
        minorPerMajor={2}
        labelFor={labelFor}
        dangerBelowT={FUEL_LOW_T}
        accent={low ? 'var(--accent, #ff5a4d)' : 'var(--coin, #e3a008)'}
        ariaLabel={`Fuel: ${percent}%`}
      >
        <text className="race-gauge-digit race-gauge-digit-fuel" x="50" y="65" textAnchor="middle">
          {percent}
          <tspan className="race-gauge-digit-unit" dx="1">
            %
          </tspan>
        </text>
      </RadialGauge>
      <span className="race-gauge-caption">Fuel</span>
    </div>
  );
}

export type DashboardGaugesProps = {
  /** Player speed in m/s and the m/s full-scale the dial's km/h range is built from. */
  velocity: number;
  speedMax: number;
  /** Player fuel and the tank capacity it is scaled to. */
  fuel: number;
  fuelMax: number;
};

/** The player's dashboard: an analog speedometer beside a classic fuel gauge. */
export function DashboardGauges({ velocity, speedMax, fuel, fuelMax }: DashboardGaugesProps) {
  return (
    <div className="race-dashboard">
      <Speedometer velocity={velocity} speedMax={speedMax} />
      <FuelGauge fuel={fuel} fuelMax={fuelMax} />
    </div>
  );
}
