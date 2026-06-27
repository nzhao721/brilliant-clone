import type { PracticeQuestion } from '../questionBank';

/* Practice questions for "Techniques of Integration" (Ch. 6), adapted from APEX Calculus (Hartman et al.) under CC BY-NC 4.0. */

const CHAPTER_ID = 'techniques-of-integration';
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

// Math + formatting helpers (KaTeX strings, no surrounding $).
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

type Rat = readonly [number, number];

function rat(num: number, den = 1): Rat {
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return [num / g, den / g];
}

function ratTex(r: Rat): string {
  const [n, d] = r;
  if (d === 1) return `${n}`;
  if (n < 0) return `-\\dfrac{${-n}}{${d}}`;
  return `\\dfrac{${n}}{${d}}`;
}

function ratPiTex(r: Rat): string {
  const [n, d] = r;
  if (n === 0) return '0';
  const neg = n < 0;
  const an = Math.abs(n);
  let body: string;
  if (d === 1) {
    body = an === 1 ? '\\pi' : `${an}\\pi`;
  } else {
    body = an === 1 ? `\\dfrac{\\pi}{${d}}` : `\\dfrac{${an}\\pi}{${d}}`;
  }
  return neg ? `-${body}` : body;
}

function tex(s: string): string {
  return `$${s}$`;
}

function coef(c: number, v: string): string {
  if (c === 1) return v;
  if (c === -1) return `-${v}`;
  return `${c}${v}`;
}

// Numerator over denominator, simplifying a denominator of 1.
function over(num: string, d: number): string {
  if (d === 1) return num;
  return `\\dfrac{${num}}{${d}}`;
}

// Trig function applied to a*x: trig('sin',1) -> '\\sin x', trig('cos',2) -> '\\cos(2x)'.
function trig(name: string, a: number): string {
  return a === 1 ? `\\${name} x` : `\\${name}(${a}x)`;
}

// Argument " x" or "(ax)" shared by hyperbolic strings.
function harg(a: number): string {
  return a === 1 ? ' x' : `(${a}x)`;
}

// Hyperbolic function on a*x. sech/csch are not KaTeX builtins -> \operatorname.
function hyp(name: string, a: number): string {
  const head =
    name === 'sech' || name === 'csch' ? `\\operatorname{${name}}` : `\\${name}`;
  return `${head}${harg(a)}`;
}

// Power of x: pw(1) -> 'x', pw(3) -> 'x^{3}'.
function pw(e: number): string {
  return e === 1 ? 'x' : `x^{${e}}`;
}

// x over a: divx(1) -> 'x', divx(3) -> '\\dfrac{x}{3}'.
function divx(a: number): string {
  return a === 1 ? 'x' : `\\dfrac{x}{${a}}`;
}

// Linear factor (x - r): factor(0) -> 'x', factor(2) -> '(x - 2)', factor(-3) -> '(x + 3)'.
function factor(r: number): string {
  if (r === 0) return 'x';
  return r > 0 ? `(x - ${r})` : `(x + ${-r})`;
}

// Linear expression a*x + c with signed constant.
function lin(a: number, c: number): string {
  const base = coef(a, 'x');
  if (c > 0) return `${base} + ${c}`;
  if (c < 0) return `${base} - ${-c}`;
  return base;
}

// Linear factor in parentheses: (ax + b).
function linFac(a: number, b: number): string {
  return `(${lin(a, b)})`;
}

// Wrap in parentheses only when the expression has more than one term.
function wrap(s: string): string {
  return s.includes('+') || s.includes('-') ? `(${s})` : s;
}

// Leading coefficient as a multiplier: '' for 1, '-' for -1, else the rational.
function coefMul(r: Rat): string {
  const [n, d] = r;
  if (n === 1 && d === 1) return '';
  if (n === -1 && d === 1) return '-';
  return ratTex(r);
}

function normalizeLabel(value: string): string {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

const SAFE_PAD = ['$0$', '$1$', '$2$', '$3$', '$-1$', '$4$', '$5$', '$-2$'];

let seq = 0;

function make(
  category: string,
  slug: string,
  prompt: string,
  correctLabel: string,
  distractorLabels: readonly string[],
  explanation: string,
  difficulty: number,
): PracticeQuestion {
  const seen = new Set<string>([normalizeLabel(correctLabel)]);
  const distinct: string[] = [];
  for (const label of distractorLabels) {
    const key = normalizeLabel(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distinct.push(label);
    if (distinct.length >= 4) break;
  }
  for (const pad of SAFE_PAD) {
    if (distinct.length >= 3) break;
    const key = normalizeLabel(pad);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(pad);
  }
  const finalDistractors = distinct.slice(0, distinct.length >= 4 ? 4 : 3);
  const count = finalDistractors.length + 1;
  const pos = seq % count;
  seq += 1;
  const labels = [...finalDistractors];
  labels.splice(pos, 0, correctLabel);
  return {
    id: `${CHAPTER_ID}-${slug}`,
    chapterId: CHAPTER_ID,
    category,
    prompt,
    choices: labels.map((label, index) => ({ id: LETTERS[index], label })),
    correctChoiceId: LETTERS[pos],
    explanation,
    difficulty,
  };
}

type Gen = (
  prompt: string,
  correct: string,
  distractors: readonly string[],
  explanation: string,
  difficulty: number,
) => PracticeQuestion;

function topic(category: string, topicSlug: string): Gen {
  let i = 0;
  return (prompt, correct, distractors, explanation, difficulty) => {
    i += 1;
    const slug = `${topicSlug}-${String(i).padStart(3, '0')}`;
    return make(category, slug, prompt, correct, distractors, explanation, difficulty);
  };
}

// Topic 1: Substitution
function substitution(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Substitution', 'sub');

  // int (ax+b)^n dx = (ax+b)^{n+1} / (a(n+1)) + C.
  for (const a of [2, 3, 4, 5]) {
    for (const n of [2, 3, 4]) {
      const den = a * (n + 1);
      const base = linFac(a, 1);
      out.push(
        T(
          `Evaluate $\\int ${base}^{${n}}\\,dx$.`,
          tex(`${over(`${base}^{${n + 1}}`, den)} + C`),
          [
            tex(`${over(`${base}^{${n + 1}}`, n + 1)} + C`),
            tex(`${over(`${base}^{${n + 1}}`, a)} + C`),
            tex(`${over(`${base}^{${n}}`, den)} + C`),
            tex(`${a}${base}^{${n + 1}} + C`),
          ],
          `Let $u = ${lin(a, 1)}$, $du = ${a}\\,dx$: $\\tfrac{1}{${a}}\\cdot\\dfrac{u^{${n + 1}}}{${n + 1}} = ${over(`${base}^{${n + 1}}`, den)} + C$.`,
          2,
        ),
      );
    }
  }

  // int x (x^2 + c)^n dx = (x^2 + c)^{n+1} / (2(n+1)) + C.
  for (const c of [1, 2, 3, 4]) {
    for (const n of [2, 3, 4]) {
      const den = 2 * (n + 1);
      const base = `(x^{2} + ${c})`;
      out.push(
        T(
          `Evaluate $\\int x${base}^{${n}}\\,dx$.`,
          tex(`${over(`${base}^{${n + 1}}`, den)} + C`),
          [
            tex(`${over(`${base}^{${n + 1}}`, n + 1)} + C`),
            tex(`${over(`${base}^{${n + 1}}`, 2 * n)} + C`),
            tex(`${over(`${base}^{${n}}`, den)} + C`),
            tex(`2${base}^{${n + 1}} + C`),
          ],
          `Let $u = x^{2} + ${c}$, $du = 2x\\,dx$: $\\tfrac{1}{2}\\cdot\\dfrac{u^{${n + 1}}}{${n + 1}} = ${over(`${base}^{${n + 1}}`, den)} + C$.`,
          2,
        ),
      );
    }
  }

  // int e^{ax} dx = e^{ax} / a + C.
  for (let a = 2; a <= 7; a += 1) {
    out.push(
      T(
        `Evaluate $\\int e^{${a}x}\\,dx$.`,
        tex(`${over(`e^{${a}x}`, a)} + C`),
        [
          tex(`e^{${a}x} + C`),
          tex(`${a}e^{${a}x} + C`),
          tex(`${over(`e^{${a}x}`, a + 1)} + C`),
          tex(`${over(`e^{${a + 1}x}`, a + 1)} + C`),
        ],
        `Let $u = ${a}x$, $du = ${a}\\,dx$: $\\tfrac{1}{${a}}\\int e^{u}\\,du = ${over(`e^{${a}x}`, a)} + C$.`,
        2,
      ),
    );
  }

  // int sin(ax) dx = -cos(ax)/a + C  and  int cos(ax) dx = sin(ax)/a + C.
  for (let a = 2; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int ${trig('sin', a)}\\,dx$.`,
        tex(`-${over(trig('cos', a), a)} + C`),
        [
          tex(`${over(trig('cos', a), a)} + C`),
          tex(`-${over(trig('cos', a), a + 1)} + C`),
          tex(`-${a}${trig('cos', a)} + C`),
          tex(`${over(trig('sin', a), a)} + C`),
        ],
        `Let $u = ${a}x$: $\\int ${trig('sin', a)}\\,dx = -${over(trig('cos', a), a)} + C$.`,
        2,
      ),
    );
    out.push(
      T(
        `Evaluate $\\int ${trig('cos', a)}\\,dx$.`,
        tex(`${over(trig('sin', a), a)} + C`),
        [
          tex(`-${over(trig('sin', a), a)} + C`),
          tex(`${over(trig('sin', a), a + 1)} + C`),
          tex(`${a}${trig('sin', a)} + C`),
          tex(`-${over(trig('cos', a), a)} + C`),
        ],
        `Let $u = ${a}x$: $\\int ${trig('cos', a)}\\,dx = ${over(trig('sin', a), a)} + C$.`,
        2,
      ),
    );
  }

  // int 1/(ax+b) dx = (1/a) ln|ax+b| + C.
  for (const a of [2, 3, 4, 5]) {
    const lead = a === 1 ? '' : `\\dfrac{1}{${a}}`;
    out.push(
      T(
        `Evaluate $\\int \\dfrac{1}{${lin(a, 1)}}\\,dx$.`,
        tex(`${lead}\\ln|${lin(a, 1)}| + C`),
        [
          tex(`\\ln|${lin(a, 1)}| + C`),
          tex(`${a}\\ln|${lin(a, 1)}| + C`),
          tex(`${lead}\\ln(${lin(a, 1)})^{2} + C`),
          tex(`-${lead}\\dfrac{1}{${linFac(a, 1)}^{2}} + C`),
        ],
        `Let $u = ${lin(a, 1)}$, $du = ${a}\\,dx$: $\\tfrac{1}{${a}}\\ln|u| = ${lead}\\ln|${lin(a, 1)}| + C$.`,
        2,
      ),
    );
  }

  // Fixed substitution computations.
  out.push(
    T(
      'Evaluate $\\int 2x\\,e^{x^{2}}\\,dx$.',
      tex('e^{x^{2}} + C'),
      [tex('2e^{x^{2}} + C'), tex('\\dfrac{1}{2}e^{x^{2}} + C'), tex('x^{2}e^{x^{2}} + C'), tex('e^{2x} + C')],
      'Let $u = x^{2}$, $du = 2x\\,dx$: $\\int e^{u}\\,du = e^{x^{2}} + C$.',
      2,
    ),
    T(
      'Evaluate $\\int x\\,e^{x^{2}}\\,dx$.',
      tex('\\dfrac{1}{2}e^{x^{2}} + C'),
      [tex('e^{x^{2}} + C'), tex('2e^{x^{2}} + C'), tex('\\dfrac{x^{2}}{2}e^{x^{2}} + C'), tex('x e^{x^{2}} + C')],
      'Let $u = x^{2}$, $du = 2x\\,dx$: $\\tfrac{1}{2}\\int e^{u}\\,du = \\tfrac{1}{2}e^{x^{2}} + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\cos x\\,e^{\\sin x}\\,dx$.',
      tex('e^{\\sin x} + C'),
      [tex('e^{\\cos x} + C'), tex('\\sin x\\,e^{\\sin x} + C'), tex('-e^{\\sin x} + C'), tex('e^{\\sin x}\\cos x + C')],
      'Let $u = \\sin x$, $du = \\cos x\\,dx$: $\\int e^{u}\\,du = e^{\\sin x} + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\dfrac{\\ln x}{x}\\,dx$.',
      tex('\\dfrac{(\\ln x)^{2}}{2} + C'),
      [tex('(\\ln x)^{2} + C'), tex('\\ln(\\ln x) + C'), tex('\\dfrac{1}{2x^{2}} + C'), tex('\\dfrac{1}{x^{2}} + C')],
      'Let $u = \\ln x$, $du = \\tfrac{1}{x}\\,dx$: $\\int u\\,du = \\tfrac{(\\ln x)^{2}}{2} + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\dfrac{1}{x\\ln x}\\,dx$.',
      tex('\\ln|\\ln x| + C'),
      [tex('\\dfrac{(\\ln x)^{2}}{2} + C'), tex('\\ln x + C'), tex('\\dfrac{1}{\\ln x} + C'), tex('\\ln|x\\ln x| + C')],
      'Let $u = \\ln x$, $du = \\tfrac{1}{x}\\,dx$: $\\int \\tfrac{1}{u}\\,du = \\ln|\\ln x| + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\sin x\\cos x\\,dx$.',
      tex('\\dfrac{1}{2}\\sin^{2} x + C'),
      [tex('\\sin^{2} x + C'), tex('-\\dfrac{1}{2}\\sin^{2} x + C'), tex('\\dfrac{1}{2}\\cos^{2} x + C'), tex('\\sin x\\cos x + C')],
      'Let $u = \\sin x$, $du = \\cos x\\,dx$: $\\int u\\,du = \\tfrac{1}{2}\\sin^{2} x + C$.',
      2,
    ),
    T(
      'Evaluate $\\int x\\sqrt{x^{2}+1}\\,dx$.',
      tex('\\dfrac{1}{3}(x^{2}+1)^{3/2} + C'),
      [
        tex('(x^{2}+1)^{3/2} + C'),
        tex('\\dfrac{2}{3}(x^{2}+1)^{3/2} + C'),
        tex('\\dfrac{1}{2}(x^{2}+1)^{3/2} + C'),
        tex('\\dfrac{1}{3}(x^{2}+1)^{1/2} + C'),
      ],
      'Let $u = x^{2}+1$, $du = 2x\\,dx$: $\\tfrac{1}{2}\\int u^{1/2}\\,du = \\tfrac{1}{3}(x^{2}+1)^{3/2} + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\tan x\\,dx$.',
      tex('-\\ln|\\cos x| + C'),
      [tex('\\ln|\\sin x| + C'), tex('\\sec^{2} x + C'), tex('\\ln|\\cos x| + C'), tex('\\tan^{2} x + C')],
      'Write $\\tan x = \\tfrac{\\sin x}{\\cos x}$ and let $u = \\cos x$: $\\int \\tan x\\,dx = -\\ln|\\cos x| + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\dfrac{2x}{x^{2}+1}\\,dx$.',
      tex('\\ln(x^{2}+1) + C'),
      [tex('\\dfrac{1}{2}\\ln(x^{2}+1) + C'), tex('\\arctan x + C'), tex('2\\ln(x^{2}+1) + C'), tex('\\dfrac{2}{x^{2}+1} + C')],
      'Let $u = x^{2}+1$, $du = 2x\\,dx$: $\\int \\tfrac{1}{u}\\,du = \\ln(x^{2}+1) + C$.',
      2,
    ),
    T(
      'Evaluate $\\int x^{2}(x^{3}+1)^{4}\\,dx$.',
      tex('\\dfrac{(x^{3}+1)^{5}}{15} + C'),
      [
        tex('\\dfrac{(x^{3}+1)^{5}}{5} + C'),
        tex('\\dfrac{(x^{3}+1)^{5}}{3} + C'),
        tex('\\dfrac{(x^{3}+1)^{5}}{45} + C'),
        tex('3(x^{3}+1)^{5} + C'),
      ],
      'Let $u = x^{3}+1$, $du = 3x^{2}\\,dx$: $\\tfrac{1}{3}\\cdot\\dfrac{u^{5}}{5} = \\dfrac{(x^{3}+1)^{5}}{15} + C$.',
      3,
    ),
  );

  // Conceptual.
  out.push(
    T(
      'Substitution is the integration technique that reverses:',
      'the chain rule',
      ['the product rule', 'the quotient rule', "L'Hopital's rule"],
      'Substitution undoes the chain rule by recognizing $f(g(x))g\'(x)$.',
      1,
    ),
    T(
      'For $\\int f(g(x))\\,g\'(x)\\,dx$, the natural choice is:',
      tex('u = g(x)'),
      [tex('u = f(x)'), tex('u = g\'(x)'), tex('u = f(g(x))')],
      'Set $u = g(x)$ so that $du = g\'(x)\\,dx$ is already present.',
      1,
    ),
    T(
      'When applying substitution to a definite integral, you should also:',
      'convert the limits of integration to the new variable',
      [
        'add a constant of integration',
        'differentiate the limits',
        'leave the limits unchanged',
      ],
      'Either change the limits to $u$-values or convert back to $x$ before evaluating.',
      1,
    ),
  );

  return out;
}

// Topic 2: Integration by Parts
function integrationByParts(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Integration by Parts', 'by-parts');

  // int x e^{ax} dx = (ax - 1) e^{ax} / a^2 + C.
  for (let a = 1; a <= 7; a += 1) {
    const exp = a === 1 ? 'e^{x}' : `e^{${a}x}`;
    out.push(
      T(
        `Evaluate $\\int x ${exp}\\,dx$.`,
        tex(`${over(`(${coef(a, 'x')} - 1)${exp}`, a * a)} + C`),
        [
          tex(`${over(`(${coef(a, 'x')} + 1)${exp}`, a * a)} + C`),
          tex(`${over(`(${coef(a, 'x')} - 1)${exp}`, a)} + C`),
          tex(`${coef(a, 'x')} ${exp} + C`),
          tex(`\\dfrac{x^{2}}{2}${exp} + C`),
        ],
        `With $u = x$, $dv = ${exp}\\,dx$, $v = ${over(exp, a)}$: the result is $${over(`(${coef(a, 'x')} - 1)${exp}`, a * a)} + C$.`,
        3,
      ),
    );
  }

  // int x cos(ax) dx = (x/a) sin(ax) + (1/a^2) cos(ax) + C.
  for (let a = 1; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int x ${trig('cos', a)}\\,dx$.`,
        tex(`${over(`x${trig('sin', a)}`, a)} + ${over(trig('cos', a), a * a)} + C`),
        [
          tex(`${over(`x${trig('sin', a)}`, a)} - ${over(trig('cos', a), a * a)} + C`),
          tex(`${over(`x${trig('cos', a)}`, a)} + ${over(trig('sin', a), a * a)} + C`),
          tex(`${over(`x${trig('sin', a)}`, a)} + C`),
          tex(`${over(`x${trig('sin', a)}`, a)} - ${over(trig('sin', a), a * a)} + C`),
        ],
        `Let $u = x$, $dv = ${trig('cos', a)}\\,dx$, $v = ${over(trig('sin', a), a)}$: the result is $${over(`x${trig('sin', a)}`, a)} + ${over(trig('cos', a), a * a)} + C$.`,
        3,
      ),
    );
  }

  // int x sin(ax) dx = -(x/a) cos(ax) + (1/a^2) sin(ax) + C.
  for (let a = 1; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int x ${trig('sin', a)}\\,dx$.`,
        tex(`-${over(`x${trig('cos', a)}`, a)} + ${over(trig('sin', a), a * a)} + C`),
        [
          tex(`${over(`x${trig('cos', a)}`, a)} - ${over(trig('sin', a), a * a)} + C`),
          tex(`-${over(`x${trig('cos', a)}`, a)} - ${over(trig('cos', a), a * a)} + C`),
          tex(`${over(`x${trig('sin', a)}`, a)} - ${over(trig('cos', a), a * a)} + C`),
          tex(`-${over(`x${trig('cos', a)}`, a)} + C`),
        ],
        `Let $u = x$, $dv = ${trig('sin', a)}\\,dx$, $v = -${over(trig('cos', a), a)}$: the result is $-${over(`x${trig('cos', a)}`, a)} + ${over(trig('sin', a), a * a)} + C$.`,
        3,
      ),
    );
  }

  // int x^n ln x dx = x^{n+1} ln x /(n+1) - x^{n+1}/(n+1)^2 + C, n >= 1.
  for (let n = 1; n <= 7; n += 1) {
    const np1 = n + 1;
    out.push(
      T(
        `Evaluate $\\int ${pw(n)} \\ln x\\,dx$.`,
        tex(`${over(`${pw(np1)}\\ln x`, np1)} - ${over(pw(np1), np1 * np1)} + C`),
        [
          tex(`${over(`${pw(np1)}\\ln x`, np1)} + ${over(pw(np1), np1 * np1)} + C`),
          tex(`${over(`${pw(np1)}\\ln x`, np1)} + C`),
          tex(`${pw(np1)}\\ln x - ${over(pw(np1), np1)} + C`),
          tex(`${over(`${pw(np1)}\\ln x`, np1 * np1)} - ${over(pw(np1), np1)} + C`),
        ],
        `With $u = \\ln x$, $dv = ${pw(n)}\\,dx$, $v = ${over(pw(np1), np1)}$: the result is $${over(`${pw(np1)}\\ln x`, np1)} - ${over(pw(np1), np1 * np1)} + C$.`,
        3,
      ),
    );
  }

  // int ln x dx.
  out.push(
    T(
      'Evaluate $\\int \\ln x\\,dx$.',
      tex('x\\ln x - x + C'),
      [tex('\\dfrac{1}{x} + C'), tex('x\\ln x + x + C'), tex('\\dfrac{(\\ln x)^{2}}{2} + C'), tex('\\ln x - x + C')],
      'Let $u = \\ln x$, $dv = dx$: $x\\ln x - \\int x\\cdot\\tfrac{1}{x}\\,dx = x\\ln x - x + C$.',
      3,
    ),
  );

  // int (a x + b) e^x dx = (a x + b - a) e^x + C.
  for (const a of [1, 2, 3]) {
    for (const b of [1, 2, 3]) {
      out.push(
        T(
          `Evaluate $\\int (${lin(a, b)})e^{x}\\,dx$.`,
          tex(`${wrap(lin(a, b - a))}e^{x} + C`),
          [
            tex(`${wrap(lin(a, b))}e^{x} + C`),
            tex(`${wrap(lin(a, b + a))}e^{x} + C`),
            tex(`${wrap(lin(a, b - a))}e^{x} + ${a}x + C`),
            tex(`${wrap(lin(a, 2 * b))}e^{x} + C`),
          ],
          `With $u = ${lin(a, b)}$, $dv = e^{x}\\,dx$: $\\int(${lin(a, b)})e^{x}\\,dx = ${wrap(lin(a, b - a))}e^{x} + C$.`,
          3,
        ),
      );
    }
  }

  // Repeated / loop integration by parts (vetted).
  out.push(
    T(
      'Evaluate $\\int x^{2} e^{x}\\,dx$.',
      tex('(x^{2} - 2x + 2)e^{x} + C'),
      [
        tex('(x^{2} + 2x + 2)e^{x} + C'),
        tex('(x^{2} - 2x - 2)e^{x} + C'),
        tex('\\dfrac{x^{3}}{3}e^{x} + C'),
        tex('(x^{2} - 2)e^{x} + C'),
      ],
      'Apply parts twice: $\\int x^{2} e^{x}\\,dx = x^{2} e^{x} - 2\\int x e^{x}\\,dx = (x^{2} - 2x + 2)e^{x} + C$.',
      4,
    ),
    T(
      'Evaluate $\\int x^{2} \\cos x\\,dx$.',
      tex('x^{2} \\sin x + 2x \\cos x - 2\\sin x + C'),
      [
        tex('x^{2} \\sin x - 2x \\cos x + 2\\sin x + C'),
        tex('-x^{2} \\sin x + 2x \\cos x + 2\\sin x + C'),
        tex('x^{2} \\sin x + 2\\cos x + C'),
        tex('\\dfrac{x^{3}}{3}\\sin x + C'),
      ],
      'Parts twice: $\\int x^{2}\\cos x\\,dx = x^{2}\\sin x - 2\\int x\\sin x\\,dx = x^{2}\\sin x + 2x\\cos x - 2\\sin x + C$.',
      4,
    ),
    T(
      'Evaluate $\\int x^{2} \\sin x\\,dx$.',
      tex('-x^{2} \\cos x + 2x \\sin x + 2\\cos x + C'),
      [
        tex('x^{2} \\cos x - 2x \\sin x - 2\\cos x + C'),
        tex('-x^{2} \\cos x - 2x \\sin x + 2\\cos x + C'),
        tex('-x^{2} \\cos x + 2\\sin x + C'),
        tex('-\\dfrac{x^{3}}{3}\\cos x + C'),
      ],
      'Parts twice: $\\int x^{2}\\sin x\\,dx = -x^{2}\\cos x + 2\\int x\\cos x\\,dx = -x^{2}\\cos x + 2x\\sin x + 2\\cos x + C$.',
      4,
    ),
    T(
      'Evaluate $\\int e^{x} \\sin x\\,dx$.',
      tex('\\dfrac{1}{2}e^{x}(\\sin x - \\cos x) + C'),
      [
        tex('\\dfrac{1}{2}e^{x}(\\sin x + \\cos x) + C'),
        tex('\\dfrac{1}{2}e^{x}(\\cos x - \\sin x) + C'),
        tex('e^{x}(\\sin x - \\cos x) + C'),
        tex('e^{x}\\sin x + C'),
      ],
      'Apply parts twice and solve for the integral: $\\int e^{x}\\sin x\\,dx = \\tfrac{1}{2}e^{x}(\\sin x - \\cos x) + C$.',
      5,
    ),
    T(
      'Evaluate $\\int e^{x} \\cos x\\,dx$.',
      tex('\\dfrac{1}{2}e^{x}(\\sin x + \\cos x) + C'),
      [
        tex('\\dfrac{1}{2}e^{x}(\\sin x - \\cos x) + C'),
        tex('\\dfrac{1}{2}e^{x}(\\cos x - \\sin x) + C'),
        tex('e^{x}(\\sin x + \\cos x) + C'),
        tex('e^{x}\\cos x + C'),
      ],
      'Apply parts twice and solve for the integral: $\\int e^{x}\\cos x\\,dx = \\tfrac{1}{2}e^{x}(\\sin x + \\cos x) + C$.',
      5,
    ),
  );

  // Conceptual.
  out.push(
    T(
      'The integration by parts formula is:',
      tex('\\int u\\,dv = uv - \\int v\\,du'),
      [tex('\\int u\\,dv = uv + \\int v\\,du'), tex('\\int u\\,dv = \\int u\\,du - v'), tex('\\int u\\,dv = uv')],
      'Integration by parts: $\\int u\\,dv = uv - \\int v\\,du$.',
      1,
    ),
    T(
      'Integration by parts is derived from which differentiation rule?',
      'the product rule',
      ['the quotient rule', 'the chain rule', "L'Hopital's rule"],
      'Integrating the product rule $(uv)\' = u\'v + uv\'$ gives the parts formula.',
      1,
    ),
    T(
      'The LIATE guideline helps you choose:',
      tex('u'),
      [tex('dv'), tex('v'), tex('du')],
      'LIATE ranks function types to pick $u$, the part you differentiate.',
      1,
    ),
    T(
      'The "L" in LIATE stands for:',
      'logarithmic functions',
      ['linear functions', 'limit functions', 'left-hand functions'],
      'LIATE = Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential.',
      1,
    ),
    T(
      'For $\\int x e^{x}\\,dx$, the best choice of $u$ is:',
      tex('u = x'),
      [tex('u = e^{x}'), tex('u = x e^{x}'), tex('u = dx')],
      'Differentiating $u = x$ simplifies it to $1$, so choose $u = x$, $dv = e^{x}\\,dx$.',
      2,
    ),
    T(
      'For $\\int x \\ln x\\,dx$, the best choice of $u$ is:',
      tex('u = \\ln x'),
      [tex('u = x'), tex('u = x \\ln x'), tex('u = dx')],
      'Logarithms come first in LIATE, so let $u = \\ln x$, $dv = x\\,dx$.',
      2,
    ),
    T(
      'To integrate $\\int \\ln x\\,dx$ by parts, you take:',
      tex('u = \\ln x, \\; dv = dx'),
      [tex('u = 1, \\; dv = \\ln x\\,dx'), tex('u = x, \\; dv = \\ln x\\,dx'), tex('u = dx, \\; dv = \\ln x')],
      'There is no obvious $dv$, so take $dv = dx$ and $u = \\ln x$.',
      2,
    ),
    T(
      'Tabular integration is a shortcut for:',
      'repeated integration by parts',
      ['partial fraction decomposition', 'trigonometric substitution', 'numerical integration'],
      'Tabular integration organizes repeated parts, useful for $\\int x^{n} e^{ax}\\,dx$.',
      1,
    ),
    T(
      'Evaluating $\\int x^{3} e^{x}\\,dx$ by parts requires applying the formula:',
      'three times',
      ['once', 'twice', 'never'],
      'Each application lowers the power of $x$ by one, so $x^{3}$ needs three applications.',
      2,
    ),
    T(
      'The definite integration by parts formula is:',
      tex('\\int_a^b u\\,dv = [uv]_a^b - \\int_a^b v\\,du'),
      [
        tex('\\int_a^b u\\,dv = [uv]_a^b + \\int_a^b v\\,du'),
        tex('\\int_a^b u\\,dv = \\int_a^b v\\,du'),
        tex('\\int_a^b u\\,dv = [u]_a^b [v]_a^b'),
      ],
      'Evaluate the $uv$ term at the limits: $[uv]_a^b - \\int_a^b v\\,du$.',
      1,
    ),
  );

  return out;
}

// Topic 3: Trigonometric Integrals
function trigonometricIntegrals(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Trigonometric Integrals', 'trig-int');

  // Power reduction: int sin^2(ax) and int cos^2(ax).
  for (let a = 1; a <= 5; a += 1) {
    out.push(
      T(
        `Evaluate $\\int ${trig('sin', a)}^{2}\\,dx$.`,
        tex(`\\dfrac{x}{2} - ${over(trig('sin', 2 * a), 4 * a)} + C`),
        [
          tex(`\\dfrac{x}{2} + ${over(trig('sin', 2 * a), 4 * a)} + C`),
          tex(`\\dfrac{x}{2} - ${over(trig('sin', 2 * a), 2 * a)} + C`),
          tex(`${over(`${trig('sin', a)}^{3}`, 3)} + C`),
          tex(`-${over(trig('cos', a), a)} + C`),
        ],
        `Use $\\sin^{2}\\theta = \\tfrac{1 - \\cos 2\\theta}{2}$: $\\int ${trig('sin', a)}^{2}\\,dx = \\dfrac{x}{2} - ${over(trig('sin', 2 * a), 4 * a)} + C$.`,
        3,
      ),
    );
    out.push(
      T(
        `Evaluate $\\int ${trig('cos', a)}^{2}\\,dx$.`,
        tex(`\\dfrac{x}{2} + ${over(trig('sin', 2 * a), 4 * a)} + C`),
        [
          tex(`\\dfrac{x}{2} - ${over(trig('sin', 2 * a), 4 * a)} + C`),
          tex(`\\dfrac{x}{2} + ${over(trig('sin', 2 * a), 2 * a)} + C`),
          tex(`${over(`${trig('cos', a)}^{3}`, 3)} + C`),
          tex(`${over(trig('sin', a), a)} + C`),
        ],
        `Use $\\cos^{2}\\theta = \\tfrac{1 + \\cos 2\\theta}{2}$: $\\int ${trig('cos', a)}^{2}\\,dx = \\dfrac{x}{2} + ${over(trig('sin', 2 * a), 4 * a)} + C$.`,
        3,
      ),
    );
  }

  // Odd powers (vetted).
  out.push(
    T(
      'Evaluate $\\int \\sin^{3} x\\,dx$.',
      tex('-\\cos x + \\dfrac{\\cos^{3} x}{3} + C'),
      [
        tex('\\cos x - \\dfrac{\\cos^{3} x}{3} + C'),
        tex('\\dfrac{\\sin^{4} x}{4} + C'),
        tex('-\\dfrac{\\cos^{3} x}{3} + C'),
        tex('\\cos x + \\dfrac{\\cos^{3} x}{3} + C'),
      ],
      'Write $\\sin^{3} x = \\sin x(1 - \\cos^{2} x)$ and let $u = \\cos x$: $-\\cos x + \\dfrac{\\cos^{3} x}{3} + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\cos^{3} x\\,dx$.',
      tex('\\sin x - \\dfrac{\\sin^{3} x}{3} + C'),
      [
        tex('-\\sin x + \\dfrac{\\sin^{3} x}{3} + C'),
        tex('\\dfrac{\\cos^{4} x}{4} + C'),
        tex('\\dfrac{\\sin^{3} x}{3} + C'),
        tex('\\sin x + \\dfrac{\\sin^{3} x}{3} + C'),
      ],
      'Write $\\cos^{3} x = \\cos x(1 - \\sin^{2} x)$ and let $u = \\sin x$: $\\sin x - \\dfrac{\\sin^{3} x}{3} + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\sin^{5} x\\,dx$.',
      tex('-\\cos x + \\dfrac{2\\cos^{3} x}{3} - \\dfrac{\\cos^{5} x}{5} + C'),
      [
        tex('\\cos x - \\dfrac{2\\cos^{3} x}{3} + \\dfrac{\\cos^{5} x}{5} + C'),
        tex('-\\cos x + \\dfrac{\\cos^{3} x}{3} - \\dfrac{\\cos^{5} x}{5} + C'),
        tex('\\dfrac{\\sin^{6} x}{6} + C'),
        tex('-\\dfrac{\\cos^{5} x}{5} + C'),
      ],
      'With $\\sin^{5} x = \\sin x(1 - \\cos^{2} x)^{2}$ and $u = \\cos x$: $-\\cos x + \\tfrac{2}{3}\\cos^{3} x - \\tfrac{1}{5}\\cos^{5} x + C$.',
      4,
    ),
    T(
      'Evaluate $\\int \\cos^{5} x\\,dx$.',
      tex('\\sin x - \\dfrac{2\\sin^{3} x}{3} + \\dfrac{\\sin^{5} x}{5} + C'),
      [
        tex('-\\sin x + \\dfrac{2\\sin^{3} x}{3} - \\dfrac{\\sin^{5} x}{5} + C'),
        tex('\\sin x - \\dfrac{\\sin^{3} x}{3} + \\dfrac{\\sin^{5} x}{5} + C'),
        tex('\\dfrac{\\cos^{6} x}{6} + C'),
        tex('\\dfrac{\\sin^{5} x}{5} + C'),
      ],
      'With $\\cos^{5} x = \\cos x(1 - \\sin^{2} x)^{2}$ and $u = \\sin x$: $\\sin x - \\tfrac{2}{3}\\sin^{3} x + \\tfrac{1}{5}\\sin^{5} x + C$.',
      4,
    ),
  );

  // Basic trig integrals (vetted).
  out.push(
    T(
      'Evaluate $\\int \\tan x\\,dx$.',
      tex('-\\ln|\\cos x| + C'),
      [tex('\\ln|\\sin x| + C'), tex('\\sec^{2} x + C'), tex('\\tan^{2} x + C'), tex('\\ln|\\cos x| + C')],
      'Let $u = \\cos x$: $\\int \\tan x\\,dx = -\\ln|\\cos x| + C = \\ln|\\sec x| + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\cot x\\,dx$.',
      tex('\\ln|\\sin x| + C'),
      [tex('-\\ln|\\sin x| + C'), tex('-\\csc^{2} x + C'), tex('\\ln|\\cos x| + C'), tex('\\cot^{2} x + C')],
      'Let $u = \\sin x$: $\\int \\cot x\\,dx = \\ln|\\sin x| + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\sec x\\,dx$.',
      tex('\\ln|\\sec x + \\tan x| + C'),
      [tex('\\ln|\\cos x| + C'), tex('\\sec x \\tan x + C'), tex('\\tan x + C'), tex('\\ln|\\sec x - \\tan x| + C')],
      'A standard result: $\\int \\sec x\\,dx = \\ln|\\sec x + \\tan x| + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\csc x\\,dx$.',
      tex('-\\ln|\\csc x + \\cot x| + C'),
      [tex('\\ln|\\csc x + \\cot x| + C'), tex('-\\csc x \\cot x + C'), tex('-\\cot x + C'), tex('\\ln|\\sin x| + C')],
      'A standard result: $\\int \\csc x\\,dx = -\\ln|\\csc x + \\cot x| + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\sec^{2} x\\,dx$.',
      tex('\\tan x + C'),
      [tex('\\sec x + C'), tex('\\sec x \\tan x + C'), tex('-\\cot x + C'), tex('\\tan^{2} x + C')],
      'Since $\\tfrac{d}{dx}\\tan x = \\sec^{2} x$, $\\int \\sec^{2} x\\,dx = \\tan x + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\csc^{2} x\\,dx$.',
      tex('-\\cot x + C'),
      [tex('\\cot x + C'), tex('\\tan x + C'), tex('-\\csc x + C'), tex('\\csc x \\cot x + C')],
      'Since $\\tfrac{d}{dx}\\cot x = -\\csc^{2} x$, $\\int \\csc^{2} x\\,dx = -\\cot x + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\sec x \\tan x\\,dx$.',
      tex('\\sec x + C'),
      [tex('\\tan x + C'), tex('\\sec^{2} x + C'), tex('\\dfrac{\\sec^{2} x}{2} + C'), tex('\\csc x + C')],
      'Since $\\tfrac{d}{dx}\\sec x = \\sec x \\tan x$, the integral is $\\sec x + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\csc x \\cot x\\,dx$.',
      tex('-\\csc x + C'),
      [tex('\\csc x + C'), tex('-\\cot x + C'), tex('\\csc^{2} x + C'), tex('\\sec x + C')],
      'Since $\\tfrac{d}{dx}\\csc x = -\\csc x \\cot x$, the integral is $-\\csc x + C$.',
      2,
    ),
  );

  // tan^2, cot^2, and u = tan / u = cot patterns.
  out.push(
    T(
      'Evaluate $\\int \\tan^{2} x\\,dx$.',
      tex('\\tan x - x + C'),
      [tex('\\tan x + x + C'), tex('\\dfrac{\\tan^{3} x}{3} + C'), tex('\\sec^{2} x - x + C'), tex('\\tan x - 1 + C')],
      'Use $\\tan^{2} x = \\sec^{2} x - 1$: $\\int \\tan^{2} x\\,dx = \\tan x - x + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\cot^{2} x\\,dx$.',
      tex('-\\cot x - x + C'),
      [tex('-\\cot x + x + C'), tex('\\cot x - x + C'), tex('-\\csc^{2} x - x + C'), tex('-\\dfrac{\\cot^{3} x}{3} + C')],
      'Use $\\cot^{2} x = \\csc^{2} x - 1$: $\\int \\cot^{2} x\\,dx = -\\cot x - x + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\tan x \\sec^{2} x\\,dx$.',
      tex('\\dfrac{1}{2}\\tan^{2} x + C'),
      [tex('\\dfrac{1}{2}\\sec^{2} x + C'), tex('\\tan^{2} x + C'), tex('\\sec x \\tan x + C'), tex('\\dfrac{\\tan^{3} x}{3} + C')],
      'Let $u = \\tan x$, $du = \\sec^{2} x\\,dx$: $\\int u\\,du = \\tfrac{1}{2}\\tan^{2} x + C$.',
      3,
    ),
    T(
      'Evaluate $\\int \\cot x \\csc^{2} x\\,dx$.',
      tex('-\\dfrac{1}{2}\\cot^{2} x + C'),
      [tex('\\dfrac{1}{2}\\cot^{2} x + C'), tex('-\\dfrac{1}{2}\\csc^{2} x + C'), tex('-\\csc x + C'), tex('\\dfrac{\\cot^{3} x}{3} + C')],
      'Let $u = \\cot x$, $du = -\\csc^{2} x\\,dx$: $-\\int u\\,du = -\\tfrac{1}{2}\\cot^{2} x + C$.',
      3,
    ),
  );

  // int sin x cos^n x dx = -cos^{n+1} x /(n+1) + C.
  for (let n = 2; n <= 9; n += 1) {
    out.push(
      T(
        `Evaluate $\\int \\sin x \\cos^{${n}} x\\,dx$.`,
        tex(`-${over(`\\cos^{${n + 1}} x`, n + 1)} + C`),
        [
          tex(`${over(`\\cos^{${n + 1}} x`, n + 1)} + C`),
          tex(`-${over(`\\cos^{${n + 1}} x`, n)} + C`),
          tex(`${over(`\\sin^{${n + 1}} x`, n + 1)} + C`),
          tex(`-${over(`\\cos^{${n}} x`, n)} + C`),
        ],
        `Let $u = \\cos x$, $du = -\\sin x\\,dx$: $\\int \\sin x \\cos^{${n}} x\\,dx = -${over(`\\cos^{${n + 1}} x`, n + 1)} + C$.`,
        3,
      ),
    );
  }

  // int cos x sin^n x dx = sin^{n+1} x /(n+1) + C.
  for (let n = 2; n <= 9; n += 1) {
    out.push(
      T(
        `Evaluate $\\int \\cos x \\sin^{${n}} x\\,dx$.`,
        tex(`${over(`\\sin^{${n + 1}} x`, n + 1)} + C`),
        [
          tex(`-${over(`\\sin^{${n + 1}} x`, n + 1)} + C`),
          tex(`${over(`\\sin^{${n + 1}} x`, n)} + C`),
          tex(`-${over(`\\cos^{${n + 1}} x`, n + 1)} + C`),
          tex(`${over(`\\sin^{${n}} x`, n)} + C`),
        ],
        `Let $u = \\sin x$, $du = \\cos x\\,dx$: $\\int \\cos x \\sin^{${n}} x\\,dx = ${over(`\\sin^{${n + 1}} x`, n + 1)} + C$.`,
        3,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'To evaluate $\\int \\sin^{2} x\\,dx$, the most useful identity is:',
      tex('\\sin^{2} x = \\dfrac{1 - \\cos 2x}{2}'),
      [tex('\\sin^{2} x = 1 - \\cos^{2} x'), tex('\\sin^{2} x = \\dfrac{1 + \\cos 2x}{2}'), tex('\\sin 2x = 2\\sin x \\cos x')],
      'The power-reduction identity turns the even power into a first-degree cosine that integrates directly.',
      2,
    ),
    T(
      'For $\\int \\sin^{m} x \\cos^{n} x\\,dx$ with $n$ odd, the best first step is to:',
      'save one $\\cos x$ for $du$ and convert the rest with $\\cos^{2} x = 1 - \\sin^{2} x$',
      [
        'use power reduction on both factors',
        'apply partial fractions',
        'substitute $x = \\sin\\theta$',
      ],
      'An odd cosine power lets you peel off $\\cos x\\,dx = du$ with $u = \\sin x$.',
      2,
    ),
    T(
      'For $\\int \\sin^{m} x \\cos^{n} x\\,dx$ with both $m$ and $n$ even, you should:',
      'use power-reduction identities',
      [
        'save one factor for $du$',
        'use trigonometric substitution',
        'use integration by parts',
      ],
      'With both even, repeatedly apply the half-angle (power-reduction) identities.',
      2,
    ),
    T(
      'The product-to-sum identity for $\\sin A \\cos B$ is:',
      tex('\\dfrac{1}{2}[\\sin(A + B) + \\sin(A - B)]'),
      [
        tex('\\dfrac{1}{2}[\\cos(A + B) + \\cos(A - B)]'),
        tex('\\sin(A + B)\\sin(A - B)'),
        tex('2\\sin A \\cos B'),
      ],
      'This identity linearizes products like $\\int \\sin(mx)\\cos(nx)\\,dx$.',
      2,
    ),
    T(
      'For $\\int \\tan^{m} x \\sec^{n} x\\,dx$ with $n$ even ($n \\ge 2$), save a factor of:',
      tex('\\sec^{2} x'),
      [tex('\\sec x \\tan x'), tex('\\tan x'), tex('\\sec x')],
      'Save $\\sec^{2} x\\,dx = du$ with $u = \\tan x$, converting the rest via $\\sec^{2} x = 1 + \\tan^{2} x$.',
      2,
    ),
    T(
      'For $\\int \\tan^{m} x \\sec^{n} x\\,dx$ with $m$ odd, save a factor of:',
      tex('\\sec x \\tan x'),
      [tex('\\sec^{2} x'), tex('\\tan^{2} x'), tex('\\sec x')],
      'Save $\\sec x \\tan x\\,dx = du$ with $u = \\sec x$, converting the rest via $\\tan^{2} x = \\sec^{2} x - 1$.',
      2,
    ),
    T(
      'The Pythagorean identity $\\sin^{2} x + \\cos^{2} x$ equals:',
      tex('1'),
      [tex('2'), tex('\\cos 2x'), tex('\\sin 2x')],
      'The Pythagorean identity: $\\sin^{2} x + \\cos^{2} x = 1$.',
      1,
    ),
    T(
      'Which expression equals $\\int \\tan x\\,dx$?',
      tex('\\ln|\\sec x| + C'),
      [tex('\\ln|\\csc x| + C'), tex('\\ln|\\cos x| + C'), tex('\\ln|\\cot x| + C')],
      'Because $-\\ln|\\cos x| = \\ln|\\sec x|$.',
      2,
    ),
    T(
      'The double-angle identity $\\cos 2x$ can be written as:',
      tex('1 - 2\\sin^{2} x'),
      [tex('2\\sin x \\cos x'), tex('1 + 2\\sin^{2} x'), tex('2\\sin^{2} x - 1')],
      'Valid forms: $\\cos 2x = 1 - 2\\sin^{2} x = 2\\cos^{2} x - 1 = \\cos^{2} x - \\sin^{2} x$.',
      1,
    ),
    T(
      'To integrate $\\int \\sin(3x)\\cos(5x)\\,dx$, the recommended approach is:',
      'a product-to-sum identity',
      ['power reduction', 'a trigonometric substitution', 'partial fractions'],
      'Different frequencies call for product-to-sum to split into integrable single sines.',
      2,
    ),
  );

  return out;
}

// Topic 4: Trigonometric Substitution
function trigonometricSubstitution(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Trigonometric Substitution', 'trig-sub');

  // Which substitution for each radical form.
  for (const a of [2, 3, 4, 5]) {
    out.push(
      T(
        `For an integral containing $\\sqrt{${a * a} - x^{2}}$, the correct substitution is:`,
        tex(`x = ${a}\\sin\\theta`),
        [tex(`x = ${a}\\tan\\theta`), tex(`x = ${a}\\sec\\theta`), tex(`x = ${a}\\cos\\theta`)],
        `Use $x = ${a}\\sin\\theta$ so that $\\sqrt{${a * a} - x^{2}} = ${a}\\cos\\theta$.`,
        2,
      ),
    );
    out.push(
      T(
        `For an integral containing $\\sqrt{${a * a} + x^{2}}$, the correct substitution is:`,
        tex(`x = ${a}\\tan\\theta`),
        [tex(`x = ${a}\\sin\\theta`), tex(`x = ${a}\\sec\\theta`), tex(`x = ${a}\\cos\\theta`)],
        `Use $x = ${a}\\tan\\theta$ so that $\\sqrt{${a * a} + x^{2}} = ${a}\\sec\\theta$.`,
        2,
      ),
    );
    out.push(
      T(
        `For an integral containing $\\sqrt{x^{2} - ${a * a}}$, the correct substitution is:`,
        tex(`x = ${a}\\sec\\theta`),
        [tex(`x = ${a}\\sin\\theta`), tex(`x = ${a}\\tan\\theta`), tex(`x = ${a}\\cos\\theta`)],
        `Use $x = ${a}\\sec\\theta$ so that $\\sqrt{x^{2} - ${a * a}} = ${a}\\tan\\theta$.`,
        2,
      ),
    );
  }

  // What the radical simplifies to after substitution.
  for (const a of [2, 3, 4]) {
    out.push(
      T(
        `Using $x = ${a}\\sin\\theta$, the radical $\\sqrt{${a * a} - x^{2}}$ simplifies to:`,
        tex(`${a}\\cos\\theta`),
        [tex(`${a}\\sin\\theta`), tex(`${a}\\tan\\theta`), tex(`${a}\\sec\\theta`)],
        `$\\sqrt{${a * a} - ${a * a}\\sin^{2}\\theta} = ${a}\\sqrt{1 - \\sin^{2}\\theta} = ${a}\\cos\\theta$.`,
        3,
      ),
    );
    out.push(
      T(
        `Using $x = ${a}\\tan\\theta$, the radical $\\sqrt{${a * a} + x^{2}}$ simplifies to:`,
        tex(`${a}\\sec\\theta`),
        [tex(`${a}\\tan\\theta`), tex(`${a}\\cos\\theta`), tex(`${a}\\sin\\theta`)],
        `$\\sqrt{${a * a} + ${a * a}\\tan^{2}\\theta} = ${a}\\sqrt{1 + \\tan^{2}\\theta} = ${a}\\sec\\theta$.`,
        3,
      ),
    );
    out.push(
      T(
        `Using $x = ${a}\\sec\\theta$, the radical $\\sqrt{x^{2} - ${a * a}}$ simplifies to:`,
        tex(`${a}\\tan\\theta`),
        [tex(`${a}\\sec\\theta`), tex(`${a}\\sin\\theta`), tex(`${a}\\cos\\theta`)],
        `$\\sqrt{${a * a}\\sec^{2}\\theta - ${a * a}} = ${a}\\sqrt{\\sec^{2}\\theta - 1} = ${a}\\tan\\theta$.`,
        3,
      ),
    );
  }

  // int dx/sqrt(a^2 - x^2) = arcsin(x/a) + C.
  for (let a = 1; a <= 5; a += 1) {
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{\\sqrt{${a * a} - x^{2}}}$.`,
        tex(`\\arcsin ${divx(a)} + C`),
        [
          tex(`\\arccos ${divx(a)} + C`),
          tex(`\\arctan ${divx(a)} + C`),
          tex(`-\\arcsin ${divx(a)} + C`),
          tex(`\\ln|x + \\sqrt{x^{2} + ${a * a}}| + C`),
        ],
        `Standard form $\\int \\dfrac{dx}{\\sqrt{a^{2} - x^{2}}} = \\arcsin\\dfrac{x}{a} + C$ with $a = ${a}$.`,
        3,
      ),
    );
  }

  // int dx/(a^2 + x^2) = (1/a) arctan(x/a) + C.
  for (let a = 1; a <= 5; a += 1) {
    const lead = a === 1 ? '' : `\\dfrac{1}{${a}}`;
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{${a * a} + x^{2}}$.`,
        tex(`${lead}\\arctan ${divx(a)} + C`),
        [
          tex(`\\arctan ${divx(a)} + C`),
          tex(`${lead}\\arcsin ${divx(a)} + C`),
          tex(`-${lead}\\arctan ${divx(a)} + C`),
          tex(`\\ln(${a * a} + x^{2}) + C`),
        ],
        `Standard form $\\int \\dfrac{dx}{a^{2} + x^{2}} = \\dfrac{1}{a}\\arctan\\dfrac{x}{a} + C$ with $a = ${a}$.`,
        3,
      ),
    );
  }

  // Quarter-circle area: int_0^a sqrt(a^2 - x^2) dx = pi a^2 / 4.
  for (let a = 1; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int_0^{${a}} \\sqrt{${a * a} - x^{2}}\\,dx$.`,
        tex(ratPiTex(rat(a * a, 4))),
        [
          tex(ratPiTex(rat(a * a, 2))),
          tex(ratPiTex(rat(a * a, 1))),
          tex(ratPiTex(rat(a * a, 8))),
          tex(ratPiTex(rat(a * a, 3))),
        ],
        `This is the area of a quarter disk of radius $${a}$: $\\dfrac{1}{4}\\pi (${a})^{2} = ${ratPiTex(rat(a * a, 4))}$.`,
        3,
      ),
    );
  }

  // Half-circle area: int_{-a}^{a} sqrt(a^2 - x^2) dx = pi a^2 / 2.
  for (let a = 1; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int_{-${a}}^{${a}} \\sqrt{${a * a} - x^{2}}\\,dx$.`,
        tex(ratPiTex(rat(a * a, 2))),
        [
          tex(ratPiTex(rat(a * a, 4))),
          tex(ratPiTex(rat(a * a, 1))),
          tex(ratPiTex(rat(2 * a * a, 1))),
          tex(ratPiTex(rat(a * a, 3))),
        ],
        `This is the area of a half disk of radius $${a}$: $\\dfrac{1}{2}\\pi (${a})^{2} = ${ratPiTex(rat(a * a, 2))}$.`,
        3,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'The purpose of trigonometric substitution is to:',
      'remove a square root using a Pythagorean identity',
      [
        'turn the integral into a polynomial division',
        'eliminate the constant of integration',
        'avoid using the chain rule',
      ],
      'Substituting trig functions lets identities like $1 - \\sin^{2}\\theta = \\cos^{2}\\theta$ clear the radical.',
      1,
    ),
    T(
      'After integrating in $\\theta$, you convert back to $x$ using:',
      'a reference right triangle built from the substitution',
      ['the quadratic formula', 'a power series', "L'Hopital's rule"],
      'Draw a right triangle encoding $x = a\\sin\\theta$ (etc.) to rewrite trig functions of $\\theta$ in terms of $x$.',
      2,
    ),
    T(
      'For $\\sqrt{a^{2} - x^{2}}$, the identity that clears the radical is:',
      tex('1 - \\sin^{2}\\theta = \\cos^{2}\\theta'),
      [tex('1 + \\tan^{2}\\theta = \\sec^{2}\\theta'), tex('\\sec^{2}\\theta - 1 = \\tan^{2}\\theta'), tex('\\sin^{2}\\theta + \\cos^{2}\\theta = 2')],
      'With $x = a\\sin\\theta$, $a^{2} - x^{2} = a^{2}\\cos^{2}\\theta$.',
      2,
    ),
    T(
      'For $\\sqrt{a^{2} + x^{2}}$, the identity that clears the radical is:',
      tex('1 + \\tan^{2}\\theta = \\sec^{2}\\theta'),
      [tex('1 - \\sin^{2}\\theta = \\cos^{2}\\theta'), tex('\\sec^{2}\\theta - 1 = \\tan^{2}\\theta'), tex('1 + \\cot^{2}\\theta = \\csc^{2}\\theta')],
      'With $x = a\\tan\\theta$, $a^{2} + x^{2} = a^{2}\\sec^{2}\\theta$.',
      2,
    ),
    T(
      'For $\\sqrt{x^{2} - a^{2}}$, the identity that clears the radical is:',
      tex('\\sec^{2}\\theta - 1 = \\tan^{2}\\theta'),
      [tex('1 - \\sin^{2}\\theta = \\cos^{2}\\theta'), tex('1 + \\tan^{2}\\theta = \\sec^{2}\\theta'), tex('1 + \\cot^{2}\\theta = \\csc^{2}\\theta')],
      'With $x = a\\sec\\theta$, $x^{2} - a^{2} = a^{2}\\tan^{2}\\theta$.',
      2,
    ),
    T(
      'With the substitution $x = a\\sin\\theta$, the differential $dx$ equals:',
      tex('a\\cos\\theta\\,d\\theta'),
      [tex('a\\sin\\theta\\,d\\theta'), tex('a\\sec^{2}\\theta\\,d\\theta'), tex('-a\\cos\\theta\\,d\\theta')],
      'Differentiating $x = a\\sin\\theta$ gives $dx = a\\cos\\theta\\,d\\theta$.',
      2,
    ),
    T(
      'An integrand with $\\sqrt{x^{2} + 2x + 5}$ is prepared for trig substitution by first:',
      'completing the square to $\\sqrt{(x + 1)^{2} + 4}$',
      ['using partial fractions', 'factoring out $x$', 'differentiating the radicand'],
      'Completing the square produces a standard $\\sqrt{u^{2} + a^{2}}$ form.',
      3,
    ),
    T(
      'The closed form $\\int \\dfrac{dx}{\\sqrt{a^{2} - x^{2}}}$ is:',
      tex('\\arcsin\\dfrac{x}{a} + C'),
      [tex('\\arctan\\dfrac{x}{a} + C'), tex('\\dfrac{1}{a}\\arcsin\\dfrac{x}{a} + C'), tex('\\ln|x + \\sqrt{a^{2} - x^{2}}| + C')],
      'A direct trig-substitution result: $\\arcsin\\dfrac{x}{a} + C$.',
      2,
    ),
    T(
      'The closed form $\\int \\dfrac{dx}{a^{2} + x^{2}}$ is:',
      tex('\\dfrac{1}{a}\\arctan\\dfrac{x}{a} + C'),
      [tex('\\arctan\\dfrac{x}{a} + C'), tex('\\arcsin\\dfrac{x}{a} + C'), tex('\\dfrac{1}{a}\\arcsin\\dfrac{x}{a} + C')],
      'A direct trig-substitution result: $\\dfrac{1}{a}\\arctan\\dfrac{x}{a} + C$.',
      2,
    ),
    T(
      'Trig substitution is usually preferred when the integrand contains:',
      'an irreducible square root of a quadratic',
      [
        'a product of distinct linear factors',
        'a polynomial times an exponential',
        'a simple power of $x$',
      ],
      'Radicals of quadratics are the signature case for trig substitution.',
      2,
    ),
  );

  return out;
}

// Topic 5: Partial Fraction Decomposition
function partialFractions(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Partial Fraction Decomposition', 'partial-frac');

  const pairs: Array<[number, number]> = [
    [1, 2],
    [2, 1],
    [1, 3],
    [3, 1],
    [2, 3],
    [3, 2],
    [1, 4],
    [4, 1],
    [1, 5],
    [5, 1],
  ];

  // Find A in 1/((x-r)(x-s)) = A/(x-r) + B/(x-s); A = 1/(r-s).
  for (const [r, s] of pairs) {
    out.push(
      T(
        `In $\\dfrac{1}{${factor(r)}${factor(s)}} = \\dfrac{A}{${factor(r)}} + \\dfrac{B}{${factor(s)}}$, find $A$.`,
        tex(ratTex(rat(1, r - s))),
        [
          tex(ratTex(rat(1, s - r))),
          tex(ratTex(rat(1, r + s))),
          tex(ratTex(rat(1, r * s))),
          tex(ratTex(rat(r - s, 1))),
        ],
        `Cover up $x = ${r}$: $A = \\dfrac{1}{${r} - ${s}} = ${ratTex(rat(1, r - s))}$.`,
        3,
      ),
    );
  }

  // Find B in 1/((x-r)(x-s)) = A/(x-r) + B/(x-s); B = 1/(s-r).
  for (const [r, s] of pairs.slice(0, 6)) {
    out.push(
      T(
        `In $\\dfrac{1}{${factor(r)}${factor(s)}} = \\dfrac{A}{${factor(r)}} + \\dfrac{B}{${factor(s)}}$, find $B$.`,
        tex(ratTex(rat(1, s - r))),
        [
          tex(ratTex(rat(1, r - s))),
          tex(ratTex(rat(1, r + s))),
          tex(ratTex(rat(1, r * s))),
          tex(ratTex(rat(s - r, 1))),
        ],
        `Cover up $x = ${s}$: $B = \\dfrac{1}{${s} - ${r}} = ${ratTex(rat(1, s - r))}$.`,
        3,
      ),
    );
  }

  // int dx/((x-r)(x-s)) = 1/(r-s) ln|(x-r)/(x-s)| + C.
  const intPairs: Array<[number, number]> = [
    [1, 2],
    [1, 3],
    [2, 3],
    [1, 4],
    [2, 4],
    [3, 4],
  ];
  for (const [r, s] of intPairs) {
    const lead = coefMul(rat(1, r - s));
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{${factor(r)}${factor(s)}}$.`,
        tex(`${lead}\\ln\\left|\\dfrac{${factor(r)}}{${factor(s)}}\\right| + C`),
        [
          tex(`${lead}\\ln\\left|\\dfrac{${factor(s)}}{${factor(r)}}\\right| + C`),
          tex(`\\ln\\left|${factor(r)}${factor(s)}\\right| + C`),
          tex(`${lead}\\ln\\left|${factor(r)}${factor(s)}\\right| + C`),
          tex(`\\ln\\left|\\dfrac{${factor(r)}}{${factor(s)}}\\right| + C`),
        ],
        `Decompose $\\dfrac{1}{${factor(r)}${factor(s)}} = ${ratTex(rat(1, r - s))}\\left(\\dfrac{1}{${factor(r)}} - \\dfrac{1}{${factor(s)}}\\right)$ and integrate to get $${lead}\\ln\\left|\\dfrac{${factor(r)}}{${factor(s)}}\\right| + C$.`,
        4,
      ),
    );
  }

  // int dx/(x^2 - a^2) = 1/(2a) ln|(x-a)/(x+a)| + C.
  for (let a = 1; a <= 5; a += 1) {
    const lead = coefMul(rat(1, 2 * a));
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{x^{2} - ${a * a}}$.`,
        tex(`${lead}\\ln\\left|\\dfrac{x - ${a}}{x + ${a}}\\right| + C`),
        [
          tex(`${lead}\\ln\\left|\\dfrac{x + ${a}}{x - ${a}}\\right| + C`),
          tex(`\\ln|x^{2} - ${a * a}| + C`),
          tex(`${lead}\\ln|x^{2} - ${a * a}| + C`),
          tex(`\\arctan\\dfrac{x}{${a}} + C`),
        ],
        `Since $\\dfrac{1}{x^{2} - ${a * a}} = \\dfrac{1}{${2 * a}}\\left(\\dfrac{1}{x - ${a}} - \\dfrac{1}{x + ${a}}\\right)$, the integral is $${lead}\\ln\\left|\\dfrac{x - ${a}}{x + ${a}}\\right| + C$.`,
        4,
      ),
    );
  }

  // int dx/(x(x+a)) = (1/a) ln|x/(x+a)| + C.
  for (let a = 1; a <= 5; a += 1) {
    const lead = coefMul(rat(1, a));
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{x(x + ${a})}$.`,
        tex(`${lead}\\ln\\left|\\dfrac{x}{x + ${a}}\\right| + C`),
        [
          tex(`${lead}\\ln\\left|\\dfrac{x + ${a}}{x}\\right| + C`),
          tex(`\\ln|x(x + ${a})| + C`),
          tex(`${lead}\\ln|x(x + ${a})| + C`),
          tex(`\\arctan\\dfrac{x}{${a}} + C`),
        ],
        `Since $\\dfrac{1}{x(x + ${a})} = \\dfrac{1}{${a}}\\left(\\dfrac{1}{x} - \\dfrac{1}{x + ${a}}\\right)$, the integral is $${lead}\\ln\\left|\\dfrac{x}{x + ${a}}\\right| + C$.`,
        4,
      ),
    );
  }

  // Cover-up to find A in (p x + q)/((x-r)(x-s)) at x = r.
  const coverUps: Array<[number, number, number, number]> = [
    [1, 0, 1, 2],
    [1, 1, 0, 2],
    [2, 0, 1, 3],
    [1, 2, 1, 3],
    [3, 0, 2, 4],
    [1, 1, 1, 4],
    [2, 1, 0, 3],
    [1, 3, 2, 5],
  ];
  for (const [p, q, r, s] of coverUps) {
    const num = p * r + q;
    const den = r - s;
    out.push(
      T(
        `For $\\dfrac{${lin(p, q)}}{${factor(r)}${factor(s)}} = \\dfrac{A}{${factor(r)}} + \\dfrac{B}{${factor(s)}}$, find $A$.`,
        tex(ratTex(rat(num, den))),
        [
          tex(ratTex(rat(num, -den))),
          tex(ratTex(rat(p * s + q, den))),
          tex(ratTex(rat(num, r + s || 1))),
          tex(ratTex(rat(p, 1))),
        ],
        `Cover up $x = ${r}$: $A = \\dfrac{${p}(${r}) + ${q}}{${r} - ${s}} = \\dfrac{${num}}{${den}} = ${ratTex(rat(num, den))}$.`,
        3,
      ),
    );
  }

  // Conceptual / setup.
  out.push(
    T(
      'Before decomposing into partial fractions, the rational function must be:',
      'proper (numerator degree less than denominator degree)',
      [
        'a polynomial',
        'already factored into linear terms only',
        'evaluated at a point',
      ],
      'If improper, perform polynomial long division first.',
      2,
    ),
    T(
      'The partial-fraction setup for distinct linear factors $\\dfrac{1}{(x - 1)(x - 2)(x - 3)}$ is:',
      tex('\\dfrac{A}{x - 1} + \\dfrac{B}{x - 2} + \\dfrac{C}{x - 3}'),
      [
        tex('\\dfrac{A}{(x - 1)(x - 2)(x - 3)}'),
        tex('\\dfrac{Ax^{2} + Bx + C}{(x - 1)(x - 2)(x - 3)}'),
        tex('\\dfrac{A}{x - 1} + \\dfrac{B}{(x - 2)^{2}}'),
      ],
      'Each distinct linear factor contributes one constant-over-linear term.',
      2,
    ),
    T(
      'The correct setup for a repeated linear factor $\\dfrac{x}{(x - 2)^{2}}$ is:',
      tex('\\dfrac{A}{x - 2} + \\dfrac{B}{(x - 2)^{2}}'),
      [
        tex('\\dfrac{A}{x - 2}'),
        tex('\\dfrac{Ax + B}{(x - 2)^{2}}'),
        tex('\\dfrac{A}{x - 2} + \\dfrac{B}{x + 2}'),
      ],
      'A repeated factor needs one term for each power up to the multiplicity.',
      3,
    ),
    T(
      'The correct setup for an irreducible quadratic factor $\\dfrac{1}{(x - 1)(x^{2} + 1)}$ is:',
      tex('\\dfrac{A}{x - 1} + \\dfrac{Bx + C}{x^{2} + 1}'),
      [
        tex('\\dfrac{A}{x - 1} + \\dfrac{B}{x^{2} + 1}'),
        tex('\\dfrac{A}{x - 1} + \\dfrac{B}{x + 1} + \\dfrac{C}{x - 1}'),
        tex('\\dfrac{Ax + B}{(x - 1)(x^{2} + 1)}'),
      ],
      'An irreducible quadratic factor gets a linear numerator $Bx + C$.',
      3,
    ),
    T(
      'If the numerator degree is greater than or equal to the denominator degree, first:',
      'perform polynomial long division',
      ['differentiate the numerator', 'multiply by the conjugate', 'substitute $x = 0$'],
      'Long division yields a polynomial plus a proper remainder fraction to decompose.',
      2,
    ),
    T(
      'The number of unknown constants in a partial-fraction decomposition equals:',
      'the degree of the denominator',
      ['the degree of the numerator', 'the number of distinct roots only', 'always two'],
      'Counting one constant per term matches the denominator degree.',
      2,
    ),
    T(
      'The cover-up method quickly finds the constant over a:',
      'distinct linear factor',
      ['repeated quadratic factor', 'polynomial quotient', 'numerator term'],
      'Cover-up evaluates the remaining expression at the root of a simple linear factor.',
      2,
    ),
    T(
      'Partial-fraction integration typically produces a combination of:',
      'logarithms and arctangents',
      ['only polynomials', 'only exponentials', 'square roots'],
      'Linear factors give logs; irreducible quadratics give arctangents (and logs).',
      2,
    ),
    T(
      'Which denominator is irreducible over the real numbers?',
      tex('x^{2} + 1'),
      [tex('x^{2} - 1'), tex('x^{2} - 4'), tex('x^{2} - x')],
      '$x^{2} + 1$ has no real roots, so it cannot be factored into real linear factors.',
      2,
    ),
    T(
      'The decomposition $\\dfrac{1}{(x - 1)(x + 1)}$ equals:',
      tex('\\dfrac{1/2}{x - 1} - \\dfrac{1/2}{x + 1}'),
      [
        tex('\\dfrac{1}{x - 1} - \\dfrac{1}{x + 1}'),
        tex('\\dfrac{1/2}{x - 1} + \\dfrac{1/2}{x + 1}'),
        tex('\\dfrac{1}{x - 1} + \\dfrac{1}{x + 1}'),
      ],
      'Solving $1 = A(x + 1) + B(x - 1)$ gives $A = \\tfrac{1}{2}$, $B = -\\tfrac{1}{2}$.',
      3,
    ),
  );

  return out;
}

// Topic 6: Hyperbolic Functions
function hyperbolicFunctions(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Hyperbolic Functions', 'hyperbolic');

  // int cosh(ax) dx = sinh(ax)/a + C.
  for (let a = 1; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int ${hyp('cosh', a)}\\,dx$.`,
        tex(`${over(hyp('sinh', a), a)} + C`),
        [
          tex(`${over(hyp('cosh', a), a)} + C`),
          tex(`-${over(hyp('sinh', a), a)} + C`),
          tex(`-${over(hyp('cosh', a), a)} + C`),
          tex(`${over(hyp('sinh', a), a + 1)} + C`),
        ],
        `Since $\\tfrac{d}{dx}${hyp('sinh', a)} = ${a}${hyp('cosh', a)}$, $\\int ${hyp('cosh', a)}\\,dx = ${over(hyp('sinh', a), a)} + C$.`,
        2,
      ),
    );
  }

  // int sinh(ax) dx = cosh(ax)/a + C.
  for (let a = 1; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int ${hyp('sinh', a)}\\,dx$.`,
        tex(`${over(hyp('cosh', a), a)} + C`),
        [
          tex(`${over(hyp('sinh', a), a)} + C`),
          tex(`-${over(hyp('cosh', a), a)} + C`),
          tex(`-${over(hyp('sinh', a), a)} + C`),
          tex(`${over(hyp('cosh', a), a + 1)} + C`),
        ],
        `Since $\\tfrac{d}{dx}${hyp('cosh', a)} = ${a}${hyp('sinh', a)}$, $\\int ${hyp('sinh', a)}\\,dx = ${over(hyp('cosh', a), a)} + C$.`,
        2,
      ),
    );
  }

  // int sech^2(ax) dx = tanh(ax)/a + C.
  for (let a = 1; a <= 5; a += 1) {
    const arg = harg(a);
    out.push(
      T(
        `Evaluate $\\int \\operatorname{sech}^{2}${arg}\\,dx$.`,
        tex(`${over(hyp('tanh', a), a)} + C`),
        [
          tex(`${over(hyp('coth', a), a)} + C`),
          tex(`-${over(hyp('tanh', a), a)} + C`),
          tex(`-${over(hyp('coth', a), a)} + C`),
          tex(`${over(`\\operatorname{sech}${arg}`, a)} + C`),
        ],
        `Since $\\tfrac{d}{dx}${hyp('tanh', a)} = ${a}\\operatorname{sech}^{2}${arg}$, the integral is $${over(hyp('tanh', a), a)} + C$.`,
        2,
      ),
    );
  }

  // int csch^2(ax) dx = -coth(ax)/a + C.
  for (let a = 1; a <= 5; a += 1) {
    const arg = harg(a);
    out.push(
      T(
        `Evaluate $\\int \\operatorname{csch}^{2}${arg}\\,dx$.`,
        tex(`-${over(hyp('coth', a), a)} + C`),
        [
          tex(`${over(hyp('coth', a), a)} + C`),
          tex(`-${over(hyp('tanh', a), a)} + C`),
          tex(`${over(hyp('tanh', a), a)} + C`),
          tex(`-${over(`\\operatorname{csch}${arg}`, a)} + C`),
        ],
        `Since $\\tfrac{d}{dx}${hyp('coth', a)} = -${a}\\operatorname{csch}^{2}${arg}$, the integral is $-${over(hyp('coth', a), a)} + C$.`,
        2,
      ),
    );
  }

  // int sech(ax) tanh(ax) dx = -sech(ax)/a + C.
  for (let a = 1; a <= 4; a += 1) {
    out.push(
      T(
        `Evaluate $\\int ${hyp('sech', a)}${hyp('tanh', a)}\\,dx$.`,
        tex(`-${over(hyp('sech', a), a)} + C`),
        [
          tex(`${over(hyp('sech', a), a)} + C`),
          tex(`-${over(hyp('cosh', a), a)} + C`),
          tex(`${over(hyp('tanh', a), a)} + C`),
          tex(`-${over(hyp('sech', a), a + 1)} + C`),
        ],
        `Since $\\tfrac{d}{dx}${hyp('sech', a)} = -${a}${hyp('sech', a)}${hyp('tanh', a)}$, the integral is $-${over(hyp('sech', a), a)} + C$.`,
        2,
      ),
    );
  }

  // int csch(ax) coth(ax) dx = -csch(ax)/a + C.
  for (let a = 1; a <= 4; a += 1) {
    out.push(
      T(
        `Evaluate $\\int ${hyp('csch', a)}${hyp('coth', a)}\\,dx$.`,
        tex(`-${over(hyp('csch', a), a)} + C`),
        [
          tex(`${over(hyp('csch', a), a)} + C`),
          tex(`-${over(hyp('sinh', a), a)} + C`),
          tex(`${over(hyp('coth', a), a)} + C`),
          tex(`-${over(hyp('csch', a), a + 1)} + C`),
        ],
        `Since $\\tfrac{d}{dx}${hyp('csch', a)} = -${a}${hyp('csch', a)}${hyp('coth', a)}$, the integral is $-${over(hyp('csch', a), a)} + C$.`,
        2,
      ),
    );
  }

  // Derivatives (vetted).
  out.push(
    T(
      'Find $\\dfrac{d}{dx}\\cosh x$.',
      tex('\\sinh x'),
      [tex('-\\sinh x'), tex('\\cosh x'), tex('\\operatorname{sech}^{2} x')],
      'By definition, $\\tfrac{d}{dx}\\cosh x = \\sinh x$ (no sign flip).',
      1,
    ),
    T(
      'Find $\\dfrac{d}{dx}\\sinh x$.',
      tex('\\cosh x'),
      [tex('-\\cosh x'), tex('\\sinh x'), tex('\\operatorname{sech}^{2} x')],
      'By definition, $\\tfrac{d}{dx}\\sinh x = \\cosh x$.',
      1,
    ),
    T(
      'Find $\\dfrac{d}{dx}\\tanh x$.',
      tex('\\operatorname{sech}^{2} x'),
      [tex('\\sec^{2} x'), tex('-\\operatorname{sech}^{2} x'), tex('\\operatorname{sech} x \\tanh x')],
      'The hyperbolic analogue of $\\tfrac{d}{dx}\\tan x = \\sec^{2}x$ is $\\tfrac{d}{dx}\\tanh x = \\operatorname{sech}^{2}x$.',
      1,
    ),
    T(
      'Find $\\dfrac{d}{dx}\\operatorname{sech} x$.',
      tex('-\\operatorname{sech} x \\tanh x'),
      [tex('\\operatorname{sech} x \\tanh x'), tex('-\\operatorname{sech}^{2} x'), tex('\\operatorname{sech} x \\coth x')],
      'A direct computation gives $\\tfrac{d}{dx}\\operatorname{sech} x = -\\operatorname{sech} x \\tanh x$.',
      2,
    ),
    T(
      'Find $\\dfrac{d}{dx}\\coth x$.',
      tex('-\\operatorname{csch}^{2} x'),
      [tex('\\operatorname{csch}^{2} x'), tex('\\operatorname{sech}^{2} x'), tex('-\\operatorname{csch} x \\coth x')],
      'A direct computation gives $\\tfrac{d}{dx}\\coth x = -\\operatorname{csch}^{2} x$.',
      2,
    ),
  );

  // Inverse hyperbolic integrals (vetted).
  for (let a = 1; a <= 3; a += 1) {
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{\\sqrt{x^{2} + ${a * a}}}$.`,
        tex(`\\sinh^{-1}${divx(a)} + C`),
        [
          tex(`\\cosh^{-1}${divx(a)} + C`),
          tex(`\\arctan ${divx(a)} + C`),
          tex(`\\arcsin ${divx(a)} + C`),
          tex(`\\tanh^{-1}${divx(a)} + C`),
        ],
        `A $\\sqrt{x^{2} + a^{2}}$ in the denominator gives $\\int \\dfrac{dx}{\\sqrt{x^{2} + ${a * a}}} = \\sinh^{-1}\\dfrac{x}{${a}} + C = \\ln\\big(x + \\sqrt{x^{2} + ${a * a}}\\big) + C$.`,
        3,
      ),
    );
    out.push(
      T(
        `Evaluate $\\int \\dfrac{dx}{\\sqrt{x^{2} - ${a * a}}}$ (for $x > ${a}$).`,
        tex(`\\cosh^{-1}${divx(a)} + C`),
        [
          tex(`\\sinh^{-1}${divx(a)} + C`),
          tex(`\\arcsin ${divx(a)} + C`),
          tex(`\\arctan ${divx(a)} + C`),
          tex(`\\operatorname{sech}^{-1}${divx(a)} + C`),
        ],
        `A $\\sqrt{x^{2} - a^{2}}$ in the denominator gives $\\int \\dfrac{dx}{\\sqrt{x^{2} - ${a * a}}} = \\cosh^{-1}\\dfrac{x}{${a}} + C = \\ln\\big|x + \\sqrt{x^{2} - ${a * a}}\\big| + C$.`,
        3,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'The definition of $\\cosh x$ is:',
      tex('\\dfrac{e^{x} + e^{-x}}{2}'),
      [tex('\\dfrac{e^{x} - e^{-x}}{2}'), tex('\\dfrac{e^{x} + e^{-x}}{e^{x} - e^{-x}}'), tex('e^{x} + e^{-x}')],
      'Hyperbolic cosine: $\\cosh x = \\dfrac{e^{x} + e^{-x}}{2}$.',
      1,
    ),
    T(
      'The definition of $\\sinh x$ is:',
      tex('\\dfrac{e^{x} - e^{-x}}{2}'),
      [tex('\\dfrac{e^{x} + e^{-x}}{2}'), tex('\\dfrac{e^{x} - e^{-x}}{e^{x} + e^{-x}}'), tex('e^{x} - e^{-x}')],
      'Hyperbolic sine: $\\sinh x = \\dfrac{e^{x} - e^{-x}}{2}$.',
      1,
    ),
    T(
      'The fundamental hyperbolic identity is:',
      tex('\\cosh^{2} x - \\sinh^{2} x = 1'),
      [tex('\\cosh^{2} x + \\sinh^{2} x = 1'), tex('\\sinh^{2} x - \\cosh^{2} x = 1'), tex('\\cosh^{2} x - \\sinh^{2} x = 0')],
      'The hyperbolic analogue of $\\sin^{2}+\\cos^{2}=1$ carries a minus sign: $\\cosh^{2} x - \\sinh^{2} x = 1$.',
      1,
    ),
    T(
      'Evaluate $\\int \\cosh x\\,dx$.',
      tex('\\sinh x + C'),
      [tex('-\\sinh x + C'), tex('\\cosh x + C'), tex('\\operatorname{sech}^{2} x + C')],
      'Since $\\tfrac{d}{dx}\\sinh x = \\cosh x$, $\\int \\cosh x\\,dx = \\sinh x + C$.',
      1,
    ),
    T(
      'Evaluate $\\int \\sinh x\\,dx$.',
      tex('\\cosh x + C'),
      [tex('-\\cosh x + C'), tex('\\sinh x + C'), tex('\\tanh x + C')],
      'Since $\\tfrac{d}{dx}\\cosh x = \\sinh x$, $\\int \\sinh x\\,dx = \\cosh x + C$.',
      1,
    ),
    T(
      'Evaluate $\\int \\tanh x\\,dx$.',
      tex('\\ln(\\cosh x) + C'),
      [tex('\\ln|\\sinh x| + C'), tex('\\operatorname{sech}^{2} x + C'), tex('-\\ln(\\cosh x) + C')],
      'Let $u = \\cosh x$; since $\\cosh x > 0$, $\\int \\tanh x\\,dx = \\ln(\\cosh x) + C$.',
      2,
    ),
    T(
      'Evaluate $\\int \\coth x\\,dx$.',
      tex('\\ln|\\sinh x| + C'),
      [tex('\\ln(\\cosh x) + C'), tex('-\\operatorname{csch}^{2} x + C'), tex('-\\ln|\\sinh x| + C')],
      'Let $u = \\sinh x$: $\\int \\coth x\\,dx = \\ln|\\sinh x| + C$.',
      2,
    ),
    T(
      'The value of $\\cosh 0$ is:',
      tex('1'),
      [tex('0'), tex('2'), tex('e')],
      '$\\cosh 0 = \\dfrac{e^{0} + e^{0}}{2} = 1$.',
      1,
    ),
    T(
      'The value of $\\sinh 0$ is:',
      tex('0'),
      [tex('1'), tex('-1'), tex('e')],
      '$\\sinh 0 = \\dfrac{e^{0} - e^{0}}{2} = 0$.',
      1,
    ),
    T(
      'The hyperbolic functions parametrize points on the curve:',
      tex('x^{2} - y^{2} = 1'),
      [tex('x^{2} + y^{2} = 1'), tex('y = x^{2}'), tex('xy = 1')],
      'Just as $(\\cos t, \\sin t)$ traces the unit circle, $(\\cosh t, \\sinh t)$ traces the hyperbola $x^{2} - y^{2} = 1$.',
      2,
    ),
    T(
      'As $x \\to \\infty$, $\\tanh x$ approaches:',
      tex('1'),
      [tex('0'), tex('\\infty'), tex('-1')],
      'Both $\\sinh x$ and $\\cosh x$ grow like $\\tfrac{1}{2}e^{x}$, so their ratio $\\tanh x \\to 1$.',
      2,
    ),
    T(
      'The logarithmic form of $\\sinh^{-1} x$ is:',
      tex('\\ln\\big(x + \\sqrt{x^{2} + 1}\\big)'),
      [
        tex('\\ln\\big(x + \\sqrt{x^{2} - 1}\\big)'),
        tex('\\dfrac{1}{2}\\ln\\dfrac{1 + x}{1 - x}'),
        tex('\\ln\\big(x - \\sqrt{x^{2} + 1}\\big)'),
      ],
      'Inverting $y = \\sinh x$ gives $\\sinh^{-1} x = \\ln\\big(x + \\sqrt{x^{2} + 1}\\big)$.',
      2,
    ),
  );

  return out;
}

// Topic 7: L'Hopital's Rule
function lhopitalsRule(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic("L'Hopital's Rule", 'lhopital');

  // lim_{x->0} sin(ax)/x = a.
  for (let a = 1; a <= 8; a += 1) {
    const num = a === 1 ? '\\sin x' : `\\sin(${a}x)`;
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{${num}}{x}$.`,
        tex(`${a}`),
        [tex(`${a + 1}`), tex('0'), tex(ratTex(rat(1, a))), tex('\\infty')],
        `Form $\\tfrac{0}{0}$; differentiate: $\\dfrac{${a}\\cos(${a}x)}{1} \\to ${a}$.`,
        2,
      ),
    );
  }

  // lim_{x->0} sin(ax)/(bx) = a/b.
  const ratios: Array<[number, number]> = [
    [1, 2],
    [3, 2],
    [2, 3],
    [1, 3],
    [5, 2],
    [4, 3],
  ];
  for (const [a, b] of ratios) {
    const num = a === 1 ? '\\sin x' : `\\sin(${a}x)`;
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{${num}}{${b}x}$.`,
        tex(ratTex(rat(a, b))),
        [
          tex(ratTex(rat(b, a))),
          tex(ratTex(rat(a * b, 1))),
          tex('0'),
          tex(ratTex(rat(a, b + 1))),
        ],
        `Form $\\tfrac{0}{0}$; differentiate: $\\dfrac{${a}\\cos(${a}x)}{${b}} \\to \\dfrac{${a}}{${b}} = ${ratTex(rat(a, b))}$.`,
        2,
      ),
    );
  }

  // lim_{x->0} (e^{ax} - 1)/x = a.
  for (let a = 1; a <= 8; a += 1) {
    const exp = a === 1 ? 'e^{x}' : `e^{${a}x}`;
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{${exp} - 1}{x}$.`,
        tex(`${a}`),
        [tex(`${a + 1}`), tex('0'), tex('1'), tex('\\infty')],
        `Form $\\tfrac{0}{0}$; differentiate: $\\dfrac{${a}${exp}}{1} \\to ${a}$.`,
        2,
      ),
    );
  }

  // lim_{x->0} (1 - cos(ax))/x^2 = a^2/2.
  for (const a of [1, 2, 3]) {
    const num = a === 1 ? '1 - \\cos x' : `1 - \\cos(${a}x)`;
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{${num}}{x^{2}}$.`,
        tex(ratTex(rat(a * a, 2))),
        [
          tex(ratTex(rat(a * a, 1))),
          tex(ratTex(rat(a * a, 4))),
          tex(ratTex(rat(a, 2))),
          tex('0'),
        ],
        `Two applications give $\\dfrac{${a * a}\\cos(${a}x)}{2} \\to \\dfrac{${a * a}}{2} = ${ratTex(rat(a * a, 2))}$.`,
        3,
      ),
    );
  }

  // lim_{x->0} tan(ax)/x = a.
  for (let a = 1; a <= 5; a += 1) {
    const num = a === 1 ? '\\tan x' : `\\tan(${a}x)`;
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{${num}}{x}$.`,
        tex(`${a}`),
        [tex(`${a + 1}`), tex('0'), tex(ratTex(rat(1, a))), tex('\\infty')],
        `Form $\\tfrac{0}{0}$; differentiate: $\\dfrac{${a}\\sec^{2}(${a}x)}{1} \\to ${a}$.`,
        2,
      ),
    );
  }

  // lim_{x->inf} x^n/e^x = 0.
  for (let n = 1; n <= 5; n += 1) {
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to \\infty} \\dfrac{${pw(n)}}{e^{x}}$.`,
        tex('0'),
        [tex('1'), tex('\\infty'), tex(`${n}`), 'It does not exist'],
        `Form $\\tfrac{\\infty}{\\infty}$; after ${n} application${n === 1 ? '' : 's'} the numerator becomes constant while $e^{x} \\to \\infty$, so the limit is $0$.`,
        3,
      ),
    );
  }

  // lim_{x->inf} (ln x)/x^p = 0.
  for (const p of [1, 2, 3]) {
    const den = p === 1 ? 'x' : `x^{${p}}`;
    out.push(
      T(
        `Evaluate $\\lim\\limits_{x\\to \\infty} \\dfrac{\\ln x}{${den}}$.`,
        tex('0'),
        [tex('1'), tex('\\infty'), tex(ratTex(rat(1, p))), 'It does not exist'],
        `Form $\\tfrac{\\infty}{\\infty}$; differentiate: $\\dfrac{1/x}{${p === 1 ? '1' : `${p}x^{${p - 1}}`}} = \\dfrac{1}{${p === 1 ? 'x' : `${p}x^{${p}}`}} \\to 0$.`,
        3,
      ),
    );
  }

  // Fixed limits (vetted).
  out.push(
    T(
      'Evaluate $\\lim\\limits_{x\\to 0^{+}} x\\ln x$.',
      tex('0'),
      [tex('1'), tex('-\\infty'), tex('-1'), 'It does not exist'],
      'Rewrite as $\\dfrac{\\ln x}{1/x}$ (form $\\tfrac{-\\infty}{\\infty}$); differentiating gives $-x \\to 0$.',
      3,
    ),
    T(
      'Evaluate $\\lim\\limits_{x\\to \\infty} \\dfrac{e^{x}}{x}$.',
      tex('\\infty'),
      [tex('0'), tex('1'), tex('e'), tex('-\\infty')],
      'Form $\\tfrac{\\infty}{\\infty}$; differentiate to $\\dfrac{e^{x}}{1} \\to \\infty$: the exponential dominates.',
      2,
    ),
    T(
      'Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{e^{x} - 1 - x}{x^{2}}$.',
      tex('\\dfrac{1}{2}'),
      [tex('1'), tex('0'), tex('2'), 'It does not exist'],
      'Two applications: $\\dfrac{e^{x} - 1}{2x} \\to \\dfrac{e^{x}}{2} \\to \\dfrac{1}{2}$.',
      3,
    ),
    T(
      'Evaluate $\\lim\\limits_{x\\to 1} \\dfrac{\\ln x}{x - 1}$.',
      tex('1'),
      [tex('0'), tex('\\infty'), tex('-1'), 'It does not exist'],
      'Form $\\tfrac{0}{0}$; differentiate: $\\dfrac{1/x}{1} \\to 1$.',
      2,
    ),
    T(
      'Evaluate $\\lim\\limits_{x\\to \\infty} \\dfrac{3x^{2} + 1}{x^{2} + x}$.',
      tex('3'),
      [tex('1'), tex('0'), tex('\\infty'), tex('\\dfrac{1}{3}')],
      'Form $\\tfrac{\\infty}{\\infty}$; two applications give $\\dfrac{6}{2} = 3$ (the ratio of leading coefficients).',
      3,
    ),
    T(
      'Evaluate $\\lim\\limits_{x\\to 0} \\dfrac{\\tan x - x}{x^{3}}$.',
      tex('\\dfrac{1}{3}'),
      [tex('0'), tex('1'), tex('\\dfrac{1}{6}'), 'It does not exist'],
      'Repeated applications (or the series $\\tan x = x + \\tfrac{x^{3}}{3} + \\cdots$) give $\\tfrac{1}{3}$.',
      5,
    ),
  );

  // Conceptual.
  out.push(
    T(
      "L'Hopital's Rule applies directly to limits of the form:",
      tex('\\dfrac{0}{0} \\text{ or } \\dfrac{\\infty}{\\infty}'),
      [
        tex('\\dfrac{1}{0}'),
        tex('\\dfrac{2}{0}'),
        tex('0 \\cdot 1'),
      ],
      'Only the indeterminate quotients $\\tfrac{0}{0}$ and $\\tfrac{\\infty}{\\infty}$ qualify directly.',
      1,
    ),
    T(
      "L'Hopital's Rule replaces $\\lim \\dfrac{f(x)}{g(x)}$ with:",
      tex('\\lim \\dfrac{f\'(x)}{g\'(x)}'),
      [
        tex('\\lim \\dfrac{f\'(x)\\,g(x) - f(x)\\,g\'(x)}{g(x)^{2}}'),
        tex('\\lim f\'(x)\\,g\'(x)'),
        tex('\\lim \\dfrac{f(x)}{g\'(x)}'),
      ],
      'You differentiate the numerator and denominator separately, not via the quotient rule.',
      1,
    ),
    T(
      'Is $\\tfrac{1}{0}$ an indeterminate form?',
      'No; it points to $\\pm\\infty$, not an undetermined value',
      [
        'Yes, it is indeterminate',
        'Yes, it always equals $1$',
        'Yes, it always equals $0$',
      ],
      'Only forms like $\\tfrac{0}{0}$ and $\\tfrac{\\infty}{\\infty}$ are indeterminate; $\\tfrac{1}{0}$ is not.',
      2,
    ),
    T(
      'To apply the rule to a product giving $0 \\cdot \\infty$, you first:',
      'rewrite it as a quotient',
      [
        'differentiate the product directly',
        'take the limit of each factor and multiply',
        'add a constant',
      ],
      'Turn $f\\cdot g$ into $\\dfrac{f}{1/g}$ to reach a $\\tfrac{0}{0}$ or $\\tfrac{\\infty}{\\infty}$ form.',
      2,
    ),
    T(
      'To resolve a limit of the form $1^{\\infty}$, a good first step is to:',
      'take the natural logarithm and analyze the resulting limit',
      [
        'apply the rule to the base alone',
        'conclude the limit is $1$',
        'conclude the limit is $\\infty$',
      ],
      'Taking $\\ln$ converts $1^{\\infty}$ into a $0 \\cdot \\infty$ form you can rewrite as a quotient.',
      3,
    ),
    T(
      'A requirement for using the rule is that:',
      'the new limit $\\lim \\dfrac{f\'}{g\'}$ exists (or is $\\pm\\infty$)',
      [
        'the original limit equals $1$',
        '$f$ and $g$ are polynomials',
        'the interval is infinite',
      ],
      'If the differentiated ratio has no limit, the rule is inconclusive.',
      2,
    ),
    T(
      'Which indeterminate form is $\\lim\\limits_{x\\to\\infty}(\\sqrt{x^{2}+x} - x)$?',
      tex('\\infty - \\infty'),
      [tex('\\dfrac{0}{0}'), tex('0 \\cdot \\infty'), tex('1^{\\infty}')],
      'Both terms grow without bound, giving $\\infty - \\infty$; combine into one fraction before differentiating.',
      2,
    ),
  );

  return out;
}

// Topic 8: Improper Integration
function improperIntegration(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Improper Integration', 'improper');

  // int_1^inf x^{-p} dx = 1/(p-1) for p > 1.
  for (let p = 2; p <= 7; p += 1) {
    out.push(
      T(
        `Evaluate $\\int_1^{\\infty} \\dfrac{1}{x^{${p}}}\\,dx$.`,
        tex(ratTex(rat(1, p - 1))),
        [
          tex(ratTex(rat(1, p))),
          tex(ratTex(rat(1, p + 1))),
          tex(ratTex(rat(p - 1, 1))),
          'It diverges',
        ],
        `$\\int_1^{b} x^{-${p}}\\,dx = \\dfrac{1}{${p - 1}}\\big(1 - b^{-${p - 1}}\\big) \\to \\dfrac{1}{${p - 1}}$ as $b \\to \\infty$.`,
        3,
      ),
    );
  }

  // p-test divergence for p <= 1 on [1, inf).
  const divP: Array<[string, string]> = [
    ['1', '\\dfrac{1}{x}'],
    ['1/2', '\\dfrac{1}{\\sqrt{x}}'],
    ['2/3', '\\dfrac{1}{x^{2/3}}'],
    ['3/4', '\\dfrac{1}{x^{3/4}}'],
    ['0', '1'],
  ];
  for (const [p, integrand] of divP) {
    out.push(
      T(
        `Does $\\int_1^{\\infty} ${integrand}\\,dx$ converge or diverge?`,
        'It diverges',
        ['It converges to $1$', 'It converges to $2$', 'It converges to $0$'],
        `On $[1, \\infty)$ the power integral converges only for $p > 1$; here $p = ${p} \\le 1$, so it diverges.`,
        4,
      ),
    );
  }

  // int_0^1 x^{-p} dx = 1/(1-p) for p < 1.
  const zeroP: Array<[string, number, number]> = [
    ['1/2', 1, 2],
    ['1/3', 1, 3],
    ['1/4', 1, 4],
    ['3/4', 3, 4],
    ['2/3', 2, 3],
  ];
  for (const [p, num, den] of zeroP) {
    out.push(
      T(
        `Evaluate $\\int_0^{1} \\dfrac{1}{x^{${p}}}\\,dx$.`,
        tex(ratTex(rat(den, den - num))),
        [
          'It diverges',
          tex(ratTex(rat(num, den))),
          tex(ratTex(rat(den, den + num))),
          tex(ratTex(rat(2 * den, den - num))),
        ],
        `On $[0, 1]$ the integral converges for $p < 1$ to $\\dfrac{1}{1 - p} = ${ratTex(rat(den, den - num))}$.`,
        3,
      ),
    );
  }

  // int_0^inf e^{-a x} dx = 1/a.
  for (let a = 1; a <= 10; a += 1) {
    out.push(
      T(
        `Evaluate $\\int_0^{\\infty} e^{-${a}x}\\,dx$.`,
        tex(ratTex(rat(1, a))),
        [
          tex(ratTex(rat(1, a + 1))),
          tex(ratTex(rat(a, 1))),
          tex(ratTex(rat(2, a))),
          'It diverges',
        ],
        `$\\int_0^{b} e^{-${a}x}\\,dx = \\dfrac{1}{${a}}\\big(1 - e^{-${a}b}\\big) \\to \\dfrac{1}{${a}}$ as $b \\to \\infty$.`,
        3,
      ),
    );
  }

  // int_0^inf x^n e^{-x} dx = n!.
  const facts = [1, 1, 2, 6, 24, 120];
  for (let n = 0; n <= 5; n += 1) {
    const power = n === 0 ? '' : n === 1 ? 'x' : `x^{${n}}`;
    const integrand = n === 0 ? 'e^{-x}' : `${power} e^{-x}`;
    out.push(
      T(
        `Evaluate $\\int_0^{\\infty} ${integrand}\\,dx$.`,
        `$${facts[n]}$`,
        [`$${facts[n] + 1}$`, `$${facts[n] + 2}$`, `$${facts[n] * 2 + 1}$`, 'It diverges'],
        `$\\int_0^{\\infty} x^{${n}} e^{-x}\\,dx = ${n}! = ${facts[n]}$.`,
        4,
      ),
    );
  }

  // int_1^inf e^{-a x} dx = e^{-a}/a.
  for (let a = 2; a <= 6; a += 1) {
    out.push(
      T(
        `Evaluate $\\int_1^{\\infty} e^{-${a}x}\\,dx$.`,
        tex(`\\dfrac{e^{-${a}}}{${a}}`),
        [
          tex(`\\dfrac{e^{-${a}}}{${a + 1}}`),
          tex(`${a}e^{-${a}}`),
          tex(`e^{-${a}}`),
          'It diverges',
        ],
        `$\\int_1^{b} e^{-${a}x}\\,dx = \\dfrac{1}{${a}}\\big(e^{-${a}} - e^{-${a}b}\\big) \\to \\dfrac{e^{-${a}}}{${a}}$.`,
        3,
      ),
    );
  }

  // Fixed convergent values (vetted).
  out.push(
    T(
      'Evaluate $\\int_0^{1} \\dfrac{1}{\\sqrt{x}}\\,dx$.',
      tex('2'),
      [tex('1'), tex('\\dfrac{1}{2}'), 'It diverges', tex('\\infty')],
      '$\\int_0^1 x^{-1/2}\\,dx = [2\\sqrt{x}]_0^1 = 2$ (here $p = \\tfrac{1}{2} < 1$).',
      3,
    ),
    T(
      'Evaluate $\\int_0^{\\infty} \\dfrac{1}{1 + x^{2}}\\,dx$.',
      tex('\\dfrac{\\pi}{2}'),
      [tex('\\pi'), tex('\\dfrac{\\pi}{4}'), tex('1'), 'It diverges'],
      '$\\int_0^{b}\\tfrac{1}{1 + x^{2}}\\,dx = \\arctan b \\to \\dfrac{\\pi}{2}$.',
      3,
    ),
    T(
      'Evaluate $\\int_1^{\\infty} \\dfrac{1}{x^{3/2}}\\,dx$.',
      tex('2'),
      [tex('1'), tex('\\dfrac{2}{3}'), tex('\\dfrac{3}{2}'), 'It diverges'],
      '$\\int_1^{b} x^{-3/2}\\,dx = \\big[-2x^{-1/2}\\big]_1^{b} \\to 2$ (here $p = \\tfrac{3}{2} > 1$).',
      3,
    ),
  );

  // Conceptual.
  out.push(
    T(
      'An improper integral $\\int_a^{\\infty} f(x)\\,dx$ is defined as:',
      tex('\\lim_{b \\to \\infty} \\int_a^{b} f(x)\\,dx'),
      [
        tex('\\int_a^{b} f(x)\\,dx \\text{ for the largest } b'),
        tex('f(\\infty) - f(a)'),
        tex('\\lim_{a \\to \\infty} \\int_a^{b} f(x)\\,dx'),
      ],
      'It is the limit of proper integrals as the bound grows without bound.',
      2,
    ),
    T(
      'An integral is improper with an infinite interval when:',
      'a limit of integration is $\\infty$ or $-\\infty$',
      [
        'the integrand has a vertical asymptote inside the interval',
        'the integrand is negative',
        'the limits are equal',
      ],
      'An infinite limit of integration is one of the two ways an integral becomes improper.',
      1,
    ),
    T(
      'An integral is improper with an unbounded integrand when:',
      'the integrand becomes infinite somewhere on the interval',
      [
        'the interval is infinite',
        'the integrand is a polynomial',
        'the function is continuous everywhere',
      ],
      'A vertical asymptote of the integrand on the interval also makes the integral improper.',
      1,
    ),
    T(
      'For which $p$ does $\\int_1^{\\infty} \\dfrac{1}{x^{p}}\\,dx$ converge?',
      tex('p > 1'),
      [tex('p < 1'), tex('p = 1'), tex('\\text{all } p')],
      'The power integral on $[1, \\infty)$ converges exactly when $p > 1$.',
      3,
    ),
    T(
      'For which $p$ does $\\int_0^{1} \\dfrac{1}{x^{p}}\\,dx$ converge?',
      tex('p < 1'),
      [tex('p > 1'), tex('p = 1'), tex('\\text{all } p')],
      'Near $0$, the integral converges exactly when $p < 1$.',
      3,
    ),
    T(
      'The Comparison Test concludes $\\int f$ converges when:',
      '$0 \\le f \\le g$ and $\\int g$ converges',
      [
        '$f \\ge g \\ge 0$ and $\\int g$ converges',
        '$f \\le 0$ and $\\int g$ diverges',
        '$f$ and $g$ are equal at one point',
      ],
      'If a larger nonnegative function has a convergent integral, so does the smaller one.',
      3,
    ),
    T(
      'The integral $\\int_1^{\\infty} \\dfrac{1}{x}\\,dx$:',
      'diverges',
      ['converges to $1$', 'converges to $\\ln 2$', 'converges to $0$'],
      '$\\int_1^{b}\\tfrac{1}{x}\\,dx = \\ln b \\to \\infty$.',
      5,
    ),
    T(
      'A convergent improper integral has a value that is:',
      'a finite number',
      ['always infinite', 'always zero', 'undefined'],
      'Convergence means the defining limit exists and is finite.',
      1,
    ),
    T(
      'To handle $\\int_{-\\infty}^{\\infty} f(x)\\,dx$, you split it as:',
      tex('\\int_{-\\infty}^{c} f\\,dx + \\int_{c}^{\\infty} f\\,dx'),
      [
        tex('\\lim_{b \\to \\infty} \\int_{-b}^{b} f\\,dx \\text{ only}'),
        tex('\\int_{0}^{\\infty} f\\,dx'),
        tex('f(\\infty) - f(-\\infty)'),
      ],
      'Both halves must converge separately for the whole integral to converge.',
      2,
    ),
    T(
      'The integral $\\int_0^{\\infty} e^{-x}\\,dx$ equals:',
      tex('1'),
      [tex('0'), tex('e'), 'It diverges'],
      '$\\int_0^{b} e^{-x}\\,dx = 1 - e^{-b} \\to 1$.',
      3,
    ),
  );

  return out;
}

export const techniquesOfIntegrationQuestions: PracticeQuestion[] = [
  ...substitution(),
  ...integrationByParts(),
  ...trigonometricIntegrals(),
  ...trigonometricSubstitution(),
  ...partialFractions(),
  ...hyperbolicFunctions(),
  ...lhopitalsRule(),
  ...improperIntegration(),
];
