import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSound } from '../audio/SoundProvider';
import { useAuth } from '../auth/AuthContext';
import { AiSparkIcon } from '../components/AiSparkIcon';
import { MathText } from '../components/MathText';
import { lessons } from '../data/lessons';
import {
  getQuestionsForLessons,
  pickRandomQuestions,
  type PracticeQuestion,
  type RandomNumberGenerator,
} from '../data/questionBank';
import { DAILY_GATE_ENABLED, isDailyGateActive } from '../lessons/dailyGate';
import { buildLearnerProfileSummary } from '../lessons/learnerProfile';
import { buildRequiredPracticeSet, type RequiredPracticeSet } from '../lessons/practiceSelection';
import {
  challengeRewardMultiplier,
  coinsPerCorrectAnswer,
  practiceQuestionXp,
  useLessonProgress,
  type LessonProgress,
} from '../lessons/lessonProgress';
import { useAiTutor } from '../lessons/useAiTutor';
import {
  generateChallengeQuestions,
  isAiTutorEnabled,
  type ChallengeQuestion,
  type ChallengeQuestionsResponse,
  type ChallengeSessionQuestion,
  type TutorResponse,
} from '../lib/ai';
import { AiTutorFeedback } from '../components/AiTutorMessage';
import { WorkReviewHint, type WorkReviewTextHint } from '../components/WorkReviewHint';
import { pluralize } from '../lib/pluralize';

type AnswerResult = 'correct' | 'incorrect' | null;

/* Post-session AI challenge phase: 'inactive' (default/skipped), 'loading', 'active'. */
type ChallengePhase = 'inactive' | 'loading' | 'active';

/* Minimal question shape both bank and AI questions satisfy, so one card renders both. */
type QuestionCardQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
  explanation: string;
};

function createPracticeSession(
  sourceQuestions: readonly PracticeQuestion[],
  sessionSize: number,
  rng: RandomNumberGenerator,
) {
  return pickRandomQuestions(sourceQuestions, sessionSize, rng);
}

/** True unless the browser explicitly reports it is offline (mirrors ai.ts). */
function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/* Timeout for the fast first challenge question (count=1) before static fallback, so it's never blocked on the model. */
const CHALLENGE_FAST_TIMEOUT_MS = 6000;

/* The DAILY-REQUIRED gate passes at >= 85% accuracy over the static + AI set. */
const GATE_PASS_RATIO = 0.85;
const GATE_PASS_PERCENT = 85;

/** Adapts a real bank question into the challenge-question shape the round renders. */
function mapBankQuestionToChallenge(question: PracticeQuestion): ChallengeQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    correctChoiceId: question.correctChoiceId,
    explanation: question.explanation,
    targetConcept: question.category,
  };
}

/**
 * Ordered pool of bank questions usable as static challenge fillers: those unused in this
 * session's bank round, weak topics first. Consumed from the front so no filler repeats.
 */
function buildStaticFillerPool(
  pool: readonly PracticeQuestion[],
  usedBankIds: ReadonlySet<string>,
  weakCategories: ReadonlySet<string>,
): PracticeQuestion[] {
  const unused = pool.filter((question) => !usedBankIds.has(question.id));
  const weakFirst = unused.filter((question) => weakCategories.has(question.category));
  const rest = unused.filter((question) => !weakCategories.has(question.category));
  return [...weakFirst, ...rest];
}

/** Reassigns stable slot-position ids (AI and bank ids share no namespace, so both can collide). */
function withChallengeSlotIds(questions: ChallengeQuestion[]): ChallengeQuestion[] {
  return questions.map((question, index) => ({ ...question, id: `challenge-${index + 1}` }));
}

/*
 * FAIL-SAFE wrapper around buildRequiredPracticeSet. The curated build runs during
 * render, and the app has no error boundary, so a thrown error here would blank the
 * gate page — stranding the learner on a dead /practice that every other route
 * redirects to. On ANY failure we fall back to a plain random session from the same
 * pool: still completable, and a >= 85% pass still records the daily pass and clears
 * the gate (just without the weak/SR curation or an AI round).
 */
function buildGateSetSafely(
  progress: LessonProgress,
  pool: readonly PracticeQuestion[],
  options: { today: string; rng: RandomNumberGenerator; sessionSize: number },
): RequiredPracticeSet {
  try {
    return buildRequiredPracticeSet(progress, pool, { today: options.today, rng: options.rng });
  } catch {
    return {
      questions: createPracticeSession(pool, options.sessionSize, options.rng),
      srTopicsServed: [],
      coverageTopics: [],
      recommendedAiCount: 0,
    };
  }
}

type PracticePageProps = {
  rng?: RandomNumberGenerator;
  sessionSize?: number;
  /** How many AI challenge questions to request after the bank set (default 5). */
  challengeCount?: number;
};

/* Unified practice: opens straight into a fresh mixed session from completed lessons;
   locked when none complete, empty when they have no questions. */
export function PracticePage({
  rng = Math.random,
  sessionSize = 20,
  challengeCount = 5,
}: PracticePageProps) {
  const { user } = useAuth();
  // Answer feedback cue (mirrors the lesson player); no-op in jsdom.
  const { playEffect } = useSound();
  const {
    addPracticeStudyTime,
    awardChallengeQuestion,
    awardPracticeQuestion,
    completedLessonIds,
    markRequiredPracticePassed,
    progress,
    recordResponse,
    testTodayKey,
  } = useLessonProgress(lessons, user?.uid);

  /* completedLessonIds is a new array each write; derive a stable string key so a mid-session answer can't reset the pool. */
  const completedLessonKey = useMemo(() => {
    const completedIds = new Set(completedLessonIds);
    return lessons
      .filter((lesson) => completedIds.has(lesson.id))
      .map((lesson) => lesson.id)
      .join('|');
  }, [completedLessonIds]);

  const completedLessons = useMemo(() => {
    const completedIds = new Set(completedLessonKey ? completedLessonKey.split('|') : []);
    return lessons.filter((lesson) => completedIds.has(lesson.id));
  }, [completedLessonKey]);

  // The unified pool: questions across every completed lesson.
  const eligibleQuestions = useMemo(
    () => getQuestionsForLessons(completedLessons.map((lesson) => lesson.id)),
    [completedLessons],
  );

  /* DAILY-REQUIRED gate: frozen for the session (a pass would otherwise flip it
   * mid-summary). When active, the static set is the REQUIRED set (weak + SR +
   * coverage), not a random sample. */
  const initialGateBuildRef = useRef<RequiredPracticeSet | null>(null);
  /* Gate mode only engages when the feature is ENABLED. With DAILY_GATE_ENABLED off
   * this is always false, so /practice is plain FREE practice (no required set). */
  const [gateMode] = useState(
    () =>
      DAILY_GATE_ENABLED && isDailyGateActive(progress, testTodayKey) && eligibleQuestions.length > 0,
  );
  if (gateMode && initialGateBuildRef.current === null) {
    initialGateBuildRef.current = buildGateSetSafely(progress, eligibleQuestions, {
      today: testTodayKey,
      rng,
      sessionSize,
    });
  }

  const [sessionQuestions, setSessionQuestions] = useState<PracticeQuestion[]>(() =>
    initialGateBuildRef.current
      ? initialGateBuildRef.current.questions
      : createPracticeSession(eligibleQuestions, sessionSize, rng),
  );
  /* Gate-only: the SR topics the static set served (advance them on a pass) and
   * the AI question count to request (round(staticCount / 4)). */
  const [srTopicsServed, setSrTopicsServed] = useState<string[]>(
    () => initialGateBuildRef.current?.srTopicsServed ?? [],
  );
  const [recommendedAiCount, setRecommendedAiCount] = useState<number>(
    () => initialGateBuildRef.current?.recommendedAiCount ?? 0,
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [isSessionComplete, setIsSessionComplete] = useState(false);

  /* Challenge round (AI-generated bonus questions, post-session). */
  // Bank answers fed to the AI to target weak concepts.
  const [sessionResponses, setSessionResponses] = useState<ChallengeSessionQuestion[]>([]);
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('inactive');
  const [challengeQuestions, setChallengeQuestions] = useState<ChallengeQuestion[]>([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeCorrectCount, setChallengeCorrectCount] = useState(0);
  const [challengeIncorrectCount, setChallengeIncorrectCount] = useState(0);
  /* Slots the active round commits to; only reduced if the AI fails AND the static bank runs out. */
  const [challengeTargetCount, setChallengeTargetCount] = useState(0);
  /* Background batch (slots 2..N) still resolving → an unfilled slot shows a loader, not round end. */
  const [challengeRestPending, setChallengeRestPending] = useState(false);
  /* Round genuinely couldn't run (AI failed AND no unused bank questions); summary shows "unavailable". */
  const [challengeUnavailable, setChallengeUnavailable] = useState(false);

  const sessionInputRef = useRef({ eligibleQuestions, rng, sessionSize });
  const studyStartedAtRef = useRef(Date.now());
  const hasStudyActivityRef = useRef(false);
  const addPracticeStudyTimeRef = useRef(addPracticeStudyTime);
  // Refs for the prefetch's async closures (reads add no deps).
  const sessionResponsesRef = useRef(sessionResponses);
  sessionResponsesRef.current = sessionResponses;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  /* Prefetch state (refs, so starting it never re-renders): idempotency guard + the in-flight/settled batch promise. */
  const challengePrefetchedRef = useRef(false);
  const challengeBatchRef = useRef<Promise<ChallengeQuestionsResponse | null> | null>(null);
  const challengeBatchSettledRef = useRef(false);
  const challengeBatchResultRef = useRef<ChallengeQuestionsResponse | null>(null);
  /* Gate: ensures the pass/fail outcome (and the SR advance) is applied exactly
   * once per completed set; reset on "Try again". */
  const gateOutcomeHandledRef = useRef(false);
  const markRequiredPracticePassedRef = useRef(markRequiredPracticePassed);
  markRequiredPracticePassedRef.current = markRequiredPracticePassed;
  const srTopicsServedRef = useRef(srTopicsServed);
  srTopicsServedRef.current = srTopicsServed;
  const currentQuestion = sessionQuestions[questionIndex];
  const answeredCount = correctCount + incorrectCount;

  const currentChallengeQuestion = challengeQuestions[challengeIndex];
  const challengeAnsweredCount = challengeCorrectCount + challengeIncorrectCount;

  /* Whole-session totals: bank + challenge answered. Skipped round → challenge counts 0, so totals fall back to bank only. */
  const totalAnswered = answeredCount + challengeAnsweredCount;
  const totalCorrect = correctCount + challengeCorrectCount;
  const totalIncorrect = incorrectCount + challengeIncorrectCount;
  const overallPercentCorrect =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  /* Session rewards incl. challenge double awards — mirrors awardPracticeQuestion/awardChallengeQuestion. */
  const sessionXpEarned =
    correctCount * practiceQuestionXp +
    challengeCorrectCount * practiceQuestionXp * challengeRewardMultiplier;
  const sessionCoinsEarned =
    correctCount * coinsPerCorrectAnswer +
    challengeCorrectCount * coinsPerCorrectAnswer * challengeRewardMultiplier;

  /* AI question count: free practice uses the prop; the gate uses round(static/4). */
  const effectiveChallengeCount = gateMode ? recommendedAiCount : challengeCount;

  /* Whether to even attempt a round: AI enabled + online + signed in + count>0 (can still fail gracefully). */
  const willAttemptChallenge =
    effectiveChallengeCount > 0 && isAiTutorEnabled() && isOnline() && Boolean(user);

  /* One continuous counter (bank then challenge): bank round shows the planned size for a stable "of 25"; active round uses the committed target. */
  const bankCount = sessionQuestions.length;
  // Bank questions not drawn this session — the static backfill for challenge slots.
  // The gate never backfills with random bank questions (its AI round is AI-only),
  // so its non-AI fallback is "static-only" (no extra fillers).
  const unusedBankCount = gateMode ? 0 : Math.max(0, eligibleQuestions.length - bankCount);
  /* Planned challenge slots during the bank round: full count with AI, else capped by unused bank questions. */
  const plannedChallengeCount =
    effectiveChallengeCount <= 0
      ? 0
      : willAttemptChallenge
        ? effectiveChallengeCount
        : Math.min(effectiveChallengeCount, unusedBankCount);
  /* Whether a round runs at all (AI or unused bank can fill it); drives the final button + finishBankQuestions. */
  const willRunChallenge = plannedChallengeCount > 0;
  /* Gate pass/fail computed live from the running tally (static + AI), so the
   * summary never flashes the wrong verdict before the outcome effect runs. */
  const gatePassed = totalAnswered > 0 && totalCorrect / totalAnswered >= GATE_PASS_RATIO;
  const sessionTotalQuestions =
    challengePhase === 'active'
      ? bankCount + challengeTargetCount
      : bankCount + plannedChallengeCount;

  /* Rebuild only when the pool/rng/size changes; the pool is stable while answering, so never mid-run.
     The gate manages its own (re)build (initial + "Try again"), so skip this there. */
  useEffect(() => {
    if (gateMode) {
      return;
    }

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
    resetChallengeState();
  }, [eligibleQuestions, rng, sessionSize, gateMode]);

  useEffect(() => {
    addPracticeStudyTimeRef.current = addPracticeStudyTime;
  });

  // Record elapsed study time once, on unmount (timing runs from mount).
  useEffect(
    () => () => {
      if (!hasStudyActivityRef.current) {
        return;
      }

      addPracticeStudyTimeRef.current(Date.now() - studyStartedAtRef.current);
    },
    [],
  );

  /* Advanced onto an unfillable slot (AI failed AND bank empty) → end the round, don't hang on a loader. */
  useEffect(() => {
    if (
      challengePhase === 'active' &&
      !challengeRestPending &&
      challengeQuestions.length > 0 &&
      challengeIndex >= challengeQuestions.length
    ) {
      setChallengePhase('inactive');
      setIsSessionComplete(true);
    }
  }, [challengePhase, challengeRestPending, challengeIndex, challengeQuestions.length]);

  /* On reaching the last bank question, prefetch the full batch from the first N-1 responses so generation overlaps solving. Fires once; no-op with AI off or < 2 bank questions. */
  useEffect(() => {
    if (
      !willAttemptChallenge ||
      challengePhase !== 'inactive' ||
      isSessionComplete ||
      bankCount < 2 ||
      questionIndex !== bankCount - 1 ||
      challengePrefetchedRef.current
    ) {
      return;
    }
    const priorResponses = sessionResponsesRef.current;
    if (priorResponses.length === 0) {
      return;
    }
    challengePrefetchedRef.current = true;
    const promise = generateChallengeQuestions({
      sessionQuestions: priorResponses,
      profileSummary: buildLearnerProfileSummary(progressRef.current),
      count: effectiveChallengeCount,
    });
    challengeBatchRef.current = promise;
    void promise.then((result) => {
      challengeBatchResultRef.current = result;
      challengeBatchSettledRef.current = true;
    });
  }, [
    willAttemptChallenge,
    challengePhase,
    isSessionComplete,
    bankCount,
    questionIndex,
    effectiveChallengeCount,
  ]);

  /* Gate outcome: once the required set completes, apply the verdict exactly once.
     On a pass, record the pass date + advance the served SR topics (unlocks the
     rest of the app). A fail leaves SR untouched so those topics stay due. */
  useEffect(() => {
    if (!gateMode || !isSessionComplete || gateOutcomeHandledRef.current) {
      return;
    }
    gateOutcomeHandledRef.current = true;
    if (gatePassed) {
      markRequiredPracticePassedRef.current({
        date: testTodayKey,
        srTopicsServed: srTopicsServedRef.current,
      });
    }
  }, [gateMode, isSessionComplete, gatePassed, testTodayKey]);

  /* AI tutor for the current question. Called before any early return (Rules of Hooks); no-ops when AI off/offline (static fallback). */
  const selectedChoice = currentQuestion?.choices.find((choice) => choice.id === selectedChoiceId);
  const correctChoice = currentQuestion?.choices.find(
    (choice) => choice.id === currentQuestion.correctChoiceId,
  );
  const aiTutor = useAiTutor({
    questionId: currentQuestion?.id ?? '',
    prompt: currentQuestion?.prompt ?? '',
    // All choices + correct id let one prefetch cover every choice's feedback.
    choices: currentQuestion?.choices ?? [],
    correctChoiceId: currentQuestion?.correctChoiceId ?? '',
    chosenChoiceId: answerResult ? selectedChoiceId : '',
    chosenLabel: selectedChoice?.label ?? '',
    correctLabel: correctChoice?.label ?? '',
    isCorrect: answerResult ? answerResult === 'correct' : null,
    staticCorrectExplanation: currentQuestion?.explanation ?? '',
    staticIncorrectExplanation: currentQuestion?.explanation ?? '',
    progress,
  });

  /* Context for the practice-only "review my work" vision hint. The prefetched
   * text hint (above) is reused as the no-work-attached fallback for bank cards. */
  const learnerProfileSummary = buildLearnerProfileSummary(progress);
  const bankTextHint: WorkReviewTextHint = {
    active: aiTutor.active,
    result: aiTutor.result,
    error: aiTutor.error,
    errorDetail: aiTutor.errorDetail,
    onRequest: aiTutor.requestHint,
  };

  function resetAnswerState() {
    setSelectedChoiceId('');
    setAnswerResult(null);
  }

  function resetChallengeState() {
    setSessionResponses([]);
    setChallengePhase('inactive');
    setChallengeQuestions([]);
    setChallengeIndex(0);
    setChallengeCorrectCount(0);
    setChallengeIncorrectCount(0);
    setChallengeTargetCount(0);
    setChallengeRestPending(false);
    setChallengeUnavailable(false);
    // Clear the background prefetch so the next session generates fresh.
    challengePrefetchedRef.current = false;
    challengeBatchRef.current = null;
    challengeBatchSettledRef.current = false;
    challengeBatchResultRef.current = null;
  }

  function handleSubmitAnswer() {
    if (!selectedChoiceId || !currentQuestion || answerResult) {
      return;
    }

    const isCorrect = selectedChoiceId === currentQuestion.correctChoiceId;
    const chosenChoice = currentQuestion.choices.find((choice) => choice.id === selectedChoiceId);
    const correctAnswerChoice = currentQuestion.choices.find(
      (choice) => choice.id === currentQuestion.correctChoiceId,
    );

    // Count practice toward XP, streak, and attempt-based analytics.
    hasStudyActivityRef.current = true;
    awardPracticeQuestion(isCorrect);
    // Record the full response before any AI logic, so history builds with AI off/offline.
    recordResponse({
      source: 'practice',
      questionId: currentQuestion.id,
      isCorrect,
      chapterId: currentQuestion.chapterId,
      category: currentQuestion.category,
      prompt: currentQuestion.prompt,
      chosenChoiceId: selectedChoiceId,
      chosenLabel: chosenChoice?.label ?? '',
      correctLabel: correctAnswerChoice?.label ?? '',
    });

    // Snapshot this answer to seed the post-session challenge generation.
    setSessionResponses((current) => [
      ...current,
      {
        prompt: currentQuestion.prompt,
        choices: currentQuestion.choices.map((choice) => ({ id: choice.id, label: choice.label })),
        correctChoiceId: currentQuestion.correctChoiceId,
        userChoiceId: selectedChoiceId,
        isCorrect,
        category: currentQuestion.category,
      },
    ]);

    playEffect(isCorrect ? 'correct' : 'incorrect');

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

    finishBankQuestions();
  }

  /* After the last bank question: run the round if fillable, else go to the summary. Never blocks. */
  function finishBankQuestions() {
    if (willRunChallenge && sessionResponses.length > 0) {
      void startChallengeRound();
      return;
    }

    setIsSessionComplete(true);
  }

  // Flips the round into its active state with whatever slots are ready so far.
  function activateChallenge(
    questions: ChallengeQuestion[],
    targetCount: number,
    restPending: boolean,
  ) {
    setChallengeQuestions(questions);
    setChallengeTargetCount(targetCount);
    setChallengeIndex(0);
    setChallengeCorrectCount(0);
    setChallengeIncorrectCount(0);
    resetAnswerState();
    setChallengeRestPending(restPending);
    setChallengePhase('active');
  }

  /* Challenge sourcing (reliably full + fast):
       • Q1 fast: count=1 AI call with a short timeout, static fallback.
       • Slots 2..N: background batch deduped against Q1, bank questions backfill gaps, loader bridges the wait.
       • AI off: whole round from static bank questions.
     Fillers prefer weak topics, never repeat the bank round, earn the same double rewards.
     Only shrinks/"unavailable" when unused bank is empty AND AI can't help. */
  async function startChallengeRound() {
    setChallengeUnavailable(false);
    setChallengePhase('loading');

    /* GATE: the required-set AI round is AI-ONLY (never padded with random bank
       fillers — the static set is the curated required set). On ANY AI failure the
       gate degrades to the static-only set, which is still passable (decision 1). */
    if (gateMode) {
      if (!willAttemptChallenge) {
        setChallengePhase('inactive');
        setIsSessionComplete(true);
        return;
      }
      const gateBatchPromise =
        challengeBatchRef.current ??
        generateChallengeQuestions({
          sessionQuestions: sessionResponses,
          profileSummary: buildLearnerProfileSummary(progress),
          count: effectiveChallengeCount,
        });
      challengeBatchRef.current = null;
      const gateBatch = await gateBatchPromise;
      const gateQuestions = gateBatch?.questions ?? [];
      if (gateQuestions.length === 0) {
        setChallengePhase('inactive');
        setIsSessionComplete(true);
        return;
      }
      activateChallenge(withChallengeSlotIds(gateQuestions), gateQuestions.length, false);
      return;
    }

    const profileSummary = buildLearnerProfileSummary(progress);
    const usedBankIds = new Set(sessionQuestions.map((question) => question.id));
    const weakCategories = new Set(
      sessionResponses
        .filter((response) => !response.isCorrect)
        .map((response) => response.category)
        .filter((category): category is string => Boolean(category)),
    );
    const fillerPool = buildStaticFillerPool(eligibleQuestions, usedBankIds, weakCategories);
    let fillerCursor = 0;
    const nextFiller = (): ChallengeQuestion | undefined => {
      const question = fillerPool[fillerCursor];
      if (!question) {
        return undefined;
      }
      fillerCursor += 1;
      return mapBankQuestionToChallenge(question);
    };

    /* Dedup AI questions by prompt (count=1 and count=N can overlap); fillers are unique by bank id. */
    const usedPrompts = new Set<string>();
    const remember = (question: ChallengeQuestion) => usedPrompts.add(question.prompt.trim());

    // AI unavailable: build the whole round from static bank questions.
    if (!willAttemptChallenge) {
      const target = Math.min(challengeCount, fillerPool.length);
      const questions: ChallengeQuestion[] = [];
      for (let slot = 0; slot < target; slot += 1) {
        const filler = nextFiller();
        if (!filler) {
          break;
        }
        questions.push(filler);
      }
      if (questions.length === 0) {
        setChallengeUnavailable(true);
        setChallengePhase('inactive');
        setIsSessionComplete(true);
        return;
      }
      activateChallenge(withChallengeSlotIds(questions), questions.length, false);
      return;
    }

    // AI available.
    /* Final slots: optional chosen Q1, then the AI batch (deduped), then bank fillers for any gap. */
    const assembleRound = (
      first: ChallengeQuestion | undefined,
      batchResult: ChallengeQuestionsResponse | null,
    ): ChallengeQuestion[] => {
      const resolved: ChallengeQuestion[] = [];
      if (first) {
        resolved.push(first);
        remember(first);
      }
      if (batchResult) {
        for (const question of batchResult.questions) {
          if (resolved.length >= challengeCount) {
            break;
          }
          if (usedPrompts.has(question.prompt.trim())) {
            continue;
          }
          resolved.push(question);
          remember(question);
        }
      }
      while (resolved.length < challengeCount) {
        const filler = nextFiller();
        if (!filler) {
          break;
        }
        resolved.push(filler);
        remember(filler);
      }
      return resolved;
    };

    // Prefer the prefetched full batch; if it isn't ready, start one now.
    const batchPromise =
      challengeBatchRef.current ??
      generateChallengeQuestions({ sessionQuestions: sessionResponses, profileSummary, count: challengeCount });
    const batchAlreadySettled =
      challengeBatchRef.current !== null && challengeBatchSettledRef.current;
    const settledResult = challengeBatchResultRef.current;
    challengeBatchRef.current = null;

    // Best case: the prefetch already finished → present the whole round at once.
    if (batchAlreadySettled) {
      const resolved = assembleRound(undefined, settledResult);
      if (resolved.length === 0) {
        setChallengeUnavailable(true);
        setChallengePhase('inactive');
        setIsSessionComplete(true);
        return;
      }
      activateChallenge(withChallengeSlotIds(resolved), resolved.length, false);
      return;
    }

    /* Else show a fast Q1 now (count=1, static fallback), then fill the rest from the batch (loader bridges the wait). */
    const fast = await generateChallengeQuestions(
      { sessionQuestions: sessionResponses, profileSummary, count: 1 },
      undefined,
      { timeoutMs: CHALLENGE_FAST_TIMEOUT_MS },
    );
    let slotOne = fast?.questions?.[0];
    if (!slotOne) {
      slotOne = nextFiller();
    }
    if (!slotOne) {
      // No AI question in time AND no static filler → the round can't run.
      setChallengeUnavailable(true);
      setChallengePhase('inactive');
      setIsSessionComplete(true);
      return;
    }
    remember(slotOne);
    // Commit to the full round; the rest fills from the batch + backfill.
    activateChallenge(withChallengeSlotIds([slotOne]), challengeCount, challengeCount > 1);

    if (challengeCount <= 1) {
      return;
    }

    const batch = await batchPromise;
    const resolved = assembleRound(slotOne, batch);
    setChallengeQuestions(withChallengeSlotIds(resolved));
    setChallengeTargetCount(resolved.length);
    setChallengeRestPending(false);
  }

  /* Challenge answers reward double but aren't recorded to history/topic-stats (AI has no stable bank topic); just an on-screen tally + the answer cue. */
  function handleSubmitChallengeAnswer() {
    if (!selectedChoiceId || !currentChallengeQuestion || answerResult) {
      return;
    }

    const isCorrect = selectedChoiceId === currentChallengeQuestion.correctChoiceId;
    awardChallengeQuestion(isCorrect);
    playEffect(isCorrect ? 'correct' : 'incorrect');

    setAnswerResult(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) {
      setChallengeCorrectCount((current) => current + 1);
    } else {
      setChallengeIncorrectCount((current) => current + 1);
    }
  }

  function handleNextChallengeQuestion() {
    resetAnswerState();

    if (challengeIndex < challengeTargetCount - 1) {
      setChallengeIndex((current) => current + 1);
      return;
    }

    setChallengePhase('inactive');
    setIsSessionComplete(true);
  }

  function handleStartNewSession() {
    setSessionQuestions(createPracticeSession(eligibleQuestions, sessionSize, rng));
    setQuestionIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setIsSessionComplete(false);
    resetAnswerState();
    resetChallengeState();
  }

  /* Gate "Try again": rebuild a FRESH required set from the LATEST progress (its
     topicStats now reflect this attempt; SR topics stay due since a fail doesn't
     advance them) and restart the loop. */
  function handleRetryGate() {
    const build = buildGateSetSafely(progressRef.current, eligibleQuestions, {
      today: testTodayKey,
      rng,
      sessionSize,
    });
    setSessionQuestions(build.questions);
    setSrTopicsServed(build.srTopicsServed);
    setRecommendedAiCount(build.recommendedAiCount);
    setQuestionIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setIsSessionComplete(false);
    gateOutcomeHandledRef.current = false;
    resetAnswerState();
    resetChallengeState();
  }

  // No lesson completed yet → nothing unlocked.
  if (completedLessons.length === 0) {
    return (
      <section className="practice-page">
        <div className="page-card">
          <h1>Complete a lesson to unlock practice.</h1>
          <p>
            Practice draws from a mixed pool of every lesson you have finished.
            Complete any lesson to add its questions to your practice pool.
          </p>
          <div className="button-row compact-row">
            <Link className="primary-button" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (eligibleQuestions.length === 0 || !currentQuestion) {
    return (
      <section className="practice-page">
        <div className="page-card">
          <h1>No practice questions yet.</h1>
          <p>
            The lessons you have completed do not have any practice questions
            yet. Check back soon or finish another lesson.
          </p>
          <div className="button-row compact-row">
            <Link className="secondary-button" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="practice-page">
      {isSessionComplete ? (
        gateMode ? (
          <article
            className="lesson-player completion-card practice-summary-card practice-gate-summary"
            aria-live="polite"
          >
            <h2>{gatePassed ? 'Daily practice complete' : 'Keep going — 85% needed'}</h2>
            <p>
              {gatePassed
                ? `You scored ${overallPercentCorrect}% on today's required practice. The rest of SlopeWise is unlocked for the day — nice work.`
                : `You scored ${overallPercentCorrect}%. You need at least ${GATE_PASS_PERCENT}% to continue. Try a fresh required set — it focuses on the topics you just missed.`}
            </p>

            <dl className="practice-summary-stats" aria-label="Required practice results">
              <div>
                <dt>Answered</dt>
                <dd>{totalAnswered}</dd>
              </div>
              <div>
                <dt>Correct</dt>
                <dd>{totalCorrect}</dd>
              </div>
              <div>
                <dt>Incorrect</dt>
                <dd>{totalIncorrect}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{overallPercentCorrect}%</dd>
              </div>
              <div>
                <dt>Pass mark</dt>
                <dd>{GATE_PASS_PERCENT}%</dd>
              </div>
              <div>
                <dt>XP earned</dt>
                <dd>{sessionXpEarned}</dd>
              </div>
            </dl>

            <div className="completion-actions">
              {gatePassed ? (
                <Link className="primary-button" to="/dashboard">
                  Continue to dashboard
                </Link>
              ) : (
                <button className="primary-button" type="button" onClick={handleRetryGate}>
                  Try again
                </button>
              )}
            </div>
          </article>
        ) : (
        <article className="lesson-player completion-card practice-summary-card" aria-live="polite">
          <h2>Practice summary</h2>
          <p>
            You answered {pluralize(totalAnswered, 'question')} from this mixed set with{' '}
            {overallPercentCorrect}% correct.
          </p>

          <dl className="practice-summary-stats" aria-label="Practice session results">
            <div>
              <dt>Answered</dt>
              <dd>{totalAnswered}</dd>
            </div>
            <div>
              <dt>Correct</dt>
              <dd>{totalCorrect}</dd>
            </div>
            <div>
              <dt>Incorrect</dt>
              <dd>{totalIncorrect}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{overallPercentCorrect}%</dd>
            </div>
            <div>
              <dt>XP earned</dt>
              <dd>{sessionXpEarned}</dd>
            </div>
            <div>
              <dt>Coins earned</dt>
              <dd>{sessionCoinsEarned}</dd>
            </div>
          </dl>

          {challengeAnsweredCount > 0 ? (
            <p className="practice-challenge-result">
              <span className="practice-challenge-result-badge">
                <span className="practice-challenge-badge-mark" role="img" aria-label="AI-generated">
                  <AiSparkIcon className="practice-challenge-badge-icon" />
                </span>
                Adaptive AI Challenge
              </span>{' '}
              Includes {pluralize(challengeAnsweredCount, 'bonus challenge question')} (double XP
              &amp; coins), folded into the totals above.
            </p>
          ) : challengeUnavailable ? (
            <p className="practice-challenge-unavailable">Adaptive AI Challenge unavailable this time.</p>
          ) : null}

          <div className="completion-actions">
            <button className="primary-button" type="button" onClick={handleStartNewSession}>
              Start another mixed set
            </button>
            <Link className="secondary-button" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </article>
        )
      ) : challengePhase === 'loading' ? (
        <article
          className="lesson-player practice-card practice-challenge-loading-card"
          aria-live="polite"
          aria-busy="true"
        >
          <ChallengeRoundBanner />
          <div className="lesson-step practice-challenge-loading">
            <p className="practice-challenge-loading-text">Generating your challenge questions…</p>
            <span className="ai-tutor-thinking" aria-label="Generating your challenge questions">
              <span className="ai-tutor-dot" />
              <span className="ai-tutor-dot" />
              <span className="ai-tutor-dot" />
            </span>
          </div>
        </article>
      ) : challengePhase === 'active' ? (
        currentChallengeQuestion ? (
          <PracticeQuestionCard
            variant="challenge"
            answerResult={answerResult}
            aiActive={false}
            aiResult={null}
            aiError={false}
            currentQuestion={currentChallengeQuestion}
            onNextQuestion={handleNextChallengeQuestion}
            onSelectChoice={setSelectedChoiceId}
            onSubmitAnswer={handleSubmitChallengeAnswer}
            selectedChoiceId={selectedChoiceId}
            sessionLength={challengeTargetCount}
            questionIndex={challengeIndex}
            progressCurrent={bankCount + challengeIndex + 1}
            progressTotal={sessionTotalQuestions}
            nextLabel="Next challenge question"
            finishLabel="View summary"
            profileSummary={learnerProfileSummary}
          />
        ) : challengeRestPending ? (
          // Next slot still streaming in — show a brief per-question loader.
          <article
            className="lesson-player practice-card practice-challenge-loading-card"
            aria-live="polite"
            aria-busy="true"
          >
            <ChallengeRoundBanner />
            <div className="lesson-progress" aria-label="Practice progress">
              <span>
                Question {bankCount + challengeIndex + 1} of {sessionTotalQuestions}
              </span>
              <div className="progress-track" aria-hidden="true">
                <div
                  className="progress-fill"
                  style={{
                    width: `${((bankCount + challengeIndex + 1) / sessionTotalQuestions) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="lesson-step practice-challenge-loading">
              <p className="practice-challenge-loading-text">Generating the next question…</p>
              <span className="ai-tutor-thinking" aria-label="Generating the next question">
                <span className="ai-tutor-dot" />
                <span className="ai-tutor-dot" />
                <span className="ai-tutor-dot" />
              </span>
            </div>
          </article>
        ) : null
      ) : (
        <PracticeQuestionCard
          answerResult={answerResult}
          aiActive={aiTutor.active}
          aiResult={aiTutor.result}
          aiError={aiTutor.error}
          aiErrorDetail={aiTutor.errorDetail}
          currentQuestion={currentQuestion}
          onNextQuestion={handleNextQuestion}
          onSelectChoice={setSelectedChoiceId}
          onSubmitAnswer={handleSubmitAnswer}
          selectedChoiceId={selectedChoiceId}
          sessionLength={sessionQuestions.length}
          questionIndex={questionIndex}
          progressCurrent={questionIndex + 1}
          progressTotal={sessionTotalQuestions}
          finishLabel={willRunChallenge ? 'Continue' : 'View summary'}
          profileSummary={learnerProfileSummary}
          textHint={bankTextHint}
        />
      )}
    </section>
  );
}

/* "Challenge round" badge + note; the sparkle carries the accessible "AI-generated" name. */
function ChallengeRoundBanner() {
  return (
    <div className="practice-challenge-banner">
      <span className="practice-challenge-badge">
        <span className="practice-challenge-badge-mark" role="img" aria-label="AI-generated">
          <AiSparkIcon className="practice-challenge-badge-icon" />
        </span>
        Adaptive AI Challenge
      </span>
      <p className="practice-challenge-note">
        AI-generated bonus questions adapted to what you just practiced — each correct answer earns
        double XP and coins.
      </p>
    </div>
  );
}

type PracticeQuestionCardProps = {
  answerResult: AnswerResult;
  aiActive: boolean;
  aiResult: TutorResponse | null;
  aiError: boolean;
  aiErrorDetail?: string | null;
  currentQuestion: QuestionCardQuestion;
  onNextQuestion: () => void;
  onSelectChoice: (choiceId: string) => void;
  onSubmitAnswer: () => void;
  selectedChoiceId: string;
  sessionLength: number;
  questionIndex: number;
  /** 1-based position of this question in the CONTINUOUS whole-session counter. */
  progressCurrent: number;
  /** Total questions in the whole session (bank + challenge): 25 in the happy path. */
  progressTotal: number;
  /** 'bank' (default) is a scored pool question; 'challenge' is an AI bonus one. */
  variant?: 'bank' | 'challenge';
  /** Label for the "advance" button on non-final questions. */
  nextLabel?: string;
  /** Label for the "advance" button on the final question. */
  finishLabel?: string;
  /** Compact learner-history summary for the practice-only "review my work" hint. */
  profileSummary?: string;
  /** Prefetched text hint reused when no work image is attached (bank questions). */
  textHint?: WorkReviewTextHint;
};

function PracticeQuestionCard({
  answerResult,
  aiActive,
  aiResult,
  aiError,
  aiErrorDetail,
  currentQuestion,
  onNextQuestion,
  onSelectChoice,
  onSubmitAnswer,
  selectedChoiceId,
  sessionLength,
  questionIndex,
  progressCurrent,
  progressTotal,
  variant = 'bank',
  nextLabel = 'Next random question',
  finishLabel = 'View summary',
  profileSummary,
  textHint,
}: PracticeQuestionCardProps) {
  const selectedChoice = currentQuestion.choices.find((choice) => choice.id === selectedChoiceId);
  const correctChoice = currentQuestion.choices.find(
    (choice) => choice.id === currentQuestion.correctChoiceId,
  );
  const isLastQuestion = questionIndex === sessionLength - 1;
  const isChallenge = variant === 'challenge';

  /* Shared static feedback: rendered directly for challenge; bank routes it through the AI coach as fallback. */
  const staticFeedback = (
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
  );

  return (
    <article className="lesson-player practice-card">
      {isChallenge ? <ChallengeRoundBanner /> : null}

      <div className="lesson-progress" aria-label="Practice progress">
        <span>
          Question {progressCurrent} of {progressTotal}
        </span>
        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ width: `${(progressCurrent / progressTotal) * 100}%` }}
          />
        </div>
      </div>

      <div className="lesson-step">
        <h2>
          <MathText text={currentQuestion.prompt} />
        </h2>

        <div className="answer-options" role="radiogroup" aria-label={currentQuestion.prompt}>
          {currentQuestion.choices.map((choice) => {
            /* Once answered: correct choice green, wrong pick red (global is-correct/is-incorrect styles). */
            const showAsCorrect =
              Boolean(answerResult) && choice.id === currentQuestion.correctChoiceId;
            const showAsIncorrect = answerResult === 'incorrect' && choice.id === selectedChoiceId;
            const optionClassName = [
              'answer-option',
              showAsCorrect ? 'is-correct' : '',
              showAsIncorrect ? 'is-incorrect' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <label className={optionClassName} key={choice.id}>
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
            );
          })}
        </div>

        <div className="button-row compact-row">
          {answerResult ? (
            <button className="primary-button" type="button" onClick={onNextQuestion}>
              {isLastQuestion ? finishLabel : nextLabel}
            </button>
          ) : (
            <>
              <button
                className="primary-button"
                type="button"
                disabled={!selectedChoiceId}
                onClick={onSubmitAnswer}
              >
                Submit
              </button>
              {/* PRACTICE-ONLY: the "review my work" AI hint sits beside Submit and
                  opens in a pop-up. Never used by the lesson player. */}
              <WorkReviewHint
                prompt={currentQuestion.prompt}
                choices={currentQuestion.choices}
                correctChoiceId={currentQuestion.correctChoiceId}
                profileSummary={profileSummary}
                textHint={textHint}
              />
            </>
          )}
        </div>


        {answerResult ? (
          isChallenge ? (
            staticFeedback
          ) : (
            <AiTutorFeedback
              active={aiActive}
              result={aiResult}
              error={aiError}
              errorDetail={aiErrorDetail}
              tone={answerResult === 'correct' ? 'correct' : 'incorrect'}
              fallback={staticFeedback}
            />
          )
        ) : null}
      </div>
    </article>
  );
}
