import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactionTrainer } from './ReactionTrainer';

// Stub the shared sound engine so the game's audio wiring is a no-op in jsdom
// (no AudioContext) and these tests stay focused on game behavior.
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

afterEach(cleanup);

describe('ReactionTrainer', () => {
  it('mounts inactive without crashing and exposes a focusable play area', () => {
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { getByRole, unmount } = render(
      <ReactionTrainer active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    expect(getByRole('application')).toBeInTheDocument();
    // The shell owns game-over; an idle game must never trigger it.
    expect(onGameOver).not.toHaveBeenCalled();
    unmount();
  });

  it('starts a fresh session and reports a zeroed score when active turns true', () => {
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { rerender, getByRole, unmount } = render(
      <ReactionTrainer active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    rerender(
      <ReactionTrainer active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    expect(getByRole('application')).toBeInTheDocument();
    expect(onScoreChange).toHaveBeenCalledWith(0);
    expect(onGameOver).not.toHaveBeenCalled();

    // Flipping active off must unmount cleanly (timers cleared, no game-over).
    rerender(
      <ReactionTrainer active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );
    expect(onGameOver).not.toHaveBeenCalled();
    unmount();
  });

  it('strikes a shown target from a Space press dispatched on window', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const onScoreChange = vi.fn();

    try {
      render(<ReactionTrainer active onScoreChange={onScoreChange} onGameOver={vi.fn()} />);

      // Let the (now-deterministic) appear delay elapse so a target is on screen.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      onScoreChange.mockClear();

      // Dispatch on window — an element-scoped handler could never see this, so a
      // scoring hit proves striking works without focusing the play area first.
      fireEvent.keyDown(window, { key: ' ' });

      expect(onScoreChange).toHaveBeenCalled();
      const lastScore =
        onScoreChange.mock.calls[onScoreChange.mock.calls.length - 1]?.[0] ?? 0;
      expect(lastScore).toBeGreaterThan(0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
