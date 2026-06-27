import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
// Type-only namespace import: `React.JSX.Element` is the React 19 spelling of
// the contract's `JSX.Element` (this project's @types/react has no global JSX).
// Fully erased at build time, so it adds no runtime dependency.
import type * as React from 'react';
import type { MusicTrackName, SoundEffectName, ToneSpec } from './sounds';

// Some browsers only expose the prefixed AudioContext constructor.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// The exact hook contract — consumed verbatim by the per-game audio workers.
export type SoundContextValue = {
  playEffect: (name: SoundEffectName) => void;
  playCustom: (spec: ToneSpec) => void;
  startMusic: (track: MusicTrackName) => void;
  stopMusic: () => void;
  /**
   * Continuous engine drone (a live-controlled effect, like playCustom — no
   * pregenerated asset). startEngine spins up ONE persistent oscillator pair on
   * the effects bus; setEngineLevel ramps its pitch + gain smoothly from a
   * `level` in 0..1; stopEngine fades it out and tears it down. All three are
   * idempotent and safe no-ops without an AudioContext (jsdom/SSR).
   */
  startEngine: () => void;
  setEngineLevel: (level: number) => void;
  stopEngine: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  /** Master volume, 0..1. */
  volume: number;
  setVolume: (v: number) => void;
};

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

// Persisted mute/volume preferences live under one JSON key.
const STORAGE_KEY = 'slopewise.audio';
const DEFAULT_VOLUME = 0.6;
// Background music is a quiet bed that sits WELL under the one-shot SFX, so
// feedback cues always cut through. Effects play at full level on their own bus
// (EFFECT_BUS_GAIN); music plays much quieter on its bus (MUSIC_BUS_GAIN). Both
// feed the master gain, so the user volume slider and mute scale/silence them
// together while preserving this fixed music-vs-SFX balance.
export const MUSIC_BUS_GAIN = 0.35;
export const EFFECT_BUS_GAIN = 1;

// A couple of effects are REAL recordings (the answer-feedback ding + buzzer;
// see src/audio/samples/NOTICE.md) mastered far hotter than the synthesized
// cues — and the buzzer is much denser than the ding. These per-effect scalars
// ride on the effects bus so the recordings play at a tasteful level, roughly
// RMS-matched to the synth cues (the buzzer kept a touch more present, as a
// "wrong" alert should be). Effects not listed here play at unity.
const EFFECT_PLAYBACK_GAIN: Partial<Record<SoundEffectName, number>> = {
  correct: 0.75,
  incorrect: 0.35,
};

// ----- Continuous engine drone (live-controlled, no pregenerated asset) ------
// Unlike the one-shot tones playCustom fires, the engine is ONE long-lived
// oscillator pair whose frequency + gain are ramped smoothly by setEngineLevel,
// so a caller (the race) can map speed → a sustained, gliding engine pitch
// instead of repeated blips. It feeds a dedicated GainNode on the EFFECTS bus,
// so the global mute/volume scale it like every other effect.
const ENGINE_IDLE_FREQ = 60; // Hz at level 0 — a low idle rumble
const ENGINE_MAX_FREQ = 300; // Hz at level 1 — a high-rev whine
const ENGINE_IDLE_GAIN = 0.04; // quiet idle bed under the SFX/music
const ENGINE_MAX_GAIN = 0.12; // a touch louder at full throttle
// A second saw, a few cents flat, adds beat/body so the drone isn't a sterile
// single tone. Constant detune (in cents) rides on top of the ramped frequency.
const ENGINE_BODY_DETUNE_CENTS = -12;
// Exponential-approach time-constant for the per-frame setTargetAtTime ramps.
// Small enough to feel responsive to speed, large enough to never click/step.
const ENGINE_RAMP_TAU = 0.08;
// Fade time when stopping, so tearing the drone down never clicks.
const ENGINE_RELEASE = 0.08;

// The generated asset index, imported lazily (browser only) so jsdom/tests
// never resolve the inlined `?inline` WAV modules.
type AssetModule = typeof import('./assets/index');

type PersistedAudioSettings = { muted: boolean; volume: number };

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME;
  }
  return Math.min(1, Math.max(0, value));
}

function readSettings(): PersistedAudioSettings {
  if (typeof window === 'undefined') {
    return { muted: false, volume: DEFAULT_VOLUME };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { muted: false, volume: DEFAULT_VOLUME };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedAudioSettings>;
    return {
      muted: Boolean(parsed.muted),
      volume: clampVolume(typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_VOLUME),
    };
  } catch {
    return { muted: false, volume: DEFAULT_VOLUME };
  }
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.AudioContext ?? window.webkitAudioContext;
}

// Decodes a `data:audio/...;base64,...` URI to an ArrayBuffer WITHOUT any
// network/fetch (pure base64 → bytes), ready for decodeAudioData.
function dataUriToArrayBuffer(uri: string): ArrayBuffer | null {
  if (typeof atob !== 'function') {
    return null;
  }
  const commaIndex = uri.indexOf(',');
  const base64 = commaIndex >= 0 ? uri.slice(commaIndex + 1) : uri;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

// First sample index whose amplitude crosses `threshold`, searched only within
// the first `maxSeconds`. MP3 decoding prepends a small amount of encoder/decoder
// silence (a few tens of ms at most); this finds where the real audio begins so
// it can be skipped.
function firstAudibleSample(buffer: AudioBuffer, maxSeconds = 0.08, threshold = 1e-3): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.ceil(maxSeconds * buffer.sampleRate));
  for (let i = 0; i < limit; i += 1) {
    if (Math.abs(data[i]) > threshold) {
      return i;
    }
  }
  return 0;
}

// Copy a [start, start+length) window of `buffer` into a fresh AudioBuffer.
function sliceAudioBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  start: number,
  length: number,
): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      dst[i] = src[start + i] ?? 0;
    }
  }
  return out;
}

// Trim just the MP3 codec's leading silence from a one-shot, so cues stay snappy.
function trimLeadIn(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  try {
    const start = firstAudibleSample(buffer);
    return start > 0 ? sliceAudioBuffer(ctx, buffer, start, buffer.length - start) : buffer;
  } catch {
    return buffer;
  }
}

// Trim a looping track down to exactly its musical region: drop the codec's
// leading silence, then keep precisely `durationSeconds` of audio (which also
// excludes the trailing frame padding). The result loops via `source.loop` with
// no gap/click. Falls back to the original buffer if anything is off.
function trimToLoop(ctx: AudioContext, buffer: AudioBuffer, durationSeconds: number): AudioBuffer {
  try {
    const start = firstAudibleSample(buffer);
    if (durationSeconds > 0) {
      const wanted = Math.round(durationSeconds * buffer.sampleRate);
      const length = Math.min(buffer.length - start, wanted);
      if (length > 0) {
        return sliceAudioBuffer(ctx, buffer, start, length);
      }
    }
    return start > 0 ? sliceAudioBuffer(ctx, buffer, start, buffer.length - start) : buffer;
  } catch {
    return buffer;
  }
}

export function SoundProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const initialSettings = useMemo(readSettings, []);
  const [isMuted, setIsMuted] = useState(initialSettings.muted);
  const [volume, setVolumeState] = useState(initialSettings.volume);

  const contextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const musicBusRef = useRef<GainNode | null>(null);
  const effectBusRef = useRef<GainNode | null>(null);

  // Lazily-imported asset map + decoded-buffer caches (decode once, play many).
  const assetModuleRef = useRef<Promise<AssetModule | null> | null>(null);
  const sfxBuffersRef = useRef(new Map<SoundEffectName, AudioBuffer>());
  const musicBuffersRef = useRef(new Map<MusicTrackName, AudioBuffer>());
  const decodingRef = useRef(new Map<string, Promise<AudioBuffer | null>>());

  // Current looping music source + a generation counter so a slow async decode
  // can't start a track that has since been replaced/stopped.
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentTrackRef = useRef<MusicTrackName | null>(null);
  const musicGenerationRef = useRef(0);

  // The continuous engine drone: its persistent oscillators + dedicated gain.
  // Both null while the engine is stopped (the idempotency guard for the three
  // engine controls below).
  const engineOscsRef = useRef<OscillatorNode[] | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  // Mirror latest mute/volume into refs so async callbacks read fresh values.
  const isMutedRef = useRef(isMuted);
  const volumeRef = useRef(volume);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const loadAssetModule = useCallback((): Promise<AssetModule | null> => {
    if (!assetModuleRef.current) {
      assetModuleRef.current = import('./assets/index').catch(() => null);
    }
    return assetModuleRef.current;
  }, []);

  const decodeArrayBuffer = useCallback(
    (ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> => {
      try {
        return Promise.resolve(ctx.decodeAudioData(arrayBuffer)).then(
          (buffer) => buffer,
          () => null,
        );
      } catch {
        return Promise.resolve(null);
      }
    },
    [],
  );

  // Decode an inlined `data:` URI (base64 → bytes → decodeAudioData). EVERY asset
  // (all SFX + all music) is an inlined MP3 data URI, so there is ZERO
  // fetch/network at play time; browsers decode MP3 natively.
  const decodeUri = useCallback(
    (ctx: AudioContext, uri: string): Promise<AudioBuffer | null> => {
      const arrayBuffer = dataUriToArrayBuffer(uri);
      return arrayBuffer ? decodeArrayBuffer(ctx, arrayBuffer) : Promise.resolve(null);
    },
    [decodeArrayBuffer],
  );

  const getEffectBuffer = useCallback(
    (ctx: AudioContext, name: SoundEffectName): Promise<AudioBuffer | null> => {
      const cached = sfxBuffersRef.current.get(name);
      if (cached) {
        return Promise.resolve(cached);
      }
      const key = `sfx:${name}`;
      const inflight = decodingRef.current.get(key);
      if (inflight) {
        return inflight;
      }
      const pending = loadAssetModule().then((mod) => {
        if (!mod) {
          return null;
        }
        return decodeUri(ctx, mod.soundEffectAssets[name]).then((buffer) => {
          if (!buffer) {
            return null;
          }
          const trimmed = trimLeadIn(ctx, buffer);
          sfxBuffersRef.current.set(name, trimmed);
          return trimmed;
        });
      });
      decodingRef.current.set(key, pending);
      return pending;
    },
    [decodeUri, loadAssetModule],
  );

  const getMusicBuffer = useCallback(
    (ctx: AudioContext, track: MusicTrackName): Promise<AudioBuffer | null> => {
      const cached = musicBuffersRef.current.get(track);
      if (cached) {
        return Promise.resolve(cached);
      }
      const key = `music:${track}`;
      const inflight = decodingRef.current.get(key);
      if (inflight) {
        return inflight;
      }
      const pending = loadAssetModule().then((mod) => {
        if (!mod) {
          return null;
        }
        const duration = mod.musicTrackDurations[track];
        return decodeUri(ctx, mod.musicTrackAssets[track]).then((buffer) => {
          if (!buffer) {
            return null;
          }
          // Trim to the exact musical loop so the inlined MP3 loops gaplessly.
          const looped = trimToLoop(ctx, buffer, duration);
          musicBuffersRef.current.set(track, looped);
          return looped;
        });
      });
      decodingRef.current.set(key, pending);
      return pending;
    },
    [decodeUri, loadAssetModule],
  );

  // Lazily create the single AudioContext + gain graph on first use, resuming if
  // the autoplay policy left it suspended. Returns null when Web Audio is
  // unavailable (jsdom/SSR) so callers no-op safely. On creation it warms the
  // SFX buffer cache so the first real cue plays without a decode delay.
  const ensureContext = useCallback((): AudioContext | null => {
    const existing = contextRef.current;
    if (existing) {
      if (existing.state === 'suspended') {
        void existing.resume();
      }
      return existing;
    }

    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      return null;
    }

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }

    const master = ctx.createGain();
    master.gain.value = isMutedRef.current ? 0 : volumeRef.current;
    master.connect(ctx.destination);

    const musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_BUS_GAIN;
    musicBus.connect(master);

    const effectBus = ctx.createGain();
    effectBus.gain.value = EFFECT_BUS_GAIN;
    effectBus.connect(master);

    contextRef.current = ctx;
    masterGainRef.current = master;
    musicBusRef.current = musicBus;
    effectBusRef.current = effectBus;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Warm all SFX buffers (fire-and-forget) so first plays are instant.
    void loadAssetModule().then((mod) => {
      if (!mod) {
        return;
      }
      for (const name of Object.keys(mod.soundEffectAssets) as SoundEffectName[]) {
        void getEffectBuffer(ctx, name);
      }
    });

    return ctx;
  }, [getEffectBuffer, loadAssetModule]);

  const playBuffer = useCallback(
    (ctx: AudioContext, destination: AudioNode, buffer: AudioBuffer, gain = 1) => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (gain !== 1) {
          // Route through a per-play GainNode so a hot recording is trimmed to
          // the same level as the synth cues before hitting the effects bus.
          const gainNode = ctx.createGain();
          gainNode.gain.value = gain;
          source.connect(gainNode).connect(destination);
          source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
          };
        } else {
          source.connect(destination);
          source.onended = () => source.disconnect();
        }
        source.start();
      } catch {
        // Never let a playback failure bubble into the UI.
      }
    },
    [],
  );

  // Keep the master gain in sync with mute/volume. Muting drives it to 0, which
  // silences BOTH effects and music (they share this master node), while any
  // looping track keeps running so unmuting restores it.
  useEffect(() => {
    const master = masterGainRef.current;
    const ctx = contextRef.current;
    if (!master || !ctx) {
      return;
    }
    master.gain.setTargetAtTime(isMuted ? 0 : volume, ctx.currentTime, 0.015);
  }, [isMuted, volume]);

  // Persist preferences.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: isMuted, volume }));
    } catch {
      // Storage full/blocked — preferences just won't persist this session.
    }
  }, [isMuted, volume]);

  // Browser autoplay policy: the context can only start/resume from a user
  // gesture. Wake it on the first interaction so music started programmatically
  // (e.g. on mount) begins once the user touches the page. No-op when Web Audio
  // is unavailable (jsdom), so no listeners are attached in tests.
  useEffect(() => {
    if (typeof window === 'undefined' || !getAudioContextCtor()) {
      return undefined;
    }

    function wake() {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume();
      }
    }

    const options: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointerdown', wake, options);
    window.addEventListener('keydown', wake, options);
    window.addEventListener('touchstart', wake, options);
    return () => {
      window.removeEventListener('pointerdown', wake, options);
      window.removeEventListener('keydown', wake, options);
      window.removeEventListener('touchstart', wake, options);
    };
  }, [ensureContext]);

  const stopMusicSource = useCallback(() => {
    const source = musicSourceRef.current;
    if (source) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
      musicSourceRef.current = null;
    }
  }, []);

  // Tear down the loop and context when the provider unmounts (app teardown).
  useEffect(
    () => () => {
      stopMusicSource();
      const ctx = contextRef.current;
      contextRef.current = null;
      if (ctx) {
        void ctx.close().catch(() => undefined);
      }
    },
    [stopMusicSource],
  );

  const playEffect = useCallback(
    (name: SoundEffectName) => {
      // While muted there is nothing to hear, so skip the work entirely.
      if (isMutedRef.current) {
        return;
      }
      const ctx = ensureContext();
      const bus = effectBusRef.current;
      if (!ctx || !bus) {
        return;
      }
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const gain = EFFECT_PLAYBACK_GAIN[name] ?? 1;
      const cached = sfxBuffersRef.current.get(name);
      if (cached) {
        playBuffer(ctx, bus, cached, gain);
        return;
      }
      // Not decoded yet (rare first-play race): decode then play if still wanted.
      void getEffectBuffer(ctx, name).then((buffer) => {
        if (buffer && !isMutedRef.current) {
          playBuffer(ctx, bus, buffer, gain);
        }
      });
    },
    [ensureContext, getEffectBuffer, playBuffer],
  );

  // playCustom is the explicit "custom tone" escape hatch — arbitrary specs
  // can't be pre-generated, so it is the ONLY path that synthesizes at runtime
  // (a single short oscillator). All named effects/music use pregenerated audio.
  const playCustom = useCallback(
    (spec: ToneSpec) => {
      if (isMutedRef.current) {
        return;
      }
      const ctx = ensureContext();
      const bus = effectBusRef.current;
      if (!ctx || !bus) {
        return;
      }
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      try {
        const now = ctx.currentTime;
        const duration = spec.duration ?? 0.16;
        const peak = Math.max(0.0001, spec.gain ?? 0.4);
        const osc = ctx.createOscillator();
        osc.type = spec.type ?? 'sine';
        osc.frequency.setValueAtTime(Math.max(1, spec.freq), now);
        if (typeof spec.sweepTo === 'number' && spec.sweepTo > 0) {
          osc.frequency.exponentialRampToValueAtTime(spec.sweepTo, now + duration);
        }
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.015, duration * 0.4));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(bus);
        osc.start(now);
        osc.stop(now + duration + 0.03);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      } catch {
        // Ignore malformed specs.
      }
    },
    [ensureContext],
  );

  // ----- Continuous engine drone -------------------------------------------
  // startEngine spins up ONE persistent sawtooth (plus a slightly-detuned twin
  // for body) feeding a dedicated GainNode on the effects bus. It is idempotent
  // (the refs being set means it's already running) and a safe no-op when Web
  // Audio is unavailable, so callers can fire it unconditionally on mount.
  const startEngine = useCallback(() => {
    if (engineGainRef.current) {
      return; // already running
    }
    const ctx = ensureContext();
    const bus = effectBusRef.current;
    if (!ctx || !bus) {
      return; // jsdom/SSR — no AudioContext, nothing to play
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(ENGINE_IDLE_GAIN, now);
      gain.connect(bus);

      // Primary engine voice.
      const main = ctx.createOscillator();
      main.type = 'sawtooth';
      main.frequency.setValueAtTime(ENGINE_IDLE_FREQ, now);
      main.connect(gain);
      main.start();

      // Body voice: same ramped frequency, a constant few cents flat, so the two
      // saws beat against each other for a richer, less synthetic timbre.
      const body = ctx.createOscillator();
      body.type = 'sawtooth';
      body.frequency.setValueAtTime(ENGINE_IDLE_FREQ, now);
      body.detune.setValueAtTime(ENGINE_BODY_DETUNE_CENTS, now);
      body.connect(gain);
      body.start();

      engineGainRef.current = gain;
      engineOscsRef.current = [main, body];
    } catch {
      // Leave the engine stopped on any failure.
      engineGainRef.current = null;
      engineOscsRef.current = null;
    }
  }, [ensureContext]);

  // setEngineLevel maps a 0..1 `level` (clamped) to the engine's pitch + gain and
  // glides to it via setTargetAtTime, so per-frame calls produce a smooth,
  // click-free rev rather than stepping. No-op until startEngine has run (or with
  // no AudioContext at all).
  const setEngineLevel = useCallback((level: number) => {
    const ctx = contextRef.current;
    const gain = engineGainRef.current;
    const oscs = engineOscsRef.current;
    if (!ctx || !gain || !oscs) {
      return;
    }
    const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    const freq = ENGINE_IDLE_FREQ + (ENGINE_MAX_FREQ - ENGINE_IDLE_FREQ) * clamped;
    const targetGain = ENGINE_IDLE_GAIN + (ENGINE_MAX_GAIN - ENGINE_IDLE_GAIN) * clamped;
    try {
      const now = ctx.currentTime;
      for (const osc of oscs) {
        osc.frequency.setTargetAtTime(freq, now, ENGINE_RAMP_TAU);
      }
      gain.gain.setTargetAtTime(targetGain, now, ENGINE_RAMP_TAU);
    } catch {
      // Ignore bad values / detached nodes.
    }
  }, []);

  // stopEngine fades the drone to silence then stops + disconnects its nodes.
  // The refs are cleared up front so it is idempotent and a later startEngine
  // restarts cleanly regardless of the (slightly deferred) stop.
  const stopEngine = useCallback(() => {
    const ctx = contextRef.current;
    const gain = engineGainRef.current;
    const oscs = engineOscsRef.current;
    engineGainRef.current = null;
    engineOscsRef.current = null;
    if (!ctx || !gain || !oscs || oscs.length === 0) {
      return;
    }
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.linearRampToValueAtTime(0.0001, now + ENGINE_RELEASE);
      const stopAt = now + ENGINE_RELEASE + 0.02;
      for (const osc of oscs) {
        try {
          osc.stop(stopAt);
        } catch {
          // Already stopped.
        }
      }
      // Disconnect everything once the (last) oscillator has fully ended.
      oscs[oscs.length - 1].onended = () => {
        for (const osc of oscs) {
          try {
            osc.disconnect();
          } catch {
            // Already disconnected.
          }
        }
        try {
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      };
    } catch {
      // Best-effort teardown.
    }
  }, []);

  const stopMusic = useCallback(() => {
    // Bump the generation so any in-flight decode won't start a stale track.
    musicGenerationRef.current += 1;
    stopMusicSource();
    currentTrackRef.current = null;
  }, [stopMusicSource]);

  const startMusic = useCallback(
    (track: MusicTrackName) => {
      const ctx = ensureContext();
      const bus = musicBusRef.current;
      if (!ctx || !bus) {
        return;
      }
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      // Replace any current track: stop the old loop before the new one starts
      // so contexts/loops never stack.
      stopMusicSource();
      currentTrackRef.current = track;
      const generation = (musicGenerationRef.current += 1);

      void getMusicBuffer(ctx, track).then((buffer) => {
        if (!buffer || musicGenerationRef.current !== generation) {
          return;
        }
        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(bus);
          source.start();
          musicSourceRef.current = source;
        } catch {
          // Ignore — leave music stopped.
        }
      });
    },
    [ensureContext, getMusicBuffer, stopMusicSource],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => !muted);
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(clampVolume(value));
  }, []);

  const value = useMemo<SoundContextValue>(
    () => ({
      playEffect,
      playCustom,
      startMusic,
      stopMusic,
      startEngine,
      setEngineLevel,
      stopEngine,
      isMuted,
      toggleMute,
      volume,
      setVolume,
    }),
    [
      playEffect,
      playCustom,
      startMusic,
      stopMusic,
      startEngine,
      setEngineLevel,
      stopEngine,
      isMuted,
      toggleMute,
      volume,
      setVolume,
    ],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);

  if (!context) {
    throw new Error('useSound must be used within SoundProvider');
  }

  return context;
}
