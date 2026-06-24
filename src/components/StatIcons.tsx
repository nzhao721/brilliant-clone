import type { ReactNode } from 'react';

/**
 * Describes how a dashboard stat should be drawn as a row of little icons.
 * Progress and streak use one icon ("pip") per unit so the magnitude is legible
 * at a glance — e.g. four flames for a four-day streak. XP and minutes have no
 * fixed ceiling, so their pips are a "rank" that fills toward a row of
 * milestones instead of overflowing into a "+N"; the exact figure always lives
 * in the big stat value above the pips.
 */
export type StatVisualSpec =
  | { kind: 'streak'; days: number; completedToday: boolean }
  | { kind: 'progress'; percent: number }
  | { kind: 'xp'; xp: number }
  | { kind: 'minutes'; minutes: number };

const STREAK_CAP = 7;
const PROGRESS_PIPS = 5;

// XP grows forever and daily minutes can run long, so "one pip per fixed chunk"
// would always overflow and need a "+N". Instead each pip is a rank step that
// lights up once the value crosses the matching milestone — any activity earns
// at least the first pip, and the row simply maxes out at the last milestone.
const XP_RANK_MILESTONES = [100, 250, 500, 1000, 2000];
const MINUTES_RANK_MILESTONES = [5, 10, 20, 30, 45, 60];

function getRank(value: number, milestones: number[]) {
  if (value <= 0) {
    return 0;
  }

  return Math.max(
    1,
    milestones.reduce((rank, milestone) => (value >= milestone ? rank + 1 : rank), 0),
  );
}

function FlamePip() {
  return (
    <svg viewBox="0 0 24 24" className="stat-pip-glyph" aria-hidden="true" focusable="false">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function StarPip() {
  return (
    <svg viewBox="0 0 24 24" className="stat-pip-glyph" aria-hidden="true" focusable="false">
      <path d="M12 2.5 14.2 8.9 21 9.1 15.6 13.2 17.6 19.7 12 15.8 6.4 19.7 8.4 13.2 3 9.1 9.8 8.9Z" />
    </svg>
  );
}

function DiscPip() {
  return (
    <svg viewBox="0 0 24 24" className="stat-pip-glyph" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7.5" />
    </svg>
  );
}

function ClockPip() {
  return (
    <svg viewBox="0 0 24 24" className="stat-pip-glyph" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path className="stat-pip-clock-hands" d="M12 12V7.2M12 12h3.6" />
    </svg>
  );
}

function PipRow({ modifier, children }: { modifier: string; children: ReactNode }) {
  return (
    <div className={`stat-pips stat-pips-${modifier}`} aria-hidden="true">
      {children}
    </div>
  );
}

function StreakPips({ days, completedToday }: { days: number; completedToday: boolean }) {
  const litCount = Math.min(days, STREAK_CAP);

  return (
    <>
      <PipRow modifier="streak">
        {Array.from({ length: litCount }).map((_, index) => (
          <span className="stat-pip stat-pip-on" key={`flame-${index}`}>
            <FlamePip />
          </span>
        ))}
        {!completedToday ? (
          <span className="stat-pip stat-pip-ember" key="ember">
            <FlamePip />
          </span>
        ) : null}
      </PipRow>
      <span className="stat-card-status">
        {completedToday ? (
          <>
            <span aria-hidden="true">✓</span> Streak safe
          </>
        ) : (
          <span className="stat-card-status-warn">Study to keep your streak</span>
        )}
      </span>
    </>
  );
}

function TrackPips({
  modifier,
  glyph,
  filled,
  total,
}: {
  modifier: string;
  glyph: ReactNode;
  filled: number;
  total: number;
}) {
  return (
    <PipRow modifier={modifier}>
      {Array.from({ length: total }).map((_, index) => (
        <span className={`stat-pip ${index < filled ? 'stat-pip-on' : 'stat-pip-off'}`} key={index}>
          {glyph}
        </span>
      ))}
    </PipRow>
  );
}

export function StatVisual({ spec }: { spec: StatVisualSpec }) {
  if (spec.kind === 'streak') {
    return <StreakPips days={spec.days} completedToday={spec.completedToday} />;
  }

  if (spec.kind === 'progress') {
    const filled = spec.percent > 0 ? Math.max(1, Math.round(spec.percent / 20)) : 0;
    return <TrackPips modifier="progress" glyph={<DiscPip />} filled={filled} total={PROGRESS_PIPS} />;
  }

  if (spec.kind === 'xp') {
    return (
      <TrackPips
        modifier="xp"
        glyph={<StarPip />}
        filled={getRank(spec.xp, XP_RANK_MILESTONES)}
        total={XP_RANK_MILESTONES.length}
      />
    );
  }

  return (
    <TrackPips
      modifier="minutes"
      glyph={<ClockPip />}
      filled={getRank(spec.minutes, MINUTES_RANK_MILESTONES)}
      total={MINUTES_RANK_MILESTONES.length}
    />
  );
}
