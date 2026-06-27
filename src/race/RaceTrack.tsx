import { useEffect, useMemo, useRef, useState } from 'react';
import { CoinIcon } from '../components/CurrencyIcons';
import { DashboardGauges } from './DashboardGauges';
import { MAX_SPEED, RACE_DISTANCE, slopeAt, TANK_CAPACITY } from './racePhysics';
import type { RaceCoin } from './raceCoins';

// ---------------------------------------------------------------------------
// RaceTrack — purely presentational, SCROLLING side-scroll race view.
//
// Instead of squishing the whole RACE_DISTANCE into the frame, it renders a
// fixed-width WINDOW of the track (in world units) and SCROLLS that window to
// follow the player's car: the player is kept ~FOLLOW_FRAC from the left and the
// window is clamped so it never runs past either end. Hills, the finish line,
// distance markers and both cars are drawn relative to this moving window; the
// opponent only appears on the main stage while it is inside the window (the
// corner minimap always shows both racers over the whole map).
//
// It holds NO simulation state and no Firestore: the parent (RaceView) owns the
// single rAF loop and hands this component already-computed car positions each
// frame (the opponent position is the SMOOTHED one). The terrain is derived from
// the same racePhysics `slopeAt` the cars drive on, so a car always sits on — and
// tilts tangent to — the hill it is physically on.
//
// The stage fills an immersive, full-viewport overlay: the SVG stretches
// edge-to-edge (preserveAspectRatio="none") and the HUD readouts are absolutely
// positioned corner overlays. The car tilt compensates for that non-uniform
// stretch (see carTransform).
// ---------------------------------------------------------------------------

const VIEW_W = 1000;
const VIEW_H = 560;
const GROUND_Y = VIEW_H;
const HILL_TOP = 200;
const HILL_BASE = 415;

// Scrolling camera. WINDOW is how many metres of track are visible across the
// stage at once (a slice of the much longer RACE_DISTANCE); FOLLOW_FRAC is where
// the player's car rests horizontally (fraction from the left) while the window
// scrolls; WINDOW_SAMPLES sets the crest resolution per window-width.
// The metre relabel scales WINDOW (and every world-length constant) by 1/4, so the
// camera shows the SAME physical span as before and the track renders pixel-
// identically: world->screen X normalizes against this window (both numerator and
// denominator scale together), and the slope conversion (WORLD_PER_VIEW) and crest
// sample count derive from it, so hills, cars and coins keep their size/positions.
const WINDOW = 100;
const FOLLOW_FRAC = 0.35;
const WINDOW_SAMPLES = 48;
// Metres of crest per screen unit — converts the world slope under a car
// into the rendered on-screen slope used for its tilt. Scaling WINDOW by 1/4 (and
// world slopes 4x in the new units) leaves the on-screen tilt unchanged.
const WORLD_PER_VIEW = WINDOW / VIEW_W;
// Distance (metres) between the scrolling gridlines / distance labels.
const MARKER_SPACING = 50;

// The speed gauge is display-only: MAX_SPEED is the near-unreachable terminal
// velocity, so scaling the bar to it leaves it barely filled in normal play.
// Scale to a fraction of terminal (m/s) that ordinary driving actually reaches and
// clamp at 100% for the occasional top-speed burst, so the bar visibly responds.
// The gauge converts this to a clean km/h dial for display (see DashboardGauges).
// (Physics is untouched — this only changes how the existing velocity is shown.)
const SPEED_DISPLAY_MAX = MAX_SPEED * 0.5;

// Collectible coin glyph size + how far it floats above the road, in view units.
const COIN_RADIUS = 9;
const COIN_HOVER = 20;

// Each collectible coin spins in 3D about its VERTICAL diameter (the classic
// flipping-coin look): the round face foreshortens to a thin ellipse edge-on and
// back, while its height stays constant. The spin angle is purely TIME-based, so
// it is frame-rate independent and rides the parent's existing rAF re-render
// cadence (RaceView updates car state every frame, re-rendering this component)
// without a second animation loop. It is purely visual — it never touches coin
// positions or the pickup logic.
const COIN_TAU = Math.PI * 2;
// One full 360° turn per this many ms (the face passes edge-on twice per turn).
const COIN_SPIN_PERIOD_MS = 1700;
// Radians of phase offset per coin index, so neighbours don't flip in unison.
const COIN_SPIN_PHASE = 0.7;
// Floor on |cos(theta)| so the foreshortened face never collapses to nothing —
// at its thinnest it stays a visible sliver backed by the struck edge/rim.
const COIN_EDGE_MIN = 0.08;
// Width (view units) of the coin's milled EDGE, revealed as the face turns
// edge-on so the thinnest moment reads as a 3D rim rather than a vanished coin.
const COIN_THICKNESS = 2.6;

// Grass-blade texture tile size (view units). The pattern is anchored to the
// world (not the screen) by translating it left with the camera each frame, so
// the blades stay attached to their spot on the hill; see grassOffsetX in the
// render. The translate is taken modulo this width so the value stays small —
// and because the tile is periodic in x, that wrap is invisible (seamless).
const GRASS_TILE_W = 42;
const GRASS_TILE_H = 38;

export type RaceTrackCar = {
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

// Vertical stagger so several opponents near the same spot don't perfectly
// overlap: opponents cycle through a few "lanes" lifted off the road by a small
// amount. Lane 0 sits ON the road, so the single-opponent (bot) case is
// unchanged; at very high N players still share lanes and can overlap.
const OPPONENT_LANES = 4;
const OPPONENT_LANE_DY = 9;

// Fallback colour for the local player's car/dot when no explicit playerColor is
// supplied (RaceView always passes the brand green).
const PLAYER_DEFAULT_COLOR = 'var(--brand, #11815a)';

type WorldCrest = {
  /** Evenly spaced (in world units) crest samples; `y` is already in view space. */
  points: { worldX: number; y: number }[];
  /** World-unit spacing between successive samples. */
  dx: number;
};

// Convert an evenly-spaced polyline into a smooth curve by emitting one cubic
// bezier per span, with control points derived from the neighbouring samples
// (the standard uniform Catmull-Rom -> bezier conversion). The resulting spline
// passes exactly through every sample, so the hill keeps the same overall shape,
// but the rendered edge is C1-smooth — no visible angular corners at any window
// size, even under the non-uniform preserveAspectRatio="none" stretch. Returns
// one "C c1 c2 end" command per span; the caller supplies the opening move so the
// same segment list can build both the fill and the outline.
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
// WHOLE track, then map it into the [HILL_TOP, HILL_BASE] band with a single
// GLOBAL normalization. Because the mapping is camera-independent, scrolling the
// window only translates the hills horizontally — no vertical "breathing" — and a
// car's seat/tilt (sampled from this same crest) always matches the hill it is
// physically on. Memoized by (seed, distance) since the terrain never changes
// mid-race — only the cars (and the camera) move across it.
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

// Evaluate the crest spline at an arbitrary WORLD x: returns the view-space y and
// the slope dy/dWorldX there, via the uniform Catmull-Rom basis (the exact basis
// the rendered bezier is a re-expression of, so a car rides precisely on the
// drawn line). C1-continuous, so the tilt never jumps across a sample boundary.
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
 * Plants a car at `screenX`, seated on the crest (`y`) and tilted TANGENT to the
 * rendered slope under it. `slopeWorld` (dy/dWorldX) is converted to the on-screen
 * slope — the window maps WINDOW world units across VIEW_W view units, so
 * dy/dScreenX = slopeWorld * (WINDOW / VIEW_W) — and then to the pixel-space tilt.
 *
 * preserveAspectRatio="none" stretches the 1000x560 viewBox non-uniformly to fill
 * the stage, so a view-unit of Y spans a different number of pixels than one of X
 * (ratio `k = sy/sx`). Two consequences, both handled here:
 *   1. The tilt is measured in PIXEL space: the on-screen angle is
 *      atan2(slopeScreen * k, 1), so the car matches what the eye sees. Crest y
 *      grows downward, so an uphill (y decreasing as x grows) gives slope < 0 → a
 *      negative angle → the nose tips UP; a downhill tips it down; flat stays level.
 *   2. A plain rotate() would SHEAR the car under that stretch, so we rotate with
 *      S^-1 . R(theta) . S = [cos, sin/k, -sin*k, cos] about the car's base. Once
 *      the SVG re-applies its non-uniform stretch S, this composes into a rigid
 *      pixel-space rotation: a clean tilt, no skew.
 * The base is the translate point (seated on the crest) and the rotation pivot, so
 * the car rides exactly on the line.
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
  // Drawn centered on (0,0); the parent <g> translates it onto the hill. The
  // body sits just above the crest line so the wheels appear to touch the road.
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

// A collectible coin, drawn centered on (0,0) so the parent <g> can translate it
// onto the track. Built in the proven 24x24 coin box (centred on 12,12) then
// scaled into the track's view units, so it matches the HUD/economy coin — and
// dressed up as a struck gold coin: a gradient body with a milled rim, an inner
// rim ring, a recessed face, an embossed "$" and an upper-left sun glint.
//
// IMPORTANT: this glyph is intentionally drawn ROUND in view units. The caller
// counters the preserveAspectRatio="none" stretch by wrapping it in a horizontal
// scale of the measured on-screen aspect (k = sy/sx) so it renders as a true
// circle on screen at any window size (see the coin <g> in the render below).
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

  // Measure the rendered SVG so we know how the viewBox is being stretched. The
  // stage is a full-viewport overlay, so its pixel aspect ratio (and thus the
  // x-vs-y pixel scale) changes with the window; the car tilt compensates for it
  // (see carTransform). Falls back to a 1:1 scale before measurement / in tests.
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

  // k = pixels-per-view-Y / pixels-per-view-X. 1 means a square stretch (a plain
  // rotation); >1 means Y is exaggerated, <1 means X is. Drives the un-shearing.
  const aspect =
    stageSize && stageSize.width > 0 && stageSize.height > 0
      ? stageSize.height / VIEW_H / (stageSize.width / VIEW_W)
      : 1;
  // On-screen horizontal un-squash for the coins: pre-scaling a coin's x by the
  // aspect (k = sy/sx) cancels the stage's non-uniform stretch so the round
  // CoinGlyph lands as a true circle. Pre-formatted for the transform string.
  const coinAspect = (aspect > 0 ? aspect : 1).toFixed(4);

  // Shared base angle for the coin spin, advanced purely from the wall clock so
  // the flip is smooth and frame-rate independent. Read at render time: the
  // parent's rAF loop re-renders this component every frame (it updates the car
  // state each tick), so this value advances ~60×/s with no extra animation loop.
  // Each coin adds a per-index phase offset (see the coin map) for organic variety.
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const coinSpinBase = (nowMs / COIN_SPIN_PERIOD_MS) * COIN_TAU;

  // ----- Scrolling camera: a WINDOW-wide slice that follows the player -----
  // The window holds `windowWidth` world units (the whole track if it is shorter
  // than WINDOW). cameraStart is the world x at the left edge: the player's
  // position pulled back by FOLLOW_FRAC, clamped into [0, distance - windowWidth]
  // so the view never scrolls past either end.
  const windowWidth = Math.min(WINDOW, distance);
  const maxCameraStart = Math.max(0, distance - windowWidth);
  const cameraStart = Math.max(
    0,
    Math.min(maxCameraStart, player.position - windowWidth * FOLLOW_FRAC),
  );
  const windowEnd = cameraStart + windowWidth;
  const worldToScreenX = (worldX: number) => ((worldX - cameraStart) / windowWidth) * VIEW_W;

  // Anchor the grass-blade texture to the WORLD instead of the screen. The
  // pattern is in userSpaceOnUse units, so with no transform it stays pinned to
  // the SVG origin while the hill fill scrolls under it — the grass would look
  // static. Sliding it left by the camera's horizontal scroll, converted through
  // the SAME world->screen scale the hills use (VIEW_W / windowWidth, i.e.
  // worldToScreenX's slope), makes the blades travel in lockstep with the
  // terrain so a patch of grass stays attached to its spot on the hill. Taken
  // modulo the tile width to keep the number small; the tile is periodic in x,
  // so the wrap is seamless (translate(0) === translate(-GRASS_TILE_W)).
  const grassOffsetX = ((cameraStart * VIEW_W) / windowWidth) % GRASS_TILE_W;

  // Visible hill silhouette: the crest slice inside the window (+ a little padding
  // so the bezier ends and the fill span the full width). Rebuilt each frame as
  // the camera scrolls — cheap (~50 points) and keeps the rendered hill exactly
  // aligned with where the cars are sampled.
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

  // Scrolling distance markers: every MARKER_SPACING world units that currently
  // fall inside the window, placed at their scrolled screen position.
  const markers: { worldX: number; screenX: number }[] = [];
  for (
    let worldX = Math.ceil(cameraStart / MARKER_SPACING) * MARKER_SPACING;
    worldX <= windowEnd + 1;
    worldX += MARKER_SPACING
  ) {
    markers.push({ worldX, screenX: worldToScreenX(worldX) });
  }

  // Cars in screen space. Each opponent is only drawn on the main stage while it
  // is within the window (a small margin eases it in/out at the edges); the
  // minimap always shows every racer over the whole map. Opponents get a small
  // per-lane vertical stagger so several near the same spot stay distinguishable.
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

  // Finish line: a checkered post at the track's end, drawn at its scrolled
  // position (off-screen to the right early on, scrolling into view near the end).
  const finishScreenX = worldToScreenX(distance);
  const finishInView = finishScreenX <= VIEW_W + 20;

  // Coins currently on screen: those the player has NOT yet reached (the car only
  // moves forward, so coin.position > player.position == "uncollected") and that
  // fall inside the scrolling window. Each is seated on the crest and floated a
  // little above it. Collected coins simply stop rendering.
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
  // RaceTrack only receives each opponent's `finished` flag; the player's finish
  // is derived from progress so the HUD can flag every racer (presentation only
  // — the parent's loop still owns the authoritative finish detection).
  const playerFinished = player.position >= distance;

  // Combined standings, ranked by distance covered (leader first). The player
  // row keeps its dedicated class/colour; opponents carry their own stable
  // colour. The HUD list scrolls when the field is large (see RacePage.css).
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

  // A concise SR summary of the whole field for the overview minimap.
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
            {/* Grassy base: a sunlit fresh green up top fading to a deep, shaded
                turf at the bottom of the hill body. */}
            <linearGradient id="race-hill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6cc24a" />
              <stop offset="45%" stopColor="#3aa258" />
              <stop offset="100%" stopColor="#1c7d49" />
            </linearGradient>
            {/* Seamless grass-blade texture overlaid on the whole hill body so
                the fill reads as natural grass rather than a flat green. Defined
                in userSpace units; the only per-frame change is patternTransform,
                which slides the tile left with the camera (see grassOffsetX) so
                the blades scroll in lockstep with the hills instead of sitting
                fixed to the screen. The preserveAspectRatio="none" stage
                stretches the tile with the rest of the scene, which keeps the
                blades roughly vertical. Marks are scattered across the tile in two
                green tones (light highlights + dark depth) to avoid any horizontal
                banding when it repeats. */}
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
            {/* Struck-gold coin face: a bright highlight off-centre toward the
                upper-left grading to a deep gold rim, so the disc reads as a
                metallic minted coin. */}
            <radialGradient id="race-coin-face" cx="38%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#ffe9a8" />
              <stop offset="42%" stopColor="#f3bd2e" />
              <stop offset="100%" stopColor="#c4830a" />
            </radialGradient>
            {/* The coin's milled EDGE/rim, shown when the spinning face turns
                edge-on: a vertical gold gradient with a bright central band so
                the thin sliver reads as light glinting off a metallic rim. */}
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

          {/* Grassy hill: the deep-green gradient body, an allover blade texture
              on top of it, then a two-tone "turf line" along the crest — a darker
              soil/shadow edge under a sunlit grass-tip highlight — so the terrain
              reads as real grass while keeping the existing smooth hill curve. */}
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

          {/* Collectible coins. The stage stretches non-uniformly
              (preserveAspectRatio="none"), so a circle in view units would render
              as an oval. Each coin is wrapped in a horizontal scale of the measured
              aspect (k = sy/sx, the same factor that un-shears the cars) BEFORE the
              SVG re-applies its stretch, so the round CoinGlyph lands as a true
              on-screen circle at any window size. The translate seats it on the
              hill; the scale pivots about that seat so it never drifts.

              On top of that, each coin SPINS in 3D about its vertical diameter: an
              inner group foreshortens the face's WIDTH by |cos(theta)| (height
              constant) and MIRRORS it across each half-turn (the signed cos), so
              the embossed face flips front-to-back like a real flipping coin. Near
              edge-on (small |cos|) the milled rim is revealed behind the sliver and
              the face is gently shaded, so the thinnest moment reads as a 3D edge
              rather than a coin that briefly vanished. */}
          {visibleCoins.map(({ coin, screenX, y }) => {
            const theta = coinSpinBase + coin.index * COIN_SPIN_PHASE;
            const cos = Math.cos(theta);
            // Magnitude foreshortens the face width; the sign flips it to the back.
            const facing = cos >= 0 ? 1 : -1;
            const foreshorten = Math.max(COIN_EDGE_MIN, Math.abs(cos));
            const faceScaleX = (facing * foreshorten).toFixed(4);
            // The rim shows only as the face nears edge-on; it is otherwise hidden
            // behind the wide face. A gentle face shade deepens at the same time.
            const edgeOpacity = Math.max(0, 1 - foreshorten * 2.2).toFixed(3);
            const faceShade = ((1 - foreshorten) * 0.42).toFixed(3);
            // The cast shadow narrows with the foreshortened face (thinner coin,
            // thinner shadow) but never flips, so it stays put on the ground.
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

      {/* HUD: corner overlays that float on the immersive stage instead of a
          panel below it. The player's dashboard (fuel + speed) anchors the
          top-left; both racers' standings + finish flag anchor the top-right; the
          whole-map minimap anchors the bottom-left. */}
      <div className="race-hud" aria-hidden="false">
        <div className="race-hud-panel race-hud-gauges">
          {/* The player's "real car" dashboard: an analog speedometer (scaled to
              SPEED_DISPLAY_MAX, needle clamped at full-scale) beside a classic
              E—F fuel gauge (scaled to the tank). Updated every frame by the loop
              above; see DashboardGauges for the cheap per-frame update path. */}
          <DashboardGauges
            velocity={player.velocity}
            speedMax={SPEED_DISPLAY_MAX}
            fuel={player.fuel}
            fuelMax={TANK_CAPACITY}
          />

          {/* Per-race coins-collected tally. Each pickup credits the player's real
              coin balance; this shows how many were grabbed on this run. */}
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

        {/* Minimap: a glanceable overview of the WHOLE track (the main stage only
            shows the scrolling window) with both racers' positions and the finish.
            role="img" + an aria-label give it a single, descriptive SR label; the
            visual dots are decorative (aria-hidden). */}
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
