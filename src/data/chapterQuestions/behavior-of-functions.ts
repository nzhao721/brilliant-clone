import type { PracticeQuestion } from '../questionBank';

/* Practice questions for "Graphical Behavior of Functions", adapted from APEX Calculus (Hartman et al.) under CC BY-NC 4.0. */

const CHAPTER_ID = 'behavior-of-functions';

// Small, dependency-free helpers

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/** KaTeX for a reduced fraction p/q (integer when it divides evenly). */
function frac(p: number, q: number): string {
  let np = p;
  let nq = q;
  if (nq < 0) {
    np = -np;
    nq = -nq;
  }
  const divisor = greatestCommonDivisor(np, nq);
  np /= divisor;
  nq /= divisor;
  if (nq === 1) {
    return `${np}`;
  }
  return np < 0 ? `-\\dfrac{${-np}}{${nq}}` : `\\dfrac{${np}}{${nq}}`;
}

/** Build a signed polynomial like "2x^2 - x + 3" from [coeff, symbol] terms. */
function terms(parts: Array<[number, string]>): string {
  let out = '';
  for (const [coeff, symbol] of parts) {
    if (coeff === 0) {
      continue;
    }
    const magnitude = Math.abs(coeff);
    const magnitudeStr = symbol && magnitude === 1 ? '' : `${magnitude}`;
    const piece = `${magnitudeStr}${symbol}`;
    if (out === '') {
      out = (coeff < 0 ? '-' : '') + piece;
    } else {
      out += (coeff < 0 ? ' - ' : ' + ') + piece;
    }
  }
  return out === '' ? '0' : out;
}

/** A linear factor (x - r), rendered as (x + |r|) when r is negative, x when 0. */
function linearFactor(r: number): string {
  if (r === 0) {
    return 'x';
  }
  return r > 0 ? `(x - ${r})` : `(x + ${-r})`;
}

/** An open interval in KaTeX. Endpoints are strings so \\infty is allowed. */
function openInterval(low: string, high: string): string {
  return `$\\left(${low}, ${high}\\right)$`;
}

const NEG_INF = '-\\infty';
const POS_INF = '\\infty';

const behaviorOfFunctionsQuestions: PracticeQuestion[] = [];
const prefixCounters: Record<string, number> = {};

/** Assemble a question: dedupe distractors, shuffle deterministically, assign ids a–e. */
function add(
  prefix: string,
  category: string,
  prompt: string,
  correct: string,
  rawDistractors: string[],
  explanation: string,
  difficulty: number,
  choiceCount = 4,
): void {
  prefixCounters[prefix] = (prefixCounters[prefix] ?? 0) + 1;
  const id = `${prefix}-${String(prefixCounters[prefix]).padStart(3, '0')}`;

  const seen = new Set<string>([correct]);
  const distractors: string[] = [];
  for (const candidate of rawDistractors) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    distractors.push(candidate);
  }

  const keep = Math.max(3, choiceCount - 1);
  const chosen = distractors.slice(0, keep);
  const labels = shuffle([correct, ...chosen], seededRandom(hashString(id)));
  const letters = ['a', 'b', 'c', 'd', 'e'];
  const choices = labels.map((label, index) => ({ id: letters[index], label }));
  const correctChoice = choices.find((choice) => choice.label === correct);

  behaviorOfFunctionsQuestions.push({
    id,
    chapterId: CHAPTER_ID,
    category,
    prompt,
    choices,
    correctChoiceId: correctChoice ? correctChoice.id : choices[0].id,
    explanation,
    difficulty,
  });
}

// Section 1 — Extreme Values

const EV = 'Extreme Values';

// Critical number of x^2 + bx + c  ->  x = -b/2
{
  const bValues = [2, -2, 4, -4, 6, -6, 8, -8];
  const cValues = [0, 3, -1, 5, 2, -4, 1, -3];
  bValues.forEach((b, index) => {
    const c = cValues[index];
    const critical = -b / 2;
    add(
      'behavior-ev',
      EV,
      `Find the critical number of $f(x) = ${terms([[1, 'x^2'], [b, 'x'], [c, '']])}$.`,
      `$x = ${critical}$`,
      [`$x = ${b / 2}$`, `$x = ${-b}$`, `$x = ${b}$`],
      `Since $f'(x) = ${terms([[2, 'x'], [b, '']])}$, setting $f'(x) = 0$ gives $x = ${frac(-b, 2)}$.`,
      2,
    );
  });
}

// Critical numbers of x^3 - 3a^2 x  ->  x = ±a
{
  for (let a = 1; a <= 6; a += 1) {
    add(
      'behavior-ev',
      EV,
      `Find the critical numbers of $f(x) = ${terms([[1, 'x^3'], [-3 * a * a, 'x']])}$.`,
      `$x = \\pm ${a}$`,
      [`$x = \\pm ${a * a}$`, `$x = ${a}$`, `$x = 0$`, `$x = \\pm ${3 * a}$`, `$x = \\pm ${a + 1}$`],
      `$f'(x) = ${terms([[3, 'x^2'], [-3 * a * a, '']])} = 3(x^2 - ${a * a})$, so $f'(x) = 0$ when $x = \\pm ${a}$.`,
      3,
    );
  }
}

// Critical numbers of x^3 - 3a x^2  ->  x = 0, 2a
{
  for (let a = 1; a <= 6; a += 1) {
    add(
      'behavior-ev',
      EV,
      `Find the critical numbers of $f(x) = ${terms([[1, 'x^3'], [-3 * a, 'x^2']])}$.`,
      `$x = 0,\\ ${2 * a}$`,
      [`$x = 0,\\ ${a}$`, `$x = 0,\\ ${-2 * a}$`, `$x = ${2 * a}$`, `$x = 0,\\ ${3 * a}$`],
      `$f'(x) = ${terms([[3, 'x^2'], [-6 * a, 'x']])} = 3x(x - ${2 * a})$, so $f'(x) = 0$ when $x = 0$ or $x = ${2 * a}$.`,
      3,
    );
  }
}

// Minimum value of (x - h)^2 + k  ->  k
{
  const sets: Array<[number, number]> = [
    [2, 1],
    [-1, 3],
    [3, -2],
    [-2, 5],
    [1, 4],
  ];
  for (const [h, k] of sets) {
    const vertex = `(x ${h >= 0 ? '-' : '+'} ${Math.abs(h)})^2 ${k >= 0 ? '+' : '-'} ${Math.abs(k)}`;
    add(
      'behavior-ev',
      EV,
      `What is the minimum value of $f(x) = ${vertex}$?`,
      `$${k}$`,
      [`$${h}$`, `$${k + 1}$`, `$${k - 1}$`, `$${k + 3}$`],
      `A squared term is never negative, so $f(x) \\ge ${k}$, with equality at $x = ${h}$. The minimum value is $${k}$.`,
      1,
    );
  }
}

// Absolute maximum of x^2 + bx + c on [p, q] (vertex inside the interval)
{
  const sets: Array<[number, number, number, number]> = [
    [-2, 0, -1, 4],
    [-4, 3, 0, 5],
    [2, -3, -4, 2],
    [-6, 5, 0, 7],
    [4, 1, -5, 1],
  ];
  for (const [b, c, p, q] of sets) {
    const fp = p * p + b * p + c;
    const fq = q * q + b * q + c;
    const vertexX = -b / 2;
    const fv = vertexX * vertexX + b * vertexX + c;
    const maxValue = Math.max(fp, fq);
    add(
      'behavior-ev',
      EV,
      `Find the absolute maximum value of $f(x) = ${terms([[1, 'x^2'], [b, 'x'], [c, '']])}$ on $[${p}, ${q}]$. (Its only critical number in this interval is $x = ${vertexX}$.)`,
      `$${maxValue}$`,
      [`$${fv}$`, `$${Math.min(fp, fq)}$`, `$${maxValue + 3}$`, `$${fv - 1}$`],
      `Compare $f(${p}) = ${fp}$, $f(${q}) = ${fq}$, and the critical value $f(${vertexX}) = ${fv}$. The largest is $${maxValue}$.`,
      3,
    );
  }
}

// Conceptual: Extreme Value Theorem
add(
  'behavior-ev',
  EV,
  'Which condition guarantees that a function attains both an absolute maximum and an absolute minimum?',
  'Being continuous on a finite closed interval',
  [
    'Being continuous on an open interval',
    'Being differentiable at a single point',
    'Having exactly one critical number',
  ],
  'The Extreme Value Theorem guarantees absolute extrema for a function that is continuous on a finite closed interval.',
  1,
);
add(
  'behavior-ev',
  EV,
  'For a continuous function on a closed interval $[a, b]$, the absolute extrema can occur only at which kinds of points?',
  'Endpoints or critical numbers',
  ['Endpoints only', 'Critical numbers only', 'Inflection points'],
  'Absolute extrema on a closed interval are found among the endpoints and the critical numbers inside the interval.',
  1,
);

// Conceptual: Fermat / critical numbers
add(
  'behavior-ev',
  EV,
  'If $f$ is differentiable and has a relative extremum at $x = c$, what must be true of $f\'(c)$?',
  '$f\'(c) = 0$',
  ['$f\'(c) > 0$', '$f\'(c) < 0$', '$f\'(c)$ is undefined'],
  'At a relative extremum of a differentiable function the tangent line is horizontal, so $f\'(c) = 0$.',
  1,
);
add(
  'behavior-ev',
  EV,
  '$x = 0$ is a critical number of $f(x) = x^3$. What kind of point is it?',
  'Neither a maximum nor a minimum',
  ['A relative maximum', 'A relative minimum', 'An absolute maximum'],
  '$f(x) = x^3$ increases through the origin: $x = 0$ is a critical number but not an extremum, showing critical numbers are only candidates.',
  2,
);

// Hand-written, modeled on textbook exercises (verified)
add(
  'behavior-ev',
  EV,
  'Find the absolute maximum value of $f(x) = 2x^3 - 9x^2$ on $[-1, 5]$.',
  '$25$',
  ['$-27$', '$0$', '$-11$', '$45$'],
  'Critical numbers $x = 0, 3$. Comparing $f(-1) = -11$, $f(0) = 0$, $f(3) = -27$, $f(5) = 25$, the maximum is $25$.',
  4,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute minimum value of $f(x) = 2x^3 - 9x^2$ on $[-1, 5]$.',
  '$-27$',
  ['$25$', '$-11$', '$0$'],
  'Comparing $f(-1) = -11$, $f(0) = 0$, $f(3) = -27$, $f(5) = 25$, the minimum is $-27$ (at the critical number $x = 3$).',
  4,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute minimum value of $f(x) = x^2 + x + 4$ on $[-1, 2]$.',
  '$\\dfrac{15}{4}$',
  ['$4$', '$10$', '$\\dfrac{17}{4}$'],
  'The critical number is $x = -\\tfrac{1}{2}$, where $f\\!\\left(-\\tfrac{1}{2}\\right) = \\tfrac{15}{4}$. Since $f(-1) = 4$ and $f(2) = 10$, the minimum is $\\tfrac{15}{4}$.',
  3,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute maximum value of $f(x) = x^2 + x + 4$ on $[-1, 2]$.',
  '$10$',
  ['$4$', '$\\dfrac{15}{4}$', '$6$'],
  'Comparing $f(-1) = 4$, $f\\!\\left(-\\tfrac{1}{2}\\right) = \\tfrac{15}{4}$, and $f(2) = 10$, the maximum is $10$.',
  3,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute minimum value of $f(x) = x + \\dfrac{3}{x}$ on $[1, 5]$.',
  '$2\\sqrt{3}$',
  ['$4$', '$\\dfrac{28}{5}$', '$3$'],
  '$f\'(x) = 1 - \\dfrac{3}{x^2} = 0$ gives $x = \\sqrt{3}$, where $f(\\sqrt{3}) = 2\\sqrt{3} \\approx 3.46$. Since $f(1) = 4$ and $f(5) = \\tfrac{28}{5}$, the minimum is $2\\sqrt{3}$.',
  4,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute maximum value of $f(x) = x + \\dfrac{3}{x}$ on $[1, 5]$.',
  '$\\dfrac{28}{5}$',
  ['$4$', '$2\\sqrt{3}$', '$\\dfrac{16}{5}$'],
  '$f(5) = 5 + \\tfrac{3}{5} = \\tfrac{28}{5} = 5.6$, larger than $f(1) = 4$ and $f(\\sqrt{3}) = 2\\sqrt{3}$. The maximum is $\\tfrac{28}{5}$.',
  3,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute maximum value of $f(x) = \\sqrt{1 - x^2}$.',
  '$1$',
  ['$0$', '$-1$', '$\\dfrac{1}{2}$'],
  'On the domain $[-1, 1]$, $f\'(x) = \\dfrac{-x}{\\sqrt{1 - x^2}} = 0$ at $x = 0$, giving $f(0) = 1$. The maximum is $1$.',
  3,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute minimum value of $f(x) = \\sqrt{1 - x^2}$.',
  '$0$',
  ['$1$', '$-1$', '$\\dfrac{1}{2}$'],
  'On the domain $[-1, 1]$, the endpoints give $f(\\pm 1) = 0$, the smallest value. The minimum is $0$.',
  2,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute maximum value of $f(x) = \\cos(x^2)$ on $[-2, 2]$.',
  '$1$',
  ['$-1$', '$0$', '$\\cos 4$'],
  '$f\'(x) = -2x\\sin(x^2) = 0$ at $x = 0$, where $\\cos 0 = 1$. The cosine never exceeds $1$, so the maximum is $1$.',
  3,
);
add(
  'behavior-ev',
  EV,
  'Find the absolute minimum value of $f(x) = \\cos(x^2)$ on $[-2, 2]$.',
  '$-1$',
  ['$1$', '$0$', '$\\cos 4$'],
  'At $x = \\pm\\sqrt{\\pi}$ (inside $[-2, 2]$), $x^2 = \\pi$ and $\\cos\\pi = -1$, the least possible cosine value. The minimum is $-1$.',
  5,
);
add(
  'behavior-ev',
  EV,
  'Show whether $x = 4$ is a relative extremum of $f(x) = (x - 4)^3 + 7$.',
  'No — it is a critical number but not an extremum',
  ['Yes — a relative maximum', 'Yes — a relative minimum', 'Yes — an inflection point'],
  '$f\'(x) = 3(x - 4)^2$ is $0$ at $x = 4$ but does not change sign there ($f$ keeps increasing), so $x = 4$ is a critical number with no extremum.',
  3,
);

// Critical numbers from a factored derivative
add(
  'behavior-ev',
  EV,
  'A function has $f\'(x) = x(x - 3)(x + 4)$. What are the critical numbers of $f$?',
  '$x = -4, 0, 3$',
  ['$x = 0, 3, 4$', '$x = -4, 0$', '$x = 3, -4$'],
  'Setting each factor to $0$ gives $x = 0$, $x = 3$, and $x = -4$.',
  2,
);
add(
  'behavior-ev',
  EV,
  'A function has $f\'(x) = (x - 2)(x + 5)$. What are the critical numbers of $f$?',
  '$x = -5, 2$',
  ['$x = 5, -2$', '$x = 2, 5$', '$x = -5, -2$'],
  'Setting each factor to $0$ gives $x = 2$ and $x = -5$.',
  2,
);
add(
  'behavior-ev',
  EV,
  'A function has $f\'(x) = 3x^2(x - 1)$. What are the critical numbers of $f$?',
  '$x = 0, 1$',
  ['$x = 1$', '$x = 0, 3$', '$x = -1, 0$'],
  '$f\'(x) = 0$ when $x^2 = 0$ or $x - 1 = 0$, giving $x = 0$ and $x = 1$.',
  2,
);
add(
  'behavior-ev',
  EV,
  'A function has $f\'(x) = (x + 1)(x - 1)x$. What are the critical numbers of $f$?',
  '$x = -1, 0, 1$',
  ['$x = 0, 1$', '$x = -1, 1$', '$x = \\pm 1$'],
  'Setting each factor to $0$ gives $x = -1$, $x = 0$, and $x = 1$.',
  2,
);

// Section 2 — The Mean Value Theorem

const MVT = 'The Mean Value Theorem';

// For a quadratic, the value c from the MVT is the midpoint (p + q)/2
{
  const sets: Array<[number, number, number, number, number]> = [
    [1, 1, 0, 1, 5],
    [1, 3, -1, -2, 2],
    [2, -1, 0, 2, 6],
    [1, -4, 1, 1, 5],
    [3, 0, 0, -2, 4],
    [1, 2, -3, -4, 0],
    [2, 1, 5, 2, 8],
    [1, -2, 0, -1, 3],
    [1, 5, 5, -3, 3],
    [2, -3, 1, -2, 2],
  ];
  for (const [a, b, c, p, q] of sets) {
    const midpoint = (p + q) / 2;
    add(
      'behavior-mvt',
      MVT,
      `For $f(x) = ${terms([[a, 'x^2'], [b, 'x'], [c, '']])}$ on $[${p}, ${q}]$, find the value $c$ guaranteed by the Mean Value Theorem.`,
      `$c = ${midpoint}$`,
      [`$c = ${p}$`, `$c = ${q}$`, `$c = ${p + q}$`, `$c = ${Math.abs(q - p)}$`],
      `For a quadratic, $f'(x)$ is linear, so the value $c$ is always the midpoint of the interval: $c = \\dfrac{${p} + ${q}}{2} = ${midpoint}$.`,
      3,
    );
  }
}

// Average rate of change of x^2 + bx + c on [p, q]  ->  p + q + b
{
  const sets: Array<[number, number, number, number]> = [
    [1, 0, 1, 3],
    [2, 0, 0, 4],
    [-3, 1, -1, 2],
    [1, -2, 2, 5],
    [-1, 0, 0, 6],
    [4, 3, -2, 1],
    [-2, 0, 1, 4],
    [1, -5, -3, 3],
    [3, 2, 0, 5],
    [-4, 1, 2, 6],
  ];
  for (const [b, c, p, q] of sets) {
    const average = p + q + b;
    add(
      'behavior-mvt',
      MVT,
      `Find the average rate of change of $f(x) = ${terms([[1, 'x^2'], [b, 'x'], [c, '']])}$ on $[${p}, ${q}]$.`,
      `$${average}$`,
      [`$${p + q - b}$`, `$${p + q}$`, `$${q - p + b}$`, `$${p + q + 2 * b}$`],
      `$\\dfrac{f(${q}) - f(${p})}{${q} - ${p}} = ${average}$ (for $x^2 + bx + c$ the average over $[p, q]$ simplifies to $p + q + b$).`,
      2,
    );
  }
}

// Can Rolle's Theorem be applied to x^2 + bx + c on [p, q]? (applies iff b = -(p+q))
{
  const yesSets: Array<[number, number, number]> = [
    [-2, 0, 2],
    [0, -3, 3],
    [-1, -1, 5],
  ];
  for (const [c, p, q] of yesSets) {
    const b = -(p + q);
    const midpoint = (p + q) / 2;
    add(
      'behavior-mvt',
      MVT,
      `Can Rolle's Theorem be applied to $f(x) = ${terms([[1, 'x^2'], [b, 'x'], [c, '']])}$ on $[${p}, ${q}]$?`,
      `Yes — the hypotheses hold, with $f'(c) = 0$ at $c = ${midpoint}$`,
      [
        `No — $f(${p}) \\ne f(${q})$`,
        'No — $f$ is not continuous',
        'No — $f$ is not differentiable',
      ],
      `$f(${p}) = f(${q})$ and $f$ is a differentiable polynomial, so Rolle's Theorem applies. $f'(x) = 0$ at $c = ${midpoint}$.`,
      3,
    );
  }
  const noSets: Array<[number, number, number, number]> = [
    [1, 0, -2, 3],
    [0, 2, 0, 4],
    [-3, 1, 1, 4],
  ];
  for (const [b, c, p, q] of noSets) {
    add(
      'behavior-mvt',
      MVT,
      `Can Rolle's Theorem be applied to $f(x) = ${terms([[1, 'x^2'], [b, 'x'], [c, '']])}$ on $[${p}, ${q}]$?`,
      `No — $f(${p}) \\ne f(${q})$`,
      [
        'Yes — the hypotheses hold',
        'No — $f$ is not continuous',
        'No — $f$ is not differentiable',
      ],
      `Rolle's Theorem requires equal endpoint heights, but here $f(${p}) \\ne f(${q})$, so it does not apply.`,
      2,
    );
  }
}

// Average-speed (MVT) word problems
{
  const sets: Array<[number, number]> = [
    [120, 2],
    [150, 3],
    [100, 4],
    [210, 3],
  ];
  for (const [distance, time] of sets) {
    const speed = distance / time;
    add(
      'behavior-mvt',
      MVT,
      `A car travels $${distance}$ miles in $${time}$ hours. The Mean Value Theorem guarantees that at some instant its speed was exactly what value?`,
      `$${speed}$ mph`,
      [`$${distance}$ mph`, `$${time}$ mph`, `$${speed + 10}$ mph`, `$${speed - 10}$ mph`],
      `The average speed is $\\dfrac{${distance}}{${time}} = ${speed}$ mph, and the Mean Value Theorem guarantees the instantaneous speed equals it at some moment.`,
      2,
    );
  }
}
add(
  'behavior-mvt',
  MVT,
  'The Mean Value Theorem guarantees the existence of a point in $(a, b)$ where which of the following holds?',
  'The tangent line is parallel to the secant line through the endpoints',
  [
    'The function equals zero',
    'The derivative is undefined',
    'The second derivative is zero',
  ],
  'The Mean Value Theorem says some $c$ has $f\'(c)$ equal to the average rate of change — geometrically, the tangent is parallel to the secant.',
  1,
);

// Rolle / MVT theory
add(
  'behavior-mvt',
  MVT,
  'If $f$ is continuous on $[2, 5]$, differentiable on $(2, 5)$, and $f(2) = f(5)$, what does Rolle\u2019s Theorem guarantee?',
  'There is a $c$ in $(2, 5)$ with $f\'(c) = 0$',
  [
    'There is a $c$ with $f\'(c) = 1$',
    'There is a $c$ with $f(c) = 0$',
    'There is a $c$ with $f\'\'(c) = 0$',
  ],
  'With equal endpoint heights the average rate is $0$, so Rolle\u2019s Theorem guarantees a point where $f\'(c) = 0$.',
  1,
);
add(
  'behavior-mvt',
  MVT,
  'Rolle\u2019s Theorem is the special case of the Mean Value Theorem that adds which hypothesis?',
  '$f(a) = f(b)$',
  ['$f(a) = 0$', '$a = b$', '$f\'(a) = f\'(b)$'],
  'When $f(a) = f(b)$ the average rate of change is $0$, and the Mean Value Theorem reduces to Rolle\u2019s Theorem.',
  1,
);

// Hand-written, modeled on textbook exercises (verified)
add(
  'behavior-mvt',
  MVT,
  'Apply Rolle\u2019s Theorem to $f(x) = x^2 + x - 6$ on $[-3, 2]$: find $c$ with $f\'(c) = 0$.',
  '$c = -\\dfrac{1}{2}$',
  ['$c = \\dfrac{1}{2}$', '$c = -1$', '$c = 0$', '$c = -2$'],
  '$f(-3) = 0 = f(2)$, so Rolle\u2019s Theorem applies. $f\'(x) = 2x + 1 = 0$ gives $c = -\\tfrac{1}{2}$.',
  3,
);
add(
  'behavior-mvt',
  MVT,
  'Apply Rolle\u2019s Theorem to $f(x) = \\sin x$ on $\\left[\\dfrac{\\pi}{6}, \\dfrac{5\\pi}{6}\\right]$: find $c$ with $f\'(c) = 0$.',
  '$c = \\dfrac{\\pi}{2}$',
  ['$c = \\dfrac{\\pi}{3}$', '$c = \\dfrac{\\pi}{6}$', '$c = \\pi$', '$c = \\dfrac{2\\pi}{3}$'],
  '$\\sin\\tfrac{\\pi}{6} = \\sin\\tfrac{5\\pi}{6} = \\tfrac{1}{2}$, so Rolle\u2019s Theorem applies. $f\'(x) = \\cos x = 0$ gives $c = \\tfrac{\\pi}{2}$.',
  3,
);
add(
  'behavior-mvt',
  MVT,
  'Can Rolle\u2019s Theorem be applied to $f(x) = \\cos x$ on $[0, \\pi]$?',
  'No — $f(0) \\ne f(\\pi)$',
  [
    'Yes — at $c = \\dfrac{\\pi}{2}$',
    'Yes — at $c = \\pi$',
    'No — $\\cos x$ is not continuous',
  ],
  '$\\cos 0 = 1$ but $\\cos\\pi = -1$, so the endpoint values differ and Rolle\u2019s Theorem does not apply.',
  2,
);
add(
  'behavior-mvt',
  MVT,
  'Find the value $c$ from the Mean Value Theorem for $f(x) = x^2 + 3x - 1$ on $[-2, 2]$.',
  '$c = 0$',
  ['$c = 1$', '$c = -1$', '$c = 2$'],
  'The average rate is $\\dfrac{f(2) - f(-2)}{4} = \\dfrac{9 - (-3)}{4} = 3$. Then $f\'(x) = 2x + 3 = 3$ gives $c = 0$.',
  3,
);
add(
  'behavior-mvt',
  MVT,
  'Find the value $c$ from the Mean Value Theorem for $f(x) = 5x^2 - 6x + 8$ on $[0, 5]$.',
  '$c = \\dfrac{5}{2}$',
  ['$c = 2$', '$c = 3$', '$c = \\dfrac{6}{5}$'],
  'The average rate is $\\dfrac{f(5) - f(0)}{5} = \\dfrac{103 - 8}{5} = 19$. Then $f\'(x) = 10x - 6 = 19$ gives $c = \\tfrac{5}{2}$.',
  3,
);
add(
  'behavior-mvt',
  MVT,
  'Find the value $c$ from the Mean Value Theorem for $f(x) = \\sqrt{9 - x^2}$ on $[0, 3]$.',
  '$c = \\dfrac{3\\sqrt{2}}{2}$',
  ['$c = \\dfrac{3}{2}$', '$c = 3\\sqrt{2}$', '$c = \\sqrt{3}$', '$c = \\dfrac{9}{2}$'],
  'The average rate is $\\dfrac{f(3) - f(0)}{3} = \\dfrac{0 - 3}{3} = -1$. Solving $\\dfrac{-x}{\\sqrt{9 - x^2}} = -1$ gives $x = \\dfrac{3\\sqrt{2}}{2}$.',
  4,
);
add(
  'behavior-mvt',
  MVT,
  'Find the value $c$ in $(-2, 2)$ from the Mean Value Theorem for $f(x) = x^3 - 2x^2 + x + 1$ on $[-2, 2]$.',
  '$c = -\\dfrac{2}{3}$',
  ['$c = 2$', '$c = \\dfrac{2}{3}$', '$c = -2$'],
  'The average rate is $\\dfrac{f(2) - f(-2)}{4} = \\dfrac{3 - (-17)}{4} = 5$. Solving $3x^2 - 4x + 1 = 5$ gives $x = 2$ or $x = -\\tfrac{2}{3}$; only $-\\tfrac{2}{3}$ lies inside.',
  4,
);
add(
  'behavior-mvt',
  MVT,
  'Suppose $f(1) = 10$ and $f\'(x) \\ge 2$ for all $x$ in $[1, 4]$. What is the smallest possible value of $f(4)$?',
  '$16$',
  ['$10$', '$12$', '$18$', '$6$'],
  'By the Mean Value Theorem, $f(4) - f(1) = f\'(c)(4 - 1) \\ge 2 \\cdot 3 = 6$, so $f(4) \\ge 16$.',
  4,
);

// Average rate of change of x^3 on [p, q]  ->  p^2 + pq + q^2
{
  const sets: Array<[number, number]> = [
    [1, 3],
    [1, 2],
    [-1, 2],
    [1, 4],
    [-2, 1],
    [2, 5],
  ];
  for (const [p, q] of sets) {
    const average = p * p + p * q + q * q;
    add(
      'behavior-mvt',
      MVT,
      `Find the average rate of change of $f(x) = x^3$ on $[${p}, ${q}]$.`,
      `$${average}$`,
      [`$${p * p + q * q}$`, `$${p * p - p * q + q * q}$`, `$${q ** 3 - p ** 3}$`, `$${3 * p * q}$`],
      `$\\dfrac{${q}^3 - (${p})^3}{${q} - (${p})} = p^2 + pq + q^2 = ${average}$.`,
      3,
    );
  }
}

// Section 3 — Increasing and Decreasing Functions

const ID = 'Increasing and Decreasing Functions';

// Increasing interval of x^2 + bx + c  ->  (-b/2, infinity)
{
  const bValues = [2, -2, 4, -4, 6, -6, 8, -8, 10, -10];
  const cValues = [0, 1, -3, 5, 2, -1, 4, -5, 3, -2];
  bValues.forEach((b, index) => {
    const c = cValues[index];
    const vertex = -b / 2;
    add(
      'behavior-id',
      ID,
      `On which interval is $f(x) = ${terms([[1, 'x^2'], [b, 'x'], [c, '']])}$ increasing?`,
      openInterval(`${vertex}`, POS_INF),
      [
        openInterval(NEG_INF, `${vertex}`),
        openInterval(`${b / 2}`, POS_INF),
        openInterval(NEG_INF, POS_INF),
        openInterval(`${-b}`, POS_INF),
      ],
      `$f'(x) = ${terms([[2, 'x'], [b, '']])} > 0$ when $x > ${vertex}$, so $f$ increases on $\\left(${vertex}, \\infty\\right)$.`,
      2,
    );
  });
}

// First Derivative Test from a factored derivative f'(x) = (x - r)(x - s), r < s
{
  const classification = [
    'A relative maximum',
    'A relative minimum',
    'Neither a maximum nor a minimum',
    'An inflection point',
  ];
  const pairs: Array<[number, number]> = [
    [-3, 1],
    [-2, 2],
    [0, 4],
    [1, 5],
    [-1, 3],
  ];
  for (const [r, s] of pairs) {
    const derivative = `${linearFactor(r)}${linearFactor(s)}`;
    add(
      'behavior-id',
      ID,
      `A function has $f'(x) = ${derivative}$. Using the First Derivative Test, classify the critical number $x = ${r}$.`,
      classification[0],
      [classification[1], classification[2], classification[3]],
      `Just left of $x = ${r}$ both factors are negative ($f' > 0$); just right, $f' < 0$. The sign switches from positive to negative, a relative maximum.`,
      3,
    );
    add(
      'behavior-id',
      ID,
      `A function has $f'(x) = ${derivative}$. Using the First Derivative Test, classify the critical number $x = ${s}$.`,
      classification[1],
      [classification[0], classification[2], classification[3]],
      `Just left of $x = ${s}$ we have $f' < 0$; just right, both factors are positive ($f' > 0$). The sign switches from negative to positive, a relative minimum.`,
      3,
    );
  }
}

// Decreasing interval of x^3 - 3a^2 x  ->  (-a, a)
{
  for (let a = 1; a <= 5; a += 1) {
    add(
      'behavior-id',
      ID,
      `On which interval is $f(x) = ${terms([[1, 'x^3'], [-3 * a * a, 'x']])}$ decreasing?`,
      openInterval(`${-a}`, `${a}`),
      [
        openInterval(`${a}`, POS_INF),
        openInterval(NEG_INF, `${-a}`),
        openInterval(NEG_INF, POS_INF),
        openInterval('0', `${a}`),
      ],
      `$f'(x) = 3(x - ${a})(x + ${a}) < 0$ between the critical numbers, so $f$ decreases on $\\left(${-a}, ${a}\\right)$.`,
      3,
    );
  }
}

// Repeated root: no sign change, no extremum
{
  const classification = [
    'Neither a maximum nor a minimum',
    'A relative maximum',
    'A relative minimum',
    'An inflection point',
  ];
  const roots = [-1, 0, 2, 3];
  for (const r of roots) {
    const factor = r === 0 ? 'x^2' : r > 0 ? `(x - ${r})^2` : `(x + ${-r})^2`;
    add(
      'behavior-id',
      ID,
      `A function has $f'(x) = ${factor}$. Classify the critical number $x = ${r}$.`,
      classification[0],
      [classification[1], classification[2], classification[3]],
      `A square is never negative, so $f' \\ge 0$ on both sides of $x = ${r}$: no sign change, so it is neither a maximum nor a minimum.`,
      2,
    );
  }
}

// Conceptual: sign of the derivative
add(
  'behavior-id',
  ID,
  'If $f\'(x) > 0$ for every $x$ in an interval, then on that interval $f$ is which of the following?',
  'Increasing',
  ['Decreasing', 'Constant', 'Concave up'],
  'A positive derivative means a positive slope everywhere, so the function is increasing.',
  1,
);
add(
  'behavior-id',
  ID,
  'If $f\'(x) < 0$ for every $x$ in an interval, then on that interval $f$ is which of the following?',
  'Decreasing',
  ['Increasing', 'Constant', 'Concave down'],
  'A negative derivative means a negative slope everywhere, so the function is decreasing.',
  1,
);
add(
  'behavior-id',
  ID,
  'If $f\'(x) = 0$ for every $x$ in an interval, then on that interval $f$ is which of the following?',
  'Constant',
  ['Increasing', 'Decreasing', 'Undefined'],
  'A zero derivative throughout an interval means the function has no change there: it is constant.',
  1,
);

// Given f'(x) = x^2 - a^2, find an increasing interval
{
  for (let a = 1; a <= 3; a += 1) {
    add(
      'behavior-id',
      ID,
      `A function has $f'(x) = ${terms([[1, 'x^2'], [-a * a, '']])}$. On which interval is $f$ increasing?`,
      openInterval(`${a}`, POS_INF),
      [
        openInterval(`${-a}`, `${a}`),
        openInterval(NEG_INF, '0'),
        openInterval('0', POS_INF),
        openInterval(NEG_INF, POS_INF),
      ],
      `$f'(x) = x^2 - ${a * a} > 0$ when $x > ${a}$ or $x < ${-a}$. Among the choices, $\\left(${a}, \\infty\\right)$ is increasing.`,
      3,
    );
  }
}

// Classify ±a for x^3 - 3a^2 x using the First Derivative Test
{
  const classification = [
    'A relative maximum',
    'A relative minimum',
    'Neither a maximum nor a minimum',
    'An inflection point',
  ];
  for (let a = 1; a <= 3; a += 1) {
    const fn = terms([[1, 'x^3'], [-3 * a * a, 'x']]);
    add(
      'behavior-id',
      ID,
      `For $f(x) = ${fn}$, classify the critical number $x = ${-a}$.`,
      classification[0],
      [classification[1], classification[2], classification[3]],
      `$f'(x) = 3(x - ${a})(x + ${a})$ is positive for $x < ${-a}$ and negative just after, so $x = ${-a}$ is a relative maximum.`,
      3,
    );
    add(
      'behavior-id',
      ID,
      `For $f(x) = ${fn}$, classify the critical number $x = ${a}$.`,
      classification[1],
      [classification[0], classification[2], classification[3]],
      `$f'(x) = 3(x - ${a})(x + ${a})$ is negative just before $x = ${a}$ and positive after, so $x = ${a}$ is a relative minimum.`,
      3,
    );
  }
}

// Hand-written, modeled on textbook exercises (verified)
add(
  'behavior-id',
  ID,
  'For $f(x) = x^3 + x^2 - x + 1$, classify the critical number $x = -1$.',
  'A relative maximum',
  ['A relative minimum', 'Neither a maximum nor a minimum', 'An inflection point'],
  '$f\'(x) = (3x - 1)(x + 1)$ changes from positive to negative at $x = -1$, a relative maximum.',
  3,
);
add(
  'behavior-id',
  ID,
  'For $f(x) = x^3 + x^2 - x + 1$, classify the critical number $x = \\dfrac{1}{3}$.',
  'A relative minimum',
  ['A relative maximum', 'Neither a maximum nor a minimum', 'An inflection point'],
  '$f\'(x) = (3x - 1)(x + 1)$ changes from negative to positive at $x = \\tfrac{1}{3}$, a relative minimum.',
  3,
);
add(
  'behavior-id',
  ID,
  'For $f(x) = x^5 - 5x$, classify the critical number $x = -1$.',
  'A relative maximum',
  ['A relative minimum', 'Neither a maximum nor a minimum', 'An inflection point'],
  '$f\'(x) = 5(x^2 - 1)(x^2 + 1)$ is positive for $x < -1$ and negative on $(-1, 1)$, so $x = -1$ is a relative maximum.',
  3,
);
add(
  'behavior-id',
  ID,
  'For $f(x) = x^5 - 5x$, classify the critical number $x = 1$.',
  'A relative minimum',
  ['A relative maximum', 'Neither a maximum nor a minimum', 'An inflection point'],
  '$f\'(x) = 5(x^2 - 1)(x^2 + 1)$ is negative on $(-1, 1)$ and positive for $x > 1$, so $x = 1$ is a relative minimum.',
  3,
);
add(
  'behavior-id',
  ID,
  'How many relative extrema does $f(x) = (x - 1)^3$ have?',
  '$0$',
  ['$1$', '$2$', '$3$'],
  '$f\'(x) = 3(x - 1)^2 \\ge 0$, so $f$ is increasing everywhere with no sign change: it has no relative extrema.',
  2,
);
add(
  'behavior-id',
  ID,
  'For $f(x) = x^2 + 2x - 3$, classify the critical number $x = -1$.',
  'A relative minimum',
  ['A relative maximum', 'Neither a maximum nor a minimum', 'An inflection point'],
  '$f\'(x) = 2x + 2$ changes from negative to positive at $x = -1$, so it is a relative minimum.',
  2,
);

// Section 4 — Concavity and the Second Derivative

const CC = 'Concavity and the Second Derivative';

// Inflection point of x^3 + bx^2  ->  x = -b/3
{
  const bValues = [3, -3, 6, -6, 9, -9];
  for (const b of bValues) {
    const inflection = -b / 3;
    add(
      'behavior-cc',
      CC,
      `Find the $x$-coordinate of the inflection point of $f(x) = ${terms([[1, 'x^3'], [b, 'x^2']])}$.`,
      `$x = ${inflection}$`,
      [`$x = ${b / 3}$`, `$x = ${-b}$`, `$x = 0$`, `$x = ${(-2 * b) / 3}$`],
      `$f''(x) = ${terms([[6, 'x'], [2 * b, '']])} = 0$ gives $x = ${frac(-b, 3)}$, where the concavity changes.`,
      3,
    );
  }
}

// Second Derivative Test for x^3 - 3a^2 x (f'' = 6x)
{
  const classification = [
    'A relative minimum',
    'A relative maximum',
    'An inflection point',
    'Inconclusive',
  ];
  for (let a = 1; a <= 5; a += 1) {
    const fn = terms([[1, 'x^3'], [-3 * a * a, 'x']]);
    add(
      'behavior-cc',
      CC,
      `For $f(x) = ${fn}$, the second derivative is $f''(x) = 6x$. Classify the critical number $x = ${a}$.`,
      classification[0],
      [classification[1], classification[2], classification[3]],
      `$f''(${a}) = ${6 * a} > 0$, so the graph is concave up at $x = ${a}$: a relative minimum.`,
      2,
    );
    add(
      'behavior-cc',
      CC,
      `For $f(x) = ${fn}$, the second derivative is $f''(x) = 6x$. Classify the critical number $x = ${-a}$.`,
      classification[1],
      [classification[0], classification[2], classification[3]],
      `$f''(${-a}) = ${-6 * a} < 0$, so the graph is concave down at $x = ${-a}$: a relative maximum.`,
      2,
    );
  }
}

// Inflection points of x^4 - 6a^2 x^2  ->  x = ±a
{
  for (let a = 1; a <= 4; a += 1) {
    add(
      'behavior-cc',
      CC,
      `Find the inflection points of $f(x) = ${terms([[1, 'x^4'], [-6 * a * a, 'x^2']])}$.`,
      `$x = \\pm ${a}$`,
      [`$x = \\pm ${a * a}$`, `$x = 0$`, `$x = \\pm ${2 * a}$`, `$x = \\pm ${3 * a}$`, `$x = ${a}$`],
      `$f''(x) = ${terms([[12, 'x^2'], [-12 * a * a, '']])} = 12(x^2 - ${a * a})$, which changes sign at $x = \\pm ${a}$.`,
      3,
    );
  }
}

// Conceptual: concavity test
add(
  'behavior-cc',
  CC,
  'If $f\'\'(x) > 0$ throughout an interval, the graph of $f$ on that interval is which of the following?',
  'Concave up',
  ['Concave down', 'Increasing', 'Decreasing'],
  'A positive second derivative means the slopes are increasing, so the graph is concave up.',
  1,
);
add(
  'behavior-cc',
  CC,
  'If $f\'\'(x) < 0$ throughout an interval, the graph of $f$ on that interval is which of the following?',
  'Concave down',
  ['Concave up', 'Increasing', 'Decreasing'],
  'A negative second derivative means the slopes are decreasing, so the graph is concave down.',
  1,
);
add(
  'behavior-cc',
  CC,
  'An inflection point of $f$ can occur only where which of the following holds?',
  '$f\'\'(x) = 0$ or $f\'\'$ is undefined',
  ['$f\'(x) = 0$', '$f(x) = 0$', '$f\'\'(x) > 0$'],
  'Concavity is governed by $f\'\'$, so a change in concavity requires $f\'\'(x) = 0$ or $f\'\'$ undefined there.',
  2,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = x^4$, $f\'\'(0) = 0$. Is the origin an inflection point?',
  'No — the graph is concave up on both sides',
  ['Yes', 'Yes, because $f\'\'(0) = 0$', 'Cannot be determined'],
  '$f\'\'(x) = 12x^2 \\ge 0$, so concavity does not change at $x = 0$: it is not an inflection point. The condition $f\'\' = 0$ is necessary but not sufficient.',
  3,
);

// Concavity at a point (x^3, f'' = 6x)
{
  const positions = [2, -2, 3, -3];
  for (const x of positions) {
    const isUp = x > 0;
    add(
      'behavior-cc',
      CC,
      `Is $f(x) = x^3$ concave up or concave down at $x = ${x}$?`,
      isUp ? 'Concave up' : 'Concave down',
      ['Concave up', 'Concave down', 'Neither (an inflection point)', 'It is linear there']
        .filter((label) => label !== (isUp ? 'Concave up' : 'Concave down')),
      `$f''(x) = 6x$, so $f''(${x}) = ${6 * x}$, which is ${isUp ? 'positive (concave up)' : 'negative (concave down)'}.`,
      2,
    );
  }
}

// Conceptual: Second Derivative Test
add(
  'behavior-cc',
  CC,
  'At a critical number $c$, if $f\'\'(c) < 0$, then $f$ has which of the following at $c$?',
  'A relative maximum',
  ['A relative minimum', 'An inflection point', 'No conclusion'],
  'A negative second derivative means concave down at the critical number, so $f(c)$ is a relative maximum.',
  1,
);
add(
  'behavior-cc',
  CC,
  'At a critical number $c$, if $f\'\'(c) > 0$, then $f$ has which of the following at $c$?',
  'A relative minimum',
  ['A relative maximum', 'An inflection point', 'No conclusion'],
  'A positive second derivative means concave up at the critical number, so $f(c)$ is a relative minimum.',
  1,
);
add(
  'behavior-cc',
  CC,
  'At a critical number $c$, if $f\'\'(c) = 0$, the Second Derivative Test is which of the following?',
  'Inconclusive',
  ['Proof of a maximum', 'Proof of a minimum', 'Proof of an inflection point'],
  'When $f\'\'(c) = 0$ the Second Derivative Test gives no conclusion; use the First Derivative Test instead.',
  2,
);

// Classify from a given value of f''(c)
{
  const classification = {
    min: 'A relative minimum',
    max: 'A relative maximum',
    inconclusive: 'Inconclusive',
    inflection: 'An inflection point',
  };
  const values = [5, -3, 8, -2, 0, 4];
  for (const k of values) {
    let correct = classification.inconclusive;
    if (k > 0) {
      correct = classification.min;
    } else if (k < 0) {
      correct = classification.max;
    }
    add(
      'behavior-cc',
      CC,
      `$c$ is a critical number of $f$ with $f''(c) = ${k}$. What does the Second Derivative Test conclude?`,
      correct,
      [classification.min, classification.max, classification.inconclusive, classification.inflection]
        .filter((label) => label !== correct),
      k === 0
        ? 'When $f\'\'(c) = 0$ the test is inconclusive.'
        : `$f''(c) = ${k}$ is ${k > 0 ? 'positive, so the graph is concave up: a relative minimum' : 'negative, so the graph is concave down: a relative maximum'}.`,
      2,
    );
  }
}

// Hand-written, modeled on textbook exercises (verified)
add(
  'behavior-cc',
  CC,
  'Find the $x$-coordinate of the inflection point of $f(x) = x^3 - 3x + 1$.',
  '$x = 0$',
  ['$x = 1$', '$x = -1$', '$x = \\pm 1$'],
  '$f\'\'(x) = 6x = 0$ at $x = 0$, where the concavity changes from down to up.',
  3,
);
add(
  'behavior-cc',
  CC,
  'Find the $x$-coordinate of the inflection point of $f(x) = x^3 - 3x^2 - 9x + 4$.',
  '$x = 1$',
  ['$x = 0$', '$x = 3$', '$x = -1$'],
  '$f\'\'(x) = 6x - 6 = 0$ at $x = 1$, where the concavity changes.',
  3,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = x^3 - 3x^2 - 9x + 4$, classify the critical number $x = 3$.',
  'A relative minimum',
  ['A relative maximum', 'An inflection point', 'Inconclusive'],
  '$f\'\'(x) = 6x - 6$, so $f\'\'(3) = 12 > 0$: concave up, a relative minimum.',
  3,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = x^3 - 3x^2 - 9x + 4$, classify the critical number $x = -1$.',
  'A relative maximum',
  ['A relative minimum', 'An inflection point', 'Inconclusive'],
  '$f\'\'(-1) = -12 < 0$: concave down, a relative maximum.',
  3,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = x^4 - 2x^2 + 3$, classify the critical number $x = 0$.',
  'A relative maximum',
  ['A relative minimum', 'An inflection point', 'Inconclusive'],
  '$f\'\'(x) = 12x^2 - 4$, so $f\'\'(0) = -4 < 0$: concave down, a relative maximum.',
  3,
);
add(
  'behavior-cc',
  CC,
  'Find the inflection points of $f(x) = x^4 - 2x^2 + 3$.',
  '$x = \\pm \\dfrac{1}{\\sqrt{3}}$',
  ['$x = 0$', '$x = \\pm 1$', '$x = \\pm \\dfrac{1}{3}$'],
  '$f\'\'(x) = 12x^2 - 4 = 0$ gives $x^2 = \\tfrac{1}{3}$, so $x = \\pm\\dfrac{1}{\\sqrt{3}}$.',
  3,
);
add(
  'behavior-cc',
  CC,
  'Find the $x$-coordinate of the inflection point of $f(x) = 1 + 3x^2 - 2x^3$.',
  '$x = \\dfrac{1}{2}$',
  ['$x = 0$', '$x = 1$', '$x = -\\dfrac{1}{2}$'],
  '$f\'\'(x) = 6 - 12x = 0$ gives $x = \\tfrac{1}{2}$, where the concavity changes.',
  3,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = 1 + 3x^2 - 2x^3$, classify the critical number $x = 1$.',
  'A relative maximum',
  ['A relative minimum', 'An inflection point', 'Inconclusive'],
  '$f\'\'(x) = 6 - 12x$, so $f\'\'(1) = -6 < 0$: concave down, a relative maximum.',
  3,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = \\dfrac{100}{x} + x$, classify the critical number $x = 10$.',
  'A relative minimum',
  ['A relative maximum', 'An inflection point', 'Inconclusive'],
  '$f\'\'(x) = \\dfrac{200}{x^3}$, so $f\'\'(10) = 0.2 > 0$: concave up, a relative minimum.',
  3,
);
add(
  'behavior-cc',
  CC,
  'For $f(x) = \\dfrac{100}{x} + x$, classify the critical number $x = -10$.',
  'A relative maximum',
  ['A relative minimum', 'An inflection point', 'Inconclusive'],
  '$f\'\'(-10) = \\dfrac{200}{(-10)^3} = -0.2 < 0$: concave down, a relative maximum.',
  3,
);
add(
  'behavior-cc',
  CC,
  'Sales are modeled by $S(t) = t^4 - 8t^2 + 20$ and are decreasing over the first two years. At what time are sales decreasing fastest?',
  '$t = \\dfrac{2\\sqrt{3}}{3}$',
  ['$t = 2$', '$t = 0$', '$t = \\sqrt{2}$'],
  'The fastest decrease is where $S\'$ is smallest, i.e. where $S\'\'(t) = 12t^2 - 16 = 0$, giving $t = \\dfrac{2}{\\sqrt{3}} = \\dfrac{2\\sqrt{3}}{3} \\approx 1.16$.',
  5,
);

// Section 5 — Curve Sketching

const CS = 'Curve Sketching';

// Horizontal asymptote of a rational with equal-degree numerator/denominator
{
  const sets: Array<[number, number]> = [
    [2, 1],
    [3, 1],
    [5, 1],
    [7, 1],
    [3, 2],
    [5, 2],
    [1, 4],
    [4, 2],
  ];
  for (const [a, b] of sets) {
    const numerator = `${a === 1 ? '' : a}x^2 + 1`;
    const denominator = `${b === 1 ? '' : b}x^2 + 3`;
    add(
      'behavior-cs',
      CS,
      `Find the horizontal asymptote of $f(x) = \\dfrac{${numerator}}{${denominator}}$.`,
      `$y = ${frac(a, b)}$`,
      [`$y = ${frac(b, a)}$`, '$y = 0$', `$y = ${a + b}$`, `$y = ${frac(-a, b)}$`],
      `With equal degrees, the horizontal asymptote is the ratio of leading coefficients: $y = ${frac(a, b)}$.`,
      2,
    );
  }
}

// Horizontal asymptote when the denominator has higher degree -> y = 0
{
  const sets: Array<[number, number]> = [
    [1, 3],
    [2, 5],
    [-1, 4],
    [3, 1],
    [4, 7],
    [-2, 2],
    [5, 6],
  ];
  for (const [p, q] of sets) {
    add(
      'behavior-cs',
      CS,
      `Find the horizontal asymptote of $f(x) = \\dfrac{${terms([[1, 'x'], [p, '']])}}{${terms([[1, 'x^2'], [q, '']])}}$.`,
      '$y = 0$',
      ['$y = 1$', `$y = ${p}$`, 'No horizontal asymptote', '$y = \\infty$'],
      'The denominator has higher degree than the numerator, so $f(x) \\to 0$ as $x \\to \\pm\\infty$: the asymptote is $y = 0$.',
      2,
    );
  }
}

// Vertical asymptotes of 1 / [(x - r)(x - s)]
{
  const pairs: Array<[number, number]> = [
    [1, 4],
    [-2, 3],
    [2, 5],
    [-3, 1],
    [3, 6],
    [-4, -1],
  ];
  for (const [r, s] of pairs) {
    const lo = Math.min(r, s);
    const hi = Math.max(r, s);
    add(
      'behavior-cs',
      CS,
      `Find the vertical asymptotes of $f(x) = \\dfrac{1}{${linearFactor(r)}${linearFactor(s)}}$.`,
      `$x = ${lo},\\ ${hi}$`,
      [`$x = ${-lo},\\ ${-hi}$`, '$x = 0$', `$y = ${lo},\\ ${hi}$`, `$x = ${lo}$`],
      `The denominator is zero at $x = ${lo}$ and $x = ${hi}$, where the function blows up: those are the vertical asymptotes.`,
      2,
    );
  }
}

// End behavior of polynomials
{
  const cases: Array<{ fn: string; toward: string; answer: string }> = [
    { fn: 'x^3 - 4x', toward: '\\infty', answer: '+\\infty' },
    { fn: 'x^3 - 4x', toward: '-\\infty', answer: '-\\infty' },
    { fn: '-2x^3 + x', toward: '\\infty', answer: '-\\infty' },
    { fn: '-2x^3 + x', toward: '-\\infty', answer: '+\\infty' },
    { fn: 'x^4 - 3x^2', toward: '\\infty', answer: '+\\infty' },
    { fn: '-x^4 + x', toward: '-\\infty', answer: '-\\infty' },
  ];
  for (const item of cases) {
    add(
      'behavior-cs',
      CS,
      `As $x \\to ${item.toward}$, what is the end behavior of $f(x) = ${item.fn}$?`,
      `$${item.answer}$`,
      ['$+\\infty$', '$-\\infty$', '$0$', 'Does not exist'].filter((label) => label !== `$${item.answer}$`),
      `The leading term dominates far out, so $f(x) \\to ${item.answer}$ as $x \\to ${item.toward}$.`,
      2,
    );
  }
}

// Shape from the signs of f' and f''
{
  const cases: Array<{ d1: string; d2: string; answer: string }> = [
    { d1: '> 0', d2: '> 0', answer: 'Increasing and concave up' },
    { d1: '> 0', d2: '< 0', answer: 'Increasing and concave down' },
    { d1: '< 0', d2: '> 0', answer: 'Decreasing and concave up' },
    { d1: '< 0', d2: '< 0', answer: 'Decreasing and concave down' },
  ];
  const allShapes = cases.map((item) => item.answer);
  for (const item of cases) {
    add(
      'behavior-cs',
      CS,
      `On an interval, $f'(x) ${item.d1}$ and $f''(x) ${item.d2}$. Which best describes the graph there?`,
      item.answer,
      allShapes.filter((label) => label !== item.answer),
      `The sign of $f'$ gives the direction and the sign of $f''$ gives the concavity, so the graph is ${item.answer.toLowerCase()}.`,
      2,
    );
  }
}

// y-intercept of a polynomial = constant term
{
  const cases: Array<{ fn: string; c: number }> = [
    { fn: 'x^3 - 2x^2 + 5', c: 5 },
    { fn: '2x^4 + x - 3', c: -3 },
    { fn: 'x^2 - 7', c: -7 },
    { fn: 'x^3 + 4', c: 4 },
  ];
  for (const item of cases) {
    add(
      'behavior-cs',
      CS,
      `Find the $y$-intercept of $f(x) = ${item.fn}$.`,
      `$${item.c}$`,
      [`$0$`, `$${-item.c}$`, `$${item.c + 1}$`],
      `The $y$-intercept is $f(0) = ${item.c}$, the constant term.`,
      1,
    );
  }
}

// x-intercepts of a factored quadratic
{
  const pairs: Array<[number, number]> = [
    [2, -3],
    [1, 5],
    [-4, 6],
    [-2, 4],
  ];
  for (const [r, s] of pairs) {
    const lo = Math.min(r, s);
    const hi = Math.max(r, s);
    add(
      'behavior-cs',
      CS,
      `Find the $x$-intercepts of $f(x) = ${linearFactor(r)}${linearFactor(s)}$.`,
      `$x = ${lo},\\ ${hi}$`,
      [`$x = ${-lo},\\ ${-hi}$`, '$x = 0$', `$x = ${lo}$`],
      `Setting each factor to zero gives $x = ${lo}$ and $x = ${hi}$.`,
      2,
    );
  }
}

// Hand-written, modeled on textbook exercises (verified)
add(
  'behavior-cs',
  CS,
  'Find the vertical asymptotes of $f(x) = \\dfrac{x^2 - x - 2}{x^2 - x - 6}$.',
  '$x = -2,\\ 3$',
  ['$x = 2,\\ -3$', '$x = -1,\\ 2$', '$x = 0$'],
  'The denominator factors as $(x - 3)(x + 2)$, zero at $x = 3$ and $x = -2$: those are the vertical asymptotes.',
  3,
);
add(
  'behavior-cs',
  CS,
  'Find the horizontal asymptote of $f(x) = \\dfrac{x^2 - x - 2}{x^2 - x - 6}$.',
  '$y = 1$',
  ['$y = 0$', '$y = -1$', 'No horizontal asymptote'],
  'Numerator and denominator have equal degree with leading coefficients $1$, so the horizontal asymptote is $y = 1$.',
  2,
);
add(
  'behavior-cs',
  CS,
  'Find the $y$-intercept of $f(x) = \\dfrac{x^2 - x - 2}{x^2 - x - 6}$.',
  '$\\dfrac{1}{3}$',
  ['$0$', '$1$', '$-\\dfrac{1}{3}$'],
  '$f(0) = \\dfrac{-2}{-6} = \\dfrac{1}{3}$.',
  2,
);
add(
  'behavior-cs',
  CS,
  'Find the horizontal asymptote of $f(x) = \\dfrac{5(x - 2)(x + 1)}{x^2 + 2x + 4}$.',
  '$y = 5$',
  ['$y = 1$', '$y = 0$', '$y = \\dfrac{1}{5}$'],
  'Expanding, the numerator has leading term $5x^2$ and the denominator $x^2$, so the horizontal asymptote is $y = 5$.',
  3,
);
add(
  'behavior-cs',
  CS,
  'Find the horizontal asymptote of $f(x) = \\dfrac{x^2 - 4}{x^2}$.',
  '$y = 1$',
  ['$y = 0$', '$y = -4$', 'No horizontal asymptote'],
  'Writing $f(x) = 1 - \\dfrac{4}{x^2}$, as $x \\to \\pm\\infty$ the second term vanishes, leaving $y = 1$.',
  2,
);
add(
  'behavior-cs',
  CS,
  'Find the vertical asymptote of $f(x) = \\dfrac{x^2 - 4}{x^2}$.',
  '$x = 0$',
  ['$x = \\pm 2$', '$x = 2$', 'None'],
  'The denominator $x^2$ is zero only at $x = 0$ (and the numerator is not), giving a single vertical asymptote there.',
  2,
);
add(
  'behavior-cs',
  CS,
  'Find the critical numbers of $f(x) = 3x^3 - 10x^2 + 4x + 10$.',
  '$x = \\dfrac{2}{9},\\ 2$',
  ['$x = 2,\\ 5$', '$x = -\\dfrac{2}{9},\\ 2$', '$x = 0,\\ 2$'],
  '$f\'(x) = 9x^2 - 20x + 4 = (9x - 2)(x - 2) = 0$ gives $x = \\tfrac{2}{9}$ and $x = 2$.',
  4,
);

export { behaviorOfFunctionsQuestions };
