import { describe, expect, it } from 'vitest';
import { parsePrefetchResponse, parseTutorResponse } from './index';
import { parseChallengeResponse } from './challengeRound';

/*
 * Server-side proof that ALL THREE callable parsers run the SAME sanitize on EVERY
 * user-facing, math-bearing field. We feed each parser a payload corrupted with the
 * exact failure modes from the bug report — C0 control chars, the U+FFFD
 * replacement char, and backslash-stripped commands (a `\frac` mangled into a
 * control char) — and assert no non-renderable "tofu" character survives in any
 * returned field. Clean LaTeX must still pass through verbatim.
 *
 * The parsers JSON.parse their input, so corruption is injected by JSON.stringify-ing
 * an object that holds the raw chars (which encodes control chars safely, then the
 * parser decodes them back before sanitizing).
 */

/* No-glyph chars that paint a "tofu" box; non-global so `.test` has no lastIndex. */
const HAS_NON_RENDERABLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\ufffd]/;

/* Mangles every `\<letter>` into a control char (C-escape) or NUL+letter — the
 * "backslash-stripped command" failure mode (mirrors latexSanitize.functions.test). */
const C_ESCAPE: Record<string, string> = {
  a: '\u0007', b: '\u0008', t: '\u0009', n: '\u000a', v: '\u000b', f: '\u000c', r: '\u000d',
};
function corrupt(s: string): string {
  return s.replace(/\\([a-zA-Z])/g, (_m, letter: string) =>
    C_ESCAPE[letter] !== undefined ? C_ESCAPE[letter] : '\u0000' + letter,
  );
}

/* A field carrying every corruption type at once; non-empty after cleaning. */
function corruptedField(prefix: string): string {
  return `${prefix} 1/x\u0007 ${corrupt('$\\frac{1}{x}$')} tail\ufffd`;
}

describe('parseTutorResponse sanitizes every field', () => {
  it('strips non-renderable chars from message and misconception', () => {
    const raw = JSON.stringify({
      message: corruptedField('Close —'),
      misconception: 'dropped\ufffdthe exponent\u0001',
    });

    const out = parseTutorResponse(raw);

    expect(out).not.toBeNull();
    expect(HAS_NON_RENDERABLE.test(out!.message)).toBe(false);
    expect(HAS_NON_RENDERABLE.test(out!.misconception ?? '')).toBe(false);
    expect(out!.message.length).toBeGreaterThan(0);
    expect(out!.misconception).toBeTruthy();
  });

  it('passes clean LaTeX through verbatim', () => {
    const raw = JSON.stringify({ message: 'Use $\\frac{d}{dx} e^x = e^x$.', misconception: null });
    expect(parseTutorResponse(raw)).toEqual({ message: 'Use $\\frac{d}{dx} e^x = e^x$.' });
  });
});

describe('parsePrefetchResponse sanitizes every field', () => {
  const input = {
    prompt: 'derivative of $x^2$?',
    choices: [
      { id: 'a', label: '$2x$' },
      { id: 'b', label: '$x$' },
    ],
    correctChoiceId: 'a',
    profileSummary: '',
  };

  it('strips non-renderable chars from hint and every per-choice field', () => {
    const raw = JSON.stringify({
      hint: corruptedField('Think:'),
      perChoice: [
        { choiceId: 'a', message: corruptedField('Yes!'), misconception: null },
        { choiceId: 'b', message: corruptedField('Not quite'), misconception: 'lost\ufffda power' },
      ],
    });

    const out = parsePrefetchResponse(raw, input);

    expect(out).not.toBeNull();
    expect(HAS_NON_RENDERABLE.test(out!.hint)).toBe(false);
    expect(out!.perChoice).toHaveLength(2);
    for (const choice of out!.perChoice) {
      expect(HAS_NON_RENDERABLE.test(choice.message)).toBe(false);
      expect(HAS_NON_RENDERABLE.test(choice.misconception ?? '')).toBe(false);
      expect(choice.message.length).toBeGreaterThan(0);
    }
    expect(out!.perChoice[1]!.misconception).toBeTruthy();
  });
});

describe('parseChallengeResponse sanitizes every field', () => {
  it('strips non-renderable chars from prompt, choices[].label, explanation, targetConcept', () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: 'c1',
          prompt: corruptedField('Evaluate'),
          choices: [
            { id: 'a', label: corruptedField('opt') },
            { id: 'b', label: '2x\u0007' },
            { id: 'c', label: 'x\ufffd' },
          ],
          correctChoiceId: 'a',
          explanation: corruptedField('Because'),
          targetConcept: 'limits\ufffd at infinity\u0001',
        },
      ],
    });

    const out = parseChallengeResponse(raw, 1);

    expect(out).not.toBeNull();
    const question = out!.questions[0]!;
    expect(HAS_NON_RENDERABLE.test(question.prompt)).toBe(false);
    expect(HAS_NON_RENDERABLE.test(question.explanation)).toBe(false);
    expect(HAS_NON_RENDERABLE.test(question.targetConcept)).toBe(false);
    expect(question.choices).toHaveLength(3);
    for (const choice of question.choices) {
      expect(HAS_NON_RENDERABLE.test(choice.label)).toBe(false);
      expect(choice.label.length).toBeGreaterThan(0);
    }
  });

  it('passes clean LaTeX through verbatim', () => {
    const raw = JSON.stringify({
      questions: [
        {
          id: 'c1',
          prompt: 'Evaluate $\\lim_{n\\to\\infty}\\frac{5}{n}$.',
          choices: [
            { id: 'a', label: '$\\frac{1}{5}$' },
            { id: 'b', label: '$0$' },
            { id: 'c', label: '$\\infty$' },
          ],
          correctChoiceId: 'b',
          explanation: 'The fraction $\\frac{5}{n}$ shrinks to $0$.',
          targetConcept: 'limits at infinity',
        },
      ],
    });

    const out = parseChallengeResponse(raw, 1);
    const question = out!.questions[0]!;
    expect(question.prompt).toBe('Evaluate $\\lim_{n\\to\\infty}\\frac{5}{n}$.');
    expect(question.choices[0]!.label).toBe('$\\frac{1}{5}$');
    expect(question.explanation).toBe('The fraction $\\frac{5}{n}$ shrinks to $0$.');
    expect(question.targetConcept).toBe('limits at infinity');
  });
});
