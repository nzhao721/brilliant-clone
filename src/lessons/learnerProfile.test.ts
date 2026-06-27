import { describe, expect, it } from 'vitest';
import { lessons } from '../data/lessons';
import {
  buildLearnerProfileSummary,
  formatTopicKey,
  getWeakestTopics,
} from './learnerProfile';
import type { LessonProgress, RecentMistake } from './lessonProgress';

function progressWith(overrides: Partial<LessonProgress>): LessonProgress {
  return {
    completedLessonIds: [],
    dailyCompletionDates: [],
    totalXp: 0,
    ...overrides,
  };
}

function mistake(overrides: Partial<RecentMistake>): RecentMistake {
  return {
    questionId: 'q',
    topicKey: 'derivatives/chain-rule',
    prompt: 'Differentiate $\\sin(x^2)$',
    chosenLabel: '$\\cos(x^2)$',
    correctLabel: '$2x\\cos(x^2)$',
    at: '2026-06-24T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildLearnerProfileSummary', () => {
  it('returns an empty string when there is no usable history', () => {
    expect(buildLearnerProfileSummary(progressWith({}))).toBe('');
    expect(buildLearnerProfileSummary(null)).toBe('');
    expect(buildLearnerProfileSummary(undefined)).toBe('');
  });

  it('summarizes overall accuracy, weakest topics, and recent mistakes', () => {
    const progress = progressWith({
      questionAttempts: {
        q1: { correct: 1, incorrect: 3 },
        q2: { correct: 5, incorrect: 0 },
      },
      topicStats: {
        'derivatives/chain-rule': { correct: 1, incorrect: 3 },
        limits: { correct: 5, incorrect: 0 },
        'integration/by-parts': { correct: 0, incorrect: 2 },
      },
      recentMistakes: [
        mistake({ topicKey: 'derivatives/chain-rule' }),
        mistake({ topicKey: 'integration/by-parts', prompt: 'Integrate $x e^x$' }),
        mistake({ topicKey: 'derivatives/chain-rule' }),
      ],
    });

    const summary = buildLearnerProfileSummary(progress);

    // Overall accuracy: 6 correct / 9 attempted = 67%.
    expect(summary).toContain('Overall accuracy: 67%');
    // Weakest topics surface lowest-accuracy first, formatted for readability.
    expect(summary).toContain('Integration - By Parts (0% over 2)');
    expect(summary).toContain('Derivatives - Chain Rule (25% over 4)');
    // A topic at 100% is never called a weakness.
    expect(summary).not.toContain('Limits (100%');
    // Recent mistakes and the recurring trouble spot are included.
    expect(summary).toContain('Recent mistakes:');
    expect(summary).toContain('Recurring trouble spot: Derivatives - Chain Rule.');
  });

  it('lists ALL focus areas (uncapped) but still caps recent mistakes at 15', () => {
    /* 18 weak topics (> the old 15-cap) + one perfect (100%) topic to exclude, and
     * 18 recent mistakes (also > 15). */
    const weakCount = 18;
    const progress = progressWith({
      topicStats: {
        ...Object.fromEntries(
          Array.from({ length: weakCount }, (_, index) => [
            `topic-${index}`,
            { correct: 0, incorrect: 2 },
          ]),
        ),
        // A 100% topic is never a focus area, even with the cap removed.
        'mastered-topic': { correct: 5, incorrect: 0 },
      },
      recentMistakes: Array.from({ length: 18 }, (_, index) =>
        mistake({ questionId: `q${index}`, topicKey: `topic-${index}` }),
      ),
    });

    const summary = buildLearnerProfileSummary(progress);

    // Every weak topic appears now — the AI profile no longer caps focus areas.
    const weakSegment = (summary.split('Weakest topics:')[1] ?? '').split('Recent mistakes:')[0];
    expect(weakSegment.split('% over').length - 1).toBe(weakCount);
    for (let index = 0; index < weakCount; index += 1) {
      expect(weakSegment).toContain(`Topic ${index} (0% over 2)`);
    }
    // The perfect (100%) topic is excluded from focus areas.
    expect(weakSegment).not.toContain('Mastered');

    // Recent mistakes are still capped at 15 (one "→ chose" per listed mistake).
    const recentSegment = summary.split('Recent mistakes:')[1] ?? '';
    expect(recentSegment.split('→ chose').length - 1).toBe(15);

    // The Analytics "Focus areas" card path (explicit limit of 5) is unaffected.
    expect(getWeakestTopics(progress, 5, 1)).toHaveLength(5);
  });
});

describe('getWeakestTopics', () => {
  it('returns weakest topics (lowest accuracy first), excluding 100% topics', () => {
    const weak = getWeakestTopics(
      progressWith({
        topicStats: {
          'derivatives/chain-rule': { correct: 1, incorrect: 3 }, // 25%
          limits: { correct: 5, incorrect: 0 }, // 100% -> excluded
          'integration/by-parts': { correct: 0, incorrect: 2 }, // 0%
        },
      }),
      5,
      1,
    );

    expect(weak.map((topic) => topic.topicKey)).toEqual([
      'integration/by-parts',
      'derivatives/chain-rule',
    ]);
    expect(weak[0]).toMatchObject({ label: 'Integration - By Parts', accuracy: 0, total: 2 });
  });

  it('honors the minimum-attempts threshold', () => {
    const progress = progressWith({
      topicStats: { lonely: { correct: 0, incorrect: 1 } },
    });

    expect(getWeakestTopics(progress, 5, 2)).toHaveLength(0);
    expect(getWeakestTopics(progress, 5, 1)).toHaveLength(1);
  });

  it('returns nothing for empty progress', () => {
    expect(getWeakestTopics(progressWith({}))).toEqual([]);
    expect(getWeakestTopics(null)).toEqual([]);
  });

  it('labels a per-lesson topic (lessonId key) with its lesson title', () => {
    const lesson = lessons[0];
    const weak = getWeakestTopics(
      progressWith({ topicStats: { [lesson.id]: { correct: 1, incorrect: 3 } } }),
      5,
      1,
    );

    expect(weak[0]).toMatchObject({ topicKey: lesson.id, label: lesson.title });
  });
});

describe('formatTopicKey', () => {
  it('humanizes chapter/category and chapter keys in Title Case', () => {
    expect(formatTopicKey('derivatives/chain-rule')).toBe('Derivatives - Chain Rule');
    expect(formatTopicKey('functions-and-graphs')).toBe('Functions and Graphs');
    /* Single word capitalized; connector words stay lowercase unless leading. */
    expect(formatTopicKey('limits')).toBe('Limits');
  });

  it('renders a per-lesson key (lessonId) as the lesson title', () => {
    const lesson = lessons[0];
    expect(formatTopicKey(lesson.id)).toBe(lesson.title);
    // The title is the human label, not just the sluggified id.
    expect(formatTopicKey(lesson.id)).not.toBe(lesson.id.replace(/[-_]+/g, ' '));
  });
});
