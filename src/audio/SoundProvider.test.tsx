import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { EFFECT_BUS_GAIN, MUSIC_BUS_GAIN, SoundProvider, useSound } from './SoundProvider';

const STORAGE_KEY = 'slopewise.audio';

function wrapper({ children }: { children: ReactNode }) {
  return <SoundProvider>{children}</SoundProvider>;
}

function readStored() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useSound', () => {
  it('throws a clear error when used outside SoundProvider', () => {
    expect(() => renderHook(() => useSound())).toThrow(/SoundProvider/);
  });

  it('exposes the full public API', () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    expect(typeof result.current.playEffect).toBe('function');
    expect(typeof result.current.playCustom).toBe('function');
    expect(typeof result.current.startMusic).toBe('function');
    expect(typeof result.current.stopMusic).toBe('function');
    expect(typeof result.current.startEngine).toBe('function');
    expect(typeof result.current.setEngineLevel).toBe('function');
    expect(typeof result.current.stopEngine).toBe('function');
    expect(typeof result.current.toggleMute).toBe('function');
    expect(typeof result.current.setVolume).toBe('function');
    expect(typeof result.current.isMuted).toBe('boolean');
    expect(typeof result.current.volume).toBe('number');
  });

  // jsdom has no AudioContext, so every audio method must be a safe no-op.
  it('never throws from audio methods when AudioContext is unavailable', () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    expect(() => {
      act(() => {
        result.current.playEffect('correct');
        result.current.playEffect('gameOver');
        result.current.playCustom({ freq: 440, type: 'square', duration: 0.1, sweepTo: 880 });
        result.current.startMusic('menu');
        result.current.startMusic('runner');
        result.current.stopMusic();
      });
    }).not.toThrow();
  });

  // The continuous engine primitive must be just as jsdom-safe: with no
  // AudioContext, starting, ramping (incl. out-of-range/non-finite levels that
  // must be clamped without throwing), and stopping the engine are all no-ops —
  // and stopEngine/startEngine stay idempotent when called repeatedly.
  it('treats the engine controls as safe no-ops without an AudioContext', () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    expect(() => {
      act(() => {
        // setEngineLevel before any startEngine is a no-op.
        result.current.setEngineLevel(0.5);
        result.current.stopEngine();

        result.current.startEngine();
        result.current.startEngine(); // idempotent
        result.current.setEngineLevel(0);
        result.current.setEngineLevel(1);
        result.current.setEngineLevel(2); // clamped high
        result.current.setEngineLevel(-1); // clamped low
        result.current.setEngineLevel(Number.NaN); // non-finite → treated as 0
        result.current.stopEngine();
        result.current.stopEngine(); // idempotent
      });
    }).not.toThrow();
  });

  it('defaults to unmuted with a mid volume', () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    expect(result.current.isMuted).toBe(false);
    expect(result.current.volume).toBeGreaterThan(0);
    expect(result.current.volume).toBeLessThanOrEqual(1);
  });

  it('toggles mute and persists it', () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    act(() => result.current.toggleMute());
    expect(result.current.isMuted).toBe(true);
    expect(readStored().muted).toBe(true);

    act(() => result.current.toggleMute());
    expect(result.current.isMuted).toBe(false);
    expect(readStored().muted).toBe(false);
  });

  it('clamps volume to 0..1 and persists it', () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    act(() => result.current.setVolume(2));
    expect(result.current.volume).toBe(1);

    act(() => result.current.setVolume(-3));
    expect(result.current.volume).toBe(0);
    expect(readStored().volume).toBe(0);

    act(() => result.current.setVolume(0.5));
    expect(result.current.volume).toBe(0.5);
    expect(readStored().volume).toBe(0.5);
  });

  it('restores persisted settings on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: true, volume: 0.3 }));

    const { result } = renderHook(() => useSound(), { wrapper });

    expect(result.current.isMuted).toBe(true);
    expect(result.current.volume).toBeCloseTo(0.3);
  });
});

// The background-music bed plays on its own bus at a fixed base level that sits
// under the full-level SFX bus, so feedback cues always cut through. The user
// volume slider + mute ride on top (on the master gain), so they're unaffected.
describe('music bus level', () => {
  it('keeps music a quiet bed under the full-level SFX', () => {
    expect(MUSIC_BUS_GAIN).toBeCloseTo(0.35);
    expect(EFFECT_BUS_GAIN).toBe(1);
    expect(MUSIC_BUS_GAIN).toBeLessThan(EFFECT_BUS_GAIN);
  });
});
