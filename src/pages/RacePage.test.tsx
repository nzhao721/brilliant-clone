import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { getChapterLessons } from '../data/lessons';
import { getTodayKey, lessonProgressStorageKey } from '../lessons/lessonProgress';
import { RaceView, type RaceOpponent } from '../race/RaceView';
import { RacePage } from './RacePage';

/* RaceView calls useSound directly; these tests render outside any <SoundProvider>, so stub the hook to no-ops (audio has its own tests). */
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: () => {},
    playCustom: () => {},
    startMusic: () => {},
    stopMusic: () => {},
    /* RaceView drives the engine drone via useSound, so the stub must provide these or handlers throw. */
    startEngine: () => {},
    setEngineLevel: () => {},
    stopEngine: () => {},
    isMuted: false,
    toggleMute: () => {},
    volume: 1,
    setVolume: () => {},
  }),
}));

/* Tiny fixed question bank so the race renders a known prompt; seeded RNG stays real, prompts are plain text so assertions read literally. */
vi.mock('../data/questionBank', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/questionBank')>();
  return {
    ...actual,
    questionBank: [
      {
        id: 'race-q1',
        chapterId: 'limits',
        category: 'sample',
        prompt: 'What is the limit at the start line?',
        choices: [
          { id: 'a', label: 'Zero' },
          { id: 'b', label: 'One' },
        ],
        correctChoiceId: 'a',
        explanation: 'It starts at zero.',
      },
      {
        id: 'race-q2',
        chapterId: 'limits',
        category: 'sample',
        prompt: 'How much fuel does a correct answer give?',
        choices: [
          { id: 'a', label: 'Some' },
          { id: 'b', label: 'None' },
        ],
        correctChoiceId: 'a',
        explanation: 'A correct answer refuels the car.',
      },
    ],
  };
});

function renderRacePage(initialEntries: string[] = ['/race']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <RacePage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/* Bot race draws from the lesson-unlocked pool: completing one 'limits' lesson unlocks that chapter's questions so a bot race can start. (Online is ungated.) */
function completeOneLessonIn(chapterId: string) {
  const firstLesson = getChapterLessons(chapterId)[0];
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: firstLesson ? [firstLesson.id] : [],
      /* Pass today's required practice so the DAILY GATE is INACTIVE here: these
       * tests exercise the bot-race flow, not the gate. A completed lesson with no
       * pass would make the gate active and disable the start buttons (the gated
       * home is covered by its own tests below). */
      requiredPracticePassedDates: [getTodayKey()],
      totalXp: 0,
      totalCoinsEarned: 0,
    }),
  );
}

/* A completed lesson with today's required practice UNPASSED → the daily gate is
   active, so the Slipstream home renders with disabled, lock-labeled start buttons. */
function setGatedProgress(chapterId: string) {
  const firstLesson = getChapterLessons(chapterId)[0];
  window.localStorage.setItem(
    lessonProgressStorageKey,
    JSON.stringify({
      completedLessonIds: firstLesson ? [firstLesson.id] : [],
      requiredPracticePassedDates: [],
      totalXp: 0,
      totalCoinsEarned: 0,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  /* Complete one lesson so the bot race can start; the lock-state test clears this to assert the gate. */
  completeOneLessonIn('limits');
  /* Keep the loop inert for deterministic rendering (physics has its own unit tests). */
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RacePage lobby', () => {
  it('offers both a bot and a friend option, with online unavailable when Firebase is off', () => {
    renderRacePage();

    // Bot mode is always playable (pure-local).
    expect(screen.getByRole('button', { name: /play a bot/i })).toBeEnabled();

    /* db is null in tests, so the friend option is disabled and the unavailable note shows. */
    expect(screen.getByRole('button', { name: /play a friend/i })).toBeDisabled();
    expect(screen.getByText(/Online multiplayer is unavailable/i)).toBeInTheDocument();
  });

  it('shows the five bot difficulties after choosing the bot option', async () => {
    const user = userEvent.setup();
    renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));

    expect(screen.getByRole('heading', { name: /race a bot/i })).toBeInTheDocument();
    const difficulties = screen.getByRole('list', { name: /bot difficulty/i });
    expect(difficulties).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beginner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /master/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start race/i })).toBeInTheDocument();
  });

  it('defaults the auto-accelerate toggle to on', async () => {
    const user = userEvent.setup();
    renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));

    /* Auto-drive is the default: the toggle backing autoAccelerate starts checked. */
    expect(screen.getByRole('checkbox', { name: /auto-accelerate/i })).toBeChecked();
  });

  it('starts a bot race in driving mode, then reveals the question after Refuel', async () => {
    const user = userEvent.setup();
    renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    /* Driving mode default: track renders, question hidden behind the Refuel CTA (tank starts empty). */
    expect(screen.getByRole('img', { name: /race track/i })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    const refuel = screen.getByRole('button', { name: /refuel/i });
    expect(refuel).toBeInTheDocument();

    /* The popup reveals the question card; the seeded shuffle picks the prompt, so accept either fixture. */
    await user.click(refuel);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(
      screen.getByText(/What is the limit at the start line\?|How much fuel does a correct answer give\?/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    // …and the popup can be dismissed back to driving.
    expect(screen.getByRole('button', { name: /back to game/i })).toBeInTheDocument();
  });

  it('locks the bot race until a lesson is complete and refuses to start with an empty pool', async () => {
    /* No completed lessons → locked state instead of the difficulty picker / Start. */
    window.localStorage.clear();
    const user = userEvent.setup();
    renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));

    expect(screen.getByText(/complete a lesson to unlock the race/i)).toBeInTheDocument();
    // The bot can't be configured or started while locked.
    expect(screen.queryByRole('list', { name: /bot difficulty/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start race/i })).not.toBeInTheDocument();
    // …and the immersive track never mounts (no race can begin).
    expect(screen.queryByRole('img', { name: /race track/i })).not.toBeInTheDocument();
  });

  it('renders the scrolling track stage and the whole-track minimap during a bot race', async () => {
    const user = userEvent.setup();
    renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    /* The scrolling camera stage renders (a window following the player), not the whole map squished in… */
    expect(screen.getByRole('img', { name: /race track/i })).toBeInTheDocument();
    // …alongside the overview minimap that shows the whole map for comparison.
    expect(screen.getByRole('img', { name: /overview map/i })).toBeInTheDocument();
  });

  it('renders collectible coins on the track and a per-race coin tally', async () => {
    const user = userEvent.setup();
    const { container } = renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    /* The first coin lands in the opening window, so coins draw from the start (rAF inert → parked, none collected). */
    expect(container.querySelectorAll('.race-coin').length).toBeGreaterThan(0);
    // …and the HUD shows the per-race coins-collected tally (zero so far).
    expect(container.querySelector('.race-coins-count')?.textContent).toBe('0');
  });

  it('renders the dashboard speedometer and fuel gauge during a bot race', async () => {
    const user = userEvent.setup();
    renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    /* HUD cluster: a speedometer + fuel gauge, each exposing its value via role="img". Parked at the line (rAF inert) → dead stop, empty tank. */
    expect(screen.getByRole('img', { name: /speed:/i })).toHaveAttribute('aria-label', 'Speed: 0 km/h');
    expect(screen.getByRole('img', { name: /fuel:/i })).toHaveAttribute('aria-label', 'Fuel: 0%');
  });

  it("shows each racer's distance readout in meters beside their name, with no rank ordinal", async () => {
    const user = userEvent.setup();
    const { container } = renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    /* rAF inert → both parked at the line: the distance readout ("<n> / 2500 m") renders beside each name. */
    const playerStanding = container.querySelector(
      '.race-standing-player .race-standing-progress',
    );
    const opponentStanding = container.querySelector(
      '.race-standing-opponent .race-standing-progress',
    );
    expect(playerStanding?.textContent).toBe('0 / 2500 m');
    expect(opponentStanding?.textContent).toBe('0 / 2500 m');

    /* …and no rank ordinal (1st/2nd/…) appears beside a name, on any viewport. */
    expect(container.querySelector('.race-standing-rank')).toBeNull();
  });

  it('hides the hold-to-accelerate hint in auto-accelerate mode (default on)', async () => {
    const user = userEvent.setup();
    const { container } = renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    /* Auto-accelerate ON by default → the manual hold hint doesn't render, but Refuel still does. */
    expect(container.querySelector('.race-accel-hint')).toBeNull();
    expect(screen.getByRole('button', { name: /refuel/i })).toBeInTheDocument();
  });

  it('shows the hold-to-accelerate hint when auto-accelerate is off (manual driving)', async () => {
    const user = userEvent.setup();
    const { container } = renderRacePage();

    await user.click(screen.getByRole('button', { name: /play a bot/i }));
    // Turn auto-accelerate OFF before starting, so the player drives manually.
    await user.click(screen.getByRole('checkbox', { name: /auto-accelerate/i }));
    await user.click(screen.getByRole('button', { name: /start race/i }));

    const hint = container.querySelector('.race-accel-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toMatch(/accelerate/i);
  });
});

describe('RacePage daily gate (Slipstream home)', () => {
  it('renders the Slipstream home but DISABLES the start buttons (labeled to unlock) while the daily gate is active', () => {
    setGatedProgress('limits');
    renderRacePage();

    // The race HOME renders even while gated (the /race route isn't behind
    // DailyGateRoute); the banner funnels the learner to /practice.
    expect(screen.getByRole('heading', { name: /race to the finish/i })).toBeInTheDocument();

    // The SHARED daily-gate banner funnels the learner to the required practice.
    expect(screen.getByText('Daily practice required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start required practice' })).toHaveAttribute(
      'href',
      '/practice',
    );

    // Both START buttons are GRAYED OUT / disabled and labeled to unlock (same
    // pattern as the arcade play buttons).
    const lockedButtons = screen.getAllByRole('button', {
      name: 'Complete daily practice to unlock',
    });
    expect(lockedButtons).toHaveLength(2);
    for (const button of lockedButtons) {
      expect(button).toBeDisabled();
    }

    // The normal start labels are gone while gated (no way to begin a race).
    expect(screen.queryByRole('button', { name: /play a bot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play a friend/i })).not.toBeInTheDocument();
  });

  it('re-enables the start buttons once today\u2019s required practice is passed', () => {
    // Completed lesson WITH today's gate passed → not gated.
    completeOneLessonIn('limits');
    renderRacePage();

    // No banner, no lock labels, and the bot start button is back/enabled.
    expect(screen.queryByText('Daily practice required')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Complete daily practice to unlock' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play a bot/i })).toBeEnabled();
  });
});

describe('RaceView question popup stability', () => {
  /* The rAF loop re-renders RaceView every frame; the popup must stay a stable subtree or its pop-in restarts and flickers. Drives a controllable rAF and asserts it's never remounted. */
  const stationaryOpponents: RaceOpponent[] = [
    {
      id: 'rival',
      name: 'Rival',
      color: '#ff5a4d',
      controller: {
        step: () => {},
        getCar: () => ({ position: 0, velocity: 0, finished: false }),
      },
    },
  ];

  /* chapterIds defaults to a non-empty bot-style pool; pass [] to exercise the online "full bank" sentinel. */
  function renderRaceView(chapterIds: string[] = ['limits']) {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <RaceView
            seed={7}
            chapterIds={chapterIds}
            raceDistance={250}
            playerName="You"
            opponents={stationaryOpponents}
          />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('builds the pool from the FULL bank when chapterIds is empty (online, ungated)', () => {
    /* Empty chapter list = the "whole bank" sentinel, so online is never locked and a question renders from the full bank. */
    renderRaceView([]);

    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(
      screen.getByText(
        /What is the limit at the start line\?|How much fuel does a correct answer give\?/,
      ),
    ).toBeInTheDocument();
  });

  it('keeps the open question popup mounted across many animation frames', () => {
    /* Controllable rAF: collect callbacks and flush on demand to step frame-by-frame (overrides the inert stub). */
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const stepOneFrame = (timeMs: number) => {
      const due = frames.splice(0, frames.length);
      act(() => {
        for (const cb of due) cb(timeMs);
      });
    };

    renderRaceView();

    // Open the popup, then capture the rendered card node.
    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));
    const cardBefore = document.querySelector('.race-question-card');
    expect(cardBefore).not.toBeNull();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();

    /* Drive ~40 frames; the player stays parked while answering, so the race can't finish and unmount the card. */
    for (let i = 1; i <= 40; i += 1) {
      stepOneFrame(i * 16);
    }

    /* Same DOM node ⇒ reconciled in place, not rebuilt per frame (a remount would be a new node + restart pop-in). */
    expect(document.querySelector('.race-question-card')).toBe(cardBefore);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();

    // Behaviour intact: "Back to game" closes the popup back to driving.
    fireEvent.click(screen.getByRole('button', { name: /back to game/i }));
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refuel/i })).toBeInTheDocument();
  });

  it('marks the correct option and refuels when a correct answer is submitted', () => {
    // rAF stays inert (beforeEach), so this isolates the answer flow.
    renderRaceView();

    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));

    /* Tank starts empty; the fuel gauge exposes its level in its accessible name, e.g. "Fuel: 0%". */
    const fuelPercent = () => {
      const label = screen.getByRole('img', { name: /fuel:/i }).getAttribute('aria-label') ?? '';
      return Number(label.match(/(\d+)/)?.[1] ?? 'NaN');
    };
    expect(fuelPercent()).toBe(0);

    // Both fixtures list the correct choice first, so the first radio is correct.
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    /* Per-option feedback: the correct choice is flagged with a non-colour-only cue — no alert banner or explanation text. */
    expect(screen.getAllByRole('radio')[0].closest('.answer-option')).toHaveClass('is-correct');
    expect(screen.getByText('Correct answer')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/It starts at zero|A correct answer refuels the car/),
    ).not.toBeInTheDocument();

    /* A correct answer refuels (gauge climbs off zero) and the Next control appears. */
    expect(fuelPercent()).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument();
  });

  it('highlights BOTH the wrong pick (red) and the correct answer (green) on a miss', () => {
    /* rAF inert; the correct choice is first, so the second radio is wrong. Submitting it marks the pick incorrect AND reveals the correct choice at once (global option styles). */
    renderRaceView();

    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));

    fireEvent.click(screen.getAllByRole('radio')[1]);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    const radios = screen.getAllByRole('radio');
    expect(radios[1].closest('.answer-option')).toHaveClass('is-incorrect');
    expect(radios[0].closest('.answer-option')).toHaveClass('is-correct');
    // Accessible, non-colour-only cues are present for BOTH states.
    expect(screen.getByText('Your answer, incorrect')).toBeInTheDocument();
    expect(screen.getByText('Correct answer')).toBeInTheDocument();
  });

  it('grants fuel + XP for a correct answer but NEVER coins (coins come only from collectibles)', () => {
    /* rAF inert → parked, no collectibles; answering is the only reward path here and must grant fuel + XP but zero coins. */
    const { container } = renderRaceView();

    const fuelPercent = () => {
      const label = screen.getByRole('img', { name: /fuel:/i }).getAttribute('aria-label') ?? '';
      return Number(label.match(/(\d+)/)?.[1] ?? 'NaN');
    };

    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));
    expect(fuelPercent()).toBe(0);

    // Answer correctly (the correct choice is listed first in both fixtures).
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    // Fuel IS granted by the correct answer…
    expect(fuelPercent()).toBeGreaterThan(0);

    // …and XP is preserved (the race still feeds the XP/streak economy)…
    const progress = JSON.parse(
      window.localStorage.getItem('brilliant-clone.completed-lessons') ?? '{}',
    );
    expect(progress.totalXp).toBeGreaterThan(0);

    /* …but answering earns no coins: lifetime coins stay 0, the granted-coins ledger is never written, and the per-race tally stays zero. */
    expect(progress.totalCoinsEarned ?? 0).toBe(0);
    expect(window.localStorage.getItem('brilliant-clone.coins-granted')).toBeNull();
    expect(container.querySelector('.race-coins-count')?.textContent).toBe('0');
  });

  it('requires an explicit Next click to advance — it never auto-advances', () => {
    /* Freeze time AND keep rAF inert, so advancing the clock can't move the car or schedule frames; isolates answer→advance. */
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    try {
      renderRaceView();

      fireEvent.click(screen.getByRole('button', { name: /refuel/i }));

      // Answer (the correct choice is listed first in both fixtures), then submit.
      fireEvent.click(screen.getAllByRole('radio')[0]);
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));

      /* Per-option feedback (the correct choice is flagged) + an explicit Next control appear. */
      const correctOption = () => screen.getAllByRole('radio')[0].closest('.answer-option');
      const next = screen.getByRole('button', { name: /^next$/i });
      expect(correctOption()).toHaveClass('is-correct');

      /* Let time pass: with no auto-advance the question must not move on — feedback + Next persist, Submit doesn't return. */
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(correctOption()).toHaveClass('is-correct');
      expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();

      /* Only the explicit click advances: the feedback clears and Submit returns for the next question. */
      fireEvent.click(next);
      expect(correctOption()).not.toHaveClass('is-correct');
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the displayed speed to a dead stop on an incorrect answer', () => {
    /* Controllable rAF (overrides the inert stub) builds real speed deterministically, then checks a wrong answer zeroes it. Physics is pure (state, dt, seed), so fixed 16ms steps are repeatable — not wall-clock. */
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    let now = 0;
    const advanceFrames = (count: number) => {
      for (let i = 0; i < count; i += 1) {
        now += 16;
        const due = frames.splice(0, frames.length);
        act(() => {
          for (const cb of due) cb(now);
        });
      }
    };

    const { container } = renderRaceView();

    // The speedometer surfaces the live (rounded) speed in its accessible name.
    const speed = () => {
      const label = screen.getByRole('img', { name: /speed:/i }).getAttribute('aria-label') ?? '';
      return Number(label.match(/(\d+)/)?.[1] ?? 'NaN');
    };

    /* 1) Earn fuel so the car can move: answer Q1 correctly, advance, return to driving. */
    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to game/i }));

    /* 2) Hold the accelerator (press-and-hold the stage) and run frames to build up genuine speed. */
    const accelSurface = container.querySelector('.race-accel-surface');
    expect(accelSurface).not.toBeNull();
    fireEvent.mouseDown(accelSurface as Element);
    advanceFrames(45);
    expect(speed()).toBeGreaterThan(0);

    /* 3) Open the popup and submit a wrong answer; no frames run between, so the built-up speed is what gets zeroed. */
    fireEvent.click(screen.getByRole('button', { name: /refuel/i }));
    fireEvent.click(screen.getAllByRole('radio')[1]);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    // The wrong answer instantly kills all speed: the speedometer reads 0.
    expect(speed()).toBe(0);
  });
});
