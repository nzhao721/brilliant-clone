import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The shared sound engine is finalized in parallel; stub it so the game renders
// without a SoundProvider in the tree and every audio call is an inert no-op.
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

import {
  TetrisGame,
  clearCompletedRows,
  fullRowIndices,
  spawnsInBounds,
  COLS,
  ROWS,
  PIECES,
} from './TetrisGame';

/** A fresh empty board at the current grid size (ROWS x COLS). */
const emptyBoard = () =>
  Array.from({ length: ROWS }, () => new Array(COLS).fill(null));

describe('board dimensions', () => {
  it('uses the reduced 8x16 grid', () => {
    expect(COLS).toBe(8);
    expect(ROWS).toBe(16);
  });

  it('stays wide enough for the 4-long I piece and tall enough for play', () => {
    // Width must fit (and let rotate) the 4-wide I piece; height stays tall.
    expect(COLS).toBeGreaterThanOrEqual(6);
    expect(ROWS).toBeGreaterThanOrEqual(14);
  });

  it('spawns every tetromino centered and fully in-bounds', () => {
    expect(PIECES).toHaveLength(7);
    for (const piece of PIECES) {
      expect(spawnsInBounds(piece)).toBe(true);
    }
  });
});

describe('fullRowIndices', () => {
  it('returns the indices of every fully filled row, top to bottom', () => {
    const board = emptyBoard();
    board[5] = new Array(COLS).fill('T'); // a full row up high
    board[ROWS - 1] = new Array(COLS).fill('I'); // bottom row full
    board[ROWS - 2][0] = 'O'; // partial — must be ignored

    expect(fullRowIndices(board as never)).toEqual([5, ROWS - 1]);
  });

  it('returns an empty array when no row is complete', () => {
    const board = emptyBoard();
    board[ROWS - 1][0] = 'L';

    expect(fullRowIndices(board as never)).toEqual([]);
  });

  it('agrees with clearCompletedRows on how many rows vanish', () => {
    const board = emptyBoard();
    board[ROWS - 3] = new Array(COLS).fill('S');
    board[ROWS - 1] = new Array(COLS).fill('Z');

    const indices = fullRowIndices(board as never);
    const { cleared } = clearCompletedRows(board as never);
    expect(indices).toHaveLength(cleared);
  });
});

describe('clearCompletedRows', () => {
  it('removes a full row, keeps the height, and reports the count', () => {
    const board = emptyBoard();
    board[ROWS - 1] = new Array(COLS).fill('I'); // bottom row completely filled

    const { board: next, cleared } = clearCompletedRows(board as never);

    expect(cleared).toBe(1);
    expect(next).toHaveLength(ROWS);
    expect(next.every((row) => row.length === COLS)).toBe(true);
    // The cleared row is gone and the board stays empty above it.
    expect(next[ROWS - 1].every((cell) => cell === null)).toBe(true);
  });

  it('leaves a board with no complete rows untouched', () => {
    const board = emptyBoard();
    board[ROWS - 1][0] = 'O';

    const { cleared } = clearCompletedRows(board as never);
    expect(cleared).toBe(0);
  });
});

describe('TetrisGame component', () => {
  it('mounts without crashing while inactive', () => {
    render(<TetrisGame active={false} onScoreChange={vi.fn()} onGameOver={vi.fn()} />);
    expect(screen.getByRole('application', { name: /tetris/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Tetris board')).toBeInTheDocument();
  });

  it('starts a fresh session and reports an initial score of 0 when active', () => {
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <TetrisGame active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    expect(onScoreChange).toHaveBeenCalledWith(0);
    expect(onGameOver).not.toHaveBeenCalled();

    // Unmounts cleanly (cancels rAF / removes listeners) without throwing.
    expect(() => unmount()).not.toThrow();
  });

  it('stops cleanly when toggled from active back to inactive', () => {
    const { rerender } = render(
      <TetrisGame active onScoreChange={vi.fn()} onGameOver={vi.fn()} />,
    );
    expect(() =>
      rerender(<TetrisGame active={false} onScoreChange={vi.fn()} onGameOver={vi.fn()} />),
    ).not.toThrow();
  });
});
