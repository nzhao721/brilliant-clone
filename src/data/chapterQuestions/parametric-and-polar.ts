import type { PracticeQuestion } from '../questionBank';

/* Practice questions for "Parametric Equations and Polar Coordinates" (APEX Calculus Ch. 9), adapted under CC BY-NC 4.0 (G. Hartman et al.). */

const CHAPTER_ID = 'parametric-and-polar';
const ID_PREFIX = 'parampolar';
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

function mc(
  slug: string,
  category: string,
  prompt: string,
  choices: readonly string[],
  correctIndex: number,
  explanation: string,
  difficulty: number,
): PracticeQuestion {
  return {
    id: `${ID_PREFIX}-${slug}`,
    chapterId: CHAPTER_ID,
    category,
    prompt,
    choices: choices.map((label, index) => ({ id: LETTERS[index], label })),
    correctChoiceId: LETTERS[correctIndex],
    explanation,
    difficulty,
  };
}

// Curated, APEX-exercise-flavored questions (vetted answers).
const curatedQuestions: PracticeQuestion[] = [
  // Conic Sections
  mc(
    'conics-curated-001',
    'Conic sections',
    'Every conic section can be written as a second-degree equation in $x$ and $y$. Which is that general form?',
    [
      '$Ax^{2} + Bxy + Cy^{2} + Dx + Ey + F = 0$',
      '$Ax + By + C = 0$',
      '$Ax^{3} + By^{3} = C$',
      '$Ax^{2} + By^{2} = Cxy$',
    ],
    0,
    'Conics are exactly the curves given by the general second-degree equation $Ax^{2} + Bxy + Cy^{2} + Dx + Ey + F = 0$.',
    1,
  ),
  mc(
    'conics-curated-002',
    'Conic sections',
    'A parabola has focus $(0, 2)$ and directrix $y = -2$. What is its equation?',
    ['$y = \\dfrac{1}{8}x^{2}$', '$y = \\dfrac{1}{2}x^{2}$', '$y = 8x^{2}$', '$x = \\dfrac{1}{8}y^{2}$'],
    0,
    'With focus $(0, p)$ and directrix $y = -p$, the parabola is $y = \\dfrac{1}{4p}x^{2}$. Here $p = 2$, so $y = \\dfrac{1}{8}x^{2}$.',
    3,
  ),
  mc(
    'conics-curated-003',
    'Conic sections',
    'For the ellipse $\\dfrac{x^{2}}{16} + \\dfrac{y^{2}}{7} = 1$, how far from the center are the foci?',
    ['$3$', '$4$', '$\\sqrt{23}$', '$\\sqrt{7}$'],
    0,
    'Use $c^{2} = a^{2} - b^{2} = 16 - 7 = 9$, so $c = 3$.',
    2,
  ),
  mc(
    'conics-curated-004',
    'Conic sections',
    'What are the asymptotes of the hyperbola $\\dfrac{x^{2}}{9} - \\dfrac{y^{2}}{16} = 1$?',
    ['$y = \\pm\\dfrac{4}{3}x$', '$y = \\pm\\dfrac{3}{4}x$', '$y = \\pm\\dfrac{9}{16}x$', '$y = \\pm x$'],
    0,
    'A hyperbola $\\dfrac{x^{2}}{a^{2}} - \\dfrac{y^{2}}{b^{2}} = 1$ has asymptotes $y = \\pm\\dfrac{b}{a}x$. Here $a = 3$, $b = 4$, so $y = \\pm\\dfrac{4}{3}x$.',
    2,
  ),
  mc(
    'conics-curated-005',
    'Conic sections',
    'Mercury\u2019s orbit is an ellipse with eccentricity about $0.21$. What does that small value indicate?',
    [
      'an orbit that is nearly, but not quite, circular',
      'a perfectly circular orbit',
      'a parabolic (escape) path',
      'a hyperbolic path',
    ],
    0,
    'Eccentricity $0$ is a circle and values near $0$ are nearly circular; $e = 0.21$ is a slightly elongated ellipse.',
    1,
  ),

  // Parametric Equations
  mc(
    'param-curated-001',
    'Parametric equations',
    'What advantage do parametric equations have over a single equation $y = f(x)$?',
    [
      'they can trace curves that fail the vertical line test, and they record direction of motion',
      'they always produce straight lines',
      'they remove the need for any variables',
      'they can only describe circles',
    ],
    0,
    'Computing $x$ and $y$ separately from a parameter lets the curve loop or backtrack and records the orientation of travel.',
    1,
  ),
  mc(
    'param-curated-002',
    'Parametric equations',
    'Eliminate the parameter from $x = t + 1$, $y = t^{2}$.',
    ['$y = (x - 1)^{2}$', '$y = (x + 1)^{2}$', '$y = x^{2} - 1$', '$y = x^{2} + 1$'],
    0,
    'From $x = t + 1$, $t = x - 1$, so $y = t^{2} = (x - 1)^{2}$.',
    2,
  ),
  mc(
    'param-curated-003',
    'Parametric equations',
    'The equations $x = \\sec t$, $y = \\tan t$ trace which curve?',
    [
      'the hyperbola $x^{2} - y^{2} = 1$',
      'the circle $x^{2} + y^{2} = 1$',
      'the parabola $y = x^{2}$',
      'the line $y = x$',
    ],
    0,
    'Since $\\sec^{2} t - \\tan^{2} t = 1$, the points satisfy $x^{2} - y^{2} = 1$.',
    3,
  ),
  mc(
    'param-curated-004',
    'Parametric equations',
    'As $t$ increases, $x = \\cos t$, $y = -\\sin t$ traces the unit circle in which direction?',
    ['clockwise', 'counterclockwise', 'back and forth along a diameter', 'it does not move'],
    0,
    'Starting at $(1, 0)$ the point moves toward $(0, -1)$, i.e. clockwise; the negative sine reverses the usual orientation.',
    3,
  ),
  mc(
    'param-curated-005',
    'Parametric equations',
    'For $x = t^{2}$ and $y = t^{3}$ with $t$ ranging over all real numbers, where does the curve lie?',
    [
      'entirely in the region $x \\ge 0$',
      'entirely in the region $y \\ge 0$',
      'on a full circle',
      'on a single vertical line',
    ],
    0,
    'Since $x = t^{2} \\ge 0$ for every $t$, the whole curve stays in the right half-plane.',
    2,
  ),

  // Calculus of Parametric Curves
  mc(
    'pcalc-curated-001',
    'Calculus of parametric curves',
    'For a parametric curve $x = f(t)$, $y = g(t)$, the slope $\\dfrac{dy}{dx}$ equals:',
    [
      '$\\dfrac{dy/dt}{dx/dt}$ where $\\dfrac{dx}{dt} \\ne 0$',
      '$\\dfrac{dx/dt}{dy/dt}$',
      '$\\dfrac{dy}{dt} \\cdot \\dfrac{dx}{dt}$',
      '$\\dfrac{d^{2}y}{dt^{2}}$',
    ],
    0,
    'The chain rule gives $\\dfrac{dy}{dx} = \\dfrac{dy/dt}{dx/dt}$, valid wherever $\\dfrac{dx}{dt} \\ne 0$.',
    1,
  ),
  mc(
    'pcalc-curated-002',
    'Calculus of parametric curves',
    'For $x = 5t^{2} - 6t + 4$, $y = t^{2} + 6t - 1$, what is $\\dfrac{dy}{dx}$?',
    [
      '$\\dfrac{2t + 6}{10t - 6}$',
      '$\\dfrac{10t - 6}{2t + 6}$',
      '$\\dfrac{2t + 6}{5t - 6}$',
      '$2t + 6$',
    ],
    0,
    'Here $\\dfrac{dy}{dt} = 2t + 6$ and $\\dfrac{dx}{dt} = 10t - 6$, so $\\dfrac{dy}{dx} = \\dfrac{2t + 6}{10t - 6}$.',
    3,
  ),
  mc(
    'pcalc-curated-003',
    'Calculus of parametric curves',
    'The arc length of $x = 3\\cos t$, $y = 3\\sin t$ on $[0, \\tfrac{3\\pi}{2}]$ is:',
    ['$\\dfrac{9\\pi}{2}$', '$6\\pi$', '$3\\pi$', '$9\\pi$'],
    0,
    'The speed is $\\sqrt{(-3\\sin t)^{2} + (3\\cos t)^{2}} = 3$, so $L = \\displaystyle\\int_{0}^{3\\pi/2} 3\\,dt = \\dfrac{9\\pi}{2}$.',
    3,
  ),
  mc(
    'pcalc-curated-004',
    'Calculus of parametric curves',
    'To revolve $x = f(t)$, $y = g(t)$ about the $x$-axis (with $g(t) \\ge 0$), the surface area integrand is:',
    [
      '$2\\pi\\,g(t)\\sqrt{f\'(t)^{2} + g\'(t)^{2}}$',
      '$2\\pi\\,f(t)\\sqrt{f\'(t)^{2} + g\'(t)^{2}}$',
      '$\\pi\\,g(t)^{2}$',
      '$2\\pi\\,g(t)$',
    ],
    0,
    'Revolving about the $x$-axis uses the radius $g(t)$ times arc length: $2\\pi\\,g(t)\\sqrt{f\'(t)^{2} + g\'(t)^{2}}$.',
    2,
  ),
  mc(
    'pcalc-curated-005',
    'Calculus of parametric curves',
    'The second derivative $\\dfrac{d^{2}y}{dx^{2}}$ for a parametric curve is found by:',
    [
      'differentiating $\\dfrac{dy}{dx}$ with respect to $t$, then dividing by $\\dfrac{dx}{dt}$',
      'differentiating $\\dfrac{dy}{dx}$ with respect to $t$ twice',
      'squaring $\\dfrac{dy}{dx}$',
      'dividing $\\dfrac{d^{2}y}{dt^{2}}$ by $\\dfrac{d^{2}x}{dt^{2}}$',
    ],
    0,
    'Since $\\dfrac{dy}{dx}$ is a function of $t$, $\\dfrac{d^{2}y}{dx^{2}} = \\dfrac{d}{dt}\\!\\left[\\dfrac{dy}{dx}\\right] \\Big/ \\dfrac{dx}{dt}$.',
    3,
  ),

  // Polar Coordinates
  mc(
    'polar-curated-001',
    'Polar coordinates',
    'In the polar point $P(r, \\theta)$, the angle $\\theta$ is measured from:',
    [
      'the positive $x$-axis (the initial ray)',
      'the positive $y$-axis',
      'the negative $x$-axis',
      'the line $y = x$',
    ],
    0,
    'Polar angles are measured counterclockwise from the initial ray, which we identify with the positive $x$-axis.',
    1,
  ),
  mc(
    'polar-curated-002',
    'Polar coordinates',
    'Convert $P\\left(2, \\dfrac{2\\pi}{3}\\right)$ to rectangular coordinates.',
    ['$(-1, \\sqrt{3})$', '$(1, \\sqrt{3})$', '$(-\\sqrt{3}, 1)$', '$(-1, -\\sqrt{3})$'],
    0,
    '$x = 2\\cos\\tfrac{2\\pi}{3} = -1$ and $y = 2\\sin\\tfrac{2\\pi}{3} = \\sqrt{3}$.',
    2,
  ),
  mc(
    'polar-curated-003',
    'Polar coordinates',
    'Which rectangular equation matches the polar equation $r = 2\\cos\\theta$?',
    ['$x^{2} + y^{2} = 2x$', '$x^{2} + y^{2} = 2y$', '$y = 2x$', '$x^{2} - y^{2} = 2$'],
    0,
    'Multiply by $r$: $r^{2} = 2r\\cos\\theta$, so $x^{2} + y^{2} = 2x$ — a circle of radius $1$ centered at $(1, 0)$.',
    3,
  ),
  mc(
    'polar-curated-004',
    'Polar coordinates',
    'Which polar point represents the same location as $P(1, \\pi)$?',
    ['$P(-1, 0)$', '$P(1, 0)$', '$P(-1, \\pi)$', '$P(1, 2\\pi)$'],
    0,
    'Going out $1$ then rotating $\\pi$ lands at the same point as going out $-1$ with no rotation: $P(-1, 0)$.',
    3,
  ),
  mc(
    'polar-curated-005',
    'Polar coordinates',
    'The polar equation $r = 1 + \\cos\\theta$ describes a:',
    ['cardioid', 'circle of radius $1$', 'line through the pole', 'three-petaled rose'],
    0,
    'A constant plus a single cosine term, $r = a(1 + \\cos\\theta)$, traces a heart-shaped cardioid.',
    1,
  ),

  // Calculus of Polar Functions
  mc(
    'polarcalc-curated-001',
    'Calculus of polar functions',
    'The area bounded by $r = f(\\theta)$ between $\\theta = \\alpha$ and $\\theta = \\beta$ is:',
    [
      '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} r^{2}\\,d\\theta$',
      '$\\displaystyle\\int_{\\alpha}^{\\beta} r\\,d\\theta$',
      '$\\pi\\displaystyle\\int_{\\alpha}^{\\beta} r^{2}\\,d\\theta$',
      '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} r\\,d\\theta$',
    ],
    0,
    'Summing thin circular sectors of area $\\tfrac{1}{2}r^{2}\\,d\\theta$ gives $A = \\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} r^{2}\\,d\\theta$.',
    1,
  ),
  mc(
    'polarcalc-curated-002',
    'Calculus of polar functions',
    'Find the area enclosed by the cardioid $r = 1 + \\cos\\theta$.',
    ['$\\dfrac{3\\pi}{2}$', '$\\pi$', '$2\\pi$', '$3\\pi$'],
    0,
    '$A = \\dfrac{1}{2}\\displaystyle\\int_{0}^{2\\pi}(1 + \\cos\\theta)^{2}\\,d\\theta = \\dfrac{1}{2}\\left(2\\pi + 0 + \\pi\\right) = \\dfrac{3\\pi}{2}$.',
    4,
  ),
  mc(
    'polarcalc-curated-003',
    'Calculus of polar functions',
    'The arc length of $r = f(\\theta)$ on $[\\alpha, \\beta]$ uses which integrand?',
    [
      '$\\sqrt{r^{2} + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}}$',
      '$\\sqrt{1 + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}}$',
      '$r^{2} + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}$',
      '$\\dfrac{1}{2}r^{2}$',
    ],
    0,
    'Converting to parametric form and simplifying gives the integrand $\\sqrt{r^{2} + (dr/d\\theta)^{2}}$.',
    2,
  ),
  mc(
    'polarcalc-curated-004',
    'Calculus of polar functions',
    'When a polar graph passes through the pole at $\\theta = \\alpha$ (so $r = 0$ there), the tangent line is:',
    ['$\\theta = \\alpha$', '$r = \\alpha$', 'horizontal', 'undefined'],
    0,
    'At the pole the slope reduces to $\\tan\\alpha$, and the line through the pole with that slope is exactly $\\theta = \\alpha$.',
    3,
  ),
  mc(
    'polarcalc-curated-005',
    'Calculus of polar functions',
    'Find the area enclosed by the circle $r = 2\\cos\\theta$.',
    ['$\\pi$', '$2\\pi$', '$4\\pi$', '$\\dfrac{\\pi}{2}$'],
    0,
    'This is a circle of radius $1$, so its area is $\\pi$. (Equivalently $\\dfrac{1}{2}\\displaystyle\\int_{-\\pi/2}^{\\pi/2} 4\\cos^{2}\\theta\\,d\\theta = \\pi$.)',
    4,
  ),
];

// Parameterized generation framework.
type GenSpec = {
  prompt: string;
  correct: string;
  distractors: string[];
  explanation: string;
  difficulty?: number;
};

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/** Reduced fraction p/q as KaTeX (no surrounding $). Integers collapse. */
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

/** TeX for t^power (power >= 0): '' for 0, 't' for 1, else 't^{power}'. */
function powerTex(power: number): string {
  if (power === 0) return '';
  if (power === 1) return 't';
  return `t^{${power}}`;
}

/** KaTeX for (p/q)·t^power with power >= 0 and q > 0 (already reduced). */
function monoTex(p: number, q: number, power: number): string {
  const tp = powerTex(power);
  if (q === 1) {
    if (power === 0) return `${p}`;
    if (p === 1) return tp;
    return `${p}${tp}`;
  }
  const num = power === 0 ? `${p}` : p === 1 ? tp : `${p}${tp}`;
  return `\\dfrac{${num}}{${q}}`;
}

function normalizeLabel(value: string): string {
  return value.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

let genPositionSeed = 0;
const topicCounters = new Map<string, number>();

function nextGenId(topicSlug: string): string {
  const n = (topicCounters.get(topicSlug) ?? 0) + 1;
  topicCounters.set(topicSlug, n);
  return `${ID_PREFIX}-${topicSlug}-gen-${String(n).padStart(3, '0')}`;
}

const PAD_DISTRACTORS = ['$0$', '$1$', '$-1$', '$2$', '$3$', '$-2$', '$4$', '$5$', '$10$'];

const generated: PracticeQuestion[] = [];

/** Build one question: correct label plus up to three unique padded distractors, correct slot rotated. */
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

function runSpecs(topicSlug: string, category: string, defaultDifficulty: number, specs: GenSpec[]): void {
  for (const s of specs)
    add(topicSlug, category, s.prompt, s.correct, s.distractors, s.explanation, s.difficulty ?? defaultDifficulty);
}

// TOPIC 1: Conic Sections
const CONICS = 'Conic sections';

// Identify an ellipse from a sum of squared terms with unequal denominators.
for (const [p, q] of [
  [9, 4],
  [16, 9],
  [25, 9],
  [4, 25],
  [16, 25],
  [36, 16],
] as Array<[number, number]>) {
  add(
    'conics',
    CONICS,
    `What conic is $\\dfrac{x^{2}}{${p}} + \\dfrac{y^{2}}{${q}} = 1$?`,
    'an ellipse',
    ['a hyperbola', 'a parabola', 'a circle'],
    'Two added squared terms equal to $1$ with unequal denominators describe an ellipse.',
    1,
  );
}

// Identify a hyperbola from a difference of squared terms.
for (const [p, q] of [
  [9, 16],
  [16, 9],
  [25, 16],
  [4, 9],
  [1, 4],
] as Array<[number, number]>) {
  add(
    'conics',
    CONICS,
    `What conic is $\\dfrac{x^{2}}{${p}} - \\dfrac{y^{2}}{${q}} = 1$?`,
    'a hyperbola',
    ['an ellipse', 'a parabola', 'a circle'],
    'A difference of squared terms equal to $1$ is a hyperbola.',
    1,
  );
}

// Identify circles and parabolas.
runSpecs('conics', CONICS, 1, [
  { prompt: 'What conic is $x^{2} + y^{2} = 16$?', correct: 'a circle', distractors: ['an ellipse', 'a hyperbola', 'a parabola'], explanation: 'Equal coefficients on $x^{2}$ and $y^{2}$ give a circle (here radius $4$).' },
  { prompt: 'What conic is $x^{2} + y^{2} = 49$?', correct: 'a circle', distractors: ['an ellipse', 'a hyperbola', 'a parabola'], explanation: 'This is a circle of radius $7$.' },
  { prompt: 'What conic is $\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{9} = 1$?', correct: 'a circle', distractors: ['an ellipse', 'a hyperbola', 'a parabola'], explanation: 'Equal denominators make it a circle of radius $3$.' },
  { prompt: 'What conic is $y^{2} = 8x$?', correct: 'a parabola', distractors: ['an ellipse', 'a hyperbola', 'a circle'], explanation: 'Only one variable is squared, so it is a parabola (opening along the $x$-axis).' },
  { prompt: 'What conic is $x^{2} = 12y$?', correct: 'a parabola', distractors: ['an ellipse', 'a hyperbola', 'a circle'], explanation: 'Only $x$ is squared, so it is a parabola opening vertically.' },
  { prompt: 'What conic is $y = \\dfrac{1}{8}x^{2}$?', correct: 'a parabola', distractors: ['an ellipse', 'a hyperbola', 'a circle'], explanation: 'A single squared variable gives a parabola.' },
  { prompt: 'What conic is $y^{2} = -4x$?', correct: 'a parabola', distractors: ['an ellipse', 'a hyperbola', 'a circle'], explanation: 'It is a parabola opening to the left.' },
]);

// Eccentricity of an ellipse:  e = c/a, c = sqrt(a^2 - b^2).
const ellipseEcc: Array<[number, number, number]> = [
  [5, 4, 3],
  [5, 3, 4],
  [13, 12, 5],
  [13, 5, 12],
  [10, 8, 6],
  [10, 6, 8],
  [17, 15, 8],
  [25, 24, 7],
];
for (const [a, b, c] of ellipseEcc) {
  add(
    'conics',
    CONICS,
    `Find the eccentricity of the ellipse $\\dfrac{x^{2}}{${a * a}} + \\dfrac{y^{2}}{${b * b}} = 1$.`,
    wrap(fracTex(c, a)),
    [wrap(fracTex(b, a)), wrap(fracTex(c, b)), wrap(fracTex(a, c))],
    `$c = \\sqrt{${a * a} - ${b * b}} = ${c}$, so $e = \\dfrac{c}{a} = ${fracTex(c, a)}$.`,
    3,
  );
}

// Eccentricity of a hyperbola:  e = c/a, c = sqrt(a^2 + b^2).
const hyperEcc: Array<[number, number, number]> = [
  [3, 4, 5],
  [4, 3, 5],
  [5, 12, 13],
  [8, 15, 17],
  [6, 8, 10],
  [9, 12, 15],
];
for (const [a, b, c] of hyperEcc) {
  add(
    'conics',
    CONICS,
    `Find the eccentricity of the hyperbola $\\dfrac{x^{2}}{${a * a}} - \\dfrac{y^{2}}{${b * b}} = 1$.`,
    wrap(fracTex(c, a)),
    [wrap(fracTex(a, c)), wrap(fracTex(b, a)), wrap(fracTex(c, b))],
    `$c = \\sqrt{${a * a} + ${b * b}} = ${c}$, so $e = \\dfrac{c}{a} = ${fracTex(c, a)} > 1$.`,
    3,
  );
}

// Eccentricity facts.
runSpecs('conics', CONICS, 1, [
  { prompt: 'The eccentricity of a circle is:', correct: '$0$', distractors: ['$1$', 'between $0$ and $1$', 'greater than $1$'], explanation: 'A circle has $e = 0$.' },
  { prompt: 'The eccentricity of a parabola is:', correct: '$1$', distractors: ['$0$', 'between $0$ and $1$', 'greater than $1$'], explanation: 'A parabola has $e = 1$.' },
  { prompt: 'The eccentricity of an ellipse that is not a circle satisfies:', correct: '$0 < e < 1$', distractors: ['$e = 0$', '$e = 1$', '$e > 1$'], explanation: 'Ellipses have $0 < e < 1$.' },
  { prompt: 'The eccentricity of a hyperbola satisfies:', correct: '$e > 1$', distractors: ['$e < 1$', '$e = 1$', '$e = 0$'], explanation: 'Hyperbolas have $e > 1$.' },
  { prompt: 'A larger eccentricity for an ellipse means the ellipse is:', correct: 'more elongated (less circular)', distractors: ['more circular', 'larger in area', 'a parabola'], explanation: 'As $e \\to 1$ the ellipse becomes increasingly stretched.' },
]);

// Foci of a parabola y^2 = Kx  (focus (K/4, 0)).
for (const k of [4, 8, 12, 16, 20]) {
  const p = k / 4;
  add(
    'conics',
    CONICS,
    `The focus of the parabola $y^{2} = ${k}x$ is at:`,
    `$(${p}, 0)$`,
    [`$(0, ${p})$`, `$(${-p}, 0)$`, `$(${p}, ${p})$`],
    `Write $y^{2} = 4px$ with $4p = ${k}$, so $p = ${p}$ and the focus is $(${p}, 0)$.`,
    2,
  );
}

// Foci of a parabola x^2 = Ky  (focus (0, K/4)).
for (const k of [4, 8, 12, 16]) {
  const p = k / 4;
  add(
    'conics',
    CONICS,
    `The focus of the parabola $x^{2} = ${k}y$ is at:`,
    `$(0, ${p})$`,
    [`$(${p}, 0)$`, `$(0, ${-p})$`, `$(${p}, ${p})$`],
    `Write $x^{2} = 4py$ with $4p = ${k}$, so $p = ${p}$ and the focus is $(0, ${p})$.`,
    2,
  );
}

// Directrix of a parabola y^2 = Kx  (directrix x = -K/4).
for (const k of [4, 8, 12, 16]) {
  const p = k / 4;
  add(
    'conics',
    CONICS,
    `The directrix of the parabola $y^{2} = ${k}x$ is the line:`,
    `$x = ${-p}$`,
    [`$x = ${p}$`, `$y = ${-p}$`, `$y = ${p}$`],
    `With $4p = ${k}$, $p = ${p}$, and the directrix of $y^{2} = 4px$ is $x = -p = ${-p}$.`,
    2,
  );
}

// Vertices of an ellipse with horizontal major axis (a > b): (+-a, 0).
for (const [a, b] of [
  [5, 3],
  [5, 4],
  [4, 3],
  [6, 4],
  [10, 6],
] as Array<[number, number]>) {
  add(
    'conics',
    CONICS,
    `The vertices of the ellipse $\\dfrac{x^{2}}{${a * a}} + \\dfrac{y^{2}}{${b * b}} = 1$ are at:`,
    `$(\\pm ${a}, 0)$`,
    [`$(0, \\pm ${a})$`, `$(\\pm ${b}, 0)$`, `$(\\pm ${a * a}, 0)$`],
    `The larger denominator $${a * a}$ is under $x^{2}$, so the major axis is horizontal with $a = ${a}$: vertices $(\\pm ${a}, 0)$.`,
    2,
  );
}

// Definitions of the conics.
runSpecs('conics', CONICS, 1, [
  { prompt: 'A parabola is the set of points equidistant from a fixed point and a fixed line, called the:', correct: 'focus and directrix', distractors: ['center and vertex', 'two foci', 'major and minor axes'], explanation: 'A parabola is defined by its focus (point) and directrix (line).' },
  { prompt: 'An ellipse is the set of points for which the sum of distances to two fixed points is constant. Those points are the:', correct: 'two foci', distractors: ['focus and directrix', 'two vertices', 'two directrices'], explanation: 'An ellipse has two foci with a constant distance sum.' },
  { prompt: 'A hyperbola is the set of points for which the difference of distances to two fixed points is constant. Those points are the:', correct: 'two foci', distractors: ['focus and directrix', 'two vertices', 'two centers'], explanation: 'A hyperbola has two foci with a constant distance difference.' },
  { prompt: 'For an ellipse, the foci and the value $c$ satisfy:', correct: '$c^{2} = a^{2} - b^{2}$', distractors: ['$c^{2} = a^{2} + b^{2}$', '$c = a + b$', '$c = a - b$'], explanation: 'The foci of an ellipse lie $c$ units from the center with $c^{2} = a^{2} - b^{2}$.' },
  { prompt: 'For a hyperbola, the foci and the value $c$ satisfy:', correct: '$c^{2} = a^{2} + b^{2}$', distractors: ['$c^{2} = a^{2} - b^{2}$', '$c = a + b$', '$c = b - a$'], explanation: 'The foci of a hyperbola lie $c$ units from the center with $c^{2} = a^{2} + b^{2}$.' },
  { prompt: 'The asymptotes of $\\dfrac{x^{2}}{a^{2}} - \\dfrac{y^{2}}{b^{2}} = 1$ are:', correct: '$y = \\pm\\dfrac{b}{a}x$', distractors: ['$y = \\pm\\dfrac{a}{b}x$', '$y = \\pm x$', '$y = \\pm ab\\,x$'], explanation: 'This hyperbola has asymptotes $y = \\pm\\dfrac{b}{a}x$.' },
]);

// TOPIC 2: Parametric Equations
const PARAM = 'Parametric equations';

// Plot a point at a given t for several families.
const ptFamilies: Array<{ xt: (t: number) => number; yt: (t: number) => number; xtex: string; ytex: string; ts: number[]; diff: number }> = [
  { xt: (t) => t * t, yt: (t) => 2 * t, xtex: 't^{2}', ytex: '2t', ts: [1, 2, 3, 4], diff: 2 },
  { xt: (t) => t, yt: (t) => t * t - 1, xtex: 't', ytex: 't^{2} - 1', ts: [2, 3, 4], diff: 2 },
  { xt: (t) => 2 * t - 1, yt: (t) => 3 * t, xtex: '2t - 1', ytex: '3t', ts: [1, 2, 3], diff: 1 },
  { xt: (t) => t * t * t, yt: (t) => t * t, xtex: 't^{3}', ytex: 't^{2}', ts: [1, 2, 3], diff: 2 },
  { xt: (t) => t + 1, yt: (t) => t * t, xtex: 't + 1', ytex: 't^{2}', ts: [1, 2, 3], diff: 2 },
  { xt: (t) => 2 * t, yt: (t) => t * t, xtex: '2t', ytex: 't^{2}', ts: [1, 2, 3], diff: 2 },
  { xt: (t) => t, yt: (t) => 2 * t + 1, xtex: 't', ytex: '2t + 1', ts: [1, 2, 3], diff: 1 },
];
for (const fam of ptFamilies) {
  for (const t of fam.ts) {
    const x = fam.xt(t);
    const y = fam.yt(t);
    add(
      'param',
      PARAM,
      `For $x = ${fam.xtex}$, $y = ${fam.ytex}$, find the point at $t = ${t}$.`,
      `$(${x}, ${y})$`,
      [`$(${y}, ${x})$`, `$(${-x}, ${y})$`, `$(${x}, ${y + 1})$`, `$(${x + 1}, ${y})$`],
      `Substitute $t = ${t}$: $x = ${x}$ and $y = ${y}$, giving $(${x}, ${y})$.`,
      fam.diff,
    );
  }
}

// Plot a point on the unit circle at standard angles.
runSpecs('param', PARAM, 2, [
  { prompt: 'For $x = \\cos t$, $y = \\sin t$, find the point at $t = 0$.', correct: '$(1, 0)$', distractors: ['$(0, 1)$', '$(-1, 0)$', '$(0, 0)$'], explanation: '$\\cos 0 = 1$, $\\sin 0 = 0$.' },
  { prompt: 'For $x = \\cos t$, $y = \\sin t$, find the point at $t = \\dfrac{\\pi}{2}$.', correct: '$(0, 1)$', distractors: ['$(1, 0)$', '$(0, -1)$', '$(-1, 0)$'], explanation: '$\\cos\\tfrac{\\pi}{2} = 0$, $\\sin\\tfrac{\\pi}{2} = 1$.' },
  { prompt: 'For $x = \\cos t$, $y = \\sin t$, find the point at $t = \\pi$.', correct: '$(-1, 0)$', distractors: ['$(1, 0)$', '$(0, 1)$', '$(0, -1)$'], explanation: '$\\cos\\pi = -1$, $\\sin\\pi = 0$.' },
  { prompt: 'For $x = \\cos t$, $y = \\sin t$, find the point at $t = \\dfrac{3\\pi}{2}$.', correct: '$(0, -1)$', distractors: ['$(0, 1)$', '$(-1, 0)$', '$(1, 0)$'], explanation: '$\\cos\\tfrac{3\\pi}{2} = 0$, $\\sin\\tfrac{3\\pi}{2} = -1$.' },
  { prompt: 'For $x = 2\\cos t$, $y = 2\\sin t$, find the point at $t = \\dfrac{\\pi}{2}$.', correct: '$(0, 2)$', distractors: ['$(2, 0)$', '$(0, -2)$', '$(-2, 0)$'], explanation: '$x = 2\\cos\\tfrac{\\pi}{2} = 0$, $y = 2\\sin\\tfrac{\\pi}{2} = 2$.' },
]);

// Eliminate the parameter.
runSpecs('param', PARAM, 2, [
  { prompt: 'Eliminate the parameter: $x = t$, $y = t^{2}$.', correct: '$y = x^{2}$', distractors: ['$y = x$', '$x = y^{2}$', '$y = 2x$'], explanation: 'Since $x = t$, $y = x^{2}$.' },
  { difficulty: 3, prompt: 'Eliminate the parameter: $x = t^{2}$, $y = 2t$.', correct: '$x = \\dfrac{y^{2}}{4}$', distractors: ['$y = \\dfrac{x^{2}}{4}$', '$y = 2x$', '$x^{2} + y^{2} = 1$'], explanation: 'From $y = 2t$, $t = \\tfrac{y}{2}$, so $x = t^{2} = \\dfrac{y^{2}}{4}$.' },
  { prompt: 'Eliminate the parameter: $x = 2t$, $y = t + 1$.', correct: '$y = \\dfrac{x}{2} + 1$', distractors: ['$y = 2x + 1$', '$y = x + 1$', '$y = \\dfrac{x}{2}$'], explanation: 'From $x = 2t$, $t = \\tfrac{x}{2}$, so $y = \\tfrac{x}{2} + 1$.' },
  { prompt: 'Eliminate the parameter: $x = t - 1$, $y = 2t + 1$.', correct: '$y = 2x + 3$', distractors: ['$y = 2x - 1$', '$y = 2x + 1$', '$y = x + 2$'], explanation: 'From $t = x + 1$, $y = 2(x + 1) + 1 = 2x + 3$.' },
  { prompt: 'Eliminate the parameter: $x = \\cos t$, $y = \\sin t$.', correct: '$x^{2} + y^{2} = 1$', distractors: ['$y = x^{2}$', '$x^{2} - y^{2} = 1$', '$y = x$'], explanation: '$\\cos^{2} t + \\sin^{2} t = 1$.' },
  { prompt: 'Eliminate the parameter: $x = 3\\cos t$, $y = 3\\sin t$.', correct: '$x^{2} + y^{2} = 9$', distractors: ['$x^{2} + y^{2} = 1$', '$x^{2} + y^{2} = 3$', '$\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{3} = 1$'], explanation: 'Here $r = 3$, so $x^{2} + y^{2} = 9$.' },
  { prompt: 'Eliminate the parameter: $x = t$, $y = \\dfrac{1}{t}$.', correct: '$y = \\dfrac{1}{x}$', distractors: ['$y = x$', '$y = x^{2}$', '$xy = 0$'], explanation: 'Since $x = t$, $y = \\tfrac{1}{t} = \\tfrac{1}{x}$.' },
  { difficulty: 3, prompt: 'Eliminate the parameter: $x = e^{t}$, $y = e^{2t}$.', correct: '$y = x^{2}$', distractors: ['$y = x$', '$y = 2x$', '$y = \\ln x$'], explanation: '$y = e^{2t} = (e^{t})^{2} = x^{2}$ (with $x > 0$).' },
  { difficulty: 3, prompt: 'Eliminate the parameter: $x = 2\\cos t$, $y = 3\\sin t$.', correct: '$\\dfrac{x^{2}}{4} + \\dfrac{y^{2}}{9} = 1$', distractors: ['$x^{2} + y^{2} = 1$', '$\\dfrac{x^{2}}{2} + \\dfrac{y^{2}}{3} = 1$', '$\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{4} = 1$'], explanation: '$\\cos t = \\tfrac{x}{2}$, $\\sin t = \\tfrac{y}{3}$, and $\\cos^{2} t + \\sin^{2} t = 1$.' },
  { prompt: 'Eliminate the parameter: $x = t^{2}$, $y = t^{4}$.', correct: '$y = x^{2}$', distractors: ['$y = x$', '$y = x^{4}$', '$y = \\sqrt{x}$'], explanation: '$y = t^{4} = (t^{2})^{2} = x^{2}$ (with $x \\ge 0$).' },
  { prompt: 'Eliminate the parameter: $x = \\sin t$, $y = \\cos t$.', correct: '$x^{2} + y^{2} = 1$', distractors: ['$y = x^{2}$', '$x^{2} - y^{2} = 1$', '$y = 1 - x$'], explanation: '$\\sin^{2} t + \\cos^{2} t = 1$.' },
  { difficulty: 3, prompt: 'Eliminate the parameter: $x = 3t$, $y = 9t^{2}$.', correct: '$y = x^{2}$', distractors: ['$y = 3x^{2}$', '$y = 9x^{2}$', '$y = 3x$'], explanation: 'From $t = \\tfrac{x}{3}$, $y = 9t^{2} = 9\\cdot\\tfrac{x^{2}}{9} = x^{2}$.' },
]);

// Identify the curve from a parametrization.
runSpecs('param', PARAM, 2, [
  { prompt: 'What curve is $x = \\cos t$, $y = \\sin t$?', correct: 'a circle', distractors: ['a line', 'a parabola', 'a hyperbola'], explanation: 'It satisfies $x^{2} + y^{2} = 1$.' },
  { difficulty: 3, prompt: 'What curve is $x = 2\\cos t$, $y = 3\\sin t$?', correct: 'an ellipse', distractors: ['a circle', 'a parabola', 'a hyperbola'], explanation: 'It satisfies $\\dfrac{x^{2}}{4} + \\dfrac{y^{2}}{9} = 1$.' },
  { prompt: 'What curve is $x = t$, $y = 3t - 2$?', correct: 'a line', distractors: ['a parabola', 'a circle', 'an ellipse'], explanation: 'Eliminating $t$ gives $y = 3x - 2$, a line.' },
  { difficulty: 3, prompt: 'What curve is $x = \\sec t$, $y = \\tan t$?', correct: 'a hyperbola', distractors: ['an ellipse', 'a circle', 'a parabola'], explanation: 'Since $\\sec^{2} t - \\tan^{2} t = 1$, it satisfies $x^{2} - y^{2} = 1$.' },
  { prompt: 'What curve is $x = t$, $y = t^{2}$?', correct: 'a parabola', distractors: ['a line', 'a circle', 'a hyperbola'], explanation: 'It is $y = x^{2}$.' },
  { prompt: 'What curve is $x = 4\\cos t$, $y = 4\\sin t$?', correct: 'a circle', distractors: ['an ellipse', 'a parabola', 'a line'], explanation: 'It satisfies $x^{2} + y^{2} = 16$, a circle of radius $4$.' },
]);

// Orientation and concept.
runSpecs('param', PARAM, 2, [
  { difficulty: 1, prompt: 'Compared with a single equation $y = f(x)$, a parametrization also records:', correct: 'the direction and timing of motion', distractors: ['the area under the curve', 'only the slope', 'nothing extra'], explanation: 'A parametrization tracks how the point moves, including orientation and speed.' },
  { prompt: 'As $t$ increases, $x = \\cos t$, $y = \\sin t$ traces the unit circle:', correct: 'counterclockwise', distractors: ['clockwise', 'back and forth', 'not at all'], explanation: 'Starting at $(1, 0)$ and moving toward $(0, 1)$ is counterclockwise.' },
  { prompt: 'As $t$ increases, $x = \\cos t$, $y = -\\sin t$ traces the unit circle:', correct: 'clockwise', distractors: ['counterclockwise', 'back and forth', 'not at all'], explanation: 'The negative sine reverses the orientation to clockwise.' },
  { prompt: 'A parametric curve can fail the vertical line test because it may:', correct: 'revisit the same $x$-value at different times', distractors: ['have no points', 'always be a straight line', 'have constant speed'], explanation: 'Parametric curves can loop or backtrack, hitting one $x$ at several points.' },
  { difficulty: 1, prompt: 'The parameter $t$ in $x = f(t)$, $y = g(t)$ is often interpreted as:', correct: 'time', distractors: ['area', 'slope', 'curvature'], explanation: 'It is common to read $t$ as time, so the curve is the path of a moving point.' },
]);

// TOPIC 3: Calculus of parametric curves
const PCALC = 'Calculus of parametric curves';

// dy/dx in terms of t for x = t^a, y = t^b  (a >= 2, b > a): dy/dx = (b/a) t^{b-a}.
const slopePairs: Array<[number, number]> = [
  [2, 3],
  [2, 4],
  [2, 5],
  [2, 6],
  [3, 4],
  [3, 5],
  [3, 6],
  [2, 8],
];
for (const [a, b] of slopePairs) {
  const g = gcd(b, a);
  const p = b / g;
  const q = a / g;
  const power = b - a;
  add(
    'pcalc',
    PCALC,
    `For $x = t^{${a}}$, $y = t^{${b}}$, find $\\dfrac{dy}{dx}$ in terms of $t$.`,
    wrap(monoTex(p, q, power)),
    [wrap(monoTex(b, 1, b - 1)), wrap(monoTex(a, 1, a - 1)), wrap(monoTex(p, q, power + 1))],
    `$\\dfrac{dy}{dx} = \\dfrac{${b}t^{${b - 1}}}{${a}t^{${a - 1}}} = ${monoTex(p, q, power)}$.`,
    3,
  );
}

// dy/dx evaluated at a specific t (chosen so the value is a whole number).
const slopeValueCases: Array<[number, number, number, number]> = [
  [2, 3, 4, 6],
  [2, 3, 2, 3],
  [2, 3, 6, 9],
  [2, 3, 8, 12],
  [1, 2, 3, 6],
  [1, 2, 5, 10],
  [1, 2, 7, 14],
  [2, 4, 1, 2],
  [2, 4, 2, 8],
  [2, 4, 3, 18],
  [1, 3, 2, 12],
  [1, 3, 3, 27],
];
for (const [a, b, t0, value] of slopeValueCases) {
  add(
    'pcalc',
    PCALC,
    `For $x = t^{${a}}$, $y = t^{${b}}$, find $\\dfrac{dy}{dx}$ at $t = ${t0}$.`,
    `$${value}$`,
    [`$${value + 1}$`, `$${value - 1}$`, `$${2 * value}$`, `$${value + 2}$`],
    `Differentiate and divide: $\\dfrac{dy}{dx} = \\dfrac{${b}t^{${b - 1}}}{${a}t^{${a - 1}}}$. At $t = ${t0}$ this equals $${value}$.`,
    a === 1 ? 2 : 3,
  );
}

// dy/dx for a line x = a t, y = c t:  dy/dx = c/a (constant).
const lineSlopePairs: Array<[number, number]> = [
  [2, 3],
  [2, 1],
  [3, 1],
  [3, 2],
  [2, 5],
  [3, 4],
];
for (const [a, c] of lineSlopePairs) {
  add(
    'pcalc',
    PCALC,
    `For $x = ${a}t$, $y = ${c}t$, find $\\dfrac{dy}{dx}$.`,
    wrap(fracTex(c, a)),
    [wrap(fracTex(a, c)), `$${c}$`, `$${a}$`],
    `$\\dfrac{dy}{dx} = \\dfrac{dy/dt}{dx/dt} = \\dfrac{${c}}{${a}} = ${fracTex(c, a)}$ (a constant slope).`,
    2,
  );
}

// Arc length of a circle x = R cos t, y = R sin t  (speed R, so L = R * Delta-theta).
runSpecs('pcalc', PCALC, 3, [
  { prompt: 'Find the arc length of $x = \\cos t$, $y = \\sin t$ on $[0, 2\\pi]$.', correct: '$2\\pi$', distractors: ['$\\pi$', '$4\\pi$', '$1$'], explanation: 'Speed $= \\sqrt{\\sin^{2}t + \\cos^{2}t} = 1$, so $L = \\displaystyle\\int_{0}^{2\\pi} 1\\,dt = 2\\pi$.' },
  { prompt: 'Find the arc length of $x = 2\\cos t$, $y = 2\\sin t$ on $[0, 2\\pi]$.', correct: '$4\\pi$', distractors: ['$2\\pi$', '$8\\pi$', '$\\pi$'], explanation: 'Speed $= 2$, so $L = \\displaystyle\\int_{0}^{2\\pi} 2\\,dt = 4\\pi$.' },
  { prompt: 'Find the arc length of $x = 3\\cos t$, $y = 3\\sin t$ on $[0, 2\\pi]$.', correct: '$6\\pi$', distractors: ['$3\\pi$', '$9\\pi$', '$12\\pi$'], explanation: 'Speed $= 3$, so $L = \\displaystyle\\int_{0}^{2\\pi} 3\\,dt = 6\\pi$.' },
  { prompt: 'Find the arc length of $x = 2\\cos t$, $y = 2\\sin t$ on $[0, \\pi]$.', correct: '$2\\pi$', distractors: ['$\\pi$', '$4\\pi$', '$\\dfrac{\\pi}{2}$'], explanation: 'Speed $= 2$ over an interval of length $\\pi$ gives $L = 2\\pi$.' },
  { prompt: 'Find the arc length of $x = 4\\cos t$, $y = 4\\sin t$ on $[0, \\tfrac{\\pi}{2}]$.', correct: '$2\\pi$', distractors: ['$4\\pi$', '$\\pi$', '$8\\pi$'], explanation: 'Speed $= 4$ over an interval of length $\\tfrac{\\pi}{2}$ gives $L = 4 \\cdot \\tfrac{\\pi}{2} = 2\\pi$.' },
  { prompt: 'Find the arc length of $x = 5\\cos t$, $y = 5\\sin t$ on $[0, \\tfrac{\\pi}{2}]$.', correct: '$\\dfrac{5\\pi}{2}$', distractors: ['$5\\pi$', '$\\dfrac{5\\pi}{4}$', '$\\dfrac{\\pi}{2}$'], explanation: 'Speed $= 5$ over an interval of length $\\tfrac{\\pi}{2}$ gives $L = \\dfrac{5\\pi}{2}$.' },
  { prompt: 'Find the arc length of $x = 3\\cos t$, $y = 3\\sin t$ on $[0, \\pi]$.', correct: '$3\\pi$', distractors: ['$6\\pi$', '$\\dfrac{3\\pi}{2}$', '$9\\pi$'], explanation: 'Speed $= 3$ over an interval of length $\\pi$ gives $L = 3\\pi$.' },
]);

// Arc length of a line x = a t + b, y = c t + d  (speed sqrt(a^2 + c^2)).
runSpecs('pcalc', PCALC, 3, [
  { prompt: 'Find the arc length of $x = 3t$, $y = 4t$ on $[0, 1]$.', correct: '$5$', distractors: ['$7$', '$\\sqrt{7}$', '$25$'], explanation: 'Speed $= \\sqrt{3^{2} + 4^{2}} = 5$, so $L = 5(1 - 0) = 5$.' },
  { prompt: 'Find the arc length of $x = 3t$, $y = 4t$ on $[0, 2]$.', correct: '$10$', distractors: ['$5$', '$14$', '$20$'], explanation: 'Speed $= 5$ over an interval of length $2$ gives $L = 10$.' },
  { prompt: 'Find the arc length of $x = 6t$, $y = 8t$ on $[0, 1]$.', correct: '$10$', distractors: ['$14$', '$\\sqrt{14}$', '$100$'], explanation: 'Speed $= \\sqrt{36 + 64} = 10$, so $L = 10$.' },
  { prompt: 'Find the arc length of $x = 5t + 1$, $y = 12t - 2$ on $[0, 1]$.', correct: '$13$', distractors: ['$17$', '$7$', '$169$'], explanation: 'Speed $= \\sqrt{5^{2} + 12^{2}} = 13$, so $L = 13$.' },
  { prompt: 'Find the arc length of $x = 8t$, $y = 15t$ on $[0, 1]$.', correct: '$17$', distractors: ['$23$', '$\\sqrt{23}$', '$289$'], explanation: 'Speed $= \\sqrt{64 + 225} = 17$, so $L = 17$.' },
]);

// Speed at a point.
runSpecs('pcalc', PCALC, 2, [
  { prompt: 'For $x = 3t$, $y = 4t$, the speed $\\sqrt{(dx/dt)^{2} + (dy/dt)^{2}}$ is:', correct: '$5$', distractors: ['$7$', '$12$', '$\\sqrt{7}$'], explanation: '$\\sqrt{3^{2} + 4^{2}} = 5$.' },
  { prompt: 'For $x = t$, $y = t$, the speed is:', correct: '$\\sqrt{2}$', distractors: ['$2$', '$1$', '$\\sqrt{3}$'], explanation: '$\\sqrt{1^{2} + 1^{2}} = \\sqrt{2}$.' },
  { prompt: 'For $x = 2t$, $y = 0$, the speed is:', correct: '$2$', distractors: ['$0$', '$4$', '$\\sqrt{2}$'], explanation: '$\\sqrt{2^{2} + 0^{2}} = 2$.' },
  { prompt: 'For $x = \\cos t$, $y = \\sin t$, the speed is:', correct: '$1$', distractors: ['$0$', '$2$', '$\\pi$'], explanation: '$\\sqrt{(-\\sin t)^{2} + (\\cos t)^{2}} = 1$.' },
]);

// Concept: slope, tangents, formulas.
runSpecs('pcalc', PCALC, 2, [
  { prompt: 'For a parametric curve, the slope $\\dfrac{dy}{dx}$ is generally:', correct: 'a function of the parameter $t$', distractors: ['always a constant', 'a function of the area', 'undefined'], explanation: 'Like the points themselves, the slope is expressed in terms of $t$.' },
  { difficulty: 3, prompt: 'A smooth parametric curve has a horizontal tangent where:', correct: '$\\dfrac{dy}{dt} = 0$ and $\\dfrac{dx}{dt} \\ne 0$', distractors: ['$\\dfrac{dx}{dt} = 0$', 'both derivatives are $0$', '$\\dfrac{dx}{dt} = \\dfrac{dy}{dt}$'], explanation: 'The slope $\\dfrac{dy/dt}{dx/dt}$ is zero when its numerator is zero (denominator nonzero).' },
  { difficulty: 3, prompt: 'A smooth parametric curve has a vertical tangent where:', correct: '$\\dfrac{dx}{dt} = 0$ and $\\dfrac{dy}{dt} \\ne 0$', distractors: ['$\\dfrac{dy}{dt} = 0$', 'both derivatives are $0$', '$\\dfrac{dy}{dx} = 0$'], explanation: 'The slope is undefined when the denominator $\\dfrac{dx}{dt} = 0$ while $\\dfrac{dy}{dt} \\ne 0$.' },
  { difficulty: 1, prompt: 'The arc length integrand for $x = f(t)$, $y = g(t)$ is:', correct: '$\\sqrt{f\'(t)^{2} + g\'(t)^{2}}$', distractors: ['$f\'(t) + g\'(t)$', '$f\'(t)\\,g\'(t)$', '$\\sqrt{1 + (dy/dx)^{2}}$ in $t$'], explanation: 'Arc length integrates the speed $\\sqrt{f\'(t)^{2} + g\'(t)^{2}}$ over $t$.' },
  { difficulty: 1, prompt: 'The slope $\\dfrac{dy}{dx}$ for parametric equations is computed as:', correct: '$\\dfrac{dy/dt}{dx/dt}$', distractors: ['$\\dfrac{dx/dt}{dy/dt}$', '$\\dfrac{dy}{dt}\\cdot\\dfrac{dx}{dt}$', '$\\dfrac{d^{2}y}{dt^{2}}$'], explanation: 'By the chain rule, $\\dfrac{dy}{dx} = \\dfrac{dy/dt}{dx/dt}$.' },
  { prompt: 'To revolve a parametric curve about the $x$-axis, the surface-area radius factor is:', correct: '$g(t)$ (the $y$-coordinate)', distractors: ['$f(t)$ (the $x$-coordinate)', '$t$', '$f\'(t)$'], explanation: 'Distance to the $x$-axis is $y = g(t)$, so the integrand is $2\\pi g(t)\\sqrt{f\'^{2} + g\'^{2}}$.' },
]);

// TOPIC 4: Polar Coordinates
const POLAR = 'Polar coordinates';

// Polar -> rectangular at quadrantal angles (integer coordinates).
const quadAngles: Array<{ tex: string; pt: (r: number) => [number, number] }> = [
  { tex: '0', pt: (r) => [r, 0] },
  { tex: '\\dfrac{\\pi}{2}', pt: (r) => [0, r] },
  { tex: '\\pi', pt: (r) => [-r, 0] },
  { tex: '\\dfrac{3\\pi}{2}', pt: (r) => [0, -r] },
];
for (const r of [2, 3, 5]) {
  for (const ang of quadAngles) {
    const [x, y] = ang.pt(r);
    add(
      'polar',
      POLAR,
      `Convert the polar point $P\\left(${r}, ${ang.tex}\\right)$ to rectangular coordinates.`,
      `$(${x}, ${y})$`,
      [`$(${y}, ${x})$`, `$(${-x}, ${-y})$`, `$(${y}, ${-x})$`],
      `$x = ${r}\\cos\\theta$ and $y = ${r}\\sin\\theta$ give $(${x}, ${y})$.`,
      2,
    );
  }
}

// Polar -> rectangular with radical coordinates.
runSpecs('polar', POLAR, 2, [
  { prompt: 'Convert the polar point $P\\left(2, \\dfrac{\\pi}{4}\\right)$ to rectangular coordinates.', correct: '$(\\sqrt{2}, \\sqrt{2})$', distractors: ['$(1, \\sqrt{3})$', '$(\\sqrt{3}, 1)$', '$(2, 2)$'], explanation: '$x = 2\\cos\\tfrac{\\pi}{4} = \\sqrt{2}$ and $y = 2\\sin\\tfrac{\\pi}{4} = \\sqrt{2}$.' },
  { prompt: 'Convert the polar point $P\\left(2, \\dfrac{\\pi}{3}\\right)$ to rectangular coordinates.', correct: '$(1, \\sqrt{3})$', distractors: ['$(\\sqrt{3}, 1)$', '$(\\sqrt{2}, \\sqrt{2})$', '$(2, 0)$'], explanation: '$x = 2\\cos\\tfrac{\\pi}{3} = 1$ and $y = 2\\sin\\tfrac{\\pi}{3} = \\sqrt{3}$.' },
  { prompt: 'Convert the polar point $P\\left(2, \\dfrac{\\pi}{6}\\right)$ to rectangular coordinates.', correct: '$(\\sqrt{3}, 1)$', distractors: ['$(1, \\sqrt{3})$', '$(\\sqrt{2}, \\sqrt{2})$', '$(0, 2)$'], explanation: '$x = 2\\cos\\tfrac{\\pi}{6} = \\sqrt{3}$ and $y = 2\\sin\\tfrac{\\pi}{6} = 1$.' },
  { difficulty: 3, prompt: 'Convert the polar point $P\\left(4, \\dfrac{\\pi}{3}\\right)$ to rectangular coordinates.', correct: '$(2, 2\\sqrt{3})$', distractors: ['$(2\\sqrt{3}, 2)$', '$(2, 2)$', '$(4, 0)$'], explanation: '$x = 4\\cos\\tfrac{\\pi}{3} = 2$ and $y = 4\\sin\\tfrac{\\pi}{3} = 2\\sqrt{3}$.' },
]);

// Rectangular -> polar radius r = sqrt(x^2 + y^2).
const rectToR: Array<[number, number, number]> = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [9, 12, 15],
  [-3, 4, 5],
  [-6, -8, 10],
  [0, 5, 5],
  [20, 21, 29],
];
for (const [x, y, r] of rectToR) {
  add(
    'polar',
    POLAR,
    `Find $r$ for the rectangular point $(${x}, ${y})$.`,
    `$${r}$`,
    [`$${Math.abs(x) + Math.abs(y)}$`, `$${r * r}$`, `$${r + 1}$`],
    `$r = \\sqrt{(${x})^{2} + (${y})^{2}} = \\sqrt{${x * x + y * y}} = ${r}$.`,
    2,
  );
}

// Rectangular -> polar angle for standard points.
runSpecs('polar', POLAR, 2, [
  { prompt: 'A standard polar angle $\\theta$ for the point $(1, 1)$ is:', correct: '$\\dfrac{\\pi}{4}$', distractors: ['$\\dfrac{\\pi}{2}$', '$\\dfrac{3\\pi}{4}$', '$0$'], explanation: '$\\tan\\theta = \\tfrac{1}{1} = 1$ in the first quadrant gives $\\theta = \\tfrac{\\pi}{4}$.' },
  { prompt: 'A standard polar angle $\\theta$ for the point $(-1, 1)$ is:', correct: '$\\dfrac{3\\pi}{4}$', distractors: ['$\\dfrac{\\pi}{4}$', '$-\\dfrac{\\pi}{4}$', '$\\dfrac{5\\pi}{4}$'], explanation: 'The point is in the second quadrant, so $\\theta = \\pi - \\tfrac{\\pi}{4} = \\tfrac{3\\pi}{4}$.' },
  { prompt: 'A standard polar angle $\\theta$ for the point $(0, 2)$ is:', correct: '$\\dfrac{\\pi}{2}$', distractors: ['$0$', '$\\pi$', '$\\dfrac{3\\pi}{2}$'], explanation: 'The point lies on the positive $y$-axis, so $\\theta = \\tfrac{\\pi}{2}$.' },
  { prompt: 'A standard polar angle $\\theta$ for the point $(-3, 0)$ is:', correct: '$\\pi$', distractors: ['$0$', '$\\dfrac{\\pi}{2}$', '$\\dfrac{3\\pi}{2}$'], explanation: 'The point lies on the negative $x$-axis, so $\\theta = \\pi$.' },
  { prompt: 'A standard polar angle $\\theta$ for the point $(0, -2)$ is:', correct: '$\\dfrac{3\\pi}{2}$', distractors: ['$\\dfrac{\\pi}{2}$', '$\\pi$', '$0$'], explanation: 'The point lies on the negative $y$-axis, so $\\theta = \\tfrac{3\\pi}{2}$.' },
  { prompt: 'A standard polar angle $\\theta$ for the point $(2, 0)$ is:', correct: '$0$', distractors: ['$\\dfrac{\\pi}{2}$', '$\\pi$', '$\\dfrac{\\pi}{4}$'], explanation: 'The point lies on the positive $x$-axis, so $\\theta = 0$.' },
]);

// Identify the polar curve.
runSpecs('polar', POLAR, 3, [
  { difficulty: 1, prompt: 'The polar equation $r = 4$ describes a:', correct: 'circle of radius $4$ centered at the pole', distractors: ['line through the pole', 'cardioid', 'rose'], explanation: 'All points $4$ units from the pole form a circle of radius $4$.' },
  { difficulty: 1, prompt: 'The polar equation $\\theta = \\dfrac{\\pi}{3}$ describes a:', correct: 'line through the pole', distractors: ['circle', 'cardioid', 'spiral'], explanation: 'A fixed angle with $r$ free is a line through the pole.' },
  { prompt: 'The polar equation $r = 1 + \\cos\\theta$ describes a:', correct: 'cardioid', distractors: ['circle', 'line', 'rose'], explanation: 'A constant plus one cosine term gives a heart-shaped cardioid.' },
  { prompt: 'The polar equation $r = \\cos(3\\theta)$ describes a:', correct: 'rose curve', distractors: ['circle', 'cardioid', 'line'], explanation: 'An equation $r = \\cos(n\\theta)$ traces a rose; with $n = 3$ it has three petals.' },
  { prompt: 'The polar equation $r = 2 + 3\\cos\\theta$ describes a:', correct: 'limaçon', distractors: ['circle', 'parabola', 'rose'], explanation: 'A form $r = a + b\\cos\\theta$ is a limaçon (here with an inner loop since $b > a$).' },
  { prompt: 'The polar equation $r = 2\\theta$ describes a:', correct: 'spiral', distractors: ['circle', 'cardioid', 'rose'], explanation: 'When $r$ grows linearly with $\\theta$ the curve spirals outward (an Archimedean spiral).' },
  { prompt: 'The polar equation $r = 3\\sin\\theta$ describes a:', correct: 'circle', distractors: ['cardioid', 'line', 'rose'], explanation: 'It rewrites as $x^{2} + y^{2} = 3y$, a circle through the pole.' },
  { prompt: 'The polar equation $r = \\cos(2\\theta)$ describes a:', correct: 'four-petaled rose', distractors: ['cardioid', 'circle', 'line'], explanation: 'For $r = \\cos(n\\theta)$ with even $n$, the rose has $2n$ petals; $n = 2$ gives four.' },
]);

// Convert between polar and rectangular equations.
runSpecs('polar', POLAR, 2, [
  { prompt: 'Which rectangular equation matches $r = 5$?', correct: '$x^{2} + y^{2} = 25$', distractors: ['$x + y = 5$', '$x^{2} + y^{2} = 5$', '$y = 5$'], explanation: 'Square both sides: $r^{2} = 25$, and $r^{2} = x^{2} + y^{2}$.' },
  { prompt: 'Which rectangular equation matches $\\theta = \\dfrac{\\pi}{4}$?', correct: '$y = x$', distractors: ['$y = -x$', '$x = 1$', '$y = 1$'], explanation: '$\\tan\\tfrac{\\pi}{4} = 1 = \\tfrac{y}{x}$, so $y = x$.' },
  { difficulty: 3, prompt: 'Which rectangular equation matches $r = 4\\sin\\theta$?', correct: '$x^{2} + y^{2} = 4y$', distractors: ['$x^{2} + y^{2} = 4x$', '$y = 4x$', '$x^{2} - y^{2} = 4$'], explanation: 'Multiply by $r$: $r^{2} = 4r\\sin\\theta$, so $x^{2} + y^{2} = 4y$.' },
  { prompt: 'Which polar equation matches the circle $x^{2} + y^{2} = 9$?', correct: '$r = 3$', distractors: ['$r = 9$', '$r = \\sqrt{3}$', '$\\theta = 3$'], explanation: 'Since $r^{2} = x^{2} + y^{2} = 9$, we get $r = 3$.' },
  { difficulty: 3, prompt: 'Which polar equation matches the vertical line $x = 2$?', correct: '$r = \\dfrac{2}{\\cos\\theta}$', distractors: ['$r = 2$', '$\\theta = 2$', '$r = 2\\sin\\theta$'], explanation: 'Replace $x = r\\cos\\theta = 2$, so $r = \\dfrac{2}{\\cos\\theta} = 2\\sec\\theta$.' },
  { difficulty: 1, prompt: 'Which rectangular expression equals $r\\cos\\theta$?', correct: '$x$', distractors: ['$y$', '$r$', '$x^{2} + y^{2}$'], explanation: 'By definition $x = r\\cos\\theta$.' },
]);

// Multiple representations and basic facts.
runSpecs('polar', POLAR, 2, [
  { prompt: 'How many polar coordinate pairs represent a single point in the plane?', correct: 'infinitely many', distractors: ['exactly one', 'exactly two', 'exactly four'], explanation: 'Adding multiples of $2\\pi$ to $\\theta$ (or negating $r$ and shifting $\\theta$ by $\\pi$) names the same point.' },
  { prompt: 'The pole (origin) corresponds to which value of $r$?', correct: '$r = 0$', distractors: ['$r = 1$', '$r = \\pi$', 'any nonzero $r$'], explanation: 'The pole is the unique point with $r = 0$, for every angle $\\theta$.' },
  { prompt: 'The points $P(r, \\theta)$ and $P(-r, \\theta + \\pi)$ are:', correct: 'the same point', distractors: ['reflections across the $x$-axis', 'always different', 'reflections across the $y$-axis'], explanation: 'A negative radius points in the opposite direction, which the extra $\\pi$ undoes.' },
  { prompt: 'Replacing $\\theta$ with $\\theta + 2\\pi$ in $P(r, \\theta)$ gives:', correct: 'the same point', distractors: ['the reflection through the pole', 'a point twice as far out', 'the pole'], explanation: 'A full turn returns to the same direction, so the location is unchanged.' },
  { prompt: 'In the conversion $\\tan\\theta = \\dfrac{y}{x}$, you must also check the:', correct: 'quadrant of the point', distractors: ['radius sign only', 'value of $\\pi$', 'units of $\\theta$'], explanation: 'Inverse tangent returns angles in $(-\\tfrac{\\pi}{2}, \\tfrac{\\pi}{2})$, so adjust by the quadrant.' },
]);

// TOPIC 5: Calculus of Polar Functions
const POLARCALC = 'Calculus of polar functions';

// Area of a polar sector for r = c constant:  A = (1/2) c^2 * Delta-theta.
runSpecs('polarcalc', POLARCALC, 3, [
  { prompt: 'Find the area swept by $r = 2$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$4\\pi$', distractors: ['$2\\pi$', '$8\\pi$', '$16\\pi$'], explanation: '$A = \\dfrac{1}{2}\\displaystyle\\int_{0}^{2\\pi} 2^{2}\\,d\\theta = \\dfrac{1}{2}(4)(2\\pi) = 4\\pi$.' },
  { prompt: 'Find the area swept by $r = 3$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$9\\pi$', distractors: ['$18\\pi$', '$\\dfrac{9\\pi}{2}$', '$3\\pi$'], explanation: '$A = \\dfrac{1}{2}(9)(2\\pi) = 9\\pi$.' },
  { prompt: 'Find the area swept by $r = 1$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$\\pi$', distractors: ['$2\\pi$', '$\\dfrac{\\pi}{2}$', '$4\\pi$'], explanation: '$A = \\dfrac{1}{2}(1)(2\\pi) = \\pi$.' },
  { prompt: 'Find the area swept by $r = 4$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$16\\pi$', distractors: ['$8\\pi$', '$32\\pi$', '$4\\pi$'], explanation: '$A = \\dfrac{1}{2}(16)(2\\pi) = 16\\pi$.' },
  { prompt: 'Find the area swept by $r = 2$ from $\\theta = 0$ to $\\theta = \\pi$.', correct: '$2\\pi$', distractors: ['$4\\pi$', '$\\pi$', '$8\\pi$'], explanation: '$A = \\dfrac{1}{2}(4)(\\pi) = 2\\pi$.' },
  { prompt: 'Find the area swept by $r = 3$ from $\\theta = 0$ to $\\theta = \\pi$.', correct: '$\\dfrac{9\\pi}{2}$', distractors: ['$9\\pi$', '$\\dfrac{9\\pi}{4}$', '$3\\pi$'], explanation: '$A = \\dfrac{1}{2}(9)(\\pi) = \\dfrac{9\\pi}{2}$.' },
  { prompt: 'Find the area swept by $r = 1$ from $\\theta = 0$ to $\\theta = \\pi$.', correct: '$\\dfrac{\\pi}{2}$', distractors: ['$\\pi$', '$\\dfrac{\\pi}{4}$', '$2\\pi$'], explanation: '$A = \\dfrac{1}{2}(1)(\\pi) = \\dfrac{\\pi}{2}$.' },
  { prompt: 'Find the area swept by $r = 4$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$4\\pi$', distractors: ['$8\\pi$', '$2\\pi$', '$16\\pi$'], explanation: '$A = \\dfrac{1}{2}(16)\\dfrac{\\pi}{2} = 4\\pi$.' },
  { prompt: 'Find the area swept by $r = 2$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$\\pi$', distractors: ['$2\\pi$', '$\\dfrac{\\pi}{2}$', '$4\\pi$'], explanation: '$A = \\dfrac{1}{2}(4)\\dfrac{\\pi}{2} = \\pi$.' },
  { prompt: 'Find the area swept by $r = 6$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{3}$.', correct: '$6\\pi$', distractors: ['$12\\pi$', '$3\\pi$', '$18\\pi$'], explanation: '$A = \\dfrac{1}{2}(36)\\dfrac{\\pi}{3} = 6\\pi$.' },
  { prompt: 'Find the area swept by $r = 2$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{4}$.', correct: '$\\dfrac{\\pi}{2}$', distractors: ['$\\pi$', '$\\dfrac{\\pi}{4}$', '$\\dfrac{\\pi}{8}$'], explanation: '$A = \\dfrac{1}{2}(4)\\dfrac{\\pi}{4} = \\dfrac{\\pi}{2}$.' },
  { prompt: 'Find the area swept by $r = 3$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{3}$.', correct: '$\\dfrac{3\\pi}{2}$', distractors: ['$3\\pi$', '$\\dfrac{3\\pi}{4}$', '$\\dfrac{\\pi}{2}$'], explanation: '$A = \\dfrac{1}{2}(9)\\dfrac{\\pi}{3} = \\dfrac{3\\pi}{2}$.' },
  { prompt: 'Find the area swept by $r = 5$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$\\dfrac{25\\pi}{4}$', distractors: ['$\\dfrac{25\\pi}{2}$', '$25\\pi$', '$\\dfrac{5\\pi}{2}$'], explanation: '$A = \\dfrac{1}{2}(25)\\dfrac{\\pi}{2} = \\dfrac{25\\pi}{4}$.' },
  { prompt: 'Find the area swept by $r = 2$ from $\\theta = 0$ to $\\theta = \\dfrac{3\\pi}{2}$.', correct: '$3\\pi$', distractors: ['$6\\pi$', '$\\dfrac{3\\pi}{2}$', '$4\\pi$'], explanation: '$A = \\dfrac{1}{2}(4)\\dfrac{3\\pi}{2} = 3\\pi$.' },
]);

// Arc length of a polar circle r = c:  L = c * Delta-theta.
runSpecs('polarcalc', POLARCALC, 3, [
  { prompt: 'Find the arc length of $r = 2$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$4\\pi$', distractors: ['$2\\pi$', '$8\\pi$', '$4$'], explanation: 'With $r = 2$ constant, $r\' = 0$, so $L = \\displaystyle\\int_{0}^{2\\pi} \\sqrt{2^{2} + 0}\\,d\\theta = 4\\pi$.' },
  { prompt: 'Find the arc length of $r = 3$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$6\\pi$', distractors: ['$3\\pi$', '$9\\pi$', '$12\\pi$'], explanation: '$L = \\displaystyle\\int_{0}^{2\\pi} 3\\,d\\theta = 6\\pi$.' },
  { prompt: 'Find the arc length of $r = 2$ from $\\theta = 0$ to $\\theta = \\pi$.', correct: '$2\\pi$', distractors: ['$\\pi$', '$4\\pi$', '$2$'], explanation: '$L = \\displaystyle\\int_{0}^{\\pi} 2\\,d\\theta = 2\\pi$.' },
  { prompt: 'Find the arc length of $r = 4$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$2\\pi$', distractors: ['$4\\pi$', '$\\pi$', '$8\\pi$'], explanation: '$L = \\displaystyle\\int_{0}^{\\pi/2} 4\\,d\\theta = 2\\pi$.' },
  { prompt: 'Find the arc length of $r = 6$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{3}$.', correct: '$2\\pi$', distractors: ['$6\\pi$', '$\\pi$', '$4\\pi$'], explanation: '$L = \\displaystyle\\int_{0}^{\\pi/3} 6\\,d\\theta = 2\\pi$.' },
  { prompt: 'Find the arc length of $r = 5$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$\\dfrac{5\\pi}{2}$', distractors: ['$5\\pi$', '$\\dfrac{5\\pi}{4}$', '$\\dfrac{\\pi}{2}$'], explanation: '$L = \\displaystyle\\int_{0}^{\\pi/2} 5\\,d\\theta = \\dfrac{5\\pi}{2}$.' },
  { prompt: 'Find the arc length of $r = 3$ from $\\theta = 0$ to $\\theta = \\dfrac{2\\pi}{3}$.', correct: '$2\\pi$', distractors: ['$6\\pi$', '$3\\pi$', '$\\dfrac{2\\pi}{3}$'], explanation: '$L = \\displaystyle\\int_{0}^{2\\pi/3} 3\\,d\\theta = 3\\cdot\\dfrac{2\\pi}{3} = 2\\pi$.' },
]);

// Derivatives dr/d(theta).
runSpecs('polarcalc', POLARCALC, 2, [
  { prompt: 'For $r = 1 + \\cos\\theta$, find $\\dfrac{dr}{d\\theta}$.', correct: '$-\\sin\\theta$', distractors: ['$\\sin\\theta$', '$-\\cos\\theta$', '$1 - \\sin\\theta$'], explanation: '$\\dfrac{d}{d\\theta}(1 + \\cos\\theta) = -\\sin\\theta$.' },
  { prompt: 'For $r = 2 + \\sin\\theta$, find $\\dfrac{dr}{d\\theta}$.', correct: '$\\cos\\theta$', distractors: ['$-\\cos\\theta$', '$\\sin\\theta$', '$2\\cos\\theta$'], explanation: '$\\dfrac{d}{d\\theta}(2 + \\sin\\theta) = \\cos\\theta$.' },
  { prompt: 'For $r = 3\\cos\\theta$, find $\\dfrac{dr}{d\\theta}$.', correct: '$-3\\sin\\theta$', distractors: ['$3\\sin\\theta$', '$-3\\cos\\theta$', '$3\\sin\\theta\\cos\\theta$'], explanation: '$\\dfrac{d}{d\\theta}(3\\cos\\theta) = -3\\sin\\theta$.' },
  { prompt: 'For $r = 2\\sin\\theta$, find $\\dfrac{dr}{d\\theta}$.', correct: '$2\\cos\\theta$', distractors: ['$-2\\cos\\theta$', '$2\\sin\\theta$', '$-2\\sin\\theta$'], explanation: '$\\dfrac{d}{d\\theta}(2\\sin\\theta) = 2\\cos\\theta$.' },
  { difficulty: 3, prompt: 'For $r = \\cos(2\\theta)$, find $\\dfrac{dr}{d\\theta}$.', correct: '$-2\\sin(2\\theta)$', distractors: ['$2\\sin(2\\theta)$', '$-\\sin(2\\theta)$', '$-2\\cos(2\\theta)$'], explanation: 'By the chain rule, $\\dfrac{d}{d\\theta}\\cos(2\\theta) = -2\\sin(2\\theta)$.' },
  { prompt: 'For $r = \\theta^{2}$, find $\\dfrac{dr}{d\\theta}$.', correct: '$2\\theta$', distractors: ['$\\theta$', '$\\theta^{2}$', '$2$'], explanation: '$\\dfrac{d}{d\\theta}\\theta^{2} = 2\\theta$.' },
]);

// Known polar areas.
runSpecs('polarcalc', POLARCALC, 4, [
  { prompt: 'Find the area enclosed by the cardioid $r = 1 + \\cos\\theta$.', correct: '$\\dfrac{3\\pi}{2}$', distractors: ['$\\pi$', '$2\\pi$', '$3\\pi$'], explanation: '$A = \\dfrac{1}{2}\\displaystyle\\int_{0}^{2\\pi}(1 + \\cos\\theta)^{2}\\,d\\theta = \\dfrac{3\\pi}{2}$.' },
  { prompt: 'Find the area enclosed by the circle $r = 2\\cos\\theta$.', correct: '$\\pi$', distractors: ['$2\\pi$', '$4\\pi$', '$\\dfrac{\\pi}{2}$'], explanation: 'This circle has radius $1$, so its area is $\\pi$.' },
  { difficulty: 5, prompt: 'Find the area of one petal of the rose $r = \\cos(2\\theta)$.', correct: '$\\dfrac{\\pi}{8}$', distractors: ['$\\dfrac{\\pi}{4}$', '$\\dfrac{\\pi}{2}$', '$\\pi$'], explanation: '$A = \\dfrac{1}{2}\\displaystyle\\int_{-\\pi/4}^{\\pi/4}\\cos^{2}(2\\theta)\\,d\\theta = \\dfrac{\\pi}{8}$.' },
]);

// Formula recognition for polar calculus.
runSpecs('polarcalc', POLARCALC, 2, [
  { difficulty: 1, prompt: 'The area bounded by $r = f(\\theta)$ on $[\\alpha, \\beta]$ is $\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta}$ of:', correct: '$r^{2}$', distractors: ['$r$', '$\\sqrt{r}$', '$2r$'], explanation: 'The polar area integrand is $r^{2}$, scaled by $\\dfrac{1}{2}$.' },
  { difficulty: 3, prompt: 'The area between polar curves $r_{1} \\le r_{2}$ on $[\\alpha, \\beta]$ is:', correct: '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta}\\left(r_{2}^{2} - r_{1}^{2}\\right)d\\theta$', distractors: ['$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta}\\left(r_{2} - r_{1}\\right)^{2}d\\theta$', '$\\displaystyle\\int_{\\alpha}^{\\beta}\\left(r_{2}^{2} - r_{1}^{2}\\right)d\\theta$', '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta}\\left(r_{1}^{2} - r_{2}^{2}\\right)d\\theta$'], explanation: 'Subtract the inner area from the outer: $\\dfrac{1}{2}\\displaystyle\\int (r_{2}^{2} - r_{1}^{2})\\,d\\theta$.' },
  { prompt: 'The arc length of $r = f(\\theta)$ on $[\\alpha, \\beta]$ is $\\displaystyle\\int_{\\alpha}^{\\beta}$ of:', correct: '$\\sqrt{r^{2} + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}}$', distractors: ['$\\sqrt{1 + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}}$', '$\\dfrac{1}{2}r^{2}$', '$r^{2} + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}$'], explanation: 'Polar arc length integrates $\\sqrt{r^{2} + (dr/d\\theta)^{2}}$.' },
  { prompt: 'The area of a circular sector of radius $r$ subtending angle $\\theta$ is:', correct: '$\\dfrac{1}{2}\\theta r^{2}$', distractors: ['$\\theta r^{2}$', '$\\dfrac{1}{2}\\theta r$', '$\\pi r^{2}$'], explanation: 'A sector is the fraction $\\dfrac{\\theta}{2\\pi}$ of the disk: $\\dfrac{\\theta}{2\\pi}\\cdot\\pi r^{2} = \\dfrac{1}{2}\\theta r^{2}$.' },
  { prompt: 'To compute $\\dfrac{dy}{dx}$ for $r = f(\\theta)$, it helps to write the curve as:', correct: 'parametric equations $x = f(\\theta)\\cos\\theta$, $y = f(\\theta)\\sin\\theta$', distractors: ['$y = f(x)$ directly', 'the constant $r$', 'the area integral'], explanation: 'Converting to parametric form lets the parametric slope formula apply.' },
  { difficulty: 3, prompt: 'When $r = f(\\theta)$ passes through the pole at $\\theta = \\alpha$, the tangent line there is:', correct: '$\\theta = \\alpha$', distractors: ['$r = \\alpha$', 'the $x$-axis', '$\\theta = \\alpha + \\dfrac{\\pi}{2}$'], explanation: 'At the pole the slope reduces to $\\tan\\alpha$, giving the tangent line $\\theta = \\alpha$.' },
  { prompt: 'Which factor distinguishes the area formula from the arc-length formula in polar coordinates?', correct: 'area uses $\\dfrac{1}{2}r^{2}$; arc length uses a square root', distractors: ['they are identical', 'area uses a square root; arc length does not', 'both use $\\dfrac{1}{2}r^{2}$'], explanation: 'Area integrates $\\dfrac{1}{2}r^{2}$, while arc length integrates $\\sqrt{r^{2} + (dr/d\\theta)^{2}}$.' },
]);

// Additional polar area / arc-length sweeps and derivatives.
runSpecs('polarcalc', POLARCALC, 3, [
  { prompt: 'Find the area swept by $r = 4$ from $\\theta = 0$ to $\\theta = \\pi$.', correct: '$8\\pi$', distractors: ['$16\\pi$', '$4\\pi$', '$2\\pi$'], explanation: '$A = \\dfrac{1}{2}(16)(\\pi) = 8\\pi$.' },
  { prompt: 'Find the area swept by $r = 5$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$25\\pi$', distractors: ['$50\\pi$', '$\\dfrac{25\\pi}{2}$', '$5\\pi$'], explanation: '$A = \\dfrac{1}{2}(25)(2\\pi) = 25\\pi$.' },
  { prompt: 'Find the area swept by $r = 6$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$9\\pi$', distractors: ['$18\\pi$', '$\\dfrac{9\\pi}{2}$', '$3\\pi$'], explanation: '$A = \\dfrac{1}{2}(36)\\dfrac{\\pi}{2} = 9\\pi$.' },
  { prompt: 'Find the area swept by $r = 1$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$\\dfrac{\\pi}{4}$', distractors: ['$\\dfrac{\\pi}{2}$', '$\\dfrac{\\pi}{8}$', '$\\pi$'], explanation: '$A = \\dfrac{1}{2}(1)\\dfrac{\\pi}{2} = \\dfrac{\\pi}{4}$.' },
  { prompt: 'Find the area swept by $r = 2$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{6}$.', correct: '$\\dfrac{\\pi}{3}$', distractors: ['$\\dfrac{2\\pi}{3}$', '$\\dfrac{\\pi}{6}$', '$\\dfrac{\\pi}{12}$'], explanation: '$A = \\dfrac{1}{2}(4)\\dfrac{\\pi}{6} = \\dfrac{\\pi}{3}$.' },
  { prompt: 'Find the area swept by $r = 10$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$100\\pi$', distractors: ['$200\\pi$', '$50\\pi$', '$10\\pi$'], explanation: '$A = \\dfrac{1}{2}(100)(2\\pi) = 100\\pi$.' },
  { prompt: 'Find the arc length of $r = 10$ from $\\theta = 0$ to $\\theta = 2\\pi$.', correct: '$20\\pi$', distractors: ['$100\\pi$', '$10\\pi$', '$40\\pi$'], explanation: 'With $r = 10$ constant, $L = \\displaystyle\\int_{0}^{2\\pi} 10\\,d\\theta = 20\\pi$.' },
  { prompt: 'Find the arc length of $r = 3$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{2}$.', correct: '$\\dfrac{3\\pi}{2}$', distractors: ['$3\\pi$', '$\\dfrac{3\\pi}{4}$', '$\\dfrac{\\pi}{2}$'], explanation: '$L = \\displaystyle\\int_{0}^{\\pi/2} 3\\,d\\theta = \\dfrac{3\\pi}{2}$.' },
  { prompt: 'Find the arc length of $r = 2$ from $\\theta = 0$ to $\\theta = \\dfrac{\\pi}{4}$.', correct: '$\\dfrac{\\pi}{2}$', distractors: ['$\\pi$', '$\\dfrac{\\pi}{4}$', '$2$'], explanation: '$L = \\displaystyle\\int_{0}^{\\pi/4} 2\\,d\\theta = \\dfrac{\\pi}{2}$.' },
  { difficulty: 2, prompt: 'For $r = 5\\sin\\theta$, find $\\dfrac{dr}{d\\theta}$.', correct: '$5\\cos\\theta$', distractors: ['$-5\\cos\\theta$', '$5\\sin\\theta$', '$-5\\sin\\theta$'], explanation: '$\\dfrac{d}{d\\theta}(5\\sin\\theta) = 5\\cos\\theta$.' },
  { difficulty: 2, prompt: 'For $r = 4 + 3\\cos\\theta$, find $\\dfrac{dr}{d\\theta}$.', correct: '$-3\\sin\\theta$', distractors: ['$3\\sin\\theta$', '$-3\\cos\\theta$', '$4 - 3\\sin\\theta$'], explanation: '$\\dfrac{d}{d\\theta}(4 + 3\\cos\\theta) = -3\\sin\\theta$.' },
  { difficulty: 2, prompt: 'For $r = \\theta^{3}$, find $\\dfrac{dr}{d\\theta}$.', correct: '$3\\theta^{2}$', distractors: ['$\\theta^{2}$', '$3\\theta$', '$\\theta^{3}$'], explanation: '$\\dfrac{d}{d\\theta}\\theta^{3} = 3\\theta^{2}$.' },
]);

export const parametricAndPolarQuestions: PracticeQuestion[] = [
  ...curatedQuestions,
  ...generated,
];
