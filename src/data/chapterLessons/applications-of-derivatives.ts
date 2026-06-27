import type { Lesson } from '../lessons';

/* Lessons for "Applications of the Derivative" (Chapter 4), adapted from APEX Calculus under CC BY-NC 4.0. */

export const applicationsOfDerivativesLessons: Lesson[] = [
  {
    id: 'appsderiv-newtons-method',
    chapterId: 'applications-of-derivatives',
    title: "Newton's Method",
    description:
      'Approximating a root of $f(x)=0$ by repeatedly following a tangent line down to the $x$-axis.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'newton-idea',
        type: 'concept',
        title: 'Chasing a root with tangent lines',
        body: 'Many equations cannot be solved with algebra. Newton\u2019s Method instead approximates a root of $f(x)=0$. Begin with a guess $x_0$ near the root, draw the tangent line at $(x_0, f(x_0))$, and follow it down to where it crosses the $x$-axis. That crossing, $x_1$, is usually closer to the root. Setting the tangent line equal to zero and solving gives the update rule: $$x_{n+1} = x_{n} - \\dfrac{f(x_{n})}{f\'(x_{n})}.$$ Drag the tangent point and watch where the line meets the axis.',
        visual: {
          type: 'function-explorer',
          label: 'Follow the tangent line down to the $x$-axis',
          fn: (x) => x * x - 2,
          showTangent: true,
          tangentAtX: 2,
          extendTangentToAxis: true,
          xMin: 0,
          xMax: 3,
        },
        interactiveNote:
          'Drag the tangent point along the curve and watch where the extended tangent crosses the $x$-axis: that $x$-intercept readout is the next estimate $x_1$, already nearer the root than where you started.',
      },
      {
        id: 'newton-one-step',
        type: 'multiple-choice',
        title: 'Take one step',
        prompt:
          'For $f(x) = x^{2} - 2$ with $f\'(x) = 2x$, starting at $x_{0} = 2$, what is the next estimate $x_{1}$?',
        options: [
          { id: 'a', label: '$1.5$' },
          { id: 'b', label: '$2$' },
          { id: 'c', label: '$1$' },
          { id: 'd', label: '$1.414$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$x_{1} = 2 - \\dfrac{2^{2} - 2}{2\\cdot 2} = 2 - \\dfrac{2}{4} = 1.5.$$',
        incorrectExplanation:
          'With $f(2) = 2$ and $f\'(2) = 4$, apply $$x_{1} = x_{0} - \\dfrac{f(x_{0})}{f\'(x_{0})}.$$',
        hint: 'Compute $f(2)$ and $f\'(2)$, then subtract their quotient from $2$.',
        visual: {
          type: 'function-explorer',
          label: 'One Newton step on $f(x)=x^2-2$',
          fn: (x) => x * x - 2,
          showTangent: true,
          tangentAtX: 2,
          extendTangentToAxis: true,
          xMin: 0,
          xMax: 3,
        },
      },
      {
        id: 'newton-cubic',
        type: 'multiple-choice',
        title: 'A cubic example',
        prompt:
          'For $f(x) = x^{3} - x^{2} - 1$ with $f\'(x) = 3x^{2} - 2x$ and $x_{0} = 1$, what is $x_{1}$?',
        options: [
          { id: 'a', label: '$2$' },
          { id: 'b', label: '$0$' },
          { id: 'c', label: '$1$' },
          { id: 'd', label: '$-1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$x_{1} = 1 - \\dfrac{1 - 1 - 1}{3 - 2} = 1 - \\dfrac{-1}{1} = 2.$$',
        incorrectExplanation:
          'Evaluate $f(1) = -1$ and $f\'(1) = 1$, then apply $$x_{1} = 1 - \\dfrac{f(1)}{f\'(1)}.$$',
        hint: 'Substitute $x_{0}=1$ into $f$ and $f\'$ before using the update formula.',
        visual: {
          type: 'function-explorer',
          label: 'Newton step on $f(x)=x^3-x^2-1$',
          fn: (x) => x * x * x - x * x - 1,
          showTangent: true,
          tangentAtX: 1,
          extendTangentToAxis: true,
          xMin: 0,
          xMax: 2.5,
        },
      },
      {
        id: 'newton-rewrite',
        type: 'multiple-choice',
        title: 'Solving an equation that is not already zero',
        prompt:
          'Newton\u2019s Method solves $f(x) = 0$. To approximate a solution of $\\cos x = x$, which function should you find a root of?',
        options: [
          { id: 'a', label: '$f(x) = \\cos x - x$' },
          { id: 'b', label: '$f(x) = \\cos x + x$' },
          { id: 'c', label: '$f(x) = x\\cos x$' },
          { id: 'd', label: '$f(x) = \\cos x$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Rewrite $\\cos x = x$ as $\\cos x - x = 0$, so the root of $f(x) = \\cos x - x$ is the solution.',
        incorrectExplanation:
          'Move everything to one side: $\\cos x = x$ becomes $\\cos x - x = 0$.',
        hint: 'Set the equation equal to zero by subtracting one side from the other.',
        visual: {
          type: 'function-explorer',
          label: 'Root of $f(x)=\\cos x - x$ near $0.74$',
          fn: (x) => Math.cos(x) - x,
          markedX: 0.739,
          xMin: -1,
          xMax: 2,
        },
      },
      {
        id: 'newton-failure',
        type: 'multiple-choice',
        title: 'When the method breaks down',
        prompt:
          'The update divides by $f\'(x_{n})$. Newton\u2019s Method fails at a guess where which quantity is zero?',
        options: [
          { id: 'a', label: 'The derivative $f\'(x_{n})$' },
          { id: 'b', label: 'The function value $f(x_{n})$' },
          { id: 'c', label: 'The guess $x_{n}$' },
          { id: 'd', label: 'The second derivative $f\'\'(x_{n})$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. If $f\'(x_{n}) = 0$ the tangent line is horizontal and never meets the $x$-axis, so the update divides by zero and is undefined.',
        incorrectExplanation:
          'A horizontal tangent ($f\'(x_{n}) = 0$) cannot cross the axis. Look at the denominator of $$x_{n+1} = x_{n} - \\dfrac{f(x_{n})}{f\'(x_{n})}.$$',
        hint: 'A flat tangent line never reaches the $x$-axis.',
        visual: {
          type: 'function-explorer',
          label: 'A horizontal tangent misses the axis',
          fn: (x) => x * x * x - x * x - 1,
          showTangent: true,
          tangentAtX: 0,
          extendTangentToAxis: true,
          xMin: -1,
          xMax: 2,
        },
      },
    ],
  },
  {
    id: 'appsderiv-related-rates',
    chapterId: 'applications-of-derivatives',
    title: 'Related Rates',
    description:
      'Linking the rates of two changing quantities by differentiating their relationship with respect to time.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'related-idea',
        type: 'concept',
        title: 'Linked rates of change',
        body: 'When two quantities are tied together by an equation, their rates of change are tied together too. If you know how fast one changes, you can find how fast the other changes. The key step is to differentiate the relating equation with respect to time $t$, treating each variable as a function of $t$ so the chain rule attaches a rate to every changing variable. For a circle, $C = 2\\pi r$ gives $$\\dfrac{dC}{dt} = 2\\pi \\dfrac{dr}{dt}.$$',
        visual: {
          type: 'function-explorer',
          label: 'Circumference $C = 2\\pi r$ links $dC/dt$ to $dr/dt$',
          fn: (r) => 2 * Math.PI * r,
          showTangent: true,
          tangentAtX: 2,
          xMin: 0,
          xMax: 5,
        },
        interactiveNote:
          'Drag the tangent point and read its slope: it stays pinned at $2\\pi$ everywhere on the graph, the very factor that converts the radius rate $dr/dt$ into the circumference rate $dC/dt$.',
      },
      {
        id: 'related-differentiate-area',
        type: 'multiple-choice',
        title: 'Differentiate the area relation',
        prompt:
          'A circle has area $A = \\pi r^{2}$, where $r$ changes with time. Differentiating with respect to $t$ gives $\\dfrac{dA}{dt} = $',
        options: [
          { id: 'a', label: '$2\\pi r \\dfrac{dr}{dt}$' },
          { id: 'b', label: '$2\\pi r$' },
          { id: 'c', label: '$\\pi r^{2}\\dfrac{dr}{dt}$' },
          { id: 'd', label: '$2\\pi \\dfrac{dr}{dt}$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The chain rule on $\\pi r^{2}$ gives $2\\pi r$ times $\\dfrac{dr}{dt}$.',
        incorrectExplanation:
          'Differentiate $\\pi r^{2}$ with the power and chain rules, attaching $\\dfrac{dr}{dt}$ to the $r$ term.',
        hint: 'Use the power rule on $r^{2}$ and remember $r$ depends on $t$.',
        visual: {
          type: 'function-explorer',
          label: 'Area $A=\\pi r^2$',
          fn: (r) => Math.PI * r * r,
          showTangent: true,
          tangentAtX: 2,
          xMin: 0,
          xMax: 5,
        },
      },
      {
        id: 'related-circumference-rate',
        type: 'multiple-choice',
        title: 'How fast is the circumference growing',
        prompt:
          'The radius of a circle grows at $\\dfrac{dr}{dt} = 5$ in/h. Using $C = 2\\pi r$, how fast is the circumference growing?',
        options: [
          { id: 'a', label: '$10\\pi$ in/h' },
          { id: 'b', label: '$5\\pi$ in/h' },
          { id: 'c', label: '$25\\pi$ in/h' },
          { id: 'd', label: '$2\\pi$ in/h' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $\\dfrac{dC}{dt} = 2\\pi \\dfrac{dr}{dt} = 2\\pi(5) = 10\\pi \\approx 31.4$ in/h.',
        incorrectExplanation:
          'Substitute $\\dfrac{dr}{dt} = 5$ into $$\\dfrac{dC}{dt} = 2\\pi \\dfrac{dr}{dt}.$$',
        hint: 'Multiply $2\\pi$ by the given rate $\\dfrac{dr}{dt} = 5$.',
        visual: {
          type: 'function-explorer',
          label: 'Circumference $C=2\\pi r$',
          fn: (r) => 2 * Math.PI * r,
          showTangent: true,
          tangentAtX: 3,
          xMin: 0,
          xMax: 5,
        },
      },
      {
        id: 'related-ladder',
        type: 'multiple-choice',
        title: 'A sliding ladder',
        prompt:
          'A $13$-ft ladder leans on a wall with base $x$ and top $y$, so $x^{2} + y^{2} = 169$. Differentiating with respect to $t$ gives',
        options: [
          { id: 'a', label: '$2x\\dfrac{dx}{dt} + 2y\\dfrac{dy}{dt} = 0$' },
          { id: 'b', label: '$2x\\dfrac{dx}{dt} + 2y\\dfrac{dy}{dt} = 169$' },
          { id: 'c', label: '$x\\dfrac{dx}{dt} + y\\dfrac{dy}{dt} = 13$' },
          { id: 'd', label: '$\\dfrac{dx}{dt} + \\dfrac{dy}{dt} = 0$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The constant $169$ differentiates to $0$, leaving $$2x\\dfrac{dx}{dt} + 2y\\dfrac{dy}{dt} = 0.$$',
        incorrectExplanation:
          'Differentiate each term with respect to $t$; the constant on the right becomes $0$.',
        hint: 'The right side is a constant, and the derivative of a constant is zero.',
        visual: {
          type: 'slope-triangle',
          label: 'Ladder triangle: $x^2 + y^2 = 13^2$',
          initialRise: 5,
          initialRun: 12,
        },
      },
      {
        id: 'related-why-differentiate-first',
        type: 'multiple-choice',
        title: 'Why differentiate before substituting',
        prompt:
          'Why should you differentiate the relating equation before plugging in the given instantaneous values?',
        options: [
          {
            id: 'a',
            label:
              'The given values are momentary, so substituting first would treat changing quantities as constants and erase their rates',
          },
          { id: 'b', label: 'Substitution always makes the algebra impossible' },
          { id: 'c', label: 'The chain rule only works on plain numbers' },
          { id: 'd', label: 'Derivatives can never be taken after substitution' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Plugging numbers in first freezes the variables, so their derivatives drop to zero and the rates you need disappear.',
        incorrectExplanation:
          'Keep the variables symbolic through differentiation; only substitute the instantaneous values at the very end.',
        hint: 'A number has a derivative of zero, but a changing quantity does not.',
        visual: {
          type: 'function-explorer',
          label: 'Volume $V=\\tfrac{4}{3}\\pi r^3$ ties $dV/dt$ to $dr/dt$',
          fn: (r) => (4 / 3) * Math.PI * r ** 3,
          showTangent: true,
          tangentAtX: 2,
          xMin: 0,
          xMax: 3,
        },
      },
    ],
  },
  {
    id: 'appsderiv-optimization',
    chapterId: 'applications-of-derivatives',
    title: 'Optimization',
    description:
      'Turning a word problem into a single-variable function and finding its largest or smallest value.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'optimization-process',
        type: 'concept',
        title: 'Turning a word problem into one variable',
        body: 'To optimize a quantity, first write it as the fundamental equation. If that equation has more than one variable, use a constraint equation to substitute and reduce it to a function of a single variable. Decide which domain makes sense for the situation, then find the extreme values by checking the critical points together with the endpoints. The largest or smallest value among those candidates answers the problem.',
        visual: {
          type: 'function-explorer',
          label: 'Compare critical points with the endpoints',
          fn: (x) => x * (50 - x),
          markedPoints: [
            { x: 0, y: 0, label: 'endpoint' },
            { x: 50, y: 0, label: 'endpoint' },
          ],
          xMin: 0,
          xMax: 50,
        },
        interactiveNote:
          'Drag the cursor along the curve and compare its $f(x)$ readout against the two marked endpoints: the interior high point outscores both, which is exactly why you weigh the critical point and the endpoints together before picking the extreme value.',
      },
      {
        id: 'optimization-fence',
        type: 'multiple-choice',
        title: 'Maximize a fenced area',
        prompt:
          'With $100$ ft of fence forming a rectangle, the perimeter gives $y = 50 - x$, so the area is $A(x) = x(50 - x)$. Which width maximizes the area?',
        options: [
          { id: 'a', label: '$x = 25$' },
          { id: 'b', label: '$x = 50$' },
          { id: 'c', label: '$x = 12.5$' },
          { id: 'd', label: '$x = 100$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $A\'(x) = 50 - 2x = 0$ gives $x = 25$, a square, which maximizes the area.',
        incorrectExplanation:
          'Expand $A(x) = 50x - x^{2}$, set $A\'(x) = 50 - 2x$ equal to zero, and solve.',
        hint: 'Set the derivative $A\'(x) = 50 - 2x$ equal to zero.',
        visual: {
          type: 'function-explorer',
          label: 'Area $A=x(50-x)$',
          fn: (x) => x * (50 - x),
          showTangent: true,
          tangentAtX: 25,
          xMin: 0,
          xMax: 50,
        },
      },
      {
        id: 'optimization-max-value',
        type: 'multiple-choice',
        title: 'The maximum area',
        prompt:
          'For $A(x) = x(50 - x)$, the width $x = 25$ is optimal. What is the maximum area?',
        options: [
          { id: 'a', label: '$625$' },
          { id: 'b', label: '$1250$' },
          { id: 'c', label: '$2500$' },
          { id: 'd', label: '$312.5$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $A(25) = 25(50 - 25) = 25 \\cdot 25 = 625$ square feet.',
        incorrectExplanation:
          'Evaluate $A(25) = 25(50 - 25)$.',
        hint: 'Substitute $x = 25$ into $A(x) = x(50 - x)$.',
        visual: {
          type: 'function-explorer',
          label: 'Peak of $A=x(50-x)$ at $x=25$',
          fn: (x) => x * (50 - x),
          showTangent: true,
          tangentAtX: 25,
          xMin: 0,
          xMax: 50,
        },
      },
      {
        id: 'optimization-stream',
        type: 'multiple-choice',
        title: 'Using a stream as one side',
        prompt:
          'A rectangle uses $100$ ft of fence but a stream forms one side, so $100 = x + 2y$ and the area is $A(x) = x\\left(50 - \\tfrac{x}{2}\\right)$. Which $x$ maximizes the area?',
        options: [
          { id: 'a', label: '$x = 50$' },
          { id: 'b', label: '$x = 25$' },
          { id: 'c', label: '$x = 100$' },
          { id: 'd', label: '$x = 75$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $A(x) = 50x - \\tfrac{1}{2}x^{2}$, so $A\'(x) = 50 - x = 0$ gives $x = 50$ (with $y = 25$).',
        incorrectExplanation:
          'Differentiate $A(x) = 50x - \\tfrac{1}{2}x^{2}$ and set $A\'(x) = 50 - x$ equal to zero.',
        hint: 'Expand the area, then solve $A\'(x) = 50 - x = 0$.',
        visual: {
          type: 'function-explorer',
          label: 'Three-sided area $A=x(50-\\tfrac{x}{2})$',
          fn: (x) => x * (50 - x / 2),
          showTangent: true,
          tangentAtX: 50,
          xMin: 0,
          xMax: 100,
        },
      },
      {
        id: 'optimization-confirm-max',
        type: 'multiple-choice',
        title: 'Confirming a maximum',
        prompt:
          'For $A(x) = 50x - x^{2}$, how can you confirm the critical point is a maximum rather than a minimum?',
        options: [
          { id: 'a', label: '$A\'\'(x) = -2 < 0$, so the graph is concave down' },
          { id: 'b', label: '$A\'\'(x) = 2 > 0$, so the graph is concave up' },
          { id: 'c', label: 'It sits at an endpoint of the interval' },
          { id: 'd', label: 'You cannot tell without graphing' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. The second derivative is $-2$, concave down everywhere, so the critical point is a maximum.',
        incorrectExplanation:
          'Compute $A\'\'(x)$. A negative value means concave down, which confirms a maximum.',
        hint: 'Check the sign of the second derivative $A\'\'(x)$.',
        visual: {
          type: 'function-explorer',
          label: '$A=50x-x^2$ is concave down',
          fn: (x) => 50 * x - x * x,
          showTangent: true,
          tangentAtX: 25,
          xMin: 0,
          xMax: 50,
        },
      },
    ],
  },
  {
    id: 'appsderiv-differentials',
    chapterId: 'applications-of-derivatives',
    title: 'Differentials',
    description:
      'Using the tangent line to linearize a function and estimate small changes with differentials.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'linearization-idea',
        type: 'concept',
        title: 'The tangent line as a stand-in',
        body: 'Near a point $c$, a differentiable curve looks almost straight, so its tangent line is an excellent approximation. The linearization is $$L(x) = f(c) + f\'(c)(x - c),$$ and $f(x) \\approx L(x)$ for $x$ close to $c$. Drag along the curve below: the closer the point is to $c$, the more tightly the tangent line hugs the curve.',
        visual: {
          type: 'tangent-cursor',
          label: 'Up close, the curve and its tangent line nearly coincide.',
          initialX: 4,
          curveShape: 'quadratic',
        },
        interactiveNote:
          'Drag the red point along the curve and notice the tangent line and curve nearly coincide right at the point but peel apart as you move off it: that close fit near $c$ is why $f(x)\\approx L(x)$ only for $x$ near $c$.',
      },
      {
        id: 'differential-idea',
        type: 'concept',
        title: 'Differentials estimate change',
        body: 'Let $dx$ be a small change in $x$. The differential $dy = f\'(x)\\,dx$ estimates the resulting change in $y$, so $\\Delta y \\approx dy$. In words, when $x$ moves by $dx$, the output moves by about $f\'(x)\\,dx$. This is the tangent-line approximation written in change form, and it underlies error estimates and integration.',
        visual: {
          type: 'function-explorer',
          label: 'Change $dy = f\'(x)\\,dx$ along the tangent',
          fn: (x) => x * x,
          showTangent: true,
          tangentAtX: 3,
          markedX: 3.1,
          xMin: 0,
          xMax: 5,
        },
        interactiveNote:
          'Drag the tangent point and watch the slope readout $f\'(x)$: multiply it by the step $dx$ out to the marked input and you get $dy$, the tangent rise that closely tracks the curve\'s true change $\\Delta y$.',
      },
      {
        id: 'differential-square',
        type: 'multiple-choice',
        title: 'Estimate a square',
        prompt:
          'For $f(x) = x^{2}$ with $f(3) = 9$ and $dx = 0.1$, use the differential to estimate $f(3.1)$.',
        options: [
          { id: 'a', label: '$9.6$' },
          { id: 'b', label: '$9.61$' },
          { id: 'c', label: '$9.3$' },
          { id: 'd', label: '$9.1$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $$dy = f\'(3)\\,dx = 6(0.1) = 0.6,$$ so $f(3.1) \\approx 9 + 0.6 = 9.6$. (The exact value is $9.61$; the differential gives a close estimate.)',
        incorrectExplanation:
          'Compute $dy = f\'(3)\\,dx = 2(3)(0.1) = 0.6$ and add it to $f(3) = 9$.',
        hint: 'Find $f\'(3) = 6$, multiply by $dx = 0.1$, then add to $9$.',
        visual: {
          type: 'function-explorer',
          label: '$f(x)=x^2$ near $x=3$',
          fn: (x) => x * x,
          showTangent: true,
          tangentAtX: 3,
          markedX: 3.1,
          xMin: 0,
          xMax: 5,
        },
      },
      {
        id: 'differential-sqrt',
        type: 'multiple-choice',
        title: 'Approximate a square root',
        prompt:
          'Use the linearization of $f(x) = \\sqrt{x}$ at $c = 4$, where $f\'(x) = \\dfrac{1}{2\\sqrt{x}}$, to estimate $\\sqrt{4.5}$.',
        options: [
          { id: 'a', label: '$2.125$' },
          { id: 'b', label: '$2.25$' },
          { id: 'c', label: '$2.5$' },
          { id: 'd', label: '$2.05$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. $f\'(4) = \\dfrac{1}{4}$ and $dx = 0.5$, so $dy = \\dfrac{1}{4}\\cdot\\dfrac{1}{2} = 0.125$ and $\\sqrt{4.5} \\approx 2 + 0.125 = 2.125$.',
        incorrectExplanation:
          'With $f(4) = 2$ and $f\'(4) = \\dfrac{1}{4}$, add $f\'(4)\\,dx = \\dfrac{1}{4}(0.5)$ to $2$.',
        hint: 'Use $L(4.5) = f(4) + f\'(4)(0.5)$ with $f(4) = 2$.',
        visual: {
          type: 'function-explorer',
          label: '$\\sqrt{x}$ near $x=4$',
          fn: (x) => Math.sqrt(x),
          showTangent: true,
          tangentAtX: 4,
          markedX: 4.5,
          xMin: 0,
          xMax: 9,
        },
      },
      {
        id: 'differential-sine',
        type: 'multiple-choice',
        title: 'Find a differential',
        prompt: 'For $y = \\sin x$, what is the differential $dy$?',
        options: [
          { id: 'a', label: '$dy = \\cos x\\,dx$' },
          { id: 'b', label: '$dy = -\\cos x\\,dx$' },
          { id: 'c', label: '$dy = \\sin x\\,dx$' },
          { id: 'd', label: '$dy = \\cos x$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Since $\\dfrac{d}{dx}\\sin x = \\cos x$, the differential is $dy = \\cos x\\,dx$.',
        incorrectExplanation:
          'Differentiate $y = \\sin x$ to get $f\'(x) = \\cos x$, then multiply by $dx$.',
        hint: 'The differential is always $f\'(x)\\,dx$; do not forget the $dx$.',
        visual: {
          type: 'function-explorer',
          label: '$y=\\sin x$ with tangent slope $\\cos x$',
          fn: (x) => Math.sin(x),
          showTangent: true,
          tangentAtX: 1,
          xMin: -3.14,
          xMax: 3.14,
        },
      },
      {
        id: 'differential-relative-error',
        type: 'multiple-choice',
        title: 'Relative error',
        prompt:
          'A small measurement error produces a differential $dA$ in a computed quantity $A$. The relative (percent) error is best estimated by',
        options: [
          { id: 'a', label: '$\\dfrac{dA}{A}$' },
          { id: 'b', label: '$dA \\cdot A$' },
          { id: 'c', label: '$\\dfrac{A}{dA}$' },
          { id: 'd', label: '$dA - A$' },
        ],
        correctOptionId: 'a',
        correctExplanation:
          'Correct. Relative error is the change divided by the quantity, $\\dfrac{dA}{A}$, often written as a percent.',
        incorrectExplanation:
          'Relative error compares the error to the whole: divide the differential $dA$ by $A$.',
        hint: 'Percent error is the error as a fraction of the total amount.',
        visual: {
          type: 'function-explorer',
          label: 'Error in $V=\\tfrac{4}{3}\\pi r^3$',
          fn: (r) => (4 / 3) * Math.PI * r ** 3,
          showTangent: true,
          tangentAtX: 1,
          xMin: 0,
          xMax: 3,
        },
      },
    ],
  },
];
