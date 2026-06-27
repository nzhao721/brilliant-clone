import type { Lesson } from '../lessons';

// Content adapted from APEX Calculus by Gregory Hartman et al. (VMI),
// licensed CC BY-NC 4.0 — https://www.apexcalculus.com/. Adapted for SlopeWise.
//
// This chapter re-sources "Derivatives" from APEX Calculus, Chapter 2, with one
// lesson per section: the derivative and instantaneous rate of change;
// interpretations of the derivative; basic differentiation rules; the product
// and quotient rules; the chain rule; implicit differentiation; and derivatives
// of inverse functions. Mathematics is copied faithfully as KaTeX and the prose
// adapts APEX's explanations. No source-internal numbering appears in any
// learner-facing string, and every step carries an interactive visual.

export const derivativesLessons: Lesson[] = [
  {
    id: 'derivatives-instantaneous-rate',
    chapterId: 'derivatives',
    title: 'Instantaneous Rates of Change: The Derivative',
    description:
      'Build the derivative as the limit of a difference quotient, see it as the slope of the tangent line, and treat it as a function in its own right.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'average-to-instant',
        type: 'concept',
        title: 'From average to instantaneous rate',
        body:
          "Imagine an object whose height after $t$ seconds is $f(t) = -16t^2 + 150$ feet. Its average velocity over a time interval is the change in height divided by the change in time. On $[2, 3]$ that is: $$\\dfrac{f(3) - f(2)}{3 - 2} = \\dfrac{6 - 86}{1} = -80\\,\\text{ft/s}$$ To capture the velocity at the single instant $t = 2$, shrink the interval to $[2, 2 + h]$ and compute $\\dfrac{f(2 + h) - f(2)}{h}$ for smaller and smaller $h$. As $h \\to 0$ these averages close in on $-64\\,\\text{ft/s}$, the instantaneous velocity. Drag the endpoints below and watch the average rate settle down as the window shrinks.",
        visual: {
          type: 'rate-window',
          label: 'Average rate over an interval; shrink it toward an instant.',
          initialStartX: 2,
          initialEndX: 3,
        },
        interactiveNote:
          "Drag the two endpoints toward each other and watch the average-rate readout settle toward a single number; that limiting value is the instantaneous velocity the shrinking window closes in on.",
      },
      {
        id: 'derivative-at-a-point',
        type: 'concept',
        title: 'The derivative at a point',
        body:
          "The derivative of $f$ at a point $c$ is the limit of those shrinking difference quotients: $$f'(c) = \\lim_{h \\to 0} \\dfrac{f(c + h) - f(c)}{h}$$ provided the limit exists. Geometrically it is the slope of the tangent line at $\\big(c, f(c)\\big)$, the line that best matches the curve there: $$\\ell(x) = f'(c)(x - c) + f(c)$$ Drag the tangent point and read how the slope changes from place to place.",
        visual: {
          type: 'function-explorer',
          label: 'The derivative is the slope of the tangent line at each point.',
          fn: (x) => x * x,
          xMin: -3,
          xMax: 3,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
        interactiveNote:
          "Drag the tangent point along the curve and read how the slope $f'(x)$ changes from place to place; at each spot it is the tilt of the line that best hugs the curve there.",
      },
      {
        id: 'derivative-as-function',
        type: 'concept',
        title: 'The derivative as a function',
        body:
          "Rather than repeating the limit at every separate point, apply it once to a variable $x$: $f'(x) = \\lim_{h \\to 0} \\dfrac{f(x + h) - f(x)}{h}$ is itself a new function, the derivative of $f$. Several notations all name the same object: $$f'(x) = y' = \\dfrac{dy}{dx} = \\dfrac{df}{dx} = \\dfrac{d}{dx}\\big(f\\big)$$ The symbol $\\dfrac{dy}{dx}$ is read as a single object, not a literal fraction, even though it often behaves like one. Toggle the curves to compare $f$ with its derivative $f'$.",
        visual: {
          type: 'function-derivative-overlay',
          label: "Where $f$ rises, $f'$ is positive; where $f$ falls, $f'$ is negative.",
          curveShape: 'valley',
        },
        interactiveNote:
          "Toggle the $f$ and $f'$ curves and trace across the graph: wherever $f$ climbs the $f'$ curve sits above the axis, and wherever $f$ falls it dips below, so $f'$ is a function in its own right.",
      },
      {
        id: 'derivative-from-definition',
        type: 'multiple-choice',
        title: 'Differentiate from the definition',
        prompt:
          "Working the limit definition for $f(x) = 3x^2 + 5x - 7$ gives $f'(x) = 6x + 5$. What is $f'(1)$?",
        options: [
          { id: 'a', label: '$11$' },
          { id: 'b', label: '$23$' },
          { id: 'c', label: '$6$' },
          { id: 'd', label: '$1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          "Substitute into the derivative: $f'(1) = 6(1) + 5 = 11$.",
        incorrectExplanation:
          "Evaluate $f'(x) = 6x + 5$ at $x = 1$. (The value $23$ would be $f'(3)$.)",
        hint: "Substitute $x = 1$ into $f'(x) = 6x + 5$.",
        visual: {
          type: 'function-explorer',
          label: "The slope of $f(x) = 3x^2 + 5x - 7$ at $x = 1$ is $f'(1)$.",
          fn: (x) => 3 * x * x + 5 * x - 7,
          xMin: -4,
          xMax: 2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
      },
      {
        id: 'absolute-value-corner',
        type: 'multiple-choice',
        title: 'Where the derivative fails to exist',
        prompt: 'The function $f(x) = |x|$ has no derivative at $x = 0$. Why?',
        options: [
          {
            id: 'a',
            label:
              'The slope is $-1$ just to the left and $+1$ just to the right, so the limit of the difference quotient does not exist',
          },
          { id: 'b', label: 'The function is undefined at $x = 0$' },
          { id: 'c', label: 'The slope is exactly $0$ there' },
          { id: 'd', label: 'The tangent line is horizontal there' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          "The left-hand difference quotient tends to $-1$ while the right-hand one tends to $+1$. Because the one-sided limits disagree, $f'(0)$ does not exist even though $f$ is continuous there.",
        incorrectExplanation:
          '$|x|$ is defined and continuous at $0$. The trouble is the corner: the slope from the left ($-1$) disagrees with the slope from the right ($+1$).',
        hint: 'Compare the slope just left of the corner with the slope just right of it.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A corner at the vertex of $|x|$: the one-sided slopes disagree.',
          shape: 'corner',
        },
      },
    ],
  },
  {
    id: 'derivatives-interpretations',
    chapterId: 'derivatives',
    title: 'Interpretations of the Derivative',
    description:
      'Read the derivative as an instantaneous rate of change with real units, use it to approximate nearby values, and connect it to velocity and acceleration.',
    status: 'available',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'rate-of-change-units',
        type: 'concept',
        title: 'A rate of change carries units',
        body:
          "If $y = f(x)$, then $f'(x)$ is the instantaneous rate of change of $y$ with respect to $x$: as $x$ moves, how fast does $y$ respond? This makes the units concrete. When $y$ is measured in units $P$ and $x$ in units $Q$, the derivative $\\dfrac{dy}{dx}$ has units of $P$ per $Q$. For a falling object, height in feet over time in seconds yields a velocity in feet per second. Drag the triangle to see slope as rise over run.",
        visual: {
          type: 'slope-triangle',
          label: 'Slope is the change in output divided by the change in input.',
          initialStartX: 1,
          initialStartY: 2,
          initialRise: 4,
          initialRun: 2,
        },
        interactiveNote:
          "Drag either corner of the triangle and watch the rise, run, and slope readouts update; that output-over-input ratio is what stamps a rate with units of $P$ per $Q$.",
      },
      {
        id: 'tangent-approximation',
        type: 'concept',
        title: 'Approximating with the tangent line',
        body:
          "A value together with a rate lets us estimate nearby values: $$f(c + h) \\approx f(c) + f'(c)\\, h$$ for small $h$. Suppose a company's profit satisfies $P(1000) = 500$ dollars with $P'(1000) = 0.25$ dollars per item produced. Then making $100$ more items changes profit by about $0.25 \\cdot 100 = 25$ dollars, so $P(1100) \\approx 525$ dollars. This is exactly the tangent line $y = f'(c)(x - c) + f(c)$ standing in for the curve near $x = c$.",
        visual: {
          type: 'function-explorer',
          label: 'Near a point, the tangent line approximates the curve.',
          fn: (x) => x * x,
          xMin: -3,
          xMax: 3,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1.5,
        },
        interactiveNote:
          "Drag the tangent point and notice how tightly the line clings to the curve nearby but peels away farther off; that close fit is why $f(c) + f'(c)\\,h$ estimates values near $x = c$.",
      },
      {
        id: 'motion-key-idea',
        type: 'concept',
        title: 'Slope, motion, velocity, and acceleration',
        body:
          "Because a difference quotient is a rise over a run, $f'(c)$ is the slope of the tangent line at $x = c$. Applied to motion, this chains together: if $s(t)$ is position, then $s'(t)$ is velocity; if $v(t)$ is velocity, then $v'(t)$ is acceleration. Differentiating converts any quantity into its instantaneous rate of change. Toggle $f$ and $f'$ to see how a maximum of $f$ lines up with a zero of $f'$.",
        visual: {
          type: 'function-derivative-overlay',
          label: "At a peak of $f$, the slope $f'$ passes through zero.",
          curveShape: 'peak',
        },
        interactiveNote:
          "Toggle $f$ and $f'$ and look at the peak of $f$: at that same input the $f'$ curve crosses zero, exactly as a thrown object's velocity vanishes at the top of its arc.",
      },
      {
        id: 'approximate-value',
        type: 'multiple-choice',
        title: 'Use a rate to approximate',
        prompt: "Given $f(5) = 10$ and $f'(5) = 2$, estimate $f(6)$.",
        options: [
          { id: 'a', label: '$12$' },
          { id: 'b', label: '$10$' },
          { id: 'c', label: '$2$' },
          { id: 'd', label: '$20$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          "Use $f(c + h) \\approx f(c) + f'(c)\\, h$ with $c = 5$ and $h = 1$: $10 + 2(1) = 12$.",
        incorrectExplanation:
          "Start at $f(5) = 10$ and add one step of the rate $f'(5) = 2$: the estimate is $12$.",
        hint: "Add one step of the rate $f'(5)$ to the value $f(5)$.",
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent slope is the rate used to step forward.',
          initialX: 2,
          curveShape: 'cubic',
        },
      },
      {
        id: 'units-of-derivative',
        type: 'multiple-choice',
        title: 'Units of a rate',
        prompt:
          "Suppose $V(x)$ measures the noise inside a restaurant, in decibels, when $x$ customers are present. What are the units of $V'(x)$?",
        options: [
          { id: 'a', label: 'decibels per customer' },
          { id: 'b', label: 'customers per decibel' },
          { id: 'c', label: 'decibels' },
          { id: 'd', label: 'customers' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'A derivative has units of output divided by input. Here that is decibels per customer.',
        incorrectExplanation:
          'Take the units of the output ($V$, in decibels) over the units of the input ($x$, in customers): decibels per customer.',
        hint: 'Output units divided by input units.',
        visual: {
          type: 'slope-triangle',
          label: 'Output change over input change sets the units of the rate.',
          initialStartX: 1,
          initialStartY: 1,
          initialRise: 3,
          initialRun: 1,
        },
      },
    ],
  },
  {
    id: 'derivatives-basic-rules',
    chapterId: 'derivatives',
    title: 'Basic Differentiation Rules',
    description:
      'Differentiate without limits using the constant, power, sum, difference, and constant-multiple rules, plus the key function derivatives and higher-order derivatives.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'constant-power-rules',
        type: 'concept',
        title: 'Constant and power rules',
        body:
          'A handful of rules replace the limit definition for everyday functions. Constant rule: $\\dfrac{d}{dx}(c) = 0$, since a constant never changes. Power rule: $\\dfrac{d}{dx}\\big(x^n\\big) = n\\, x^{n-1}$ for any real $n$ — bring down the power, then lower it by one. The same collection records $\\dfrac{d}{dx}(\\sin x) = \\cos x$, $\\dfrac{d}{dx}(\\cos x) = -\\sin x$, $\\dfrac{d}{dx}(e^x) = e^x$, and $\\dfrac{d}{dx}(\\ln x) = \\dfrac{1}{x}$.',
        visual: {
          type: 'function-explorer',
          label: "For $x^3$ the slope is $3x^2$; check it at the tangent point.",
          fn: (x) => x * x * x,
          xMin: -2,
          xMax: 2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
        interactiveNote:
          "Drag the tangent point along $x^3$ and compare the slope readout with $3x^2$ at that input; the power rule predicts the exact value the curve shows.",
      },
      {
        id: 'sum-constant-multiple',
        type: 'concept',
        title: 'Sum, difference, and constant multiple',
        body:
          "Differentiation respects sums and constant multiples: $\\dfrac{d}{dx}\\big(f(x) \\pm g(x)\\big) = f'(x) \\pm g'(x)$ and $\\dfrac{d}{dx}\\big(c \\cdot f(x)\\big) = c \\cdot f'(x)$. Combined with the power rule, every polynomial differentiates term by term. For instance $\\dfrac{d}{dx}\\big(3x^2 + 5x - 7\\big) = 6x + 5$ — the same answer the limit definition produced, with far less work.",
        visual: {
          type: 'function-derivative-overlay',
          label: "A parabola $f$ and its straight-line derivative $f'$.",
          curveShape: 'valley',
        },
        interactiveNote:
          "Toggle $f$ and $f'$ and notice the curved parabola flattens into a straight-line derivative; that is what term-by-term differentiation turns $3x^2 + 5x - 7$ into $6x + 5$.",
      },
      {
        id: 'higher-order',
        type: 'concept',
        title: 'Higher-order derivatives',
        body:
          "Because $f'$ is itself a function, it can be differentiated again. The second derivative is $f''(x) = \\dfrac{d^2 y}{dx^2}$, the rate of change of the rate of change; continuing gives $f'''(x)$ and beyond. In motion, position gives velocity $s'(t)$, then acceleration $s''(t)$, then jerk $s'''(t)$. The sine derivatives cycle through four stages: $$\\sin x \\to \\cos x \\to -\\sin x \\to -\\cos x \\to \\sin x$$",
        visual: {
          type: 'function-explorer',
          label: "For $\\cos x$ the slope reads $-\\sin x$ at the tangent point.",
          preset: 'cos',
          xMin: -3.2,
          xMax: 3.2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
        interactiveNote:
          "Drag the tangent point across $\\cos x$ and watch the slope readout trace $-\\sin x$; differentiate once more and the cycle rolls on to $-\\cos x$.",
      },
      {
        id: 'differentiate-polynomial',
        type: 'multiple-choice',
        title: 'Differentiate a polynomial',
        prompt: 'Differentiate $f(x) = 7x^2 - 5x + 7$.',
        options: [
          { id: 'a', label: '$14x - 5$' },
          { id: 'b', label: '$14x^2 - 5$' },
          { id: 'c', label: '$7x - 5$' },
          { id: 'd', label: '$14x$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Term by term: $\\dfrac{d}{dx}(7x^2) = 14x$, $\\dfrac{d}{dx}(-5x) = -5$, and the constant $7$ vanishes, giving $14x - 5$.',
        incorrectExplanation:
          'Apply the power rule to each term and drop the constant: $14x - 5$.',
        hint: 'The derivative of a constant is $0$; use $\\dfrac{d}{dx}(x^n) = n\\, x^{n-1}$ on the rest.',
        visual: {
          type: 'function-derivative-overlay',
          label: "The derivative of a quadratic is a line.",
          curveShape: 'valley',
        },
      },
      {
        id: 'fourth-derivative-sine',
        type: 'multiple-choice',
        title: 'A higher-order derivative',
        prompt: 'What is the fourth derivative of $f(x) = \\sin x$?',
        options: [
          { id: 'a', label: '$\\sin x$' },
          { id: 'b', label: '$\\cos x$' },
          { id: 'c', label: '$-\\sin x$' },
          { id: 'd', label: '$-\\cos x$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'The derivatives cycle $\\cos x,\\ -\\sin x,\\ -\\cos x,\\ \\sin x$, so after four steps we return to $\\sin x$.',
        incorrectExplanation:
          'Differentiate four times: $$\\sin x \\to \\cos x \\to -\\sin x \\to -\\cos x \\to \\sin x$$',
        hint: 'The sine derivatives repeat every four steps.',
        visual: {
          type: 'function-explorer',
          label: "Each derivative of $\\sin x$ shifts the curve; four steps return it.",
          preset: 'sin',
          xMin: -3.2,
          xMax: 3.2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0.6,
        },
      },
    ],
  },
  {
    id: 'derivatives-product-quotient-rules',
    chapterId: 'derivatives',
    title: 'The Product and Quotient Rules',
    description:
      'Differentiate products and quotients of functions, and use the quotient rule to derive all six trigonometric derivatives.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'product-rule',
        type: 'concept',
        title: 'The product rule',
        body:
          "The derivative of a product is not the product of the derivatives. Instead: $$\\dfrac{d}{dx}\\big(f(x)\\, g(x)\\big) = f(x)\\, g'(x) + f'(x)\\, g(x)$$ A quick check shows why the naive guess fails: with $f(x) = x^2$ and $g(x) = x^5$, multiplying derivatives would give $2x \\cdot 5x^4 = 10x^5$, yet $x^2 \\cdot x^5 = x^7$ has derivative $7x^6$. The product rule reproduces the correct $7x^6$.",
        visual: {
          type: 'function-explorer',
          label: 'The slope of a product such as $x^2 \\sin x$ at the tangent point.',
          fn: (x) => x * x * Math.sin(x),
          xMin: 0,
          xMax: 4,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1.5,
        },
        interactiveNote:
          "Drag the tangent point along $x^2 \\sin x$ and watch the slope readout; it never equals either factor's derivative alone, because the product rule blends both as $f\\,g' + f'\\,g$.",
      },
      {
        id: 'quotient-rule',
        type: 'concept',
        title: 'The quotient rule',
        body:
          "For a quotient with $g(x) \\neq 0$: $$\\dfrac{d}{dx}\\left(\\dfrac{f(x)}{g(x)}\\right) = \\dfrac{g(x)\\, f'(x) - f(x)\\, g'(x)}{\\big[g(x)\\big]^2}$$ Order matters in the numerator because of the minus sign: bottom times derivative of top, minus top times derivative of bottom, all divided by the bottom squared.",
        visual: {
          type: 'function-explorer',
          label: 'A quotient such as $\\dfrac{x}{x^2 + 1}$ and its tangent slope.',
          fn: (x) => x / (x * x + 1),
          xMin: -4,
          xMax: 4,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0.5,
        },
        interactiveNote:
          "Drag the tangent point along $\\dfrac{x}{x^2 + 1}$ and watch the slope readout swing from positive to negative past the hump; that sign flip is the quotient rule's bottom-times-top-derivative minus top-times-bottom-derivative at work.",
      },
      {
        id: 'trig-derivatives',
        type: 'concept',
        title: 'Derivatives of the trigonometric functions',
        body:
          'Applying the quotient rule to $\\tan x = \\dfrac{\\sin x}{\\cos x}$ gives: $$\\dfrac{\\cos^2 x + \\sin^2 x}{\\cos^2 x} = \\sec^2 x$$ The full set follows the same way: $\\dfrac{d}{dx}(\\tan x) = \\sec^2 x$, $\\dfrac{d}{dx}(\\cot x) = -\\csc^2 x$, $\\dfrac{d}{dx}(\\sec x) = \\sec x \\tan x$, and $\\dfrac{d}{dx}(\\csc x) = -\\csc x \\cot x$. The co-functions carry the minus signs.',
        visual: {
          type: 'function-explorer',
          label: 'For $\\tan x$ the slope is $\\sec^2 x$, always positive.',
          preset: 'tan',
          xMin: -1.3,
          xMax: 1.3,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0.5,
        },
        interactiveNote:
          "Drag the tangent point along $\\tan x$ and watch the slope readout stay positive everywhere it is defined; that floor is $\\sec^2 x$, which never reaches zero.",
      },
      {
        id: 'product-rule-apply',
        type: 'multiple-choice',
        title: 'Use the product rule',
        prompt: 'Differentiate $y = 5x^2 \\sin x$.',
        options: [
          { id: 'a', label: '$5x^2 \\cos x + 10x \\sin x$' },
          { id: 'b', label: '$10x \\cos x$' },
          { id: 'c', label: '$5x^2 \\cos x$' },
          { id: 'd', label: '$10x \\sin x - 5x^2 \\cos x$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          "With $f = 5x^2$ (so $f' = 10x$) and $g = \\sin x$ (so $g' = \\cos x$): $$f g' + f' g = 5x^2 \\cos x + 10x \\sin x$$",
        incorrectExplanation:
          "Apply $f g' + f' g$: keep $5x^2$ and differentiate $\\sin x$, then add $\\sin x$ times the derivative of $5x^2$.",
        hint: 'Differentiate one factor at a time, then add the two products.',
        visual: {
          type: 'function-explorer',
          label: 'The product $5x^2 \\sin x$ and its tangent slope.',
          fn: (x) => 5 * x * x * Math.sin(x),
          xMin: 0,
          xMax: 3.5,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
      },
      {
        id: 'tangent-derivative',
        type: 'multiple-choice',
        title: 'Differentiate tangent',
        prompt:
          'Using the quotient rule on $\\tan x = \\dfrac{\\sin x}{\\cos x}$, what is $\\dfrac{d}{dx}(\\tan x)$?',
        options: [
          { id: 'a', label: '$\\sec^2 x$' },
          { id: 'b', label: '$-\\csc^2 x$' },
          { id: 'c', label: '$\\sec x \\tan x$' },
          { id: 'd', label: '$1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'The quotient rule gives: $$\\dfrac{\\cos x \\cos x - \\sin x(-\\sin x)}{\\cos^2 x} = \\dfrac{\\cos^2 x + \\sin^2 x}{\\cos^2 x} = \\dfrac{1}{\\cos^2 x} = \\sec^2 x$$',
        incorrectExplanation:
          'After the quotient rule, use $\\sin^2 x + \\cos^2 x = 1$ in the numerator; the result is $\\sec^2 x$.',
        hint: 'Use the Pythagorean identity in the numerator.',
        visual: {
          type: 'function-explorer',
          label: 'The slope of $\\tan x$ is $\\sec^2 x$ everywhere it is defined.',
          preset: 'tan',
          xMin: -1.3,
          xMax: 1.3,
          showCursor: false,
          showTangent: true,
          tangentAtX: -0.5,
        },
      },
    ],
  },
  {
    id: 'derivatives-chain-rule',
    chapterId: 'derivatives',
    title: 'The Chain Rule',
    description:
      'Differentiate compositions of functions: the derivative of the outer function evaluated at the inner function, times the derivative of the inner function.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'chain-statement',
        type: 'concept',
        title: 'The chain rule',
        body:
          "If $y = f(u)$ and $u = g(x)$, then the composition $y = f\\big(g(x)\\big)$ is differentiable with: $$y' = f'\\big(g(x)\\big) \\cdot g'(x)$$ In words: differentiate the outer function, leave the inner function untouched inside it, then multiply by the derivative of the inner function. A naive guess that $\\dfrac{d}{dx}\\cos(x^2) = -\\sin(2x)$ skips the last step and is wrong.",
        visual: {
          type: 'function-explorer',
          label: 'A composition such as $\\cos(x^2)$ and its tangent slope.',
          fn: (x) => Math.cos(x * x),
          xMin: -2.2,
          xMax: 2.2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
        interactiveNote:
          "Drag the tangent point along $\\cos(x^2)$ and watch the slope readout swing faster as $x$ grows; the chain rule produces that by multiplying the outer derivative by the inner $2x$.",
      },
      {
        id: 'generalized-power-rule',
        type: 'concept',
        title: 'The generalized power rule',
        body:
          "A common special case raises an inner function to a power: $$\\dfrac{d}{dx}\\big(g(x)^n\\big) = n\\,\\big(g(x)\\big)^{n-1} \\cdot g'(x)$$ The same pattern handles other outer functions, for example $\\dfrac{d}{dx}\\sin(2x) = \\cos(2x) \\cdot 2 = 2\\cos(2x)$ and $\\dfrac{d}{dx}\\ln\\big(g(x)\\big) = \\dfrac{g'(x)}{g(x)}$.",
        visual: {
          type: 'function-explorer',
          label: 'For $\\sin(2x)$ the slope is $2\\cos(2x)$ at the tangent point.',
          fn: (x) => Math.sin(2 * x),
          xMin: -3.2,
          xMax: 3.2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0.4,
        },
        interactiveNote:
          "Drag the tangent point along $\\sin(2x)$ and check the slope readout against $2\\cos(2x)$; the extra factor of $2$ is the inner derivative the chain rule tacks on.",
      },
      {
        id: 'leibniz-gears',
        type: 'concept',
        title: 'Leibniz form and linked rates',
        body:
          'In Leibniz notation the chain rule reads: $$\\dfrac{dy}{dx} = \\dfrac{dy}{du} \\cdot \\dfrac{du}{dx}$$ where the $du$ appears to cancel. Picture linked gears: if the inner gear turns twice for each turn of the input ($\\dfrac{du}{dx} = 2$) and the output turns three times for each turn of the inner gear ($\\dfrac{dy}{du} = 3$), then the output turns $2 \\cdot 3 = 6$ times per input turn. Linked rates multiply. Drag the point to watch how the tangent slope tracks the curve.',
        visual: {
          type: 'tangent-cursor',
          label: 'A composition steepens where its linked rates multiply.',
          initialX: 2,
          curveShape: 'cubic',
        },
        interactiveNote:
          "Drag the point along the curve and watch the local-slope readout steepen; like linked gears, the composition's rate is the inner rate multiplied by the outer rate.",
      },
      {
        id: 'chain-cos-square',
        type: 'multiple-choice',
        title: 'A first chain rule',
        prompt: 'Differentiate $f(x) = \\cos(x^2)$.',
        options: [
          { id: 'a', label: '$-2x \\sin(x^2)$' },
          { id: 'b', label: '$-\\sin(2x)$' },
          { id: 'c', label: '$2x \\sin(x^2)$' },
          { id: 'd', label: '$-\\sin(x^2)$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Outer derivative $-\\sin(x^2)$ times inner derivative $2x$ gives $-2x \\sin(x^2)$.',
        incorrectExplanation:
          'The tempting $-\\sin(2x)$ skips the chain rule. Differentiate the outer cosine, keep $x^2$ inside, then multiply by the inner derivative $2x$.',
        hint: 'Differentiate $\\cos$ first, keep $x^2$ inside, then multiply by $\\dfrac{d}{dx}(x^2)$.',
        visual: {
          type: 'function-explorer',
          label: 'The slope of $\\cos(x^2)$ comes from the chain rule.',
          fn: (x) => Math.cos(x * x),
          xMin: -2.2,
          xMax: 2.2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1.3,
        },
      },
      {
        id: 'chain-gears',
        type: 'multiple-choice',
        title: 'Linked rates multiply',
        prompt:
          'The inside changes twice as fast as the input ($\\dfrac{du}{dx} = 2$) and the outside responds three times as fast as the inside ($\\dfrac{dy}{du} = 3$). What is $\\dfrac{dy}{dx}$?',
        options: [
          { id: 'a', label: '$6$' },
          { id: 'b', label: '$5$' },
          { id: 'c', label: '$1.5$' },
          { id: 'd', label: '$3$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Multiply the linked rates: $$\\dfrac{dy}{dx} = \\dfrac{dy}{du} \\cdot \\dfrac{du}{dx} = 3 \\cdot 2 = 6$$',
        incorrectExplanation:
          'Linked rates multiply rather than add: $3 \\cdot 2 = 6$.',
        hint: 'Multiply the two rates together.',
        visual: {
          type: 'function-derivative-overlay',
          label: "The composed rate $f'$ scales with both linked rates.",
          curveShape: 'peak',
        },
      },
    ],
  },
  {
    id: 'derivatives-implicit-differentiation',
    chapterId: 'derivatives',
    title: 'Implicit Differentiation',
    description:
      'Find a derivative directly from an equation relating $x$ and $y$, without first solving for $y$, by differentiating every term and applying the chain rule.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'implicit-idea',
        type: 'concept',
        title: 'Implicit versus explicit',
        body:
          "When $y$ is given explicitly as $y = f(x)$, each input has one clearly assigned output and we differentiate directly. Often a relationship is implicit instead, like $\\sin(y) + y^3 = 6 - x^3$, which cannot be solved cleanly for $y$. Implicit differentiation, powered by the chain rule, still recovers $y'$. The key fact is that whenever $y$ is a function of $x$: $$\\dfrac{d}{dx}\\big(F(y)\\big) = F'(y) \\cdot \\dfrac{dy}{dx}$$",
        visual: {
          type: 'function-explorer',
          label: 'An explicit curve $y = x^3$ assigns one output to each input.',
          preset: 'cubic',
          xMin: -2,
          xMax: 2,
        },
        interactiveNote:
          "Drag the point along $y = x^3$ and notice every $x$ returns exactly one $f(x)$ in the readout; that single-valued response is what makes the curve explicit, unlike the implicit relations that follow.",
      },
      {
        id: 'implicit-method',
        type: 'concept',
        title: 'The method, step by step',
        body:
          "Take $\\sin(y) + y^3 = 6 - x^3$ and differentiate both sides with respect to $x$, attaching $\\dfrac{dy}{dx}$ to every $y$-term: $$\\cos(y)\\, y' + 3y^2\\, y' = -3x^2$$ Gather the $y'$ terms, factor, and solve: $$y' = \\dfrac{-3x^2}{\\cos y + 3y^2}$$ The recipe is always the same — differentiate every term, collect the $\\dfrac{dy}{dx}$ terms on one side, factor it out, then divide.",
        visual: {
          type: 'conic-section',
          label: 'An ellipse $\\dfrac{x^2}{4} + y^2 = 1$ is defined implicitly.',
          conic: 'ellipse',
          a: 2,
          b: 1,
          viewRadius: 3,
        },
        interactiveNote:
          "Drag a vertex to reshape the ellipse; like $\\sin(y) + y^3 = 6 - x^3$, it is one equation tying $x$ and $y$ together, so its slope comes from differentiating every term rather than solving for $y$.",
      },
      {
        id: 'implicit-circle',
        type: 'concept',
        title: 'Slopes on a circle',
        body:
          "Differentiating $x^2 + y^2 = 1$ gives $2x + 2y\\, y' = 0$, so $\\dfrac{dy}{dx} = -\\dfrac{x}{y}$. This is the negative reciprocal of $\\dfrac{y}{x}$, the slope of the radius to that point, which is exactly why every tangent line to a circle is perpendicular to its radius. At $\\left(\\tfrac{1}{2}, \\tfrac{\\sqrt{3}}{2}\\right)$ the slope is: $$-\\dfrac{1/2}{\\sqrt{3}/2} = -\\dfrac{1}{\\sqrt{3}}$$",
        visual: {
          type: 'conic-section',
          label: 'The unit circle $x^2 + y^2 = 1$ is defined implicitly.',
          conic: 'circle',
          a: 1,
          viewRadius: 2,
        },
        interactiveNote:
          "Drag the handle to grow or shrink the circle and watch the eccentricity hold at $0$; whatever the radius, $x^2 + y^2 = r^2$ never resolves to a single $y$, so its slope $-\\dfrac{x}{y}$ can only come from implicit differentiation.",
      },
      {
        id: 'implicit-y-squared',
        type: 'multiple-choice',
        title: 'Differentiate a $y$-term',
        prompt: 'Treating $y$ as a function of $x$, what is $\\dfrac{d}{dx}\\big(y^2\\big)$?',
        options: [
          { id: 'a', label: '$2y \\dfrac{dy}{dx}$' },
          { id: 'b', label: '$2y$' },
          { id: 'c', label: '$2$' },
          { id: 'd', label: '$y^2 \\dfrac{dy}{dx}$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'By the chain rule: $$\\dfrac{d}{dx}\\big(y^2\\big) = 2y \\cdot \\dfrac{dy}{dx}$$ because $y$ depends on $x$.',
        incorrectExplanation:
          'Since $y$ is a function of $x$, differentiating $y^2$ attaches a factor of $\\dfrac{dy}{dx}$: the answer is $2y \\dfrac{dy}{dx}$.',
        hint: 'Apply the chain rule because $y$ is secretly a function of $x$.',
        visual: {
          type: 'conic-section',
          label: 'Curves like this ellipse mix $x$- and $y$-terms implicitly.',
          conic: 'ellipse',
          a: 2,
          b: 1,
          viewRadius: 3,
        },
      },
      {
        id: 'implicit-circle-slope',
        type: 'multiple-choice',
        title: 'Slope from implicit differentiation',
        prompt: 'For the circle $x^2 + y^2 = 1$, what is $\\dfrac{dy}{dx}$?',
        options: [
          { id: 'a', label: '$-\\dfrac{x}{y}$' },
          { id: 'b', label: '$\\dfrac{x}{y}$' },
          { id: 'c', label: '$-\\dfrac{y}{x}$' },
          { id: 'd', label: '$\\dfrac{y}{x}$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          "Differentiating gives $2x + 2y\\, y' = 0$, so $y' = -\\dfrac{x}{y}$.",
        incorrectExplanation:
          "Differentiate both sides to get $2x + 2y\\, y' = 0$, then solve for $y'$ to find $-\\dfrac{x}{y}$.",
        hint: 'Differentiate $x^2 + y^2 = 1$ and solve for the derivative.',
        visual: {
          type: 'conic-section',
          label: 'The tangent to the circle is perpendicular to its radius.',
          conic: 'circle',
          a: 1,
          viewRadius: 2,
        },
      },
    ],
  },
  {
    id: 'derivatives-inverse-functions',
    chapterId: 'derivatives',
    title: 'Derivatives of Inverse Functions',
    description:
      'Use the reciprocal-slope relationship between a function and its inverse, and read off the derivatives of the inverse trigonometric functions.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'inverse-reciprocal-slope',
        type: 'concept',
        title: 'Reflected slopes are reciprocals',
        body:
          "The graph of $g = f^{-1}$ is the reflection of $f$ across the line $y = x$, so if $(a, b)$ lies on $f$ then $(b, a)$ lies on $g$. Their tangent slopes are reciprocals: if $f(a) = b$ and $f'(a) \\neq 0$, then $\\big(f^{-1}\\big)'(b) = \\dfrac{1}{f'(a)}$, and more generally: $$\\big(f^{-1}\\big)'(x) = \\dfrac{1}{f'\\big(g(x)\\big)}$$ Drag either point to see the matching reflected point on the inverse.",
        visual: {
          type: 'function-explorer',
          label: 'A function and its inverse reflect across $y = x$.',
          fn: (x) => x * x * x,
          secondaryFn: (x) => Math.cbrt(x),
          showIdentityLine: true,
          xMin: -2,
          xMax: 2,
        },
        interactiveNote:
          "Drag either linked dot and watch its partner mirror across $y = x$; where one curve climbs steeply its reflection lies shallow, which is the reciprocal-slope rule made visible.",
      },
      {
        id: 'arcsine-derivative',
        type: 'concept',
        title: 'Deriving the arcsine derivative',
        body:
          "Take $g(x) = \\sin^{-1}(x)$, the inverse of $f(x) = \\sin x$. The reciprocal-slope rule gives: $$g'(x) = \\dfrac{1}{\\cos\\big(\\sin^{-1}(x)\\big)}$$ A right triangle with hypotenuse $1$ and opposite side $x$ has adjacent side $\\sqrt{1 - x^2}$, so $\\cos\\big(\\sin^{-1}(x)\\big) = \\sqrt{1 - x^2}$. Therefore: $$\\dfrac{d}{dx}\\sin^{-1}(x) = \\dfrac{1}{\\sqrt{1 - x^2}}$$ which grows without bound as $x \\to \\pm 1$.",
        visual: {
          type: 'function-explorer',
          label: 'The slope of $\\sin^{-1}(x)$ steepens toward $x = \\pm 1$.',
          fn: (x) => Math.asin(x),
          xMin: -0.95,
          xMax: 0.95,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0.5,
        },
        interactiveNote:
          "Drag the tangent point toward $x = \\pm 1$ and watch the slope readout shoot upward; that blow-up is $\\dfrac{1}{\\sqrt{1 - x^2}}$ as its denominator collapses to zero.",
      },
      {
        id: 'inverse-trig-table',
        type: 'concept',
        title: 'The inverse trigonometric derivatives',
        body:
          'The same reasoning produces the whole family: $\\dfrac{d}{dx}\\sin^{-1}(x) = \\dfrac{1}{\\sqrt{1 - x^2}}$, $\\dfrac{d}{dx}\\cos^{-1}(x) = -\\dfrac{1}{\\sqrt{1 - x^2}}$, $\\dfrac{d}{dx}\\tan^{-1}(x) = \\dfrac{1}{1 + x^2}$, $\\dfrac{d}{dx}\\cot^{-1}(x) = -\\dfrac{1}{1 + x^2}$, $\\dfrac{d}{dx}\\sec^{-1}(x) = \\dfrac{1}{|x|\\sqrt{x^2 - 1}}$, and $\\dfrac{d}{dx}\\csc^{-1}(x) = -\\dfrac{1}{|x|\\sqrt{x^2 - 1}}$. Viewing $\\ln x$ as the inverse of $e^x$ recovers $\\dfrac{d}{dx}\\ln x = \\dfrac{1}{x}$ the same way.',
        visual: {
          type: 'function-explorer',
          label: 'The slope of $\\tan^{-1}(x)$ is $\\dfrac{1}{1 + x^2}$.',
          fn: (x) => Math.atan(x),
          xMin: -5,
          xMax: 5,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
          asymptotes: { horizontal: [Math.PI / 2, -Math.PI / 2] },
        },
        interactiveNote:
          "Drag the tangent point along $\\tan^{-1}(x)$ and watch the slope readout fade toward zero as you move outward, tracking $\\dfrac{1}{1 + x^2}$ while the curve levels off against its asymptotes.",
      },
      {
        id: 'inverse-value',
        type: 'multiple-choice',
        title: 'Derivative of an inverse at a point',
        prompt:
          "The point $(2, 13)$ lies on $f(x) = 4x + 5$. Find $\\big(f^{-1}\\big)'(13)$.",
        options: [
          { id: 'a', label: '$\\dfrac{1}{4}$' },
          { id: 'b', label: '$4$' },
          { id: 'c', label: '$\\dfrac{1}{13}$' },
          { id: 'd', label: '$13$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          "Since $f'(x) = 4$, the reciprocal-slope rule gives: $$\\big(f^{-1}\\big)'(13) = \\dfrac{1}{f'(2)} = \\dfrac{1}{4}$$",
        incorrectExplanation:
          "Use $\\big(f^{-1}\\big)'(b) = \\dfrac{1}{f'(a)}$ with $a = 2$ and $b = 13$. Because $f'(x) = 4$, the answer is $\\dfrac{1}{4}$.",
        hint: "Take the reciprocal of $f'(2)$.",
        visual: {
          type: 'function-explorer',
          label: 'Reflected points carry reciprocal tangent slopes.',
          fn: (x) => x * x * x,
          secondaryFn: (x) => Math.cbrt(x),
          showIdentityLine: true,
          xMin: -2,
          xMax: 2,
        },
      },
      {
        id: 'arctan-derivative',
        type: 'multiple-choice',
        title: 'Derivative of arctangent',
        prompt: 'What is $\\dfrac{d}{dx}\\tan^{-1}(x)$?',
        options: [
          { id: 'a', label: '$\\dfrac{1}{1 + x^2}$' },
          { id: 'b', label: '$\\dfrac{1}{\\sqrt{1 - x^2}}$' },
          { id: 'c', label: '$-\\dfrac{1}{1 + x^2}$' },
          { id: 'd', label: '$\\sec^2 x$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'The derivative of $\\tan^{-1}(x)$ is $\\dfrac{1}{1 + x^2}$, a rational function with no square root.',
        incorrectExplanation:
          'Arctangent differentiates to $\\dfrac{1}{1 + x^2}$; the square-root form belongs to arcsine instead.',
        hint: 'Unlike arcsine, the arctangent derivative is rational.',
        visual: {
          type: 'function-explorer',
          label: 'The slope of $\\tan^{-1}(x)$ is largest at $x = 0$.',
          fn: (x) => Math.atan(x),
          xMin: -5,
          xMax: 5,
          showCursor: false,
          showTangent: true,
          tangentAtX: -1,
        },
      },
    ],
  },
];
