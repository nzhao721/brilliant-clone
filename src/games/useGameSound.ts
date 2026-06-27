// Thin glue between a game component and the shared sound engine: ties a
// background music track to `active` (start on activate, stop on deactivate /
// unmount) and hands back stable effect/tone triggers. Owns no audio itself —
// the engine in `../audio/SoundProvider` no-ops safely in jsdom.

import { useEffect, useRef } from 'react';
import { useSound } from '../audio/SoundProvider';

// Derive the engine's vocabularies from `useSound` so this stays in lockstep
// with the provider's API without importing its named types.
type SoundApi = ReturnType<typeof useSound>;
type GameEffectName = Parameters<SoundApi['playEffect']>[0];
export type GameMusicTrack = Parameters<SoundApi['startMusic']>[0];
type GameToneSpec = Parameters<SoundApi['playCustom']>[0];

export type GameSound = {
  /** Fire a named arcade effect (correct, jump, coin, …). */
  playEffect: (name: GameEffectName) => void;
  /** Fire a bespoke one-off tone for anything the named set doesn't cover. */
  playCustom: (spec: GameToneSpec) => void;
};

/**
 * Play `track` while `active` and return stable effect/tone triggers. The
 * returned object's identity never changes yet its methods always reach the
 * latest engine, so games can call it from rAF/interval closures (or list it in
 * effect deps) without ever restarting their loop on a parent re-render.
 */
export function useGameSound(active: boolean, track: GameMusicTrack): GameSound {
  const sound = useSound();

  // Mirror the (possibly unstable) engine handle into a ref so the music effect
  // and the returned triggers always see the current functions.
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // Background music follows the paid session: start on activate, stop on
  // deactivate / unmount. Keyed only on `active`/`track` so a parent re-render
  // (new callback identities every timer tick) never restarts the track.
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    soundRef.current.startMusic(track);
    return () => {
      soundRef.current.stopMusic();
    };
  }, [active, track]);

  // A stable trigger object (created once) that always reaches the latest engine.
  const apiRef = useRef<GameSound | null>(null);
  const api =
    apiRef.current ??
    (apiRef.current = {
      playEffect: (name) => soundRef.current.playEffect(name),
      playCustom: (spec) => soundRef.current.playCustom(spec),
    });
  return api;
}
