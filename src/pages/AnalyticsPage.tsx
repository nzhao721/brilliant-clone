import { ProgressRing } from '../components/ProgressRing';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import {
  formatCompletionDate,
  formatMinutes,
  getDaysActiveCount,
  getDaysActiveThisWeek,
  getLessonTimeMinutes,
  getLongestStreakDays,
  getOverallAccuracy,
  getQuestionsAnsweredCorrectlyCount,
  getQuestionsAttemptedCount,
  getTotalStudyMinutes,
  getXpLevel,
  useLessonProgress,
} from '../lessons/lessonProgress';
import { pluralize } from '../lib/pluralize';

export function AnalyticsPage() {
  const { user } = useAuth();
  const { minutesToday, progress, sequencedLessons, testTodayKey } = useLessonProgress(
    lessons,
    user?.uid,
  );

  const lessonsCompleted = progress.completedLessonIds.length;
  const totalLessons = lessons.length;
  const questionsAttempted = getQuestionsAttemptedCount(progress);
  const questionsCorrect = getQuestionsAnsweredCorrectlyCount(progress);
  const longestStreak = getLongestStreakDays(progress.dailyCompletionDates);
  const totalStudyMinutes = getTotalStudyMinutes(progress);
  const daysActive = getDaysActiveCount(progress);
  const daysActiveThisWeek = getDaysActiveThisWeek(progress, testTodayKey);
  const accuracy = getOverallAccuracy(progress);
  const xpLevel = getXpLevel(progress.totalXp);
  const xpLevelPercent = (xpLevel.xpIntoLevel / xpLevel.xpForLevel) * 100;

  const stats: { label: string; value: string }[] = [
    { label: 'Lessons completed', value: `${lessonsCompleted} / ${totalLessons}` },
    { label: 'Questions attempted', value: `${questionsAttempted}` },
    { label: 'Questions answered correctly', value: `${questionsCorrect}` },
    { label: 'Longest streak', value: pluralize(longestStreak, 'day') },
    { label: 'Total study time', value: formatMinutes(totalStudyMinutes) },
    { label: 'Minutes today', value: `${minutesToday} min` },
    { label: 'Days active', value: `${daysActive}` },
    { label: 'Days active this week', value: `${daysActiveThisWeek} / 7` },
    { label: 'Accuracy', value: questionsAttempted === 0 ? '—' : `${accuracy}%` },
  ];

  const lessonBreakdown = sequencedLessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    sequenceNumber: lesson.sequenceNumber,
    isComplete: lesson.status === 'complete',
    completedDate: formatCompletionDate(progress.lessonCompletedAt?.[lesson.id]),
    minutes: getLessonTimeMinutes(progress, lesson.id),
  }));

  return (
    <section className="analytics-page">
      <div className="page-heading">
        <h1>Analytics</h1>
        <p>Track your accuracy, study habits, and progress across every lesson.</p>
      </div>

      <div className="stats-grid analytics-grid" aria-label="Learning statistics">
        <article className="stat-card analytics-level-card">
          <span className="stat-card-label">XP level</span>
          <ProgressRing
            percent={xpLevelPercent}
            label={`Lv ${xpLevel.level}`}
            ariaLabel={`Level ${xpLevel.level}, ${xpLevel.xpIntoLevel} of ${xpLevel.xpForLevel} XP toward the next level`}
          />
          <span className="stat-card-status">
            {xpLevel.xpToNextLevel} XP to Level {xpLevel.level + 1}
          </span>
        </article>

        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <span className="stat-card-label">{stat.label}</span>
            <strong className="stat-card-value">{stat.value}</strong>
          </article>
        ))}
      </div>

      <div className="analytics-breakdown">
        <h2 className="analytics-subheading">Per-lesson breakdown</h2>
        <ul className="lesson-breakdown" aria-label="Per-lesson breakdown">
          {lessonBreakdown.map((lesson) => (
            <li className="lesson-breakdown-row" key={lesson.id}>
              <span className="lesson-breakdown-title">
                {lesson.sequenceNumber}. {lesson.title}
              </span>
              {lesson.isComplete ? (
                <span className="lesson-breakdown-meta">
                  <span className="lesson-breakdown-date">
                    {lesson.completedDate ? `Completed ${lesson.completedDate}` : 'Completed'}
                  </span>
                  <span className="lesson-breakdown-time">{lesson.minutes} min</span>
                </span>
              ) : (
                <span className="lesson-breakdown-meta lesson-breakdown-pending">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Not completed yet</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
