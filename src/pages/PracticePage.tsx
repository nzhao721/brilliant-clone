import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { MathText } from '../components/MathText';
import { lessons } from '../data/lessons';
import {
  getPracticeQuestionsForCompletedLessons,
  pickRandomQuestions,
  questionBank,
  type PracticeQuestion,
  type RandomNumberGenerator,
} from '../data/questionBank';
import { useLessonProgress } from '../lessons/lessonProgress';
import { pluralize } from '../lib/pluralize';

type AnswerResult = 'correct' | 'incorrect' | null;

type PracticePageProps = {
  rng?: RandomNumberGenerator;
  sessionSize?: number;
};

function createPracticeSession(
  sourceQuestions: readonly PracticeQuestion[],
  sessionSize: number,
  rng: RandomNumberGenerator,
) {
  return pickRandomQuestions(sourceQuestions, sessionSize, rng);
}

export function PracticePage({ rng = Math.random, sessionSize = 12 }: PracticePageProps) {
  const { user } = useAuth();
  const { addPracticeStudyTime, awardPracticeQuestion, completedLessonIds, recordQuestionAttempt } =
    useLessonProgress(lessons, user?.uid);
  // Key on the *contents* of completedLessonIds, not the array reference.
  // Awarding XP/streak + recording an attempt on each answer rewrites progress,
  // which hands back a new completedLessonIds array with identical contents.
  // Memoizing on the reference would recreate `eligibleQuestions` every answer
  // and trip the session-reset effect (resetting to question 1 and clearing the
  // explanation). Keying on contents keeps it referentially stable.
  const completedLessonsKey = completedLessonIds.join('|');
  const eligibleQuestions = useMemo(
    () => getPracticeQuestionsForCompletedLessons(completedLessonIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedLessonsKey],
  );
  const [sessionQuestions, setSessionQuestions] = useState<PracticeQuestion[]>(() =>
    createPracticeSession(eligibleQuestions, sessionSize, rng),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const sessionInputRef = useRef({ eligibleQuestions, rng, sessionSize });
  const studyStartedAtRef = useRef(Date.now());
  const hasStudyActivityRef = useRef(false);
  const addPracticeStudyTimeRef = useRef(addPracticeStudyTime);
  const currentQuestion = sessionQuestions[questionIndex];
  const answeredCount = correctCount + incorrectCount;
  const percentCorrect = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const hasCompletedLessons = completedLessonIds.length > 0;

  useEffect(() => {
    const previousInput = sessionInputRef.current;
    if (
      previousInput.eligibleQuestions === eligibleQuestions &&
      previousInput.rng === rng &&
      previousInput.sessionSize === sessionSize
    ) {
      return;
    }

    sessionInputRef.current = { eligibleQuestions, rng, sessionSize };
    setSessionQuestions(createPracticeSession(eligibleQuestions, sessionSize, rng));
    setQuestionIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setIsSessionComplete(false);
    setSelectedChoiceId('');
    setAnswerResult(null);
  }, [eligibleQuestions, rng, sessionSize]);

  useEffect(() => {
    addPracticeStudyTimeRef.current = addPracticeStudyTime;
  });

  // Begin timing once the learner enters the actual practice (past the intro).
  useEffect(() => {
    if (hasStarted) {
      studyStartedAtRef.current = Date.now();
    }
  }, [hasStarted]);

  // Record the session's elapsed study time once, when leaving the page.
  useEffect(
    () => () => {
      if (!hasStudyActivityRef.current) {
        return;
      }

      addPracticeStudyTimeRef.current(Date.now() - studyStartedAtRef.current);
    },
    [],
  );

  function resetAnswerState() {
    setSelectedChoiceId('');
    setAnswerResult(null);
  }

  function handleSubmitAnswer() {
    if (!selectedChoiceId || !currentQuestion || answerResult) {
      return;
    }

    const isCorrect = selectedChoiceId === currentQuestion.correctChoiceId;

    // Count practice toward XP (10 per correct), streak + streak bonus, and the
    // attempt-based analytics (accuracy, questions attempted/correct).
    hasStudyActivityRef.current = true;
    awardPracticeQuestion(isCorrect);
    recordQuestionAttempt(currentQuestion.id, isCorrect);

    setAnswerResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      setCorrectCount((current) => current + 1);
    } else {
      setIncorrectCount((current) => current + 1);
    }
  }

  function handleNextQuestion() {
    resetAnswerState();

    if (questionIndex < sessionQuestions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    setIsSessionComplete(true);
  }

  function handleStartNewSession() {
    setSessionQuestions(createPracticeSession(eligibleQuestions, sessionSize, rng));
    setQuestionIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setIsSessionComplete(false);
    resetAnswerState();
  }

  if (!currentQuestion) {
    return (
      <section className="practice-page">
        <div className="page-card">
          <h1>
            {hasCompletedLessons
              ? 'No practice topics are ready yet.'
              : 'Practice unlocks after Lesson 1.'}
          </h1>
          <p>
            {hasCompletedLessons
              ? 'Head back to your dashboard and continue the next lesson to unlock more practice.'
              : 'Complete your first lesson so practice can draw questions from topics you have already learned.'}
          </p>
          <div className="button-row compact-row">
            {!hasCompletedLessons ? (
              <Link className="primary-button" to="/lessons/what-changes">
                Start Lesson 1
              </Link>
            ) : null}
            <Link className="secondary-button" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!hasStarted) {
    return (
      <section className="practice-page">
        <div className="page-card narrow-card practice-intro">
          <h1>Random derivative practice</h1>
          <p>
            Work through a fresh mix of questions drawn from{' '}
            {pluralize(eligibleQuestions.length, 'unlocked question')} in the{' '}
            {questionBank.length}-question bank.
          </p>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={() => setHasStarted(true)}>
              Next
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="practice-page">
      {isSessionComplete ? (
        <article className="lesson-player completion-card practice-summary-card" aria-live="polite">
          <p className="eyebrow">Practice complete</p>
          <h2>Random set summary</h2>
          <p>
            You answered {pluralize(answeredCount, 'question')} from this random set with{' '}
            {percentCorrect}% correct.
          </p>

          <dl className="practice-summary-stats" aria-label="Practice session results">
            <div>
              <dt>Answered</dt>
              <dd>{answeredCount}</dd>
            </div>
            <div>
              <dt>Correct</dt>
              <dd>{correctCount}</dd>
            </div>
            <div>
              <dt>Incorrect</dt>
              <dd>{incorrectCount}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{percentCorrect}%</dd>
            </div>
          </dl>

          <div className="completion-actions">
            <button className="primary-button" type="button" onClick={handleStartNewSession}>
              Start another random set
            </button>
          </div>
        </article>
      ) : (
        <PracticeQuestionCard
          answerResult={answerResult}
          currentQuestion={currentQuestion}
          onNextQuestion={handleNextQuestion}
          onSelectChoice={setSelectedChoiceId}
          onSubmitAnswer={handleSubmitAnswer}
          selectedChoiceId={selectedChoiceId}
          sessionLength={sessionQuestions.length}
          questionIndex={questionIndex}
        />
      )}
    </section>
  );
}

type PracticeQuestionCardProps = {
  answerResult: AnswerResult;
  currentQuestion: PracticeQuestion;
  onNextQuestion: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmitAnswer: () => void;
  selectedChoiceId: string;
  sessionLength: number;
  questionIndex: number;
};

function PracticeQuestionCard({
  answerResult,
  currentQuestion,
  onNextQuestion,
  onSelectChoice,
  onSubmitAnswer,
  selectedChoiceId,
  sessionLength,
  questionIndex,
}: PracticeQuestionCardProps) {
  const selectedChoice = currentQuestion.choices.find((choice) => choice.id === selectedChoiceId);
  const correctChoice = currentQuestion.choices.find(
    (choice) => choice.id === currentQuestion.correctChoiceId,
  );
  const isLastQuestion = questionIndex === sessionLength - 1;

  return (
    <article className="lesson-player practice-card">
      <div className="lesson-progress" aria-label="Practice progress">
        <span>
          Question {questionIndex + 1} of {sessionLength}
        </span>
        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ width: `${((questionIndex + 1) / sessionLength) * 100}%` }}
          />
        </div>
      </div>

      <div className="lesson-step">
        <h2>
          <MathText text={currentQuestion.prompt} />
        </h2>

        <div className="answer-options" role="radiogroup" aria-label={currentQuestion.prompt}>
          {currentQuestion.choices.map((choice) => (
            <label className="answer-option" key={choice.id}>
              <input
                type="radio"
                name={currentQuestion.id}
                value={choice.id}
                checked={selectedChoiceId === choice.id}
                disabled={Boolean(answerResult)}
                onChange={() => onSelectChoice(choice.id)}
              />
              <span className="answer-option-copy">
                <MathText text={choice.label} />
              </span>
            </label>
          ))}
        </div>

        <div className="button-row compact-row">
          {answerResult ? (
            <button className="primary-button" type="button" onClick={onNextQuestion}>
              {isLastQuestion ? 'View summary' : 'Next random question'}
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={!selectedChoiceId}
              onClick={onSubmitAnswer}
            >
              Submit answer
            </button>
          )}
        </div>

        {answerResult ? (
          <div
            className={answerResult === 'correct' ? 'success-message' : 'error-message'}
            role="alert"
          >
            <strong>{answerResult === 'correct' ? 'Correct.' : 'Not quite.'}</strong>{' '}
            {answerResult === 'incorrect' && correctChoice ? (
              <>
                The best answer is <MathText text={correctChoice.label} />.{' '}
              </>
            ) : null}
            <MathText text={currentQuestion.explanation} />
            {selectedChoice ? (
              <span className="practice-selected-answer">
                Your choice: <MathText text={selectedChoice.label} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

    </article>
  );
}
