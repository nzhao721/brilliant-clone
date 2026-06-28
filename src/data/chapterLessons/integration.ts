import type { Lesson } from '../lessons';

/* Lessons for "Integration" (APEX Calculus Ch. 5), used under CC BY-NC 4.0. */

export const integrationLessons: Lesson[] = [
  {
    id: 'integration-antiderivatives',
    chapterId: 'integration',
    title: 'Antiderivatives and Indefinite Integration',
    description:
      'Reversing the derivative: antiderivatives, the indefinite integral, basic rules, and initial value problems.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'antiderivative-idea',
        type: 'concept',
        title: 'Reversing differentiation',
        body: 'An antiderivative of a function $f$ is a function $F$ whose derivative is $f$, that is $F\'(x) = f(x)$. Undoing a derivative never gives just one answer: if $F$ works, so does $F(x) + C$ for any constant $C$, because the derivative of a constant is $0$. The entire family is written with the indefinite integral: $$\\int f(x)\\,dx = F(x) + C$$ Drag the point along the curve and notice that every member of the family $x^2 + C$ shares the same slope $2x$.',
        visual: {
          type: 'function-explorer',
          label: 'Antiderivatives of $2x$ form the family $x^2 + C$.',
          fn: (x) => x * x,
          xMin: -3,
          xMax: 3,
          yMin: -3,
          yMax: 10,
          constantFamily: [-2, -1, 1, 2],
          showCursor: true,
          initialX: 1.2,
        },
        interactiveNote:
          'Drag the cursor along the curve and notice the faint stacked copies stay evenly spaced and never cross; each is another antiderivative $x^2 + C$, differing only by the constant the indefinite integral leaves free.',
      },
      {
        id: 'antiderivative-rules',
        type: 'concept',
        title: 'A table of basic antiderivatives',
        body: 'Reversing each derivative rule gives an integration rule. Running the Power Rule backward gives, whenever $n \\ne -1$: $$\\int x^{n}\\,dx = \\dfrac{x^{n+1}}{n+1} + C$$ Add one to the exponent, then divide by the new exponent. Constants factor out, $\\int k\\,f(x)\\,dx = k\\int f(x)\\,dx$, and integrals split across sums. From the rest of the derivative table: $\\int \\cos x\\,dx = \\sin x + C$, $\\int e^{x}\\,dx = e^{x} + C$, and the case the Power Rule cannot handle, $\\int \\dfrac{1}{x}\\,dx = \\ln|x| + C$.',
        visual: {
          type: 'function-explorer',
          label: '$e^{x}$ is its own antiderivative: $\\int e^{x}\\,dx = e^{x} + C$.',
          preset: 'exp',
          xMin: -2,
          xMax: 2,
          showCursor: true,
          initialX: 0,
        },
        interactiveNote:
          'Drag the cursor along $y = e^x$ and notice the readout $f(x)$ and the curve\'s steepness climb together; the height always equals the slope, which is exactly what makes $e^x$ its own antiderivative.',
      },
      {
        id: 'power-rule-apply',
        type: 'multiple-choice',
        title: 'Integrate a power',
        prompt: 'Evaluate $\\int x^{3}\\,dx$.',
        options: [
          { id: 'a', label: '$\\dfrac{x^{4}}{4} + C$' },
          { id: 'b', label: '$3x^{2} + C$' },
          { id: 'c', label: '$x^{4} + C$' },
          { id: 'd', label: '$\\dfrac{x^{3}}{3} + C$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Add one to the exponent and divide by it: $$\\int x^{3}\\,dx = \\dfrac{x^{4}}{4} + C$$',
        incorrectExplanation:
          'Use $\\int x^{n}\\,dx = \\dfrac{x^{n+1}}{n+1} + C$ with $n = 3$, giving $\\dfrac{x^{4}}{4} + C$.',
        hint: 'Raise the exponent by one, then divide by the new exponent.',
        visual: {
          type: 'function-explorer',
          label: 'The integrand $y = x^{3}$.',
          preset: 'cubic',
          xMin: -2.5,
          xMax: 2.5,
          showCursor: true,
          initialX: 1.3,
        },
      },
      {
        id: 'reciprocal-integral',
        type: 'multiple-choice',
        title: 'The exception to the Power Rule',
        prompt: 'Evaluate $\\int \\dfrac{1}{x}\\,dx$.',
        options: [
          { id: 'a', label: '$\\ln|x| + C$' },
          { id: 'b', label: '$-\\dfrac{1}{x^{2}} + C$' },
          { id: 'c', label: '$\\dfrac{x^{0}}{0} + C$' },
          { id: 'd', label: '$x\\ln x + C$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The Power Rule fails at $n = -1$ (it would divide by zero); instead: $$\\int \\dfrac{1}{x}\\,dx = \\ln|x| + C$$ with the absolute value covering negative $x$.',
        incorrectExplanation:
          'The Power Rule cannot be used here. The antiderivative of $\\dfrac{1}{x}$ is $\\ln|x| + C$.',
        hint: 'Which function has derivative $\\dfrac{1}{x}$? Remember the domain includes negative $x$.',
        visual: {
          type: 'function-explorer',
          label: '$y = \\dfrac{1}{x}$ is defined for negative $x$ as well.',
          preset: 'reciprocal',
          xMin: -4,
          xMax: 4,
          yMin: -4,
          yMax: 4,
          asymptotes: { vertical: [0], horizontal: [0] },
          showCursor: true,
          initialX: 1.5,
        },
      },
      {
        id: 'initial-value-problem',
        type: 'multiple-choice',
        title: 'An initial value problem',
        prompt:
          'Suppose $f\'(x) = 2x$ and $f(0) = 3$. What is $f(x)$?',
        options: [
          { id: 'a', label: '$x^{2} + 3$' },
          { id: 'b', label: '$x^{2}$' },
          { id: 'c', label: '$x^{2} - 3$' },
          { id: 'd', label: '$2x^{2} + 3$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Antidifferentiate to get $f(x) = x^{2} + C$, then use $f(0) = 3$: $0 + C = 3$, so $C = 3$ and $f(x) = x^{2} + 3$.',
        incorrectExplanation:
          'First antidifferentiate: $f(x) = x^{2} + C$. Then the condition $f(0) = 3$ pins down $C = 3$.',
        hint: 'Find the general antiderivative, then choose $C$ so that $f(0) = 3$.',
        visual: {
          type: 'function-explorer',
          label: 'The solution $f(x) = x^{2} + 3$ passes through $(0, 3)$.',
          fn: (x) => x * x + 3,
          xMin: -3,
          xMax: 3,
          yMin: 0,
          yMax: 12,
          markedX: 0,
          showCursor: true,
          initialX: 1.5,
        },
      },
    ],
  },
  {
    id: 'integration-the-definite-integral',
    chapterId: 'integration',
    title: 'The Definite Integral',
    description:
      'The definite integral as total signed area, its properties, and evaluating simple integrals with geometry.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'signed-area',
        type: 'concept',
        title: 'Total signed area',
        body: 'The definite integral $\\int_{a}^{b} f(x)\\,dx$ is the total signed area between $y = f(x)$ and the $x$-axis on $[a, b]$. Area above the axis counts as positive and area below the axis counts as negative, so the integral is the area above minus the area below. The numbers $a$ and $b$ are the limits of integration. Drag the upper limit to sweep out the region and watch the signed total respond as the curve crosses the axis.',
        visual: {
          type: 'area-accumulation',
          label: 'Signed area: the part below the axis subtracts.',
          curve: 'cubic',
          a: 0,
          initialB: 4,
          mode: 'signed-area',
        },
        interactiveNote:
          'Drag the upper limit $b$ and watch the strip switch fill color where the cubic crosses the axis; the stretch below counts as negative, so the $\\int_0^b f$ readout can fall even as the shaded region grows wider.',
      },
      {
        id: 'negative-integral',
        type: 'multiple-choice',
        title: 'A function below the axis',
        prompt:
          'If a continuous function is negative on all of $[a, b]$, then $\\int_{a}^{b} f(x)\\,dx$ is',
        options: [
          { id: 'a', label: 'negative' },
          { id: 'b', label: 'positive' },
          { id: 'c', label: 'zero' },
          { id: 'd', label: 'undefined' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Area below the $x$-axis is counted as negative signed area, so the integral is negative.',
        incorrectExplanation:
          'The definite integral is signed. A region entirely below the axis contributes a negative value.',
        hint: 'What sign does area below the $x$-axis contribute?',
        visual: {
          type: 'area-accumulation',
          label: '$\\sin x$ on $[\\pi, 2\\pi]$ lies below the axis.',
          curve: 'sine',
          a: Math.PI,
          initialB: 2 * Math.PI,
          xMin: 0,
          xMax: 2 * Math.PI,
        },
      },
      {
        id: 'reverse-limits',
        type: 'multiple-choice',
        title: 'Reversing the limits',
        prompt: 'If $\\int_{1}^{4} f(x)\\,dx = 7$, what is $\\int_{4}^{1} f(x)\\,dx$?',
        options: [
          { id: 'a', label: '$-7$' },
          { id: 'b', label: '$7$' },
          { id: 'c', label: '$0$' },
          { id: 'd', label: '$14$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Swapping the limits of integration negates the integral: $$\\int_{4}^{1} f = -\\int_{1}^{4} f = -7$$',
        incorrectExplanation:
          'Reversing the bounds changes the sign, so $$\\int_{4}^{1} f = -7$$',
        hint: 'Swapping the bounds introduces a minus sign.',
        visual: {
          type: 'area-accumulation',
          label: 'Swapping the limits flips the sign of the integral.',
          curve: 'line',
          fn: (x) => x - 1 / 6,
          a: 1,
          initialB: 4,
          xMin: 0,
          xMax: 6,
        },
      },
      {
        id: 'additivity',
        type: 'multiple-choice',
        title: 'Splitting an interval',
        prompt:
          'If $\\int_{0}^{2} f = 3$ and $\\int_{2}^{5} f = 8$, what is $\\int_{0}^{5} f$?',
        options: [
          { id: 'a', label: '$11$' },
          { id: 'b', label: '$5$' },
          { id: 'c', label: '$24$' },
          { id: 'd', label: '$-5$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Integrals add over adjacent intervals: $$\\int_{0}^{5} f = \\int_{0}^{2} f + \\int_{2}^{5} f = 3 + 8 = 11$$',
        incorrectExplanation:
          'Use additivity over adjacent intervals: $$\\int_{0}^{5} f = \\int_{0}^{2} f + \\int_{2}^{5} f$$',
        hint: 'Add the two adjacent pieces.',
        visual: {
          type: 'area-accumulation',
          label: 'Adjacent intervals add: $[0, 2]$ joined to $[2, 5]$.',
          curve: 'line',
          fn: (x) => (7 * x) / 15 + 31 / 30,
          a: 0,
          initialB: 1.5,
          xMin: 0,
          xMax: 6,
        },
      },
      {
        id: 'geometry-triangle',
        type: 'multiple-choice',
        title: 'Evaluate with geometry',
        prompt:
          'Using the area of a triangle, evaluate $\\int_{0}^{4} x\\,dx$.',
        options: [
          { id: 'a', label: '$8$' },
          { id: 'b', label: '$16$' },
          { id: 'c', label: '$4$' },
          { id: 'd', label: '$2$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The region is a triangle with base $4$ and height $4$, so the area is $\\tfrac{1}{2}(4)(4) = 8$.',
        incorrectExplanation:
          'The region under $y = x$ on $[0, 4]$ is a triangle: area $= \\tfrac{1}{2}(4)(4) = 8$.',
        hint: 'The region is a right triangle with base and height both $4$.',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_0^4 x\\,dx$ is the area of a triangle.',
          curve: 'line',
          a: 0,
          initialB: 1.5,
          xMin: 0,
          xMax: 5,
        },
      },
    ],
  },
  {
    id: 'integration-riemann-sums',
    chapterId: 'integration',
    title: 'Riemann Sums',
    description:
      'Approximating area with rectangles, the left, right, and midpoint rules, and the integral as a limit of sums.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'rectangles-idea',
        type: 'concept',
        title: 'Approximating area with rectangles',
        body: 'To estimate the area under a curve that is not a familiar shape, cover it with rectangles. Partition $[a, b]$ into $n$ equal pieces of width $\\Delta x = \\dfrac{b - a}{n}$, build a rectangle on each piece, and add the areas to form a Riemann sum: $$\\sum_{i=1}^{n} f(c_{i})\\,\\Delta x$$ More, thinner rectangles leave smaller gaps, so the estimate improves. Drag the slider to raise $n$ and watch the approximation tighten toward the true area.',
        visual: {
          type: 'riemann-sum',
          label: 'Left sum for $y = x^{2}$ on $[0, 2]$ - drag to change $n$.',
          curve: 'parabola',
          a: 0,
          b: 2,
          n: 4,
          maxN: 40,
          rule: 'left',
          showExactArea: true,
        },
        interactiveNote:
          'Raise $n$ with the slider and watch the rectangle tops close on the hatched exact-area region; each leftover sliver is approximation error, and the reported value tightens toward the true area as the strips get thinner.',
      },
      {
        id: 'left-right-midpoint',
        type: 'concept',
        title: 'Left, right, and midpoint rules',
        body: 'The three standard rules differ only in where each rectangle takes its height, using equally spaced points $x_{i} = a + i\\,\\Delta x$. The Left Hand Rule uses the left endpoint $f(x_{i-1})$, the Right Hand Rule uses the right endpoint $f(x_{i})$, and the Midpoint Rule uses the center of each subinterval. For an increasing function the left sum underestimates and the right sum overestimates, so the exact area is trapped between them.',
        visual: {
          type: 'riemann-sum',
          label: 'Right sum of the increasing $f(x) = x + 1$ overshoots.',
          curve: 'line',
          a: 0,
          b: 4,
          n: 4,
          maxN: 16,
          rule: 'right',
          showExactArea: true,
        },
        interactiveNote:
          'Drag the slider and notice how every right-endpoint rectangle pokes above the rising line $f(x) = x + 1$, keeping the estimate above the exact area; that overshoot is what the Right Hand Rule always produces for an increasing function, and it only shrinks as $n$ climbs.',
      },
      {
        id: 'compute-right-sum',
        type: 'multiple-choice',
        title: 'Compute a right sum',
        prompt:
          'Estimate $\\int_{0}^{2} x^{2}\\,dx$ with two right-endpoint rectangles ($\\Delta x = 1$, heights at $x = 1$ and $x = 2$).',
        options: [
          { id: 'a', label: '$5$' },
          { id: 'b', label: '$4$' },
          { id: 'c', label: '$3$' },
          { id: 'd', label: '$8$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The heights are $f(1) = 1$ and $f(2) = 4$, each times width $1$: $1 + 4 = 5$.',
        incorrectExplanation:
          'Use the right endpoints: $$f(1)\\cdot 1 + f(2)\\cdot 1 = 1 + 4 = 5$$',
        hint: 'Evaluate $x^{2}$ at $x = 1$ and $x = 2$, multiply each by the width $1$, then add.',
        visual: {
          type: 'riemann-sum',
          label: 'Right sum with two strips for $y = x^{2}$ on $[0, 2]$.',
          curve: 'parabola',
          a: 0,
          b: 2,
          n: 2,
          maxN: 10,
          rule: 'right',
          showExactArea: true,
        },
      },
      {
        id: 'delta-x',
        type: 'multiple-choice',
        title: 'Width of a subinterval',
        prompt:
          'A Riemann sum on $[1, 7]$ uses $n = 3$ equal subintervals. What is $\\Delta x$?',
        options: [
          { id: 'a', label: '$2$' },
          { id: 'b', label: '$6$' },
          { id: 'c', label: '$3$' },
          { id: 'd', label: '$1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$\\Delta x = \\dfrac{b - a}{n} = \\dfrac{7 - 1}{3} = 2$$',
        incorrectExplanation:
          'Use $$\\Delta x = \\dfrac{b - a}{n} = \\dfrac{7 - 1}{3} = 2$$',
        hint: 'Divide the interval length $b - a$ by the number of subintervals $n$.',
        visual: {
          type: 'riemann-sum',
          label: 'Three equal strips partition $[1, 7]$.',
          curve: 'line',
          a: 1,
          b: 7,
          n: 3,
          maxN: 12,
          rule: 'left',
        },
      },
      {
        id: 'limit-of-sums',
        type: 'multiple-choice',
        title: 'Toward the exact area',
        prompt: 'How does a Riemann sum become the exact definite integral?',
        options: [
          { id: 'a', label: 'Take the limit as $n \\to \\infty$ (so $\\Delta x \\to 0$)' },
          { id: 'b', label: 'Use fewer, wider rectangles' },
          { id: 'c', label: 'Average the left and right sums one time' },
          { id: 'd', label: 'Double the height of each rectangle' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The definite integral is defined as $$\\lim_{n \\to \\infty} \\sum_{i=1}^{n} f(c_{i})\\,\\Delta x$$ Letting $n$ grow without bound drives the error to zero.',
        incorrectExplanation:
          'Thinner, more numerous rectangles shrink the gaps. The exact value is the limit as $n \\to \\infty$.',
        hint: 'Which choice drives the approximation error all the way to zero?',
        visual: {
          type: 'riemann-sum',
          label: 'Let $n \\to \\infty$: the estimate becomes exact.',
          curve: 'parabola',
          a: 0,
          b: 2,
          n: 4,
          maxN: 50,
          rule: 'left',
          showExactArea: true,
        },
      },
    ],
  },
  {
    id: 'integration-fundamental-theorem-of-calculus',
    chapterId: 'integration',
    title: 'The Fundamental Theorem of Calculus',
    description:
      'The bridge between derivatives and integrals: the area-so-far function and both parts of the theorem.',
    status: 'available',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'area-so-far',
        type: 'concept',
        title: 'The area-so-far function',
        body: 'Fix the lower limit and let the upper limit move: $F(x) = \\int_{a}^{x} f(t)\\,dt$ is the area-so-far function, accumulating signed area from $a$ up to $x$. At the start there is no width, so $F(a) = 0$. Drag the upper limit and watch $F$ trace out as the running total of area under $f$.',
        visual: {
          type: 'area-accumulation',
          label: 'The accumulation function $F(x) = \\int_{0}^{x} f(t)\\,dt$.',
          curve: 'parabola',
          a: 0,
          initialB: 3,
          mode: 'accumulation',
          showAccumulationCurve: true,
        },
        interactiveNote:
          'Drag the upper limit $b$ back to the start and notice the readout $g(b)$ drops to $0$ since no width means no area yet, then watch the traced dot draw out the area-so-far curve as you sweep $b$ higher.',
      },
      {
        id: 'two-parts',
        type: 'concept',
        title: 'The two parts of the theorem',
        body: 'The Fundamental Theorem ties the two integrals together. Part 1 says that differentiating the area-so-far function returns the integrand: $$\\dfrac{d}{dx}\\int_{a}^{x} f(t)\\,dt = f(x)$$ Part 2 turns this into a computation rule: if $F$ is any antiderivative of $f$, then $$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$ So a definite integral can be evaluated by finding one antiderivative and subtracting its values at the two limits.',
        visual: {
          type: 'area-accumulation',
          label: 'Area under $y = x$ accumulates as the smooth function $F$.',
          curve: 'line',
          a: 0,
          initialB: 4,
          mode: 'accumulation',
          showAccumulationCurve: true,
        },
        interactiveNote:
          'Drag the upper limit $b$ and compare the integrand\'s height with the accumulation curve: where $f$ is taller, $g$ climbs more steeply (Part 1, $g\'(x) = f(x)$), while the readout $g(b) = \\int_0^b f$ is exactly the $F(b) - F(a)$ of Part 2.',
      },
      {
        id: 'evaluate-part2',
        type: 'multiple-choice',
        title: 'Evaluate with Part 2',
        prompt: 'Compute $\\int_{0}^{3} 2x\\,dx$.',
        options: [
          { id: 'a', label: '$9$' },
          { id: 'b', label: '$6$' },
          { id: 'c', label: '$3$' },
          { id: 'd', label: '$18$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. An antiderivative of $2x$ is $x^{2}$, so $$\\int_{0}^{3} 2x\\,dx = 3^{2} - 0^{2} = 9$$',
        incorrectExplanation:
          'Find an antiderivative ($x^{2}$), then subtract its values at the bounds: $3^{2} - 0^{2} = 9$.',
        hint: 'An antiderivative of $2x$ is $x^{2}$; evaluate it at $3$ and at $0$.',
        visual: {
          type: 'area-accumulation',
          label: '$\\int_{0}^{3} 2x\\,dx$ as accumulated area.',
          curve: 'line',
          fn: (x) => 2 * x,
          a: 0,
          initialB: 1.5,
          xMin: 0,
          xMax: 6,
        },
      },
      {
        id: 'differentiate-integral',
        type: 'multiple-choice',
        title: 'Differentiate an integral',
        prompt:
          'If $g(x) = \\int_{0}^{x} \\cos t\\,dt$, what is $g\'(x)$?',
        options: [
          { id: 'a', label: '$\\cos x$' },
          { id: 'b', label: '$\\sin x$' },
          { id: 'c', label: '$-\\sin x$' },
          { id: 'd', label: '$1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. By Part 1, differentiating the area-so-far function returns the integrand with the upper limit substituted: $g\'(x) = \\cos x$.',
        incorrectExplanation:
          'Part 1 says $$\\dfrac{d}{dx}\\int_{a}^{x} f(t)\\,dt = f(x)$$ so $g\'(x) = \\cos x$.',
        hint: 'The derivative of the area-so-far function is just the integrand itself.',
        visual: {
          type: 'area-accumulation',
          label: '$g(x) = \\int_{0}^{x} \\cos t\\,dt$ accumulates under $\\cos t$.',
          curve: 'cosine',
          a: 0,
          initialB: Math.PI / 2,
          mode: 'accumulation',
          showAccumulationCurve: true,
          xMin: 0,
          xMax: 2 * Math.PI,
        },
      },
      {
        id: 'net-change',
        type: 'multiple-choice',
        title: 'Integrating a rate of change',
        prompt: 'Part 2 tells us that $\\int_{a}^{b} F\'(x)\\,dx$ equals',
        options: [
          { id: 'a', label: 'the net change $F(b) - F(a)$' },
          { id: 'b', label: 'the derivative $F\'(b)$' },
          { id: 'c', label: 'the product $F(a)\\,F(b)$' },
          { id: 'd', label: 'always zero' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Integrating a rate of change recovers the total change in the original quantity: $$\\int_{a}^{b} F\'(x)\\,dx = F(b) - F(a)$$',
        incorrectExplanation:
          'With $f = F\'$, Part 2 gives the net change: $$\\int_{a}^{b} F\'(x)\\,dx = F(b) - F(a)$$',
        hint: 'Accumulating a rate of change over an interval gives the total change.',
        visual: {
          type: 'area-accumulation',
          label: 'Integrating a rate of change gives total change.',
          curve: 'line',
          a: 0,
          initialB: 4,
          mode: 'accumulation',
          showAccumulationCurve: true,
        },
      },
    ],
  },
  {
    id: 'integration-numerical-integration',
    chapterId: 'integration',
    title: 'Numerical Integration',
    description:
      'Approximating definite integrals when antiderivatives are unavailable: left/right, trapezoidal, midpoint, and Simpson rules.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'why-approximate',
        type: 'concept',
        title: 'When antiderivatives fail',
        body: 'Not every integral can be evaluated with an antiderivative. Functions such as $e^{-x^{2}}$, $\\sin(x^{3})$, and $\\dfrac{\\sin x}{x}$ have no antiderivative built from elementary functions, and sometimes the function itself is unknown and only measured data is available. In these cases we approximate the definite integral by estimating area. The Left and Right Hand Rules do this with rectangles, but they need many strips to be accurate. Drag the slider to watch the rectangle estimate approach the true value of $\\int_{0}^{1} e^{-x^{2}}\\,dx$.',
        visual: {
          type: 'riemann-sum',
          label: '$\\int_{0}^{1} e^{-x^{2}}\\,dx$ has no elementary antiderivative.',
          curve: 'gaussian',
          a: 0,
          b: 1,
          n: 5,
          maxN: 40,
          rule: 'left',
          showExactArea: true,
        },
        interactiveNote:
          'Push $n$ higher with the slider and notice the estimate closing on the exact-area readout for $\\int_0^1 e^{-x^2}\\,dx$; that target cannot come from an antiderivative formula, so accumulating rectangle area is the only way to reach it.',
      },
      {
        id: 'trapezoidal-rule',
        type: 'concept',
        title: 'The Trapezoidal Rule',
        body: 'Replacing each rectangle with a trapezoid whose slanted top joins the curve at both endpoints hugs the graph much better than a flat-topped rectangle. The Trapezoidal Rule adds these trapezoid areas: $$\\int_{a}^{b} f(x)\\,dx \\approx \\dfrac{\\Delta x}{2}\\big[f(x_{0}) + 2f(x_{1}) + \\cdots + 2f(x_{n-1}) + f(x_{n})\\big]$$ Conveniently, this estimate is exactly the average of the Left and Right Hand sums.',
        visual: {
          type: 'riemann-sum',
          label: 'Trapezoids track $\\int_{0}^{1} e^{-x^{2}}\\,dx$ closely.',
          curve: 'gaussian',
          a: 0,
          b: 1,
          n: 5,
          maxN: 20,
          rule: 'trapezoid',
          showExactArea: true,
        },
        interactiveNote:
          'Drag the slider and notice how each trapezoid\'s slanted top meets the curve at both ends, leaving far thinner gaps than a flat rectangle; at the same $n$ the estimate lands closer to the exact area and the reported error is smaller.',
      },
      {
        id: 'trapezoid-average',
        type: 'multiple-choice',
        title: 'Trapezoid as an average',
        prompt:
          'On the same interval with the same $n$, the Trapezoidal Rule estimate equals',
        options: [
          { id: 'a', label: 'the average of the Left and Right Hand sums' },
          { id: 'b', label: 'the Left Hand sum' },
          { id: 'c', label: 'twice the Right Hand sum' },
          { id: 'd', label: 'the exact area, always' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Averaging the trapezoid legs is the same as averaging the left and right rectangle heights, so the Trapezoidal Rule is the mean of the two sums.',
        incorrectExplanation:
          'Each trapezoid area averages the two endpoint heights, so the Trapezoidal Rule equals the average of the Left and Right Hand sums.',
        hint: 'A trapezoid area uses the average of its two parallel sides.',
        visual: {
          type: 'riemann-sum',
          label: 'Trapezoidal estimate for $y = \\sqrt{x}$ on $[0, 4]$.',
          curve: 'sqrt',
          a: 0,
          b: 4,
          n: 4,
          maxN: 16,
          rule: 'trapezoid',
          showExactArea: true,
        },
      },
      {
        id: 'midpoint-rule',
        type: 'multiple-choice',
        title: 'The Midpoint Rule',
        prompt: 'The Midpoint Rule takes each rectangle\'s height from',
        options: [
          { id: 'a', label: 'the midpoint of each subinterval' },
          { id: 'b', label: 'the left endpoint of each subinterval' },
          { id: 'c', label: 'the right endpoint of each subinterval' },
          { id: 'd', label: 'the larger of the two endpoints' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The Midpoint Rule samples $f$ at the center of each subinterval: $$f\\left(\\dfrac{x_{i-1} + x_{i}}{2}\\right)$$',
        incorrectExplanation:
          'The Midpoint Rule uses the height at the center of each subinterval, not at an endpoint.',
        hint: 'The name says where the sample is taken.',
        visual: {
          type: 'riemann-sum',
          label: 'Midpoint rectangles for $y = x^{2}$ on $[0, 2]$.',
          curve: 'parabola',
          a: 0,
          b: 2,
          n: 4,
          maxN: 16,
          rule: 'midpoint',
          showExactArea: true,
        },
      },
      {
        id: 'simpsons-rule',
        type: 'multiple-choice',
        title: 'Simpson\u2019s Rule',
        prompt:
          'Simpson\u2019s Rule approximates the curve on each pair of subintervals with',
        options: [
          { id: 'a', label: 'a parabola through three points' },
          { id: 'b', label: 'a horizontal line' },
          { id: 'c', label: 'a single rectangle' },
          { id: 'd', label: 'a slanted line' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Simpson\u2019s Rule fits a parabola through three equally spaced points on each pair of subintervals, which is why it needs an even number of subintervals and is exact for cubics.',
        incorrectExplanation:
          'Simpson\u2019s Rule uses parabolas, not lines or rectangles; rectangles match constants and the Trapezoidal Rule matches lines.',
        hint: 'It is the next step up from rectangles (constants) and trapezoids (lines).',
        visual: {
          type: 'riemann-sum',
          label: 'Parabolic panels approximate $y = \\sin x$ on $[0, \\pi]$.',
          curve: 'sine',
          a: 0,
          b: Math.PI,
          n: 4,
          maxN: 16,
          rule: 'simpson',
          showExactArea: true,
        },
      },
    ],
  },
];
