// Pure-TS offline synthesizer + WAV encoder.
//
// BUILD-TIME ONLY: used by `scripts/generate-audio.ts` to render the recipes in
// `./sounds` into committed WAV assets. It has no Web Audio / DOM / Node
// dependencies — just math over Float32 sample buffers — so it runs anywhere
// (Node, Vitest, browser). The runtime engine never imports this; it plays the
// pregenerated assets instead.

import {
  isNoiseStep,
  type MusicTrackSpec,
  type MusicVoice,
  type RecipeNoise,
  type RecipeStep,
  type ToneSpec,
} from './sounds';

const DEFAULT_DURATION = 0.16;
const DEFAULT_GAIN = 0.5;
const DEFAULT_TYPE: OscillatorType = 'sine';
// Master scale applied before clipping so layered voices don't clip harshly.
const MIX_HEADROOM = 0.85;

// One cycle of the given waveform at normalized phase `t` in [0, 1).
function waveform(type: OscillatorType, t: number): number {
  switch (type) {
    case 'square':
      return t < 0.5 ? 1 : -1;
    case 'sawtooth':
      return 2 * t - 1;
    case 'triangle':
      return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    case 'sine':
    default:
      return Math.sin(2 * Math.PI * t);
  }
}

// Percussive amplitude envelope matching the runtime feel: a fast linear attack
// to `peak`, then an exponential decay toward silence by `duration`.
function envelopeAt(elapsed: number, duration: number, peak: number): number {
  if (elapsed < 0 || elapsed > duration) {
    return 0;
  }
  const attack = Math.min(0.015, duration * 0.4);
  if (elapsed < attack) {
    return peak * (elapsed / attack);
  }
  const decayProgress = (elapsed - attack) / Math.max(1e-6, duration - attack);
  // Exponential-ish decay from peak to ~0.1% of peak.
  return peak * Math.pow(0.001, decayProgress);
}

// Adds `value` at `index`. When `wrapLength` is given, the index wraps modulo
// that length so a note whose tail rings past the loop end folds back onto the
// start — exactly what a seamless loop sounds like.
function mixInto(
  buffer: Float32Array,
  index: number,
  value: number,
  wrapLength?: number,
): void {
  let i = index;
  if (wrapLength && wrapLength > 0) {
    i = ((i % wrapLength) + wrapLength) % wrapLength;
  }
  if (i >= 0 && i < buffer.length) {
    buffer[i] += value;
  }
}

function renderToneInto(
  buffer: Float32Array,
  sampleRate: number,
  spec: ToneSpec,
  atSeconds: number,
  wrapLength?: number,
): void {
  const duration = spec.duration ?? DEFAULT_DURATION;
  const peak = spec.gain ?? DEFAULT_GAIN;
  const type = spec.type ?? DEFAULT_TYPE;
  const startFreq = Math.max(1, spec.freq);
  const endFreq = typeof spec.sweepTo === 'number' && spec.sweepTo > 0 ? spec.sweepTo : startFreq;
  const totalSamples = Math.ceil(duration * sampleRate);
  const startIndex = Math.floor(atSeconds * sampleRate);

  // Accumulate phase in cycles so an instantaneous (possibly swept) frequency
  // integrates correctly without unbounded radian growth.
  let phase = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const elapsed = i / sampleRate;
    const sweep = totalSamples > 1 ? i / (totalSamples - 1) : 1;
    // Exponential pitch glide from start to end frequency.
    const freq = startFreq * Math.pow(endFreq / startFreq, sweep);
    phase += freq / sampleRate;
    const t = phase - Math.floor(phase);
    const amp = envelopeAt(elapsed, duration, peak);
    mixInto(buffer, startIndex + i, waveform(type, t) * amp, wrapLength);
  }
}

function renderNoiseInto(
  buffer: Float32Array,
  sampleRate: number,
  spec: RecipeNoise,
  atSeconds: number,
): void {
  const duration = spec.duration ?? DEFAULT_DURATION;
  const peak = spec.gain ?? 0.3;
  const totalSamples = Math.ceil(duration * sampleRate);
  const startIndex = Math.floor(atSeconds * sampleRate);

  // Optional one-pole low-pass for a duller, body-ier impact.
  const hasFilter = typeof spec.filterHz === 'number' && spec.filterHz > 0;
  const dt = 1 / sampleRate;
  const rc = hasFilter ? 1 / (2 * Math.PI * (spec.filterHz as number)) : 0;
  const alpha = hasFilter ? dt / (rc + dt) : 1;
  let prev = 0;

  for (let i = 0; i < totalSamples; i += 1) {
    const white = Math.random() * 2 - 1;
    prev = hasFilter ? prev + alpha * (white - prev) : white;
    const elapsed = i / sampleRate;
    const amp = envelopeAt(elapsed, duration, peak);
    mixInto(buffer, startIndex + i, prev * amp);
  }
}

function softClip(buffer: Float32Array): Float32Array {
  for (let i = 0; i < buffer.length; i += 1) {
    const v = buffer[i] * MIX_HEADROOM;
    buffer[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return buffer;
}

/** Renders a sound-effect recipe (layered tones/noise) to mono PCM. */
export function renderEffectToPcm(steps: RecipeStep[], sampleRate: number): Float32Array {
  let totalSeconds = 0;
  for (const step of steps) {
    const end = (step.at ?? 0) + (step.duration ?? DEFAULT_DURATION);
    totalSeconds = Math.max(totalSeconds, end);
  }
  // A little tail so the final decay isn't clipped.
  const length = Math.max(1, Math.ceil((totalSeconds + 0.02) * sampleRate));
  const buffer = new Float32Array(length);

  for (const step of steps) {
    if (isNoiseStep(step)) {
      renderNoiseInto(buffer, sampleRate, step, step.at ?? 0);
    } else {
      renderToneInto(buffer, sampleRate, step, step.at ?? 0);
    }
  }

  return softClip(buffer);
}

/**
 * Renders ONE seamless loop iteration of a music track to mono PCM. All voices
 * are summed over a buffer whose length is the longest voice; each note's tail
 * wraps across the loop boundary (via `renderToneInto`'s wrap), so even
 * sustained pads loop with no click. A voice's `sustain` sets note length in
 * STEPS (default 0.9 → crisp notes that decay before the next step).
 */
export function renderMusicLoopToPcm(track: MusicTrackSpec, sampleRate: number): Float32Array {
  const stepCount = track.voices.reduce((max, voice) => Math.max(max, voice.notes.length), 0);
  const loopSeconds = stepCount * track.stepDuration;
  const length = Math.max(1, Math.round(loopSeconds * sampleRate));
  const buffer = new Float32Array(length);

  const renderVoice = (voice: MusicVoice) => {
    const noteDuration = track.stepDuration * (voice.sustain ?? 0.9);
    voice.notes.forEach((freq, index) => {
      if (freq == null) {
        return;
      }
      renderToneInto(
        buffer,
        sampleRate,
        { freq, type: voice.type, duration: noteDuration, gain: voice.gain },
        index * track.stepDuration,
        length,
      );
    });
  };

  for (const voice of track.voices) {
    renderVoice(voice);
  }

  return softClip(buffer);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Encodes mono Float32 samples as a 16-bit PCM WAV byte array. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}
