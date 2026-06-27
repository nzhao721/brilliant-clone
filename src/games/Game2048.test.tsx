import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The shared sound engine is finalized in parallel; stub it so the game renders
// without a SoundProvider in the tree. `playEffect` is a spy (hoisted so the mock
// factory can close over it) so tests can assert which arcade cues fire; the rest
// stay inert no-ops.
const { playEffectMock } = vi.hoisted(() => ({ playEffectMock: vi.fn() }));

vi.mock('../audio/SoundProvider', () => ({
  useSound: () => ({
    playEffect: playEffectMock,
    playCustom: () => {},
    startMusic: () => {},
    stopMusic: () => {},
    isMuted: false,
    toggleMute: () => {},
    volume: 1,
    setVolume: () => {},
  }),
}));

import { Game2048, SIZE, WIN_TILE } from './Game2048';

describe('Game2048', () => {
  afterEach(() => {
    playEffectMock.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is configured for a 3x3 grid with a 256-tile win goal', () => {
    expect(SIZE).toBe(3);
    expect(WIN_TILE).toBe(256);
  });

  it('mounts without crashing while inactive and shows a 3x3 board (9 cells)', () => {
    const { container } = render(
      <Game2048 active={false} onScoreChange={() => {}} onGameOver={() => {}} />,
    );
    expect(container.querySelector('.g2048-board')).not.toBeNull();
    // 3 x 3 = 9 cells (was 16 on the classic 4x4 board).
    expect(container.querySelectorAll('.g2048-cell')).toHaveLength(SIZE * SIZE);
    expect(container.querySelectorAll('.g2048-cell')).toHaveLength(9);
  });

  it('surfaces the 256 win goal in the on-screen copy', () => {
    const { container } = render(
      <Game2048 active={false} onScoreChange={() => {}} onGameOver={() => {}} />,
    );
    expect(container.textContent).toContain(String(WIN_TILE));
    expect(container.textContent).toContain('256');
  });

  it('brands the play area as "256" (its win tile), not "2048"', () => {
    const { container } = render(
      <Game2048 active={false} onScoreChange={() => {}} onGameOver={() => {}} />,
    );
    const label = container.querySelector('.g2048-surface')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('256 puzzle');
    expect(label).not.toContain('2048');
  });

  it('mounts active, reports an initial score of 0, and seeds two tiles', () => {
    const onScoreChange = vi.fn();
    const { container } = render(
      <Game2048 active onScoreChange={onScoreChange} onGameOver={() => {}} />,
    );
    expect(onScoreChange).toHaveBeenCalledWith(0);
    // A fresh board spawns exactly two starting tiles.
    expect(container.querySelectorAll('.g2048-tile')).toHaveLength(2);
  });

  it('responds to arrow keys while active without crashing', () => {
    const onScoreChange = vi.fn();
    render(<Game2048 active onScoreChange={onScoreChange} onGameOver={() => {}} />);
    expect(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }).not.toThrow();
  });

  it('ignores keyboard input once inactive (listeners cleaned up)', () => {
    const onScoreChange = vi.fn();
    const { rerender } = render(
      <Game2048 active onScoreChange={onScoreChange} onGameOver={() => {}} />,
    );
    rerender(<Game2048 active={false} onScoreChange={onScoreChange} onGameOver={() => {}} />);
    onScoreChange.mockClear();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onScoreChange).not.toHaveBeenCalled();
  });

  // Math.random() === 0 seeds the board as [2, 2, 0, ...] (each spawn drops a 2
  // into the first empty cell), so ArrowLeft is a deterministic merge to 4.
  it('slides then settles a merge: score and value only update after the slide', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onScoreChange = vi.fn();
    const { container } = render(
      <Game2048 active onScoreChange={onScoreChange} onGameOver={() => {}} />,
    );
    expect(onScoreChange).toHaveBeenLastCalledWith(0);

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    // Mid-slide: both tiles are still 2 and the score has not moved yet.
    expect(onScoreChange).toHaveBeenLastCalledWith(0);
    expect(
      Array.from(container.querySelectorAll('.g2048-tile-face')).map((n) => n.textContent),
    ).toEqual(['2', '2']);

    // After the slide settles the pair becomes a 4 (worth 4 points) and a new
    // tile has spawned.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onScoreChange).toHaveBeenLastCalledWith(4);
    const faces = Array.from(container.querySelectorAll('.g2048-tile-face')).map(
      (n) => n.textContent,
    );
    expect(faces).toContain('4');
  });

  it('places tiles instantly (no deferred settle) when reduced motion is preferred', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }),
    );
    const onScoreChange = vi.fn();
    const { container } = render(
      <Game2048 active onScoreChange={onScoreChange} onGameOver={() => {}} />,
    );

    // No timers advanced: the merge resolves synchronously.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onScoreChange).toHaveBeenLastCalledWith(4);
    expect(
      Array.from(container.querySelectorAll('.g2048-tile-face')).map((n) => n.textContent),
    ).toContain('4');
  });

  it('reaching a new highest tile no longer plays the levelUp fanfare (other cues still fire)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // Reduced motion settles every move synchronously, so no fake timers needed.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }),
    );
    const { container } = render(
      <Game2048 active onScoreChange={() => {}} onGameOver={() => {}} />,
    );

    // With Math.random pinned to 0 the board seeds as [2, 2, …] and each spawn
    // drops a 2 into the first empty cell, so five slides down deterministically
    // build a 2→4→8 stack. Reaching the 8 tile is a "new highest" milestone that
    // used to fire the levelUp fanfare.
    for (let i = 0; i < 5; i += 1) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    }
    const faces = Array.from(container.querySelectorAll('.g2048-tile-face')).map(
      (n) => n.textContent,
    );
    expect(faces).toContain('8');

    // The milestone fanfare is gone…
    expect(playEffectMock).not.toHaveBeenCalledWith('levelUp');
    // …while the ordinary slide + merge cues still fire as before.
    expect(playEffectMock).toHaveBeenCalledWith('move');
    expect(playEffectMock).toHaveBeenCalledWith('point');
  });
});
