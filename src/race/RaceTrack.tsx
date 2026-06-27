import { useEffect, useMemo, useRef, useState } from 'react';
import { CoinIcon } from '../components/CurrencyIcons';
import { DashboardGauges } from './DashboardGauges';
import { MAX_SPEED, RACE_DISTANCE, slopeAt, TANK_CAPACITY } from './racePhysics';
import type { RaceCoin } from './raceCoins';

// ---------------------------------------------------------------------------
// RaceTrack — purely presentational, scrolling side-scroll race view. It renders a
// fixed-width WINDOW of the track and scrolls it to follow the player (kept
// ~FOLLOW_FRAC from the left, clamped at both ends); hills, finish line, markers
// and cars are drawn relative to this window, and the corner minimap shows the
// whole map. It holds NO simulation state: the parent (RaceView) owns the rAF loop
// and hands it already-computed (and opponent-smoothed) positions each frame. The
// terrain comes from the same racePhysics `slopeAt` the cars drive on, so a car
// always sits on — and tilts tangent to — its hill. The stage is a full-viewport
// overlay with the SVG stretched edge-to-edge (preserveAspectRatio="none"); the car
// tilt compensates for that non-uniform stretch (see carTransform).
// ---------------------------------------------------------------------------

const VIEW_W = 1000;
const VIEW_H = 560;
const GROUND_Y = VIEW_H;
const HILL_TOP = 200;
const HILL_BASE = 415;

// Scrolling camera: WINDOW is the metres of track visible at once, FOLLOW_FRAC is
// where the player's car rests (fraction from the left) while the window scrolls,
// WINDOW_SAMPLES sets the crest resolution per window-width.
const WINDOW = 100;
const FOLLOW_FRAC = 0.35;
const WINDOW_SAMPLES = 48;
// Metres of crest per screen unit — converts a car's world slope to its on-screen tilt.
const WORLD_PER_VIEW = WINDOW / VIEW_W;
// Distance (metres) between the scrolling gridlines / distance labels.
const MARKER_SPACING = 50;

// Speed gauge is display-only: scaled to a fraction of the (near-unreachable)
// terminal velocity that ordinary driving reaches, clamped at 100%, so the bar
// visibly responds. Physics untouched.
const SPEED_DISPLAY_MAX = MAX_SPEED * 0.5;

// Collectible coin glyph size + how far it floats above the road, in view units.
const COIN_RADIUS = 9;
const COIN_HOVER = 20;

// Each coin spins in 3D about its vertical diameter (the flipping-coin look). The
// angle is purely time-based, so it rides the parent's rAF re-render cadence
// without a second loop; it never touches coin positions or pickup logic.
const COIN_TAU = Math.PI * 2;
// One full 360° turn per this many ms (the face passes edge-on twice per turn).
const COIN_SPIN_PERIOD_MS = 1700;
// Radians of phase offset per coin index, so neighbours don't flip in unison.
const COIN_SPIN_PHASE = 0.7;
// Floor on |cos(theta)| so the foreshortened face never collapses to nothing.
const COIN_EDGE_MIN = 0.08;
// Width (view units) of the coin's milled EDGE, revealed as the face turns edge-on.
const COIN_THICKNESS = 2.6;

// Grass-blade texture tile size (view units). Anchored to the world by translating
// it left with the camera each frame (see grassOffsetX), modulo this width — a
// seamless wrap since the tile is periodic in x.
const GRASS_TILE_W = 42;
const GRASS_TILE_H = 38;

type RaceTrackCar = {
  position: number;
  velocity: number;
};

/** One opponent to draw: a stable id + name + colour and its live race state. */
export type RaceTrackOpponent = {
  id: string;
  name: string;
  color: string;
  position: number;
  velocity: number;
  finished: boolean;
};

type RaceTrackProps = {
  seed: number;
  raceDistance: number;
  player: RaceTrackCar & { fuel: number };
  playerName: string;
  /** The local player's car/standings colour (defaults to the brand green). */
  playerColor?: string;
  /** Every opponent to render (one for bot mode; one per remote player online). */
  opponents: RaceTrackOpponent[];
  /** Coin layout for the track (deterministic from the seed; see raceCoins). */
  coins?: RaceCoin[];
  /** How many coins the player has collected this race (HUD counter). */
  coinsCollected?: number;
};

// Vertical stagger so opponents near the same spot don't perfectly overlap. Lane 0
// sits on the road, so the single-bot case is unchanged.
const OPPONENT_LANES = 4;
const OPPONENT_LANE_DY = 9;

// Fallback colour when no playerColor is supplied (RaceView always passes brand green).
const PLAYER_DEFAULT_COLOR = 'var(--brand, #11815a)';

type WorldCrest = {
  /** Evenly spaced (in world units) crest samples; `y` is already in view space. */
  points: { worldX: number; y: number }[];
  /** World-unit spacing between successive samples. */
  dx: number;
};

// Convert an evenly-spaced polyline into a C1-smooth curve via the uniform
// Catmull-Rom -> bezier conversion (one "C c1 c2 end" per span, passing through
// every sample). The caller supplies the opening move so the same segments build
// both the fill and the outline.
function smoothBezierSegments(points: { x: number; y: number }[]): string[] {
  const segments: string[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? points[index + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    segments.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    );
  }
  return segments;
}

// Integrate the per-position grade (slopeAt) into an elevation profile across the
// whole track, then map it into [HILL_TOP, HILL_BASE] with one GLOBAL normalization
// so scrolling only translates the hills horizontally (no vertical "breathing") and
// a car's seat always matches its hill. Memoized by (seed, distance).
function buildWorldCrest(seed: number, raceDistance: number): WorldCrest {
  const distance = raceDistance > 0 ? raceDistance : RACE_DISTANCE;
  const sampleCount = Math.max(2, Math.round((distance / WINDOW) * WINDOW_SAMPLES));
  const dx = distance / sampleCount;

  const elevations: number[] = [];
  let elevation = 0;
  for (let index = 0; index <= sampleCount; index += 1) {
    elevations.push(elevation);
    elevation += slopeAt(index * dx, seed) * dx;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const value of elevations) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;

  const points = elevations.map((value, index) => ({
    worldX: index * dx,
    y: HILL_BASE - ((value - min) / range) * (HILL_BASE - HILL_TOP),
  }));

  return { points, dx };
}

// Evaluate the crest spline at an arbitrary world x: returns view-space y and the
// slope dy/dWorldX, via the same Catmull-Rom basis the rendered bezier re-expresses
// (so a car rides precisely on the drawn line, with no tilt jump across a sample).
function sampleWorldCrest(crest: WorldCrest, worldX: number): { y: number; slopeWorld: number } {
  const { points, dx } = crest;
  const lastIndex = points.length - 1;
  const clampedX = Math.max(0, Math.min(points[lastIndex].worldX, worldX));
  let index = Math.floor(clampedX / dx);
  if (index < 0) index = 0;
  if (index > lastIndex - 1) index = lastIndex - 1;
  const t = Math.max(0, Math.min(1, (clampedX - index * dx) / dx));

  const p0 = (points[index - 1] ?? points[index]).y;
  const p1 = points[index].y;
  const p2 = points[index + 1].y;
  const p3 = (points[index + 2] ?? points[index + 1]).y;

  const t2 = t * t;
  const t3 = t2 * t;
  const y =
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  const dydt =
    0.5 *
    (-p0 +
      p2 +
      2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
      3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
  // x advances uniformly with the parameter across a span, so dy/dWorldX is just
  // dydt / dx (the world spacing between samples).
  return { y, slopeWorld: dydt / dx };
}

/**
 * Plants a car at `screenX`, seated on the crest (`y`) and tilted tangent to the
 * slope under it. `slopeWorld` is converted to the on-screen slope (× WORLD_PER_VIEW).
 * preserveAspectRatio="none" stretches the viewBox non-uniformly (ratio k = sy/sx),
 * so: (1) the tilt is measured in pixel space — atan2(slopeScreen * k, 1) — and
 * (2) a plain rotate() would shear, so we rotate with S^-1·R·S = [cos, sin/k,
 * -sin*k, cos] about the base, which the SVG's stretch composes into a rigid tilt.
 */
function carTransform(screenX: number, y: number, slopeWorld: number, k: number): string {
  const aspect = k > 0 ? k : 1;
  const slopeScreen = slopeWorld * WORLD_PER_VIEW;
  const angle = Math.atan2(slopeScreen * aspect, 1);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = cos.toFixed(4);
  const b = (sin / aspect).toFixed(4);
  const c = (-sin * aspect).toFixed(4);
  const d = cos.toFixed(4);
  return `translate(${screenX.toFixed(2)} ${y.toFixed(2)}) matrix(${a} ${b} ${c} ${d} 0 0)`;
}

function CarGlyph({ color, flip }: { color: string; flip?: boolean }) {
  // Drawn centered on (0,0); the parent <g> translates it onto the hill.
  return (
    <g transform={`translate(${flip ? -1 : 1} 0) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cx="0" cy="2" rx="20" ry="4" fill="rgba(20,33,46,0.18)" />
      <path
        d="M-18 -4 Q-18 -9 -12 -9 L-6 -9 Q-3 -15 4 -15 L8 -15 Q13 -15 15 -9 L17 -9 Q20 -9 20 -4 L20 -1 Q20 1 17 1 L-15 1 Q-18 1 -18 -2 Z"
        fill={color}
        stroke="rgba(20,33,46,0.25)"
        strokeWidth="1"
      />
      <path d="M-4 -9 L6 -9 Q10 -9 11 -6 L-4 -6 Z" fill="rgba(255,255,255,0.55)" />
      <circle cx="-9" cy="1" r="4.5" fill="#14212e" />
      <circle cx="-9" cy="1" r="1.8" fill="#7b8794" />
      <circle cx="10" cy="1" r="4.5" fill="#14212e" />
      <circle cx="10" cy="1" r="1.8" fill="#7b8794" />
    </g>
  );
}

// A collectible coin centered on (0,0), built in a 24x24 box then scaled into view
// units so it matches the HUD coin. Drawn ROUND in view units; the caller counters
// the preserveAspectRatio="none" stretch (× aspect) so it renders as a true circle.
function CoinGlyph() {
  const scale = COIN_RADIUS / 9.25;
  return (
    <g transform={`scale(${scale.toFixed(3)}) translate(-12 -12)`}>
      <circle cx="12" cy="12" r="9.25" fill="url(#race-coin-face)" stroke="#9c6a08" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="7.1" fill="none" stroke="#fff2c2" strokeWidth="0.9" opacity="0.7" />
      <circle cx="12" cy="12" r="6.1" fill="#7a4f06" fillOpacity="0.18" />
      <path
        d="M12 7.1v9.8M14 9.6c-.5-.7-1.3-1-2.2-1-1.2 0-2.1.7-2.1 1.7 0 2.4 4.6 1.3 4.6 3.7 0 1-1 1.7-2.3 1.7-1 0-1.9-.4-2.4-1.1"
        stroke="#fff8e1"
        strokeOpacity="0.95"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <ellipse cx="8.4" cy="8" rx="2.6" ry="1.5" fill="#fff" opacity="0.6" transform="rotate(-38 8.4 8)" />
    </g>
  );
}

export function RaceTrack({
  seed,
  raceDistance,
  player,
  playerName,
  playerColor = PLAYER_DEFAULT_COLOR,
  opponents,
  coins = [],
  coinsCollected = 0,
}: RaceTrackProps) {
  const distance = raceDistance > 0 ? raceDistance : RACE_DISTANCE;
  const crest = useMemo(() => buildWorldCrest(seed, distance), [seed, distance]);

  // Measure the rendered SVG so we know how the viewBox is stretched (the pixel
  // aspect changes with the window). Falls back to 1:1 before measurement / in tests.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setStageSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    const rect = el.getBoundingClientRect();
    apply(rect.width, rect.height);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        apply(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // k = pixels-per-view-Y / pixels-per-view-X. Drives the car/coin un-shearing.
  const aspect =
    stageSize && stageSize.width > 0 && stageSize.height > 0
      ? stageSize.height / VIEW_H / (stageSize.width / VIEW_W)
      : 1;
  // Pre-scaling a coin's x by the aspect cancels the stretch so the round glyph
  // lands as a true circle. Pre-formatted for the transform string.
  const coinAspect = (aspect > 0 ? aspect : 1).toFixed(4);

  // Coin-spin base angle, advanced from the wall clock (frame-rate independent).
  // The parent's rAF loop re-renders this every frame, so it advances ~60×/s with
  // no extra loop; each coin adds a per-index phase offset for variety.
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const coinSpinBase = (nowMs / COIN_SPIN_PERIOD_MS) * COIN_TAU;

  // ----- Scrolling camera: a WINDOW-wide slice that follows the player -----
  // cameraStart is the world x at the left edge (the player pulled back by
  // FOLLOW_FRAC), clamped so the view never scrolls past either end.
  const windowWidth = Math.min(WINDOW, distance);
  const maxCameraStart = Math.max(0, distance - windowWidth);
  const cameraStart = Math.max(
    0,
    Math.min(maxCameraStart, player.position - windowWidth * FOLLOW_FRAC),
  );
  const windowEnd = cameraStart + windowWidth;
  const worldToScreenX = (worldX: number) => ((worldX - cameraStart) / windowWidth) * VIEW_W;

  // Anchor the grass texture to the WORLD: slide the pattern left by the camera
  // scroll (through the same world->screen scale the hills use) so the blades stay
  // attached to the hill. Modulo the tile width keeps it small; the wrap is seamless.
  const grassOffsetX = ((cameraStart * VIEW_W) / windowWidth) % GRASS_TILE_W;

  // Visible hill silhouette: the crest slice inside the window (+ a little padding).
  // Cheap (~50 points) and rebuilt each frame so it stays aligned with the cars.
  const pad = crest.dx * 2;
  const visible = crest.points.filter(
    (point) => point.worldX >= cameraStart - pad && point.worldX <= windowEnd + pad,
  );
  const screenPoints = (visible.length >= 2 ? visible : crest.points).map((point) => ({
    x: worldToScreenX(point.worldX),
    y: point.y,
  }));
  const segments = smoothBezierSegments(screenPoints);
  const startPoint = `${screenPoints[0].x.toFixed(2)},${screenPoints[0].y.toFixed(2)}`;
  const firstX = screenPoints[0].x.toFixed(2);
  const lastX = screenPoints[screenPoints.length - 1].x.toFixed(2);
  const linePath = `M${startPoint} ${segments.join(' ')}`;
  const areaPath = [
    `M${firstX},${GROUND_Y}`,
    `L${startPoint}`,
    ...segments,
    `L${lastX},${GROUND_Y}`,
    'Z',
  ].join(' ');

  // Scrolling distance markers: every MARKER_SPACING world units inside the window.
  const markers: { worldX: number; screenX: number }[] = [];
  for (
    let worldX = Math.ceil(cameraStart / MARKER_SPACING) * MARKER_SPACING;
    worldX <= windowEnd + 1;
    worldX += MARKER_SPACING
  ) {
    markers.push({ worldX, screenX: worldToScreenX(worldX) });
  }

  // Cars in screen space. Each opponent is drawn on the stage only while inside the
  // window (the minimap always shows everyone), with a per-lane vertical stagger.
  const playerScreenX = worldToScreenX(player.position);
  const playerSeat = sampleWorldCrest(crest, player.position);
  const opponentVisuals = opponents.map((opponent, index) => {
    const screenX = worldToScreenX(opponent.position);
    const seat = sampleWorldCrest(crest, opponent.position);
    return {
      opponent,
      screenX,
      seat,
      laneDy: (index % OPPONENT_LANES) * OPPONENT_LANE_DY,
      inView: screenX >= -40 && screenX <= VIEW_W + 40,
    };
  });

  // Finish line: a checkered post at the track's end, at its scrolled position.
  const finishScreenX = worldToScreenX(distance);
  const finishInView = finishScreenX <= VIEW_W + 20;

  // Coins on screen: uncollected (position ahead of the player) and inside the
  // window, each seated on the crest and floated a little above it.
  const coinMargin = COIN_RADIUS * 2;
  const visibleCoins = coins
    .filter((coin) => coin.position > player.position)
    .map((coin) => ({ coin, screenX: worldToScreenX(coin.position) }))
    .filter(({ screenX }) => screenX >= -coinMargin && screenX <= VIEW_W + coinMargin)
    .map(({ coin, screenX }) => ({
      coin,
      screenX,
      y: sampleWorldCrest(crest, coin.position).y - COIN_HOVER,
    }));

  const progressPercent = (position: number) => Math.round(Math.min(1, position / distance) * 100);
  const metersCovered = (position: number) =>
    Math.round(Math.max(0, Math.min(distance, position)));
  // Right-side standings read out distance covered in METRES (matching the result
  // screen's "<x> / 2500 m"); the minimap below keeps the proportional percent
  // positions. Clamped to the track and rounded so the readout never jitters.
  const totalMeters = Math.round(distance);
  const playerProgress = progressPercent(player.position);
  const playerMeters = metersCovered(player.position);
  // Player finish is derived from progress for the HUD flag (presentation only —
  // the parent's loop owns the authoritative finish detection).
  const playerFinished = player.position >= distance;

  // Combined standings, ranked by distance covered (leader first).
  const standings = [
    {
      id: '__me__',
      name: playerName,
      color: playerColor,
      position: player.position,
      meters: playerMeters,
      finished: playerFinished,
      isPlayer: true,
    },
    ...opponents.map((opponent) => ({
      id: opponent.id,
      name: opponent.name,
      color: opponent.color,
      position: opponent.position,
      meters: metersCovered(opponent.position),
      finished: opponent.finished,
      isPlayer: false,
    })),
  ].sort((a, b) => b.position - a.position);

  // SR summary of the whole field for the overview minimap.
  const minimapSummary =
    opponents.length === 1
      ? `${playerName} at ${playerProgress}% and ${opponents[0].name} at ${progressPercent(
          opponents[0].position,
        )}%`
      : `${playerName} at ${playerProgress}% against ${opponents.length} opponents`;

  return (
    <div className="race-track">
      <div
        className="race-track-stage"
        role="img"
        aria-label={`Race track. Following ${playerName}.`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="race-track-svg"
        >
          <defs>
            <linearGradient id="race-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#eaf6ef" />
              <stop offset="100%" stopColor="#dceede" />
            </linearGradient>
            {/* Grassy base: sunlit green up top fading to deep shaded turf. */}
            <linearGradient id="race-hill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6cc24a" />
              <stop offset="45%" stopColor="#3aa258" />
              <stop offset="100%" stopColor="#1c7d49" />
            </linearGradient>
            {/* Seamless grass-blade texture over the hill body. The only per-frame
                change is patternTransform, which slides the tile with the camera
                (grassOffsetX). Two green tones avoid horizontal banding on repeat. */}
            <pattern
              id="race-grass"
              patternUnits="userSpaceOnUse"
              width={GRASS_TILE_W}
              height={GRASS_TILE_H}
              patternTransform={`translate(${(-grassOffsetX).toFixed(2)} 0)`}
            >
              <g
                stroke="#82d36b"
                strokeWidth="1.3"
                strokeLinecap="round"
                fill="none"
                opacity="0.5"
              >
                <path d="M4 13q1.3-3 .5-6.5" />
                <path d="M15 7q1.3-3 .4-7" />
                <path d="M26 16q1.4-3 .5-7" />
                <path d="M37 10q1.3-3 .4-6.5" />
                <path d="M9 31q1.3-3 .5-7" />
                <path d="M22 34q1.3-3 .5-7" />
                <path d="M33 28q1.3-3 .5-7" />
              </g>
              <g
                stroke="#2c8f4d"
                strokeWidth="1.2"
                strokeLinecap="round"
                fill="none"
                opacity="0.45"
              >
                <path d="M11 17q-1.3-3 -.4-6.5" />
                <path d="M30 21q-1.3-3 -.5-7" />
                <path d="M6 36q-1.2-3 -.4-6.5" />
                <path d="M18 25q-1.3-3 -.4-6.5" />
                <path d="M39 34q-1.3-3 -.5-7" />
              </g>
            </pattern>
            {/* Struck-gold coin face: an upper-left highlight grading to a deep gold rim. */}
            <radialGradient id="race-coin-face" cx="38%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#ffe9a8" />
              <stop offset="42%" stopColor="#f3bd2e" />
              <stop offset="100%" stopColor="#c4830a" />
            </radialGradient>
            {/* The coin's milled edge, shown when the spinning face turns edge-on:
                a vertical gold gradient with a bright central band. */}
            <linearGradient id="race-coin-edge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a5e06" />
              <stop offset="48%" stopColor="#ffe6a0" />
              <stop offset="52%" stopColor="#ffe6a0" />
              <stop offset="100%" stopColor="#7a4f06" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#race-sky)" />

          {markers.map((marker) => (
            <line
              key={`marker-${marker.worldX}`}
              x1={marker.screenX}
              y1="0"
              x2={marker.screenX}
              y2={VIEW_H}
              stroke="rgba(20,33,46,0.08)"
              strokeWidth="1"
              strokeDasharray="4 8"
            />
          ))}

          {/* Grassy hill: gradient body, blade texture, then a two-tone turf line
              (dark soil edge under a sunlit grass-tip highlight) along the crest. */}
          <path d={areaPath} fill="url(#race-hill)" />
          <path d={areaPath} fill="url(#race-grass)" />
          <path d={linePath} fill="none" stroke="#13703b" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
          <path d={linePath} fill="none" stroke="#aee98c" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />

          {/* Finish line: a checkered post at the end of the track, scrolled in. */}
          {finishInView ? (
            <g>
              {Array.from({ length: 8 }, (_unused, row) => (
                <rect
                  key={`finish-${row}`}
                  x={finishScreenX - 7}
                  y={(row / 8) * VIEW_H}
                  width="7"
                  height={VIEW_H / 8}
                  fill={row % 2 === 0 ? '#14212e' : '#ffffff'}
                />
              ))}
            </g>
          ) : null}

          {/* Collectible coins. Each is wrapped in a horizontal scale of the aspect
              (the factor that un-shears the cars) so the round glyph renders as a
              true circle, then SPINS in 3D about its vertical diameter: the inner
              group foreshortens the face width by |cos(theta)| and mirrors it via
              the signed cos, with the milled rim revealed near edge-on. */}
          {visibleCoins.map(({ coin, screenX, y }) => {
            const theta = coinSpinBase + coin.index * COIN_SPIN_PHASE;
            const cos = Math.cos(theta);
            // Magnitude foreshortens the face width; the sign flips it to the back.
            const facing = cos >= 0 ? 1 : -1;
            const foreshorten = Math.max(COIN_EDGE_MIN, Math.abs(cos));
            const faceScaleX = (facing * foreshorten).toFixed(4);
            // Rim shows (and the face shades) only as the coin nears edge-on.
            const edgeOpacity = Math.max(0, 1 - foreshorten * 2.2).toFixed(3);
            const faceShade = ((1 - foreshorten) * 0.42).toFixed(3);
            // Shadow narrows with the face but never flips, so it stays on the ground.
            const shadowRx = (COIN_RADIUS * 0.72 * foreshorten).toFixed(2);
            return (
              <g
                key={`coin-${coin.index}`}
                className="race-coin"
                transform={`translate(${screenX.toFixed(2)} ${y.toFixed(2)}) scale(${coinAspect} 1)`}
              >
                <ellipse cx="0" cy={COIN_RADIUS + 4} rx={shadowRx} ry="2.4" fill="rgba(20,33,46,0.18)" />
                <rect
                  x={(-COIN_THICKNESS / 2).toFixed(2)}
                  y={(-COIN_RADIUS).toFixed(2)}
                  width={COIN_THICKNESS.toFixed(2)}
                  height={(COIN_RADIUS * 2).toFixed(2)}
                  rx={(COIN_THICKNESS / 2).toFixed(2)}
                  fill="url(#race-coin-edge)"
                  opacity={edgeOpacity}
                />
                <g transform={`scale(${faceScaleX} 1)`}>
                  <CoinGlyph />
                  <circle cx="0" cy="0" r={COIN_RADIUS} fill="#3f2a04" opacity={faceShade} />
                </g>
              </g>
            );
          })}

          {opponentVisuals.map(({ opponent, screenX, seat, laneDy, inView }) =>
            inView ? (
              <g
                key={`car-${opponent.id}`}
                transform={carTransform(screenX, seat.y - laneDy, seat.slopeWorld, aspect)}
              >
                <CarGlyph color={opponent.color} />
              </g>
            ) : null,
          )}
          <g transform={carTransform(playerScreenX, playerSeat.y, playerSeat.slopeWorld, aspect)}>
            <CarGlyph color={playerColor} />
          </g>
        </svg>

        <div className="race-track-markers" aria-hidden="true">
          {markers.map((marker) => (
            <span
              key={`label-${marker.worldX}`}
              className="race-track-marker"
              style={{ left: `${(marker.screenX / VIEW_W) * 100}%` }}
            >
              {`${Math.round(marker.worldX)} m`}
            </span>
          ))}
        </div>
      </div>

      {/* HUD: corner overlays floating on the stage — gauges top-left, standings
          top-right, whole-map minimap bottom-left. */}
      <div className="race-hud" aria-hidden="false">
        <div className="race-hud-panel race-hud-gauges">
          {/* The player's dashboard: speedometer (scaled to SPEED_DISPLAY_MAX) + fuel gauge. */}
          <DashboardGauges
            velocity={player.velocity}
            speedMax={SPEED_DISPLAY_MAX}
            fuel={player.fuel}
            fuelMax={TANK_CAPACITY}
          />

          {/* Per-race coins-collected tally (each pickup also credits the real balance). */}
          <div className="race-coins-collected">
            <CoinIcon className="race-coins-icon" />
            <span className="race-coins-count">{coinsCollected}</span>
            <span className="race-coins-label">coins</span>
          </div>
        </div>

        <dl className="race-hud-panel race-hud-standings">
          {standings.map((entry, rank) => (
            <div
              key={`standing-${entry.id}`}
              className={`race-standing ${
                entry.isPlayer ? 'race-standing-player' : 'race-standing-opponent'
              }`}
            >
              <dt>
                <span className="race-standing-rank" aria-hidden="true">
                  {rank + 1}
                </span>
                <span
                  className="race-standing-dot"
                  aria-hidden="true"
                  style={{ background: entry.color }}
                />{' '}
                {entry.name}
              </dt>
              <dd>
                <span className="race-standing-progress">
                  {entry.meters} / {totalMeters} m
                </span>
                {entry.finished ? <span className="race-standing-flag">Finished</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        {/* Minimap: a glanceable overview of the whole track with every racer + the
            finish. role="img" + aria-label give it one SR label; the dots are decorative. */}
        <div
          className="race-hud-panel race-minimap"
          role="img"
          aria-label={`Race overview map. ${minimapSummary}; finish at the far end.`}
        >
          <span className="race-minimap-title" aria-hidden="true">
            Map
          </span>
          <div className="race-minimap-track" aria-hidden="true">
            <span className="race-minimap-finish" />
            {opponents.map((opponent) => (
              <span
                key={`minimap-${opponent.id}`}
                className="race-minimap-marker race-minimap-opponent"
                style={{ left: `${progressPercent(opponent.position)}%`, background: opponent.color }}
              />
            ))}
            <span
              className="race-minimap-marker race-minimap-player"
              style={{ left: `${playerProgress}%`, background: playerColor }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
