import { describe, expect, it } from 'vitest';
import { getLessonById, lessons } from './lessons';

const inlineMathPattern = /\$[^$\n]+?\$/g;
const mathLikeProsePatterns = [
  /f'\(/,
  /\b[xy]-axis\b/i,
  /\b(?:always|exactly|about|number|dividing by|denominator is|approaches?|approaching|power by)\s+-?\d+(?:\.\d+)?\b/i,
];
const malformedPowerRulePatterns = [
  /\bn\s*x\s*\(\s*n\s*-\s*1\s*\)/i,
  /\^\s*\(/,
];

function textOutsideInlineMath(value: string) {
  return value.replace(inlineMathPattern, ' ');
}

function normalizeOptionLabel(value: string) {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

function getVisibleLessonStrings() {
  const visibleStrings: string[] = [];

  for (const lesson of lessons) {
    visibleStrings.push(lesson.description, lesson.title);

    for (const step of lesson.steps) {
      visibleStrings.push(step.title);

      if (step.type === 'concept') {
        visibleStrings.push(step.body);
      } else {
        visibleStrings.push(
          step.correctExplanation,
          step.incorrectExplanation,
          step.prompt,
          ...(step.hint ? [step.hint] : []),
          ...step.options.map((option) => option.label),
        );
      }

      if (step.visual) {
        visibleStrings.push(step.visual.label);
      }
    }
  }

  return visibleStrings;
}

describe('lessons data', () => {
  it('includes the expanded derivative lesson sequence', () => {
    expect(lessons).toHaveLength(18);
    expect(lessons.map((lesson) => lesson.id)).toEqual([
      'what-changes',
      'slope-refresher',
      'average-rate-of-change',
      'zooming-in-on-curves',
      'tangent-lines',
      'derivative-as-slope',
      'difference-quotient',
      'limits-from-secant-lines',
      'formal-derivative-definition',
      'derivative-units',
      'reading-derivatives-from-graphs',
      'derivative-sign-charts',
      'where-derivatives-are-zero',
      'when-derivatives-do-not-exist',
      'derivative-as-velocity',
      'comparing-function-and-derivative-graphs',
      'power-rule-intuition',
      'constant-and-linear-rules',
    ]);
    expect(getLessonById('derivative-rules-preview')).toBeUndefined();
    expect(getLessonById('optimization-intuition')).toBeUndefined();
    expect(getLessonById('curve-sketching-with-derivatives')).toBeUndefined();
  });

  it('includes available starter lessons and locked future lessons', () => {
    expect(lessons.filter((lesson) => lesson.status === 'available')).toHaveLength(2);
    expect(lessons.some((lesson) => lesson.status === 'locked')).toBe(true);
  });

  it('includes complete playable content for every lesson', () => {
    for (const lesson of lessons) {
      const questionSteps = lesson.steps.filter((step) => step.type === 'multiple-choice');

      expect(lesson.steps).toHaveLength(7);
      expect(questionSteps).toHaveLength(5);
      expect(lesson.steps.every((step) => Boolean(step.visual))).toBe(true);
    }
  });

  it('gives every multiple-choice question four or five choices with one correct option', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        if (step.type !== 'multiple-choice') {
          continue;
        }

        const context = `${lesson.id}/${step.id}`;

        expect([4, 5], context).toContain(step.options.length);
        expect(new Set(step.options.map((option) => option.id)).size, context).toBe(
          step.options.length,
        );
        expect(
          step.options.filter((option) => option.id === step.correctOptionId),
          context,
        ).toHaveLength(1);
      }
    }
  });

  it('keeps normalized multiple-choice labels unique per question', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        if (step.type !== 'multiple-choice') {
          continue;
        }

        const context = `${lesson.id}/${step.id}`;
        const normalizedLabels = step.options.map((option) => normalizeOptionLabel(option.label));

        expect(new Set(normalizedLabels).size, context).toBe(normalizedLabels.length);
      }
    }
  });

  it('finds lessons by id', () => {
    expect(getLessonById('what-changes')?.title).toBe('What Changes?');
    expect(getLessonById('missing-lesson')).toBeUndefined();
  });

  it('uses a straight rise-run visual for the output change question', () => {
    const lesson = getLessonById('what-changes');
    const step = lesson?.steps.find((item) => item.id === 'table-change');

    expect(step?.visual).toMatchObject({
      type: 'slope-triangle',
      initialStartX: 1,
      initialStartY: 2,
      initialRun: 2,
      initialRise: 3,
    });
  });

  it('uses a straight origin-line visual for the direction of change question', () => {
    const lesson = getLessonById('what-changes');
    const step = lesson?.steps.find((item) => item.id === 'direction-of-change');

    expect(step).toMatchObject({
      prompt: 'If the output changes from $4$ up to $6$, what kind of output change happened?',
      correctOptionId: 'positive',
      visual: {
        type: 'linear-cursor',
        initialX: 2,
        slope: 1,
      },
    });
  });

  it('uses integer-x graph values for the output change question', () => {
    const lesson = getLessonById('what-changes');
    const step = lesson?.steps.find((item) => item.id === 'output-change');

    expect(step).toMatchObject({
      prompt: 'If the output moves from $4$ to $10$, what is the output change?',
      correctOptionId: 'six',
      visual: {
        type: 'function-cursor',
        initialX: 3,
      },
    });
  });

  it('extends the course through the formal limit definition', () => {
    expect(getLessonById('difference-quotient')?.title).toBe('The Difference Quotient');
    expect(getLessonById('limits-from-secant-lines')?.title).toBe('Limits from Secant Lines');
    expect(getLessonById('formal-derivative-definition')?.steps[0]).toMatchObject({
      title: 'The full definition',
      body: expect.stringContaining('[[formal-derivative-formula]]'),
    });
  });

  it('extends the course through derivative applications and rules', () => {
    expect(getLessonById('derivative-units')?.title).toBe('Derivative Units');
    expect(getLessonById('derivative-as-velocity')?.description).toContain('velocity');
    expect(getLessonById('power-rule-intuition')?.steps[1]).toMatchObject({
      prompt: 'Using the power rule idea, what is the derivative of $x^2$?',
      correctOptionId: 'two-x',
    });
  });

  it('matches power-rule graph shapes to function-specific prompts', () => {
    const lesson = getLessonById('power-rule-intuition');

    expect(lesson?.steps.find((step) => step.id === 'square-slope')).toMatchObject({
      title: 'Derivative of $x^2$',
      visual: {
        type: 'tangent-cursor',
        curveShape: 'quadratic',
      },
    });
    expect(lesson?.steps.find((step) => step.id === 'cube-slope')).toMatchObject({
      title: 'Derivative of $x^3$',
      prompt: 'What does the power rule suggest for the derivative of $x^3$?',
      visual: {
        type: 'tangent-cursor',
        label: expect.stringContaining('$x^3$'),
        curveShape: 'cubic',
      },
    });
  });

  it('aligns turning-point tangent visuals with max/min wording', () => {
    const expectations = [
      {
        lessonId: 'derivative-sign-charts',
        stepId: 'zero-between-signs',
        curveShape: 'valley',
        initialX: 2,
      },
      {
        lessonId: 'derivative-sign-charts',
        stepId: 'positive-to-negative',
        curveShape: 'peak',
        initialX: 4,
      },
      {
        lessonId: 'where-derivatives-are-zero',
        stepId: 'valley-zero',
        curveShape: 'valley',
        initialX: 2,
      },
    ] as const;

    for (const expectation of expectations) {
      const step = getLessonById(expectation.lessonId)?.steps.find(
        (item) => item.id === expectation.stepId,
      );

      expect(step?.visual, `${expectation.lessonId}/${expectation.stepId}`).toMatchObject({
        type: 'tangent-cursor',
        curveShape: expectation.curveShape,
        initialX: expectation.initialX,
      });
    }
  });

  it('uses overlay visuals for comparing function and derivative graphs', () => {
    const lesson = getLessonById('comparing-function-and-derivative-graphs');
    const overlaySteps = lesson?.steps.filter(
      (step) => step.visual?.type === 'function-derivative-overlay',
    );

    expect(overlaySteps?.map((step) => step.id)).toEqual([
      'compare-intro',
      'zeros-match-flat',
      'local-max-derivative',
      'compare-summary',
    ]);
    expect(overlaySteps?.map((step) => step.visual?.label).join(' ')).toContain('same axes');
    expect(lesson?.steps.find((step) => step.id === 'local-max-derivative')?.visual).toMatchObject({
      type: 'function-derivative-overlay',
      curveShape: 'peak',
    });
    expect(lesson?.steps.find((step) => step.id === 'compare-intro')).toMatchObject({
      type: 'concept',
      body: expect.stringContaining('green curve is $f$'),
      visual: {
        type: 'function-derivative-overlay',
      },
    });
  });

  it('uses nonsmooth graph examples for derivative nonexistence cases', () => {
    const lesson = getLessonById('when-derivatives-do-not-exist');

    expect(lesson?.steps.map((step) => step.id)).toEqual([
      'dne-intro',
      'corner-issue',
      'cusp-issue',
      'jump-issue',
      'vertical-tangent',
      'hole-issue',
      'dne-summary',
    ]);
    expect(lesson?.steps.map((step) => step.visual)).toEqual([
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'corner' }),
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'corner' }),
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'cusp' }),
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'jump' }),
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'vertical-tangent' }),
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'hole' }),
      expect.objectContaining({ type: 'nonsmooth-example', shape: 'corner' }),
    ]);
    expect(lesson?.steps.find((step) => step.id === 'cusp-issue')).toMatchObject({
      prompt: expect.stringContaining('$y = |x|^{2/3}$'),
      visual: {
        type: 'nonsmooth-example',
        label: expect.stringContaining('$y = |x|^{2/3}$'),
        shape: 'cusp',
      },
    });
  });

  it('formats variables in formal definition answer choices as math', () => {
    const lesson = getLessonById('formal-derivative-definition');
    const step = lesson?.steps.find((item) => item.id === 'definition-whole-form');

    expect(step).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({
          id: 'random-average',
          label: 'A random average far from $a$',
        }),
      ]),
    });
  });

  it('does not include raw TeX commands in lesson copy', () => {
    const visibleStrings = getVisibleLessonStrings();

    expect(visibleStrings.filter((value) => /\\[a-zA-Z]+/.test(value))).toEqual([]);
  });

  it('keeps mathematical answer-choice notation inside inline math delimiters', () => {
    const unformattedChoices = lessons.flatMap((lesson) =>
      lesson.steps.flatMap((step) => {
        if (step.type !== 'multiple-choice') {
          return [];
        }

        return step.options
          .map((option) => ({
            context: `${lesson.id}/${step.id}/${option.id}`,
            outsideMath: textOutsideInlineMath(option.label),
          }))
          .filter(({ outsideMath }) => /(^|\s)-?\d+(?:\.\d+)?(\s|$)/.test(outsideMath));
      }),
    );

    expect(unformattedChoices).toEqual([]);
  });

  it('does not leave derivative notation or math-like numeric phrases outside inline math', () => {
    const unformattedStrings = getVisibleLessonStrings().filter((value) => {
      const outsideMath = textOutsideInlineMath(value);

      return mathLikeProsePatterns.some((pattern) => pattern.test(outsideMath));
    });

    expect(unformattedStrings).toEqual([]);
  });

  it('uses braced exponents for power-rule formulas', () => {
    const malformedPowerRuleCopy = getVisibleLessonStrings().filter((value) =>
      malformedPowerRulePatterns.some((pattern) => pattern.test(value)),
    );

    expect(malformedPowerRuleCopy).toEqual([]);
  });

  it('does not tell learners that run zero is disallowed', () => {
    const disallowedRunZeroCopy = getVisibleLessonStrings().filter((value) =>
      /run\s+\$?0\$?\s+is not allowed/i.test(value),
    );

    expect(disallowedRunZeroCopy).toEqual([]);
  });

  it('keeps non-positive linear cursor visuals distinct and on-screen', () => {
    const nonPositiveLinearVisuals = lessons.flatMap((lesson) =>
      lesson.steps.flatMap((step) => {
        if (step.visual?.type !== 'linear-cursor' || step.visual.slope > 0) {
          return [];
        }

        return [{ context: `${lesson.id}/${step.id}`, visual: step.visual }];
      }),
    );

    expect(nonPositiveLinearVisuals.length).toBeGreaterThan(0);

    for (const { context, visual } of nonPositiveLinearVisuals) {
      const yIntercept = visual.yIntercept ?? 0;
      const defaultY = visual.slope * visual.initialX + yIntercept;
      const intentionallyOriginBased = /\borigin\b|\bx-axis\b/i.test(visual.label);

      if (!intentionallyOriginBased) {
        expect(yIntercept, context).toBeGreaterThan(0);
      }

      expect(defaultY, context).toBeGreaterThanOrEqual(0);
      expect(defaultY, context).toBeLessThanOrEqual(10);
    }
  });
});
