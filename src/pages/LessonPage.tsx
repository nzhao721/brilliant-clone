import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LessonPlayer } from '../components/LessonPlayer';
import { MathText } from '../components/MathText';
import { lessons } from '../data/lessons';
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
    recordQuestionAttempt,
    saveLessonResumeState,
  } = useLessonProgress(lessons, user?.uid);
  const lesson = getSequencedLessonById(lessons, completedLessonIds, lessonId);
  const lessonIndex = lesson ? lessons.findIndex((item) => item.id === lesson.id) : -1;
  const nextLesson = lessonIndex >= 0 ? lessons[lessonIndex + 1] : undefined;

  if (!lesson) {
    return (
      <section className="page-card">
        <p className="eyebrow">Lesson not found</p>
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
        <p className="eyebrow">Locked lesson</p>
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
        initialProgress={progress.lessonResumeStates?.[lesson.id]}
        lesson={lesson}
        nextLesson={nextLesson}
        onAttempt={(questionId, isCorrect) => recordQuestionAttempt(questionId, isCorrect)}
        onClearProgress={() => clearLessonResumeState(lesson.id)}
        onComplete={() => completeLesson(lesson.id, getLessonQuestionIds(lesson))}
        onCorrectAnswer={(questionId) => awardQuestion(lesson.id, questionId)}
        onProgressChange={(resumeState) => saveLessonResumeState(lesson.id, resumeState)}
        onStudyTime={(millisecondsSpent) => addStudyTime(lesson.id, millisecondsSpent)}
      />
    </section>
  );
}
