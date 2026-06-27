import { describe, expect, it } from 'vitest';
import { chapters } from './chapters';
import { lessons } from './lessons';
import {
  createSeededRng,
  getPracticeQuestionsForChapter,
  getQuestionsForChapters,
  getQuestionsForLessons,
  pickNextQuestion,
  pickRandomQuestions,
  questionBank,
} from './questionBank';

const MIN_QUESTIONS_PER_CHAPTER = 20;
const chapterIds = new Set(chapters.map((chapter) => chapter.id));

function normalizeOptionLabel(value: string) {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

function countDollarSigns(value: string) {
  return (value.match(/\$/g) ?? []).length;
}

describe('questionBank structure', () => {
  it('is a non-empty bank of well-formed practice questions', () => {
    expect(questionBank.length).toBeGreaterThan(0);

    for (const question of questionBank) {
      expect(question.prompt, question.id).toBeTruthy();
      expect(question.category, question.id).toBeTruthy();
      expect(question.explanation, question.id).toBeTruthy();
      expect(question.chapterId, question.id).toBeTruthy();
    }
  });

  it('tags every question to a chapter that exists in ./chapters', () => {
    for (const question of questionBank) {
      expect(chapterIds.has(question.chapterId), `${question.id} -> ${question.chapterId}`).toBe(true);
    }
  });

  it('keeps question ids globally unique', () => {
    const ids = questionBank.map((question) => question.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each question 4-5 choices with unique ids and exactly one valid correct answer', () => {
    for (const question of questionBank) {
      expect(question.choices.length === 4 || question.choices.length === 5, question.id).toBe(true);

      const choiceIds = question.choices.map((choice) => choice.id);
      expect(new Set(choiceIds).size, question.id).toBe(choiceIds.length);

      expect(question.choices.every((choice) => choice.label.trim().length > 0), question.id).toBe(true);

      const matchingCorrect = question.choices.filter(
        (choice) => choice.id === question.correctChoiceId,
      );
      expect(matchingCorrect, question.id).toHaveLength(1);
    }
  });

  it('keeps normalized answer-choice labels unique within each question', () => {
    for (const question of questionBank) {
      const normalizedLabels = question.choices.map((choice) => normalizeOptionLabel(choice.label));

      expect(new Set(normalizedLabels).size, question.id).toBe(normalizedLabels.length);
    }
  });

  it('uses balanced inline math delimiters in all visible copy', () => {
    for (const question of questionBank) {
      const visibleStrings = [
        question.prompt,
        question.explanation,
        ...question.choices.map((choice) => choice.label),
      ];

      for (const value of visibleStrings) {
        expect(countDollarSigns(value) % 2, `${question.id}: ${value}`).toBe(0);
      }
    }
  });
});

describe('chapter partitioning', () => {
  it('returns only the requested chapter from getPracticeQuestionsForChapter', () => {
    for (const chapter of chapters) {
      const chapterQuestions = getPracticeQuestionsForChapter(chapter.id);

      expect(
        chapterQuestions.every((question) => question.chapterId === chapter.id),
        chapter.id,
      ).toBe(true);
    }
  });

  it('partitions the whole bank across the chapters exactly once', () => {
    const totalAcrossChapters = chapters.reduce(
      (sum, chapter) => sum + getPracticeQuestionsForChapter(chapter.id).length,
      0,
    );

    expect(totalAcrossChapters).toBe(questionBank.length);
  });

  it('provides a healthy number of questions for every chapter', () => {
    for (const chapter of chapters) {
      const count = getPracticeQuestionsForChapter(chapter.id).length;

      expect(count, chapter.id).toBeGreaterThanOrEqual(MIN_QUESTIONS_PER_CHAPTER);
    }
  });

  it('returns an empty list for an unknown chapter id', () => {
    expect(getPracticeQuestionsForChapter('not-a-real-chapter')).toEqual([]);
  });
});

describe('getQuestionsForChapters (unified completed-chapters pool)', () => {
  it('returns the union of questions across the given chapters', () => {
    const ids = [chapters[0].id, chapters[1].id];
    const union = getQuestionsForChapters(ids);

    expect(union.every((question) => ids.includes(question.chapterId))).toBe(true);

    const expectedCount =
      getPracticeQuestionsForChapter(chapters[0].id).length +
      getPracticeQuestionsForChapter(chapters[1].id).length;
    expect(union).toHaveLength(expectedCount);
  });

  it('returns an empty pool when no chapters are completed', () => {
    expect(getQuestionsForChapters([])).toEqual([]);
  });

  it('ignores unknown chapter ids', () => {
    expect(getQuestionsForChapters(['not-a-real-chapter'])).toEqual([]);
  });

  it('returns the whole bank when every chapter is included', () => {
    const everyChapterId = chapters.map((chapter) => chapter.id);

    expect(getQuestionsForChapters(everyChapterId)).toHaveLength(questionBank.length);
  });

  it('de-duplicates repeated chapter ids', () => {
    const singleChapterId = chapters[0].id;

    expect(getQuestionsForChapters([singleChapterId, singleChapterId])).toHaveLength(
      getPracticeQuestionsForChapter(singleChapterId).length,
    );
  });
});

describe('question difficulty', () => {
  it('tags every question with an integer difficulty from 1 to 5', () => {
    for (const question of questionBank) {
      const difficulty = question.difficulty;
      expect(
        typeof difficulty === 'number' &&
          Number.isInteger(difficulty) &&
          difficulty >= 1 &&
          difficulty <= 5,
        `${question.id} -> ${difficulty}`,
      ).toBe(true);
    }
  });

  it('uses more than one difficulty level in every chapter', () => {
    for (const chapter of chapters) {
      const levels = new Set(
        getPracticeQuestionsForChapter(chapter.id).map((question) => question.difficulty),
      );
      expect(levels.size, `${chapter.id} difficulty spread`).toBeGreaterThan(1);
    }
  });
});

describe('lesson tagging', () => {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  it('tags every question to a lesson that exists in the same chapter', () => {
    for (const question of questionBank) {
      expect(question.lessonId, question.id).toBeTruthy();
      const lesson = question.lessonId ? lessonById.get(question.lessonId) : undefined;
      expect(lesson, `${question.id} -> ${question.lessonId}`).toBeDefined();
      expect(lesson?.chapterId, question.id).toBe(question.chapterId);
    }
  });

  it('resolves each chapter category to exactly one lesson', () => {
    const lessonIdsByCategory = new Map<string, Set<string>>();
    for (const question of questionBank) {
      const key = `${question.chapterId}::${question.category}`;
      const set = lessonIdsByCategory.get(key) ?? new Set<string>();
      if (question.lessonId) {
        set.add(question.lessonId);
      }
      lessonIdsByCategory.set(key, set);
    }
    for (const [key, lessonIds] of lessonIdsByCategory) {
      expect(lessonIds.size, key).toBe(1);
    }
  });
});

describe('getQuestionsForLessons (unified completed-lessons pool)', () => {
  it('returns only questions tagged to the given lessons', () => {
    const lessonId = questionBank[0].lessonId as string;
    const result = getQuestionsForLessons([lessonId]);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((question) => question.lessonId === lessonId)).toBe(true);
  });

  it('returns an empty pool when no lessons are completed', () => {
    expect(getQuestionsForLessons([])).toEqual([]);
  });

  it('ignores unknown lesson ids', () => {
    expect(getQuestionsForLessons(['not-a-real-lesson'])).toEqual([]);
  });

  it('returns the whole bank when every lesson is included', () => {
    const everyLessonId = lessons.map((lesson) => lesson.id);

    expect(getQuestionsForLessons(everyLessonId)).toHaveLength(questionBank.length);
  });
});

describe('random selection helpers', () => {
  it('produces a deterministic sequence from a seeded RNG', () => {
    const firstRng = createSeededRng(123);
    const secondRng = createSeededRng(123);

    const firstSequence = [firstRng(), firstRng(), firstRng()];
    const secondSequence = [secondRng(), secondRng(), secondRng()];

    expect(firstSequence).toEqual(secondSequence);
    for (const value of firstSequence) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('picks a deterministic shuffled subset with an injected RNG', () => {
    const firstRun = pickRandomQuestions(questionBank, 8, createSeededRng(42)).map(
      (question) => question.id,
    );
    const secondRun = pickRandomQuestions(questionBank, 8, createSeededRng(42)).map(
      (question) => question.id,
    );
    const differentRun = pickRandomQuestions(questionBank, 8, createSeededRng(7)).map(
      (question) => question.id,
    );

    expect(firstRun).toEqual(secondRun);
    expect(firstRun).toHaveLength(8);
    expect(new Set(firstRun).size).toBe(firstRun.length);
    expect(firstRun.every((id) => questionBank.some((question) => question.id === id))).toBe(true);
    expect(firstRun).not.toEqual(differentRun);
  });

  it('can avoid immediately repeating the previous question', () => {
    const firstQuestion = questionBank[0];
    const nextQuestion = pickNextQuestion(questionBank.slice(0, 5), firstQuestion.id, () => 0);

    expect(nextQuestion.id).not.toBe(firstQuestion.id);
  });

  it('still returns a question when the pool has a single entry', () => {
    const singlePool = questionBank.slice(0, 1);
    const next = pickNextQuestion(singlePool, singlePool[0].id, () => 0);

    expect(next.id).toBe(singlePool[0].id);
  });
});
