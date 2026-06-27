// Chapter model for the SlopeWise calculus course: the shared source of truth
// for chapter identity and ordering. The lessons (./lessons) and practice
// (./questionBank) aggregators order their content by `chapters`; per-chapter
// content lives in ./chapterLessons/<id>.ts and ./chapterQuestions/<id>.ts.

export type Chapter = {
  /** Stable slug, e.g. 'limits'. Used in routes and to tag lessons/questions. */
  id: string;
  /** 1-based display order across the whole course. */
  number: number;
  title: string;
  description: string;
};

export const chapters: Chapter[] = [
  {
    id: 'limits',
    number: 1,
    title: 'Limits',
    description:
      'Make rates of change and continuity precise with the limit, the foundation of calculus.',
  },
  {
    id: 'derivatives',
    number: 2,
    title: 'Derivatives',
    description: 'Define the derivative and build the rules for differentiating functions.',
  },
  {
    id: 'behavior-of-functions',
    number: 3,
    title: 'Graphical Behavior of Functions',
    description:
      'Use derivatives to find extrema, apply the Mean Value Theorem, and analyze concavity and shape.',
  },
  {
    id: 'applications-of-derivatives',
    number: 4,
    title: 'Applications of the Derivative',
    description:
      'Apply derivatives to related rates, optimization, linear approximation, and Newton\u2019s method.',
  },
  {
    id: 'integration',
    number: 5,
    title: 'Integration',
    description:
      'Build the definite integral from Riemann sums and the Fundamental Theorem of Calculus.',
  },
  {
    id: 'techniques-of-integration',
    number: 6,
    title: 'Techniques of Integration',
    description:
      'Master substitution, integration by parts, trigonometric and partial-fraction methods, and improper integrals.',
  },
  {
    id: 'applications-of-integration',
    number: 7,
    title: 'Applications of Integration',
    description: 'Use integrals for area between curves, volumes, arc length, and work.',
  },
  {
    id: 'sequences-and-series',
    number: 8,
    title: 'Sequences and Series',
    description:
      'Study sequences, convergence tests, power series, and Taylor and Maclaurin series.',
  },
  {
    id: 'parametric-and-polar',
    number: 9,
    title: 'Parametric Equations and Polar Coordinates',
    description:
      'Explore conic sections, parametric curves, and polar coordinates with the tools of calculus.',
  },
];
