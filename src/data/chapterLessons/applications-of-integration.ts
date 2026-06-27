import type { Lesson } from '../lessons';

/* Lessons for "Applications of Integration" (Chapter 7), adapted from APEX Calculus (G. Hartman et al.) under CC BY-NC 4.0. */

export const applicationsOfIntegrationLessons: Lesson[] = [
  {
    id: 'aoi-area-between-curves',
    chapterId: 'applications-of-integration',
    title: 'Area Between Curves',
    description:
      'Slice a region into thin vertical strips and integrate top minus bottom to get its area.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'abc-strip-idea',
        type: 'concept',
        title: 'Top minus bottom',
        body: 'Slice the region between two curves into thin vertical strips. A strip at $x$ has height $f(x) - g(x)$ (the upper curve minus the lower curve) and width $dx$, so its area is $\\big[f(x) - g(x)\\big]\\,dx$. Adding the strips over $[a, b]$ gives the area: $$\\displaystyle\\int_{a}^{b} \\big[f(x) - g(x)\\big]\\,dx$$ Drag the strip across the region to watch the gap $f(x) - g(x)$ change.',
        visual: {
          type: 'area-between-curves',
          label: 'A vertical strip of height $f(x) - g(x)$ between $y = x$ (top) and $y = x^2$ (bottom).',
          top: 'line',
          bottom: 'parabola',
          a: 0,
          b: 1,
          showStrip: true,
        },
        interactiveNote:
          'Drag the strip across the region and read its height $f(x) - g(x)$ at the handle; the area readout $A = \\int(\\text{top} - \\text{bottom})\\,dx$ is exactly those strip heights summed over $[0, 1]$.',
      },
      {
        id: 'abc-find-bounds',
        type: 'multiple-choice',
        title: 'Where do they meet?',
        prompt:
          'The curves $y = x$ and $y = x^{2}$ enclose one region. Which $x$-values bound it?',
        options: [
          { id: 'zero-one', label: '$x = 0$ and $x = 1$' },
          { id: 'zero-two', label: '$x = 0$ and $x = 2$' },
          { id: 'one-two', label: '$x = 1$ and $x = 2$' },
          { id: 'neg-one-one', label: '$x = -1$ and $x = 1$' },
        ],
        correctOptionId: 'zero-one',
        correctExplanation:
          'Correct. Setting $x = x^{2}$ gives $x - x^{2} = x(1 - x) = 0$, so $x = 0$ and $x = 1$. These intersections become the limits of integration.',
        incorrectExplanation:
          'Set the two expressions equal: $x = x^{2}$. The solutions are the limits of integration.',
        hint: 'Solve $x = x^{2}$.',
        visual: {
          type: 'area-between-curves',
          label: 'The intersections of $y = x$ and $y = x^2$ become the integration limits.',
          top: 'line',
          bottom: 'parabola',
          a: 0,
          b: 1,
          showIntersections: true,
          showStrip: false,
        },
      },
      {
        id: 'abc-compute',
        type: 'multiple-choice',
        title: 'Compute the area',
        prompt:
          'On $[0, 1]$ the line $y = x$ lies above $y = x^{2}$. What is $\\displaystyle\\int_{0}^{1} (x - x^{2})\\,dx$?',
        options: [
          { id: 'sixth', label: '$\\tfrac{1}{6}$' },
          { id: 'third', label: '$\\tfrac{1}{3}$' },
          { id: 'half', label: '$\\tfrac{1}{2}$' },
          { id: 'one', label: '$1$' },
        ],
        correctOptionId: 'sixth',
        correctExplanation:
          'Correct. $$\\displaystyle\\int_{0}^{1}(x - x^{2})\\,dx = \\left[\\tfrac{x^{2}}{2} - \\tfrac{x^{3}}{3}\\right]_{0}^{1} = \\tfrac{1}{2} - \\tfrac{1}{3} = \\tfrac{1}{6}$$',
        incorrectExplanation:
          'Antidifferentiate term by term: $\\tfrac{x^{2}}{2} - \\tfrac{x^{3}}{3}$, then evaluate from $0$ to $1$.',
        hint: 'The antiderivative is $\\tfrac{x^{2}}{2} - \\tfrac{x^{3}}{3}$.',
        visual: {
          type: 'area-between-curves',
          label: 'The shaded area equals $\\int_0^1 (x - x^2)\\,dx = \\tfrac{1}{6}$.',
          top: 'line',
          bottom: 'parabola',
          a: 0,
          b: 1,
          showStrip: true,
        },
      },
      {
        id: 'abc-crossing',
        type: 'multiple-choice',
        title: 'When the curves cross',
        prompt:
          'Two curves cross inside $[a, b]$, so neither is always on top. To get the total (positive) area between them, you should',
        options: [
          {
            id: 'split',
            label: 'split at the crossing points and integrate the larger minus the smaller on each piece',
          },
          { id: 'whole', label: 'integrate $f - g$ over all of $[a, b]$ without splitting' },
          { id: 'product', label: 'integrate the product $f(x)\\,g(x)$ over $[a, b]$' },
          { id: 'endpoints', label: 'just evaluate $f - g$ at the endpoints $a$ and $b$' },
        ],
        correctOptionId: 'split',
        correctExplanation:
          'Correct. Where the curves swap order the top function changes, so split at each crossing and integrate top minus bottom on each subinterval. Equivalently, integrate $|f - g|$.',
        incorrectExplanation:
          'Integrating $f - g$ straight through lets the pieces cancel. Split at the crossings so every piece contributes positive area.',
        hint: 'Which curve is on top changes at a crossing.',
        visual: {
          type: 'area-between-curves',
          label: '$y = \\sin x$ and $y = \\cos x$ cross, so the top curve changes.',
          top: 'sine',
          bottom: 'cosine',
          a: 0,
          b: 6.283,
          xMin: 0,
          xMax: 6.4,
          showIntersections: true,
          showStrip: true,
        },
      },
    ],
  },
  {
    id: 'aoi-volume-cross-sections',
    chapterId: 'applications-of-integration',
    title: 'Volume by Cross-Sectional Area',
    description:
      'Build a volume by stacking thin slices, then specialize to the disk and washer methods.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'vol-slabs',
        type: 'concept',
        title: 'Stack the slices',
        body: 'Cut a solid into thin slices perpendicular to the $x$-axis. A slice at $x$ with cross-sectional area $A(x)$ and thickness $dx$ has volume $A(x)\\,dx$. Adding the slices gives the volume: $$\\displaystyle V = \\int_{a}^{b} A(x)\\,dx$$ The whole method comes down to writing $A(x)$ for the shape of a slice.',
        visual: {
          type: 'solid-of-revolution',
          label: 'A representative slice of volume $A(x)\\,dx$.',
          method: 'disk',
          outerCurve: 'line',
          a: 0,
          b: 4,
        },
        interactiveNote:
          'Drag the representative slice along $[0, 4]$ and watch its $\\Delta V$ readout change; the total-$V$ readout shows these cross-sections $A(x)\\,dx$ stacked into the whole solid.',
      },
      {
        id: 'vol-disk-idea',
        type: 'concept',
        title: 'The disk method',
        body: 'Revolve the region under $y = f(x)$ about the $x$-axis. Each slice is a disk of radius $R(x) = f(x)$, so its area is $A(x) = \\pi\\,[f(x)]^{2}$ and the volume is: $$\\displaystyle V = \\pi\\int_{a}^{b} [f(x)]^{2}\\,dx$$ Drag the representative disk along the axis to see the solid fill in.',
        visual: {
          type: 'solid-of-revolution',
          label: 'Revolving $y = \\sqrt{x}$ on $[0, 4]$ about the $x$-axis sweeps out disks.',
          method: 'disk',
          outerCurve: 'sqrt',
          a: 0,
          b: 4,
        },
        interactiveNote:
          'Drag the representative disk along the $x$-axis and watch its radius $R = \\sqrt{x}$ and term $\\Delta V = \\pi R^2\\,\\Delta x$ update; since each slice has area $\\pi[f(x)]^2$, the total-$V$ readout equals $\\pi\\int_0^4 x\\,dx$.',
      },
      {
        id: 'vol-disk-compute',
        type: 'multiple-choice',
        title: 'A disk-method volume',
        prompt:
          'Revolve $y = \\sqrt{x}$ on $[0, 4]$ about the $x$-axis. Since $[f(x)]^{2} = x$, the volume is: $$\\displaystyle\\pi\\int_{0}^{4} x\\,dx$$ What is it?',
        options: [
          { id: 'eight-pi', label: '$8\\pi$' },
          { id: 'four-pi', label: '$4\\pi$' },
          { id: 'sixteen-pi', label: '$16\\pi$' },
          { id: 'two-pi', label: '$2\\pi$' },
        ],
        correctOptionId: 'eight-pi',
        correctExplanation:
          'Correct. $$\\displaystyle\\pi\\int_{0}^{4} x\\,dx = \\pi\\left[\\tfrac{x^{2}}{2}\\right]_{0}^{4} = \\pi\\cdot 8 = 8\\pi$$',
        incorrectExplanation:
          'Antidifferentiate $\\pi x$ to $\\pi\\tfrac{x^{2}}{2}$, then evaluate from $0$ to $4$.',
        hint: 'The antiderivative of $\\pi x$ is $\\pi\\tfrac{x^{2}}{2}$.',
        visual: {
          type: 'solid-of-revolution',
          label: 'Disks from revolving $y = \\sqrt{x}$ on $[0, 4]$.',
          method: 'disk',
          outerCurve: 'sqrt',
          a: 0,
          b: 4,
        },
      },
      {
        id: 'vol-washer-area',
        type: 'multiple-choice',
        title: 'A washer cross-section',
        prompt:
          'When the region does not touch the axis, each slice is a washer with outer radius $R$ and inner radius $r$. Its cross-sectional area is',
        options: [
          { id: 'diff', label: '$\\pi\\big(R^{2} - r^{2}\\big)$' },
          { id: 'sum', label: '$\\pi\\big(R^{2} + r^{2}\\big)$' },
          { id: 'sq-diff', label: '$\\pi\\big(R - r\\big)^{2}$' },
          { id: 'prod', label: '$\\pi R r$' },
        ],
        correctOptionId: 'diff',
        correctExplanation:
          'Correct. A washer is a full disk with a hole punched out: area $= \\pi R^{2} - \\pi r^{2} = \\pi(R^{2} - r^{2})$.',
        incorrectExplanation:
          'Subtract the hole from the full disk: $\\pi R^{2} - \\pi r^{2}$.',
        hint: 'Outer disk area minus inner disk area.',
        visual: {
          type: 'solid-of-revolution',
          label: 'A washer: outer radius $R$ with an inner hole of radius $r$.',
          method: 'washer',
          outerCurve: 'line',
          innerCurve: 'parabola',
          a: 0,
          b: 1,
        },
      },
      {
        id: 'vol-washer-compute',
        type: 'multiple-choice',
        title: 'A washer-method volume',
        prompt:
          'Revolve the region between $y = x$ (outer) and $y = x^{2}$ (inner) on $[0, 1]$ about the $x$-axis. The volume is: $$\\displaystyle\\pi\\int_{0}^{1}\\big(x^{2} - x^{4}\\big)\\,dx$$ What is it?',
        options: [
          { id: 'two-fifteen', label: '$\\tfrac{2\\pi}{15}$' },
          { id: 'pi-fifteen', label: '$\\tfrac{\\pi}{15}$' },
          { id: 'two-pi-five', label: '$\\tfrac{2\\pi}{5}$' },
          { id: 'pi-six', label: '$\\tfrac{\\pi}{6}$' },
        ],
        correctOptionId: 'two-fifteen',
        correctExplanation:
          'Correct. $$\\displaystyle\\pi\\int_{0}^{1}(x^{2} - x^{4})\\,dx = \\pi\\left[\\tfrac{x^{3}}{3} - \\tfrac{x^{5}}{5}\\right]_{0}^{1} = \\pi\\left(\\tfrac{1}{3} - \\tfrac{1}{5}\\right) = \\tfrac{2\\pi}{15}$$',
        incorrectExplanation:
          'Use $R = x$ and $r = x^{2}$, so $R^{2} - r^{2} = x^{2} - x^{4}$. Integrate and multiply by $\\pi$.',
        hint: 'The outer radius is $x$ and the inner radius is $x^{2}$.',
        visual: {
          type: 'solid-of-revolution',
          label: 'Washers between $y = x$ and $y = x^2$ on $[0, 1]$.',
          method: 'washer',
          outerCurve: 'line',
          innerCurve: 'parabola',
          a: 0,
          b: 1,
        },
      },
    ],
  },
  {
    id: 'aoi-shell-method',
    chapterId: 'applications-of-integration',
    title: 'The Shell Method',
    description:
      'Slice a solid of revolution into nested cylindrical shells parallel to the axis.',
    status: 'available',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'shell-idea',
        type: 'concept',
        title: 'Nested cylindrical shells',
        body: 'Instead of slicing across the axis, slice parallel to it into thin cylindrical shells. Unroll one shell and it becomes a flat slab: its length is the circumference $2\\pi r$, its height is $h$, and its thickness is $dx$. So a shell has volume $2\\pi r\\,h\\,dx$, and the total is: $$\\displaystyle V = 2\\pi\\int_{a}^{b} r(x)\\,h(x)\\,dx$$ Drag the representative shell to sweep the solid.',
        visual: {
          type: 'solid-of-revolution',
          label: 'Revolving the region about the $y$-axis sweeps out nested shells.',
          method: 'shell',
          outerCurve: 'parabola',
          axis: 'y',
          a: 0,
          b: 2,
        },
        interactiveNote:
          'Drag the representative shell along $[0, 2]$ and watch its radius $x$, height $f(x)$, and term $\\Delta V = 2\\pi x\\,f(x)\\,\\Delta x$ in the readout; the nested shells sweep out the solid, and the total-$V$ readout is $2\\pi\\int_a^b r\\,h\\,dx$.',
      },
      {
        id: 'shell-element',
        type: 'multiple-choice',
        title: 'The shell volume element',
        prompt:
          'Revolving about the $y$-axis, a shell at position $x$ has radius $x$ and height $f(x)$. Its volume element is',
        options: [
          { id: 'shell', label: '$2\\pi x\\,f(x)\\,dx$' },
          { id: 'disk', label: '$\\pi\\,[f(x)]^{2}\\,dx$' },
          { id: 'no-circ', label: '$x\\,f(x)\\,dx$' },
          { id: 'no-radius', label: '$2\\pi\\,f(x)\\,dx$' },
        ],
        correctOptionId: 'shell',
        correctExplanation:
          'Correct. Circumference $2\\pi x$ times height $f(x)$ times thickness $dx$ gives $2\\pi x\\,f(x)\\,dx$.',
        incorrectExplanation:
          'An unrolled shell is a slab: circumference $2\\pi x$ by height $f(x)$ by thickness $dx$.',
        hint: 'Circumference times height times thickness.',
        visual: {
          type: 'solid-of-revolution',
          label: 'One shell of radius $x$ and height $f(x)$.',
          method: 'shell',
          outerCurve: 'parabola',
          axis: 'y',
          a: 0,
          b: 2,
        },
      },
      {
        id: 'shell-compute',
        type: 'multiple-choice',
        title: 'A shell-method volume',
        prompt:
          'Revolve the region under $y = x^{2}$ on $[0, 2]$ about the $y$-axis. The volume is: $$\\displaystyle 2\\pi\\int_{0}^{2} x\\cdot x^{2}\\,dx$$ What is it?',
        options: [
          { id: 'eight-pi', label: '$8\\pi$' },
          { id: 'four-pi', label: '$4\\pi$' },
          { id: 'sixteen-pi', label: '$16\\pi$' },
          { id: 'thirty-two-pi-five', label: '$\\tfrac{32\\pi}{5}$' },
        ],
        correctOptionId: 'eight-pi',
        correctExplanation:
          'Correct. $$\\displaystyle 2\\pi\\int_{0}^{2} x^{3}\\,dx = 2\\pi\\left[\\tfrac{x^{4}}{4}\\right]_{0}^{2} = 2\\pi\\cdot 4 = 8\\pi$$',
        incorrectExplanation:
          'The integrand $x\\cdot x^{2} = x^{3}$; its antiderivative is $\\tfrac{x^{4}}{4}$. Evaluate on $[0, 2]$ and multiply by $2\\pi$.',
        hint: 'Multiply radius $x$ by height $x^{2}$ to get $x^{3}$.',
        visual: {
          type: 'solid-of-revolution',
          label: 'Shells from revolving $y = x^2$ on $[0, 2]$ about the $y$-axis.',
          method: 'shell',
          outerCurve: 'parabola',
          axis: 'y',
          a: 0,
          b: 2,
        },
      },
      {
        id: 'shell-when',
        type: 'multiple-choice',
        title: 'When shells are easier',
        prompt: 'The shell method is often easier than disks or washers when you are',
        options: [
          {
            id: 'vertical-x',
            label: 'rotating about a vertical axis but keeping $x$ as the variable of integration',
          },
          { id: 'always', label: 'doing any volume; it is always strictly easier' },
          { id: 'never', label: 'rotating about the $x$-axis with a function of $x$' },
          { id: 'constant', label: 'working with a constant function' },
        ],
        correctOptionId: 'vertical-x',
        correctExplanation:
          'Correct. Shells let you integrate in the variable the curve is already written in, so you avoid solving $y = f(x)$ for $x$.',
        incorrectExplanation:
          'Shells shine when a vertical axis would otherwise force you to rewrite the curve as a function of $y$.',
        hint: 'Which method avoids solving for the inverse function?',
        visual: {
          type: 'solid-of-revolution',
          label: 'Shells keep $x$ as the variable when rotating about the $y$-axis.',
          method: 'shell',
          outerCurve: 'parabola',
          axis: 'y',
          a: 0,
          b: 2,
        },
      },
    ],
  },
  {
    id: 'aoi-arc-length-surface-area',
    chapterId: 'applications-of-integration',
    title: 'Arc Length and Surface Area',
    description:
      'Measure the length of a curve and the area of the surface it sweeps when revolved.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'arc-idea',
        type: 'concept',
        title: 'Summing tiny hypotenuses',
        body: 'Zoom in on a tiny piece of the curve. It is almost the hypotenuse of a right triangle with legs $dx$ and $dy$, so its length is: $$\\sqrt{dx^{2} + dy^{2}} = \\sqrt{1 + [f\'(x)]^{2}}\\,dx$$ Adding these pieces gives the arc length: $$\\displaystyle L = \\int_{a}^{b} \\sqrt{1 + [f\'(x)]^{2}}\\,dx$$ Drag the tangent point to see the local slope $f\'(x)$.',
        visual: {
          type: 'function-explorer',
          label: 'A short curve piece is about $\\sqrt{1 + [f\'(x)]^2}\\,dx$ long.',
          fn: (x) => Math.sqrt(x),
          showTangent: true,
          showCursor: false,
          xMin: 0,
          xMax: 4,
        },
        interactiveNote:
          'Drag the tangent point along the curve and read the slope $f\'(x)$; that slope is exactly what sits under the root in each length piece $\\sqrt{1 + [f\'(x)]^2}\\,dx$, so steeper spots give longer pieces.',
      },
      {
        id: 'arc-integrand',
        type: 'multiple-choice',
        title: 'The arc-length integrand',
        prompt: 'For $y = f(x)$ on $[a, b]$, the length is $\\int_{a}^{b} (\\;?\\;)\\,dx$, where the integrand is',
        options: [
          { id: 'sqrt', label: '$\\sqrt{1 + [f\'(x)]^{2}}$' },
          { id: 'square', label: '$1 + [f\'(x)]^{2}$' },
          { id: 'fprime', label: '$f\'(x)$' },
          { id: 'pi-sq', label: '$\\pi\\,[f(x)]^{2}$' },
        ],
        correctOptionId: 'sqrt',
        correctExplanation:
          'Correct. The Pythagorean theorem on the legs $dx$ and $dy = f\'(x)\\,dx$ gives the length element $$\\sqrt{1 + [f\'(x)]^{2}}\\,dx$$',
        incorrectExplanation:
          'Each piece is a hypotenuse, so the integrand is $\\sqrt{1 + [f\'(x)]^{2}}$ — the square root is essential.',
        hint: 'It comes from $\\sqrt{dx^{2} + dy^{2}}$.',
        visual: {
          type: 'function-explorer',
          label: 'The slope $f\'(x)$ feeds the arc-length element.',
          fn: (x) => 0.4 * x * x,
          showTangent: true,
          showCursor: false,
          xMin: 0,
          xMax: 4,
        },
      },
      {
        id: 'arc-compute',
        type: 'multiple-choice',
        title: 'Compute an arc length',
        prompt:
          'For $y = \\tfrac{2}{3}x^{3/2}$ we have $f\'(x) = x^{1/2}$, so $1 + [f\'(x)]^{2} = 1 + x$. What is the length on $[0, 3]$, namely $\\displaystyle\\int_{0}^{3}\\sqrt{1 + x}\\,dx$?',
        options: [
          { id: 'fourteen-thirds', label: '$\\tfrac{14}{3}$' },
          { id: 'seven-thirds', label: '$\\tfrac{7}{3}$' },
          { id: 'eight', label: '$8$' },
          { id: 'sixteen-thirds', label: '$\\tfrac{16}{3}$' },
        ],
        correctOptionId: 'fourteen-thirds',
        correctExplanation:
          'Correct. $$\\displaystyle\\int_{0}^{3}\\sqrt{1 + x}\\,dx = \\left[\\tfrac{2}{3}(1 + x)^{3/2}\\right]_{0}^{3} = \\tfrac{2}{3}(8 - 1) = \\tfrac{14}{3}$$',
        incorrectExplanation:
          'Antidifferentiate $(1 + x)^{1/2}$ to $\\tfrac{2}{3}(1 + x)^{3/2}$, then evaluate from $0$ to $3$.',
        hint: 'At $x = 3$, $(1 + x)^{3/2} = 4^{3/2} = 8$.',
        visual: {
          type: 'function-explorer',
          label: 'The curve $y = \\tfrac{2}{3}x^{3/2}$ on $[0, 3]$.',
          fn: (x) => (2 / 3) * Math.pow(Math.max(x, 0), 1.5),
          showTangent: true,
          showCursor: false,
          xMin: 0,
          xMax: 3,
        },
      },
      {
        id: 'arc-surface',
        type: 'multiple-choice',
        title: 'Surface of revolution',
        prompt:
          'Revolve $y = f(x)$ about the $x$-axis. Each length element sweeps a thin band. The surface-area integrand is',
        options: [
          { id: 'surface', label: '$2\\pi f(x)\\sqrt{1 + [f\'(x)]^{2}}$' },
          { id: 'arc-only', label: '$\\sqrt{1 + [f\'(x)]^{2}}$' },
          { id: 'disk', label: '$\\pi\\,[f(x)]^{2}$' },
          { id: 'linear', label: '$2\\pi f(x)$' },
        ],
        correctOptionId: 'surface',
        correctExplanation:
          'Correct. A band has circumference $2\\pi f(x)$ and slant width $\\sqrt{1 + [f\'(x)]^{2}}\\,dx$, giving $$2\\pi f(x)\\sqrt{1 + [f\'(x)]^{2}}\\,dx$$',
        incorrectExplanation:
          'Multiply the arc-length element by the circumference $2\\pi f(x)$ that it traces as it revolves.',
        hint: 'Circumference times slant width of each band.',
        visual: {
          type: 'solid-of-revolution',
          label: 'Revolving a curve sweeps out a surface of revolution.',
          method: 'disk',
          outerCurve: 'sine',
          a: 0,
          b: 6,
        },
      },
    ],
  },
  {
    id: 'aoi-work',
    chapterId: 'applications-of-integration',
    title: 'Work',
    description:
      'Integrate a varying force over distance to compute work, from springs to pumping fluids.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'work-idea',
        type: 'concept',
        title: 'Force times distance, summed',
        body: 'Over a tiny displacement $dx$, a force $F(x)$ is essentially constant, so the work it does is $F(x)\\,dx$. Adding these contributions over $[a, b]$ gives the total work $$\\displaystyle W = \\int_{a}^{b} F(x)\\,dx$$ — the area under the force-versus-position graph. Drag the slider to refine the approximating strips.',
        visual: {
          type: 'riemann-sum',
          label: 'Work $= \\int_a^b F(x)\\,dx$ approximated by $F(x)\\,\\Delta x$ strips.',
          curve: 'line',
          fn: (x) => 1 + x,
          a: 0,
          b: 4,
          n: 6,
          rule: 'midpoint',
          showExactArea: true,
        },
        interactiveNote:
          'Move the slider to raise $n$ and watch the strip estimate close in on the exact-area readout; that area under the force graph is the work $W = \\int_a^b F(x)\\,dx$.',
      },
      {
        id: 'work-hooke',
        type: 'concept',
        title: "Hooke's law for springs",
        body: 'A spring resists being stretched with a force proportional to the stretch: $F(x) = kx$, where $k$ is the spring constant. The work to stretch it from $0$ to $L$ is: $$\\displaystyle\\int_{0}^{L} kx\\,dx = \\tfrac{1}{2}kL^{2}$$ Because $F$ is a straight line through the origin, this work is just the triangular area beneath it.',
        visual: {
          type: 'function-explorer',
          label: 'Spring force $F(x) = kx$ rises linearly with the stretch.',
          fn: (x) => 3 * x,
          showCursor: true,
          xMin: 0,
          xMax: 4,
        },
        interactiveNote:
          'Drag the point along the line and watch the readout $F(x)$ double whenever the stretch $x$ doubles; that constant proportionality $F = kx$ is what makes the work the triangular area under the line.',
      },
      {
        id: 'work-spring-compute',
        type: 'multiple-choice',
        title: 'Work to stretch a spring',
        prompt:
          'A spring has force $F(x) = 6x$. The work to stretch it from $x = 0$ to $x = 2$ is: $$\\displaystyle\\int_{0}^{2} 6x\\,dx$$ What is it?',
        options: [
          { id: 'twelve', label: '$12$' },
          { id: 'six', label: '$6$' },
          { id: 'twenty-four', label: '$24$' },
          { id: 'three', label: '$3$' },
        ],
        correctOptionId: 'twelve',
        correctExplanation:
          'Correct. $$\\displaystyle\\int_{0}^{2} 6x\\,dx = \\left[3x^{2}\\right]_{0}^{2} = 12$$',
        incorrectExplanation:
          'Antidifferentiate $6x$ to $3x^{2}$, then evaluate from $0$ to $2$.',
        hint: 'The antiderivative of $6x$ is $3x^{2}$.',
        visual: {
          type: 'area-accumulation',
          label: 'Work is the area under $F(x) = 6x$ on $[0, 2]$.',
          curve: 'line',
          fn: (x) => 6 * x,
          a: 0,
          initialB: 2,
          xMin: 0,
          xMax: 3,
        },
      },
      {
        id: 'work-pumping',
        type: 'multiple-choice',
        title: 'Pumping fluid out of a tank',
        prompt:
          'To find the work to pump the water out of a tank, you integrate, over the depth, the contribution of each thin horizontal layer. That contribution is',
        options: [
          { id: 'weight-lift', label: 'the weight of the layer times the distance it must be lifted' },
          { id: 'volume-only', label: 'the volume of the layer alone' },
          { id: 'pressure-area', label: 'the pressure on the bottom times the tank floor area' },
          { id: 'weight-only', label: 'the weight of the layer alone, with no distance' },
        ],
        correctOptionId: 'weight-lift',
        correctExplanation:
          'Correct. Each layer is lifted a different distance, so its work is (weight of the layer) times (lift distance), and these are summed by the integral.',
        incorrectExplanation:
          'Work is force times distance. The force is the layer\u2019s weight (density times volume) and the distance is how far that layer is lifted.',
        hint: 'Layers near the bottom are lifted farther than layers near the top.',
        visual: {
          type: 'function-explorer',
          label: 'Lift distance to the spout shrinks as a layer\u2019s height rises.',
          fn: (y) => 10 - y,
          showCursor: true,
          xMin: 0,
          xMax: 10,
        },
      },
    ],
  },
  {
    id: 'aoi-fluid-forces',
    chapterId: 'applications-of-integration',
    title: 'Fluid Forces',
    description:
      'Use pressure that grows with depth to compute the force a fluid exerts on a surface.',
    status: 'available',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'fluid-pressure-idea',
        type: 'concept',
        title: 'Pressure grows with depth',
        body: 'In a fluid of weight-density $\\gamma$, the pressure at depth $d$ is $P = \\gamma d$. For water, $\\gamma \\approx 62.4\\ \\text{lb/ft}^{3}$. Pressure is the same in every direction at a given depth, and it increases linearly the deeper you go. Drag the cursor to read the pressure at different depths.',
        visual: {
          type: 'function-explorer',
          label: 'Water pressure $P = 62.4\\,d$ (lb/ft$^2$) versus depth $d$.',
          fn: (d) => 62.4 * d,
          showCursor: true,
          xMin: 0,
          xMax: 10,
        },
        interactiveNote:
          'Drag the point along the line to larger depths $d$ and watch the readout $P = 62.4\\,d$ climb steadily; doubling $d$ doubles the pressure, exactly the linear law $P = \\gamma d$.',
      },
      {
        id: 'fluid-pressure-formula',
        type: 'multiple-choice',
        title: 'The pressure formula',
        prompt:
          'In a fluid with weight-density $\\gamma$, the pressure at depth $d$ is',
        options: [
          { id: 'gamma-d', label: '$\\gamma d$' },
          { id: 'gamma-over-d', label: '$\\dfrac{\\gamma}{d}$' },
          { id: 'gamma-d-sq', label: '$\\gamma d^{2}$' },
          { id: 'gamma-plus-d', label: '$\\gamma + d$' },
        ],
        correctOptionId: 'gamma-d',
        correctExplanation:
          'Correct. Pressure is weight-density times depth: $P = \\gamma d$. It grows in direct proportion to depth.',
        incorrectExplanation:
          'Pressure is the weight-density $\\gamma$ multiplied by the depth $d$: $P = \\gamma d$.',
        hint: 'Twice the depth means twice the pressure.',
        visual: {
          type: 'function-explorer',
          label: 'Pressure rises linearly: $P = \\gamma d$.',
          fn: (d) => 62.4 * d,
          showCursor: true,
          xMin: 0,
          xMax: 10,
        },
      },
      {
        id: 'fluid-horizontal',
        type: 'multiple-choice',
        title: 'Force on a flat horizontal plate',
        prompt:
          'A flat plate of area $A$ lies horizontally at a constant depth $d$. The total fluid force on it is',
        options: [
          { id: 'gamma-d-a', label: '$\\gamma d A$' },
          { id: 'gamma-a', label: '$\\gamma A$' },
          { id: 'gamma-d', label: '$\\gamma d$' },
          { id: 'd-a', label: '$d A$' },
        ],
        correctOptionId: 'gamma-d-a',
        correctExplanation:
          'Correct. At constant depth the pressure $P = \\gamma d$ is the same everywhere on the plate, so force $= P A = \\gamma d A$.',
        incorrectExplanation:
          'Force equals pressure times area. With constant pressure $\\gamma d$, that is $\\gamma d A$.',
        hint: 'Force $=$ pressure $\\times$ area, and the pressure is constant here.',
        visual: {
          type: 'function-explorer',
          label: 'At a fixed depth the pressure $\\gamma d$ is constant across the plate.',
          fn: (d) => 62.4 * d,
          showCursor: true,
          xMin: 0,
          xMax: 10,
        },
      },
      {
        id: 'fluid-vertical',
        type: 'multiple-choice',
        title: 'Force on a vertical plate',
        prompt:
          'A plate stands vertically in the fluid, so different parts sit at different depths. Why must the total force be an integral rather than a single product?',
        options: [
          {
            id: 'depth-varies',
            label: 'the pressure changes with depth, so you sum $\\gamma\\,d\\,w(d)\\,dd$ over thin horizontal strips',
          },
          { id: 'area-varies', label: 'the plate\u2019s total area is impossible to measure directly' },
          { id: 'gamma-varies', label: 'the weight-density $\\gamma$ changes from strip to strip' },
          { id: 'pressure-const', label: 'the pressure is constant, so a single product would double-count it' },
        ],
        correctOptionId: 'depth-varies',
        correctExplanation:
          'Correct. Each thin horizontal strip at depth $d$ feels pressure $\\gamma d$ over its area $w(d)\\,dd$, so the force is: $$\\displaystyle\\int \\gamma\\,d\\,w(d)\\,dd$$',
        incorrectExplanation:
          'Because pressure depends on depth, you slice the plate into horizontal strips and integrate $\\gamma\\,d\\,w(d)$ over the depth range.',
        hint: 'On a vertical plate, the pressure is not the same at the top and the bottom.',
        visual: {
          type: 'area-accumulation',
          label: 'Force accumulates as $\\int \\gamma\\,d\\,w(d)\\,dd$ down the plate.',
          curve: 'line',
          fn: (d) => 124.8 * d,
          a: 0,
          initialB: 4,
          xMin: 0,
          xMax: 6,
        },
      },
    ],
  },
];
