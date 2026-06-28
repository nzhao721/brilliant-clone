import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AreaAccumulation } from './AreaAccumulation';
import type { AreaAccumulationVisual } from './AreaAccumulation';

const PLOT_WIDTH = 360;
const PLOT_HEIGHT = 220;
const PLOT_PADDING = 32;

/* y = x on a fixed 0..6 window, so ∫_a^b x dx = (b² - a²) / 2 is easy to predict. */
const baseVisual: AreaAccumulationVisual = {
  type: 'area-accumulation',
  label: 'Signed area under $y = x$.',
  curve: 'line',
  a: 1,
  initialB: 4,
  xMin: 0,
  xMax: 6,
};

/** The TeX source of every KaTeX formula rendered in the tree. */
function texSources(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]'))
    .map((node) => node.textContent ?? '')
    .join('\n');
}

/** Mock the plot SVG's layout box (identity-mapped 360x220) so pointer math is deterministic. */
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

/** Client x for a data x under the identity-mapped box, domain [0, 6]. */
function clientX(x: number): number {
  return PLOT_PADDING + (x / 6) * (PLOT_WIDTH - PLOT_PADDING * 2);
}

describe('AreaAccumulation — both integration limits draggable', () => {
  it('exposes a separate draggable handle for each limit a and b', () => {
    render(<AreaAccumulation visual={baseVisual} />);
    expect(screen.getByRole('button', { name: 'draggable lower limit a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'draggable upper limit b' })).toBeInTheDocument();
  });

  it('drags the lower limit a and updates the shaded ∫_a^b readout', () => {
    const { container } = render(<AreaAccumulation visual={baseVisual} />);
    // Initial limits 1..4: ∫_1^4 x dx = 7.5.
    expect(texSources(container)).toContain('\\int_{1}^{4} f(x)\\,dx = 7.5');

    const svg = mockPlotBounds();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable lower limit a' }));
    fireEvent.pointerMove(svg, { clientX: clientX(2), clientY: 110 });
    fireEvent.pointerUp(svg);

    // a moved to 2: ∫_2^4 x dx = 6, and the lower limit in the readout follows.
    expect(texSources(container)).toContain('\\int_{2}^{4} f(x)\\,dx = 6');
  });

  it('keeps a strictly left of b (clamps instead of crossing)', () => {
    const { container } = render(<AreaAccumulation visual={baseVisual} />);
    const svg = mockPlotBounds();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable lower limit a' }));
    // Aim a well past b = 4; it must stop one snap step short of b.
    fireEvent.pointerMove(svg, { clientX: clientX(5.5), clientY: 110 });
    fireEvent.pointerUp(svg);

    expect(texSources(container)).toContain('\\int_{3.9}^{4}');
  });

  it('fires interaction gating once when the lower limit is dragged', () => {
    const onInteractionComplete = vi.fn();
    render(<AreaAccumulation visual={baseVisual} onInteractionComplete={onInteractionComplete} />);
    const svg = mockPlotBounds();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable lower limit a' }));
    fireEvent.pointerMove(svg, { clientX: clientX(2), clientY: 110 });
    fireEvent.pointerMove(svg, { clientX: clientX(2.5), clientY: 110 });
    fireEvent.pointerUp(svg);

    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });

  it('still drags the upper limit b independently', () => {
    const { container } = render(<AreaAccumulation visual={baseVisual} />);
    const svg = mockPlotBounds();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'draggable upper limit b' }));
    fireEvent.pointerMove(svg, { clientX: clientX(5), clientY: 110 });
    fireEvent.pointerUp(svg);

    // ∫_1^5 x dx = 12.
    expect(texSources(container)).toContain('\\int_{1}^{5} f(x)\\,dx = 12');
  });

  it('still sweeps b to the domain max on "Show me" (reduced-motion jump)', () => {
    const { container, rerender } = render(<AreaAccumulation visual={baseVisual} demonstrate={0} />);
    rerender(<AreaAccumulation visual={baseVisual} demonstrate={1} />);

    // b lands on xMax = 6: ∫_1^6 x dx = 17.5; a is untouched.
    expect(texSources(container)).toContain('\\int_{1}^{6} f(x)\\,dx = 17.5');
  });
});
