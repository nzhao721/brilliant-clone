# Answer-feedback sound samples

These two MP3s are the source assets for the lesson/practice answer-feedback
cues. They are the ONLY sounds in the app sourced from real recordings; every
other effect/track is synthesized (see `src/audio/sounds.ts`).

At build time `npm run audio:gen` copies these files verbatim into the inlined
runtime assets (`src/audio/assets/sfx-correct.mp3` and `sfx-incorrect.mp3`),
so they survive a regenerate instead of being overwritten by the synth.

| App cue     | File              | Mixkit name          | Source |
| ----------- | ----------------- | -------------------- | ------ |
| `correct`   | `correct-ding.mp3`  | "Correct answer tone" | https://mixkit.co/free-sound-effects/correct/ (id 2870) |
| `incorrect` | `wrong-buzzer.mp3`  | "Wrong long buzzer"   | https://mixkit.co/free-sound-effects/buzzer/ (id 954) |

Direct files (downloaded 2026-06-26):
- https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3
- https://assets.mixkit.co/active_storage/sfx/954/954-preview.mp3

## License

Mixkit Sound Effects Free License — https://mixkit.co/license/#sfxFree

- Free for commercial and personal use.
- No attribution required (this NOTICE is kept for provenance only).
- You may NOT make the sound effects available for others to download as
  standalone files, nor sell/redistribute them as (part of) a competing stock
  library. Bundling them inside this app is the licensed use.

The samples are loud (mastered near full scale) and the buzzer is far denser
than the ding, so the runtime applies an RMS-matched per-effect playback gain
(see `EFFECT_PLAYBACK_GAIN` in `src/audio/SoundProvider.tsx`). To swap a sound,
drop a replacement here, point the map in `scripts/generate-audio.ts` at it,
re-tune the gain if needed, and run `npm run audio:gen`.
