import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../lib/firebase';
import { lessons } from '../data/lessons';
import { getUnlockedChapterIds } from '../lessons/unlockedChapters';
import { useLessonProgress } from '../lessons/lessonProgress';
import { resolveLeaderboardDisplayName } from '../leaderboard/leaderboardData';
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_LABELS,
  type BotDifficulty,
  type BotState,
  createBot,
  stepBot,
} from '../race/raceBot';
import { resolveWinner, type PlayerSnapshot } from '../race/raceMatch';
import { type CarState, hasFinished, RACE_DISTANCE } from '../race/racePhysics';
import { BOT_CAR_COLOR, PLAYER_CAR_COLOR, opponentCarColor } from '../race/raceColors';
import {
  RaceView,
  type OpponentController,
  type RaceFinishSnapshot,
  type RaceOpponent,
} from '../race/RaceView';
import { useRaceMatch } from '../race/useRaceMatch';
import './RacePage.css';

// ---------------------------------------------------------------------------
// RacePage — orchestrates the Slipstream race phases and supplies the mode-specific
// opponent LIST to the shared RaceView:
//   • LOBBY  — choose bot vs friend; bot picks a difficulty; friend creates or
//              joins a room (disabled, with an explanation, when Firebase is off).
//              An online room is host-controlled: any number of players join by
//              code while it's `waiting`, then the HOST explicitly starts it.
//   • RACE   — render RaceView with a single bot controller (local sim) or one
//              online controller per remote player (Firestore snapshots).
//   • RESULT — ranked finish order (you + every opponent) + rematch.
// Bot mode is pure-local and works even when Firebase is unconfigured; online
// mode degrades gracefully behind useRaceMatch().error.
// ---------------------------------------------------------------------------

type Screen = 'choose' | 'bot-setup' | 'friend-lobby' | 'race' | 'result';
type Mode = 'bot' | 'online';

type BotOutcome = {
  outcome: 'win' | 'lose';
  playerPosition: number;
  opponentPosition: number;
};

/**
 * The local player's OPTIMISTIC online finish. Recorded the instant the player's
 * car crosses the line so the result screen can show immediately (and read "You
 * win!") WITHOUT waiting on the Firestore write -> claimWinner -> snapshot
 * round-trip. `at` is the crossing time (also stamped into the finish write) used
 * to reconcile the true earliest finisher.
 */
type OnlineFinish = {
  at: number;
  playerPosition: number;
};

/** One ranked row on the result screen (works for both bot and N-player races). */
type ResultRow = {
  id: string;
  name: string;
  meters: number;
  finished: boolean;
  isYou: boolean;
};

const REST_CAR: CarState = { position: 0, velocity: 0, fuel: 0 };

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function RacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { matchId } = useParams();
  const race = useRaceMatch();
  const onlineAvailable = Boolean(db);
  const playerName = resolveLeaderboardDisplayName(user);

  // ONLY the bot race is gated, and by LESSONS: a chapter's questions unlock once
  // the player has completed >=1 lesson in it, so the pool widens as they learn.
  // `botChapterIds` is the union of those chapters; with none, the bot race stays
  // locked (no questions to burn for fuel). Online mode is NOT gated — it always
  // races the full bank — so it never consults these.
  const { completedLessonIds } = useLessonProgress(lessons, user?.uid);
  const botChapterIds = useMemo(
    () => getUnlockedChapterIds(completedLessonIds),
    [completedLessonIds],
  );
  const canStartBotRace = botChapterIds.length > 0;

  const [screen, setScreen] = useState<Screen>('choose');
  const [mode, setMode] = useState<Mode | null>(null);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(BOT_DIFFICULTIES[0]);
  const [seed, setSeed] = useState(0);
  const [botOutcome, setBotOutcome] = useState<BotOutcome | null>(null);
  // Set the moment the local player crosses the line online, so the result screen
  // appears instantly (optimistically) instead of waiting for the server to crown
  // a winner. Reconciled against the authoritative winner once it round-trips.
  const [onlineFinish, setOnlineFinish] = useState<OnlineFinish | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  // Friend-lobby async feedback. `creating`/`joining` flip the instant the
  // Create/Join button is clicked so the (multi-hundred-ms, sometimes multi-second
  // cold) Firestore write shows a spinner + disabled button instead of looking
  // frozen. `lobbyActionError` is a guaranteed user-facing fallback so a failed
  // create/join is NEVER silent, even if the hook somehow returns without setting
  // its own `error`.
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [lobbyActionError, setLobbyActionError] = useState<string | null>(null);
  // ON (default) = the car drives itself while it has fuel; OFF = manual
  // hold-to-accelerate. Chosen in the lobby and threaded into RaceView for both modes.
  const [autoAccelerate, setAutoAccelerate] = useState(true);

  const botRef = useRef<BotState | null>(null);
  const botOutcomeClaimedRef = useRef(false);
  const autoJoinRef = useRef(false);
  // The loop reads the freshest opponent snapshots through this ref (keyed by uid
  // inside each opponent's controller below), so frequent position updates never
  // have to rebuild the controller list.
  const opponentsSnapshotRef = useRef<PlayerSnapshot[]>(race.opponents);
  opponentsSnapshotRef.current = race.opponents;

  // Bot opponent: steps a local BotState in the shared physics each frame.
  const botController = useMemo<OpponentController>(
    () => ({
      step: (dtSeconds) => {
        if (botRef.current) {
          botRef.current = stepBot(botRef.current, dtSeconds, seed);
        }
      },
      getCar: () => {
        const car = botRef.current?.car ?? REST_CAR;
        return {
          position: car.position,
          velocity: car.velocity,
          finished: hasFinished(car, RACE_DISTANCE),
        };
      },
    }),
    [seed],
  );

  // Bot mode flows through the SAME opponent-list path as online — it just has a
  // single entry (the bot), in the classic accent red.
  const botOpponents = useMemo<RaceOpponent[]>(
    () => [
      {
        id: 'bot',
        name: `${BOT_DIFFICULTY_LABELS[difficulty]} bot`,
        color: BOT_CAR_COLOR,
        controller: botController,
      },
    ],
    [botController, difficulty],
  );

  // Online opponents: one entry per remote player, each with a stable per-uid
  // colour and a controller that ignores `step` and reads that player's latest
  // Firestore snapshot. Rebuilt only when the SET of opponents (or their names)
  // changes — not on every position update, which getCar reads live.
  const onlineOpponentsKey = race.opponents
    .map((opponent) => `${opponent.uid}:${opponent.displayName}`)
    .join('|');
  const onlineOpponents = useMemo<RaceOpponent[]>(
    () =>
      race.opponents.map((opponent) => ({
        id: opponent.uid,
        name: opponent.displayName || 'Opponent',
        color: opponentCarColor(opponent.uid),
        controller: {
          step: () => {},
          getCar: () => {
            const snapshot = opponentsSnapshotRef.current.find(
              (entry) => entry.uid === opponent.uid,
            );
            return {
              position: snapshot?.position ?? 0,
              velocity: snapshot?.velocity ?? 0,
              finished: snapshot?.finished ?? false,
            };
          },
        },
      })),
    // onlineOpponentsKey captures the opponent set + names; live positions are
    // read from opponentsSnapshotRef so identity-stable controllers don't rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onlineOpponentsKey],
  );

  // Whether the local player has crossed the line online (optimistic finish set).
  const finishedOnline = onlineFinish !== null;

  // True once I've created or joined a room (the live match doc lists me as a
  // participant). Lifted to component scope so the friend lobby renders the
  // waiting room AND a creating/joining spinner can be cleared the moment the
  // room is ready (below) rather than flickering back to the idle button.
  const inRoom = Boolean(race.match && user && race.participants.includes(user.uid));

  // Deep-link: /race/:matchId auto-joins the room and shows the friend lobby.
  useEffect(() => {
    if (!matchId || autoJoinRef.current) {
      return;
    }
    autoJoinRef.current = true;
    setMode('online');
    setScreen('friend-lobby');
    if (onlineAvailable && user) {
      void race.joinMatch(matchId);
    }
  }, [matchId, onlineAvailable, user, race]);

  // Online phase follows the live match status (host starts -> race; done ->
  // result). The local player's OWN finish does NOT wait on this: it transitions
  // optimistically (see handlePlayerFinishOnline). Entering 'racing' clears any
  // stale optimistic finish so a rematch starts clean.
  useEffect(() => {
    if (mode !== 'online') {
      return;
    }
    if (race.status === 'racing') {
      setOnlineFinish(null);
      setScreen('race');
    } else if (race.status === 'finished') {
      setScreen('result');
    }
  }, [mode, race.status]);

  // The live room screen has taken over (create/join succeeded and the match
  // round-tripped), so the create/join request is no longer pending: drop the
  // spinner and any stale lobby error. Keeping `creating`/`joining` true until
  // here (instead of clearing them the instant the write resolves) means the
  // button never flickers back to its idle state in the gap before the room
  // appears.
  useEffect(() => {
    if (inRoom) {
      setCreating(false);
      setJoining(false);
      setLobbyActionError(null);
    }
  }, [inRoom]);

  const goToChoose = useCallback(() => {
    setMode(null);
    setBotOutcome(null);
    setOnlineFinish(null);
    botOutcomeClaimedRef.current = false;
    setJoinCode('');
    setCreating(false);
    setJoining(false);
    setLobbyActionError(null);
    setScreen('choose');
    if (matchId) {
      navigate('/race');
    }
  }, [matchId, navigate]);

  const startBotRace = useCallback(() => {
    // Never start an unfuelable race: with no lesson complete the pool is empty,
    // so the lobby shows the locked state instead (this guards the path too).
    if (botChapterIds.length === 0) {
      return;
    }
    const nextSeed = randomSeed();
    botRef.current = createBot(difficulty, nextSeed);
    botOutcomeClaimedRef.current = false;
    setBotOutcome(null);
    setSeed(nextSeed);
    setMode('bot');
    setScreen('race');
  }, [botChapterIds, difficulty]);

  // First car across the line wins; the synchronous ref guard makes the earliest
  // callback (player is checked first in the loop) the winner even on a tie frame.
  const handleBotPlayerFinish = useCallback((snapshot: RaceFinishSnapshot) => {
    if (botOutcomeClaimedRef.current) {
      return;
    }
    botOutcomeClaimedRef.current = true;
    setBotOutcome({
      outcome: 'win',
      playerPosition: snapshot.playerPosition,
      opponentPosition: snapshot.opponentPosition,
    });
    setScreen('result');
  }, []);

  const handleBotOpponentFinish = useCallback((snapshot: RaceFinishSnapshot) => {
    if (botOutcomeClaimedRef.current) {
      return;
    }
    botOutcomeClaimedRef.current = true;
    setBotOutcome({
      outcome: 'lose',
      playerPosition: snapshot.playerPosition,
      opponentPosition: snapshot.opponentPosition,
    });
    setScreen('result');
  }, []);

  // The local player crossed the line online. Stop the game and show the result
  // IMMEDIATELY — optimistically — instead of waiting on the Firestore write ->
  // claimWinner -> snapshot round-trip:
  //   1. record the optimistic finish (drives the result screen + "You win!"),
  //   2. switch to the result screen NOW (this unmounts RaceView, halting its rAF
  //      loop + engine in the same render),
  //   3. fire the authoritative finish write + winner claim in the background,
  //      stamped with the exact crossing time so the true earliest finisher still
  //      wins. If the server later reveals an opponent crossed first, the result
  //      reconciles to "<opponent> wins" (see renderResult).
  const handlePlayerFinishOnline = useCallback(
    (snapshot: RaceFinishSnapshot) => {
      setOnlineFinish({ at: snapshot.at, playerPosition: snapshot.playerPosition });
      setScreen('result');
      void race.claimFinish(snapshot.at);
    },
    [race],
  );

  async function handleCreateRace() {
    // Guard double-submits: the write is async, so without this a second click
    // while it's in flight would spin up a second (orphaned) match.
    if (creating) {
      return;
    }
    // Online is UNGATED: the match stores an empty chapter list — the "full
    // question bank" sentinel — so both clients build the identical seeded
    // sequence from the whole bank + the shared seed, with no progress lock.
    setMode('online');
    setCopied(false);
    setLobbyActionError(null);
    // Instant feedback: show the spinner + disable the button BEFORE awaiting the
    // Firestore write, so the button never looks frozen/dead.
    setCreating(true);
    try {
      const newCode = await race.createMatch({
        seed: randomSeed(),
        chapterIds: [],
        raceDistance: RACE_DISTANCE,
      });
      if (!newCode) {
        // Create failed (write rejected, not signed in, online unavailable, …).
        // Stop the spinner and ALWAYS surface a reason (prefer the hook's specific
        // `error`, fall back to this) so the click is never a silent no-op.
        setCreating(false);
        setLobbyActionError(
          "Couldn't create the race. Check your connection and that you're signed in, then try again.",
        );
      }
      // On success keep `creating` until the live room screen takes over (see the
      // inRoom effect), so the button doesn't flicker back to idle in the gap
      // before the match round-trips.
    } catch {
      setCreating(false);
      setLobbyActionError(
        "Couldn't create the race. Check your connection and that you're signed in, then try again.",
      );
    }
  }

  async function handleJoinRace() {
    const code = joinCode.trim();
    if (!code || joining) {
      return;
    }
    setMode('online');
    setLobbyActionError(null);
    setJoining(true);
    try {
      const joined = await race.joinMatch(code);
      if (!joined) {
        setJoining(false);
        setLobbyActionError(
          "Couldn't join the race. Check the code and your connection, then try again.",
        );
      }
      // On success keep `joining` until the room screen takes over (inRoom effect).
    } catch {
      setJoining(false);
      setLobbyActionError(
        "Couldn't join the race. Check the code and your connection, then try again.",
      );
    }
  }

  function copyShareLink(link: string) {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clipboard?.writeText) {
      clipboard
        .writeText(link)
        .then(() => setCopied(true))
        .catch(() => undefined);
    }
  }

  function handleRaceAgain() {
    if (mode === 'bot') {
      startBotRace();
      return;
    }
    goToChoose();
  }

  // Locked state shown for the BOT race when no lesson is complete yet: there are
  // no questions to burn for fuel, so it can't start. Online mode is never locked
  // (it always races the full bank). Mirrors Practice's unlock gate wording.
  function renderRaceLocked() {
    return (
      <div className="race-locked" role="status">
        <h2>Complete a lesson to unlock the race.</h2>
        <p>
          The race fuels your car with questions from chapters you have started.
          Complete any lesson to unlock its chapter&apos;s questions and hit the track.
        </p>
        <div className="button-row compact-row">
          <Link className="primary-button" to="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  function renderAutoAccelerateToggle() {
    return (
      <label className="race-auto-toggle">
        <input
          type="checkbox"
          checked={autoAccelerate}
          onChange={(event) => setAutoAccelerate(event.target.checked)}
        />
        <span className="race-auto-toggle-copy">
          <span className="race-auto-toggle-title">Auto-accelerate</span>
          <span className="race-auto-toggle-hint">
            On: the car drives itself whenever it has fuel. Off: hold Space (or click &amp; hold the
            track) to accelerate.
          </span>
        </span>
      </label>
    );
  }

  function renderChoose() {
    return (
      <div className="page-card race-lobby-card">
        <h1>Race to the finish</h1>
        <p className="race-lobby-intro">
          Answer practice questions to burn fuel and out-accelerate your rival. Run dry and
          friction plus the hills drag you to a stop. First car to the line wins.
        </p>
        <div className="race-mode-grid">
          <article className="race-mode-card">
            <h2>Play a bot</h2>
            <p>Race a computer rival across five difficulty levels. Starts instantly — no sign-in needed.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setMode('bot');
                setScreen('bot-setup');
              }}
            >
              Play a bot
            </button>
          </article>

          <article className={`race-mode-card${onlineAvailable ? '' : ' is-disabled'}`}>
            <h2>Play a friend</h2>
            <p>Create a room and share the code, or join a friend&apos;s race. Synced live over the network.</p>
            <button
              type="button"
              className="secondary-button"
              disabled={!onlineAvailable}
              onClick={() => {
                setMode('online');
                setScreen('friend-lobby');
              }}
            >
              Play a friend
            </button>
            {!onlineAvailable ? (
              <p className="race-unavailable">
                {race.error ?? 'Online multiplayer is unavailable.'}
              </p>
            ) : null}
          </article>
        </div>
      </div>
    );
  }

  function renderBotSetup() {
    return (
      <div className="page-card race-lobby-card">
        <button type="button" className="race-back" onClick={goToChoose}>
          ← Back
        </button>
        <h1>Race a bot</h1>
        {canStartBotRace ? (
          <>
            <p>Higher levels are tougher rivals that hold a higher pace.</p>
            <ul className="race-difficulty-grid" aria-label="Bot difficulty">
              {BOT_DIFFICULTIES.map((level) => {
                const selected = level === difficulty;
                return (
                  <li key={level}>
                    <button
                      type="button"
                      className={`race-difficulty${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => setDifficulty(level)}
                    >
                      <span className="race-difficulty-name">{BOT_DIFFICULTY_LABELS[level]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {renderAutoAccelerateToggle()}
            <div className="button-row">
              <button type="button" className="primary-button" onClick={startBotRace}>
                Start race
              </button>
            </div>
          </>
        ) : (
          renderRaceLocked()
        )}
      </div>
    );
  }

  function renderFriendLobby() {
    if (!onlineAvailable) {
      return (
        <div className="page-card race-lobby-card">
          <button type="button" className="race-back" onClick={goToChoose}>
            ← Back
          </button>
          <h1>Race a friend</h1>
          <p className="race-unavailable">{race.error ?? 'Online multiplayer is unavailable.'}</p>
          <p>Online races need a configured Firebase project and sign-in. You can still race a bot.</p>
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setMode('bot');
                setScreen('bot-setup');
              }}
            >
              Play a bot instead
            </button>
          </div>
        </div>
      );
    }

    const match = race.match;

    // Once I've created or joined a room, the lobby becomes the shared waiting
    // room: a live roster of everyone who's joined, the shareable code so more
    // friends can pile in, and either the host's Start control or a "waiting for
    // the host" message. Players may only join WHILE waiting (no mid-race joins).
    if (inRoom && match) {
      const shareLink = `${window.location.origin}/race/${match.code}`;
      const roster = race.participants.map((participantUid) => {
        const snapshot = race.players.find((player) => player.uid === participantUid);
        const isYou = participantUid === user?.uid;
        return {
          uid: participantUid,
          name: snapshot?.displayName || (isYou ? playerName : 'Player'),
          isYou,
          isHost: participantUid === match.hostUid,
          color: isYou ? PLAYER_CAR_COLOR : opponentCarColor(participantUid),
        };
      });
      // Soft requirement: the host can only start once at least one other player
      // has joined — a solo online race is pointless. (No hard upper cap.)
      const canStart = race.isHost && race.participants.length >= 2;

      return (
        <div className="page-card race-lobby-card">
          <button type="button" className="race-back" onClick={goToChoose}>
            ← Back
          </button>
          <h1>Race a friend</h1>

          <div className="race-room" aria-live="polite">
            <span className="race-room-label">Room code</span>
            <span className="race-room-code">{match.code}</span>
            <div className="race-room-link">
              <input
                className="race-room-input"
                readOnly
                value={shareLink}
                aria-label="Shareable race link"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => copyShareLink(shareLink)}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="race-room-hint">Share this code to invite more players. Anyone can join while you wait.</p>
          </div>

          <section className="race-roster" aria-label="Players in this race">
            <h2 className="race-roster-title">
              Players <span className="race-roster-count">{roster.length}</span>
            </h2>
            <ul className="race-roster-list">
              {roster.map((entry) => (
                <li key={entry.uid} className="race-roster-row">
                  <span
                    className="race-roster-dot"
                    aria-hidden="true"
                    style={{ background: entry.color }}
                  />
                  <span className="race-roster-name">
                    {entry.name}
                    {entry.isYou ? <span className="race-roster-badge">You</span> : null}
                  </span>
                  {entry.isHost ? <span className="race-roster-host">Host</span> : null}
                </li>
              ))}
            </ul>
          </section>

          {renderAutoAccelerateToggle()}

          <div className="button-row race-room-actions">
            {race.isHost ? (
              <>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void race.startRace()}
                  disabled={!canStart}
                >
                  Start race
                </button>
                {!canStart ? (
                  <p className="race-waiting">Waiting for at least one more player to join…</p>
                ) : null}
              </>
            ) : (
              <p className="race-waiting">Waiting for the host to start…</p>
            )}
          </div>

          {race.error ? (
            <p className="race-error" role="alert">
              {race.error}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="page-card race-lobby-card">
        <button type="button" className="race-back" onClick={goToChoose}>
          ← Back
        </button>
        <h1>Race a friend</h1>
        {!user ? (
          <p className="race-unavailable">
            <Link to="/login">Sign in</Link> to race a friend online.
          </p>
        ) : null}

        <div className="race-friend-grid">
          <section className="race-friend-panel">
            <h2>Create a race</h2>
            <p>Host a room, then share the code so any number of friends can join.</p>
            <button
              type="button"
              className="primary-button"
              onClick={handleCreateRace}
              disabled={!user || creating}
              aria-busy={creating}
            >
              {creating ? (
                <span className="race-button-loading">
                  <span className="race-spinner" aria-hidden="true" />
                  Creating race…
                </span>
              ) : (
                'Create race'
              )}
            </button>
          </section>

          <section className="race-friend-panel">
            <h2>Join a race</h2>
            <p>Enter a friend&apos;s room code to join their race.</p>
            <form
              className="race-join-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleJoinRace();
              }}
            >
              <label className="sr-only" htmlFor="race-join-code">
                Race code
              </label>
              <input
                id="race-join-code"
                className="race-join-input"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="e.g. ABCDE"
                autoComplete="off"
              />
              <button
                type="submit"
                className="primary-button"
                disabled={!user || !joinCode.trim() || joining}
                aria-busy={joining}
              >
                {joining ? (
                  <span className="race-button-loading">
                    <span className="race-spinner" aria-hidden="true" />
                    Joining…
                  </span>
                ) : (
                  'Join race'
                )}
              </button>
            </form>
          </section>
        </div>

        {renderAutoAccelerateToggle()}

        {(race.error ?? lobbyActionError) ? (
          <p className="race-error" role="alert">
            {race.error ?? lobbyActionError}
          </p>
        ) : null}
      </div>
    );
  }

  function renderRace() {
    if (mode === 'bot') {
      return (
        <RaceView
          key={`bot-${seed}`}
          seed={seed}
          chapterIds={botChapterIds}
          raceDistance={RACE_DISTANCE}
          playerName={playerName}
          playerColor={PLAYER_CAR_COLOR}
          opponents={botOpponents}
          autoAccelerate={autoAccelerate}
          onPlayerFinish={handleBotPlayerFinish}
          onOpponentFinish={handleBotOpponentFinish}
        />
      );
    }

    return (
      <RaceView
        key={`online-${race.match?.code ?? 'pending'}`}
        seed={race.match?.seed ?? 0}
        chapterIds={race.match?.chapterIds ?? []}
        raceDistance={race.match?.raceDistance ?? RACE_DISTANCE}
        playerName={playerName}
        playerColor={PLAYER_CAR_COLOR}
        opponents={onlineOpponents}
        autoAccelerate={autoAccelerate}
        onReportCar={race.reportMyCar}
        onPlayerFinish={handlePlayerFinishOnline}
      />
    );
  }

  function renderResult() {
    const isBot = mode === 'bot';
    const distance = isBot ? RACE_DISTANCE : race.match?.raceDistance ?? RACE_DISTANCE;
    const toMeters = (position: number) => Math.round(Math.max(0, Math.min(distance, position)));

    let rows: ResultRow[];
    let won: boolean;
    let headline: string;

    if (isBot) {
      // Two-racer field (you + the bot), ranked by the local first-to-finish call.
      const botLabel = `${BOT_DIFFICULTY_LABELS[difficulty]} bot`;
      const playerPosition = botOutcome?.playerPosition ?? 0;
      const opponentPosition = botOutcome?.opponentPosition ?? 0;
      won = botOutcome?.outcome === 'win';
      const youRow: ResultRow = {
        id: 'you',
        name: playerName,
        meters: toMeters(playerPosition),
        finished: won || playerPosition >= distance,
        isYou: true,
      };
      const botRow: ResultRow = {
        id: 'bot',
        name: botLabel,
        meters: toMeters(opponentPosition),
        finished: !won || opponentPosition >= distance,
        isYou: false,
      };
      rows = won ? [youRow, botRow] : [botRow, youRow];
      headline = won ? 'You win!' : `${botLabel} wins`;
    } else {
      // N-player field: rank finishers by who crossed first (finishedAt), then the
      // rest by distance covered. The winner is the match's recorded winner, or
      // the earliest finisher as a fallback.
      const meUid = user?.uid ?? null;

      // OPTIMISTIC overlay: the instant the local player crosses, we show the
      // result without waiting for the finish write to round-trip. Until our own
      // finished snapshot comes back, overlay it locally (finished at the recorded
      // crossing time, parked on the line) so the standings + win/lose read right
      // immediately. The authoritative winner (race.match.winnerUid, winner-once)
      // still takes precedence below, so this only fills the brief pre-round-trip
      // gap and reconciles to "<opponent> wins" if the server says they were first.
      let players = race.players;
      if (finishedOnline && onlineFinish && meUid) {
        let sawMe = false;
        players = players.map((player) => {
          if (player.uid !== meUid) {
            return player;
          }
          sawMe = true;
          // Once my real finished snapshot has arrived, trust it over the overlay.
          if (player.finished && typeof player.finishedAt === 'number') {
            return player;
          }
          return {
            ...player,
            finished: true,
            finishedAt: onlineFinish.at,
            position: Math.max(player.position, distance),
          };
        });
        if (!sawMe) {
          players = [
            ...players,
            {
              uid: meUid,
              displayName: playerName,
              position: distance,
              velocity: 0,
              finished: true,
              finishedAt: onlineFinish.at,
            },
          ];
        }
      }

      // Authoritative winner first (winner-once from claimWinner); fall back to
      // the earliest finisher in the (optimistically overlaid) field.
      const winnerUid = race.match?.winnerUid ?? resolveWinner(players);
      const ranked = [...players].sort((a, b) => {
        const aFinished = a.finished && typeof a.finishedAt === 'number';
        const bFinished = b.finished && typeof b.finishedAt === 'number';
        if (aFinished && bFinished) {
          return (a.finishedAt as number) - (b.finishedAt as number);
        }
        if (aFinished) return -1;
        if (bFinished) return 1;
        return b.position - a.position;
      });
      rows = ranked.map((player) => ({
        id: player.uid,
        name: player.uid === meUid ? playerName : player.displayName || 'Opponent',
        meters: toMeters(player.position),
        finished: player.finished,
        isYou: player.uid === meUid,
      }));
      // Optimistic win: I crossed and no one has been crowned yet → "You win!".
      // Reconciles the moment the authoritative winnerUid (or an earlier opponent
      // finish) appears.
      won = winnerUid ? winnerUid === meUid : finishedOnline;
      const winnerName = winnerUid
        ? winnerUid === meUid
          ? playerName
          : players.find((player) => player.uid === winnerUid)?.displayName || 'Your rival'
        : won
          ? playerName
          : null;
      headline = won ? 'You win!' : winnerName ? `${winnerName} wins` : 'Race over';
    }

    return (
      <div className="page-card race-result-card">
        <p className="eyebrow">Race over</p>
        <h1 className={won ? 'race-result-win' : 'race-result-lose'}>{headline}</h1>
        <ol className="race-result-standings">
          {rows.map((row, rank) => (
            <li
              key={row.id}
              className={`race-result-row${row.isYou ? ' is-you' : ''}${
                rank === 0 ? ' is-winner' : ''
              }`}
            >
              <span className="race-result-rank">{rank + 1}</span>
              <span className="race-result-name">
                {row.name}
                {row.isYou ? <span className="race-roster-badge">You</span> : null}
              </span>
              <span className="race-result-distance">
                {row.meters} / {distance} m
                {row.finished ? <span className="race-standing-flag">Finished</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={handleRaceAgain}>
            Race again
          </button>
          <button type="button" className="secondary-button" onClick={goToChoose}>
            Back to lobby
          </button>
          <Link className="secondary-button" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="race-page">
      {screen === 'choose' ? renderChoose() : null}
      {screen === 'bot-setup' ? renderBotSetup() : null}
      {screen === 'friend-lobby' ? renderFriendLobby() : null}
      {screen === 'race' ? renderRace() : null}
      {screen === 'result' ? renderResult() : null}
    </section>
  );
}
