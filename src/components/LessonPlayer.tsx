import { Link } from 'react-router-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { InteractiveVisual, Lesson, LessonStep } from '../data/lessons';
import {
  getPartialLessonProgressPercent,
  type LessonCompletionAward,
  type LessonResumeState,
} from '../lessons/lessonProgress';
import { pluralize } from '../lib/pluralize';
import { InteractiveGraph } from './InteractiveGraph';
import { MathText } from './MathText';
import './LessonPlayer.css';

type LessonPlayerProps = {
  initialProgress?: LessonResumeState;
  lesson: Lesson;
  nextLesson?: Pick<Lesson, 'id' | 'title'>;
  onAttempt?: (questionId: string, isCorrect: boolean) => void;
  onClearProgress?: () => void;
  onComplete?: () => LessonCompletionAward;
  onCorrectAnswer?: (questionId: string) => number;
  onProgressChange?: (resumeState: LessonResumeState) => void;
  onStudyTime?: (millisecondsSpent: number) => void;
};

type AnswerResult = 'correct' | 'incorrect' | null;

type QuestionStepState = {
  selectedOptionId: string;
  answerResult: AnswerResult;
  showHint: boolean;
};

const emptyQuestionState: QuestionStepState = {
  selectedOptionId: '',
  answerResult: null,
  showHint: false,
};

function getInitialStepIndex(lesson: Lesson, initialProgress: LessonResumeState | undefined) {
  const maxStepIndex = Math.max(0, lesson.steps.length - 1);
  return Math.min(Math.max(initialProgress?.stepIndex ?? 0, 0), maxStepIndex);
}

export function LessonPlayer({
  initialProgress,
  lesson,
  nextLesson,
  onAttempt,
  onClearProgress,
  onComplete,
  onCorrectAnswer,
  onProgressChange,
  onStudyTime,
}: LessonPlayerProps) {
  const [stepIndex, setStepIndex] = useState(() => getInitialStepIndex(lesson, initialProgress));
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionStepState>>(
    () => initialProgress?.questionStates ?? {},
  );
  const [isComplete, setIsComplete] = useState(false);
  const [completionAward, setCompletionAward] = useState<LessonCompletionAward | null>(null);
  const hasLoadedProgress = useRef(false);
  const hasStudyActivity = useRef(false);
  const onProgressChangeRef = useRef(onProgressChange);
  const onCorrectAnswerRef = useRef(onCorrectAnswer);
  const onAttemptRef = useRef(onAttempt);
  const onStudyTimeRef = useRef(onStudyTime);
  const studyStartedAt = useRef(Date.now());
  const currentStep = lesson.steps[stepIndex];
  const currentQuestionState =
    currentStep?.type === 'multiple-choice'
      ? (questionStates[currentStep.id] ?? emptyQuestionState)
      : null;
  const resumeState = useMemo(
    () => ({
      questionStates,
      stepIndex,
    }),
    [questionStates, stepIndex],
  );
  const progressPercent = useMemo(
    () => getPartialLessonProgressPercent(lesson, resumeState),
    [lesson, resumeState],
  );

  useEffect(() => {
    hasLoadedProgress.current = false;
    setStepIndex(getInitialStepIndex(lesson, initialProgress));
    setQuestionStates(initialProgress?.questionStates ?? {});
    setIsComplete(false);
    setCompletionAward(null);
    hasStudyActivity.current = false;
    studyStartedAt.current = Date.now();
  }, [lesson.id]);

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);

  useEffect(() => {
    onCorrectAnswerRef.current = onCorrectAnswer;
  }, [onCorrectAnswer]);

  useEffect(() => {
    onAttemptRef.current = onAttempt;
  }, [onAttempt]);

  useEffect(() => {
    onStudyTimeRef.current = onStudyTime;
  }, [onStudyTime]);

  useEffect(
    () => () => {
      recordStudyTime();
    },
    [lesson.id],
  );

  useEffect(() => {
    if (isComplete) {
      return;
    }

    if (!hasLoadedProgress.current) {
      hasLoadedProgress.current = true;
      return;
    }

    onProgressChangeRef.current?.(resumeState);
  }, [isComplete, resumeState]);

  function updateQuestionState(
    stepId: string,
    updater: (previousState: QuestionStepState) => QuestionStepState,
  ) {
    setQuestionStates((currentStates) => ({
      ...currentStates,
      [stepId]: updater(currentStates[stepId] ?? emptyQuestionState),
    }));
  }

  function markStudyActivity() {
    hasStudyActivity.current = true;
  }

  function recordStudyTime() {
    if (!hasStudyActivity.current) {
      return;
    }

    const millisecondsSpent = Date.now() - studyStartedAt.current;
    hasStudyActivity.current = false;
    studyStartedAt.current = Date.now();
    onStudyTimeRef.current?.(millisecondsSpent);
  }

  function completeLesson() {
    markStudyActivity();
    recordStudyTime();
    setCompletionAward(onComplete?.() ?? null);
    onClearProgress?.();
    setIsComplete(true);
  }

  function goToNextStep() {
    markStudyActivity();
    if (stepIndex === lesson.steps.length - 1) {
      completeLesson();
      return;
    }

    setStepIndex((current) => current + 1);
  }

  function goToPreviousStep() {
    if (stepIndex === 0) {
      return;
    }

    markStudyActivity();
    setStepIndex((current) => current - 1);
  }

  function handleSubmitAnswer(step: Extract<LessonStep, { type: 'multiple-choice' }>) {
    const stepState = questionStates[step.id] ?? emptyQuestionState;

    if (!stepState.selectedOptionId) {
      return;
    }

    markStudyActivity();
    const isCorrect = stepState.selectedOptionId === step.correctOptionId;
    // Count every real submission (correct or incorrect) exactly once. The retry
    // path clears the result and re-enters here, so each click is one attempt.
    onAttemptRef.current?.(step.id, isCorrect);
    if (isCorrect && stepState.answerResult !== 'correct') {
      onCorrectAnswerRef.current?.(step.id);
    }

    updateQuestionState(step.id, (previousState) => ({
      ...previousState,
      answerResult: isCorrect ? 'correct' : 'incorrect',
    }));
  }

  function handleRetryAnswer(step: Extract<LessonStep, { type: 'multiple-choice' }>) {
    markStudyActivity();
    updateQuestionState(step.id, (previousState) => ({
      ...previousState,
      selectedOptionId: '',
      answerResult: null,
    }));
  }

  if (!currentStep) {
    return (
      <div className="lesson-player completion-card">
        <h2>This lesson is not ready yet.</h2>
        <p>Choose another available lesson from the dashboard.</p>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="lesson-player completion-card">
        <CompletionBadge />
        <p className="eyebrow">Lesson complete</p>
        <h2>Nice work on {lesson.title}</h2>
        <p>You finished this lesson and saved your progress for the local test build.</p>
        {completionAward ? (
          <div className="xp-summary" aria-label="XP gained">
            <strong>
              +<CountUpNumber value={completionAward.totalXpGained} /> XP
            </strong>
            <span>
              {pluralize(completionAward.questionsAnswered, 'question')} answered: +
              {completionAward.lessonXp} XP
            </span>
            {completionAward.dailyBonusXp > 0 ? (
              <span>Streak bonus: +{completionAward.dailyBonusXp} XP</span>
            ) : null}
            {completionAward.alreadyCompleted ? <span>Already completed: no new XP</span> : null}
          </div>
        ) : null}
        <div className="completion-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setIsComplete(false);
              setStepIndex(0);
              setQuestionStates({});
              onClearProgress?.();
            }}
          >
            Review lesson
          </button>
          {nextLesson ? (
            <Link className="primary-button" to={`/lessons/${nextLesson.id}`}>
              Next lesson: {nextLesson.title}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-player">
      <div className="lesson-progress" aria-label={`${lesson.title} — lesson progress`}>
        <div className="lesson-progress-label">
          <h1 className="lesson-progress-title">{lesson.title}</h1>
          <span className="lesson-progress-step">
            Step {stepIndex + 1} of {lesson.steps.length}
          </span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {currentStep.type === 'concept' ? (
        <ConceptStep key={stepIndex} step={currentStep} />
      ) : (
        <QuestionStep
          key={stepIndex}
          answerResult={currentQuestionState?.answerResult ?? null}
          onSelectOption={(optionId) => {
            markStudyActivity();
            updateQuestionState(currentStep.id, (previousState) => ({
              ...previousState,
              selectedOptionId: optionId,
            }));
          }}
          selectedOptionId={currentQuestionState?.selectedOptionId ?? ''}
          showHint={currentQuestionState?.showHint ?? false}
          step={currentStep}
        />
      )}

      <div className="lesson-controls">
        <button
          className="secondary-button"
          type="button"
          disabled={stepIndex === 0}
          onClick={goToPreviousStep}
        >
          Back
        </button>
        <div className="lesson-controls-primary">
          {currentStep.type === 'multiple-choice' ? (
            <>
              {currentStep.hint ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={currentQuestionState?.answerResult === 'correct'}
                  onClick={() => {
                    markStudyActivity();
                    updateQuestionState(currentStep.id, (previousState) => ({
                      ...previousState,
                      showHint: true,
                    }));
                  }}
                >
                  Show hint
                </button>
              ) : null}
              <button
                className="primary-button"
                type="button"
                disabled={
                  (!currentQuestionState?.selectedOptionId &&
                    currentQuestionState?.answerResult !== 'incorrect') ||
                  currentQuestionState?.answerResult === 'correct'
                }
                onClick={() =>
                  currentQuestionState?.answerResult === 'incorrect'
                    ? handleRetryAnswer(currentStep)
                    : handleSubmitAnswer(currentStep)
                }
              >
                {currentQuestionState?.answerResult === 'incorrect' ? 'Try again' : 'Submit answer'}
              </button>
            </>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={
              currentStep.type === 'multiple-choice' &&
              currentQuestionState?.answerResult !== 'correct'
            }
            onClick={goToNextStep}
          >
            {stepIndex === lesson.steps.length - 1 ? 'Finish lesson' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Two-panel step shell: when a step has an interactive visual we place it in a
 * left panel and the text-based content (prompt, answers, hints, feedback) in a
 * right panel so everything stays visible on one screen without scrolling.
 * Falls back to a single column when there is no visual.
 */
function StepLayout({
  eyebrow,
  visual,
  children,
}: {
  eyebrow: string;
  visual?: InteractiveVisual;
  children: ReactNode;
}) {
  if (!visual) {
    return (
      <article className="lesson-step">
        <p className="eyebrow">{eyebrow}</p>
        {children}
      </article>
    );
  }

  return (
    <article className="lesson-step lesson-step-split">
      <div className="lesson-step-visual">
        <InteractiveGraph visual={visual} />
      </div>
      <div className="lesson-step-main">
        <p className="eyebrow">{eyebrow}</p>
        {children}
      </div>
    </article>
  );
}

function ConceptStep({ step }: { step: Extract<LessonStep, { type: 'concept' }> }) {
  return (
    <StepLayout eyebrow="Concept" visual={step.visual}>
      <h2>
        <MathText text={step.title} />
      </h2>
      <div className="math-copy">
        <MathText text={step.body} />
      </div>
    </StepLayout>
  );
}

type QuestionStepProps = {
  answerResult: AnswerResult;
  onSelectOption: (optionId: string) => void;
  selectedOptionId: string;
  showHint: boolean;
  step: Extract<LessonStep, { type: 'multiple-choice' }>;
};

function QuestionStep({
  answerResult,
  onSelectOption,
  selectedOptionId,
  showHint,
  step,
}: QuestionStepProps) {
  return (
    <StepLayout eyebrow="Try it" visual={step.visual}>
      <h2>
        <MathText text={step.title} />
      </h2>
      <div className="math-copy">
        <MathText text={step.prompt} />
      </div>

      <div className="answer-options" role="radiogroup" aria-label={step.prompt}>
        {step.options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          const showAsCorrect = answerResult === 'correct' && option.id === step.correctOptionId;
          const showAsIncorrect = answerResult === 'incorrect' && isSelected;
          const optionClassName = [
            'answer-option',
            showAsCorrect ? 'is-correct' : '',
            showAsIncorrect ? 'is-incorrect' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <label className={optionClassName} key={option.id}>
              <input
                type="radio"
                name={step.id}
                value={option.id}
                checked={isSelected}
                disabled={Boolean(answerResult)}
                onChange={() => onSelectOption(option.id)}
              />
              <span className="answer-option-copy">
                <MathText text={option.label} />
              </span>
            </label>
          );
        })}
      </div>

      <div className="lesson-feedback">
        {showHint && step.hint ? (
          <div className="notice" role="status">
            <MathText text={step.hint} />
          </div>
        ) : null}

        {answerResult ? (
          <div
            className={answerResult === 'correct' ? 'success-message' : 'error-message'}
            role="alert"
          >
            <MathText
              text={
                answerResult === 'correct' ? step.correctExplanation : step.incorrectExplanation
              }
            />
          </div>
        ) : null}
      </div>
    </StepLayout>
  );
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Counts up to `value` with an ease-out ramp. Renders the final value
 * immediately when motion is reduced or unavailable (e.g. in tests), and sets
 * the start value in a layout effect so the final value never flashes first.
 */
function CountUpNumber({ value, durationMs = 950 }: { value: number; durationMs?: number }) {
  const [displayValue, setDisplayValue] = useState(value);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || value <= 0) {
      setDisplayValue(value);
      return;
    }

    let frame = 0;
    const startTime = performance.now();
    setDisplayValue(0);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplayValue(value);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <>{displayValue}</>;
}

/**
 * Celebratory check badge for the lesson completion screen: a gradient disc
 * pops in, the checkmark draws itself, and two rings burst outward. Purely
 * decorative — the "Lesson complete" text carries the meaning.
 */
function CompletionBadge() {
  return (
    <div className="completion-badge" aria-hidden="true">
      <svg className="completion-badge-svg" viewBox="0 0 120 120" focusable="false">
        <defs>
          <linearGradient id="completion-badge-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop className="completion-badge-grad-from" offset="0" />
            <stop className="completion-badge-grad-to" offset="1" />
          </linearGradient>
        </defs>
        <circle className="completion-badge-burst completion-badge-burst-1" cx="60" cy="60" r="40" />
        <circle className="completion-badge-burst completion-badge-burst-2" cx="60" cy="60" r="40" />
        <circle
          className="completion-badge-disc"
          cx="60"
          cy="60"
          r="34"
          fill="url(#completion-badge-gradient)"
        />
        <path className="completion-badge-check" d="M44 61 l11 11 l22 -26" />
      </svg>
    </div>
  );
}
