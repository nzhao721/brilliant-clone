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

// The phase of the optional post-session AI challenge round:
//  • 'inactive' — not running (default; also the state when it's skipped)
//  • 'loading'  — calling the AI while the "Generating…" card shows
//  • 'active'   — presenting the generated questions one-by-one
type ChallengePhase = 'inactive' | 'loading' | 'active';

// The minimal question shape the question card needs. Both a bank
// PracticeQuestion and an AI-generated ChallengeQuestion satisfy it, so the same
// card UI/answer flow renders both.
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

// How long to wait for the FAST first-challenge-question call (count=1) before
// falling back to a static bank question so question 21 is never blocked on the
// model. The remaining questions stream in via a separate background batch.
const CHALLENGE_FAST_TIMEOUT_MS = 6000;

/** Adapts a real bank question into the challenge-question shape the round renders. */
function mapBankQuestionToChallenge(question: PracticeQuestion): ChallengeQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    correctChoiceId: question.correctChoiceId,
    explanation: question.explanation,
    // The bank question's topic IS the weak area it targets.
    targetConcept: question.category,
  };
}

/**
 * Ordered pool of bank questions usable as STATIC challenge fillers: every
 * question NOT already used in this session's bank round, weak topics first
 * (categories the learner got wrong this session), then the rest. Consumed from
 * the front so a filler never repeats a used question or another filler.
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

/** Reassigns stable, collision-free ids to the resolved challenge slots (AI ids and
 * bank ids share no namespace and the two AI calls both synthesize "challenge-1",
 * so the slot position is the only safe key). */
function withChallengeSlotIds(questions: ChallengeQuestion[]): ChallengeQuestion[] {
  return questions.map((question, index) => ({ ...question, id: `challenge-${index + 1}` }));
}

type PracticePageProps = {
  rng?: RandomNumberGenerator;
  sessionSize?: number;
  /** How many AI challenge questions to request after the bank set (default 5). */
  challengeCount?: number;
};

// ---------------------------------------------------------------------------
// Unified practice at /practice. There is no per-chapter picker and no intro/
// start screen: opening the page drops the learner straight into a fresh mixed
// session drawn from every question whose LESSON they have completed. A clear
// locked state covers the case where no lesson is complete yet, and an empty
// state covers completed lessons that have no questions.
// ---------------------------------------------------------------------------
export function PracticePage({
  rng = Math.random,
  sessionSize = 20,
  challengeCount = 5,
}: PracticePageProps) {
  const { user } = useAuth();
  // Minimalistic answer feedback cue; mirrors the lesson player. No-op in jsdom.
  const { playEffect } = useSound();
  const {
    addPracticeStudyTime,
    awardChallengeQuestion,
    awardPracticeQuestion,
    completedLessonIds,
    progress,
    recordResponse,
  } = useLessonProgress(lessons, user?.uid);

  // completedLessonIds is handed back as a fresh array (identical contents) on
  // every progress write — including answering a practice question. Derive a
  // stable string KEY (completed lessons in course order) and hang the pool off
  // that, so a mid-session answer never changes the pool identity and resets the
  // run.
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

  // The unified pool: the union of questions across every completed lesson.
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
  // Snapshot of the learner's answers to the bank questions, fed to the AI so it
  // can target the concepts they struggled with. Built up as they answer.
  const [sessionResponses, setSessionResponses] = useState<ChallengeSessionQuestion[]>([]);
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('inactive');
  const [challengeQuestions, setChallengeQuestions] = useState<ChallengeQuestion[]>([]);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeCorrectCount, setChallengeCorrectCount] = useState(0);
  const [challengeIncorrectCount, setChallengeIncorrectCount] = useState(0);
  // The number of slots the active challenge round commits to (the challenge part
  // of the "of N" total). Set when the round starts; only reduced in the rare
  // case the AI fails AND the static bank is exhausted before all slots fill.
  const [challengeTargetCount, setChallengeTargetCount] = useState(0);
  // True while the background batch (challenge slots 2..N) is still resolving, so
  // an unfilled slot shows a brief per-question loader instead of ending the round.
  const [challengeRestPending, setChallengeRestPending] = useState(false);
  // True only when a round genuinely could not run (AI failed AND no unused bank
  // questions remain), so the summary can show a subtle "unavailable" note.
  const [challengeUnavailable, setChallengeUnavailable] = useState(false);

  const sessionInputRef = useRef({ eligibleQuestions, rng, sessionSize });
  const studyStartedAtRef = useRef(Date.now());
  const hasStudyActivityRef = useRef(false);
  const addPracticeStudyTimeRef = useRef(addPracticeStudyTime);
  // Latest values for the background challenge prefetch's async closures (kept in
  // refs so reading them never adds effect dependencies / re-runs).
  const sessionResponsesRef = useRef(sessionResponses);
  sessionResponsesRef.current = sessionResponses;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  // CHANGE 2 prefetch state — refs so kicking it off never triggers a re-render:
  //  • prefetched — idempotency guard (generation fires at most once per session)
  //  • batch{Ref,SettledRef,ResultRef} — the in-flight/settled full-batch promise
  //    started when the learner REACHES the last bank question, so the round can
  //    use it instantly when it begins.
  const challengePrefetchedRef = useRef(false);
  const challengeBatchRef = useRef<Promise<ChallengeQuestionsResponse | null> | null>(null);
  const challengeBatchSettledRef = useRef(false);
  const challengeBatchResultRef = useRef<ChallengeQuestionsResponse | null>(null);
  const currentQuestion = sessionQuestions[questionIndex];
  const answeredCount = correctCount + incorrectCount;

  const currentChallengeQuestion = challengeQuestions[challengeIndex];
  const challengeAnsweredCount = challengeCorrectCount + challengeIncorrectCount;

  // The end-of-session summary reflects the WHOLE session: the scored bank
  // questions PLUS the AI challenge questions that were ACTUALLY answered. When
  // the challenge round is skipped (disabled/offline/over quota/failed) the
  // challenge counts are all 0, so every total gracefully falls back to just the
  // bank questions the learner actually answered — no "of 25", no NaN.
  const totalAnswered = answeredCount + challengeAnsweredCount;
  const totalCorrect = correctCount + challengeCorrectCount;
  const totalIncorrect = incorrectCount + challengeIncorrectCount;
  const overallPercentCorrect =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  // Per-question rewards earned this session, folding in the challenge round's
  // DOUBLE awards (challengeRewardMultiplier× the normal per-correct amounts).
  // Mirrors what awardPracticeQuestion / awardChallengeQuestion actually credit.
  const sessionXpEarned =
    correctCount * practiceQuestionXp +
    challengeCorrectCount * practiceQuestionXp * challengeRewardMultiplier;
  const sessionCoinsEarned =
    correctCount * coinsPerCorrectAnswer +
    challengeCorrectCount * coinsPerCorrectAnswer * challengeRewardMultiplier;

  // Whether a challenge round will even be attempted after the bank set: AI must
  // be enabled, online, the learner signed in (the callable enforces it too),
  // and at least one question requested. The call can still fail/return nothing,
  // in which case the round is skipped gracefully.
  const willAttemptChallenge =
    challengeCount > 0 && isAiTutorEnabled() && isOnline() && Boolean(user);

  // One continuous question counter across the WHOLE session: the bank round
  // (positions 1..bankCount) followed by the challenge round. Through the bank
  // round we show the PLANNED challenge size (so the counter reads a stable
  // "of 25"); once the round is active we use the committed target. The round can
  // be filled by AI questions AND/OR static bank fallbacks, so it stays at the
  // full size unless the bank is genuinely exhausted.
  const bankCount = sessionQuestions.length;
  // Bank questions in the pool NOT drawn for this session — the static fallback
  // material that backfills any challenge slot the AI can't supply.
  const unusedBankCount = Math.max(0, eligibleQuestions.length - bankCount);
  // How many challenge slots the session is HEADED for during the bank round.
  // With AI we optimistically count the full round (AI fills + static backfills
  // any gap); with AI off the round still runs on static questions alone, bounded
  // by the unused bank pool.
  const plannedChallengeCount =
    challengeCount <= 0
      ? 0
      : willAttemptChallenge
        ? challengeCount
        : Math.min(challengeCount, unusedBankCount);
  // Whether a challenge round will run at all: AI can fill it OR (AI off) there
  // are unused bank questions to fill it statically. Drives the bank round's
  // final button ("Continue" vs "View summary") and finishBankQuestions.
  const willRunChallenge = plannedChallengeCount > 0;
  const sessionTotalQuestions =
    challengePhase === 'active'
      ? bankCount + challengeTargetCount
      : bankCount + plannedChallengeCount;

  // Rebuild the session only when the pool (or rng/size) actually changes. The
  // pool is referentially stable while answering, so this never fires mid-run.
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

  // Record the session's elapsed study time once, when leaving the page. Timing
  // runs from mount (the session auto-starts on load) to unmount.
  useEffect(
    () => () => {
      if (!hasStudyActivityRef.current) {
        return;
      }

      addPracticeStudyTimeRef.current(Date.now() - studyStartedAtRef.current);
    },
    [],
  );

  // If the learner advanced onto a challenge slot the background fill can no
  // longer provide (rare: AI failed AND the static bank ran out mid-round), the
  // round is over — go to the summary instead of leaving a stuck loader.
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

  // CHANGE 2: as soon as the learner REACHES the last bank question, kick off the
  // FULL challenge batch in the BACKGROUND using only the responses to the first
  // N-1 questions — the last static question is intentionally EXCLUDED (its answer
  // isn't in yet), so generation overlaps with the learner solving it and is
  // ideally ready when the round begins. Fires at most once per session; a no-op
  // when AI is off (the round is built statically at round start) and for very
  // short sessions (< 2 bank questions, where "first N-1" would be empty).
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

  // Optional, history-aware AI tutor for the current question. Called before any
  // early return (Rules of Hooks); no-ops when AI is disabled/offline so the
  // static explanation always remains the fallback.
  const selectedChoice = currentQuestion?.choices.find((choice) => choice.id === selectedChoiceId);
  const correctChoice = currentQuestion?.choices.find(
    (choice) => choice.id === currentQuestion.correctChoiceId,
  );
  const aiTutor = useAiTutor({
    questionId: currentQuestion?.id ?? '',
    prompt: currentQuestion?.prompt ?? '',
    // All choices + the correct id let ONE prefetch cover every choice's feedback,
    // so the matching message is served instantly on submit (practice has no hint).
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

    // Count practice toward XP (10 per correct), streak + streak bonus, and the
    // attempt-based analytics (accuracy, questions attempted/correct).
    hasStudyActivityRef.current = true;
    awardPracticeQuestion(isCorrect);
    // Record the FULL response (attempts + topicStats + recentMistakes)
    // UNCONDITIONALLY and BEFORE any AI logic, so history builds with AI off/offline.
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

    // Snapshot this answer for the optional challenge round so the AI can target
    // the concepts the learner struggled with. Kept separate from history above;
    // this is only used to seed the post-session generation.
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

    // Gentle correct/incorrect cue, mirroring the lesson player.
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

  // After the last bank question: run the challenge round whenever it can be
  // filled — the AI is attemptable OR there are unused bank questions for static
  // fill — otherwise go straight to the summary. Never blocks.
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

  // Unified challenge sourcing (designed so the round is reliably full + fast):
  //   • Q1 appears FAST — a quick count=1 AI call with a short timeout, falling
  //     back to a static bank question the INSTANT the model is slow/unavailable
  //     so question 21 is never blocked.
  //   • Slots 2..N stream in from a background batch (the SAME callable,
  //     count=challengeCount), deduped against Q1, with unused bank questions
  //     backfilling any slot the AI can't supply. A per-question loader bridges
  //     the wait if the learner advances before the batch lands.
  //   • With AI off the whole round is built instantly from static bank questions.
  // Static fillers prefer this session's weak topics, never repeat the 20 bank
  // questions just answered (nor each other), and earn the same DOUBLE rewards as
  // AI questions. The round only drops below the full size (or shows
  // "unavailable") when the bank is genuinely out of unused questions AND the AI
  // can't help.
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

    // Dedup AI questions (across the count=1 and count=N calls, which can overlap)
    // by prompt; fillers are already unique by bank id.
    const usedPrompts = new Set<string>();
    const remember = (question: ChallengeQuestion) => usedPrompts.add(question.prompt.trim());

    // --- AI unavailable: build the whole round from static bank questions now. ---
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
    // Assembles the final slots: an optional already-chosen first question, then
    // the AI batch (deduped by prompt), then static bank fillers for any gap.
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

    // Prefer the PREFETCHED full batch (started when the learner reached the last
    // bank question, excluding it). If it isn't ready, start one now.
    const batchPromise =
      challengeBatchRef.current ??
      generateChallengeQuestions({ sessionQuestions: sessionResponses, profileSummary, count: challengeCount });
    const batchAlreadySettled =
      challengeBatchRef.current !== null && challengeBatchSettledRef.current;
    const settledResult = challengeBatchResultRef.current;
    challengeBatchRef.current = null;

    // Best case: the prefetch finished while the learner solved the last static
    // question → present the WHOLE round at once (no fast-Q1 / loader needed).
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

    // Safety net: the batch isn't ready (no prefetch, or the learner finished the
    // last question first) → show a FAST Q1 (quick count=1 call, static fallback)
    // now, then fill the rest from the (prefetched or new) batch — a per-question
    // loader bridges any wait.
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
    // Commit to the full round; the rest is filled by the background batch +
    // static backfill (the target only shrinks if both run dry).
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

  // Challenge answers reward DOUBLE a normal practice answer (2x XP + 2x coins)
  // for a correct pick. They are still NOT recorded into response history /
  // topic-stats (the questions are AI-generated with no stable bank topic) — the
  // reward only grows lifetime XP + coins, which flow to the header, analytics,
  // and leaderboard exactly like every other earned XP/coin. We also tally an
  // on-screen correct/incorrect count and play the same answer cue.
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

  // Gating: no lesson completed yet means nothing is unlocked.
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
                Challenge round
              </span>{' '}
              Includes {pluralize(challengeAnsweredCount, 'bonus challenge question')} (double XP
              &amp; coins), folded into the totals above.
            </p>
          ) : challengeUnavailable ? (
            <p className="practice-challenge-unavailable">Challenge round unavailable this time.</p>
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
          // The next challenge slot is still streaming in from the background
          // batch — show a brief per-question loader (keeping the "of N" counter)
          // until it (or its static backfill) lands.
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

// The "Challenge round" badge + note shown above the AI-generated questions and
// the loading card. The sparkle carries the accessible "AI-generated" name so
// the round is never confused with the scored bank questions.
function ChallengeRoundBanner() {
  return (
    <div className="practice-challenge-banner">
      <span className="practice-challenge-badge">
        <span className="practice-challenge-badge-mark" role="img" aria-label="AI-generated">
          <AiSparkIcon className="practice-challenge-badge-icon" />
        </span>
        Challenge round
      </span>
      <p className="practice-challenge-note">
        Bonus questions to stretch what you just practiced. Each correct answer earns double XP and
        coins.
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

  // Shared static feedback block. For the challenge round (AI-generated, not
  // scored) it is rendered directly — there is no per-choice AI coach for it —
  // and includes the concept it targets. Bank questions route it through the AI
  // coach (which falls back to this exact block when AI is off or fails).
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
            // Once answered, reveal the answer key on the choices themselves: the
            // correct choice always turns green, and on a wrong answer the choice
            // the learner picked also turns red — so both are highlighted at once.
            // Reuses the global is-correct / is-incorrect answer-option styles
            // (the same tokens the lesson player uses).
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
