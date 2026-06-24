type PracticeChoice = {
  id: string;
  label: string;
};

export type PracticeQuestion = {
  id: string;
  category: string;
  prompt: string;
  choices: PracticeChoice[];
  correctChoiceId: string;
  explanation: string;
};

export type RandomNumberGenerator = () => number;

type ChoiceInput = {
  correct: string;
  distractors:
    | readonly [string, string, string]
    | readonly [string, string, string, string];
};

const choiceIds = ['a', 'b', 'c', 'd', 'e'] as const;

// Category labels are shared between the generators and the lesson->category
// eligibility map below. The map decides which lesson "unlocks" each category,
// and every question in a category must only use concepts that exist by the
// earliest lesson that maps to it (see the gating tests).
const CATEGORIES = {
  baroc: 'Basic average rate of change',
  aroc: 'Average rate of change',
  stl: 'Slope and tangent lines',
  bli: 'Basic limit intuition',
  tl: 'Tangent lines',
  bsd: 'Basic sign of derivative',
  defl: 'Derivative existence from limits',
  du: 'Derivative units',
  ads: 'Applied derivative signs',
  tpsc: 'Turning point sign changes',
  ndl: 'Nonsmooth derivative limits',
  vad: 'Velocity as derivative',
  vfl: 'Velocity from limits',
  dgb: 'Derivative graph behavior',
  pri: 'Power-rule intuition',
  cldr: 'Constant and linear derivative rules',
  cod: 'Constant-output derivatives',
  cldg: 'Constant and linear derivative graphs',
} as const;

function mathValue(value: number | string) {
  return `$${value}$`;
}

function normalizeDisplayLabel(value: string) {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

function makeMathDistractors(
  correct: number | string,
  candidates: readonly (number | string)[],
): readonly [string, string, string] {
  const correctLabel = mathValue(correct);
  const usedLabels = new Set([normalizeDisplayLabel(correctLabel)]);
  const distractors: string[] = [];

  for (const candidate of candidates) {
    const label = mathValue(candidate);
    const normalizedLabel = normalizeDisplayLabel(label);

    if (usedLabels.has(normalizedLabel)) {
      continue;
    }

    usedLabels.add(normalizedLabel);
    distractors.push(label);

    if (distractors.length === 3) {
      return [distractors[0], distractors[1], distractors[2]];
    }
  }

  throw new Error(`Not enough distinct distractors for ${correctLabel}`);
}

function hashText(value: string) {
  return [...value].reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function makeChoices({ correct, distractors }: ChoiceInput, correctIndex: number) {
  const labels = [...distractors];
  labels.splice(correctIndex, 0, correct);

  return labels.map((label, index) => ({
    id: choiceIds[index],
    label,
  }));
}

function makeQuestion(
  id: string,
  category: string,
  prompt: string,
  choices: ChoiceInput,
  explanation: string,
): PracticeQuestion {
  const correctIndex = hashText(id) % (choices.distractors.length + 1);

  return {
    id,
    category,
    prompt,
    choices: makeChoices(choices, correctIndex),
    correctChoiceId: choiceIds[correctIndex],
    explanation,
  };
}

// Concept (text-answer) question with exactly three distractors. The caller is
// responsible for keeping the four labels distinct after normalization.
function makeConceptQuestion(
  id: string,
  category: string,
  prompt: string,
  correct: string,
  distractors: readonly string[],
  explanation: string,
): PracticeQuestion {
  return makeQuestion(
    id,
    category,
    prompt,
    {
      correct,
      distractors: [distractors[0], distractors[1], distractors[2]] as [string, string, string],
    },
    explanation,
  );
}

// Numeric question. The candidate tail (correct +/- small offsets) guarantees at
// least three distinct distractors even when the "common mistake" candidates
// collide with the correct answer.
function numericQuestion(
  id: string,
  category: string,
  prompt: string,
  correct: number,
  mistakeCandidates: readonly number[],
  explanation: string,
): PracticeQuestion {
  const pool = [
    ...mistakeCandidates,
    correct + 1,
    correct - 1,
    correct + 2,
    correct - 2,
    correct + 3,
  ];

  return makeQuestion(
    id,
    category,
    prompt,
    { correct: mathValue(correct), distractors: makeMathDistractors(correct, pool) },
    explanation,
  );
}

function withoutCorrect(options: readonly string[], correct: string) {
  return options.filter((option) => option !== correct).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Lesson 1 (what-changes): basic average rate over an interval, computed only
// from output change divided by input change. Linear values only.
// ---------------------------------------------------------------------------
const barocSlopes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const barocIntervals: [number, number][] = [
  [0, 1],
  [1, 3],
  [2, 4],
  [0, 5],
  [3, 6],
];

const basicAverageRateQuestions = barocIntervals.flatMap(([startX, endX]) =>
  barocSlopes.map((slope) => {
    const startY = slope * startX;
    const endY = slope * endX;

    return numericQuestion(
      `baroc-${slope}-${startX}-${endX}`,
      CATEGORIES.baroc,
      `As the input increases from $${startX}$ to $${endX}$, the output changes from $${startY}$ to $${endY}$. What is the average rate of change?`,
      slope,
      [endY - startY, endX - startX, -slope],
      `The average rate of change is the output change divided by the input change, which equals $${slope}$.`,
    );
  }),
);

// ---------------------------------------------------------------------------
// Lesson 3 (average-rate-of-change): average rate for curves, using the two
// output values supplied in the prompt. Reused by lesson 7 (difference quotient).
// ---------------------------------------------------------------------------
const arocFunctions = [
  { key: 'sq', expr: 'x^2', f: (x: number) => x * x },
  { key: 'cube', expr: 'x^3', f: (x: number) => x * x * x },
  { key: 'twosq', expr: '2x^2', f: (x: number) => 2 * x * x },
  { key: 'sqx', expr: 'x^2 + x', f: (x: number) => x * x + x },
  { key: 'sqm2x', expr: 'x^2 - 2x', f: (x: number) => x * x - 2 * x },
];
const arocIntervals: [number, number][] = [
  [1, 3],
  [1, 4],
  [2, 4],
  [2, 5],
  [1, 5],
  [0, 3],
  [3, 5],
  [2, 6],
  [0, 4],
  [1, 6],
];

const averageRateQuestions = arocFunctions.flatMap(({ key, expr, f }) =>
  arocIntervals.map(([a, b]) => {
    const ya = f(a);
    const yb = f(b);
    const rate = (yb - ya) / (b - a);

    return numericQuestion(
      `aroc-${key}-${a}-${b}`,
      CATEGORIES.aroc,
      `For $f(x) = ${expr}$, $f(${a}) = ${ya}$ and $f(${b}) = ${yb}$. What is the average rate of change from $x = ${a}$ to $x = ${b}$?`,
      rate,
      [yb - ya, b - a, -rate],
      `Divide the change in output by the change in input to get $${rate}$.`,
    );
  }),
);

// ---------------------------------------------------------------------------
// Lesson 2 (slope-refresher): pure rise-over-run slope. No tangent/derivative
// concept is used even though the category is named "Slope and tangent lines".
// ---------------------------------------------------------------------------
const stlSlopes = [1, 2, 3, -1, -2, 4, -3, 5, 6, -4];
const stlRuns = [1, 2, 3, 4, 5];

const slopeQuestions = stlRuns.flatMap((run) =>
  stlSlopes.map((slope) => {
    const rise = slope * run;

    return numericQuestion(
      `stl-${slope}-${run}`,
      CATEGORIES.stl,
      `A line has rise $${rise}$ and run $${run}$. What is its slope?`,
      slope,
      [rise, run, -slope, rise + run],
      `Slope is rise divided by run: $${rise} / ${run} = ${slope}$.`,
    );
  }),
);

// ---------------------------------------------------------------------------
// Lesson 4 (zooming-in-on-curves): pre-limit intuition. Uses only zooming,
// local slope, secants and short intervals. No tangent lines (lesson 5),
// no "h" notation (lesson 7), and no "limit" language (lesson 8).
// ---------------------------------------------------------------------------
const bliSlopeValues = [2, 3, 4, 5, 6, 7, -2, -3, -4, -5];
const bliPoints = [1, 2, 3];

const bliSmallInterval = bliPoints.flatMap((p) =>
  bliSlopeValues.map((slope, index) => {
    const startY = p + 3;
    const endX = p + 0.5;
    const endY = startY + slope * 0.5;

    return numericQuestion(
      `bli-small-${p}-${index}`,
      CATEGORIES.bli,
      `Near $x = ${p}$, a smooth function's output changes from $${startY}$ to $${endY}$ as the input goes from $${p}$ to $${endX}$. What is the average rate of change over this short interval?`,
      slope,
      [slope * 0.5, 0.5, -slope],
      `Over the short interval the output change divided by the input change is $${slope}$, which estimates the local slope.`,
    );
  }),
);

const bliConceptTemplates = [
  {
    key: 'zoom-line',
    correct: 'A straight line',
    distractors: ['A vertical line', 'A single point', 'A circle'],
    prompt: (p: number) =>
      `When you zoom in very close to a smooth curve near $x = ${p}$, the curve starts to look most like which shape?`,
    explanation: 'Zooming in on a smooth curve makes a small piece look almost straight.',
  },
  {
    key: 'more-local',
    correct: 'More local',
    distractors: ['More global', 'Random', 'Vertical'],
    prompt: (p: number) =>
      `As you use a smaller and smaller interval around $x = ${p}$, the secant slope describes change that is which of these?`,
    explanation: 'A smaller interval focuses the rate of change near a single point.',
  },
  {
    key: 'valley-zero',
    correct: '$0$',
    distractors: ['$10$', 'Undefined', 'A large positive value'],
    prompt: (p: number) =>
      `Near a smooth low point at $x = ${p}$, the local slope is closest to which value?`,
    explanation: 'At the bottom of a smooth dip the curve is momentarily flat, so the local slope is near $0$.',
  },
  {
    key: 'rising-positive',
    correct: 'Positive',
    distractors: ['Negative', 'Zero', 'Undefined'],
    prompt: (p: number) =>
      `If a smooth curve is rising as it passes $x = ${p}$, the local slope there is which sign?`,
    explanation: 'Rising as the input increases means a positive local slope.',
  },
  {
    key: 'one-point',
    correct: 'The slope at that one point',
    distractors: ['The total height', 'The area under the curve', 'The input value'],
    prompt: (p: number) =>
      `Zooming in to study a smooth curve at the single input $x = ${p}$ helps you estimate which of these?`,
    explanation: 'Zooming in estimates the slope at one point.',
  },
];

const bliConceptual = [1, 2, 3, 4].flatMap((p) =>
  bliConceptTemplates.map((template) =>
    makeConceptQuestion(
      `bli-con-${template.key}-${p}`,
      CATEGORIES.bli,
      template.prompt(p),
      template.correct,
      template.distractors,
      template.explanation,
    ),
  ),
);

// ---------------------------------------------------------------------------
// Lesson 5 (tangent-lines): tangent line as the best local line. The curve's
// local slope equals the tangent slope. No "f'" notation (lesson 6) and no
// formal "derivative" wording yet.
// ---------------------------------------------------------------------------
const tlSlopes = [1, 2, 3, 4, 5, -1, -2, -3, 6, -4];
const tlRuns = [1, 2, 3];

const tangentNumeric = tlRuns.flatMap((run) =>
  tlSlopes.map((slope) => {
    const rise = slope * run;

    return numericQuestion(
      `tl-num-${slope}-${run}`,
      CATEGORIES.tl,
      `Near a point on a smooth curve, the tangent line changes by $${rise}$ vertically for every $${run}$ to the right. What is the curve's local slope there?`,
      slope,
      [rise, run, -slope, rise + run],
      `The tangent line's slope is the curve's local slope: $${rise} / ${run} = ${slope}$.`,
    );
  }),
);

const tangentSignScenarios: [string, string][] = [
  ['A tangent line tilts upward as $x$ increases', 'Positive'],
  ['A tangent line tilts downward as $x$ increases', 'Negative'],
  ['A tangent line is perfectly horizontal', 'Zero'],
  ['A smooth curve is rising as it passes a point, so its tangent tilts up', 'Positive'],
  ['A smooth curve is falling as it passes a point, so its tangent tilts down', 'Negative'],
  ['At the flat top of a smooth hill, the tangent line is horizontal', 'Zero'],
  ['At the flat bottom of a smooth valley, the tangent line is horizontal', 'Zero'],
  ['A tangent line climbs steeply from left to right', 'Positive'],
  ['A tangent line drops from left to right', 'Negative'],
  ['A tangent line neither rises nor falls', 'Zero'],
];

const tangentSign = tangentSignScenarios.map(([scenario, sign], index) =>
  makeConceptQuestion(
    `tl-sign-${index}`,
    CATEGORIES.tl,
    `${scenario}. What is the sign of the curve's local slope there?`,
    sign,
    withoutCorrect(['Positive', 'Negative', 'Zero', 'Undefined'], sign),
    'The tangent line shows the local direction: up means positive, down means negative, flat means zero.',
  ),
);

const tlSteepPairs: [number, number][] = [
  [1, 2],
  [1, 3],
  [2, 3],
  [2, 5],
  [3, 4],
  [1, 4],
  [2, 6],
  [3, 5],
  [4, 6],
  [1, 5],
];

const tangentSteeper = tlSteepPairs.map(([a, b], index) =>
  makeConceptQuestion(
    `tl-steep-${index}`,
    CATEGORIES.tl,
    `Which tangent line is steeper upward: one with local slope $${a}$ or one with local slope $${b}$?`,
    `$${b}$`,
    [`$${a}$`, 'They are equally steep', '$0$'],
    'A larger positive slope rises faster, so it is the steeper upward tangent.',
  ),
);

// ---------------------------------------------------------------------------
// Lesson 6 (derivative-as-slope): sign of the derivative. Introduces "f'"
// notation and increasing/decreasing language. Reused by lessons 11 and 13.
// ---------------------------------------------------------------------------
const bsdFprimeValues = [
  3, -2, 5, -4, 0, 1, -1, 6, -3, 2, 4, -5, 7, -6, 0, 8, -7, 9, -8, 0, 2, -3, 5, -4, 3,
];

const derivativeSignFromValue = bsdFprimeValues.map((value, index) => {
  const point = index + 1;
  const correct = value > 0 ? 'Increasing' : value < 0 ? 'Decreasing' : 'Momentarily flat';

  return makeConceptQuestion(
    `bsd-fp-${index}`,
    CATEGORIES.bsd,
    `At $x = ${point}$, the derivative is $f'(${point}) = ${value}$. What is the function doing at $x = ${point}$?`,
    correct,
    withoutCorrect(['Increasing', 'Decreasing', 'Momentarily flat', 'Undefined'], correct),
    'The sign of the derivative tells whether the function is increasing, decreasing, or momentarily flat.',
  );
});

const bsdStates = ['increasing', 'decreasing', 'momentarily flat'];

const derivativeSignFromBehavior = Array.from({ length: 25 }, (_unused, index) => {
  const state = bsdStates[index % bsdStates.length];
  const point = index + 1;
  const correct = state === 'increasing' ? 'Positive' : state === 'decreasing' ? 'Negative' : 'Zero';

  return makeConceptQuestion(
    `bsd-beh-${index}`,
    CATEGORIES.bsd,
    `A function is ${state} at $x = ${point}$. What is the sign of $f'(${point})$?`,
    correct,
    withoutCorrect(['Positive', 'Negative', 'Zero', 'Undefined'], correct),
    'An increasing function has a positive derivative, a decreasing one negative, and a momentarily flat one zero.',
  );
});

// ---------------------------------------------------------------------------
// Lesson 9 (formal-derivative-definition): the derivative as the value the
// difference quotient approaches, and existence when one-sided slopes agree.
// ---------------------------------------------------------------------------
const deflLimitValues = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, -1, -2, -3, -4, -5, 11, 12, 13, -6, -7, 14, 15, -8, -9, 16,
];

const derivativeFromLimit = deflLimitValues.map((target, index) => {
  const point = index + 1;

  return numericQuestion(
    `defl-lim-${index}`,
    CATEGORIES.defl,
    `As $h$ approaches $0$, the difference quotient at $x = ${point}$ approaches $${target}$. What is the value of $f'(${point})$?`,
    target,
    [0, -target],
    'The derivative is the value the difference quotient approaches, so it equals that limit.',
  );
});

const deflTwoSidedValues = [
  1, 2, 3, 4, 5, 6, 7, 8, -2, -3, -4, -5, 9, 10, 11, 12, -6, -7, 2.5, 1.5, 3.5, -2.5, 13, 14, 15,
];

const derivativeExistenceTwoSided = deflTwoSidedValues.map((value, index) => {
  const point = index + 1;

  return makeConceptQuestion(
    `defl-two-${index}`,
    CATEGORIES.defl,
    `Near $x = ${point}$, the slopes just to the left and just to the right both approach $${value}$. Does $f'(${point})$ exist, and what is its value?`,
    `Yes, it equals $${value}$`,
    ['No, the derivative does not exist there', 'Yes, it equals $0$', `Yes, it equals $${value + 1}$`],
    'When the left and right slopes agree, the derivative exists and equals that common value.',
  );
});

// ---------------------------------------------------------------------------
// Lesson 10 (derivative-units): output units per input unit.
// ---------------------------------------------------------------------------
const duOutputs = [
  'meters',
  'dollars',
  'liters',
  'degrees',
  'pages',
  'miles',
  'grams',
  'volts',
  'people',
  'points',
];
const duInputs = ['second', 'item', 'hour', 'minute', 'day', 'week'];

const derivativeUnitQuestions = duOutputs
  .flatMap((output) => duInputs.map((input) => ({ output, input })))
  .slice(0, 50)
  .map(({ output, input }, index) =>
    makeConceptQuestion(
      `du-${index}`,
      CATEGORIES.du,
      `A function's output is measured in ${output} and its input in ${input}s. What units does its derivative have?`,
      `${output} per ${input}`,
      [`${input}s per ${output}`, `${output} only`, 'No units'],
      `A derivative is a rate, so its units are output units per input unit: ${output} per ${input}.`,
    ),
  );

// ---------------------------------------------------------------------------
// Lesson 12 (derivative-sign-charts): applied derivative signs and turning
// point sign changes. Applied signs are reused by lesson 15.
// ---------------------------------------------------------------------------
const adsScenarios: [string, string][] = [
  ['the water volume in a tank that is filling steadily', 'Positive'],
  ['the height of a sapling that keeps growing', 'Positive'],
  ['the total number of words typed while writing a report', 'Positive'],
  ['a savings balance receiving steady deposits', 'Positive'],
  ['the number of subscribers to a fast-growing channel', 'Positive'],
  ['the temperature of water being heated on a stove', 'Positive'],
  ['the total rainfall accumulating during a storm', 'Positive'],
  ['the charge of a battery while it is charging', 'Positive'],
  ['the number of pages already read in a long book', 'Positive'],
  ['the temperature of a cup of coffee left to cool', 'Negative'],
  ['the amount of ice remaining in a melting glacier', 'Negative'],
  ['the charge of a battery while it is discharging', 'Negative'],
  ['the water left in a tank that is draining', 'Negative'],
  ['the population of a steadily shrinking town', 'Negative'],
  ['an account balance with steady withdrawals', 'Negative'],
  ['the water in a slowly leaking bucket', 'Negative'],
  ['the fuel left in a running generator', 'Negative'],
  ['the number of items in an untouched drawer', 'Zero'],
  ['an account balance with no transactions all day', 'Zero'],
  ['a thermostat reading that holds perfectly steady', 'Zero'],
  ['the height of a book resting undisturbed on a shelf', 'Zero'],
  ['the volume of a sealed, unchanging container', 'Zero'],
  ['the temperature of a room held exactly constant', 'Zero'],
  ['the balance of a paused subscription', 'Zero'],
  ['the contents of an unopened, sealed jar', 'Zero'],
];

const appliedDerivativeSignQuestions = adsScenarios.map(([scenario, sign], index) =>
  makeConceptQuestion(
    `ads-${index}`,
    CATEGORIES.ads,
    `Consider ${scenario}. What is the sign of its rate of change (its derivative)?`,
    sign,
    withoutCorrect(['Positive', 'Negative', 'Zero', 'Undefined'], sign),
    'A quantity that increases has a positive rate of change, one that decreases is negative, and one that stays constant is zero.',
  ),
);

const tpscTemplates = [
  {
    key: 'max',
    correct: 'Positive before, then negative after',
    distractors: ['Negative before, then positive after', 'Positive on both sides', 'Negative on both sides'],
    prompt: (p: number) =>
      `A smooth function has a local maximum at $x = ${p}$. How does $f'$ behave around $x = ${p}$?`,
    explanation: 'Before a peak the function rises (positive derivative); after it falls (negative derivative).',
  },
  {
    key: 'min',
    correct: 'Negative before, then positive after',
    distractors: ['Positive before, then negative after', 'Positive on both sides', 'Negative on both sides'],
    prompt: (p: number) =>
      `A smooth function has a local minimum at $x = ${p}$. How does $f'$ behave around $x = ${p}$?`,
    explanation: 'Before a valley the function falls (negative derivative); after it rises (positive derivative).',
  },
  {
    key: 'pos-neg',
    correct: 'A local maximum',
    distractors: ['A local minimum', 'A steady increase', 'A vertical asymptote'],
    prompt: (p: number) =>
      `The derivative changes from positive to negative at $x = ${p}$. What does this indicate at $x = ${p}$?`,
    explanation: 'Rising then falling makes a peak, a local maximum.',
  },
  {
    key: 'neg-pos',
    correct: 'A local minimum',
    distractors: ['A local maximum', 'A steady decrease', 'A vertical asymptote'],
    prompt: (p: number) =>
      `The derivative changes from negative to positive at $x = ${p}$. What does this indicate at $x = ${p}$?`,
    explanation: 'Falling then rising makes a valley, a local minimum.',
  },
  {
    key: 'turning-zero',
    correct: '$0$',
    distractors: ['$1$', 'A large positive value', 'Undefined'],
    prompt: (p: number) =>
      `At a smooth turning point at $x = ${p}$, what is the value of $f'(${p})$?`,
    explanation: 'A smooth turning point has a horizontal tangent, so the derivative is $0$ there.',
  },
];

const turningPointQuestions = [1, 2, 3, 4, 5].flatMap((p) =>
  tpscTemplates.map((template) =>
    makeConceptQuestion(
      `tpsc-${template.key}-${p}`,
      CATEGORIES.tpsc,
      template.prompt(p),
      template.correct,
      template.distractors,
      template.explanation,
    ),
  ),
);

// ---------------------------------------------------------------------------
// Lesson 14 (when-derivatives-do-not-exist): nonsmooth points and disagreeing
// one-sided slopes.
// ---------------------------------------------------------------------------
const ndlShapes = [
  'a sharp corner',
  'a sharp cusp',
  'a sudden jump',
  'a vertical tangent',
  'a hole (a missing point)',
];

const nonsmoothShapeQuestions = [1, 2, 3, 4, 5].flatMap((p) =>
  ndlShapes.map((shape, shapeIndex) =>
    makeConceptQuestion(
      `ndl-shape-${p}-${shapeIndex}`,
      CATEGORIES.ndl,
      `The graph of $f$ has ${shape} at $x = ${p}$. Does $f'(${p})$ exist?`,
      'No, the derivative does not exist there',
      ['Yes, and it equals $0$', 'Yes, and it equals $1$', 'Yes, and it equals the height of the graph'],
      'At corners, cusps, jumps, vertical tangents, and holes there is no single finite slope, so the derivative does not exist.',
    ),
  ),
);

const nonsmoothMismatchQuestions = Array.from({ length: 25 }, (_unused, index) => {
  const point = index + 1;
  const leftSlope = (index % 7) + 1;
  const rightSlope = -(((index * 2) % 5) + 1);

  return makeConceptQuestion(
    `ndl-mis-${index}`,
    CATEGORIES.ndl,
    `At $x = ${point}$, the slope just to the left is $${leftSlope}$ but just to the right is $${rightSlope}$. Does $f'(${point})$ exist?`,
    'No, the one-sided slopes disagree',
    [`Yes, it equals $${leftSlope}$`, `Yes, it equals $${rightSlope}$`, 'Yes, it equals their average'],
    'When the left and right slopes disagree there is no single tangent slope, so the derivative does not exist.',
  );
});

// ---------------------------------------------------------------------------
// Lesson 15 (derivative-as-velocity): velocity as the derivative of position,
// plus instantaneous velocity from shrinking time intervals.
// ---------------------------------------------------------------------------
const vadConfigs: [number, number, number][] = [
  [0, 10, 2],
  [0, 12, 3],
  [0, 18, 6],
  [0, 20, 4],
  [0, 21, 7],
  [0, 16, 8],
  [0, 35, 5],
  [0, 24, 4],
  [0, 30, 5],
  [0, 28, 4],
  [0, 45, 9],
  [0, 22, 2],
  [10, 4, 2],
  [20, 5, 5],
  [12, 0, 3],
  [15, 3, 4],
  [0, 27, 3],
  [0, 8, 4],
];

const velocityQuestions = vadConfigs.map(([start, end, time], index) => {
  const velocity = (end - start) / time;

  return makeConceptQuestion(
    `vad-${index}`,
    CATEGORIES.vad,
    `An object moves from $${start}$ meters to $${end}$ meters in $${time}$ seconds. What is its average velocity?`,
    `$${velocity}$ meters per second`,
    [`$${end - start}$ meters per second`, `$${time}$ meters per second`, 'Seconds per meter'],
    'Average velocity is the change in position divided by the change in time.',
  );
});

const vflValues = [5, 3, 8, 4, 6, 2, 7];

const velocityFromLimitQuestions = vflValues.map((velocity, index) =>
  makeConceptQuestion(
    `vfl-${index}`,
    CATEGORIES.vfl,
    `As the time interval shrinks toward one instant, the average velocities approach $${velocity}$ meters per second. What is the instantaneous velocity?`,
    `$${velocity}$ meters per second`,
    [`$${velocity + 1}$ meters per second`, `$${velocity - 1}$ meters per second`, 'Position only'],
    'Instantaneous velocity is the value the average velocities approach as the time interval shrinks.',
  ),
);

// ---------------------------------------------------------------------------
// Lesson 16 (comparing-function-and-derivative-graphs): how the derivative
// graph behaves given the function's shape.
// ---------------------------------------------------------------------------
const dgbTemplates = [
  {
    key: 'rise-steep',
    correct: 'Positive and increasing',
    distractors: ['Negative and decreasing', 'Positive and decreasing', 'Zero everywhere'],
    prompt: (p: number) =>
      `On an interval around $x = ${p}$, a curve is rising and getting steeper. How does its derivative behave there?`,
    explanation: 'Rising means a positive derivative; getting steeper means that derivative is increasing.',
  },
  {
    key: 'rise-flat',
    correct: 'Positive and decreasing',
    distractors: ['Positive and increasing', 'Negative and increasing', 'Zero everywhere'],
    prompt: (p: number) =>
      `Around $x = ${p}$, a curve is rising but flattening out. How does its derivative behave?`,
    explanation: 'Still rising keeps the derivative positive; flattening makes it decrease toward $0$.',
  },
  {
    key: 'fall-steep',
    correct: 'Negative and decreasing',
    distractors: ['Negative and increasing', 'Positive and increasing', 'Zero everywhere'],
    prompt: (p: number) =>
      `Around $x = ${p}$, a curve is falling and getting steeper downward. How does its derivative behave?`,
    explanation: 'Falling means a negative derivative; steeper downward makes it more negative.',
  },
  {
    key: 'fall-flat',
    correct: 'Negative and increasing',
    distractors: ['Negative and decreasing', 'Positive and decreasing', 'Zero everywhere'],
    prompt: (p: number) =>
      `Around $x = ${p}$, a curve is falling but becoming less steep. How does its derivative behave?`,
    explanation: 'Still falling keeps the derivative negative; becoming less steep moves it up toward $0$.',
  },
  {
    key: 'line',
    correct: 'Positive and constant',
    distractors: ['Positive and increasing', 'Negative and constant', 'Zero everywhere'],
    prompt: (p: number) =>
      `A straight line rises at a constant rate near $x = ${p}$. How does its derivative behave?`,
    explanation: 'A line has a single positive slope, so its derivative is positive and constant.',
  },
];

const derivativeGraphQuestions = [1, 2, 3, 4, 5].flatMap((p) =>
  dgbTemplates.map((template) =>
    makeConceptQuestion(
      `dgb-${template.key}-${p}`,
      CATEGORIES.dgb,
      template.prompt(p),
      template.correct,
      template.distractors,
      template.explanation,
    ),
  ),
);

// ---------------------------------------------------------------------------
// Lesson 17 (power-rule-intuition): derivative of powers and coefficient powers.
// ---------------------------------------------------------------------------
function powerTerm(coefficient: number, exponent: number): string {
  if (exponent === 0) {
    return `${coefficient}`;
  }

  const variablePart =
    exponent === 1 ? 'x' : `x^${exponent >= 10 ? `{${exponent}}` : exponent}`;

  if (coefficient === 1) {
    return variablePart;
  }

  return `${coefficient}${variablePart}`;
}

const priPure = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n, index) =>
  makeConceptQuestion(
    `pri-pow-${index}`,
    CATEGORIES.pri,
    `Using the power rule, what is the derivative of $${powerTerm(1, n)}$?`,
    `$${powerTerm(n, n - 1)}$`,
    [`$${powerTerm(1, n)}$`, `$${powerTerm(n, n)}$`, `$${powerTerm(1, n - 1)}$`],
    'The power rule brings the exponent down as a coefficient and lowers the power by $1$.',
  ),
);

const priCoefConfigs: { coefficient: number; exponent: number }[] = [];
for (const coefficient of [2, 3, 4, 5]) {
  for (const exponent of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    priCoefConfigs.push({ coefficient, exponent });
  }
}

const priCoefficient = priCoefConfigs.map(({ coefficient, exponent }, index) =>
  makeConceptQuestion(
    `pri-coef-${index}`,
    CATEGORIES.pri,
    `Using the power rule, what is the derivative of $${powerTerm(coefficient, exponent)}$?`,
    `$${powerTerm(coefficient * exponent, exponent - 1)}$`,
    [
      `$${powerTerm(coefficient, exponent)}$`,
      `$${powerTerm(coefficient * exponent, exponent)}$`,
      `$${powerTerm(coefficient, exponent - 1)}$`,
    ],
    'Keep the coefficient, bring the exponent down as a multiplier, and lower the power by $1$.',
  ),
);

// ---------------------------------------------------------------------------
// Lesson 18 (constant-and-linear-rules): derivative of constants and lines, and
// the shape of a line's derivative graph.
// ---------------------------------------------------------------------------
function linearExpression(slope: number, intercept: number) {
  const slopePart = slope === 1 ? 'x' : slope === -1 ? '-x' : `${slope}x`;

  if (intercept === 0) {
    return slopePart;
  }

  return intercept > 0 ? `${slopePart} + ${intercept}` : `${slopePart} - ${Math.abs(intercept)}`;
}

const cldrLinearConfigs: [number, number][] = [
  [2, 3],
  [3, 5],
  [4, 9],
  [5, 2],
  [6, 1],
  [2, 7],
  [3, 8],
  [4, 1],
  [7, 2],
  [5, 9],
  [-2, 5],
  [-3, 4],
  [2, -3],
  [3, -5],
];

const constantLinearRuleLines = cldrLinearConfigs.map(([slope, intercept], index) =>
  makeConceptQuestion(
    `cldr-lin-${index}`,
    CATEGORIES.cldr,
    `What is the derivative of $${linearExpression(slope, intercept)}$?`,
    `$${slope}$`,
    [`$${intercept}$`, `$${linearExpression(slope, 0)}$`, `$${slope + intercept}$`],
    'The derivative of a line is its slope; the constant term does not affect the slope.',
  ),
);

const constantLinearRulePure = [2, 3, 4, 5, 6, 8].map((slope, index) =>
  makeConceptQuestion(
    `cldr-pure-${index}`,
    CATEGORIES.cldr,
    `What is the derivative of $${linearExpression(slope, 0)}$?`,
    `$${slope}$`,
    [`$${linearExpression(slope, 0)}$`, '$0$', '$1$'],
    'A line through the origin with slope $m$ has derivative $m$.',
  ),
);

const codConstants = [7, 3, 5, 10, 2, 4, 6, 8, 9, 12, 11, 15, 20, 100, 13, 14];

const constantOutputQuestions = codConstants.map((constant, index) =>
  makeConceptQuestion(
    `cod-${index}`,
    CATEGORIES.cod,
    `What is the derivative of the constant function $f(x) = ${constant}$?`,
    '$0$',
    [`$${constant}$`, '$1$', '$x$'],
    'A constant function is a horizontal line with slope $0$, so its derivative is $0$.',
  ),
);

const constantLinearGraphFixed = [
  makeConceptQuestion(
    'cldg-fixed-0',
    CATEGORIES.cldg,
    'A line has a single constant slope. What does the graph of its derivative look like?',
    'A horizontal line',
    ['A line through the origin', 'A parabola', 'A vertical line'],
    'A line has the same slope everywhere, so its derivative graph is a horizontal line.',
  ),
  makeConceptQuestion(
    'cldg-fixed-1',
    CATEGORIES.cldg,
    'A horizontal line has slope $0$ everywhere. What does the graph of its derivative look like?',
    'A horizontal line at height $0$',
    ['A line with slope $1$', 'A parabola', 'A vertical line'],
    'A constant function has derivative $0$ everywhere, graphing as the horizontal line at height $0$.',
  ),
];

const constantLinearGraphParam = [2, 3, 4, 5, 6, -2, -3, 7, 8, -4, 9, -5].map((slope, index) =>
  makeConceptQuestion(
    `cldg-m-${index}`,
    CATEGORIES.cldg,
    `A line has slope $${slope}$ everywhere. What does the graph of its derivative look like?`,
    `A horizontal line at height $${slope}$`,
    ['A horizontal line at height $0$', 'A line through the origin', 'A parabola'],
    'The derivative of a line is its constant slope, so its graph is a horizontal line at that height.',
  ),
);

export const questionBank: PracticeQuestion[] = [
  ...basicAverageRateQuestions,
  ...averageRateQuestions,
  ...slopeQuestions,
  ...bliSmallInterval,
  ...bliConceptual,
  ...tangentNumeric,
  ...tangentSign,
  ...tangentSteeper,
  ...derivativeSignFromValue,
  ...derivativeSignFromBehavior,
  ...derivativeFromLimit,
  ...derivativeExistenceTwoSided,
  ...derivativeUnitQuestions,
  ...appliedDerivativeSignQuestions,
  ...turningPointQuestions,
  ...nonsmoothShapeQuestions,
  ...nonsmoothMismatchQuestions,
  ...velocityQuestions,
  ...velocityFromLimitQuestions,
  ...derivativeGraphQuestions,
  ...priPure,
  ...priCoefficient,
  ...constantLinearRuleLines,
  ...constantLinearRulePure,
  ...constantOutputQuestions,
  ...constantLinearGraphFixed,
  ...constantLinearGraphParam,
];

export const lessonPracticeCategoryMap = {
  'what-changes': [CATEGORIES.baroc],
  'slope-refresher': [CATEGORIES.stl],
  'average-rate-of-change': [CATEGORIES.aroc],
  'zooming-in-on-curves': [CATEGORIES.bli],
  'tangent-lines': [CATEGORIES.tl],
  'derivative-as-slope': [CATEGORIES.bsd],
  'difference-quotient': [CATEGORIES.aroc],
  'limits-from-secant-lines': [CATEGORIES.bli],
  'formal-derivative-definition': [CATEGORIES.defl],
  'derivative-units': [CATEGORIES.du],
  'reading-derivatives-from-graphs': [CATEGORIES.bsd],
  'derivative-sign-charts': [CATEGORIES.ads, CATEGORIES.tpsc],
  'where-derivatives-are-zero': [CATEGORIES.bsd],
  'when-derivatives-do-not-exist': [CATEGORIES.ndl],
  'derivative-as-velocity': [CATEGORIES.vad, CATEGORIES.vfl, CATEGORIES.ads],
  'comparing-function-and-derivative-graphs': [CATEGORIES.dgb, CATEGORIES.tpsc],
  'power-rule-intuition': [CATEGORIES.pri],
  'constant-and-linear-rules': [CATEGORIES.cldr, CATEGORIES.cod, CATEGORIES.cldg],
} as const;

export function getPracticeCategoriesForCompletedLessons(completedLessonIds: readonly string[]) {
  return Array.from(
    new Set(
      completedLessonIds.flatMap(
        (lessonId) =>
          lessonPracticeCategoryMap[lessonId as keyof typeof lessonPracticeCategoryMap] ?? [],
      ),
    ),
  );
}

export function getPracticeQuestionsForCompletedLessons(
  completedLessonIds: readonly string[],
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
) {
  const eligibleCategories = new Set<string>(
    getPracticeCategoriesForCompletedLessons(completedLessonIds),
  );

  if (eligibleCategories.size === 0) {
    return [];
  }

  return sourceQuestions.filter((question) => eligibleCategories.has(question.category));
}

export function createSeededRng(seed: number): RandomNumberGenerator {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomIndex(length: number, rng: RandomNumberGenerator) {
  return Math.min(Math.floor(rng() * length), length - 1);
}

export function pickRandomQuestions(
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
  count = 10,
  rng: RandomNumberGenerator = Math.random,
) {
  const shuffled = [...sourceQuestions];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, rng);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
}

export function pickNextQuestion(
  sourceQuestions: readonly PracticeQuestion[] = questionBank,
  previousQuestionId?: string,
  rng: RandomNumberGenerator = Math.random,
) {
  const eligibleQuestions =
    sourceQuestions.length > 1
      ? sourceQuestions.filter((question) => question.id !== previousQuestionId)
      : [...sourceQuestions];

  return eligibleQuestions[randomIndex(eligibleQuestions.length, rng)];
}
