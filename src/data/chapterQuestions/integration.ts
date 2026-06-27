import type { PracticeQuestion } from '../questionBank';

/* Practice questions for "Integration" (Ch. 5), adapted from APEX Calculus (Hartman et al.) under CC BY-NC 4.0. */

const CHAPTER_ID = 'integration';
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

type PreparedQuestion = Omit<PracticeQuestion, 'id' | 'chapterId'>;

// Shared helpers

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function normalizeLabel(label: string): string {
  return label.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

function fmtNum(n: number): string {
  if (Object.is(n, -0)) return '0';
  if (Number.isInteger(n)) return `${n}`;
  const rounded = Math.round(n * 1000) / 1000;
  return `${rounded}`;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function piLabel(coefValue: number): string {
  if (Math.abs(coefValue) < 1e-9) return '$0$';
  if (Math.abs(coefValue - 1) < 1e-9) return '$\\pi$';
  if (Math.abs(coefValue + 1) < 1e-9) return '$-\\pi$';
  return `$${fmtNum(coefValue)}\\pi$`;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

function fmtFrac(p: number, q: number): string {
  if (q === 0) return '$0$';
  const sign = p < 0 !== q < 0 ? '-' : '';
  let np = Math.abs(p);
  let nq = Math.abs(q);
  const g = gcd(np, nq);
  np /= g;
  nq /= g;
  if (nq === 1) return `$${sign}${np}$`;
  return `$${sign}\\dfrac{${np}}{${nq}}$`;
}

function coef(c: number, body: string): string {
  if (c === 1) return body;
  if (c === -1) return `-${body}`;
  return `${c}${body}`;
}

function xpow(n: number): string {
  if (n === 0) return '1';
  if (n === 1) return 'x';
  return `x^{${n}}`;
}

/** A single monomial c*x^k rendered cleanly (a bare constant when k = 0). */
function mono(c: number, k: number): string {
  if (k === 0) return `${c}`;
  return coef(c, xpow(k));
}

function placeChoices(
  correctLabel: string,
  distractorLabels: readonly string[],
  position: number,
): { choices: { id: string; label: string }[]; correctChoiceId: string } {
  const labels = [...distractorLabels];
  const slots = labels.length + 1;
  const pos = ((position % slots) + slots) % slots;
  labels.splice(pos, 0, correctLabel);
  const choices = labels.map((label, index) => ({ id: LETTERS[index] as string, label }));
  return { choices, correctChoiceId: LETTERS[pos] as string };
}

function numericPre(opts: {
  category: string;
  prompt: string;
  correct: number;
  smart: readonly number[];
  explanation: string;
  position: number;
  difficulty: number;
  fmt?: (n: number) => string;
}): PreparedQuestion {
  const fmt = opts.fmt ?? ((n: number) => `$${fmtNum(n)}$`);
  const correctLabel = fmt(opts.correct);
  const seen = new Set<string>([normalizeLabel(correctLabel)]);
  const distractors: string[] = [];
  const consider = (v: number) => {
    if (distractors.length >= 3) return;
    if (!Number.isFinite(v)) return;
    if (Math.abs(v - opts.correct) < 1e-9) return;
    const label = fmt(v);
    const norm = normalizeLabel(label);
    if (seen.has(norm)) return;
    seen.add(norm);
    distractors.push(label);
  };
  for (const s of opts.smart) consider(s);
  let k = 1;
  while (distractors.length < 3 && k <= 500) {
    consider(opts.correct + k);
    consider(opts.correct - k);
    k += 1;
  }
  const { choices, correctChoiceId } = placeChoices(correctLabel, distractors, opts.position);
  return {
    category: opts.category,
    prompt: opts.prompt,
    choices,
    correctChoiceId,
    explanation: opts.explanation,
    difficulty: opts.difficulty,
  };
}

function fracPre(opts: {
  category: string;
  prompt: string;
  p: number;
  q: number;
  distractors: readonly (readonly [number, number])[];
  explanation: string;
  position: number;
  difficulty: number;
}): PreparedQuestion {
  const correctVal = Math.round((opts.p / opts.q) * 1e6) / 1e6;
  const correctLabel = fmtFrac(opts.p, opts.q);
  const seenVals: number[] = [correctVal];
  const seenLabels = new Set<string>([normalizeLabel(correctLabel)]);
  const distractors: string[] = [];
  const consider = (p: number, q: number) => {
    if (distractors.length >= 3) return;
    if (q === 0) return;
    const v = Math.round((p / q) * 1e6) / 1e6;
    if (seenVals.some((u) => Math.abs(u - v) < 1e-9)) return;
    const label = fmtFrac(p, q);
    const norm = normalizeLabel(label);
    if (seenLabels.has(norm)) return;
    seenVals.push(v);
    seenLabels.add(norm);
    distractors.push(label);
  };
  for (const [p, q] of opts.distractors) consider(p, q);
  let k = 1;
  while (distractors.length < 3 && k <= 500) {
    consider(opts.p + k * opts.q, opts.q);
    consider(opts.p - k * opts.q, opts.q);
    k += 1;
  }
  const { choices, correctChoiceId } = placeChoices(correctLabel, distractors, opts.position);
  return {
    category: opts.category,
    prompt: opts.prompt,
    choices,
    correctChoiceId,
    explanation: opts.explanation,
    difficulty: opts.difficulty,
  };
}

const SAFE_PAD = ['$0$', '$1$', '$-1$', '$2$', '$x$', '$2x$', '$x^2$', '$C$', '$\\tfrac{1}{2}$'];

function symbolicPre(opts: {
  category: string;
  prompt: string;
  correct: string;
  distractors: readonly string[];
  explanation: string;
  position: number;
  difficulty: number;
}): PreparedQuestion {
  const correctLabel = opts.correct;
  const seen = new Set<string>([normalizeLabel(correctLabel)]);
  const chosen: string[] = [];
  const consider = (label: string) => {
    if (chosen.length >= 3) return;
    if (!label) return;
    const norm = normalizeLabel(label);
    if (norm.length === 0) return;
    if (seen.has(norm)) return;
    seen.add(norm);
    chosen.push(label);
  };
  for (const d of opts.distractors) consider(d);
  for (const pad of SAFE_PAD) consider(pad);
  const { choices, correctChoiceId } = placeChoices(correctLabel, chosen, opts.position);
  return {
    category: opts.category,
    prompt: opts.prompt,
    choices,
    correctChoiceId,
    explanation: opts.explanation,
    difficulty: opts.difficulty,
  };
}

function withIds(slug: string, items: readonly PreparedQuestion[]): PracticeQuestion[] {
  return items.map((q, index) => ({
    id: `${CHAPTER_ID}-${slug}-gen-${pad3(index + 1)}`,
    chapterId: CHAPTER_ID,
    ...q,
  }));
}

/* Numerical-integration rule evaluators; each computes the estimate in code. */
type RuleFn = (f: (x: number) => number, a: number, b: number, n: number) => number;

const rsLeft: RuleFn = (f, a, b, n) => {
  const dx = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i += 1) s += f(a + i * dx);
  return s * dx;
};
const rsRight: RuleFn = (f, a, b, n) => {
  const dx = (b - a) / n;
  let s = 0;
  for (let i = 1; i <= n; i += 1) s += f(a + i * dx);
  return s * dx;
};
const rsMid: RuleFn = (f, a, b, n) => {
  const dx = (b - a) / n;
  let s = 0;
  for (let i = 1; i <= n; i += 1) s += f(a + (i - 0.5) * dx);
  return s * dx;
};
const rsTrap: RuleFn = (f, a, b, n) => {
  const dx = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i += 1) s += 2 * f(a + i * dx);
  return (s * dx) / 2;
};
const rsSimpson: RuleFn = (f, a, b, n) => {
  const dx = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i += 1) s += (i % 2 === 1 ? 4 : 2) * f(a + i * dx);
  return (s * dx) / 3;
};

// Topic 1: Antiderivatives and Indefinite Integration
function antiderivatives(): PreparedQuestion[] {
  const cat = 'Antiderivatives and Indefinite Integration';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // Power rule.
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const e = n + 1;
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 1,
        prompt: `Evaluate $\\int ${xpow(n)}\\,dx$.`,
        correct: `$\\dfrac{x^{${e}}}{${e}} + C$`,
        distractors: [
          `$\\dfrac{x^{${e}}}{${n}} + C$`,
          `$x^{${e}} + C$`,
          `$${coef(n, xpow(n - 1))} + C$`,
        ],
        explanation: `Reverse the Power Rule: $\\int ${xpow(n)}\\,dx = \\dfrac{x^{${e}}}{${e}} + C$.`,
        position: p++,
      }),
    );
  }

  // Constant multiple of a power (clean integer leading coefficient).
  const cmCases: Array<[number, number]> = [
    [6, 2],
    [12, 3],
    [10, 4],
    [15, 2],
    [20, 3],
    [8, 1],
    [9, 2],
    [4, 3],
  ];
  for (const [a, n] of cmCases) {
    const e = n + 1;
    const lead = a / e;
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int ${coef(a, xpow(n))}\\,dx$.`,
        correct: `$${coef(lead, xpow(e))} + C$`,
        distractors: [
          `$${coef(a, xpow(e))} + C$`,
          `$${coef(lead, xpow(n))} + C$`,
          `$${mono(a * n, n - 1)} + C$`,
        ],
        explanation: `$\\int ${coef(a, xpow(n))}\\,dx = \\dfrac{${a}}{${e}}x^{${e}} + C = ${coef(lead, xpow(e))} + C$.`,
        position: p++,
      }),
    );
  }

  // Polynomial, term by term.
  const polyCases: Array<[number, number, number]> = [
    [6, 2, 1],
    [12, 3, 2],
    [4, 1, 3],
    [15, 2, 5],
    [20, 3, 1],
    [10, 4, 2],
  ];
  for (const [a, m, b] of polyCases) {
    const e = m + 1;
    const lead = a / e;
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int (${coef(a, xpow(m))} + ${b})\\,dx$.`,
        correct: `$${coef(lead, xpow(e))} + ${coef(b, 'x')} + C$`,
        distractors: [
          `$${coef(a, xpow(e))} + ${coef(b, 'x')} + C$`,
          `$${coef(lead, xpow(e))} + ${b} + C$`,
          `$${mono(a * m, m - 1)} + C$`,
        ],
        explanation: `Integrate term by term: $\\int(${coef(a, xpow(m))} + ${b})\\,dx = ${coef(lead, xpow(e))} + ${coef(b, 'x')} + C$.`,
        position: p++,
      }),
    );
  }

  // Basic antiderivatives from the derivative table.
  const basic: Array<{ f: string; correct: string; distractors: string[]; explanation: string }> = [
    { f: '\\cos x', correct: '$\\sin x + C$', distractors: ['$-\\sin x + C$', '$\\cos x + C$', '$-\\cos x + C$'], explanation: '$\\int \\cos x\\,dx = \\sin x + C$.' },
    { f: '\\sin x', correct: '$-\\cos x + C$', distractors: ['$\\cos x + C$', '$\\sin x + C$', '$-\\sin x + C$'], explanation: '$\\int \\sin x\\,dx = -\\cos x + C$.' },
    { f: 'e^x', correct: '$e^x + C$', distractors: ['$xe^x + C$', '$\\dfrac{e^x}{x} + C$', '$e^{x+1} + C$'], explanation: '$e^x$ is its own antiderivative: $\\int e^x\\,dx = e^x + C$.' },
    { f: '\\sec^2 x', correct: '$\\tan x + C$', distractors: ['$\\sec x + C$', '$\\sec x\\tan x + C$', '$\\cot x + C$'], explanation: '$\\int \\sec^2 x\\,dx = \\tan x + C$.' },
    { f: '\\dfrac{1}{x}', correct: '$\\ln|x| + C$', distractors: ['$\\ln x + C$', '$-\\dfrac{1}{x^2} + C$', '$\\dfrac{1}{x^2} + C$'], explanation: '$\\int \\dfrac{1}{x}\\,dx = \\ln|x| + C$; the absolute value extends it to negative $x$.' },
    { f: '\\csc^2 x', correct: '$-\\cot x + C$', distractors: ['$\\cot x + C$', '$\\tan x + C$', '$\\csc x + C$'], explanation: '$\\int \\csc^2 x\\,dx = -\\cot x + C$.' },
    { f: '\\sec x\\tan x', correct: '$\\sec x + C$', distractors: ['$\\tan x + C$', '$\\sec^2 x + C$', '$-\\sec x + C$'], explanation: '$\\int \\sec x\\tan x\\,dx = \\sec x + C$.' },
    { f: '\\csc x\\cot x', correct: '$-\\csc x + C$', distractors: ['$\\csc x + C$', '$\\cot x + C$', '$-\\cot x + C$'], explanation: '$\\int \\csc x\\cot x\\,dx = -\\csc x + C$.' },
  ];
  for (const item of basic) {
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 1,
        prompt: `Evaluate $\\int ${item.f}\\,dx$.`,
        correct: item.correct,
        distractors: item.distractors,
        explanation: item.explanation,
        position: p++,
      }),
    );
  }

  // Exponential base a.
  for (const a of [2, 3, 5, 7, 10]) {
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 3,
        prompt: `Evaluate $\\int ${a}^{x}\\,dx$.`,
        correct: `$\\dfrac{${a}^{x}}{\\ln ${a}} + C$`,
        distractors: [
          `$${a}^{x}\\ln ${a} + C$`,
          `$${a}^{x} + C$`,
          `$\\dfrac{${a}^{x+1}}{x+1} + C$`,
        ],
        explanation: `Since $\\dfrac{d}{dx}${a}^{x} = ${a}^{x}\\ln ${a}$, we have $\\int ${a}^{x}\\,dx = \\dfrac{${a}^{x}}{\\ln ${a}} + C$.`,
        position: p++,
      }),
    );
  }

  // Constant integrand.
  for (const k of [2, 3, 5, 7]) {
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 1,
        prompt: `Evaluate $\\int ${k}\\,dx$.`,
        correct: `$${k}x + C$`,
        distractors: [`$${k} + C$`, `$x + C$`, `$\\dfrac{${k}x^{2}}{2} + C$`],
        explanation: `The antiderivative of a constant is the constant times $x$: $\\int ${k}\\,dx = ${k}x + C$.`,
        position: p++,
      }),
    );
  }

  // Initial value problems.
  const ivps: Array<{ prompt: string; correct: string; distractors: string[]; explanation: string }> = [
    {
      prompt: 'Suppose $f\'(x) = 2x$ and $f(0) = 3$. Find $f(x)$.',
      correct: '$x^{2} + 3$',
      distractors: ['$x^{2}$', '$x^{2} - 3$', '$2x^{2} + 3$'],
      explanation: 'Antidifferentiate: $f(x) = x^{2} + C$. Then $f(0) = C = 3$, so $f(x) = x^{2} + 3$.',
    },
    {
      prompt: 'Suppose $f\'(x) = 3x^{2}$ and $f(0) = 1$. Find $f(x)$.',
      correct: '$x^{3} + 1$',
      distractors: ['$x^{3}$', '$x^{3} - 1$', '$x^{3} + 3$'],
      explanation: '$f(x) = x^{3} + C$ and $f(0) = C = 1$, so $f(x) = x^{3} + 1$.',
    },
    {
      prompt: 'Suppose $f\'(x) = 4x^{3}$ and $f(1) = 2$. Find $f(x)$.',
      correct: '$x^{4} + 1$',
      distractors: ['$x^{4} + 2$', '$x^{4}$', '$x^{4} - 1$'],
      explanation: '$f(x) = x^{4} + C$; $f(1) = 1 + C = 2$ gives $C = 1$, so $f(x) = x^{4} + 1$.',
    },
    {
      prompt: 'Suppose $f\'(x) = \\cos x$ and $f(0) = 2$. Find $f(x)$.',
      correct: '$\\sin x + 2$',
      distractors: ['$-\\sin x + 2$', '$\\sin x$', '$\\cos x + 2$'],
      explanation: '$f(x) = \\sin x + C$; $f(0) = 0 + C = 2$, so $f(x) = \\sin x + 2$.',
    },
    {
      prompt: 'Suppose $f\'(x) = e^{x}$ and $f(0) = 5$. Find $f(x)$.',
      correct: '$e^{x} + 4$',
      distractors: ['$e^{x} + 5$', '$e^{x}$', '$e^{x} - 4$'],
      explanation: '$f(x) = e^{x} + C$; $f(0) = 1 + C = 5$ gives $C = 4$, so $f(x) = e^{x} + 4$.',
    },
    {
      prompt: 'Suppose $f\'(x) = \\sec^{2} x$ and $f(0) = 0$. Find $f(x)$.',
      correct: '$\\tan x$',
      distractors: ['$\\tan x + 1$', '$\\sec x$', '$-\\tan x$'],
      explanation: '$f(x) = \\tan x + C$; $f(0) = 0 + C = 0$, so $f(x) = \\tan x$.',
    },
    {
      prompt: 'Suppose $f\'(x) = 6x^{2}$ and $f(1) = 4$. Find $f(x)$.',
      correct: '$2x^{3} + 2$',
      distractors: ['$2x^{3}$', '$2x^{3} + 4$', '$2x^{3} - 2$'],
      explanation: '$f(x) = 2x^{3} + C$; $f(1) = 2 + C = 4$ gives $C = 2$, so $f(x) = 2x^{3} + 2$.',
    },
    {
      prompt: 'Suppose $f\'(x) = \\dfrac{1}{x}$ and $f(1) = 0$. Find $f(x)$.',
      correct: '$\\ln|x|$',
      distractors: ['$\\ln|x| + 1$', '$\\ln x$', '$-\\dfrac{1}{x^{2}}$'],
      explanation: '$f(x) = \\ln|x| + C$; $f(1) = 0 + C = 0$, so $f(x) = \\ln|x|$.',
    },
  ];
  for (const item of ivps) {
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 3,
        prompt: item.prompt,
        correct: item.correct,
        distractors: item.distractors,
        explanation: item.explanation,
        position: p++,
      }),
    );
  }

  // Concepts.
  const concepts: Array<{ prompt: string; correct: string; distractors: string[]; explanation: string }> = [
    {
      prompt: 'An antiderivative of $f$ is a function $F$ such that:',
      correct: '$F\'(x) = f(x)$',
      distractors: ['$F(x) = f\'(x)$', '$\\int F\\,dx = f$', '$F(x) = f(x)$'],
      explanation: 'By definition, $F$ is an antiderivative of $f$ when $F\'(x) = f(x)$.',
    },
    {
      prompt: 'The indefinite integral $\\int f(x)\\,dx$ represents:',
      correct: 'the family of all antiderivatives of $f$',
      distractors: ['a single number', 'the area under $f$', 'the slope of $f$'],
      explanation: '$\\int f(x)\\,dx = F(x) + C$ stands for every antiderivative at once.',
    },
    {
      prompt: 'Why does an indefinite integral include the constant $+C$?',
      correct: 'antiderivatives differ only by a constant',
      distractors: ['to make the answer larger', 'to mark a definite integral', 'it is the variable of integration'],
      explanation: 'Any two antiderivatives of a continuous function differ by a constant, captured by $+C$.',
    },
    {
      prompt: 'The Sum Rule says $\\int (f + g)\\,dx$ equals:',
      correct: '$\\int f\\,dx + \\int g\\,dx$',
      distractors: ['$\\int f\\,dx \\cdot \\int g\\,dx$', '$\\int fg\\,dx$', '$f + g + C$'],
      explanation: 'Integration is linear, so it distributes across sums.',
    },
    {
      prompt: 'The Constant Multiple Rule says $\\int k\\,f(x)\\,dx$ equals:',
      correct: '$k\\int f(x)\\,dx$',
      distractors: ['$\\int f(x)\\,dx$', '$k + \\int f(x)\\,dx$', '$\\dfrac{1}{k}\\int f(x)\\,dx$'],
      explanation: 'Constants factor out of an integral.',
    },
    {
      prompt: 'The Power Rule $\\int x^{n}\\,dx = \\dfrac{x^{n+1}}{n+1} + C$ fails for which $n$?',
      correct: '$n = -1$',
      distractors: ['$n = 0$', '$n = 1$', '$n = 2$'],
      explanation: 'At $n = -1$ the formula divides by zero; instead $\\int x^{-1}\\,dx = \\ln|x| + C$.',
    },
    {
      prompt: 'Because differentiation undoes antidifferentiation, $\\dfrac{d}{dx}\\left[\\int f(x)\\,dx\\right]$ equals:',
      correct: '$f(x)$',
      distractors: ['$f\'(x)$', '$F(x)$', '$\\int f\'(x)\\,dx$'],
      explanation: 'Differentiating an antiderivative returns the integrand $f(x)$.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, difficulty: 2, ...c }));

  return out;
}

// Topic 2: The Definite Integral
function definiteIntegral(): PreparedQuestion[] {
  const cat = 'The Definite Integral';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // Constant integrand: area of a rectangle.
  const constIntervals: Array<[number, number]> = [
    [1, 4],
    [2, 6],
  ];
  for (const c of [2, 3, 4, 5]) {
    for (const [a, b] of constIntervals) {
      const ans = c * (b - a);
      out.push(
        numericPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int_{${a}}^{${b}} ${c}\\,dx$.`,
          correct: ans,
          smart: [c * (b + a), c * b, b - a, c],
          explanation: `The integral of a constant is the constant times the width: $${c}(${b} - ${a}) = ${ans}$.`,
          position: p++,
        }),
      );
    }
  }

  // Reversing the limits.
  for (const V of [3, 5, 7, 8, -4, -6]) {
    const ans = -V;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `If $\\int_{a}^{b} f(x)\\,dx = ${V}$, what is $\\int_{b}^{a} f(x)\\,dx$?`,
        correct: ans,
        smart: [V, 2 * V, 0, V / 2],
        explanation: `Reversing the limits negates the integral: $\\int_{b}^{a} f = -\\int_{a}^{b} f = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Additivity over adjacent intervals.
  const addCases: Array<[number, number]> = [
    [3, 8],
    [5, 2],
    [7, 4],
    [6, 6],
    [2, 9],
    [10, 3],
    [4, 4],
    [5, 7],
  ];
  for (const [v1, v2] of addCases) {
    const ans = v1 + v2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `If $\\int_{0}^{2} f = ${v1}$ and $\\int_{2}^{5} f = ${v2}$, what is $\\int_{0}^{5} f$?`,
        correct: ans,
        smart: [v1 - v2, v1 * v2, v2 - v1, Math.abs(v1 - v2)],
        explanation: `Integrals add over adjacent intervals: $${v1} + ${v2} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Constant multiple of a known integral.
  const scaleCases: Array<[number, number]> = [
    [4, 3],
    [5, 2],
    [6, 4],
    [3, 5],
    [7, 2],
    [2, 6],
  ];
  for (const [V, k] of scaleCases) {
    const ans = k * V;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `If $\\int_{a}^{b} f(x)\\,dx = ${V}$, what is $\\int_{a}^{b} ${k}f(x)\\,dx$?`,
        correct: ans,
        smart: [V + k, V - k, V, k],
        explanation: `Constants factor out: $\\int_a^b ${k}f = ${k}\\cdot ${V} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Sum and difference with given values.
  const sumPairs: Array<[number, number]> = [
    [5, 3],
    [7, 2],
    [6, 4],
    [9, 5],
  ];
  for (const [P, Q] of sumPairs) {
    const ans = P + Q;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `If $\\int_{a}^{b} f = ${P}$ and $\\int_{a}^{b} g = ${Q}$, what is $\\int_{a}^{b} (f + g)$?`,
        correct: ans,
        smart: [P - Q, P * Q, Q - P],
        explanation: `Integration distributes over a sum: $${P} + ${Q} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  const diffPairs: Array<[number, number]> = [
    [8, 3],
    [7, 5],
    [10, 4],
    [6, 9],
  ];
  for (const [P, Q] of diffPairs) {
    const ans = P - Q;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `If $\\int_{a}^{b} f = ${P}$ and $\\int_{a}^{b} g = ${Q}$, what is $\\int_{a}^{b} (f - g)$?`,
        correct: ans,
        smart: [P + Q, Q - P, P * Q],
        explanation: `Integration distributes over a difference: $${P} - ${Q} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Geometry: triangle area, even endpoints (integer answers).
  for (const b of [2, 4, 6, 8, 10]) {
    const ans = (b * b) / 2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `Using geometry (the area of a triangle), evaluate $\\int_{0}^{${b}} x\\,dx$.`,
        correct: ans,
        smart: [b * b, b / 2, 2 * b, b],
        explanation: `The region is a triangle with base $${b}$ and height $${b}$: area $= \\tfrac{1}{2}(${b})(${b}) = ${ans}$.`,
        position: p++,
      }),
    );
  }
  // Geometry: triangle area, odd endpoints (fractions).
  for (const b of [3, 5, 7]) {
    out.push(
      fracPre({
        category: cat,
        difficulty: 3,
        prompt: `Using geometry, evaluate $\\int_{0}^{${b}} x\\,dx$.`,
        p: b * b,
        q: 2,
        distractors: [
          [b * b, 1],
          [b, 2],
          [b, 1],
        ],
        explanation: `The triangle has area $\\tfrac{1}{2}(${b})(${b}) = \\dfrac{${b * b}}{2}$.`,
        position: p++,
      }),
    );
  }

  // Geometry: half-disk.
  for (const r of [2, 4, 6]) {
    const cf = (r * r) / 2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `Using geometry (a half-disk), evaluate $\\int_{-${r}}^{${r}} \\sqrt{${r * r} - x^{2}}\\,dx$.`,
        correct: cf,
        smart: [r * r, r, 2 * r * r],
        explanation: `The graph is the upper half of a circle of radius $${r}$, so the area is $\\tfrac{1}{2}\\pi(${r})^{2} = ${fmtNum(cf)}\\pi$.`,
        position: p++,
        fmt: piLabel,
      }),
    );
  }

  // Zero-width interval.
  for (const a of [5, 7, 0]) {
    out.push(
      numericPre({
        category: cat,
        difficulty: 1,
        prompt: `What is $\\int_{${a}}^{${a}} f(x)\\,dx$ for any continuous $f$?`,
        correct: 0,
        smart: [a, 1, 2 * a],
        explanation: 'An integral over a zero-width interval is $0$.',
        position: p++,
      }),
    );
  }

  // Concepts.
  const concepts: Array<{ prompt: string; correct: string; distractors: string[]; explanation: string }> = [
    {
      prompt: 'The definite integral $\\int_a^b f(x)\\,dx$ represents:',
      correct: 'the total signed area between $f$ and the $x$-axis',
      distractors: ['always a positive area', 'the slope of $f$', 'the maximum value of $f$'],
      explanation: 'Area below the axis counts as negative, so the integral is total signed area.',
    },
    {
      prompt: 'If a continuous function is negative on all of $[a, b]$, then $\\int_a^b f(x)\\,dx$ is:',
      correct: 'negative',
      distractors: ['positive', 'zero', 'undefined'],
      explanation: 'Area below the axis contributes negatively to the signed integral.',
    },
    {
      prompt: 'For an integrable $f$, $\\int_a^b f + \\int_b^c f$ equals:',
      correct: '$\\int_a^c f$',
      distractors: ['$\\int_a^b f$', '$2\\int_a^c f$', '$\\int_c^a f$'],
      explanation: 'Integrals are additive over adjacent intervals.',
    },
    {
      prompt: 'For any continuous $f$, $\\int_a^a f(x)\\,dx$ equals:',
      correct: '$0$',
      distractors: ['$f(a)$', '$1$', '$a$'],
      explanation: 'A region with no width has zero area.',
    },
    {
      prompt: 'If $f(x) \\ge g(x)$ on $[a, b]$, then $\\int_a^b f$ compared with $\\int_a^b g$ is:',
      correct: 'greater than or equal',
      distractors: ['always strictly less', 'always equal', 'unrelated'],
      explanation: 'Integration preserves the inequality: $\\int_a^b f \\ge \\int_a^b g$.',
    },
    {
      prompt: 'The average value of $f$ on $[a, b]$ is:',
      correct: '$\\dfrac{1}{b - a}\\int_a^b f(x)\\,dx$',
      distractors: ['$\\int_a^b f(x)\\,dx$', '$\\dfrac{f(a) + f(b)}{2}$', '$(b - a)\\int_a^b f(x)\\,dx$'],
      explanation: 'Average value divides the integral by the interval length.',
    },
    {
      prompt: 'The integral symbol $\\int$ is an elongated "S" standing for:',
      correct: 'a sum',
      distractors: ['a slope', 'a product', 'a difference'],
      explanation: 'The definite integral adds up many small pieces of area, so $\\int$ represents a sum.',
    },
    {
      prompt: 'Reversing the bounds, $\\int_b^a f(x)\\,dx$ equals:',
      correct: '$-\\int_a^b f(x)\\,dx$',
      distractors: ['$\\int_a^b f(x)\\,dx$', '$0$', '$2\\int_a^b f(x)\\,dx$'],
      explanation: 'Swapping the limits of integration changes the sign.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, difficulty: 2, ...c }));

  return out;
}

// Topic 3: Riemann Sums
function riemannSums(): PreparedQuestion[] {
  const cat = 'Riemann Sums';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // Delta x = (b - a)/n.
  for (const b of [4, 6, 8, 10]) {
    for (const n of [2, 4]) {
      const ans = b / n;
      out.push(
        numericPre({
        category: cat,
        difficulty: 1,
        prompt: `For a Riemann sum of $f$ on $[0, ${b}]$ with $n = ${n}$ equal subintervals, what is $\\Delta x$?`,
          correct: ans,
          smart: [b * n, n / b, b - n, b + n],
          explanation: `$\\Delta x = \\dfrac{b - a}{n} = \\dfrac{${b} - 0}{${n}} = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }
  const dxCases: Array<[number, number, number]> = [
    [1, 7, 3],
    [2, 8, 2],
    [1, 9, 4],
    [3, 11, 4],
    [0, 10, 5],
    [2, 12, 5],
  ];
  for (const [a, b, n] of dxCases) {
    const ans = (b - a) / n;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `For a Riemann sum of $f$ on $[${a}, ${b}]$ with $n = ${n}$ equal subintervals, what is $\\Delta x$?`,
        correct: ans,
        smart: [b - a, (b + a) / n, n / (b - a), b / n],
        explanation: `$\\Delta x = \\dfrac{${b} - ${a}}{${n}} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // x_i = a + i * dx.
  const xiCases: Array<[number, number, number, number]> = [
    [0, 4, 4, 2],
    [0, 8, 4, 3],
    [1, 5, 4, 2],
    [2, 10, 4, 1],
    [0, 10, 5, 3],
  ];
  for (const [a, b, n, i] of xiCases) {
    const dx = (b - a) / n;
    const ans = a + i * dx;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `On $[${a}, ${b}]$ with $n = ${n}$ equal subintervals, what is the partition point $x_{${i}} = a + ${i}\\,\\Delta x$?`,
        correct: ans,
        smart: [a + i, i * dx, b - i * dx, a * i],
        explanation: `$\\Delta x = ${fmtNum(dx)}$, so $x_{${i}} = ${a} + ${i}(${fmtNum(dx)}) = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Left sum of f(x) = x on [0, N], width 1.
  for (const N of [4, 5, 6, 7, 8, 10]) {
    const ans = (N * (N - 1)) / 2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `For $f(x) = x$ on $[0, ${N}]$ with ${N} subintervals of width $1$, what is the LEFT-endpoint Riemann sum?`,
        correct: ans,
        smart: [(N * (N + 1)) / 2, (N * N) / 2, N * (N - 1), N],
        explanation: `Left heights are $f(0), \\dots, f(${N - 1})$, summing to $0 + 1 + \\cdots + ${N - 1} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Right sum of f(x) = x on [0, N], width 1.
  for (const N of [4, 5, 6, 7, 8, 10]) {
    const ans = (N * (N + 1)) / 2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `For $f(x) = x$ on $[0, ${N}]$ with ${N} subintervals of width $1$, what is the RIGHT-endpoint Riemann sum?`,
        correct: ans,
        smart: [(N * (N - 1)) / 2, (N * N) / 2, N * (N + 1), N],
        explanation: `Right heights are $f(1), \\dots, f(${N})$, summing to $1 + 2 + \\cdots + ${N} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Left sum of f(x) = x^2 on [0, n], width 1.
  for (const n of [3, 4, 5, 6]) {
    const ans = ((n - 1) * n * (2 * n - 1)) / 6;
    const right = (n * (n + 1) * (2 * n + 1)) / 6;
    out.push(
      numericPre({
        category: cat,
        difficulty: 4,
        prompt: `For $f(x) = x^{2}$ on $[0, ${n}]$ with ${n} subintervals of width $1$, what is the LEFT-endpoint Riemann sum?`,
        correct: ans,
        smart: [right, n * n, n * (n - 1), ans + n * n],
        explanation: `Left heights are $0^{2}, 1^{2}, \\dots, ${n - 1}^{2}$, summing to $\\dfrac{(${n - 1})(${n})(${2 * n - 1})}{6} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  // Right sum of f(x) = x^2 on [0, n], width 1.
  for (const n of [2, 3, 4, 5]) {
    const ans = (n * (n + 1) * (2 * n + 1)) / 6;
    const left = ((n - 1) * n * (2 * n - 1)) / 6;
    out.push(
      numericPre({
        category: cat,
        difficulty: 4,
        prompt: `For $f(x) = x^{2}$ on $[0, ${n}]$ with ${n} subintervals of width $1$, what is the RIGHT-endpoint Riemann sum?`,
        correct: ans,
        smart: [left, n * n, n * n * n, ans - n * n],
        explanation: `Right heights are $1^{2}, 2^{2}, \\dots, ${n}^{2}$, summing to $\\dfrac{(${n})(${n + 1})(${2 * n + 1})}{6} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Summation formulas.
  for (const n of [10, 20, 50, 100]) {
    const ans = (n * (n + 1)) / 2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\sum_{i=1}^{${n}} i$.`,
        correct: ans,
        smart: [n * n, (n * (n - 1)) / 2, n * (n + 1)],
        explanation: `$\\sum_{i=1}^{n} i = \\dfrac{n(n+1)}{2} = \\dfrac{${n}(${n + 1})}{2} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  for (const n of [3, 5, 10]) {
    const ans = (n * (n + 1) * (2 * n + 1)) / 6;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `Evaluate $\\sum_{i=1}^{${n}} i^{2}$.`,
        correct: ans,
        smart: [(n * (n + 1)) / 2, n * n * n, ans + 1],
        explanation: `$\\sum_{i=1}^{n} i^{2} = \\dfrac{n(n+1)(2n+1)}{6} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  const constSumCases: Array<[number, number]> = [
    [10, 6],
    [4, 5],
    [3, 8],
  ];
  for (const [c, n] of constSumCases) {
    const ans = c * n;
    out.push(
      numericPre({
        category: cat,
        difficulty: 1,
        prompt: `Evaluate $\\sum_{i=1}^{${n}} ${c}$.`,
        correct: ans,
        smart: [c + n, c, n],
        explanation: `Summing the constant $${c}$ a total of $${n}$ times gives $${c}\\cdot ${n} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  for (const n of [3, 4]) {
    const ans = ((n * (n + 1)) / 2) ** 2;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `Evaluate $\\sum_{i=1}^{${n}} i^{3}$.`,
        correct: ans,
        smart: [(n * (n + 1) * (2 * n + 1)) / 6, (n * (n + 1)) / 2, n ** 3],
        explanation: `$\\sum_{i=1}^{n} i^{3} = \\left(\\dfrac{n(n+1)}{2}\\right)^{2} = ${ans}$.`,
        position: p++,
      }),
    );
  }

  // Concepts.
  const concepts: Array<{ prompt: string; correct: string; distractors: string[]; explanation: string }> = [
    {
      prompt: 'A Riemann sum is used to approximate:',
      correct: 'the area under a curve',
      distractors: ['the slope of a tangent line', 'a limit of a sequence', 'the derivative of a function'],
      explanation: 'Riemann sums add rectangle areas to approximate the area under a curve.',
    },
    {
      prompt: 'As the number of subintervals $n \\to \\infty$, a Riemann sum approaches:',
      correct: 'the definite integral $\\int_a^b f(x)\\,dx$',
      distractors: ['the derivative $f\'(x)$', 'zero', 'the average of $f(a)$ and $f(b)$'],
      explanation: 'The definite integral is the limit of Riemann sums as $n \\to \\infty$.',
    },
    {
      prompt: 'For an INCREASING function, a left-endpoint Riemann sum gives:',
      correct: 'an underestimate of the area',
      distractors: ['an overestimate of the area', 'the exact area', 'a negative value'],
      explanation: 'For increasing $f$, the left endpoints are the lowest points on each strip.',
    },
    {
      prompt: 'For an INCREASING function, a right-endpoint Riemann sum gives:',
      correct: 'an overestimate of the area',
      distractors: ['an underestimate of the area', 'the exact area', 'zero'],
      explanation: 'For increasing $f$, the right endpoints are the highest points on each strip.',
    },
    {
      prompt: 'On $[a, b]$ with $n$ equal subintervals, the width $\\Delta x$ equals:',
      correct: '$\\dfrac{b - a}{n}$',
      distractors: ['$\\dfrac{n}{b - a}$', '$b - a$', '$\\dfrac{b + a}{n}$'],
      explanation: 'Equal subintervals each have width $\\dfrac{b - a}{n}$.',
    },
    {
      prompt: 'The Midpoint Rule takes each rectangle\'s height from:',
      correct: 'the midpoint of its subinterval',
      distractors: ['the left edge', 'the right edge', 'the maximum of $f$ on the whole interval'],
      explanation: 'The Midpoint Rule samples $f$ at the center of each subinterval.',
    },
    {
      prompt: 'The expression $\\sum_{i=1}^{n} f(c_i)\\,\\Delta x$ is called:',
      correct: 'a Riemann sum',
      distractors: ['a derivative', 'a Taylor series', 'an average value'],
      explanation: 'That sum of (height)(width) terms is exactly a Riemann sum.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, difficulty: 2, ...c }));

  return out;
}

// Topic 4: The Fundamental Theorem of Calculus
function fundamentalTheorem(): PreparedQuestion[] {
  const cat = 'The Fundamental Theorem of Calculus';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // FTC 2 on 2x, antiderivative x^2.
  const power1: Array<[number, number]> = [
    [0, 3],
    [1, 4],
    [2, 5],
    [0, 5],
    [1, 3],
    [2, 6],
  ];
  for (const [a, b] of power1) {
    const ans = b * b - a * a;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int_{${a}}^{${b}} 2x\\,dx$.`,
        correct: ans,
        smart: [a * a - b * b, b * b + a * a, b * b, (b - a) * (b - a)],
        explanation: `An antiderivative is $x^{2}$, so $\\int_{${a}}^{${b}} 2x\\,dx = ${b}^{2} - ${a}^{2} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  // FTC 2 on 3x^2, antiderivative x^3.
  const power2: Array<[number, number]> = [
    [0, 2],
    [1, 3],
    [0, 3],
    [1, 2],
  ];
  for (const [a, b] of power2) {
    const ans = b * b * b - a * a * a;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int_{${a}}^{${b}} 3x^{2}\\,dx$.`,
        correct: ans,
        smart: [a ** 3 - b ** 3, b ** 3 + a ** 3, b ** 3, (b - a) ** 3],
        explanation: `An antiderivative is $x^{3}$, so $\\int_{${a}}^{${b}} 3x^{2}\\,dx = ${b}^{3} - ${a}^{3} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  // FTC 2 on 4x^3, antiderivative x^4.
  const power3: Array<[number, number]> = [
    [0, 2],
    [1, 2],
    [0, 3],
    [1, 3],
  ];
  for (const [a, b] of power3) {
    const ans = b ** 4 - a ** 4;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int_{${a}}^{${b}} 4x^{3}\\,dx$.`,
        correct: ans,
        smart: [a ** 4 - b ** 4, b ** 4 + a ** 4, b ** 4, (b - a) ** 4],
        explanation: `An antiderivative is $x^{4}$, so $\\int_{${a}}^{${b}} 4x^{3}\\,dx = ${b}^{4} - ${a}^{4} = ${ans}$.`,
        position: p++,
      }),
    );
  }
  // FTC 2 giving fractions: int_0^b x^n dx = b^(n+1)/(n+1).
  const fracCases: Array<[number, number]> = [
    [1, 3],
    [2, 2],
    [2, 3],
    [3, 2],
    [1, 5],
    [2, 4],
    [3, 3],
    [1, 4],
  ];
  for (const [n, b] of fracCases) {
    const e = n + 1;
    const num = b ** e;
    out.push(
      fracPre({
        category: cat,
        difficulty: 3,
        prompt: `Evaluate $\\int_{0}^{${b}} ${xpow(n)}\\,dx$.`,
        p: num,
        q: e,
        distractors: [
          [b ** n, e],
          [num, n],
          [num, 1],
        ],
        explanation: `$\\int_0^{${b}} ${xpow(n)}\\,dx = \\left[\\dfrac{x^{${e}}}{${e}}\\right]_0^{${b}} = \\dfrac{${num}}{${e}}$.`,
        position: p++,
      }),
    );
  }
  // Trig and other definite integrals via FTC 2.
  const trig: Array<{ prompt: string; ans: number; explanation: string }> = [
    { prompt: '\\int_{0}^{\\pi} \\sin x\\,dx', ans: 2, explanation: '$[-\\cos x]_0^{\\pi} = -(-1) - (-1) = 2$.' },
    { prompt: '\\int_{0}^{\\pi/2} \\cos x\\,dx', ans: 1, explanation: '$[\\sin x]_0^{\\pi/2} = 1 - 0 = 1$.' },
    { prompt: '\\int_{0}^{\\pi/2} \\sin x\\,dx', ans: 1, explanation: '$[-\\cos x]_0^{\\pi/2} = 0 - (-1) = 1$.' },
    { prompt: '\\int_{\\pi/2}^{\\pi} \\sin x\\,dx', ans: 1, explanation: '$[-\\cos x]_{\\pi/2}^{\\pi} = 1 - 0 = 1$.' },
    { prompt: '\\int_{0}^{\\pi} \\cos x\\,dx', ans: 0, explanation: '$[\\sin x]_0^{\\pi} = 0 - 0 = 0$.' },
    { prompt: '\\int_{0}^{2\\pi} \\sin x\\,dx', ans: 0, explanation: '$[-\\cos x]_0^{2\\pi} = -1 - (-1) = 0$.' },
    { prompt: '\\int_{0}^{\\pi/4} \\sec^{2} x\\,dx', ans: 1, explanation: '$[\\tan x]_0^{\\pi/4} = 1 - 0 = 1$.' },
  ];
  for (const item of trig) {
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `Evaluate $${item.prompt}$.`,
        correct: item.ans,
        smart: [item.ans + 1, item.ans - 1, -item.ans, item.ans + 2],
        explanation: item.explanation,
        position: p++,
      }),
    );
  }
  // int_0^T e^x dx = e^T - 1.
  for (const T of [1, 2, 3]) {
    const upper = T === 1 ? 'e' : `e^{${T}}`;
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 2,
        prompt: `Evaluate $\\int_{0}^{${T}} e^{x}\\,dx$.`,
        correct: `$${upper} - 1$`,
        distractors: [`$${upper}$`, `$${upper} + 1$`, `$1 - ${upper}$`],
        explanation: `$[e^{x}]_{0}^{${T}} = ${upper} - 1$.`,
        position: p++,
      }),
    );
  }
  // int_1^{e^m} 1/x dx = m.
  for (const m of [1, 2, 3, 4]) {
    const upper = m === 1 ? 'e' : `e^{${m}}`;
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `Evaluate $\\int_{1}^{${upper}} \\dfrac{1}{x}\\,dx$.`,
        correct: m,
        smart: [m - 1, m + 1, 2 * m, 0],
        explanation: `$[\\ln x]_{1}^{${upper}} = \\ln(${upper}) - \\ln 1 = ${m}$.`,
        position: p++,
      }),
    );
  }

  // FTC Part 1.
  const part1: Array<{ f: string; ans: string; distractors: string[] }> = [
    { f: '\\cos t', ans: '\\cos x', distractors: ['\\sin x', '-\\sin x', '1'] },
    { f: '\\sin t', ans: '\\sin x', distractors: ['-\\cos x', '\\cos x', '-\\sin x'] },
    { f: 'e^t', ans: 'e^x', distractors: ['xe^x', '\\dfrac{e^{x+1}}{x+1}', '1'] },
    { f: 't^2', ans: 'x^2', distractors: ['\\dfrac{x^3}{3}', '2x', 'x^3'] },
    { f: '\\dfrac{1}{t}', ans: '\\dfrac{1}{x}', distractors: ['\\ln|x|', '-\\dfrac{1}{x^2}', 'x'] },
    { f: '\\sqrt{t}', ans: '\\sqrt{x}', distractors: ['\\dfrac{2}{3}x^{3/2}', '\\dfrac{1}{2\\sqrt{x}}', 'x'] },
    { f: '\\ln t', ans: '\\ln x', distractors: ['\\dfrac{1}{x}', 'x\\ln x - x', '1'] },
    { f: 't^3', ans: 'x^3', distractors: ['\\dfrac{x^4}{4}', '3x^2', 'x^4'] },
  ];
  for (const item of part1) {
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 3,
        prompt: `By the Fundamental Theorem of Calculus, what is $\\dfrac{d}{dx}\\int_{0}^{x} ${item.f}\\,dt$?`,
        correct: `$${item.ans}$`,
        distractors: item.distractors.map((d) => `$${d}$`),
        explanation: `Differentiating the area-so-far function returns the integrand at $x$: $${item.ans}$.`,
        position: p++,
      }),
    );
  }
  // FTC Part 1 with the Chain Rule.
  const chain: Array<{ f: string; correct: string; distractors: string[] }> = [
    { f: '\\cos t', correct: '2x\\cos(x^2)', distractors: ['\\cos(x^2)', '2x\\cos x', '-2x\\sin(x^2)'] },
    { f: 'e^t', correct: '2x e^{x^2}', distractors: ['e^{x^2}', 'x^2 e^{x^2}', '2x e^{x}'] },
    { f: '\\sin t', correct: '2x\\sin(x^2)', distractors: ['\\sin(x^2)', '2x\\cos(x^2)', '-2x\\sin(x^2)'] },
    { f: 't', correct: '2x^3', distractors: ['x^2', '2x', 'x^3'] },
  ];
  for (const item of chain) {
    out.push(
      symbolicPre({
        category: cat,
        difficulty: 5,
        prompt: `What is $\\dfrac{d}{dx}\\int_{0}^{x^{2}} ${item.f}\\,dt$?`,
        correct: `$${item.correct}$`,
        distractors: item.distractors.map((d) => `$${d}$`),
        explanation: 'Combine Part 1 with the Chain Rule: the integrand at $x^{2}$ times $\\dfrac{d}{dx}(x^{2}) = 2x$.',
        position: p++,
      }),
    );
  }

  // Average value.
  const avgCases: Array<{ fnTex: string; integral: number; a: number; b: number; explanation: string }> = [
    { fnTex: 'x', integral: 8, a: 0, b: 4, explanation: '$\\dfrac{1}{4}\\int_0^4 x\\,dx = \\dfrac{1}{4}(8) = 2$.' },
    { fnTex: 'x', integral: 18, a: 0, b: 6, explanation: '$\\dfrac{1}{6}\\int_0^6 x\\,dx = \\dfrac{1}{6}(18) = 3$.' },
    { fnTex: '2x', integral: 9, a: 0, b: 3, explanation: '$\\dfrac{1}{3}\\int_0^3 2x\\,dx = \\dfrac{1}{3}(9) = 3$.' },
    { fnTex: 'x^{2}', integral: 9, a: 0, b: 3, explanation: '$\\dfrac{1}{3}\\int_0^3 x^{2}\\,dx = \\dfrac{1}{3}(9) = 3$.' },
  ];
  for (const item of avgCases) {
    const ans = item.integral / (item.b - item.a);
    out.push(
      numericPre({
        category: cat,
        difficulty: 3,
        prompt: `What is the average value of $f(x) = ${item.fnTex}$ on $[${item.a}, ${item.b}]$?`,
        correct: ans,
        smart: [item.integral, item.b - item.a, ans + 1, 2 * ans],
        explanation: item.explanation,
        position: p++,
      }),
    );
  }

  // Concepts.
  const concepts: Array<{ prompt: string; correct: string; distractors: string[]; explanation: string }> = [
    {
      prompt: 'Part 2 of the Fundamental Theorem says $\\int_a^b f(x)\\,dx$ equals:',
      correct: '$F(b) - F(a)$, where $F\' = f$',
      distractors: ['$f(b) - f(a)$', '$F(a) - F(b)$', '$f\'(b) - f\'(a)$'],
      explanation: 'If $F$ is an antiderivative of $f$, then $\\int_a^b f = F(b) - F(a)$.',
    },
    {
      prompt: 'Part 1 of the Fundamental Theorem says $\\dfrac{d}{dx}\\int_a^x f(t)\\,dt$ equals:',
      correct: '$f(x)$',
      distractors: ['$f\'(x)$', '$f(x) - f(a)$', '$F(x)$'],
      explanation: 'The derivative of an accumulation function is the integrand at the upper limit.',
    },
    {
      prompt: 'Together the two parts of the theorem show that differentiation and integration are:',
      correct: 'inverse processes',
      distractors: ['the same operation', 'unrelated', 'both equal to zero'],
      explanation: 'The theorem links the derivative and the integral as inverse operations.',
    },
    {
      prompt: 'To apply Part 2 of the theorem, the function $f$ must be:',
      correct: 'continuous on $[a, b]$',
      distractors: ['negative on $[a, b]$', 'a polynomial only', 'increasing'],
      explanation: 'Continuity on the interval guarantees an antiderivative exists.',
    },
    {
      prompt: 'The accumulation function $g(x) = \\int_a^x f(t)\\,dt$ satisfies $g(a) =$',
      correct: '$0$',
      distractors: ['$f(a)$', '$1$', '$a$'],
      explanation: 'An integral over a zero-width interval is $0$, so $g(a) = 0$.',
    },
    {
      prompt: 'For a velocity function $v(t)$, the integral $\\int_a^b v(t)\\,dt$ gives:',
      correct: 'the displacement over $[a, b]$',
      distractors: ['the total distance always', 'the acceleration', 'the average velocity'],
      explanation: 'Integrating velocity (a rate of change of position) gives net change in position, i.e. displacement.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, difficulty: 2, ...c }));

  return out;
}

// Topic 5: Numerical Integration
function numericalIntegration(): PreparedQuestion[] {
  const cat = 'Numerical Integration';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // Delta x for numerical methods.
  const dxCases: Array<[number, number, number]> = [
    [0, 1, 5],
    [0, 1, 4],
    [0, 2, 4],
    [0, 4, 8],
    [1, 4, 6],
    [0, 6, 4],
    [2, 5, 6],
    [0, 10, 4],
  ];
  for (const [a, b, n] of dxCases) {
    const ans = (b - a) / n;
    out.push(
      numericPre({
        category: cat,
        difficulty: 2,
        prompt: `To approximate $\\int_{${a}}^{${b}} f(x)\\,dx$ with $n = ${n}$ equal subintervals, what is $\\Delta x$?`,
        correct: ans,
        smart: [b - a, (b - a) * n, n / (b - a), b / n],
        explanation: `$\\Delta x = \\dfrac{b - a}{n} = \\dfrac{${b} - ${a}}{${n}} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Subintervals from a data table.
  for (const K of [5, 7, 9, 11, 25]) {
    const ans = K - 1;
    out.push(
      numericPre({
        category: cat,
        difficulty: 1,
        prompt: `A data set has ${K} equally spaced points. How many subintervals do they form?`,
        correct: ans,
        smart: [K, K + 1, 2 * K],
        explanation: `Connecting ${K} points leaves $${K} - 1 = ${ans}$ gaps (subintervals).`,
        position: p++,
      }),
    );
  }

  // Computed-rule questions; each estimate evaluated in code.
  type ComputeCase = { fnTex: string; f: (x: number) => number; a: number; b: number; n: number };
  const ruleName: Record<'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson', string> = {
    left: 'Left Hand Rule',
    right: 'Right Hand Rule',
    midpoint: 'Midpoint Rule',
    trapezoid: 'Trapezoidal Rule',
    simpson: "Simpson's Rule",
  };
  const ruleFn: Record<'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson', RuleFn> = {
    left: rsLeft,
    right: rsRight,
    midpoint: rsMid,
    trapezoid: rsTrap,
    simpson: rsSimpson,
  };
  /* Endpoint/midpoint rules are one weighted sum; trapezoid and Simpson add endpoint weighting / the 1-4-2-4-1 pattern. */
  const ruleDifficulty: Record<'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson', number> = {
    left: 3,
    right: 3,
    midpoint: 3,
    trapezoid: 4,
    simpson: 4,
  };
  const pushCompute = (rule: 'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson', c: ComputeCase) => {
    const correct = round6(ruleFn[rule](c.f, c.a, c.b, c.n));
    const smart = (['left', 'right', 'midpoint', 'trapezoid'] as const)
      .filter((r) => r !== rule)
      .map((r) => round6(ruleFn[r](c.f, c.a, c.b, c.n)));
    out.push(
      numericPre({
        category: cat,
        difficulty: ruleDifficulty[rule],
        prompt: `Using the ${ruleName[rule]} with ${c.n} subintervals, approximate $\\int_{${c.a}}^{${c.b}} ${c.fnTex}\\,dx$.`,
        correct,
        smart,
        explanation: `With $\\Delta x = ${fmtNum((c.b - c.a) / c.n)}$, the ${ruleName[rule]} gives $${fmtNum(correct)}$.`,
        position: p++,
      }),
    );
  };

  const sq = (x: number) => x * x;
  const cube = (x: number) => x * x * x;

  // Trapezoidal Rule.
  pushCompute('trapezoid', { fnTex: 'x^{2}', f: sq, a: 0, b: 2, n: 2 });
  pushCompute('trapezoid', { fnTex: 'x^{2}', f: sq, a: 0, b: 4, n: 2 });
  pushCompute('trapezoid', { fnTex: 'x^{2}', f: sq, a: 1, b: 3, n: 2 });
  pushCompute('trapezoid', { fnTex: 'x^{2}', f: sq, a: 0, b: 6, n: 3 });
  pushCompute('trapezoid', { fnTex: 'x^{2}', f: sq, a: 2, b: 4, n: 2 });
  pushCompute('trapezoid', { fnTex: 'x^{3}', f: cube, a: 0, b: 2, n: 2 });
  // Midpoint Rule.
  pushCompute('midpoint', { fnTex: 'x^{2}', f: sq, a: 0, b: 2, n: 2 });
  pushCompute('midpoint', { fnTex: 'x^{2}', f: sq, a: 0, b: 4, n: 2 });
  pushCompute('midpoint', { fnTex: 'x^{2}', f: sq, a: 0, b: 6, n: 3 });
  pushCompute('midpoint', { fnTex: 'x^{2}', f: sq, a: 2, b: 4, n: 2 });
  pushCompute('midpoint', { fnTex: 'x^{3}', f: cube, a: 0, b: 2, n: 2 });
  // Simpson's Rule (exact for these quadratics and cubics).
  pushCompute('simpson', { fnTex: 'x^{2}', f: sq, a: 0, b: 3, n: 2 });
  pushCompute('simpson', { fnTex: 'x^{2}', f: sq, a: 0, b: 6, n: 2 });
  pushCompute('simpson', { fnTex: 'x^{2}', f: sq, a: 0, b: 9, n: 2 });
  pushCompute('simpson', { fnTex: 'x^{3}', f: cube, a: 0, b: 2, n: 2 });
  pushCompute('simpson', { fnTex: 'x^{3}', f: cube, a: 0, b: 4, n: 2 });
  // Left and Right Hand Rules.
  pushCompute('left', { fnTex: 'x^{2}', f: sq, a: 0, b: 4, n: 4 });
  pushCompute('right', { fnTex: 'x^{2}', f: sq, a: 0, b: 4, n: 4 });
  pushCompute('left', { fnTex: 'x^{2}', f: sq, a: 0, b: 3, n: 3 });
  pushCompute('right', { fnTex: 'x^{2}', f: sq, a: 0, b: 3, n: 3 });
  pushCompute('left', { fnTex: 'x^{2}', f: sq, a: 0, b: 2, n: 2 });
  pushCompute('right', { fnTex: 'x^{2}', f: sq, a: 0, b: 2, n: 2 });

  // Concepts.
  const concepts: Array<{ prompt: string; correct: string; distractors: string[]; explanation: string }> = [
    {
      prompt: "Simpson's Rule requires the number of subintervals to be:",
      correct: 'even',
      distractors: ['odd', 'prime', 'a multiple of three'],
      explanation: 'Each parabola spans a pair of subintervals, so the count must be even.',
    },
    {
      prompt: "Simpson's Rule computes the exact value of the integral for any:",
      correct: 'cubic (or lower-degree) polynomial',
      distractors: ['function at all', 'constant only', 'exponential function'],
      explanation: 'The error term involves the fourth derivative, which is zero for cubics, so Simpson is exact.',
    },
    {
      prompt: 'The Trapezoidal Rule approximates $f$ on each subinterval with a:',
      correct: 'line',
      distractors: ['constant', 'parabola', 'cubic'],
      explanation: 'Trapezoids cap each strip with a straight line joining the endpoints.',
    },
    {
      prompt: "Simpson's Rule approximates $f$ on each pair of subintervals with a:",
      correct: 'parabola',
      distractors: ['line', 'rectangle', 'constant'],
      explanation: 'It fits a parabola through three equally spaced points.',
    },
    {
      prompt: 'The Trapezoidal Rule estimate equals:',
      correct: 'the average of the Left and Right Hand Rules',
      distractors: ['the Midpoint Rule', 'twice the Left Hand Rule', 'the exact value'],
      explanation: 'Averaging the two endpoint heights on each strip averages the two rectangle sums.',
    },
    {
      prompt: 'Compared with the Trapezoidal Rule, the maximum error of the Midpoint Rule is about:',
      correct: 'half as large',
      distractors: ['twice as large', 'exactly equal', 'ten times as large'],
      explanation: 'The error bounds differ by a factor of two in the Midpoint Rule\u2019s favor.',
    },
    {
      prompt: 'Numerical integration is needed when:',
      correct: 'an antiderivative cannot be found in closed form',
      distractors: ['the function is linear', 'the interval is short', 'the function is positive'],
      explanation: 'Some integrands have no elementary antiderivative (or the function is known only from data).',
    },
    {
      prompt: 'Which of these has NO elementary antiderivative?',
      correct: '$e^{-x^{2}}$',
      distractors: ['$x^{2}$', '$\\sin x$', '$e^{x}$'],
      explanation: '$e^{-x^{2}}$ cannot be antidifferentiated with elementary functions, so its integral is found numerically.',
    },
    {
      prompt: "In Simpson's coefficient pattern $1, 4, 2, 4, \\dots, 4, 1$, the two endpoint terms have coefficient:",
      correct: '$1$',
      distractors: ['$2$', '$4$', '$0$'],
      explanation: 'The pattern begins and ends with a coefficient of $1$.',
    },
    {
      prompt: 'Using more subintervals in a numerical method generally makes the estimate:',
      correct: 'more accurate',
      distractors: ['less accurate', 'exactly zero', 'unchanged'],
      explanation: 'Smaller $\\Delta x$ lets the panels track the curve more closely.',
    },
    {
      prompt: 'The Left and Right Hand Rules are rarely used in practice because:',
      correct: 'their average, the Trapezoidal Rule, is more accurate',
      distractors: ['they require an antiderivative', 'they only work for lines', 'they cannot be computed'],
      explanation: 'The Trapezoidal Rule (and Midpoint and Simpson) are typically far more accurate.',
    },
    {
      prompt: 'When a function is known only from a table of measured values, the integral is best found with:',
      correct: 'numerical integration',
      distractors: ['the Power Rule', 'the Fundamental Theorem directly', 'a single rectangle'],
      explanation: 'With no formula for $f$, we estimate the integral from the data using a numerical rule.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, difficulty: 2, ...c }));

  return out;
}

// Assembled bank
export const integrationQuestions: PracticeQuestion[] = [
  ...withIds('antider', antiderivatives()),
  ...withIds('definite', definiteIntegral()),
  ...withIds('riemann', riemannSums()),
  ...withIds('ftc', fundamentalTheorem()),
  ...withIds('numerical', numericalIntegration()),
];
