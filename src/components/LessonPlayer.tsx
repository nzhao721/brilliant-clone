import { Link } from 'react-router-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSound } from '../audio/SoundProvider';
import type { InteractiveVisual, Lesson, LessonStep } from '../data/lessons';
import {
  getPartialLessonProgressPercent,
  type LessonCompletionAward,
  type LessonProgress,
  type LessonResumeState,
} from '../lessons/lessonProgress';
import { useAiTutor } from '../lessons/useAiTutor';
import type { TutorResponse } from '../lib/ai';
import { pluralize } from '../lib/pluralize';
import { AiTutorFeedback } from './AiTutorMessage';
import { CoinIcon, XpIcon } from './CurrencyIcons';
import { InteractiveGraph } from './InteractiveGraph';
import { MathText } from './MathText';
import './LessonPlayer.css';

// What the player reports up on every real answer submission. The page maps this
// to a full ResponseContext (adding source/chapterId/lessonId) for recordResponse.
export type LessonAttemptDetail = {
  questionId: string;
  isCorrect: boolean;
  prompt: string;
  chosenChoiceId: string;
  chosenLabel: string;
  correctLabel: string;
};

type LessonPlayerProps = {
  initialProgress?: LessonResumeState;
  lesson: Lesson;
  nextLesson?: Pick<Lesson, 'id' | 'title'>;
  onAttempt?: (detail: LessonAttemptDetail) => void;
  onClearProgress?: () => void;
  onComplete?: () => LessonCompletionAward;
  onCorrectAnswer?: (questionId: string) => number;
  onProgressChange?: (resumeState: LessonResumeState) => void;
  onStudyTime?: (millisecondsSpent: number) => void;
  /** Spendable coin balance, shown in the completion totals. */
  coinBalance?: number;
  /** Total XP, shown in the completion totals. */
  totalXp?: number;
  /** Learner progress, used only to personalize optional AI tutor feedback. */
  progress?: LessonProgress | null;
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

/**
 * Builds a short, human-readable description of a question step's interactive
 * widget for the AI hint, so the coach can explain HOW to use the on-screen
 * interactive to work toward the answer. Combines a friendly, humanized widget
 * name (derived from the visual `type`) with the author-written `label`, which
 * typically already describes what to do/notice in the widget. Returns
 * `undefined` when the step has no visual, so the hint stays a plain nudge.
 */
function buildVisualHint(visual: InteractiveVisual | undefined): string | undefined {
  if (!visual) {
    return undefined;
  }

  const friendlyType = visual.type.replace(/-/g, ' ').trim();
  const label = visual.label?.trim();

  if (friendlyType && label) {
    return `a "${friendlyType}" interactive — ${label}`;
  }

  return label || friendlyType || undefined;
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
  coinBalance,
  totalXp,
  progress,
}: LessonPlayerProps) {
  // Minimalistic learning SFX: a soft cue on each answer + a short celebration
  // on completion. No-op in jsdom/SSR, so tests are unaffected.
  const { playEffect } = useSound();
  // Running totals only render when the host supplies them (LessonPage does);
  // bare unit renders omit them, keeping the player a pure presentational unit.
  const showTotals = typeof coinBalance === 'number' && typeof totalXp === 'number';
  const [stepIndex, setStepIndex] = useState(() => getInitialStepIndex(lesson, initialProgress));
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionStepState>>(
    () => initialProgress?.questionStates ?? {},
  );
  // Per-step completion for concept steps gated behind an interactive visual.
  // Mirrors the questionStates pattern so a completed interaction survives Back/
  // Next navigation and is persisted in the lesson resume state.
  const [interactionStates, setInteractionStates] = useState<Record<string, boolean>>(
    () => initialProgress?.interactionStates ?? {},
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
  // Optional AI tutor for the current question. Always called (Rules of Hooks);
  // it no-ops on concept steps and whenever AI is disabled/offline, so the static
  // explanation/hint always remains the baseline.
  const aiQuestionStep = currentStep?.type === 'multiple-choice' ? currentStep : null;
  const aiAnswerResult = currentQuestionState?.answerResult ?? null;
  const aiSelectedOptionId = currentQuestionState?.selectedOptionId ?? '';
  const aiChosenOption = aiQuestionStep?.options.find(
    (option) => option.id === aiSelectedOptionId,
  );
  const aiCorrectOption = aiQuestionStep?.options.find(
    (option) => option.id === aiQuestionStep.correctOptionId,
  );
  // Describe this question's on-screen interactive (if any) so a HINT can explain
  // how to use it. Undefined when the step has no visual, in which case the hint
  // stays a plain conceptual nudge.
  const aiVisualHint = buildVisualHint(aiQuestionStep?.visual);
  const aiTutor = useAiTutor({
    questionId: aiQuestionStep?.id ?? '',
    prompt: aiQuestionStep?.prompt ?? '',
    // All choices + the correct id let ONE prefetch cover the hint and every
    // choice's feedback, so the matching message is served instantly on submit.
    choices: aiQuestionStep?.options ?? [],
    correctChoiceId: aiQuestionStep?.correctOptionId ?? '',
    chosenChoiceId: aiAnswerResult ? aiSelectedOptionId : '',
    chosenLabel: aiChosenOption?.label ?? '',
    correctLabel: aiCorrectOption?.label ?? '',
    isCorrect: aiAnswerResult ? aiAnswerResult === 'correct' : null,
    staticHint: aiQuestionStep?.hint ?? '',
    staticCorrectExplanation: aiQuestionStep?.correctExplanation ?? '',
    staticIncorrectExplanation: aiQuestionStep?.incorrectExplanation ?? '',
    visualHint: aiVisualHint,
    progress,
  });
  // A concept step that ships an interactive visual is gated: the learner must
  // interact with the widget before the forward button enables.
  const currentStepRequiresInteraction =
    currentStep?.type === 'concept' && Boolean(currentStep.visual);
  const currentStepInteractionComplete =
    !currentStepRequiresInteraction || interactionStates[currentStep.id] === true;
  const resumeState = useMemo<LessonResumeState>(() => {
    // Keep the serialized shape identical to before unless an interaction has
    // actually been recorded (so existing snapshots/tests stay byte-for-byte).
    if (Object.keys(interactionStates).length > 0) {
      return { interactionStates, questionStates, stepIndex };
    }

    return { questionStates, stepIndex };
  }, [interactionStates, questionStates, stepIndex]);
  const progressPercent = useMemo(
    () => getPartialLessonProgressPercent(lesson, resumeState),
    [lesson, resumeState],
  );

  useEffect(() => {
    hasLoadedProgress.current = false;
    setStepIndex(getInitialStepIndex(lesson, initialProgress));
    setQuestionStates(initialProgress?.questionStates ?? {});
    setInteractionStates(initialProgress?.interactionStates ?? {});
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

  // Marks a gated concept step complete the first time its widget signals a
  // meaningful interaction. Idempotent: once true it stays true (returns the
  // same object) so repeated widget signals don't re-render or re-save.
  function markInteractionComplete(stepId: string) {
    markStudyActivity();
    setInteractionStates((currentStates) =>
      currentStates[stepId] ? currentStates : { ...currentStates, [stepId]: true },
    );
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
    // Short celebratory flourish to match the coins + XP award screen: the
    // fanfare first, then the lighter XP and coin cues layered on its tail.
    playEffect('lessonComplete');
    playEffect('xp');
    playEffect('coin');
  }

  function goToNextStep() {
    markStudyActivity();
    if (stepIndex === lesson.steps.length - 1) {
      completeLesson();
      return;
    }

    // Subtle tick when advancing a step (kept very soft via the `select` cue).
    playEffect('select');
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
    const chosenOption = step.options.find((option) => option.id === stepState.selectedOptionId);
    const correctOption = step.options.find((option) => option.id === step.correctOptionId);
    // Record the full response UNCONDITIONALLY and FIRST (before any AI logic), so
    // history always builds even with AI off/offline. Count every real submission
    // (correct or incorrect) exactly once; the retry path re-enters here.
    onAttemptRef.current?.({
      questionId: step.id,
      isCorrect,
      prompt: step.prompt,
      chosenChoiceId: stepState.selectedOptionId,
      chosenLabel: chosenOption?.label ?? '',
      correctLabel: correctOption?.label ?? '',
    });
    if (isCorrect && stepState.answerResult !== 'correct') {
      onCorrectAnswerRef.current?.(step.id);
    }

    // Gentle answer feedback cue (correct = rising two-note, incorrect = soft
    // low buzz). Fires on every real submission, including retries.
    playEffect(isCorrect ? 'correct' : 'incorrect');

    updateQuestionState(step.id, (previousState) => ({
      ...previousState,
      answerResult: isCorrect ? 'correct' : 'incorrect',
    }));
  }

  function handleRetryAnswer(step: Extract<LessonStep, { type: 'multiple-choice' }>) {
    markStudyActivity();
    // Clear the prior result AND hide any hint so retrying gives a clean slate:
    // the wrong-answer feedback (gated on answerResult) and the hint (gated on
    // showHint) both disappear. The learner can press "Show hint" again if wanted.
    updateQuestionState(step.id, (previousState) => ({
      ...previousState,
      selectedOptionId: '',
      answerResult: null,
      showHint: false,
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
        <h2>Nice work on {lesson.title}</h2>
        <p>You finished this lesson and saved your progress for the local test build.</p>
        {completionAward ? (
          <div className="xp-summary reward-summary" aria-label="Rewards earned">
            <div className="reward-earned">
              <span
                className="reward-earned-chip"
                aria-label={`+${completionAward.coinsGained} coins earned`}
              >
                <CoinIcon className="reward-earned-ico reward-ico-coin" />
                <strong>
                  +<CountUpNumber value={completionAward.coinsGained} />
                </strong>
                <span className="reward-earned-unit">coins</span>
              </span>
              <span
                className="reward-earned-chip"
                aria-label={`+${completionAward.totalXpGained} XP earned`}
              >
                <XpIcon className="reward-earned-ico reward-ico-xp" />
                <strong>
                  +<CountUpNumber value={completionAward.totalXpGained} />
                </strong>
                <span className="reward-earned-unit">XP</span>
              </span>
            </div>
            <span className="reward-line">
              {pluralize(completionAward.questionsAnswered, 'question')} answered: +
              {completionAward.lessonXp} XP &amp; +{completionAward.coinsGained} coins
            </span>
            {completionAward.dailyBonusXp > 0 ? (
              <span className="reward-line">Streak bonus: +{completionAward.dailyBonusXp} XP</span>
            ) : null}
            {completionAward.alreadyCompleted ? (
              <span className="reward-line">Already completed: no new coins or XP</span>
            ) : null}
            {showTotals ? (
              <dl className="reward-totals" aria-label="Your totals">
                <div className="reward-total">
                  <dt>
                    <CoinIcon className="reward-total-ico reward-ico-coin" /> Coin balance
                  </dt>
                  <dd>{coinBalance.toLocaleString()}</dd>
                </div>
                <div className="reward-total">
                  <dt>
                    <XpIcon className="reward-total-ico reward-ico-xp" /> Total XP
                  </dt>
                  <dd>{totalXp.toLocaleString()}</dd>
                </div>
              </dl>
            ) : null}
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
              setInteractionStates({});
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
      <div className="lesson-progress" aria-label={`${lesson.title} - lesson progress`}>
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
        <ConceptStep
          key={stepIndex}
          step={currentStep}
          onInteractionComplete={() => markInteractionComplete(currentStep.id)}
        />
      ) : (
        <QuestionStep
          key={stepIndex}
          answerResult={currentQuestionState?.answerResult ?? null}
          aiActive={aiTutor.active}
          aiResult={aiTutor.result}
          aiError={aiTutor.error}
          aiErrorDetail={aiTutor.errorDetail}
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
          {import.meta.env.DEV ? (
            <button
              className="secondary-button"
              type="button"
              onClick={completeLesson}
              title="Local testing only: instantly mark this lesson complete"
              style={{ borderStyle: 'dashed', opacity: 0.85 }}
            >
              Complete (testing)
            </button>
          ) : null}
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
                    // Ask the AI for a personalized nudge; it falls back to the
                    // static hint below whenever AI is disabled/offline/errors.
                    aiTutor.requestHint();
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
          {currentStepRequiresInteraction && !currentStepInteractionComplete ? (
            <span className="lesson-gate-hint" role="note">
              Interact with the graph to continue.
            </span>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={
              (currentStep.type === 'multiple-choice' &&
                currentQuestionState?.answerResult !== 'correct') ||
              !currentStepInteractionComplete
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
 *
 * The `demonstrate`/`onDemonstrate` pair powers the concept-slide "Show me"
 * affordance: when `onDemonstrate` is supplied a labelled button renders beneath
 * the figure and `demonstrate` is threaded into the interactive so it can animate
 * itself. Question steps never pass these, so their interactive can never be made
 * to auto-animate (which could reveal the answer).
 */
function StepLayout({
  visual,
  onInteractionComplete,
  demonstrate,
  onDemonstrate,
  children,
}: {
  visual?: InteractiveVisual;
  onInteractionComplete?: () => void;
  demonstrate?: number;
  onDemonstrate?: () => void;
  children: ReactNode;
}) {
  if (!visual) {
    return <article className="lesson-step">{children}</article>;
  }

  return (
    <article className="lesson-step lesson-step-split">
      <div className="lesson-step-visual">
        <InteractiveGraph
          visual={visual}
          onInteractionComplete={onInteractionComplete}
          demonstrate={demonstrate}
        />
        {onDemonstrate ? (
          <button type="button" className="lesson-demonstrate-button" onClick={onDemonstrate}>
            Show me
          </button>
        ) : null}
      </div>
      <div className="lesson-step-main">{children}</div>
    </article>
  );
}

function ConceptStep({
  step,
  onInteractionComplete,
}: {
  step: Extract<LessonStep, { type: 'concept' }>;
  onInteractionComplete?: () => void;
}) {
  // "Show me" counter for THIS concept slide's interactive. The whole ConceptStep
  // is keyed by step index in the player, so navigating to another step remounts
  // it and resets this counter to 0 (no demo carries across steps). Each click
  // increments it, replaying the self-demonstration.
  const [demonstrate, setDemonstrate] = useState(0);

  return (
    <StepLayout
      visual={step.visual}
      onInteractionComplete={onInteractionComplete}
      demonstrate={step.visual ? demonstrate : undefined}
      onDemonstrate={step.visual ? () => setDemonstrate((count) => count + 1) : undefined}
    >
      <h2>
        <MathText text={step.title} />
      </h2>
      <div className="math-copy">
        <MathText text={step.body} />
      </div>
      {step.visual && step.interactiveNote ? (
        <aside
          className="lesson-interactive-note"
          aria-label="How to see this in the interactive"
        >
          <span className="lesson-interactive-note-label">See it in the interactive</span>
          <span className="lesson-interactive-note-body">
            <MathText text={step.interactiveNote} />
          </span>
        </aside>
      ) : null}
    </StepLayout>
  );
}

type QuestionStepProps = {
  answerResult: AnswerResult;
  aiActive: boolean;
  aiResult: TutorResponse | null;
  aiError: boolean;
  aiErrorDetail?: string | null;
  onSelectOption: (optionId: string) => void;
  selectedOptionId: string;
  showHint: boolean;
  step: Extract<LessonStep, { type: 'multiple-choice' }>;
};

function QuestionStep({
  answerResult,
  aiActive,
  aiResult,
  aiError,
  aiErrorDetail,
  onSelectOption,
  selectedOptionId,
  showHint,
  step,
}: QuestionStepProps) {
  // The static blocks the AI prefers over but falls back to. Precomputed so the
  // same element backs both the "AI off/offline" and "AI fell back" branches.
  const staticHint = step.hint ? (
    <div className="notice" role="status">
      <MathText text={step.hint} />
    </div>
  ) : null;
  const staticAnswer = answerResult ? (
    <div
      className={answerResult === 'correct' ? 'success-message' : 'error-message'}
      role="alert"
    >
      <MathText
        text={answerResult === 'correct' ? step.correctExplanation : step.incorrectExplanation}
      />
    </div>
  ) : null;

  return (
    <StepLayout visual={step.visual}>
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
          // On a wrong answer, gray out the other choices so it is visually
          // clear the learner must hit "Try again" before continuing.
          const showAsDimmed = answerResult === 'incorrect' && !isSelected;
          const optionClassName = [
            'answer-option',
            showAsCorrect ? 'is-correct' : '',
            showAsIncorrect ? 'is-incorrect' : '',
            showAsDimmed ? 'is-dimmed' : '',
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
        {/* The hint only shows while the question is UNANSWERED: it routes
            through the AI tutor (with the static hint as fallback). Once an answer
            is submitted it is hidden entirely so only the answer feedback below
            remains; "Try again" clears answerResult AND showHint, so the hint
            does not reappear (the learner can press "Show hint" again). */}
        {showHint && staticHint && !answerResult ? (
          <AiTutorFeedback
            active={aiActive}
            result={aiResult}
            error={aiError}
            errorDetail={aiErrorDetail}
            tone="hint"
            fallback={staticHint}
          />
        ) : null}

        {answerResult ? (
          <AiTutorFeedback
            active={aiActive}
            result={aiResult}
            error={aiError}
            errorDetail={aiErrorDetail}
            tone={answerResult === 'correct' ? 'correct' : 'incorrect'}
            fallback={staticAnswer}
          />
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
 * decorative: the "Lesson complete" text carries the meaning.
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
