import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProgressRing } from '../components/ProgressRing';
import { StatVisual, type StatVisualSpec } from '../components/StatIcons';
import { TrailMap, type TrailMapNode } from '../components/TrailMap';
import { lessons } from '../data/lessons';
import { questionBank } from '../data/questionBank';
import { useAuth } from '../auth/AuthContext';
import { getPartialLessonProgressPercent, useLessonProgress } from '../lessons/lessonProgress';
import { pluralize } from '../lib/pluralize';
import './DashboardPage.css';

type DisplayUser = {
  displayName?: string | null;
  email?: string | null;
};

export function getStudentFirstName(user: DisplayUser | null) {
  const displayName = user?.displayName?.trim();

  if (displayName) {
    return displayName.split(/\s+/)[0];
  }

  const emailName = user?.email?.split('@')[0]?.trim();
  return emailName || 'student';
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Classifies a 24-hour clock hour into a part of day. Callers pass the hour
 * read from a local `Date`, so this follows the visitor's own time zone
 * automatically (the browser reports `getHours()` in local time).
 */
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) {
    return 'morning';
  }

  if (hour >= 12 && hour < 17) {
    return 'afternoon';
  }

  if (hour >= 17 && hour < 22) {
    return 'evening';
  }

  return 'night';
}

// Greeting variants. The part-of-day list is concatenated with the
// time-agnostic list and one entry is chosen at random per visit, so the
// greeting both reflects the local time of day and changes between refreshes.
const timeOfDayGreetings: Record<TimeOfDay, readonly string[]> = {
  morning: [
    'Good morning, {name}.',
    'Rise and shine, {name}.',
    'Good morning, {name} — ready to learn?',
  ],
  afternoon: [
    'Good afternoon, {name}.',
    'Good afternoon, {name} — ready for more?',
    'Hope your afternoon is going well, {name}.',
  ],
  evening: [
    'Good evening, {name}.',
    'Good evening, {name} — time for one more lesson?',
    'Winding down the day, {name}?',
  ],
  night: [
    'Burning the midnight oil, {name}?',
    'Working late, {name}?',
    'Good evening, {name}.',
  ],
};

const anytimeGreetings: readonly string[] = [
  'Welcome back, {name}.',
  'Great to see you, {name}.',
  'Nice to have you back, {name}.',
  "Let's keep the momentum going, {name}.",
  'Ready to dive back in, {name}?',
];

/**
 * Builds a greeting that opens with a salutation matching the local time of day
 * and is picked at random so it varies on every refresh. `now` and `random` are
 * injectable for deterministic tests.
 */
export function getDashboardGreeting(
  name: string,
  now: Date = new Date(),
  random: number = Math.random(),
): string {
  const pool = [...timeOfDayGreetings[getTimeOfDay(now.getHours())], ...anytimeGreetings];
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random * pool.length)));
  return pool[index].replace('{name}', name);
}

export function DashboardPage() {
  const { user } = useAuth();
  const { currentStreakDays, progress, sequencedLessons, streakCompletedToday } =
    useLessonProgress(lessons, user?.uid);
  const studentName = getStudentFirstName(user);
  // Recomputed per mount (i.e. per refresh), so the greeting varies between
  // visits while staying stable across in-session re-renders.
  const greeting = useMemo(() => getDashboardGreeting(studentName), [studentName]);
  const getLessonProgressPercent = (lesson: (typeof sequencedLessons)[number]) => {
    if (lesson.status === 'complete') {
      return 100;
    }

    const resumeState = progress.lessonResumeStates?.[lesson.id];
    if (!resumeState) {
      return 0;
    }

    return getPartialLessonProgressPercent(lesson, resumeState);
  };
  const completionPercent = Math.round(
    sequencedLessons.reduce((total, lesson) => total + getLessonProgressPercent(lesson), 0) /
      lessons.length,
  );
  const allLessonsComplete =
    sequencedLessons.length > 0 &&
    sequencedLessons.every((lesson) => lesson.status === 'complete');
  const nextLesson = sequencedLessons.find((lesson) => lesson.status === 'available');
  const nextLessonHasSavedProgress = nextLesson ? getLessonProgressPercent(nextLesson) > 0 : false;
  const nextLessonActionLabel = nextLesson
    ? `${nextLessonHasSavedProgress ? 'Resume' : 'Start'} Lesson ${nextLesson.sequenceNumber}, ${
        nextLesson.title
      }`
    : '';
  const stats: { label: string; value: string; visual: StatVisualSpec }[] = [
    {
      label: 'Course progress',
      value: `${completionPercent}%`,
      visual: { kind: 'progress', percent: completionPercent },
    },
    { label: 'Total XP', value: `${progress.totalXp}`, visual: { kind: 'xp', xp: progress.totalXp } },
    {
      label: 'Current streak',
      value: pluralize(currentStreakDays, 'day'),
      visual: { kind: 'streak', days: currentStreakDays, completedToday: streakCompletedToday },
    },
  ];
  const trailNodes: TrailMapNode[] = sequencedLessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    status: lesson.status,
    sequenceNumber: lesson.sequenceNumber,
    lockedReason: lesson.lockedReason,
    progressPercent: getLessonProgressPercent(lesson),
    hasSavedProgress: getLessonProgressPercent(lesson) > 0,
  }));

  return (
    <section className="dashboard-page">
      <div className="page-heading">
        <h1>{greeting}</h1>
        <p>
          Work through the derivative lessons in order. Complete the ready lesson
          to unlock the next one.
        </p>
        {nextLesson ? (
          <Link className="next-lesson-callout" to={`/lessons/${nextLesson.id}`}>
            Next up: {nextLessonActionLabel}
          </Link>
        ) : null}
      </div>

      <div className="stats-grid" aria-label="Progress summary">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <span className="stat-card-label">{stat.label}</span>
            {stat.visual.kind === 'progress' ? (
              <ProgressRing
                percent={stat.visual.percent}
                label={stat.value}
                ariaLabel={`${stat.label}: ${stat.value} complete`}
              />
            ) : (
              <>
                <strong className="stat-card-value">{stat.value}</strong>
                <StatVisual spec={stat.visual} />
              </>
            )}
          </article>
        ))}
      </div>

      <nav className="trail-wrap" aria-label="Sequential lesson path">
        <TrailMap nodes={trailNodes} />
      </nav>

      {allLessonsComplete ? (
        <aside className="practice-unlock" aria-label="Practice mode">
          <div className="practice-unlock-body">
            <p className="eyebrow">Practice mode unlocked</p>
            <h2 className="practice-unlock-title">Random derivative practice</h2>
            <p className="practice-unlock-copy">
              You finished every lesson. Keep your skills sharp with a fresh,
              randomized set drawn from all {pluralize(questionBank.length, 'question')} across
              the course.
            </p>
          </div>
          <Link className="primary-button practice-unlock-action" to="/practice">
            Start random practice
          </Link>
        </aside>
      ) : null}
    </section>
  );
}
