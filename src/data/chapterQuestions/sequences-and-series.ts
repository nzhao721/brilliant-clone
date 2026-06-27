import type { PracticeQuestion } from '../questionBank';

// Practice questions for the "Sequences and Series" chapter of SlopeWise.
//
// Content re-sourced from APEX Calculus (G. Hartman et al.), the chapter on
// Sequences and Series, used under CC BY-NC 4.0
// (https://creativecommons.org/licenses/by-nc/4.0/). Read via
// https://opentext.uleth.ca/apex-calculus/ and apexcalculus.com. Question
// wording is original; the mathematics (formulas, convergence rules, standard
// series) is standard. This chapter also absorbs power series and Taylor /
// Maclaurin series. Every question sets chapterId: 'sequences-and-series'.
//
// The bank is built by parameterized generators (sweeping formulas from the
// source with computed, verified answers) together with vetted exercise-style
// items. All question ids are prefixed `series-`.

const CHAPTER_ID = 'sequences-and-series';
const ID_PREFIX = 'series';
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

// ---------------------------------------------------------------------------
// Small math + formatting helpers.
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function factorialNum(n: number): number {
  let result = 1;
  for (let k = 2; k <= n; k += 1) {
    result *= k;
  }
  return result;
}

// Reduced-fraction KaTeX (without surrounding $). Integers render plainly.
function fracTex(p: number, q: number): string {
  if (q === 0) return '\\text{undefined}';
  let np = p;
  let nq = q;
  if (nq < 0) {
    np = -np;
    nq = -nq;
  }
  const g = gcd(np, nq);
  np /= g;
  nq /= g;
  if (nq === 1) return `${np}`;
  if (np < 0) return `-\\dfrac{${-np}}{${nq}}`;
  return `\\dfrac{${np}}{${nq}}`;
}

function wrap(tex: string): string {
  return `$${tex}$`;
}

function normalizeLabel(value: string): string {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

let genPositionSeed = 0;
const topicCounters = new Map<string, number>();

function nextGenId(topicSlug: string): string {
  const n = (topicCounters.get(topicSlug) ?? 0) + 1;
  topicCounters.set(topicSlug, n);
  return `${ID_PREFIX}-${topicSlug}-${String(n).padStart(3, '0')}`;
}

const PAD_DISTRACTORS = ['$0$', '$1$', '$-1$', '$2$', '$3$', '$-2$', '$4$', '$5$', '$10$'];

const generated: PracticeQuestion[] = [];

/**
 * Build one question: dedupe distractors against the correct answer, pad to a
 * total of four unique choices, rotate the correct slot, and push it. This
 * guarantees unique a-d ids, one correct answer, unique non-empty labels.
 */
function add(
  topicSlug: string,
  category: string,
  prompt: string,
  correct: string,
  distractors: readonly string[],
  explanation: string,
  difficulty: number,
): void {
  const seen = new Set<string>([normalizeLabel(correct)]);
  const picked: string[] = [];
  for (const d of distractors) {
    const key = normalizeLabel(d);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    picked.push(d);
    if (picked.length === 3) break;
  }
  for (const pad of PAD_DISTRACTORS) {
    if (picked.length >= 3) break;
    const key = normalizeLabel(pad);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(pad);
  }
  const total = picked.length + 1;
  const position = genPositionSeed % total;
  genPositionSeed += 1;
  const labels = [...picked];
  labels.splice(position, 0, correct);
  generated.push({
    id: nextGenId(topicSlug),
    chapterId: CHAPTER_ID,
    category,
    prompt,
    choices: labels.map((label, index) => ({ id: LETTERS[index], label })),
    correctChoiceId: LETTERS[position],
    explanation,
    difficulty,
  });
}

type GenSpec = {
  prompt: string;
  correct: string;
  distractors: string[];
  explanation: string;
  difficulty: number;
};

function runSpecs(topicSlug: string, category: string, specs: GenSpec[]): void {
  for (const s of specs) add(topicSlug, category, s.prompt, s.correct, s.distractors, s.explanation, s.difficulty);
}

// ===========================================================================
// TOPIC: Sequences
// ===========================================================================
const SEQ = 'Sequences';

// Rational linear/linear limits -> ratio of leading coefficients a/c.
const seqRational: Array<[number, number, number, number]> = [
  [2, 1, 3, 5],
  [3, 2, 4, 1],
  [5, 1, 2, 3],
  [1, 4, 2, 1],
  [4, 3, 5, 2],
  [7, 2, 3, 1],
  [2, 5, 5, 4],
  [6, 1, 4, 3],
  [3, 7, 2, 5],
  [5, 2, 6, 1],
  [4, 1, 7, 3],
  [8, 3, 5, 2],
];
for (const [a, b, c, d] of seqRational) {
  add(
    'seq',
    SEQ,
    `Evaluate $\\lim_{n \\to \\infty} \\dfrac{${a}n + ${b}}{${c}n + ${d}}$.`,
    wrap(fracTex(a, c)),
    [wrap(fracTex(c, a)), wrap(fracTex(b, d)), wrap(fracTex(a, d)), '$1$', '$0$', '$\\infty$'],
    `For large $n$ the constants become negligible, so the limit is the ratio of leading coefficients: $\\dfrac{${a}n}{${c}n} = ${fracTex(a, c)}$.`,
    2,
  );
}

// Numerator degree below denominator degree -> 0.
const seqToZero: Array<[number, number, number, number]> = [
  [3, 2, 1, 5],
  [5, 1, 2, 3],
  [2, 7, 4, 1],
  [7, 3, 5, 2],
  [4, 5, 3, 8],
  [6, 1, 7, 4],
];
for (const [a, b, c, d] of seqToZero) {
  add(
    'seq',
    SEQ,
    `Evaluate $\\lim_{n \\to \\infty} \\dfrac{${a}n + ${b}}{${c}n^{2} + ${d}}$.`,
    '$0$',
    [wrap(fracTex(a, c)), '$\\infty$', '$1$', wrap(fracTex(a, d))],
    `The denominator grows like $${c}n^{2}$ while the numerator grows like $${a}n$, so the ratio behaves like $\\dfrac{${a}}{${c}n} \\to 0$.`,
    2,
  );
}

// Numerator degree above denominator degree -> diverges.
const seqDiverge: Array<[number, number, number, number]> = [
  [2, 1, 3, 5],
  [4, 3, 1, 2],
  [5, 2, 4, 1],
  [3, 5, 2, 7],
  [6, 1, 5, 3],
];
for (const [a, b, c, d] of seqDiverge) {
  add(
    'seq',
    SEQ,
    `Does the sequence $a_n = \\dfrac{${a}n^{2} + ${b}}{${c}n + ${d}}$ converge?`,
    'No, it diverges to $\\infty$',
    ['Yes, to $0$', `Yes, to $${fracTex(a, c)}$`, 'Yes, to $1$'],
    `The numerator grows like $n^{2}$ but the denominator only like $n$, so $a_n \\sim \\dfrac{${a}}{${c}}n \\to \\infty$ and the sequence diverges.`,
    2,
  );
}

// (1 + k/n)^n -> e^k.
for (const k of [1, 2, 3, 4, -1, -2]) {
  const inside = k > 0 ? `1 + \\dfrac{${k}}{n}` : `1 - \\dfrac{${-k}}{n}`;
  const correct = k === 1 ? '$e$' : `$e^{${k}}$`;
  const recip = k === -1 ? '$e$' : `$e^{${-k}}$`;
  add(
    'seq',
    SEQ,
    `Evaluate $\\lim_{n \\to \\infty} \\left(${inside}\\right)^{n}$.`,
    correct,
    [recip, '$e$', '$1$', `$${k}$`, '$0$', '$\\infty$'],
    `Using $\\lim_{n \\to \\infty}\\left(1 + \\dfrac{x}{n}\\right)^{n} = e^{x}$ with $x = ${k}$, the limit is ${correct}.`,
    3,
  );
}

// Geometric r^n limits.
const seqGeom: Array<[number, number]> = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [4, 5],
  [-1, 2],
  [-2, 3],
  [5, 1],
  [3, 1],
  [-2, 1],
  [1, 1],
  [-1, 1],
];
for (const [p, q] of seqGeom) {
  const rTex = fracTex(p, q);
  const prompt = `Evaluate $\\lim_{n \\to \\infty} \\left(${rTex}\\right)^{n}$.`;
  const mag = Math.abs(p) / Math.abs(q);
  if (mag < 1) {
    add('seq', SEQ, prompt, '$0$', [wrap(rTex), '$1$', 'The limit does not exist', '$\\infty$'], `Since $\\left|${rTex}\\right| < 1$, the powers shrink to $0$.`, 2);
  } else if (mag === 1 && p > 0) {
    add('seq', SEQ, prompt, '$1$', ['$0$', 'The limit does not exist', '$\\infty$'], 'The ratio is $1$, so every term equals $1$ and the limit is $1$.', 1);
  } else if (mag === 1 && p < 0) {
    add('seq', SEQ, prompt, 'The limit does not exist', ['$0$', '$1$', '$-1$'], 'The terms alternate between $1$ and $-1$, so no single limit exists.', 3);
  } else if (p > 0) {
    add('seq', SEQ, prompt, 'The sequence diverges to $\\infty$', ['$0$', '$1$', wrap(rTex), 'The limit does not exist'], 'Since the ratio exceeds $1$, the terms grow without bound and diverge to $\\infty$.', 2);
  } else {
    add('seq', SEQ, prompt, 'The sequence diverges', ['$0$', '$1$', '$\\infty$', wrap(rTex)], `Since $\\left|${rTex}\\right| > 1$ and the ratio is negative, the terms alternate with growing magnitude and diverge.`, 3);
  }
}

// Standard special limits.
runSpecs('seq', SEQ, [
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\dfrac{\\ln n}{n}$.',
    correct: '$0$',
    distractors: ['$1$', '$\\infty$', '$e$'],
    explanation: 'Logarithms grow far slower than linear $n$, so $\\dfrac{\\ln n}{n} \\to 0$.',
    difficulty: 2,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\dfrac{n}{e^{n}}$.',
    correct: '$0$',
    distractors: ['$1$', '$\\infty$', '$e$'],
    explanation: 'Exponential growth dominates the polynomial, so the ratio tends to $0$.',
    difficulty: 2,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} n^{1/n}$.',
    correct: '$1$',
    distractors: ['$0$', '$\\infty$', '$e$'],
    explanation: 'Taking logs gives $\\dfrac{\\ln n}{n} \\to 0$, so $n^{1/n} \\to e^{0} = 1$.',
    difficulty: 3,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\dfrac{n!}{n^{n}}$.',
    correct: '$0$',
    distractors: ['$1$', '$\\infty$', '$e$'],
    explanation: 'Each factor $\\dfrac{k}{n} \\le 1$ and the first factor $\\dfrac{1}{n} \\to 0$, forcing the product to $0$.',
    difficulty: 3,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\dfrac{\\sin n}{n}$.',
    correct: '$0$',
    distractors: ['$1$', 'The limit does not exist', '$\\infty$'],
    explanation: 'Since $|\\sin n| \\le 1$, the Squeeze Theorem gives $\\dfrac{\\sin n}{n} \\to 0$.',
    difficulty: 2,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\dfrac{(-1)^{n}}{n}$.',
    correct: '$0$',
    distractors: ['The limit does not exist', '$1$', '$-1$'],
    explanation: 'The size $\\dfrac{1}{n} \\to 0$, so despite the alternating sign the limit is $0$.',
    difficulty: 2,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\dfrac{\\cos n}{n^{2}}$.',
    correct: '$0$',
    distractors: ['$1$', 'The limit does not exist', '$\\infty$'],
    explanation: 'Since $|\\cos n| \\le 1$, $\\left|\\dfrac{\\cos n}{n^{2}}\\right| \\le \\dfrac{1}{n^{2}} \\to 0$.',
    difficulty: 2,
  },
  {
    prompt: 'Evaluate $\\lim_{n \\to \\infty} \\left(\\sqrt{n+1} - \\sqrt{n}\\right)$.',
    correct: '$0$',
    distractors: ['$1$', '$\\infty$', '$\\dfrac{1}{2}$'],
    explanation: 'Rationalize: $\\sqrt{n+1}-\\sqrt{n} = \\dfrac{1}{\\sqrt{n+1}+\\sqrt{n}} \\to 0$.',
    difficulty: 3,
  },
]);

// nth root of a positive constant -> 1.
for (const a of [2, 5, 7, 10, 100]) {
  add(
    'seq',
    SEQ,
    `Evaluate $\\lim_{n \\to \\infty} \\sqrt[n]{${a}}$.`,
    '$1$',
    ['$0$', `$${a}$`, '$\\infty$'],
    `For any constant $a > 0$, $a^{1/n} \\to a^{0} = 1$; here $a = ${a}$.`,
    2,
  );
}

// Ratio of exponentials.
const seqExpRatio: Array<[number, number]> = [
  [2, 3],
  [1, 2],
  [5, 4],
  [4, 5],
  [3, 2],
  [2, 5],
];
for (const [a, b] of seqExpRatio) {
  const prompt = `Evaluate $\\lim_{n \\to \\infty} \\dfrac{${a}^{n}}{${b}^{n}}$.`;
  if (a < b) {
    add('seq', SEQ, prompt, '$0$', [wrap(fracTex(a, b)), '$1$', '$\\infty$'], `This equals $\\left(\\dfrac{${a}}{${b}}\\right)^{n}$ with base less than $1$, so it tends to $0$.`, 2);
  } else {
    add('seq', SEQ, prompt, 'It diverges to $\\infty$', ['$0$', '$1$', wrap(fracTex(a, b))], `This equals $\\left(\\dfrac{${a}}{${b}}\\right)^{n}$ with base greater than $1$, so it grows to $\\infty$.`, 2);
  }
}

// Conceptual sequence questions.
runSpecs('seq', SEQ, [
  {
    prompt: 'A sequence that is bounded and monotonic must:',
    correct: 'converge',
    distractors: ['diverge', 'oscillate forever', 'be geometric'],
    explanation: 'A bounded monotonic sequence is guaranteed to converge.',
    difficulty: 1,
  },
  {
    prompt: 'Every convergent sequence is necessarily:',
    correct: 'bounded',
    distractors: ['increasing', 'geometric', 'unbounded'],
    explanation: 'A convergent sequence cannot run off to infinity, so it must be bounded.',
    difficulty: 1,
  },
  {
    prompt: 'Is the sequence $a_n = \\dfrac{(-1)^{n} n}{n + 1}$ convergent?',
    correct: 'No; even and odd terms approach $1$ and $-1$',
    distractors: ['Yes, to $0$', 'Yes, to $1$', 'Yes, to $-1$'],
    explanation: 'The size $\\dfrac{n}{n+1} \\to 1$, so even terms approach $1$ and odd terms approach $-1$; no single limit exists.',
    difficulty: 3,
  },
  {
    prompt: 'A sequence $a_n$ is monotonically increasing when:',
    correct: '$a_{n+1} \\ge a_n$ for all $n$',
    distractors: ['$a_{n+1} \\le a_n$ for all $n$', '$a_n \\to 0$', '$a_n$ is bounded'],
    explanation: 'Increasing means each term is at least as large as the previous one.',
    difficulty: 1,
  },
  {
    prompt: 'If $\\lim a_n = L$ and $\\lim b_n = M$, then $\\lim (a_n + b_n)$ equals:',
    correct: '$L + M$',
    distractors: ['$L - M$', '$LM$', '$\\dfrac{L}{M}$'],
    explanation: 'The limit of a sum is the sum of the limits.',
    difficulty: 1,
  },
  {
    prompt: 'A bounded sequence that is not monotonic:',
    correct: 'may or may not converge',
    distractors: ['must converge', 'must diverge', 'is always geometric'],
    explanation: 'Boundedness alone is not enough: $(-1)^n$ is bounded yet diverges, while $1/n$ converges.',
    difficulty: 2,
  },
]);

// ===========================================================================
// TOPIC: Infinite Series
// ===========================================================================
const SER = 'Infinite Series';

// Geometric sums from n = 0:  sum a r^n = a/(1-r) = a*q/(q-p).
const geoSum0: Array<[number, number, number]> = [
  [1, 1, 2],
  [1, 1, 3],
  [1, 2, 3],
  [1, 1, 4],
  [2, 1, 2],
  [3, 1, 3],
  [2, 1, 4],
  [5, 2, 5],
  [1, -1, 2],
  [1, -1, 3],
  [4, 3, 4],
  [6, 1, 2],
  [2, 2, 3],
  [1, 3, 5],
];
for (const [a, p, q] of geoSum0) {
  const rTex = fracTex(p, q);
  const lead = a === 1 ? '' : `${a}`;
  add(
    'ser',
    SER,
    `Evaluate $\\sum_{n=0}^{\\infty} ${lead}\\left(${rTex}\\right)^{n}$.`,
    wrap(fracTex(a * q, q - p)),
    [
      wrap(fracTex(a * q, q + p)),
      wrap(fracTex(a * (q - p), q)),
      wrap(fracTex(q, q - p)),
      wrap(fracTex(a, 1)),
    ],
    `With first term $a = ${a}$ and ratio $r = ${rTex}$, the sum is $\\dfrac{a}{1 - r} = ${fracTex(a * q, q - p)}$.`,
    2,
  );
}

// More geometric sums from n = 0 with a leading coefficient.
const geoSum0b: Array<[number, number, number]> = [
  [3, 1, 2],
  [2, 1, 3],
  [4, 1, 4],
  [1, 2, 5],
  [3, 2, 3],
  [2, 3, 4],
];
for (const [a, p, q] of geoSum0b) {
  const rTex = fracTex(p, q);
  add(
    'ser',
    SER,
    `Find the sum $\\sum_{n=0}^{\\infty} ${a === 1 ? '' : a}\\left(${rTex}\\right)^{n}$.`,
    wrap(fracTex(a * q, q - p)),
    [wrap(fracTex(a * q, q + p)), wrap(fracTex(a, 1)), wrap(fracTex(q, q - p)), '$\\infty$'],
    `Using $\\dfrac{a}{1-r}$ with $a = ${a}$, $r = ${rTex}$ gives $${fracTex(a * q, q - p)}$.`,
    2,
  );
}

// Geometric sums from n = 1:  sum r^n = r/(1-r) = p/(q-p).
const geoSum1: Array<[number, number]> = [
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [2, 5],
  [-1, 2],
  [1, 5],
];
for (const [p, q] of geoSum1) {
  const rTex = fracTex(p, q);
  add(
    'ser',
    SER,
    `Evaluate $\\sum_{n=1}^{\\infty} \\left(${rTex}\\right)^{n}$.`,
    wrap(fracTex(p, q - p)),
    [wrap(fracTex(q, q - p)), wrap(fracTex(p, q + p)), wrap(fracTex(p, q)), '$1$'],
    `The first term is $r = ${rTex}$, so the sum is $\\dfrac{r}{1 - r} = ${fracTex(p, q - p)}$.`,
    3,
  );
}

// Telescoping series with known sums.
runSpecs('ser', SER, [
  {
    prompt: 'Evaluate the telescoping sum $\\sum_{n=1}^{\\infty} \\left(\\dfrac{1}{n} - \\dfrac{1}{n+1}\\right)$.',
    correct: '$1$',
    distractors: ['$0$', '$2$', '$\\infty$'],
    explanation: 'The partial sums collapse to $1 - \\dfrac{1}{N+1} \\to 1$.',
    difficulty: 3,
  },
  {
    prompt: 'Evaluate $\\sum_{n=1}^{\\infty} \\dfrac{1}{n(n+1)}$.',
    correct: '$1$',
    distractors: ['$\\dfrac{1}{2}$', '$2$', '$0$'],
    explanation: 'Partial fractions give $\\dfrac{1}{n} - \\dfrac{1}{n+1}$, which telescopes to $1$.',
    difficulty: 3,
  },
  {
    prompt: 'Evaluate $\\sum_{n=1}^{\\infty} \\dfrac{1}{(n+1)(n+2)}$.',
    correct: '$\\dfrac{1}{2}$',
    distractors: ['$1$', '$\\dfrac{1}{3}$', '$0$'],
    explanation: 'This telescopes to the first surviving term $\\dfrac{1}{2}$, since $\\dfrac{1}{(n+1)(n+2)} = \\dfrac{1}{n+1} - \\dfrac{1}{n+2}$.',
    difficulty: 3,
  },
  {
    prompt: 'Evaluate $\\sum_{n=1}^{\\infty} \\dfrac{2}{n(n+1)}$.',
    correct: '$2$',
    distractors: ['$1$', '$4$', '$\\dfrac{1}{2}$'],
    explanation: 'This is twice the telescoping sum $\\sum \\dfrac{1}{n(n+1)} = 1$, so it equals $2$.',
    difficulty: 3,
  },
  {
    prompt: 'Evaluate $\\sum_{n=1}^{\\infty} \\left(\\dfrac{1}{n+1} - \\dfrac{1}{n+2}\\right)$.',
    correct: '$\\dfrac{1}{2}$',
    distractors: ['$1$', '$\\dfrac{1}{3}$', '$0$'],
    explanation: 'The partial sums telescope to the first surviving term $\\dfrac{1}{2}$.',
    difficulty: 3,
  },
]);

// Divergent geometric series identification.
const geoDiverge: Array<[number, number]> = [
  [3, 2],
  [5, 4],
  [-3, 2],
  [2, 1],
  [-2, 1],
  [5, 3],
];
for (const [p, q] of geoDiverge) {
  const rTex = fracTex(p, q);
  add(
    'ser',
    SER,
    `Does $\\sum_{n=0}^{\\infty} \\left(${rTex}\\right)^{n}$ converge?`,
    'No, it diverges',
    ['Yes, it converges to a finite sum', 'Yes, to $0$', 'Yes, to $1$'],
    `Since $\\left|${rTex}\\right| \\ge 1$, the terms do not shrink to $0$, so the series diverges by the n-th term test.`,
    2,
  );
}

// Repeating decimals as geometric series:  0.\overline{d} = d/9.
for (const d of [1, 2, 4, 5, 7, 8]) {
  add(
    'ser',
    SER,
    `Express the repeating decimal $0.\\overline{${d}}$ as a fraction.`,
    wrap(fracTex(d, 9)),
    [wrap(fracTex(d, 10)), wrap(fracTex(d, 11)), wrap(fracTex(d, 90)), wrap(fracTex(d, 99))],
    `$0.\\overline{${d}} = \\sum_{n=1}^{\\infty} \\dfrac{${d}}{10^{n}} = \\dfrac{${d}/10}{1 - 1/10} = ${fracTex(d, 9)}$.`,
    3,
  );
}

// Geometric / series concepts.
runSpecs('ser', SER, [
  {
    prompt: 'A geometric series $\\sum_{n=0}^{\\infty} a r^{n}$ converges if and only if:',
    correct: '$|r| < 1$',
    distractors: ['$|r| > 1$', '$r > 0$', '$a \\ne 0$'],
    explanation: 'Convergence of a geometric series depends only on $|r| < 1$.',
    difficulty: 2,
  },
  {
    prompt: 'For $|r| < 1$, the sum $\\sum_{n=0}^{\\infty} a r^{n}$ equals:',
    correct: '$\\dfrac{a}{1 - r}$',
    distractors: ['$\\dfrac{a}{1 + r}$', '$\\dfrac{1}{1 - r}$', '$\\dfrac{a r}{1 - r}$'],
    explanation: 'The closed form is first term over $1$ minus the ratio: $\\dfrac{a}{1 - r}$.',
    difficulty: 2,
  },
  {
    prompt: 'The partial sum $S_N = \\sum_{n=0}^{N} a r^{n}$ (for $r \\ne 1$) equals:',
    correct: '$a\\dfrac{1 - r^{N+1}}{1 - r}$',
    distractors: ['$a\\dfrac{1 - r^{N}}{1 - r}$', '$\\dfrac{a}{1 - r}$', '$a(1 - r^{N+1})$'],
    explanation: 'The finite geometric sum formula is $a\\dfrac{1 - r^{N+1}}{1 - r}$.',
    difficulty: 2,
  },
  {
    prompt: 'An infinite series $\\sum a_n$ converges when:',
    correct: 'its sequence of partial sums converges',
    distractors: ['its terms are positive', 'its terms decrease', 'it is alternating'],
    explanation: 'Convergence of a series is defined as convergence of the partial sums $S_N$.',
    difficulty: 1,
  },
  {
    prompt: 'The n-th term test says that if $\\lim_{n \\to \\infty} a_n \\ne 0$, then $\\sum a_n$:',
    correct: 'diverges',
    distractors: ['converges', 'converges conditionally', 'sums to $0$'],
    explanation: 'If the terms do not shrink to $0$, the series cannot converge.',
    difficulty: 2,
  },
  {
    prompt: 'If $\\lim_{n \\to \\infty} a_n = 0$, the n-th term test tells us the series $\\sum a_n$:',
    correct: 'may converge or diverge (the test is inconclusive)',
    distractors: ['definitely converges', 'definitely diverges', 'sums to $0$'],
    explanation: 'Terms tending to $0$ is necessary but not sufficient; the test gives no conclusion.',
    difficulty: 2,
  },
]);

// ===========================================================================
// TOPIC: Integral and Comparison Tests
// ===========================================================================
const ICT = 'Integral and Comparison Tests';

// p-series convergence sweep.
const pValues: Array<[number, number]> = [
  [2, 1],
  [3, 1],
  [1, 1],
  [1, 2],
  [3, 2],
  [1, 3],
  [4, 1],
  [5, 1],
  [2, 3],
  [5, 2],
  [7, 2],
  [1, 4],
  [4, 3],
  [3, 4],
];
for (const [pn, pd] of pValues) {
  const pTex = fracTex(pn, pd);
  const converges = pn / pd > 1;
  add(
    'ict',
    ICT,
    `Does the $p$-series $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{${pTex}}}$ converge?`,
    converges ? 'Yes, it converges' : 'No, it diverges',
    ['It converges only conditionally', 'It cannot be determined', converges ? 'No, it diverges' : 'Yes, it converges'],
    `A $p$-series converges exactly when $p > 1$. Here $p = ${pTex}$, so the series ${converges ? 'converges' : 'diverges'}.`,
    2,
  );
}

// n-th term test on rational terms whose limit is nonzero.
const divRational: Array<[number, number, number, number]> = [
  [1, 0, 2, 1],
  [3, 1, 1, 5],
  [2, 3, 5, 1],
  [4, 1, 3, 2],
  [5, 2, 2, 7],
  [1, 4, 6, 1],
  [7, 1, 3, 4],
  [2, 5, 9, 2],
];
for (const [a, b, c, d] of divRational) {
  const bTerm = b === 0 ? '' : ` + ${b}`;
  add(
    'ict',
    ICT,
    `What does the n-th term test say about $\\sum_{n=1}^{\\infty} \\dfrac{${a}n${bTerm}}{${c}n + ${d}}$?`,
    `It diverges, since the terms approach $${fracTex(a, c)} \\ne 0$`,
    [`It converges to $${fracTex(a, c)}$`, 'The test is inconclusive', 'It converges to $0$'],
    `The terms tend to $\\dfrac{${a}}{${c}} = ${fracTex(a, c)} \\ne 0$, so the series diverges.`,
    2,
  );
}

// n-th term test inconclusive (terms tend to 0).
for (const k of [1, 2, 3]) {
  add(
    'ict',
    ICT,
    `The terms of $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{${k}}}$ tend to $0$. What does the n-th term test conclude?`,
    'Nothing; the test is inconclusive',
    ['The series converges', 'The series diverges', 'The series sums to $0$'],
    'When the terms tend to $0$, the n-th term test gives no conclusion; another test is required.',
    2,
  );
}

// Integral Test applications and conditions.
runSpecs('ict', ICT, [
  {
    prompt: 'The Integral Test compares $\\sum_{n=1}^{\\infty} a_n$ (with $a_n = f(n)$) to which quantity?',
    correct: '$\\int_{1}^{\\infty} f(x)\\,dx$',
    distractors: ['$\\int_{0}^{1} f(x)\\,dx$', '$f\'(x)$', '$\\lim_{n \\to \\infty} f(n)$'],
    explanation: 'The Integral Test ties the series to the improper integral $\\int_{1}^{\\infty} f(x)\\,dx$.',
    difficulty: 2,
  },
  {
    prompt: 'To apply the Integral Test, $f$ must be (for large $x$):',
    correct: 'continuous, positive, and decreasing',
    distractors: ['continuous and increasing', 'negative and decreasing', 'merely bounded'],
    explanation: 'The Integral Test requires $f$ continuous, positive, and eventually decreasing.',
    difficulty: 2,
  },
  {
    prompt: 'By the Integral Test, $\\sum_{n=2}^{\\infty} \\dfrac{1}{n \\ln n}$:',
    correct: 'diverges',
    distractors: ['converges', 'converges conditionally', 'sums to $1$'],
    explanation: '$\\int_{2}^{\\infty} \\dfrac{dx}{x \\ln x} = \\ln(\\ln x)\\big|_{2}^{\\infty} = \\infty$, so the series diverges.',
    difficulty: 4,
  },
  {
    prompt: 'By the Integral Test, $\\sum_{n=2}^{\\infty} \\dfrac{1}{n (\\ln n)^{2}}$:',
    correct: 'converges',
    distractors: ['diverges', 'converges only conditionally', 'sums to $0$'],
    explanation: '$\\int_{2}^{\\infty} \\dfrac{dx}{x (\\ln x)^{2}} = \\dfrac{1}{\\ln 2}$ is finite, so the series converges.',
    difficulty: 4,
  },
  {
    prompt: 'By the Integral Test, $\\sum_{n=1}^{\\infty} n e^{-n^{2}}$:',
    correct: 'converges',
    distractors: ['diverges', 'oscillates', 'sums to $1$'],
    explanation: '$\\int_{1}^{\\infty} x e^{-x^{2}}\\,dx = \\dfrac{1}{2} e^{-1}$ is finite, so the series converges.',
    difficulty: 3,
  },
  {
    prompt: 'The harmonic series $\\sum_{n=1}^{\\infty} \\dfrac{1}{n}$:',
    correct: 'diverges',
    distractors: ['converges to $1$', 'converges to $\\ln 2$', 'converges to $e$'],
    explanation: 'It is the $p = 1$ case; the integral $\\int_{1}^{\\infty} \\dfrac{dx}{x} = \\infty$, so it diverges.',
    difficulty: 2,
  },
]);

// Specific integral-test convergence.
runSpecs('ict', ICT, [
  {
    prompt: 'By the Integral Test, $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{2} + 1}$:',
    correct: 'converges',
    distractors: ['diverges', 'oscillates', 'sums to $0$'],
    explanation: '$\\int_{1}^{\\infty} \\dfrac{dx}{x^{2}+1} = \\dfrac{\\pi}{4}$ is finite, so the series converges.',
    difficulty: 3,
  },
  {
    prompt: 'By the Integral Test, $\\sum_{n=1}^{\\infty} \\dfrac{n}{n^{2} + 1}$:',
    correct: 'diverges',
    distractors: ['converges', 'converges conditionally', 'sums to $1$'],
    explanation: '$\\int_{1}^{\\infty} \\dfrac{x}{x^{2}+1}\\,dx = \\tfrac{1}{2}\\ln(x^{2}+1) \\to \\infty$, so it diverges.',
    difficulty: 3,
  },
]);

// Direct comparison: choose the comparison series for 1/(n^k + c).
for (const k of [2, 3, 4]) {
  for (const c of [1, 3, 5, 7]) {
    add(
      'ict',
      ICT,
      `The series $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{${k}} + ${c}}$ converges. Which comparison proves it?`,
      `Compare with $\\sum \\dfrac{1}{n^{${k}}}$, a convergent $p$-series`,
      [
        'Compare with $\\sum \\dfrac{1}{n}$, the harmonic series',
        'Compare with $\\sum 2^{n}$',
        'Compare with $\\sum n$',
      ],
      `Since $\\dfrac{1}{n^{${k}} + ${c}} < \\dfrac{1}{n^{${k}}}$ and $\\sum \\dfrac{1}{n^{${k}}}$ converges ($p = ${k} > 1$), the series converges.`,
      3,
    );
  }
}

// Direct comparison for divergent 1/(a n + b) ~ harmonic.
for (const [a, b] of [[2, 1], [3, 2], [1, 5], [4, 1], [5, 3], [2, 7]] as Array<[number, number]>) {
  add(
    'ict',
    ICT,
    `Which comparison shows $\\sum_{n=1}^{\\infty} \\dfrac{1}{${a}n + ${b}}$ diverges?`,
    'Compare with $\\sum \\dfrac{1}{n}$, the divergent harmonic series',
    ['Compare with $\\sum \\dfrac{1}{n^{2}}$, a convergent $p$-series', 'Compare with $\\sum 2^{-n}$', 'Compare with $\\sum 1$'],
    `For $n \\ge 1$, $\\dfrac{1}{${a}n + ${b}} \\ge \\dfrac{1}{${a + b}n}$, a multiple of the harmonic series, so the series diverges.`,
    3,
  );
}

// Limit Comparison Test computations:  a_n / b_n -> ratio of leading coefficients.
const lctCases: Array<{ prompt: string; ratio: [number, number]; expl: string }> = [
  { prompt: '$a_n = \\dfrac{2n + 3}{n^{3} + 1}$, $b_n = \\dfrac{1}{n^{2}}$', ratio: [2, 1], expl: '$\\dfrac{2n}{n^{3}} = \\dfrac{2}{n^{2}}$' },
  { prompt: '$a_n = \\dfrac{5n + 1}{n^{2} + 4}$, $b_n = \\dfrac{1}{n}$', ratio: [5, 1], expl: '$\\dfrac{5n}{n^{2}} = \\dfrac{5}{n}$' },
  { prompt: '$a_n = \\dfrac{3n^{2} + n}{n^{4} + 2}$, $b_n = \\dfrac{1}{n^{2}}$', ratio: [3, 1], expl: '$\\dfrac{3n^{2}}{n^{4}} = \\dfrac{3}{n^{2}}$' },
  { prompt: '$a_n = \\dfrac{n + 2}{2n^{3} + n}$, $b_n = \\dfrac{1}{n^{2}}$', ratio: [1, 2], expl: '$\\dfrac{n}{2n^{3}} = \\dfrac{1}{2n^{2}}$' },
  { prompt: '$a_n = \\dfrac{4n^{2} + 1}{n^{3} + n}$, $b_n = \\dfrac{1}{n}$', ratio: [4, 1], expl: '$\\dfrac{4n^{2}}{n^{3}} = \\dfrac{4}{n}$' },
  { prompt: '$a_n = \\dfrac{7n + 2}{n^{2} + 1}$, $b_n = \\dfrac{1}{n}$', ratio: [7, 1], expl: '$\\dfrac{7n}{n^{2}} = \\dfrac{7}{n}$' },
];
for (const lc of lctCases) {
  add(
    'ict',
    ICT,
    `Limit Comparison Test: evaluate $\\lim_{n \\to \\infty} \\dfrac{a_n}{b_n}$ where ${lc.prompt}.`,
    wrap(fracTex(lc.ratio[0], lc.ratio[1])),
    [wrap(fracTex(lc.ratio[1], lc.ratio[0])), '$0$', '$\\infty$', '$1$'],
    `Comparing leading behavior ${lc.expl} gives the limit $${fracTex(lc.ratio[0], lc.ratio[1])}$, a finite positive number.`,
    3,
  );
}

// Comparison conclusion logic.
runSpecs('ict', ICT, [
  {
    prompt: 'If $\\lim \\dfrac{a_n}{b_n}$ is finite and positive and $\\sum b_n$ converges, then $\\sum a_n$:',
    correct: 'also converges',
    distractors: ['also diverges', 'may converge or diverge', 'sums to $0$'],
    explanation: 'A finite positive limit means the two positive series share the same fate.',
    difficulty: 2,
  },
  {
    prompt: 'If $\\lim \\dfrac{a_n}{b_n}$ is finite and positive and $\\sum b_n$ diverges, then $\\sum a_n$:',
    correct: 'also diverges',
    distractors: ['also converges', 'is inconclusive', 'sums to $1$'],
    explanation: 'With a finite positive ratio limit, both series converge or both diverge.',
    difficulty: 2,
  },
  {
    prompt: 'For the Direct Comparison Test with $0 \\le a_n \\le b_n$, if $\\sum b_n$ converges then $\\sum a_n$:',
    correct: 'converges',
    distractors: ['diverges', 'is inconclusive', 'oscillates'],
    explanation: 'A nonnegative series bounded above by a convergent series converges.',
    difficulty: 2,
  },
  {
    prompt: 'For the Direct Comparison Test with $a_n \\ge b_n \\ge 0$, if $\\sum b_n$ diverges then $\\sum a_n$:',
    correct: 'diverges',
    distractors: ['converges', 'is inconclusive', 'sums to $0$'],
    explanation: 'A series larger than a divergent nonnegative series also diverges.',
    difficulty: 2,
  },
  {
    prompt: 'The Limit Comparison Test (standard form) requires the compared series to have:',
    correct: 'positive terms',
    distractors: ['alternating signs', 'finitely many terms', 'a common ratio'],
    explanation: 'The standard Limit Comparison Test applies to series with positive terms.',
    difficulty: 2,
  },
  {
    prompt: 'A natural comparison series for $\\sum \\dfrac{3n + 1}{n^{3} + 2}$ is:',
    correct: '$\\sum \\dfrac{1}{n^{2}}$',
    distractors: ['$\\sum \\dfrac{1}{n}$', '$\\sum \\dfrac{1}{n^{3}}$', '$\\sum 1$'],
    explanation: 'The terms behave like $\\dfrac{3n}{n^{3}} = \\dfrac{3}{n^{2}}$, so compare with $\\sum \\dfrac{1}{n^{2}}$.',
    difficulty: 3,
  },
]);

// Decide convergence by comparison.
runSpecs('ict', ICT, [
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{2} + n}$ converge?', correct: 'Yes', distractors: ['No', 'Only conditionally', 'It oscillates'], explanation: 'It is dominated by $\\sum \\dfrac{1}{n^{2}}$, which converges.', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{1}{n + \\sqrt{n}}$ converge?', correct: 'No', distractors: ['Yes', 'Only conditionally', 'It oscillates'], explanation: 'For large $n$ it behaves like $\\dfrac{1}{n}$, so it diverges by comparison with the harmonic series.', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{\\sin^{2} n}{n^{2}}$ converge?', correct: 'Yes', distractors: ['No', 'Only conditionally', 'It diverges'], explanation: 'Since $\\dfrac{\\sin^{2} n}{n^{2}} \\le \\dfrac{1}{n^{2}}$, comparison with the convergent $p$-series gives convergence.', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{1}{3^{n} + 1}$ converge?', correct: 'Yes', distractors: ['No', 'Only conditionally', 'It oscillates'], explanation: 'It is bounded above by the convergent geometric series $\\sum 3^{-n}$.', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{n}{n^{3} + 1}$ converge?', correct: 'Yes', distractors: ['No', 'Only conditionally', 'It diverges'], explanation: 'The terms behave like $\\dfrac{1}{n^{2}}$, so the series converges.', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=2}^{\\infty} \\dfrac{1}{\\ln n}$ converge?', correct: 'No', distractors: ['Yes', 'Only conditionally', 'It oscillates'], explanation: 'Since $\\dfrac{1}{\\ln n} > \\dfrac{1}{n}$ for large $n$, comparison with the harmonic series gives divergence.', difficulty: 4 },
  { prompt: 'Does $\\sum_{n=2}^{\\infty} \\dfrac{1}{n^{2} - 1}$ converge?', correct: 'Yes', distractors: ['No', 'Only conditionally', 'It diverges'], explanation: 'For large $n$ it behaves like $\\dfrac{1}{n^{2}}$, so it converges.', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{2^{n}}{3^{n} + 1}$ converge?', correct: 'Yes', distractors: ['No', 'Only conditionally', 'It oscillates'], explanation: 'It is bounded above by $\\left(\\tfrac{2}{3}\\right)^{n}$, a convergent geometric series.', difficulty: 3 },
]);

// ===========================================================================
// TOPIC: Ratio and Root Tests
// ===========================================================================
const RAT = 'Ratio and Root Tests';

// Ratio test on n^k / c^n  ->  L = 1/c.
for (const k of [1, 2]) {
  for (const c of [2, 3, 4, 5]) {
    const numer = k === 1 ? 'n' : `n^{${k}}`;
    add(
      'rat',
      RAT,
      `Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\dfrac{${numer}}{${c}^{n}}$. Find $L = \\lim \\left|\\dfrac{a_{n+1}}{a_n}\\right|$.`,
      wrap(fracTex(1, c)),
      [wrap(fracTex(1, c + 1)), `$${c}$`, '$1$', '$0$'],
      `$\\dfrac{a_{n+1}}{a_n} = \\left(\\dfrac{n+1}{n}\\right)^{${k}} \\cdot \\dfrac{1}{${c}} \\to \\dfrac{1}{${c}}$, so $L = ${fracTex(1, c)} < 1$ and the series converges.`,
      3,
    );
  }
}

// Ratio test on c^n / n!  ->  0.
for (const c of [1, 2, 3, 5, 4, 6]) {
  add(
    'rat',
    RAT,
    `Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\dfrac{${c}^{n}}{n!}$. Find $L$.`,
    '$0$',
    ['$1$', '$\\infty$', `$${c}$`],
    `$\\dfrac{a_{n+1}}{a_n} = \\dfrac{${c}}{n+1} \\to 0$, so $L = 0 < 1$ and the series converges.`,
    3,
  );
}

// Ratio test on n! / c^n  ->  infinity.
for (const c of [2, 3, 5, 4]) {
  add(
    'rat',
    RAT,
    `Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\dfrac{n!}{${c}^{n}}$. Find $L$.`,
    '$\\infty$',
    ['$0$', '$1$', wrap(fracTex(1, c))],
    `$\\dfrac{a_{n+1}}{a_n} = \\dfrac{n+1}{${c}} \\to \\infty$, so $L = \\infty > 1$ and the series diverges.`,
    3,
  );
}

// Geometric series via the ratio test: L = |r|.
for (const [p, q] of [[1, 2], [2, 3], [3, 4], [1, 5], [4, 5]] as Array<[number, number]>) {
  add(
    'rat',
    RAT,
    `Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\left(${fracTex(p, q)}\\right)^{n}$. Find $L$.`,
    wrap(fracTex(p, q)),
    [wrap(fracTex(q, p)), '$1$', '$0$', '$\\infty$'],
    `Each ratio equals $${fracTex(p, q)}$, so $L = ${fracTex(p, q)} < 1$ and the series converges.`,
    2,
  );
}

// Notable ratio limits.
runSpecs('rat', RAT, [
  {
    prompt: 'Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\dfrac{n!}{n^{n}}$. The limit $L$ is:',
    correct: '$\\dfrac{1}{e}$',
    distractors: ['$e$', '$1$', '$0$'],
    explanation: '$\\dfrac{a_{n+1}}{a_n} = \\left(\\dfrac{n}{n+1}\\right)^{n} \\to \\dfrac{1}{e} < 1$, so the series converges.',
    difficulty: 4,
  },
  {
    prompt: 'Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\dfrac{(2n)!}{(n!)^{2}}$. The limit $L$ is:',
    correct: '$4$',
    distractors: ['$2$', '$1$', '$\\dfrac{1}{4}$'],
    explanation: '$\\dfrac{a_{n+1}}{a_n} = \\dfrac{(2n+2)(2n+1)}{(n+1)^{2}} \\to 4 > 1$, so the series diverges.',
    difficulty: 4,
  },
  {
    prompt: 'Apply the Ratio Test to $\\sum_{n=1}^{\\infty} \\dfrac{(n!)^{2}}{(2n)!}$. The limit $L$ is:',
    correct: '$\\dfrac{1}{4}$',
    distractors: ['$4$', '$1$', '$\\dfrac{1}{2}$'],
    explanation: 'This is the reciprocal of the previous limit, so $L = \\dfrac{1}{4} < 1$ and it converges.',
    difficulty: 4,
  },
]);

// Root test on ((a n + 1)/(b n + 2))^n  ->  L = a/b.
for (const [a, b] of [[1, 2], [1, 3], [2, 3], [3, 2], [4, 3], [2, 5], [5, 4], [3, 4]] as Array<[number, number]>) {
  const correctConv = a < b;
  add(
    'rat',
    RAT,
    `Apply the Root Test to $\\sum_{n=1}^{\\infty} \\left(\\dfrac{${a}n + 1}{${b}n + 2}\\right)^{n}$. Find $L = \\lim \\sqrt[n]{|a_n|}$.`,
    wrap(fracTex(a, b)),
    [wrap(fracTex(b, a)), '$1$', '$0$', '$\\infty$'],
    `$\\sqrt[n]{|a_n|} = \\dfrac{${a}n + 1}{${b}n + 2} \\to ${fracTex(a, b)}$, so $L = ${fracTex(a, b)}$ and the series ${correctConv ? 'converges' : 'diverges'}.`,
    3,
  );
}

// Conclusion from a given value of L.
for (const [pn, pd] of [[1, 2], [2, 1], [1, 1], [3, 4], [5, 4], [1, 3], [7, 1]] as Array<[number, number]>) {
  const LTex = fracTex(pn, pd);
  const val = pn / pd;
  const correct = val < 1 ? 'Converges absolutely' : val > 1 ? 'Diverges' : 'The test is inconclusive';
  const distractors = ['Converges absolutely', 'Diverges', 'The test is inconclusive', 'Converges conditionally'].filter((x) => x !== correct);
  const conclusionDifficulty = val === 1 ? 3 : 2;
  add(
    'rat',
    RAT,
    `A series has Ratio Test limit $L = ${LTex}$. What can you conclude?`,
    correct,
    distractors,
    val < 1
      ? `Since $L = ${LTex} < 1$, the Ratio Test gives absolute convergence.`
      : val > 1
        ? `Since $L = ${LTex} > 1$, the Ratio Test gives divergence.`
        : 'When $L = 1$, the Ratio Test is inconclusive and another test is needed.',
    conclusionDifficulty,
  );
}

// Ratio / root test concepts.
runSpecs('rat', RAT, [
  {
    prompt: 'The Ratio Test gives absolute convergence when $L$ satisfies:',
    correct: '$L < 1$',
    distractors: ['$L > 1$', '$L = 1$', '$L = 0$ only'],
    explanation: 'Absolute convergence follows when $L < 1$.',
    difficulty: 2,
  },
  {
    prompt: 'The Ratio Test gives divergence when:',
    correct: '$L > 1$',
    distractors: ['$L < 1$', '$L = 1$', '$L = 0$'],
    explanation: 'When $L > 1$ (including $\\infty$), the series diverges.',
    difficulty: 2,
  },
  {
    prompt: 'The Root Test examines which limit?',
    correct: '$\\lim_{n \\to \\infty} \\sqrt[n]{|a_n|}$',
    distractors: ['$\\lim_{n \\to \\infty} |a_n|$', '$\\lim_{n \\to \\infty} \\dfrac{a_{n+1}}{a_n}$', '$\\lim_{n \\to \\infty} n a_n$'],
    explanation: 'The Root Test uses $L = \\lim \\sqrt[n]{|a_n|}$.',
    difficulty: 2,
  },
  {
    prompt: 'Both the Ratio and Root Tests are inconclusive when:',
    correct: '$L = 1$',
    distractors: ['$L = 0$', '$L < 1$', '$L > 1$'],
    explanation: 'At $L = 1$ neither test decides convergence.',
    difficulty: 2,
  },
  {
    prompt: 'The Ratio Test is especially effective for series containing:',
    correct: 'factorials and exponentials',
    distractors: ['only logarithms', 'only constants', 'only linear terms'],
    explanation: 'Factorials and powers simplify cleanly in the ratio $a_{n+1}/a_n$.',
    difficulty: 2,
  },
  {
    prompt: 'Applying the Ratio Test to $\\sum \\dfrac{1}{n}$ and $\\sum \\dfrac{1}{n^{2}}$ gives $L =$:',
    correct: '$1$ for both (inconclusive)',
    distractors: ['$0$ for both', '$\\tfrac{1}{2}$ for both', 'different values'],
    explanation: 'Both give $L = 1$, showing the Ratio Test cannot distinguish these $p$-series.',
    difficulty: 3,
  },
]);

// Ratio test verdict identification.
runSpecs('rat', RAT, [
  { prompt: 'By the Ratio Test, $\\sum_{n=1}^{\\infty} \\dfrac{3^{n}}{n!}$:', correct: 'converges ($L = 0$)', distractors: ['diverges ($L = \\infty$)', 'is inconclusive ($L = 1$)', 'diverges ($L = 3$)'], explanation: '$\\dfrac{a_{n+1}}{a_n} = \\dfrac{3}{n+1} \\to 0 < 1$.', difficulty: 3 },
  { prompt: 'By the Ratio Test, $\\sum_{n=1}^{\\infty} \\dfrac{n^{2}}{n!}$:', correct: 'converges ($L = 0$)', distractors: ['diverges ($L = \\infty$)', 'is inconclusive ($L = 1$)', 'converges ($L = \\tfrac{1}{2}$)'], explanation: '$\\dfrac{a_{n+1}}{a_n} = \\dfrac{(n+1)}{n^{2}} \\to 0 < 1$.', difficulty: 3 },
  { prompt: 'By the Ratio Test, $\\sum_{n=1}^{\\infty} \\dfrac{2^{n}}{n^{3}}$:', correct: 'diverges ($L = 2$)', distractors: ['converges ($L = \\tfrac{1}{2}$)', 'is inconclusive ($L = 1$)', 'converges ($L = 0$)'], explanation: '$\\dfrac{a_{n+1}}{a_n} = 2\\left(\\dfrac{n}{n+1}\\right)^{3} \\to 2 > 1$.', difficulty: 3 },
  { prompt: 'By the Ratio Test, $\\sum_{n=1}^{\\infty} \\dfrac{n!}{10^{n}}$:', correct: 'diverges ($L = \\infty$)', distractors: ['converges ($L = 0$)', 'is inconclusive ($L = 1$)', 'converges ($L = \\tfrac{1}{10}$)'], explanation: '$\\dfrac{a_{n+1}}{a_n} = \\dfrac{n+1}{10} \\to \\infty > 1$.', difficulty: 3 },
  { prompt: 'By the Ratio Test, $\\sum_{n=1}^{\\infty} \\dfrac{n^{10}}{2^{n}}$:', correct: 'converges ($L = \\tfrac{1}{2}$)', distractors: ['diverges ($L = 2$)', 'is inconclusive ($L = 1$)', 'diverges ($L = \\infty$)'], explanation: '$\\dfrac{a_{n+1}}{a_n} = \\dfrac{1}{2}\\left(\\dfrac{n+1}{n}\\right)^{10} \\to \\dfrac{1}{2} < 1$.', difficulty: 3 },
  { prompt: 'By the Ratio Test, $\\sum_{n=1}^{\\infty} \\dfrac{2^{n}}{n!}$:', correct: 'converges ($L = 0$)', distractors: ['diverges ($L = \\infty$)', 'is inconclusive ($L = 1$)', 'diverges ($L = 2$)'], explanation: '$\\dfrac{a_{n+1}}{a_n} = \\dfrac{2}{n+1} \\to 0 < 1$.', difficulty: 3 },
]);

// ===========================================================================
// TOPIC: Alternating Series and Absolute Convergence
// ===========================================================================
const ALT = 'Alternating Series and Absolute Convergence';

// Alternating Series Test applicability for (-1)^n / n^p.
for (const [pn, pd] of [[1, 1], [2, 1], [1, 2], [3, 1], [1, 3], [3, 2]] as Array<[number, number]>) {
  const pTex = fracTex(pn, pd);
  add(
    'alt',
    ALT,
    `Does $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n}}{n^{${pTex}}}$ converge by the Alternating Series Test?`,
    'Yes; the terms decrease to $0$',
    ['No; the terms do not tend to $0$', 'No; the test never applies here', 'Only after taking absolute values'],
    `Since $p = ${pTex} > 0$, the sizes $\\dfrac{1}{n^{${pTex}}}$ decrease monotonically to $0$, so the test gives convergence.`,
    3,
  );
}

// AST fails (terms do not tend to 0).
runSpecs('alt', ALT, [
  {
    prompt: 'Does $\\sum_{n=1}^{\\infty} (-1)^{n} \\dfrac{n}{n + 1}$ converge?',
    correct: 'No; the terms do not tend to $0$',
    distractors: ['Yes, by the Alternating Series Test', 'Yes, absolutely', 'Yes, conditionally'],
    explanation: 'Here $\\dfrac{n}{n+1} \\to 1 \\ne 0$, so by the n-th term test the series diverges.',
    difficulty: 3,
  },
  {
    prompt: 'Does $\\sum_{n=1}^{\\infty} (-1)^{n} \\dfrac{2n + 1}{3n + 2}$ converge?',
    correct: 'No; the terms do not tend to $0$',
    distractors: ['Yes, by the Alternating Series Test', 'Yes, absolutely', 'Yes, conditionally'],
    explanation: 'The term size tends to $\\dfrac{2}{3} \\ne 0$, so the series diverges.',
    difficulty: 3,
  },
]);

// Absolute vs conditional classification for (-1)^n / n^p.
for (const [pn, pd] of [[2, 1], [1, 1], [1, 2], [3, 1], [3, 2], [1, 3], [4, 1], [2, 3]] as Array<[number, number]>) {
  const pTex = fracTex(pn, pd);
  const p = pn / pd;
  const correct = p > 1 ? 'Absolutely convergent' : 'Conditionally convergent';
  add(
    'alt',
    ALT,
    `Classify $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n}}{n^{${pTex}}}$.`,
    correct,
    ['Divergent', 'Geometric', p > 1 ? 'Conditionally convergent' : 'Absolutely convergent'],
    p > 1
      ? `The absolute series $\\sum \\dfrac{1}{n^{${pTex}}}$ converges ($p = ${pTex} > 1$), so the series converges absolutely.`
      : `The series converges by the Alternating Series Test, but $\\sum \\dfrac{1}{n^{${pTex}}}$ diverges ($p = ${pTex} \\le 1$), so it is conditionally convergent.`,
    4,
  );
}

// Alternating series remainder bound for the alternating harmonic series.
for (const N of [3, 4, 5, 9, 10, 99]) {
  add(
    'alt',
    ALT,
    `For $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1}}{n}$, the error after summing the first $${N}$ terms is at most:`,
    wrap(fracTex(1, N + 1)),
    [wrap(fracTex(1, N)), wrap(fracTex(1, N + 2)), wrap(fracTex(1, 2 * N))],
    `The remainder is bounded by the first omitted term $b_{${N + 1}} = \\dfrac{1}{${N + 1}}$.`,
    4,
  );
}

// Alternating series remainder bound for 1/n^2.
for (const N of [2, 3, 4, 5, 9]) {
  add(
    'alt',
    ALT,
    `For $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1}}{n^{2}}$, the error after the first $${N}$ terms is at most:`,
    wrap(fracTex(1, (N + 1) * (N + 1))),
    [wrap(fracTex(1, N * N)), wrap(fracTex(1, N + 1)), wrap(fracTex(1, (N + 2) * (N + 2)))],
    `The remainder is bounded by the first omitted term $b_{${N + 1}} = \\dfrac{1}{(${N + 1})^{2}} = ${fracTex(1, (N + 1) * (N + 1))}$.`,
    4,
  );
}

// Alternating-series facts.
runSpecs('alt', ALT, [
  {
    prompt: 'An alternating series has the form:',
    correct: '$\\sum (-1)^{n} b_n$ with $b_n > 0$',
    distractors: ['$\\sum b_n$ with $b_n > 0$', '$\\sum n b_n$', '$\\sum b_n^{n}$'],
    explanation: 'Alternating series flip sign each term: $\\sum (-1)^{n} b_n$ with $b_n > 0$.',
    difficulty: 1,
  },
  {
    prompt: 'The Alternating Series Test requires the sizes $b_n$ to:',
    correct: 'decrease monotonically to $0$',
    distractors: ['increase to $\\infty$', 'be constant', 'tend to $1$'],
    explanation: 'Convergence needs $b_n$ decreasing to $0$.',
    difficulty: 2,
  },
  {
    prompt: 'If $\\sum |a_n|$ converges, then $\\sum a_n$ is:',
    correct: 'absolutely convergent',
    distractors: ['conditionally convergent', 'divergent', 'geometric'],
    explanation: 'Convergence of the absolute series is the definition of absolute convergence.',
    difficulty: 2,
  },
  {
    prompt: 'Rearranging a conditionally convergent series can:',
    correct: 'change its sum',
    distractors: ['never change its sum', 'make it diverge to $0$', 'make it geometric'],
    explanation: 'A conditionally convergent series can be rearranged to give a different sum.',
    difficulty: 3,
  },
  {
    prompt: 'The alternating harmonic series $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1}}{n}$ converges to:',
    correct: '$\\ln 2$',
    distractors: ['$1$', '$e$', '$\\dfrac{\\pi}{4}$'],
    explanation: 'Its sum is the well-known value $\\ln 2$.',
    difficulty: 2,
  },
  {
    prompt: 'The series $1 - 1 + 1 - 1 + \\cdots = \\sum_{n=0}^{\\infty} (-1)^{n}$:',
    correct: 'diverges (partial sums oscillate)',
    distractors: ['converges to $0$', 'converges to $\\tfrac{1}{2}$', 'converges to $1$'],
    explanation: 'The partial sums alternate between $1$ and $0$, so the series diverges.',
    difficulty: 2,
  },
]);

// Alternating geometric sums:  sum (-r)^n = 1/(1+r) = q/(q+p).
for (const [p, q] of [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [1, 5], [4, 5], [2, 7]] as Array<[number, number]>) {
  const rTex = fracTex(p, q);
  add(
    'alt',
    ALT,
    `Evaluate the alternating geometric series $\\sum_{n=0}^{\\infty} \\left(-${rTex}\\right)^{n}$.`,
    wrap(fracTex(q, q + p)),
    [wrap(fracTex(q, q - p)), wrap(fracTex(p, q + p)), wrap(fracTex(q, p))],
    `With ratio $r = -${rTex}$, the sum is $\\dfrac{1}{1 - r} = \\dfrac{1}{1 + ${rTex}} = ${fracTex(q, q + p)}$.`,
    3,
  );
}

// Additional AST decisions and known sums.
runSpecs('alt', ALT, [
  { prompt: 'Does $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n}}{2n - 1}$ converge?', correct: 'Yes; the sizes decrease to $0$', distractors: ['No; the terms do not tend to $0$', 'No; the test never applies', 'Only after taking absolute values'], explanation: 'The sizes $\\dfrac{1}{2n-1}$ decrease to $0$, so the test applies (the sum relates to $\\dfrac{\\pi}{4}$).', difficulty: 3 },
  { prompt: 'Does $\\sum_{n=2}^{\\infty} \\dfrac{(-1)^{n}}{\\ln n}$ converge?', correct: 'Yes; the sizes decrease to $0$', distractors: ['No; the terms do not tend to $0$', 'No; it diverges absolutely', 'Only after taking absolute values'], explanation: '$\\dfrac{1}{\\ln n}$ decreases to $0$, so the test gives (conditional) convergence.', difficulty: 3 },
  { prompt: 'Classify $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n}}{n^{2} + 1}$.', correct: 'Absolutely convergent', distractors: ['Conditionally convergent', 'Divergent', 'Geometric'], explanation: 'Since $\\dfrac{1}{n^{2}+1} \\le \\dfrac{1}{n^{2}}$, the absolute series converges.', difficulty: 4 },
  { prompt: 'Classify $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n} n}{n^{2} + 1}$.', correct: 'Conditionally convergent', distractors: ['Absolutely convergent', 'Divergent', 'Geometric'], explanation: 'The sizes $\\sim \\dfrac{1}{n}$ decrease to $0$ (test converges), but the absolute series diverges like the harmonic series.', difficulty: 4 },
  { prompt: 'The series $\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n}}{2n + 1}$ converges to:', correct: '$\\dfrac{\\pi}{4}$', distractors: ['$\\ln 2$', '$\\dfrac{\\pi}{2}$', '$1$'], explanation: 'This is the alternating series for $\\arctan 1 = \\dfrac{\\pi}{4}$.', difficulty: 3 },
  { prompt: 'The series $\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n}}{n!}$ converges to:', correct: '$\\dfrac{1}{e}$', distractors: ['$e$', '$\\ln 2$', '$1$'], explanation: 'Substituting $x = -1$ into $e^{x} = \\sum \\dfrac{x^{n}}{n!}$ gives $e^{-1}$.', difficulty: 3 },
  { prompt: 'The alternating series remainder estimate bounds the error by:', correct: 'the first omitted term', distractors: ['the last included term', 'the sum of all omitted terms', 'zero'], explanation: 'For a convergent alternating series, $|S - S_N| \\le b_{N+1}$.', difficulty: 2 },
]);

// ===========================================================================
// TOPIC: Power Series
// ===========================================================================
const POW = 'Power Series';

// Radius for sum x^n / k^n  ->  R = k.
for (const k of [2, 3, 4, 5, 6, 7, 10]) {
  add(
    'pow',
    POW,
    `What is the radius of convergence of $\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{${k}^{n}}$?`,
    `$${k}$`,
    [wrap(fracTex(1, k)), `$${k * k}$`, '$1$', '$\\infty$'],
    `This is geometric with ratio $\\dfrac{x}{${k}}$; it converges when $\\left|\\dfrac{x}{${k}}\\right| < 1$, i.e. $|x| < ${k}$, so $R = ${k}$.`,
    3,
  );
}

// Radius for sum k^n x^n  ->  R = 1/k.
for (const k of [2, 3, 4, 5, 6]) {
  add(
    'pow',
    POW,
    `What is the radius of convergence of $\\sum_{n=0}^{\\infty} ${k}^{n} x^{n}$?`,
    wrap(fracTex(1, k)),
    [`$${k}$`, '$1$', '$\\infty$', '$0$'],
    `This is geometric with ratio $${k}x$; it converges when $|${k}x| < 1$, i.e. $|x| < \\dfrac{1}{${k}}$, so $R = ${fracTex(1, k)}$.`,
    3,
  );
}

// Radius for sum x^n / (k^n n)  ->  R = k (the polynomial factor does not change R).
for (const k of [2, 3, 5]) {
  add(
    'pow',
    POW,
    `What is the radius of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{${k}^{n}\\, n}$?`,
    `$${k}$`,
    [wrap(fracTex(1, k)), `$${k * k}$`, '$1$', '$\\infty$'],
    `The ratio test gives $\\left|\\dfrac{x}{${k}}\\right|\\cdot\\dfrac{n}{n+1} \\to \\dfrac{|x|}{${k}}$, so $R = ${k}$ (the factor $n$ does not change the radius).`,
    4,
  );
}

// Radius for sum n x^n / k^n  ->  R = k.
for (const k of [2, 4]) {
  add(
    'pow',
    POW,
    `What is the radius of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{n\\, x^{n}}{${k}^{n}}$?`,
    `$${k}$`,
    [wrap(fracTex(1, k)), `$${k * k}$`, '$1$', '$\\infty$'],
    `The ratio test gives $\\dfrac{n+1}{n}\\cdot\\dfrac{|x|}{${k}} \\to \\dfrac{|x|}{${k}}$, so $R = ${k}$.`,
    4,
  );
}

// "R = 1" power series.
runSpecs('pow', POW, [
  { prompt: 'Find the radius of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n}$.', correct: '$1$', distractors: ['$0$', '$\\infty$', '$2$'], explanation: 'The ratio test gives $\\dfrac{n}{n+1}|x| \\to |x|$, so $R = 1$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n^{2}}$.', correct: '$1$', distractors: ['$0$', '$\\infty$', '$2$'], explanation: 'The ratio test gives $\\left(\\dfrac{n}{n+1}\\right)^{2}|x| \\to |x|$, so $R = 1$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{\\sqrt{n}}$.', correct: '$1$', distractors: ['$0$', '$\\infty$', '$\\tfrac{1}{2}$'], explanation: 'The ratio test gives $\\sqrt{\\dfrac{n}{n+1}}\\,|x| \\to |x|$, so $R = 1$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=0}^{\\infty} n\\, x^{n}$.', correct: '$1$', distractors: ['$0$', '$\\infty$', '$2$'], explanation: 'The ratio test gives $\\dfrac{n+1}{n}|x| \\to |x|$, so $R = 1$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=0}^{\\infty} x^{n}$.', correct: '$1$', distractors: ['$0$', '$\\infty$', '$\\tfrac{1}{2}$'], explanation: 'This geometric series converges exactly when $|x| < 1$, so $R = 1$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n} x^{n}}{n}$.', correct: '$1$', distractors: ['$0$', '$\\infty$', '$2$'], explanation: 'The sign does not affect the ratio test; $R = 1$.', difficulty: 3 },
]);

// R = infinity and R = 0 power series.
runSpecs('pow', POW, [
  { prompt: 'Find the radius of convergence of $\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$.', correct: '$\\infty$', distractors: ['$1$', '$0$', '$e$'], explanation: 'The ratio $\\dfrac{|x|}{n+1} \\to 0$ for every $x$, so $R = \\infty$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{(2n)!}$.', correct: '$\\infty$', distractors: ['$1$', '$0$', '$2$'], explanation: 'The factorial denominator forces the ratio to $0$ for all $x$, so $R = \\infty$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=0}^{\\infty} \\dfrac{x^{2n}}{n!}$.', correct: '$\\infty$', distractors: ['$1$', '$0$', '$\\tfrac{1}{2}$'], explanation: 'This is the series for $e^{x^{2}}$, which converges for all $x$, so $R = \\infty$.', difficulty: 4 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=0}^{\\infty} n!\\, x^{n}$.', correct: '$0$', distractors: ['$1$', '$\\infty$', '$e$'], explanation: 'The ratio $(n+1)|x| \\to \\infty$ unless $x = 0$, so the series converges only at $x = 0$ and $R = 0$.', difficulty: 3 },
  { prompt: 'Find the radius of convergence of $\\sum_{n=1}^{\\infty} n^{n}\\, x^{n}$.', correct: '$0$', distractors: ['$1$', '$\\infty$', '$\\tfrac{1}{2}$'], explanation: 'Since $\\sqrt[n]{n^{n}\\,|x|^{n}} = n|x| \\to \\infty$ for $x \\ne 0$, it converges only at $x = 0$, so $R = 0$.', difficulty: 4 },
]);

// Geometric radius identification.
runSpecs('pow', POW, [
  { prompt: 'What is the radius of convergence of $\\sum_{n=0}^{\\infty} \\left(\\dfrac{x}{3}\\right)^{n}$?', correct: '$3$', distractors: ['$\\dfrac{1}{3}$', '$1$', '$9$'], explanation: 'Geometric with ratio $\\dfrac{x}{3}$: converges for $|x| < 3$, so $R = 3$.', difficulty: 2 },
  { prompt: 'What is the radius of convergence of $\\sum_{n=0}^{\\infty} (3x)^{n}$?', correct: '$\\dfrac{1}{3}$', distractors: ['$3$', '$1$', '$\\dfrac{1}{9}$'], explanation: 'Geometric with ratio $3x$: converges for $|x| < \\dfrac{1}{3}$, so $R = \\dfrac{1}{3}$.', difficulty: 2 },
  { prompt: 'What is the radius of convergence of $\\sum_{n=0}^{\\infty} \\left(\\dfrac{x}{5}\\right)^{n}$?', correct: '$5$', distractors: ['$\\dfrac{1}{5}$', '$1$', '$25$'], explanation: 'Geometric with ratio $\\dfrac{x}{5}$: converges for $|x| < 5$, so $R = 5$.', difficulty: 2 },
  { prompt: 'What is the radius of convergence of $\\sum_{n=0}^{\\infty} (2x)^{n}$?', correct: '$\\dfrac{1}{2}$', distractors: ['$2$', '$1$', '$\\dfrac{1}{4}$'], explanation: 'Geometric with ratio $2x$: converges for $|x| < \\dfrac{1}{2}$, so $R = \\dfrac{1}{2}$.', difficulty: 2 },
]);

// Center and radius of a centered power series.
const powCentered: Array<[number, number]> = [
  [2, 3],
  [1, 2],
  [5, 3],
  [-3, 2],
  [4, 5],
  [6, 2],
];
for (const [c, k] of powCentered) {
  add(
    'pow',
    POW,
    `The power series $\\sum_{n=0}^{\\infty} \\dfrac{(x - ${c})^{n}}{${k}^{n}}$ is centered at which point, with what radius?`,
    `center $${c}$, radius $${k}$`,
    [`center $${-c}$, radius $${k}$`, `center $${c}$, radius $${fracTex(1, k)}$`, `center $${k}$, radius $${c}$`],
    `A power series $\\sum a_n (x - c)^n$ is centered at $c = ${c}$; the geometric ratio $\\dfrac{x - ${c}}{${k}}$ gives radius $R = ${k}$.`,
    3,
  );
}

// Endpoint / interval determination for standard series.
runSpecs('pow', POW, [
  { prompt: 'What is the interval of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n}$?', correct: '$[-1, 1)$', distractors: ['$(-1, 1]$', '$(-1, 1)$', '$[-1, 1]$'], explanation: 'At $x = -1$ it is the (convergent) alternating harmonic series; at $x = 1$ it is the divergent harmonic series.', difficulty: 5 },
  { prompt: 'What is the interval of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n^{2}}$?', correct: '$[-1, 1]$', distractors: ['$(-1, 1)$', '$[-1, 1)$', '$(-1, 1]$'], explanation: 'At both $x = \\pm 1$ the series is dominated by the convergent $p$-series with $p = 2$, so both endpoints are included.', difficulty: 5 },
  { prompt: 'What is the interval of convergence of $\\sum_{n=0}^{\\infty} x^{n}$?', correct: '$(-1, 1)$', distractors: ['$[-1, 1]$', '$[-1, 1)$', '$(-1, 1]$'], explanation: 'At $x = \\pm 1$ the terms do not tend to $0$, so both endpoints are excluded.', difficulty: 5 },
  { prompt: 'What is the interval of convergence of $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n} x^{n}}{n}$?', correct: '$(-1, 1]$', distractors: ['$[-1, 1)$', '$(-1, 1)$', '$[-1, 1]$'], explanation: 'At $x = 1$ it is the convergent alternating harmonic series; at $x = -1$ it is the divergent harmonic series.', difficulty: 5 },
]);

// Power-series theory.
runSpecs('pow', POW, [
  {
    prompt: 'A power series centered at $c$ has the general form:',
    correct: '$\\sum_{n=0}^{\\infty} a_n (x - c)^{n}$',
    distractors: ['$\\sum_{n=0}^{\\infty} a_n x^{n} + c$', '$\\sum_{n=0}^{\\infty} (x - c)$', '$\\sum_{n=0}^{\\infty} a_n n^{x}$'],
    explanation: 'A power series is built from powers of $(x - c)$ with coefficients $a_n$.',
    difficulty: 2,
  },
  {
    prompt: 'The radius of convergence $R$ is usually found by applying which test to $|a_n (x-c)^n|$?',
    correct: 'the Ratio Test',
    distractors: ['the Integral Test', 'the Alternating Series Test', 'the Direct Comparison Test'],
    explanation: 'Applying the Ratio Test gives $R = 1/L$ where $L = \\lim |a_{n+1}/a_n|$.',
    difficulty: 2,
  },
  {
    prompt: 'After finding the radius $R$, the endpoints of the interval of convergence must be:',
    correct: 'tested separately for convergence',
    distractors: ['always included', 'always excluded', 'ignored'],
    explanation: 'The ratio test is silent at the endpoints, so each must be checked by hand.',
    difficulty: 3,
  },
  {
    prompt: 'A power series with radius of convergence $R > 0$ converges:',
    correct: 'at least on the open interval $(c - R, c + R)$',
    distractors: ['only at $x = c$', 'for all real $x$', 'nowhere'],
    explanation: 'Inside the radius the series converges absolutely; behavior at the endpoints varies.',
    difficulty: 2,
  },
  {
    prompt: 'Differentiating a power series term by term produces a series with:',
    correct: 'the same radius of convergence $R$',
    distractors: ['a smaller radius', 'a larger radius', 'radius $0$'],
    explanation: 'Term-by-term differentiation preserves the radius of convergence (endpoints may change).',
    difficulty: 3,
  },
  {
    prompt: 'Integrating a power series term by term produces a series with:',
    correct: 'the same radius of convergence $R$',
    distractors: ['a smaller radius', 'a larger radius', 'radius $\\infty$'],
    explanation: 'Term-by-term integration also preserves the radius of convergence.',
    difficulty: 3,
  },
  {
    prompt: 'On $(-1, 1)$, the geometric power series $\\sum_{n=0}^{\\infty} x^{n}$ equals:',
    correct: '$\\dfrac{1}{1 - x}$',
    distractors: ['$\\dfrac{1}{1 + x}$', '$\\ln(1 - x)$', '$e^{x}$'],
    explanation: 'It is geometric with ratio $x$, summing to $\\dfrac{1}{1 - x}$ for $|x| < 1$.',
    difficulty: 2,
  },
  {
    prompt: 'Every power series $\\sum a_n (x - c)^{n}$ is guaranteed to converge:',
    correct: 'at its center $x = c$',
    distractors: ['at both endpoints', 'for all $x$', 'nowhere'],
    explanation: 'At $x = c$ every term past the first is $0$, so the series trivially converges there.',
    difficulty: 2,
  },
]);

// ===========================================================================
// TOPIC: Taylor Polynomials
// ===========================================================================
const TYP = 'Taylor Polynomials';

// Coefficient of x^k in the Maclaurin polynomial of e^x  ->  1/k!.
for (const k of [2, 3, 4, 5, 6, 7, 8]) {
  add(
    'typ',
    TYP,
    `In the Maclaurin polynomial of $e^{x}$, what is the coefficient of $x^{${k}}$?`,
    wrap(fracTex(1, factorialNum(k))),
    [wrap(fracTex(1, k)), '$1$', wrap(fracTex(1, factorialNum(k - 1))), `$${k}$`],
    `Every derivative of $e^{x}$ is $1$ at $0$, so the coefficient of $x^{${k}}$ is $\\dfrac{1}{${k}!} = ${fracTex(1, factorialNum(k))}$.`,
    3,
  );
}

// Coefficient of x^k in the Maclaurin polynomial of e^{ax}  ->  a^k / k!.
const expScaled: Array<[number, number]> = [
  [2, 2],
  [3, 2],
  [2, 3],
  [-1, 3],
  [3, 3],
];
for (const [a, k] of expScaled) {
  const num = a ** k;
  add(
    'typ',
    TYP,
    `In the Maclaurin polynomial of $e^{${a}x}$, what is the coefficient of $x^{${k}}$?`,
    wrap(fracTex(num, factorialNum(k))),
    [wrap(fracTex(num, factorialNum(k - 1))), `$${num}$`, wrap(fracTex(1, factorialNum(k))), '$0$'],
    `Since $e^{${a}x} = \\sum \\dfrac{(${a}x)^{n}}{n!}$, the coefficient of $x^{${k}}$ is $\\dfrac{${a}^{${k}}}{${k}!} = ${fracTex(num, factorialNum(k))}$.`,
    4,
  );
}

// Recover f^{(k)}(0) from a Maclaurin polynomial: f^{(k)}(0) = k! * a_k.
// Reference polynomial p4 = 6 + 3x - 4x^2 + 5x^3 - 7x^4.
const p4 = 'p_4(x) = 6 + 3x - 4x^{2} + 5x^{3} - 7x^{4}';
runSpecs('typ', TYP, [
  {
    prompt: `For a function with Maclaurin polynomial $${p4}$, find $f(0)$.`,
    correct: '$6$',
    distractors: ['$3$', '$0$', '$-4$'],
    explanation: 'The constant term of a Maclaurin polynomial is $f(0)$, here $6$.',
    difficulty: 2,
  },
  {
    prompt: `For a function with Maclaurin polynomial $${p4}$, find $f\'(0)$.`,
    correct: '$3$',
    distractors: ['$6$', '$1$', '$-8$'],
    explanation: 'The coefficient of $x$ is $f\'(0)/1! = f\'(0)$, so $f\'(0) = 3$.',
    difficulty: 3,
  },
  {
    prompt: `For a function with Maclaurin polynomial $${p4}$, find $f\'\'(0)$.`,
    correct: '$-8$',
    distractors: ['$-4$', '$8$', '$2$'],
    explanation: 'The coefficient of $x^{2}$ is $\\dfrac{f\'\'(0)}{2!}$, so $f\'\'(0) = 2! \\cdot (-4) = -8$.',
    difficulty: 4,
  },
  {
    prompt: `For a function with Maclaurin polynomial $${p4}$, find $f\'\'\'(0)$.`,
    correct: '$30$',
    distractors: ['$5$', '$15$', '$-30$'],
    explanation: 'The coefficient of $x^{3}$ is $\\dfrac{f\'\'\'(0)}{3!}$, so $f\'\'\'(0) = 3! \\cdot 5 = 30$.',
    difficulty: 4,
  },
  {
    prompt: `For a function with Maclaurin polynomial $${p4}$, find $f^{(4)}(0)$.`,
    correct: '$-168$',
    distractors: ['$-7$', '$-28$', '$168$'],
    explanation: 'The coefficient of $x^{4}$ is $\\dfrac{f^{(4)}(0)}{4!}$, so $f^{(4)}(0) = 4! \\cdot (-7) = -168$.',
    difficulty: 4,
  },
  {
    prompt: `For a function with Maclaurin polynomial $${p4}$, what is $p_2(x)$?`,
    correct: '$6 + 3x - 4x^{2}$',
    distractors: ['$6 + 3x$', '$3x - 4x^{2}$', '$6 - 4x^{2}$'],
    explanation: 'The degree-2 polynomial keeps the terms up to $x^{2}$: $6 + 3x - 4x^{2}$.',
    difficulty: 3,
  },
]);

// Degree-1 Taylor polynomials (tangent lines).
runSpecs('typ', TYP, [
  { prompt: 'The degree-1 Maclaurin polynomial (tangent line) of $f(x) = e^{x}$ is:', correct: '$1 + x$', distractors: ['$x$', '$1 - x$', '$1 + x + \\dfrac{x^{2}}{2}$'], explanation: '$f(0) = 1$ and $f\'(0) = 1$, so $p_1(x) = 1 + x$.', difficulty: 3 },
  { prompt: 'The degree-1 Maclaurin polynomial of $f(x) = \\sin x$ is:', correct: '$x$', distractors: ['$1$', '$1 + x$', '$x - \\dfrac{x^{3}}{6}$'], explanation: '$f(0) = 0$ and $f\'(0) = \\cos 0 = 1$, so $p_1(x) = x$.', difficulty: 3 },
  { prompt: 'The degree-1 Maclaurin polynomial of $f(x) = \\cos x$ is:', correct: '$1$', distractors: ['$x$', '$1 - x$', '$1 - \\dfrac{x^{2}}{2}$'], explanation: '$f(0) = 1$ and $f\'(0) = -\\sin 0 = 0$, so $p_1(x) = 1$.', difficulty: 3 },
  { prompt: 'The degree-1 Taylor polynomial of $f(x) = \\ln x$ at $c = 1$ is:', correct: '$x - 1$', distractors: ['$x$', '$1 - x$', '$\\ln x$'], explanation: '$f(1) = 0$ and $f\'(1) = 1$, so $p_1(x) = (x - 1)$.', difficulty: 3 },
  { prompt: 'The degree-1 Taylor polynomial of $f(x) = \\sqrt{x}$ at $c = 4$ is:', correct: '$2 + \\dfrac{1}{4}(x - 4)$', distractors: ['$2 + \\dfrac{1}{2}(x - 4)$', '$2 + (x - 4)$', '$4 + \\dfrac{1}{4}(x - 4)$'], explanation: '$f(4) = 2$ and $f\'(4) = \\dfrac{1}{2\\sqrt{4}} = \\dfrac{1}{4}$.', difficulty: 3 },
]);

// Quadratic (x^2) coefficient of the Maclaurin polynomial.
runSpecs('typ', TYP, [
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin polynomial of $e^{x}$?', correct: '$\\dfrac{1}{2}$', distractors: ['$1$', '$2$', '$\\dfrac{1}{6}$'], explanation: 'The coefficient of $x^{2}$ is $\\dfrac{f\'\'(0)}{2!} = \\dfrac{1}{2}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin polynomial of $\\cos x$?', correct: '$-\\dfrac{1}{2}$', distractors: ['$\\dfrac{1}{2}$', '$-1$', '$0$'], explanation: '$f\'\'(0) = -\\cos 0 = -1$, so the coefficient is $-\\dfrac{1}{2}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin polynomial of $\\sin x$?', correct: '$0$', distractors: ['$\\dfrac{1}{2}$', '$-\\dfrac{1}{2}$', '$1$'], explanation: 'Sine is odd, so its even-power coefficients vanish; the $x^{2}$ coefficient is $0$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin polynomial of $\\dfrac{1}{1 - x}$?', correct: '$1$', distractors: ['$\\dfrac{1}{2}$', '$2$', '$-1$'], explanation: 'Since $\\dfrac{1}{1-x} = 1 + x + x^{2} + \\cdots$, the $x^{2}$ coefficient is $1$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin polynomial of $\\ln(1 + x)$?', correct: '$-\\dfrac{1}{2}$', distractors: ['$\\dfrac{1}{2}$', '$1$', '$-1$'], explanation: 'Since $\\ln(1+x) = x - \\dfrac{x^{2}}{2} + \\cdots$, the $x^{2}$ coefficient is $-\\dfrac{1}{2}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin polynomial of $e^{-x}$?', correct: '$\\dfrac{1}{2}$', distractors: ['$-\\dfrac{1}{2}$', '$1$', '$-1$'], explanation: 'Since $e^{-x} = 1 - x + \\dfrac{x^{2}}{2} - \\cdots$, the $x^{2}$ coefficient is $\\dfrac{1}{2}$.', difficulty: 3 },
]);

// Specific coefficients of trig Maclaurin polynomials.
runSpecs('typ', TYP, [
  { prompt: 'What is the coefficient of $x^{4}$ in the Maclaurin polynomial of $\\cos x$?', correct: '$\\dfrac{1}{24}$', distractors: ['$-\\dfrac{1}{24}$', '$\\dfrac{1}{4}$', '$\\dfrac{1}{2}$'], explanation: '$\\cos x = 1 - \\dfrac{x^{2}}{2!} + \\dfrac{x^{4}}{4!} - \\cdots$, so the $x^{4}$ coefficient is $\\dfrac{1}{24}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{3}$ in the Maclaurin polynomial of $\\sin x$?', correct: '$-\\dfrac{1}{6}$', distractors: ['$\\dfrac{1}{6}$', '$-\\dfrac{1}{3}$', '$\\dfrac{1}{2}$'], explanation: '$\\sin x = x - \\dfrac{x^{3}}{3!} + \\cdots$, so the $x^{3}$ coefficient is $-\\dfrac{1}{6}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{5}$ in the Maclaurin polynomial of $\\sin x$?', correct: '$\\dfrac{1}{120}$', distractors: ['$-\\dfrac{1}{120}$', '$\\dfrac{1}{5}$', '$\\dfrac{1}{24}$'], explanation: '$\\sin x = x - \\dfrac{x^{3}}{3!} + \\dfrac{x^{5}}{5!} - \\cdots$, so the $x^{5}$ coefficient is $\\dfrac{1}{120}$.', difficulty: 4 },
  { prompt: 'What is the coefficient of $x^{6}$ in the Maclaurin polynomial of $\\cos x$?', correct: '$-\\dfrac{1}{720}$', distractors: ['$\\dfrac{1}{720}$', '$-\\dfrac{1}{6}$', '$\\dfrac{1}{120}$'], explanation: '$\\cos x = 1 - \\dfrac{x^{2}}{2!} + \\dfrac{x^{4}}{4!} - \\dfrac{x^{6}}{6!} + \\cdots$, so the $x^{6}$ coefficient is $-\\dfrac{1}{720}$.', difficulty: 4 },
]);

// Identifying Maclaurin polynomials and evaluating them.
runSpecs('typ', TYP, [
  { prompt: 'The degree-4 Maclaurin polynomial of $\\cos x$ is:', correct: '$1 - \\dfrac{x^{2}}{2} + \\dfrac{x^{4}}{24}$', distractors: ['$1 - \\dfrac{x^{2}}{2}$', '$1 + \\dfrac{x^{2}}{2} + \\dfrac{x^{4}}{24}$', '$x - \\dfrac{x^{3}}{6}$'], explanation: 'Keep even powers with alternating signs up to degree $4$.', difficulty: 3 },
  { prompt: 'The degree-5 Maclaurin polynomial of $\\sin x$ is:', correct: '$x - \\dfrac{x^{3}}{6} + \\dfrac{x^{5}}{120}$', distractors: ['$x - \\dfrac{x^{3}}{6}$', '$x + \\dfrac{x^{3}}{6} + \\dfrac{x^{5}}{120}$', '$1 - \\dfrac{x^{2}}{2} + \\dfrac{x^{4}}{24}$'], explanation: 'Keep odd powers with alternating signs up to degree $5$.', difficulty: 3 },
  { prompt: 'The degree-3 Maclaurin polynomial of $\\dfrac{1}{1 - x}$ is:', correct: '$1 + x + x^{2} + x^{3}$', distractors: ['$1 - x + x^{2} - x^{3}$', '$1 + x + \\dfrac{x^{2}}{2} + \\dfrac{x^{3}}{6}$', '$x + x^{2} + x^{3}$'], explanation: 'The geometric expansion gives all coefficients equal to $1$.', difficulty: 3 },
  { prompt: 'The degree-3 Maclaurin polynomial of $e^{-x}$ is:', correct: '$1 - x + \\dfrac{x^{2}}{2} - \\dfrac{x^{3}}{6}$', distractors: ['$1 + x + \\dfrac{x^{2}}{2} + \\dfrac{x^{3}}{6}$', '$1 - x + x^{2} - x^{3}$', '$-1 + x - \\dfrac{x^{2}}{2}$'], explanation: 'Replace $x$ by $-x$ in the series for $e^{x}$, alternating the signs.', difficulty: 3 },
  { prompt: 'The degree-3 Maclaurin polynomial of $\\ln(1 + x)$ is:', correct: '$x - \\dfrac{x^{2}}{2} + \\dfrac{x^{3}}{3}$', distractors: ['$x + \\dfrac{x^{2}}{2} + \\dfrac{x^{3}}{3}$', '$1 - \\dfrac{x^{2}}{2} + \\dfrac{x^{3}}{3}$', '$x - \\dfrac{x^{2}}{2} - \\dfrac{x^{3}}{3}$'], explanation: '$\\ln(1+x) = x - \\dfrac{x^{2}}{2} + \\dfrac{x^{3}}{3} - \\cdots$.', difficulty: 3 },
  { prompt: 'The degree-1 Maclaurin polynomial of $e^{2x}$ is:', correct: '$1 + 2x$', distractors: ['$1 + x$', '$2 + 2x$', '$1 + 2x + 2x^{2}$'], explanation: '$f(0) = 1$ and $f\'(0) = 2$, so $p_1(x) = 1 + 2x$.', difficulty: 3 },
]);

// Estimating values with Taylor polynomials.
runSpecs('typ', TYP, [
  { prompt: 'Using $p_1(x) = 1 + x$ for $e^{x}$, estimate $e^{0.1}$.', correct: '$1.1$', distractors: ['$1.0$', '$1.105$', '$0.9$'], explanation: '$p_1(0.1) = 1 + 0.1 = 1.1$ (the true value is about $1.105$).', difficulty: 3 },
  { prompt: 'The degree-2 Maclaurin polynomial of $e^{x}$ evaluated at $x = 1$ gives:', correct: '$\\dfrac{5}{2}$', distractors: ['$2$', '$\\dfrac{8}{3}$', '$e$'], explanation: '$p_2(1) = 1 + 1 + \\dfrac{1}{2} = \\dfrac{5}{2}$.', difficulty: 3 },
  { prompt: 'The degree-5 Maclaurin polynomial of $e^{x}$ evaluated at $x = 1$ equals:', correct: '$\\dfrac{163}{60}$', distractors: ['$\\dfrac{5}{2}$', '$e$', '$\\dfrac{8}{3}$'], explanation: '$1 + 1 + \\dfrac{1}{2} + \\dfrac{1}{6} + \\dfrac{1}{24} + \\dfrac{1}{120} = \\dfrac{163}{60} \\approx 2.717$.', difficulty: 4 },
  { prompt: 'Using $p_1(x) = 2 + \\dfrac{1}{4}(x - 4)$ for $\\sqrt{x}$, estimate $\\sqrt{4.4}$.', correct: '$2.1$', distractors: ['$2.0$', '$2.2$', '$1.9$'], explanation: '$p_1(4.4) = 2 + \\dfrac{1}{4}(0.4) = 2.1$ (the true value is about $2.098$).', difficulty: 3 },
]);

// Taylor's theorem and concepts.
runSpecs('typ', TYP, [
  {
    prompt: 'Taylor\u2019s theorem bounds the error $|R_n(x)|$ of a degree-$n$ approximation centered at $c$ by:',
    correct: '$\\dfrac{\\max |f^{(n+1)}(z)|}{(n+1)!}\\,|x - c|^{\\,n+1}$',
    distractors: ['$\\max |f^{(n+1)}(z)|\\cdot |x - c|^{\\,n+1}$', '$\\dfrac{f^{(n)}(c)}{n!}(x - c)^{n}$', '$\\dfrac{1}{(n+1)!}$'],
    explanation: 'The remainder is controlled by the next derivative over $(n+1)!$ times $|x - c|^{n+1}$.',
    difficulty: 4,
  },
  {
    prompt: 'The degree-$n$ Taylor polynomial of $f$ at $c$ is built to match:',
    correct: '$f$ and its first $n$ derivatives at $c$',
    distractors: ['only the value $f(c)$', 'only the slope $f\'(c)$', 'the integral of $f$'],
    explanation: 'Each coefficient $\\dfrac{f^{(k)}(c)}{k!}$ forces a matching derivative at $c$.',
    difficulty: 2,
  },
  {
    prompt: 'A Maclaurin polynomial is a Taylor polynomial centered at:',
    correct: '$c = 0$',
    distractors: ['$c = 1$', '$c = \\infty$', 'the nearest critical point'],
    explanation: 'A Maclaurin polynomial is just the special case $c = 0$.',
    difficulty: 1,
  },
  {
    prompt: 'As the degree $n$ increases, a Taylor polynomial generally:',
    correct: 'approximates $f$ well over a wider interval',
    distractors: ['gets worse everywhere', 'matches fewer derivatives', 'becomes a constant'],
    explanation: 'Higher degree matches more derivatives, widening the region of good approximation.',
    difficulty: 2,
  },
  {
    prompt: 'The constant term of the Maclaurin polynomial of $f$ is:',
    correct: '$f(0)$',
    distractors: ['$f\'(0)$', '$0$', '$1$'],
    explanation: 'Setting $x = 0$ leaves only the constant term, which equals $f(0)$.',
    difficulty: 2,
  },
  {
    prompt: 'In a Taylor polynomial centered at $c$, the coefficient of $(x - c)^{k}$ is:',
    correct: '$\\dfrac{f^{(k)}(c)}{k!}$',
    distractors: ['$f^{(k)}(c)$', '$\\dfrac{f^{(k)}(c)}{k}$', '$k!\\, f^{(k)}(c)$'],
    explanation: 'By construction each coefficient is $\\dfrac{f^{(k)}(c)}{k!}$.',
    difficulty: 3,
  },
]);

// A few more vetted Taylor-polynomial items.
runSpecs('typ', TYP, [
  {
    prompt: 'What is the coefficient of $x$ in the Maclaurin polynomial of $\\sin x$?',
    correct: '$1$',
    distractors: ['$0$', '$-1$', '$\\dfrac{1}{2}$'],
    explanation: '$\\sin x = x - \\dfrac{x^{3}}{6} + \\cdots$, so the coefficient of $x$ is $\\cos 0 = 1$.',
    difficulty: 2,
  },
  {
    prompt: 'The degree-0 Maclaurin polynomial of $\\cos x$ is:',
    correct: '$1$',
    distractors: ['$0$', '$x$', '$1 - \\dfrac{x^{2}}{2}$'],
    explanation: 'The degree-0 polynomial is just the constant $f(0) = \\cos 0 = 1$.',
    difficulty: 1,
  },
  {
    prompt: 'To build the degree-2 Taylor polynomial of $f$ at $c$, which values are needed?',
    correct: '$f(c)$, $f\'(c)$, and $f\'\'(c)$',
    distractors: ['only $f(c)$', '$f(c)$ and $f\'(c)$ only', 'every derivative of $f$'],
    explanation: 'A degree-2 polynomial matches the value, first, and second derivatives at $c$.',
    difficulty: 2,
  },
  {
    prompt: 'The degree-1 Maclaurin polynomial of $f(x) = \\ln(1 + x)$ is:',
    correct: '$x$',
    distractors: ['$1 + x$', '$1$', '$x - \\dfrac{x^{2}}{2}$'],
    explanation: '$f(0) = 0$ and $f\'(0) = \\dfrac{1}{1+0} = 1$, so $p_1(x) = x$.',
    difficulty: 3,
  },
]);

// ===========================================================================
// TOPIC: Taylor Series
// ===========================================================================
const TYS = 'Taylor Series';

// Identify the Maclaurin / Taylor series of standard functions.
runSpecs('tys', TYS, [
  { prompt: 'The Maclaurin series of $e^{x}$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', distractors: ['$\\sum_{n=0}^{\\infty} x^{n}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{n}}{n!}$', '$\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n}$'], explanation: 'Every derivative of $e^{x}$ is $1$ at $0$, giving coefficients $\\dfrac{1}{n!}$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\sin x$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{(2n+1)!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{2n+1}$'], explanation: 'Sine is odd, so only odd powers appear, with factorial denominators.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\cos x$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{(2n+1)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{2n}$'], explanation: 'Cosine is even, so only even powers appear, with factorial denominators.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\dfrac{1}{1 - x}$ is:', correct: '$\\sum_{n=0}^{\\infty} x^{n}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{n}$'], explanation: 'It is the geometric series with ratio $x$.', difficulty: 2 },
  { prompt: 'The Maclaurin series of $\\arctan x$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{2n+1}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{(2n+1)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{2n+1}}{2n+1}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{2n}$'], explanation: 'The odd-power denominators are the odd numbers $2n+1$ (not factorials).', difficulty: 4 },
  { prompt: 'The Taylor series of $\\ln x$ centered at $1$ is:', correct: '$\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1} (x-1)^{n}}{n}$', distractors: ['$\\sum_{n=1}^{\\infty} \\dfrac{(x-1)^{n}}{n}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(x-1)^{n}}{n!}$', '$\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1} (x-1)^{n}}{n!}$'], explanation: 'Its terms are $(x-1) - \\dfrac{(x-1)^{2}}{2} + \\dfrac{(x-1)^{3}}{3} - \\cdots$.', difficulty: 4 },
]);

// Intervals of convergence of standard series.
runSpecs('tys', TYS, [
  { prompt: 'On what interval does the Maclaurin series of $e^{x}$ converge to $e^{x}$?', correct: '$(-\\infty, \\infty)$', distractors: ['$(-1, 1)$', '$[-1, 1]$', '$(0, 2]$'], explanation: 'The series for $e^{x}$ converges for all real $x$.', difficulty: 3 },
  { prompt: 'On what interval does the Maclaurin series of $\\sin x$ converge to $\\sin x$?', correct: '$(-\\infty, \\infty)$', distractors: ['$(-1, 1)$', '$[-1, 1]$', '$[-\\pi, \\pi]$'], explanation: 'The series for $\\sin x$ converges for all real $x$.', difficulty: 3 },
  { prompt: 'On what interval does the Maclaurin series of $\\cos x$ converge to $\\cos x$?', correct: '$(-\\infty, \\infty)$', distractors: ['$(-1, 1)$', '$[-1, 1]$', '$[0, 2\\pi]$'], explanation: 'The series for $\\cos x$ converges for all real $x$.', difficulty: 3 },
  { prompt: 'What is the interval of convergence of the geometric series $\\sum_{n=0}^{\\infty} x^{n}$?', correct: '$(-1, 1)$', distractors: ['$[-1, 1]$', '$(-\\infty, \\infty)$', '$(-1, 1]$'], explanation: 'It converges exactly when $|x| < 1$; both endpoints diverge.', difficulty: 4 },
  { prompt: 'What is the interval of convergence of the Maclaurin series of $\\arctan x$?', correct: '$[-1, 1]$', distractors: ['$(-1, 1)$', '$(-\\infty, \\infty)$', '$[-1, 1)$'], explanation: 'It converges on $[-1, 1]$, including both endpoints (e.g. at $x = 1$ it is the alternating series for $\\tfrac{\\pi}{4}$).', difficulty: 5 },
  { prompt: 'What is the interval of convergence of the Taylor series of $\\ln x$ centered at $1$?', correct: '$(0, 2]$', distractors: ['$(0, 2)$', '$[0, 2]$', '$(-1, 1]$'], explanation: 'It converges on $(0, 2]$: divergent at $x = 0$, convergent (alternating) at $x = 2$.', difficulty: 5 },
  { prompt: 'What is the interval of convergence of the Maclaurin series of $\\ln(1 + x)$?', correct: '$(-1, 1]$', distractors: ['$[-1, 1)$', '$(-1, 1)$', '$[-1, 1]$'], explanation: 'It diverges at $x = -1$ (harmonic) and converges at $x = 1$ (alternating harmonic).', difficulty: 5 },
  { prompt: 'The binomial series for $(1 + x)^{k}$ (with $k$ not a nonnegative integer) converges at least on:', correct: '$(-1, 1)$', distractors: ['$[-1, 1]$', '$(-\\infty, \\infty)$', 'only $x = 0$'], explanation: 'The ratio test gives $|x| < 1$; endpoint behavior depends on $k$.', difficulty: 4 },
]);

// Series by substitution.
runSpecs('tys', TYS, [
  { prompt: 'The Maclaurin series of $e^{2x}$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{2^{n} x^{n}}{n!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{2^{n} x^{n}}{(2n)!}$', '$\\sum_{n=0}^{\\infty} 2^{n} x^{n}$'], explanation: 'Substitute $2x$ for $x$ in the series for $e^{x}$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $e^{-x}$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{n}}{n!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{n}$', '$-\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$'], explanation: 'Replace $x$ by $-x$, giving the alternating factor $(-1)^{n}$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\dfrac{1}{1 - 2x}$ is:', correct: '$\\sum_{n=0}^{\\infty} 2^{n} x^{n}$', distractors: ['$\\sum_{n=0}^{\\infty} x^{n}$', '$\\sum_{n=0}^{\\infty} \\dfrac{2^{n} x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} 2^{n} x^{n}$'], explanation: 'Use the geometric series with ratio $2x$ (valid for $|x| < \\tfrac{1}{2}$).', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\dfrac{1}{1 + x}$ is:', correct: '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{n}$', distractors: ['$\\sum_{n=0}^{\\infty} x^{n}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{n}}{n!}$', '$\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n} x^{n}}{n}$'], explanation: 'Use the geometric series with ratio $-x$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\sin(x^{2})$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{4n+2}}{(2n+1)!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{(2n+1)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{4n+2}}{(2n+1)!}$'], explanation: 'Substitute $x^{2}$ into the sine series, so $x^{2n+1} \\to x^{4n+2}$.', difficulty: 4 },
  { prompt: 'The Maclaurin series of $\\dfrac{1}{1 + x^{2}}$ is:', correct: '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{2n}$', distractors: ['$\\sum_{n=0}^{\\infty} x^{2n}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{n}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$'], explanation: 'Use the geometric series with ratio $-x^{2}$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $e^{x^{2}}$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{x^{2n}}{n!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{2n}}{(2n)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{n!}$'], explanation: 'Substitute $x^{2}$ for $x$ in the series for $e^{x}$.', difficulty: 3 },
]);

// More substitution / manipulation.
runSpecs('tys', TYS, [
  { prompt: 'The Maclaurin series of $\\dfrac{1}{1 - x^{2}}$ is:', correct: '$\\sum_{n=0}^{\\infty} x^{2n}$', distractors: ['$\\sum_{n=0}^{\\infty} (-1)^{n} x^{2n}$', '$\\sum_{n=0}^{\\infty} x^{n}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{2n}}{n!}$'], explanation: 'Use the geometric series with ratio $x^{2}$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\dfrac{x}{1 - x}$ is:', correct: '$\\sum_{n=0}^{\\infty} x^{n+1}$', distractors: ['$\\sum_{n=0}^{\\infty} x^{n}$', '$\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n}$', '$\\sum_{n=0}^{\\infty} (-1)^{n} x^{n+1}$'], explanation: 'Multiply the geometric series $\\sum x^{n}$ by $x$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $x^{2} e^{x}$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{x^{n+2}}{n!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{x^{2n}}{n!}$', '$\\sum_{n=2}^{\\infty} \\dfrac{x^{n}}{n!}$'], explanation: 'Multiply the series for $e^{x}$ by $x^{2}$.', difficulty: 3 },
  { prompt: 'The Maclaurin series of $\\cos(2x)$ is:', correct: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} 2^{2n} x^{2n}}{(2n)!}$', distractors: ['$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} 2^{n} x^{2n}}{(2n)!}$', '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} 2^{2n} x^{n}}{(2n)!}$'], explanation: 'Substitute $2x$ into the cosine series; $(2x)^{2n} = 2^{2n} x^{2n}$.', difficulty: 4 },
]);

// Sums of exponential series at specific points.
runSpecs('tys', TYS, [
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{1}{n!}$.', correct: '$e$', distractors: ['$1$', '$2$', '$e - 1$'], explanation: 'This is the series for $e^{x}$ at $x = 1$, giving $e$.', difficulty: 3 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n}}{n!}$.', correct: '$\\dfrac{1}{e}$', distractors: ['$e$', '$-e$', '$\\ln 2$'], explanation: 'This is the series for $e^{x}$ at $x = -1$, giving $e^{-1}$.', difficulty: 3 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{2^{n}}{n!}$.', correct: '$e^{2}$', distractors: ['$2e$', '$e$', '$2$'], explanation: 'This is the series for $e^{x}$ at $x = 2$, giving $e^{2}$.', difficulty: 3 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{3^{n}}{n!}$.', correct: '$e^{3}$', distractors: ['$3e$', '$e^{2}$', '$3$'], explanation: 'This is the series for $e^{x}$ at $x = 3$, giving $e^{3}$.', difficulty: 3 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(-2)^{n}}{n!}$.', correct: '$e^{-2}$', distractors: ['$e^{2}$', '$-2e$', '$\\dfrac{1}{2e}$'], explanation: 'This is the series for $e^{x}$ at $x = -2$, giving $e^{-2}$.', difficulty: 3 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{1}{2^{n}\\, n!}$.', correct: '$\\sqrt{e}$', distractors: ['$e^{2}$', '$2e$', '$e$'], explanation: 'This is the series for $e^{x}$ at $x = \\tfrac{1}{2}$, giving $e^{1/2} = \\sqrt{e}$.', difficulty: 4 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(\\ln 2)^{n}}{n!}$.', correct: '$2$', distractors: ['$\\ln 2$', '$e$', '$e^{2}$'], explanation: 'This is the series for $e^{x}$ at $x = \\ln 2$, giving $e^{\\ln 2} = 2$.', difficulty: 4 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(\\ln 3)^{n}}{n!}$.', correct: '$3$', distractors: ['$\\ln 3$', '$e$', '$e^{3}$'], explanation: 'This is the series for $e^{x}$ at $x = \\ln 3$, giving $e^{\\ln 3} = 3$.', difficulty: 4 },
]);

// Trig / log series values.
runSpecs('tys', TYS, [
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n}}{2n + 1} = 1 - \\dfrac{1}{3} + \\dfrac{1}{5} - \\cdots$.', correct: '$\\dfrac{\\pi}{4}$', distractors: ['$\\ln 2$', '$\\dfrac{\\pi}{2}$', '$1$'], explanation: 'This is the arctangent series at $x = 1$, giving $\\arctan 1 = \\dfrac{\\pi}{4}$.', difficulty: 4 },
  { prompt: 'Evaluate $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1}}{n} = 1 - \\dfrac{1}{2} + \\dfrac{1}{3} - \\cdots$.', correct: '$\\ln 2$', distractors: ['$\\dfrac{\\pi}{4}$', '$1$', '$e$'], explanation: 'This is the series for $\\ln(1 + x)$ at $x = 1$, giving $\\ln 2$.', difficulty: 4 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n}}{(2n + 1)!} = 1 - \\dfrac{1}{3!} + \\dfrac{1}{5!} - \\cdots$.', correct: '$\\sin 1$', distractors: ['$\\cos 1$', '$\\sin\\left(\\tfrac{\\pi}{2}\\right)$', '$1$'], explanation: 'This is the sine series at $x = 1$, giving $\\sin 1$.', difficulty: 4 },
  { prompt: 'Evaluate $\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n}}{(2n)!} = 1 - \\dfrac{1}{2!} + \\dfrac{1}{4!} - \\cdots$.', correct: '$\\cos 1$', distractors: ['$\\sin 1$', '$\\cosh 1$', '$1$'], explanation: 'This is the cosine series at $x = 1$, giving $\\cos 1$.', difficulty: 4 },
]);

// Binomial series.
runSpecs('tys', TYS, [
  { prompt: 'In the binomial series for $(1 + x)^{k}$, the coefficient of $x$ is:', correct: '$k$', distractors: ['$1$', '$\\dfrac{k}{2}$', '$k(k-1)$'], explanation: 'The first-order binomial coefficient $\\binom{k}{1} = k$.', difficulty: 3 },
  { prompt: 'In the binomial series for $(1 + x)^{k}$, the coefficient of $x^{2}$ is:', correct: '$\\dfrac{k(k-1)}{2}$', distractors: ['$\\dfrac{k}{2}$', '$k(k-1)$', '$\\dfrac{k(k-1)(k-2)}{6}$'], explanation: 'The binomial coefficient $\\binom{k}{2} = \\dfrac{k(k-1)}{2!}$.', difficulty: 4 },
  { prompt: 'The first three terms of the series for $(1 + x)^{-1}$ are:', correct: '$1 - x + x^{2}$', distractors: ['$1 + x + x^{2}$', '$1 - x - x^{2}$', '$1 - 2x + 3x^{2}$'], explanation: 'This is the geometric series with ratio $-x$.', difficulty: 3 },
  { prompt: 'The first three terms of the series for $\\sqrt{1 + x} = (1 + x)^{1/2}$ are:', correct: '$1 + \\dfrac{x}{2} - \\dfrac{x^{2}}{8}$', distractors: ['$1 + \\dfrac{x}{2} + \\dfrac{x^{2}}{8}$', '$1 + x - \\dfrac{x^{2}}{2}$', '$1 + \\dfrac{x}{2} - \\dfrac{x^{2}}{4}$'], explanation: 'With $k = \\tfrac{1}{2}$: $\\binom{1/2}{1} = \\tfrac{1}{2}$ and $\\binom{1/2}{2} = -\\tfrac{1}{8}$.', difficulty: 4 },
  { prompt: 'The general term of the binomial series for $(1 + x)^{k}$ is:', correct: '$\\dbinom{k}{n} x^{n}$', distractors: ['$\\dfrac{x^{n}}{n!}$', '$k^{n} x^{n}$', '$\\dfrac{k\\, x^{n}}{n}$'], explanation: 'It uses the generalized binomial coefficient $\\binom{k}{n} = \\dfrac{k(k-1)\\cdots(k-n+1)}{n!}$.', difficulty: 4 },
]);

// Coefficient extraction from known series.
runSpecs('tys', TYS, [
  { prompt: 'What is the coefficient of $x^{3}$ in the Maclaurin series of $\\arctan x$?', correct: '$-\\dfrac{1}{3}$', distractors: ['$\\dfrac{1}{3}$', '$-\\dfrac{1}{6}$', '$\\dfrac{1}{5}$'], explanation: '$\\arctan x = x - \\dfrac{x^{3}}{3} + \\dfrac{x^{5}}{5} - \\cdots$, so the $x^{3}$ coefficient is $-\\dfrac{1}{3}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $x^{5}$ in the Maclaurin series of $\\arctan x$?', correct: '$\\dfrac{1}{5}$', distractors: ['$-\\dfrac{1}{5}$', '$\\dfrac{1}{120}$', '$-\\dfrac{1}{3}$'], explanation: '$\\arctan x = x - \\dfrac{x^{3}}{3} + \\dfrac{x^{5}}{5} - \\cdots$, so the $x^{5}$ coefficient is $\\dfrac{1}{5}$.', difficulty: 3 },
  { prompt: 'What is the coefficient of $(x - 1)^{2}$ in the Taylor series of $\\ln x$ centered at $1$?', correct: '$-\\dfrac{1}{2}$', distractors: ['$\\dfrac{1}{2}$', '$1$', '$-1$'], explanation: '$\\ln x = (x-1) - \\dfrac{(x-1)^{2}}{2} + \\cdots$, so the coefficient is $-\\dfrac{1}{2}$.', difficulty: 4 },
  { prompt: 'What is the coefficient of $x^{2}$ in the Maclaurin series of $\\dfrac{1}{1 - x}$?', correct: '$1$', distractors: ['$\\dfrac{1}{2}$', '$2$', '$-1$'], explanation: 'All coefficients of the geometric series are $1$.', difficulty: 2 },
]);

// Taylor-series theory.
runSpecs('tys', TYS, [
  {
    prompt: 'What distinguishes a Taylor series from a Taylor polynomial?',
    correct: 'a series has infinitely many terms; a polynomial has finitely many',
    distractors: ['they are identical', 'a series has no center', 'a polynomial has no derivatives'],
    explanation: 'A Taylor series is the infinite-degree limit of the Taylor polynomials.',
    difficulty: 2,
  },
  {
    prompt: 'A function equals its Taylor series on an interval exactly when:',
    correct: 'the remainder $R_n(x) \\to 0$ there',
    distractors: ['the series converges there', 'the function is continuous there', 'the radius is infinite'],
    explanation: 'Convergence of the series alone is not enough; the remainder must vanish.',
    difficulty: 4,
  },
  {
    prompt: 'A function that equals its Taylor series near every point of its domain is called:',
    correct: 'analytic',
    distractors: ['continuous', 'monotonic', 'bounded'],
    explanation: 'Such functions are called analytic; most elementary functions qualify.',
    difficulty: 3,
  },
  {
    prompt: 'The Maclaurin series is the Taylor series centered at:',
    correct: '$c = 0$',
    distractors: ['$c = 1$', '$c = e$', 'the nearest singularity'],
    explanation: 'A Maclaurin series is just the special case $c = 0$.',
    difficulty: 1,
  },
  {
    prompt: 'The "algebra of power series" lets us find new series by:',
    correct: 'adding, multiplying, or substituting known series',
    distractors: ['only differentiating', 'only memorizing them', 'only using the ratio test'],
    explanation: 'Within their common radius, power series can be added, multiplied, and composed.',
    difficulty: 2,
  },
]);

export const sequencesAndSeriesQuestions: PracticeQuestion[] = [...generated];
