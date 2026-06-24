import { describe, expect, it } from 'vitest';
import { lessons } from './lessons';
import {
  createSeededRng,
  getPracticeCategoriesForCompletedLessons,
  getPracticeQuestionsForCompletedLessons,
  lessonPracticeCategoryMap,
  pickNextQuestion,
  pickRandomQuestions,
  questionBank,
} from './questionBank';

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
const laterDerivativeCategories = [
  'Basic sign of derivative',
  'Applied derivative signs',
  'Derivative graph behavior',
  'Turning point sign changes',
  'Velocity as derivative',
  'Velocity from limits',
  'Power-rule intuition',
  'Constant and linear derivative rules',
  'Constant-output derivatives',
  'Constant and linear derivative graphs',
];

function textOutsideInlineMath(value: string) {
  return value.replace(inlineMathPattern, ' ');
}

function normalizeOptionLabel(value: string) {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

function completedThrough(lessonId: string) {
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === lessonId);

  expect(lessonIndex).toBeGreaterThanOrEqual(0);

  return lessons.slice(0, lessonIndex + 1).map((lesson) => lesson.id);
}

function getEligibleCategorySet(completedLessonIds: readonly string[]) {
  return new Set(
    getPracticeQuestionsForCompletedLessons(completedLessonIds).map((question) => question.category),
  );
}

// Earliest lesson index (0-based, in `lessons` order) at which each practice
// category is allowed to surface. Derived from the concepts each lesson
// introduces in lessons.ts. A category must never appear in the eligible set of
// a lesson earlier than its intro index.
const categoryIntroLessonIndex: Record<string, number> = {
  'Basic average rate of change': 0,
  'Slope and tangent lines': 1,
  'Average rate of change': 2,
  'Basic limit intuition': 3,
  'Tangent lines': 4,
  'Basic sign of derivative': 5,
  'Derivative existence from limits': 8,
  'Derivative units': 9,
  'Applied derivative signs': 11,
  'Turning point sign changes': 11,
  'Nonsmooth derivative limits': 13,
  'Velocity as derivative': 14,
  'Velocity from limits': 14,
  'Derivative graph behavior': 15,
  'Power-rule intuition': 16,
  'Constant and linear derivative rules': 17,
  'Constant-output derivatives': 17,
  'Constant and linear derivative graphs': 17,
};

// Textual markers for concepts that are only introduced in later lessons. These
// must not appear in any practice question that becomes eligible before the
// lesson that introduces the concept.
const laterConceptMarkers = [
  { name: "f-prime notation", allowedFromIndex: 5, pattern: /f'\(/ },
  { name: 'velocity', allowedFromIndex: 14, pattern: /velocit/i },
  { name: 'power rule', allowedFromIndex: 16, pattern: /power rule/i },
];

function visibleStringsFor(questions: readonly { prompt: string; explanation: string; choices: { label: string }[] }[]) {
  return questions.flatMap((question) => [
    question.prompt,
    question.explanation,
    ...question.choices.map((choice) => choice.label),
  ]);
}

describe('questionBank', () => {
  it('contains an expanded set of valid practice questions', () => {
    expect(questionBank.length).toBeGreaterThanOrEqual(640);
    expect(new Set(questionBank.map((question) => question.id)).size).toBe(questionBank.length);

    for (const question of questionBank) {
      expect(question.prompt).toBeTruthy();
      expect(question.category).toBeTruthy();
      expect(question.explanation).toBeTruthy();
      expect(question.choices.length === 4 || question.choices.length === 5).toBe(true);
      expect(question.choices.filter((choice) => choice.id === question.correctChoiceId)).toHaveLength(1);
      expect(question.choices.every((choice) => choice.label.trim().length > 0)).toBe(true);
    }
  });

  it('keeps normalized answer-choice labels unique per question', () => {
    for (const question of questionBank) {
      const normalizedLabels = question.choices.map((choice) => normalizeOptionLabel(choice.label));

      expect(new Set(normalizedLabels).size, question.id).toBe(normalizedLabels.length);
    }
  });

  it('does not expose raw TeX backslash commands in visible question copy', () => {
    for (const question of questionBank) {
      expect(question.prompt).not.toContain('\\');
      expect(question.explanation).not.toContain('\\');
      for (const choice of question.choices) {
        expect(choice.label).not.toContain('\\');
      }
    }
  });

  it('keeps mathematical answer-choice notation inside inline math delimiters', () => {
    const unformattedChoices = questionBank.flatMap((question) =>
      question.choices
        .map((choice) => ({
          context: `${question.id}/${choice.id}`,
          outsideMath: textOutsideInlineMath(choice.label),
        }))
        .filter(({ outsideMath }) => /(^|\s)-?\d+(?:\.\d+)?(\s|$)/.test(outsideMath)),
    );

    expect(unformattedChoices).toEqual([]);
  });

  it('does not leave derivative notation or math-like numeric phrases outside inline math', () => {
    const visibleStrings = questionBank.flatMap((question) => [
      question.prompt,
      question.explanation,
      ...question.choices.map((choice) => choice.label),
    ]);
    const unformattedStrings = visibleStrings.filter((value) => {
      const outsideMath = textOutsideInlineMath(value);

      return mathLikeProsePatterns.some((pattern) => pattern.test(outsideMath));
    });

    expect(unformattedStrings).toEqual([]);
  });

  it('uses braced exponents for power-rule formulas', () => {
    const visibleStrings = questionBank.flatMap((question) => [
      question.prompt,
      question.explanation,
      ...question.choices.map((choice) => choice.label),
    ]);
    const malformedPowerRuleCopy = visibleStrings.filter((value) =>
      malformedPowerRulePatterns.some((pattern) => pattern.test(value)),
    );

    expect(malformedPowerRuleCopy).toEqual([]);
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
    expect(firstRun).not.toEqual(differentRun);
  });

  it('can avoid immediately repeating the previous question', () => {
    const firstQuestion = questionBank[0];
    const nextQuestion = pickNextQuestion(questionBank.slice(0, 5), firstQuestion.id, () => 0);

    expect(nextQuestion.id).not.toBe(firstQuestion.id);
  });

  it('maps completed lessons to existing practice categories', () => {
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    const questionCategories = new Set(questionBank.map((question) => question.category));

    expect(Object.keys(lessonPracticeCategoryMap)).toEqual(lessons.map((lesson) => lesson.id));

    for (const [lessonId, categories] of Object.entries(lessonPracticeCategoryMap)) {
      expect(lessonIds.has(lessonId)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      expect(categories.every((category) => questionCategories.has(category))).toBe(true);
    }
  });

  it('filters practice questions by completed lesson topics', () => {
    const completedLessonIds = ['what-changes'];
    const categories = getPracticeCategoriesForCompletedLessons(completedLessonIds);
    const filteredQuestions = getPracticeQuestionsForCompletedLessons(completedLessonIds);

    expect(categories).toEqual(['Basic average rate of change']);
    expect(filteredQuestions.length).toBeGreaterThan(0);
    expect(
      filteredQuestions.every((question) => question.category === 'Basic average rate of change'),
    ).toBe(true);
    expect(getPracticeQuestionsForCompletedLessons([])).toEqual([]);
  });

  it('keeps early lessons from unlocking later derivative topics', () => {
    const earlyCategories = getEligibleCategorySet(completedThrough('zooming-in-on-curves'));

    expect(earlyCategories).toEqual(
      new Set([
        'Basic average rate of change',
        'Slope and tangent lines',
        'Average rate of change',
        'Basic limit intuition',
      ]),
    );

    for (const category of laterDerivativeCategories) {
      expect(earlyCategories.has(category), category).toBe(false);
    }
  });

  it('unlocks derivative sign practice only after derivative-as-slope', () => {
    const beforeDerivativeCategories = getEligibleCategorySet(completedThrough('tangent-lines'));
    const afterDerivativeCategories = getEligibleCategorySet(completedThrough('derivative-as-slope'));

    expect(beforeDerivativeCategories.has('Basic sign of derivative')).toBe(false);
    expect(afterDerivativeCategories.has('Basic sign of derivative')).toBe(true);
    expect(afterDerivativeCategories.has('Applied derivative signs')).toBe(false);
    expect(afterDerivativeCategories.has('Derivative graph behavior')).toBe(false);
  });

  it('keeps applications and rules gated until relevant lessons', () => {
    const beforeVelocityCategories = getEligibleCategorySet(
      completedThrough('when-derivatives-do-not-exist'),
    );
    const velocityCategories = getEligibleCategorySet(completedThrough('derivative-as-velocity'));
    const graphComparisonCategories = getEligibleCategorySet(
      completedThrough('comparing-function-and-derivative-graphs'),
    );
    const powerRuleCategories = getEligibleCategorySet(completedThrough('power-rule-intuition'));
    const finalCategories = getEligibleCategorySet(completedThrough('constant-and-linear-rules'));

    expect(beforeVelocityCategories.has('Velocity as derivative')).toBe(false);
    expect(velocityCategories.has('Velocity as derivative')).toBe(true);
    expect(graphComparisonCategories.has('Derivative graph behavior')).toBe(true);
    expect(powerRuleCategories.has('Power-rule intuition')).toBe(true);
    expect(powerRuleCategories.has('Constant and linear derivative rules')).toBe(false);
    expect(finalCategories.has('Constant and linear derivative rules')).toBe(true);
    expect(finalCategories.has('Constant-output derivatives')).toBe(true);
  });

  it('offers roughly fifty eligible practice questions for each individual lesson', () => {
    for (const lesson of lessons) {
      const eligible = getPracticeQuestionsForCompletedLessons([lesson.id]);

      expect(eligible.length, lesson.id).toBeGreaterThanOrEqual(45);
      expect(eligible.length, lesson.id).toBeLessThanOrEqual(60);
    }
  });

  it('maps every lesson-eligible category to a known concept-introduction lesson', () => {
    const mappedCategories = new Set(Object.values(lessonPracticeCategoryMap).flat());

    for (const category of mappedCategories) {
      expect(categoryIntroLessonIndex[category], category).toBeDefined();
    }
  });

  it('never surfaces a category before the lesson that introduces its concept', () => {
    lessons.forEach((_lesson, lessonIndex) => {
      const completed = lessons.slice(0, lessonIndex + 1).map((lesson) => lesson.id);
      const eligible = getPracticeQuestionsForCompletedLessons(completed);

      for (const question of eligible) {
        const introIndex = categoryIntroLessonIndex[question.category];

        expect(introIndex, `${question.category} has no concept-introduction lesson`).toBeDefined();
        expect(
          introIndex <= lessonIndex,
          `${question.category} unlocked at lesson ${lessonIndex} (${lessons[lessonIndex].id}) but its concept is introduced later`,
        ).toBe(true);
      }
    });
  });

  it('keeps later-lesson concept markers out of earlier eligible questions', () => {
    lessons.forEach((_lesson, lessonIndex) => {
      const completed = lessons.slice(0, lessonIndex + 1).map((lesson) => lesson.id);
      const eligibleStrings = visibleStringsFor(getPracticeQuestionsForCompletedLessons(completed));

      for (const marker of laterConceptMarkers) {
        if (lessonIndex >= marker.allowedFromIndex) {
          continue;
        }

        const offenders = eligibleStrings.filter((value) => marker.pattern.test(value));

        expect(
          offenders,
          `${marker.name} should not be reachable by lesson ${lessonIndex} (${lessons[lessonIndex].id})`,
        ).toEqual([]);
      }
    });
  });
});
