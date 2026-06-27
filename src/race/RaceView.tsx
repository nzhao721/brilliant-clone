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
/* Sound hook: the race has NO music — only one-shot answer cues (playEffect) and the engine drone (startEngine/setEngineLevel/stopEngine). No-ops safely in jsdom. */
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

/*
 * RaceView — shared race screen for both bot and online modes. Owns the ONE rAF loop:
 * each frame it advances the player's car, reports it to the parent (online broadcasts,
 * bot ignores), steps + reads every opponent via a mode-agnostic `OpponentController`
 * (easing rendered positions so ~150ms online samples glide), and fires once-only finish
 * callbacks. Opponents are a LIST, so any number render through one path. The question
 * flow (seeded sequence; correct answer grants fuel + practice XP, NOT coins) lives here;
 * the pool is from (`chapterIds`, `seed`) — bot passes lesson-unlocked chapters, online
 * passes `[]` (full-bank sentinel) so both clients agree.
 */

const MAX_FRAME_DT = 0.05;
/* Opponent rendered-position smoothing time-constant (~50ms): closes most of the gap to each ~150ms sample so steps don't read as teleports. */
const OPPONENT_TWEEN_TAU = 0.05;

/* Engine drone (no music): the loop feeds setEngineLevel a 0..1 level from speed; a correct answer briefly bumps it for a "rev". */
const ENGINE_REV_MS = 320; // how long a correct-answer rev sustains
const ENGINE_REV_BOOST = 0.4; // added to the speed-derived level during a rev

/** The minimal opponent car RaceView renders, from whichever source supplies it. */
type OpponentCar = {
  position: number;
  velocity: number;
  finished: boolean;
};

/** Mode-agnostic opponent source: bot mode advances a BotState in `step`; online ignores `step` and returns the latest snapshot. */
export type OpponentController = {
  step: (dtSeconds: number) => void;
  getCar: () => OpponentCar;
};

/** One opponent: stable id (uid or 'bot'), name, colour, and the controller RaceView steps + reads each frame. */
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
  /** Chapters whose questions fuel the race. Bot passes lesson-unlocked chapters; online passes `[]` (full-bank sentinel) so both clients build the identical sequence. */
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
  /** When true the car auto-accelerates whenever fuelled; when false (default) the player holds Space or press-and-hold. */
  autoAccelerate?: boolean;
};

type AnswerResult = 'correct' | 'incorrect' | null;

function buildQuestionSequence(seed: number, chapterIds: readonly string[]): PracticeQuestion[] {
  /* Empty list = full-bank sentinel (online); else the bot's lesson-unlocked pool. `questionBank` referenced explicitly so test mocks apply. */
  const pool =
    chapterIds.length === 0 ? questionBank : getQuestionsForChapters(chapterIds, questionBank);
  if (pool.length === 0) {
    return [];
  }
  /* Deterministic seed shuffle (both clients agree), cycled by index so fuel can always be earned in a long race. */
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

  /* Answer cues + engine drone (no music), mirrored into refs so the loop/handlers reach the latest fns. */
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

  /* Key on the chapter SET (stable string) so a fresh-but-equal chapterIds array never rebuilds the order mid-race. */
  const chapterIdsKey = chapterIds.join('|');
  const questions = useMemo(
    () => buildQuestionSequence(seed, chapterIds),
    /* chapterIdsKey captures the contents, so a changed array identity alone won't rebuild the sequence. */
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
  /* One rendered (eased) car per opponent, seeded at the start line so every rival shows up immediately (and in tests). */
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

  /* The loop reads/writes refs so 60fps updates avoid stale closures; state mirrors are for rendering only. */
  const playerCarRef = useRef(playerCar);
  // Eased on-screen X per opponent id, so ~150ms online samples track smoothly.
  const displayedOpponentXRef = useRef<Map<string, number>>(new Map());
  const playerFinishedRef = useRef(false);
  /* Fires onOpponentFinish once for the FIRST opponent to finish (bot mode's "you lost"; online ignores it). */
  const opponentFinishFiredRef = useRef(false);
  const finishedAtRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  // Clock (ms) up to which the engine gets a "rev" boost after a correct answer.
  const engineRevUntilRef = useRef(0);

  /* Latest props for the loop, refreshed every render (refs, so they never restart it). */
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

  /* Coin-pickup refs: `collectedCoinsRef` is the credited set so each coin pays out once; the count mirrors to state for the HUD. */
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
        /* Auto mode burns whenever fuelled; manual only while holding the accelerator and not answering. */
        const accelerating = autoAccelerateRef.current
          ? true
          : throttleHeldRef.current && !questionOpenRef.current;
        const next = stepCar(playerCarRef.current, dt, seed, accelerating);
        playerCarRef.current = next;
        setPlayerCar(next);
      }

      /* Engine level 0..1 from speed (0 when finished; a recent correct answer adds a brief rev boost). */
      const normalized = playerFinishedRef.current
        ? 0
        : Math.min(1, Math.max(0, playerCarRef.current.velocity / MAX_SPEED));
      const revving = !playerFinishedRef.current && now < engineRevUntilRef.current;
      engineRef.current.setEngineLevel(
        revving ? Math.min(1, normalized + ENGINE_REV_BOOST) : normalized,
      );

      /* Coin pickups: car only moves forward and coins are sorted, so scan from front and stop at the first ahead; the Set guard pays each once. */
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

      /* Step + read every opponent, easing rendered position toward target so ~150ms samples glide. Eased X keyed by id so a reorder never swaps cars. */
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
      /* Wrong → kill speed (keep position + fuel). Write the ref first so the next frame steps from a stop, then mirror to state for the HUD. */
      const stopped: CarState = { ...playerCarRef.current, velocity: 0 };
      playerCarRef.current = stopped;
      setPlayerCar(stopped);
      soundRef.current.playEffect('incorrect');
    }
    /* Answering feeds XP + streak but grants NO coins (awardCoins:false) — race coins come only from track collectibles. */
    awardRef.current(isCorrect, { awardCoins: false });
    setAnswerResult(isCorrect ? 'correct' : 'incorrect');
  }, [answerResult, currentQuestion, selectedChoiceId]);

  // Advancing is fully manual: feedback stays up until "Next question" (no timer).
  const handleNextQuestion = useCallback(() => {
    setSelectedChoiceId('');
    setAnswerResult(null);
    setQuestionIndex((index) => index + 1);
  }, []);

  // Driver input: hold-to-accelerate + the Refuel popup toggle
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
      /* While refuelling/auto-accelerating leave Space alone; otherwise it's the gas, so swallow it to stop page scroll. */
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

  /* Stage is already a full-viewport overlay; the real Fullscreen API is a guarded progressive enhancement (jsdom + rejected promises never throw). */
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

      {/* Transparent hold-to-accelerate surface: above scenery, below HUD/controls, so only the open stage drives the car. */}
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

/* Per-option status marker once answered. SVG is decorative (aria-hidden); outcome rides sr-only text so feedback never relies on colour alone. */
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

/* Memoized so 60fps car/track updates don't re-render the card. Markup mirrors PracticePage's card for styling. */
const RaceQuestionCard = memo(function RaceQuestionCard({
  question,
  selectedChoiceId,
  answerResult,
  onSelect,
  onSubmit,
  onNext,
  onBack,
}: RaceQuestionCardProps) {
  /* Focus the first choice on each new question (keyed off question.id so a feedback re-render doesn't steal focus); never trapped. */
  const firstChoiceRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstChoiceRef.current?.focus();
  }, [question.id]);

  const answered = Boolean(answerResult);

  return (
    <article className="lesson-player practice-card race-question-card">
      <div className="lesson-step">
        {/* Only the prompt + choices scroll; the action row is a pinned footer so the buttons stay visible. */}
        <div className="race-question-scroll">
          <h2>
            <MathText text={question.prompt} />
          </h2>

          <div className="answer-options" role="radiogroup" aria-label={question.prompt}>
            {question.choices.map((choice, index) => {
              /* Once answered: correct choice marked correct (even on a miss), wrong pick incorrect, rest dimmed. */
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
              Submit
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
