// Lessons aggregator. Shared types live here (re-exported across the app), and
// the flat `lessons` array is assembled from per-chapter modules in
// ./chapterLessons, ordered by ./chapters. Per-chapter modules import the
// `Lesson` type from here with `import type`, so there is no runtime cycle.

import { chapters } from './chapters';
import { limitsLessons } from './chapterLessons/limits';
import { derivativesLessons } from './chapterLessons/derivatives';
import { behaviorOfFunctionsLessons } from './chapterLessons/behavior-of-functions';
import { applicationsOfDerivativesLessons } from './chapterLessons/applications-of-derivatives';
import { integrationLessons } from './chapterLessons/integration';
import { techniquesOfIntegrationLessons } from './chapterLessons/techniques-of-integration';
import { applicationsOfIntegrationLessons } from './chapterLessons/applications-of-integration';
import { sequencesAndSeriesLessons } from './chapterLessons/sequences-and-series';
import { parametricAndPolarLessons } from './chapterLessons/parametric-and-polar';
import type { NewInteractiveVisual } from '../components/widgets';

export type LessonStatus = 'available' | 'locked' | 'complete';

type LessonOption = {
  id: string;
  label: string;
};

export type InteractiveVisual =
  | {
      type: 'function-cursor';
      label: string;
      initialX: number;
      curveShape?: FunctionCurveShape;
    }
  | {
      type: 'linear-cursor';
      label: string;
      initialX: number;
      slope: number;
      yIntercept?: number;
    }
  | {
      type: 'rate-window';
      label: string;
      initialStartX: number;
      initialEndX: number;
    }
  | {
      type: 'slope-triangle';
      label: string;
      initialStartX?: number;
      initialStartY?: number;
      initialRise: number;
      initialRun: number;
    }
  | {
      type: 'tangent-cursor';
      label: string;
      initialX: number;
      curveShape?: FunctionCurveShape;
    }
  | {
      type: 'function-derivative-overlay';
      label: string;
      curveShape?: 'valley' | 'peak';
    }
  | {
      type: 'nonsmooth-example';
      label: string;
      shape: 'corner' | 'cusp' | 'jump' | 'hole' | 'vertical-tangent';
    }
  | NewInteractiveVisual;

export type FunctionCurveShape =
  | 'valley'
  | 'peak'
  | 'quadratic'
  | 'cubic'
  | 'quartic'
  | 'linear'
  | 'constant';

export type LessonStep =
  | {
      id: string;
      type: 'concept';
      title: string;
      body: string;
      visual?: InteractiveVisual;
      /**
       * A short note that ties the textbook `body` to the interactive `visual`:
       * what to do in the widget and what the learner should notice there. Shown
       * as a distinct callout beneath the body. Only meaningful when a `visual`
       * is present; reference "the interactive"/"the graph" rather than a side,
       * since the layout stacks on narrow screens.
       */
      interactiveNote?: string;
    }
  | {
      id: string;
      type: 'multiple-choice';
      title: string;
      prompt: string;
      options: LessonOption[];
      correctOptionId: string;
      correctExplanation: string;
      incorrectExplanation: string;
      hint?: string;
      visual?: InteractiveVisual;
    };

export type Lesson = {
  id: string;
  /** Chapter this lesson belongs to (matches a Chapter.id in ./chapters). */
  chapterId: string;
  title: string;
  description: string;
  status: LessonStatus;
  estimatedMinutes: number;
  steps: LessonStep[];
};

const lessonsByChapterId: Record<string, Lesson[]> = {
  limits: limitsLessons,
  derivatives: derivativesLessons,
  'behavior-of-functions': behaviorOfFunctionsLessons,
  'applications-of-derivatives': applicationsOfDerivativesLessons,
  integration: integrationLessons,
  'techniques-of-integration': techniquesOfIntegrationLessons,
  'applications-of-integration': applicationsOfIntegrationLessons,
  'sequences-and-series': sequencesAndSeriesLessons,
  'parametric-and-polar': parametricAndPolarLessons,
};

// Flat course order: chapter by chapter, lessons in module order within each.
export const lessons: Lesson[] = chapters.flatMap(
  (chapter) => lessonsByChapterId[chapter.id] ?? [],
);

export function getLessonById(lessonId: string | undefined) {
  return lessons.find((lesson) => lesson.id === lessonId);
}

/** All lessons in a chapter, in course order. */
export function getChapterLessons(chapterId: string | undefined): Lesson[] {
  return lessons.filter((lesson) => lesson.chapterId === chapterId);
}
