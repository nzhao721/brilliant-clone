import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CoinIcon, XpIcon } from '../components/CurrencyIcons';
import { ProgressRing } from '../components/ProgressRing';
import { StatVisual, type StatVisualSpec } from '../components/StatIcons';
import { TrailMap, type TrailMapNode } from '../components/TrailMap';
import { chapters } from '../data/chapters';
import { getChapterLessons, lessons } from '../data/lessons';
import { useAuth } from '../auth/AuthContext';
import { useCurrency } from '../games/useCurrency';
import { isDailyGateActive } from '../lessons/dailyGate';
import {
  getChapterLessonProgress,
  getPartialLessonProgressPercent,
  useLessonProgress,
  type SequencedLesson,
} from '../lessons/lessonProgress';
import { pluralize } from '../lib/pluralize';
import { getXpLevel } from '../lib/xpLevel';
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

/** Classifies a 24-hour clock hour into a part of day (callers pass a local hour). */
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

/* Part-of-day greetings + anytime list; one picked at random per visit. */
const timeOfDayGreetings: Record<TimeOfDay, readonly string[]> = {
  morning: [
    'Good morning, {name}.',
    'Rise and shine, {name}.',
    'Good morning, {name}. Ready to learn?',
  ],
  afternoon: [
    'Good afternoon, {name}.',
    'Good afternoon, {name}. Ready for more?',
    'Hope your afternoon is going well, {name}.',
  ],
  evening: [
    'Good evening, {name}.',
    'Good evening, {name}. Time for one more lesson?',
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

/** Random time-of-day greeting (varies per refresh); `now`/`random` injectable for tests. */
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
  const {
    currentStreakDays,
    completedLessonIds,
    progress,
    sequencedLessons,
    streakCompletedToday,
    testTodayKey,
  } = useLessonProgress(lessons, user?.uid);
  const { coinBalance } = useCurrency();
  /* When the daily-required practice gate is active, the dashboard locks lesson
   * navigation and funnels the learner to /practice (the route guard already
   * redirects here; this is the in-page locked state + safety net). */
  const gated = isDailyGateActive(progress, testTodayKey);
  const studentName = getStudentFirstName(user);
  // Per mount: stable across re-renders, varies per visit.
  const greeting = useMemo(() => getDashboardGreeting(studentName), [studentName]);

  const getLessonProgressPercent = (lesson: SequencedLesson) => {
    if (lesson.status === 'complete') {
      return 100;
    }

    const resumeState = progress.lessonResumeStates?.[lesson.id];
    if (!resumeState) {
      return 0;
    }

    return getPartialLessonProgressPercent(lesson, resumeState);
  };

  // Course progress folds in partial lessons; guard against an empty course (div-by-zero).
  const completionPercent =
    sequencedLessons.length > 0
      ? Math.round(
          sequencedLessons.reduce((total, lesson) => total + getLessonProgressPercent(lesson), 0) /
            sequencedLessons.length,
        )
      : 0;

  const nextLesson = sequencedLessons.find((lesson) => lesson.status === 'available');
  const nextLessonHasSavedProgress = nextLesson ? getLessonProgressPercent(nextLesson) > 0 : false;
  const nextLessonActionLabel = nextLesson
    ? `${nextLessonHasSavedProgress ? 'Resume' : 'Start'} ${nextLesson.title}`
    : '';

  // Shared XP -> level curve with the analytics page, so the level badge matches.
  const xpLevel = getXpLevel(progress.totalXp);

  /* Each card: level ring, progress ring, pip visual, or plain value + optional status. */
  const stats: {
    label: string;
    value: string;
    icon?: ReactNode;
    visual?: StatVisualSpec;
    status?: string;
    cardClassName?: string;
    levelRing?: { percent: number; label: string; ariaLabel: string };
    totalXp?: { value: string };
  }[] = [
    {
      label: 'Course progress',
      value: `${completionPercent}%`,
      visual: { kind: 'progress', percent: completionPercent },
    },
    {
      /* Merged XP card: level ring + Total XP + "to next level" status as one unit (mirrors analytics). */
      label: 'XP level',
      value: `Lv ${xpLevel.level}`,
      cardClassName: 'analytics-level-card xp-level-card',
      status: `${xpLevel.xpToNextLevel} XP to Level ${xpLevel.level + 1}`,
      levelRing: {
        percent: xpLevel.progress * 100,
        label: `Lv ${xpLevel.level}`,
        ariaLabel: `Level ${xpLevel.level}, ${xpLevel.xpIntoLevel} of ${xpLevel.xpForLevel} XP toward the next level`,
      },
      totalXp: { value: progress.totalXp.toLocaleString() },
    },
    {
      label: 'Coins',
      value: coinBalance.toLocaleString(),
      icon: <CoinIcon className="stat-card-ico reward-ico-coin" />,
      status: 'Spendable balance',
    },
    {
      label: 'Current streak',
      value: pluralize(currentStreakDays, 'day'),
      visual: { kind: 'streak', days: currentStreakDays, completedToday: streakCompletedToday },
    },
  ];

  /* Group sequenced lessons by chapter; unlocking stays linear course-wide. */
  const chapterSections = chapters.map((chapter) => {
    const chapterLessons = sequencedLessons.filter((lesson) => lesson.chapterId === chapter.id);
    const lessonProgress = getChapterLessonProgress(getChapterLessons(chapter.id), completedLessonIds);

    return { chapter, chapterLessons, lessonProgress };
  });

  // Mixed practice unlocks once any lesson is done.
  const anyPracticeAvailable = completedLessonIds.length > 0;

  return (
    <section className="dashboard-page">
      {gated ? (
        <div className="daily-gate-banner" role="alert">
          <div className="daily-gate-banner-body">
            <h2 className="daily-gate-banner-title">Daily practice required</h2>
            <p className="daily-gate-banner-copy">
              Pass today&apos;s mixed practice with 85% or better to unlock your lessons,
              games, and the rest of SlopeWise for the day.
            </p>
          </div>
          <Link className="primary-button daily-gate-banner-action" to="/practice">
            Start required practice
          </Link>
        </div>
      ) : null}

      <div className="page-heading">
        <h1>{greeting}</h1>
        <p>
          Work through the course chapter by chapter. Finish the ready lesson to
          unlock the next one, then practice a mixed set drawn from every lesson
          you complete.
        </p>
        {nextLesson && !gated ? (
          <Link className="next-lesson-callout" to={`/lessons/${nextLesson.id}`}>
            Next up: {nextLessonActionLabel}
          </Link>
        ) : null}
      </div>

      <div className="stats-grid" aria-label="Progress summary">
        {stats.map((stat) => (
          <article
            className={stat.cardClassName ? `stat-card ${stat.cardClassName}` : 'stat-card'}
            key={stat.label}
          >
            <span className={stat.icon ? 'stat-card-label currency-label' : 'stat-card-label'}>
              {stat.icon}
              {stat.label}
            </span>
            {stat.levelRing ? (
              <>
                <ProgressRing
                  percent={stat.levelRing.percent}
                  label={stat.levelRing.label}
                  ariaLabel={stat.levelRing.ariaLabel}
                />
                {stat.totalXp ? (
                  <span className="stat-card-total-xp">
                    <XpIcon className="stat-card-ico reward-ico-xp" />
                    <strong className="stat-card-total-xp-value">{stat.totalXp.value}</strong>
                    <span className="stat-card-total-xp-unit">total XP</span>
                  </span>
                ) : null}
                {stat.status ? <span className="stat-card-status">{stat.status}</span> : null}
              </>
            ) : stat.visual?.kind === 'progress' ? (
              <ProgressRing
                percent={stat.visual.percent}
                label={stat.value}
                ariaLabel={`${stat.label}: ${stat.value} complete`}
              />
            ) : (
              <>
                <strong className="stat-card-value">{stat.value}</strong>
                {stat.visual ? <StatVisual spec={stat.visual} /> : null}
                {stat.status ? <span className="stat-card-status">{stat.status}</span> : null}
              </>
            )}
          </article>
        ))}
      </div>

      <aside className="practice-unlock" aria-label="Practice mode">
        <div className="practice-unlock-body">
          <h2 className="practice-unlock-title">Mixed practice</h2>
          <p className="practice-unlock-copy">
            {anyPracticeAvailable
              ? 'Reinforce what you have learned with a fresh, randomized set drawn from every lesson you have completed.'
              : 'Complete a lesson to unlock mixed practice, drawn from every lesson you finish.'}
          </p>
        </div>
        <Link className="primary-button practice-unlock-action" to="/practice">
          {anyPracticeAvailable ? 'Go to practice' : 'View practice'}
        </Link>
      </aside>

      <div className="chapter-list" aria-label="Course chapters">
        {chapterSections.map(({ chapter, chapterLessons, lessonProgress }) => (
          <ChapterCard
            key={chapter.id}
            number={chapter.number}
            title={chapter.title}
            description={chapter.description}
            lessons={chapterLessons}
            completedLessons={lessonProgress.completedLessons}
            totalLessons={lessonProgress.totalLessons}
            percentComplete={lessonProgress.percentComplete}
            getLessonProgressPercent={getLessonProgressPercent}
            finishVariant={chapter.number === chapters.length ? 'course' : 'chapter'}
            locked={gated}
          />
        ))}
      </div>
    </section>
  );
}

type ChapterCardProps = {
  number: number;
  title: string;
  description: string;
  lessons: SequencedLesson[];
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
  getLessonProgressPercent: (lesson: SequencedLesson) => number;
  finishVariant: 'chapter' | 'course';
  /** When true, the trail renders non-interactive (daily gate active). */
  locked?: boolean;
};

function ChapterCard({
  number,
  title,
  description,
  lessons,
  completedLessons,
  totalLessons,
  percentComplete,
  getLessonProgressPercent,
  finishVariant,
  locked = false,
}: ChapterCardProps) {
  const hasLessons = totalLessons > 0;
  const isComplete = hasLessons && completedLessons === totalLessons;

  // Render this chapter's lessons as the winding "trail map".
  const trailNodes: TrailMapNode[] = lessons.map((lesson) => {
    const progressPercent = getLessonProgressPercent(lesson);

    return {
      id: lesson.id,
      title: lesson.title,
      status: lesson.status,
      sequenceNumber: lesson.sequenceNumber,
      lockedReason: lesson.lockedReason,
      progressPercent,
      hasSavedProgress: progressPercent > 0,
    };
  });

  return (
    <article className={`chapter-card${isComplete ? ' chapter-card-complete' : ''}`}>
      <header className="chapter-card-header">
        <div className="chapter-card-heading">
          <span className="chapter-card-eyebrow">Chapter {number}</span>
          <h2 className="chapter-card-title">{title}</h2>
          <p className="chapter-card-description">{description}</p>
        </div>
        <div className="chapter-card-progress">
          <span className="chapter-card-progress-count">
            {completedLessons} / {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
          </span>
          <div
            className="chapter-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentComplete}
            aria-label={`${title} progress`}
          >
            <div className="chapter-progress-fill" style={{ width: `${percentComplete}%` }} />
          </div>
          <span className="chapter-card-progress-percent">{percentComplete}% complete</span>
        </div>
      </header>

      {hasLessons ? (
        <nav className="chapter-trail" aria-label={`Lesson map for ${title}`}>
          <TrailMap nodes={trailNodes} finishVariant={finishVariant} locked={locked} />
        </nav>
      ) : (
        <p className="chapter-empty">Lessons coming soon.</p>
      )}
    </article>
  );
}

