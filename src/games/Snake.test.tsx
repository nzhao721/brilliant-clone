import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The shared sound engine is finalized in parallel; stub it so Snake (via the
// useGameSound helper) renders without a SoundProvider in the tree and every
// audio call becomes an inert no-op.
vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: () => {},
    playCustom: () => {},
    startMusic: () => {},
    stopMusic: () => {},
    isMuted: false,
    toggleMute: () => {},
    volume: 1,
    setVolume: () => {},
  }),
}));

import { COLS, ROWS, Snake, initialFood, initialSnake, pickFood, type Cell } from './Snake';

// Mirror of the component's interval tick so the collision test can advance an
// exact number of ticks. Kept in sync with TICK_MS in Snake.tsx.
const TICK_MS = 130;

// jsdom has no real 2D canvas; forcing getContext to null keeps draw() a no-op
// and silences the "not implemented" noise without affecting the logic we test.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('Snake', () => {
  it('mounts inactive without crashing and exposes a focusable board', () => {
    const { getByRole, unmount } = render(
      <Snake active={false} onScoreChange={() => {}} onGameOver={() => {}} />,
    );

    expect(getByRole('application')).toBeInTheDocument();
    unmount();
  });

  it('starts a fresh game and reports score 0 when active', () => {
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <Snake active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    expect(onScoreChange).toHaveBeenCalledWith(0);
    expect(onGameOver).not.toHaveBeenCalled();
    unmount();
  });

  it('clears its tick loop when toggled inactive', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');

    const { rerender, unmount } = render(
      <Snake active onScoreChange={() => {}} onGameOver={() => {}} />,
    );
    rerender(<Snake active={false} onScoreChange={() => {}} onGameOver={() => {}} />);

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    unmount();
  });
});

describe('Snake window-level steering', () => {
  // The board reseeds food via pickFood() on every start, so pin Math.random so
  // food lands at (6,4) — squarely in the snake's initial rightward path — making
  // the steering assertions deterministic instead of RNG-dependent.
  it('eats the food running straight after the opening key press (baseline for the steering test)', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onScoreChange = vi.fn();
    try {
      const { unmount } = render(
        <Snake active onScoreChange={onScoreChange} onGameOver={vi.fn()} />,
      );

      // The snake starts parked; the opening Right press launches it along its
      // default heading toward the food at (6,4), which it reaches on the 2nd
      // tick to score 1.
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 2);
      });
      expect(onScoreChange).toHaveBeenCalledWith(1);
      unmount();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('steers from an arrow key dispatched on window, with nothing focused', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onScoreChange = vi.fn();
    try {
      const { unmount } = render(
        <Snake active onScoreChange={onScoreChange} onGameOver={vi.fn()} />,
      );

      // Drop any focus the board took, then dispatch on window. An element-scoped
      // handler could never receive this, so the resulting launch proves steering
      // is bound at the window level — playable without clicking the board first.
      act(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      // This is also the opening input, so it starts the snake moving Down.
      fireEvent.keyDown(window, { key: 'ArrowDown' });

      act(() => {
        vi.advanceTimersByTime(TICK_MS * 2);
      });

      // Launched away from the food at (6,4), the snake never reaches it: still 0.
      expect(onScoreChange).toHaveBeenCalledWith(0);
      expect(onScoreChange).not.toHaveBeenCalledWith(1);
      unmount();
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('Snake waits for the first input before moving', () => {
  // Food spawns deterministically at (6,4) via initialFood(); a snake moving
  // right from the centre would eat it on the 2nd tick (score 1) and then run
  // into the right wall a few ticks later (game over). A parked snake triggers
  // neither — that's how these tests detect "did it move?" without reaching into
  // the component's internal cell state.
  it('stays stationary across many ticks while no key has been pressed', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();
    try {
      const { unmount } = render(
        <Snake active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
      );

      // Far more ticks than it would take a moving snake to eat and then crash.
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 12);
      });

      // Reports the fresh-game 0 but never advances: no food eaten, no collision.
      expect(onScoreChange).toHaveBeenCalledWith(0);
      expect(onScoreChange).not.toHaveBeenCalledWith(1);
      expect(onGameOver).not.toHaveBeenCalled();
      unmount();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('begins moving only after the first arrow key, in the pressed direction', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onScoreChange = vi.fn();
    try {
      const { unmount } = render(
        <Snake active onScoreChange={onScoreChange} onGameOver={vi.fn()} />,
      );

      // Idle ticks first: still parked, hasn't touched the food.
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 3);
      });
      expect(onScoreChange).not.toHaveBeenCalledWith(1);

      // First press launches it Right, straight at the food: eaten on tick 2.
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 2);
      });
      expect(onScoreChange).toHaveBeenCalledWith(1);
      unmount();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('ignores an opening press straight back into its body (180°) and keeps waiting', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();
    try {
      const { unmount } = render(
        <Snake active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
      );

      // The snake spawns facing right with its body to the left, so an opening
      // Left would be an instant self-collision. It must be ignored, leaving the
      // game parked rather than starting (and dying).
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 12);
      });
      expect(onGameOver).not.toHaveBeenCalled();
      expect(onScoreChange).not.toHaveBeenCalledWith(1);

      // A valid direction afterward still starts the run normally.
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 2);
      });
      expect(onScoreChange).toHaveBeenCalledWith(1);
      unmount();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('returns to the stationary wait state when the session restarts', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onScoreChange = vi.fn();
    try {
      const { rerender, unmount } = render(
        <Snake active onScoreChange={onScoreChange} onGameOver={vi.fn()} />,
      );

      // Start and eat once.
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 2);
      });
      expect(onScoreChange).toHaveBeenCalledWith(1);

      // Restart: deactivate then reactivate (mirrors GameShell replaying a run).
      rerender(<Snake active={false} onScoreChange={onScoreChange} onGameOver={vi.fn()} />);
      onScoreChange.mockClear();
      rerender(<Snake active onScoreChange={onScoreChange} onGameOver={vi.fn()} />);

      // Fresh game reports 0 and is parked again: no movement without a new press.
      expect(onScoreChange).toHaveBeenCalledWith(0);
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 12);
      });
      expect(onScoreChange).not.toHaveBeenCalledWith(1);
      unmount();
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe('Snake 9x9 board', () => {
  it('uses a 9x9 grid (9 cells wide by 9 cells tall)', () => {
    expect(COLS).toBe(9);
    expect(ROWS).toBe(9);
  });

  it('spawns a centered, in-bounds 3-segment snake with no self-overlap', () => {
    const snake = initialSnake();
    const midRow = Math.floor(ROWS / 2);

    expect(snake).toHaveLength(3);
    // The head sits on the centre cell, the body trails along the centre row.
    expect(snake[0]).toEqual({ x: Math.floor(COLS / 2), y: midRow });

    for (const seg of snake) {
      expect(seg.x).toBeGreaterThanOrEqual(0);
      expect(seg.x).toBeLessThan(COLS);
      expect(seg.y).toBeGreaterThanOrEqual(0);
      expect(seg.y).toBeLessThan(ROWS);
      expect(seg.y).toBe(midRow);
    }

    // No two segments occupy the same cell.
    const cells = new Set(snake.map((c) => `${c.x},${c.y}`));
    expect(cells.size).toBe(snake.length);
  });

  it('places the initial food inside the bounds and clear of the snake', () => {
    const food = initialFood();

    expect(food.x).toBeGreaterThanOrEqual(0);
    expect(food.x).toBeLessThan(COLS);
    expect(food.y).toBeGreaterThanOrEqual(0);
    expect(food.y).toBeLessThan(ROWS);

    const onSnake = initialSnake().some((c) => c.x === food.x && c.y === food.y);
    expect(onSnake).toBe(false);
  });

  it('only ever spawns food inside the 9x9 bounds and never on the snake', () => {
    const snake = initialSnake();
    const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));

    // Sweep the RNG across the whole [0,1) range to exercise every free cell.
    for (let i = 0; i < 200; i += 1) {
      const r = i / 200; // 0 .. 0.995
      const food = pickFood(snake, () => r);
      expect(food).not.toBeNull();

      const f = food as Cell;
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThan(COLS);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThan(ROWS);
      expect(occupied.has(`${f.x},${f.y}`)).toBe(false);
    }
  });

  it('reports no free cell for food once the snake fills the whole board', () => {
    const full: Cell[] = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) full.push({ x, y });
    }

    expect(full).toHaveLength(COLS * ROWS);
    expect(full).toHaveLength(81);
    expect(pickFood(full)).toBeNull();
  });

  it('ends the game on the 9x9 wall, one tick after the snake reaches the last column', () => {
    vi.useFakeTimers();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <Snake active onScoreChange={() => {}} onGameOver={onGameOver} />,
    );

    // The snake spawns centered (head x=4). The opening Right press launches it
    // along its row; on a 9-wide board it then travels through x=5,6,7,8 (all
    // in-bounds) and only hits the wall at x=9 on the 5th tick — i.e. the right
    // edge is COLS=9, not the old 17.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 4);
    });
    expect(onGameOver).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(onGameOver).toHaveBeenCalledTimes(1);

    unmount();
  });
});
