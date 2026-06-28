import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InteractiveGraph } from './InteractiveGraph';
import type { InteractiveVisual } from '../data/lessons';

const graphWidth = 360;
const graphHeight = 220;
const graphPadding = 32;

function toClientX(x: number) {
  return graphPadding + (x / 6) * (graphWidth - graphPadding * 2);
}

function toClientY(y: number) {
  return graphHeight - graphPadding - (y / 10) * (graphHeight - graphPadding * 2);
}

function mockGraphBounds() {
  const graph = screen.getByRole('img');
  graph.getBoundingClientRect = () =>
    ({
      bottom: graphHeight,
      height: graphHeight,
      left: 0,
      right: graphWidth,
      top: 0,
      width: graphWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return graph;
}

function dragHandle(handleName: string, x: number, y = 5) {
  const graph = mockGraphBounds();
  fireEvent.pointerDown(screen.getByRole('button', { name: handleName }));
  fireEvent.pointerMove(graph, { clientX: toClientX(x), clientY: toClientY(y) });
  fireEvent.pointerUp(graph);
}

/**
 * Mock the SVG as rendered WIDER than its viewBox (720x220 vs 360x220), which is
 * what the recent viewport-fill layout produces. With preserveAspectRatio="meet"
 * the 360x220 viewBox is uniformly scaled (scale 1) and centred, so there is a
 * 180px letterbox gap on each side that the pointer math must account for.
 */
function mockWideGraphBounds() {
  const graph = screen.getByRole('img');
  graph.getBoundingClientRect = () =>
    ({
      bottom: graphHeight,
      height: graphHeight,
      left: 0,
      right: 720,
      top: 0,
      width: 720,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return graph;
}

describe('InteractiveGraph', () => {
  it('updates the function point when the x-coordinate changes', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'function-cursor',
          label: 'Drag the x cursor to watch f(x) move on the curve.',
          initialX: 2,
        }}
      />,
    );

    expect(screen.getByText(/x = 2, f\(x\) = 2/i)).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(container.querySelector('.graph-y-guide')).toBeInTheDocument();
    expect(container.querySelector('.graph-cursor')).toHaveAttribute('y1', '156.8');
    expect(container.querySelector('.graph-point-label-bg')).toBeInTheDocument();
    expect(screen.getByText('(2, 2)')).toBeInTheDocument();

    dragHandle('draggable x-coordinate cursor', 4);

    expect(screen.getByText(/x = 4, f\(x\) = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(4, 4)')).toBeInTheDocument();
  });

  it('keeps the dot under the cursor when the graph is rendered wider than its viewBox', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'function-cursor',
          label: 'Drag the x cursor to watch f(x) move on the curve.',
          initialX: 2,
        }}
      />,
    );

    const graph = mockWideGraphBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable x-coordinate cursor' }));
    /* x = 4 sits at viewBox svgX 229.33; with the 180px letterbox gap the matching
       client x is 180 + 229.33 = 409.33. The pre-fix stretch-to-fill mapping would
       under-read this as x ≈ 3.5, i.e. the dot lagging the pointer. */
    fireEvent.pointerMove(graph, { clientX: 180 + toClientX(4), clientY: 110 });
    fireEvent.pointerUp(graph);

    expect(screen.getByText(/x = 4, f\(x\) = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(4, 4)')).toBeInTheDocument();
  });

  it('renders a cubic tangent curve for x-cubed examples', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'tangent-cursor',
          label: 'The $x^3$ graph gets steeper faster as $x$ grows.',
          initialX: 6,
          curveShape: 'cubic',
        }}
      />,
    );

    expect(screen.getByText(/x = 6, local slope = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(6, 9)')).toBeInTheDocument();
    expect(container.querySelector('.graph-curve')).toHaveAttribute(
      'd',
      expect.stringContaining('328 47'),
    );
  });

  it('renders constant and linear tangent curve families', () => {
    const { rerender } = render(
      <InteractiveGraph
        visual={{
          type: 'tangent-cursor',
          label: 'A constant function stays flat.',
          initialX: 5,
          curveShape: 'constant',
        }}
      />,
    );

    expect(screen.getByText(/x = 5, local slope = 0/i)).toBeInTheDocument();
    expect(screen.getByText('(5, 4)')).toBeInTheDocument();

    rerender(
      <InteractiveGraph
        visual={{
          type: 'tangent-cursor',
          label: 'A line has the same slope everywhere.',
          initialX: 2,
          curveShape: 'linear',
        }}
      />,
    );

    expect(screen.getByText(/x = 2, local slope = 1/i)).toBeInTheDocument();
    expect(screen.getByText('(2, 3)')).toBeInTheDocument();
  });

  it('updates the linear point on a line through the origin', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'linear-cursor',
          label: 'Drag x across the line and watch the output rise from the origin.',
          initialX: 4,
          slope: 1,
        }}
      />,
    );

    expect(screen.getByText(/x = 4, f\(x\) = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(4, 4)')).toBeInTheDocument();

    dragHandle('draggable linear point', 6);

    expect(screen.getByText(/x = 6, f\(x\) = 6/i)).toBeInTheDocument();
    expect(screen.getByText('(6, 6)')).toBeInTheDocument();
  });

  it('supports linear cursor lines with a positive y-intercept', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'linear-cursor',
          label: 'A downward line stays visible after shifting up.',
          initialX: 2,
          slope: -3,
          yIntercept: 8,
        }}
      />,
    );

    expect(screen.getByText(/x = 2, f\(x\) = 2/i)).toBeInTheDocument();
    expect(screen.getByText('(2, 2)')).toBeInTheDocument();

    const line = container.querySelector('.graph-curve');
    expect(Number(line?.getAttribute('y1'))).toBeCloseTo(63.2);
    expect(Number(line?.getAttribute('y2'))).toBeCloseTo(188);

    dragHandle('draggable linear point', 6);

    expect(screen.getByText(/f\(x\) = 0/i)).toBeInTheDocument();
    expect(screen.getByText('(2.7, 0)')).toBeInTheDocument();
  });

  it('supports horizontal linear cursor lines above the x-axis', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'linear-cursor',
          label: 'A horizontal line stays visually separate from the axis.',
          initialX: 2,
          slope: 0,
          yIntercept: 4,
        }}
      />,
    );

    expect(screen.getByText(/x = 2, f\(x\) = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(2, 4)')).toBeInTheDocument();

    const line = container.querySelector('.graph-curve');
    expect(Number(line?.getAttribute('y1'))).toBeCloseTo(125.6);
    expect(Number(line?.getAttribute('y2'))).toBeCloseTo(125.6);

    dragHandle('draggable linear point', 5);

    expect(screen.getByText(/x = 5, f\(x\) = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(5, 4)')).toBeInTheDocument();
  });

  it('updates the average rate when the interval endpoints change', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'rate-window',
          label: 'Move the endpoints and compare output change with input change.',
          initialStartX: 2,
          initialEndX: 3,
        }}
      />,
    );

    expect(screen.getByText(/average rate = 0\.5/i)).toBeInTheDocument();
    expect(screen.getByText('(2, 2)')).toBeInTheDocument();
    expect(screen.getByText('(3, 2.5)')).toBeInTheDocument();
    const labelBackgrounds = container.querySelectorAll('.graph-point-label-bg');
    expect(labelBackgrounds[0]).toHaveAttribute('y', '166.8');
    expect(labelBackgrounds[1]).toHaveAttribute('y', '121');

    dragHandle('draggable end point', 5);

    expect(screen.getByText(/average rate = 1\.5/i)).toBeInTheDocument();
  });

  it('updates the average rate when the left interval endpoint changes', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'rate-window',
          label: 'Move the endpoints and compare output change with input change.',
          initialStartX: 1,
          initialEndX: 4,
        }}
      />,
    );

    expect(screen.getByText(/input change = 3/i)).toBeInTheDocument();

    dragHandle('draggable start point', 2);

    expect(screen.getByText(/input change = 2/i)).toBeInTheDocument();
  });

  it('updates slope when rise and run change', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        }}
      />,
    );

    expect(screen.getByText(/slope = 1\.5/i)).toBeInTheDocument();

    dragHandle('draggable slope point', 4, 4);

    expect(screen.getByText(/slope = 1/i)).toBeInTheDocument();
  });

  it('updates slope when the left slope triangle point changes', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 4,
          initialRun: 3,
        }}
      />,
    );

    expect(screen.getByText(/rise = 4, run = 3, slope = 1\.3/i)).toBeInTheDocument();

    dragHandle('draggable slope start point', 2, 3);

    expect(screen.getByText(/rise = 2, run = 2, slope = 1/i)).toBeInTheDocument();
  });

  it('allows the slope triangle endpoint to make a horizontal line', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        }}
      />,
    );

    dragHandle('draggable slope point', 4, 1);

    expect(screen.getByText(/rise = 0, run = 3, slope = 0/i)).toBeInTheDocument();
  });

  it('allows the slope triangle endpoint to make a negative rise', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        }}
      />,
    );

    dragHandle('draggable slope point', 4, 0);

    expect(screen.getByText(/rise = -1, run = 3, slope = -0\.3/i)).toBeInTheDocument();
  });

  it('allows the slope triangle start point to create a negative rise', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        }}
      />,
    );

    dragHandle('draggable slope start point', 1, 6);

    expect(screen.getByText(/rise = -2, run = 2, slope = -1/i)).toBeInTheDocument();
  });

  it('allows slope triangle points to get close horizontally', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        }}
      />,
    );

    dragHandle('draggable slope point', 1.1, 4);

    expect(screen.getByText(/rise = 3, run = 0\.1, slope = 30/i)).toBeInTheDocument();
  });

  it('shows an undefined slope when slope triangle run is zero', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Change the rise and run to see how the line steepness changes.',
          initialRise: 3,
          initialRun: 2,
        }}
      />,
    );

    dragHandle('draggable slope point', 1, 4);

    expect(screen.getByText(/rise = 3, run = 0, slope = undefined/i)).toBeInTheDocument();
    expect(screen.queryByText(/slope = infinity/i)).not.toBeInTheDocument();
  });

  it('supports a slope triangle with custom start coordinates', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Compare the two points and watch the rise and run.',
          initialStartX: 2,
          initialStartY: 5,
          initialRise: 4,
          initialRun: 1,
        }}
      />,
    );

    expect(screen.getByText(/rise = 4, run = 1, slope = 4/i)).toBeInTheDocument();
    expect(screen.getByText('(2, 5)')).toBeInTheDocument();
    expect(screen.getByText('(3, 9)')).toBeInTheDocument();
  });

  it('auto-fits the plot so a slope triangle past the default domain stays fully on screen', () => {
    /* Regression: rise 5 / run 12 from the default base (1, 1) puts the far point
       at (13, 6) — well past the old fixed x = 0..6 window — so the hypotenuse, the
       dashed run and the "(13, 6)" label used to be drawn off-canvas. */
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Ladder triangle: $x^2 + y^2 = 13^2$',
          initialRise: 5,
          initialRun: 12,
        }}
      />,
    );

    // The view fit must NOT change the underlying math (rise / run / slope).
    expect(screen.getByText(/rise = 5, run = 12, slope = 0\.4/i)).toBeInTheDocument();

    // Both endpoints and their labels render in-view.
    expect(screen.getByText('(1, 1)')).toBeInTheDocument();
    expect(screen.getByText('(13, 6)')).toBeInTheDocument();

    const inX = (value: number) => value >= graphPadding - 0.01 && value <= graphWidth - graphPadding + 0.01;
    const inY = (value: number) => value >= graphPadding - 0.01 && value <= graphHeight - graphPadding + 0.01;

    // Both draggable handles sit inside the visible plot. Pre-fix the end handle
    // mapped to svg x ~673, far past the 328px right edge.
    for (const name of ['draggable slope start point', 'draggable slope point']) {
      const handle = screen.getByRole('button', { name });
      expect(inX(Number(handle.getAttribute('cx')))).toBe(true);
      expect(inY(Number(handle.getAttribute('cy')))).toBe(true);
    }

    // The hypotenuse and the rise/run legs stay within the plot too.
    container.querySelectorAll('line.graph-secant, line.graph-helper').forEach((line) => {
      expect(inX(Number(line.getAttribute('x1')))).toBe(true);
      expect(inX(Number(line.getAttribute('x2')))).toBe(true);
      expect(inY(Number(line.getAttribute('y1')))).toBe(true);
      expect(inY(Number(line.getAttribute('y2')))).toBe(true);
    });

    // Coordinate label halos are clamped inside the plot (no floating "(13, 6)").
    container.querySelectorAll('.graph-point-label-bg').forEach((box) => {
      const x = Number(box.getAttribute('x'));
      const y = Number(box.getAttribute('y'));
      const boxWidth = Number(box.getAttribute('width'));
      const boxHeight = Number(box.getAttribute('height'));
      expect(x).toBeGreaterThanOrEqual(graphPadding - 0.01);
      expect(x + boxWidth).toBeLessThanOrEqual(graphWidth - graphPadding + 0.01);
      expect(y).toBeGreaterThanOrEqual(graphPadding - 0.01);
      expect(y + boxHeight).toBeLessThanOrEqual(graphHeight - graphPadding + 0.01);
    });
  });

  it('clamps a slope triangle handle to the fitted domain instead of dragging it off-screen', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'slope-triangle',
          label: 'Ladder triangle: $x^2 + y^2 = 13^2$',
          initialRise: 5,
          initialRun: 12,
        }}
      />,
    );

    const graph = mockGraphBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable slope point' }));
    // Aim far past the right edge of the canvas; the handle must stop at the edge.
    fireEvent.pointerMove(graph, { clientX: 5000, clientY: 110 });
    fireEvent.pointerUp(graph);

    const cx = Number(screen.getByRole('button', { name: 'draggable slope point' }).getAttribute('cx'));
    expect(cx).toBeGreaterThanOrEqual(graphPadding - 0.01);
    expect(cx).toBeLessThanOrEqual(graphWidth - graphPadding + 0.01);
  });

  it('updates tangent slope when the cursor changes', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'tangent-cursor',
          label: 'Drag along the curve to see the tangent slope change from point to point.',
          initialX: 1,
        }}
      />,
    );

    expect(screen.getByText(/local slope = -1/i)).toBeInTheDocument();
    expect(container.querySelector('.graph-y-guide')).not.toBeInTheDocument();
    expect(screen.getByText('(1, 2.5)')).toBeInTheDocument();

    dragHandle('draggable tangent point', 4);

    expect(screen.getByText(/local slope = 2/i)).toBeInTheDocument();
    expect(screen.getByText('(4, 4)')).toBeInTheDocument();
  });

  it('supports a local maximum tangent curve', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'tangent-cursor',
          label: 'A peak has positive slopes before it and negative slopes after it.',
          initialX: 4,
          curveShape: 'peak',
        }}
      />,
    );

    expect(screen.getByText(/x = 4, local slope = 0/i)).toBeInTheDocument();
    expect(screen.getByText('(4, 8)')).toBeInTheDocument();

    dragHandle('draggable tangent point', 5);

    expect(screen.getByText(/x = 5, local slope = -1/i)).toBeInTheDocument();
    expect(screen.getByText('(5, 7.5)')).toBeInTheDocument();
  });

  it('overlays a function graph and derivative graph on shared axes', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'function-derivative-overlay',
          label: "Green is $f$; blue dashed is $f'$ on the same axes.",
          curveShape: 'peak',
        }}
      />,
    );

    expect(screen.getAllByText(/same axes/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('function graph f')).toBeInTheDocument();
    expect(screen.getByLabelText('derivative graph f prime')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(container.querySelector('.graph-function-curve')).toBeInTheDocument();
    expect(container.querySelector('.graph-derivative-curve')).toBeInTheDocument();
    expect(container.querySelector('.graph-inline-legend')).toBeInTheDocument();
    expect(container.querySelector('.interactive-graph-svg .graph-inline-legend')).toBeInTheDocument();
  });

  it('renders static nonsmooth examples', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'nonsmooth-example',
          label: 'A jump leaves no connected graph near $x = a$.',
          shape: 'jump',
        }}
      />,
    );

    expect(screen.getByText('No derivative at the marked point')).toBeInTheDocument();
    expect(screen.getByText('jump')).toBeInTheDocument();
    expect(screen.getByLabelText('open jump point')).toBeInTheDocument();
    expect(screen.getByLabelText('filled jump point')).toBeInTheDocument();
    expect(container.querySelectorAll('.graph-curve')).toHaveLength(2);
  });

  it('places the vertical tangent label clear of the tangent guide', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'nonsmooth-example',
          label: 'A vertical tangent points straight up at one spot.',
          shape: 'vertical-tangent',
        }}
      />,
    );

    const guide = container.querySelector('.graph-cursor');
    const label = screen.getByText('vertical tangent');
    const labelBackground = container.querySelector('.graph-annotation-label-bg');

    expect(label).toHaveClass('graph-annotation-label');
    expect(labelBackground).toBeInTheDocument();
    expect(Number(labelBackground?.getAttribute('x'))).toBeGreaterThan(
      Number(guide?.getAttribute('x1')) + 20,
    );
  });

  it('renders the cusp example as a scaled absolute-power curve', () => {
    const { container } = render(
      <InteractiveGraph
        visual={{
          type: 'nonsmooth-example',
          label: '$y = |x|^{2/3}$ has a pointed cusp instead of a smooth tangent.',
          shape: 'cusp',
        }}
      />,
    );

    expect(screen.getByText('|x|^(2/3)')).toBeInTheDocument();
    expect(screen.getByLabelText('cusp point')).toHaveAttribute('cy', '150.56');
    expect(container.querySelector('.graph-curve')).toHaveAttribute(
      'd',
      expect.stringContaining('180 150.56'),
    );
  });

  it('renders a real widget for a new chapter 5-11 widget type', () => {
    render(
      <InteractiveGraph
        visual={{
          type: 'riemann-sum',
          label: 'Riemann sum scaffold label',
          curve: 'parabola',
          a: 0,
          b: 2,
        }}
      />,
    );

    expect(screen.getAllByText('Riemann sum scaffold label').length).toBeGreaterThan(0);
    expect(screen.queryByText('preview coming soon')).not.toBeInTheDocument();
  });

  it('dispatches every new widget type to a rendered widget', () => {
    const visuals: InteractiveVisual[] = [
      { type: 'riemann-sum', label: 'riemann widget', curve: 'parabola', a: 0, b: 2 },
      { type: 'area-accumulation', label: 'accumulation widget', curve: 'sine', a: 0, initialB: 3 },
      { type: 'area-between-curves', label: 'between widget', top: 'line', bottom: 'parabola', a: 0, b: 1 },
      { type: 'solid-of-revolution', label: 'solid widget', method: 'disk', outerCurve: 'sqrt', a: 0, b: 4 },
      { type: 'slope-field', label: 'slope-field widget', equation: 'y' },
      { type: 'sequence-plot', label: 'sequence widget', sequence: 'one-over-n' },
      { type: 'taylor-approximation', label: 'taylor widget', func: 'exp' },
      { type: 'interval-of-convergence', label: 'interval widget', center: 0, radius: 1 },
      { type: 'parametric-curve', label: 'parametric widget', curve: 'circle', tMin: 0, tMax: 6.28 },
      { type: 'polar-curve', label: 'polar widget', curve: 'circle' },
      { type: 'conic-section', label: 'conic widget', conic: 'ellipse' },
    ];

    for (const visual of visuals) {
      const { unmount } = render(<InteractiveGraph visual={visual} />);

      expect(screen.getAllByText(visual.label).length).toBeGreaterThan(0);
      expect(screen.queryByText('preview coming soon')).not.toBeInTheDocument();

      unmount();
    }
  });
});
