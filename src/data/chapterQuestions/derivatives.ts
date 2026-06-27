import type { PracticeQuestion } from '../questionBank';

// Content adapted from APEX Calculus by Gregory Hartman et al. (VMI),
// licensed CC BY-NC 4.0 — https://www.apexcalculus.com/. Adapted for SlopeWise.
//
// Practice bank for "Derivatives", grounded in APEX Calculus, Chapter 2. Each
// section below mixes parameterized generators (built on the differentiation
// rules stated in APEX) with questions adapted from APEX's end-of-section
// exercises. Every answer is produced by an independent, deterministic
// computation of the derivative, so all options are verified by construction.
// No source-internal numbering or names appear in any learner-facing string.

const CHAPTER_ID = 'derivatives';

const CAT_DERIVATIVE = 'Instantaneous Rates of Change: The Derivative';
const CAT_INTERPRET = 'Interpretations of the Derivative';
const CAT_BASIC = 'Basic Differentiation Rules';
const CAT_PRODUCT_QUOTIENT = 'The Product and Quotient Rules';
const CAT_CHAIN = 'The Chain Rule';
const CAT_IMPLICIT = 'Implicit Differentiation';
const CAT_INVERSE = 'Derivatives of Inverse Functions';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Term = { coeff: number; pow: number };

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/** A reduced fraction rendered as KaTeX (an integer when the denominator is 1). */
function fmtFrac(num: number, den: number): string {
  let n = num;
  let d = den;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (d === 1) {
    return `$${n}$`;
  }
  if (n < 0) {
    return `$-\\dfrac{${-n}}{${d}}$`;
  }
  return `$\\dfrac{${n}}{${d}}$`;
}

/** Render one monomial body (no leading sign), handling the n = 0, 1 and |a| = 1 cases. */
function monomialBody(absCoeff: number, pow: number, v: string): string {
  if (pow === 0) {
    return `${absCoeff}`;
  }
  const varPart = pow === 1 ? v : `${v}^{${pow}}`;
  if (absCoeff === 1) {
    return varPart;
  }
  return `${absCoeff}${varPart}`;
}

/** Render a polynomial from its terms as KaTeX, e.g. [{6,1},{5,0}] -> "6x + 5". */
function fmtPoly(terms: Term[], v = 'x'): string {
  const nonzero = terms.filter((t) => t.coeff !== 0);
  if (nonzero.length === 0) {
    return '0';
  }
  return nonzero
    .map((t, i) => {
      const body = monomialBody(Math.abs(t.coeff), t.pow, v);
      if (i === 0) {
        return t.coeff < 0 ? `-${body}` : body;
      }
      return (t.coeff < 0 ? ' - ' : ' + ') + body;
    })
    .join('');
}

function derivTerms(terms: Term[]): Term[] {
  return terms.filter((t) => t.pow >= 1).map((t) => ({ coeff: t.coeff * t.pow, pow: t.pow - 1 }));
}

function polyEval(terms: Term[], x: number): number {
  return terms.reduce((sum, t) => sum + t.coeff * Math.pow(x, t.pow), 0);
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Canonical form for duplicate detection: drop math delimiters and all whitespace. */
function canon(label: string): string {
  return label.replace(/\$/g, '').replace(/\s+/g, '');
}

const CHOICE_IDS = ['a', 'b', 'c', 'd', 'e'];
// Safety fillers (should never be needed): used only if a template fails to
// supply three structurally distinct distractors, so the bank always satisfies
// the 4-5 choice invariant.
const FILLERS = ['$0$', '$1$', '$2$', '$-1$', '$3$', '$-2$', '$x$', '$2x$', '$-x$', '$4$'];

const out: PracticeQuestion[] = [];
let idCounter = 0;

function nextId(tag: string): string {
  idCounter += 1;
  return `derivatives-${tag}-${String(idCounter).padStart(3, '0')}`;
}

function buildQuestion(args: {
  id: string;
  category: string;
  prompt: string;
  correct: string;
  distractors: string[];
  explanation: string;
  difficulty: number;
}): PracticeQuestion {
  const seen = new Set<string>([canon(args.correct)]);
  const unique: string[] = [];
  for (const d of args.distractors) {
    const c = canon(d);
    if (c.length === 0 || seen.has(c)) {
      continue;
    }
    seen.add(c);
    unique.push(d);
    if (unique.length >= 4) {
      break;
    }
  }
  // Guarantee at least three distractors with distinct labels.
  for (const filler of FILLERS) {
    if (unique.length >= 3) {
      break;
    }
    const c = canon(filler);
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(filler);
    }
  }
  const chosen = unique.length >= 4 ? unique.slice(0, 4) : unique.slice(0, 3);

  const rng = mulberry32(hashString(args.id));
  const ordered = [...chosen];
  const insertAt = Math.floor(rng() * (ordered.length + 1));
  ordered.splice(insertAt, 0, args.correct);

  return {
    id: args.id,
    chapterId: CHAPTER_ID,
    category: args.category,
    prompt: args.prompt,
    choices: ordered.map((label, index) => ({ id: CHOICE_IDS[index], label })),
    correctChoiceId: CHOICE_IDS[insertAt],
    explanation: args.explanation,
    difficulty: args.difficulty,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function curated(
  tag: string,
  category: string,
  prompt: string,
  correct: string,
  distractors: string[],
  explanation: string,
  difficulty: number,
): void {
  out.push(buildQuestion({ id: nextId(tag), category, prompt, correct, distractors, explanation, difficulty }));
}

/** An integer-answer question; distractors padded with nearby integers. */
function numAt(
  tag: string,
  category: string,
  prompt: string,
  correct: number,
  mistakes: number[],
  explanation: string,
  difficulty: number,
): void {
  const pool = [
    ...mistakes,
    correct + 1,
    correct - 1,
    correct + 2,
    correct - 2,
    correct + 3,
    2 * correct,
    -correct,
  ];
  const distractors = pool.filter((x) => x !== correct).map((x) => `$${x}$`);
  out.push(buildQuestion({ id: nextId(tag), category, prompt, correct: `$${correct}$`, distractors, explanation, difficulty }));
}

/** A fraction-answer question; mistakes are [numerator, denominator] pairs. */
function fracAt(
  tag: string,
  category: string,
  prompt: string,
  cnum: number,
  cden: number,
  mistakes: Array<[number, number]>,
  explanation: string,
  difficulty: number,
): void {
  const distractors = mistakes.map(([a, b]) => fmtFrac(a, b));
  out.push(buildQuestion({ id: nextId(tag), category, prompt, correct: fmtFrac(cnum, cden), distractors, explanation, difficulty }));
}

// ===========================================================================
// Section 1 — Instantaneous Rates of Change: The Derivative
// ===========================================================================

// Constant functions.
for (const c of [3, 5, 6, 8]) {
  curated(
    'rate',
    CAT_DERIVATIVE,
    `Use the limit definition of the derivative to find the derivative of $f(x) = ${c}$.`,
    '$0$',
    [`$${c}$`, '$1$', `$${c}x$`, '$x$'],
    'A constant function never changes, so every difference quotient is $0$; the derivative is $0$.',
    1,
  );
}

// Linear functions: the derivative is the constant slope.
for (const [m, b] of [
  [2, 3],
  [3, 5],
  [4, 1],
  [5, 2],
  [-2, 5],
  [-3, 1],
  [-4, 3],
  [6, 1],
  [7, 2],
  [-5, 2],
] as Array<[number, number]>) {
  curated(
    'rate',
    CAT_DERIVATIVE,
    `Use the limit definition of the derivative to find the derivative of $f(x) = ${fmtPoly([
      { coeff: m, pow: 1 },
      { coeff: b, pow: 0 },
    ])}$.`,
    `$${m}$`,
    [`$${fmtPoly([{ coeff: m, pow: 1 }])}$`, '$0$', `$${b}$`, `$${m + b}$`],
    `For a line, the difference quotient equals the constant slope, so the derivative is $${m}$.`,
    2,
  );
}

// Monomials via the definition (the power rule result).
for (const n of [2, 3, 4, 5]) {
  for (const a of [1, 2, 3]) {
    curated(
      'rate',
      CAT_DERIVATIVE,
      `Use the limit definition of the derivative to find $f'(x)$ for $f(x) = ${fmtPoly([{ coeff: a, pow: n }])}$.`,
      `$${fmtPoly([{ coeff: a * n, pow: n - 1 }])}$`,
      [
        `$${fmtPoly([{ coeff: a * n, pow: n }])}$`,
        `$${fmtPoly([{ coeff: a, pow: n - 1 }])}$`,
        `$${fmtPoly([{ coeff: n, pow: n - 1 }])}$`,
        `$${fmtPoly([{ coeff: a, pow: n }])}$`,
        `$${fmtPoly([{ coeff: a * (n - 1), pow: n - 1 }])}$`,
      ],
      `Expanding the difference quotient and letting $h \\to 0$ gives the power-rule result $${fmtPoly([
        { coeff: a * n, pow: n - 1 },
      ])}$.`,
      n <= 3 ? 2 : 3,
    );
  }
}

// Reciprocal and root functions via the definition.
curated(
  'rate',
  CAT_DERIVATIVE,
  "Use the limit definition of the derivative to find the derivative of $f(x) = \\dfrac{1}{x}$.",
  '$-\\dfrac{1}{x^2}$',
  ['$\\dfrac{1}{x^2}$', '$-\\dfrac{1}{x}$', '$-\\dfrac{2}{x^3}$', '$\\dfrac{1}{x}$'],
  'The difference quotient simplifies to $\\dfrac{-1}{x(x+h)}$, which tends to $-\\dfrac{1}{x^2}$.',
  3,
);
curated(
  'rate',
  CAT_DERIVATIVE,
  "Find the derivative of $f(x) = \\dfrac{1}{x^2}$.",
  '$-\\dfrac{2}{x^3}$',
  ['$\\dfrac{2}{x^3}$', '$-\\dfrac{1}{x^3}$', '$-\\dfrac{2}{x^2}$', '$\\dfrac{1}{x^2}$'],
  'Write $f(x) = x^{-2}$; the power rule gives $-2x^{-3} = -\\dfrac{2}{x^3}$.',
  3,
);
curated(
  'rate',
  CAT_DERIVATIVE,
  "Find the derivative of $f(x) = \\sqrt{x}$.",
  '$\\dfrac{1}{2\\sqrt{x}}$',
  ['$\\dfrac{1}{\\sqrt{x}}$', '$2\\sqrt{x}$', '$\\dfrac{1}{2}\\sqrt{x}$', '$\\sqrt{x}$'],
  'Write $f(x) = x^{1/2}$; the power rule gives $\\tfrac{1}{2}x^{-1/2} = \\dfrac{1}{2\\sqrt{x}}$.',
  3,
);

// Evaluate a derivative (the slope of the tangent) at a point.
for (const [a, b, c, x0] of [
  [1, 2, 1, 3],
  [2, -3, 1, 2],
  [1, 4, -2, 1],
  [3, 1, 0, 2],
  [2, 5, 1, 1],
  [1, -1, 2, 4],
  [2, 3, -1, 3],
  [3, -2, 1, 1],
  [1, 6, 0, 2],
  [2, 1, 3, 4],
  [3, 2, -1, 2],
  [1, 3, 1, 5],
  [2, -1, 2, 3],
  [4, 1, 0, 1],
] as Array<[number, number, number, number]>) {
  const correct = 2 * a * x0 + b;
  numAt(
    'rate',
    CAT_DERIVATIVE,
    `For $f(x) = ${fmtPoly([
      { coeff: a, pow: 2 },
      { coeff: b, pow: 1 },
      { coeff: c, pow: 0 },
    ])}$, find $f'(${x0})$.`,
    correct,
    [2 * a * x0, a * x0 + b, 2 * a + b, polyEval([
      { coeff: a, pow: 2 },
      { coeff: b, pow: 1 },
      { coeff: c, pow: 0 },
    ], x0)],
    `Differentiate to $f'(x) = ${fmtPoly([
      { coeff: 2 * a, pow: 1 },
      { coeff: b, pow: 0 },
    ])}$, then substitute $x = ${x0}$ to get $${correct}$.`,
    2,
  );
}

// Average rate of change over an interval.
for (const [m, a, b, k] of [
  [3, 1, 4, 0],
  [2, 2, 5, 1],
  [4, 0, 2, -1],
  [-2, 1, 3, 5],
  [5, 1, 3, 2],
  [-3, 2, 4, 1],
] as Array<[number, number, number, number]>) {
  const p = m * a + k;
  const q = m * b + k;
  numAt(
    'rate',
    CAT_DERIVATIVE,
    `The points $(${a}, ${p})$ and $(${b}, ${q})$ lie on $y = f(x)$. What is the average rate of change of $f$ on $[${a}, ${b}]$?`,
    m,
    [q - p, p + q, p - q, -m],
    `The average rate of change is $\\dfrac{${q} - (${p})}{${b} - ${a}} = ${m}$.`,
    2,
  );
}

// Tangent-line equations.
curated(
  'rate',
  CAT_DERIVATIVE,
  'Find the equation of the tangent line to $f(x) = x^2 - x$ at $x = 1$.',
  '$y = x - 1$',
  ['$y = 2x - 1$', '$y = x + 1$', '$y = x$', '$y = 2x - 2$'],
  "Here $f(1) = 0$ and $f'(x) = 2x - 1$ gives $f'(1) = 1$, so $y = 1(x - 1) + 0 = x - 1$.",
  3,
);
curated(
  'rate',
  CAT_DERIVATIVE,
  'Find the equation of the tangent line to $f(x) = x^2$ at $x = 2$.',
  '$y = 4x - 4$',
  ['$y = 4x$', '$y = 4x + 4$', '$y = 2x - 4$', '$y = 4x - 8$'],
  "Since $f'(x) = 2x$, the slope is $f'(2) = 4$ and $f(2) = 4$, so $y = 4(x - 2) + 4 = 4x - 4$.",
  3,
);
curated(
  'rate',
  CAT_DERIVATIVE,
  'Find the equation of the tangent line to $f(x) = x^2 + 1$ at $x = 1$.',
  '$y = 2x$',
  ['$y = 2x + 1$', '$y = 2x - 1$', '$y = x + 1$', '$y = 2x + 2$'],
  "Since $f'(x) = 2x$, the slope is $f'(1) = 2$ and $f(1) = 2$, so $y = 2(x - 1) + 2 = 2x$.",
  3,
);

// ===========================================================================
// Section 2 — Interpretations of the Derivative
// ===========================================================================

// Tangent-line (linear) approximation.
for (const fpc of [2, 3, 4, 5]) {
  for (const h of [1, 2, 5, 10]) {
    const c = 10;
    const fc = 20;
    const correct = fc + fpc * h;
    numAt(
      'interp',
      CAT_INTERPRET,
      `Given $f(${c}) = ${fc}$ and $f'(${c}) = ${fpc}$, estimate $f(${c + h})$.`,
      correct,
      [fc + fpc, fc - fpc * h, fc, fc + h],
      `Use $f(c + h) \\approx f(c) + f'(c)\\,h = ${fc} + ${fpc}\\cdot ${h} = ${correct}$.`,
      2,
    );
  }
}
for (const fpc of [2, 3]) {
  for (const h of [2, 4, 10]) {
    const c = 5;
    const fc = 8;
    const correct = fc + fpc * h;
    numAt(
      'interp',
      CAT_INTERPRET,
      `Given $f(${c}) = ${fc}$ and $f'(${c}) = ${fpc}$, estimate $f(${c + h})$.`,
      correct,
      [fc + fpc, fc - fpc * h, fc, fc + h],
      `Use $f(c + h) \\approx f(c) + f'(c)\\,h = ${fc} + ${fpc}\\cdot ${h} = ${correct}$.`,
      2,
    );
  }
}

// Estimate a derivative from two nearby values.
for (const m of [2, 3, 4, -2, -3, 5, -4, 6, 7, -5, 8, -6]) {
  const a = 1;
  const b = 3;
  const k = 1;
  const p = m * a + k;
  const q = m * b + k;
  numAt(
    'interp',
    CAT_INTERPRET,
    `Estimate $f'(${a})$ from the values $f(${a}) = ${p}$ and $f(${b}) = ${q}$.`,
    m,
    [q - p, p + q, p - q, -m],
    `A difference quotient gives $f'(${a}) \\approx \\dfrac{${q} - (${p})}{${b} - ${a}} = ${m}$.`,
    2,
  );
}

// Units of a rate of change.
const unitItems: Array<[string, string, string, string, string]> = [
  ['the loudness in a room, in decibels, in terms of the number of people present', 'decibels per person', 'people per decibel', 'decibels', 'people'],
  ['the distance a car has driven, in miles, in terms of the number of hours elapsed', 'miles per hour', 'hours per mile', 'miles', 'hours'],
  ['the temperature of an oven, in degrees, in terms of the number of minutes elapsed', 'degrees per minute', 'minutes per degree', 'degrees', 'minutes'],
  ['the cost of an order, in dollars, in terms of the number of items bought', 'dollars per item', 'items per dollar', 'dollars', 'items'],
  ['the population of a town, in people, in terms of the number of years elapsed', 'people per year', 'years per person', 'people', 'years'],
  ['the volume of a balloon, in liters, in terms of the number of seconds elapsed', 'liters per second', 'seconds per liter', 'liters', 'seconds'],
];
for (const [desc, correct, d1, d2, d3] of unitItems) {
  curated(
    'interp',
    CAT_INTERPRET,
    `A function $f$ gives ${desc}. What are the units of $f'$?`,
    correct,
    [d1, d2, d3],
    `A derivative has units of output divided by input: ${correct}.`,
    1,
  );
}
curated(
  'interp',
  CAT_INTERPRET,
  "Let $v(t)$ measure a car's velocity in feet per second, $t$ seconds after it starts. What are the units of $v'(t)$?",
  'feet per second squared',
  ['feet per second', 'seconds', 'feet', 'feet times seconds'],
  'The derivative of velocity is acceleration, with units (feet per second) per second, i.e. feet per second squared.',
  2,
);

// Interpreting the derivative in motion.
curated(
  'interp',
  CAT_INTERPRET,
  'If $s(t)$ is the position of a moving object, what does $s\'(t)$ represent?',
  'its velocity',
  ['its acceleration', 'its position', 'the distance traveled', 'its jerk'],
  'The derivative of position with respect to time is velocity.',
  1,
);
curated(
  'interp',
  CAT_INTERPRET,
  'If $v(t)$ is the velocity of a moving object, what does $v\'(t)$ represent?',
  'its acceleration',
  ['its velocity', 'its position', 'its displacement', 'its speed'],
  'The derivative of velocity with respect to time is acceleration.',
  1,
);
curated(
  'interp',
  CAT_INTERPRET,
  'The second derivative $s\'\'(t)$ of a position function gives which quantity?',
  'acceleration',
  ['velocity', 'position', 'distance', 'displacement'],
  'Differentiating position once gives velocity and twice gives acceleration.',
  2,
);
curated(
  'interp',
  CAT_INTERPRET,
  'A positive value of $f\'(x)$ at a point tells you that, at that point, $f$ is',
  'increasing',
  ['decreasing', 'constant', 'at a maximum', 'undefined'],
  'A positive derivative means the tangent slopes upward, so $f$ is increasing there.',
  1,
);

// ===========================================================================
// Section 3 — Basic Differentiation Rules
// ===========================================================================

function polyDerivQuestion(tag: string, category: string, terms: Term[], difficulty: number, v = 'x'): void {
  const D = derivTerms(terms);
  const correct = `$${fmtPoly(D, v)}$`;
  const constTerm = terms.find((t) => t.pow === 0);

  const keepConst = D.map((t) => ({ ...t }));
  if (constTerm) {
    const dc = keepConst.find((t) => t.pow === 0);
    if (dc) {
      dc.coeff += constTerm.coeff;
    } else {
      keepConst.push({ coeff: constTerm.coeff, pow: 0 });
    }
  }
  const noReduce = terms.filter((t) => t.pow >= 1).map((t) => ({ coeff: t.coeff * t.pow, pow: t.pow }));
  const noMul = terms.filter((t) => t.pow >= 1).map((t) => ({ coeff: t.coeff, pow: t.pow - 1 }));
  const leadPlus = D.map((t, i) => (i === 0 ? { coeff: t.coeff + 1, pow: t.pow } : t));
  const leadMinus = D.map((t, i) => (i === 0 ? { coeff: t.coeff - 1, pow: t.pow } : t));

  curated(
    tag,
    category,
    `Differentiate $f(${v}) = ${fmtPoly(terms, v)}$.`,
    correct,
    [
      constTerm ? `$${fmtPoly(keepConst, v)}$` : `$${fmtPoly(leadMinus, v)}$`,
      `$${fmtPoly(noReduce, v)}$`,
      `$${fmtPoly(noMul, v)}$`,
      `$${fmtPoly(leadPlus, v)}$`,
    ],
    `Differentiate term by term with the power rule and drop the constant: $${fmtPoly(D, v)}$.`,
    difficulty,
  );
}

const quadratics: Term[][] = [
  [{ coeff: 7, pow: 2 }, { coeff: -5, pow: 1 }, { coeff: 7, pow: 0 }],
  [{ coeff: -2, pow: 2 }, { coeff: -9, pow: 1 }, { coeff: -3, pow: 0 }],
  [{ coeff: 3, pow: 2 }, { coeff: 4, pow: 1 }, { coeff: 5, pow: 0 }],
  [{ coeff: 5, pow: 2 }, { coeff: -6, pow: 1 }, { coeff: 2, pow: 0 }],
  [{ coeff: 1, pow: 2 }, { coeff: 7, pow: 1 }, { coeff: -3, pow: 0 }],
  [{ coeff: 4, pow: 2 }, { coeff: -1, pow: 1 }, { coeff: 8, pow: 0 }],
  [{ coeff: 6, pow: 2 }, { coeff: 2, pow: 1 }, { coeff: -5, pow: 0 }],
  [{ coeff: 9, pow: 2 }, { coeff: -4, pow: 1 }, { coeff: 1, pow: 0 }],
];
for (const terms of quadratics) {
  polyDerivQuestion('basic', CAT_BASIC, terms, 2);
}

const cubics: Term[][] = [
  [{ coeff: 7, pow: 3 }, { coeff: 13, pow: 2 }, { coeff: 18, pow: 1 }, { coeff: 9, pow: 0 }],
  [{ coeff: 1, pow: 3 }, { coeff: -1, pow: 1 }],
  [{ coeff: 2, pow: 3 }, { coeff: 3, pow: 2 }, { coeff: -4, pow: 1 }, { coeff: 1, pow: 0 }],
  [{ coeff: 1, pow: 3 }, { coeff: -2, pow: 2 }, { coeff: 5, pow: 1 }, { coeff: -7, pow: 0 }],
  [{ coeff: 5, pow: 3 }, { coeff: 1, pow: 2 }, { coeff: -3, pow: 1 }, { coeff: 2, pow: 0 }],
  [{ coeff: 3, pow: 3 }, { coeff: -1, pow: 2 }, { coeff: 2, pow: 1 }, { coeff: 4, pow: 0 }],
  [{ coeff: 4, pow: 3 }, { coeff: 2, pow: 2 }, { coeff: 1, pow: 1 }, { coeff: -1, pow: 0 }],
  [{ coeff: 1, pow: 3 }, { coeff: 1, pow: 2 }, { coeff: 1, pow: 1 }, { coeff: 1, pow: 0 }],
];
for (const terms of cubics) {
  polyDerivQuestion('basic', CAT_BASIC, terms, 2);
}

// Trigonometric, exponential, and logarithmic derivatives.
for (const [a, b] of [
  [9, 10],
  [13, 19],
  [2, 7],
  [5, 3],
] as Array<[number, number]>) {
  curated(
    'basic',
    CAT_BASIC,
    `Differentiate $f(x) = ${a}\\sin x + ${b}\\cos x$.`,
    `$${a}\\cos x - ${b}\\sin x$`,
    [
      `$${a}\\cos x + ${b}\\sin x$`,
      `$${b}\\cos x - ${a}\\sin x$`,
      `$${a}\\sin x - ${b}\\cos x$`,
      `$-${a}\\cos x - ${b}\\sin x$`,
    ],
    `Use $\\dfrac{d}{dx}\\sin x = \\cos x$ and $\\dfrac{d}{dx}\\cos x = -\\sin x$: the derivative is $${a}\\cos x - ${b}\\sin x$.`,
    2,
  );
}
for (const a of [4, 6]) {
  curated(
    'basic',
    CAT_BASIC,
    `Differentiate $f(x) = ${a}\\sin x$.`,
    `$${a}\\cos x$`,
    [`$-${a}\\cos x$`, `$${a}\\sin x$`, `$-${a}\\sin x$`, '$\\cos x$'],
    `The derivative of $\\sin x$ is $\\cos x$, so the constant multiple gives $${a}\\cos x$.`,
    2,
  );
}
for (const a of [4, 7]) {
  curated(
    'basic',
    CAT_BASIC,
    `Differentiate $f(x) = ${a}\\cos x$.`,
    `$-${a}\\sin x$`,
    [`$${a}\\sin x$`, `$-${a}\\cos x$`, `$${a}\\cos x$`, '$-\\sin x$'],
    `The derivative of $\\cos x$ is $-\\sin x$, so the constant multiple gives $-${a}\\sin x$.`,
    2,
  );
}
for (const a of [8, 3]) {
  curated(
    'basic',
    CAT_BASIC,
    `Differentiate $f(x) = ${a}e^{x}$.`,
    `$${a}e^{x}$`,
    [`$e^{x}$`, `$${a}xe^{x}$`, `$${a}e^{x-1}$`, `$${a}$`],
    `Since $\\dfrac{d}{dx}e^{x} = e^{x}$, the constant multiple gives $${a}e^{x}$.`,
    2,
  );
}
for (const a of [9, 5]) {
  curated(
    'basic',
    CAT_BASIC,
    `Differentiate $f(x) = ${a}\\ln x$.`,
    `$\\dfrac{${a}}{x}$`,
    ['$\\dfrac{1}{x}$', `$\\dfrac{${a}}{x^{2}}$`, `$${a}\\ln x$`, `$\\dfrac{1}{${a}x}$`],
    `Since $\\dfrac{d}{dx}\\ln x = \\dfrac{1}{x}$, the constant multiple gives $\\dfrac{${a}}{x}$.`,
    2,
  );
}

// Evaluate a polynomial derivative at a point.
for (const [terms, x0] of [
  [[{ coeff: 1, pow: 3 }], 2],
  [[{ coeff: 1, pow: 3 }], 3],
  [[{ coeff: 2, pow: 3 }, { coeff: -1, pow: 1 }], 1],
  [[{ coeff: 1, pow: 2 }, { coeff: 3, pow: 1 }, { coeff: 1, pow: 0 }], 4],
  [[{ coeff: 3, pow: 2 }, { coeff: -2, pow: 1 }], 2],
  [[{ coeff: 1, pow: 4 }], 2],
  [[{ coeff: 2, pow: 2 }, { coeff: 5, pow: 1 }, { coeff: -3, pow: 0 }], 3],
  [[{ coeff: 1, pow: 3 }, { coeff: 2, pow: 2 }], 1],
  [[{ coeff: 4, pow: 2 }, { coeff: -3, pow: 1 }, { coeff: 2, pow: 0 }], 2],
  [[{ coeff: 1, pow: 5 }], 1],
  [[{ coeff: 2, pow: 3 }, { coeff: 1, pow: 1 }], 2],
  [[{ coeff: 5, pow: 2 }, { coeff: -1, pow: 1 }], 3],
] as Array<[Term[], number]>) {
  const D = derivTerms(terms);
  const correct = polyEval(D, x0);
  const noReduce = terms.filter((t) => t.pow >= 1).map((t) => ({ coeff: t.coeff * t.pow, pow: t.pow }));
  const noMul = terms.filter((t) => t.pow >= 1).map((t) => ({ coeff: t.coeff, pow: t.pow - 1 }));
  numAt(
    'basic',
    CAT_BASIC,
    `For $f(x) = ${fmtPoly(terms)}$, find $f'(${x0})$.`,
    correct,
    [polyEval(terms, x0), polyEval(noReduce, x0), polyEval(noMul, x0)],
    `Differentiate to $f'(x) = ${fmtPoly(D)}$, then substitute $x = ${x0}$ to get $${correct}$.`,
    2,
  );
}

// Second derivatives of monomials (as expressions).
for (const [a, k] of [
  [1, 6],
  [1, 4],
  [2, 3],
  [3, 5],
] as Array<[number, number]>) {
  const second = a * k * (k - 1);
  curated(
    'basic',
    CAT_BASIC,
    `For $f(x) = ${fmtPoly([{ coeff: a, pow: k }])}$, find the second derivative $f''(x)$.`,
    `$${fmtPoly([{ coeff: second, pow: k - 2 }])}$`,
    [
      `$${fmtPoly([{ coeff: a * k, pow: k - 1 }])}$`,
      `$${fmtPoly([{ coeff: second, pow: k - 1 }])}$`,
      `$${fmtPoly([{ coeff: k * (k - 1), pow: k - 2 }])}$`,
      `$${fmtPoly([{ coeff: a, pow: k - 2 }])}$`,
    ],
    `First $f'(x) = ${fmtPoly([{ coeff: a * k, pow: k - 1 }])}$, then $f''(x) = ${fmtPoly([
      { coeff: second, pow: k - 2 },
    ])}$.`,
    3,
  );
}

// Higher-order derivative of sine.
curated(
  'basic',
  CAT_BASIC,
  'What is the fourth derivative of $f(x) = \\sin x$?',
  '$\\sin x$',
  ['$\\cos x$', '$-\\sin x$', '$-\\cos x$', '$0$'],
  'The derivatives cycle $\\cos x,\\ -\\sin x,\\ -\\cos x,\\ \\sin x$, returning to $\\sin x$ after four steps.',
  3,
);

// ===========================================================================
// Section 4 — The Product and Quotient Rules
// ===========================================================================

// Product rule at a point.
for (const [fa, fpa, ga, gpa] of [
  [3, -1, -5, 2],
  [2, 4, 3, 1],
  [5, 2, -1, 3],
  [-2, 3, 4, -1],
  [1, 5, 2, 2],
  [4, -2, 1, 3],
  [3, 1, 2, 4],
  [-1, 2, 5, 1],
  [2, 3, 3, -2],
  [6, 1, -2, 2],
  [1, 4, 4, 1],
  [3, 2, 2, 3],
] as Array<[number, number, number, number]>) {
  const correct = fpa * ga + fa * gpa;
  numAt(
    'prodquot',
    CAT_PRODUCT_QUOTIENT,
    `Suppose $f(2) = ${fa}$, $f'(2) = ${fpa}$, $g(2) = ${ga}$, and $g'(2) = ${gpa}$. Find $(f \\cdot g)'(2)$.`,
    correct,
    [fpa * gpa, fpa * ga, fa * gpa, fa * ga],
    `The product rule gives $(fg)'(2) = f'(2)g(2) + f(2)g'(2) = (${fpa})(${ga}) + (${fa})(${gpa}) = ${correct}$.`,
    3,
  );
}

// Quotient rule at a point.
for (const [fa, fpa, ga, gpa] of [
  [3, -1, -5, 2],
  [2, 4, 3, 1],
  [5, 2, 1, 3],
  [-2, 3, 4, -1],
  [1, 5, 2, 2],
  [4, -2, 1, 3],
  [3, 1, 2, 4],
  [6, 3, 3, 1],
  [2, 3, 3, -2],
  [4, 1, 2, 2],
  [1, 4, 4, 1],
  [3, 2, 2, 3],
] as Array<[number, number, number, number]>) {
  const num = fpa * ga - fa * gpa;
  const den = ga * ga;
  fracAt(
    'prodquot',
    CAT_PRODUCT_QUOTIENT,
    `Suppose $f(2) = ${fa}$, $f'(2) = ${fpa}$, $g(2) = ${ga}$, and $g'(2) = ${gpa}$. Find $\\left(\\dfrac{f}{g}\\right)'(2)$.`,
    num,
    den,
    [
      [-num, den],
      [num, ga],
      [fpa * ga + fa * gpa, den],
      [fpa, gpa],
    ],
    `The quotient rule gives $\\dfrac{f'(2)g(2) - f(2)g'(2)}{[g(2)]^2} = \\dfrac{(${fpa})(${ga}) - (${fa})(${gpa})}{(${ga})^2}$.`,
    3,
  );
}

// Product-rule expressions.
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = 5x^2 \\sin x$.',
  '$5x^2 \\cos x + 10x \\sin x$',
  ['$10x \\cos x$', '$5x^2 \\cos x$', '$10x \\sin x - 5x^2 \\cos x$', '$5x^2 \\cos x + 5x \\sin x$'],
  'With $f = 5x^2$ and $g = \\sin x$: $fg\' + f\'g = 5x^2 \\cos x + 10x \\sin x$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = x^3 \\cos x$.',
  '$3x^2 \\cos x - x^3 \\sin x$',
  ['$3x^2 \\sin x$', '$-3x^2 \\sin x$', '$3x^2 \\cos x + x^3 \\sin x$', '$-x^3 \\sin x$'],
  'With $f = x^3$ and $g = \\cos x$: $fg\' + f\'g = -x^3 \\sin x + 3x^2 \\cos x$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = x e^{x}$.',
  '$e^{x} + xe^{x}$',
  ['$xe^{x}$', '$e^{x}$', '$xe^{x-1}$', '$e^{x} - xe^{x}$'],
  'With $f = x$ and $g = e^{x}$: $fg\' + f\'g = xe^{x} + e^{x}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = e^{x} \\sin x$.',
  '$e^{x} \\sin x + e^{x} \\cos x$',
  ['$e^{x} \\cos x$', '$e^{x} \\sin x - e^{x} \\cos x$', '$e^{x} \\cos x - e^{x} \\sin x$', '$e^{x} \\cos x \\sin x$'],
  'With $f = e^{x}$ and $g = \\sin x$: $fg\' + f\'g = e^{x} \\cos x + e^{x} \\sin x$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = x \\ln x$.',
  '$\\ln x + 1$',
  ['$1$', '$\\ln x$', '$\\dfrac{1}{x}$', '$x \\ln x$'],
  'With $f = x$ and $g = \\ln x$: $x \\cdot \\dfrac{1}{x} + 1 \\cdot \\ln x = \\ln x + 1$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = x^2 e^{x}$.',
  '$x^2 e^{x} + 2x e^{x}$',
  ['$2x e^{x}$', '$2x e^{x-1}$', '$x^2 e^{x}$', '$x^2 e^{x} - 2x e^{x}$'],
  'With $f = x^2$ and $g = e^{x}$: $x^2 e^{x} + 2x e^{x}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = \\sin x \\cos x$.',
  '$\\cos^2 x - \\sin^2 x$',
  ['$\\cos^2 x + \\sin^2 x$', '$\\sin^2 x - \\cos^2 x$', '$-\\sin x \\cos x$', '$1$'],
  'The product rule gives $\\cos x \\cos x + \\sin x(-\\sin x) = \\cos^2 x - \\sin^2 x$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $y = x^3 \\sin x$.',
  '$x^3 \\cos x + 3x^2 \\sin x$',
  ['$3x^2 \\cos x$', '$3x^2 \\sin x$', '$x^3 \\cos x - 3x^2 \\sin x$', '$x^3 \\cos x$'],
  'With $f = x^3$ and $g = \\sin x$: $x^3 \\cos x + 3x^2 \\sin x$.',
  3,
);

// Quotient-rule expressions.
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{x + 7}{x - 5}$.',
  '$-\\dfrac{12}{(x - 5)^2}$',
  ['$\\dfrac{12}{(x - 5)^2}$', '$-\\dfrac{2}{(x - 5)^2}$', '$\\dfrac{1}{(x - 5)^2}$', '$\\dfrac{2}{(x - 5)^2}$'],
  'The quotient rule gives $\\dfrac{(x - 5)(1) - (x + 7)(1)}{(x - 5)^2} = \\dfrac{-12}{(x - 5)^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{x - 5}{x + 7}$.',
  '$\\dfrac{12}{(x + 7)^2}$',
  ['$-\\dfrac{12}{(x + 7)^2}$', '$\\dfrac{2}{(x + 7)^2}$', '$-\\dfrac{2}{(x + 7)^2}$', '$\\dfrac{1}{(x + 7)^2}$'],
  'The quotient rule gives $\\dfrac{(x + 7)(1) - (x - 5)(1)}{(x + 7)^2} = \\dfrac{12}{(x + 7)^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{2x + 1}{3x - 1}$.',
  '$-\\dfrac{5}{(3x - 1)^2}$',
  ['$\\dfrac{5}{(3x - 1)^2}$', '$\\dfrac{2}{3}$', '$-\\dfrac{1}{(3x - 1)^2}$', '$\\dfrac{1}{(3x - 1)^2}$'],
  'The quotient rule gives $\\dfrac{2(3x - 1) - 3(2x + 1)}{(3x - 1)^2} = \\dfrac{-5}{(3x - 1)^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{x}{x^2 + 1}$.',
  '$\\dfrac{1 - x^2}{(x^2 + 1)^2}$',
  ['$\\dfrac{x^2 - 1}{(x^2 + 1)^2}$', '$\\dfrac{1}{(x^2 + 1)^2}$', '$\\dfrac{1 + x^2}{(x^2 + 1)^2}$', '$\\dfrac{1}{2x}$'],
  'The quotient rule gives $\\dfrac{(x^2 + 1)(1) - x(2x)}{(x^2 + 1)^2} = \\dfrac{1 - x^2}{(x^2 + 1)^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{\\sin x}{x}$.',
  '$\\dfrac{x \\cos x - \\sin x}{x^2}$',
  [
    '$\\dfrac{\\cos x}{1}$',
    '$\\dfrac{\\sin x - x \\cos x}{x^2}$',
    '$\\dfrac{x \\cos x + \\sin x}{x^2}$',
    '$\\dfrac{\\cos x}{x^2}$',
  ],
  'The quotient rule gives $\\dfrac{x \\cos x - \\sin x(1)}{x^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{1}{x^2 + 1}$.',
  '$-\\dfrac{2x}{(x^2 + 1)^2}$',
  ['$\\dfrac{2x}{(x^2 + 1)^2}$', '$-\\dfrac{1}{(x^2 + 1)^2}$', '$-\\dfrac{2x}{x^2 + 1}$', '$\\dfrac{1}{2x}$'],
  'Write it as $(x^2 + 1)^{-1}$; the chain rule gives $-\\dfrac{2x}{(x^2 + 1)^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{x + 1}{x - 1}$.',
  '$-\\dfrac{2}{(x - 1)^2}$',
  ['$\\dfrac{2}{(x - 1)^2}$', '$\\dfrac{1}{(x - 1)^2}$', '$-\\dfrac{1}{(x - 1)^2}$', '$1$'],
  'The quotient rule gives $\\dfrac{(x - 1) - (x + 1)}{(x - 1)^2} = \\dfrac{-2}{(x - 1)^2}$.',
  3,
);
curated(
  'prodquot',
  CAT_PRODUCT_QUOTIENT,
  'Differentiate $g(x) = \\dfrac{e^{x}}{x}$.',
  '$\\dfrac{xe^{x} - e^{x}}{x^2}$',
  ['$\\dfrac{e^{x}}{1}$', '$\\dfrac{xe^{x} + e^{x}}{x^2}$', '$\\dfrac{e^{x}}{x^2}$', '$\\dfrac{e^{x} - xe^{x}}{x^2}$'],
  'The quotient rule gives $\\dfrac{x e^{x} - e^{x}(1)}{x^2}$.',
  3,
);

// Trigonometric derivative recall.
const trigRecall: Array<[string, string, string[]]> = [
  ['\\tan x', '\\sec^2 x', ['-\\csc^2 x', '\\sec x \\tan x', '\\sec^2 x \\tan x', '\\cot x']],
  ['\\cot x', '-\\csc^2 x', ['\\csc^2 x', '-\\sec^2 x', '-\\csc x \\cot x', '\\tan x']],
  ['\\sec x', '\\sec x \\tan x', ['\\sec^2 x', '-\\csc x \\cot x', '\\tan x', '\\sec x']],
  ['\\csc x', '-\\csc x \\cot x', ['\\csc x \\cot x', '-\\csc^2 x', '-\\cot x', '\\sec x \\tan x']],
  ['\\sin x', '\\cos x', ['-\\cos x', '-\\sin x', '\\sin x', '\\sec^2 x']],
  ['\\cos x', '-\\sin x', ['\\sin x', '-\\cos x', '\\cos x', '\\csc^2 x']],
];
for (const [fn, deriv, distractors] of trigRecall) {
  curated(
    'prodquot',
    CAT_PRODUCT_QUOTIENT,
    `What is $\\dfrac{d}{dx}\\left(${fn}\\right)$?`,
    `$${deriv}$`,
    distractors.map((d) => `$${d}$`),
    `The derivative of $${fn}$ is $${deriv}$.`,
    fn === '\\sin x' || fn === '\\cos x' ? 1 : 2,
  );
}

// ===========================================================================
// Section 5 — The Chain Rule
// ===========================================================================

// Chain rule at a point.
for (const [ga, gpa, r] of [
  [2, 5, 3],
  [1, 4, 2],
  [3, 2, 5],
  [-1, 3, 4],
  [2, 2, 6],
  [4, 1, 3],
  [1, 5, 2],
  [3, 3, 1],
  [2, 4, 2],
  [-2, 2, 3],
  [5, 1, 4],
  [1, 2, 7],
  [2, 3, 3],
  [4, 2, 2],
  [3, 1, 6],
  [2, 6, 1],
] as Array<[number, number, number]>) {
  const correct = r * gpa;
  numAt(
    'chain',
    CAT_CHAIN,
    `Suppose $g(1) = ${ga}$, $g'(1) = ${gpa}$, and $f'(${ga}) = ${r}$. If $k(x) = f(g(x))$, find $k'(1)$.`,
    correct,
    [r + gpa, r, gpa, r * ga],
    `The chain rule gives $k'(1) = f'(g(1)) \\cdot g'(1) = ${r} \\cdot ${gpa} = ${correct}$.`,
    3,
  );
}

// Generalized power rule with a linear inner function.
for (const [m, k, n] of [
  [3, 1, 5],
  [2, 3, 4],
  [4, 1, 3],
  [5, 2, 2],
  [2, 1, 6],
  [3, 2, 4],
] as Array<[number, number, number]>) {
  const inner = `(${m}x + ${k})`;
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = ${inner}^{${n}}$.`,
    `$${n * m}${inner}^{${n - 1}}$`,
    [
      `$${n}${inner}^{${n - 1}}$`,
      `$${n * m}${inner}^{${n}}$`,
      `$${n * m * m}${inner}^{${n - 1}}$`,
      `$${inner}^{${n - 1}}$`,
    ],
    `The chain rule gives $${n}${inner}^{${n - 1}} \\cdot ${m} = ${n * m}${inner}^{${n - 1}}$.`,
    3,
  );
}
// Generalized power rule with a quadratic inner function.
for (const [c, n] of [
  [1, 4],
  [1, 3],
  [4, 2],
  [9, 3],
] as Array<[number, number]>) {
  const inner = `(x^2 + ${c})`;
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = ${inner}^{${n}}$.`,
    `$${2 * n}x${inner}^{${n - 1}}$`,
    [
      `$${n}x${inner}^{${n - 1}}$`,
      `$${2 * n}x${inner}^{${n}}$`,
      `$${2 * n}${inner}^{${n - 1}}$`,
      `$${n}${inner}^{${n - 1}}$`,
    ],
    `The chain rule gives $${n}${inner}^{${n - 1}} \\cdot 2x = ${2 * n}x${inner}^{${n - 1}}$.`,
    3,
  );
}

// Trigonometric / exponential / logarithmic chains.
for (const m of [2, 3, 5]) {
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = \\sin(${m}x)$.`,
    `$${m}\\cos(${m}x)$`,
    [`$\\cos(${m}x)$`, `$-${m}\\sin(${m}x)$`, `$${m}\\cos(x)$`, `$-${m}\\cos(${m}x)$`],
    `The chain rule gives $\\cos(${m}x) \\cdot ${m} = ${m}\\cos(${m}x)$.`,
    2,
  );
}
for (const m of [2, 4]) {
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = \\cos(${m}x)$.`,
    `$-${m}\\sin(${m}x)$`,
    [`$${m}\\sin(${m}x)$`, `$-\\sin(${m}x)$`, `$-${m}\\sin(x)$`, `$${m}\\cos(${m}x)$`],
    `The chain rule gives $-\\sin(${m}x) \\cdot ${m} = -${m}\\sin(${m}x)$.`,
    2,
  );
}
for (const m of [3, 2]) {
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = e^{${m}x}$.`,
    `$${m}e^{${m}x}$`,
    [`$e^{${m}x}$`, `$${m}e^{x}$`, `$${m}xe^{${m}x}$`, `$e^{${m}x-1}$`],
    `The chain rule gives $e^{${m}x} \\cdot ${m} = ${m}e^{${m}x}$.`,
    2,
  );
}
for (const m of [5, 3]) {
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = \\tan(${m}x)$.`,
    `$${m}\\sec^2(${m}x)$`,
    [`$\\sec^2(${m}x)$`, `$${m}\\sec(${m}x)\\tan(${m}x)$`, `$${m}\\tan^2(${m}x)$`, `$\\sec^2(x)$`],
    `The chain rule gives $\\sec^2(${m}x) \\cdot ${m} = ${m}\\sec^2(${m}x)$.`,
    3,
  );
}
for (const m of [5, 7]) {
  curated(
    'chain',
    CAT_CHAIN,
    `Differentiate $f(x) = \\ln(${m}x)$.`,
    '$\\dfrac{1}{x}$',
    [`$\\dfrac{${m}}{x}$`, `$\\dfrac{1}{${m}x}$`, `$${m}\\ln x$`, '$\\dfrac{1}{x^{2}}$'],
    `The chain rule gives $\\dfrac{${m}}{${m}x} = \\dfrac{1}{x}$.`,
    2,
  );
}

// Curated chain examples, including adapted exercises.
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $f(x) = \\cos(x^2)$.',
  '$-2x \\sin(x^2)$',
  ['$-\\sin(2x)$', '$2x \\sin(x^2)$', '$-\\sin(x^2)$', '$-2x \\cos(x^2)$'],
  'The outer derivative $-\\sin(x^2)$ times the inner derivative $2x$ gives $-2x \\sin(x^2)$.',
  3,
);
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $f(x) = e^{x^2}$.',
  '$2x e^{x^2}$',
  ['$e^{x^2}$', '$2x e^{2x}$', '$x^2 e^{x^2}$', '$2 e^{x^2}$'],
  'The chain rule gives $e^{x^2} \\cdot 2x = 2x e^{x^2}$.',
  3,
);
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $f(x) = \\ln(x^2 + 1)$.',
  '$\\dfrac{2x}{x^2 + 1}$',
  ['$\\dfrac{1}{x^2 + 1}$', '$\\dfrac{2x}{(x^2 + 1)^2}$', '$\\dfrac{1}{2x}$', '$\\dfrac{2x}{x^2}$'],
  'The chain rule gives $\\dfrac{1}{x^2 + 1} \\cdot 2x = \\dfrac{2x}{x^2 + 1}$.',
  3,
);
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $f(x) = \\sqrt{x^2 + 1}$.',
  '$\\dfrac{x}{\\sqrt{x^2 + 1}}$',
  ['$\\dfrac{1}{2\\sqrt{x^2 + 1}}$', '$\\dfrac{2x}{\\sqrt{x^2 + 1}}$', '$\\dfrac{x}{2\\sqrt{x^2 + 1}}$', '$\\sqrt{2x}$'],
  'Write it as $(x^2 + 1)^{1/2}$; the chain rule gives $\\tfrac{1}{2}(x^2 + 1)^{-1/2} \\cdot 2x = \\dfrac{x}{\\sqrt{x^2 + 1}}$.',
  4,
);
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $f(x) = \\sin^3 x$.',
  '$3 \\sin^2 x \\cos x$',
  ['$3 \\sin^2 x$', '$3 \\cos^2 x$', '$\\sin^2 x \\cos x$', '$3 \\sin^2 x \\cos^2 x$'],
  'With the generalized power rule, $3 \\sin^2 x \\cdot \\cos x$.',
  3,
);
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $f(x) = (4x^3 - x)^{10}$.',
  '$10(4x^3 - x)^9 (12x^2 - 1)$',
  [
    '$10(4x^3 - x)^9$',
    '$10(12x^2 - 1)^9$',
    '$(4x^3 - x)^9 (12x^2 - 1)$',
    '$10(4x^3 - x)^{10}(12x^2 - 1)$',
  ],
  'The generalized power rule gives $10(4x^3 - x)^9 \\cdot (12x^2 - 1)$.',
  4,
);
curated(
  'chain',
  CAT_CHAIN,
  'Differentiate $g(\\theta) = (\\sin\\theta + \\cos\\theta)^3$.',
  '$3(\\sin\\theta + \\cos\\theta)^2(\\cos\\theta - \\sin\\theta)$',
  [
    '$3(\\sin\\theta + \\cos\\theta)^2$',
    '$3(\\cos\\theta - \\sin\\theta)^2$',
    '$3(\\sin\\theta + \\cos\\theta)^2(\\sin\\theta - \\cos\\theta)$',
    '$(\\sin\\theta + \\cos\\theta)^2(\\cos\\theta - \\sin\\theta)$',
  ],
  'The generalized power rule gives $3(\\sin\\theta + \\cos\\theta)^2 \\cdot (\\cos\\theta - \\sin\\theta)$.',
  4,
);

// Chain-rule concept questions.
curated(
  'chain',
  CAT_CHAIN,
  'For a composition $f(g(x))$, the chain rule says the derivative equals',
  "$f'(g(x)) \\cdot g'(x)$",
  ["$f'(x) \\cdot g'(x)$", "$f'(g(x))$", "$f(g'(x))$", "$g'(f(x)) \\cdot f'(x)$"],
  'Differentiate the outer function at the inner function, then multiply by the inner derivative.',
  2,
);
curated(
  'chain',
  CAT_CHAIN,
  'In a gear system the inside turns at rate $\\dfrac{du}{dx} = 2$ and the outside turns at rate $\\dfrac{dy}{du} = 3$. What is $\\dfrac{dy}{dx}$?',
  '$6$',
  ['$5$', '$1.5$', '$3$', '$2$'],
  'Linked rates multiply: $\\dfrac{dy}{dx} = \\dfrac{dy}{du} \\cdot \\dfrac{du}{dx} = 3 \\cdot 2 = 6$.',
  2,
);

// ===========================================================================
// Section 6 — Implicit Differentiation
// ===========================================================================

// Slopes on circles (negative reciprocal of the radius slope).
for (const [x0, y0] of [
  [3, 4],
  [4, 3],
  [-3, 4],
  [3, -4],
  [6, 8],
  [5, 12],
  [12, 5],
  [8, 15],
  [15, 8],
  [-5, 12],
  [7, 24],
  [24, 7],
  [9, 12],
  [12, 9],
  [8, 6],
  [20, 15],
  [15, 20],
  [9, 40],
  [40, 9],
  [12, 16],
] as Array<[number, number]>) {
  fracAt(
    'implicit',
    CAT_IMPLICIT,
    `The point $(${x0}, ${y0})$ lies on the circle $x^2 + y^2 = ${x0 * x0 + y0 * y0}$. Find $\\dfrac{dy}{dx}$ there.`,
    -x0,
    y0,
    [
      [x0, y0],
      [-y0, x0],
      [y0, x0],
    ],
    `Implicit differentiation gives $\\dfrac{dy}{dx} = -\\dfrac{x}{y} = -\\dfrac{${x0}}{${y0}}$.`,
    4,
  );
}

// Slopes on the hyperbola xy = k.
for (const [x0, y0] of [
  [2, 6],
  [3, 4],
  [4, 3],
  [6, 2],
  [2, 5],
  [5, 2],
  [3, 6],
  [6, 3],
  [2, 8],
  [8, 2],
  [4, 6],
  [6, 4],
] as Array<[number, number]>) {
  fracAt(
    'implicit',
    CAT_IMPLICIT,
    `The point $(${x0}, ${y0})$ lies on the curve $xy = ${x0 * y0}$. Find $\\dfrac{dy}{dx}$ there.`,
    -y0,
    x0,
    [
      [y0, x0],
      [-x0, y0],
      [x0, y0],
    ],
    `Differentiating $xy = ${x0 * y0}$ gives $y + x\\dfrac{dy}{dx} = 0$, so $\\dfrac{dy}{dx} = -\\dfrac{y}{x} = -\\dfrac{${y0}}{${x0}}$.`,
    4,
  );
}

// Implicit derivative expressions.
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $x^2 + y^2 = 1$.',
  '$-\\dfrac{x}{y}$',
  ['$\\dfrac{x}{y}$', '$-\\dfrac{y}{x}$', '$\\dfrac{y}{x}$', '$-\\dfrac{x^2}{y^2}$'],
  'Differentiating gives $2x + 2y\\,y\' = 0$, so $y\' = -\\dfrac{x}{y}$.',
  3,
);
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $x^2 - y^2 = 1$.',
  '$\\dfrac{x}{y}$',
  ['$-\\dfrac{x}{y}$', '$\\dfrac{y}{x}$', '$-\\dfrac{y}{x}$', '$\\dfrac{x^2}{y^2}$'],
  'Differentiating gives $2x - 2y\\,y\' = 0$, so $y\' = \\dfrac{x}{y}$.',
  3,
);
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $y^2 = x$.',
  '$\\dfrac{1}{2y}$',
  ['$\\dfrac{1}{y}$', '$2y$', '$\\dfrac{1}{2y^2}$', '$\\dfrac{y}{2}$'],
  'Differentiating gives $2y\\,y\' = 1$, so $y\' = \\dfrac{1}{2y}$.',
  3,
);
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $x^3 + y^3 = 6$.',
  '$-\\dfrac{x^2}{y^2}$',
  ['$\\dfrac{x^2}{y^2}$', '$-\\dfrac{x^2}{y}$', '$-\\dfrac{3x^2}{y^2}$', '$-\\dfrac{x}{y}$'],
  'Differentiating gives $3x^2 + 3y^2\\,y\' = 0$, so $y\' = -\\dfrac{x^2}{y^2}$.',
  4,
);
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $x^4 + y^2 + y = 7$.',
  '$-\\dfrac{4x^3}{2y + 1}$',
  ['$\\dfrac{4x^3}{2y + 1}$', '$-\\dfrac{4x^3}{2y}$', '$-\\dfrac{2x^3}{2y + 1}$', '$-\\dfrac{4x^3}{y + 1}$'],
  'Differentiating gives $4x^3 + (2y + 1)y\' = 0$, so $y\' = -\\dfrac{4x^3}{2y + 1}$.',
  4,
);
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $\\sin(y) + y^3 = 6 - x^3$.',
  '$\\dfrac{-3x^2}{\\cos y + 3y^2}$',
  [
    '$\\dfrac{-3x^2}{\\cos y}$',
    '$\\dfrac{3x^2}{\\cos y + 3y^2}$',
    '$\\dfrac{-3x^2}{3y^2 - \\cos y}$',
    '$\\dfrac{-x^2}{\\cos y + 3y^2}$',
  ],
  'Differentiating gives $\\cos(y)\\,y\' + 3y^2\\,y\' = -3x^2$, so $y\' = \\dfrac{-3x^2}{\\cos y + 3y^2}$.',
  5,
);
curated(
  'implicit',
  CAT_IMPLICIT,
  'Use implicit differentiation to find $\\dfrac{dy}{dx}$ for $e^{y} = x$.',
  '$\\dfrac{1}{x}$',
  ['$\\dfrac{1}{e^{y}}$', '$e^{y}$', '$\\dfrac{1}{y}$', '$x$'],
  'Differentiating gives $e^{y}\\,y\' = 1$, so $y\' = \\dfrac{1}{e^{y}} = \\dfrac{1}{x}$.',
  3,
);

// Differentiating individual terms with respect to x.
const termDerivs: Array<[string, string, string[], string]> = [
  [
    '\\dfrac{d}{dx}\\big(y^2\\big)',
    '2y \\dfrac{dy}{dx}',
    ['2y', '2', 'y^2 \\dfrac{dy}{dx}', '2y + \\dfrac{dy}{dx}'],
    'By the chain rule, differentiating $y^2$ attaches a factor of $\\dfrac{dy}{dx}$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(y^3\\big)',
    '3y^2 \\dfrac{dy}{dx}',
    ['3y^2', '3y', 'y^3 \\dfrac{dy}{dx}', '3y^2 + \\dfrac{dy}{dx}'],
    'By the chain rule, $\\dfrac{d}{dx}(y^3) = 3y^2 \\dfrac{dy}{dx}$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(xy\\big)',
    'x \\dfrac{dy}{dx} + y',
    ['\\dfrac{dy}{dx}', 'x \\dfrac{dy}{dx}', 'y \\dfrac{dy}{dx} + x', '1'],
    'The product rule gives $x\\dfrac{dy}{dx} + y$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(\\sin y\\big)',
    '\\cos y \\dfrac{dy}{dx}',
    ['\\cos y', '-\\cos y \\dfrac{dy}{dx}', '\\sin y \\dfrac{dy}{dx}', '-\\sin y'],
    'By the chain rule, $\\dfrac{d}{dx}(\\sin y) = \\cos y \\dfrac{dy}{dx}$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(e^{y}\\big)',
    'e^{y} \\dfrac{dy}{dx}',
    ['e^{y}', 'y e^{y-1} \\dfrac{dy}{dx}', 'e^{y} + \\dfrac{dy}{dx}', '\\dfrac{dy}{dx}'],
    'By the chain rule, $\\dfrac{d}{dx}(e^{y}) = e^{y} \\dfrac{dy}{dx}$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(\\ln y\\big)',
    '\\dfrac{1}{y} \\dfrac{dy}{dx}',
    ['\\dfrac{1}{y}', '\\dfrac{dy}{dx}', '\\ln y \\dfrac{dy}{dx}', '\\dfrac{1}{y^2} \\dfrac{dy}{dx}'],
    'By the chain rule, $\\dfrac{d}{dx}(\\ln y) = \\dfrac{1}{y} \\dfrac{dy}{dx}$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(x + y\\big)',
    '1 + \\dfrac{dy}{dx}',
    ['1', '\\dfrac{dy}{dx}', '1 - \\dfrac{dy}{dx}', 'x + \\dfrac{dy}{dx}'],
    'Differentiate each term: $\\dfrac{d}{dx}(x) = 1$ and $\\dfrac{d}{dx}(y) = \\dfrac{dy}{dx}$.',
  ],
  [
    '\\dfrac{d}{dx}\\big(x^2 y\\big)',
    'x^2 \\dfrac{dy}{dx} + 2xy',
    ['2xy', 'x^2 \\dfrac{dy}{dx}', '2x \\dfrac{dy}{dx}', 'x^2 \\dfrac{dy}{dx} + 2x'],
    'The product rule gives $x^2 \\dfrac{dy}{dx} + 2xy$.',
  ],
];
for (const [expr, deriv, distractors, explanation] of termDerivs) {
  curated(
    'implicit',
    CAT_IMPLICIT,
    `Treating $y$ as a function of $x$, what is $${expr}$?`,
    `$${deriv}$`,
    distractors.map((d) => `$${d}$`),
    explanation,
    expr.includes('xy') || expr.includes('x^2 y') ? 3 : 2,
  );
}

// Slope on a circle, evaluated at named points (numeric, fraction-valued).
fracAt(
  'implicit',
  CAT_IMPLICIT,
  'For $x^2 + y^2 = 1$, the slope is $\\dfrac{dy}{dx} = -\\dfrac{x}{y}$. Find the slope at $\\left(\\tfrac{3}{5}, \\tfrac{4}{5}\\right)$.',
  -3,
  4,
  [
    [3, 4],
    [-4, 3],
    [4, 3],
  ],
  'Substitute: $-\\dfrac{x}{y} = -\\dfrac{3/5}{4/5} = -\\dfrac{3}{4}$.',
  3,
);
fracAt(
  'implicit',
  CAT_IMPLICIT,
  'For $x^2 + y^2 = 169$, find the slope $\\dfrac{dy}{dx}$ at $(5, 12)$.',
  -5,
  12,
  [
    [5, 12],
    [-12, 5],
    [12, 5],
  ],
  'The slope is $-\\dfrac{x}{y} = -\\dfrac{5}{12}$.',
  3,
);

// ===========================================================================
// Section 7 — Derivatives of Inverse Functions
// ===========================================================================

// Inverse derivative at a point for linear functions: (f^{-1})'(b) = 1/m.
for (const m of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, -2, -3, -4, -5, -6, 14]) {
  const k = 5;
  const a = 2;
  const b = m * a + k;
  fracAt(
    'inverse',
    CAT_INVERSE,
    `The point $(${a}, ${b})$ lies on $f(x) = ${fmtPoly([{ coeff: m, pow: 1 }, { coeff: k, pow: 0 }])}$. Find $\\big(f^{-1}\\big)'(${b})$.`,
    1,
    m,
    [
      [m, 1],
      [-1, m],
      [1, m * m],
      [-m, 1],
    ],
    `Since $f'(x) = ${m}$, the rule $\\big(f^{-1}\\big)'(${b}) = \\dfrac{1}{f'(${a})} = \\dfrac{1}{${m}}$ applies.`,
    3,
  );
}

// Inverse derivative at a point for power functions.
for (const a of [2, 3, 4, 5]) {
  const b = a * a * a;
  fracAt(
    'inverse',
    CAT_INVERSE,
    `The point $(${a}, ${b})$ lies on $f(x) = x^3$. Find $\\big(f^{-1}\\big)'(${b})$.`,
    1,
    3 * a * a,
    [
      [3 * a * a, 1],
      [1, 3 * a],
      [1, a * a],
      [1, 3 * a * a * a],
    ],
    `Here $f'(x) = 3x^2$, so $\\big(f^{-1}\\big)'(${b}) = \\dfrac{1}{f'(${a})} = \\dfrac{1}{${3 * a * a}}$.`,
    4,
  );
}
for (const a of [2, 3, 4, 5, 6]) {
  const b = a * a;
  fracAt(
    'inverse',
    CAT_INVERSE,
    `The point $(${a}, ${b})$ lies on $f(x) = x^2$ with $x \\ge 0$. Find $\\big(f^{-1}\\big)'(${b})$.`,
    1,
    2 * a,
    [
      [2 * a, 1],
      [1, a],
      [1, 2 * a * a],
      [a, 2],
    ],
    `Here $f'(x) = 2x$, so $\\big(f^{-1}\\big)'(${b}) = \\dfrac{1}{f'(${a})} = \\dfrac{1}{${2 * a}}$.`,
    3,
  );
}

// Inverse trigonometric derivative recall.
const inverseTrig: Array<[string, string, string[]]> = [
  [
    '\\sin^{-1}(x)',
    '\\dfrac{1}{\\sqrt{1 - x^2}}',
    ['-\\dfrac{1}{\\sqrt{1 - x^2}}', '\\dfrac{1}{1 + x^2}', '\\dfrac{1}{\\sqrt{x^2 - 1}}', '-\\dfrac{1}{1 + x^2}'],
  ],
  [
    '\\cos^{-1}(x)',
    '-\\dfrac{1}{\\sqrt{1 - x^2}}',
    ['\\dfrac{1}{\\sqrt{1 - x^2}}', '-\\dfrac{1}{1 + x^2}', '-\\dfrac{1}{\\sqrt{x^2 - 1}}', '\\dfrac{1}{1 + x^2}'],
  ],
  [
    '\\tan^{-1}(x)',
    '\\dfrac{1}{1 + x^2}',
    ['-\\dfrac{1}{1 + x^2}', '\\dfrac{1}{\\sqrt{1 - x^2}}', '\\dfrac{1}{1 - x^2}', '\\sec^2 x'],
  ],
  [
    '\\cot^{-1}(x)',
    '-\\dfrac{1}{1 + x^2}',
    ['\\dfrac{1}{1 + x^2}', '-\\dfrac{1}{\\sqrt{1 - x^2}}', '-\\dfrac{1}{1 - x^2}', '-\\csc^2 x'],
  ],
  [
    '\\sec^{-1}(x)',
    '\\dfrac{1}{|x|\\sqrt{x^2 - 1}}',
    ['-\\dfrac{1}{|x|\\sqrt{x^2 - 1}}', '\\dfrac{1}{\\sqrt{x^2 - 1}}', '\\dfrac{1}{1 + x^2}', '\\dfrac{1}{|x|\\sqrt{1 - x^2}}'],
  ],
  [
    '\\csc^{-1}(x)',
    '-\\dfrac{1}{|x|\\sqrt{x^2 - 1}}',
    ['\\dfrac{1}{|x|\\sqrt{x^2 - 1}}', '-\\dfrac{1}{\\sqrt{x^2 - 1}}', '-\\dfrac{1}{1 + x^2}', '-\\dfrac{1}{|x|\\sqrt{1 - x^2}}'],
  ],
];
for (const [fn, deriv, distractors] of inverseTrig) {
  curated(
    'inverse',
    CAT_INVERSE,
    `What is $\\dfrac{d}{dx}${fn}$?`,
    `$${deriv}$`,
    distractors.map((d) => `$${d}$`),
    `The derivative of $${fn}$ is $${deriv}$.`,
    fn.includes('sec') || fn.includes('csc') ? 3 : 2,
  );
}

// Inverse trigonometric chains.
for (const m of [4, 2, 5]) {
  curated(
    'inverse',
    CAT_INVERSE,
    `Differentiate $f(x) = \\tan^{-1}(${m}x)$.`,
    `$\\dfrac{${m}}{1 + ${m * m}x^2}$`,
    [
      `$\\dfrac{1}{1 + ${m * m}x^2}$`,
      `$\\dfrac{${m}}{1 + x^2}$`,
      `$\\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$`,
      `$\\dfrac{${m}}{1 - ${m * m}x^2}$`,
    ],
    `The chain rule gives $\\dfrac{1}{1 + (${m}x)^2} \\cdot ${m} = \\dfrac{${m}}{1 + ${m * m}x^2}$.`,
    4,
  );
}
for (const m of [3, 6]) {
  curated(
    'inverse',
    CAT_INVERSE,
    `Differentiate $f(x) = \\sin^{-1}(${m}x)$.`,
    `$\\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$`,
    [
      `$\\dfrac{1}{\\sqrt{1 - ${m * m}x^2}}$`,
      `$\\dfrac{${m}}{\\sqrt{1 - x^2}}$`,
      `$-\\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$`,
      `$\\dfrac{${m}}{1 + ${m * m}x^2}$`,
    ],
    `The chain rule gives $\\dfrac{1}{\\sqrt{1 - (${m}x)^2}} \\cdot ${m} = \\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$.`,
    4,
  );
}
for (const m of [6, 2]) {
  curated(
    'inverse',
    CAT_INVERSE,
    `Differentiate $f(x) = \\cos^{-1}(${m}x)$.`,
    `$-\\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$`,
    [
      `$\\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$`,
      `$-\\dfrac{1}{\\sqrt{1 - ${m * m}x^2}}$`,
      `$-\\dfrac{${m}}{1 + ${m * m}x^2}$`,
      `$-\\dfrac{${m}}{\\sqrt{1 - x^2}}$`,
    ],
    `The chain rule gives $-\\dfrac{1}{\\sqrt{1 - (${m}x)^2}} \\cdot ${m} = -\\dfrac{${m}}{\\sqrt{1 - ${m * m}x^2}}$.`,
    4,
  );
}

// Slope of arctangent at named inputs (its derivative is 1/(1 + x^2)).
const arctanPoints: Array<[number, number, number, Array<[number, number]>]> = [
  [1, 1, 2, [[2, 1], [-1, 2], [1, 4]]],
  [2, 1, 5, [[1, 3], [5, 1], [-1, 5]]],
  [3, 1, 10, [[1, 6], [10, 1], [-1, 10]]],
  [-1, 1, 2, [[-1, 2], [2, 1], [1, 3]]],
  [-2, 1, 5, [[-1, 5], [5, 1], [1, 3]]],
  [0, 1, 1, [[0, 1], [2, 1], [-1, 1]]],
];
for (const [x, cnum, cden, mistakes] of arctanPoints) {
  fracAt(
    'inverse',
    CAT_INVERSE,
    `Find the slope of $y = \\tan^{-1}(x)$ at $x = ${x}$.`,
    cnum,
    cden,
    mistakes,
    `Since $\\dfrac{d}{dx}\\tan^{-1}(x) = \\dfrac{1}{1 + x^2}$, the slope at $x = ${x}$ is $\\dfrac{1}{1 + ${x * x}}$.`,
    3,
  );
}

// A worked inverse-derivative computation with a rational function.
fracAt(
  'inverse',
  CAT_INVERSE,
  "The point $\\left(2, \\tfrac{1}{33}\\right)$ lies on $f(x) = \\dfrac{1}{1 + x^5}$ for $x \\ge 0$. Find $\\big(f^{-1}\\big)'\\!\\left(\\tfrac{1}{33}\\right)$.",
  -1089,
  80,
  [
    [-80, 1089],
    [1089, 80],
    [80, 1089],
  ],
  "Here $f'(x) = \\dfrac{-5x^4}{(1 + x^5)^2}$, so $f'(2) = \\dfrac{-80}{1089}$ and the inverse derivative is the reciprocal $-\\dfrac{1089}{80}$.",
  5,
);
// Tangent-slope reciprocal recall.
curated(
  'inverse',
  CAT_INVERSE,
  'If $f$ and $g = f^{-1}$ satisfy $f(a) = b$ and $f\'(a) = 5$, what is $g\'(b)$?',
  '$\\dfrac{1}{5}$',
  ['$5$', '$-5$', '$-\\dfrac{1}{5}$', '$\\dfrac{1}{25}$'],
  'The slopes of inverse graphs are reciprocals: $g\'(b) = \\dfrac{1}{f\'(a)} = \\dfrac{1}{5}$.',
  3,
);

export const derivativesQuestions: PracticeQuestion[] = out;
