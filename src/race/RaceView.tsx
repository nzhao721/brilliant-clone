import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { MathText } from '../components/MathText';
import { lessons } from '../data/lessons';
import {
  createSeededRng,
  getQuestionsForChapters,
  pickRandomQuestions,
  questionBank,
  type PracticeQuestion,
} from '../data/questionBank';
import { useCurrency } from '../games/useCurrency';
// Core sound hook. The race deliberately plays NO background music — it pulls
// only the one-shot answer cues (playEffect) and the continuous engine drone
// (startEngine/setEngineLevel/stopEngine) from here. It owns the global mute /
// AudioContext and no-ops safely in jsdom, so these calls never break tests.
import { useSound } from '../audio/SoundProvider';
import { useLessonProgress } from '../lessons/lessonProgress';
import {
  addFuel,
  type CarState,
  FUEL_PER_CORRECT,
  hasFinished,
  MAX_SPEED,
  stepCar,
} from './racePhysics';
import { buildRaceCoins, COIN_VALUE } from './raceCoins';
import { PLAYER_CAR_COLOR } from './raceColors';
import type { RaceCarInput } from './useRaceMatch';
import { RaceTrack, type RaceTrackOpponent } from './RaceTrack';

// ---------------------------------------------------------------------------
// RaceView — the shared race screen for BOTH the bot and online modes. It owns the
// ONE requestAnimationFrame loop, which each frame: advances the player's car;
// reports it to the parent (online broadcasts, bot ignores); steps + reads every
// opponent through a mode-agnostic `OpponentController`, easing each rendered
// position so ~150ms online samples track smoothly; and fires the once-only finish
// callbacks. The opponent field is a LIST, so any number of rivals render through
// the identical path. The question flow (seeded sequence from the pool, fuel + the
// normal practice XP on a correct answer, but NOT coins) lives here too. The pool
// derives from (`chapterIds`, `seed`): bot mode passes the player's lesson-unlocked
// chapters; online passes `[]` (the "full bank" sentinel) so both clients agree.
// ---------------------------------------------------------------------------

const MAX_FRAME_DT = 0.05;
// Exponential smoothing time-constant for the opponent's rendered position. ~50ms
// closes ~95% of the gap to the latest ~150ms sample each interval — enough easing
// to keep the steps from reading as teleports without lagging behind.
const OPPONENT_TWEEN_TAU = 0.05;

// ----- Race audio: a true continuous engine drone (deliberately NO music) -----
// The engine is one persistent oscillator (startEngine/setEngineLevel/stopEngine);
// the loop feeds setEngineLevel a 0..1 level from the car's speed so its pitch
// glides with the car. A correct answer briefly bumps that level for a "rev".
const ENGINE_REV_MS = 320; // how long a correct-answer rev sustains
const ENGINE_REV_BOOST = 0.4; // added to the speed-derived level during a rev

/** The minimal opponent car RaceView renders, from whichever source supplies it. */
type OpponentCar = {
  position: number;
  velocity: number;
  finished: boolean;
};

/**
 * Mode-agnostic opponent source. Bot mode advances a local BotState in `step`;
 * online mode ignores `step` and returns the latest Firestore snapshot. RaceView
 * only ever sees `step`/`getCar`.
 */
export type OpponentController = {
  step: (dtSeconds: number) => void;
  getCar: () => OpponentCar;
};

/**
 * One opponent: a stable id (uid, or 'bot'), display name, stable colour, and the
 * controller RaceView steps and reads each frame.
 */
export type RaceOpponent = {
  id: string;
  name: string;
  color: string;
  controller: OpponentController;
};

/** Reported once when a car first crosses the finish line. */
export type RaceFinishSnapshot = {
  playerPosition: number;
  opponentPosition: number;
  at: number;
};

type RaceViewProps = {
  seed: number;
  /**
   * Chapters whose questions fuel this race. Bot mode passes the player's
   * lesson-unlocked chapters; online passes `[]` (the "full question bank"
   * sentinel) so both clients build the identical seeded sequence.
   */
  chapterIds: string[];
  raceDistance: number;
  playerName: string;
  /** The local player's car colour (defaults to the brand green). */
  playerColor?: string;
  /** Every opponent in the race (one for bot mode; one per remote player online). */
  opponents: RaceOpponent[];
  /** Called every frame with the player's car (online broadcasting; bot no-op). */
  onReportCar?: (car: RaceCarInput) => void;
  /** Called once, when the player crosses the finish line. */
  onPlayerFinish?: (snapshot: RaceFinishSnapshot) => void;
  /** Called once, when the FIRST opponent crosses the finish line (bot mode loss). */
  onOpponentFinish?: (snapshot: RaceFinishSnapshot) => void;
  /** Fuel the player's tank starts with (defaults to empty — earn it by answering). */
  startingFuel?: number;
  /**
   * When true the car accelerates automatically whenever it has fuel; when false
   * (default) the player must hold an accelerate input (Space or press-and-hold).
   */
  autoAccelerate?: boolean;
};

type AnswerResult = 'correct' | 'incorrect' | null;

function buildQuestionSequence(seed: number, chapterIds: readonly string[]): PracticeQuestion[] {
  // Empty list = the "full bank" sentinel (online); otherwise the bot's
  // lesson-unlocked pool. `questionBank` is referenced explicitly so test mocks apply.
  const pool =
    chapterIds.length === 0 ? questionBank : getQuestionsForChapters(chapterIds, questionBank);
  if (pool.length === 0) {
    return [];
  }
  // A deterministic shuffle from the seed (both online clients build the identical
  // order), cycled by index so fuel can always be earned in a long race.
  return pickRandomQuestions(pool, pool.length, createSeededRng(seed));
}

export function RaceView({
  seed,
  chapterIds,
  raceDistance,
  playerName,
  playerColor = PLAYER_CAR_COLOR,
  opponents,
  onReportCar,
  onPlayerFinish,
  onOpponentFinish,
  startingFuel = 0,
  autoAccelerate = false,
}: RaceViewProps) {
  const { user } = useAuth();
  const { awardPracticeQuestion } = useLessonProgress(lessons, user?.uid);
  // Picked-up coins credit the player's real balance; mirrored into a ref for the loop.
  const { addCoins } = useCurrency();

  // No background music — just the one-shot answer cues and the continuous engine
  // drone, each mirrored into a ref so the loop/handlers reach the latest fns.
  const { playEffect, startEngine, setEngineLevel, stopEngine } = useSound();
  const soundRef = useRef({ playEffect });
  soundRef.current = { playEffect };
  const engineRef = useRef({ startEngine, setEngineLevel, stopEngine });
  engineRef.current = { startEngine, setEngineLevel, stopEngine };

  // Run the engine while the race is on screen; idempotent + jsdom-safe.
  useEffect(() => {
    engineRef.current.startEngine();
    return () => {
      engineRef.current.stopEngine();
    };
  }, []);

  // Deterministic coin layout from the seed, so an online opponent sees identical coins.
  const coins = useMemo(() => buildRaceCoins(seed, raceDistance), [seed, raceDistance]);
  const [coinsCollected, setCoinsCollected] = useState(0);

  // Key the sequence on the chapter SET (a stable string) so an equal-but-fresh
  // chapterIds array from a snapshot never rebuilds the order mid-race.
  const chapterIdsKey = chapterIds.join('|');
  const questions = useMemo(
    () => buildQuestionSequence(seed, chapterIds),
    // chapterIdsKey captures chapterIds' contents; the array identity is allowed
    // to change between renders without rebuilding the deterministic sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, chapterIdsKey],
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult>(null);
  // DRIVING = popup hidden, hold-to-accelerate; REFUEL = popup open, answering.
  const [phase, setPhase] = useState<'driving' | 'refuel'>('driving');

  const currentQuestion =
    questions.length > 0 ? questions[questionIndex % questions.length] : undefined;

  const [playerCar, setPlayerCar] = useState<CarState>(() => ({
    position: 0,
    velocity: 0,
    fuel: startingFuel,
  }));
  // One rendered (eased) car per opponent, rebuilt each frame; seeded from the
  // opponent list at the start line so every rival shows up immediately (and in tests).
  const [opponentCars, setOpponentCars] = useState<RaceTrackOpponent[]>(() =>
    opponents.map((opponent) => ({
      id: opponent.id,
      name: opponent.name,
      color: opponent.color,
      position: 0,
      velocity: 0,
      finished: false,
    })),
  );

  // The loop reads/writes through refs so 60fps updates never depend on stale
  // closures; state mirrors are kept only for rendering.
  const playerCarRef = useRef(playerCar);
  // Eased on-screen X per opponent id, so ~150ms online samples track smoothly.
  const displayedOpponentXRef = useRef<Map<string, number>>(new Map());
  const playerFinishedRef = useRef(false);
  // Fires onOpponentFinish once, for the FIRST opponent to finish (bot mode's "you
  // lost" signal; online ignores it).
  const opponentFinishFiredRef = useRef(false);
  const finishedAtRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  // Clock (ms) up to which the engine gets a "rev" boost after a correct answer.
  const engineRevUntilRef = useRef(0);

  // Latest props the loop calls, refreshed every render (refs, so they never
  // restart the loop). `opponentsRef` lets the loop read the live opponent list.
  const opponentsRef = useRef(opponents);
  const reportCarRef = useRef(onReportCar);
  const onPlayerFinishRef = useRef(onPlayerFinish);
  const onOpponentFinishRef = useRef(onOpponentFinish);
  const awardRef = useRef(awardPracticeQuestion);
  opponentsRef.current = opponents;
  reportCarRef.current = onReportCar;
  onPlayerFinishRef.current = onPlayerFinish;
  onOpponentFinishRef.current = onOpponentFinish;
  awardRef.current = awardPracticeQuestion;

  // Coin pickup bookkeeping (loop-owned refs). `collectedCoinsRef` is the credited
  // set that makes each coin pay out exactly once; the count is mirrored to state for the HUD.
  const coinsRef = useRef(coins);
  const collectedCoinsRef = useRef<Set<number>>(new Set());
  const addCoinsRef = useRef(addCoins);
  coinsRef.current = coins;
  addCoinsRef.current = addCoins;

  // Live driver input read by the loop (refs, so toggling never restarts it).
  const throttleHeldRef = useRef(false);
  const questionOpenRef = useRef(false);
  const autoAccelerateRef = useRef(autoAccelerate);
  questionOpenRef.current = phase === 'refuel';
  autoAccelerateRef.current = autoAccelerate;

  // The single race loop. Restarts only if the track itself changes.
  useEffect(() => {
    // A new track is a fresh coin run: clear the credited set and HUD tally.
    collectedCoinsRef.current = new Set();
    setCoinsCollected(0);

    let frameId = 0;
    lastFrameRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;

      if (!playerFinishedRef.current) {
        // Auto mode burns whenever fuelled; manual mode only while the player holds
        // the accelerator and isn't answering in the refuel popup.
        const accelerating = autoAccelerateRef.current
          ? true
          : throttleHeldRef.current && !questionOpenRef.current;
        const next = stepCar(playerCarRef.current, dt, seed, accelerating);
        playerCarRef.current = next;
        setPlayerCar(next);
      }

      // Engine sound: a 0..1 level from the car's speed (silenced to 0 when
      // finished; a recent correct answer adds a brief rev boost).
      const normalized = playerFinishedRef.current
        ? 0
        : Math.min(1, Math.max(0, playerCarRef.current.velocity / MAX_SPEED));
      const revving = !playerFinishedRef.current && now < engineRevUntilRef.current;
      engineRef.current.setEngineLevel(
        revving ? Math.min(1, normalized + ENGINE_REV_BOOST) : normalized,
      );

      // Coin pickups: the car only moves forward and coins are sorted, so scan from
      // the front and stop at the first still ahead; the Set guard pays each out once.
      const playerPosition = playerCarRef.current.position;
      let collectedThisFrame = 0;
      for (const coin of coinsRef.current) {
        if (coin.position > playerPosition) {
          break;
        }
        if (!collectedCoinsRef.current.has(coin.index)) {
          collectedCoinsRef.current.add(coin.index);
          addCoinsRef.current(COIN_VALUE);
          collectedThisFrame += 1;
        }
      }
      if (collectedThisFrame > 0) {
        setCoinsCollected((count) => count + collectedThisFrame);
      }

      reportCarRef.current?.({
        position: playerCarRef.current.position,
        velocity: playerCarRef.current.velocity,
        finished: playerFinishedRef.current,
        finishedAt: finishedAtRef.current,
      });

      // Step + read every opponent, easing each rendered position toward its target
      // so ~150ms samples glide. Eased X is keyed by id so a reorder never swaps cars.
      const smoothing = 1 - Math.exp(-dt / OPPONENT_TWEEN_TAU);
      const easedById = displayedOpponentXRef.current;
      const opponentsList = opponentsRef.current;
      const rendered: RaceTrackOpponent[] = [];
      const liveIds = new Set<string>();
      let firstOpponentRawPosition = 0;
      let firstFinishedTarget: OpponentCar | null = null;

      for (let index = 0; index < opponentsList.length; index += 1) {
        const opponent = opponentsList[index];
        liveIds.add(opponent.id);
        opponent.controller.step(dt);
        const target = opponent.controller.getCar();
        if (index === 0) {
          firstOpponentRawPosition = target.position;
        }
        // Seed a newly-seen opponent at its current position (snap), then ease.
        const previous = easedById.has(opponent.id)
          ? (easedById.get(opponent.id) as number)
          : target.position;
        const next = previous + (target.position - previous) * smoothing;
        easedById.set(opponent.id, next);
        rendered.push({
          id: opponent.id,
          name: opponent.name,
          color: opponent.color,
          position: next,
          velocity: target.velocity,
          finished: target.finished,
        });
        if (target.finished && !firstFinishedTarget) {
          firstFinishedTarget = target;
        }
      }

      // Forget eased lanes for vanished opponents (defensive against stale smoothing).
      if (easedById.size > liveIds.size) {
        for (const id of Array.from(easedById.keys())) {
          if (!liveIds.has(id)) {
            easedById.delete(id);
          }
        }
      }
      setOpponentCars(rendered);

      const at = Date.now();
      if (!playerFinishedRef.current && hasFinished(playerCarRef.current, raceDistance)) {
        playerFinishedRef.current = true;
        finishedAtRef.current = at;
        onPlayerFinishRef.current?.({
          playerPosition: playerCarRef.current.position,
          opponentPosition: firstOpponentRawPosition,
          at,
        });
      }
      if (!opponentFinishFiredRef.current && firstFinishedTarget) {
        opponentFinishFiredRef.current = true;
        onOpponentFinishRef.current?.({
          playerPosition: playerCarRef.current.position,
          opponentPosition: firstFinishedTarget.position,
          at,
        });
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [seed, raceDistance]);

  const handleSelectChoice = useCallback((choiceId: string) => {
    setSelectedChoiceId(choiceId);
  }, []);

  const handleSubmitAnswer = useCallback(() => {
    if (!currentQuestion || !selectedChoiceId || answerResult) {
      return;
    }
    const isCorrect = selectedChoiceId === currentQuestion.correctChoiceId;
    if (isCorrect) {
      // Correct → bank fuel.
      const refuelled = addFuel(playerCarRef.current, FUEL_PER_CORRECT);
      playerCarRef.current = refuelled;
      setPlayerCar(refuelled);
      soundRef.current.playEffect('correct');
      // Open a brief engine-rev window the loop reads (same clock it compares against).
      engineRevUntilRef.current =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) + ENGINE_REV_MS;
    } else {
      // Wrong → kill all speed (keep position + fuel). Write the ref first so the
      // next frame steps from a dead stop, and mirror to state so the HUD drops to 0.
      const stopped: CarState = { ...playerCarRef.current, velocity: 0 };
      playerCarRef.current = stopped;
      setPlayerCar(stopped);
      soundRef.current.playEffect('incorrect');
    }
    // Racing feeds the XP economy (XP + streak) but grants NO coins for answering —
    // the race's coins come only from collectibles on the track (awardCoins:false).
    awardRef.current(isCorrect, { awardCoins: false });
    setAnswerResult(isCorrect ? 'correct' : 'incorrect');
  }, [answerResult, currentQuestion, selectedChoiceId]);

  // Advancing is fully manual: feedback stays up until "Next question" (no timer).
  const handleNextQuestion = useCallback(() => {
    setSelectedChoiceId('');
    setAnswerResult(null);
    setQuestionIndex((index) => index + 1);
  }, []);

  // ----- Driver input: hold-to-accelerate + the Refuel popup toggle -----
  const refuelButtonRef = useRef<HTMLButtonElement>(null);

  // Press on the stage background starts thrust; ignored while auto-accelerating or answering.
  const beginThrottle = useCallback(() => {
    if (autoAccelerateRef.current || questionOpenRef.current) {
      return;
    }
    throttleHeldRef.current = true;
  }, []);

  const openRefuel = useCallback(() => {
    // Opening the popup means the player is answering, so drop any held throttle.
    throttleHeldRef.current = false;
    setPhase('refuel');
  }, []);

  const closeRefuel = useCallback(() => {
    setPhase('driving');
  }, []);

  useEffect(() => {
    const release = () => {
      throttleHeldRef.current = false;
    };
    const isSpace = (event: KeyboardEvent) =>
      event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpace(event)) {
        return;
      }
      // While refuelling/auto-accelerating, leave Space alone; otherwise it's the
      // gas, so swallow it to stop the page scrolling.
      if (questionOpenRef.current || autoAccelerateRef.current) {
        return;
      }
      event.preventDefault();
      throttleHeldRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (isSpace(event)) {
        throttleHeldRef.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    // A release anywhere (even off-stage or on blur) ends thrust so it never sticks on.
    window.addEventListener('mouseup', release);
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', release);
      window.removeEventListener('blur', release);
    };
  }, []);

  // Refocus the Refuel CTA whenever driving mode is (re)entered, keeping it keyboard-led.
  useEffect(() => {
    if (phase === 'driving') {
      refuelButtonRef.current?.focus();
    }
  }, [phase]);

  // ----- Immersive stage + optional browser Fullscreen API -----
  // The stage is already a full-viewport overlay; the real Fullscreen API is a
  // guarded progressive enhancement (jsdom + rejected promises never throw).
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenSupported =
    typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.fullscreenElement) {
      void Promise.resolve(document.exitFullscreen?.()).catch(() => undefined);
    } else {
      void Promise.resolve(stageRef.current?.requestFullscreen?.()).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Leave OS fullscreen if the race ends while engaged, so result/lobby aren't stuck behind it.
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void Promise.resolve(document.exitFullscreen?.()).catch(() => undefined);
      }
    };
  }, []);

  return (
    <div className="race-immersive" ref={stageRef}>
      <RaceTrack
        seed={seed}
        raceDistance={raceDistance}
        player={playerCar}
        playerName={playerName}
        playerColor={playerColor}
        opponents={opponentCars}
        coins={coins}
        coinsCollected={coinsCollected}
      />

      {/* Transparent hold-to-accelerate surface: above the scenery but below the
          HUD/controls, so only the open stage drives the car (keyboard uses Space). */}
      <div
        className="race-accel-surface"
        role="presentation"
        aria-hidden="true"
        onMouseDown={beginThrottle}
        onTouchStart={beginThrottle}
      />

      {fullscreenSupported ? (
        <button
          type="button"
          className="race-fs-toggle"
          onClick={toggleFullscreen}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? 'Exit fullscreen' : 'Go fullscreen'}
        </button>
      ) : null}

      {phase === 'refuel' ? (
        <div
          className="race-question-popup"
          role="dialog"
          aria-modal="false"
          aria-label="Race question"
        >
          {currentQuestion ? (
            <RaceQuestionCard
              question={currentQuestion}
              selectedChoiceId={selectedChoiceId}
              answerResult={answerResult}
              onSelect={handleSelectChoice}
              onSubmit={handleSubmitAnswer}
              onNext={handleNextQuestion}
              onBack={closeRefuel}
            />
          ) : (
            <article className="lesson-player practice-card race-question-card">
              <div className="lesson-step">
                <h2>No questions available.</h2>
                <p>Add questions to the bank to fuel the race.</p>
                <div className="button-row compact-row">
                  <button type="button" className="secondary-button" onClick={closeRefuel}>
                    Back to the game
                  </button>
                </div>
              </div>
            </article>
          )}
        </div>
      ) : (
        <div className="race-driving-controls">
          <button
            ref={refuelButtonRef}
            type="button"
            className={`primary-button race-refuel-button${
              playerCar.fuel <= 0 ? ' is-empty' : ''
            }`}
            onClick={openRefuel}
          >
            <span aria-hidden="true" className="race-refuel-icon">
              ⛽
            </span>{' '}
            Refuel
          </button>
          {!autoAccelerate ? (
            <p className="race-accel-hint">Hold Space or click &amp; hold to accelerate</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

type RaceQuestionCardProps = {
  question: PracticeQuestion;
  selectedChoiceId: string;
  answerResult: AnswerResult;
  onSelect: (choiceId: string) => void;
  onSubmit: () => void;
  onNext: () => void;
  onBack: () => void;
};

// Per-option status marker once answered. The SVG is decorative (aria-hidden); the
// outcome rides sr-only text so feedback never relies on colour alone.
function AnswerFeedbackIcon({ variant }: { variant: 'correct' | 'incorrect' }) {
  const isCorrect = variant === 'correct';
  return (
    <span className={`race-answer-icon race-answer-icon-${variant}`}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {isCorrect ? (
          <path
            d="M4.6 10.6l3.4 3.4 7.4-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M5.5 5.5l9 9M14.5 5.5l-9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span className="sr-only">{isCorrect ? 'Correct answer' : 'Your answer, incorrect'}</span>
    </span>
  );
}

// Memoized so the 60fps car/track updates don't re-render the card (its props only
// change on selection/answer/advance). Markup mirrors PracticePage's card for styling.
const RaceQuestionCard = memo(function RaceQuestionCard({
  question,
  selectedChoiceId,
  answerResult,
  onSelect,
  onSubmit,
  onNext,
  onBack,
}: RaceQuestionCardProps) {
  // Focus the first choice whenever a new question surfaces (keyed off question.id
  // so a feedback re-render doesn't steal focus mid-answer); focus is never trapped.
  const firstChoiceRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstChoiceRef.current?.focus();
  }, [question.id]);

  const answered = Boolean(answerResult);

  return (
    <article className="lesson-player practice-card race-question-card">
      <div className="lesson-step">
        {/* Only the prompt + choices scroll; the action row below is a pinned
            footer so Submit/Next and "Back to the game" are always visible. */}
        <div className="race-question-scroll">
          <h2>
            <MathText text={question.prompt} />
          </h2>

          <div className="answer-options" role="radiogroup" aria-label={question.prompt}>
            {question.choices.map((choice, index) => {
              // Once answered: the correct choice is always marked correct (even on
              // a miss), the wrong pick is marked incorrect, the rest dim to neutral.
              const isSelected = selectedChoiceId === choice.id;
              const isCorrectChoice = choice.id === question.correctChoiceId;
              const showAsCorrect = answered && isCorrectChoice;
              const showAsIncorrect = answered && isSelected && !isCorrectChoice;
              const showAsDimmed = answered && !showAsCorrect && !showAsIncorrect;
              const optionClassName = [
                'answer-option',
                showAsCorrect ? 'is-correct' : '',
                showAsIncorrect ? 'is-incorrect' : '',
                showAsDimmed ? 'is-dimmed' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <label className={optionClassName} key={choice.id}>
                  <input
                    ref={index === 0 ? firstChoiceRef : undefined}
                    type="radio"
                    name={`race-${question.id}`}
                    value={choice.id}
                    checked={isSelected}
                    disabled={answered}
                    onChange={() => onSelect(choice.id)}
                  />
                  <span className="answer-option-copy">
                    <MathText text={choice.label} />
                  </span>
                  {showAsCorrect ? (
                    <AnswerFeedbackIcon variant="correct" />
                  ) : showAsIncorrect ? (
                    <AnswerFeedbackIcon variant="incorrect" />
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>

        <div className="button-row compact-row race-question-actions">
          {answerResult ? (
            <button className="primary-button" type="button" onClick={onNext}>
              Next question
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={!selectedChoiceId}
              onClick={onSubmit}
            >
              Submit answer
            </button>
          )}
          <button
            className="secondary-button race-back-to-game"
            type="button"
            onClick={onBack}
          >
            Back to the game
          </button>
        </div>
      </div>
    </article>
  );
});
