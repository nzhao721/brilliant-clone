import type { Lesson } from '../lessons';

/* Lessons for "Limits" (APEX Calculus Ch. 1), adapted under CC BY-NC 4.0 (G. Hartman et al.). */

export const limitsLessons: Lesson[] = [
  {
    id: 'limits-introduction-to-limits',
    chapterId: 'limits',
    title: 'An Introduction to Limits',
    description:
      'What a limit describes, how to read it from a graph or table, and the three ways a limit can fail to exist.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'intro-where-heading',
        type: 'concept',
        title: 'Where a function is heading',
        body: 'The limit of $f(x)$ as $x$ approaches $c$, written $\\lim_{x\\to c} f(x) = L$, names the single value $L$ that the outputs $f(x)$ near as the inputs $x$ near $c$. It describes where the function is heading, not necessarily the height it reaches at $c$. For $f(x)=\\dfrac{\\sin x}{x}$, the outputs settle near $0.84$ as $x$ nears $1$, so: $$\\lim_{x\\to 1}\\dfrac{\\sin x}{x}\\approx 0.84$$',
        visual: {
          type: 'function-explorer',
          label: 'Drag $x$ toward $1$: the outputs of $\\dfrac{\\sin x}{x}$ head toward about $0.84$.',
          fn: (x) => Math.sin(x) / x,
          xMin: 0.2,
          xMax: 2,
          markedX: 1,
        },
        interactiveNote:
          'Drag the point toward the marked $x=1$ and watch the $(x,\\ f(x))$ readout settle near $0.84$ — the single value the outputs head toward, with no need to land on $x=1$ itself.',
      },
      {
        id: 'intro-approaching-not-arriving',
        type: 'concept',
        title: 'Approaching, not arriving',
        body: 'Substituting $x=0$ into $\\dfrac{\\sin x}{x}$ gives $\\dfrac{0}{0}$, which is indeterminate: by itself it tells us nothing. Yet a graph and a table of nearby values show the outputs closing in on $1$, so: $$\\lim_{x\\to 0}\\dfrac{\\sin x}{x}\\approx 1$$ The point at $x=0$ is missing, but the limit cares only about nearby behavior.',
        visual: {
          type: 'function-explorer',
          label: 'The output heads to $1$ as $x\\to 0$, even though $\\dfrac{\\sin x}{x}$ is undefined at $0$.',
          fn: (x) => Math.sin(x) / x,
          xMin: -7,
          xMax: 7,
          initialX: 2,
          markedPoints: [{ x: 0, y: 1, label: 'hole' }],
        },
        interactiveNote:
          'Drag the point from $x=2$ in toward $x=0$ and watch $f(x)$ close in on $1$, even though the marked hole shows the curve has no value exactly at $x=0$.',
      },
      {
        id: 'intro-limit-vs-value',
        type: 'multiple-choice',
        title: 'The value at the point does not matter',
        prompt:
          'A graph approaches height $3$ from both sides of $x=2$, yet the function is defined so that $f(2)=5$. What is $\\lim_{x\\to 2} f(x)$?',
        options: [
          { id: 'three', label: '$3$' },
          { id: 'five', label: '$5$' },
          { id: 'dne', label: 'It does not exist' },
          { id: 'four', label: '$4$, the average of the two' },
        ],
        correctOptionId: 'three',
        correctExplanation:
          'Correct. The limit depends only on the nearby outputs, which approach $3$. The single value $f(2)=5$ is irrelevant to the limit.',
        incorrectExplanation:
          'A limit ignores the value at the point itself. Both sides approach $3$, so the limit is $3$ even though $f(2)=5$.',
        hint: 'Limits describe where the curve heads, not the dot drawn at the point.',
        visual: {
          type: 'function-explorer',
          label: 'Outputs head to $3$ near $x=2$, but the value is placed at $5$.',
          fn: (x) => x + 1,
          xMin: -1,
          xMax: 5,
          holePoint: { x: 2, value: 5, holeY: 3 },
        },
      },
      {
        id: 'intro-three-ways-fail',
        type: 'concept',
        title: 'Three ways a limit can fail',
        body: 'A limit need not exist. There are three common ways it can fail at $x=c$: the function may approach different values from the left and the right; the function may grow without bound; or the function may oscillate without settling on a value. Each is a distinct kind of failure.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A jump: the left and right approaches disagree, so the limit fails to exist.',
          shape: 'jump',
        },
        interactiveNote:
          'Drag the red point toward the break and watch it leap the gap: the approaches from the two sides land at different heights, so the outputs never settle on one value.',
      },
      {
        id: 'intro-grows-without-bound',
        type: 'multiple-choice',
        title: 'Growing without bound',
        prompt:
          'As $x$ nears $1$, the outputs of $\\dfrac{1}{(x-1)^2}$ grow larger and larger without bound. What is $\\lim_{x\\to 1}\\dfrac{1}{(x-1)^2}$?',
        options: [
          { id: 'dne', label: 'It does not exist; the outputs increase without bound' },
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'half', label: '$\\dfrac{1}{2}$' },
        ],
        correctOptionId: 'dne',
        correctExplanation:
          'Correct. The outputs never settle on a finite number; they grow without bound, so the limit does not exist.',
        incorrectExplanation:
          'Near $1$ the denominator $(x-1)^2$ is tiny and positive, so the quotient becomes arbitrarily large. There is no finite limiting value.',
        hint: 'Dividing $1$ by an ever smaller positive number produces an ever larger result.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{1}{(x-1)^2}$ shoots up near the vertical asymptote $x=1$.',
          fn: (x) => 1 / ((x - 1) * (x - 1)),
          xMin: -1,
          xMax: 3,
          yMin: 0,
          yMax: 12,
          asymptotes: { vertical: [1] },
        },
      },
      {
        id: 'intro-oscillation',
        type: 'multiple-choice',
        title: 'Oscillation',
        prompt: 'Why does $\\lim_{x\\to 0}\\sin\\!\\left(\\dfrac{1}{x}\\right)$ fail to exist?',
        options: [
          { id: 'oscillate', label: 'The outputs oscillate between $-1$ and $1$ without settling' },
          { id: 'unbounded', label: 'The outputs grow without bound' },
          { id: 'zero', label: 'The outputs approach $0$' },
          { id: 'one', label: 'The outputs approach $1$' },
        ],
        correctOptionId: 'oscillate',
        correctExplanation:
          'Correct. As $x\\to 0$, $\\tfrac{1}{x}$ races through huge values and $\\sin(1/x)$ takes every value in $[-1,1]$ infinitely often, never settling.',
        incorrectExplanation:
          'The function stays between $-1$ and $1$, so it is not unbounded; instead it oscillates faster and faster near $0$ and never approaches one value.',
        hint: 'Sine always stays between $-1$ and $1$. What does its argument $1/x$ do near $0$?',
        visual: {
          type: 'function-explorer',
          label: '$\\sin\\!\\left(\\dfrac{1}{x}\\right)$ oscillates ever faster as $x\\to 0$.',
          fn: (x) => Math.sin(1 / x),
          xMin: -1,
          xMax: 1,
          yMin: -1.3,
          yMax: 1.3,
        },
      },
      {
        id: 'intro-difference-quotient',
        type: 'concept',
        title: 'The difference quotient',
        body: 'For a position function $f$, the average velocity between $x=a$ and $x=a+h$ is the difference quotient: $$\\dfrac{f(a+h)-f(a)}{h}$$ This is exactly the rise over run of the secant line through the two points on the graph. Shrinking the interval by letting $h\\to 0$ turns the average rate into an instantaneous one.',
        visual: {
          type: 'rate-window',
          label: 'Shrink the interval: the secant slope is the difference quotient.',
          initialStartX: 1,
          initialEndX: 4,
        },
        interactiveNote:
          'Drag the two endpoints closer together and watch the average-rate readout: it is the secant slope, the difference quotient $\\dfrac{f(a+h)-f(a)}{h}$, edging toward the instantaneous rate as $h\\to 0$.',
      },
      {
        id: 'intro-difference-quotient-meaning',
        type: 'multiple-choice',
        title: 'Reading the difference quotient',
        prompt: 'The difference quotient $\\dfrac{f(a+h)-f(a)}{h}$ measures which quantity?',
        options: [
          { id: 'secant', label: 'The average rate of change, i.e. the slope of the secant line on the interval' },
          { id: 'area', label: 'The exact area under $f$ on the interval' },
          { id: 'value', label: 'The value $f(a)$' },
          { id: 'vertical', label: 'The slope of a vertical line' },
        ],
        correctOptionId: 'secant',
        correctExplanation:
          'Correct. It is rise over run between two points on the graph, the slope of the secant line and the average rate of change over the interval of length $h$.',
        incorrectExplanation:
          'The difference quotient is a ratio of the change in output to the change in input, which is the secant slope, i.e. the average rate of change.',
        hint: 'Think "rise over run" between two points on the graph.',
        visual: {
          type: 'rate-window',
          label: 'The endpoints set a secant line whose slope is the difference quotient.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
    ],
  },
  {
    id: 'limits-epsilon-delta-definition',
    chapterId: 'limits',
    title: 'The Epsilon-Delta Definition of a Limit',
    description:
      'Turning "gets arbitrarily close" into a precise challenge-and-response game with tolerances.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'eps-making-near-precise',
        type: 'concept',
        title: 'Making "near" precise',
        body: 'Saying $f(x)$ gets "near" $L$ is too vague to build mathematics on. The precise idea is a tolerance game: we name how close the output must be to $L$ (a $y$-tolerance), and respond with how close the input must be to $c$ (an $x$-tolerance). Tradition writes the input tolerance as $\\delta$ and the output tolerance as $\\varepsilon$.',
        visual: {
          type: 'function-explorer',
          label: 'As $x\\to 4$, $\\sqrt{x}$ homes in on $L=2$; "close" needs an exact meaning.',
          preset: 'sqrt',
          xMin: 0,
          xMax: 9,
          markedX: 4,
        },
        interactiveNote:
          'Drag the point toward the marked $x=4$ and watch $\\sqrt{x}$ home in on $2$; the tolerance game just pins down how tightly that readout must hug $2$.',
      },
      {
        id: 'eps-definition',
        type: 'concept',
        title: 'The definition',
        body: 'Formally, $\\lim_{x\\to c} f(x) = L$ means: given any $\\varepsilon > 0$, there exists $\\delta > 0$ such that whenever $0 < |x - c| < \\delta$, it follows that $|f(x) - L| < \\varepsilon$. The clause $0 < |x-c|$ excludes $x=c$ itself, so the value $f(c)$ never enters the picture.',
        visual: {
          type: 'function-explorer',
          label: 'Horizontal band is $L\\pm\\varepsilon$; vertical band is $c\\pm\\delta$ at $c=1$, $L=1$.',
          fn: (x) => x,
          xMin: 0,
          xMax: 2,
          markedX: 1,
          asymptotes: { horizontal: [0.6, 1.4], vertical: [0.6, 1.4] },
        },
        interactiveNote:
          'Drag the point and notice that holding $x$ inside the vertical dashed band $c\\pm\\delta$ forces $f(x)$ into the horizontal dashed band $L\\pm\\varepsilon$ — the "if $0<|x-c|<\\delta$ then $|f(x)-L|<\\varepsilon$" promise made visible.',
      },
      {
        id: 'eps-distance',
        type: 'concept',
        title: 'Distance as absolute value',
        body: 'The statement "$x$ is within $\\delta$ of $c$" is written $|x-c|<\\delta$, which is the same as $c-\\delta < x < c+\\delta$. Likewise "$f(x)$ is within $\\varepsilon$ of $L$" is $|f(x)-L|<\\varepsilon$, that is, $L-\\varepsilon < f(x) < L+\\varepsilon$. Absolute value measures distance on the number line.',
        visual: {
          type: 'function-explorer',
          label: 'A small window around $c=1$ on the input forces a small window around $L$ on the output.',
          fn: (x) => 2 * x,
          xMin: 0,
          xMax: 2,
          markedX: 1,
        },
        interactiveNote:
          'Drag the point and watch how a small distance from the marked $x=1$ keeps $f(x)=2x$ a small distance from $L=2$ — the readout is just $|x-1|$ and $|f(x)-2|$ shrinking together.',
      },
      {
        id: 'eps-role',
        type: 'multiple-choice',
        title: 'Which tolerance comes first?',
        prompt:
          'In the precise definition of a limit, what does $\\varepsilon$ measure, and which tolerance is named first?',
        options: [
          { id: 'output-first', label: 'The output tolerance around $L$; $\\varepsilon$ is given first' },
          { id: 'input-first', label: 'The input tolerance around $c$; $\\varepsilon$ is given first' },
          { id: 'the-limit', label: 'The value of the limit itself' },
          { id: 'slope', label: 'The slope of $f$ at $c$' },
        ],
        correctOptionId: 'output-first',
        correctExplanation:
          'Correct. The challenge $\\varepsilon$ (output closeness to $L$) is given first; you then respond with an input radius $\\delta$ that works.',
        incorrectExplanation:
          '$\\varepsilon$ is the required output closeness to $L$, and it is named first. The input radius you find in response is $\\delta$.',
        hint: 'One Greek letter measures output error; the other measures input distance. Which is the "challenge"?',
        visual: {
          type: 'function-explorer',
          label: 'First fix the output band $L\\pm\\varepsilon$, then find an input band $c\\pm\\delta$.',
          preset: 'sqrt',
          xMin: 0,
          xMax: 9,
          markedX: 4,
        },
      },
      {
        id: 'eps-translate',
        type: 'multiple-choice',
        title: 'Translate the inequality',
        prompt: 'Which compound inequality is equivalent to $|x - 4| < \\delta$?',
        options: [
          { id: 'interval', label: '$4-\\delta < x < 4+\\delta$' },
          { id: 'origin', label: '$-\\delta < x < \\delta$' },
          { id: 'one-side', label: '$x < 4 + \\delta$ only' },
          { id: 'product', label: '$0 < x < 4\\delta$' },
        ],
        correctOptionId: 'interval',
        correctExplanation:
          'Correct. $|x-4|<\\delta$ says $x$ is within $\\delta$ of $4$, i.e. $4-\\delta < x < 4+\\delta$.',
        incorrectExplanation:
          '$|x-4|$ is the distance from $x$ to $4$, so $|x-4|<\\delta$ means $4-\\delta < x < 4+\\delta$.',
        hint: 'Absolute value is distance: $|x-4|$ is how far $x$ is from $4$.',
        visual: {
          type: 'function-explorer',
          label: 'The band $4-\\delta < x < 4+\\delta$ around $c=4$.',
          fn: (x) => x,
          xMin: 0,
          xMax: 8,
          markedX: 4,
        },
      },
      {
        id: 'eps-find-delta-line',
        type: 'multiple-choice',
        title: 'Find a delta for a line',
        prompt:
          'For $f(x)=3x$ near $c=1$ with $L=3$, which choice of $\\delta$ guarantees $|f(x)-3|<\\varepsilon$?',
        options: [
          { id: 'eps3', label: '$\\delta = \\dfrac{\\varepsilon}{3}$' },
          { id: 'eps', label: '$\\delta = \\varepsilon$' },
          { id: 'threeeps', label: '$\\delta = 3\\varepsilon$' },
          { id: 'epssq', label: '$\\delta = \\varepsilon^2$' },
        ],
        correctOptionId: 'eps3',
        correctExplanation:
          'Correct. $|3x-3| = 3|x-1| < \\varepsilon$ exactly when $|x-1| < \\dfrac{\\varepsilon}{3}$, so $\\delta = \\dfrac{\\varepsilon}{3}$ works.',
        incorrectExplanation:
          'Set $|3x-3| < \\varepsilon$. Factoring gives $3|x-1| < \\varepsilon$, so $|x-1| < \\dfrac{\\varepsilon}{3}$.',
        hint: 'Write $|3x-3| = 3|x-1|$ and solve for $|x-1|$.',
        visual: {
          type: 'function-explorer',
          label: 'The line $f(x)=3x$ near $c=1$.',
          fn: (x) => 3 * x,
          xMin: 0,
          xMax: 2,
          markedX: 1,
        },
      },
      {
        id: 'eps-scratch-work',
        type: 'concept',
        title: 'Working backward to find delta',
        body: 'A typical proof works backward. To show $\\lim_{x\\to 4}\\sqrt{x}=2$, start from the goal $|\\sqrt{x}-2|<\\varepsilon$ and unravel it into a bound on $|x-4|$. Doing so produces the rule: $$\\delta = 4\\varepsilon - \\varepsilon^2$$ For any $\\varepsilon>0$, choosing that $\\delta$ forces $|\\sqrt{x}-2|<\\varepsilon$.',
        visual: {
          type: 'function-explorer',
          label: 'Choosing $\\delta=4\\varepsilon-\\varepsilon^2$ keeps $\\sqrt{x}$ within $\\varepsilon$ of $2$.',
          preset: 'sqrt',
          xMin: 0,
          xMax: 9,
          markedX: 4,
        },
        interactiveNote:
          'Drag the point across the marked $x=4$ and notice the narrower you hold $x$ around $4$, the closer $\\sqrt{x}$ sits to $2$ — exactly the trade the rule $\\delta=4\\varepsilon-\\varepsilon^2$ turns into a formula.',
      },
      {
        id: 'eps-quadratic',
        type: 'multiple-choice',
        title: 'A delta for a parabola',
        prompt:
          'To prove $\\lim_{x\\to 2} x^2 = 4$, one first assumes $\\delta\\le 1$. Which $\\delta$ then completes the proof?',
        options: [
          { id: 'eps5', label: '$\\delta = \\dfrac{\\varepsilon}{5}$' },
          { id: 'eps2', label: '$\\delta = \\dfrac{\\varepsilon}{2}$' },
          { id: 'eps', label: '$\\delta = \\varepsilon$' },
          { id: 'fiveeps', label: '$\\delta = 5\\varepsilon$' },
        ],
        correctOptionId: 'eps5',
        correctExplanation:
          'Correct. With $|x-2|<1$ we get $|x+2|<5$, so $|x^2-4|=|x-2|\\,|x+2|<5\\delta$; setting $\\delta=\\dfrac{\\varepsilon}{5}$ makes this $<\\varepsilon$.',
        incorrectExplanation:
          'Factor $|x^2-4|=|x-2|\\,|x+2|$. Restricting $|x-2|<1$ bounds $|x+2|<5$, so $\\delta=\\dfrac{\\varepsilon}{5}$ works.',
        hint: 'Factor $x^2-4=(x-2)(x+2)$ and bound $|x+2|$ when $x$ is near $2$.',
        visual: {
          type: 'function-explorer',
          label: 'The parabola $f(x)=x^2$ near $c=2$, where $L=4$.',
          fn: (x) => x * x,
          xMin: 0,
          xMax: 4,
          markedX: 2,
        },
      },
    ],
  },
  {
    id: 'limits-finding-limits-analytically',
    chapterId: 'limits',
    title: 'Finding Limits Analytically',
    description:
      'The limit laws, direct substitution, resolving the indeterminate form, and the special trigonometric limit.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'analytic-laws',
        type: 'concept',
        title: 'Limits respect arithmetic',
        body: 'When $\\lim_{x\\to c} f(x)=L$ and $\\lim_{x\\to c} g(x)=K$ both exist, limits combine predictably: $\\lim_{x\\to c}(f\\pm g)=L\\pm K$, $\\lim_{x\\to c}(b\\,f)=bL$, $\\lim_{x\\to c}(f\\,g)=LK$, and $\\lim_{x\\to c}\\dfrac{f}{g}=\\dfrac{L}{K}$ provided $K\\ne 0$. Powers and roots also pass through the limit.',
        visual: {
          type: 'function-explorer',
          label: 'For a continuous $f$, the limit is the value: $\\lim_{x\\to a} f(x)=f(a)$.',
          fn: (x) => x * x - x,
          xMin: -2,
          xMax: 3,
          markedX: 2,
        },
        interactiveNote:
          'Drag the point toward the marked $x=2$ and watch the readout meet $f(2)$ with no gap; because this $f$ is continuous, every limit law you apply ultimately rests on that limit-equals-value behavior.',
      },
      {
        id: 'analytic-use-laws',
        type: 'multiple-choice',
        title: 'Combine known limits',
        prompt:
          'Suppose $\\lim_{x\\to 2} f(x)=2$ and $\\lim_{x\\to 2} g(x)=3$. Find: $$\\lim_{x\\to 2}\\big(5f(x)+g(x)^2\\big)$$',
        options: [
          { id: 'nineteen', label: '$19$' },
          { id: 'thirteen', label: '$13$' },
          { id: 'twentyfive', label: '$25$' },
          { id: 'sixteen', label: '$16$' },
        ],
        correctOptionId: 'nineteen',
        correctExplanation:
          'Correct. By the scalar, sum, and power rules: $$5(2)+3^2 = 10+9 = 19$$',
        incorrectExplanation:
          'Apply the rules termwise: $\\lim 5f = 5\\cdot 2 = 10$ and $\\lim g^2 = 3^2 = 9$, so the total is $19$.',
        hint: 'Pull the $5$ out, square the limit of $g$, then add.',
        visual: {
          type: 'function-explorer',
          label: 'The limit laws let you build new limits from known ones.',
          fn: (x) => 5 * x - 1,
          xMin: 0,
          xMax: 4,
          markedX: 2,
        },
      },
      {
        id: 'analytic-substitute',
        type: 'concept',
        title: 'Polynomials and rationals: just substitute',
        body: 'Polynomials are continuous, so their limits are found by substitution: $$\\lim_{x\\to c} p(x)=p(c)$$ A rational function obeys $$\\lim_{x\\to c}\\dfrac{p(x)}{q(x)}=\\dfrac{p(c)}{q(c)}$$ as long as $q(c)\\ne 0$. For example: $$\\lim_{x\\to 2}(3x^2-5x+7)=3(2)^2-5(2)+7=9$$',
        visual: {
          type: 'function-explorer',
          label: 'Slide to $x=2$: $3x^2-5x+7$ passes through its value $9$.',
          fn: (x) => 3 * x * x - 5 * x + 7,
          xMin: 0,
          xMax: 4,
          markedX: 2,
        },
        interactiveNote:
          'Drag the point to the marked $x=2$ and watch $f(x)$ read $9$ as the curve passes through unbroken — visible proof that substitution is allowed for a continuous polynomial.',
      },
      {
        id: 'analytic-rational',
        type: 'multiple-choice',
        title: 'A rational limit by substitution',
        prompt: 'Evaluate: $$\\lim_{x\\to -1}\\dfrac{3x^2-5x+1}{x^4-x^2+3}$$',
        options: [
          { id: 'three', label: '$3$' },
          { id: 'third', label: '$\\dfrac{1}{3}$' },
          { id: 'nine', label: '$9$' },
          { id: 'zero', label: '$0$' },
        ],
        correctOptionId: 'three',
        correctExplanation:
          'Correct. The denominator is nonzero at $-1$, so substitute: $$\\dfrac{3+5+1}{1-1+3}=\\dfrac{9}{3}=3$$',
        incorrectExplanation:
          'Since $q(-1)=3\\ne 0$, just substitute: numerator $=9$, denominator $=3$, giving $3$.',
        hint: 'Check the denominator is nonzero, then plug in $x=-1$.',
        visual: {
          type: 'function-explorer',
          label: 'A rational function with no break at $x=-1$.',
          fn: (x) => (3 * x * x - 5 * x + 1) / (x * x * x * x - x * x + 3),
          xMin: -3,
          xMax: 3,
          markedX: -1,
        },
      },
      {
        id: 'analytic-cancel',
        type: 'concept',
        title: 'Resolving the indeterminate form',
        body: 'If substitution yields $\\dfrac{0}{0}$, the form is indeterminate, not automatically undefined: the numerator and denominator share a factor of $(x-c)$. Cancel it and re-evaluate. For instance, $$\\dfrac{x^2-1}{x-1}=\\dfrac{(x-1)(x+1)}{x-1}=x+1$$ for $x\\ne 1$, so $\\lim_{x\\to 1}\\dfrac{x^2-1}{x-1}=2$.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{x^2-1}{x-1}$ matches $x+1$ everywhere except the hole at $x=1$.',
          fn: (x) => (x * x - 1) / (x - 1),
          secondaryFn: (x) => x + 1,
          xMin: -1,
          xMax: 3,
          markedPoints: [{ x: 1, y: 2, label: 'hole' }],
        },
        interactiveNote:
          'Toggle between $f$ and the cancelled form $x+1$ and drag the point toward $x=1$: the two curves sit exactly on top of each other, and the readout heads to $2$ at the marked hole where $f$ alone is undefined.',
      },
      {
        id: 'analytic-rationalize',
        type: 'multiple-choice',
        title: 'Rationalize, then evaluate',
        prompt: 'Evaluate: $$\\lim_{x\\to 9}\\dfrac{\\sqrt{x}-3}{x-9}$$',
        options: [
          { id: 'sixth', label: '$\\dfrac{1}{6}$' },
          { id: 'third', label: '$\\dfrac{1}{3}$' },
          { id: 'zero', label: '$0$' },
          { id: 'dne', label: 'It does not exist' },
        ],
        correctOptionId: 'sixth',
        correctExplanation:
          'Correct. Multiply by the conjugate: $$\\dfrac{\\sqrt{x}-3}{x-9}=\\dfrac{1}{\\sqrt{x}+3}$$ for $x\\ne 9$, which is $\\dfrac{1}{6}$ at $x=9$.',
        incorrectExplanation:
          'Since $x-9=(\\sqrt{x}-3)(\\sqrt{x}+3)$, the ratio is $\\dfrac{1}{\\sqrt{x}+3}$, giving $\\dfrac{1}{6}$.',
        hint: 'Multiply numerator and denominator by the conjugate $\\sqrt{x}+3$.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{\\sqrt{x}-3}{x-9}$ heads to $\\dfrac{1}{6}$ at the hole $x=9$.',
          fn: (x) => (Math.sqrt(x) - 3) / (x - 9),
          xMin: 0,
          xMax: 18,
          markedPoints: [{ x: 9, y: 1 / 6, label: 'hole' }],
        },
      },
      {
        id: 'analytic-special-limits',
        type: 'concept',
        title: 'Special limits',
        body: 'A few limits cannot be found by substitution but appear constantly: $\\lim_{x\\to 0}\\dfrac{\\sin x}{x}=1$, $\\lim_{x\\to 0}\\dfrac{\\cos x-1}{x}=0$, $\\lim_{x\\to 0}(1+x)^{1/x}=e$, and $\\lim_{x\\to 0}\\dfrac{e^x-1}{x}=1$. Each is an indeterminate form whose value comes from closer analysis.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{\\sin x}{x}\\to 1$ as $x\\to 0$, with a hole at the origin.',
          fn: (x) => Math.sin(x) / x,
          xMin: -7,
          xMax: 7,
          initialX: 2,
          markedPoints: [{ x: 0, y: 1, label: 'limit 1' }],
        },
        interactiveNote:
          'Drag the point from $x=2$ toward $x=0$ and watch $f(x)$ approach the marked limit $1$ — a value substitution cannot give, since $\\dfrac{\\sin x}{x}$ is the indeterminate $\\tfrac{0}{0}$ form there.',
      },
      {
        id: 'analytic-squeeze',
        type: 'concept',
        title: 'The Squeeze Theorem and the unit circle',
        body: 'The Squeeze Theorem says that if $f(x)\\le g(x)\\le h(x)$ near $c$ and $\\lim_{x\\to c} f=\\lim_{x\\to c} h=L$, then $\\lim_{x\\to c} g=L$ too. Comparing areas on the unit circle gives $$\\cos\\theta \\le \\dfrac{\\sin\\theta}{\\theta} \\le 1$$ Since $\\cos\\theta\\to 1$, the ratio is squeezed to $1$, proving $$\\lim_{\\theta\\to 0}\\dfrac{\\sin\\theta}{\\theta}=1$$',
        visual: {
          type: 'unit-circle',
          label: 'Each point on the unit circle is $(\\cos\\theta,\\ \\sin\\theta)$; the legs bound $\\dfrac{\\sin\\theta}{\\theta}$.',
          initialStepIndex: 1,
        },
        interactiveNote:
          'Drag the point around the circle and read the legs $\\cos\\theta$ and $\\sin\\theta$; as $\\theta$ snaps toward $0$, $\\cos\\theta$ rises to $1$, squeezing the trapped ratio $\\dfrac{\\sin\\theta}{\\theta}$ up to $1$ as well.',
      },
      {
        id: 'analytic-trig-limit',
        type: 'multiple-choice',
        title: 'A special trigonometric limit',
        prompt: 'Evaluate: $$\\lim_{x\\to 0}\\dfrac{\\sin 3x}{x}$$',
        options: [
          { id: 'three', label: '$3$' },
          { id: 'one', label: '$1$' },
          { id: 'third', label: '$\\dfrac{1}{3}$' },
          { id: 'zero', label: '$0$' },
        ],
        correctOptionId: 'three',
        correctExplanation:
          'Correct. Write $$\\dfrac{\\sin 3x}{x}=3\\cdot\\dfrac{\\sin 3x}{3x}$$ and $\\dfrac{\\sin 3x}{3x}\\to 1$, so the limit is $3$.',
        incorrectExplanation:
          'Match the angle inside sine with the denominator: $$\\dfrac{\\sin 3x}{x}=3\\cdot\\dfrac{\\sin 3x}{3x}\\to 3\\cdot 1 = 3$$',
        hint: 'Force the denominator to match the angle $3x$, using $\\dfrac{\\sin u}{u}\\to 1$.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{\\sin 3x}{x}$ heads to $3$ at the hole $x=0$.',
          fn: (x) => Math.sin(3 * x) / x,
          xMin: -2,
          xMax: 2,
          markedPoints: [{ x: 0, y: 3, label: 'limit 3' }],
        },
      },
    ],
  },
  {
    id: 'limits-one-sided-limits',
    chapterId: 'limits',
    title: 'One-Sided Limits',
    description:
      'Left- and right-hand limits, and the rule that a two-sided limit exists only when the sides agree.',
    status: 'available',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'onesided-notation',
        type: 'concept',
        title: 'Approaching from one side',
        body: 'A one-sided limit watches the inputs approach $c$ from a single direction. The left-hand limit $\\lim_{x\\to c^-} f(x)$ uses only inputs with $x<c$; the right-hand limit $\\lim_{x\\to c^+} f(x)$ uses only inputs with $x>c$. The superscript marks the side, not a sign.',
        visual: {
          type: 'nonsmooth-example',
          label: 'Compare the left approach and the right approach at the break.',
          shape: 'jump',
        },
        interactiveNote:
          'Drag the red point in toward the break from each side and watch it jump across the gap: the $x<c$ approach and the $x>c$ approach reach different heights, which is what one-sided limits measure separately.',
      },
      {
        id: 'onesided-theorem',
        type: 'concept',
        title: 'When the two-sided limit exists',
        body: 'The two-sided limit exists exactly when both one-sided limits exist and agree: $\\lim_{x\\to c} f(x)=L$ if and only if $\\lim_{x\\to c^-} f(x)=L$ and $\\lim_{x\\to c^+} f(x)=L$. If the two sides disagree, the two-sided limit does not exist.',
        visual: {
          type: 'function-explorer',
          label: 'At $x=1$ the left approach gives $1$ and the right approach gives $2$.',
          fn: (x) => (x <= 1 ? x : 3 - x),
          xMin: 0,
          xMax: 2,
          yMin: 0,
          yMax: 3,
        },
        interactiveNote:
          'Drag the point toward $x=1$ along the $x<1$ piece, then along the $x>1$ piece, and watch the readout head to $1$ one way but $2$ the other — the sides disagree, so the two-sided limit does not exist.',
      },
      {
        id: 'onesided-left',
        type: 'multiple-choice',
        title: 'Read a left-hand limit',
        prompt:
          'For $f(x)=\\begin{cases} x & 0\\le x\\le 1 \\\\ 3-x & 1<x<2 \\end{cases}$, find $\\lim_{x\\to 1^-} f(x)$.',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'two', label: '$2$' },
          { id: 'three', label: '$3$' },
          { id: 'dne', label: 'It does not exist' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. Approaching from the left uses the piece $f(x)=x$, which heads to $1$ as $x\\to 1^-$.',
        incorrectExplanation:
          'For $x<1$ the rule is $f(x)=x$, so as $x\\to 1^-$ the outputs approach $1$.',
        hint: 'Use the piece that applies for $x$ just below $1$.',
        visual: {
          type: 'function-explorer',
          label: 'From the left ($x<1$), the active piece is $f(x)=x$.',
          fn: (x) => (x <= 1 ? x : 3 - x),
          xMin: 0,
          xMax: 2,
          yMin: 0,
          yMax: 3,
        },
      },
      {
        id: 'onesided-right',
        type: 'multiple-choice',
        title: 'Read a right-hand limit',
        prompt:
          'For the same $f(x)=\\begin{cases} x & 0\\le x\\le 1 \\\\ 3-x & 1<x<2 \\end{cases}$, find $\\lim_{x\\to 1^+} f(x)$.',
        options: [
          { id: 'two', label: '$2$' },
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'dne', label: 'It does not exist' },
        ],
        correctOptionId: 'two',
        correctExplanation:
          'Correct. Approaching from the right uses $f(x)=3-x$, which heads to $3-1=2$ as $x\\to 1^+$.',
        incorrectExplanation:
          'For $x>1$ the rule is $f(x)=3-x$, so as $x\\to 1^+$ the outputs approach $2$.',
        hint: 'Use the piece that applies for $x$ just above $1$.',
        visual: {
          type: 'function-explorer',
          label: 'From the right ($x>1$), the active piece is $f(x)=3-x$.',
          fn: (x) => (x <= 1 ? x : 3 - x),
          xMin: 0,
          xMax: 2,
          yMin: 0,
          yMax: 3,
        },
      },
      {
        id: 'onesided-two-sided',
        type: 'multiple-choice',
        title: 'Does the two-sided limit exist?',
        prompt:
          'For the same $f$, the left-hand limit at $1$ is $1$ and the right-hand limit at $1$ is $2$. What is $\\lim_{x\\to 1} f(x)$?',
        options: [
          { id: 'dne', label: 'It does not exist' },
          { id: 'one', label: '$1$' },
          { id: 'two', label: '$2$' },
          { id: 'avg', label: '$1.5$, the average of the sides' },
        ],
        correctOptionId: 'dne',
        correctExplanation:
          'Correct. The one-sided limits disagree ($1\\ne 2$), so the two-sided limit does not exist.',
        incorrectExplanation:
          'A two-sided limit exists only when both sides agree. Here they differ, so there is no single limiting value.',
        hint: 'Compare the left and right approaches. Do they match?',
        visual: {
          type: 'function-explorer',
          label: 'The sides head to different heights, so the two-sided limit fails.',
          fn: (x) => (x <= 1 ? x : 3 - x),
          xMin: 0,
          xMax: 2,
          yMin: 0,
          yMax: 3,
        },
      },
      {
        id: 'onesided-value-vs-limit',
        type: 'concept',
        title: 'Value and limit are separate',
        body: 'Even when the two-sided limit exists, it may differ from the function value. If $f(x)=(x-1)^2$ for $x\\ne 1$ but $f(1)=1$, then both sides approach $0$, so $\\lim_{x\\to 1} f(x)=0$, while $f(1)=1$. The limit and the value answer different questions.',
        visual: {
          type: 'function-explorer',
          label: 'The curve heads to $0$ at $x=1$ (open hole), but the value is placed at $1$.',
          fn: (x) => (x - 1) * (x - 1),
          xMin: -0.2,
          xMax: 2.2,
          yMin: -0.2,
          yMax: 2,
          holePoint: { x: 1, value: 1, holeY: 0 },
        },
        interactiveNote:
          'Drag the point toward $x=1$ and watch it snap up to the filled dot at $1$, while the open hole marks the height $0$ the curve is actually approaching — the limit is $0$ even though the value is $1$.',
      },
      {
        id: 'onesided-sign-function',
        type: 'multiple-choice',
        title: 'The sign function',
        prompt:
          'For $f(x)=\\dfrac{|x|}{x}$ with $x\\ne 0$, the left side gives $-1$ and the right side gives $1$. What is $\\lim_{x\\to 0} f(x)$?',
        options: [
          { id: 'dne', label: 'It does not exist' },
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'negone', label: '$-1$' },
        ],
        correctOptionId: 'dne',
        correctExplanation:
          'Correct. The left-hand limit is $-1$ and the right-hand limit is $1$; since they differ, the two-sided limit does not exist.',
        incorrectExplanation:
          'For $x<0$, $\\dfrac{|x|}{x}=-1$; for $x>0$ it is $1$. The sides disagree, so the limit does not exist.',
        hint: 'Evaluate $\\dfrac{|x|}{x}$ separately for negative and positive $x$.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A jump between $-1$ and $1$ at $x=0$.',
          shape: 'jump',
        },
      },
    ],
  },
  {
    id: 'limits-continuity',
    chapterId: 'limits',
    title: 'Continuity',
    description:
      'The definition of continuity, the kinds of discontinuity, and the Intermediate Value Theorem.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'continuity-definition',
        type: 'concept',
        title: 'Continuous at a point',
        body: 'A function $f$ is continuous at $x=c$ when $$\\lim_{x\\to c} f(x)=f(c)$$ Three things must hold: $f(c)$ is defined, $\\lim_{x\\to c} f(x)$ exists, and the two are equal. Intuitively, the graph passes through $(c,f(c))$ with no hole, jump, or break.',
        visual: {
          type: 'function-explorer',
          label: 'A continuous curve: at $x=1$ the limit equals the value, $\\lim f=f(1)$.',
          fn: (x) => Math.sin(x) + 2,
          xMin: -3.14,
          xMax: 3.14,
          markedX: 1,
        },
        interactiveNote:
          'Drag the point through the marked $x=1$ and notice the readout flows through $f(1)$ with no hole, jump, or gap — limit and value agreeing is exactly the definition of continuity there.',
      },
      {
        id: 'continuity-criteria',
        type: 'multiple-choice',
        title: 'The defining condition',
        prompt: 'Which statement exactly captures "$f$ is continuous at $c$"?',
        options: [
          { id: 'limeqval', label: '$\\lim_{x\\to c} f(x)=f(c)$' },
          { id: 'zero', label: '$f(c)=0$' },
          { id: 'infinite', label: '$\\lim_{x\\to c} f(x)=\\infty$' },
          { id: 'increasing', label: '$f$ is increasing at $c$' },
        ],
        correctOptionId: 'limeqval',
        correctExplanation:
          'Correct. Continuity at $c$ means the limit exists, the value is defined, and they are equal: $$\\lim_{x\\to c} f(x)=f(c)$$',
        incorrectExplanation:
          'Continuity is not about a particular value or direction; it is the single equation $$\\lim_{x\\to c} f(x)=f(c)$$',
        hint: 'It is one equation tying the limit to the value at the point.',
        visual: {
          type: 'function-explorer',
          label: 'When limit and value coincide at $c$, the curve is unbroken there.',
          fn: (x) => Math.sin(x) + 2,
          xMin: -3.14,
          xMax: 3.14,
          markedX: 0,
        },
      },
      {
        id: 'continuity-classification',
        type: 'concept',
        title: 'Kinds of discontinuity',
        body: 'Discontinuities come in types. A removable discontinuity has $\\lim_{x\\to a} f(x)$ existing while $f(a)$ is missing or different — a hole that could be patched. A jump discontinuity has both one-sided limits existing but unequal. An infinite discontinuity has $f$ unbounded near $a$, as at a vertical asymptote.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A removable discontinuity: a single hole in an otherwise smooth curve.',
          shape: 'hole',
        },
        interactiveNote:
          'Drag the red point across the gap and watch it hop over one missing spot on an otherwise smooth curve — the limit still exists, so defining the value there would patch this removable discontinuity.',
      },
      {
        id: 'continuity-removable',
        type: 'multiple-choice',
        title: 'Classify a hole',
        prompt:
          'A graph reaches height $4$ from both sides of $x=4$, but there is an open circle at $(4,4)$ with no value defined. The limit exists yet the function is undefined there. This discontinuity is:',
        options: [
          { id: 'removable', label: 'removable' },
          { id: 'jump', label: 'a jump' },
          { id: 'infinite', label: 'infinite' },
          { id: 'none', label: 'nonexistent; it is continuous' },
        ],
        correctOptionId: 'removable',
        correctExplanation:
          'Correct. The limit exists but the value is missing, so the break is a removable discontinuity that could be patched by defining $f(4)=4$.',
        incorrectExplanation:
          'Both sides reach $4$, so the limit exists; the only problem is the missing value. That is a removable discontinuity.',
        hint: 'The limit is fine here; only the value at the point is missing.',
        visual: {
          type: 'nonsmooth-example',
          label: 'The limit exists at the hole, but no value is assigned.',
          shape: 'hole',
        },
      },
      {
        id: 'continuity-jump',
        type: 'multiple-choice',
        title: 'Classify a step',
        prompt:
          'A function equals $2$ for $x<0$ and $5$ for $x\\ge 0$, so the one-sided limits at $0$ are $2$ and $5$. This discontinuity is:',
        options: [
          { id: 'jump', label: 'a jump' },
          { id: 'removable', label: 'removable' },
          { id: 'infinite', label: 'infinite' },
          { id: 'none', label: 'nonexistent; it is continuous' },
        ],
        correctOptionId: 'jump',
        correctExplanation:
          'Correct. Both one-sided limits exist but differ ($2\\ne 5$), so the graph jumps; this is a jump discontinuity.',
        incorrectExplanation:
          'The sides head to different finite heights, the signature of a jump discontinuity.',
        hint: 'The two one-sided limits are finite but unequal.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A step function with a finite jump at $x=0$.',
          shape: 'jump',
        },
      },
      {
        id: 'continuity-common',
        type: 'concept',
        title: 'Functions continuous on their domains',
        body: 'Most familiar functions are continuous on their domains: polynomials, rational functions, roots, trigonometric, exponential, and logarithmic functions, along with their sums, products, quotients (where the denominator is nonzero), and compositions. For example, $f(x)=\\dfrac{1}{x}$ is continuous at every point of its domain, breaking only where $x=0$ is not in the domain.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{1}{x}$ is continuous on its domain, with a break only at $x=0$.',
          fn: (x) => 1 / x,
          xMin: -3,
          xMax: 3,
          yMin: -6,
          yMax: 6,
          asymptotes: { vertical: [0] },
        },
        interactiveNote:
          'Drag the point along $\\dfrac{1}{x}$ and notice the curve never breaks except at the dashed line $x=0$, the single input left out of its domain — so it is continuous everywhere it is defined.',
      },
      {
        id: 'continuity-ivt',
        type: 'concept',
        title: 'The Intermediate Value Theorem',
        body: 'If $f$ is continuous on $[a,b]$ and $y$ lies between $f(a)$ and $f(b)$, then $f(c)=y$ for some $c$ in $(a,b)$. A continuous graph cannot skip values. This is how a sign change forces a root: if $f(a)<0<f(b)$, some $c$ has $f(c)=0$. For $f(x)=x-\\cos x$, the sign changes on $[0,1]$, pinning a root near $0.739$.',
        visual: {
          type: 'function-explorer',
          label: '$x-\\cos x$ crosses zero between $0$ and $1$, so a root must exist there.',
          fn: (x) => x - Math.cos(x),
          xMin: 0,
          xMax: 1,
          markedX: 0.739,
          asymptotes: { horizontal: [0] },
        },
        interactiveNote:
          'Drag the point from $x=0$ to $x=1$ and watch $f(x)$ rise from negative to positive, crossing the dashed axis at the marked $x\\approx 0.739$ — a continuous curve cannot skip $0$, so the theorem forces a root there.',
      },
      {
        id: 'continuity-ivt-apply',
        type: 'multiple-choice',
        title: 'Guarantee a root',
        prompt:
          'A continuous function has $f(0)=-3$ and $f(2)=5$. What does the Intermediate Value Theorem guarantee?',
        options: [
          { id: 'root', label: 'Some $c$ in $(0,2)$ has $f(c)=0$' },
          { id: 'noroot', label: 'There is no root in $(0,2)$' },
          { id: 'tworoots', label: 'There are exactly two roots' },
          { id: 'max', label: 'The maximum value of $f$ is $5$' },
        ],
        correctOptionId: 'root',
        correctExplanation:
          'Correct. The output moves from $-3$ to $5$, so it passes through $0$; the theorem guarantees a $c$ in $(0,2)$ with $f(c)=0$.',
        incorrectExplanation:
          'Since $0$ lies between $f(0)=-3$ and $f(2)=5$, a continuous $f$ must hit $0$ somewhere in $(0,2)$.',
        hint: 'The output passes from negative to positive without skipping values.',
        visual: {
          type: 'function-explorer',
          label: 'A continuous curve from $(0,-3)$ to $(2,5)$ must cross the axis.',
          fn: (x) => 4 * x - 3,
          xMin: 0,
          xMax: 2,
          markedX: 0.75,
          asymptotes: { horizontal: [0] },
        },
      },
    ],
  },
  {
    id: 'limits-involving-infinity',
    chapterId: 'limits',
    title: 'Limits Involving Infinity',
    description:
      'Infinite limits and vertical asymptotes, indeterminate forms, and limits at infinity with horizontal asymptotes.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'infinity-infinite-limit',
        type: 'concept',
        title: 'When outputs grow without bound',
        body: 'When the outputs of $f$ grow without bound as $x$ nears $c$, we write $\\lim_{x\\to c} f(x)=\\infty$ as a description. For example: $$\\lim_{x\\to 0}\\dfrac{1}{x^2}=\\infty$$ since $\\dfrac{1}{x^2}$ becomes arbitrarily large near $0$. This is descriptive language: a limit of $\\infty$ means the limit does not exist as a finite number.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{1}{x^2}$ climbs without bound as $x\\to 0$.',
          fn: (x) => 1 / (x * x),
          xMin: -1,
          xMax: 1,
          yMin: 0,
          yMax: 12,
          asymptotes: { vertical: [0], horizontal: [0] },
        },
        interactiveNote:
          'Drag the point toward $x=0$ and watch $f(x)$ shoot off the top of the frame with no ceiling — the readout never settles on a finite number, which is what writing the limit as $\\infty$ records.',
      },
      {
        id: 'infinity-one-sided',
        type: 'multiple-choice',
        title: 'Different on each side',
        prompt:
          'For $f(x)=\\dfrac{1}{x}$, the outputs near $0$ behave differently on each side. What are $\\lim_{x\\to 0^-}\\dfrac{1}{x}$ and $\\lim_{x\\to 0^+}\\dfrac{1}{x}$?',
        options: [
          { id: 'split', label: '$-\\infty$ and $+\\infty$; the two-sided limit does not exist' },
          { id: 'bothpos', label: '$+\\infty$ and $+\\infty$' },
          { id: 'zero', label: '$0$ and $0$' },
          { id: 'one', label: 'Both equal $1$' },
        ],
        correctOptionId: 'split',
        correctExplanation:
          'Correct. For small negative $x$, $\\tfrac{1}{x}\\to -\\infty$; for small positive $x$, $\\tfrac{1}{x}\\to +\\infty$. The sides differ, so the two-sided limit does not exist.',
        incorrectExplanation:
          'The sign of $\\tfrac{1}{x}$ matches the sign of $x$, so the left limit is $-\\infty$ and the right limit is $+\\infty$.',
        hint: 'Check the sign of $\\tfrac{1}{x}$ for small negative and small positive $x$.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{1}{x}$ dives to $-\\infty$ on the left and climbs to $+\\infty$ on the right.',
          fn: (x) => 1 / x,
          xMin: -3,
          xMax: 3,
          yMin: -10,
          yMax: 10,
          asymptotes: { vertical: [0], horizontal: [0] },
        },
      },
      {
        id: 'infinity-vertical-asymptote',
        type: 'concept',
        title: 'Vertical asymptotes',
        body: 'The line $x=c$ is a vertical asymptote of $f$ when a one-sided (or two-sided) limit at $c$ is $\\infty$ or $-\\infty$. For a rational function this happens where the denominator is zero but the numerator is not. For $f(x)=\\dfrac{3x}{x^2-4}$ the denominator vanishes at $x=\\pm 2$, giving vertical asymptotes there.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{3x}{x^2-4}$ has vertical asymptotes at $x=-2$ and $x=2$.',
          fn: (x) => (3 * x) / (x * x - 4),
          xMin: -5,
          xMax: 5,
          yMin: -8,
          yMax: 8,
          asymptotes: { vertical: [-2, 2] },
        },
        interactiveNote:
          'Drag the point toward either dashed line $x=\\pm 2$ and watch $f(x)$ blow up the closer you get — that runaway is the limit becoming infinite where $x^2-4$ hits $0$ but the numerator $3x$ does not.',
      },
      {
        id: 'infinity-find-vertical',
        type: 'multiple-choice',
        title: 'Find the vertical asymptotes',
        prompt: 'Where are the vertical asymptotes of $f(x)=\\dfrac{3x}{x^2-4}$?',
        options: [
          { id: 'pm2', label: '$x=-2$ and $x=2$' },
          { id: 'zero', label: '$x=0$' },
          { id: 'yone', label: '$y=1$' },
          { id: 'none', label: 'There are none' },
        ],
        correctOptionId: 'pm2',
        correctExplanation:
          'Correct. $x^2-4=(x-2)(x+2)$ is zero at $x=\\pm 2$, where the numerator $3x$ is nonzero, so both are vertical asymptotes.',
        incorrectExplanation:
          'Set the denominator to zero: $x^2-4=0$ gives $x=\\pm 2$, and the numerator is nonzero there.',
        hint: 'Find where the denominator is zero but the numerator is not.',
        visual: {
          type: 'function-explorer',
          label: 'The curve blows up at $x=\\pm 2$.',
          fn: (x) => (3 * x) / (x * x - 4),
          xMin: -5,
          xMax: 5,
          yMin: -8,
          yMax: 8,
          asymptotes: { vertical: [-2, 2] },
        },
      },
      {
        id: 'infinity-indeterminate',
        type: 'concept',
        title: 'Indeterminate forms',
        body: 'Substitution sometimes yields an indeterminate form such as $\\dfrac{0}{0}$, $\\dfrac{\\infty}{\\infty}$, $\\infty-\\infty$, or $0\\cdot\\infty$; these signal that more work is needed and could equal anything. By contrast, $\\dfrac{1}{0}$ is not indeterminate — it signals an infinite limit. The $\\dfrac{0}{0}$ form of $\\dfrac{\\sin x}{x}$ hides the true value $1$.',
        visual: {
          type: 'function-explorer',
          label: 'The $\\tfrac{0}{0}$ form of $\\dfrac{\\sin x}{x}$ resolves to the value $1$.',
          fn: (x) => Math.sin(x) / x,
          xMin: -7,
          xMax: 7,
          initialX: 2,
          markedPoints: [{ x: 0, y: 1, label: 'limit 1' }],
        },
        interactiveNote:
          'Drag the point toward the marked hole at $x=0$ and watch $f(x)$ approach $1$: the $\\tfrac{0}{0}$ form gives no answer on its own, yet the readout shows a definite value waiting there.',
      },
      {
        id: 'infinity-limits-at-infinity',
        type: 'concept',
        title: 'Limits at infinity and horizontal asymptotes',
        body: 'Limits at infinity describe the far-left and far-right behavior. Since $\\dfrac{1}{x^n}\\to 0$ as $x\\to\\pm\\infty$, a rational function\u2019s end behavior is set by its leading terms. If $\\lim_{x\\to\\infty} f(x)=L$ or $\\lim_{x\\to-\\infty} f(x)=L$, the line $y=L$ is a horizontal asymptote. For $f(x)=\\dfrac{x^2}{x^2+4}$ the outputs approach $1$, so $y=1$ is a horizontal asymptote.',
        visual: {
          type: 'function-explorer',
          label: '$\\dfrac{x^2}{x^2+4}$ flattens toward the horizontal asymptote $y=1$.',
          fn: (x) => (x * x) / (x * x + 4),
          xMin: -20,
          xMax: 20,
          asymptotes: { horizontal: [1] },
        },
        interactiveNote:
          'Drag the point far out toward either edge of the window and watch $f(x)$ flatten onto the dashed line $y=1$ — that leveling-off is the limit at infinity, and $y=1$ is the horizontal asymptote it names.',
      },
      {
        id: 'infinity-rational-equal',
        type: 'multiple-choice',
        title: 'Equal degrees at infinity',
        prompt: 'Evaluate: $$\\lim_{x\\to\\infty}\\dfrac{x^3+2x+1}{4x^3-2x^2+9}$$',
        options: [
          { id: 'quarter', label: '$\\dfrac{1}{4}$' },
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'inf', label: '$\\infty$' },
        ],
        correctOptionId: 'quarter',
        correctExplanation:
          'Correct. Numerator and denominator both have degree $3$, so the limit is the ratio of leading coefficients, $\\dfrac{1}{4}$.',
        incorrectExplanation:
          'Divide top and bottom by $x^3$: every other term vanishes, leaving $\\dfrac{1}{4}$.',
        hint: 'When the degrees match, the limit is the ratio of the leading coefficients.',
        visual: {
          type: 'function-explorer',
          label: 'End behavior settles on $y=\\tfrac14$.',
          fn: (x) => (x * x * x + 2 * x + 1) / (4 * x * x * x - 2 * x * x + 9),
          xMin: -30,
          xMax: 30,
          asymptotes: { horizontal: [0.25] },
        },
      },
      {
        id: 'infinity-rational-smaller',
        type: 'multiple-choice',
        title: 'A bigger denominator',
        prompt: 'Evaluate: $$\\lim_{x\\to-\\infty}\\dfrac{x^2+2x-1}{x^3+1}$$',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'neginf', label: '$-\\infty$' },
          { id: 'half', label: '$\\dfrac{1}{2}$' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. The denominator has the higher degree, so the quotient shrinks to $0$ as $x\\to-\\infty$.',
        incorrectExplanation:
          'Degree $2$ over degree $3$: dividing by $x^3$ sends every term to $0$, so the limit is $0$.',
        hint: 'When the denominator has higher degree, the limit at infinity is $0$.',
        visual: {
          type: 'function-explorer',
          label: 'For large negative $x$, the outputs approach $0$.',
          fn: (x) => (x * x + 2 * x - 1) / (x * x * x + 1),
          xMin: -30,
          xMax: -2,
          asymptotes: { horizontal: [0] },
        },
      },
      {
        id: 'infinity-horizontal-asymptote',
        type: 'multiple-choice',
        title: 'Find the horizontal asymptote',
        prompt: 'What is the horizontal asymptote of $f(x)=\\dfrac{x^2}{x^2+4}$?',
        options: [
          { id: 'yone', label: '$y=1$' },
          { id: 'yzero', label: '$y=0$' },
          { id: 'yfour', label: '$y=4$' },
          { id: 'none', label: 'There is none' },
        ],
        correctOptionId: 'yone',
        correctExplanation:
          'Correct. The degrees are equal, so $$\\lim_{x\\to\\pm\\infty} f(x)=\\dfrac{1}{1}=1$$ The horizontal asymptote is $y=1$.',
        incorrectExplanation:
          'Equal degrees give an end value equal to the ratio of leading coefficients, $1$, so $y=1$.',
        hint: 'Compare the degrees and take the ratio of leading coefficients.',
        visual: {
          type: 'function-explorer',
          label: 'The curve approaches $y=1$ on both ends.',
          fn: (x) => (x * x) / (x * x + 4),
          xMin: -20,
          xMax: 20,
          asymptotes: { horizontal: [1] },
        },
      },
    ],
  },
];
