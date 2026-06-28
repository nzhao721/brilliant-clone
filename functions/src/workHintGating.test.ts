import { describe, expect, it } from 'vitest';
import { parseWorkHintResponse } from './index';

/*
 * The work-gated practice hint is PROMPT-driven: the model decides whether the
 * uploaded/drawn work shows substantial progress and either returns a hint
 * (hasSubstantialProgress=true) or a "make a substantial start first" nudge with
 * NO hint (false). The server only PARSES that structured reply, so these tests
 * lock in that the gate flag is preserved, the model's message is kept verbatim
 * (after the shared LaTeX sanitize), and unusable replies are rejected. The gating
 * decision itself lives in the prompt and can't be unit-tested without the model.
 */

/* No-glyph chars that paint a "tofu" box; non-global so `.test` has no lastIndex. */
const HAS_NON_RENDERABLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\ufffd]/;

describe('parseWorkHintResponse (work-gated hint)', () => {
  it('keeps the hint and hasSubstantialProgress=true when the work shows real progress', () => {
    const out = parseWorkHintResponse(
      JSON.stringify({
        hasSubstantialProgress: true,
        message: 'Nice setup with $\\frac{dy}{dx}$ — recheck your second line.',
        onTrack: true,
      }),
    );

    expect(out).not.toBeNull();
    expect(out!.hasSubstantialProgress).toBe(true);
    expect(out!.message).toContain('recheck your second line');
    expect(out!.onTrack).toBe(true);
  });

  it('keeps the nudge and hasSubstantialProgress=false for blank/insufficient work', () => {
    const out = parseWorkHintResponse(
      JSON.stringify({
        hasSubstantialProgress: false,
        message: 'I don’t see a real attempt yet — try the setup and first steps, then re-upload.',
        onTrack: null,
      }),
    );

    expect(out).not.toBeNull();
    expect(out!.hasSubstantialProgress).toBe(false);
    expect(out!.message).toContain('re-upload');
    // A null onTrack is dropped (only booleans survive).
    expect(out!.onTrack).toBeUndefined();
  });

  it('sanitizes non-renderable LaTeX corruption while keeping the gate flag', () => {
    const corrupted = 'Good start \u0007 $\\frac{1}{x}$ tail\ufffd';
    const out = parseWorkHintResponse(
      JSON.stringify({ hasSubstantialProgress: true, message: corrupted, onTrack: true }),
    );

    expect(out).not.toBeNull();
    expect(HAS_NON_RENDERABLE.test(out!.message)).toBe(false);
    expect(out!.message.length).toBeGreaterThan(0);
    expect(out!.hasSubstantialProgress).toBe(true);
  });

  it('returns null for an empty message regardless of the gate flag', () => {
    expect(
      parseWorkHintResponse(
        JSON.stringify({ hasSubstantialProgress: false, message: '   ', onTrack: null }),
      ),
    ).toBeNull();
  });

  it('omits hasSubstantialProgress when the model sends a non-boolean', () => {
    const out = parseWorkHintResponse(
      JSON.stringify({ hasSubstantialProgress: 'yes', message: 'Hello.', onTrack: null }),
    );

    expect(out).not.toBeNull();
    expect(out!.hasSubstantialProgress).toBeUndefined();
  });
});
