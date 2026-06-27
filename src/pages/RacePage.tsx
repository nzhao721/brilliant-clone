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

/* RacePage — orchestrates Slipstream phases, feeding the mode-specific opponent list to RaceView:
     • LOBBY  — bot vs friend; friend creates/joins a host-controlled room.
     • RACE   — one bot controller or one per remote player.
     • RESULT — ranked finish order + rematch.
   Bot mode is pure-local; online degrades gracefully behind useRaceMatch().error. */

type Screen = 'choose' | 'bot-setup' | 'friend-lobby' | 'race' | 'result';
type Mode = 'bot' | 'online';

type BotOutcome = {
  outcome: 'win' | 'lose';
  playerPosition: number;
  opponentPosition: number;
};

/** Optimistic online finish recorded as the car crosses, so the result shows at once; `at` is the crossing time for reconciliation. */
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

const CREATE_RACE_ERROR =
  "Couldn't create the race. Check your connection and that you're signed in, then try again.";
const JOIN_RACE_ERROR = "Couldn't join the race. Check the code and your connection, then try again.";

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

  /* Only the bot race is gated by lessons: a chapter's questions unlock once a lesson in it is done; none → locked. Online is ungated (full bank). */
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
  /* Set when the local player crosses online → instant result; reconciled with the authoritative winner on round-trip. */
  const [onlineFinish, setOnlineFinish] = useState<OnlineFinish | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  /* Friend-lobby async feedback: creating/joining drive the spinner; lobbyActionError ensures failures aren't silent. */
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [lobbyActionError, setLobbyActionError] = useState<string | null>(null);
  // On (default) = the car drives itself while fuelled; off = manual hold-to-accelerate.
  const [autoAccelerate, setAutoAccelerate] = useState(true);

  const botRef = useRef<BotState | null>(null);
  const botOutcomeClaimedRef = useRef(false);
  const autoJoinRef = useRef(false);
  /* Ref so the loop reads fresh opponent snapshots without rebuilding the controller list. */
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

  // Bot mode uses the same opponent-list path as online — just a single entry.
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

  /* Online opponents: one per remote player, each a stable colour + a controller reading its latest snapshot. Rebuilt only when the set/names change, not on position updates (getCar reads live). */
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
    // onlineOpponentsKey captures the set + names; live positions come from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onlineOpponentsKey],
  );

  // Whether the local player has crossed the line online (optimistic finish set).
  const finishedOnline = onlineFinish !== null;

  // True once I've created or joined a room (the match lists me as a participant).
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

  /* Online phase follows live match status; the local finish transitions optimistically. Entering 'racing' clears it for a clean rematch. */
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

  /* Once in the room, drop the spinner + stale error. Clearing here (not on write resolve) avoids a flicker back to idle. */
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
    // Never start an unfuelable race (empty pool); the lobby shows the locked state.
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

  // First car across wins; the ref guard makes the earliest callback the winner on a tie.
  const claimBotOutcome = useCallback(
    (outcome: BotOutcome['outcome'], snapshot: RaceFinishSnapshot) => {
      if (botOutcomeClaimedRef.current) {
        return;
      }
      botOutcomeClaimedRef.current = true;
      setBotOutcome({
        outcome,
        playerPosition: snapshot.playerPosition,
        opponentPosition: snapshot.opponentPosition,
      });
      setScreen('result');
    },
    [],
  );

  const handleBotPlayerFinish = useCallback(
    (snapshot: RaceFinishSnapshot) => claimBotOutcome('win', snapshot),
    [claimBotOutcome],
  );

  const handleBotOpponentFinish = useCallback(
    (snapshot: RaceFinishSnapshot) => claimBotOutcome('lose', snapshot),
    [claimBotOutcome],
  );

  /* Local player crossed online: show the result optimistically (record finish, switch screen, unmount RaceView), and fire the authoritative write + winner claim in the background (stamped with crossing time, so it reconciles if an opponent was first). */
  const handlePlayerFinishOnline = useCallback(
    (snapshot: RaceFinishSnapshot) => {
      setOnlineFinish({ at: snapshot.at, playerPosition: snapshot.playerPosition });
      setScreen('result');
      void race.claimFinish(snapshot.at);
    },
    [race],
  );

  async function handleCreateRace() {
    /* Guard double-submits: a second click mid-write would orphan a match. */
    if (creating) {
      return;
    }
    /* Online is ungated: an empty chapter list (the "full bank" sentinel) lets both clients build the identical seeded sequence. */
    setMode('online');
    setCopied(false);
    setLobbyActionError(null);
    // Show the spinner before awaiting the write so the button never looks frozen.
    setCreating(true);
    try {
      const newCode = await race.createMatch({
        seed: randomSeed(),
        chapterIds: [],
        raceDistance: RACE_DISTANCE,
      });
      if (!newCode) {
        // Create failed — stop the spinner and always surface a reason.
        setCreating(false);
        setLobbyActionError(CREATE_RACE_ERROR);
      }
      // On success keep `creating` until the room screen takes over (inRoom effect).
    } catch {
      setCreating(false);
      setLobbyActionError(CREATE_RACE_ERROR);
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
        setLobbyActionError(JOIN_RACE_ERROR);
      }
      // On success keep `joining` until the room screen takes over (inRoom effect).
    } catch {
      setJoining(false);
      setLobbyActionError(JOIN_RACE_ERROR);
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

  /* Bot-race locked state when no lesson is complete (no fuel). Online is never locked. Mirrors Practice's gate wording. */
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

    /* In a room, the lobby is the waiting room: live roster, shareable code, and the host's Start or a "waiting" message. */
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
      // The host can only start once at least one other player has joined.
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
      /* N-player field: finishers ranked by finishedAt, the rest by distance. Winner = match's winner, else earliest finisher. */
      const meUid = user?.uid ?? null;

      /* Optimistic overlay: until my finished snapshot round-trips, overlay it locally so standings + win/lose read right now. Authoritative winnerUid still wins below. */
      let players = race.players;
      if (finishedOnline && onlineFinish && meUid) {
        let sawMe = false;
        players = players.map((player) => {
          if (player.uid !== meUid) {
            return player;
          }
          sawMe = true;
          // Once my real finished snapshot arrives, trust it over the overlay.
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

      // Authoritative winner first; fall back to the earliest finisher in the field.
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
      /* Optimistic win: I crossed and no winner yet → "You win!" (reconciles when winnerUid appears). */
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
