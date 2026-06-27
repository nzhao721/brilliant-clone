import { Link } from 'react-router-dom';
import type { LessonStatus } from '../data/lessons';
import './TrailMap.css';

export type TrailMapNode = {
  id: string;
  title: string;
  status: LessonStatus;
  sequenceNumber: number;
  lockedReason?: string;
  progressPercent: number;
  hasSavedProgress: boolean;
};

const STATUS_LABEL: Record<LessonStatus, string> = {
  available: 'Ready',
  locked: 'Locked',
  complete: 'Complete',
};

/* Trail geometry. x lives in a 0..100 viewBox space (mapped to the container
   width via preserveAspectRatio="none"); y is in pixels so each stop keeps a
   constant vertical rhythm regardless of how wide the screen is. */
const STEP_Y = 150;
const PAD_TOP = 64;
const PAD_BOTTOM = 165;
const CENTER_X = 50;
/* Max horizontal swing from center, in viewBox units. The cards sit beside each
   stop and point back toward center, so the swing stays bounded to the central
   band, but widened from the original tiny value so the trail visibly weaves
   instead of hugging the center. */
const AMPLITUDE = 40;

type Point = { x: number; y: number };

/* Deterministic pseudo-random in [0, 1) seeded by the stop index, so the trail
   keeps the same shape across re-renders instead of reshuffling whenever
   progress state changes. */
function stopRandom(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/* A second, independent deterministic stream (different constants), used to seed
   the first stop's side of center and to decide when the trail switches sides. */
function stopRandomSide(index: number) {
  const value = Math.sin(index * 39.425 + 11.137) * 24634.6345;
  return value - Math.floor(value);
}

/* Min/max horizontal travel between consecutive stops, in viewBox units. The
   minimum guarantees every segment has a real slope so the road never looks
   near-vertical; both stay small relative to the full 2*AMPLITUDE band so a sweep
   takes several stops to cross it: long, lazy sweeps. */
const MIN_STEP = 4;
const MAX_STEP = 20;

/* Chance that a stop keeps heading the same way as the previous one instead of
   turning early. Higher → longer, lazier sweeps; lower → more frequent changes of
   direction. (The road still always turns at a band edge regardless.) */
const STAY_PROBABILITY = 0.35;

/* Walks the stops as one drifting sweep: the road mostly keeps heading the same
   way, turning early only with probability (1 - STAY_PROBABILITY), and always
   turning at a band edge, producing long, lazy sweeps from side to side. Every
   step is at least MIN_STEP, so no segment is ever near-vertical. The start, step
   distances, and turn decisions all come from deterministic per-stop hashes, so
   the whole shape is generated once and stays identical across re-renders,
   refreshes, and logging in and out. */
function buildPoints(count: number): Point[] {
  const points: Point[] = [];
  let position = (stopRandomSide(0) * 2 - 1) * AMPLITUDE * 0.5;
  let direction = stopRandom(0) < 0.5 ? -1 : 1;

  for (let index = 0; index < count; index += 1) {
    points.push({
      x: CENTER_X + position,
      y: PAD_TOP + index * STEP_Y,
    });

    const step = MIN_STEP + stopRandom(index) * (MAX_STEP - MIN_STEP);

    // Turn early now and then (probability 1 - STAY_PROBABILITY)...
    if (index > 0 && stopRandomSide(index) >= STAY_PROBABILITY) {
      direction = -direction;
    }

    // ...but always turn at the band edges so the road stays in range.
    if (position + direction * step > AMPLITUDE || position + direction * step < -AMPLITUDE) {
      direction = -direction;
    }

    position += direction * step;
  }

  return points;
}

/* Smooth vertical S-curve through the stops: control points share each
   segment's mid-y so the tangents stay vertical and the road never kinks. */
function buildPath(points: Point[]) {
  if (points.length === 0) {
    return '';
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midY = ((previous.y + current.y) / 2).toFixed(2);
    path += ` C ${previous.x.toFixed(2)} ${midY} ${current.x.toFixed(2)} ${midY} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }

  return path;
}

function getActionLabel(node: TrailMapNode) {
  if (node.status === 'complete') {
    return 'Review lesson';
  }

  return node.hasSavedProgress ? 'Continue lesson' : 'Start lesson';
}

/* Available lessons read "Start" before any progress and "Resume" once the user
   is partway through; locked/complete keep their fixed labels. */
function getStatusLabel(node: TrailMapNode) {
  if (node.status === 'available') {
    return node.hasSavedProgress ? 'Resume' : 'Start';
  }

  return STATUS_LABEL[node.status];
}

export function TrailMap({
  nodes,
  finishVariant = 'chapter',
}: {
  nodes: TrailMapNode[];
  finishVariant?: 'chapter' | 'course';
}) {
  if (nodes.length === 0) {
    return null;
  }

  const points = buildPoints(nodes.length);
  const height = PAD_TOP + (nodes.length - 1) * STEP_Y + PAD_BOTTOM;

  // Furthest unlocked stop: the road up to here is "travelled" (solid green).
  let reachIndex = 0;
  nodes.forEach((node, index) => {
    if (node.status !== 'locked') {
      reachIndex = index;
    }
  });

  const basePath = buildPath(points);
  const travelledPath = buildPath(points.slice(0, reachIndex + 1));
  const finish = points[points.length - 1];

  return (
    <div className="trail" style={{ height: `${height}px` }}>
      <svg
        className="trail-line"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="trail-gradient" x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
            <stop className="trail-grad-from" offset="0" />
            <stop className="trail-grad-to" offset="1" />
          </linearGradient>
        </defs>
        <path className="trail-line-base" d={basePath} vectorEffect="non-scaling-stroke" />
        <path className="trail-line-progress" d={travelledPath} vectorEffect="non-scaling-stroke" />
      </svg>

      <ol className="trail-stops">
        {nodes.map((node, index) => {
          const point = points[index];
          const labelSide = point.x <= CENTER_X ? 'right' : 'left';
          const actionLabel = getActionLabel(node);
          const displayedProgress =
            node.status === 'complete' ? 100 : Math.max(0, Math.min(100, node.progressPercent));

          return (
            <li
              key={node.id}
              className={`trail-stop trail-stop-${node.status} trail-label-${labelSide}`}
              style={{ left: `${point.x}%`, top: `${point.y}px` }}
            >
              {node.status === 'locked' ? (
                <span className="trail-marker">
                  <span className="trail-marker-number" aria-hidden="true">
                    {node.sequenceNumber}
                  </span>
                </span>
              ) : (
                <Link
                  className={`trail-marker${node.status === 'available' ? ' trail-marker-current' : ''}`}
                  to={`/lessons/${node.id}`}
                >
                  {node.status === 'available' ? <ProgressRing percent={displayedProgress} /> : null}
                  <span className="trail-marker-number" aria-hidden="true">
                    {node.sequenceNumber}
                  </span>
                  <span className="sr-only">{actionLabel}</span>
                </Link>
              )}

              <div className="trail-label">
                <span className={`status-pill ${node.status}`}>
                  {node.status === 'complete' ? (
                    <CheckIcon />
                  ) : node.status === 'locked' ? (
                    <LockIcon />
                  ) : node.status === 'available' ? (
                    <PlayIcon />
                  ) : null}
                  {getStatusLabel(node)}
                </span>
                <p className="trail-label-title">{node.title}</p>
                {node.status === 'locked' ? (
                  <span className="sr-only">{node.lockedReason ?? 'Locked'}</span>
                ) : node.status === 'available' && displayedProgress > 0 ? (
                  <span className="trail-label-progress" aria-label={`${node.title} progress`}>
                    {displayedProgress}% complete
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <span
        className={`trail-finish${finishVariant === 'course' ? ' trail-finish-course' : ''}`}
        style={{ left: `${finish.x}%`, top: `${finish.y + 110}px` }}
      >
        {finishVariant === 'course' ? <CourseFlagIcon /> : <FlagIcon />}
        <span className="sr-only">
          {finishVariant === 'course' ? 'Course finish' : 'Chapter finish'}
        </span>
      </span>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);

  return (
    <svg className="trail-ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="trail-ring-track" cx="24" cy="24" r={radius} />
      <circle
        className="trail-ring-progress"
        cx="24"
        cy="24"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="status-pill-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 13l4 4 10-11" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      className="status-pill-icon status-pill-icon-play"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 5.5 18.5 12 7 18.5z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="status-pill-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className="trail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="trail-flag-grad" x1="4" y1="3" x2="20" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff9a5c" />
          <stop offset="0.55" stopColor="#ff5a4d" />
          <stop offset="1" stopColor="#ff4d77" />
        </linearGradient>
      </defs>
      {/* pole + finial */}
      <path d="M6.5 21.5V3.2" stroke="#6f5f59" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6.5" cy="2.6" r="1.5" fill="#6f5f59" />
      {/* waving banner */}
      <path
        className="trail-flag-banner"
        d="M6.5 4c3.3-1.6 8 1.6 12.5 0v6.3c-4.5 1.6-9.2-1.6-12.5 0z"
        fill="url(#trail-flag-grad)"
      />
      {/* sheen highlight */}
      <path
        d="M6.5 4c3.3-1.6 8 1.6 12.5 0v1.4c-4.5 1.6-9.2-1.6-12.5 0z"
        fill="#ffffff"
        opacity="0.28"
      />
    </svg>
  );
}

// Grand "course complete" finish: a checkered finish-line flag with a gold
// finial, visually distinct from the per-chapter pennant above.
function CourseFlagIcon() {
  return (
    <svg className="trail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {/* pole + gold finial */}
      <path d="M6.5 21.5V3" stroke="#6f5f59" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6.5" cy="2.3" r="1.8" fill="#f7b500" />
      {/* checkered banner */}
      <rect x="6.5" y="3.3" width="12.6" height="8" fill="#ffffff" stroke="#46566a" strokeWidth="0.7" />
      <g fill="#36465a">
        <rect x="6.5" y="3.3" width="3.15" height="4" />
        <rect x="12.8" y="3.3" width="3.15" height="4" />
        <rect x="9.65" y="7.3" width="3.15" height="4" />
        <rect x="15.95" y="7.3" width="3.15" height="4" />
      </g>
    </svg>
  );
}
