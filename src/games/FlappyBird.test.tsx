import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlappyBird } from './FlappyBird';

// FlappyBird pulls in the sound engine transitively (FlappyBird -> useGameSound
// -> ../audio/SoundProvider), and `useSound` throws outside a <SoundProvider>.
// Mock the engine module so the hook returns inert no-ops, keeping these unit
// tests focused on game logic instead of audio.
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

// jsdom doesn't implement a real canvas context, so hand back a recursive Proxy
// whose every method is a chainable no-op (covers gradients, paths, text, etc.).
// This lets the draw path run without the "Not implemented" jsdom noise.
function installFakeCanvas() {
  const handler: ProxyHandler<() => unknown> = {
    get: (_target, prop) => (prop === 'canvas' ? { width: 400, height: 600 } : () => proxy),
    set: () => true,
  };
  const proxy = new Proxy(function () {}, handler);
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(proxy as unknown as CanvasRenderingContext2D);
}

describe('FlappyBird', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mounts while inactive without starting or scoring', () => {
    installFakeCanvas();
    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { container, unmount } = render(
      <FlappyBird active={false} onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    expect(onScoreChange).not.toHaveBeenCalled();
    expect(onGameOver).not.toHaveBeenCalled();

    unmount();
  });

  it('starts a fresh game when active, advances frames, and cleans up the loop', () => {
    installFakeCanvas();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);

    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <FlappyBird active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    // A fresh game reports a zeroed score and schedules the render loop.
    expect(onScoreChange).toHaveBeenCalledWith(0);
    expect(frames.length).toBeGreaterThan(0);

    // Drive a couple of frames; drawing runs against the fake 2d context.
    act(() => frames[frames.length - 1](16));
    act(() => frames[frames.length - 1](32));

    // An idle bird (no flap yet) can't lose.
    expect(onGameOver).not.toHaveBeenCalled();

    // Space flaps and is prevented from scrolling the page while active.
    const ev = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);

    unmount();
    expect(cancel).toHaveBeenCalled();
  });

  it('flaps to start, then falls into a crash that ends the run exactly once', () => {
    installFakeCanvas();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const onScoreChange = vi.fn();
    const onGameOver = vi.fn();

    const { unmount } = render(
      <FlappyBird active onScoreChange={onScoreChange} onGameOver={onGameOver} />,
    );

    // One flap begins the run (and would fire the wired 'jump' cue).
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', cancelable: true }));
    });

    // Advance frames ~33ms apart with no further flaps: gravity drops the bird to
    // the ground, flipping game-over and firing the wired 'crash' cue right
    // before the loss is reported. The audio mock makes every cue a no-op, so
    // this asserts the wiring runs without throwing and signals the loss once.
    let t = 0;
    for (let i = 0; i < 200 && onGameOver.mock.calls.length === 0; i += 1) {
      t += 33;
      const next = frames[frames.length - 1];
      act(() => next(t));
    }

    expect(onGameOver).toHaveBeenCalledTimes(1);

    unmount();
  });
});
