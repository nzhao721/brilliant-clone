import type { Lesson } from '../lessons';

/* Lessons for "Sequences and Series", adapted from APEX Calculus (G. Hartman et al.) under CC BY-NC 4.0. */

export const sequencesAndSeriesLessons: Lesson[] = [
  // 1. Sequences
  {
    id: 'ss-sequences',
    chapterId: 'sequences-and-series',
    title: 'Sequences',
    description:
      'Ordered lists of numbers built from a rule, their limits, and what it means for a sequence to converge.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'sequence-idea',
        type: 'concept',
        title: 'A list with a rule',
        body: 'A sequence is an ordered list $a_{1}, a_{2}, a_{3}, \\ldots$ produced by a rule for the $n$-th term, such as $a_{n} = \\dfrac{1}{n}$. We say the sequence converges to a number $L$ if the terms get arbitrarily close to $L$ as $n \\to \\infty$, written: $$\\lim_{n \\to \\infty} a_{n} = L$$ Drag the slider to reveal more terms and watch them settle toward the dashed limit line.',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $a_n = \\dfrac{1}{n}$ closing in on $0$.',
          sequence: 'one-over-n',
          mode: 'terms',
          limit: 0,
        },
        interactiveNote:
          'Drag the slider to reveal more terms of $a_{n} = \\dfrac{1}{n}$ and watch the dots drop toward the dashed limit line while the $a_{N}$ readout shrinks toward $0$ — that is the sequence converging.',
      },
      {
        id: 'sequence-converge-diverge',
        type: 'concept',
        title: 'Converge, diverge, and a useful shortcut',
        body: 'If the terms approach a single finite value the sequence converges; otherwise it diverges. One reliable shortcut: a sequence that is both monotonic (always increasing or always decreasing) and bounded must converge. The terms of $a_{n} = \\dfrac{n}{n+1}$ increase steadily but never pass $1$, so they converge to $1$.',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $a_n = \\dfrac{n}{n+1}$ rising toward $1$.',
          sequence: 'n-over-n-plus-1',
          mode: 'terms',
          limit: 1,
        },
        interactiveNote:
          'Drag the slider to add terms and watch each dot sit higher than the last yet never cross the dashed line at $1$ — increasing but bounded, the exact monotonic-and-bounded picture that forces convergence.',
      },
      {
        id: 'sequence-limit',
        type: 'multiple-choice',
        title: 'Limit of a sequence',
        prompt: 'What is $\\lim_{n \\to \\infty} \\dfrac{n}{n + 1}$?',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'infinity', label: '$\\infty$' },
          { id: 'half', label: '$\\tfrac{1}{2}$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. Dividing numerator and denominator by $n$ gives $$\\dfrac{1}{1 + 1/n} \\to 1$$',
        incorrectExplanation:
          'For large $n$ the constant $+1$ becomes negligible, so the ratio approaches $1$.',
        hint: 'Divide the top and bottom by $n$ before taking the limit.',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $a_n = \\dfrac{n}{n+1}$ as $n$ grows.',
          sequence: 'n-over-n-plus-1',
          mode: 'terms',
          limit: 1,
        },
      },
      {
        id: 'divergent-sequence',
        type: 'multiple-choice',
        title: 'A divergent sequence',
        prompt: 'Which of these sequences diverges?',
        options: [
          { id: 'powers-two', label: '$a_{n} = 2^{n}$' },
          { id: 'recip', label: '$a_{n} = \\dfrac{1}{n}$' },
          { id: 'ratio', label: '$a_{n} = \\dfrac{n}{n + 1}$' },
          { id: 'const', label: '$a_{n} = 5$' },
        ],
        correctOptionId: 'powers-two',
        correctExplanation:
          'Correct. The terms $2^{n}$ grow without bound, so there is no finite limit and the sequence diverges.',
        incorrectExplanation:
          'A convergent sequence settles toward a finite number. Doubling each term runs off to infinity instead.',
        hint: 'Which rule keeps growing forever instead of settling down?',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $a_n = 2^{n}$ growing without bound.',
          sequence: 'powers-two',
          term: (n) => 2 ** n,
          mode: 'terms',
          maxCount: 10,
        },
      },
      {
        id: 'limit-defining-e',
        type: 'multiple-choice',
        title: 'A famous sequence limit',
        prompt: 'What is $\\lim_{n \\to \\infty} \\left(1 + \\dfrac{1}{n}\\right)^{n}$?',
        options: [
          { id: 'e', label: '$e$' },
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'infinity', label: '$\\infty$' },
        ],
        correctOptionId: 'e',
        correctExplanation:
          'Correct. This is the classic limit that defines $e \\approx 2.718$.',
        incorrectExplanation:
          'Although the base $1 + 1/n \\to 1$, the growing exponent keeps the value finite: it tends to $e$.',
        hint: 'A base just above $1$ raised to a large power can settle on a special constant.',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $\\left(1 + \\tfrac{1}{n}\\right)^{n}$ approaching $e$.',
          sequence: 'n-over-n-plus-1',
          term: (n) => (1 + 1 / n) ** n,
          mode: 'terms',
          limit: 2.71828,
        },
      },
    ],
  },

  // 2. Infinite Series
  {
    id: 'ss-infinite-series',
    chapterId: 'sequences-and-series',
    title: 'Infinite Series',
    description:
      'Adding infinitely many terms through partial sums, the geometric series, and the n-th term test for divergence.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'series-idea',
        type: 'concept',
        title: 'Partial sums define the total',
        body: 'An infinite series $\\sum_{n=1}^{\\infty} a_{n}$ is defined as the limit of its partial sums $$S_{N} = a_{1} + a_{2} + \\cdots + a_{N}$$ If those running totals approach a finite number, the series converges to it; if not, the series diverges. Drag the slider to add more terms and watch the partial sums close in on the total.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{1}{n^2}$ approaching $\\tfrac{\\pi^2}{6}$.',
          sequence: 'one-over-n-squared',
          mode: 'partial-sums',
          limit: 1.6449,
        },
        interactiveNote:
          'Drag the slider to fold in more terms and watch the running total $S_{N}$ in the readout climb and settle onto the dashed line at $\\tfrac{\\pi^2}{6}$ — the series is just the limit those partial sums reach.',
      },
      {
        id: 'geometric-converge',
        type: 'concept',
        title: 'The geometric series',
        body: 'A geometric series $\\sum_{n=0}^{\\infty} a r^{n}$ adds a fixed multiple $r$ of the previous term each time. It converges exactly when $|r| < 1$, and then its sum is $\\dfrac{a}{1 - r}$. This is the single most useful series to know by heart.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\left(\\tfrac{1}{3}\\right)^n$ converging to $\\dfrac{a}{1-r} = \\tfrac{3}{2}$.',
          sequence: 'geometric-half',
          mode: 'partial-sums',
          firstTerm: 1,
          ratio: 1 / 3,
          limit: 1.5,
        },
        interactiveNote:
          'Drag the slider to accumulate terms with ratio $r = \\tfrac{1}{3}$ and watch the partial sums in the readout lock onto the dashed line at $\\dfrac{a}{1-r} = \\tfrac{3}{2}$ — the closed-form sum works precisely because $|r| < 1$.',
      },
      {
        id: 'geometric-sum',
        type: 'multiple-choice',
        title: 'Sum a geometric series',
        prompt: 'What is $\\sum_{n=0}^{\\infty} \\left(\\tfrac{1}{2}\\right)^{n}$?',
        options: [
          { id: 'two', label: '$2$' },
          { id: 'one', label: '$1$' },
          { id: 'half', label: '$\\tfrac{1}{2}$' },
          { id: 'infinity', label: '$\\infty$' },
        ],
        correctOptionId: 'two',
        correctExplanation:
          'Correct. With first term $a = 1$ and ratio $r = \\tfrac{1}{2}$, the sum is $$\\dfrac{1}{1 - 1/2} = 2$$',
        incorrectExplanation:
          'Use $\\dfrac{a}{1 - r}$ with $a = 1$ and $r = \\tfrac{1}{2}$ to get $2$.',
        hint: 'Apply $\\dfrac{a}{1 - r}$ with first term $1$ and ratio $\\tfrac{1}{2}$.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\left(\\tfrac{1}{2}\\right)^n$ as terms accumulate.',
          sequence: 'geometric-half',
          mode: 'partial-sums',
          firstTerm: 1,
          ratio: 0.5,
          limit: 2,
        },
      },
      {
        id: 'nth-term-test',
        type: 'multiple-choice',
        title: 'The n-th term test',
        prompt:
          'If $\\lim_{n \\to \\infty} a_{n} \\ne 0$, what can you conclude about $\\sum a_{n}$? Apply this to: $$\\sum_{n=1}^{\\infty} \\dfrac{n}{n+1}$$',
        options: [
          { id: 'diverges', label: 'It diverges, since the terms approach $1$, not $0$' },
          { id: 'converges', label: 'It converges to $1$' },
          { id: 'inconclusive', label: 'The test says it converges to $0$' },
          { id: 'sum-zero', label: 'It sums to $0$' },
        ],
        correctOptionId: 'diverges',
        correctExplanation:
          'Correct. The terms tend to $1 \\ne 0$, so the series cannot converge — it diverges by the n-th term test.',
        incorrectExplanation:
          'For a series to converge, its terms must shrink to $0$. Here they approach $1$, so the series diverges.',
        hint: 'Terms must go to $0$ just to have a chance at converging. What do these terms approach?',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $\\dfrac{n}{n+1}$ approaching $1$, not $0$.',
          sequence: 'n-over-n-plus-1',
          mode: 'terms',
          limit: 1,
        },
      },
      {
        id: 'telescoping',
        type: 'multiple-choice',
        title: 'A telescoping series',
        prompt:
          'The series $\\sum_{n=1}^{\\infty} \\left(\\dfrac{1}{n} - \\dfrac{1}{n+1}\\right)$ telescopes. What is its sum?',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'half', label: '$\\tfrac{1}{2}$' },
          { id: 'infinity', label: '$\\infty$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. The partial sum collapses to $1 - \\dfrac{1}{N+1}$, which approaches $1$.',
        incorrectExplanation:
          'Write out a few terms: almost everything cancels, leaving $$1 - \\dfrac{1}{N+1} \\to 1$$',
        hint: 'Most adjacent terms cancel; track only what survives at each end.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{1}{n(n+1)}$ approaching $1$.',
          sequence: 'one-over-n-squared',
          term: (n) => 1 / (n * (n + 1)),
          mode: 'partial-sums',
          limit: 1,
        },
      },
    ],
  },

  // 3. Integral and Comparison Tests
  {
    id: 'ss-integral-and-comparison-tests',
    chapterId: 'sequences-and-series',
    title: 'Integral and Comparison Tests',
    description:
      'Linking a series to an improper integral, the p-series rule, and judging convergence by comparison.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'integral-test',
        type: 'concept',
        title: 'The integral test and p-series',
        body: 'When $a_{n} = f(n)$ for a function $f$ that is continuous, positive, and decreasing, the series $\\sum a_{n}$ and the improper integral $\\int_{1}^{\\infty} f(x)\\,dx$ either both converge or both diverge. Applying this to $f(x) = \\dfrac{1}{x^{p}}$ gives the p-series rule: $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{p}}$ converges exactly when $p > 1$.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of the convergent p-series $\\sum \\dfrac{1}{n^2}$ ($p = 2$).',
          sequence: 'one-over-n-squared',
          mode: 'partial-sums',
          limit: 1.6449,
        },
        interactiveNote:
          'Drag the slider to sum more of this $p = 2$ series and watch the partial sums level off at the dashed line instead of running away — a finite total is exactly what the integral test guarantees when $p > 1$.',
      },
      {
        id: 'p-series',
        type: 'multiple-choice',
        title: 'The p-series rule',
        prompt: 'For which values of $p$ does $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{p}}$ converge?',
        options: [
          { id: 'p-gt-1', label: '$p > 1$' },
          { id: 'p-lt-1', label: '$p < 1$' },
          { id: 'p-eq-1', label: 'only $p = 1$' },
          { id: 'all', label: 'all $p$' },
        ],
        correctOptionId: 'p-gt-1',
        correctExplanation:
          'Correct. The integral test shows the p-series converges precisely when $p > 1$; the boundary case $p = 1$ is the divergent harmonic series.',
        incorrectExplanation:
          'Compare with $\\int_{1}^{\\infty} \\dfrac{1}{x^{p}}\\,dx$, which is finite only when $p > 1$.',
        hint: 'The harmonic series ($p = 1$) diverges, so the cutoff sits just above $1$.',
        visual: {
          type: 'sequence-plot',
          label: 'Harmonic partial sums of $\\sum \\dfrac{1}{n}$ ($p = 1$) growing without bound.',
          sequence: 'one-over-n',
          mode: 'partial-sums',
          maxCount: 30,
        },
      },
      {
        id: 'comparison-idea',
        type: 'concept',
        title: 'Trap a series between known ones',
        body: 'The direct comparison test says: if $0 \\le a_{n} \\le b_{n}$ and $\\sum b_{n}$ converges, then $\\sum a_{n}$ converges too; and a series larger than a known divergent one also diverges. The limit comparison test instead compares the size of terms: if $\\lim \\dfrac{a_{n}}{b_{n}}$ is a finite positive number, the two series share the same fate.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{1}{n^2 + 1}$, trapped below the convergent $\\sum \\dfrac{1}{n^2}$.',
          sequence: 'one-over-n-squared',
          term: (n) => 1 / (n * n + 1),
          mode: 'partial-sums',
          limit: 1.0767,
        },
        interactiveNote:
          'Drag the slider to build up $\\sum \\dfrac{1}{n^2+1}$ and watch its partial sums flatten to the dashed line; since every term stays under $\\dfrac{1}{n^2}$, the comparison test traps this smaller series into converging too.',
      },
      {
        id: 'direct-comparison',
        type: 'multiple-choice',
        title: 'Use a direct comparison',
        prompt: 'To show $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^{2} + 1}$ converges, compare it with',
        options: [
          { id: 'p2', label: '$\\sum \\dfrac{1}{n^{2}}$, which converges' },
          { id: 'harmonic', label: '$\\sum \\dfrac{1}{n}$, which diverges' },
          { id: 'geometric', label: '$\\sum 2^{n}$' },
          { id: 'constant', label: '$\\sum 1$' },
        ],
        correctOptionId: 'p2',
        correctExplanation:
          'Correct. Since $\\dfrac{1}{n^{2} + 1} \\le \\dfrac{1}{n^{2}}$ and the p-series with $p = 2$ converges, the smaller series converges too.',
        incorrectExplanation:
          'Bound the terms above by a series you already know converges; $\\sum \\dfrac{1}{n^{2}}$ is the natural choice.',
        hint: 'Find a slightly larger, familiar convergent series.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{1}{n^2+1}$ as terms accumulate.',
          sequence: 'one-over-n-squared',
          term: (n) => 1 / (n * n + 1),
          mode: 'partial-sums',
          limit: 1.0767,
        },
      },
      {
        id: 'limit-comparison',
        type: 'multiple-choice',
        title: 'Limit comparison',
        prompt:
          'The limit comparison test concludes that $\\sum a_{n}$ and $\\sum b_{n}$ behave the same way when $\\lim_{n \\to \\infty} \\dfrac{a_{n}}{b_{n}}$ is',
        options: [
          { id: 'finite-pos', label: 'a finite positive number' },
          { id: 'zero', label: 'exactly zero' },
          { id: 'infinity', label: 'infinite' },
          { id: 'negative', label: 'negative' },
        ],
        correctOptionId: 'finite-pos',
        correctExplanation:
          'Correct. A finite, positive ratio limit means the two positive series converge or diverge together.',
        incorrectExplanation:
          'When the ratio of terms tends to a finite positive constant, the series have comparably sized terms and share the same fate.',
        hint: 'The terms must be comparable in size, so the ratio approaches a positive constant.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{1}{2n^2}$, comparable to $\\sum \\dfrac{1}{n^2}$.',
          sequence: 'one-over-n-squared',
          term: (n) => 1 / (2 * n * n),
          mode: 'partial-sums',
          limit: 0.8225,
        },
      },
    ],
  },

  // 4. Ratio and Root Tests
  {
    id: 'ss-ratio-and-root-tests',
    chapterId: 'sequences-and-series',
    title: 'Ratio and Root Tests',
    description:
      'Tests based on the limiting ratio or root of the terms — the go-to tools for factorials and powers.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'ratio-test',
        type: 'concept',
        title: 'The ratio test',
        body: 'Let $$L = \\lim_{n \\to \\infty} \\left|\\dfrac{a_{n+1}}{a_{n}}\\right|$$ If $L < 1$ the series converges absolutely; if $L > 1$ (including $\\infty$) it diverges; and if $L = 1$ the test is inconclusive. Because factorials and exponentials simplify cleanly in the ratio $a_{n+1}/a_{n}$, this is usually the first test to try on them.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{n}{2^n}$ converging to $2$.',
          sequence: 'geometric-half',
          term: (n) => n / 2 ** n,
          mode: 'partial-sums',
          limit: 2,
        },
        interactiveNote:
          'Drag the slider to add terms of $\\sum \\dfrac{n}{2^n}$ and watch the partial sums close in on the dashed line at $2$; the total stops growing because the term-to-term ratio settles below $1$, which is the $L < 1$ verdict of the ratio test.',
      },
      {
        id: 'ratio-apply',
        type: 'multiple-choice',
        title: 'Apply the ratio test',
        prompt: 'For $\\sum_{n=1}^{\\infty} \\dfrac{1}{n!}$, what is the ratio-test limit $L$?',
        options: [
          { id: 'zero', label: '$0$, so the series converges' },
          { id: 'one', label: '$1$, so the test is inconclusive' },
          { id: 'infinity', label: '$\\infty$, so the series diverges' },
          { id: 'half', label: '$\\tfrac{1}{2}$' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. $$\\dfrac{a_{n+1}}{a_{n}} = \\dfrac{n!}{(n+1)!} = \\dfrac{1}{n+1} \\to 0 < 1$$ So the series converges.',
        incorrectExplanation:
          'Form the ratio of consecutive terms. The factorial cancels to $\\dfrac{1}{n+1}$, which tends to $0$.',
        hint: 'Simplify $\\dfrac{n!}{(n+1)!}$ before taking the limit.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{1}{n!}$ approaching $e - 1$.',
          sequence: 'one-over-factorial',
          mode: 'partial-sums',
          limit: 1.71828,
        },
      },
      {
        id: 'ratio-compute',
        type: 'multiple-choice',
        title: 'A ratio-test computation',
        prompt: 'Applying the ratio test to $\\sum_{n=1}^{\\infty} \\dfrac{n}{2^{n}}$ gives $L =$',
        options: [
          { id: 'half', label: '$\\tfrac{1}{2}$, so it converges' },
          { id: 'two', label: '$2$, so it diverges' },
          { id: 'one', label: '$1$, so it is inconclusive' },
          { id: 'zero', label: '$0$' },
        ],
        correctOptionId: 'half',
        correctExplanation:
          'Correct. $$\\dfrac{a_{n+1}}{a_{n}} = \\dfrac{n+1}{2n} \\to \\dfrac{1}{2} < 1$$ So the series converges.',
        incorrectExplanation:
          'The ratio is $\\dfrac{n+1}{2n}$, whose limit is $\\tfrac{1}{2}$ — below $1$, so it converges.',
        hint: 'Compute $\\dfrac{(n+1)/2^{n+1}}{n/2^{n}}$ and simplify the powers of $2$.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{n}{2^n}$ converging to $2$.',
          sequence: 'geometric-half',
          term: (n) => n / 2 ** n,
          mode: 'partial-sums',
          limit: 2,
        },
      },
      {
        id: 'root-test',
        type: 'multiple-choice',
        title: 'The root test',
        prompt:
          'The root test examines $$L = \\lim_{n \\to \\infty} \\sqrt[n]{|a_{n}|}$$ It is especially handy when each term contains',
        options: [
          { id: 'nth-powers', label: 'an $n$-th power, like $\\left(\\tfrac{n}{2n+1}\\right)^{n}$' },
          { id: 'logs', label: 'only logarithms' },
          { id: 'constants', label: 'only constants' },
          { id: 'linear', label: 'only linear terms' },
        ],
        correctOptionId: 'nth-powers',
        correctExplanation:
          'Correct. Taking an $n$-th root cancels an $n$-th power cleanly, which is exactly the root test\u2019s strength.',
        incorrectExplanation:
          'The root test shines when each term is raised to the $n$-th power, since the root undoes it.',
        hint: 'Which structure does an $n$-th root simplify perfectly?',
        visual: {
          type: 'sequence-plot',
          label: 'Terms of $\\left(\\tfrac{n}{2n+1}\\right)^{n}$ shrinking toward $0$.',
          sequence: 'geometric-half',
          term: (n) => (n / (2 * n + 1)) ** n,
          mode: 'terms',
          maxCount: 10,
        },
      },
      {
        id: 'ratio-inconclusive',
        type: 'multiple-choice',
        title: 'When the ratio test fails',
        prompt: 'Both the ratio and root tests give no information when $L$ equals',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'zero', label: '$0$' },
          { id: 'less-one', label: 'anything less than $1$' },
          { id: 'greater-one', label: 'anything greater than $1$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. At $L = 1$ neither test decides convergence — for example, both $\\sum \\tfrac{1}{n}$ and $\\sum \\tfrac{1}{n^2}$ give $L = 1$ yet behave differently.',
        incorrectExplanation:
          'The borderline value $L = 1$ is where these tests stop working and another method is needed.',
        hint: 'It is the boundary value where the tests cannot tell convergent from divergent.',
        visual: {
          type: 'sequence-plot',
          label: 'Both $\\sum \\tfrac{1}{n}$ and $\\sum \\tfrac{1}{n^2}$ give ratio limit $1$.',
          sequence: 'one-over-n-squared',
          mode: 'partial-sums',
          limit: 1.6449,
        },
      },
    ],
  },

  // 5. Alternating Series and Absolute Convergence
  {
    id: 'ss-alternating-series',
    chapterId: 'sequences-and-series',
    title: 'Alternating Series and Absolute Convergence',
    description:
      'Series with alternating signs, the alternating series test, the remainder estimate, and absolute vs conditional convergence.',
    status: 'available',
    estimatedMinutes: 10,
    steps: [
      {
        id: 'alternating-test',
        type: 'concept',
        title: 'The alternating series test',
        body: 'An alternating series $\\sum (-1)^{n} b_{n}$ with $b_{n} > 0$ converges whenever the sizes $b_{n}$ decrease monotonically to $0$. The constant tug-of-war between positive and negative terms makes convergence far easier than for a series of positive terms.',
        visual: {
          type: 'sequence-plot',
          label: 'Alternating terms $\\dfrac{(-1)^{n+1}}{n}$ shrinking toward $0$.',
          sequence: 'alternating-harmonic',
          mode: 'terms',
          limit: 0,
        },
        interactiveNote:
          'Drag the slider to reveal more terms and watch them flip above and below the axis while their sizes squeeze toward the dashed line at $0$ — that steady shrink of $b_{n}$ to zero is the one thing the alternating series test asks for.',
      },
      {
        id: 'alternating-harmonic',
        type: 'multiple-choice',
        title: 'The alternating harmonic series',
        prompt:
          'Does $\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1}}{n} = 1 - \\tfrac{1}{2} + \\tfrac{1}{3} - \\cdots$ converge?',
        options: [
          { id: 'yes', label: 'Yes, by the alternating series test' },
          { id: 'no', label: 'No, because the harmonic series diverges' },
          { id: 'only-abs', label: 'Only if you take absolute values first' },
          { id: 'unknown', label: 'It cannot be determined' },
        ],
        correctOptionId: 'yes',
        correctExplanation:
          'Correct. The sizes $\\tfrac{1}{n}$ decrease to $0$, so the alternating series test gives convergence (the sum is $\\ln 2$).',
        incorrectExplanation:
          'Even though the plain harmonic series diverges, the alternating signs let this version converge.',
        hint: 'Check whether the term sizes decrease steadily to $0$.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $1 - \\tfrac{1}{2} + \\tfrac{1}{3} - \\cdots$ settling near $\\ln 2$.',
          sequence: 'alternating-harmonic',
          mode: 'partial-sums',
          limit: 0.6931,
        },
      },
      {
        id: 'alternating-remainder',
        type: 'multiple-choice',
        title: 'The remainder estimate',
        prompt:
          'For a convergent alternating series, the error after summing the first $N$ terms is at most',
        options: [
          { id: 'first-omitted', label: 'the size of the first omitted term, $b_{N+1}$' },
          { id: 'last-included', label: 'the size of the last included term, $b_{N}$' },
          { id: 'sum-rest', label: 'the sum of all omitted terms' },
          { id: 'zero', label: 'exactly zero' },
        ],
        correctOptionId: 'first-omitted',
        correctExplanation:
          'Correct. The remainder satisfies $$|S - S_{N}| \\le b_{N+1}$$ — the very next term bounds the error.',
        incorrectExplanation:
          'The alternating series estimate bounds the error by the first term you left out, $b_{N+1}$.',
        hint: 'The cancellation means the leftover is no bigger than the next single term.',
        visual: {
          type: 'sequence-plot',
          label: 'Partial sums of $\\sum \\dfrac{(-1)^{n+1}}{n}$ bracketing $\\ln 2$.',
          sequence: 'alternating-harmonic',
          mode: 'partial-sums',
          limit: 0.6931,
        },
      },
      {
        id: 'absolute-convergence',
        type: 'multiple-choice',
        title: 'Conditional vs absolute',
        prompt: 'A series that converges but whose absolute values diverge is called',
        options: [
          { id: 'conditional', label: 'conditionally convergent' },
          { id: 'absolute', label: 'absolutely convergent' },
          { id: 'divergent', label: 'divergent' },
          { id: 'geometric', label: 'geometric' },
        ],
        correctOptionId: 'conditional',
        correctExplanation:
          'Correct. The alternating harmonic series is the classic example: it converges, yet $\\sum \\tfrac{1}{n}$ diverges.',
        incorrectExplanation:
          'Absolute convergence means the absolute-value series also converges. When only the signed series converges, it is conditional.',
        hint: 'It converges only thanks to the sign changes.',
        visual: {
          type: 'sequence-plot',
          label: 'Absolute values $\\sum \\dfrac{1}{n}$ growing without bound.',
          sequence: 'one-over-n',
          mode: 'partial-sums',
          maxCount: 30,
        },
      },
    ],
  },

  // 6. Power Series
  {
    id: 'ss-power-series',
    chapterId: 'sequences-and-series',
    title: 'Power Series',
    description:
      'Series in powers of x that define functions, with their radius and interval of convergence found by the ratio test.',
    status: 'available',
    estimatedMinutes: 11,
    steps: [
      {
        id: 'power-series-idea',
        type: 'concept',
        title: 'A series that depends on x',
        body: 'A power series centered at $c$ is $$\\sum_{n=0}^{\\infty} a_{n}(x - c)^{n}$$ For each $x$ where it converges, the sum defines a function of $x$. The simplest example is the geometric series $\\sum_{n=0}^{\\infty} x^{n}$, which converges to $\\dfrac{1}{1 - x}$ exactly when $|x| < 1$. Drag the test point across the number line to see where it converges.',
        visual: {
          type: 'interval-of-convergence',
          label: 'Convergence of $\\sum x^{n}$ on $(-1, 1)$.',
          center: 0,
          radius: 1,
          includeLeft: false,
          includeRight: false,
          showTestPoint: true,
          initialTestX: 0.5,
        },
        interactiveNote:
          'Drag the test point across an endpoint and watch the readout flip from converges to diverges the moment $x$ leaves $(-1, 1)$ — the open dots at $\\pm 1$ mark exactly where $\\sum x^{n}$ stops defining a value.',
      },
      {
        id: 'radius-interval',
        type: 'concept',
        title: 'Radius and interval of convergence',
        body: 'Every power series converges on an interval centered at $c$: either only at $x = c$, on $(c - R, c + R)$ for some radius $R > 0$, or for all $x$. The usual method applies the ratio test to $|a_{n}(x-c)^{n}|$ to get $R = \\dfrac{1}{L}$ where $$L = \\lim \\left|\\dfrac{a_{n+1}}{a_{n}}\\right|$$ The two endpoints must always be checked separately. For example, $\\sum_{n=1}^{\\infty} \\dfrac{x^{n}}{n}$ has radius $1$ and interval $[-1, 1)$.',
        visual: {
          type: 'interval-of-convergence',
          label: 'Interval of $\\sum \\dfrac{x^{n}}{n}$: included at $-1$, excluded at $1$.',
          center: 0,
          radius: 1,
          includeLeft: true,
          includeRight: false,
          showTestPoint: true,
          initialTestX: -1,
        },
        interactiveNote:
          'Drag the test point onto each endpoint: the filled dot at $x = -1$ still reads converges while the open dot at $x = 1$ reads diverges, showing why the two ends of $[-1, 1)$ have to be tested separately.',
      },
      {
        id: 'radius-exp',
        type: 'multiple-choice',
        title: 'An infinite radius',
        prompt: 'What is the radius of convergence of $\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$?',
        options: [
          { id: 'infinite', label: '$R = \\infty$ (converges for all $x$)' },
          { id: 'one', label: '$R = 1$' },
          { id: 'zero', label: '$R = 0$' },
          { id: 'half', label: '$R = \\tfrac{1}{2}$' },
        ],
        correctOptionId: 'infinite',
        correctExplanation:
          'Correct. The ratio is $\\left|\\dfrac{x}{n+1}\\right| \\to 0$ for every $x$, so $L = 0$ and $R = \\infty$.',
        incorrectExplanation:
          'The factorial makes the ratio $\\dfrac{|x|}{n+1} \\to 0$ for all $x$, so the series converges everywhere.',
        hint: 'Form $\\left|\\dfrac{a_{n+1}}{a_{n}}\\right|$; the factorial drives it to $0$.',
        visual: {
          type: 'interval-of-convergence',
          label: 'The series $\\sum \\dfrac{x^{n}}{n!}$ converges on all of $(-\\infty, \\infty)$.',
          center: 0,
          radius: 1,
          allReals: true,
        },
      },
      {
        id: 'radius-geometric',
        type: 'multiple-choice',
        title: 'Find the radius',
        prompt: 'What is the radius of convergence of $\\sum_{n=0}^{\\infty} 2^{n} x^{n}$?',
        options: [
          { id: 'half', label: '$R = \\tfrac{1}{2}$' },
          { id: 'two', label: '$R = 2$' },
          { id: 'one', label: '$R = 1$' },
          { id: 'infinite', label: '$R = \\infty$' },
        ],
        correctOptionId: 'half',
        correctExplanation:
          'Correct. This is geometric with ratio $2x$; it converges when $|2x| < 1$, i.e. $|x| < \\tfrac{1}{2}$, so $R = \\tfrac{1}{2}$.',
        incorrectExplanation:
          'Treat it as a geometric series with ratio $2x$. Convergence needs $|2x| < 1$, giving $R = \\tfrac{1}{2}$.',
        hint: 'Write the terms as $(2x)^{n}$ and require the geometric ratio to be under $1$ in size.',
        visual: {
          type: 'interval-of-convergence',
          label: 'The series $\\sum 2^{n} x^{n}$ converges on $\\left(-\\tfrac{1}{2}, \\tfrac{1}{2}\\right)$.',
          center: 0,
          radius: 0.5,
          includeLeft: false,
          includeRight: false,
          showTestPoint: true,
          initialTestX: 0.25,
        },
      },
      {
        id: 'interval-centered',
        type: 'multiple-choice',
        title: 'A centered power series',
        prompt:
          'On what open interval does $\\sum_{n=0}^{\\infty} \\dfrac{(x - 3)^{n}}{2^{n}}$ converge?',
        options: [
          { id: 'one-five', label: '$(1, 5)$' },
          { id: 'two-four', label: '$(2, 4)$' },
          { id: 'minus-one-one', label: '$(-1, 1)$' },
          { id: 'all', label: 'all real $x$' },
        ],
        correctOptionId: 'one-five',
        correctExplanation:
          'Correct. The ratio is $\\dfrac{|x-3|}{2}$, so it converges when $|x - 3| < 2$: the interval $(3 - 2,\\, 3 + 2) = (1, 5)$.',
        incorrectExplanation:
          'It is geometric with ratio $\\dfrac{x-3}{2}$. Convergence requires $|x-3| < 2$, centered at $3$ with radius $2$.',
        hint: 'The series is centered at $x = 3$ with radius $R = 2$; the open interval is $(c - R, c + R)$.',
        visual: {
          type: 'interval-of-convergence',
          label: 'The series $\\sum \\dfrac{(x-3)^{n}}{2^{n}}$ converges on $(1, 5)$, centered at $3$.',
          center: 3,
          radius: 2,
          includeLeft: false,
          includeRight: false,
          showTestPoint: true,
          initialTestX: 4,
          lineMin: 0,
          lineMax: 6,
        },
      },
    ],
  },

  // 7. Taylor Polynomials
  {
    id: 'ss-taylor-polynomials',
    chapterId: 'sequences-and-series',
    title: 'Taylor Polynomials',
    description:
      'Polynomials that match a function and its derivatives at a point, plus the error bound from Taylor\u2019s theorem.',
    status: 'available',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'taylor-idea',
        type: 'concept',
        title: 'Matching more than the slope',
        body: 'The tangent line matches a function\u2019s value and slope at $x = c$, but nothing more. By using higher-degree polynomials we can also match the second derivative, the third, and beyond — and each extra match widens the interval where the polynomial hugs the curve. Raise the degree slider and watch the dashed polynomial cling to the curve over a larger range.',
        visual: {
          type: 'taylor-approximation',
          label: 'Polynomial approximations to $e^{x}$ improving with degree.',
          func: 'exp',
          center: 0,
          degree: 1,
          maxDegree: 6,
        },
        interactiveNote:
          'Drag the degree slider up from $1$ and watch the dashed polynomial cling to $e^{x}$ over a widening stretch while the error $|f - P|$ readout shrinks — each extra degree matches one more derivative and buys a wider fit.',
      },
      {
        id: 'taylor-formula',
        type: 'concept',
        title: 'The Taylor polynomial formula',
        body: 'The Taylor polynomial of degree $n$ for $f$ centered at $c$ is $$p_{n}(x) = \\sum_{k=0}^{n} \\dfrac{f^{(k)}(c)}{k!}(x - c)^{k}$$ Each coefficient $\\dfrac{f^{(k)}(c)}{k!}$ is built to force $p_{n}$ to share the value and first $n$ derivatives of $f$ at $c$. When the center is $c = 0$ it is also called a Maclaurin polynomial.',
        visual: {
          type: 'taylor-approximation',
          label: 'Maclaurin polynomials of $\\sin x$ (only odd powers appear).',
          func: 'sin',
          center: 0,
          degree: 1,
          maxDegree: 9,
        },
        interactiveNote:
          'Drag the degree slider and notice the dashed approximation only sharpens at the odd degrees and the error readout drops there — a live sign that the coefficients $\\dfrac{f^{(k)}(0)}{k!}$ vanish for every even power of $\\sin x$.',
      },
      {
        id: 'maclaurin-exp',
        type: 'multiple-choice',
        title: 'Maclaurin polynomial of e^x',
        prompt: 'What is the degree-$n$ Maclaurin polynomial of $f(x) = e^{x}$?',
        options: [
          {
            id: 'correct',
            label: '$1 + x + \\dfrac{x^{2}}{2!} + \\dfrac{x^{3}}{3!} + \\cdots + \\dfrac{x^{n}}{n!}$',
          },
          {
            id: 'alt-signs',
            label: '$1 - x + \\dfrac{x^{2}}{2!} - \\cdots + \\dfrac{(-1)^{n} x^{n}}{n!}$',
          },
          {
            id: 'no-factorial',
            label: '$1 + x + x^{2} + x^{3} + \\cdots + x^{n}$',
          },
          {
            id: 'odd-only',
            label: '$x + \\dfrac{x^{3}}{3!} + \\dfrac{x^{5}}{5!} + \\cdots$',
          },
        ],
        correctOptionId: 'correct',
        correctExplanation:
          'Correct. Every derivative of $e^{x}$ is $e^{x}$, so $f^{(k)}(0) = 1$ and the coefficient of $x^{k}$ is $\\dfrac{1}{k!}$.',
        incorrectExplanation:
          'Since $f^{(k)}(0) = 1$ for $e^{x}$, the coefficient of $x^{k}$ is $\\dfrac{1}{k!}$ with all plus signs.',
        hint: 'Every derivative of $e^{x}$ equals $e^{x}$, so each $f^{(k)}(0) = 1$.',
        visual: {
          type: 'taylor-approximation',
          label: 'Degree-3 Maclaurin polynomial of $e^{x}$.',
          func: 'exp',
          center: 0,
          degree: 3,
          maxDegree: 6,
        },
      },
      {
        id: 'maclaurin-cos',
        type: 'multiple-choice',
        title: 'Degree-2 approximation of cosine',
        prompt: 'What is the degree-$2$ Maclaurin polynomial of $f(x) = \\cos x$?',
        options: [
          { id: 'correct', label: '$1 - \\dfrac{x^{2}}{2}$' },
          { id: 'plus', label: '$1 + \\dfrac{x^{2}}{2}$' },
          { id: 'linear', label: '$1 - x$' },
          { id: 'sine-like', label: '$x - \\dfrac{x^{2}}{2}$' },
        ],
        correctOptionId: 'correct',
        correctExplanation:
          'Correct. With $f(0) = 1$, $f\'(0) = 0$, and $f\'\'(0) = -1$, the polynomial is $$1 + 0\\cdot x - \\dfrac{1}{2}x^{2}$$',
        incorrectExplanation:
          'Use $f(0)=1$, $f\'(0)=0$, $f\'\'(0)=-1$. The quadratic coefficient is $$\\dfrac{f\'\'(0)}{2!} = -\\dfrac{1}{2}$$',
        hint: 'You need $\\cos 0$, $-\\sin 0$, and $-\\cos 0$ for the value and first two derivatives.',
        visual: {
          type: 'taylor-approximation',
          label: 'Degree-2 Maclaurin polynomial $1 - \\tfrac{x^2}{2}$ of $\\cos x$.',
          func: 'cos',
          center: 0,
          degree: 2,
          maxDegree: 8,
        },
      },
      {
        id: 'taylor-remainder',
        type: 'multiple-choice',
        title: 'How large is the error?',
        prompt:
          'Taylor\u2019s theorem bounds the error $|R_{n}(x)|$ of a degree-$n$ approximation centered at $c$ by',
        options: [
          {
            id: 'correct',
            label: '$\\dfrac{\\max |f^{(n+1)}(z)|}{(n+1)!}\\,|x - c|^{\\,n+1}$',
          },
          {
            id: 'no-factorial',
            label: '$\\max |f^{(n+1)}(z)|\\cdot |x - c|^{\\,n+1}$',
          },
          { id: 'nth', label: '$\\dfrac{f^{(n)}(c)}{n!}\\,(x - c)^{n}$' },
          { id: 'constant', label: 'a constant that does not depend on $x$' },
        ],
        correctOptionId: 'correct',
        correctExplanation:
          'Correct. The remainder is controlled by the size of the next derivative: $$\\dfrac{\\max |f^{(n+1)}(z)|}{(n+1)!}|x - c|^{n+1}$$',
        incorrectExplanation:
          'The bound has the next derivative on top and $(n+1)!$ on the bottom, times $|x-c|^{n+1}$.',
        hint: 'The error grows with $|x - c|^{n+1}$ but the $(n+1)!$ in the denominator tames it.',
        visual: {
          type: 'taylor-approximation',
          label: 'The gap between $e^{x}$ and its degree-4 polynomial is the remainder.',
          func: 'exp',
          center: 0,
          degree: 4,
          maxDegree: 8,
        },
      },
    ],
  },

  // 8. Taylor Series
  {
    id: 'ss-taylor-series',
    chapterId: 'sequences-and-series',
    title: 'Taylor Series',
    description:
      'Representing a function exactly as an infinite series, the common Maclaurin series, and when equality holds.',
    status: 'available',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'taylor-series-idea',
        type: 'concept',
        title: 'From polynomial to series',
        body: 'Letting the degree grow without bound turns a Taylor polynomial into the Taylor series $$\\sum_{n=0}^{\\infty} \\dfrac{f^{(n)}(c)}{n!}(x - c)^{n}$$ (a Maclaurin series when $c = 0$). The function equals its series on an interval exactly when the remainder $R_{n}(x) \\to 0$ there; functions for which this happens are called analytic, and nearly every elementary function is.',
        visual: {
          type: 'taylor-approximation',
          label: 'Higher-degree Maclaurin polynomials of $e^{x}$ approaching the series.',
          func: 'exp',
          center: 0,
          degree: 2,
          maxDegree: 8,
        },
        interactiveNote:
          'Drag the degree slider toward its max and watch the dashed polynomial overlap $e^{x}$ across the whole window as the error readout falls toward $0$ — that vanishing remainder $R_{n} \\to 0$ is what lets the infinite series equal the function.',
      },
      {
        id: 'common-series',
        type: 'concept',
        title: 'Series worth memorizing',
        body: 'A few Maclaurin series come up constantly: $e^{x} = \\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$, $\\sin x = \\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{(2n+1)!}$, and $\\cos x = \\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$, all valid for every real $x$. Also useful are $\\dfrac{1}{1 - x} = \\sum_{n=0}^{\\infty} x^{n}$ on $(-1, 1)$ and $\\arctan x = \\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{2n+1}$ on $[-1, 1]$.',
        visual: {
          type: 'taylor-approximation',
          label: 'The Maclaurin series of $\\cos x$ keeps only even powers.',
          func: 'cos',
          center: 0,
          degree: 2,
          maxDegree: 8,
        },
        interactiveNote:
          'Drag the degree slider and watch the dashed curve tighten onto $\\cos x$ only at the even degrees, mirroring the memorized series $\\cos x = \\sum \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$ that carries even powers alone.',
      },
      {
        id: 'cos-series',
        type: 'multiple-choice',
        title: 'The series for cosine',
        prompt: 'Which series is the Maclaurin series of $\\cos x$?',
        options: [
          { id: 'correct', label: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n}}{(2n)!}$' },
          { id: 'sine', label: '$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{(2n+1)!}$' },
          { id: 'exp', label: '$\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$' },
          { id: 'geometric', label: '$\\sum_{n=0}^{\\infty} x^{n}$' },
        ],
        correctOptionId: 'correct',
        correctExplanation:
          'Correct. Cosine keeps only even powers with alternating signs: $$1 - \\dfrac{x^{2}}{2!} + \\dfrac{x^{4}}{4!} - \\cdots$$',
        incorrectExplanation:
          'Cosine is even, so only even powers $x^{2n}$ survive, with alternating signs and $(2n)!$ in the denominator.',
        hint: 'Cosine is an even function, so its series should contain only even powers of $x$.',
        visual: {
          type: 'taylor-approximation',
          label: 'Degree-4 Maclaurin polynomial of $\\cos x$.',
          func: 'cos',
          center: 0,
          degree: 4,
          maxDegree: 8,
        },
      },
      {
        id: 'exp-series',
        type: 'multiple-choice',
        title: 'Where does the e^x series converge?',
        prompt: 'On what interval does the Maclaurin series $\\sum_{n=0}^{\\infty} \\dfrac{x^{n}}{n!}$ equal $e^{x}$?',
        options: [
          { id: 'all', label: 'all real numbers, $(-\\infty, \\infty)$' },
          { id: 'open-one', label: 'only $(-1, 1)$' },
          { id: 'half', label: 'only $[0, \\infty)$' },
          { id: 'point', label: 'only at $x = 0$' },
        ],
        correctOptionId: 'all',
        correctExplanation:
          'Correct. The radius of convergence is infinite and the remainder tends to $0$ everywhere, so equality holds for all $x$.',
        incorrectExplanation:
          'The factorial denominators make this series converge to $e^{x}$ for every real $x$.',
        hint: 'How fast do the factorials in the denominators grow compared with the powers of $x$?',
        visual: {
          type: 'taylor-approximation',
          label: 'Degree-4 Maclaurin polynomial of $e^{x}$.',
          func: 'exp',
          center: 0,
          degree: 4,
          maxDegree: 8,
        },
      },
      {
        id: 'arctan-series',
        type: 'multiple-choice',
        title: 'Identify the function',
        prompt:
          'The series $x - \\dfrac{x^{3}}{3} + \\dfrac{x^{5}}{5} - \\dfrac{x^{7}}{7} + \\cdots$ represents which function?',
        options: [
          { id: 'arctan', label: '$\\arctan x$' },
          { id: 'sin', label: '$\\sin x$' },
          { id: 'ln', label: '$\\ln(1 + x)$' },
          { id: 'exp', label: '$e^{x}$' },
        ],
        correctOptionId: 'arctan',
        correctExplanation:
          'Correct. This is the Maclaurin series of $\\arctan x$: $$\\sum_{n=0}^{\\infty} \\dfrac{(-1)^{n} x^{2n+1}}{2n+1}$$ At $x = 1$ it gives $\\tfrac{\\pi}{4}$.',
        incorrectExplanation:
          'The odd-power terms have plain odd denominators $2n+1$ (not factorials), which identifies $\\arctan x$.',
        hint: 'The denominators are the odd numbers themselves, not odd factorials.',
        visual: {
          type: 'taylor-approximation',
          label: 'Maclaurin polynomial of $\\arctan x$, accurate on $(-1, 1)$.',
          func: 'arctan',
          center: 0,
          degree: 5,
          maxDegree: 9,
          xMin: -2,
          xMax: 2,
        },
      },
    ],
  },
];
