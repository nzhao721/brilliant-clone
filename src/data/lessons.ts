export type LessonStatus = 'available' | 'locked' | 'complete';

type LessonOption = {
  id: string;
  label: string;
};

export type InteractiveVisual =
  | {
      type: 'function-cursor';
      label: string;
      initialX: number;
      curveShape?: FunctionCurveShape;
    }
  | {
      type: 'linear-cursor';
      label: string;
      initialX: number;
      slope: number;
      yIntercept?: number;
    }
  | {
      type: 'rate-window';
      label: string;
      initialStartX: number;
      initialEndX: number;
    }
  | {
      type: 'slope-triangle';
      label: string;
      initialStartX?: number;
      initialStartY?: number;
      initialRise: number;
      initialRun: number;
    }
  | {
      type: 'tangent-cursor';
      label: string;
      initialX: number;
      curveShape?: FunctionCurveShape;
    }
  | {
      type: 'function-derivative-overlay';
      label: string;
      curveShape?: 'valley' | 'peak';
    }
  | {
      type: 'nonsmooth-example';
      label: string;
      shape: 'corner' | 'cusp' | 'jump' | 'hole' | 'vertical-tangent';
    };

export type FunctionCurveShape = 'valley' | 'peak' | 'quadratic' | 'cubic' | 'quartic' | 'linear' | 'constant';

export type LessonStep =
  | {
      id: string;
      type: 'concept';
      title: string;
      body: string;
      visual?: InteractiveVisual;
    }
  | {
      id: string;
      type: 'multiple-choice';
      title: string;
      prompt: string;
      options: LessonOption[];
      correctOptionId: string;
      correctExplanation: string;
      incorrectExplanation: string;
      hint?: string;
      visual?: InteractiveVisual;
    };

export type Lesson = {
  id: string;
  title: string;
  description: string;
  status: LessonStatus;
  estimatedMinutes: number;
  steps: LessonStep[];
};

export const lessons: Lesson[] = [
  {
    id: 'what-changes',
    title: 'What Changes?',
    description: 'Review functions and notice how outputs change when inputs move.',
    status: 'available',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'functions-change',
        type: 'concept',
        title: 'Functions describe change',
        body:
          'A function connects an input to an output. Calculus starts by asking how much the output changes when the input moves.',
        visual: {
          type: 'function-cursor',
          label: 'Drag the $x$ cursor to watch $f(x)$ move on the curve.',
          initialX: 2,
        },
      },
      {
        id: 'table-change',
        type: 'multiple-choice',
        title: 'Spot the change',
        prompt:
          'If $x$ increases from $2$ to $3$ and the output increases from $5$ to $9$, how much did the output change?',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'four', label: '$4$' },
          { id: 'five', label: '$5$' },
          { id: 'nine', label: '$9$' },
        ],
        correctOptionId: 'four',
        correctExplanation: 'Correct. The output changed by $9 - 5 = 4$.',
        incorrectExplanation:
          'Not quite. Compare the ending output to the starting output, not the input values.',
        hint: 'Look only at the two output values.',
        visual: {
          type: 'slope-triangle',
          label: 'Compare the two points and watch the rise and run.',
          initialStartX: 1,
          initialStartY: 2,
          initialRun: 2,
          initialRise: 3,
        },
      },
      {
        id: 'rate-preview',
        type: 'concept',
        title: 'Change becomes rate',
        body:
          'Once you know the output change, the next question is how quickly it changed compared with the input. That idea leads to rate of change.',
        visual: {
          type: 'rate-window',
          label: 'Adjust the interval to see output change divided by input change.',
          initialStartX: 1,
          initialEndX: 4,
        },
      },
      {
        id: 'input-change',
        type: 'multiple-choice',
        title: 'Find the input change',
        prompt: 'If $x$ moves from $1$ to $4$, what is the input change?',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'two', label: '$2$' },
          { id: 'three', label: '$3$' },
          { id: 'four', label: '$4$' },
        ],
        correctOptionId: 'three',
        correctExplanation: 'Correct. The input change is $4 - 1 = 3$.',
        incorrectExplanation: 'Not quite. Subtract the starting $x$-value from the ending $x$-value.',
        hint: 'Input change means ending $x$ minus starting $x$.',
        visual: {
          type: 'rate-window',
          label: 'Drag the endpoints and watch the horizontal input change.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'output-change',
        type: 'multiple-choice',
        title: 'Find the output change',
        prompt: 'If the output moves from $4$ to $10$, what is the output change?',
        options: [
          { id: 'four', label: '$4$' },
          { id: 'six', label: '$6$' },
          { id: 'ten', label: '$10$' },
          { id: 'fourteen', label: '$14$' },
        ],
        correctOptionId: 'six',
        correctExplanation: 'Correct. The output change is $10 - 4 = 6$.',
        incorrectExplanation: 'Not quite. Compare the ending output to the starting output.',
        hint: 'Use ending output minus starting output.',
        visual: {
          type: 'function-cursor',
          label: 'Drag $x$ and notice how the output value changes on the curve.',
          initialX: 3,
        },
      },
      {
        id: 'direction-of-change',
        type: 'multiple-choice',
        title: 'Direction of change',
        prompt: 'If the output changes from $4$ up to $6$, what kind of output change happened?',
        options: [
          { id: 'positive', label: 'Positive change' },
          { id: 'negative', label: 'Negative change' },
          { id: 'no-change', label: 'No change' },
          { id: 'input-only', label: 'Only the input changed' },
        ],
        correctOptionId: 'positive',
        correctExplanation: 'Correct. The output went up, so the change is positive.',
        incorrectExplanation: 'Not quite. Check whether the output goes up, down, or stays the same.',
        hint: 'Ask whether the output went up, down, or stayed flat.',
        visual: {
          type: 'linear-cursor',
          label: 'Drag $x$ across the line and watch the output rise from the origin.',
          initialX: 2,
          slope: 1,
        },
      },
      {
        id: 'average-change',
        type: 'multiple-choice',
        title: 'Compare change to input',
        prompt: 'If the output changes by $6$ while the input changes by $3$, what is the change per $1$ input?',
        options: [
          { id: 'two', label: '$2$' },
          { id: 'three', label: '$3$' },
          { id: 'six', label: '$6$' },
          { id: 'nine', label: '$9$' },
        ],
        correctOptionId: 'two',
        correctExplanation: 'Correct. $6$ divided by $3$ is $2$ per $1$ input.',
        incorrectExplanation: 'Not quite. Divide the output change by the input change.',
        hint: 'Rate means output change divided by input change.',
        visual: {
          type: 'rate-window',
          label: 'Adjust the interval and compare output change to input change.',
          initialStartX: 1,
          initialEndX: 3,
        },
      },
    ],
  },
  {
    id: 'slope-refresher',
    title: 'Slope Refresher',
    description: 'Connect derivative intuition to the slope skills you already know.',
    status: 'available',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'slope-meaning',
        type: 'concept',
        title: 'Slope measures steepness',
        body:
          'In algebra, slope tells you how much $y$ changes for each $1$-unit change in $x$. Derivatives reuse this idea on curves.',
        visual: {
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        },
      },
      {
        id: 'slope-question',
        type: 'multiple-choice',
        title: 'Calculate a familiar slope',
        prompt: 'A line goes through $(1, 2)$ and $(3, 8)$. What is its slope?',
        options: [
          { id: 'two', label: '$2$' },
          { id: 'three', label: '$3$' },
          { id: 'four', label: '$4$' },
          { id: 'six', label: '$6$' },
        ],
        correctOptionId: 'three',
        correctExplanation:
          'Correct. The rise is $8 - 2 = 6$ and the run is $3 - 1 = 2$, so the slope is $6 / 2 = 3$.',
        incorrectExplanation:
          'Not quite. Use rise over run: change in $y$ divided by change in $x$.',
        hint: 'Find the change in $y$, then divide by the change in $x$.',
        visual: {
          type: 'slope-triangle',
          label: 'The triangle shows rise over run. Match it to the two points in the question.',
          initialRise: 3,
          initialRun: 2,
        },
      },
      {
        id: 'slope-to-derivatives',
        type: 'concept',
        title: 'Why this matters',
        body:
          'For a straight line, the slope is the same everywhere. For a curve, the steepness can change from point to point. Derivatives help describe that changing slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag along the curve to see the tangent slope change from point to point.',
          initialX: 1,
        },
      },
      {
        id: 'slope-rise-run',
        type: 'multiple-choice',
        title: 'Rise over run',
        prompt: 'A line has rise $4$ and run $2$. What is its slope?',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'two', label: '$2$' },
          { id: 'four', label: '$4$' },
          { id: 'six', label: '$6$' },
        ],
        correctOptionId: 'two',
        correctExplanation: 'Correct. Slope is rise divided by run: $4 / 2 = 2$.',
        incorrectExplanation: 'Not quite. Divide the rise by the run.',
        hint: 'Slope = rise divided by run.',
        visual: {
          type: 'slope-triangle',
          label: 'Drag the triangle endpoint to compare rise and run.',
          initialRise: 3,
          initialRun: 2,
        },
      },
      {
        id: 'flat-slope',
        type: 'multiple-choice',
        title: 'Flat line slope',
        prompt: 'What is the slope of a horizontal line?',
        options: [
          { id: 'negative-one', label: '$-1$' },
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation: 'Correct. A horizontal line has no rise, so its slope is $0$.',
        incorrectExplanation: 'Not quite. Think about how much the $y$-value changes on a horizontal line.',
        hint: 'Horizontal means the $y$-value does not change.',
        visual: {
          type: 'slope-triangle',
          label: 'Make the rise smaller and notice the slope approach $0$.',
          initialRise: 1,
          initialRun: 4,
        },
      },
      {
        id: 'negative-slope',
        type: 'multiple-choice',
        title: 'Negative slope intuition',
        prompt: 'If a graph goes down as $x$ moves right, what sign is its slope?',
        options: [
          { id: 'positive', label: 'Positive' },
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: 'Zero' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'negative',
        correctExplanation: 'Correct. Going down as $x$ increases means the slope is negative.',
        incorrectExplanation: 'Not quite. Think about whether $y$ increases or decreases as $x$ moves right.',
        hint: 'Think about whether $y$ is increasing or decreasing as $x$ increases.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag to places where the tangent tilts downward.',
          initialX: 4,
        },
      },
      {
        id: 'steeper-line',
        type: 'multiple-choice',
        title: 'Which line is steeper?',
        prompt: 'Which slope is steeper: $2$ or $5$?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'two', label: '$2$' },
          { id: 'five', label: '$5$' },
          { id: 'same', label: 'They are equally steep' },
        ],
        correctOptionId: 'five',
        correctExplanation: 'Correct. A larger slope means more rise for each $1$ unit of run.',
        incorrectExplanation: 'Not quite. Compare how much each line rises for one step to the right.',
        hint: 'Compare how much $y$ changes for each $1$ step in $x$.',
        visual: {
          type: 'slope-triangle',
          label: 'Increase rise relative to run to make a line steeper.',
          initialRise: 2,
          initialRun: 1,
        },
      },
    ],
  },
  {
    id: 'average-rate-of-change',
    title: 'Average Rate of Change',
    description: 'Preview how a curve can have an overall slope between two points.',
    status: 'locked',
    estimatedMinutes: 6,
    steps: [
      {
        id: 'average-rate-idea',
        type: 'concept',
        title: 'Average rate compares two points',
        body:
          'Average rate of change asks how much the output changed for each $1$-unit change in input over an interval.',
        visual: {
          type: 'rate-window',
          label: 'Drag the endpoints to see output change divided by input change.',
          initialStartX: 1,
          initialEndX: 4,
        },
      },
      {
        id: 'average-rate-calc',
        type: 'multiple-choice',
        title: 'Compute an average rate',
        prompt: 'If $f(x)$ changes from $2$ to $8$ while $x$ changes from $1$ to $4$, what is the average rate of change?',
        options: [
          { id: 'one', label: '$1$' },
          { id: 'two', label: '$2$' },
          { id: 'three', label: '$3$' },
          { id: 'six', label: '$6$' },
        ],
        correctOptionId: 'two',
        correctExplanation: 'Correct. The output change is $6$ and the input change is $3$, so $6 / 3 = 2$.',
        incorrectExplanation: 'Not quite. Divide output change by input change.',
        hint: 'Average rate = change in output divided by change in input.',
        visual: {
          type: 'slope-triangle',
          label: 'Match the rise and run to the two points in the question.',
          initialStartX: 1,
          initialStartY: 1,
          initialRun: 2,
          initialRise: 3,
        },
      },
      {
        id: 'average-rate-sign',
        type: 'multiple-choice',
        title: 'Rate can be negative',
        prompt: 'If output goes from $8$ down to $5$ while input increases by $3$, what sign is the average rate?',
        options: [
          { id: 'positive', label: 'Positive' },
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: 'Zero' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'negative',
        correctExplanation: 'Correct. The output change is negative, so the average rate is negative.',
        incorrectExplanation: 'Not quite. Think about whether the output rose or fell.',
        hint: 'A falling output gives a negative rise.',
        visual: {
          type: 'slope-triangle',
          label: 'Drag the endpoints to make rise negative while run stays positive.',
          initialStartX: 1,
          initialStartY: 4,
          initialRun: 3,
          initialRise: 2,
        },
      },
      {
        id: 'secant-line',
        type: 'concept',
        title: 'The connecting line is a secant',
        body:
          'On a curve, average rate is represented by the slope of the line connecting two points. That line is called a secant line.',
        visual: {
          type: 'rate-window',
          label: 'Move the two points and watch the secant line change.',
          initialStartX: 0.5,
          initialEndX: 5,
        },
      },
      {
        id: 'shorter-interval',
        type: 'multiple-choice',
        title: 'Shorter intervals feel more local',
        prompt: 'What happens when the two $x$-values get closer together on a curve?',
        options: [
          { id: 'local', label: 'The rate describes a smaller local interval' },
          { id: 'unrelated', label: 'The graph stops having slope' },
          { id: 'always-zero', label: 'The average rate becomes zero' },
          { id: 'more-global', label: 'The interval becomes more global' },
        ],
        correctOptionId: 'local',
        correctExplanation:
          'Correct. Closer points describe change over a smaller interval near one part of the curve.',
        incorrectExplanation: 'Not quite. The curve still has steepness; the interval is just smaller.',
        hint: 'Think about zooming in between two nearby points.',
        visual: {
          type: 'rate-window',
          label: 'Bring the endpoints closer and compare the average rate.',
          initialStartX: 1,
          initialEndX: 5,
        },
      },
      {
        id: 'rate-units',
        type: 'multiple-choice',
        title: 'Per $1$ input',
        prompt: 'An average rate of $4$ means the output changes by about how much for each $1$ input?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'four', label: '$4$' },
          { id: 'sixteen', label: '$16$' },
        ],
        correctOptionId: 'four',
        correctExplanation: 'Correct. A rate of $4$ means about $4$ output units per $1$ input unit.',
        incorrectExplanation: 'Not quite. The rate already tells you the change per $1$ input.',
        hint: 'Read “rate of $4$” as “$4$ for each $1$.”',
        visual: {
          type: 'slope-triangle',
          label: 'A rise of $4$ over a run of $1$ shows a rate of $4$.',
          initialStartX: 1,
          initialStartY: 1,
          initialRun: 2,
          initialRise: 3,
        },
      },
      {
        id: 'average-rate-summary',
        type: 'multiple-choice',
        title: 'Name the idea',
        prompt: 'Which phrase best describes average rate of change?',
        options: [
          { id: 'two-points', label: 'Slope between two points' },
          { id: 'one-point', label: 'Slope at exactly one point' },
          { id: 'one-value', label: 'A single output value' },
          { id: 'x-only', label: 'The input value alone' },
        ],
        correctOptionId: 'two-points',
        correctExplanation: 'Correct. Average rate of change is the slope between two points.',
        incorrectExplanation: 'Not quite. Average rate compares both input and output changes.',
        hint: 'Look for the idea that uses two points.',
        visual: {
          type: 'rate-window',
          label: 'The blue line shows the slope between two points.',
          initialStartX: 1,
          initialEndX: 5,
        },
      },
    ],
  },
  {
    id: 'zooming-in-on-curves',
    title: 'Zooming In on Curves',
    description: 'See how a curve can look almost linear near one point.',
    status: 'locked',
    estimatedMinutes: 6,
    steps: [
      {
        id: 'zoom-local-view',
        type: 'concept',
        title: 'Close up, curves look straighter',
        body:
          'If you zoom in near one point on a smooth curve, the curve starts to look almost like a line. That local line hints at the derivative.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag along the curve and notice the local direction.',
          initialX: 3,
        },
      },
      {
        id: 'nearby-points',
        type: 'multiple-choice',
        title: 'Nearby points',
        prompt: 'Why do we move points closer together when thinking about instant slope?',
        options: [
          { id: 'local', label: 'To focus on change near one point' },
          { id: 'larger-inputs', label: 'To make the input values larger' },
          { id: 'hide', label: 'To hide the $y$-values' },
          { id: 'remove', label: 'To remove the graph' },
        ],
        correctOptionId: 'local',
        correctExplanation: 'Correct. Closer points focus the rate of change near one point.',
        incorrectExplanation: 'Not quite. The goal is to describe change more locally.',
        hint: 'Think about zooming in.',
        visual: {
          type: 'rate-window',
          label: 'Bring the endpoints closer to make the secant more local.',
          initialStartX: 2,
          initialEndX: 4,
        },
      },
      {
        id: 'flat-bottom',
        type: 'multiple-choice',
        title: 'At the bottom',
        prompt: 'Near the bottom of this curve, what is the local slope closest to?',
        options: [
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: '$0$' },
          { id: 'positive', label: 'Positive' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation: 'Correct. Near the bottom, the tangent is almost horizontal, so the slope is near $0$.',
        incorrectExplanation: 'Not quite. Look at the tangent direction near the lowest point.',
        hint: 'A horizontal tangent has slope $0$.',
        visual: {
          type: 'tangent-cursor',
          label: 'Move near $x = 2$ and watch the local slope approach $0$.',
          initialX: 4,
        },
      },
      {
        id: 'local-line',
        type: 'concept',
        title: 'The local line changes',
        body:
          'Different points on the same curve can have different local slopes. That is why derivatives are functions, not just one number.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag the point and watch the tangent slope change.',
          initialX: 4,
        },
      },
      {
        id: 'left-side-slope',
        type: 'multiple-choice',
        title: 'Left side of the curve',
        prompt: 'On the left side of this curve near $x = 1$, what sign is the local slope?',
        options: [
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: 'Zero' },
          { id: 'positive', label: 'Positive' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'negative',
        correctExplanation: 'Correct. The curve falls as $x$ moves right near $x = 1$, so the local slope is negative.',
        incorrectExplanation: 'Not quite. Follow the curve as $x$ moves to the right from that point.',
        hint: 'Falling as $x$ increases means negative slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag near $x = 1$ and look at the tangent direction.',
          initialX: 4,
        },
      },
      {
        id: 'right-side-slope',
        type: 'multiple-choice',
        title: 'Right side of the curve',
        prompt: 'Near $x = 5$, the curve is rising as $x$ moves right. What sign is the local slope?',
        options: [
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: 'Zero' },
          { id: 'positive', label: 'Positive' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'positive',
        correctExplanation: 'Correct. Rising as $x$ increases means the local slope is positive.',
        incorrectExplanation: 'Not quite. Check whether the curve is going up or down as $x$ increases.',
        hint: 'Rising as $x$ increases means positive slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag near $x = 5$ and watch the tangent tilt upward.',
          initialX: 2,
        },
      },
      {
        id: 'zooming-summary',
        type: 'multiple-choice',
        title: 'What zooming helps with',
        prompt: 'Zooming in helps us estimate what kind of slope?',
        options: [
          { id: 'instant', label: 'Slope at one point' },
          { id: 'average-height', label: 'Average height over the graph' },
          { id: 'unrelated', label: 'A random slope' },
          { id: 'height', label: 'Only the $y$-intercept' },
        ],
        correctOptionId: 'instant',
        correctExplanation: 'Correct. Zooming in helps estimate the slope at one point.',
        incorrectExplanation: 'Not quite. Zooming in is about local behavior near one point.',
        hint: 'Think “local” or “instant.”',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent line represents local slope at the point.',
          initialX: 3,
        },
      },
    ],
  },
  {
    id: 'tangent-lines',
    title: 'Tangent Lines',
    description: 'Use a tangent line as the best local slope estimate.',
    status: 'locked',
    estimatedMinutes: 7,
    steps: [
      {
        id: 'tangent-intro',
        type: 'concept',
        title: 'A tangent matches local direction',
        body:
          'A tangent line is the line that best matches the curve right at one point. Its slope is the curve’s local slope there.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag the point and watch the tangent line follow local direction.',
          initialX: 3,
        },
      },
      {
        id: 'tangent-at-three',
        type: 'multiple-choice',
        title: 'Read a local slope',
        prompt: 'On this curve, the local slope near $x = 3$ is closest to which value?',
        options: [
          { id: 'negative-one', label: '$-1$' },
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'four', label: '$4$' },
        ],
        correctOptionId: 'one',
        correctExplanation: 'Correct. Near $x = 3$, the tangent slope is about $1$.',
        incorrectExplanation: 'Not quite. Use the tangent line direction at $x = 3$.',
        hint: 'A line rising $1$ for each $1$ right has slope $1$.',
        visual: {
          type: 'tangent-cursor',
          label: 'Place the point near $x = 3$ and read the local slope.',
          initialX: 5,
        },
      },
      {
        id: 'horizontal-tangent',
        type: 'multiple-choice',
        title: 'Horizontal tangent',
        prompt: 'What is the slope of a horizontal tangent line?',
        options: [
          { id: 'negative-one', label: '$-1$' },
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation: 'Correct. A horizontal line has slope $0$.',
        incorrectExplanation: 'Not quite. A horizontal line has no rise.',
        hint: 'Horizontal means rise is $0$.',
        visual: {
          type: 'tangent-cursor',
          label: 'Move to the bottom where the tangent is nearly horizontal.',
          initialX: 4,
        },
      },
      {
        id: 'tangent-vs-secant',
        type: 'concept',
        title: 'Tangent versus secant',
        body:
          'A secant line uses two points. A tangent line describes the slope right at one point.',
        visual: {
          type: 'rate-window',
          label: 'Move two endpoints together to make the secant approach a tangent idea.',
          initialStartX: 2,
          initialEndX: 4,
        },
      },
      {
        id: 'negative-tangent',
        type: 'multiple-choice',
        title: 'Downward tangent',
        prompt: 'If the tangent tilts downward as $x$ moves right, what sign is its slope?',
        options: [
          { id: 'positive', label: 'Positive' },
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: 'Zero' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'negative',
        correctExplanation: 'Correct. A downward tilt from left to right means negative slope.',
        incorrectExplanation: 'Not quite. Think about whether $y$ rises or falls as $x$ increases.',
        hint: 'Down as $x$ moves right means negative.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag to the left side where the tangent slopes downward.',
          initialX: 4,
        },
      },
      {
        id: 'steep-tangent',
        type: 'multiple-choice',
        title: 'Steeper tangent',
        prompt: 'Which tangent is steeper upward: local slope $1$ or local slope $3$?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'three', label: '$3$' },
          { id: 'same', label: 'They are equally steep' },
        ],
        correctOptionId: 'three',
        correctExplanation: 'Correct. A slope of $3$ rises faster than a slope of $1$.',
        incorrectExplanation: 'Not quite. Larger positive slope means a steeper upward line.',
        hint: 'Compare the amount of rise per $1$ step right.',
        visual: {
          type: 'tangent-cursor',
          label: 'Move right and watch the tangent get steeper.',
          initialX: 3,
        },
      },
      {
        id: 'tangent-summary',
        type: 'multiple-choice',
        title: 'What tangent slope tells us',
        prompt: 'A tangent line helps describe the curve’s slope where?',
        options: [
          { id: 'one-point', label: 'At one point' },
          { id: 'two-points', label: 'Between two distant points' },
          { id: 'everywhere-same', label: 'Everywhere with the same value' },
          { id: 'axis-only', label: 'Only on the $x$-axis' },
        ],
        correctOptionId: 'one-point',
        correctExplanation: 'Correct. A tangent line describes local slope at one point.',
        incorrectExplanation: 'Not quite. Tangent lines are local to a point on the curve.',
        hint: 'A tangent touches the curve at the point you care about.',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent line follows the selected point.',
          initialX: 4,
        },
      },
    ],
  },
  {
    id: 'derivative-as-slope',
    title: 'Derivative as Instantaneous Slope',
    description: 'Define derivative as the slope at a specific point.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'derivative-intro',
        type: 'concept',
        title: 'A derivative is instant slope',
        body:
          'The derivative at a point is the slope the curve has right there. It is the slope of the tangent line at that point.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag the point and read the derivative as local slope.',
          initialX: 4,
        },
      },
      {
        id: 'derivative-at-four',
        type: 'multiple-choice',
        title: 'Derivative value',
        prompt: 'On this curve, the local slope near $x = 4$ is about $2$. What is the derivative there?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'two', label: '$2$' },
          { id: 'four', label: '$4$' },
          { id: 'six', label: '$6$' },
        ],
        correctOptionId: 'two',
        correctExplanation: 'Correct. The derivative is the local slope, which is about $2$.',
        incorrectExplanation: 'Not quite. Use the tangent slope, not the $x$-value or $y$-value.',
        hint: 'Derivative means local slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'Place the point near $x = 4$ and read the local slope.',
          initialX: 2,
        },
      },
      {
        id: 'derivative-zero',
        type: 'multiple-choice',
        title: 'Derivative at a flat point',
        prompt: 'At a point where the tangent is horizontal, what is the derivative?',
        options: [
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: '$0$' },
          { id: 'positive', label: 'Positive' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation: 'Correct. A horizontal tangent has slope $0$, so the derivative is $0$.',
        incorrectExplanation: 'Not quite. The derivative equals the tangent slope.',
        hint: 'Horizontal tangent means no rise.',
        visual: {
          type: 'tangent-cursor',
          label: 'At the bottom, the tangent is nearly horizontal.',
          initialX: 4,
        },
      },
      {
        id: 'derivative-notation',
        type: 'concept',
        title: 'Derivative notation',
        body:
          "You will often see the derivative written as $f$ prime, or $f'(x)$. It means “the slope of $f$ at this $x$-value.”",
        visual: {
          type: 'function-cursor',
          label: 'The $x$-value picks the point where we measure slope.',
          initialX: 3,
        },
      },
      {
        id: 'prime-notation',
        type: 'multiple-choice',
        title: 'Read $f$ prime',
        prompt: "What does $f'(3)$ mean?",
        options: [
          { id: 'slope-at-three', label: 'The slope of $f$ at $x = 3$' },
          { id: 'height-at-three', label: 'Only the height of $f$ at $x = 3$' },
          { id: 'area-near-three', label: 'The area near $x = 3$' },
          { id: 'always-three', label: 'The number $3$' },
        ],
        correctOptionId: 'slope-at-three',
        correctExplanation: "Correct. $f'(3)$ means the derivative, or slope, at $x = 3$.",
        incorrectExplanation: 'Not quite. The prime mark means slope, not just height.',
        hint: 'The prime symbol asks for slope.',
        visual: {
          type: 'tangent-cursor',
          label: "The tangent slope at $x = 3$ is the value of $f'(3)$.",
          initialX: 5,
        },
      },
      {
        id: 'derivative-sign',
        type: 'multiple-choice',
        title: 'Derivative sign',
        prompt: "If $f'(x)$ is negative, what is the function doing near that point?",
        options: [
          { id: 'increasing', label: 'Increasing' },
          { id: 'decreasing', label: 'Decreasing' },
          { id: 'constant', label: 'Staying exactly constant' },
          { id: 'flat-only', label: 'Always flat' },
        ],
        correctOptionId: 'decreasing',
        correctExplanation: 'Correct. A negative derivative means the function is decreasing near that point.',
        incorrectExplanation: 'Not quite. Negative slope means the graph goes down as $x$ increases.',
        hint: 'Connect derivative sign to slope sign.',
        visual: {
          type: 'tangent-cursor',
          label: 'Drag left to see where the derivative is negative.',
          initialX: 4,
        },
      },
      {
        id: 'derivative-summary',
        type: 'multiple-choice',
        title: 'Put it together',
        prompt: 'Which statement best summarizes a derivative?',
        options: [
          { id: 'instant-slope', label: 'The instantaneous slope of a function' },
          { id: 'only-average', label: 'Only the average between two far points' },
          { id: 'starting-input', label: 'The input where a function starts' },
          { id: 'input-list', label: 'A list of input values' },
        ],
        correctOptionId: 'instant-slope',
        correctExplanation: 'Correct. A derivative gives the instantaneous slope of a function.',
        incorrectExplanation: 'Not quite. A derivative describes local slope at a point.',
        hint: 'Think tangent line slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'The moving tangent slope is derivative intuition.',
          initialX: 5,
        },
      },
    ],
  },
  {
    id: 'difference-quotient',
    title: 'The Difference Quotient',
    description: 'Turn average rate of change into the expression used for derivatives.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'difference-quotient-intro',
        type: 'concept',
        title: 'Name the two $x$-values',
        body:
          'To measure change near one input, call the starting input $a$ and the nearby input $a + h$. The distance between them is $h$.',
        visual: {
          type: 'rate-window',
          label: 'Move the endpoints and think of their horizontal distance as $h$.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'identify-h',
        type: 'multiple-choice',
        title: 'Find $h$',
        prompt: 'If $a = 2$ and $a + h = 5$, what is $h$?',
        options: [
          { id: 'two', label: '$2$' },
          { id: 'three', label: '$3$' },
          { id: 'five', label: '$5$' },
          { id: 'seven', label: '$7$' },
        ],
        correctOptionId: 'three',
        correctExplanation: 'Correct. $h$ is the input change: $5 - 2 = 3$.',
        incorrectExplanation: 'Not quite. $h$ is how far the second $x$-value is from $a$.',
        hint: 'Compute $(a + h) - a$.',
        visual: {
          type: 'rate-window',
          label: 'Drag the endpoints so the input change matches $h$.',
          initialStartX: 1,
          initialEndX: 3,
        },
      },
      {
        id: 'output-part',
        type: 'multiple-choice',
        title: 'Output change in symbols',
        prompt: 'Which expression represents the output change from $x = a$ to $x = a + h$?',
        options: [
          { id: 'difference', label: '$f(a + h) - f(a)$' },
          { id: 'reverse-difference', label: '$f(a) - f(a + h)$' },
          { id: 'sum', label: '$f(a + h) + f(a)$' },
          { id: 'input-only', label: '$a + h$' },
        ],
        correctOptionId: 'difference',
        correctExplanation: 'Correct. Output change is ending output minus starting output.',
        incorrectExplanation: 'Not quite. Use ending output minus starting output.',
        hint: 'Output change means subtract the starting f-value from the ending f-value.',
        visual: {
          type: 'slope-triangle',
          label: 'The vertical part of the triangle is output change.',
          initialStartX: 1,
          initialStartY: 2,
          initialRun: 2,
          initialRise: 3,
        },
      },
      {
        id: 'quotient-form',
        type: 'concept',
        title: 'Average rate in symbols',
        body:
          'Average rate near $a$ becomes $(f(a + h) - f(a)) / h$. This is called the difference quotient.',
        visual: {
          type: 'rate-window',
          label: 'The secant slope is output change divided by $h$.',
          initialStartX: 1,
          initialEndX: 4,
        },
      },
      {
        id: 'difference-quotient-name',
        type: 'multiple-choice',
        title: 'Read the quotient',
        prompt: 'What does $(f(a + h) - f(a)) / h$ measure before $h$ gets tiny?',
        options: [
          { id: 'average-rate', label: 'Average rate over an interval' },
          { id: 'height-only', label: 'Only the height at $a$' },
          { id: 'product', label: 'Product of input and output' },
          { id: 'x-value', label: 'Only the input value' },
        ],
        correctOptionId: 'average-rate',
        correctExplanation: 'Correct. It is the average rate from $a$ to $a + h$.',
        incorrectExplanation: 'Not quite. The quotient compares output change to input change.',
        hint: 'It has the same structure as slope: rise over run.',
        visual: {
          type: 'rate-window',
          label: 'Move the two points to see the average rate interval.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'small-h-meaning',
        type: 'multiple-choice',
        title: 'What small $h$ means',
        prompt: 'If $h$ gets smaller, what happens to $a + h$?',
        options: [
          { id: 'closer', label: 'It moves closer to $a$' },
          { id: 'closer-to-zero', label: 'It moves closer to $0$' },
          { id: 'farther', label: 'It moves farther from $a$' },
          { id: 'unchanged', label: 'It must stay fixed' },
        ],
        correctOptionId: 'closer',
        correctExplanation: 'Correct. Smaller $h$ means the second input is closer to $a$.',
        incorrectExplanation: 'Not quite. $h$ is the distance from $a$ to the second input.',
        hint: 'Imagine $h$ shrinking from $3$ to $1$ to $0.1$.',
        visual: {
          type: 'rate-window',
          label: 'Bring the right endpoint closer to the left endpoint.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'difference-quotient-summary',
        type: 'multiple-choice',
        title: 'Put the pieces together',
        prompt: 'Which formula is the difference quotient?',
        options: [
          { id: 'quotient', label: '$(f(a + h) - f(a)) / h$' },
          { id: 'partial-quotient', label: '$f(a + h) / h$' },
          { id: 'product', label: '$f(a) · h$' },
          { id: 'sum', label: '$f(a + h) + h$' },
        ],
        correctOptionId: 'quotient',
        correctExplanation:
          'Correct. The difference quotient divides output change by input change $h$.',
        incorrectExplanation: 'Not quite. Look for output change divided by $h$.',
        hint: 'It should look like rise over run.',
        visual: {
          type: 'slope-triangle',
          label: 'The quotient is rise divided by run.',
          initialRise: 3,
          initialRun: 2,
        },
      },
    ],
  },
  {
    id: 'limits-from-secant-lines',
    title: 'Limits from Secant Lines',
    description: 'See why shrinking $h$ turns average rate into instantaneous slope.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'shrinking-secants',
        type: 'concept',
        title: 'Shrink the interval',
        body:
          'The formal derivative comes from watching secant slopes as the second point moves closer and closer to the first point.',
        visual: {
          type: 'rate-window',
          label: 'Drag the endpoints closer and compare the secant slope.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'h-not-zero-yet',
        type: 'multiple-choice',
        title: '$h$ is small, not zero',
        prompt: 'In the difference quotient, why do we keep $h$ nonzero while calculating?',
        options: [
          { id: 'division', label: 'Because dividing by $0$ is not allowed' },
          { id: 'style', label: 'Because $h$ is always decorative' },
          { id: 'output', label: 'Because $h$ is the output value' },
          { id: 'height', label: 'Because $h$ means height' },
        ],
        correctOptionId: 'division',
        correctExplanation: 'Correct. The quotient divides by $h$, so $h$ cannot equal $0$ during the calculation.',
        incorrectExplanation: 'Not quite. Look at the denominator of the quotient.',
        hint: 'What happens if the denominator is $0$?',
        visual: {
          type: 'rate-window',
          label: 'The endpoints can get close, but they should not be exactly the same.',
          initialStartX: 2,
          initialEndX: 4,
        },
      },
      {
        id: 'approach-meaning',
        type: 'multiple-choice',
        title: 'Approaching $0$',
        prompt: 'What does $h → 0$ mean?',
        options: [
          { id: 'approaches', label: '$h$ gets closer and closer to $0$' },
          { id: 'equals', label: '$h$ starts by equaling $0$' },
          { id: 'negative', label: '$h$ must be negative' },
          { id: 'large', label: '$h$ gets very large' },
        ],
        correctOptionId: 'approaches',
        correctExplanation: 'Correct. $h$ approaches $0$ without needing to be $0$ during the quotient.',
        incorrectExplanation: 'Not quite. The arrow means approaches.',
        hint: 'Read the arrow as “approaches.”',
        visual: {
          type: 'rate-window',
          label: 'Move the endpoints closer to model $h$ approaching $0$.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'secant-to-tangent',
        type: 'concept',
        title: 'Secants approach a tangent',
        body:
          'As $h$ gets closer to $0$, the secant line can settle toward the tangent line. That settled value is the derivative.',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent is the local slope the secants approach.',
          initialX: 4,
        },
      },
      {
        id: 'limit-language',
        type: 'multiple-choice',
        title: 'Limit language',
        prompt: 'A limit asks what value an expression gets close to as the input approaches something. What is approaching $0$ in the derivative limit?',
        options: [
          { id: 'a', label: '$a$' },
          { id: 'h', label: '$h$' },
          { id: 'f-a', label: '$f(a)$' },
          { id: 'slope-name', label: 'The word slope' },
        ],
        correctOptionId: 'h',
        correctExplanation: 'Correct. In the derivative limit, $h$ approaches $0$.',
        incorrectExplanation: 'Not quite. Look for the variable in $h → 0$.',
        hint: 'The limit is written with $h → 0$.',
        visual: {
          type: 'rate-window',
          label: 'The horizontal gap between points represents $h$.',
          initialStartX: 1,
          initialEndX: 4,
        },
      },
      {
        id: 'limit-result',
        type: 'multiple-choice',
        title: 'What the limit gives',
        prompt: 'If the secant slopes approach $2$ as $h$ approaches $0$, what is the derivative?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'two', label: '$2$' },
          { id: 'four', label: '$4$' },
          { id: 'h', label: '$h$' },
        ],
        correctOptionId: 'two',
        correctExplanation: 'Correct. The derivative is the value the slopes approach: $2$.',
        incorrectExplanation: 'Not quite. The derivative is the limiting slope value.',
        hint: 'Use the value the secant slopes get close to.',
        visual: {
          type: 'tangent-cursor',
          label: 'At this point, the local slope is the target value.',
          initialX: 2,
        },
      },
      {
        id: 'limits-summary',
        type: 'multiple-choice',
        title: 'Limit intuition',
        prompt: 'Why do limits matter for derivatives?',
        options: [
          { id: 'instant', label: 'They turn nearby average rates into an instant slope' },
          { id: 'avoid-graphs', label: 'They avoid looking at slopes' },
          { id: 'zero-slope', label: 'They make every slope equal $0$' },
          { id: 'replace-functions', label: 'They replace functions with tables only' },
        ],
        correctOptionId: 'instant',
        correctExplanation:
          'Correct. Limits describe what nearby average rates approach at one point.',
        incorrectExplanation: 'Not quite. Limits help make the local slope idea precise.',
        hint: 'Think about secant slopes approaching a tangent slope.',
        visual: {
          type: 'rate-window',
          label: 'Nearby secant slopes point toward the tangent slope.',
          initialStartX: 2,
          initialEndX: 3.5,
        },
      },
    ],
  },
  {
    id: 'formal-derivative-definition',
    title: 'The Formal Derivative Definition',
    description: 'Read and interpret: [[formal-derivative-formula]]',
    status: 'locked',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'formal-definition-intro',
        type: 'concept',
        title: 'The full definition',
        body:
          'The formal definition is [[formal-derivative-formula]]. It says the derivative is the limit of nearby average rates.',
        visual: {
          type: 'rate-window',
          label: 'The secant slope is the quotient inside the limit.',
          initialStartX: 2,
          initialEndX: 5,
        },
      },
      {
        id: 'definition-left-side',
        type: 'multiple-choice',
        title: 'Left side',
        prompt:
          "In the formal derivative formula [[formal-derivative-formula]], what does $f'(a)$ mean?",
        options: [
          { id: 'slope-at-a', label: 'The derivative, or slope, at $x = a$' },
          { id: 'height-only', label: 'Only the height $f(a)$' },
          { id: 'input-gap', label: 'The input change from $a$ to $a + h$' },
          { id: 'input-change', label: 'The value of $h$' },
        ],
        correctOptionId: 'slope-at-a',
        correctExplanation: "Correct. $f'(a)$ is the derivative at $x = a$.",
        incorrectExplanation: 'Not quite. The prime mark means derivative or local slope.',
        hint: "Read $f'$ as “f prime.”",
        visual: {
          type: 'tangent-cursor',
          label: "The tangent slope at the chosen point is $f'(a)$.",
          initialX: 4,
        },
      },
      {
        id: 'definition-numerator',
        type: 'multiple-choice',
        title: 'Numerator',
        prompt: 'What does $f(a + h) - f(a)$ represent?',
        options: [
          { id: 'output-change', label: 'Output change' },
          { id: 'input-change', label: 'Input change' },
          { id: 'average-rate', label: 'Average rate' },
          { id: 'final-input', label: 'The final input only' },
        ],
        correctOptionId: 'output-change',
        correctExplanation: 'Correct. The numerator is ending output minus starting output.',
        incorrectExplanation: 'Not quite. f-values are outputs.',
        hint: 'The $f(...)$ values are $y$-values.',
        visual: {
          type: 'slope-triangle',
          label: 'The vertical rise represents output change.',
          initialStartX: 1,
          initialStartY: 2,
          initialRun: 2,
          initialRise: 3,
        },
      },
      {
        id: 'definition-denominator',
        type: 'multiple-choice',
        title: 'Denominator',
        prompt: 'What does the denominator $h$ represent?',
        options: [
          { id: 'input-change', label: 'Input change' },
          { id: 'output-change', label: 'Output change' },
          { id: 'whole-quotient', label: 'Output change divided by input change' },
          { id: 'slope-answer', label: 'The final slope answer' },
        ],
        correctOptionId: 'input-change',
        correctExplanation: 'Correct. $h$ is the horizontal input change from $a$ to $a + h$.',
        incorrectExplanation: 'Not quite. $h$ measures the $x$-distance between the two inputs.',
        hint: '$h$ is the run.',
        visual: {
          type: 'slope-triangle',
          label: 'The horizontal run represents $h$.',
          initialStartX: 1,
          initialStartY: 2,
          initialRun: 3,
          initialRise: 2,
        },
      },
      {
        id: 'definition-limit',
        type: 'concept',
        title: 'The limit makes it instant',
        body:
          'The limit $h → 0$ asks what happens to the average rate as the input gap shrinks toward $0$. That is how the formula captures one-point slope.',
        visual: {
          type: 'rate-window',
          label: 'Shrink $h$ and watch the average rate become more local.',
          initialStartX: 2,
          initialEndX: 4.5,
        },
      },
      {
        id: 'definition-whole-form',
        type: 'multiple-choice',
        title: 'Whole formula',
        prompt:
          'What does [[formal-derivative-formula]] describe?',
        options: [
          { id: 'instant-slope', label: 'The instantaneous slope at $x = a$' },
          { id: 'average-height', label: 'The average height over an interval' },
          { id: 'height-at-zero', label: 'The height of the graph at $x = 0$' },
          { id: 'random-average', label: 'A random average far from $a$' },
        ],
        correctOptionId: 'instant-slope',
        correctExplanation: 'Correct. The limit of the difference quotient is the instantaneous slope.',
        incorrectExplanation: 'Not quite. The limit focuses the average rate at one point.',
        hint: 'Connect the formula to tangent slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent slope is the instant slope from the formula.',
          initialX: 3,
        },
      },
      {
        id: 'formal-definition-summary',
        type: 'multiple-choice',
        title: 'Final check',
        prompt: 'Which statement best explains the formal derivative definition?',
        options: [
          {
            id: 'limit-of-average',
            label: 'It is the limit of average rates as the interval shrinks to one point',
          },
          { id: 'just-height', label: 'It is only the height of the graph' },
          { id: 'tangent-list', label: 'It is a list of tangent points' },
          { id: 'ignore-h', label: 'It ignores the input change $h$' },
        ],
        correctOptionId: 'limit-of-average',
        correctExplanation:
          'Correct. The formal definition makes instant slope precise as a limit of average rates.',
        incorrectExplanation: 'Not quite. The definition uses nearby average rates and a limit.',
        hint: 'Look for average rates approaching one-point slope.',
        visual: {
          type: 'rate-window',
          label: 'Average rates over smaller intervals lead to the derivative.',
          initialStartX: 2,
          initialEndX: 3,
        },
      },
    ],
  },
  {
    id: 'derivative-units',
    title: 'Derivative Units',
    description: 'Attach real-world units to derivative values.',
    status: 'locked',
    estimatedMinutes: 7,
    steps: [
      {
        id: 'units-intro',
        type: 'concept',
        title: 'Rates have compound units',
        body:
          'A derivative is a rate, so its units are output units per input unit. If height is in meters and time is in seconds, the derivative uses meters per second.',
        visual: {
          type: 'rate-window',
          label: 'Compare output change to input change and read the units as output per input.',
          initialStartX: 1,
          initialEndX: 4,
        },
      },
      {
        id: 'position-time-units',
        type: 'multiple-choice',
        title: 'Position over time',
        prompt:
          "A position function $s(t)$ is measured in meters and $t$ is measured in seconds. What units does $s'(t)$ have?",
        options: [
          { id: 'meters', label: 'Meters' },
          { id: 'seconds', label: 'Seconds' },
          { id: 'meters-per-second', label: 'Meters per second' },
          { id: 'seconds-per-meter', label: 'Seconds per meter' },
        ],
        correctOptionId: 'meters-per-second',
        correctExplanation:
          'Correct. A derivative has output units per input unit: meters per second.',
        incorrectExplanation:
          'Not quite. Put the output units over the input units.',
        hint: 'Read derivative units as output per input.',
        visual: {
          type: 'linear-cursor',
          label: 'A line with slope $2$ can represent $2$ meters per second.',
          initialX: 2,
          slope: 2,
        },
      },
      {
        id: 'cost-item-units',
        type: 'multiple-choice',
        title: 'Cost per item',
        prompt:
          "A cost function $C(n)$ gives dollars for $n$ items. What units describe $C'(n)$?",
        options: [
          { id: 'items-per-dollar', label: 'Items per dollar' },
          { id: 'dollars-per-item', label: 'Dollars per item' },
          { id: 'dollars-only', label: 'Dollars only' },
          { id: 'items-only', label: 'Items only' },
        ],
        correctOptionId: 'dollars-per-item',
        correctExplanation:
          "Correct. $C'(n)$ tells about extra dollars for each extra item.",
        incorrectExplanation:
          'Not quite. The output is dollars and the input is items.',
        hint: 'Output units go first.',
        visual: {
          type: 'slope-triangle',
          label: 'The rise is dollars and the run is items.',
          initialStartX: 1,
          initialStartY: 2,
          initialRun: 2,
          initialRise: 5,
        },
      },
      {
        id: 'units-meaning',
        type: 'concept',
        title: 'Units explain the number',
        body:
          'The number alone is incomplete. A derivative of $3$ could mean $3$ meters per second, $3$ dollars per item, or $3$ degrees per minute depending on the function.',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent slope is a rate, and the context supplies the units.',
          initialX: 4,
        },
      },
      {
        id: 'temperature-units',
        type: 'multiple-choice',
        title: 'Temperature changing',
        prompt:
          "Temperature $T(t)$ is in degrees and time $t$ is in minutes. What does $T'(t) = -2$ mean?",
        options: [
          { id: 'rising-two', label: 'Temperature is rising $2$ degrees per minute' },
          { id: 'falling-two', label: 'Temperature is falling $2$ degrees per minute' },
          { id: 'temperature-two', label: 'The temperature is $2$ degrees' },
          { id: 'time-two', label: 'The time is $2$ minutes' },
        ],
        correctOptionId: 'falling-two',
        correctExplanation:
          'Correct. The negative sign means decreasing, and the units are degrees per minute.',
        incorrectExplanation:
          'Not quite. Use both the sign and the output-per-input units.',
        hint: 'A negative derivative means the output is going down.',
        visual: {
          type: 'tangent-cursor',
          label: 'A downward tangent represents a negative rate of change.',
          initialX: 1,
        },
      },
      {
        id: 'unit-order',
        type: 'multiple-choice',
        title: 'Choose the order',
        prompt:
          'For a function with output in gallons and input in hours, which derivative unit is correct?',
        options: [
          { id: 'hours-per-gallon', label: 'Hours per gallon' },
          { id: 'gallons-per-hour', label: 'Gallons per hour' },
          { id: 'gallons-hours', label: 'Gallons times hours' },
          { id: 'no-units', label: 'No units' },
        ],
        correctOptionId: 'gallons-per-hour',
        correctExplanation:
          'Correct. Derivative units are output units per input unit.',
        incorrectExplanation:
          'Not quite. The function output goes on top of the rate.',
        hint: 'Derivative means change in output divided by change in input.',
        visual: {
          type: 'rate-window',
          label: 'Read the vertical change over the horizontal change.',
          initialStartX: 1,
          initialEndX: 3,
        },
      },
      {
        id: 'units-summary',
        type: 'multiple-choice',
        title: 'Unit rule',
        prompt: 'Which rule correctly gives derivative units?',
        options: [
          { id: 'output-per-input', label: 'Output units per input unit' },
          { id: 'input-per-output', label: 'Input units per output unit' },
          { id: 'output-only', label: 'Output units only' },
          { id: 'input-only', label: 'Input units only' },
        ],
        correctOptionId: 'output-per-input',
        correctExplanation:
          'Correct. Derivatives measure how output changes for each input change.',
        incorrectExplanation:
          'Not quite. A derivative is a rate of output change compared with input change.',
        hint: 'Think rise over run.',
        visual: {
          type: 'slope-triangle',
          label: 'Rise units divided by run units give derivative units.',
          initialRise: 4,
          initialRun: 2,
        },
      },
    ],
  },
  {
    id: 'reading-derivatives-from-graphs',
    title: 'Reading Derivatives From Graphs',
    description: 'Estimate derivative values by reading tangent slopes on a graph.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'read-graph-intro',
        type: 'concept',
        title: 'Read slope, not height',
        body:
          "When a graph asks for a derivative, look at the tangent slope. The height of the point is $f(x)$; the tilt of the tangent is $f'(x)$.",
        visual: {
          type: 'tangent-cursor',
          label: 'Drag the point and focus on tangent tilt instead of height.',
          initialX: 3,
        },
      },
      {
        id: 'read-positive-slope',
        type: 'multiple-choice',
        title: 'Upward tangent',
        prompt:
          'At a point where the tangent rises about $2$ units for each $1$ unit right, what is the derivative?',
        options: [
          { id: 'one-half', label: '$1 / 2$' },
          { id: 'one', label: '$1$' },
          { id: 'two', label: '$2$' },
          { id: 'negative-two', label: '$-2$' },
        ],
        correctOptionId: 'two',
        correctExplanation:
          'Correct. A rise of $2$ for a run of $1$ gives slope $2$.',
        incorrectExplanation:
          'Not quite. Derivative equals tangent slope, so use rise divided by run.',
        hint: 'Rise over run is $2 / 1$.',
        visual: {
          type: 'slope-triangle',
          label: 'Use the triangle to estimate rise over run on the tangent.',
          initialRise: 2,
          initialRun: 1,
        },
      },
      {
        id: 'read-flat-slope',
        type: 'multiple-choice',
        title: 'Flat tangent',
        prompt: 'If the tangent line looks horizontal, what derivative value should you read?',
        options: [
          { id: 'negative', label: '$-1$' },
          { id: 'zero', label: '$0$' },
          { id: 'positive', label: '$1$' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. A horizontal tangent has slope $0$.',
        incorrectExplanation:
          'Not quite. Horizontal means the rise is $0$.',
        hint: 'A flat line has no rise.',
        visual: {
          type: 'tangent-cursor',
          label: 'Move near the low point where the tangent is nearly flat.',
          initialX: 2,
        },
      },
      {
        id: 'estimate-over-exact',
        type: 'concept',
        title: 'Graphs give estimates',
        body:
          'Unless a graph gives exact grid points on the tangent, derivative readings are estimates. Choose the closest value that matches the slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'Small changes in position can change your slope estimate.',
          initialX: 5,
        },
      },
      {
        id: 'read-negative-slope',
        type: 'multiple-choice',
        title: 'Downward tangent',
        prompt:
          'A tangent falls about $3$ units for each $1$ unit right. Which derivative is closest?',
        options: [
          { id: 'three', label: '$3$' },
          { id: 'one-third', label: '$1 / 3$' },
          { id: 'negative-three', label: '$-3$' },
          { id: 'zero', label: '$0$' },
        ],
        correctOptionId: 'negative-three',
        correctExplanation:
          'Correct. Falling as $x$ increases gives a negative slope, about $-3$.',
        incorrectExplanation:
          'Not quite. Downward tilt means the derivative is negative.',
        hint: 'Down $3$ and right $1$ gives $-3 / 1$.',
        visual: {
          type: 'slope-triangle',
          label: 'A downward tangent has negative rise over positive run.',
          initialStartX: 1,
          initialStartY: 5,
          initialRun: 1,
          initialRise: -3,
        },
      },
      {
        id: 'height-trap',
        type: 'multiple-choice',
        title: 'Avoid the height trap',
        prompt:
          "At $x = 4$, suppose the graph height is $7$ but the tangent slope is $1$. What is $f'(4)$?",
        options: [
          { id: 'one', label: '$1$' },
          { id: 'four', label: '$4$' },
          { id: 'seven', label: '$7$' },
          { id: 'eight', label: '$8$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          "Correct. $f'(4)$ is the slope value, not the graph height.",
        incorrectExplanation:
          'Not quite. The derivative asks for slope at $x = 4$.',
        hint: "Ignore the height if the question asks for $f'$.",
        visual: {
          type: 'function-cursor',
          label: 'The cursor shows height, but derivative questions ask about tangent slope.',
          initialX: 4,
        },
      },
      {
        id: 'reading-summary',
        type: 'multiple-choice',
        title: 'Reading strategy',
        prompt: "What should you read from a graph to estimate $f'(a)$?",
        options: [
          { id: 'height', label: 'The height of the point' },
          { id: 'tangent-slope', label: 'The tangent slope at $x = a$' },
          { id: 'x-value', label: 'Only the value of $a$' },
          { id: 'area', label: 'The area under the graph' },
        ],
        correctOptionId: 'tangent-slope',
        correctExplanation:
          'Correct. Derivatives are read as tangent slopes.',
        incorrectExplanation:
          'Not quite. Prime notation asks for slope.',
        hint: 'Look for the line that just matches the curve locally.',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent line gives the derivative estimate.',
          initialX: 4,
        },
      },
    ],
  },
  {
    id: 'derivative-sign-charts',
    title: 'Derivative Sign Charts',
    description: "Use signs of $f'(x)$ to describe increasing and decreasing intervals.",
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'sign-chart-intro',
        type: 'concept',
        title: 'Signs summarize motion',
        body:
          "A derivative sign chart records whether $f'(x)$ is positive, negative, or zero on intervals. Positive means increasing; negative means decreasing.",
        visual: {
          type: 'tangent-cursor',
          label: 'Drag along the curve and watch where tangent slopes change sign.',
          initialX: 1,
        },
      },
      {
        id: 'positive-sign-meaning',
        type: 'multiple-choice',
        title: 'Positive interval',
        prompt: "If a sign chart shows $f'(x) > 0$ on an interval, what is $f(x)$ doing there?",
        options: [
          { id: 'increasing', label: 'Increasing' },
          { id: 'decreasing', label: 'Decreasing' },
          { id: 'always-zero', label: 'Always equal to $0$' },
          { id: 'undefined', label: 'Not defined anywhere' },
        ],
        correctOptionId: 'increasing',
        correctExplanation:
          'Correct. A positive derivative means the function rises as $x$ moves right.',
        incorrectExplanation:
          'Not quite. Positive slope means the graph goes up from left to right.',
        hint: 'Positive derivative matches positive slope.',
        visual: {
          type: 'linear-cursor',
          label: 'A positive slope line increases from left to right.',
          initialX: 2,
          slope: 1,
        },
      },
      {
        id: 'negative-sign-meaning',
        type: 'multiple-choice',
        title: 'Negative interval',
        prompt: "If $f'(x) < 0$ on an interval, what is $f(x)$ doing there?",
        options: [
          { id: 'increasing', label: 'Increasing' },
          { id: 'decreasing', label: 'Decreasing' },
          { id: 'flat', label: 'Flat everywhere' },
          { id: 'height-positive', label: 'Always above the $x$-axis' },
        ],
        correctOptionId: 'decreasing',
        correctExplanation:
          'Correct. Negative derivative means the function decreases as $x$ moves right.',
        incorrectExplanation:
          'Not quite. Negative slope means the graph goes down from left to right.',
        hint: 'Think downward tangent.',
        visual: {
          type: 'linear-cursor',
          label: 'A negative slope line decreases from left to right.',
          initialX: 2,
          slope: -1,
          yIntercept: 6,
        },
      },
      {
        id: 'critical-breaks',
        type: 'concept',
        title: 'Break intervals at key points',
        body:
          "Sign charts usually split the number line at places where $f'(x) = 0$ or where $f'(x)$ does not exist. Then each interval gets a sign.",
        visual: {
          type: 'tangent-cursor',
          label: 'Watch the tangent flatten before its sign changes.',
          initialX: 2,
        },
      },
      {
        id: 'zero-between-signs',
        type: 'multiple-choice',
        title: 'Sign change point',
        prompt:
          'A sign chart reads negative, then $0$, then positive. What happens to the function around the middle point?',
        options: [
          { id: 'local-min', label: 'It changes from decreasing to increasing' },
          { id: 'local-max', label: 'It changes from increasing to decreasing' },
          { id: 'always-down', label: 'It keeps decreasing' },
          { id: 'no-information', label: 'The signs tell nothing' },
        ],
        correctOptionId: 'local-min',
        correctExplanation:
          'Correct. Negative to positive means the function turns from decreasing to increasing.',
        incorrectExplanation:
          'Not quite. Translate each sign into function direction.',
        hint: 'Negative means down, positive means up.',
        visual: {
          type: 'tangent-cursor',
          label: 'Near a low point, slopes go from negative to zero to positive.',
          initialX: 2,
          curveShape: 'valley',
        },
      },
      {
        id: 'positive-to-negative',
        type: 'multiple-choice',
        title: 'Peak pattern',
        prompt:
          "If $f'(x)$ changes from positive to negative at a point, what kind of turning point is suggested?",
        options: [
          { id: 'local-min', label: 'Local minimum' },
          { id: 'local-max', label: 'Local maximum' },
          { id: 'always-increasing', label: 'Always increasing' },
          { id: 'vertical-line', label: 'Vertical line' },
        ],
        correctOptionId: 'local-max',
        correctExplanation:
          'Correct. Positive to negative means the function rises, then falls.',
        incorrectExplanation:
          'Not quite. Read the function direction before and after the point.',
        hint: 'Up then down creates a peak.',
        visual: {
          type: 'tangent-cursor',
          label: 'A peak has positive slopes before it and negative slopes after it.',
          initialX: 4,
          curveShape: 'peak',
        },
      },
      {
        id: 'sign-chart-summary',
        type: 'multiple-choice',
        title: 'What sign charts show',
        prompt: 'What is the main purpose of a derivative sign chart?',
        options: [
          { id: 'height-values', label: 'List exact function heights' },
          { id: 'direction', label: 'Show where a function increases or decreases' },
          { id: 'area', label: 'Compute area under a curve' },
          { id: 'domain-only', label: 'Show only the domain' },
        ],
        correctOptionId: 'direction',
        correctExplanation:
          'Correct. Derivative signs tell the function direction on intervals.',
        incorrectExplanation:
          'Not quite. Sign charts summarize derivative signs and direction.',
        hint: 'Signs tell whether slopes are positive or negative.',
        visual: {
          type: 'tangent-cursor',
          label: 'Derivative sign follows tangent direction.',
          initialX: 4,
        },
      },
    ],
  },
  {
    id: 'where-derivatives-are-zero',
    title: 'Where Derivatives Are Zero',
    description: 'Recognize horizontal tangents and flat rates of change.',
    status: 'locked',
    estimatedMinutes: 7,
    steps: [
      {
        id: 'zero-derivative-intro',
        type: 'concept',
        title: 'Zero means flat tangent',
        body:
          'A derivative equals $0$ where the tangent line is horizontal. The function is momentarily neither rising nor falling at that point.',
        visual: {
          type: 'tangent-cursor',
          label: 'Move to the flat tangent and connect it to derivative $0$.',
          initialX: 2,
        },
      },
      {
        id: 'horizontal-spot',
        type: 'multiple-choice',
        title: 'Spot zero slope',
        prompt: 'Which tangent line has derivative $0$?',
        options: [
          { id: 'rising', label: 'A rising tangent' },
          { id: 'falling', label: 'A falling tangent' },
          { id: 'horizontal', label: 'A horizontal tangent' },
          { id: 'steep', label: 'A very steep upward tangent' },
        ],
        correctOptionId: 'horizontal',
        correctExplanation:
          'Correct. Horizontal lines have slope $0$.',
        incorrectExplanation:
          'Not quite. Derivative $0$ means no rise for a small move right.',
        hint: 'Look for a flat tangent.',
        visual: {
          type: 'slope-triangle',
          label: 'Set the rise to $0$ to model a horizontal tangent.',
          initialRise: 0,
          initialRun: 3,
        },
      },
      {
        id: 'valley-zero',
        type: 'multiple-choice',
        title: 'At a valley',
        prompt: 'At a smooth local minimum, what is usually true about the derivative?',
        options: [
          { id: 'zero', label: 'It is $0$' },
          { id: 'positive-only', label: 'It is always positive' },
          { id: 'negative-only', label: 'It is always negative' },
          { id: 'height-zero', label: 'The function height must be $0$' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. A smooth valley usually has a horizontal tangent, so the derivative is $0$.',
        incorrectExplanation:
          'Not quite. Think about the tangent at the bottom of a smooth valley.',
        hint: 'The tangent flattens at the bottom.',
        visual: {
          type: 'tangent-cursor',
          label: 'At the bottom, the tangent is nearly horizontal.',
          initialX: 2,
          curveShape: 'valley',
        },
      },
      {
        id: 'zero-not-height',
        type: 'concept',
        title: 'Zero derivative is not zero height',
        body:
          "$f'(a) = 0$ says the slope is zero at $x = a$. It does not mean $f(a) = 0$. A graph can be flat far above the $x$-axis.",
        visual: {
          type: 'function-cursor',
          label: 'Height and slope answer different questions.',
          initialX: 3,
        },
      },
      {
        id: 'height-vs-slope-zero',
        type: 'multiple-choice',
        title: 'Height trap',
        prompt: "If $f'(3) = 0$, what can you conclude?",
        options: [
          { id: 'height-zero', label: '$f(3) = 0$' },
          { id: 'slope-zero', label: 'The tangent slope at $x = 3$ is $0$' },
          { id: 'input-zero', label: '$3 = 0$' },
          { id: 'undefined', label: '$f(3)$ does not exist' },
        ],
        correctOptionId: 'slope-zero',
        correctExplanation:
          'Correct. Prime notation tells you the slope value.',
        incorrectExplanation:
          "Not quite. $f'(3)$ is derivative, not height.",
        hint: 'The prime mark means slope.',
        visual: {
          type: 'tangent-cursor',
          label: 'The tangent slope can be zero even when the point is not on the $x$-axis.',
          initialX: 4,
        },
      },
      {
        id: 'constant-zero',
        type: 'multiple-choice',
        title: 'Constant section',
        prompt: 'On a flat horizontal part of a graph, what is the derivative?',
        options: [
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: '$0$' },
          { id: 'positive', label: 'Positive' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. A flat horizontal section has slope $0$ everywhere on that section.',
        incorrectExplanation:
          'Not quite. A horizontal graph has no rise as $x$ changes.',
        hint: 'Flat means slope zero.',
        visual: {
          type: 'linear-cursor',
          label: 'A horizontal line models constant output.',
          initialX: 2,
          slope: 0,
          yIntercept: 4,
        },
      },
      {
        id: 'zero-summary',
        type: 'multiple-choice',
        title: 'Zero derivative summary',
        prompt: "Which phrase best describes a point where $f'(x) = 0$?",
        options: [
          { id: 'horizontal-tangent', label: 'A point with a horizontal tangent' },
          { id: 'x-intercept', label: 'A point where the graph crosses the $x$-axis' },
          { id: 'vertical-tangent', label: 'A point with a vertical tangent' },
          { id: 'missing-point', label: 'A missing point' },
        ],
        correctOptionId: 'horizontal-tangent',
        correctExplanation:
          'Correct. Derivative zero means tangent slope zero.',
        incorrectExplanation:
          'Not quite. Focus on slope, not the graph height.',
        hint: 'Derivative zero means slope zero.',
        visual: {
          type: 'tangent-cursor',
          label: 'Find where the tangent line looks flat.',
          initialX: 2,
        },
      },
    ],
  },
  {
    id: 'when-derivatives-do-not-exist',
    title: 'When Derivatives Do Not Exist',
    description: 'Identify corners, jumps, gaps, and vertical tangents as derivative trouble spots.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'dne-intro',
        type: 'concept',
        title: 'Some points have no single slope',
        body:
          'A derivative exists when the graph has one clear local slope at a point. Corners, cusps, jumps, gaps, and vertical tangents can break that idea.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A corner has two different one-sided slopes.',
          shape: 'corner',
        },
      },
      {
        id: 'corner-issue',
        type: 'multiple-choice',
        title: 'Sharp corner',
        prompt: 'Why might a sharp corner fail to have a derivative?',
        options: [
          { id: 'two-slopes', label: 'The left and right slopes do not match' },
          { id: 'too-smooth', label: 'The graph is too smooth' },
          { id: 'height-zero', label: 'The height is $0$' },
          { id: 'x-positive', label: 'The $x$-value is positive' },
        ],
        correctOptionId: 'two-slopes',
        correctExplanation:
          'Correct. At a corner, the slope from the left and the slope from the right can disagree.',
        incorrectExplanation:
          'Not quite. A derivative needs one clear local slope.',
        hint: 'Think about approaching the point from each side.',
        visual: {
          type: 'nonsmooth-example',
          label: 'At a corner, the left and right slope directions disagree.',
          shape: 'corner',
        },
      },
      {
        id: 'cusp-issue',
        type: 'multiple-choice',
        title: 'Sharp cusp',
        prompt: 'What makes a cusp like $y = |x|^{2/3}$ fail to have a derivative at its tip?',
        options: [
          { id: 'vertical-sides', label: 'The graph becomes infinitely steep from both sides' },
          { id: 'flat-tip', label: 'The tip has slope $0$' },
          { id: 'too-many-points', label: 'There are too many nearby points' },
          { id: 'positive-height', label: 'The height is positive' },
        ],
        correctOptionId: 'vertical-sides',
        correctExplanation:
          'Correct. Near a cusp, secant slopes grow without settling to one ordinary finite slope.',
        incorrectExplanation:
          'Not quite. A cusp has a sharp tip where the local slope does not settle to one finite value.',
        hint: 'Look at how steep the two sides become near the tip.',
        visual: {
          type: 'nonsmooth-example',
          label: '$y = |x|^{2/3}$ has a pointed cusp instead of a smooth tangent.',
          shape: 'cusp',
        },
      },
      {
        id: 'jump-issue',
        type: 'multiple-choice',
        title: 'Jump in the graph',
        prompt: 'If a graph jumps at $x = a$, why does the derivative at $a$ not exist?',
        options: [
          { id: 'not-connected', label: 'There is no smooth local graph to measure' },
          { id: 'always-zero', label: 'The derivative must equal $0$' },
          { id: 'positive', label: 'The derivative must be positive' },
          { id: 'units', label: 'The units disappear' },
        ],
        correctOptionId: 'not-connected',
        correctExplanation:
          'Correct. A jump breaks the local smoothness needed for one tangent slope.',
        incorrectExplanation:
          'Not quite. A derivative needs the graph to behave smoothly near the point.',
        hint: 'A jump prevents a single local tangent direction.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A jump leaves no connected graph near $x = a$.',
          shape: 'jump',
        },
      },
      {
        id: 'vertical-tangent',
        type: 'multiple-choice',
        title: 'Vertical tangent',
        prompt: 'Why is a vertical tangent a derivative problem?',
        options: [
          { id: 'undefined-slope', label: 'Its slope is undefined' },
          { id: 'zero-slope', label: 'Its slope is $0$' },
          { id: 'height-negative', label: 'Its height is negative' },
          { id: 'no-input', label: 'The input is missing everywhere' },
        ],
        correctOptionId: 'undefined-slope',
        correctExplanation:
          'Correct. Derivatives are ordinary slopes, and vertical line slope is undefined.',
        incorrectExplanation:
          'Not quite. Compare a vertical line to the slope formula.',
        hint: 'Vertical lines have run $0$.',
        visual: {
          type: 'nonsmooth-example',
          label: 'A vertical tangent has no ordinary finite slope.',
          shape: 'vertical-tangent',
        },
      },
      {
        id: 'hole-issue',
        type: 'concept',
        title: 'Missing point',
        body:
          "If $f(a)$ is not defined, then $f'(a)$ cannot exist. A derivative at $a$ needs an actual point on the graph before it can measure a local slope.",
        visual: {
          type: 'nonsmooth-example',
          label: 'A derivative needs an actual point to measure from.',
          shape: 'hole',
        },
      },
      {
        id: 'dne-summary',
        type: 'multiple-choice',
        title: 'Trouble spots',
        prompt: 'Which graph feature is most likely to have no derivative at the marked point?',
        options: [
          { id: 'smooth-rising', label: 'A smooth rising point' },
          { id: 'smooth-flat', label: 'A smooth flat point' },
          { id: 'sharp-corner', label: 'A sharp corner' },
          { id: 'smooth-falling', label: 'A smooth falling point' },
        ],
        correctOptionId: 'sharp-corner',
        correctExplanation:
          'Correct. A corner can have different slopes from the two sides.',
        incorrectExplanation:
          'Not quite. Smooth points usually have a clear tangent slope.',
        hint: 'Look for a point with no single local direction.',
        visual: {
          type: 'nonsmooth-example',
          label: 'This marked corner has no single local tangent slope.',
          shape: 'corner',
        },
      },
    ],
  },
  {
    id: 'derivative-as-velocity',
    title: 'Derivative as Velocity',
    description: 'Interpret velocity as the derivative of position.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'velocity-intro',
        type: 'concept',
        title: 'Velocity is position rate',
        body:
          'If position depends on time, velocity is the derivative of position. It tells how fast position changes at an instant.',
        visual: {
          type: 'tangent-cursor',
          label: 'Tangent slope on a position-time graph represents velocity.',
          initialX: 3,
        },
      },
      {
        id: 'velocity-units',
        type: 'multiple-choice',
        title: 'Velocity units',
        prompt: 'Position is measured in meters and time in seconds. What units should velocity have?',
        options: [
          { id: 'meters', label: 'Meters' },
          { id: 'seconds', label: 'Seconds' },
          { id: 'meters-per-second', label: 'Meters per second' },
          { id: 'seconds-per-meter', label: 'Seconds per meter' },
        ],
        correctOptionId: 'meters-per-second',
        correctExplanation:
          'Correct. Velocity is change in position per change in time.',
        incorrectExplanation:
          'Not quite. Use position units per time unit.',
        hint: 'Velocity is a derivative, so use output per input.',
        visual: {
          type: 'rate-window',
          label: 'Average velocity is position change divided by time change.',
          initialStartX: 1,
          initialEndX: 4,
        },
      },
      {
        id: 'positive-velocity',
        type: 'multiple-choice',
        title: 'Moving forward',
        prompt:
          'On a position-time graph, what does a positive tangent slope mean?',
        options: [
          { id: 'forward', label: 'Position is increasing' },
          { id: 'backward', label: 'Position is decreasing' },
          { id: 'stopped', label: 'Position is not changing' },
          { id: 'missing', label: 'Position is undefined' },
        ],
        correctOptionId: 'forward',
        correctExplanation:
          'Correct. Positive velocity means position increases as time moves forward.',
        incorrectExplanation:
          'Not quite. Positive slope means the graph rises from left to right.',
        hint: 'Positive derivative means increasing output.',
        visual: {
          type: 'linear-cursor',
          label: 'A positive slope position graph means positive velocity.',
          initialX: 2,
          slope: 2,
        },
      },
      {
        id: 'speed-vs-velocity',
        type: 'concept',
        title: 'Direction matters',
        body:
          'Velocity can be positive, negative, or zero. Its sign tells direction on a number line, while its size tells how fast position is changing.',
        visual: {
          type: 'tangent-cursor',
          label: 'Upward and downward tangents represent opposite velocity signs.',
          initialX: 5,
        },
      },
      {
        id: 'stopped-velocity',
        type: 'multiple-choice',
        title: 'Momentarily stopped',
        prompt: 'If the position-time tangent is horizontal at one instant, what is the velocity then?',
        options: [
          { id: 'negative', label: 'Negative' },
          { id: 'zero', label: '$0$' },
          { id: 'positive', label: 'Positive' },
          { id: 'undefined', label: 'Undefined' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. A horizontal tangent has slope $0$, so velocity is $0$.',
        incorrectExplanation:
          'Not quite. Velocity equals tangent slope on a position-time graph.',
        hint: 'Horizontal means no position change at that instant.',
        visual: {
          type: 'tangent-cursor',
          label: 'Flat tangent means the object is momentarily stopped.',
          initialX: 2,
        },
      },
      {
        id: 'negative-velocity',
        type: 'multiple-choice',
        title: 'Moving backward',
        prompt: 'What does negative velocity mean on a position-time graph?',
        options: [
          { id: 'position-increases', label: 'Position is increasing' },
          { id: 'position-decreases', label: 'Position is decreasing' },
          { id: 'time-negative', label: 'Time is negative' },
          { id: 'height-zero', label: 'Position must be $0$' },
        ],
        correctOptionId: 'position-decreases',
        correctExplanation:
          'Correct. Negative velocity means position decreases as time increases.',
        incorrectExplanation:
          'Not quite. Negative slope means the graph falls from left to right.',
        hint: 'Velocity sign follows slope sign.',
        visual: {
          type: 'linear-cursor',
          label: 'A negative slope position graph represents negative velocity.',
          initialX: 2,
          slope: -1,
          yIntercept: 6,
        },
      },
      {
        id: 'velocity-summary',
        type: 'multiple-choice',
        title: 'Velocity summary',
        prompt: 'Which statement best connects derivatives and velocity?',
        options: [
          { id: 'position-derivative', label: 'Velocity is the derivative of position with respect to time' },
          { id: 'time-derivative', label: 'Velocity is the derivative of time with respect to position' },
          { id: 'height-only', label: 'Velocity is only the height of a position graph' },
          { id: 'always-positive', label: 'Velocity is always positive' },
        ],
        correctOptionId: 'position-derivative',
        correctExplanation:
          'Correct. Velocity is instant change in position per time.',
        incorrectExplanation:
          'Not quite. Velocity measures position change as time changes.',
        hint: 'Position is the output and time is the input.',
        visual: {
          type: 'tangent-cursor',
          label: 'Read velocity as the slope of the position-time graph.',
          initialX: 4,
        },
      },
    ],
  },
  {
    id: 'comparing-function-and-derivative-graphs',
    title: 'Comparing Function and Derivative Graphs',
    description: 'Match features of a function graph to signs and values on its derivative graph.',
    status: 'locked',
    estimatedMinutes: 9,
    steps: [
      {
        id: 'compare-intro',
        type: 'concept',
        title: 'The derivative graph tracks slope',
        body:
          "A derivative graph does not copy the height of $f$. On these same axes, the green curve is $f$ and the blue dashed curve is $f'$, which plots slope values of $f$ at each $x$.",
        visual: {
          type: 'function-derivative-overlay',
          label: "Green is $f$; blue dashed is $f'$ on the same axes.",
        },
      },
      {
        id: 'increasing-derivative-graph',
        type: 'multiple-choice',
        title: 'Rising function',
        prompt: "If $f$ is increasing on an interval, where should $f'$ be on that interval?",
        options: [
          { id: 'above-axis', label: 'Above the $x$-axis' },
          { id: 'below-axis', label: 'Below the $x$-axis' },
          { id: 'on-axis', label: 'Exactly on the $x$-axis' },
          { id: 'missing', label: 'Not defined everywhere' },
        ],
        correctOptionId: 'above-axis',
        correctExplanation:
          "Correct. Increasing means positive slopes, so $f'$ values are positive.",
        incorrectExplanation:
          'Not quite. Positive derivative values sit above the $x$-axis.',
        hint: 'Increasing means positive slope.',
        visual: {
          type: 'linear-cursor',
          label: 'A positive slope corresponds to a positive derivative value.',
          initialX: 2,
          slope: 1,
        },
      },
      {
        id: 'decreasing-derivative-graph',
        type: 'multiple-choice',
        title: 'Falling function',
        prompt: "If $f$ is decreasing on an interval, where should $f'$ be?",
        options: [
          { id: 'above-axis', label: 'Above the $x$-axis' },
          { id: 'below-axis', label: 'Below the $x$-axis' },
          { id: 'same-as-f', label: 'At the same height as $f$' },
          { id: 'always-zero', label: 'Exactly $0$' },
        ],
        correctOptionId: 'below-axis',
        correctExplanation:
          "Correct. Decreasing means negative slopes, so $f'$ is below the $x$-axis.",
        incorrectExplanation:
          'Not quite. Negative derivative values are below the $x$-axis.',
        hint: 'Falling from left to right means negative slope.',
        visual: {
          type: 'linear-cursor',
          label: 'A negative slope corresponds to a negative derivative value.',
          initialX: 2,
          slope: -1,
          yIntercept: 6,
        },
      },
      {
        id: 'zeros-match-flat',
        type: 'concept',
        title: 'Flat points become zeros',
        body:
          "Where $f$ has a horizontal tangent, $f'$ has value $0$. On the same axes, the green graph of $f$ is flat exactly where the blue dashed graph of $f'$ hits the $x$-axis.",
        visual: {
          type: 'function-derivative-overlay',
          label: "The green $f$ is flat where the blue dashed $f'$ crosses $0$.",
        },
      },
      {
        id: 'local-max-derivative',
        type: 'multiple-choice',
        title: 'At a smooth peak',
        prompt: "What is usually true about $f'$ at a smooth local maximum of $f$?",
        options: [
          { id: 'zero', label: "$f'$ is $0$ there" },
          { id: 'positive', label: "$f'$ is positive there" },
          { id: 'negative', label: "$f'$ is negative there" },
          { id: 'same-height', label: "$f'$ equals the height of $f$" },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. A smooth peak has a horizontal tangent, so derivative value $0$.',
        incorrectExplanation:
          'Not quite. At the very top, the tangent is flat.',
        hint: 'Smooth turning points have horizontal tangents.',
        visual: {
          type: 'function-derivative-overlay',
          label: "At a peak of green $f$, blue dashed $f'$ crosses the $x$-axis.",
          curveShape: 'peak',
        },
      },
      {
        id: 'steeper-means-farther',
        type: 'multiple-choice',
        title: 'Steepness on derivative graph',
        prompt:
          "If $f$ is rising very steeply, what should be true about $f'$?",
        options: [
          { id: 'large-positive', label: 'It should be a large positive value' },
          { id: 'large-negative', label: 'It should be a large negative value' },
          { id: 'zero', label: 'It should be $0$' },
          { id: 'same-height', label: 'It must equal $f$' },
        ],
        correctOptionId: 'large-positive',
        correctExplanation:
          'Correct. Steep upward slope means a large positive derivative.',
        incorrectExplanation:
          'Not quite. More upward steepness means a larger positive slope value.',
        hint: 'Derivative value measures steepness and sign.',
        visual: {
          type: 'slope-triangle',
          label: 'A bigger rise over the same run means a larger derivative value.',
          initialRise: 4,
          initialRun: 1,
        },
      },
      {
        id: 'compare-summary',
        type: 'multiple-choice',
        title: 'Graph comparison rule',
        prompt: "What does the graph of $f'$ show about the graph of $f$?",
        options: [
          { id: 'slopes', label: 'The slopes of $f$ at each $x$' },
          { id: 'heights', label: 'The heights of $f$ at each $x$' },
          { id: 'areas', label: 'The areas under $f$ at each $x$' },
          { id: 'inputs-only', label: 'Only the input values of $f$' },
        ],
        correctOptionId: 'slopes',
        correctExplanation:
          'Correct. The derivative graph plots slope values.',
        incorrectExplanation:
          "Not quite. $f'$ is built from slopes of $f$.",
        hint: 'Prime means slope.',
        visual: {
          type: 'function-derivative-overlay',
          label: "Compare green $f$ with blue dashed $f'$ on the same axes.",
        },
      },
    ],
  },
  {
    id: 'power-rule-intuition',
    title: 'Power Rule Intuition',
    description: 'Build intuition for why powers turn into coefficient times a lower power.',
    status: 'locked',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'power-rule-intro',
        type: 'concept',
        title: 'Powers get steeper as $x$ grows',
        body:
          'For $f(x) = x^2$, the graph gets steeper as $x$ grows. Its derivative turns out to be $2x$, so the slope grows with $x$.',
        visual: {
          type: 'tangent-cursor',
          label: 'Move right on the $x^2$ curve and watch the slope increase.',
          initialX: 3,
          curveShape: 'quadratic',
        },
      },
      {
        id: 'square-slope',
        type: 'multiple-choice',
        title: 'Derivative of $x^2$',
        prompt: 'Using the power rule idea, what is the derivative of $x^2$?',
        options: [
          { id: 'x', label: '$x$' },
          { id: 'two-x', label: '$2x$' },
          { id: 'x-cubed', label: '$x^3$' },
          { id: 'two', label: '$2$' },
        ],
        correctOptionId: 'two-x',
        correctExplanation:
          'Correct. The derivative of $x^2$ is $2x$.',
        incorrectExplanation:
          'Not quite. Bring the power down as a coefficient and lower the power by $1$.',
        hint: '$x^2$ has power $2$.',
        visual: {
          type: 'tangent-cursor',
          label: '$x^2$ has slope about $2x$ at each $x$.',
          initialX: 4,
          curveShape: 'quadratic',
        },
      },
      {
        id: 'cube-slope',
        type: 'multiple-choice',
        title: 'Derivative of $x^3$',
        prompt: 'What does the power rule suggest for the derivative of $x^3$?',
        options: [
          { id: 'three-x-squared', label: '$3x^2$' },
          { id: 'x-squared', label: '$x^2$' },
          { id: 'three-x', label: '$3x$' },
          { id: 'x-fourth', label: '$x^4$' },
        ],
        correctOptionId: 'three-x-squared',
        correctExplanation:
          'Correct. Bring down $3$ and reduce the power to $2$.',
        incorrectExplanation:
          'Not quite. The old exponent becomes the coefficient.',
        hint: 'Power $3$ becomes coefficient $3$ and new power $2$.',
        visual: {
          type: 'tangent-cursor',
          label: 'The $x^3$ graph gets steeper faster as $x$ grows.',
          initialX: 5,
          curveShape: 'cubic',
        },
      },
      {
        id: 'power-rule-pattern',
        type: 'concept',
        title: 'The pattern',
        body:
          'For a simple power $x^n$, the derivative follows the pattern $n x^{n - 1}$. The exponent moves down, then drops by $1$.',
        visual: {
          type: 'slope-triangle',
          label: 'The rule predicts slope values without drawing every tangent.',
          initialRise: 3,
          initialRun: 1,
        },
      },
      {
        id: 'fourth-power',
        type: 'multiple-choice',
        title: 'Try power $4$',
        prompt: 'What is the derivative of $x^4$?',
        options: [
          { id: 'four-x-cubed', label: '$4x^3$' },
          { id: 'x-cubed', label: '$x^3$' },
          { id: 'four-x', label: '$4x$' },
          { id: 'x-fourth', label: '$x^4$' },
        ],
        correctOptionId: 'four-x-cubed',
        correctExplanation:
          'Correct. The $4$ comes down and the new power is $3$.',
        incorrectExplanation:
          'Not quite. Use coefficient $4$ and lower the exponent by $1$.',
        hint: 'Power $4$ turns into coefficient $4$ and power $3$.',
        visual: {
          type: 'tangent-cursor',
          label: 'The $x^4$ graph starts flat and then steepens quickly.',
          initialX: 4,
          curveShape: 'quartic',
        },
      },
      {
        id: 'coefficient-power',
        type: 'multiple-choice',
        title: 'Keep the coefficient',
        prompt: 'What is the derivative of $5x^2$?',
        options: [
          { id: 'five-x', label: '$5x$' },
          { id: 'ten-x', label: '$10x$' },
          { id: 'five-x-squared', label: '$5x^2$' },
          { id: 'two-x', label: '$2x$' },
        ],
        correctOptionId: 'ten-x',
        correctExplanation:
          'Correct. The derivative of $x^2$ is $2x$, then multiply by $5$ to get $10x$.',
        incorrectExplanation:
          'Not quite. Keep the coefficient and apply the power rule.',
        hint: '$5$ times $2x$ is $10x$.',
        visual: {
          type: 'tangent-cursor',
          label: '$5x^2$ is parabola-shaped; scaling it scales its slopes too.',
          initialX: 4,
          curveShape: 'quadratic',
        },
      },
      {
        id: 'power-rule-summary',
        type: 'multiple-choice',
        title: 'Power rule summary',
        prompt: 'Which expression matches the derivative of $x^n$?',
        options: [
          { id: 'n-x-lower', label: '$n x^{n - 1}$' },
          { id: 'x-n-plus', label: '$x^{n + 1}$' },
          { id: 'n-only', label: '$n$' },
          { id: 'same', label: '$x^n$' },
        ],
        correctOptionId: 'n-x-lower',
        correctExplanation:
          'Correct. Bring the exponent down and lower it by $1$.',
        incorrectExplanation:
          'Not quite. The derivative of a power lowers the exponent.',
        hint: 'Old exponent becomes a coefficient.',
        visual: {
          type: 'slope-triangle',
          label: 'The power rule is a shortcut for tangent slopes.',
          initialRise: 4,
          initialRun: 2,
        },
      },
    ],
  },
  {
    id: 'constant-and-linear-rules',
    title: 'Constant and Linear Rules',
    description: 'Differentiate constants and lines using slope intuition.',
    status: 'locked',
    estimatedMinutes: 7,
    steps: [
      {
        id: 'constant-linear-intro',
        type: 'concept',
        title: 'Lines keep one slope',
        body:
          'A constant function has slope $0$. A linear function $mx + b$ has the same slope $m$ everywhere.',
        visual: {
          type: 'linear-cursor',
          label: 'Drag along the line and notice the slope stays fixed.',
          initialX: 2,
          slope: 2,
        },
      },
      {
        id: 'constant-rule',
        type: 'multiple-choice',
        title: 'Derivative of a constant',
        prompt: 'What is the derivative of $7$?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'seven', label: '$7$' },
          { id: 'x', label: '$x$' },
        ],
        correctOptionId: 'zero',
        correctExplanation:
          'Correct. A constant graph is horizontal, so its slope is $0$.',
        incorrectExplanation:
          'Not quite. A constant output does not change as $x$ changes.',
        hint: 'Constant means flat.',
        visual: {
          type: 'linear-cursor',
          label: 'A horizontal line represents a constant function.',
          initialX: 2,
          slope: 0,
          yIntercept: 4,
        },
      },
      {
        id: 'x-rule',
        type: 'multiple-choice',
        title: 'Derivative of $x$',
        prompt: 'What is the derivative of $x$?',
        options: [
          { id: 'zero', label: '$0$' },
          { id: 'one', label: '$1$' },
          { id: 'x', label: '$x$' },
          { id: 'two-x', label: '$2x$' },
        ],
        correctOptionId: 'one',
        correctExplanation:
          'Correct. The line $y = x$ has slope $1$ everywhere.',
        incorrectExplanation:
          'Not quite. $y = x$ rises $1$ for each $1$ step right.',
        hint: 'Think of the slope of the identity line.',
        visual: {
          type: 'linear-cursor',
          label: '$y = x$ has slope $1$ everywhere.',
          initialX: 2,
          slope: 1,
        },
      },
      {
        id: 'linear-rule-concept',
        type: 'concept',
        title: 'The intercept disappears',
        body:
          'In $mx + b$, the $b$ shifts the line up or down but does not change its steepness. That is why the derivative is $m$.',
        visual: {
          type: 'slope-triangle',
          label: 'Changing height does not change rise over run.',
          initialRise: 3,
          initialRun: 2,
        },
      },
      {
        id: 'linear-slope-rule',
        type: 'multiple-choice',
        title: 'Derivative of a line',
        prompt: 'What is the derivative of $4x + 9$?',
        options: [
          { id: 'four', label: '$4$' },
          { id: 'nine', label: '$9$' },
          { id: 'four-x', label: '$4x$' },
          { id: 'thirteen', label: '$13$' },
        ],
        correctOptionId: 'four',
        correctExplanation:
          'Correct. The slope of $4x + 9$ is $4$, so the derivative is $4$.',
        incorrectExplanation:
          'Not quite. The constant shifts the line but does not affect slope.',
        hint: 'Use the coefficient of $x$.',
        visual: {
          type: 'linear-cursor',
          label: '$4x + 9$ is a line with derivative $4$ everywhere.',
          initialX: 1.5,
          slope: 4,
          yIntercept: 1,
        },
      },
      {
        id: 'negative-linear',
        type: 'multiple-choice',
        title: 'Negative line',
        prompt: 'What is the derivative of $-3x + 2$?',
        options: [
          { id: 'three', label: '$3$' },
          { id: 'negative-three', label: '$-3$' },
          { id: 'two', label: '$2$' },
          { id: 'negative-x', label: '$-x$' },
        ],
        correctOptionId: 'negative-three',
        correctExplanation:
          'Correct. The slope is $-3$, so the derivative is $-3$.',
        incorrectExplanation:
          'Not quite. Keep the sign of the line slope.',
        hint: 'The coefficient of $x$ is negative.',
        visual: {
          type: 'linear-cursor',
          label: 'A downward line has a negative derivative.',
          initialX: 2,
          slope: -3,
          yIntercept: 8,
        },
      },
      {
        id: 'constant-linear-summary',
        type: 'multiple-choice',
        title: 'Rule summary',
        prompt: 'Which statement is correct?',
        options: [
          { id: 'constant-zero-line-m', label: 'Constants have derivative $0$ and $mx + b$ has derivative $m$' },
          { id: 'constant-self', label: 'Constants have derivative equal to themselves' },
          { id: 'line-b', label: '$mx + b$ has derivative $b$' },
          { id: 'line-mx', label: '$mx + b$ has derivative $mx$' },
        ],
        correctOptionId: 'constant-zero-line-m',
        correctExplanation:
          'Correct. Constants are flat, and a line keeps its slope $m$.',
        incorrectExplanation:
          'Not quite. Derivatives measure slope, not vertical shift.',
        hint: 'Focus on slope.',
        visual: {
          type: 'linear-cursor',
          label: 'The line slope is the derivative value.',
          initialX: 2,
          slope: 2,
        },
      },
    ],
  },
];

export function getLessonById(lessonId: string | undefined) {
  return lessons.find((lesson) => lesson.id === lessonId);
}
