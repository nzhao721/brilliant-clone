import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AreaBetweenCurves } from './AreaBetweenCurves';
import type { AreaBetweenCurvesVisual } from './AreaBetweenCurves';

const PLOT_WIDTH = 360;
const PLOT_HEIGHT = 220;
const PLOT_PADDING = 32;
const INNER_WIDTH = PLOT_WIDTH - PLOT_PADDING * 2;

/* y = x vs y = x^2 enclosing [0, 1], with no explicit xMin/xMax, so the widget
   auto-frames the small region. */
const screenshotVisual: AreaBetweenCurvesVisual = {
  type: 'area-between-curves',
  label: 'A vertical strip of height $f(x) - g(x)$ between $y = x$ (top) and $y = x^2$ (bottom).',
  top: 'line',
  bottom: 'parabola',
  a: 0,
  b: 1,
  showStrip: true,
};

function texSources(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]'))
    .map((node) => node.textContent ?? '')
    .join('\n');
}

function mockPlotBounds(): SVGElement {
  const svg = screen.getByRole('img') as unknown as SVGElement;
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

function handleCx(name: string): number {
  return Number(screen.getByRole('button', { name }).getAttribute('cx'));
}

describe('AreaBetweenCurves — auto-framed region', () => {
  it('frames the view to the bounded region so it fills most of the plot width', () => {
    render(<AreaBetweenCurves visual={screenshotVisual} />);

    const aCx = handleCx('draggable lower limit a');
    const bCx = handleCx('draggable upper limit b');

    // The [0, 1] region spans well over half the inner plot (≈ 71%), not a 1/6 sliver.
    expect((bCx - aCx) / INNER_WIDTH).toBeGreaterThan(0.6);
    // a sits in the left portion, b in the right portion of the canvas.
    expect(aCx).toBeLessThan(PLOT_WIDTH / 2);
    expect(bCx).toBeGreaterThan(PLOT_WIDTH / 2);
  });

  it('still respects an explicit xMin/xMax instead of re-zooming', () => {
    render(
      <AreaBetweenCurves
        visual={{
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
        }}
      />,
    );

    // a = 0 maps to the y-axis at the left padding edge (author's window is honored).
    expect(handleCx('draggable lower limit a')).toBeCloseTo(PLOT_PADDING, 1);
    expect(handleCx('draggable upper limit b')).toBeGreaterThan(300);
  });
});

describe('AreaBetweenCurves — both region bounds draggable', () => {
  /** Client x for a data x under the auto-framed domain [-0.2, 1.2]. */
  const clientX = (x: number) => PLOT_PADDING + ((x + 0.2) / 1.4) * INNER_WIDTH;

  it('drags the upper limit b inward and updates the region readout', () => {
    const { container } = render(<AreaBetweenCurves visual={screenshotVisual} />);
    expect(texSources(container)).toContain('[0, 1]');

    const svg = mockPlotBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable upper limit b' }));
    fireEvent.pointerMove(svg, { clientX: clientX(0.5), clientY: 110 });
    fireEvent.pointerUp(svg);

    expect(texSources(container)).toContain('[0, 0.5]');
  });

  it('drags the lower limit a inward and updates the region readout', () => {
    const { container } = render(<AreaBetweenCurves visual={screenshotVisual} />);

    const svg = mockPlotBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable lower limit a' }));
    fireEvent.pointerMove(svg, { clientX: clientX(0.3), clientY: 110 });
    fireEvent.pointerUp(svg);

    expect(texSources(container)).toContain('[0.3, 1]');
  });

  it('keeps the representative strip working alongside the new bound handles', () => {
    const { container } = render(<AreaBetweenCurves visual={screenshotVisual} />);
    // Strip starts centred at x = 0.5.
    expect(texSources(container)).toContain('x = 0.5');

    const svg = mockPlotBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable area strip' }));
    fireEvent.pointerMove(svg, { clientX: clientX(0.4), clientY: 110 });
    fireEvent.pointerUp(svg);

    expect(texSources(container)).toContain('x = 0.4');
  });
});
