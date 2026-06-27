import type { Lesson } from '../lessons';

/* Lessons for "Graphical Behavior of Functions", adapted from APEX Calculus (G. Hartman et al.) under CC BY-NC 4.0. */

export const behaviorOfFunctionsLessons: Lesson[] = [
  {
    id: 'behavior-extreme-values',
    chapterId: 'behavior-of-functions',
    title: 'Extreme Values',
    description:
      'Absolute and relative extrema, the Extreme Value Theorem, critical numbers, and finding the maximum and minimum of a function on a closed interval.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'extreme-values-highs-and-lows',
        type: 'concept',
        title: 'The highs and lows of a function',
        body: "The extreme values of a function are its largest and smallest outputs. We say $f(c)$ is the absolute maximum of $f$ on an interval $I$ if $f(c) \\ge f(x)$ for every $x$ in $I$, and the absolute minimum if $f(c) \\le f(x)$ for every $x$ in $I$. These extrema are the $y$-values the function attains, not the inputs that produce them. Drag along the curve below to compare outputs and hunt for the highest and lowest points.",
        visual: {
          type: 'function-explorer',
          label: 'Compare outputs to locate the largest and smallest values.',
          fn: (x: number) => 2 * x ** 3 - 9 * x ** 2,
          xMin: -1,
          xMax: 5,
          initialX: 3,
          markedPoints: [
            { x: 3, y: -27, label: 'min' },
            { x: 5, y: 25, label: 'max' },
          ],
        },
        interactiveNote:
          'Drag the point along the curve and watch the $f(x)$ readout: the lowest value it reaches is the absolute minimum and the highest is the absolute maximum, matching the marked low and high points.',
      },
      {
        id: 'extreme-values-evt',
        type: 'concept',
        title: 'The Extreme Value Theorem',
        body: "A continuous function on a finite closed interval is guaranteed to attain both an absolute maximum and an absolute minimum somewhere on that interval. The two conditions matter: if the interval is open, or if the function has a break, those guarantees can fail. Here a continuous curve on the closed interval $[0, 5]$ reaches its lowest value at the bottom of the valley and its highest value at an endpoint.",
        visual: {
          type: 'function-explorer',
          label: 'A continuous function on a closed interval attains a max and a min.',
          fn: (x: number) => (x - 2) ** 2 + 1,
          xMin: 0,
          xMax: 5,
          initialX: 2,
          markedPoints: [
            { x: 2, y: 1, label: 'min' },
            { x: 5, y: 10, label: 'max' },
          ],
        },
        interactiveNote:
          'Drag the point across the closed interval and compare outputs: $f$ bottoms out at the valley for its minimum and rises to its maximum at an endpoint, so a continuous curve on $[0, 5]$ truly attains both.',
      },
      {
        id: 'extreme-values-critical-numbers',
        type: 'concept',
        title: 'Critical numbers',
        body: "Where can extrema occur? At a smooth peak or valley the tangent line is horizontal, so $f'(c) = 0$. An extremum can also sit at a sharp point where $f'$ does not exist. A value $c$ in the domain of $f$ where $f'(c) = 0$ or $f'(c)$ is undefined is called a critical number, and $(c, f(c))$ a critical point. Every relative extremum occurs at a critical number. Drag the point toward the top of this hill and watch the slope of the tangent line reach $0$.",
        visual: {
          type: 'tangent-cursor',
          label: 'At a smooth peak the tangent line is horizontal: the slope is 0.',
          initialX: 2,
          curveShape: 'peak',
        },
        interactiveNote:
          "Drag the point up toward the top of the hill and watch the local slope readout settle to $0$; that flat tangent is exactly where $f'(c) = 0$ marks a critical number.",
      },
      {
        id: 'extreme-values-not-every-critical',
        type: 'concept',
        title: 'Not every critical number is an extremum',
        body: "A horizontal tangent does not always signal a peak or a valley. Consider $f(x) = x^3$: its derivative $f'(x) = 3x^2$ equals $0$ at $x = 0$, so $x = 0$ is a critical number. But $f$ keeps increasing right through the origin, so there is no maximum or minimum there. Critical numbers only flag candidates; each one must still be checked. Notice the tangent is flat at the origin even though the curve never turns around.",
        visual: {
          type: 'function-explorer',
          label: 'A flat tangent at the origin, yet x^3 has no extremum there.',
          fn: (x: number) => x ** 3,
          xMin: -2,
          xMax: 2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0,
        },
        interactiveNote:
          'Drag the tangent point across the origin: the slope readout touches $0$ but never turns negative, so $f$ keeps increasing and $x = 0$ is a critical number that is neither a max nor a min.',
      },
      {
        id: 'extreme-values-find-critical',
        type: 'multiple-choice',
        title: 'Find the critical numbers',
        prompt: 'Find the critical numbers of $f(x) = x^3 - 3x$.',
        options: [
          { id: 'a', label: '$x = \\pm 1$' },
          { id: 'b', label: '$x = 0$' },
          { id: 'c', label: '$x = \\pm 3$' },
          { id: 'd', label: '$x = \\pm \\sqrt{3}$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$f\'(x) = 3x^2 - 3 = 3(x - 1)(x + 1),$$ which is $0$ at $x = 1$ and $x = -1$. The derivative is defined everywhere, so these are the only critical numbers.',
        incorrectExplanation:
          'Set $f\'(x) = 3x^2 - 3 = 0$. Then $x^2 = 1$, so $x = \\pm 1$.',
        hint: 'Differentiate, set the result equal to $0$, and solve.',
        visual: {
          type: 'function-explorer',
          label: 'Drag to find where the curve levels off.',
          fn: (x: number) => x ** 3 - 3 * x,
          xMin: -2.5,
          xMax: 2.5,
          initialX: 1,
        },
      },
      {
        id: 'extreme-values-closed-interval-max',
        type: 'multiple-choice',
        title: 'Maximum on a closed interval',
        prompt:
          '$f(x) = 2x^3 + 3x^2 - 12x$ has critical numbers $x = -2$ and $x = 1$. What is the absolute maximum value of $f$ on $[0, 3]$?',
        options: [
          { id: 'a', label: '$45$' },
          { id: 'b', label: '$-7$' },
          { id: 'c', label: '$0$' },
          { id: 'd', label: '$54$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Only $x = 1$ lies in $[0, 3]$. Comparing $f(0) = 0$, $f(1) = -7$, and $f(3) = 45$, the largest is $45$.',
        incorrectExplanation:
          'Evaluate $f$ at the endpoints and at the critical number inside the interval: $f(0) = 0$, $f(1) = -7$, $f(3) = 45$. The absolute maximum is the largest of these.',
        hint: 'Test the endpoints $0$ and $3$ and the interior critical number $x = 1$.',
        visual: {
          type: 'function-explorer',
          label: 'Candidates: the endpoints and the interior critical point.',
          fn: (x: number) => 2 * x ** 3 + 3 * x ** 2 - 12 * x,
          xMin: 0,
          xMax: 3,
          markedPoints: [
            { x: 1, y: -7, label: 'min' },
            { x: 3, y: 45, label: 'max' },
          ],
        },
      },
    ],
  },
  {
    id: 'behavior-mean-value-theorem',
    chapterId: 'behavior-of-functions',
    title: 'The Mean Value Theorem',
    description:
      'Average versus instantaneous rates of change, the Mean Value Theorem, Rolle\u2019s Theorem, and finding the guaranteed value c.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'mvt-average-rate',
        type: 'concept',
        title: 'Average rate of change',
        body: "Over an interval $[a, b]$, the average rate of change of $f$ is the slope of the secant line joining the endpoints: $$\\dfrac{f(b) - f(a)}{b - a}.$$ If you drive $100$ miles in $2$ hours, your average speed is $\\dfrac{100}{2} = 50$ miles per hour. Drag the endpoints below to see how the secant slope reports the average rate over the interval you choose.",
        visual: {
          type: 'rate-window',
          label: 'The secant slope is the average rate of change over the interval.',
          initialStartX: 1,
          initialEndX: 4,
        },
        interactiveNote:
          'Drag the two endpoints to reshape the interval and watch the secant line tilt; its reported average rate is exactly $\\dfrac{f(b) - f(a)}{b - a}$ for the endpoints you choose.',
      },
      {
        id: 'mvt-statement',
        type: 'concept',
        title: 'The Mean Value Theorem',
        body: "The Mean Value Theorem says that if $f$ is continuous on $[a, b]$ and differentiable on $(a, b)$, then there is at least one value $c$ in $(a, b)$ where the instantaneous rate equals the average rate: $$f'(c) = \\dfrac{f(b) - f(a)}{b - a}.$$ Geometrically, somewhere the tangent line is parallel to the secant line through the endpoints. If your average speed is $50$ mph, then at some instant your speedometer reads exactly $50$. Here the tangent at the marked point is parallel to the chord joining the endpoints.",
        visual: {
          type: 'function-explorer',
          label: 'The tangent at c is parallel to the secant through the endpoints.',
          fn: (x: number) => 0.5 * x * x,
          xMin: 0,
          xMax: 4,
          showCursor: false,
          showTangent: true,
          tangentAtX: 2,
          markedPoints: [
            { x: 0, y: 0, label: 'a' },
            { x: 4, y: 8, label: 'b' },
          ],
        },
        interactiveNote:
          'Drag the tangent point until it runs parallel to the chord joining the marked endpoints $a$ and $b$; the slope readout there matches the average rate $\\dfrac{f(b) - f(a)}{b - a}$, the value $c$ the theorem promises.',
      },
      {
        id: 'mvt-rolle',
        type: 'concept',
        title: 'Rolle\u2019s Theorem',
        body: "Rolle\u2019s Theorem is the special case where the endpoints have equal heights. If $f$ is continuous on $[a, b]$, differentiable on $(a, b)$, and $f(a) = f(b)$, then $f'(c) = 0$ for some $c$ in $(a, b)$. With equal endpoint heights the average rate is $0$, so the guaranteed tangent is horizontal: a relative high or low must occur between the ends. Drag toward the top to find the spot where the slope is $0$.",
        visual: {
          type: 'tangent-cursor',
          label: 'Equal endpoint heights force a horizontal tangent in between.',
          initialX: 2,
          curveShape: 'peak',
        },
        interactiveNote:
          "Drag the point toward the crest and watch the local slope settle to $0$; with equal endpoint heights, Rolle's Theorem guarantees exactly this horizontal tangent somewhere between the ends.",
      },
      {
        id: 'mvt-find-c',
        type: 'multiple-choice',
        title: 'Find the value c',
        prompt:
          'For $f(x) = x^2 - 4x + 1$ on $[1, 5]$, find the value $c$ guaranteed by the Mean Value Theorem.',
        options: [
          { id: 'a', label: '$c = 3$' },
          { id: 'b', label: '$c = 2$' },
          { id: 'c', label: '$c = 1$' },
          { id: 'd', label: '$c = 5$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The average rate is $$\\dfrac{f(5) - f(1)}{5 - 1} = \\dfrac{6 - (-2)}{4} = 2.$$ Setting $f\'(x) = 2x - 4 = 2$ gives $x = 3$.',
        incorrectExplanation:
          'Compute the average rate: $$\\dfrac{f(5) - f(1)}{4} = 2,$$ then solve $f\'(x) = 2x - 4 = 2$ to get $c = 3$.',
        hint: 'Set the derivative equal to the average rate of change over $[1, 5]$.',
        visual: {
          type: 'function-explorer',
          label: 'The tangent at c is parallel to the secant.',
          fn: (x: number) => x * x - 4 * x + 1,
          xMin: 1,
          xMax: 5,
          showCursor: false,
          showTangent: true,
          tangentAtX: 3,
          markedPoints: [
            { x: 1, y: -2, label: 'a' },
            { x: 5, y: 6, label: 'b' },
          ],
        },
      },
      {
        id: 'mvt-rolle-applicability',
        type: 'multiple-choice',
        title: 'Applying Rolle\u2019s Theorem',
        prompt:
          'Can Rolle\u2019s Theorem be applied to $f(x) = x^2 - 4$ on $[-2, 2]$, and if so, where is $f\'(c) = 0$?',
        options: [
          { id: 'a', label: 'Yes \u2014 at $c = 0$' },
          { id: 'b', label: 'No \u2014 because $f(-2) \\ne f(2)$' },
          { id: 'c', label: 'No \u2014 because $f$ is not differentiable on $(-2, 2)$' },
          { id: 'd', label: 'Yes \u2014 at $c = 2$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $f(-2) = 0 = f(2)$ and $f$ is a differentiable polynomial, so Rolle\u2019s Theorem applies. $f\'(x) = 2x = 0$ gives $c = 0$.',
        incorrectExplanation:
          'Check the hypotheses: $f(-2) = f(2) = 0$ and $f$ is differentiable. Then solve $f\'(x) = 2x = 0$, giving $c = 0$.',
        hint: 'First confirm the endpoint heights match, then solve $f\'(x) = 0$.',
        visual: {
          type: 'function-explorer',
          label: 'Equal endpoint heights; the horizontal tangent sits at the vertex.',
          fn: (x: number) => x * x - 4,
          xMin: -2,
          xMax: 2,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0,
          markedPoints: [
            { x: -2, y: 0, label: 'a' },
            { x: 2, y: 0, label: 'b' },
          ],
        },
      },
      {
        id: 'mvt-average-rate-compute',
        type: 'multiple-choice',
        title: 'Compute an average rate',
        prompt: 'What is the average rate of change of $f(x) = x^2$ on $[1, 3]$?',
        options: [
          { id: 'a', label: '$4$' },
          { id: 'b', label: '$3$' },
          { id: 'c', label: '$2$' },
          { id: 'd', label: '$8$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$\\dfrac{f(3) - f(1)}{3 - 1} = \\dfrac{9 - 1}{2} = 4.$$',
        incorrectExplanation:
          'Use $\\dfrac{f(3) - f(1)}{3 - 1} = \\dfrac{9 - 1}{2} = 4$.',
        hint: 'Divide the change in output by the change in input.',
        visual: {
          type: 'rate-window',
          label: 'Drag the endpoints to the interval [1, 3].',
          initialStartX: 1,
          initialEndX: 3,
        },
      },
    ],
  },
  {
    id: 'behavior-increasing-decreasing',
    chapterId: 'behavior-of-functions',
    title: 'Increasing and Decreasing Functions',
    description:
      'How the sign of the first derivative determines where a function rises and falls, and the First Derivative Test for relative extrema.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'incdec-definition',
        type: 'concept',
        title: 'Rising and falling',
        body: "A function is increasing on an interval if its outputs rise as $x$ moves to the right, and decreasing if its outputs fall. Most smooth functions increase on some stretches and decrease on others, switching direction at special points. Drag along this curve and notice where it climbs and where it falls.",
        visual: {
          type: 'function-explorer',
          label: 'Follow the curve: where does it rise, and where does it fall?',
          fn: (x: number) => x ** 3 + x ** 2 - x + 1,
          xMin: -2.2,
          xMax: 1.6,
          initialX: -1,
        },
        interactiveNote:
          'Drag the point along the curve and watch the $f(x)$ readout rise on the climbs and fall on the descents; the places where it switches are where increasing turns into decreasing.',
      },
      {
        id: 'incdec-sign-of-derivative',
        type: 'concept',
        title: 'The sign of the derivative',
        body: "The derivative measures slope, so it reports direction directly: where $f'(x) > 0$ the graph rises, so $f$ is increasing; where $f'(x) < 0$ the graph falls, so $f$ is decreasing; and if $f'(x) = 0$ throughout an interval, $f$ is constant there. Compare the curve $f$ with its dashed derivative $f'$: $f$ turns around exactly where $f'$ crosses zero.",
        visual: {
          type: 'function-derivative-overlay',
          label: "f falls then rises; f' is negative then positive.",
          curveShape: 'valley',
        },
        interactiveNote:
          "Toggle the $f$ and $f'$ curves on and off to compare them: $f$ falls where the dashed $f'$ dips below the axis and rises where $f'$ climbs above it, turning around right where $f'$ crosses zero.",
      },
      {
        id: 'incdec-sign-chart',
        type: 'concept',
        title: 'Finding intervals with a sign chart',
        body: "To locate where $f$ increases or decreases, find the critical numbers, then test the sign of $f'$ on each interval between them. For $f(x) = x^3 + x^2 - x + 1$, $$f'(x) = 3x^2 + 2x - 1 = (3x - 1)(x + 1),$$ so the critical numbers are $x = -1$ and $x = \\tfrac{1}{3}$. Testing each piece shows $f$ increases on $(-\\infty, -1)$, decreases on $\\left(-1, \\tfrac{1}{3}\\right)$, then increases on $\\left(\\tfrac{1}{3}, \\infty\\right)$. Drag the tangent and watch its slope change sign at those points.",
        visual: {
          type: 'function-explorer',
          label: 'The tangent slope is positive, then negative, then positive.',
          fn: (x: number) => x ** 3 + x ** 2 - x + 1,
          xMin: -2.2,
          xMax: 1.6,
          showCursor: false,
          showTangent: true,
          tangentAtX: -1,
        },
        interactiveNote:
          'Drag the tangent point across $x = -1$ and $x = \\tfrac{1}{3}$ and watch the slope readout flip from positive to negative and back, tracing the increasing, then decreasing, then increasing intervals.',
      },
      {
        id: 'incdec-first-derivative-test',
        type: 'concept',
        title: 'The First Derivative Test',
        body: "Once the critical numbers are known, the way $f'$ changes sign classifies each one. If $f'$ switches from positive to negative at $c$, the graph rises then falls, so $f(c)$ is a relative maximum. If $f'$ switches from negative to positive, $f(c)$ is a relative minimum. If $f'$ keeps the same sign on both sides, $c$ is neither. Here $f'$ goes from positive to negative, producing a peak.",
        visual: {
          type: 'function-derivative-overlay',
          label: "f' changes from positive to negative, so f has a relative maximum.",
          curveShape: 'peak',
        },
        interactiveNote:
          "Toggle on the dashed $f'$ and follow it across the peak: it switches from positive to negative right where $f$ tops out, which is the First Derivative Test flagging a relative maximum.",
      },
      {
        id: 'incdec-classify',
        type: 'multiple-choice',
        title: 'Use the First Derivative Test',
        prompt:
          'A function has $f\'(x) = (x - 1)(x - 4)$. Using the First Derivative Test, classify the critical number $x = 1$.',
        options: [
          { id: 'a', label: 'A relative maximum' },
          { id: 'b', label: 'A relative minimum' },
          { id: 'c', label: 'Neither a maximum nor a minimum' },
          { id: 'd', label: 'An inflection point' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Just left of $x = 1$, both factors are negative so $f\' > 0$; just right, $(x-1) > 0$ and $(x-4) < 0$ so $f\' < 0$. The sign switches from positive to negative, giving a relative maximum.',
        incorrectExplanation:
          'Test the sign of $f\'$ on each side of $1$. It goes from positive (both factors negative) to negative, so $f(1)$ is a relative maximum.',
        hint: 'Determine the sign of each factor just left and just right of $x = 1$.',
        visual: {
          type: 'function-explorer',
          label: 'A peak at x = 1 and a valley at x = 4.',
          fn: (x: number) => x ** 3 / 3 - (5 * x ** 2) / 2 + 4 * x,
          xMin: -1,
          xMax: 6,
          initialX: 1,
        },
      },
      {
        id: 'incdec-increasing-interval',
        type: 'multiple-choice',
        title: 'Identify an increasing interval',
        prompt: 'On which interval is $f(x) = x^3 - 3x$ increasing?',
        options: [
          { id: 'a', label: '$(1, \\infty)$' },
          { id: 'b', label: '$(-1, 1)$' },
          { id: 'c', label: '$(-\\infty, 0)$' },
          { id: 'd', label: '$(0, \\infty)$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$f\'(x) = 3x^2 - 3 = 3(x - 1)(x + 1) > 0$$ when $x > 1$ or $x < -1$. Of the choices, only $(1, \\infty)$ lies entirely in an increasing region.',
        incorrectExplanation:
          '$f\'(x) = 3(x-1)(x+1)$ is positive for $x < -1$ and for $x > 1$. The interval $(1, \\infty)$ is increasing; $(-1, 1)$ is decreasing.',
        hint: 'Find where $f\'(x) = 3(x-1)(x+1)$ is positive.',
        visual: {
          type: 'function-explorer',
          label: 'Drag the tangent to see where the slope is positive.',
          fn: (x: number) => x ** 3 - 3 * x,
          xMin: -2.5,
          xMax: 2.5,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1.5,
        },
      },
    ],
  },
  {
    id: 'behavior-concavity',
    chapterId: 'behavior-of-functions',
    title: 'Concavity and the Second Derivative',
    description:
      'Concave up and concave down, the second derivative test for concavity, inflection points, and the Second Derivative Test for relative extrema.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'concavity-definition',
        type: 'concept',
        title: 'Which way the graph curves',
        body: "Concavity describes the way a graph bends. A graph is concave up when it curves upward like a cup, lying above its tangent lines; it is concave down when it curves downward like a frown, lying below its tangent lines. Equivalently, concave up means the slopes (the values of $f'$) increase as you move right, and concave down means the slopes decrease. Drag the tangent across this cup and watch the slope steadily increase.",
        visual: {
          type: 'function-explorer',
          label: 'Concave up: the tangent lies below the curve and slopes increase.',
          preset: 'quadratic',
          xMin: -3,
          xMax: 3,
          showCursor: false,
          showTangent: true,
          tangentAtX: -1.5,
        },
        interactiveNote:
          'Drag the tangent point along the cup and watch the slope readout increase steadily from negative through $0$ to positive; slopes that keep rising are exactly what concave up means.',
      },
      {
        id: 'concavity-second-derivative',
        type: 'concept',
        title: 'Concavity and the second derivative',
        body: "Because concavity is about whether $f'$ is increasing or decreasing, the second derivative settles it: where $f''(x) > 0$ the slopes increase and $f$ is concave up, and where $f''(x) < 0$ the slopes decrease and $f$ is concave down. For $f(x) = x^3$ we have $f''(x) = 6x$, so $f$ is concave down for $x < 0$ and concave up for $x > 0$. Drag the tangent from left to right and watch its slope fall, flatten, then rise.",
        visual: {
          type: 'function-explorer',
          label: 'x^3 is concave down then concave up; the slope falls then rises.',
          fn: (x: number) => x ** 3,
          xMin: -2,
          xMax: 2,
          showCursor: false,
          showTangent: true,
          tangentAtX: -1,
        },
        interactiveNote:
          "Drag the tangent point from the negative side toward the positive side and watch the slope readout fall, flatten at the origin, then climb; that reversal is $f'' = 6x$ switching from negative (concave down) to positive (concave up).",
      },
      {
        id: 'concavity-inflection',
        type: 'concept',
        title: 'Inflection points',
        body: "A point where concavity switches \u2014 from up to down or down to up \u2014 is an inflection point. Since concavity is governed by $f''$, an inflection point can occur only where $f''(x) = 0$ or $f''$ is undefined. That condition is necessary but not sufficient: $f(x) = x^4$ has $f''(0) = 0$ yet stays concave up throughout, so the origin is not an inflection point. For $f(x) = x^3 - 3x + 1$, $f''(x) = 6x$ changes sign at $x = 0$, marking an inflection point there.",
        visual: {
          type: 'function-explorer',
          label: 'Concavity flips at the marked inflection point.',
          fn: (x: number) => x ** 3 - 3 * x + 1,
          xMin: -2.5,
          xMax: 2.5,
          markedPoints: [{ x: 0, y: 1, label: 'inflection' }],
        },
        interactiveNote:
          "Drag the cursor across the marked inflection point at $x = 0$ and watch the curve switch from bending downward to bending upward, exactly where $f'' = 6x$ changes sign.",
      },
      {
        id: 'concavity-second-derivative-test',
        type: 'concept',
        title: 'The Second Derivative Test',
        body: "At a critical number $c$ where $f'(c) = 0$, concavity reveals the shape. If $f''(c) > 0$ the graph is concave up there \u2014 a valley \u2014 so $f(c)$ is a relative minimum. If $f''(c) < 0$ it is concave down \u2014 a peak \u2014 so $f(c)$ is a relative maximum. If $f''(c) = 0$ the test is inconclusive and we fall back on the sign of $f'$. This cup has a horizontal tangent at its base, where $f'' > 0$ confirms a minimum.",
        visual: {
          type: 'function-explorer',
          label: 'Concave up with a horizontal tangent: a relative minimum.',
          preset: 'quadratic',
          xMin: -3,
          xMax: 3,
          showCursor: false,
          showTangent: true,
          tangentAtX: 0,
        },
        interactiveNote:
          "Drag the tangent point down to the base of the cup until the slope readout reads $0$; because the cup is concave up ($f'' > 0$), the Second Derivative Test confirms this critical point is a relative minimum.",
      },
      {
        id: 'concavity-find-inflection',
        type: 'multiple-choice',
        title: 'Find the inflection point',
        prompt: 'Find the $x$-coordinate of the inflection point of $f(x) = x^3 - 3x + 1$.',
        options: [
          { id: 'a', label: '$x = 0$' },
          { id: 'b', label: '$x = 1$' },
          { id: 'c', label: '$x = -1$' },
          { id: 'd', label: '$x = \\pm 1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $f\'\'(x) = 6x$, which is $0$ at $x = 0$, and the concavity switches from down to up there. So $x = 0$ is the inflection point.',
        incorrectExplanation:
          'Compute $f\'\'(x) = 6x$ and set it to $0$. The concavity changes at $x = 0$, the inflection point. (The values $x = \\pm 1$ are the critical numbers, not inflection points.)',
        hint: 'Set the second derivative equal to $0$.',
        visual: {
          type: 'function-explorer',
          label: 'Concavity changes at the marked input.',
          fn: (x: number) => x ** 3 - 3 * x + 1,
          xMin: -2.5,
          xMax: 2.5,
          markedX: 0,
        },
      },
      {
        id: 'concavity-second-derivative-test-apply',
        type: 'multiple-choice',
        title: 'Use the Second Derivative Test',
        prompt:
          'For $f(x) = x^3 - 3x$, the second derivative is $f\'\'(x) = 6x$. Classify the critical number $x = 1$.',
        options: [
          { id: 'a', label: 'A relative minimum' },
          { id: 'b', label: 'A relative maximum' },
          { id: 'c', label: 'An inflection point' },
          { id: 'd', label: 'Inconclusive' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $f\'\'(1) = 6 > 0$, so the graph is concave up at $x = 1$: a relative minimum.',
        incorrectExplanation:
          'Evaluate $f\'\'(1) = 6 > 0$. A positive second derivative at a critical number means concave up, hence a relative minimum.',
        hint: 'Check the sign of $f\'\'(1)$.',
        visual: {
          type: 'function-explorer',
          label: 'A concave-up valley at x = 1.',
          fn: (x: number) => x ** 3 - 3 * x,
          xMin: -2.5,
          xMax: 2.5,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
      },
    ],
  },
  {
    id: 'behavior-curve-sketching',
    chapterId: 'behavior-of-functions',
    title: 'Curve Sketching',
    description:
      'Combining domain, asymptotes, intercepts, end behavior, and the signs of the first and second derivatives into an accurate sketch.',
    status: 'available',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'sketching-strategy',
        type: 'concept',
        title: 'A strategy for sketching',
        body: "Calculus lets us sketch an accurate graph from a handful of key features instead of plotting hundreds of points. The plan: find the domain and any vertical asymptotes; find the intercepts and any symmetry; check end behavior with the limits as $x \\to \\pm\\infty$; locate critical numbers from $f'$; locate possible inflection points from $f''$; then build a sign chart and connect the key points with the correct concavity. This rational example is framed by two vertical asymptotes and one horizontal asymptote.",
        visual: {
          type: 'function-explorer',
          label: 'Asymptotes frame the overall shape of the graph.',
          fn: (x: number) => (x * x - x - 2) / (x * x - x - 6),
          xMin: -6,
          xMax: 6,
          yMin: -5,
          yMax: 6,
          asymptotes: { vertical: [-2, 3], horizontal: [1] },
        },
        interactiveNote:
          'Drag the point along the curve toward each dashed asymptote and watch the $f(x)$ readout shoot off near the two vertical guides and flatten toward the horizontal one, the skeleton the full strategy fills in.',
      },
      {
        id: 'sketching-domain-asymptotes',
        type: 'concept',
        title: 'Domain, asymptotes, and intercepts',
        body: "Begin with structure. The domain excludes inputs that make a denominator zero or place a negative under an even root. A vertical asymptote appears where the function blows up, often at a zero of the denominator. Intercepts come from setting $x = 0$ for the $y$-intercept and $f(x) = 0$ for the $x$-intercepts. For $f(x) = \\dfrac{x^2 - x - 2}{x^2 - x - 6}$, the denominator factors as $(x - 3)(x + 2)$, which vanishes at $x = 3$ and $x = -2$, giving the two vertical asymptotes. The $y$-intercept is $f(0) = \\tfrac{1}{3}$.",
        visual: {
          type: 'function-explorer',
          label: 'Vertical asymptotes at the zeros of the denominator.',
          fn: (x: number) => (x * x - x - 2) / (x * x - x - 6),
          xMin: -6,
          xMax: 6,
          yMin: -5,
          yMax: 6,
          markedX: 0,
          asymptotes: { vertical: [-2, 3], horizontal: [1] },
        },
        interactiveNote:
          'Drag the cursor toward either dashed vertical asymptote and watch $f(x)$ blow up as the denominator approaches zero, while the marked input pins the $y$-intercept $f(0) = \\tfrac{1}{3}$.',
      },
      {
        id: 'sketching-end-behavior',
        type: 'concept',
        title: 'End behavior and symmetry',
        body: "End behavior tells us what happens far out. For a polynomial the leading term dominates: an odd-degree polynomial with a positive leading coefficient falls to $-\\infty$ on the left and rises to $+\\infty$ on the right. For a rational function, comparing the degrees of the numerator and denominator gives the horizontal asymptote. Symmetry can halve the work: even functions mirror across the $y$-axis, odd functions through the origin. The ends of this cubic head in opposite directions.",
        visual: {
          type: 'function-explorer',
          label: 'The two ends of this cubic head opposite directions.',
          fn: (x: number) => 3 * x ** 3 - 10 * x ** 2 + 4 * x + 10,
          xMin: -2,
          xMax: 5,
          initialX: 0,
        },
        interactiveNote:
          'Drag the point out toward each end of the curve and watch the $f(x)$ readout dive toward $-\\infty$ on one end and climb toward $+\\infty$ on the other, the opposite-heading ends of an odd-degree cubic with a positive leading term.',
      },
      {
        id: 'sketching-combine',
        type: 'concept',
        title: 'Combining the first and second derivatives',
        body: "The first and second derivatives together pin down the shape on every interval. There are four combinations: increasing and concave up (rising and steepening), increasing and concave down (rising but leveling off), decreasing and concave down (falling and steepening downward), and decreasing and concave up (falling but leveling off). Reading the signs of $f'$ and $f''$ on each interval lets you draw each piece with confidence. The dashed derivative shows where $f$ turns around.",
        visual: {
          type: 'function-derivative-overlay',
          label: "f turns around where its derivative f' crosses zero.",
          curveShape: 'valley',
        },
        interactiveNote:
          "Toggle the dashed $f'$ on and off and find where it crosses zero; that crossing is exactly where $f$ stops falling and starts rising, the turning point the sign chart relies on.",
      },
      {
        id: 'sketching-horizontal-asymptote',
        type: 'multiple-choice',
        title: 'Find the horizontal asymptote',
        prompt: 'What is the horizontal asymptote of $f(x) = \\dfrac{2x^2 + 1}{x^2 + 3}$?',
        options: [
          { id: 'a', label: '$y = 2$' },
          { id: 'b', label: '$y = 0$' },
          { id: 'c', label: '$y = \\tfrac{1}{3}$' },
          { id: 'd', label: 'No horizontal asymptote' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The numerator and denominator have the same degree, so the horizontal asymptote is the ratio of leading coefficients, $\\dfrac{2}{1} = 2$.',
        incorrectExplanation:
          'When numerator and denominator share the same degree, the horizontal asymptote is the ratio of leading coefficients: $\\dfrac{2}{1} = 2$.',
        hint: 'Compare the degrees, then take the ratio of the leading coefficients.',
        visual: {
          type: 'function-explorer',
          label: 'The curve flattens toward its horizontal asymptote.',
          fn: (x: number) => (2 * x * x + 1) / (x * x + 3),
          xMin: -8,
          xMax: 8,
          asymptotes: { horizontal: [2] },
        },
      },
      {
        id: 'sketching-shape-from-signs',
        type: 'multiple-choice',
        title: 'Shape from the signs',
        prompt:
          'On an interval, $f\'(x) > 0$ and $f\'\'(x) < 0$. Which best describes the graph there?',
        options: [
          { id: 'a', label: 'Increasing and concave down' },
          { id: 'b', label: 'Increasing and concave up' },
          { id: 'c', label: 'Decreasing and concave down' },
          { id: 'd', label: 'Decreasing and concave up' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $f\' > 0$ means the graph is rising (increasing), and $f\'\' < 0$ means it is concave down \u2014 rising but leveling off.',
        incorrectExplanation:
          'The sign of $f\'$ gives direction (positive means increasing) and the sign of $f\'\'$ gives concavity (negative means concave down).',
        hint: 'Read $f\'$ for direction and $f\'\'$ for concavity.',
        visual: {
          type: 'function-explorer',
          label: 'Rising but leveling off: increasing and concave down.',
          preset: 'sqrt',
          xMin: 0,
          xMax: 9,
          showCursor: false,
          showTangent: true,
          tangentAtX: 1,
        },
      },
    ],
  },
];
