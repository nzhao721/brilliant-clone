import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HorizontalLineTest, findIntersections } from './HorizontalLineTest';

const PLOT_WIDTH = 360;
const PLOT_HEIGHT = 220;

/** Mock the plot SVG's layout box so pointer math is deterministic in jsdom. */
function mockPlotBounds() {
  const svg = screen.getByRole('img');
  svg.getBoundingClientRect = () =>
    ({
      bottom: PLOT_HEIGHT,
      height: PLOT_HEIGHT,
      left: 0,
      right: PLOT_WIDTH,
      top: 0,
      width: PLOT_WIDTH,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return svg;
}

describe('findIntersections', () => {
  it('counts the crossings of a parabola with a level line', () => {
    expect(findIntersections((x) => x * x, 4, -3, 3)).toHaveLength(2);
    expect(findIntersections((x) => x * x, 0, -3, 3)).toHaveLength(1); // tangential vertex
    expect(findIntersections((x) => x * x, -0.5, -3, 3)).toHaveLength(0);
  });

  it('finds a single crossing for a strictly increasing cubic at any height', () => {
    expect(findIntersections((x) => x * x * x, 3, -2, 2)).toHaveLength(1);
    expect(findIntersections((x) => x * x * x, -5, -2, 2)).toHaveLength(1);
  });

  it('finds the repeated crossings of cosine across two periods', () => {
    expect(findIntersections((x) => Math.cos(x), 0.5, -2 * Math.PI, 2 * Math.PI)).toHaveLength(4);
  });
});

describe('HorizontalLineTest widget', () => {
  it('marks two intersections and a failing verdict for the default parabola', () => {
    const { container } = render(
      <HorizontalLineTest visual={{ type: 'horizontal-line-test', label: 'HLT', curve: 'parabola' }} />,
    );

    expect(container.querySelectorAll('.hlt-intersection')).toHaveLength(2);
    expect(screen.getByText('fails the horizontal line test')).toBeInTheDocument();

    const aria = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(aria).toContain('2 points');
    expect(aria).toMatch(/fails the horizontal line test/i);
  });

  it('marks one intersection and a passing verdict for the cubic', () => {
    const { container } = render(
      <HorizontalLineTest visual={{ type: 'horizontal-line-test', label: 'HLT', curve: 'cubic' }} />,
    );

    expect(container.querySelectorAll('.hlt-intersection')).toHaveLength(1);
    expect(screen.getByText('passes here')).toBeInTheDocument();

    const aria = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(aria).toContain('1 point');
    expect(aria).toMatch(/passes the horizontal line test/i);
  });

  it('updates the count to zero when the line is dragged below the parabola', () => {
    const { container } = render(
      <HorizontalLineTest visual={{ type: 'horizontal-line-test', label: 'HLT', curve: 'parabola' }} />,
    );

    const svg = mockPlotBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: /draggable horizontal line/i }));
    // clientY ~180.6 maps to y ~ -0.5 on the parabola window (yMin -1, yMax 9.5).
    fireEvent.pointerMove(svg, { clientX: 180, clientY: 180.6 });
    fireEvent.pointerUp(svg);

    expect(container.querySelectorAll('.hlt-intersection')).toHaveLength(0);
    expect(screen.getByText('no intersection here')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label') ?? '').toContain('0 points');
  });

  it('lets the learner switch the plotted function with the shape buttons', () => {
    const { container } = render(
      <HorizontalLineTest
        visual={{
          type: 'horizontal-line-test',
          label: 'HLT',
          curve: 'parabola',
          selectableShapes: ['parabola', 'cubic', 'abs', 'cosine'],
        }}
      />,
    );

    // Starts on the failing parabola.
    expect(screen.getByRole('img').getAttribute('aria-label') ?? '').toMatch(/fails the horizontal line test/i);

    fireEvent.click(screen.getByRole('button', { name: 'x\u00B3' }));

    expect(container.querySelectorAll('.hlt-intersection')).toHaveLength(1);
    expect(screen.getByRole('img').getAttribute('aria-label') ?? '').toMatch(/passes the horizontal line test/i);
  });
});
