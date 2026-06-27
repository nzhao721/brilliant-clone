import type { PracticeQuestion } from '../questionBank';

// Practice questions for the "Applications of Integration" chapter (SlopeWise Ch. 7).
//
// Content adapted from APEX Calculus by Gregory Hartman et al.
// (apexcalculus.com), used under CC BY-NC 4.0
// (https://creativecommons.org/licenses/by-nc/4.0/). Prompts are written for
// SlopeWise; the underlying formulas are standard results. Sourced sections
// (Chapter 7): Area Between Curves; Volume by Cross-Sectional Area (Disk and
// Washer Methods); The Shell Method; Arc Length and Surface Area; Work; Fluid
// Forces.
//
// Questions are produced by small parameterized generators that compute the
// correct answer alongside plausible distractors, reaching roughly fifty
// questions per section. Every question sets
// chapterId: 'applications-of-integration'.

const CHAPTER_ID = 'applications-of-integration';
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

// ---------------------------------------------------------------------------
// Small math + formatting helpers (KaTeX strings, no surrounding $).
// ---------------------------------------------------------------------------
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

// Rational coefficient times pi, e.g. [2,15] -> \dfrac{2\pi}{15}, [8,1] -> 8\pi.
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

// Coefficient in front of a variable: coef(1,'x') -> 'x', coef(-1,'x') -> '-x'.
function coef(c: number, v: string): string {
  if (c === 1) return v;
  if (c === -1) return `-${v}`;
  return `${c}${v}`;
}

// n*sqrt(k): sqrtCoef(2,3) -> '2\\sqrt{3}', sqrtCoef(1,2) -> '\\sqrt{2}', sqrtCoef(3,1) -> '3'.
function sqrtCoef(n: number, k: number): string {
  if (k === 1) return `${n}`;
  if (n === 1) return `\\sqrt{${k}}`;
  return `${n}\\sqrt{${k}}`;
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
  // Safety net: never emit fewer than three distractors.
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
    id: `appsint-${slug}`,
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

// ---------------------------------------------------------------------------
// Section 1: Area Between Curves
// ---------------------------------------------------------------------------
function areaBetweenCurves(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Area Between Curves', 'area');

  // Line y = m x (top) vs parabola y = x^2; intersections 0 and m; area = m^3/6.
  for (let m = 1; m <= 10; m += 1) {
    const cube = m * m * m;
    out.push(
      T(
        `Find the area of the region enclosed by $y = ${coef(m, 'x')}$ and $y = x^2$.`,
        tex(ratTex(rat(cube, 6))),
        [
          tex(ratTex(rat(cube, 3))),
          tex(ratTex(rat(cube, 2))),
          tex(ratTex(rat(cube, 12))),
          tex(ratTex(rat(cube, 4))),
        ],
        `Setting $${coef(m, 'x')} = x^2$ gives $x = 0$ and $x = ${m}$, with the line on top. The area is $\\int_0^{${m}} (${coef(m, 'x')} - x^2)\\,dx = ${ratTex(rat(cube, 6))}$.`,
        3,
      ),
    );
  }

  // Downward parabola y = a - x^2 above the x-axis, a = k^2; area = (4/3)k^3.
  for (let k = 1; k <= 8; k += 1) {
    const a = k * k;
    const cube = k * k * k;
    out.push(
      T(
        `Find the total area of the region bounded by $y = ${a} - x^2$ and the $x$-axis.`,
        tex(ratTex(rat(4 * cube, 3))),
        [
          tex(ratTex(rat(2 * cube, 3))),
          tex(ratTex(rat(8 * cube, 3))),
          tex(ratTex(rat(16 * cube, 3))),
          tex(ratTex(rat(4 * cube, 1))),
        ],
        `The parabola meets the axis at $x = \\pm ${k}$, so the area is $\\int_{-${k}}^{${k}} (${a} - x^2)\\,dx = ${ratTex(rat(4 * cube, 3))}$.`,
        2,
      ),
    );
  }

  // Region under y = sqrt(x) on [0, b], b = k^2; area = (2/3)k^3.
  for (let k = 1; k <= 8; k += 1) {
    const b = k * k;
    const cube = k * k * k;
    out.push(
      T(
        `Find the area of the region bounded by $y = \\sqrt{x}$, the $x$-axis, and $x = ${b}$.`,
        tex(ratTex(rat(2 * cube, 3))),
        [
          tex(ratTex(rat(cube, 3))),
          tex(ratTex(rat(4 * cube, 3))),
          tex(ratTex(rat(cube, 1))),
          tex(ratTex(rat(8 * cube, 3))),
        ],
        `$\\int_0^{${b}} \\sqrt{x}\\,dx = \\dfrac{2}{3} x^{3/2}\\Big|_0^{${b}} = ${ratTex(rat(2 * cube, 3))}$.`,
        2,
      ),
    );
  }

  // Region under y = x^2 on [0, b]; area = b^3/3.
  for (let b = 1; b <= 8; b += 1) {
    const cube = b * b * b;
    out.push(
      T(
        `Find the area of the region bounded by $y = x^2$, the $x$-axis, and $x = ${b}$.`,
        tex(ratTex(rat(cube, 3))),
        [
          tex(ratTex(rat(cube, 2))),
          tex(ratTex(rat(cube, 1))),
          tex(ratTex(rat(cube, 6))),
          tex(ratTex(rat(2 * cube, 3))),
        ],
        `$\\int_0^{${b}} x^2\\,dx = \\dfrac{x^3}{3}\\Big|_0^{${b}} = ${ratTex(rat(cube, 3))}$.`,
        2,
      ),
    );
  }

  // Parabola y = x^2 and line y = x + c with integer roots p = 1-k, q = k; area = (2k-1)^3/6.
  for (let k = 2; k <= 7; k += 1) {
    const p = 1 - k;
    const q = k;
    const c = k * k - k;
    const span = 2 * k - 1;
    const cube = span * span * span;
    out.push(
      T(
        `Find the area of the region enclosed by $y = x^2$ and $y = x + ${c}$.`,
        tex(ratTex(rat(cube, 6))),
        [
          tex(ratTex(rat(cube, 3))),
          tex(ratTex(rat(cube, 2))),
          tex(ratTex(rat(cube, 12))),
          tex(ratTex(rat(span * span, 6))),
        ],
        `Solving $x^2 = x + ${c}$ gives $x = ${p}$ and $x = ${q}$. The area is $\\int_{${p}}^{${q}} (x + ${c} - x^2)\\,dx = ${ratTex(rat(cube, 6))}$.`,
        3,
      ),
    );
  }

  // Setup: which integral represents the area between y = m x and y = x^2.
  for (let m = 2; m <= 7; m += 1) {
    out.push(
      T(
        `Which integral gives the area of the region between $y = ${coef(m, 'x')}$ and $y = x^2$?`,
        tex(`\\int_0^{${m}} (${coef(m, 'x')} - x^2)\\,dx`),
        [
          tex(`\\int_0^{${m}} (x^2 - ${coef(m, 'x')})\\,dx`),
          tex(`\\int_0^{${m}} (${coef(m, 'x')} + x^2)\\,dx`),
          tex(`\\int_{-${m}}^{${m}} (${coef(m, 'x')} - x^2)\\,dx`),
          tex(`\\int_0^{${m}} (${coef(m, 'x')} - x^2)^2\\,dx`),
        ],
        `The curves meet at $x = 0$ and $x = ${m}$, with the line on top, so integrate top minus bottom: $\\int_0^{${m}} (${coef(m, 'x')} - x^2)\\,dx$.`,
        2,
      ),
    );
  }

  // Conceptual questions.
  out.push(
    T(
      'The area between an upper curve $f$ and a lower curve $g$ on $[a, b]$ is:',
      tex('\\int_a^b [f(x) - g(x)]\\,dx'),
      [
        tex('\\int_a^b [g(x) - f(x)]\\,dx'),
        tex('\\int_a^b f(x)g(x)\\,dx'),
        tex('\\int_a^b [f(x) + g(x)]\\,dx'),
      ],
      'Integrate top minus bottom so the integrand is the positive vertical gap.',
      1,
    ),
    T(
      'When two curves cross on $[a, b]$, the total area between them is found by:',
      'integrating $|f - g|$, splitting the interval at the intersection points',
      [
        'integrating $f - g$ over the whole interval without splitting',
        'subtracting the areas under each curve at the endpoints only',
        'multiplying the two enclosed areas together',
      ],
      'Where the curves swap order the top function changes, so split at intersections and integrate the absolute difference.',
      2,
    ),
    T(
      'To integrate with respect to $y$, the area between a right curve $x = p(y)$ and a left curve $x = q(y)$ on $[c, d]$ is:',
      tex('\\int_c^d [p(y) - q(y)]\\,dy'),
      [
        tex('\\int_c^d [q(y) - p(y)]\\,dy'),
        tex('\\int_c^d p(y)q(y)\\,dy'),
        tex('\\int_c^d [p(y) + q(y)]\\,dy'),
      ],
      'Slicing horizontally, each strip has width right minus left, giving $\\int_c^d [p(y) - q(y)]\\,dy$.',
      2,
    ),
    T(
      'The first step in finding the area enclosed by $y = f(x)$ and $y = g(x)$ is usually to:',
      'find the intersection points by setting $f(x) = g(x)$',
      [
        'differentiate both functions',
        'evaluate both functions at $x = 0$',
        'integrate each function separately and add',
      ],
      'The intersections become the limits of integration that bound the enclosed region.',
      1,
    ),
    T(
      'If $g(x) \\le 0 \\le f(x)$ on $[a, b]$, the area between the curves equals:',
      tex('\\int_a^b [f(x) - g(x)]\\,dx'),
      [
        tex('\\int_a^b f(x)\\,dx'),
        tex('\\int_a^b [g(x) - f(x)]\\,dx'),
        tex('\\int_a^b |f(x)g(x)|\\,dx'),
      ],
      'Top minus bottom still applies; subtracting a negative bottom curve correctly adds the area below the axis.',
      2,
    ),
    T(
      'A region symmetric about the $y$-axis has area equal to:',
      'twice the area of its right half',
      [
        'the area of its right half',
        'half the area of its right half',
        'zero, by symmetry',
      ],
      'Symmetry lets you integrate over the right half and double the result.',
      1,
    ),
    T(
      'The integrand $f(x) - g(x)$ in an area-between-curves integral represents:',
      'the vertical distance between the curves at $x$',
      [
        'the slope between the curves at $x$',
        'the horizontal distance between the curves',
        'the average height of the two curves',
      ],
      'At each $x$ the strip height is the vertical gap $f(x) - g(x)$.',
      1,
    ),
    T(
      'Translating both curves $y = f(x)$ and $y = g(x)$ upward by the same constant changes the enclosed area by:',
      'nothing; the area is unchanged',
      [
        'adding the constant times the width',
        'doubling the area',
        'an amount equal to the constant',
      ],
      'The difference $f - g$ is unaffected by a shared vertical shift, so the area is invariant.',
      2,
    ),
    T(
      'Choosing to integrate in $y$ instead of $x$ is most helpful when:',
      'horizontal strips avoid splitting the region into multiple pieces',
      [
        'the region is a perfect rectangle',
        'the curves never intersect',
        'the integrand has no antiderivative',
      ],
      'Picking the orientation that matches the boundaries can replace several integrals with one.',
      2,
    ),
    T(
      'Even though a definite integral can be negative, the area between two curves is always:',
      'positive',
      ['negative', 'zero', 'undefined'],
      'Area is a positive quantity; that is why we integrate the larger minus the smaller function.',
      1,
    ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Section 2: Volume by Cross-Sectional Area (Disk and Washer Methods)
// ---------------------------------------------------------------------------
function volumeCrossSections(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Volume by Cross-Sectional Area', 'cross');

  // Disk: y = sqrt(x) about x-axis on [0, b]; V = pi b^2 / 2.
  for (let b = 1; b <= 10; b += 1) {
    const sq = b * b;
    out.push(
      T(
        `The region under $y = \\sqrt{x}$ on $[0, ${b}]$ is revolved about the $x$-axis. Find the volume.`,
        tex(ratPiTex(rat(sq, 2))),
        [
          tex(ratPiTex(rat(sq, 1))),
          tex(ratPiTex(rat(sq, 3))),
          tex(ratPiTex(rat(sq, 4))),
          tex(ratPiTex(rat(sq, 6))),
        ],
        `$V = \\pi\\int_0^{${b}} (\\sqrt{x})^2\\,dx = \\pi \\int_0^{${b}} x\\,dx = ${ratPiTex(rat(sq, 2))}$.`,
        2,
      ),
    );
  }

  // Disk: y = x about x-axis on [0, b]; V = pi b^3 / 3.
  for (let b = 1; b <= 10; b += 1) {
    const cube = b * b * b;
    out.push(
      T(
        `The region under $y = x$ on $[0, ${b}]$ is revolved about the $x$-axis. Find the volume.`,
        tex(ratPiTex(rat(cube, 3))),
        [
          tex(ratPiTex(rat(cube, 2))),
          tex(ratPiTex(rat(cube, 1))),
          tex(ratPiTex(rat(cube, 6))),
          tex(ratPiTex(rat(cube, 4))),
        ],
        `$V = \\pi\\int_0^{${b}} x^2\\,dx = \\pi\\cdot\\dfrac{${b}^3}{3} = ${ratPiTex(rat(cube, 3))}$.`,
        2,
      ),
    );
  }

  // Disk: y = x^2 about x-axis on [0, b]; V = pi b^5 / 5.
  for (let b = 1; b <= 6; b += 1) {
    const p5 = b ** 5;
    out.push(
      T(
        `The region under $y = x^2$ on $[0, ${b}]$ is revolved about the $x$-axis. Find the volume.`,
        tex(ratPiTex(rat(p5, 5))),
        [
          tex(ratPiTex(rat(p5, 4))),
          tex(ratPiTex(rat(p5, 3))),
          tex(ratPiTex(rat(p5, 10))),
          tex(ratPiTex(rat(p5, 1))),
        ],
        `$V = \\pi\\int_0^{${b}} (x^2)^2\\,dx = \\pi \\int_0^{${b}} x^4\\,dx = ${ratPiTex(rat(p5, 5))}$.`,
        2,
      ),
    );
  }

  // Disk: y = x^3 about x-axis on [0, b]; V = pi b^7 / 7.
  for (let b = 1; b <= 4; b += 1) {
    const p7 = b ** 7;
    out.push(
      T(
        `The region under $y = x^3$ on $[0, ${b}]$ is revolved about the $x$-axis. Find the volume.`,
        tex(ratPiTex(rat(p7, 7))),
        [
          tex(ratPiTex(rat(p7, 6))),
          tex(ratPiTex(rat(p7, 3))),
          tex(ratPiTex(rat(p7, 14))),
          tex(ratPiTex(rat(p7, 1))),
        ],
        `$V = \\pi\\int_0^{${b}} (x^3)^2\\,dx = \\pi \\int_0^{${b}} x^6\\,dx = ${ratPiTex(rat(p7, 7))}$.`,
        2,
      ),
    );
  }

  // Known cross-sections: squares of side s(x) = x on [0, b]; V = b^3/3 (no pi).
  for (let b = 1; b <= 8; b += 1) {
    const cube = b * b * b;
    out.push(
      T(
        `A solid has square cross-sections perpendicular to the $x$-axis with side length $s(x) = x$ for $0 \\le x \\le ${b}$. Find the volume.`,
        tex(ratTex(rat(cube, 3))),
        [
          tex(ratTex(rat(cube, 2))),
          tex(ratTex(rat(cube, 1))),
          tex(ratTex(rat(cube, 6))),
          tex(ratPiTex(rat(cube, 3))),
        ],
        `Each square slice has area $[s(x)]^2 = x^2$, so $V = \\int_0^{${b}} x^2\\,dx = ${ratTex(rat(cube, 3))}$ (no $\\pi$ since the slices are squares).`,
        3,
      ),
    );
  }

  // Washer between y = m x (outer) and y = x^2 (inner) about x-axis on [0, m]; V = 2 pi m^5/15.
  for (let m = 1; m <= 6; m += 1) {
    const p5 = m ** 5;
    out.push(
      T(
        `The region between $y = ${coef(m, 'x')}$ and $y = x^2$ is revolved about the $x$-axis. Find the volume.`,
        tex(ratPiTex(rat(2 * p5, 15))),
        [
          tex(ratPiTex(rat(p5, 15))),
          tex(ratPiTex(rat(2 * p5, 5))),
          tex(ratPiTex(rat(2 * p5, 3))),
          tex(ratPiTex(rat(p5, 5))),
        ],
        `Washers with outer radius $${coef(m, 'x')}$ and inner radius $x^2$ on $[0, ${m}]$: $V = \\pi\\int_0^{${m}} ((${coef(m, 'x')})^2 - (x^2)^2)\\,dx = ${ratPiTex(rat(2 * p5, 15))}$.`,
        4,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'For a solid with cross-sectional area $A(x)$ perpendicular to the $x$-axis on $[a, b]$, the volume is:',
      tex('\\int_a^b A(x)\\,dx'),
      [tex('\\int_a^b [A(x)]^2\\,dx'), tex('\\int_a^b \\pi A(x)\\,dx'), tex('\\int_a^b A\'(x)\\,dx')],
      'Stacking thin slabs of volume $A(x)\\,dx$ gives $V = \\int_a^b A(x)\\,dx$.',
      1,
    ),
    T(
      'The disk method computes a volume of revolution as:',
      tex('\\pi\\int_a^b [R(x)]^2\\,dx'),
      [tex('2\\pi\\int_a^b R(x)\\,dx'), tex('\\pi\\int_a^b R(x)\\,dx'), tex('\\int_a^b [R(x)]^2\\,dx')],
      'Each disk has area $\\pi R^2$, so the volume is $\\pi\\int_a^b [R(x)]^2\\,dx$.',
      1,
    ),
    T(
      'The washer method uses cross-sectional area:',
      tex('\\pi (R^2 - r^2)'),
      [tex('\\pi (R^2 + r^2)'), tex('\\pi (R - r)^2'), tex('\\pi R r')],
      'A washer is an annulus: outer disk area minus inner disk area, $\\pi R^2 - \\pi r^2$.',
      1,
    ),
    T(
      'The disk method is the special case of the washer method in which:',
      'the inner radius is $r(x) = 0$',
      [
        'the outer radius is zero',
        'the two radii are equal',
        'the axis is vertical',
      ],
      'With no hole, $r = 0$ and $\\pi(R^2 - r^2)$ reduces to $\\pi R^2$.',
      2,
    ),
    T(
      'A solid has equilateral-triangle cross-sections of side $s$. Each cross-section has area:',
      tex('\\dfrac{\\sqrt{3}}{4} s^2'),
      [tex('\\dfrac{1}{2} s^2'), tex('s^2'), tex('\\dfrac{\\sqrt{3}}{2} s^2')],
      'An equilateral triangle of side $s$ has area $\\dfrac{\\sqrt{3}}{4} s^2$.',
      2,
    ),
    T(
      'A solid has semicircular cross-sections of diameter $d$. Each cross-section has area:',
      tex('\\dfrac{\\pi d^2}{8}'),
      [tex('\\dfrac{\\pi d^2}{4}'), tex('\\dfrac{\\pi d^2}{2}'), tex('\\pi d^2')],
      'A semicircle of radius $d/2$ has area $\\tfrac{1}{2}\\pi (d/2)^2 = \\dfrac{\\pi d^2}{8}$.',
      2,
    ),
    T(
      'The washer method (rather than disks) is needed when the solid of revolution:',
      'has a gap between the region and the axis, leaving a hole',
      [
        'is always a sphere',
        'has no axis of revolution',
        'is bounded by a single point',
      ],
      'When the region does not touch the axis, each slice is a washer with an inner radius.',
      2,
    ),
    T(
      'Revolving the region under $y = f(x)$ on $[a, b]$ about the $x$-axis gives volume:',
      tex('\\pi\\int_a^b [f(x)]^2\\,dx'),
      [tex('\\pi\\int_a^b f(x)\\,dx'), tex('2\\pi\\int_a^b x f(x)\\,dx'), tex('\\int_a^b [f(x)]^2\\,dx')],
      'Disks of radius $f(x)$ give area $\\pi [f(x)]^2$ and volume $\\pi\\int_a^b [f(x)]^2\\,dx$.',
      1,
    ),
    T(
      'When revolving about a horizontal axis, the radius of a disk or washer is measured:',
      'from the axis of revolution to the curve',
      [
        'from the origin to the curve',
        'between the two curves',
        'along the axis of revolution',
      ],
      'Both radii are vertical distances from the axis of revolution to the boundary curves.',
      2,
    ),
    T(
      'A pyramid with square cross-sections whose side grows linearly with height is best handled by:',
      'integrating the square cross-sectional area along the height',
      [
        'the shell method only',
        'the arc length formula',
        'treating it as a sphere',
      ],
      'With known square cross-sections, integrate $[s(x)]^2$ over the height.',
      2,
    ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Section 3: The Shell Method
// ---------------------------------------------------------------------------
function shellMethod(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('The Shell Method', 'shell');

  // Shell: y = x^2 on [0, b] about y-axis; V = pi b^4 / 2.
  for (let b = 1; b <= 8; b += 1) {
    const p4 = b ** 4;
    out.push(
      T(
        `Using shells, find the volume when the region under $y = x^2$ on $[0, ${b}]$ is revolved about the $y$-axis.`,
        tex(ratPiTex(rat(p4, 2))),
        [
          tex(ratPiTex(rat(p4, 4))),
          tex(ratPiTex(rat(p4, 1))),
          tex(ratPiTex(rat(p4, 3))),
          tex(ratPiTex(rat(p4, 6))),
        ],
        `$V = 2\\pi\\int_0^{${b}} x\\cdot x^2\\,dx = 2\\pi \\int_0^{${b}} x^3\\,dx = ${ratPiTex(rat(p4, 2))}$.`,
        3,
      ),
    );
  }

  // Shell: y = x on [0, b] about y-axis; V = 2 pi b^3 / 3.
  for (let b = 1; b <= 8; b += 1) {
    const cube = b * b * b;
    out.push(
      T(
        `Using shells, find the volume when the region under $y = x$ on $[0, ${b}]$ is revolved about the $y$-axis.`,
        tex(ratPiTex(rat(2 * cube, 3))),
        [
          tex(ratPiTex(rat(cube, 3))),
          tex(ratPiTex(rat(4 * cube, 3))),
          tex(ratPiTex(rat(2 * cube, 1))),
          tex(ratPiTex(rat(cube, 1))),
        ],
        `$V = 2\\pi\\int_0^{${b}} x\\cdot x\\,dx = 2\\pi \\int_0^{${b}} x^2\\,dx = ${ratPiTex(rat(2 * cube, 3))}$.`,
        3,
      ),
    );
  }

  // Shell: y = sqrt(x) on [0, b], b = k^2 about y-axis; V = (4/5) pi k^5.
  for (let k = 1; k <= 5; k += 1) {
    const b = k * k;
    const p5 = k ** 5;
    out.push(
      T(
        `Using shells, find the volume when the region under $y = \\sqrt{x}$ on $[0, ${b}]$ is revolved about the $y$-axis.`,
        tex(ratPiTex(rat(4 * p5, 5))),
        [
          tex(ratPiTex(rat(2 * p5, 5))),
          tex(ratPiTex(rat(4 * p5, 3))),
          tex(ratPiTex(rat(8 * p5, 5))),
          tex(ratPiTex(rat(4 * p5, 1))),
        ],
        `$V = 2\\pi\\int_0^{${b}} x\\sqrt{x}\\,dx = 2\\pi \\int_0^{${b}} x^{3/2}\\,dx = ${ratPiTex(rat(4 * p5, 5))}$.`,
        3,
      ),
    );
  }

  // Shell: y = x^3 on [0, b] about y-axis; V = 2 pi b^5 / 5.
  for (let b = 1; b <= 6; b += 1) {
    const p5 = b ** 5;
    out.push(
      T(
        `Using shells, find the volume when the region under $y = x^3$ on $[0, ${b}]$ is revolved about the $y$-axis.`,
        tex(ratPiTex(rat(2 * p5, 5))),
        [
          tex(ratPiTex(rat(p5, 5))),
          tex(ratPiTex(rat(2 * p5, 3))),
          tex(ratPiTex(rat(4 * p5, 5))),
          tex(ratPiTex(rat(2 * p5, 1))),
        ],
        `$V = 2\\pi\\int_0^{${b}} x\\cdot x^3\\,dx = 2\\pi \\int_0^{${b}} x^4\\,dx = ${ratPiTex(rat(2 * p5, 5))}$.`,
        3,
      ),
    );
  }

  // Shell: y = x^2 on [a, b] about y-axis; V = pi (b^4 - a^4)/2.
  const sqPairs: Array<[number, number]> = [
    [1, 2],
    [1, 3],
    [2, 3],
    [1, 4],
    [2, 4],
    [3, 4],
  ];
  for (const [a, b] of sqPairs) {
    const diff = b ** 4 - a ** 4;
    out.push(
      T(
        `Using shells, find the volume when the region under $y = x^2$ on $[${a}, ${b}]$ is revolved about the $y$-axis.`,
        tex(ratPiTex(rat(diff, 2))),
        [
          tex(ratPiTex(rat(diff, 4))),
          tex(ratPiTex(rat(diff, 1))),
          tex(ratPiTex(rat(diff, 3))),
          tex(ratPiTex(rat(diff, 6))),
        ],
        `$V = 2\\pi\\int_{${a}}^{${b}} x\\cdot x^2\\,dx = 2\\pi\\cdot\\dfrac{x^4}{4}\\Big|_{${a}}^{${b}} = ${ratPiTex(rat(diff, 2))}$.`,
        4,
      ),
    );
  }

  // Shell: y = x on [a, b] about y-axis; V = 2 pi (b^3 - a^3)/3.
  const linPairs: Array<[number, number]> = [
    [1, 2],
    [1, 3],
    [2, 4],
    [1, 4],
  ];
  for (const [a, b] of linPairs) {
    const diff = b ** 3 - a ** 3;
    out.push(
      T(
        `Using shells, find the volume when the region under $y = x$ on $[${a}, ${b}]$ is revolved about the $y$-axis.`,
        tex(ratPiTex(rat(2 * diff, 3))),
        [
          tex(ratPiTex(rat(diff, 3))),
          tex(ratPiTex(rat(2 * diff, 1))),
          tex(ratPiTex(rat(4 * diff, 3))),
          tex(ratPiTex(rat(diff, 1))),
        ],
        `$V = 2\\pi\\int_{${a}}^{${b}} x\\cdot x\\,dx = 2\\pi\\cdot\\dfrac{x^3}{3}\\Big|_{${a}}^{${b}} = ${ratPiTex(rat(2 * diff, 3))}$.`,
        3,
      ),
    );
  }

  // Setup: shell integral for region under f about y-axis.
  const setups: Array<[string, string, string]> = [
    ['x^2', '0', '2'],
    ['x^3', '0', '1'],
    ['e^{x}', '0', '1'],
    ['\\sin x', '0', '\\pi'],
    ['\\sqrt{x}', '1', '4'],
    ['\\ln x', '1', 'e'],
  ];
  for (const [f, a, b] of setups) {
    out.push(
      T(
        `Which integral gives the volume when the region under $y = ${f}$ on $[${a}, ${b}]$ is revolved about the $y$-axis?`,
        tex(`2\\pi\\int_{${a}}^{${b}} x (${f})\\,dx`),
        [
          tex(`\\pi\\int_{${a}}^{${b}} (${f})^2\\,dx`),
          tex(`2\\pi\\int_{${a}}^{${b}} (${f})\\,dx`),
          tex(`2\\pi\\int_{${a}}^{${b}} x\\,dx`),
          tex(`\\pi\\int_{${a}}^{${b}} x (${f})\\,dx`),
        ],
        `About the $y$-axis a shell has radius $x$ and height $${f}$, giving $2\\pi\\int_{${a}}^{${b}} x (${f})\\,dx$.`,
        2,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'The shell method gives a volume of revolution as:',
      tex('2\\pi\\int_a^b (\\text{radius})(\\text{height})\\,dx'),
      [
        tex('\\pi\\int_a^b (\\text{radius})^2\\,dx'),
        tex('\\int_a^b (\\text{radius})(\\text{height})\\,dx'),
        tex('2\\pi\\int_a^b (\\text{height})\\,dx'),
      ],
      'Each cylindrical shell contributes $2\\pi r h\\,dx$.',
      1,
    ),
    T(
      'An unrolled cylindrical shell of radius $x$, height $h$, and thickness $dx$ approximates:',
      'a thin slab of volume $2\\pi x\\,h\\,dx$',
      [
        'a disk of volume $\\pi x^2\\,dx$',
        'a cone of volume $\\tfrac{1}{3}\\pi x^2 h$',
        'a sphere of volume $\\tfrac{4}{3}\\pi x^3$',
      ],
      'Unrolling the tube gives a slab with dimensions $2\\pi x$ by $h$ by $dx$.',
      2,
    ),
    T(
      'Revolving the region under $y = f(x)$ on $[a, b]$ about the $y$-axis, the shell volume is:',
      tex('2\\pi\\int_a^b x f(x)\\,dx'),
      [
        tex('\\pi\\int_a^b x^2\\,dx'),
        tex('2\\pi\\int_a^b f(x)\\,dx'),
        tex('\\pi\\int_a^b [f(x)]^2\\,dx'),
      ],
      'The radius is $x$ and the height is $f(x)$, giving $2\\pi\\int_a^b x f(x)\\,dx$.',
      2,
    ),
    T(
      'The shell method is often easier than washers when:',
      'rotating about a vertical axis while integrating in $x$',
      [
        'the region is a rectangle',
        'the function is constant',
        'the axis passes through the centroid',
      ],
      'Shells let you keep the same variable the function is given in, avoiding solving for the inverse.',
      2,
    ),
    T(
      'Revolving the region under $y = f(x)$ on $[a, b]$ (with $a \\ge 0$) about the line $x = -1$ uses shell radius:',
      tex('x + 1'),
      [tex('x - 1'), tex('x'), tex('1 - x')],
      'The distance from a point at position $x$ to the line $x = -1$ is $x + 1$.',
      3,
    ),
    T(
      'For a shell generated by revolving about the $y$-axis, the "height" of the shell is:',
      'the function value $f(x)$ at that radius',
      [
        'the radius $x$',
        'the thickness $dx$',
        'the circumference $2\\pi x$',
      ],
      'The shell height is the vertical extent of the region, $f(x)$.',
      1,
    ),
    T(
      'Compared with the disk/washer method, the shell method uses strips that are:',
      'parallel to the axis of revolution',
      [
        'perpendicular to the axis of revolution',
        'always horizontal',
        'always of equal area',
      ],
      'Shell strips run parallel to the rotation axis, while disk slices are perpendicular to it.',
      2,
    ),
    T(
      'The factor $2\\pi x$ in the shell formula represents:',
      'the circumference traced by the shell at radius $x$',
      [
        'the area of the shell cross-section',
        'the height of the shell',
        'the thickness of the shell',
      ],
      'As the strip sweeps around, its radius-$x$ path has circumference $2\\pi x$.',
      1,
    ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Section 4: Arc Length and Surface Area
// ---------------------------------------------------------------------------
function arcLengthSurfaceArea(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Arc Length and Surface Area', 'arc');

  // Straight line y = m x on [0, L0]; L = L0 sqrt(1 + m^2).
  for (let m = 1; m <= 3; m += 1) {
    for (let L0 = 1; L0 <= 4; L0 += 1) {
      const k = 1 + m * m;
      out.push(
        T(
          `Find the arc length of $y = ${coef(m, 'x')}$ from $x = 0$ to $x = ${L0}$.`,
          tex(sqrtCoef(L0, k)),
          [
            tex(`${L0}`),
            tex(sqrtCoef(2 * L0, k)),
            tex(sqrtCoef(L0, k + 1)),
            tex(sqrtCoef(L0, m * m)),
          ],
          `With $y' = ${m}$, $L = \\int_0^{${L0}} \\sqrt{1 + ${m * m}}\\,dx = ${L0}\\sqrt{${k}} = ${sqrtCoef(L0, k)}$.`,
          3,
        ),
      );
    }
  }

  // y = (2/3) x^(3/2) on [0, b], b = k^2 - 1; L = (2/3)(k^3 - 1).
  for (let k = 2; k <= 5; k += 1) {
    const b = k * k - 1;
    const val = k * k * k - 1;
    out.push(
      T(
        `Find the arc length of $y = \\tfrac{2}{3} x^{3/2}$ on $[0, ${b}]$.`,
        tex(ratTex(rat(2 * val, 3))),
        [
          tex(ratTex(rat(val, 3))),
          tex(ratTex(rat(4 * val, 3))),
          tex(ratTex(rat(2 * val, 1))),
          tex(ratTex(rat(2 * (k * k * k), 3))),
        ],
        `Here $y' = \\sqrt{x}$, so $L = \\int_0^{${b}} \\sqrt{1 + x}\\,dx = \\tfrac{2}{3}\\big[(1 + ${b})^{3/2} - 1\\big] = ${ratTex(rat(2 * val, 3))}$.`,
        4,
      ),
    );
  }

  // y = cosh x on [0, b]; L = sinh b.
  for (let b = 1; b <= 6; b += 1) {
    out.push(
      T(
        `Find the arc length of $y = \\cosh x$ on $[0, ${b}]$.`,
        tex(`\\sinh ${b}`),
        [
          tex(`\\cosh ${b}`),
          tex(`\\sinh ${b} + 1`),
          tex(`e^{${b}} - 1`),
          tex(`\\tfrac{1}{2}\\sinh ${b}`),
        ],
        `Since $y' = \\sinh x$ and $1 + \\sinh^2 x = \\cosh^2 x$, $L = \\int_0^{${b}} \\cosh x\\,dx = \\sinh ${b}$.`,
        4,
      ),
    );
  }

  // y = cosh x on [-b, b]; L = 2 sinh b (by symmetry).
  for (let b = 1; b <= 4; b += 1) {
    out.push(
      T(
        `Find the arc length of $y = \\cosh x$ on $[-${b}, ${b}]$.`,
        tex(`2\\sinh ${b}`),
        [
          tex(`\\sinh ${b}`),
          tex(`2\\cosh ${b}`),
          tex(`\\cosh ${b}`),
          tex(`2\\sinh ${b} - 2`),
        ],
        `By symmetry, $L = 2\\int_0^{${b}} \\cosh x\\,dx = 2\\sinh ${b}$.`,
        4,
      ),
    );
  }

  // Cylinder lateral surface area: revolve horizontal segment y = r on [0, h]; S = 2 pi r h.
  for (let r = 1; r <= 3; r += 1) {
    for (let h = 1; h <= 4; h += 1) {
      out.push(
        T(
          `The horizontal segment $y = ${r}$ for $0 \\le x \\le ${h}$ is revolved about the $x$-axis, forming a cylinder. Find the lateral surface area.`,
          tex(ratPiTex(rat(2 * r * h, 1))),
          [
            tex(ratPiTex(rat(r * h, 1))),
            tex(ratPiTex(rat(4 * r * h, 1))),
            tex(ratPiTex(rat(3 * r * h, 1))),
            tex(ratPiTex(rat(r * r * h, 1))),
          ],
          `With $f = ${r}$ and $f' = 0$, $S = \\int_0^{${h}} 2\\pi(${r})\\sqrt{1 + 0}\\,dx = 2\\pi\\cdot ${r}\\cdot ${h} = ${ratPiTex(rat(2 * r * h, 1))}$.`,
          2,
        ),
      );
    }
  }

  // Surface area setup for y = f about the x-axis.
  const saSetups: Array<[string, string, string, string]> = [
    ['x^2', '2x', '0', '1'],
    ['x^3', '3x^2', '0', '1'],
    ['\\sqrt{x}', '\\tfrac{1}{2\\sqrt{x}}', '1', '4'],
    ['e^{x}', 'e^{x}', '0', '1'],
    ['\\sin x', '\\cos x', '0', '\\pi'],
  ];
  for (const [f, fp, a, b] of saSetups) {
    out.push(
      T(
        `Which integral gives the area of the surface formed by revolving $y = ${f}$ on $[${a}, ${b}]$ about the $x$-axis?`,
        tex(`2\\pi\\int_{${a}}^{${b}} (${f})\\sqrt{1 + (${fp})^2}\\,dx`),
        [
          tex(`\\pi\\int_{${a}}^{${b}} (${f})^2\\,dx`),
          tex(`2\\pi\\int_{${a}}^{${b}} (${f})\\,dx`),
          tex(`\\int_{${a}}^{${b}} \\sqrt{1 + (${fp})^2}\\,dx`),
        ],
        `Surface area about the $x$-axis is $\\int 2\\pi f\\sqrt{1 + [f']^2}\\,dx$; here $f' = ${fp}$.`,
        3,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'The arc length of $y = f(x)$ on $[a, b]$ is:',
      tex('\\int_a^b \\sqrt{1 + [f\'(x)]^2}\\,dx'),
      [
        tex('\\int_a^b \\sqrt{1 + f(x)^2}\\,dx'),
        tex('\\int_a^b [1 + f\'(x)]\\,dx'),
        tex('\\int_a^b f\'(x)\\,dx'),
      ],
      'Each curve piece is a hypotenuse, giving $\\sqrt{1 + [f\'(x)]^2}$ under the integral.',
      1,
    ),
    T(
      'The arc-length element $ds$ equals:',
      tex('\\sqrt{dx^2 + dy^2}'),
      [tex('dx + dy'), tex('\\sqrt{dx^2 - dy^2}'), tex('dx\\,dy')],
      'By the Pythagorean theorem, $ds = \\sqrt{dx^2 + dy^2}$.',
      1,
    ),
    T(
      'Written as an integral in $y$, the arc length of a curve $x = g(y)$ on $[c, d]$ is:',
      tex('\\int_c^d \\sqrt{1 + [g\'(y)]^2}\\,dy'),
      [
        tex('\\int_c^d \\sqrt{1 + [g(y)]^2}\\,dy'),
        tex('\\int_c^d g\'(y)\\,dy'),
        tex('\\int_c^d \\sqrt{[g\'(y)]^2 - 1}\\,dy'),
      ],
      'Swapping the roles of the variables gives $\\sqrt{1 + [g\'(y)]^2}$ integrated in $y$.',
      2,
    ),
    T(
      'The surface area generated by revolving $y = f(x)$ about the $x$-axis is:',
      tex('\\int_a^b 2\\pi f(x)\\sqrt{1 + [f\'(x)]^2}\\,dx'),
      [
        tex('\\int_a^b \\pi [f(x)]^2\\,dx'),
        tex('\\int_a^b 2\\pi f(x)\\,dx'),
        tex('\\int_a^b \\sqrt{1 + [f\'(x)]^2}\\,dx'),
      ],
      'Each arc-length element sweeps a band of circumference $2\\pi f(x)$.',
      2,
    ),
    T(
      'The surface area generated by revolving $y = f(x)$ about the $y$-axis (with $x \\ge 0$) is:',
      tex('\\int_a^b 2\\pi x\\sqrt{1 + [f\'(x)]^2}\\,dx'),
      [
        tex('\\int_a^b 2\\pi f(x)\\sqrt{1 + [f\'(x)]^2}\\,dx'),
        tex('\\int_a^b \\pi x^2\\,dx'),
        tex('\\int_a^b 2\\pi x\\,dx'),
      ],
      'Revolving about the $y$-axis uses radius $x$, giving $2\\pi x\\sqrt{1 + [f\'(x)]^2}$.',
      2,
    ),
    T(
      'The arc-length integrand $\\sqrt{1 + [f\'(x)]^2}$ is always:',
      'at least $1$',
      ['at most $1$', 'equal to $f\'(x)$', 'negative when $f$ decreases'],
      'Since $[f\'(x)]^2 \\ge 0$, the square root is at least $\\sqrt{1} = 1$.',
      2,
    ),
    T(
      'Why do many arc-length integrals lack an elementary closed form?',
      'the integrand $\\sqrt{1 + [f\'(x)]^2}$ is often not elementarily integrable',
      [
        'arc length is undefined for curves',
        'the integral always diverges',
        'derivatives never appear under roots',
      ],
      'Even simple curves can yield nonelementary integrals, so we approximate numerically.',
      2,
    ),
    T(
      'For a straight segment, the arc length formula reduces to:',
      'the distance formula between the endpoints',
      [
        'the area of a triangle',
        'zero',
        'the slope of the segment',
      ],
      'A constant derivative makes the integral $\\sqrt{1 + m^2}\\,(b - a)$, the straight-line distance.',
      1,
    ),
    T(
      'A thin band on a surface of revolution has area approximately:',
      tex('2\\pi r\\,ds'),
      [tex('\\pi r^2\\,ds'), tex('2\\pi r\\,dr'), tex('\\pi r\\,ds')],
      'A thin band is circumference $2\\pi r$ times slant width $ds$.',
      2,
    ),
    T(
      'In the surface-area integrand, the factor $\\sqrt{1 + [f\'(x)]^2}$ accounts for:',
      'the slant of the band, not just its horizontal width',
      [
        'the radius of revolution',
        'the thickness of the solid',
        'the area of a flat disk',
      ],
      'The band follows the curve, so its slant width is the arc-length element $ds$.',
      2,
    ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Section 5: Work
// ---------------------------------------------------------------------------
function work(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Work', 'work');

  // Spring work: F = k x, stretch 0 to a; W = (1/2) k a^2. k even -> integer.
  for (const k of [2, 4, 6, 8]) {
    for (const a of [2, 3, 4]) {
      const W = (k / 2) * a * a;
      out.push(
        T(
          `A spring obeys $F(x) = ${k}x$ (newtons, meters). Find the work done stretching it from $x = 0$ to $x = ${a}$ m.`,
          `$${W}$ J`,
          [`$${2 * W}$ J`, `$${3 * W}$ J`, `$${4 * W}$ J`, `$${(k / 2) * a}$ J`],
          `$W = \\int_0^{${a}} ${k}x\\,dx = \\dfrac{${k}}{2}x^2\\Big|_0^{${a}} = ${W}$ J.`,
          3,
        ),
      );
    }
  }

  // Spring work over [a, b]: W = (1/2) k (b^2 - a^2). k even -> integer.
  const springIntervals: Array<[number, number, number]> = [
    [2, 1, 3],
    [4, 1, 2],
    [6, 2, 4],
    [2, 2, 5],
    [4, 0, 3],
    [8, 1, 2],
  ];
  for (const [k, a, b] of springIntervals) {
    const W = (k / 2) * (b * b - a * a);
    out.push(
      T(
        `A spring obeys $F(x) = ${k}x$. Find the work done stretching it from $x = ${a}$ to $x = ${b}$.`,
        `$${W}$ J`,
        [
          `$${2 * W}$ J`,
          `$${(k / 2) * (b - a)}$ J`,
          `$${(k / 2) * (b * b + a * a)}$ J`,
          `$${k * (b * b - a * a)}$ J`,
        ],
        `$W = \\int_{${a}}^{${b}} ${k}x\\,dx = \\dfrac{${k}}{2}(${b}^2 - ${a}^2) = ${W}$ J.`,
        4,
      ),
    );
  }

  // Constant lifting force: lift a w-lb object h ft; W = w h.
  for (const w of [5, 10, 20]) {
    for (const h of [3, 4, 6]) {
      const W = w * h;
      out.push(
        T(
          `How much work is done lifting a $${w}$ lb object a height of $${h}$ ft (constant force)?`,
          `$${W}$ ft-lb`,
          [`$${2 * W}$ ft-lb`, `$${w + h}$ ft-lb`, `$${Math.round(W / 2)}$ ft-lb`, `$${w * h * h}$ ft-lb`],
          `Work is force times distance: $W = ${w}\\cdot ${h} = ${W}$ ft-lb.`,
          2,
        ),
      );
    }
  }

  // Lifting a hanging rope of length L ft weighing rho lb/ft entirely to the top; W = rho L^2 / 2.
  for (const rho of [1, 2, 3]) {
    for (const L of [4, 6, 8]) {
      const W = (rho * L * L) / 2;
      out.push(
        T(
          `A rope $${L}$ ft long weighs $${rho}$ lb/ft and hangs from a height. Find the work to wind all of it to the top.`,
          `$${W}$ ft-lb`,
          [
            `$${2 * W}$ ft-lb`,
            `$${rho * L}$ ft-lb`,
            `$${Math.round(W / 2)}$ ft-lb`,
            `$${4 * W}$ ft-lb`,
          ],
          `A piece at height $x$ is lifted $x$ ft: $W = \\int_0^{${L}} ${rho}x\\,dx = \\dfrac{${rho}}{2}x^2\\Big|_0^{${L}} = ${W}$ ft-lb.`,
          4,
        ),
      );
    }
  }

  // Variable force F(x) = c x^2; W on [0, b] = c b^3 / 3 (choose c divisible by 3 -> integer).
  for (const c of [3, 6]) {
    for (let b = 1; b <= 4; b += 1) {
      const W = (c * b ** 3) / 3;
      out.push(
        T(
          `A force $F(x) = ${c}x^2$ acts along the $x$-axis. Find the work done from $x = 0$ to $x = ${b}$.`,
          `$${W}$`,
          [`$${2 * W}$`, `$${Math.round(W / 2)}$`, `$${c * b * b}$`, `$${3 * W}$`],
          `$W = \\int_0^{${b}} ${c}x^2\\,dx = \\dfrac{${c}}{3}x^3\\Big|_0^{${b}} = ${W}$.`,
          3,
        ),
      );
    }
  }

  // Pumping setup (which integral) for a cylindrical tank pumped out the top.
  const tanks: Array<[number, number]> = [
    [2, 10],
    [3, 8],
    [5, 12],
    [4, 6],
  ];
  for (const [R, H] of tanks) {
    out.push(
      T(
        `A cylindrical tank of radius $${R}$ ft and height $${H}$ ft is full of water (weight-density $62.4$ lb/ft$^3$) and is pumped out over the top. Which integral gives the work?`,
        tex(`\\int_0^{${H}} 62.4\\pi\\cdot ${R * R}\\,(${H} - y)\\,dy`),
        [
          tex(`\\int_0^{${H}} 62.4\\pi\\cdot ${R * R}\\,y\\,dy`),
          tex(`\\int_0^{${H}} 62.4\\cdot ${R * R}\\,(${H} - y)\\,dy`),
          tex(`\\int_0^{${H}} 62.4\\pi\\cdot ${R * R}\\,dy`),
          tex(`\\int_0^{${H}} 62.4\\pi\\cdot ${2 * R}\\,(${H} - y)\\,dy`),
        ],
        `A layer at height $y$ has volume $\\pi(${R})^2\\,dy$, weight $62.4\\pi\\cdot ${R * R}\\,dy$, and is lifted $${H} - y$ ft, giving $\\int_0^{${H}} 62.4\\pi\\cdot ${R * R}(${H} - y)\\,dy$.`,
        5,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'The work done by a variable force $F(x)$ moving an object from $a$ to $b$ is:',
      tex('\\int_a^b F(x)\\,dx'),
      [tex('F(b) - F(a)'), tex('\\int_a^b F\'(x)\\,dx'), tex('F(b)\\,(b - a)')],
      'Work is the integral of force over distance: $W = \\int_a^b F(x)\\,dx$.',
      1,
    ),
    T(
      "By Hooke's law $F = kx$, the work to stretch a spring from $0$ to $a$ is:",
      tex('\\tfrac{1}{2} k a^2'),
      [tex('k a'), tex('k a^2'), tex('\\tfrac{1}{2} k a')],
      '$W = \\int_0^a kx\\,dx = \\tfrac{1}{2} k a^2$.',
      2,
    ),
    T(
      'Hooke\u2019s law states that the force needed to stretch a spring is:',
      'proportional to the distance stretched',
      [
        'constant for all stretches',
        'proportional to the square of the distance',
        'inversely proportional to the distance',
      ],
      'Hooke\u2019s law is $F(x) = kx$: force grows in direct proportion to the stretch.',
      1,
    ),
    T(
      'When pumping fluid from a tank, what varies from layer to layer?',
      'the distance each layer must be lifted',
      [
        'the weight-density of the fluid',
        'the acceleration due to gravity',
        'the cross-sectional shape of a thin layer',
      ],
      'The force (weight) per unit volume is constant; the lift distance changes with depth.',
      2,
    ),
    T(
      'The weight of a thin horizontal layer of fluid used in a pumping integral is:',
      'weight-density times the layer\u2019s volume',
      [
        'weight-density divided by depth',
        'pressure times the tank height',
        'mass times the lift distance',
      ],
      'Weight $=$ (weight-density)$\\times$(volume of the layer).',
      2,
    ),
    T(
      'The SI unit of work, the joule, is equivalent to:',
      'a newton-meter',
      ['a newton per meter', 'a kilogram-meter', 'a meter per second'],
      'Work is force times distance, so $1\\text{ J} = 1\\text{ N}\\cdot\\text{m}$.',
      1,
    ),
    T(
      'If the force is constant, the work integral $\\int_a^b F\\,dx$ simplifies to:',
      tex('F\\,(b - a)'),
      [tex('F\\,(b + a)'), tex('\\tfrac{1}{2}F\\,(b - a)'), tex('F\\,b')],
      'A constant force factors out: $\\int_a^b F\\,dx = F(b - a)$, i.e. force times distance.',
      2,
    ),
    T(
      'Pumping water to a point above the top of a tank, compared with pumping to the rim, requires:',
      'more work, since every layer travels farther',
      [
        'the same work',
        'less work',
        'no additional work for layers near the top',
      ],
      'Raising the destination increases every layer\u2019s lift distance, so total work increases.',
      2,
    ),
    T(
      'The work to stretch a spring depends on:',
      'only the change in length, not the natural length',
      [
        'the natural length only',
        'the spring\u2019s mass',
        'the speed of stretching',
      ],
      'Hooke\u2019s law measures force from the displacement, so only the amount of stretch matters.',
      2,
    ),
    T(
      'Doubling the distance a constant force acts over changes the work by a factor of:',
      tex('2'),
      [tex('4'), tex('\\tfrac{1}{2}'), tex('1')],
      'With constant force, work is proportional to distance, so it doubles.',
      2,
    ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Section 6: Fluid Forces
// ---------------------------------------------------------------------------
function fluidForces(): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const T = topic('Fluid Forces', 'fluid');

  // Pressure at depth: P = w d (integer weight-density to stay exact).
  for (const w of [40, 50, 60]) {
    for (const d of [2, 3, 4, 6]) {
      const P = w * d;
      out.push(
        T(
          `A fluid weighs $${w}$ lb/ft$^3$. Find the pressure at a depth of $${d}$ ft.`,
          `$${P}$ lb/ft$^2$`,
          [
            `$${w + d}$ lb/ft$^2$`,
            `$${w * d * d}$ lb/ft$^2$`,
            `$${2 * P}$ lb/ft$^2$`,
            `$${w}$ lb/ft$^2$`,
          ],
          `Pressure is weight-density times depth: $P = ${w}\\cdot ${d} = ${P}$ lb/ft$^2$.`,
          2,
        ),
      );
    }
  }

  // Horizontal plate force: F = w d A.
  const horiz: Array<[number, number, number]> = [
    [50, 3, 2],
    [50, 5, 4],
    [60, 3, 4],
    [60, 5, 2],
    [40, 4, 3],
    [40, 6, 5],
    [50, 2, 6],
    [60, 4, 4],
  ];
  for (const [w, d, A] of horiz) {
    const F = w * d * A;
    out.push(
      T(
        `A horizontal plate of area $${A}$ ft$^2$ lies at depth $${d}$ ft in a fluid weighing $${w}$ lb/ft$^3$. Find the total fluid force on it.`,
        `$${F}$ lb`,
        [
          `$${w * A}$ lb`,
          `$${w * d}$ lb`,
          `$${d * A}$ lb`,
          `$${2 * F}$ lb`,
        ],
        `At constant depth the pressure $${w}\\cdot ${d} = ${w * d}$ lb/ft$^2$ is uniform, so $F = PA = ${w}\\cdot ${d}\\cdot ${A} = ${F}$ lb.`,
        3,
      ),
    );
  }

  // Vertical rectangle, top edge at the surface: width b, depth 0..h; F = w b h^2 / 2.
  const vertTop: Array<[number, number, number]> = [
    [50, 2, 2],
    [50, 3, 4],
    [60, 2, 4],
    [60, 4, 2],
    [40, 3, 4],
    [40, 5, 2],
    [50, 4, 6],
    [60, 3, 6],
  ];
  for (const [w, b, h] of vertTop) {
    const F = (w * b * h * h) / 2;
    out.push(
      T(
        `A vertical rectangular plate is $${b}$ ft wide and $${h}$ ft tall, with its top edge at the surface of a fluid weighing $${w}$ lb/ft$^3$. Find the total fluid force on one face.`,
        `$${F}$ lb`,
        [
          `$${2 * F}$ lb`,
          `$${w * b * h}$ lb`,
          `$${Math.round(F / 2)}$ lb`,
          `$${(w * b * h * h) / 2 + w * b * h}$ lb`,
        ],
        `A strip at depth $y$ has area $${b}\\,dy$ and pressure $${w}y$, so $F = \\int_0^{${h}} ${w}\\cdot ${b}\\,y\\,dy = \\dfrac{${w}\\cdot ${b}}{2}(${h})^2 = ${F}$ lb.`,
        4,
      ),
    );
  }

  // Vertical square plate, top at surface, side s; F = w s^3 / 2.
  for (const w of [50, 60]) {
    for (const s of [2, 3, 4]) {
      const F = (w * s ** 3) / 2;
      out.push(
        T(
          `A vertical square plate of side $${s}$ ft has its top edge at the surface of a fluid weighing $${w}$ lb/ft$^3$. Find the total fluid force on one face.`,
          `$${F}$ lb`,
          [
            `$${2 * F}$ lb`,
            `$${w * s * s}$ lb`,
            `$${Math.round(F / 2)}$ lb`,
            `$${w * s ** 3}$ lb`,
          ],
          `With width $${s}$ and depth $0$ to $${s}$: $F = \\int_0^{${s}} ${w}\\cdot ${s}\\,y\\,dy = \\dfrac{${w}\\cdot ${s}}{2}(${s})^2 = ${F}$ lb.`,
          4,
        ),
      );
    }
  }

  // Vertical rectangle submerged with top at depth d0: width b, from d0 to d0+h; F = w b ((d0+h)^2 - d0^2)/2.
  const submerged: Array<[number, number, number, number]> = [
    [50, 2, 2, 2],
    [60, 2, 1, 3],
    [50, 3, 2, 2],
    [40, 2, 3, 3],
    [60, 3, 1, 2],
    [50, 4, 2, 4],
    [40, 3, 2, 3],
    [50, 3, 1, 3],
  ];
  for (const [w, b, d0, h] of submerged) {
    const F = (w * b * ((d0 + h) ** 2 - d0 ** 2)) / 2;
    out.push(
      T(
        `A vertical rectangular plate is $${b}$ ft wide and $${h}$ ft tall; its top edge sits $${d0}$ ft below the surface of a fluid weighing $${w}$ lb/ft$^3$. Find the total fluid force on one face.`,
        `$${F}$ lb`,
        [
          `$${2 * F}$ lb`,
          `$${w * b * h * d0}$ lb`,
          `$${(w * b * h * h) / 2}$ lb`,
          `$${Math.round(F / 2)}$ lb`,
        ],
        `A strip at depth $y$ (from $${d0}$ to $${d0 + h}$) has pressure $${w}y$ and area $${b}\\,dy$: $F = \\int_{${d0}}^{${d0 + h}} ${w}\\cdot ${b}\\,y\\,dy = \\dfrac{${w}\\cdot ${b}}{2}\\big(${d0 + h}^2 - ${d0}^2\\big) = ${F}$ lb.`,
        5,
      ),
    );
  }

  // Conceptual.
  out.push(
    T(
      'The pressure at depth $d$ in a fluid of weight-density $\\gamma$ is:',
      tex('\\gamma d'),
      [tex('\\dfrac{\\gamma}{d}'), tex('\\gamma d^2'), tex('\\gamma + d')],
      'Pressure equals weight-density times depth: $P = \\gamma d$.',
      1,
    ),
    T(
      'The total force on a flat plate of area $A$ at constant depth $d$ is:',
      tex('\\gamma d A'),
      [tex('\\gamma A'), tex('\\gamma d'), tex('d A')],
      'At constant depth the pressure $\\gamma d$ is uniform, so $F = PA = \\gamma d A$.',
      2,
    ),
    T(
      'For a vertically oriented plate, the fluid force is computed by integrating, over depth, the quantity:',
      'pressure times the width of the plate at that depth',
      [
        'velocity over time',
        'density over temperature',
        'volume over depth',
      ],
      'Force $= \\int \\gamma\\,(\\text{depth})\\,(\\text{width})\\,d(\\text{depth})$ across the plate.',
      2,
    ),
    T(
      'Why must the force on a vertical plate be found with an integral rather than $P A$?',
      'the pressure varies with depth across the plate',
      [
        'the area is unknown',
        'the weight-density changes with depth',
        'the plate is not flat',
      ],
      'Because pressure depends on depth, slice the plate into strips and integrate.',
      2,
    ),
    T(
      'At a given depth, the pressure a fluid exerts acts:',
      'equally in all directions',
      [
        'only straight down',
        'only horizontally',
        'only on the container walls',
      ],
      'Fluid pressure at a point is the same in every direction.',
      1,
    ),
    T(
      'The weight-density of water in U.S. customary units is approximately:',
      tex('62.4\\ \\text{lb/ft}^3'),
      [tex('9.8\\ \\text{lb/ft}^3'), tex('1000\\ \\text{lb/ft}^3'), tex('32\\ \\text{lb/ft}^3')],
      'Water weighs about $62.4$ lb per cubic foot.',
      1,
    ),
    T(
      'A horizontal strip of a vertical plate at depth $y$, width $w(y)$, and thickness $dy$ feels a force of about:',
      tex('\\gamma\\,y\\,w(y)\\,dy'),
      [tex('\\gamma\\,w(y)\\,dy'), tex('\\gamma\\,y\\,dy'), tex('y\\,w(y)\\,dy')],
      'Pressure $\\gamma y$ times area $w(y)\\,dy$ gives $\\gamma\\,y\\,w(y)\\,dy$.',
      2,
    ),
    T(
      'If a plate is lowered to a greater depth without changing its shape, the total fluid force on it:',
      'increases',
      ['decreases', 'stays the same', 'drops to zero'],
      'Greater depth means greater pressure at every point, so the force increases.',
      2,
    ),
    T(
      'Doubling the depth of a small horizontal plate (same area) changes the fluid force by a factor of:',
      tex('2'),
      [tex('4'), tex('\\tfrac{1}{2}'), tex('1')],
      'Force $\\gamma d A$ is proportional to depth, so it doubles.',
      2,
    ),
    T(
      'Fluid pressure depends on:',
      'depth and the fluid\u2019s weight-density',
      [
        'the shape of the container only',
        'the total volume of fluid only',
        'the surface area of the fluid only',
      ],
      'Pressure is $\\gamma d$: it depends on weight-density and depth, not container shape.',
      1,
    ),
  );

  return out;
}

export const applicationsOfIntegrationQuestions: PracticeQuestion[] = [
  ...areaBetweenCurves(),
  ...volumeCrossSections(),
  ...shellMethod(),
  ...arcLengthSurfaceArea(),
  ...work(),
  ...fluidForces(),
];
