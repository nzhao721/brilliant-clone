import type { PracticeQuestion } from '../questionBank';

/* Practice questions for "Limits" (Ch. 1), adapted from APEX Calculus (Hartman et al.) under CC BY-NC 4.0. */

const CHAPTER_ID = 'limits';

const CAT_INTRO = 'Introduction to Limits';
const CAT_EPS = 'The Epsilon-Delta Definition';
const CAT_ANALYTIC = 'Finding Limits Analytically';
const CAT_ONESIDED = 'One-Sided Limits';
const CAT_CONTINUITY = 'Continuity';
const CAT_INFINITY = 'Limits Involving Infinity';

const CHOICE_IDS = ['a', 'b', 'c', 'd', 'e'] as const;

// Deterministic rotation so the correct answer is not always in the same slot.
let rotationCounter = 0;
function rot(): number {
  rotationCounter += 1;
  return rotationCounter;
}

function normalize(label: string): string {
  return label.replace(/\$/g, '').replace(/\s+/g, ' ').trim();
}

/** Build a multiple-choice question: dedupe distractors, insert the correct answer at a rotated slot (needs >= 3 distractors). */
function makeQuestion(
  id: string,
  difficulty: number,
  category: string,
  prompt: string,
  correctLabel: string,
  distractorLabels: string[],
  explanation: string,
): PracticeQuestion {
  const seen = new Set<string>([normalize(correctLabel)]);
  const distractors: string[] = [];
  for (const label of distractorLabels) {
    const key = normalize(label);
    if (key.length > 0 && !seen.has(key)) {
      seen.add(key);
      distractors.push(label);
    }
    if (distractors.length === 4) {
      break;
    }
  }
  const labels = [...distractors];
  const total = labels.length + 1;
  const slot = ((rot() % total) + total) % total;
  labels.splice(slot, 0, correctLabel);
  const choices = labels.map((label, index) => ({ id: CHOICE_IDS[index], label }));
  return {
    id,
    chapterId: CHAPTER_ID,
    category,
    prompt,
    choices,
    correctChoiceId: CHOICE_IDS[slot],
    explanation,
    difficulty,
  };
}

function fmt(value: number): string {
  if (Object.is(value, -0)) {
    return '0';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Math.round(value * 1000) / 1000);
}

/** Build a numeric question with integer-safe, always-distinct distractors. */
function numericQuestion(
  id: string,
  difficulty: number,
  category: string,
  prompt: string,
  correct: number,
  candidates: number[],
  explanation: string,
): PracticeQuestion {
  const chosen: number[] = [];
  const has = (v: number) =>
    Math.abs(v - correct) < 1e-9 || chosen.some((u) => Math.abs(u - v) < 1e-9);
  for (const candidate of candidates) {
    if (!has(candidate)) {
      chosen.push(candidate);
    }
  }
  let k = 1;
  while (chosen.length < 3) {
    if (!has(correct + k)) {
      chosen.push(correct + k);
    }
    if (chosen.length < 3 && !has(correct - k)) {
      chosen.push(correct - k);
    }
    k += 1;
  }
  const distractors = chosen.slice(0, 3).map((v) => `$${fmt(v)}$`);
  return makeQuestion(id, difficulty, category, prompt, `$${fmt(correct)}$`, distractors, explanation);
}

function tag(n: number): string {
  return n < 0 ? `m${-n}` : `${n}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

/** KaTeX source for the reduced fraction p/q (renders an integer when q | p). */
function fracTex(num: number, den: number): string {
  let p = num;
  let q = den;
  if (q < 0) {
    p = -p;
    q = -q;
  }
  const g = gcd(p, q);
  p = Math.trunc(p / g);
  q = Math.trunc(q / g);
  if (q === 1) {
    return `${p}`;
  }
  if (p < 0) {
    return `-\\dfrac{${-p}}{${q}}`;
  }
  return `\\dfrac{${p}}{${q}}`;
}

/** "+ n" or "- |n|" for inline arithmetic in explanations. */
function signed(n: number): string {
  return n < 0 ? `- ${-n}` : `+ ${n}`;
}

function powTex(deg: number): string {
  return deg === 1 ? 'x' : `x^{${deg}}`;
}

/** A polynomial of the given degree/leading coefficient (lower terms never affect a limit at infinity). */
function polyTex(coef: number, deg: number): string {
  if (deg === 0) {
    return `${coef}`;
  }
  const p = powTex(deg);
  const lead = coef === 1 ? p : coef === -1 ? `-${p}` : `${coef}${p}`;
  return `${lead} + 3`;
}

/** a x^2 [+ b x] [+ d], with tidy signs and coefficients. */
function quadFull(a: number, b: number, d: number): string {
  let s = a === 1 ? 'x^2' : a === -1 ? '-x^2' : `${a}x^2`;
  if (b !== 0) {
    s += ` ${b > 0 ? '+' : '-'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`;
  }
  if (d !== 0) {
    s += ` ${d > 0 ? '+' : '-'} ${Math.abs(d)}`;
  }
  return s;
}

/** m x [+ b], with tidy signs. */
function linTex(m: number, b: number): string {
  let s = m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`;
  if (b !== 0) {
    s += ` ${b > 0 ? '+' : '-'} ${Math.abs(b)}`;
  }
  return s;
}

/** a x^2 [+ b x] (no constant), with tidy signs. */
function quadCoefTex(a: number, b: number): string {
  let s = a === 1 ? 'x^2' : a === -1 ? '-x^2' : `${a}x^2`;
  if (b !== 0) {
    s += ` ${b > 0 ? '+' : '-'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x`;
  }
  return s;
}

/** "|x - c|" written so the inside reads cleanly for negative c. */
function absArg(c: number): string {
  return c < 0 ? `x+${-c}` : `x-${c}`;
}

/** "(x - r)" written so the inside reads cleanly for negative r. */
function factorTex(r: number): string {
  return r < 0 ? `(x+${-r})` : `(x-${r})`;
}

function piecewiseTex(c: number, m1: number, b1: number, m2: number, b2: number): string {
  return `f(x)=\\begin{cases} ${linTex(m1, b1)} & x<${c} \\\\ ${linTex(m2, b2)} & x\\ge ${c} \\end{cases}`;
}

// Section 1: An Introduction to Limits

const introConceptual: PracticeQuestion[] = [
  makeQuestion(
    'limits-intro-c01',
    1,
    CAT_INTRO,
    'When we write $\\lim_{x\\to c} f(x)$, which value are we describing?',
    'The value $f(x)$ approaches as $x$ approaches $c$',
    ['The value $f(c)$ exactly', 'The slope of $f$ at $x=c$', 'The area under $f$ near $x=c$'],
    'A limit names the value the outputs near as the inputs near $c$ — not necessarily $f(c)$, which may differ or be undefined.',
  ),
  makeQuestion(
    'limits-intro-c02',
    2,
    CAT_INTRO,
    'Direct substitution gives the expression $\\dfrac{0}{0}$. This is called:',
    'an indeterminate form',
    ['a vertical asymptote', 'a removable maximum', 'always equal to $1$'],
    'The form $\\dfrac{0}{0}$ is indeterminate: by itself it gives no information about the limit, so more work is required.',
  ),
  makeQuestion(
    'limits-intro-c03',
    2,
    CAT_INTRO,
    'As $x$ approaches $0$, the value of $\\dfrac{\\sin x}{x}$ approaches:',
    '$1$',
    ['$0$', '$\\infty$', 'undefined'],
    'Although substituting $x=0$ gives the indeterminate form $\\dfrac{0}{0}$, the outputs close in on $1$, so $\\lim_{x\\to 0}\\dfrac{\\sin x}{x}=1$.',
  ),
  makeQuestion(
    'limits-intro-c04',
    3,
    CAT_INTRO,
    'Which of these is NOT one of the three common ways a limit fails to exist at $x=c$?',
    'The function equals zero at $c$',
    [
      'The left and right values differ',
      'The function grows without bound',
      'The function oscillates near $c$',
    ],
    'A limit can fail when the one-sided values differ, when the function is unbounded, or when it oscillates. Simply having $f(c)=0$ does not prevent a limit.',
  ),
  makeQuestion(
    'limits-intro-c05',
    2,
    CAT_INTRO,
    'The difference quotient $\\dfrac{f(a+h)-f(a)}{h}$ represents which quantity?',
    'The average rate of change, i.e. the slope of the secant line',
    ['The exact area under $f$', 'The value $f(a)$', 'The slope of a vertical line'],
    'It is "rise over run" between two points on the graph: the slope of the secant line, which is the average rate of change.',
  ),
  makeQuestion(
    'limits-intro-c06',
    2,
    CAT_INTRO,
    'Suppose $f(5)=2$ but the graph approaches height $7$ from both sides of $x=5$. What is $\\lim_{x\\to 5} f(x)$?',
    '$7$',
    ['$2$', 'It does not exist', '$4.5$'],
    'The limit depends only on nearby outputs, which approach $7$. The single value $f(5)=2$ is irrelevant.',
  ),
  makeQuestion(
    'limits-intro-c07',
    5,
    CAT_INTRO,
    'Why does $\\lim_{x\\to 0}\\sin\\!\\left(\\dfrac{1}{x}\\right)$ fail to exist?',
    'It oscillates between $-1$ and $1$ without settling',
    ['It grows without bound', 'It approaches $0$', 'It approaches $1$'],
    'Near $0$ the argument $1/x$ races through huge values, so the sine takes every value in $[-1,1]$ infinitely often and never settles.',
  ),
  makeQuestion(
    'limits-intro-c08',
    2,
    CAT_INTRO,
    'As $x\\to 1$, the outputs of $\\dfrac{1}{(x-1)^2}$ grow larger and larger. What is $\\lim_{x\\to 1}\\dfrac{1}{(x-1)^2}$?',
    'It does not exist; the outputs grow without bound',
    ['$0$', '$1$', '$\\dfrac{1}{2}$'],
    'The denominator is tiny and positive near $1$, so the quotient grows without bound and there is no finite limiting value.',
  ),
  makeQuestion(
    'limits-intro-c09',
    2,
    CAT_INTRO,
    'When approximating a limit numerically with a table, the best practice is to use $x$-values that are:',
    'on both sides of $c$, getting closer to $c$',
    ['only greater than $c$', 'only equal to $c$', 'far away from $c$'],
    'Using values approaching $c$ from both sides reveals the trend and guards against mistaking a one-sided behavior for the limit.',
  ),
  makeQuestion(
    'limits-intro-c10',
    2,
    CAT_INTRO,
    'A secant line passes through two points on the graph of $f$. Its slope equals:',
    'the difference quotient over that interval',
    ['the value $f$ at the midpoint', 'zero, since it is a chord', 'the area between the points'],
    'The slope of the secant is $\\dfrac{f(b)-f(a)}{b-a}$, exactly the difference quotient (average rate of change) over the interval.',
  ),
];

const introEstimate: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const aValues = [1, 2, 3, -1, -2];
  const bd: Array<[number, number]> = [
    [3, -5],
    [-1, 4],
  ];
  for (const a of aValues) {
    for (const [b, d] of bd) {
      const correct = a * a + b * a + d;
      out.push(
        numericQuestion(
          `limits-intro-est-${tag(a)}-${tag(b)}-${tag(d)}`,
          2,
          CAT_INTRO,
          `As $x$ approaches $${a}$, a table of values of $f(x)=${quadFull(1, b, d)}$ settles toward a single height. Estimate $\\lim_{x\\to ${a}} f(x)$.`,
          correct,
          [a * a - b * a + d, a * a + d, correct + 2, correct - 3],
          `The function is a continuous polynomial, so the limit equals the value at $x=${a}$: it works out to $${correct}$.`,
        ),
      );
    }
  }
  return out;
})();

const introDiffLinear: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const mValues = [2, 3, -1, 4, 5, -2];
  const bValues = [1, -3];
  for (const m of mValues) {
    for (const b of bValues) {
      out.push(
        numericQuestion(
          `limits-intro-dql-${tag(m)}-${tag(b)}`,
          2,
          CAT_INTRO,
          `For the line $f(x)=${linTex(m, b)}$, the difference quotient $\\dfrac{f(a+h)-f(a)}{h}$ simplifies to a constant. What is $\\lim_{h\\to 0}\\dfrac{f(a+h)-f(a)}{h}$?`,
          m,
          [m + 1, m - 1, 2 * m, -m, b],
          `For a line the difference quotient equals the slope $${m}$ for every $h$, so the limit is $${m}$.`,
        ),
      );
    }
  }
  return out;
})();

const introDiffQuadratic: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const aValues = [1, 2, -1];
  const bValues = [3, -2, 5];
  const xValues = [1, 2];
  for (const a of aValues) {
    for (const b of bValues) {
      for (const x0 of xValues) {
        const correct = 2 * a * x0 + b;
        out.push(
          numericQuestion(
            `limits-intro-dqq-${tag(a)}-${tag(b)}-${tag(x0)}`,
            4,
            CAT_INTRO,
            `Let $f(x)=${quadCoefTex(a, b)}$. Evaluate $\\lim_{h\\to 0}\\dfrac{f(${x0}+h)-f(${x0})}{h}$.`,
            correct,
            [2 * a * x0 - b, a * x0 + b, 2 * a * x0, correct + 1],
            `The difference quotient simplifies to $2ax+b$; at $x=${x0}$ this is $2(${a})(${x0})+(${b})=${correct}$.`,
          ),
        );
      }
    }
  }
  return out;
})();

// Section 2: The Epsilon-Delta Definition

const epsConceptual: PracticeQuestion[] = [
  makeQuestion(
    'limits-eps-c01',
    1,
    CAT_EPS,
    'In the precise definition of a limit, what does $\\varepsilon$ measure?',
    'The output tolerance: how close $f(x)$ must be to $L$',
    [
      'The input tolerance: how close $x$ must be to $c$',
      'The value of the limit itself',
      'The slope of $f$ at $c$',
    ],
    '$\\varepsilon$ is the required closeness of the output $f(x)$ to $L$; the input radius found in response is $\\delta$.',
  ),
  makeQuestion(
    'limits-eps-c02',
    1,
    CAT_EPS,
    'In the precise definition of a limit, what does $\\delta$ measure?',
    'The input tolerance: how close $x$ must be to $c$',
    [
      'The output tolerance: how close $f(x)$ must be to $L$',
      'The value of the limit itself',
      'The maximum of $f$',
    ],
    '$\\delta$ is the input radius around $c$ chosen so that the outputs land within $\\varepsilon$ of $L$.',
  ),
  makeQuestion(
    'limits-eps-c03',
    2,
    CAT_EPS,
    'In establishing a limit, which tolerance is given first?',
    'The output tolerance $\\varepsilon$',
    ['The input tolerance $\\delta$', 'Both at once', 'Neither; they are unrelated'],
    'The challenge $\\varepsilon$ is named first; the limit holds if we can then find a $\\delta$ that works for it.',
  ),
  makeQuestion(
    'limits-eps-c04',
    2,
    CAT_EPS,
    'The statement $|x-c|<\\delta$ is equivalent to:',
    '$c-\\delta < x < c+\\delta$',
    ['$x < c+\\delta$ only', '$0 < x < c\\delta$', '$-\\delta < x < \\delta$'],
    'Absolute value measures distance, so $|x-c|<\\delta$ means $x$ lies within $\\delta$ of $c$: $c-\\delta < x < c+\\delta$.',
  ),
  makeQuestion(
    'limits-eps-c05',
    1,
    CAT_EPS,
    'In the definition of a limit, $\\delta$ must always be:',
    'positive',
    ['negative', 'zero', 'an integer'],
    'A distance tolerance $\\delta$ must be a positive number so that the interval $(c-\\delta, c+\\delta)$ is nonempty.',
  ),
  makeQuestion(
    'limits-eps-c06',
    1,
    CAT_EPS,
    'In the definition of a limit, $\\varepsilon$ must always be:',
    'positive',
    ['negative', 'zero', 'less than $\\delta$'],
    'The tolerance $\\varepsilon$ is a positive number; the definition must hold for every $\\varepsilon>0$.',
  ),
  makeQuestion(
    'limits-eps-c07',
    2,
    CAT_EPS,
    'The condition $0<|x-c|$ in the definition is there to:',
    'exclude $x=c$ itself, so $f(c)$ never matters',
    [
      'force $x$ to be positive',
      'require the limit to be positive',
      'make $\\delta$ negative',
    ],
    'Writing $0<|x-c|$ removes $x=c$ from consideration, matching the idea that a limit ignores the value at the point.',
  ),
  makeQuestion(
    'limits-eps-c08',
    2,
    CAT_EPS,
    'The statement "$f(x)$ is within $\\varepsilon$ of $L$" is written:',
    '$|f(x)-L|<\\varepsilon$',
    ['$|x-L|<\\varepsilon$', '$|f(x)-c|<\\delta$', '$f(x)=L+\\varepsilon$'],
    'Distance from the output to $L$ is $|f(x)-L|$, so "within $\\varepsilon$" is $|f(x)-L|<\\varepsilon$.',
  ),
  makeQuestion(
    'limits-eps-c09',
    2,
    CAT_EPS,
    'After the backward "scratch-work" in a limit proof, the chosen $\\delta$ is expressed in terms of:',
    '$\\varepsilon$',
    ['$x$', 'the value $f(c)$', 'nothing; $\\delta$ is a fixed number'],
    'The whole point is to respond to a given $\\varepsilon$, so $\\delta$ is written as a formula in $\\varepsilon$.',
  ),
  makeQuestion(
    'limits-eps-c10',
    3,
    CAT_EPS,
    'Which line correctly completes the definition: "$\\lim_{x\\to c} f(x)=L$ means for every $\\varepsilon>0$ there exists $\\delta>0$ such that ..."?',
    'if $0<|x-c|<\\delta$ then $|f(x)-L|<\\varepsilon$',
    [
      'if $|f(x)-L|<\\delta$ then $|x-c|<\\varepsilon$',
      'if $x<\\delta$ then $f(x)<\\varepsilon$',
      'if $|x-c|>\\delta$ then $|f(x)-L|>\\varepsilon$',
    ],
    'The input closeness drives the output closeness: $0<|x-c|<\\delta$ implies $|f(x)-L|<\\varepsilon$.',
  ),
  makeQuestion(
    'limits-eps-c11',
    3,
    CAT_EPS,
    'For $f(x)=2x$, the difference $|f(x)-L|$ equals:',
    '$2|x-c|$',
    ['$|x-c|$', '$\\dfrac{1}{2}|x-c|$', '$|x-c|^2$'],
    'With $L=2c$, $|2x-2c|=2|x-c|$, which is why $\\delta=\\varepsilon/2$ works for this line.',
  ),
  makeQuestion(
    'limits-eps-c12',
    3,
    CAT_EPS,
    'Why does the value of a limit not depend on $f(c)$?',
    'Because the definition only constrains $x$ with $0<|x-c|<\\delta$',
    [
      'Because $f(c)$ is always undefined',
      'Because $\\varepsilon$ equals $f(c)$',
      'Because limits ignore $\\delta$',
    ],
    'The clause $0<|x-c|$ excludes $x=c$, so the value $f(c)$ plays no role in the definition.',
  ),
];

const epsLine: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const mValues = [2, 3, 4, 5, 6];
  const cValues = [1, 2, 3];
  const bValues = [1, -2];
  for (const m of mValues) {
    for (const c of cValues) {
      for (const b of bValues) {
        const am = Math.abs(m);
        const L = m * c + b;
        out.push(
          makeQuestion(
            `limits-eps-line-${tag(m)}-${tag(c)}-${tag(b)}`,
            4,
            CAT_EPS,
            `For $f(x)=${linTex(m, b)}$ near $x=${c}$ (so $L=${L}$), which $\\delta$ guarantees $|f(x)-L|<\\varepsilon$?`,
            `$\\delta = \\dfrac{\\varepsilon}{${am}}$`,
            [
              '$\\delta = \\varepsilon$',
              `$\\delta = ${am}\\varepsilon$`,
              '$\\delta = \\varepsilon^2$',
              `$\\delta = \\dfrac{\\varepsilon}{${am + 1}}$`,
            ],
            `Since $|f(x)-L|=${am}\\,|x-${c}|$, requiring this $<\\varepsilon$ gives $|x-${c}|<\\dfrac{\\varepsilon}{${am}}$.`,
          ),
        );
      }
    }
  }
  return out;
})();

const epsInterval: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const cValues = [1, 2, 3, 4, -1, -2];
  const dValues = [1, 2, 3];
  for (const c of cValues) {
    for (const d of dValues) {
      out.push(
        makeQuestion(
          `limits-eps-int-${tag(c)}-${tag(d)}`,
          2,
          CAT_EPS,
          `Rewrite $|${absArg(c)}| < ${d}$ as an interval.`,
          `$${c - d} < x < ${c + d}$`,
          [
            `$${-d} < x < ${d}$`,
            `$${c} < x < ${c + d}$`,
            `$${c - d} < x < ${c}$`,
            `$0 < x < ${c * d}$`,
          ],
          `$|${absArg(c)}|<${d}$ says $x$ is within $${d}$ of $${c}$, i.e. $${c - d} < x < ${c + d}$.`,
        ),
      );
    }
  }
  return out;
})();

// Section 3: Finding Limits Analytically

const analyticConceptual: PracticeQuestion[] = [
  makeQuestion(
    'limits-an-c01',
    1,
    CAT_ANALYTIC,
    'If $\\lim_{x\\to c} f(x)=L$ and $\\lim_{x\\to c} g(x)=K$, then $\\lim_{x\\to c}\\big(f(x)+g(x)\\big)$ equals:',
    '$L+K$',
    ['$LK$', '$L-K$', '$\\dfrac{L}{K}$'],
    'The Sum rule says the limit of a sum is the sum of the limits: $L+K$.',
  ),
  makeQuestion(
    'limits-an-c02',
    2,
    CAT_ANALYTIC,
    'The quotient rule $\\lim \\dfrac{f}{g}=\\dfrac{\\lim f}{\\lim g}$ is valid only when:',
    'the limit of the denominator is not zero',
    [
      'the limit of the numerator is not zero',
      'both limits are positive',
      'it always applies, with no conditions',
    ],
    'Dividing by a limit of zero is the problem case, so the denominator limit must be nonzero.',
  ),
  makeQuestion(
    'limits-an-c03',
    2,
    CAT_ANALYTIC,
    'For a polynomial $p$, the limit $\\lim_{x\\to c} p(x)$ equals:',
    '$p(c)$',
    ['$0$', '$p(0)$', 'the leading coefficient of $p$'],
    'Polynomials are continuous, so their limits are found by direct substitution: $\\lim_{x\\to c} p(x)=p(c)$.',
  ),
  makeQuestion(
    'limits-an-c04',
    2,
    CAT_ANALYTIC,
    'Direct substitution produces $\\dfrac{0}{0}$. What does this tell you?',
    'The form is indeterminate; simplify (e.g. factor and cancel) and try again',
    [
      'The limit is automatically $0$',
      'The limit is automatically $1$',
      'The limit cannot exist',
    ],
    'The $\\dfrac{0}{0}$ form means more work is needed; often a shared factor cancels to reveal the limit.',
  ),
  makeQuestion(
    'limits-an-c05',
    2,
    CAT_ANALYTIC,
    'The special limit $\\lim_{x\\to 0}\\dfrac{\\sin x}{x}$ equals:',
    '$1$',
    ['$0$', '$\\infty$', 'does not exist'],
    'This special limit equals $1$, provable by squeezing $\\dfrac{\\sin\\theta}{\\theta}$ between $\\cos\\theta$ and $1$.',
  ),
  makeQuestion(
    'limits-an-c06',
    2,
    CAT_ANALYTIC,
    'The special limit $\\lim_{x\\to 0}\\dfrac{\\cos x - 1}{x}$ equals:',
    '$0$',
    ['$1$', '$-1$', 'does not exist'],
    'This is a standard special limit with value $0$.',
  ),
  makeQuestion(
    'limits-an-c07',
    3,
    CAT_ANALYTIC,
    'The Squeeze Theorem says that if $f(x)\\le g(x)\\le h(x)$ near $c$ and $\\lim_{x\\to c} f=\\lim_{x\\to c} h=L$, then:',
    '$\\lim_{x\\to c} g(x)=L$',
    [
      '$\\lim_{x\\to c} g(x)=0$',
      '$g$ has no limit at $c$',
      '$g(c)=L$ exactly',
    ],
    'Being trapped between two functions that share the limit $L$ forces $g$ to share that limit too.',
  ),
  makeQuestion(
    'limits-an-c08',
    1,
    CAT_ANALYTIC,
    'For a constant $b$, the limit $\\lim_{x\\to c} b$ equals:',
    '$b$',
    ['$c$', '$0$', '$bc$'],
    'A constant function stays at $b$, so its limit is $b$ for any $c$.',
  ),
  makeQuestion(
    'limits-an-c09',
    1,
    CAT_ANALYTIC,
    'The identity limit $\\lim_{x\\to c} x$ equals:',
    '$c$',
    ['$0$', '$1$', '$x$'],
    'As $x$ approaches $c$, the value $x$ itself approaches $c$.',
  ),
  makeQuestion(
    'limits-an-c10',
    2,
    CAT_ANALYTIC,
    'For $x\\ne 1$, the expression $\\dfrac{x^2-1}{x-1}$ simplifies to:',
    '$x+1$',
    ['$x-1$', '$x$', '$x^2$'],
    'Factor the difference of squares: $\\dfrac{(x-1)(x+1)}{x-1}=x+1$ for $x\\ne 1$.',
  ),
  makeQuestion(
    'limits-an-c11',
    3,
    CAT_ANALYTIC,
    'The special limit $\\lim_{x\\to 0}(1+x)^{1/x}$ equals:',
    '$e$',
    ['$1$', '$0$', '$\\infty$'],
    'This famous special limit defines Euler\u2019s number: $(1+x)^{1/x}\\to e$ as $x\\to 0$.',
  ),
  makeQuestion(
    'limits-an-c12',
    3,
    CAT_ANALYTIC,
    'To evaluate $\\lim_{x\\to 9}\\dfrac{\\sqrt{x}-3}{x-9}$, a useful first step is to:',
    'multiply numerator and denominator by the conjugate $\\sqrt{x}+3$',
    [
      'substitute $x=9$ directly',
      'differentiate the numerator',
      'take the reciprocal of the expression',
    ],
    'Multiplying by the conjugate rationalizes the numerator, turning the ratio into $\\dfrac{1}{\\sqrt{x}+3}$.',
  ),
];

const analyticPolySub: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const aValues = [1, 2];
  const cValues = [2, 3, -1, -2];
  const bd: Array<[number, number]> = [
    [3, -5],
    [-1, 4],
  ];
  for (const a of aValues) {
    for (const c of cValues) {
      for (const [b, d] of bd) {
        const correct = a * c * c + b * c + d;
        out.push(
          numericQuestion(
            `limits-an-poly-${tag(a)}-${tag(c)}-${tag(b)}-${tag(d)}`,
            2,
            CAT_ANALYTIC,
            `Evaluate $\\lim_{x\\to ${c}}\\left(${quadFull(a, b, d)}\\right)$.`,
            correct,
            [a * c * c - b * c + d, a * c * c + d, correct + 2, correct - 3],
            `The expression is a polynomial, so substitute $x=${c}$: the result is $${correct}$.`,
          ),
        );
      }
    }
  }
  return out;
})();

const analyticDiffSquares: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  for (let k = 1; k <= 10; k += 1) {
    out.push(
      numericQuestion(
        `limits-an-sq-${k}`,
        3,
        CAT_ANALYTIC,
        `Evaluate $\\lim_{x\\to ${k}}\\dfrac{x^2-${k * k}}{x-${k}}$.`,
        2 * k,
        [k, k * k, 0, 2 * k + 1, 4 * k],
        `Factor the difference of squares: $\\dfrac{x^2-${k * k}}{x-${k}}=x+${k}$ for $x\\ne ${k}$, which is $${2 * k}$ at $x=${k}$.`,
      ),
    );
  }
  return out;
})();

const analyticFactorQuadratic: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const pairs: Array<[number, number]> = [
    [2, 5],
    [2, -3],
    [3, 1],
    [3, -2],
    [-1, 4],
    [-2, 3],
    [4, 2],
    [5, -1],
    [1, 6],
    [-3, 2],
    [2, 7],
    [6, 3],
  ];
  for (const [p, q] of pairs) {
    const correct = p - q;
    out.push(
      numericQuestion(
        `limits-an-fq-${tag(p)}-${tag(q)}`,
        3,
        CAT_ANALYTIC,
        `Evaluate $\\lim_{x\\to ${p}}\\dfrac{${quadFull(1, -(p + q), p * q)}}{${absArg(p)}}$.`,
        correct,
        [p + q, q - p, p * q, p, correct + 2],
        `The numerator factors as $${factorTex(p)}${factorTex(q)}$; canceling $${factorTex(p)}$ leaves a linear factor equal to $${correct}$ at $x=${p}$.`,
      ),
    );
  }
  return out;
})();

const analyticLimitLaws: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const pairs: Array<[number, number]> = [
    [6, 3],
    [2, 5],
    [4, 2],
    [3, -2],
    [5, 1],
    [-2, 4],
    [7, 3],
  ];
  for (const [L, K] of pairs) {
    out.push(
      numericQuestion(
        `limits-an-law-sum-${tag(L)}-${tag(K)}`,
        2,
        CAT_ANALYTIC,
        `Suppose $\\lim_{x\\to 2} f(x)=${L}$ and $\\lim_{x\\to 2} g(x)=${K}$. Find $\\lim_{x\\to 2}\\big(f(x)+g(x)\\big)$.`,
        L + K,
        [L - K, L * K, L, K],
        `By the Sum rule, $\\lim (f+g)=${L} ${signed(K)} = ${L + K}$.`,
      ),
    );
    out.push(
      numericQuestion(
        `limits-an-law-prod-${tag(L)}-${tag(K)}`,
        2,
        CAT_ANALYTIC,
        `Suppose $\\lim_{x\\to 2} f(x)=${L}$ and $\\lim_{x\\to 2} g(x)=${K}$. Find $\\lim_{x\\to 2}\\big(f(x)\\,g(x)\\big)$.`,
        L * K,
        [L + K, L - K, L * K + 1, 2 * L * K],
        `By the Product rule, $\\lim (fg)=(${L})(${K}) = ${L * K}$.`,
      ),
    );
  }
  return out;
})();

const analyticTrig: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  for (let k = 2; k <= 9; k += 1) {
    out.push(
      numericQuestion(
        `limits-an-trig-${k}`,
        3,
        CAT_ANALYTIC,
        `Evaluate $\\lim_{x\\to 0}\\dfrac{\\sin ${k}x}{x}$.`,
        k,
        [1, 0, k + 1, k - 1, 2 * k],
        `Write $\\dfrac{\\sin ${k}x}{x}=${k}\\cdot\\dfrac{\\sin ${k}x}{${k}x}$; since $\\dfrac{\\sin ${k}x}{${k}x}\\to 1$, the limit is $${k}$.`,
      ),
    );
  }
  return out;
})();

const analyticExercises: PracticeQuestion[] = [
  makeQuestion(
    'limits-an-ex01',
    2,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 3}\\left(x^2-3x+7\\right)$.',
    '$7$',
    ['$9$', '$16$', '$1$'],
    'Substitute the continuous polynomial: $3^2-3(3)+7 = 9-9+7 = 7$.',
  ),
  makeQuestion(
    'limits-an-ex02',
    2,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 8}\\left(x^2+5x-3\\right)$.',
    '$101$',
    ['$99$', '$53$', '$61$'],
    'Substitute: $8^2+5(8)-3 = 64+40-3 = 101$.',
  ),
  makeQuestion(
    'limits-an-ex03',
    2,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to -1}\\left(x^3-x^2+x+1\\right)$.',
    '$-2$',
    ['$0$', '$2$', '$4$'],
    'Substitute: $(-1)^3-(-1)^2+(-1)+1 = -1-1-1+1 = -2$.',
  ),
  makeQuestion(
    'limits-an-ex04',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 6}\\dfrac{x^2-4x-12}{x^2-13x+42}$.',
    '$-8$',
    ['$8$', '$0$', 'does not exist'],
    'Factor: $\\dfrac{(x-6)(x+2)}{(x-6)(x-7)}=\\dfrac{x+2}{x-7}$ for $x\\ne 6$; at $x=6$ this is $\\dfrac{8}{-1}=-8$.',
  ),
  makeQuestion(
    'limits-an-ex05',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 2}\\dfrac{x^2+6x-16}{x^2-3x+2}$.',
    '$10$',
    ['$-10$', '$1$', 'does not exist'],
    'Factor: $\\dfrac{(x+8)(x-2)}{(x-1)(x-2)}=\\dfrac{x+8}{x-1}$ for $x\\ne 2$; at $x=2$ this is $\\dfrac{10}{1}=10$.',
  ),
  makeQuestion(
    'limits-an-ex06',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to -2}\\dfrac{x^2-5x-14}{x^2+10x+16}$.',
    '$-\\dfrac{3}{2}$',
    ['$\\dfrac{3}{2}$', '$-9$', 'does not exist'],
    'Factor: $\\dfrac{(x-7)(x+2)}{(x+2)(x+8)}=\\dfrac{x-7}{x+8}$ for $x\\ne -2$; at $x=-2$ this is $\\dfrac{-9}{6}=-\\dfrac{3}{2}$.',
  ),
  makeQuestion(
    'limits-an-ex07',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 1}\\dfrac{x^2-6x+5}{x^2-3x+2}$.',
    '$4$',
    ['$-4$', '$1$', 'does not exist'],
    'Factor: $\\dfrac{(x-1)(x-5)}{(x-1)(x-2)}=\\dfrac{x-5}{x-2}$ for $x\\ne 1$; at $x=1$ this is $\\dfrac{-4}{-1}=4$.',
  ),
  makeQuestion(
    'limits-an-ex08',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to -6}\\dfrac{x^2-36}{x^2+9x+18}$.',
    '$4$',
    ['$-4$', '$0$', 'does not exist'],
    'Factor: $\\dfrac{(x-6)(x+6)}{(x+3)(x+6)}=\\dfrac{x-6}{x+3}$ for $x\\ne -6$; at $x=-6$ this is $\\dfrac{-12}{-3}=4$.',
  ),
  makeQuestion(
    'limits-an-ex09',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to -4}\\dfrac{x^2+5x+4}{x^2-2x-24}$.',
    '$\\dfrac{3}{10}$',
    ['$\\dfrac{10}{3}$', '$0$', 'does not exist'],
    'Factor: $\\dfrac{(x+1)(x+4)}{(x-6)(x+4)}=\\dfrac{x+1}{x-6}$ for $x\\ne -4$; at $x=-4$ this is $\\dfrac{-3}{-10}=\\dfrac{3}{10}$.',
  ),
  makeQuestion(
    'limits-an-ex10',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 9}\\dfrac{x^2-7x-18}{x^2-10x+9}$.',
    '$\\dfrac{11}{8}$',
    ['$\\dfrac{8}{11}$', '$1$', 'does not exist'],
    'Factor: $\\dfrac{(x-9)(x+2)}{(x-9)(x-1)}=\\dfrac{x+2}{x-1}$ for $x\\ne 9$; at $x=9$ this is $\\dfrac{11}{8}$.',
  ),
  makeQuestion(
    'limits-an-ex11',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 0}\\dfrac{x^2+8x}{x^2+6x}$.',
    '$\\dfrac{4}{3}$',
    ['$\\dfrac{3}{4}$', '$0$', 'does not exist'],
    'Factor out $x$: $\\dfrac{x(x+8)}{x(x+6)}=\\dfrac{x+8}{x+6}$ for $x\\ne 0$; at $x=0$ this is $\\dfrac{8}{6}=\\dfrac{4}{3}$.',
  ),
  makeQuestion(
    'limits-an-ex12',
    5,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 3}\\dfrac{x^3-2x^2-5x+6}{2x^3+3x^2-32x+15}$.',
    '$\\dfrac{1}{4}$',
    ['$4$', '$\\dfrac{1}{2}$', 'does not exist'],
    'Cancel the common factor $(x-3)$: the ratio becomes $\\dfrac{x^2+x-2}{2x^2+9x-5}$, which is $\\dfrac{10}{40}=\\dfrac{1}{4}$ at $x=3$.',
  ),
  makeQuestion(
    'limits-an-ex13',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 0}\\dfrac{\\sin 2x}{x}$.',
    '$2$',
    ['$1$', '$\\dfrac{1}{2}$', '$0$'],
    'Write $\\dfrac{\\sin 2x}{x}=2\\cdot\\dfrac{\\sin 2x}{2x}\\to 2\\cdot 1 = 2$.',
  ),
  makeQuestion(
    'limits-an-ex14',
    3,
    CAT_ANALYTIC,
    'Evaluate $\\lim_{x\\to 0}\\dfrac{\\sin 3x}{7x}$.',
    '$\\dfrac{3}{7}$',
    ['$\\dfrac{7}{3}$', '$1$', '$0$'],
    'Write $\\dfrac{\\sin 3x}{7x}=\\dfrac{3}{7}\\cdot\\dfrac{\\sin 3x}{3x}\\to \\dfrac{3}{7}\\cdot 1 = \\dfrac{3}{7}$.',
  ),
];

// Section 4: One-Sided Limits

const oneSidedConceptual: PracticeQuestion[] = [
  makeQuestion(
    'limits-os-c01',
    2,
    CAT_ONESIDED,
    'The two-sided limit $\\lim_{x\\to c} f(x)$ exists if and only if:',
    'the left- and right-hand limits both exist and are equal',
    [
      '$f(c)$ is defined',
      'the left-hand limit exists',
      '$f$ is increasing at $c$',
    ],
    '$\\lim_{x\\to c} f(x)=L$ exactly when $\\lim_{x\\to c^-} f(x)=\\lim_{x\\to c^+} f(x)=L$.',
  ),
  makeQuestion(
    'limits-os-c02',
    1,
    CAT_ONESIDED,
    'The notation $\\lim_{x\\to c^-} f(x)$ refers to inputs with:',
    '$x<c$ (approaching from the left)',
    ['$x>c$ (approaching from the right)', 'negative $x$ only', '$x=c$ only'],
    'The minus superscript marks the left side: only inputs less than $c$ are used.',
  ),
  makeQuestion(
    'limits-os-c03',
    1,
    CAT_ONESIDED,
    'The notation $\\lim_{x\\to c^+} f(x)$ refers to inputs with:',
    '$x>c$ (approaching from the right)',
    ['$x<c$ (approaching from the left)', 'positive $x$ only', '$x=c$ only'],
    'The plus superscript marks the right side: only inputs greater than $c$ are used.',
  ),
  makeQuestion(
    'limits-os-c04',
    2,
    CAT_ONESIDED,
    'If $\\lim_{x\\to 1^-} f(x)=5$, can you conclude $\\lim_{x\\to 1} f(x)=5$?',
    'No; the right-hand limit might differ or not exist',
    [
      'Yes, always',
      'Yes, because one side is enough',
      'No; the limit must be $0$',
    ],
    'A two-sided limit needs both sides to agree, so knowing only the left-hand limit is not enough.',
  ),
  makeQuestion(
    'limits-os-c05',
    2,
    CAT_ONESIDED,
    'If $\\lim_{x\\to 1} f(x)=5$, what is $\\lim_{x\\to 1^-} f(x)$?',
    '$5$',
    ['It cannot be determined', '$0$', 'does not exist'],
    'When the two-sided limit exists, both one-sided limits exist and equal it, so the left-hand limit is $5$.',
  ),
  makeQuestion(
    'limits-os-c06',
    2,
    CAT_ONESIDED,
    'The superscript in $\\lim_{x\\to c^+} f(x)$ indicates:',
    'the side of approach, not a sign of any number',
    [
      'that $c$ is positive',
      'that $f(x)$ is positive',
      'that the limit is $+\\infty$',
    ],
    'It is purely a direction marker: approach $c$ using values just above it.',
  ),
  makeQuestion(
    'limits-os-c07',
    2,
    CAT_ONESIDED,
    'What is $\\lim_{x\\to 0^-}\\dfrac{1}{x}$?',
    '$-\\infty$',
    ['$+\\infty$', '$0$', '$1$'],
    'For small negative $x$, $\\dfrac{1}{x}$ is large and negative, so the left-hand limit is $-\\infty$.',
  ),
  makeQuestion(
    'limits-os-c08',
    2,
    CAT_ONESIDED,
    'What is $\\lim_{x\\to 0^+}\\dfrac{1}{x}$?',
    '$+\\infty$',
    ['$-\\infty$', '$0$', '$1$'],
    'For small positive $x$, $\\dfrac{1}{x}$ is large and positive, so the right-hand limit is $+\\infty$.',
  ),
  makeQuestion(
    'limits-os-c09',
    3,
    CAT_ONESIDED,
    'For $f(x)=\\dfrac{|x|}{x}$, what is $\\lim_{x\\to 0} f(x)$?',
    'It does not exist',
    ['$0$', '$1$', '$-1$'],
    'The left side gives $-1$ and the right side gives $1$; since they differ, the two-sided limit does not exist.',
  ),
  makeQuestion(
    'limits-os-c10',
    2,
    CAT_ONESIDED,
    'Which list gives the three ways a limit can fail to exist at $c$?',
    'different one-sided values; unbounded growth; oscillation',
    [
      'positive values; negative values; zero values',
      'continuity; differentiability; integrability',
      'left limit; right limit; midpoint limit',
    ],
    'A limit fails when the sides disagree, when the function is unbounded, or when it oscillates without settling.',
  ),
];

const oneSidedPiecewise: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const sets: Array<[number, number, number, number, number]> = [
    [1, 2, 0, -1, 3],
    [1, 1, 0, -1, 3],
    [2, 1, 1, 2, -1],
    [0, 1, 3, 2, 1],
    [3, 1, -2, 2, -5],
    [-1, 2, 5, 1, 1],
    [2, -1, 4, 1, 0],
    [1, 3, -1, 1, 1],
    [-2, 1, 6, 2, 9],
    [4, 1, -3, 2, -7],
    [2, 2, -1, 1, 1],
    [1, -2, 5, 3, -2],
  ];
  sets.forEach(([c, m1, b1, m2, b2], index) => {
    const left = m1 * c + b1;
    const right = m2 * c + b2;
    const pw = piecewiseTex(c, m1, b1, m2, b2);
    out.push(
      numericQuestion(
        `limits-os-pw-${index + 1}-left`,
        2,
        CAT_ONESIDED,
        `For $${pw}$, find $\\lim_{x\\to ${c}^-} f(x)$.`,
        left,
        [right, left + 2, left - 2, 2 * left + 1],
        `Approaching from the left uses the piece $${linTex(m1, b1)}$, giving $${left}$ at $x=${c}$.`,
      ),
    );
    out.push(
      numericQuestion(
        `limits-os-pw-${index + 1}-right`,
        2,
        CAT_ONESIDED,
        `For $${pw}$, find $\\lim_{x\\to ${c}^+} f(x)$.`,
        right,
        [left, right + 2, right - 2, 2 * right + 1],
        `Approaching from the right uses the piece $${linTex(m2, b2)}$, giving $${right}$ at $x=${c}$.`,
      ),
    );
    if (left === right) {
      out.push(
        makeQuestion(
          `limits-os-pw-${index + 1}-both`,
          3,
          CAT_ONESIDED,
          `For $${pw}$, find $\\lim_{x\\to ${c}} f(x)$.`,
          `$${left}$`,
          [`$${left + 1}$`, `$${left - 1}$`, 'It does not exist'],
          `Both one-sided limits equal $${left}$, so the two-sided limit is $${left}$.`,
        ),
      );
    } else {
      out.push(
        makeQuestion(
          `limits-os-pw-${index + 1}-both`,
          3,
          CAT_ONESIDED,
          `For $${pw}$, find $\\lim_{x\\to ${c}} f(x)$.`,
          'It does not exist',
          [`$${left}$`, `$${right}$`, `$${Math.max(left, right) + 2}$`],
          `The left-hand limit is $${left}$ and the right-hand limit is $${right}$; since they differ, the two-sided limit does not exist.`,
        ),
      );
    }
  });
  return out;
})();

const oneSidedInfinite: PracticeQuestion[] = [
  makeQuestion(
    'limits-os-inf01',
    2,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 0^-}\\dfrac{1}{x}$.',
    '$-\\infty$',
    ['$\\infty$', '$0$', 'does not exist'],
    'For small negative $x$, $\\dfrac{1}{x}$ is large and negative, so the limit is $-\\infty$.',
  ),
  makeQuestion(
    'limits-os-inf02',
    2,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 0^+}\\dfrac{1}{x}$.',
    '$\\infty$',
    ['$-\\infty$', '$0$', 'does not exist'],
    'For small positive $x$, $\\dfrac{1}{x}$ is large and positive, so the limit is $+\\infty$.',
  ),
  makeQuestion(
    'limits-os-inf03',
    3,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 0}\\dfrac{1}{x}$.',
    'It does not exist',
    ['$\\infty$', '$-\\infty$', '$0$'],
    'The one-sided limits are $-\\infty$ and $+\\infty$; since they disagree, the two-sided limit does not exist.',
  ),
  makeQuestion(
    'limits-os-inf04',
    3,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 2^+}\\dfrac{1}{x-2}$.',
    '$\\infty$',
    ['$-\\infty$', '$0$', 'does not exist'],
    'For $x$ just above $2$, $x-2$ is small and positive, so $\\dfrac{1}{x-2}\\to +\\infty$.',
  ),
  makeQuestion(
    'limits-os-inf05',
    3,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 2^-}\\dfrac{1}{x-2}$.',
    '$-\\infty$',
    ['$\\infty$', '$0$', 'does not exist'],
    'For $x$ just below $2$, $x-2$ is small and negative, so $\\dfrac{1}{x-2}\\to -\\infty$.',
  ),
  makeQuestion(
    'limits-os-inf06',
    3,
    CAT_ONESIDED,
    'For $f(x)=\\dfrac{|x|}{x}$, evaluate $\\lim_{x\\to 0} f(x)$.',
    'It does not exist',
    ['$1$', '$-1$', '$0$'],
    'The left-hand value is $-1$ and the right-hand value is $1$; the sides disagree, so the limit does not exist.',
  ),
  makeQuestion(
    'limits-os-inf07',
    3,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 3}\\dfrac{1}{(x-3)^2}$.',
    '$\\infty$',
    ['$-\\infty$', '$0$', 'does not exist'],
    'The denominator $(x-3)^2$ is small and positive on both sides, so the quotient grows to $+\\infty$.',
  ),
  makeQuestion(
    'limits-os-inf08',
    3,
    CAT_ONESIDED,
    'Evaluate $\\lim_{x\\to 5^-}\\dfrac{1}{x-5}$.',
    '$-\\infty$',
    ['$\\infty$', '$0$', 'does not exist'],
    'For $x$ just below $5$, $x-5$ is small and negative, so $\\dfrac{1}{x-5}\\to -\\infty$.',
  ),
];

// Section 5: Continuity

const continuityConceptual: PracticeQuestion[] = [
  makeQuestion(
    'limits-cont-c01',
    2,
    CAT_CONTINUITY,
    'A function $f$ is continuous at $x=c$ provided:',
    '$\\lim_{x\\to c} f(x)=f(c)$',
    ['$f(c)=0$', '$f$ is increasing at $c$', '$\\lim_{x\\to c} f(x)=\\infty$'],
    'Continuity at $c$ means the limit exists, the value is defined, and the two are equal.',
  ),
  makeQuestion(
    'limits-cont-c02',
    2,
    CAT_CONTINUITY,
    'Which of the following is NOT required for $f$ to be continuous at $c$?',
    'that $f$ be increasing at $c$',
    [
      'that $f(c)$ be defined',
      'that $\\lim_{x\\to c} f(x)$ exist',
      'that the limit equal the value',
    ],
    'Continuity requires a defined value, an existing limit, and their equality; monotonicity is not part of it.',
  ),
  makeQuestion(
    'limits-cont-c03',
    2,
    CAT_CONTINUITY,
    'A discontinuity where $\\lim_{x\\to a} f(x)$ exists but $f(a)$ is missing or different is called:',
    'removable',
    ['a jump', 'infinite', 'oscillatory'],
    'Such a "hole" can be patched by redefining $f(a)$ to equal the limit, so it is removable.',
  ),
  makeQuestion(
    'limits-cont-c04',
    2,
    CAT_CONTINUITY,
    'A discontinuity where both one-sided limits exist but are unequal is called:',
    'a jump',
    ['removable', 'infinite', 'continuous'],
    'When the sides head to different finite heights, the graph jumps; this is a jump discontinuity.',
  ),
  makeQuestion(
    'limits-cont-c05',
    2,
    CAT_CONTINUITY,
    'A discontinuity where $f$ is unbounded near $a$ (as at a vertical asymptote) is called:',
    'infinite',
    ['removable', 'a jump', 'a corner'],
    'Unbounded behavior near $a$ is an infinite discontinuity, understood through infinite limits.',
  ),
  makeQuestion(
    'limits-cont-c06',
    3,
    CAT_CONTINUITY,
    'If $\\lim_{x\\to c} f(x)$ exists, must $f$ be continuous at $c$?',
    'No; the value $f(c)$ must also be defined and equal the limit',
    [
      'Yes, always',
      'Yes, because the limit exists',
      'No; continuity never holds',
    ],
    'Existence of the limit is necessary but not sufficient; the value must match the limit.',
  ),
  makeQuestion(
    'limits-cont-c07',
    2,
    CAT_CONTINUITY,
    'If $f$ is continuous at $c$, must $\\lim_{x\\to c} f(x)$ exist?',
    'Yes; continuity requires the limit to exist and equal $f(c)$',
    [
      'No; continuity says nothing about limits',
      'Only if $f$ is a polynomial',
      'Only from one side',
    ],
    'Continuity is defined by $\\lim_{x\\to c} f(x)=f(c)$, which requires the limit to exist.',
  ),
  makeQuestion(
    'limits-cont-c08',
    2,
    CAT_CONTINUITY,
    'The sum of two functions that are continuous on an interval is:',
    'continuous on that interval',
    [
      'never continuous',
      'continuous only if both are zero',
      'discontinuous at the endpoints',
    ],
    'Sums, differences, products, and (where the denominator is nonzero) quotients of continuous functions are continuous.',
  ),
  makeQuestion(
    'limits-cont-c09',
    1,
    CAT_CONTINUITY,
    'On what set is every polynomial continuous?',
    'all real numbers',
    ['only the positive reals', 'only the integers', 'only where it is positive'],
    'Polynomials are continuous everywhere, on $(-\\infty,\\infty)$.',
  ),
  makeQuestion(
    'limits-cont-c10',
    3,
    CAT_CONTINUITY,
    'The Intermediate Value Theorem states that if $f$ is continuous on $[a,b]$ and $y$ lies between $f(a)$ and $f(b)$, then:',
    'there is some $c$ in $(a,b)$ with $f(c)=y$',
    [
      '$f$ has a maximum equal to $y$',
      '$f$ is increasing on $[a,b]$',
      '$f(a)=f(b)$',
    ],
    'A continuous graph cannot skip values, so it attains every height between $f(a)$ and $f(b)$.',
  ),
  makeQuestion(
    'limits-cont-c11',
    3,
    CAT_CONTINUITY,
    'A continuous function has $f(a)<0$ and $f(b)>0$. The Intermediate Value Theorem guarantees:',
    'a root: some $c$ in $(a,b)$ with $f(c)=0$',
    [
      'exactly one root',
      'no roots at all',
      'a maximum at $c$',
    ],
    'Since $0$ lies between a negative and a positive value, the continuous function must cross zero somewhere in the interval.',
  ),
  makeQuestion(
    'limits-cont-c12',
    2,
    CAT_CONTINUITY,
    'On what set is $f(x)=\\dfrac{1}{x}$ continuous?',
    'every point of its domain, that is all $x\\ne 0$',
    [
      'all real numbers',
      'only $x>0$',
      'nowhere',
    ],
    'As a rational function, $\\dfrac{1}{x}$ is continuous on its domain, breaking only where $x=0$ is excluded.',
  ),
  makeQuestion(
    'limits-cont-c13',
    3,
    CAT_CONTINUITY,
    'If $f$ is continuous on $[0,1)$ and on $[1,2)$, is it necessarily continuous on $[0,2)$?',
    'No; a jump can still occur at $x=1$',
    [
      'Yes, always',
      'Yes, because the pieces overlap',
      'Only if $f(1)=0$',
    ],
    'Continuity on the two pieces does not guarantee the sides match at $x=1$; a jump there is possible (as for the floor function).',
  ),
  makeQuestion(
    'limits-cont-c14',
    2,
    CAT_CONTINUITY,
    'At which inputs is the floor function $f(x)=\\lfloor x\\rfloor$ discontinuous?',
    'at every integer',
    [
      'nowhere; it is continuous',
      'only at $x=0$',
      'only at negative integers',
    ],
    'The floor function jumps at each integer, where its one-sided limits disagree, so it is discontinuous there.',
  ),
];

const continuityRationalDisc: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const pairs: Array<[number, number]> = [
    [2, -2],
    [1, 3],
    [-1, -4],
    [2, 5],
    [3, -3],
    [1, -5],
    [4, 2],
    [-2, 6],
    [1, 2],
    [-3, 3],
    [5, 1],
    [2, 7],
    [-1, 4],
    [3, 6],
  ];
  for (const [r1, r2] of pairs) {
    const lo = Math.min(r1, r2);
    const hi = Math.max(r1, r2);
    out.push(
      makeQuestion(
        `limits-cont-disc-${tag(r1)}-${tag(r2)}`,
        3,
        CAT_CONTINUITY,
        `At which $x$-values is $f(x)=\\dfrac{3x}{${quadFull(1, -(r1 + r2), r1 * r2)}}$ discontinuous?`,
        `$x=${lo}$ and $x=${hi}$`,
        [`$x=0$`, `$x=${lo}$ only`, `$x=${hi}$ only`, 'It is continuous everywhere'],
        `The denominator factors as $${factorTex(r1)}${factorTex(r2)}$ and is zero at $x=${lo}$ and $x=${hi}$, where $f$ is undefined.`,
      ),
    );
  }
  return out;
})();

const continuityPiecewise: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const sets: Array<[number, number, number, number, number]> = [
    [1, 2, 0, 1, 1],
    [1, 1, 0, 1, 2],
    [2, 1, 1, 2, -1],
    [0, 1, 3, 2, 1],
    [3, 1, -2, 2, -5],
    [-1, 2, 5, 1, 1],
    [2, -1, 4, 1, 0],
    [1, 3, -1, 1, 1],
    [-2, 1, 6, 2, 9],
    [4, 1, -3, 2, -7],
    [2, 2, -1, 1, 1],
    [1, -2, 5, 3, -2],
  ];
  sets.forEach(([c, m1, b1, m2, b2], index) => {
    const left = m1 * c + b1;
    const val = m2 * c + b2;
    const pw = piecewiseTex(c, m1, b1, m2, b2);
    const prompt = `For $${pw}$, is $f$ continuous at $x=${c}$?`;
    if (left === val) {
      out.push(
        makeQuestion(
          `limits-cont-pw-${index + 1}`,
          3,
          CAT_CONTINUITY,
          prompt,
          `Yes; the limit exists and equals $f(${c})=${val}$`,
          [
            'No; the one-sided limits differ, so the limit does not exist',
            `No; $f(${c})$ is undefined`,
            'Yes; but only because the value happens to be zero',
          ],
          `Both pieces give $${left}$ at $x=${c}$, so $\\lim_{x\\to ${c}} f(x)=${val}=f(${c})$ and $f$ is continuous there.`,
        ),
      );
    } else {
      out.push(
        makeQuestion(
          `limits-cont-pw-${index + 1}`,
          3,
          CAT_CONTINUITY,
          prompt,
          `No; the left-hand limit $${left}$ differs from the value $f(${c})=${val}$`,
          [
            'Yes; the limit equals the value',
            `No; $f(${c})$ is undefined`,
            'Yes; every piecewise function is continuous',
          ],
          `The left-hand limit is $${left}$ but $f(${c})=${val}$; since they differ, $f$ is not continuous at $x=${c}$.`,
        ),
      );
    }
  });
  return out;
})();

const continuityIVT: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const sets: Array<[number, number, number, number, number]> = [
    [0, 2, -3, 5, 0],
    [1, 5, -2, -10, -9],
    [-1, 1, -10, 10, 11],
    [1, 5, -2, -10, -1],
    [0, 4, 2, 10, 7],
    [2, 6, 1, 9, 15],
    [-3, 7, 0, 25, 15],
    [0, 3, -5, 5, 6],
    [1, 4, -1, 11, 0],
    [0, 2, 3, 8, 5],
  ];
  sets.forEach(([a, b, fa, fb, N], index) => {
    const between = (fa < N && N < fb) || (fb < N && N < fa);
    const prompt = `A function $f$ is continuous on $[${a},${b}]$ with $f(${a})=${fa}$ and $f(${b})=${fb}$. Does the Intermediate Value Theorem guarantee some $c$ in $(${a},${b})$ with $f(c)=${N}$?`;
    if (between) {
      out.push(
        makeQuestion(
          `limits-cont-ivt-${index + 1}`,
          3,
          CAT_CONTINUITY,
          prompt,
          `Yes; $${N}$ lies between $${fa}$ and $${fb}$, so such a $c$ exists`,
          [
            `No; $${N}$ is not between $${fa}$ and $${fb}$`,
            'Only if $f$ is increasing',
            'No; continuity alone is not enough',
          ],
          `Because $${N}$ lies between $f(${a})=${fa}$ and $f(${b})=${fb}$, a continuous $f$ must attain it somewhere in $(${a},${b})$.`,
        ),
      );
    } else {
      out.push(
        makeQuestion(
          `limits-cont-ivt-${index + 1}`,
          4,
          CAT_CONTINUITY,
          prompt,
          `No; $${N}$ does not lie between $${fa}$ and $${fb}$, so the theorem does not apply`,
          [
            'Yes; the theorem guarantees such a $c$',
            'Yes; continuous functions take every value',
            'Only if $f$ is a polynomial',
          ],
          `The target $${N}$ is outside the range from $f(${a})=${fa}$ to $f(${b})=${fb}$, so the theorem makes no guarantee (the value may still be missed).`,
        ),
      );
    }
  });
  return out;
})();

// Section 6: Limits Involving Infinity

const infinityConceptual: PracticeQuestion[] = [
  makeQuestion(
    'limits-inf-c01',
    2,
    CAT_INFINITY,
    'Writing $\\lim_{x\\to c} f(x)=\\infty$ is a way of saying that the limit:',
    'does not exist as a finite number; the outputs grow without bound',
    [
      'exists and equals a large number',
      'equals zero',
      'is negative',
    ],
    'A limit of $\\infty$ is descriptive language for unbounded growth; it means the limit fails to exist as a finite value.',
  ),
  makeQuestion(
    'limits-inf-c02',
    2,
    CAT_INFINITY,
    'For a rational function, a vertical asymptote at $x=c$ occurs where:',
    'the denominator is zero but the numerator is not',
    [
      'the numerator is zero but the denominator is not',
      'both numerator and denominator are zero',
      'the function equals zero',
    ],
    'When only the denominator vanishes at $c$, the quotient blows up, producing a vertical asymptote.',
  ),
  makeQuestion(
    'limits-inf-c03',
    3,
    CAT_INFINITY,
    'Which of the following is NOT an indeterminate form?',
    '$\\dfrac{1}{0}$',
    ['$\\dfrac{0}{0}$', '$\\dfrac{\\infty}{\\infty}$', '$\\infty-\\infty$'],
    '$\\dfrac{1}{0}$ signals an infinite limit, not an indeterminate form; the others require more work to resolve.',
  ),
  makeQuestion(
    'limits-inf-c04',
    3,
    CAT_INFINITY,
    'Which expression is an indeterminate form?',
    '$0\\cdot\\infty$',
    ['$\\dfrac{1}{0}$', '$\\dfrac{5}{\\infty}$', '$\\infty+\\infty$'],
    '$0\\cdot\\infty$ can equal anything depending on the rates, so it is indeterminate; the others have determinate behavior.',
  ),
  makeQuestion(
    'limits-inf-c05',
    2,
    CAT_INFINITY,
    'For $n>0$, what is $\\lim_{x\\to\\infty}\\dfrac{1}{x^n}$?',
    '$0$',
    ['$1$', '$\\infty$', '$n$'],
    'As $x\\to\\infty$, $x^n\\to\\infty$, so $\\dfrac{1}{x^n}\\to 0$.',
  ),
  makeQuestion(
    'limits-inf-c06',
    2,
    CAT_INFINITY,
    'The line $y=L$ is a horizontal asymptote of $f$ when:',
    '$\\lim_{x\\to\\infty} f(x)=L$ or $\\lim_{x\\to-\\infty} f(x)=L$',
    [
      '$\\lim_{x\\to L} f(x)=\\infty$',
      '$f(L)=0$',
      '$f$ has a vertical asymptote at $L$',
    ],
    'Horizontal asymptotes describe end behavior: the outputs approach $L$ as $x\\to\\pm\\infty$.',
  ),
  makeQuestion(
    'limits-inf-c07',
    2,
    CAT_INFINITY,
    'For a rational function whose numerator and denominator have the same degree, the limit at infinity is:',
    'the ratio of the leading coefficients',
    [
      'always $0$',
      'always $1$',
      'always $\\infty$',
    ],
    'Dividing through by the top power leaves only the leading terms, giving the ratio of leading coefficients.',
  ),
  makeQuestion(
    'limits-inf-c08',
    2,
    CAT_INFINITY,
    'For a rational function whose numerator has smaller degree than the denominator, the limit at infinity is:',
    '$0$',
    ['$1$', '$\\infty$', 'the ratio of leading coefficients'],
    'The denominator outgrows the numerator, so the quotient shrinks to $0$.',
  ),
  makeQuestion(
    'limits-inf-c09',
    2,
    CAT_INFINITY,
    'For a rational function whose numerator has larger degree than the denominator, the limit at infinity is:',
    'infinite (no horizontal asymptote)',
    [
      '$0$',
      '$1$',
      'the ratio of leading coefficients',
    ],
    'The numerator outgrows the denominator, so the outputs are unbounded and there is no horizontal asymptote.',
  ),
  makeQuestion(
    'limits-inf-c10',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to 0}\\dfrac{1}{x^2}$.',
    '$\\infty$',
    ['$0$', '$-\\infty$', '$1$'],
    'Near $0$, $x^2$ is small and positive, so $\\dfrac{1}{x^2}$ grows without bound on both sides: the limit is $\\infty$.',
  ),
  makeQuestion(
    'limits-inf-c11',
    2,
    CAT_INFINITY,
    'The expression $\\infty-\\infty$ is:',
    'an indeterminate form',
    ['always $0$', 'always $\\infty$', 'never possible'],
    'Two quantities both growing without bound can be subtracted to give any result, so $\\infty-\\infty$ is indeterminate.',
  ),
  makeQuestion(
    'limits-inf-c12',
    2,
    CAT_INFINITY,
    'If a rational function has a zero denominator and a nonzero numerator at $x=c$, then at $x=c$ it has:',
    'a vertical asymptote (an infinite discontinuity)',
    [
      'a removable hole',
      'a horizontal asymptote',
      'a continuous point',
    ],
    'A nonzero-over-zero form makes the outputs blow up, producing a vertical asymptote and an infinite discontinuity.',
  ),
];

const infinityRational: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const equalSets: Array<[number, number, number]> = [
    [1, 4, 3],
    [2, 3, 2],
    [3, 1, 2],
    [-1, 3, 2],
    [2, 5, 3],
    [1, -2, 2],
    [5, 2, 3],
    [-3, 4, 2],
  ];
  for (const [a, b, d] of equalSets) {
    out.push(
      makeQuestion(
        `limits-inf-rat-eq-${tag(a)}-${tag(b)}-${d}`,
        3,
        CAT_INFINITY,
        `Evaluate $\\lim_{x\\to\\infty}\\dfrac{${polyTex(a, d)}}{${polyTex(b, d)}}$.`,
        `$${fracTex(a, b)}$`,
        ['$0$', '$\\infty$', `$${fracTex(b, a)}$`, '$1$'],
        `The numerator and denominator have the same degree, so the limit is the ratio of leading coefficients, $${fracTex(a, b)}$.`,
      ),
    );
  }
  const smallerSets: Array<[number, number, number, number]> = [
    [1, 1, 1, 2],
    [2, 1, 3, 3],
    [1, 2, 1, 3],
    [3, 0, 2, 2],
    [1, 1, 4, 2],
    [2, 2, 1, 3],
    [5, 1, 2, 4],
    [1, 0, 1, 2],
  ];
  for (const [a, dn, b, dm] of smallerSets) {
    out.push(
      makeQuestion(
        `limits-inf-rat-sm-${tag(a)}-${dn}-${tag(b)}-${dm}`,
        2,
        CAT_INFINITY,
        `Evaluate $\\lim_{x\\to\\infty}\\dfrac{${polyTex(a, dn)}}{${polyTex(b, dm)}}$.`,
        '$0$',
        [`$${fracTex(a, b)}$`, '$\\infty$', '$1$', '$-\\infty$'],
        `The denominator has the higher degree, so the quotient shrinks to $0$ as $x\\to\\infty$.`,
      ),
    );
  }
  const biggerSets: Array<[number, number, number, number]> = [
    [1, 3, 4, 1],
    [2, 3, 1, 2],
    [-1, 3, 1, 2],
    [3, 2, 2, 1],
    [1, 2, -1, 1],
    [2, 4, 3, 2],
    [-2, 3, 1, 1],
    [5, 2, 1, 1],
  ];
  for (const [a, dn, b, dm] of biggerSets) {
    const positive = a / b > 0;
    const correct = positive ? '$\\infty$' : '$-\\infty$';
    const opposite = positive ? '$-\\infty$' : '$\\infty$';
    out.push(
      makeQuestion(
        `limits-inf-rat-bg-${tag(a)}-${dn}-${tag(b)}-${dm}`,
        3,
        CAT_INFINITY,
        `Evaluate $\\lim_{x\\to\\infty}\\dfrac{${polyTex(a, dn)}}{${polyTex(b, dm)}}$.`,
        correct,
        [opposite, '$0$', `$${fracTex(a, b)}$`, '$1$'],
        `The numerator has the higher degree, so the quotient is unbounded; the leading-coefficient ratio $${fracTex(a, b)}$ is ${positive ? 'positive' : 'negative'}, so the limit is ${correct}.`,
      ),
    );
  }
  return out;
})();

const infinityHorizontal: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const equalSets: Array<[number, number, number]> = [
    [2, 3, 2],
    [1, 4, 2],
    [5, 2, 3],
    [-1, 2, 2],
  ];
  for (const [a, b, d] of equalSets) {
    out.push(
      makeQuestion(
        `limits-inf-ha-eq-${tag(a)}-${tag(b)}-${d}`,
        3,
        CAT_INFINITY,
        `What is the horizontal asymptote of $f(x)=\\dfrac{${polyTex(a, d)}}{${polyTex(b, d)}}$?`,
        `$y=${fracTex(a, b)}$`,
        ['$y=0$', 'There is none', `$y=${fracTex(b, a)}$`, '$y=1$'],
        `Equal degrees give an end value equal to the ratio of leading coefficients, so the horizontal asymptote is $y=${fracTex(a, b)}$.`,
      ),
    );
  }
  const smallerSets: Array<[number, number, number, number]> = [
    [1, 1, 2, 2],
    [3, 1, 1, 3],
    [2, 2, 1, 3],
  ];
  for (const [a, dn, b, dm] of smallerSets) {
    out.push(
      makeQuestion(
        `limits-inf-ha-sm-${tag(a)}-${dn}-${tag(b)}-${dm}`,
        2,
        CAT_INFINITY,
        `What is the horizontal asymptote of $f(x)=\\dfrac{${polyTex(a, dn)}}{${polyTex(b, dm)}}$?`,
        '$y=0$',
        ['There is none', `$y=${fracTex(a, b)}$`, '$y=1$', `$y=${fracTex(b, a)}$`],
        `The denominator has the higher degree, so the outputs approach $0$ and $y=0$ is the horizontal asymptote.`,
      ),
    );
  }
  const biggerSets: Array<[number, number, number, number]> = [
    [1, 3, 2, 1],
    [2, 2, 1, 1],
    [3, 3, 1, 2],
  ];
  for (const [a, dn, b, dm] of biggerSets) {
    out.push(
      makeQuestion(
        `limits-inf-ha-bg-${tag(a)}-${dn}-${tag(b)}-${dm}`,
        3,
        CAT_INFINITY,
        `What is the horizontal asymptote of $f(x)=\\dfrac{${polyTex(a, dn)}}{${polyTex(b, dm)}}$?`,
        'There is none',
        ['$y=0$', '$y=1$', `$y=${fracTex(a, b)}$`, `$y=${fracTex(b, a)}$`],
        `The numerator has the higher degree, so the outputs are unbounded and there is no horizontal asymptote.`,
      ),
    );
  }
  return out;
})();

const infinityVertical: PracticeQuestion[] = (() => {
  const out: PracticeQuestion[] = [];
  const pairs: Array<[number, number]> = [
    [3, 1],
    [2, -4],
    [5, -2],
    [1, 4],
    [-3, 2],
    [6, 2],
    [-1, 3],
    [4, -2],
    [2, 3],
    [-5, 1],
  ];
  for (const [r1, r2] of pairs) {
    const lo = Math.min(r1, r2);
    const hi = Math.max(r1, r2);
    out.push(
      makeQuestion(
        `limits-inf-va-${tag(r1)}-${tag(r2)}`,
        3,
        CAT_INFINITY,
        `Find the vertical asymptotes of $f(x)=\\dfrac{1}{${quadFull(1, -(r1 + r2), r1 * r2)}}$.`,
        `$x=${lo}$ and $x=${hi}$`,
        [`$x=0$`, `$x=${lo}$ only`, 'There are none', '$y=0$'],
        `The denominator factors as $${factorTex(r1)}${factorTex(r2)}$ and is zero at $x=${lo}$ and $x=${hi}$, where the numerator is nonzero, so both are vertical asymptotes.`,
      ),
    );
  }
  return out;
})();

const infinityReciprocal: PracticeQuestion[] = [
  makeQuestion(
    'limits-inf-rec01',
    1,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to\\infty}\\dfrac{1}{x}$.',
    '$0$',
    ['$1$', '$\\infty$', '$-\\infty$'],
    'As $x\\to\\infty$, $\\dfrac{1}{x}$ shrinks to $0$.',
  ),
  makeQuestion(
    'limits-inf-rec02',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to\\infty}\\dfrac{1}{x^2}$.',
    '$0$',
    ['$1$', '$\\infty$', '$-\\infty$'],
    'As $x\\to\\infty$, $x^2\\to\\infty$, so $\\dfrac{1}{x^2}\\to 0$.',
  ),
  makeQuestion(
    'limits-inf-rec03',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to\\infty}\\dfrac{1}{x^3}$.',
    '$0$',
    ['$1$', '$\\infty$', '$-\\infty$'],
    'As $x\\to\\infty$, $x^3\\to\\infty$, so $\\dfrac{1}{x^3}\\to 0$.',
  ),
  makeQuestion(
    'limits-inf-rec04',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to-\\infty}\\dfrac{1}{x}$.',
    '$0$',
    ['$1$', '$\\infty$', '$-\\infty$'],
    'As $x\\to-\\infty$, $\\dfrac{1}{x}$ approaches $0$ (from below).',
  ),
  makeQuestion(
    'limits-inf-rec05',
    1,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to\\infty}\\dfrac{5}{x}$.',
    '$0$',
    ['$5$', '$\\infty$', '$1$'],
    'A constant over a growing denominator shrinks to $0$.',
  ),
  makeQuestion(
    'limits-inf-rec06',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to 0}\\dfrac{1}{x^2}$.',
    '$\\infty$',
    ['$0$', '$-\\infty$', '$1$'],
    'Near $0$, $x^2$ is small and positive, so $\\dfrac{1}{x^2}\\to\\infty$ from both sides.',
  ),
  makeQuestion(
    'limits-inf-rec07',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to 0^+}\\dfrac{1}{x}$.',
    '$\\infty$',
    ['$0$', '$-\\infty$', '$1$'],
    'For small positive $x$, $\\dfrac{1}{x}$ grows without bound, so the right-hand limit is $\\infty$.',
  ),
  makeQuestion(
    'limits-inf-rec08',
    2,
    CAT_INFINITY,
    'Evaluate $\\lim_{x\\to 0^-}\\dfrac{1}{x}$.',
    '$-\\infty$',
    ['$0$', '$\\infty$', '$1$'],
    'For small negative $x$, $\\dfrac{1}{x}$ is large and negative, so the left-hand limit is $-\\infty$.',
  ),
];

export const limitsQuestions: PracticeQuestion[] = [
  ...introConceptual,
  ...introEstimate,
  ...introDiffLinear,
  ...introDiffQuadratic,
  ...epsConceptual,
  ...epsLine,
  ...epsInterval,
  ...analyticConceptual,
  ...analyticPolySub,
  ...analyticDiffSquares,
  ...analyticFactorQuadratic,
  ...analyticLimitLaws,
  ...analyticTrig,
  ...analyticExercises,
  ...oneSidedConceptual,
  ...oneSidedPiecewise,
  ...oneSidedInfinite,
  ...continuityConceptual,
  ...continuityRationalDisc,
  ...continuityPiecewise,
  ...continuityIVT,
  ...infinityConceptual,
  ...infinityRational,
  ...infinityHorizontal,
  ...infinityVertical,
  ...infinityReciprocal,
];
