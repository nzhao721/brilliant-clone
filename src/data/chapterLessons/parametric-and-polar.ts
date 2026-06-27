import type { Lesson } from '../lessons';

// Lessons for "Parametric Equations and Polar Coordinates"
// (chapterId: 'parametric-and-polar').
//
// Content re-sourced from APEX Calculus (Gregory Hartman et al.), Chapter 9,
// "Curves in the Plane": Conic Sections, Parametric Equations, Calculus and
// Parametric Equations, Introduction to Polar Coordinates, and Calculus and
// Polar Functions. APEX Calculus is licensed under the Creative Commons
// Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0);
// see http://www.apexcalculus.com/. Explanatory prose is adapted/original;
// mathematical statements follow the source. Every lesson sets
// chapterId: 'parametric-and-polar', and every step carries an interactive
// visual.

export const parametricAndPolarLessons: Lesson[] = [
  {
    id: 'pp-conic-sections',
    chapterId: 'parametric-and-polar',
    title: 'Conic Sections',
    description:
      'Parabolas, ellipses, and hyperbolas as slices of a cone, with their standard equations and eccentricity.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'conics-overview',
        type: 'concept',
        title: 'Slicing a double cone',
        body: 'Cutting a double cone with a plane produces the conic sections: the parabola, the ellipse (which includes the circle), and the hyperbola. Algebraically, every conic satisfies a second-degree equation: $$Ax^{2} + Bxy + Cy^{2} + Dx + Ey + F = 0$$ More usefully, each one is a locus of points obeying a distance rule, and that rule leads to a clean standard equation. Tap the figure to inspect an ellipse and its two foci before continuing.',
        visual: {
          type: 'conic-section',
          label: 'An ellipse $\\dfrac{x^{2}}{a^{2}} + \\dfrac{y^{2}}{b^{2}} = 1$ with its two foci.',
          conic: 'ellipse',
          a: 3,
          b: 2,
          showFoci: true,
        },
        interactiveNote:
          'Drag a vertex handle in the interactive to stretch the ellipse and watch the eccentricity $e$ readout climb while the two foci slide apart; one number captures how far the locus sits from a perfect circle.',
      },
      {
        id: 'parabola-focus-directrix',
        type: 'concept',
        title: 'A parabola from focus and directrix',
        body: 'A parabola is the set of points equidistant from a fixed point, the focus, and a fixed line, the directrix. Placing the focus at $(0, p)$ and the directrix at $y = -p$ puts the vertex at the origin and gives $$y = \\dfrac{1}{4p}\\,x^{2}$$ The vertex always sits halfway between the focus and the directrix. Tap the graph to see the focus and directrix before continuing.',
        visual: {
          type: 'conic-section',
          label: 'A parabola with focus $F$ at $(0, p)$ and directrix $y = -p$.',
          conic: 'parabola',
          p: 1,
          showFoci: true,
          showDirectrix: true,
        },
        interactiveNote:
          'Drag the focus handle in the interactive and notice the vertex stays exactly halfway to the directrix while the eccentricity holds at $e = 1$ — the equidistance rule that defines a parabola, made visible.',
      },
      {
        id: 'identify-conic',
        type: 'multiple-choice',
        title: 'Identify the conic',
        prompt: 'What curve does $\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{4} = 1$ describe?',
        options: [
          { id: 'ellipse', label: 'an ellipse' },
          { id: 'hyperbola', label: 'a hyperbola' },
          { id: 'parabola', label: 'a parabola' },
          { id: 'circle', label: 'a circle' },
        ],
        correctOptionId: 'ellipse',
        correctExplanation:
          'Correct. Two positive squared terms summing to $1$ with different denominators describe an ellipse.',
        incorrectExplanation:
          'A sum of squared terms equal to $1$ is an ellipse; it would be a circle only if the denominators matched.',
        hint: 'Both terms are added, the right side is $1$, and the denominators differ.',
        visual: {
          type: 'conic-section',
          label: 'The graph of $\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{4} = 1$ with its foci.',
          conic: 'ellipse',
          a: 3,
          b: 2,
          showFoci: true,
        },
      },
      {
        id: 'ellipse-vs-hyperbola',
        type: 'concept',
        title: 'Ellipses versus hyperbolas',
        body: 'An ellipse collects points whose distances to two foci have a constant sum; in standard form $$\\dfrac{x^{2}}{a^{2}} + \\dfrac{y^{2}}{b^{2}} = 1$$ with $c^{2} = a^{2} - b^{2}$. A hyperbola uses a constant difference instead, giving $$\\dfrac{x^{2}}{a^{2}} - \\dfrac{y^{2}}{b^{2}} = 1$$ with $c^{2} = a^{2} + b^{2}$ and asymptotes $y = \\pm\\dfrac{b}{a}\\,x$. The sign between the two terms is what tells them apart. Tap the graph to inspect the asymptotes and foci before continuing.',
        visual: {
          type: 'conic-section',
          label: 'A hyperbola $\\dfrac{x^{2}}{a^{2}} - \\dfrac{y^{2}}{b^{2}} = 1$ with asymptotes and foci.',
          conic: 'hyperbola',
          a: 3,
          b: 2,
          showAsymptotes: true,
          showFoci: true,
        },
        interactiveNote:
          'Drag a vertex handle in the interactive to open the hyperbola wider and watch the eccentricity $e$ readout stay above $1$ as the branches press toward their asymptotes; that $e > 1$ is what an ellipse can never reach.',
      },
      {
        id: 'locate-foci',
        type: 'multiple-choice',
        title: 'Locate the foci',
        prompt:
          'Where are the foci of the ellipse $\\dfrac{x^{2}}{25} + \\dfrac{y^{2}}{9} = 1$?',
        options: [
          { id: 'pm4', label: '$(\\pm 4, 0)$' },
          { id: 'pm4y', label: '$(0, \\pm 4)$' },
          { id: 'pmsqrt34', label: '$(\\pm\\sqrt{34}, 0)$' },
          { id: 'pm16', label: '$(\\pm 16, 0)$' },
        ],
        correctOptionId: 'pm4',
        correctExplanation:
          'Correct. Here $a^{2} = 25$ and $b^{2} = 9$, so $c = \\sqrt{25 - 9} = 4$, placing the foci at $(\\pm 4, 0)$ on the major axis.',
        incorrectExplanation:
          'For an ellipse use $c^{2} = a^{2} - b^{2}$. With $a^{2} = 25$, $b^{2} = 9$, $c = 4$, and the foci lie on the horizontal major axis.',
        hint: 'Use $c^{2} = a^{2} - b^{2}$; the major axis is horizontal since the larger denominator is under $x^{2}$.',
        visual: {
          type: 'conic-section',
          label: 'The ellipse $\\dfrac{x^{2}}{25} + \\dfrac{y^{2}}{9} = 1$ with foci at $(\\pm 4, 0)$.',
          conic: 'ellipse',
          a: 5,
          b: 3,
          showFoci: true,
          viewRadius: 7,
        },
      },
      {
        id: 'eccentricity',
        type: 'multiple-choice',
        title: 'Eccentricity',
        prompt:
          'Eccentricity $e = \\dfrac{c}{a}$ measures how stretched a conic is. Which value corresponds to a parabola?',
        options: [
          { id: 'one', label: '$e = 1$' },
          { id: 'zero', label: '$e = 0$' },
          { id: 'between', label: '$0 < e < 1$' },
          { id: 'greater', label: '$e > 1$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. A parabola has eccentricity exactly $1$; a circle has $e = 0$, an ellipse has $0 < e < 1$, and a hyperbola has $e > 1$.',
        incorrectExplanation:
          'Eccentricity $0$ is a circle and $0 < e < 1$ is an ellipse. A parabola sits right at $e = 1$, the boundary before hyperbolas.',
        hint: 'It is the boundary value between ellipses ($e < 1$) and hyperbolas ($e > 1$).',
        visual: {
          type: 'conic-section',
          label: 'A parabola has eccentricity $e = 1$, shown with its focus and directrix.',
          conic: 'parabola',
          p: 1,
          showFoci: true,
          showDirectrix: true,
        },
      },
    ],
  },
  {
    id: 'pp-parametric-equations',
    chapterId: 'parametric-and-polar',
    title: 'Parametric Equations',
    description:
      'Describing curves by giving $x$ and $y$ as functions of a parameter, and eliminating it.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'parametric-idea',
        type: 'concept',
        title: 'Coordinates driven by a parameter',
        body: 'Parametric equations give the coordinates separately as $x = f(t)$ and $y = g(t)$, with the parameter $t$ often standing for time. This traces a path and records its direction, so the curve can loop or revisit points in ways a single function $y = f(x)$ cannot — the vertical line test no longer applies. Drag the tracer along the circle, or scrub the $t$-slider, to follow the motion before continuing.',
        visual: {
          type: 'parametric-curve',
          label: 'The circle $(\\cos t,\\ \\sin t)$ traced counterclockwise as $t$ increases.',
          curve: 'circle',
          tMin: 0,
          tMax: Math.PI * 2,
          showDirection: true,
        },
        interactiveNote:
          'Scrub the $t$-slider in the interactive and watch the point sweep counterclockwise while the $(x, y)$ readout updates; that direction of travel is exactly the information a single $y = f(x)$ graph cannot record.',
      },
      {
        id: 'plot-point',
        type: 'multiple-choice',
        title: 'Find a point on the path',
        prompt: 'For $x = t^{2}$ and $y = 2t$, what point corresponds to $t = 3$?',
        options: [
          { id: 'nine-six', label: '$(9, 6)$' },
          { id: 'six-nine', label: '$(6, 9)$' },
          { id: 'three-six', label: '$(3, 6)$' },
          { id: 'nine-three', label: '$(9, 3)$' },
        ],
        correctOptionId: 'nine-six',
        correctExplanation:
          'Correct. $x = 3^{2} = 9$ and $y = 2 \\cdot 3 = 6$, giving $(9, 6)$.',
        incorrectExplanation:
          'Substitute $t = 3$ into both equations: $x = t^{2}$ and $y = 2t$.',
        hint: 'Compute $x = t^{2}$ and $y = 2t$ at $t = 3$ separately.',
        visual: {
          type: 'parametric-curve',
          label: 'Scrub the tracer along $(t^{2},\\ 2t)$ toward $t = 3$.',
          curve: 'parabola-sideways',
          tMin: 0,
          tMax: 4,
          initialT: 1,
          showDirection: true,
        },
      },
      {
        id: 'eliminate-idea',
        type: 'concept',
        title: 'Eliminating the parameter',
        body: 'To recover a rectangular equation, eliminate $t$: solve one equation for the parameter and substitute into the other, or use an identity. For example, $x = \\cos t$ and $y = \\sin t$ satisfy $\\cos^{2} t + \\sin^{2} t = 1$, so $x^{2} + y^{2} = 1$. Eliminating the parameter shows the underlying shape, though it can hide the direction of travel. Drag along the path before continuing.',
        visual: {
          type: 'parametric-curve',
          label: 'The path $(t^{2},\\ 2t)$ collapses to $x = \\dfrac{y^{2}}{4}$ once $t$ is eliminated.',
          curve: 'parabola-sideways',
          tMin: -3,
          tMax: 3,
          showDirection: true,
        },
        interactiveNote:
          'Scrub the $t$-slider in the interactive to trace the sideways parabola and notice the arrows of increasing $t$; eliminating the parameter keeps this shape, $x = \\dfrac{y^{2}}{4}$, but discards the very direction you see.',
      },
      {
        id: 'eliminate-parameter',
        type: 'multiple-choice',
        title: 'Eliminate the parameter',
        prompt:
          'Eliminating $t$ from $x = t^{2}$ and $y = 2t$ gives which relationship?',
        options: [
          { id: 'parabola', label: '$x = \\dfrac{y^{2}}{4}$' },
          { id: 'line', label: '$y = 2x$' },
          { id: 'circle', label: '$x^{2} + y^{2} = 1$' },
          { id: 'cubic', label: '$y = x^{3}$' },
        ],
        correctOptionId: 'parabola',
        correctExplanation:
          'Correct. From $y = 2t$ we get $t = \\dfrac{y}{2}$, so $x = t^{2} = \\dfrac{y^{2}}{4}$, a sideways parabola.',
        incorrectExplanation:
          'Solve $y = 2t$ for $t$, then substitute into $x = t^{2}$ to remove the parameter.',
        hint: 'Solve $y = 2t$ for $t$ and plug into $x = t^{2}$.',
        visual: {
          type: 'parametric-curve',
          label: 'The path traced by $x = t^{2},\\ y = 2t$ as $t$ varies.',
          curve: 'parabola-sideways',
          tMin: -3,
          tMax: 3,
          showDirection: true,
        },
      },
      {
        id: 'trig-parametrization',
        type: 'multiple-choice',
        title: 'A trigonometric parametrization',
        prompt: 'The parametric equations $x = \\cos t$, $y = \\sin t$ trace which curve?',
        options: [
          { id: 'circle', label: 'the unit circle $x^{2} + y^{2} = 1$' },
          { id: 'line', label: 'the line $y = x$' },
          { id: 'parabola', label: 'the parabola $y = x^{2}$' },
          { id: 'ellipse', label: 'the ellipse $\\dfrac{x^{2}}{4} + y^{2} = 1$' },
        ],
        correctOptionId: 'circle',
        correctExplanation:
          'Correct. Since $\\cos^{2} t + \\sin^{2} t = 1$, the points satisfy $x^{2} + y^{2} = 1$.',
        incorrectExplanation:
          'Use the identity $\\cos^{2} t + \\sin^{2} t = 1$ with $x = \\cos t$, $y = \\sin t$.',
        hint: 'Square both coordinates and add; apply a Pythagorean identity.',
        visual: {
          type: 'parametric-curve',
          label: 'The unit circle traced by $(\\cos t,\\ \\sin t)$.',
          curve: 'circle',
          tMin: 0,
          tMax: Math.PI * 2,
          showDirection: true,
        },
      },
      {
        id: 'identify-ellipse',
        type: 'multiple-choice',
        title: 'Identify the curve',
        prompt: 'What curve do $x = 3\\cos t$ and $y = 2\\sin t$ trace?',
        options: [
          { id: 'ellipse', label: 'the ellipse $\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{4} = 1$' },
          { id: 'circle', label: 'the circle $x^{2} + y^{2} = 1$' },
          { id: 'hyperbola', label: 'the hyperbola $\\dfrac{x^{2}}{9} - \\dfrac{y^{2}}{4} = 1$' },
          { id: 'parabola', label: 'the parabola $y = x^{2}$' },
        ],
        correctOptionId: 'ellipse',
        correctExplanation:
          'Correct. $\\cos t = \\dfrac{x}{3}$ and $\\sin t = \\dfrac{y}{2}$, so $$\\dfrac{x^{2}}{9} + \\dfrac{y^{2}}{4} = 1$$',
        incorrectExplanation:
          'Write $\\cos t = \\dfrac{x}{3}$, $\\sin t = \\dfrac{y}{2}$, then apply $\\cos^{2} t + \\sin^{2} t = 1$.',
        hint: 'Solve each equation for $\\cos t$ and $\\sin t$, then use the Pythagorean identity.',
        visual: {
          type: 'parametric-curve',
          label: 'The ellipse traced by $(3\\cos t,\\ 2\\sin t)$.',
          curve: 'ellipse',
          tMin: 0,
          tMax: Math.PI * 2,
          showDirection: true,
        },
      },
    ],
  },
  {
    id: 'pp-calculus-and-parametric-equations',
    chapterId: 'parametric-and-polar',
    title: 'Calculus and Parametric Equations',
    description:
      'Tangent-line slopes and arc length for parametric curves using derivatives with respect to the parameter.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'parametric-slope',
        type: 'concept',
        title: 'Slope along a parametric curve',
        body: 'The tangent slope of a parametric curve is $$\\dfrac{dy}{dx} = \\dfrac{dy/dt}{dx/dt} = \\dfrac{g\'(t)}{f\'(t)}$$ valid wherever $\\dfrac{dx}{dt} \\ne 0$. You differentiate each coordinate with respect to the parameter and divide, so the slope itself is a function of $t$. Drag the tracer along the curve to watch the tangent vector turn before continuing.',
        visual: {
          type: 'parametric-curve',
          label: 'The tangent vector $\\left(x\'(t),\\ y\'(t)\\right)$ along $(t^{2},\\ t^{3})$.',
          curve: 'semicubical',
          tMin: -2,
          tMax: 2,
          showTangent: true,
        },
        interactiveNote:
          'Drag the tracer along the curve in the interactive and watch the tangent vector swing while the $(x\', y\')$ readout updates; its tilt is the slope $\\dfrac{dy}{dx} = \\dfrac{dy/dt}{dx/dt}$, turning vertical exactly where $\\dfrac{dx}{dt} = 0$.',
      },
      {
        id: 'slope-compute',
        type: 'multiple-choice',
        title: 'Compute a parametric slope',
        prompt:
          'For $x = t^{2}$, $y = t^{3}$, what is $\\dfrac{dy}{dx}$ in terms of $t$?',
        options: [
          { id: 'three-t-half', label: '$\\dfrac{3t}{2}$' },
          { id: 'three-t2', label: '$3t^{2}$' },
          { id: 'two-thirds', label: '$\\dfrac{2}{3t}$' },
          { id: 't', label: '$t$' },
        ],
        correctOptionId: 'three-t-half',
        correctExplanation:
          'Correct. $$\\dfrac{dy/dt}{dx/dt} = \\dfrac{3t^{2}}{2t} = \\dfrac{3t}{2}$$',
        incorrectExplanation:
          'Differentiate: $\\dfrac{dy}{dt} = 3t^{2}$ and $\\dfrac{dx}{dt} = 2t$, then divide and simplify.',
        hint: 'Divide $\\dfrac{dy}{dt}$ by $\\dfrac{dx}{dt}$ and cancel a factor of $t$.',
        visual: {
          type: 'parametric-curve',
          label: '$\\dfrac{dy}{dx} = \\dfrac{3t^{2}}{2t}$ along $(t^{2},\\ t^{3})$.',
          curve: 'semicubical',
          tMin: -2,
          tMax: 2,
          showTangent: true,
        },
      },
      {
        id: 'horizontal-tangent',
        type: 'multiple-choice',
        title: 'Horizontal tangents',
        prompt:
          'A smooth parametric curve has a horizontal tangent line where which condition holds?',
        options: [
          { id: 'dydt0', label: '$\\dfrac{dy}{dt} = 0$ and $\\dfrac{dx}{dt} \\ne 0$' },
          { id: 'dxdt0', label: '$\\dfrac{dx}{dt} = 0$ and $\\dfrac{dy}{dt} \\ne 0$' },
          { id: 'both0', label: '$\\dfrac{dx}{dt} = 0$ and $\\dfrac{dy}{dt} = 0$' },
          { id: 'equal', label: '$\\dfrac{dx}{dt} = \\dfrac{dy}{dt}$' },
        ],
        correctOptionId: 'dydt0',
        correctExplanation:
          'Correct. The slope $\\dfrac{dy/dt}{dx/dt}$ is zero when the numerator $\\dfrac{dy}{dt} = 0$, provided $\\dfrac{dx}{dt} \\ne 0$.',
        incorrectExplanation:
          'A horizontal tangent needs slope $0$, so $\\dfrac{dy}{dt} = 0$ while $\\dfrac{dx}{dt} \\ne 0$. When $\\dfrac{dx}{dt} = 0$ instead, the tangent is vertical.',
        hint: 'The slope is $\\dfrac{dy/dt}{dx/dt}$; a fraction is zero when its numerator is zero.',
        visual: {
          type: 'parametric-curve',
          label: 'Tangents flatten and steepen around the ellipse $(3\\cos t,\\ 2\\sin t)$.',
          curve: 'ellipse',
          tMin: 0,
          tMax: Math.PI * 2,
          showTangent: true,
        },
      },
      {
        id: 'arc-length-idea',
        type: 'concept',
        title: 'Arc length as accumulated speed',
        body: 'The speed of the moving point is $$\\sqrt{\\left(\\dfrac{dx}{dt}\\right)^{2} + \\left(\\dfrac{dy}{dt}\\right)^{2}}$$ and integrating speed over the parameter gives arc length: $$L = \\displaystyle\\int_{a}^{b} \\sqrt{\\left(\\dfrac{dx}{dt}\\right)^{2} + \\left(\\dfrac{dy}{dt}\\right)^{2}}\\,dt$$ Drag along the cycloid to feel where the point moves fast or slow before continuing.',
        visual: {
          type: 'parametric-curve',
          label: 'Arc length integrates the speed along the cycloid $(t - \\sin t,\\ 1 - \\cos t)$.',
          curve: 'cycloid',
          tMin: 0,
          tMax: Math.PI * 2,
          showTangent: true,
        },
        interactiveNote:
          'Drag the tracer along the cycloid in the interactive and watch the tangent vector grow and shrink — its length is the speed $\\sqrt{\\left(\\dfrac{dx}{dt}\\right)^{2} + \\left(\\dfrac{dy}{dt}\\right)^{2}}$ you integrate, collapsing toward zero at the cusp where the point momentarily stops.',
      },
      {
        id: 'arc-length-integrand',
        type: 'multiple-choice',
        title: 'Arc length integrand',
        prompt:
          'The arc length of a parametric curve from $t = a$ to $t = b$ is $\\displaystyle\\int_{a}^{b}$ of which integrand?',
        options: [
          {
            id: 'sqrt',
            label: '$\\sqrt{\\left(\\dfrac{dx}{dt}\\right)^{2} + \\left(\\dfrac{dy}{dt}\\right)^{2}}$',
          },
          { id: 'sum', label: '$\\dfrac{dx}{dt} + \\dfrac{dy}{dt}$' },
          { id: 'product', label: '$\\dfrac{dx}{dt} \\cdot \\dfrac{dy}{dt}$' },
          { id: 'ratio', label: '$\\dfrac{dy/dt}{dx/dt}$' },
        ],
        correctOptionId: 'sqrt',
        correctExplanation:
          'Correct. Speed is $$\\sqrt{(dx/dt)^{2} + (dy/dt)^{2}}$$ and integrating speed over time accumulates arc length.',
        incorrectExplanation:
          'Arc length integrates the speed: the square root of the sum of the squared coordinate rates.',
        hint: 'It is the Pythagorean combination of the two parameter derivatives.',
        visual: {
          type: 'parametric-curve',
          label: 'The arc length of one arch of the cycloid.',
          curve: 'cycloid',
          tMin: 0,
          tMax: Math.PI * 2,
          showTangent: true,
        },
      },
      {
        id: 'arc-length-circle',
        type: 'multiple-choice',
        title: 'Arc length of a circle',
        prompt:
          'For $x = \\cos t$, $y = \\sin t$ on $[0, 2\\pi]$, what is the arc length?',
        options: [
          { id: 'two-pi', label: '$2\\pi$' },
          { id: 'pi', label: '$\\pi$' },
          { id: 'four-pi', label: '$4\\pi$' },
          { id: 'one', label: '$1$' },
        ],
        correctOptionId: 'two-pi',
        correctExplanation:
          'Correct. The speed is $\\sqrt{\\sin^{2} t + \\cos^{2} t} = 1$, so $$L = \\displaystyle\\int_{0}^{2\\pi} 1\\,dt = 2\\pi$$ the circumference of the unit circle.',
        incorrectExplanation:
          'The speed is $\\sqrt{(-\\sin t)^{2} + (\\cos t)^{2}} = 1$, so the integral is $$\\int_{0}^{2\\pi} 1\\,dt = 2\\pi$$',
        hint: 'Find the speed first; it simplifies to a constant by a Pythagorean identity.',
        visual: {
          type: 'parametric-curve',
          label: 'The unit circle has circumference $2\\pi$.',
          curve: 'circle',
          tMin: 0,
          tMax: Math.PI * 2,
          showTangent: true,
        },
      },
    ],
  },
  {
    id: 'pp-polar-coordinates',
    chapterId: 'parametric-and-polar',
    title: 'Introduction to Polar Coordinates',
    description:
      'Locating points by radius and angle, converting to and from rectangular form, and graphing polar functions.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'polar-idea',
        type: 'concept',
        title: 'Distance and angle',
        body: 'Polar coordinates locate a point $P(r, \\theta)$ by its distance $r$ from the pole (the origin) and the angle $\\theta$ measured counterclockwise from the initial ray (the positive $x$-axis). A point has many names: adding $2\\pi$ to $\\theta$ lands in the same place, and a negative $r$ points in the opposite direction. Drag the point around the circle to read its $r$ and $\\theta$ before continuing.',
        visual: {
          type: 'polar-curve',
          label: 'A polar point $P(r, \\theta)$ on the circle $r = 3$.',
          curve: 'circle',
          radius: 3,
          mode: 'point',
          initialTheta: Math.PI / 6,
        },
        interactiveNote:
          'Drag the point around the circle in the interactive and watch the $r$ and $\\theta$ readout change; since $r$ stays fixed at $3$ here, you are reading one location under many different angle names.',
      },
      {
        id: 'polar-conversion',
        type: 'concept',
        title: 'Converting coordinates',
        body: 'Trigonometry links the two systems. From polar to rectangular, $x = r\\cos\\theta$ and $y = r\\sin\\theta$. From rectangular back to polar, $r^{2} = x^{2} + y^{2}$ and $\\tan\\theta = \\dfrac{y}{x}$ — though you must check the quadrant when taking the inverse tangent. Drag the point along the ray to watch $x$ and $y$ change with $r$ before continuing.',
        visual: {
          type: 'polar-curve',
          label: 'On the ray $\\theta = \\tfrac{\\pi}{4}$: $x = r\\cos\\theta$, $y = r\\sin\\theta$.',
          curve: 'line-through-origin',
          mode: 'point',
          initialTheta: Math.PI / 4,
          radius: 3,
        },
        interactiveNote:
          'Drag the point along the ray in the interactive and watch the $(x, y)$ readout track $x = r\\cos\\theta$ and $y = r\\sin\\theta$ as $r$ grows; the angle holds at $\\tfrac{\\pi}{4}$ while both rectangular coordinates scale with the distance.',
      },
      {
        id: 'polar-to-rect',
        type: 'multiple-choice',
        title: 'Convert to rectangular',
        prompt:
          'Convert the polar point $P\\left(2, \\dfrac{\\pi}{2}\\right)$ to rectangular coordinates.',
        options: [
          { id: 'zero-two', label: '$(0, 2)$' },
          { id: 'two-zero', label: '$(2, 0)$' },
          { id: 'two-two', label: '$(2, 2)$' },
          { id: 'neg', label: '$(0, -2)$' },
        ],
        correctOptionId: 'zero-two',
        correctExplanation:
          'Correct. $x = 2\\cos\\tfrac{\\pi}{2} = 0$ and $y = 2\\sin\\tfrac{\\pi}{2} = 2$.',
        incorrectExplanation:
          'Use $x = r\\cos\\theta$ and $y = r\\sin\\theta$ with $r = 2$ and $\\theta = \\tfrac{\\pi}{2}$.',
        hint: 'At a quarter turn, $\\cos\\tfrac{\\pi}{2} = 0$ and $\\sin\\tfrac{\\pi}{2} = 1$.',
        visual: {
          type: 'polar-curve',
          label: 'Drag to the angle $\\theta = \\tfrac{\\pi}{2}$ on the circle $r = 2$.',
          curve: 'circle',
          radius: 2,
          mode: 'point',
          initialTheta: Math.PI / 6,
        },
      },
      {
        id: 'rect-to-polar',
        type: 'multiple-choice',
        title: 'Find the radius',
        prompt: 'What is $r$ for the rectangular point $(3, 4)$?',
        options: [
          { id: 'five', label: '$5$' },
          { id: 'seven', label: '$7$' },
          { id: 'one', label: '$1$' },
          { id: 'twentyfive', label: '$25$' },
        ],
        correctOptionId: 'five',
        correctExplanation:
          'Correct. $$r = \\sqrt{3^{2} + 4^{2}} = \\sqrt{25} = 5$$',
        incorrectExplanation:
          'Use $r = \\sqrt{x^{2} + y^{2}}$ with $x = 3$ and $y = 4$.',
        hint: 'Apply $r^{2} = x^{2} + y^{2}$, the distance from the origin.',
        visual: {
          type: 'polar-curve',
          label: 'Drag the point out to $(3, 4)$ and read its distance $r$.',
          curve: 'line-through-origin',
          mode: 'point',
          radius: 5,
          initialTheta: Math.atan2(4, 3),
        },
      },
      {
        id: 'polar-functions',
        type: 'concept',
        title: 'Polar functions and their graphs',
        body: 'A polar function $r = f(\\theta)$ returns a distance for each angle. The simplest are $r = c$, a circle of radius $c$, and $\\theta = \\alpha$, a line through the pole. Allowing $r$ to vary with $\\theta$ produces richer curves such as the cardioid $r = 1 + \\cos\\theta$ and the rose $r = \\cos(2\\theta)$, sketched by sampling the common angles. Tap the rose to explore it before continuing.',
        visual: {
          type: 'polar-curve',
          label: 'A four-petaled rose $r = 2\\cos(2\\theta)$.',
          curve: 'rose',
          a: 2,
          petals: 2,
          mode: 'point',
        },
        interactiveNote:
          'Drag the point around the rose in the interactive and watch the $r$ readout swell and collapse to $0$ as $\\theta$ turns; that varying $r = 2\\cos(2\\theta)$ is what bends a plain circle into petals.',
      },
      {
        id: 'identify-cardioid',
        type: 'multiple-choice',
        title: 'Identify a polar curve',
        prompt: 'The graph of $r = 1 + \\cos\\theta$ is which curve?',
        options: [
          { id: 'cardioid', label: 'a cardioid' },
          { id: 'circle', label: 'a circle' },
          { id: 'line', label: 'a line through the pole' },
          { id: 'rose', label: 'a four-petaled rose' },
        ],
        correctOptionId: 'cardioid',
        correctExplanation:
          'Correct. $r = 1 + \\cos\\theta$ is a cardioid — a heart-shaped curve with a single cusp at the pole.',
        incorrectExplanation:
          'The form $r = a(1 + \\cos\\theta)$ is a cardioid. A bare $r = c$ would be a circle, and $\\theta = \\alpha$ a line.',
        hint: 'A constant plus a single cosine term in $r$ produces a heart-shaped curve.',
        visual: {
          type: 'polar-curve',
          label: 'The cardioid $r = 2(1 + \\cos\\theta)$.',
          curve: 'cardioid',
          a: 2,
          mode: 'point',
        },
      },
    ],
  },
  {
    id: 'pp-calculus-and-polar-functions',
    chapterId: 'parametric-and-polar',
    title: 'Calculus and Polar Functions',
    description:
      'Area swept by polar curves, area between curves, tangent slopes, and polar arc length.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'polar-area',
        type: 'concept',
        title: 'Area swept by a ray',
        body: 'A region traced by $r = f(\\theta)$ from $\\theta = \\alpha$ to $\\theta = \\beta$ has area $$A = \\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} r^{2}\\,d\\theta$$ The idea is to add up thin circular sectors, each with area $\\dfrac{1}{2} r^{2}\\,d\\theta$ (recall a sector of radius $r$ and angle $\\theta$ has area $\\dfrac{1}{2}\\theta r^{2}$). Drag the point to sweep the shaded sector and watch the area grow before continuing.',
        visual: {
          type: 'polar-curve',
          label: 'Sweeping the sector accumulates $\\dfrac{1}{2}\\displaystyle\\int r^{2}\\,d\\theta$.',
          curve: 'cardioid',
          a: 2,
          mode: 'area-sweep',
          thetaMin: 0,
          thetaMax: Math.PI * 2,
        },
        interactiveNote:
          'Drag the point to sweep the shaded sector in the interactive and watch the $\\dfrac{1}{2}\\displaystyle\\int r^{2}\\,d\\theta$ readout accumulate; the area grows fastest where the cardioid reaches farthest from the pole, since a larger $r$ makes fatter sectors.',
      },
      {
        id: 'polar-area-apply',
        type: 'multiple-choice',
        title: 'Area of a polar disk',
        prompt:
          'For the circle $r = 2$, the area integral $\\dfrac{1}{2}\\displaystyle\\int_{0}^{2\\pi} 2^{2}\\,d\\theta$ evaluates to',
        options: [
          { id: 'four-pi', label: '$4\\pi$' },
          { id: 'two-pi', label: '$2\\pi$' },
          { id: 'eight-pi', label: '$8\\pi$' },
          { id: 'pi', label: '$\\pi$' },
        ],
        correctOptionId: 'four-pi',
        correctExplanation:
          'Correct. $$\\dfrac{1}{2}\\displaystyle\\int_{0}^{2\\pi} 4\\,d\\theta = \\dfrac{1}{2}\\cdot 4 \\cdot 2\\pi = 4\\pi$$ matching $\\pi r^{2}$ for $r = 2$.',
        incorrectExplanation:
          'Integrate the constant $4$ from $0$ to $2\\pi$, then halve. The result should match $\\pi r^{2}$.',
        hint: 'The integrand is constant; this should reproduce $\\pi r^{2}$.',
        visual: {
          type: 'polar-curve',
          label: 'Sweep the radius $r = 2$ through a full turn.',
          curve: 'circle',
          radius: 2,
          mode: 'area-sweep',
          thetaMin: 0,
          thetaMax: Math.PI * 2,
        },
      },
      {
        id: 'polar-area-between',
        type: 'multiple-choice',
        title: 'Area between polar curves',
        prompt:
          'For an outer curve $r_{2}$ and an inner curve $r_{1}$ with $r_{1} \\le r_{2}$ on $[\\alpha, \\beta]$, the area between them is',
        options: [
          {
            id: 'diff-squares',
            label: '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} \\left(r_{2}^{2} - r_{1}^{2}\\right)\\,d\\theta$',
          },
          {
            id: 'square-diff',
            label: '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} \\left(r_{2} - r_{1}\\right)^{2}\\,d\\theta$',
          },
          {
            id: 'no-half',
            label: '$\\displaystyle\\int_{\\alpha}^{\\beta} \\left(r_{2}^{2} - r_{1}^{2}\\right)\\,d\\theta$',
          },
          {
            id: 'swapped',
            label: '$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} \\left(r_{1}^{2} - r_{2}^{2}\\right)\\,d\\theta$',
          },
        ],
        correctOptionId: 'diff-squares',
        correctExplanation:
          'Correct. Subtract the inner area from the outer area: $$\\dfrac{1}{2}\\displaystyle\\int_{\\alpha}^{\\beta} \\left(r_{2}^{2} - r_{1}^{2}\\right)\\,d\\theta$$',
        incorrectExplanation:
          'Each area is $\\dfrac{1}{2}\\int r^{2}\\,d\\theta$, so the difference is $\\dfrac{1}{2}\\int (r_{2}^{2} - r_{1}^{2})\\,d\\theta$ — square first, then subtract.',
        hint: 'Subtract the two $\\dfrac{1}{2}\\int r^{2}\\,d\\theta$ areas; the squares are taken before subtracting.',
        visual: {
          type: 'polar-curve',
          label: 'A polar region bounded by two curves over $[\\alpha, \\beta]$.',
          curve: 'limacon',
          a: 2,
          b: 1,
          mode: 'point',
        },
      },
      {
        id: 'polar-slope',
        type: 'concept',
        title: 'Slope of a polar curve',
        body: 'To find a tangent slope, treat the polar curve as parametric in $\\theta$: $x = f(\\theta)\\cos\\theta$ and $y = f(\\theta)\\sin\\theta$. Then $$\\dfrac{dy}{dx} = \\dfrac{f\'(\\theta)\\sin\\theta + f(\\theta)\\cos\\theta}{f\'(\\theta)\\cos\\theta - f(\\theta)\\sin\\theta}$$ Where the curve passes through the pole, $f(\\alpha) = 0$, this collapses to $\\dfrac{dy}{dx} = \\tan\\alpha$, so the tangent line there is simply $\\theta = \\alpha$. Tap the cardioid to explore before continuing.',
        visual: {
          type: 'polar-curve',
          label: 'Tangent slopes along the cardioid $r = 2(1 + \\cos\\theta)$.',
          curve: 'cardioid',
          a: 2,
          mode: 'point',
        },
        interactiveNote:
          'Drag the point around the cardioid in the interactive and watch the $r$ readout fall to $0$ as $\\theta$ nears $\\pi$; that point is the pole, where the tangent line becomes simply $\\theta = \\alpha$.',
      },
      {
        id: 'polar-arc-idea',
        type: 'concept',
        title: 'Arc length in polar form',
        body: 'Applying the parametric arc-length formula to $x = f(\\theta)\\cos\\theta$, $y = f(\\theta)\\sin\\theta$ simplifies remarkably: the integrand becomes $$\\sqrt{f(\\theta)^{2} + f\'(\\theta)^{2}}$$ So the length of $r = f(\\theta)$ on $[\\alpha, \\beta]$ is $$L = \\displaystyle\\int_{\\alpha}^{\\beta} \\sqrt{r^{2} + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}}\\,d\\theta$$ Tap the cardioid to explore its arc before continuing.',
        visual: {
          type: 'polar-curve',
          label: 'Arc length of the cardioid $r = 2(1 + \\cos\\theta)$.',
          curve: 'cardioid',
          a: 2,
          mode: 'point',
        },
        interactiveNote:
          'Drag the point all the way around the cardioid in the interactive and watch how far it travels for each step of $\\theta$; the path stretches longest where $r$ is large and where $r$ changes fastest, which is why the integrand pairs $r$ with $\\dfrac{dr}{d\\theta}$.',
      },
      {
        id: 'polar-arc-length',
        type: 'multiple-choice',
        title: 'Polar arc length integrand',
        prompt: 'The arc length of $r = f(\\theta)$ uses which integrand?',
        options: [
          {
            id: 'sqrt',
            label: '$\\sqrt{r^{2} + \\left(\\dfrac{dr}{d\\theta}\\right)^{2}}$',
          },
          { id: 'r-only', label: '$r$' },
          { id: 'half-r2', label: '$\\dfrac{1}{2} r^{2}$' },
          { id: 'dr', label: '$\\dfrac{dr}{d\\theta}$' },
        ],
        correctOptionId: 'sqrt',
        correctExplanation:
          'Correct. Polar arc length integrates $\\sqrt{r^{2} + (dr/d\\theta)^{2}}$ with respect to $\\theta$.',
        incorrectExplanation:
          'The $\\dfrac{1}{2} r^{2}$ form is for area. Arc length uses the square root of $r^{2} + (dr/d\\theta)^{2}$.',
        hint: 'Do not confuse it with the area formula; arc length carries a square root.',
        visual: {
          type: 'polar-curve',
          label: 'Arc length of $r = 2(1 + \\cos\\theta)$ over a full turn.',
          curve: 'cardioid',
          a: 2,
          mode: 'point',
        },
      },
    ],
  },
];
