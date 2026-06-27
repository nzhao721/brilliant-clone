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
import { buildLearnerProfileSummary } from '../lessons/learnerProfile';
import {
  challengeRewardMultiplier,
  coinsPerCorrectAnswer,
  practiceQuestionXp,
  useLessonProgress,
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
import { pluralize } from '../lib/pluralize';

type AnswerResult = 'correct' | 'incorrect' | null;

// Phase of the optional post-session AI challenge round: 'inactive' (default/
// skipped), 'loading' (calling the AI), 'active' (presenting the questions).
type ChallengePhase = 'inactive' | 'loading' | 'active';

// The minimal question shape the card needs; both a bank PracticeQuestion and an
// AI ChallengeQuestion satisfy it, so the same card renders both.
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

// Timeout for the fast first-challenge-question call (count=1) before falling back
// to a static bank question, so question 21 is never blocked on the model.
const CHALLENGE_FAST_TIMEOUT_MS = 6000;

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
 * Ordered pool of bank questions usable as static challenge fillers: those not used
 * in this session's bank round, weak topics first. Consumed from the front so a
 * filler never repeats a used question or another filler.
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

/** Reassigns stable, collision-free ids to the challenge slots (slot position is the
 * only safe key — AI and bank ids share no namespace and can both be "challenge-1"). */
function withChallengeSlotIds(questions: ChallengeQuestion[]): ChallengeQuestion[] {
  return questions.map((question, index) => ({ ...question, id: `challenge-${index + 1}` }));
}

type PracticePageProps = {
  rng?: RandomNumberGenerator;
  sessionSize?: number;
  /** How many AI challenge questions to request after the bank set (default 5). */
  challengeCount?: number;
};

// Unified practice at /practice: no picker or intro screen — opening the page drops
// the learner into a fresh mixed session drawn from every completed lesson's
// questions. A locked state covers "no lesson complete"; an empty state covers
// completed lessons with no questions.
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
    progress,
    recordResponse,
  } = useLessonProgress(lessons, user?.uid);

  // completedLessonIds is a fresh array on every progress write (including answering),
  // so derive a stable string KEY and hang the pool off that — a mid-session answer
  // never changes the pool identity and resets the run.
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

  const [sessionQuestions, setSessionQuestions] = useState<PracticeQuestion[]>(() =>
    createPracticeSession(eligibleQuestions, sessionSize, rng),
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [isSessionComplete, setIsSessionComplete] = useState(false);

  // --- Challenge round (AI-generated bonus questions, post-session) ----------
  // Snapshot of the learner's bank answers, fed to the AI so it can target weak concepts.
  const [sessionResponses, setSessionResponses] = useState<ChallengeSessionQuestion[]>([]);
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('inactive');
  const [challengeQuestions, setChallengeQuestions] = useState<ChallengeQuestion[]>([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeCorrectCount, setChallengeCorrectCount] = useState(0);
  const [challengeIncorrectCount, setChallengeIncorrectCount] = useState(0);
  // Slots the active round commits to (the challenge part of the "of N" total); only
  // reduced if the AI fails AND the static bank is exhausted before all slots fill.
  const [challengeTargetCount, setChallengeTargetCount] = useState(0);
  // True while the background batch (slots 2..N) is still resolving, so an unfilled
  // slot shows a brief per-question loader instead of ending the round.
  const [challengeRestPending, setChallengeRestPending] = useState(false);
  // True only when a round genuinely couldn't run (AI failed AND no unused bank
  // questions), so the summary can show an "unavailable" note.
  const [challengeUnavailable, setChallengeUnavailable] = useState(false);

  const sessionInputRef = useRef({ eligibleQuestions, rng, sessionSize });
  const studyStartedAtRef = useRef(Date.now());
  const hasStudyActivityRef = useRef(false);
  const addPracticeStudyTimeRef = useRef(addPracticeStudyTime);
  // Latest values for the background prefetch's async closures (refs so reads add no deps).
  const sessionResponsesRef = useRef(sessionResponses);
  sessionResponsesRef.current = sessionResponses;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  // Prefetch state (refs so kicking it off never re-renders): an idempotency guard
  // plus the in-flight/settled full-batch promise, started when the learner reaches
  // the last bank question so the round can use it instantly.
  const challengePrefetchedRef = useRef(false);
  const challengeBatchRef = useRef<Promise<ChallengeQuestionsResponse | null> | null>(null);
  const challengeBatchSettledRef = useRef(false);
  const challengeBatchResultRef = useRef<ChallengeQuestionsResponse | null>(null);
  const currentQuestion = sessionQuestions[questionIndex];
  const answeredCount = correctCount + incorrectCount;

  const currentChallengeQuestion = challengeQuestions[challengeIndex];
  const challengeAnsweredCount = challengeCorrectCount + challengeIncorrectCount;

  // The summary reflects the whole session: scored bank questions plus the challenge
  // questions actually answered. When the round is skipped the challenge counts are 0,
  // so every total falls back to just the bank questions (no "of 25", no NaN).
  const totalAnswered = answeredCount + challengeAnsweredCount;
  const totalCorrect = correctCount + challengeCorrectCount;
  const totalIncorrect = incorrectCount + challengeIncorrectCount;
  const overallPercentCorrect =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  // Session rewards, folding in the challenge round's double awards — mirrors what
  // awardPracticeQuestion / awardChallengeQuestion credit.
  const sessionXpEarned =
    correctCount * practiceQuestionXp +
    challengeCorrectCount * practiceQuestionXp * challengeRewardMultiplier;
  const sessionCoinsEarned =
    correctCount * coinsPerCorrectAnswer +
    challengeCorrectCount * coinsPerCorrectAnswer * challengeRewardMultiplier;

  // Whether a challenge round is even attempted: AI enabled + online + signed in +
  // at least one requested. The call can still fail/return nothing (skipped gracefully).
  const willAttemptChallenge =
    challengeCount > 0 && isAiTutorEnabled() && isOnline() && Boolean(user);

  // One continuous question counter across the whole session (bank round then
  // challenge round). During the bank round we show the planned challenge size for a
  // stable "of 25"; once active we use the committed target.
  const bankCount = sessionQuestions.length;
  // Bank questions not drawn this session — the static backfill for challenge slots.
  const unusedBankCount = Math.max(0, eligibleQuestions.length - bankCount);
  // Challenge slots the session is headed for during the bank round: the full round
  // with AI (static backfills any gap), else bounded by the unused bank pool.
  const plannedChallengeCount =
    challengeCount <= 0
      ? 0
      : willAttemptChallenge
        ? challengeCount
        : Math.min(challengeCount, unusedBankCount);
  // Whether a round runs at all (AI can fill it, or unused bank questions can).
  // Drives the bank round's final button and finishBankQuestions.
  const willRunChallenge = plannedChallengeCount > 0;
  const sessionTotalQuestions =
    challengePhase === 'active'
      ? bankCount + challengeTargetCount
      : bankCount + plannedChallengeCount;

  // Rebuild the session only when the pool (or rng/size) changes; the pool is
  // referentially stable while answering, so this never fires mid-run.
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
    resetChallengeState();
  }, [eligibleQuestions, rng, sessionSize]);

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

  // If the learner advanced onto a slot the background fill can't provide (AI failed
  // AND the bank ran out mid-round), end the round instead of leaving a stuck loader.
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

  // When the learner reaches the last bank question, kick off the full challenge
  // batch in the background from the first N-1 responses (the last question's answer
  // isn't in yet), so generation overlaps with solving it. Fires once per session;
  // a no-op when AI is off and for very short sessions (< 2 bank questions).
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
      count: challengeCount,
    });
    challengeBatchRef.current = promise;
    void promise.then((result) => {
      challengeBatchResultRef.current = result;
      challengeBatchSettledRef.current = true;
    });
  }, [willAttemptChallenge, challengePhase, isSessionComplete, bankCount, questionIndex, challengeCount]);

  // History-aware AI tutor for the current question. Called before any early return
  // (Rules of Hooks); no-ops when AI is disabled/offline (static explanation is the fallback).
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

  // After the last bank question: run the challenge round if it can be filled,
  // otherwise go straight to the summary. Never blocks.
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

  // Unified challenge sourcing, designed to be reliably full + fast:
  //   • Q1 appears fast (a count=1 AI call with a short timeout, static fallback).
  //   • Slots 2..N stream in from a background batch, deduped against Q1, with bank
  //     questions backfilling any gap; a per-question loader bridges the wait.
  //   • With AI off the whole round is built from static bank questions.
  // Fillers prefer weak topics, never repeat the bank questions just answered, and
  // earn the same double rewards. The round only shrinks/shows "unavailable" when
  // the bank is out of unused questions AND the AI can't help.
  async function startChallengeRound() {
    setChallengeUnavailable(false);
    setChallengePhase('loading');

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

    // Dedup AI questions by prompt (the count=1 and count=N calls can overlap);
    // fillers are already unique by bank id.
    const usedPrompts = new Set<string>();
    const remember = (question: ChallengeQuestion) => usedPrompts.add(question.prompt.trim());

    // --- AI unavailable: build the whole round from static bank questions. ---
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

    // --- AI available. ---
    // Final slots: an optional already-chosen first question, then the AI batch
    // (deduped by prompt), then static bank fillers for any gap.
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

    // Otherwise show a fast Q1 (count=1 call, static fallback) now, then fill the
    // rest from the batch — a per-question loader bridges any wait.
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

  // Challenge answers reward double (2x XP + 2x coins) but are NOT recorded into
  // response history / topic-stats (AI questions have no stable bank topic). We tally
  // an on-screen count and play the same answer cue.
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
            targetConcept={currentChallengeQuestion.targetConcept}
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
        />
      )}
    </section>
  );
}

// The "Challenge round" badge + note above the AI questions and loading card. The
// sparkle carries the accessible "AI-generated" name.
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
  /** Challenge-only: the weak area this question targets, shown in feedback. */
  targetConcept?: string;
  /** Label for the "advance" button on non-final questions. */
  nextLabel?: string;
  /** Label for the "advance" button on the final question. */
  finishLabel?: string;
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
  targetConcept,
  nextLabel = 'Next random question',
  finishLabel = 'View summary',
}: PracticeQuestionCardProps) {
  const selectedChoice = currentQuestion.choices.find((choice) => choice.id === selectedChoiceId);
  const correctChoice = currentQuestion.choices.find(
    (choice) => choice.id === currentQuestion.correctChoiceId,
  );
  const isLastQuestion = questionIndex === sessionLength - 1;
  const isChallenge = variant === 'challenge';

  // Shared static feedback block. Rendered directly for the challenge round (no AI
  // coach there); bank questions route it through the AI coach, which falls back to it.
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
      {isChallenge && targetConcept ? (
        <span className="practice-challenge-target">
          Targets: <MathText text={targetConcept} />
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
            // Once answered: the correct choice turns green and a wrong pick turns
            // red (reusing the global is-correct / is-incorrect styles).
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
