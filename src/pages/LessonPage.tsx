import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LessonPlayer } from '../components/LessonPlayer';
import { MathText } from '../components/MathText';
import { lessons } from '../data/lessons';
import { useCurrency } from '../games/useCurrency';
import {
  getLessonQuestionIds,
  getSequencedLessonById,
  useLessonProgress,
} from '../lessons/lessonProgress';

export function LessonPage() {
  const { lessonId } = useParams();
  const { user } = useAuth();
  const {
    addStudyTime,
    awardQuestion,
    clearLessonResumeState,
    completeLesson,
    completedLessonIds,
    progress,
    recordResponse,
    saveLessonResumeState,
  } = useLessonProgress(lessons, user?.uid);
  const { coinBalance, xp } = useCurrency();
  const lesson = getSequencedLessonById(lessons, completedLessonIds, lessonId);
  const lessonIndex = lesson ? lessons.findIndex((item) => item.id === lesson.id) : -1;
  const nextLesson = lessonIndex >= 0 ? lessons[lessonIndex + 1] : undefined;

  if (!lesson) {
    return (
      <section className="page-card">
        <h1>We could not find that lesson.</h1>
        <p>Return to the dashboard and choose one of the available lessons.</p>
        <Link className="secondary-button" to="/dashboard">
          Back to dashboard
        </Link>
      </section>
    );
  }

  if (lesson.status === 'locked') {
    return (
      <section className="page-card">
        <h1>{lesson.title}</h1>
        <div className="math-copy">
          <MathText text={lesson.description} />
        </div>
        <p>{lesson.lockedReason ?? 'Complete the earlier lessons first.'}</p>
        <Link className="secondary-button" to="/dashboard">
          Back to dashboard
        </Link>
      </section>
    );
  }

  return (
    <section className="lesson-page">
      <LessonPlayer
        coinBalance={coinBalance}
        totalXp={xp}
        initialProgress={progress.lessonResumeStates?.[lesson.id]}
        lesson={lesson}
        nextLesson={nextLesson}
        progress={progress}
        onAttempt={(detail) =>
          // History ALWAYS records (before any AI call). The player already emits
          // this synchronously on submit, independent of AI/connectivity.
          recordResponse({
            source: 'lesson',
            chapterId: lesson.chapterId,
            lessonId: lesson.id,
            questionId: detail.questionId,
            isCorrect: detail.isCorrect,
            prompt: detail.prompt,
            chosenChoiceId: detail.chosenChoiceId,
            chosenLabel: detail.chosenLabel,
            correctLabel: detail.correctLabel,
          })
        }
        onClearProgress={() => clearLessonResumeState(lesson.id)}
        onComplete={() => completeLesson(lesson.id, getLessonQuestionIds(lesson))}
        onCorrectAnswer={(questionId) => awardQuestion(lesson.id, questionId)}
        onProgressChange={(resumeState) => saveLessonResumeState(lesson.id, resumeState)}
        onStudyTime={(millisecondsSpent) => addStudyTime(lesson.id, millisecondsSpent)}
      />
    </section>
  );
}
