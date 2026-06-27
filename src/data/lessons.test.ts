import { describe, expect, it } from 'vitest';
import { chapters } from './chapters';
import { getLessonById, lessons, type InteractiveVisual, type Lesson, type LessonStep } from './lessons';

// Validate course STRUCTURE generically (not a hard-coded lesson sequence), so tests survive content growth.

const chapterIds = new Set(chapters.map((chapter) => chapter.id));

const allowedVisualTypes = new Set<InteractiveVisual['type']>([
  // Original 7 interactive graph types.
  'function-cursor',
  'linear-cursor',
  'rate-window',
  'slope-triangle',
  'tangent-cursor',
  'function-derivative-overlay',
  'nonsmooth-example',
  // New chapter 5-11 widget types.
  'riemann-sum',
  'area-accumulation',
  'area-between-curves',
  'solid-of-revolution',
  'slope-field',
  'sequence-plot',
  'taylor-approximation',
  'interval-of-convergence',
  'parametric-curve',
  'polar-curve',
  'conic-section',
  'unit-circle',
  'horizontal-line-test',
  'function-explorer',
]);

const validStatuses = new Set<Lesson['status']>(['available', 'locked', 'complete']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Every learner-visible string on a step, for math/copy validation. */
function getStepStrings(step: LessonStep): string[] {
  const strings: string[] = [step.title];

  if (step.type === 'concept') {
    strings.push(step.body);
    if (step.interactiveNote) {
      strings.push(step.interactiveNote);
    }
  } else {
    strings.push(step.prompt, step.correctExplanation, step.incorrectExplanation);
    if (step.hint) {
      strings.push(step.hint);
    }
    strings.push(...step.options.map((option) => option.label));
  }

  if (step.visual) {
    strings.push(step.visual.label);
  }

  return strings;
}

function getAllVisibleStrings(): string[] {
  return lessons.flatMap((lesson) => [
    lesson.title,
    lesson.description,
    ...lesson.steps.flatMap(getStepStrings),
  ]);
}

function countDollarSigns(value: string): number {
  return (value.match(/\$/g) ?? []).length;
}

describe('course content structure', () => {
  it('ships a non-empty flat course', () => {
    expect(lessons.length).toBeGreaterThan(0);
  });

  it('gives every lesson an id, title, description, and valid chapter', () => {
    for (const lesson of lessons) {
      expect(isNonEmptyString(lesson.id), `lesson id: ${lesson.id}`).toBe(true);
      expect(isNonEmptyString(lesson.title), `title for ${lesson.id}`).toBe(true);
      expect(isNonEmptyString(lesson.description), `description for ${lesson.id}`).toBe(true);
      expect(chapterIds.has(lesson.chapterId), `chapterId for ${lesson.id}`).toBe(true);
      expect(validStatuses.has(lesson.status), `status for ${lesson.id}`).toBe(true);
      expect(typeof lesson.estimatedMinutes, `estimatedMinutes for ${lesson.id}`).toBe('number');
      expect(lesson.estimatedMinutes, `estimatedMinutes for ${lesson.id}`).toBeGreaterThan(0);
    }
  });

  it('uses slug-style lesson ids', () => {
    for (const lesson of lessons) {
      expect(lesson.id, `slug for ${lesson.id}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('keeps every lesson id globally unique', () => {
    const ids = lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every lesson at least one step with unique step ids', () => {
    for (const lesson of lessons) {
      expect(lesson.steps.length, `steps for ${lesson.id}`).toBeGreaterThanOrEqual(1);

      const stepIds = lesson.steps.map((step) => step.id);
      expect(stepIds.every(isNonEmptyString), `step ids for ${lesson.id}`).toBe(true);
      expect(new Set(stepIds).size, `unique step ids for ${lesson.id}`).toBe(stepIds.length);
    }
  });

  it('gives every step a title and non-empty body or prompt', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        const context = `${lesson.id}/${step.id}`;
        expect(isNonEmptyString(step.title), `title for ${context}`).toBe(true);

        if (step.type === 'concept') {
          expect(isNonEmptyString(step.body), `body for ${context}`).toBe(true);
        } else {
          expect(isNonEmptyString(step.prompt), `prompt for ${context}`).toBe(true);
        }
      }
    }
  });

  it('gives every multiple-choice step 2-5 options with exactly one correct answer', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        if (step.type !== 'multiple-choice') {
          continue;
        }

        const context = `${lesson.id}/${step.id}`;

        expect(step.options.length, `option count for ${context}`).toBeGreaterThanOrEqual(2);
        expect(step.options.length, `option count for ${context}`).toBeLessThanOrEqual(5);

        const optionIds = step.options.map((option) => option.id);
        expect(optionIds.every(isNonEmptyString), `option ids for ${context}`).toBe(true);
        expect(new Set(optionIds).size, `unique option ids for ${context}`).toBe(optionIds.length);
        expect(step.options.every((option) => isNonEmptyString(option.label)), `labels for ${context}`).toBe(true);

        const matches = step.options.filter((option) => option.id === step.correctOptionId);
        expect(matches.length, `correctOptionId for ${context}`).toBe(1);

        expect(isNonEmptyString(step.correctExplanation), `correct copy for ${context}`).toBe(true);
        expect(isNonEmptyString(step.incorrectExplanation), `incorrect copy for ${context}`).toBe(true);
      }
    }
  });

  it('only uses supported interactive visual types', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        if (!step.visual) {
          continue;
        }

        const context = `${lesson.id}/${step.id}`;
        expect(allowedVisualTypes.has(step.visual.type), `visual type ${step.visual.type} in ${context}`).toBe(
          true,
        );
        expect(isNonEmptyString(step.visual.label), `visual label for ${context}`).toBe(true);
      }
    }
  });

  it('keeps math copy delimiters balanced', () => {
    const unbalanced = getAllVisibleStrings().filter((value) => countDollarSigns(value) % 2 !== 0);
    expect(unbalanced).toEqual([]);
  });

  it('covers every chapter with at least one lesson', () => {
    for (const chapter of chapters) {
      const chapterLessons = lessons.filter((lesson) => lesson.chapterId === chapter.id);
      expect(chapterLessons.length, `lessons in ${chapter.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('orders the flat course by chapter order', () => {
    const chapterOrder = new Map(chapters.map((chapter, index) => [chapter.id, index]));
    const indices = lessons.map((lesson) => chapterOrder.get(lesson.chapterId) ?? -1);

    expect(indices.every((index) => index >= 0)).toBe(true);
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i], `chapter order at lesson ${lessons[i].id}`).toBeGreaterThanOrEqual(indices[i - 1]);
    }
  });
});

describe('getLessonById', () => {
  it('finds an existing lesson by id', () => {
    const sample = lessons[0];
    expect(getLessonById(sample.id)).toBe(sample);
  });

  it('returns undefined for an unknown id', () => {
    expect(getLessonById('definitely-not-a-real-lesson')).toBeUndefined();
    expect(getLessonById(undefined)).toBeUndefined();
  });
});
