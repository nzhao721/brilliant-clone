// Thin glue between a game component and the shared sound engine. Every arcade
// game runs its loop only while `active`, so this hook ties a background music
// track to that flag (start on activate, stop on deactivate/unmount) and hands
// back stable effect/tone triggers the game fires on its key events.
//
// It owns no audio itself — the engine in `../audio/SoundProvider` handles the
// global mute, the AudioContext, and no-ops safely in jsdom (so these calls
// never break tests). Do NOT add audio logic here; this is wiring only.

import { useEffect, useRef } from 'react';
import { useSound } from '../audio/SoundProvider';

// Derive the engine's vocabularies straight from `useSound` so this stays in
// lockstep with the provider's API without importing its named types.
type SoundApi = ReturnType<typeof useSound>;
export type GameEffectName = Parameters<SoundApi['playEffect']>[0];
export type GameMusicTrack = Parameters<SoundApi['startMusic']>[0];
export type GameToneSpec = Parameters<SoundApi['playCustom']>[0];

export type GameSound = {
  /** Fire a named arcade effect (correct, jump, coin, …). */
  playEffect: (name: GameEffectName) => void;
  /** Fire a bespoke one-off tone for anything the named set doesn't cover. */
  playCustom: (spec: GameToneSpec) => void;
};

/**
 * Play `track` while `active`, and return stable effect/tone triggers.
 *
 * The returned object's identity never changes and its methods always reach the
 * latest engine functions, so a game can call it from rAF/interval closures or
 * event handlers (and even list it in effect deps) without ever restarting its
 * loop when the parent re-renders with new identities.
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
