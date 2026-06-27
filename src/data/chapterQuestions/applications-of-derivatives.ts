import type { PracticeQuestion } from '../questionBank';

// Practice questions for the "Applications of the Derivative" chapter
// (Chapter 4: Newton's Method, Related Rates, Optimization, Differentials).
//
// Content adapted from APEX Calculus by Gregory Hartman et al.
// (apexcalculus.com), used under a Creative Commons Attribution-NonCommercial
// 4.0 (CC BY-NC 4.0) license. Formulas come from that text; questions are
// generated programmatically and every answer is computed from the relevant
// formula. Every question sets chapterId: 'applications-of-derivatives'.

const CHAPTER_ID = 'applications-of-derivatives';
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;

type PreparedQuestion = Omit<PracticeQuestion, 'id' | 'chapterId'>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

// Normalize the way the whole-bank test does: strip `$`, trim, collapse spaces.
function normalizeLabel(label: string): string {
  return label.replace(/\$/g, '').trim().replace(/\s+/g, ' ');
}

function fmtNum(n: number): string {
  if (Object.is(n, -0)) return '0';
  if (Number.isInteger(n)) return `${n}`;
  const rounded = Math.round(n * 1000) / 1000;
  return `${rounded}`;
}

// Render an integer/decimal coefficient times pi, e.g. 2 -> "$2\\pi$".
function piLabel(coef: number): string {
  if (Math.abs(coef) < 1e-9) return '$0$';
  if (Math.abs(coef - 1) < 1e-9) return '$\\pi$';
  if (Math.abs(coef + 1) < 1e-9) return '$-\\pi$';
  return `$${fmtNum(coef)}\\pi$`;
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

// Numeric multiple-choice: dedupes distractors by value AND by formatted label,
// then pads with correct +/- k so there are always exactly 3 distractors.
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

// Safe generic distractors used only if a symbolic question runs short after
// de-duplication. These are obviously-wrong fillers for expression answers.
const SAFE_PAD = ['$0$', '$1$', '$-1$', '$2$', '$x$', '$2x$', '$C$', '$\\tfrac{1}{2}$'];

// Symbolic / conceptual multiple-choice from explicit labels.
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

type ConceptSpec = {
  prompt: string;
  correct: string;
  distractors: string[];
  explanation: string;
  difficulty: number;
};

function withIds(slug: string, items: readonly PreparedQuestion[]): PracticeQuestion[] {
  return items.map((q, index) => ({
    id: `${CHAPTER_ID}-${slug}-gen-${pad3(index + 1)}`,
    chapterId: CHAPTER_ID,
    ...q,
  }));
}

// ---------------------------------------------------------------------------
// Topic 1: Newton's Method
//   One step is x_1 = x_0 - f(x_0)/f'(x_0).
// ---------------------------------------------------------------------------
function newtonsMethod(): PreparedQuestion[] {
  const cat = "Newton's Method";
  const out: PreparedQuestion[] = [];
  let p = 0;

  // f(x) = x^2 - N, x_0 = g  ->  x_1 = (g^2 + N)/(2g).
  for (const N of [2, 3, 5, 6, 7, 10]) {
    for (const g of [1, 2, 3]) {
      const ans = (g * g + N) / (2 * g);
      out.push(
        numericPre({
          category: cat,
          prompt: `For $f(x) = x^2 - ${N}$ with $f'(x) = 2x$ and $x_0 = ${g}$, compute $x_1$ from one step of Newton's Method.`,
          difficulty: 2,
          correct: ans,
          smart: [(g * g + N) / g, g - (g * g - N) / 2, g, N / g, g + 1],
          explanation: `$x_1 = ${g} - \\dfrac{${g}^2 - ${N}}{2(${g})} = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  // f(x) = x^3 - N, x_0 = g  ->  x_1 = (2g^3 + N)/(3g^2).
  for (const N of [8, 10, 20, 27]) {
    for (const g of [1, 2, 3]) {
      const ans = (2 * g * g * g + N) / (3 * g * g);
      out.push(
        numericPre({
          category: cat,
          prompt: `For $f(x) = x^3 - ${N}$ with $f'(x) = 3x^2$ and $x_0 = ${g}$, compute $x_1$ from one step of Newton's Method.`,
          difficulty: 3,
          correct: ans,
          smart: [g - (g * g * g - N) / 3, (g * g * g + N) / (3 * g * g), g, N / (g * g)],
          explanation: `$x_1 = ${g} - \\dfrac{${g}^3 - ${N}}{3(${g})^2} = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  // Given x_0, f(x_0), f'(x_0) directly  ->  x_1 = x_0 - f0/f0p.
  const genCases: Array<[number, number]> = [
    [4, 2],
    [6, 3],
    [-4, 2],
    [9, 3],
    [-6, 2],
    [8, 4],
  ];
  for (const x0 of [1, 2, 3]) {
    for (const [f0, f0p] of genCases) {
      const ans = x0 - f0 / f0p;
      out.push(
        numericPre({
          category: cat,
          prompt: `In Newton's Method, $x_0 = ${x0}$, $f(x_0) = ${f0}$, and $f'(x_0) = ${f0p}$. What is $x_1$?`,
          difficulty: 1,
          correct: ans,
          smart: [x0 + f0 / f0p, x0 - f0p / f0, x0 - f0, x0 + f0],
          explanation: `$x_1 = x_0 - \\dfrac{f(x_0)}{f'(x_0)} = ${x0} - \\dfrac{${f0}}{${f0p}} = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  const concepts: ConceptSpec[] = [
    {
      prompt: "Newton's Method uses which iteration formula?",
      difficulty: 1,
      correct: "$x_{n+1} = x_n - \\dfrac{f(x_n)}{f'(x_n)}$",
      distractors: [
        "$x_{n+1} = x_n - \\dfrac{f'(x_n)}{f(x_n)}$",
        "$x_{n+1} = x_n + \\dfrac{f(x_n)}{f'(x_n)}$",
        "$x_{n+1} = x_n - f(x_n)f'(x_n)$",
      ],
      explanation: "Each step is $x_{n+1} = x_n - \\dfrac{f(x_n)}{f'(x_n)}$.",
    },
    {
      prompt: "Newton's Method is primarily a tool to:",
      difficulty: 1,
      correct: 'approximate a root of an equation $f(x) = 0$',
      distractors: [
        'compute an exact derivative',
        'find the area under a curve',
        'solve a system of linear equations',
      ],
      explanation: 'It produces successive approximations to a solution of $f(x) = 0$.',
    },
    {
      prompt: "Newton's Method can break down at a guess where:",
      difficulty: 2,
      correct: "the derivative $f'(x_n)$ equals zero",
      distractors: [
        'the function value $f(x_n)$ equals zero',
        'the guess $x_n$ is positive',
        'the second derivative is positive',
      ],
      explanation:
        'A zero derivative gives a horizontal tangent that never meets the $x$-axis, so the step is undefined.',
    },
    {
      prompt: "Geometrically, one step of Newton's Method finds:",
      difficulty: 2,
      correct: 'where the tangent line at $x_n$ crosses the $x$-axis',
      distractors: [
        'where the curve crosses the $y$-axis',
        'the midpoint of the current interval',
        'the highest point of the curve',
      ],
      explanation: 'The next estimate is the $x$-intercept of the tangent line at the current guess.',
    },
    {
      prompt: "Near a simple root, Newton's Method typically converges:",
      difficulty: 4,
      correct: 'very quickly, roughly doubling the correct digits each step',
      distractors: [
        'slowly, adding one digit every several steps',
        'never',
        'only for polynomial functions',
      ],
      explanation:
        'Once close to a simple root, the number of accurate decimal places roughly doubles per step.',
    },
    {
      prompt: 'If $f(x_n) = 0$ exactly, the next Newton iterate $x_{n+1}$ equals:',
      difficulty: 2,
      correct: '$x_n$, since the root has already been found',
      distractors: ['$0$', '$x_n + 1$', 'an undefined value'],
      explanation: 'With $f(x_n) = 0$ the update subtracts $0$, so $x_{n+1} = x_n$.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, ...c }));

  return out;
}

// ---------------------------------------------------------------------------
// Topic 2: Related Rates
// ---------------------------------------------------------------------------
function relatedRates(): PreparedQuestion[] {
  const cat = 'Related Rates';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // Square: dA/dt = 2s ds/dt.
  for (const s of [2, 3, 4, 5, 6, 7]) {
    for (const r of [2, 3]) {
      const ans = 2 * s * r;
      out.push(
        numericPre({
          category: cat,
          prompt: `A square has side length $s$. At the instant $s = ${s}$, the side grows at $\\dfrac{ds}{dt} = ${r}$. How fast is the area $A = s^2$ changing?`,
          difficulty: 2,
          correct: ans,
          smart: [s * r, 2 * s, s * s, 2 * r, 4 * s * r],
          explanation: `$\\dfrac{dA}{dt} = 2s\\,\\dfrac{ds}{dt} = 2(${s})(${r}) = ${ans}$.`,
          position: p++,
        }),
      );
    }
  }

  // Circumference: dC/dt = 2pi dr/dt (answer is a multiple of pi).
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const cf = 2 * k;
    out.push(
      numericPre({
        category: cat,
          prompt: `A circle's radius grows at $\\dfrac{dr}{dt} = ${k}$ in/h. Using $C = 2\\pi r$, how fast is the circumference growing?`,
          difficulty: 2,
        correct: cf,
        smart: [k, 4 * k, k * k, k + 1, 3 * k],
        explanation: `$\\dfrac{dC}{dt} = 2\\pi\\,\\dfrac{dr}{dt} = 2\\pi(${k}) = ${cf}\\pi$ in/h.`,
        position: p++,
        fmt: piLabel,
      }),
    );
  }

  // Circle area: dA/dt = 2pi r dr/dt (multiple of pi).
  for (const r of [2, 3, 4, 5, 6]) {
    for (const k of [2, 3]) {
      const cf = 2 * r * k;
      out.push(
        numericPre({
          category: cat,
          prompt: `A circle's radius grows at $\\dfrac{dr}{dt} = ${k}$. When $r = ${r}$, how fast is the area $A = \\pi r^2$ changing?`,
          difficulty: 2,
          correct: cf,
          smart: [r * k, 2 * r, r * r, 4 * r * k, 2 * k],
          explanation: `$\\dfrac{dA}{dt} = 2\\pi r\\,\\dfrac{dr}{dt} = 2\\pi(${r})(${k}) = ${cf}\\pi$.`,
          position: p++,
          fmt: piLabel,
        }),
      );
    }
  }

  // Sphere volume: dV/dt = 4pi r^2 dr/dt (multiple of pi).
  for (const r of [1, 2, 3, 4, 5]) {
    for (const k of [1, 2]) {
      const cf = 4 * r * r * k;
      out.push(
        numericPre({
          category: cat,
          prompt: `A spherical balloon has volume $V = \\tfrac{4}{3}\\pi r^3$ and is inflated so that $\\dfrac{dr}{dt} = ${k}$. When $r = ${r}$, how fast is the volume changing?`,
          difficulty: 3,
          correct: cf,
          smart: [r * r * k, 4 * r * k, 3 * r * r * k, 2 * r * r * k, r * r],
          explanation: `$\\dfrac{dV}{dt} = 4\\pi r^2\\,\\dfrac{dr}{dt} = 4\\pi(${r})^2(${k}) = ${cf}\\pi$.`,
          position: p++,
          fmt: piLabel,
        }),
      );
    }
  }

  // Cube volume: dV/dt = 3s^2 ds/dt.
  for (const s of [2, 3, 4, 5, 6]) {
    for (const r of [1, 2]) {
      const ans = 3 * s * s * r;
      out.push(
        numericPre({
          category: cat,
          prompt: `A cube has edge length $s$. When $s = ${s}$, the edge grows at $\\dfrac{ds}{dt} = ${r}$. How fast is the volume $V = s^3$ changing?`,
          difficulty: 3,
          correct: ans,
          smart: [s * s * r, 3 * s * r, 2 * s * r, s * s * s, 6 * s * r],
          explanation: `$\\dfrac{dV}{dt} = 3s^2\\,\\dfrac{ds}{dt} = 3(${s})^2(${r}) = ${ans}$.`,
          position: p++,
        }),
      );
    }
  }

  const concepts: ConceptSpec[] = [
    {
      prompt: 'In a related-rates problem, the first key step is to:',
      difficulty: 2,
      correct: 'write an equation relating the changing quantities, then differentiate with respect to time',
      distractors: [
        'substitute the given values before differentiating',
        'integrate both sides of the equation',
        'set every derivative equal to zero',
      ],
      explanation:
        'Relate the variables, differentiate with respect to $t$, and only then substitute the instantaneous values.',
    },
    {
      prompt: 'Differentiating $V = \\tfrac{4}{3}\\pi r^3$ with respect to time gives $\\dfrac{dV}{dt} = $',
      difficulty: 3,
      correct: '$4\\pi r^2 \\dfrac{dr}{dt}$',
      distractors: [
        '$\\tfrac{4}{3}\\pi r^2 \\dfrac{dr}{dt}$',
        '$4\\pi r \\dfrac{dr}{dt}$',
        '$\\tfrac{4}{3}\\pi r^3 \\dfrac{dr}{dt}$',
      ],
      explanation: 'By the chain rule, $\\dfrac{dV}{dt} = 4\\pi r^2\\,\\dfrac{dr}{dt}$.',
    },
    {
      prompt:
        'For a cylinder $V = \\pi r^2 h$ whose radius $r$ stays constant while the height changes, $\\dfrac{dV}{dt} = $',
      difficulty: 3,
      correct: '$\\pi r^2 \\dfrac{dh}{dt}$',
      distractors: [
        '$2\\pi r h \\dfrac{dr}{dt}$',
        '$\\pi r^2 h \\dfrac{dh}{dt}$',
        '$2\\pi r \\dfrac{dh}{dt}$',
      ],
      explanation: 'With $r$ constant, only $h$ varies, so $\\dfrac{dV}{dt} = \\pi r^2\\,\\dfrac{dh}{dt}$.',
    },
    {
      prompt: 'If the radius of a circle is increasing ($\\tfrac{dr}{dt} > 0$), then its area is:',
      difficulty: 2,
      correct: 'increasing',
      distractors: ['decreasing', 'constant', 'first increasing, then decreasing'],
      explanation:
        'Since $\\dfrac{dA}{dt} = 2\\pi r\\,\\dfrac{dr}{dt}$ with $r > 0$, a positive $\\tfrac{dr}{dt}$ makes $\\tfrac{dA}{dt} > 0$.',
    },
    {
      prompt: 'Why must you differentiate before substituting the given instantaneous values?',
      difficulty: 3,
      correct: 'the given values are momentary, so treating them as constants would erase their rates',
      distractors: [
        'substitution always makes the algebra impossible',
        'the chain rule only works on numbers',
        'derivatives cannot be taken after substitution',
      ],
      explanation: 'Plugging in first freezes the changing quantities, removing the derivatives you need.',
    },
    {
      prompt: 'Related-rates problems most often differentiate the relating equation using:',
      difficulty: 2,
      correct: 'implicit differentiation with respect to time',
      distractors: ['the quotient rule only', 'integration by parts', 'partial fractions'],
      explanation: 'Each variable is a function of $t$, so we differentiate implicitly with respect to time.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, ...c }));

  return out;
}

// ---------------------------------------------------------------------------
// Topic 3: Optimization
// ---------------------------------------------------------------------------
function optimization(): PreparedQuestion[] {
  const cat = 'Optimization';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // Rectangle, fixed perimeter P: max-area side is P/4 (a square).
  for (const P of [40, 60, 80, 100, 120, 160, 200, 240]) {
    const ans = P / 4;
    out.push(
      numericPre({
        category: cat,
          prompt: `A rectangle has perimeter $${P}$. What side length gives the maximum area?`,
          difficulty: 3,
        correct: ans,
        smart: [P / 2, P, P / 8, P / 3, ans + 1],
        explanation: `Maximum area for a fixed perimeter is a square with side $\\dfrac{${P}}{4} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Rectangle, fixed perimeter P: max area is (P/4)^2.
  for (const P of [40, 60, 80, 100, 120, 160, 200, 240]) {
    const side = P / 4;
    const ans = side * side;
    out.push(
      numericPre({
        category: cat,
          prompt: `A rectangle has perimeter $${P}$. What is its maximum possible area?`,
          difficulty: 4,
        correct: ans,
        smart: [(P / 2) * (P / 2), side, (P * P) / 4, (P / 2) * (P / 4)],
        explanation: `The optimal square has side $\\dfrac{${P}}{4} = ${fmtNum(side)}$, so the area is $${fmtNum(side)}^2 = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Two nonnegative numbers summing to S: max product is (S/2)^2.
  for (const S of [10, 12, 16, 20, 24, 30, 40, 50]) {
    const ans = (S / 2) * (S / 2);
    out.push(
      numericPre({
        category: cat,
          prompt: `Two nonnegative numbers add to $${S}$. What is their largest possible product?`,
          difficulty: 3,
        correct: ans,
        smart: [(S * S) / 2, S / 2, S * S, (S / 2) * S],
        explanation: `The product $x(${S} - x)$ is maximized at $x = ${fmtNum(S / 2)}$, giving $${fmtNum(S / 2)}^2 = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Two nonnegative numbers summing to S: each is S/2 at the max product.
  for (const S of [8, 10, 14, 16, 18, 22, 26]) {
    const ans = S / 2;
    out.push(
      numericPre({
        category: cat,
          prompt: `Two nonnegative numbers add to $${S}$ and have the largest possible product. What is each number?`,
          difficulty: 2,
        correct: ans,
        smart: [S, S / 4, 2 * S, S / 3],
        explanation: `Equal values maximize the product, so each is $\\dfrac{${S}}{2} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Three-sided enclosure (a stream forms one side), fence L: max area is L^2/8.
  for (const L of [40, 80, 120, 160, 200]) {
    const ans = (L * L) / 8;
    out.push(
      numericPre({
        category: cat,
          prompt: `A rectangular enclosure along a stream needs fence on only three sides, using $${L}$ ft of fence. What is its maximum area?`,
          difficulty: 5,
        correct: ans,
        smart: [(L * L) / 4, (L * L) / 16, (L / 4) * L, L / 4],
        explanation: `The side parallel to the stream is $${L / 2}$ and each perpendicular side is $${L / 4}$, so the area is $\\dfrac{${L}^2}{8} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Three-sided enclosure: each side perpendicular to the stream is L/4.
  for (const L of [40, 80, 120, 160, 200]) {
    const ans = L / 4;
    out.push(
      numericPre({
        category: cat,
          prompt: `A rectangular enclosure along a stream uses $${L}$ ft of fence on three sides. How long should each of the two sides perpendicular to the stream be to maximize the area?`,
          difficulty: 4,
        correct: ans,
        smart: [L / 2, L / 8, L / 3, L],
        explanation: `Writing $A = (${L} - 2y)\\,y$ and solving $A'(y) = ${L} - 4y = 0$ gives $y = \\dfrac{${L}}{4} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  // Rectangle enclosing a fixed area: min-perimeter side is sqrt(area).
  for (const A of [16, 36, 64, 100, 144]) {
    const ans = Math.sqrt(A);
    out.push(
      numericPre({
        category: cat,
          prompt: `A rectangle must enclose an area of $${A}$. What side length minimizes its perimeter?`,
          difficulty: 3,
        correct: ans,
        smart: [A / 4, A / 2, 2 * ans, A],
        explanation: `Minimum perimeter for a fixed area is a square with side $\\sqrt{${A}} = ${fmtNum(ans)}$.`,
        position: p++,
      }),
    );
  }

  const concepts: ConceptSpec[] = [
    {
      prompt: 'Among all rectangles with a fixed perimeter, the one with the largest area is:',
      difficulty: 2,
      correct: 'the square',
      distractors: ['a long, thin rectangle', 'a 2-to-1 rectangle', 'there is no maximum'],
      explanation: 'For a fixed perimeter, the area is maximized by the square.',
    },
    {
      prompt: 'In a closed optimization problem, after finding interior critical points you should also:',
      difficulty: 3,
      correct: 'evaluate the function at the endpoints of the domain',
      distractors: ['integrate the objective function', 'ignore the constraint', 'take a third derivative'],
      explanation: 'Absolute extrema can occur at endpoints, so check them along with the critical points.',
    },
    {
      prompt: 'The first step in an applied optimization problem is usually to:',
      difficulty: 2,
      correct: 'write the quantity to be optimized as a function of one variable',
      distractors: [
        'guess the answer and check it',
        'take the second derivative immediately',
        'integrate the constraint equation',
      ],
      explanation: 'Use a constraint to reduce the objective to a single-variable function before optimizing.',
    },
    {
      prompt: 'A constraint equation in an optimization problem is used to:',
      difficulty: 2,
      correct: 'eliminate a variable so the objective depends on a single variable',
      distractors: ['compute the second derivative', 'set the objective equal to zero', 'determine the units'],
      explanation: 'The constraint lets you express the objective in terms of one variable.',
    },
    {
      prompt: 'To confirm that a critical point of $A(x) = 50x - x^2$ is a maximum, you can check that:',
      difficulty: 3,
      correct: "$A''(x) = -2 < 0$, so the graph is concave down",
      distractors: [
        "$A''(x) = 2 > 0$, so the graph is concave up",
        'the value occurs at an endpoint',
        'you cannot tell without graphing',
      ],
      explanation: 'A negative second derivative means concave down, confirming a maximum.',
    },
    {
      prompt: 'Among all rectangles enclosing a fixed area, the one with the smallest perimeter is:',
      difficulty: 2,
      correct: 'the square',
      distractors: ['a long, thin rectangle', 'a 3-to-1 rectangle', 'there is no minimum'],
      explanation: 'For a fixed area, the perimeter is minimized by the square.',
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, ...c }));

  return out;
}

// ---------------------------------------------------------------------------
// Topic 4: Differentials
//   Linearization L(x) = f(c) + f'(c)(x - c); differential dy = f'(x) dx.
// ---------------------------------------------------------------------------
function differentials(): PreparedQuestion[] {
  const cat = 'Differentials';
  const out: PreparedQuestion[] = [];
  let p = 0;

  // sqrt linearization at c = n^2: sqrt(n^2 + dx) ~ n + dx/(2n).
  for (const n of [2, 3, 4, 5, 6, 7]) {
    for (const dx of [0.1, 0.2, 0.5]) {
      const c = n * n;
      const ans = n + dx / (2 * n);
      out.push(
        numericPre({
          category: cat,
          prompt: `Use the linearization of $f(x) = \\sqrt{x}$ at $c = ${c}$ to estimate $\\sqrt{${c + dx}}$.`,
          difficulty: 3,
          correct: ans,
          smart: [n + dx, n + dx / n, n, n - dx / (2 * n)],
          explanation: `$f'(x) = \\dfrac{1}{2\\sqrt{x}}$, so $f'(${c}) = \\dfrac{1}{${2 * n}}$. Then $L(${c + dx}) = ${n} + \\dfrac{${dx}}{${2 * n}} = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  // dy for y = x^2: dy = 2x dx.
  for (const x of [3, 4, 5, 6, 7, 8]) {
    for (const dx of [0.1, 0.2]) {
      const ans = 2 * x * dx;
      out.push(
        numericPre({
          category: cat,
          prompt: `For $y = x^2$ at $x = ${x}$ with $dx = ${dx}$, use the differential to estimate the change $dy$.`,
          difficulty: 2,
          correct: ans,
          smart: [x * dx, x * x * dx, 2 * dx, x * dx * dx],
          explanation: `$dy = f'(x)\\,dx = 2x\\,dx = 2(${x})(${dx}) = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  // dy for y = x^3: dy = 3x^2 dx.
  for (const x of [1, 2, 3, 4, 5]) {
    for (const dx of [0.1, 0.2]) {
      const ans = 3 * x * x * dx;
      out.push(
        numericPre({
          category: cat,
          prompt: `For $y = x^3$ at $x = ${x}$ with $dx = ${dx}$, use the differential to estimate $dy$.`,
          difficulty: 2,
          correct: ans,
          smart: [x * x * dx, 3 * x * dx, 2 * x * dx, x * x * x * dx],
          explanation: `$dy = 3x^2\\,dx = 3(${x})^2(${dx}) = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  // Cube-root linearization at c = n^3: cbrt(n^3 + dx) ~ n + dx/(3 n^2).
  for (const n of [2, 3, 4, 5]) {
    for (const dx of [0.1, 0.2]) {
      const c = n * n * n;
      const ans = n + dx / (3 * n * n);
      out.push(
        numericPre({
          category: cat,
          prompt: `Use the linearization of $f(x) = \\sqrt[3]{x}$ at $c = ${c}$ to estimate $\\sqrt[3]{${c + dx}}$.`,
          difficulty: 3,
          correct: ans,
          smart: [n + dx, n + dx / n, n, n + dx / (3 * n)],
          explanation: `$f'(x) = \\dfrac{1}{3x^{2/3}}$, so $f'(${c}) = \\dfrac{1}{${3 * n * n}}$. Then $L(${c + dx}) = ${n} + \\dfrac{${dx}}{${3 * n * n}} = ${fmtNum(ans)}$.`,
          position: p++,
        }),
      );
    }
  }

  const concepts: ConceptSpec[] = [
    {
      prompt: 'The linearization of $f$ at $x = c$ is:',
      difficulty: 1,
      correct: "$L(x) = f(c) + f'(c)(x - c)$",
      distractors: [
        "$L(x) = f(c)\\,f'(c)(x - c)$",
        "$L(x) = f'(c) + f(c)(x - c)$",
        '$L(x) = f(c)(x - c)$',
      ],
      explanation: "The tangent-line approximation is $L(x) = f(c) + f'(c)(x - c)$.",
    },
    {
      prompt: 'For $y = f(x)$, the differential $dy$ is defined as:',
      difficulty: 1,
      correct: "$dy = f'(x)\\,dx$",
      distractors: ['$dy = f(x)\\,dx$', "$dy = f''(x)\\,dx$", "$dy = \\dfrac{dx}{f'(x)}$"],
      explanation: "By definition, $dy = f'(x)\\,dx$.",
    },
    {
      prompt: 'For a small change $dx$, the differential $dy$ approximates:',
      difficulty: 2,
      correct: 'the actual change $\\Delta y$ in the function value',
      distractors: [
        'the second derivative of $f$',
        'the area under the curve',
        'the average rate of change over the whole domain',
      ],
      explanation: "For small $dx$, $dy = f'(x)\\,dx \\approx \\Delta y$.",
    },
    {
      prompt: 'A linear approximation of $f$ at $x = c$ is most accurate:',
      difficulty: 2,
      correct: 'for $x$ close to $c$',
      distractors: ['for $x$ far from $c$', 'for every $x$', 'only at $x = 0$'],
      explanation: 'A linearization is accurate near the point of tangency and degrades as $x$ moves away.',
    },
    {
      prompt: 'The relative (percent) error in a computed quantity $A$ is estimated by:',
      difficulty: 2,
      correct: '$\\dfrac{dA}{A}$',
      distractors: ['$dA \\cdot A$', '$\\dfrac{A}{dA}$', '$dA - A$'],
      explanation: 'Relative error is the differential divided by the quantity, $\\dfrac{dA}{A}$.',
    },
    {
      prompt: 'Linear approximation works because, zoomed in near $c$, a differentiable curve looks:',
      difficulty: 2,
      correct: 'nearly straight, like its tangent line',
      distractors: ['perfectly vertical', 'like a parabola only', 'discontinuous'],
      explanation: 'Local linearity is exactly why the tangent line approximates the curve so well.',
    },
    {
      prompt: "If $f'(c) = 0$, the linearization of $f$ at $c$ is:",
      difficulty: 2,
      correct: 'the constant $L(x) = f(c)$',
      distractors: ['undefined', 'a vertical line', '$L(x) = x - c$'],
      explanation: "With $f'(c) = 0$, $L(x) = f(c) + 0\\cdot(x - c) = f(c)$.",
    },
    {
      prompt: 'For $y = f(x)$, we may freely choose a value for $dx$; this then determines:',
      difficulty: 2,
      correct: "the value of $dy = f'(x)\\,dx$",
      distractors: ['the value of $f(x)$', "the derivative $f'(x)$", 'the domain of $f$'],
      explanation: "The differential $dx$ is an independent choice; $dy = f'(x)\\,dx$ follows from it.",
    },
  ];
  for (const c of concepts) out.push(symbolicPre({ category: cat, position: p++, ...c }));

  return out;
}

// ---------------------------------------------------------------------------
// Assembled bank
// ---------------------------------------------------------------------------
export const applicationsOfDerivativesQuestions: PracticeQuestion[] = [
  ...withIds('newton', newtonsMethod()),
  ...withIds('related-rates', relatedRates()),
  ...withIds('optimization', optimization()),
  ...withIds('differentials', differentials()),
];
