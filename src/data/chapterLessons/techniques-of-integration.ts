import type { Lesson } from '../lessons';

/* Lessons for "Techniques of Integration" (APEX Calculus Ch. 6), adapted under CC BY-NC 4.0. */

export const techniquesOfIntegrationLessons: Lesson[] = [
  {
    id: 'toi-substitution',
    chapterId: 'techniques-of-integration',
    title: 'Substitution',
    description:
      'Reversing the chain rule by spotting an inner function $u = g(x)$ whose derivative already appears in the integrand.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'sub-idea',
        type: 'concept',
        title: 'Reversing the chain rule',
        body: 'Substitution undoes the chain rule. When an integrand contains a composite function alongside the derivative of its inner part, set $u = g(x)$ so that $du = g\'(x)\\,dx$. The original integral, $$\\int f(g(x))\\,g\'(x)\\,dx,$$ then collapses to the simpler $\\int f(u)\\,du$.',
        visual: {
          type: 'function-explorer',
          label: 'Integrand $y = \\dfrac{2x}{x^{2}+1}$: the numerator $2x$ is exactly $\\tfrac{d}{dx}(x^{2}+1)$',
          fn: (x) => (2 * x) / (x * x + 1),
          xMin: -4,
          xMax: 4,
          initialX: 1,
        },
        interactiveNote:
          'Drag the point along the curve to read $(x,\\,f(x))$ for the integrand $\\dfrac{2x}{x^{2}+1}$; notice the numerator $2x$ is exactly $\\tfrac{d}{dx}(x^{2}+1)$, the $du$ that collapses the whole integral to $\\int \\tfrac{1}{u}\\,du$.',
      },
      {
        id: 'sub-choose-u',
        type: 'multiple-choice',
        title: 'Spot the inner function',
        prompt:
          'For $\\int \\dfrac{2x}{x^{2}+1}\\,dx$, which choice of $u$ turns the integral into $\\int \\tfrac{1}{u}\\,du$?',
        options: [
          { id: 'u-quad', label: '$u = x^{2}+1$, so $du = 2x\\,dx$' },
          { id: 'u-2x', label: '$u = 2x$, so $du = 2\\,dx$' },
          { id: 'u-x', label: '$u = x$, so $du = dx$' },
          { id: 'u-recip', label: '$u = \\dfrac{1}{x^{2}+1}$' },
        ],
        correctOptionId: 'u-quad',
        correctExplanation:
          'Correct. With $u = x^{2}+1$ the derivative $du = 2x\\,dx$ is exactly the numerator, leaving $\\int \\tfrac{1}{u}\\,du$.',
        incorrectExplanation:
          'Look for a piece whose derivative also appears. Here $\\tfrac{d}{dx}(x^{2}+1) = 2x$ matches the numerator.',
        hint: 'Choose the part whose derivative is sitting in the rest of the integrand.',
        visual: {
          type: 'function-explorer',
          label: 'Inner function $u = x^{2}+1$',
          fn: (x) => x * x + 1,
          xMin: -3,
          xMax: 3,
          initialX: 1,
        },
      },
      {
        id: 'sub-evaluate',
        type: 'multiple-choice',
        title: 'Finish the substitution',
        prompt: 'Evaluate $$\\int \\dfrac{2x}{x^{2}+1}\\,dx.$$',
        options: [
          { id: 'ln', label: '$\\ln(x^{2}+1) + C$' },
          { id: 'half-ln', label: '$\\tfrac{1}{2}\\ln(x^{2}+1) + C$' },
          { id: 'arctan', label: '$\\arctan x + C$' },
          { id: 'recip', label: '$-\\dfrac{2}{(x^{2}+1)^{2}} + C$' },
        ],
        correctOptionId: 'ln',
        correctExplanation:
          'Correct. $$\\int \\tfrac{1}{u}\\,du = \\ln|u| + C = \\ln(x^{2}+1) + C,$$ and the argument stays positive.',
        incorrectExplanation:
          'After $u = x^{2}+1$ the integral is $$\\int \\tfrac{1}{u}\\,du = \\ln|u| + C.$$',
        hint: 'The reciprocal $\\tfrac{1}{u}$ integrates to a logarithm.',
        visual: {
          type: 'area-accumulation',
          label: 'Accumulating $\\int_0^b \\frac{2x}{x^{2}+1}\\,dx$',
          curve: 'line',
          fn: (x) => (2 * x) / (x * x + 1),
          a: 0,
          initialB: 2,
          xMin: 0,
          xMax: 5,
        },
      },
      {
        id: 'sub-limits',
        type: 'multiple-choice',
        title: 'Change the limits',
        prompt:
          'For the definite integral $\\int_{0}^{2} \\dfrac{2x}{x^{2}+1}\\,dx$ with $u = x^{2}+1$, the new $u$-limits are',
        options: [
          { id: '1to5', label: 'from $u = 1$ to $u = 5$' },
          { id: '0to2', label: 'from $u = 0$ to $u = 2$' },
          { id: '0to4', label: 'from $u = 0$ to $u = 4$' },
          { id: '1to4', label: 'from $u = 1$ to $u = 4$' },
        ],
        correctOptionId: '1to5',
        correctExplanation:
          'Correct. $u(0) = 0^{2}+1 = 1$ and $u(2) = 2^{2}+1 = 5$, so the integral becomes $$\\int_{1}^{5}\\tfrac{1}{u}\\,du = \\ln 5.$$',
        incorrectExplanation:
          'Substitute each $x$-limit into $u = x^{2}+1$: $u(0) = 1$ and $u(2) = 5$.',
        hint: 'Plug the old limits $x = 0$ and $x = 2$ into $u = x^{2}+1$.',
        visual: {
          type: 'function-explorer',
          label: 'Mapping limits through $u = x^{2}+1$: $x=0 \\mapsto 1$, $x=2 \\mapsto 5$',
          fn: (x) => x * x + 1,
          xMin: 0,
          xMax: 3,
          markedX: 2,
          initialX: 2,
        },
      },
    ],
  },
  {
    id: 'toi-integration-by-parts',
    chapterId: 'techniques-of-integration',
    title: 'Integration by Parts',
    description:
      'Reversing the product rule to integrate products such as $x e^{x}$, $x \\sin x$, and $\\ln x$.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'parts-formula',
        type: 'concept',
        title: 'Reversing the product rule',
        body: 'Integrating the product rule gives integration by parts: $$\\int u\\,dv = uv - \\int v\\,du.$$ Split the integrand into a part $u$ to differentiate and a part $dv$ to integrate, choosing them so the remaining integral $\\int v\\,du$ is easier than the one you started with.',
        visual: {
          type: 'function-explorer',
          label: 'The product $y = x e^{x}$ to be integrated by parts',
          fn: (x) => x * Math.exp(x),
          xMin: 0,
          xMax: 2,
          initialX: 1,
        },
        interactiveNote:
          'Drag the point along the curve to read $(x,\\,f(x))$ for the product $y = x e^{x}$; seeing it as one tangled product is the cue to split it into a part $u$ to differentiate and a part $dv$ to integrate.',
      },
      {
        id: 'parts-choose-u',
        type: 'multiple-choice',
        title: 'Choosing $u$',
        prompt:
          'For $\\int x e^{x}\\,dx$, which choice of $u$ makes the leftover integral simpler?',
        options: [
          { id: 'u-x', label: '$u = x$, so $du = dx$' },
          { id: 'u-ex', label: '$u = e^{x}$, so $du = e^{x}\\,dx$' },
          { id: 'u-xex', label: '$u = x e^{x}$' },
          { id: 'u-dx', label: '$u = dx$' },
        ],
        correctOptionId: 'u-x',
        correctExplanation:
          'Correct. Differentiating $x$ gives $1$, so with $dv = e^{x}\\,dx$ the new integral $\\int e^{x}\\,dx$ is trivial.',
        incorrectExplanation:
          'Pick $u$ so that $du$ is simpler. Letting $u = x$ collapses the polynomial factor to $1$.',
        hint: 'Choose the factor that gets simpler when differentiated.',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_0^b x e^{x}\\,dx$',
          curve: 'line',
          fn: (x) => x * Math.exp(x),
          a: 0,
          initialB: 2,
          xMin: 0,
          xMax: 2,
        },
      },
      {
        id: 'parts-result',
        type: 'multiple-choice',
        title: 'Finish by parts',
        prompt: 'Evaluate $\\int x e^{x}\\,dx$.',
        options: [
          { id: 'result', label: '$x e^{x} - e^{x} + C$' },
          { id: 'no-minus', label: '$x e^{x} + e^{x} + C$' },
          { id: 'half', label: '$\\tfrac{1}{2}x^{2}e^{x} + C$' },
          { id: 'plain', label: '$x e^{x} + C$' },
        ],
        correctOptionId: 'result',
        correctExplanation:
          'Correct. With $u = x$ and $dv = e^{x}\\,dx$: $$uv - \\int v\\,du = x e^{x} - \\int e^{x}\\,dx = x e^{x} - e^{x} + C.$$',
        incorrectExplanation:
          'Apply $uv - \\int v\\,du$ with $v = e^{x}$ and $\\int v\\,du = \\int e^{x}\\,dx = e^{x}$.',
        hint: 'Subtract $\\int e^{x}\\,dx$ from $x e^{x}$.',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_0^2 x e^{x}\\,dx$ accumulating to $e^{2}+1$',
          curve: 'line',
          fn: (x) => x * Math.exp(x),
          a: 0,
          initialB: 2,
          mode: 'accumulation',
          showAccumulationCurve: true,
          xMin: 0,
          xMax: 2,
        },
      },
      {
        id: 'parts-lnx',
        type: 'multiple-choice',
        title: 'A hidden product',
        prompt:
          'To integrate $\\int \\ln x\\,dx$ by parts, the right choice is',
        options: [
          { id: 'std', label: '$u = \\ln x,\\ dv = dx$' },
          { id: 'swap', label: '$u = x,\\ dv = \\ln x\\,dx$' },
          { id: 'one', label: '$u = 1,\\ dv = \\ln x\\,dx$' },
          { id: 'recip', label: '$u = \\tfrac{1}{x},\\ dv = dx$' },
        ],
        correctOptionId: 'std',
        correctExplanation:
          'Correct. With $u = \\ln x$ and $dv = dx$: $$x\\ln x - \\int x\\cdot\\tfrac{1}{x}\\,dx = x\\ln x - x + C.$$',
        incorrectExplanation:
          'There is no obvious $dv$, so take $dv = dx$ and differentiate $u = \\ln x$ into $\\tfrac{1}{x}$.',
        hint: 'Treat $\\ln x$ as $\\ln x \\cdot 1$ and let $dv = dx$.',
        visual: {
          type: 'function-explorer',
          label: 'The integrand $y = \\ln x$',
          preset: 'ln',
          xMin: 0.2,
          xMax: 5,
          initialX: 1,
        },
      },
    ],
  },
  {
    id: 'toi-trigonometric-integrals',
    chapterId: 'techniques-of-integration',
    title: 'Trigonometric Integrals',
    description:
      'Strategies for integrating powers and products of sine, cosine, tangent, and secant.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'trig-powers',
        type: 'concept',
        title: 'Odd powers split off a factor',
        body: 'For $\\int \\sin^{m}x\\cos^{n}x\\,dx$ with an odd power, peel one factor off and convert the rest with $$\\sin^{2}x + \\cos^{2}x = 1.$$ The peeled factor becomes $du$ for a substitution. When both powers are even, lower them with the half-angle identities instead.',
        visual: {
          type: 'function-explorer',
          label: 'An odd power: $y = \\sin^{3}x$',
          fn: (x) => Math.sin(x) ** 3,
          xMin: 0,
          xMax: 2 * Math.PI,
          initialX: Math.PI / 2,
        },
        interactiveNote:
          'Drag the point along the curve $y = \\sin^{3}x$ and watch the readout $(x,\\,f(x))$; picture peeling one $\\sin x$ off as the $du$ while the leftover $\\sin^{2}x$ becomes $1-\\cos^{2}x$.',
      },
      {
        id: 'trig-sin-cubed',
        type: 'multiple-choice',
        title: 'Set up an odd power',
        prompt: 'For $\\int \\sin^{3}x\\,dx$, rewrite $\\sin^{3}x$ as',
        options: [
          { id: 'split', label: '$(1 - \\cos^{2}x)\\sin x$' },
          { id: 'wrong', label: '$(1 + \\cos^{2}x)\\sin x$' },
          { id: 'cos', label: '$\\cos^{2}x\\sin x$' },
          { id: 'square', label: '$\\sin^{2}x$' },
        ],
        correctOptionId: 'split',
        correctExplanation:
          'Correct. Save one $\\sin x$ and convert $\\sin^{2}x = 1 - \\cos^{2}x$, ready for $u = \\cos x$.',
        incorrectExplanation:
          'Use $\\sin^{2}x = 1 - \\cos^{2}x$ on two factors, keeping one $\\sin x$ for $du$.',
        hint: 'Keep one $\\sin x$; rewrite the rest with the Pythagorean identity.',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_0^b \\sin^{3}x\\,dx$',
          curve: 'sine',
          fn: (x) => Math.sin(x) ** 3,
          a: 0,
          initialB: Math.PI,
          xMin: 0,
          xMax: Math.PI,
        },
      },
      {
        id: 'trig-even-power',
        type: 'multiple-choice',
        title: 'Even powers',
        prompt: 'To integrate $\\int \\cos^{2}x\\,dx$, the most useful tool is',
        options: [
          { id: 'half-angle', label: 'the half-angle identity $\\cos^{2}x = \\tfrac{1 + \\cos 2x}{2}$' },
          { id: 'parts', label: 'integration by parts only' },
          { id: 'sub', label: 'the substitution $u = \\cos x$' },
          { id: 'nothing', label: 'no identity is needed' },
        ],
        correctOptionId: 'half-angle',
        correctExplanation:
          'Correct. The half-angle identity turns the even power into $\\tfrac{1}{2} + \\tfrac{1}{2}\\cos 2x$, which integrates directly.',
        incorrectExplanation:
          'An even power has no spare factor to substitute, so lower it with the half-angle identity.',
        hint: 'There is no leftover factor for substitution; reduce the power with an identity.',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_0^b \\cos^{2}x\\,dx$',
          curve: 'cosine',
          fn: (x) => Math.cos(x) ** 2,
          a: 0,
          initialB: Math.PI,
          xMin: 0,
          xMax: Math.PI,
        },
      },
      {
        id: 'trig-tan-sec',
        type: 'multiple-choice',
        title: 'Tangent and secant',
        prompt:
          'For $\\int \\tan x \\sec^{2}x\\,dx$, the substitution that works is',
        options: [
          { id: 'u-tan', label: '$u = \\tan x$, so $du = \\sec^{2}x\\,dx$' },
          { id: 'u-sec', label: '$u = \\sec x$, so $du = \\sec x \\tan x\\,dx$' },
          { id: 'u-cos', label: '$u = \\cos x$, so $du = -\\sin x\\,dx$' },
          { id: 'u-x', label: '$u = x$, so $du = dx$' },
        ],
        correctOptionId: 'u-tan',
        correctExplanation:
          'Correct. With $u = \\tan x$, $du = \\sec^{2}x\\,dx$, giving $$\\int u\\,du = \\tfrac{1}{2}\\tan^{2}x + C.$$',
        incorrectExplanation:
          'The factor $\\sec^{2}x\\,dx$ is the derivative of $\\tan x$, so let $u = \\tan x$.',
        hint: 'One factor is exactly the derivative of $\\tan x$.',
        visual: {
          type: 'function-explorer',
          label: 'The integrand $y = \\tan x \\sec^{2}x$ near the origin',
          fn: (x) => Math.tan(x) / (Math.cos(x) * Math.cos(x)),
          xMin: -1,
          xMax: 1,
          initialX: 0.5,
        },
      },
    ],
  },
  {
    id: 'toi-trigonometric-substitution',
    chapterId: 'techniques-of-integration',
    title: 'Trigonometric Substitution',
    description:
      'Clearing square roots such as $\\sqrt{a^{2}-x^{2}}$ by substituting a trigonometric function for $x$.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'trig-sub-idea',
        type: 'concept',
        title: 'Turn a root into an identity',
        body: 'When an integrand contains $\\sqrt{a^{2}-x^{2}}$, the substitution $x = a\\sin\\theta$ collapses the root using $$1 - \\sin^{2}\\theta = \\cos^{2}\\theta.$$ The companions $x = a\\tan\\theta$ and $x = a\\sec\\theta$ handle $\\sqrt{a^{2}+x^{2}}$ and $\\sqrt{x^{2}-a^{2}}$.',
        visual: {
          type: 'function-explorer',
          label: 'Clearing $\\sqrt{a^{2}-x^{2}}$ with $a = 2$: a semicircle of radius $2$',
          fn: (x) => Math.sqrt(4 - x * x),
          xMin: -2,
          xMax: 2,
          initialX: 0,
        },
        interactiveNote:
          'Drag the point along the semicircle $y = \\sqrt{4 - x^{2}}$ and read off $(x,\\,f(x))$; that height is the very root $\\sqrt{a^{2}-x^{2}}$ that the substitution $x = 2\\sin\\theta$ turns into $2\\cos\\theta$.',
      },
      {
        id: 'trig-sub-choose',
        type: 'multiple-choice',
        title: 'Pick the substitution',
        prompt:
          'For $\\int \\sqrt{9 - x^{2}}\\,dx$, which substitution clears the root?',
        options: [
          { id: 'sin', label: '$x = 3\\sin\\theta$' },
          { id: 'tan', label: '$x = 3\\tan\\theta$' },
          { id: 'sec', label: '$x = 3\\sec\\theta$' },
          { id: 'exp', label: '$x = e^{\\theta}$' },
        ],
        correctOptionId: 'sin',
        correctExplanation:
          'Correct. With $x = 3\\sin\\theta$, $9 - x^{2} = 9\\cos^{2}\\theta$, so the root becomes $3\\cos\\theta$.',
        incorrectExplanation:
          'The form $a^{2} - x^{2}$ calls for $x = a\\sin\\theta$; here $a = 3$.',
        hint: 'Which identity rewrites a difference $a^{2} - x^{2}$ as a single square?',
        visual: {
          type: 'function-explorer',
          label: '$y = \\sqrt{9 - x^{2}}$ (semicircle of radius $3$)',
          fn: (x) => Math.sqrt(9 - x * x),
          xMin: -3,
          xMax: 3,
          initialX: 0,
        },
      },
      {
        id: 'trig-sub-match',
        type: 'multiple-choice',
        title: 'Match the form',
        prompt:
          'Which substitution suits an integrand containing $\\sqrt{x^{2} + 4}$?',
        options: [
          { id: 'tan', label: '$x = 2\\tan\\theta$' },
          { id: 'sin', label: '$x = 2\\sin\\theta$' },
          { id: 'sec', label: '$x = 2\\sec\\theta$' },
          { id: 'cos', label: '$x = 2\\cos\\theta$' },
        ],
        correctOptionId: 'tan',
        correctExplanation:
          'Correct. A sum $a^{2} + x^{2}$ uses $x = a\\tan\\theta$, since $$1 + \\tan^{2}\\theta = \\sec^{2}\\theta.$$',
        incorrectExplanation:
          'A sum under the root, $a^{2} + x^{2}$, calls for the tangent substitution.',
        hint: 'Which identity rewrites a sum $a^{2} + x^{2}$ as a single square?',
        visual: {
          type: 'function-explorer',
          label: '$y = \\sqrt{x^{2} + 4}$',
          fn: (x) => Math.sqrt(x * x + 4),
          xMin: -4,
          xMax: 4,
          initialX: 1,
        },
      },
      {
        id: 'trig-sub-arcsin',
        type: 'multiple-choice',
        title: 'A standard result',
        prompt: 'Using $x = a\\sin\\theta$, evaluate $$\\int \\dfrac{dx}{\\sqrt{a^{2}-x^{2}}}.$$',
        options: [
          { id: 'arcsin', label: '$\\arcsin\\dfrac{x}{a} + C$' },
          { id: 'arctan', label: '$\\dfrac{1}{a}\\arctan\\dfrac{x}{a} + C$' },
          { id: 'log', label: '$\\ln\\big|x + \\sqrt{a^{2}-x^{2}}\\big| + C$' },
          { id: 'arccos', label: '$\\arccos\\dfrac{x}{a} + C$' },
        ],
        correctOptionId: 'arcsin',
        correctExplanation:
          'Correct. The root becomes $a\\cos\\theta$ and $dx = a\\cos\\theta\\,d\\theta$, so the integral is $$\\int d\\theta = \\theta = \\arcsin\\tfrac{x}{a} + C.$$',
        incorrectExplanation:
          'After substituting, $\\sqrt{a^{2}-x^{2}} = a\\cos\\theta$ cancels $dx = a\\cos\\theta\\,d\\theta$, leaving $\\int d\\theta$.',
        hint: 'The numerator and the cleared root cancel, leaving $\\int d\\theta$.',
        visual: {
          type: 'function-explorer',
          label: 'The integrand $y = \\dfrac{1}{\\sqrt{4 - x^{2}}}$ with $a = 2$',
          fn: (x) => 1 / Math.sqrt(4 - x * x),
          xMin: -1.9,
          xMax: 1.9,
          initialX: 0,
        },
      },
    ],
  },
  {
    id: 'toi-partial-fractions',
    chapterId: 'techniques-of-integration',
    title: 'Partial Fraction Decomposition',
    description:
      'Splitting a proper rational function into simpler fractions you can integrate term by term.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'partial-idea',
        type: 'concept',
        title: 'Break apart a rational function',
        body: 'A proper rational function with a factorable denominator can be rewritten as a sum of simpler fractions. For distinct linear factors, $$\\dfrac{1}{(x-1)(x+2)} = \\dfrac{A}{x-1} + \\dfrac{B}{x+2},$$ and each piece integrates to a logarithm.',
        visual: {
          type: 'function-explorer',
          label: 'The pieces $\\tfrac{A}{x-1}$ and $\\tfrac{B}{x+2}$ that sum to $\\tfrac{1}{(x-1)(x+2)}$',
          fn: (x) => (1 / 3) / (x - 1),
          secondaryFn: (x) => (-1 / 3) / (x + 2),
          asymptotes: { vertical: [1, -2] },
          xMin: -5,
          xMax: 5,
          yMin: -3,
          yMax: 3,
        },
        interactiveNote:
          'Drag the point along the curve to read $(x,\\,f(x))$ for the two pieces $\\dfrac{A}{x-1}$ and $\\dfrac{B}{x+2}$ drawn in the interactive; notice each carries just one asymptote (at $x=1$ and $x=-2$) and together they rebuild $\\dfrac{1}{(x-1)(x+2)}$.',
      },
      {
        id: 'partial-coefficient',
        type: 'multiple-choice',
        title: 'Find a coefficient',
        prompt:
          'In $\\dfrac{1}{(x-1)(x+2)} = \\dfrac{A}{x-1} + \\dfrac{B}{x+2}$, what is $A$?',
        options: [
          { id: 'third', label: '$\\tfrac{1}{3}$' },
          { id: 'neg-third', label: '$-\\tfrac{1}{3}$' },
          { id: 'one', label: '$1$' },
          { id: 'half', label: '$\\tfrac{1}{2}$' },
        ],
        correctOptionId: 'third',
        correctExplanation:
          'Correct. Clear denominators and set $x = 1$: $1 = A(1 + 2)$, so $A = \\tfrac{1}{3}$.',
        incorrectExplanation:
          'Cover up $x - 1$ and substitute $x = 1$ into the rest: $\\dfrac{1}{1 + 2} = \\tfrac{1}{3}$.',
        hint: 'Plug in the root $x = 1$ after clearing denominators.',
        visual: {
          type: 'function-explorer',
          label: '$y = \\dfrac{1}{(x-1)(x+2)}$',
          fn: (x) => 1 / ((x - 1) * (x + 2)),
          asymptotes: { vertical: [1, -2] },
          xMin: -4,
          xMax: 4,
          yMin: -3,
          yMax: 3,
          initialX: 2.5,
        },
      },
      {
        id: 'partial-integrate',
        type: 'multiple-choice',
        title: 'Integrate a piece',
        prompt: 'What is $\\int \\dfrac{1}{x-1}\\,dx$?',
        options: [
          { id: 'ln', label: '$\\ln|x-1| + C$' },
          { id: 'recip', label: '$-\\dfrac{1}{(x-1)^{2}} + C$' },
          { id: 'power', label: '$\\dfrac{(x-1)^{2}}{2} + C$' },
          { id: 'arctan', label: '$\\arctan(x-1) + C$' },
        ],
        correctOptionId: 'ln',
        correctExplanation:
          'Correct. A linear denominator integrates to a natural log: $\\ln|x-1| + C$.',
        incorrectExplanation:
          'Each $\\dfrac{1}{x - r}$ term integrates to $\\ln|x - r|$.',
        hint: 'Think of the $\\tfrac{1}{u}$ integral with $u = x - 1$.',
        visual: {
          type: 'area-accumulation',
          label: 'Accumulating area under $y = \\frac{1}{x-1}$',
          curve: 'reciprocal-square',
          fn: (x) => 1 / (x - 1),
          a: 2,
          initialB: 4,
          xMin: 1.2,
          xMax: 6,
        },
      },
      {
        id: 'partial-setup',
        type: 'multiple-choice',
        title: 'The right template',
        prompt:
          'Which decomposition template fits $\\dfrac{1}{(x-1)(x^{2}+1)}$?',
        options: [
          { id: 'linear-quad', label: '$\\dfrac{A}{x-1} + \\dfrac{Bx + C}{x^{2}+1}$' },
          { id: 'two-const', label: '$\\dfrac{A}{x-1} + \\dfrac{B}{x^{2}+1}$' },
          { id: 'three-lin', label: '$\\dfrac{A}{x-1} + \\dfrac{B}{x+1} + \\dfrac{C}{x-1}$' },
          { id: 'one-term', label: '$\\dfrac{Ax + B}{(x-1)(x^{2}+1)}$' },
        ],
        correctOptionId: 'linear-quad',
        correctExplanation:
          'Correct. An irreducible quadratic factor gets a linear numerator $Bx + C$, while the linear factor gets a constant $A$.',
        incorrectExplanation:
          'A quadratic factor that cannot be factored over the reals needs a numerator of the form $Bx + C$.',
        hint: 'How many unknowns does an irreducible quadratic factor require on top?',
        visual: {
          type: 'function-explorer',
          label: '$y = \\dfrac{1}{(x-1)(x^{2}+1)}$ has one real asymptote at $x = 1$',
          fn: (x) => 1 / ((x - 1) * (x * x + 1)),
          asymptotes: { vertical: [1] },
          xMin: -4,
          xMax: 4,
          yMin: -3,
          yMax: 3,
          initialX: 2,
        },
      },
    ],
  },
  {
    id: 'toi-hyperbolic-functions',
    chapterId: 'techniques-of-integration',
    title: 'Hyperbolic Functions',
    description:
      'The functions $\\cosh x$ and $\\sinh x$, their identities, and the integrals they unlock.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'hyp-definition',
        type: 'concept',
        title: 'Cosh and sinh from exponentials',
        body: 'The hyperbolic functions are built from exponentials: $$\\cosh x = \\dfrac{e^{x}+e^{-x}}{2}$$ and $$\\sinh x = \\dfrac{e^{x}-e^{-x}}{2}.$$ They parametrize the hyperbola $x^{2}-y^{2}=1$ and obey the identity $$\\cosh^{2}x - \\sinh^{2}x = 1.$$ Their derivatives mirror sine and cosine without the sign flips: $\\tfrac{d}{dx}\\cosh x = \\sinh x$ and $\\tfrac{d}{dx}\\sinh x = \\cosh x$.',
        visual: {
          type: 'function-explorer',
          label: 'The catenary $y = \\cosh x = \\tfrac{1}{2}(e^{x}+e^{-x})$',
          fn: (x) => Math.cosh(x),
          xMin: -2,
          xMax: 2,
          initialX: 0,
        },
        interactiveNote:
          'Drag the point along the catenary $y = \\cosh x$ and read $(x,\\,f(x))$; notice it bottoms out at $1$ when $x = 0$ and climbs symmetrically on both sides, exactly the average of $e^{x}$ and $e^{-x}$.',
      },
      {
        id: 'hyp-integral',
        type: 'multiple-choice',
        title: 'Integrating cosh',
        prompt: 'What is $\\int \\cosh x\\,dx$?',
        options: [
          { id: 'sinh', label: '$\\sinh x + C$' },
          { id: 'neg-sinh', label: '$-\\sinh x + C$' },
          { id: 'cosh', label: '$\\cosh x + C$' },
          { id: 'neg-cosh', label: '$-\\cosh x + C$' },
        ],
        correctOptionId: 'sinh',
        correctExplanation:
          'Correct. Since $\\tfrac{d}{dx}\\sinh x = \\cosh x$, we have $$\\int \\cosh x\\,dx = \\sinh x + C.$$',
        incorrectExplanation:
          'Reverse the derivative $\\tfrac{d}{dx}\\sinh x = \\cosh x$ to get $\\sinh x + C$.',
        hint: 'Which hyperbolic function has $\\cosh x$ as its derivative?',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_0^b \\cosh x\\,dx = \\sinh b$',
          curve: 'line',
          fn: (x) => Math.cosh(x),
          a: 0,
          initialB: 1.5,
          xMin: 0,
          xMax: 2,
        },
      },
      {
        id: 'hyp-identity',
        type: 'multiple-choice',
        title: 'The core identity',
        prompt: 'For every $x$, $\\cosh^{2}x - \\sinh^{2}x$ equals',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'cosh2x', label: '$\\cosh 2x$' },
          { id: 'neg-one', label: '$-1$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. Expanding the exponential definitions, the cross terms cancel and $$\\cosh^{2}x - \\sinh^{2}x = 1.$$',
        incorrectExplanation:
          'This is the hyperbolic analogue of $\\sin^{2}+\\cos^{2}=1$, but with a minus sign: it equals $1$.',
        hint: 'It is the hyperbolic cousin of the Pythagorean identity.',
        visual: {
          type: 'function-explorer',
          label: 'Comparing $y = \\cosh x$ and $y = \\sinh x$',
          fn: (x) => Math.cosh(x),
          secondaryFn: (x) => Math.sinh(x),
          xMin: -2,
          xMax: 2,
          yMin: -3,
          yMax: 4,
        },
      },
      {
        id: 'hyp-inverse',
        type: 'multiple-choice',
        title: 'An integral in disguise',
        prompt: 'What is $\\int \\dfrac{1}{\\sqrt{x^{2}+1}}\\,dx$?',
        options: [
          { id: 'arsinh', label: '$\\sinh^{-1}x + C = \\ln\\big(x + \\sqrt{x^{2}+1}\\big) + C$' },
          { id: 'arcosh', label: '$\\cosh^{-1}x + C$' },
          { id: 'arctan', label: '$\\arctan x + C$' },
          { id: 'arcsin', label: '$\\arcsin x + C$' },
        ],
        correctOptionId: 'arsinh',
        correctExplanation:
          'Correct. This is the signature inverse-hyperbolic form: $$\\int \\tfrac{dx}{\\sqrt{x^{2}+1}} = \\sinh^{-1}x + C = \\ln\\big(x+\\sqrt{x^{2}+1}\\big) + C.$$',
        incorrectExplanation:
          'A $\\sqrt{x^{2}+1}$ in the denominator points to $\\sinh^{-1}x$, the inverse of $\\sinh$.',
        hint: 'The root $\\sqrt{x^{2}+1}$ is the hallmark of $\\sinh^{-1}$.',
        visual: {
          type: 'function-explorer',
          label: 'The integrand $y = \\dfrac{1}{\\sqrt{x^{2}+1}}$',
          fn: (x) => 1 / Math.sqrt(x * x + 1),
          xMin: -4,
          xMax: 4,
          initialX: 0,
        },
      },
    ],
  },
  {
    id: 'toi-lhopital',
    chapterId: 'techniques-of-integration',
    title: "L'Hopital's Rule",
    description:
      'Resolving indeterminate limits of the form $\\tfrac{0}{0}$ and $\\tfrac{\\infty}{\\infty}$ by comparing derivatives.',
    status: 'available',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'lhop-idea',
        type: 'concept',
        title: 'When a limit fights back',
        body: 'Some limits return an indeterminate form like $\\tfrac{0}{0}$ or $\\tfrac{\\infty}{\\infty}$, where the answer is not yet decided. In those cases, $$\\lim \\dfrac{f(x)}{g(x)} = \\lim \\dfrac{f\'(x)}{g\'(x)},$$ provided the new limit exists. Replacing the ratio of functions by the ratio of their rates of change often resolves the form.',
        visual: {
          type: 'function-explorer',
          label: 'The ratio $y = \\dfrac{\\sin x}{x}$ approaches $1$ as $x \\to 0$, even though it reads $\\tfrac{0}{0}$ there',
          fn: (x) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x),
          xMin: -10,
          xMax: 10,
          initialX: 1,
        },
        interactiveNote:
          'Drag the point toward $x = 0$ along $y = \\dfrac{\\sin x}{x}$ and watch the readout $(x,\\,f(x))$ ease toward $1$, even though plugging in $x = 0$ only gives the indeterminate $\\tfrac{0}{0}$.',
      },
      {
        id: 'lhop-which-form',
        type: 'multiple-choice',
        title: 'Spot the indeterminate form',
        prompt:
          'As $x \\to 0$, which limit has the indeterminate form $\\tfrac{0}{0}$?',
        options: [
          { id: 'sinx-x', label: '$\\lim\\limits_{x\\to 0} \\dfrac{\\sin x}{x}$' },
          { id: 'cosx-x', label: '$\\lim\\limits_{x\\to 0} \\dfrac{\\cos x}{x}$' },
          { id: 'ratio-const', label: '$\\lim\\limits_{x\\to 0} \\dfrac{x+1}{x+2}$' },
          { id: 'exp', label: '$\\lim\\limits_{x\\to 0} \\dfrac{e^{x}}{x+1}$' },
        ],
        correctOptionId: 'sinx-x',
        correctExplanation:
          'Correct. Both $\\sin x \\to 0$ and $x \\to 0$, giving $\\tfrac{0}{0}$ — exactly the form the rule resolves.',
        incorrectExplanation:
          'Check the numerator and denominator separately. Only $\\tfrac{\\sin x}{x}$ sends both to $0$.',
        hint: 'You need both the top and the bottom to approach $0$.',
        visual: {
          type: 'function-explorer',
          label: '$y = \\dfrac{\\sin x}{x}$ near $x = 0$',
          fn: (x) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x),
          xMin: -6,
          xMax: 6,
          initialX: 0.5,
        },
      },
      {
        id: 'lhop-sinx',
        type: 'multiple-choice',
        title: 'Apply the rule',
        prompt: 'Evaluate $$\\lim\\limits_{x\\to 0} \\dfrac{\\sin x}{x}.$$',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'inf', label: '$\\infty$' },
          { id: 'undef', label: 'the limit does not exist' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. Differentiate top and bottom: $$\\dfrac{\\cos x}{1} \\to \\dfrac{\\cos 0}{1} = 1.$$',
        incorrectExplanation:
          'Replace the ratio by $\\tfrac{(\\sin x)\'}{(x)\'} = \\tfrac{\\cos x}{1}$ and evaluate at $0$.',
        hint: 'The derivative of $\\sin x$ is $\\cos x$, and $\\cos 0 = 1$.',
        visual: {
          type: 'function-explorer',
          label: '$y = \\dfrac{\\sin x}{x} \\to 1$ as $x \\to 0$',
          fn: (x) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x),
          xMin: -10,
          xMax: 10,
          markedX: 0,
          initialX: 2,
        },
      },
      {
        id: 'lhop-growth',
        type: 'multiple-choice',
        title: 'Growth at infinity',
        prompt: 'Evaluate $$\\lim\\limits_{x\\to \\infty} \\dfrac{x}{e^{x}}.$$',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'inf', label: '$\\infty$' },
          { id: 'e', label: '$e$' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. The form is $\\tfrac{\\infty}{\\infty}$; differentiating gives $\\tfrac{1}{e^{x}} \\to 0$, so the exponential wins.',
        incorrectExplanation:
          'Differentiate top and bottom: $\\tfrac{1}{e^{x}} \\to 0$ as $x \\to \\infty$.',
        hint: 'Exponential growth outpaces any power of $x$.',
        visual: {
          type: 'function-explorer',
          label: 'The ratio $y = \\dfrac{x}{e^{x}}$ decays to $0$',
          fn: (x) => x / Math.exp(x),
          xMin: 0,
          xMax: 6,
          initialX: 1,
        },
      },
    ],
  },
  {
    id: 'toi-improper-integrals',
    chapterId: 'techniques-of-integration',
    title: 'Improper Integration',
    description:
      'Integrals over infinite intervals or with unbounded integrands, evaluated as limits.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'improper-idea',
        type: 'concept',
        title: 'Integrals as limits',
        body: 'An improper integral has an infinite limit of integration or an integrand that blows up. Define it as a limit: $$\\int_{1}^{\\infty} f(x)\\,dx = \\lim_{b\\to\\infty} \\int_{1}^{b} f(x)\\,dx.$$ If that limit is a finite number the integral converges; otherwise it diverges. Drag the upper limit outward and watch the tail area settle toward a finite value.',
        visual: {
          type: 'area-accumulation',
          label: 'The shrinking tail of $y = 1/x^{2}$ for $x \\ge 1$',
          curve: 'reciprocal-square',
          a: 1,
          initialB: 4,
          xMin: 1,
          xMax: 8,
          mode: 'signed-area',
        },
        interactiveNote:
          'Drag the upper limit $b$ outward and notice each newly shaded sliver under $y = 1/x^{2}$ is thinner than the last, so the accumulated signed area barely moves \u2014 the visual signature of a tail that converges to a finite value.',
      },
      {
        id: 'improper-converge',
        type: 'multiple-choice',
        title: 'Convergence of a power',
        prompt: 'Does $\\int_{1}^{\\infty} \\dfrac{1}{x^{2}}\\,dx$ converge, and to what?',
        options: [
          { id: 'one', label: 'Converges to $1$' },
          { id: 'diverges', label: 'Diverges to $\\infty$' },
          { id: 'two', label: 'Converges to $2$' },
          { id: 'zero', label: 'Converges to $0$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. $$\\int_{1}^{b} x^{-2}\\,dx = 1 - \\tfrac{1}{b} \\to 1$$ as $b \\to \\infty$.',
        incorrectExplanation:
          'Integrate to $-\\tfrac{1}{x}$, evaluate from $1$ to $b$, then take $b \\to \\infty$.',
        hint: 'Find $-\\tfrac{1}{x}\\big|_{1}^{b}$ and let $b$ grow.',
        visual: {
          type: 'area-accumulation',
          label: 'The accumulating tail of $\\int_1^b x^{-2}\\,dx$ as $b$ grows',
          curve: 'reciprocal-square',
          a: 1,
          initialB: 4,
          xMin: 1,
          xMax: 8,
          mode: 'accumulation',
          showAccumulationCurve: true,
        },
      },
      {
        id: 'improper-diverge',
        type: 'multiple-choice',
        title: 'A divergent case',
        prompt: 'What happens with $\\int_{1}^{\\infty} \\dfrac{1}{x}\\,dx$?',
        options: [
          { id: 'diverges', label: 'It diverges' },
          { id: 'one', label: 'Converges to $1$' },
          { id: 'ln2', label: 'Converges to $\\ln 2$' },
          { id: 'zero', label: 'Converges to $0$' },
        ],
        correctOptionId: 'diverges',
        correctExplanation:
          'Correct. $$\\int_{1}^{b}\\tfrac{1}{x}\\,dx = \\ln b,$$ which grows without bound, so the integral diverges.',
        incorrectExplanation:
          'The antiderivative $\\ln b$ has no finite limit as $b \\to \\infty$, so it diverges.',
        hint: 'The antiderivative is $\\ln x$; does $\\ln b$ settle down?',
        visual: {
          type: 'area-accumulation',
          label: 'The accumulating tail of $\\int_1^b x^{-1}\\,dx$ as $b$ grows',
          curve: 'reciprocal-square',
          fn: (x) => 1 / x,
          a: 1,
          initialB: 6,
          xMin: 1,
          xMax: 8,
        },
      },
      {
        id: 'improper-ptest',
        type: 'multiple-choice',
        title: 'The p-test',
        prompt:
          'For which values of $p$ does $\\int_{1}^{\\infty} \\dfrac{1}{x^{p}}\\,dx$ converge?',
        options: [
          { id: 'gt1', label: '$p > 1$' },
          { id: 'lt1', label: '$p < 1$' },
          { id: 'eq1', label: 'only $p = 1$' },
          { id: 'all', label: 'every $p$' },
        ],
        correctOptionId: 'gt1',
        correctExplanation:
          'Correct. On $[1,\\infty)$ the tail is small enough to converge exactly when $p > 1$; at $p = 1$ and below it diverges.',
        incorrectExplanation:
          'The power must decay fast enough: convergence on $[1,\\infty)$ happens precisely when $p > 1$.',
        hint: 'Compare with $\\tfrac{1}{x}$ ($p = 1$), which already diverges.',
        visual: {
          type: 'riemann-sum',
          label: 'Estimating a convergent tail $\\int_1^b x^{-2}\\,dx$',
          curve: 'reciprocal-square',
          a: 1,
          b: 6,
          n: 5,
          rule: 'right',
          showExactArea: true,
        },
      },
    ],
  },
];
