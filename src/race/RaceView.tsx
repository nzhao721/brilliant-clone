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
// RaceView — the shared race screen used by BOTH the bot and online modes.
//
// It owns the ONE requestAnimationFrame loop for the whole race. Each frame it:
//   • advances the player's car with the shared physics (clamped dt),
//   • reports the player's car to the parent (online broadcasts it; bot ignores),
//   • steps + reads EVERY opponent through a mode-agnostic `OpponentController`,
//   • eases each opponent's rendered position so the frequent (~150ms) online
//     samples track near-real-time without reading as visible steps,
//   • detects each car crossing the finish line (once) and notifies the parent.
//
// The opponent field is a LIST: bot mode passes exactly one entry (the bot) and
// online mode passes one entry per remote player, so any number (N) of rivals
// render through the identical code path (cars, standings, minimap).
//
// The question flow (build a seeded sequence from the player's pool, grant fuel +
// the normal practice XP on a correct answer, but NOT coins; the race's coins
// come only from the collectible coins on the track) lives here too, so it is
// identical in both modes. The pool is derived purely from (`chapterIds`, `seed`):
//   • Bot mode passes the LOCAL player's lesson-unlocked chapter ids (chapters
//     with >=1 completed lesson), so it widens as lessons are finished.
//   • Online mode passes an EMPTY list — the sentinel for "use the full question
//     bank" — so both clients build the SAME ungated sequence from `match.seed`.
// The ONLY other thing that differs between modes is the `opponents` list (a
// single bot offline; one entry per remote player online).
// ---------------------------------------------------------------------------

const MAX_FRAME_DT = 0.05;
// Exponential smoothing time-constant for the opponent's rendered position. Now
// that opponent samples arrive every ~150ms (not the old ~1s heartbeat), this is
// TIGHT — ~50ms means the rendered car closes ~95% of the gap to its latest
// synced sample within a single sample interval, so the opponent tracks
// near-real-time with only enough easing to keep the ~150ms steps from reading
// as visible teleports. Smaller would render the raw steps (jittery); larger
// would reintroduce the laggy "chasing a stale sample" feel we just removed.
const OPPONENT_TWEEN_TAU = 0.05;

// ----- Race audio (a true continuous engine drone — deliberately NO music) --
// The car's engine is a TRUE continuous drone driven by the audio engine's
// startEngine/setEngineLevel/stopEngine primitive (one persistent oscillator,
// not repeated one-shots). Each frame the rAF loop feeds setEngineLevel a 0..1
// level derived from the car's speed, so the engine pitch glides smoothly up and
// down with the car instead of beeping in and out. A correct answer briefly
// bumps that level for a short "rev" — the surge of fresh fuel felt as the engine
// winding up.
const ENGINE_REV_MS = 320; // how long a correct-answer rev sustains
const ENGINE_REV_BOOST = 0.4; // added to the speed-derived level during a rev

/** The minimal opponent car RaceView renders, from whichever source supplies it. */
export type OpponentCar = {
  position: number;
  velocity: number;
  finished: boolean;
};

/**
 * Mode-agnostic opponent source. Bot mode advances a local BotState in `step`;
 * online mode ignores `step` and returns the latest Firestore snapshot. Either
 * way RaceView only ever sees `step`/`getCar`, never bot- or Firestore-specifics.
 */
export type OpponentController = {
  step: (dtSeconds: number) => void;
  getCar: () => OpponentCar;
};

/**
 * One opponent in the race: a stable id (uid, or 'bot'), a display name, a stable
 * colour for its car/standings/minimap glyphs, and the controller RaceView steps
 * and reads each frame. Bot mode supplies one entry; online mode supplies one per
 * remote player.
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
   * Chapters whose questions fuel this race. Bot mode passes the LOCAL player's
   * lesson-unlocked chapter ids (chapters with >=1 completed lesson); the lobby
   * gates the bot race so this is never empty there. Online mode passes an EMPTY
   * list — the sentinel for "use the full question bank" — so both clients build
   * the identical seeded sequence with no progress gating.
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
   * When true the player's car accelerates automatically whenever it has fuel
   * (the classic behaviour). When false (the default) the player must hold an
   * accelerate input — Space, or click/touch-and-hold on the stage — to spend
   * fuel and move.
   */
  autoAccelerate?: boolean;
};

type AnswerResult = 'correct' | 'incorrect' | null;

function buildQuestionSequence(seed: number, chapterIds: readonly string[]): PracticeQuestion[] {
  // An empty chapter list is the "use the full bank" sentinel (online mode is
  // ungated); a non-empty list is the bot's lesson-unlocked pool — the union of
  // questions tagged to those chapters. `questionBank` is referenced explicitly
  // (not the helper's default) so test mocks of the bank still apply.
  const pool =
    chapterIds.length === 0 ? questionBank : getQuestionsForChapters(chapterIds, questionBank);
  if (pool.length === 0) {
    return [];
  }
  // A full deterministic shuffle from the seed: both online clients build the
  // identical order (same pool + same seed = fairness), and we cycle through it
  // (wrapping by index) so fuel can always be earned even in a very long race.
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
  // Picked-up coins credit the player's real spendable balance (the chosen
  // reward). addCoins is stable; mirrored into a ref for the rAF loop below.
  const { addCoins } = useCurrency();

  // Race audio: the race plays NO background music. From the core sound hook we
  // take ONLY the one-shot answer cues (playEffect) and the continuous engine
  // drone (startEngine/setEngineLevel/stopEngine). Each is mirrored into a ref so
  // the 60fps loop and the answer handlers always reach the latest functions
  // without re-subscribing.
  const { playEffect, startEngine, setEngineLevel, stopEngine } = useSound();
  const soundRef = useRef({ playEffect });
  soundRef.current = { playEffect };
  const engineRef = useRef({ startEngine, setEngineLevel, stopEngine });
  engineRef.current = { startEngine, setEngineLevel, stopEngine };

  // Spin the engine up while the race is on screen (mount = race active) and tear
  // it down on unmount / race end. Idempotent + jsdom-safe in the engine, so this
  // can run unconditionally.
  useEffect(() => {
    engineRef.current.startEngine();
    return () => {
      engineRef.current.stopEngine();
    };
  }, []);

  // Deterministic coin layout for this track. Built from the same seed the track
  // and physics use, so an online opponent (same match seed) sees the identical
  // coins even though each player collects independently.
  const coins = useMemo(() => buildRaceCoins(seed, raceDistance), [seed, raceDistance]);
  const [coinsCollected, setCoinsCollected] = useState(0);

  // Key the seeded sequence on the SET of chapters (a stable string), so an
  // online snapshot handing back a fresh-but-equal chapterIds array on each
  // frequent position update never rebuilds the order mid-race.
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
  // One rendered (eased) car per opponent, keyed by id; rebuilt each frame by the
  // loop. Seeded from the opponent list at the start line so every rival shows up
  // immediately (and renders even in tests, where the rAF loop is stubbed inert).
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

  // The simulation loop reads/writes through refs so 60fps updates never depend
  // on stale render closures. State mirrors are kept only for rendering.
  const playerCarRef = useRef(playerCar);
  // Eased on-screen X per opponent id, so each opponent's frequent (~150ms)
  // online samples track smoothly instead of stepping (persists across renders
  // as opponents update).
  const displayedOpponentXRef = useRef<Map<string, number>>(new Map());
  const playerFinishedRef = useRef(false);
  // Fires onOpponentFinish exactly once, for the FIRST opponent to finish (bot
  // mode uses this as the "you lost" signal; online mode ignores it).
  const opponentFinishFiredRef = useRef(false);
  const finishedAtRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  // Timestamp (rAF/performance clock, ms) up to which the engine level gets a
  // short "rev" boost after a correct answer. 0 = no rev pending.
  const engineRevUntilRef = useRef(0);

  // Latest props the loop must call, refreshed every render (refs, not state, so
  // they never restart the loop). `opponentsRef` lets the loop read the current
  // opponent list (and each one's controller) without re-subscribing when a new
  // snapshot arrives.
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

  // Coin pickup bookkeeping, all loop-owned (refs) so the 60fps detection never
  // re-credits across stale renders. `collectedCoinsRef` is the authoritative
  // credited set (the guard that makes each coin pay out exactly once); the
  // count is mirrored to state only for the HUD.
  const coinsRef = useRef(coins);
  const collectedCoinsRef = useRef<Set<number>>(new Set());
  const addCoinsRef = useRef(addCoins);
  coinsRef.current = coins;
  addCoinsRef.current = addCoins;

  // Live driver input read by the loop. Refs (not state) so the 60fps read never
  // depends on a stale closure and toggling them never restarts the loop.
  const throttleHeldRef = useRef(false);
  const questionOpenRef = useRef(false);
  const autoAccelerateRef = useRef(autoAccelerate);
  questionOpenRef.current = phase === 'refuel';
  autoAccelerateRef.current = autoAccelerate;

  // The single race loop. Restarts only if the track itself changes.
  useEffect(() => {
    // A track change (new race) is a fresh coin run: clear the credited set and
    // the HUD tally so coins can be collected again on the new course.
    collectedCoinsRef.current = new Set();
    setCoinsCollected(0);

    let frameId = 0;
    lastFrameRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const loop = (now: number) => {
      const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - lastFrameRef.current) / 1000));
      lastFrameRef.current = now;

      if (!playerFinishedRef.current) {
        // Auto mode burns whenever fuelled (stepCar still gates on fuel > 0);
        // manual mode only burns while the player holds the accelerator AND
        // isn't busy answering in the refuel popup.
        const accelerating = autoAccelerateRef.current
          ? true
          : throttleHeldRef.current && !questionOpenRef.current;
        const next = stepCar(playerCarRef.current, dt, seed, accelerating);
        playerCarRef.current = next;
        setPlayerCar(next);
      }

      // Engine sound: feed the continuous drone a 0..1 level derived from the
      // car's current speed, so its pitch glides smoothly up and down with the
      // car (one sustained oscillator, never per-frame blips). A finished car is
      // silenced to idle (level 0); a recent correct answer adds a brief rev
      // boost on top of the speed-derived level.
      const normalized = playerFinishedRef.current
        ? 0
        : Math.min(1, Math.max(0, playerCarRef.current.velocity / MAX_SPEED));
      const revving = !playerFinishedRef.current && now < engineRevUntilRef.current;
      engineRef.current.setEngineLevel(
        revving ? Math.min(1, normalized + ENGINE_REV_BOOST) : normalized,
      );

      // Coin pickups: credit every un-collected coin the player has now reached.
      // The car only moves forward and coins are sorted, so we scan from the
      // front and stop at the first coin still ahead; the Set guard ensures each
      // coin pays out exactly once even though the loop runs every frame.
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

      // Step + read EVERY opponent, easing each rendered position toward its
      // latest target so the frequent (~150ms) online sample updates glide
      // instead of stepping. The eased X is kept per opponent id so a snapshot
      // reordering the list never swaps two cars' smoothing state.
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

      // Forget eased lanes for opponents that vanished (defensive — the roster is
      // frozen once racing, but a list change must not leak stale smoothing).
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
      // Correct → bank fuel (unchanged behaviour).
      const refuelled = addFuel(playerCarRef.current, FUEL_PER_CORRECT);
      playerCarRef.current = refuelled;
      setPlayerCar(refuelled);
      // Same cue the lessons use for a right answer…
      soundRef.current.playEffect('correct');
      // …plus a short engine rev: open a brief boost window the rAF loop reads,
      // so the continuous drone winds up toward full for a beat (the surge of
      // fresh fuel the car is about to spend) then settles back to the
      // speed-derived level. Uses the same clock the loop compares against.
      engineRevUntilRef.current =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) + ENGINE_REV_MS;
    } else {
      // Wrong → instantly kill ALL current speed. The car keeps its position and
      // fuel; it just stalls and must build its speed back up. We write the ref
      // FIRST (the rAF loop reads playerCarRef.current each frame, so the very
      // next frame steps forward from a dead stop) and mirror it into state so the
      // HUD speedometer drops to 0 immediately.
      const stopped: CarState = { ...playerCarRef.current, velocity: 0 };
      playerCarRef.current = stopped;
      setPlayerCar(stopped);
      // Same cue the lessons use for a wrong answer (the car also stalls).
      soundRef.current.playEffect('incorrect');
    }
    // Racing feeds the XP economy (XP + daily streak, works signed-in or not) but
    // grants NO coins for answering: the race's coins come SOLELY from driving over
    // the collectible coins on the track (addCoins in the rAF loop above). Passing
    // awardCoins:false keeps XP/streak intact while suppressing the per-answer coins
    // — Practice/lessons keep the default coins-on path.
    awardRef.current(isCorrect, { awardCoins: false });
    setAnswerResult(isCorrect ? 'correct' : 'incorrect');
  }, [answerResult, currentQuestion, selectedChoiceId]);

  // Advancing is fully manual: after submitting, the feedback (and the correct
  // answer on a miss) stays up until the player explicitly clicks "Next question".
  // There is deliberately no auto-advance timer.
  const handleNextQuestion = useCallback(() => {
    setSelectedChoiceId('');
    setAnswerResult(null);
    setQuestionIndex((index) => index + 1);
  }, []);

  // ----- Driver input: hold-to-accelerate + the Refuel popup toggle -----
  const refuelButtonRef = useRef<HTMLButtonElement>(null);

  // Mouse/touch press on the stage BACKGROUND starts thrust (the surface is wired
  // below the controls so pressing a button never revs the engine). Ignored while
  // auto-accelerating or while answering in the popup.
  const beginThrottle = useCallback(() => {
    if (autoAccelerateRef.current || questionOpenRef.current) {
      return;
    }
    throttleHeldRef.current = true;
  }, []);

  const openRefuel = useCallback(() => {
    // Drop any held throttle: opening the popup means the player is answering,
    // so the car should coast until they return to driving.
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
      // While refuelling let Space operate the dialog (toggle a choice / press a
      // button); while auto-accelerating manual input is irrelevant. Otherwise
      // Space is the gas, so swallow it to stop the page from scrolling.
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
    // A release ANYWHERE (even off the stage, or a window blur) ends thrust so
    // the accelerator can never stick on after the button/finger is let go.
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

  // Return focus to the prominent Refuel CTA whenever driving mode is (re)entered
  // — initial mount and after "Back to the game" — keeping the flow keyboard-led.
  useEffect(() => {
    if (phase === 'driving') {
      refuelButtonRef.current?.focus();
    }
  }, [phase]);

  // ----- Immersive stage + optional browser Fullscreen API -----
  // The stage is already a full-viewport fixed overlay (the primary "immersive"
  // requirement). The real Fullscreen API is a progressive enhancement: only
  // offered where the browser supports it, and every call is guarded so jsdom
  // (no Fullscreen API) and rejected promises never throw.
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

  // Leave OS fullscreen if the race ends while it's engaged, so the result and
  // lobby screens are never stuck behind a fullscreen frame.
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

      {/* Transparent hold-to-accelerate surface. It floats above the scenery but
          BELOW the HUD, fullscreen toggle, Refuel button and popup, so pressing
          any of those controls never also revs the engine — only the open stage
          drives the car. Keyboard players use Space instead. */}
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

// Trailing-edge status marker shown on an option once the question is answered.
// The SVG is purely decorative (aria-hidden); the outcome is carried by sr-only
// text so the feedback never relies on colour alone for screen-reader users.
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

// Memoized so the 60fps car/track updates in RaceView don't re-render the card;
// its props only change on selection/answer/advance. The markup mirrors
// PracticePage's PracticeQuestionCard so the existing styles apply.
const RaceQuestionCard = memo(function RaceQuestionCard({
  question,
  selectedChoiceId,
  answerResult,
  onSelect,
  onSubmit,
  onNext,
  onBack,
}: RaceQuestionCardProps) {
  // Move focus to the first choice whenever a new question surfaces in the popup
  // (initial mount + each "Next question"), so the dialog is immediately keyboard
  // operable. We key off question.id so a feedback re-render doesn't steal focus
  // mid-answer, and we never trap focus — the player can still tab out to the
  // track's controls.
  const firstChoiceRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstChoiceRef.current?.focus();
  }, [question.id]);

  const answered = Boolean(answerResult);

  return (
    <article className="lesson-player practice-card race-question-card">
      <div className="lesson-step">
        {/* Only the prompt and choices live in this scroll region. The action
            row below is a pinned footer, so Submit/Next and "Back to the game"
            are ALWAYS visible — never hidden behind a scroll. */}
        <div className="race-question-scroll">
          <h2>
            <MathText text={question.prompt} />
          </h2>

          <div className="answer-options" role="radiogroup" aria-label={question.prompt}>
            {question.choices.map((choice, index) => {
              // Feedback is conveyed purely by per-option highlighting (no
              // explanation text). Once answered, the correct choice is ALWAYS
              // marked correct — even on a miss — so the right answer is always
              // revealed; the player's wrong pick is marked incorrect; every
              // other choice dims back to neutral.
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
