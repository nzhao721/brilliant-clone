import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InteractiveGraph } from '../InteractiveGraph';
import { PolarCurve, type PolarCurveVisual } from './PolarCurve';

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

const svgTextContents = (container: HTMLElement, selector: string): string[] =>
  Array.from(container.querySelectorAll(selector)).map((node) => node.textContent ?? '');

/** A draggable polar point on the circle r = 3, seeded at θ = π/6. */
const pointVisual: PolarCurveVisual = {
  type: 'polar-curve',
  label: 'A polar point on the circle r = 3',
  curve: 'circle',
  radius: 3,
  mode: 'point',
  initialTheta: Math.PI / 6,
};

describe('PolarCurve widget', () => {
  it('renders a polar grid (rings + angle spokes) and NO cartesian axes', () => {
    const { container } = render(<InteractiveGraph visual={pointVisual} />);

    const svg = container.querySelector('svg.interactive-graph-svg');
    expect(svg).not.toBeNull();
    // Keeps the 360x220 viewBox so it scales within the shared height cap.
    expect(svg?.getAttribute('viewBox')).toBe('0 0 360 220');

    // Concentric radius rings + 12 radial angle spokes form the polar grid.
    expect(container.querySelectorAll('circle.widget-grid-line').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('line.widget-grid-line').length).toBe(12);

    // The shared cartesian frame is gone: no axis ticks, no "x"/"y" axis letters.
    expect(container.querySelector('.axis-tick')).toBeNull();
    const svgTexts = svgTextContents(container, '.interactive-graph-svg text');
    expect(svgTexts).not.toContain('x');
    expect(svgTexts).not.toContain('y');
  });

  it('labels the rings with their r value and the spokes with their angle', () => {
    const { container } = render(<PolarCurve visual={pointVisual} />);

    // One angle label per spoke, shown as exact multiples of π.
    const angleLabels = svgTextContents(container, '.polar-angle-label');
    expect(angleLabels).toHaveLength(12);
    expect(angleLabels).toEqual(
      expect.arrayContaining(['0', 'π/6', 'π/3', 'π/2', '2π/3', 'π', '3π/2']),
    );

    // Rings carry their numeric radius (every other ring at this zoom level).
    const rLabels = svgTextContents(container, '.polar-r-label');
    expect(rLabels.length).toBeGreaterThan(0);
    expect(rLabels).toEqual(expect.arrayContaining(['2', '4', '6']));
  });

  it('keeps every polar grid label anchored inside the 360x220 figure surface', () => {
    const { container } = render(<PolarCurve visual={pointVisual} />);

    /* The polar grid + labels must fit the capped figure height without spilling. */
    const labels = container.querySelectorAll<SVGTextElement>(
      '.polar-angle-label, .polar-r-label',
    );
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => {
      const x = Number(label.getAttribute('x'));
      const y = Number(label.getAttribute('y'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(PLOT_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(PLOT_HEIGHT);
    });
  });

  it('labels the draggable tracer with clean polar coordinates (r, θ)', () => {
    render(<PolarCurve visual={pointVisual} />);

    // r = 3 and θ = π/6 render as an exact (r, θ) pair, not decimals.
    expect(screen.getByText('(3, π/6)')).toBeInTheDocument();
  });

  it('drags the tracer to a new angle, updating (r, θ) and firing the gated interaction', () => {
    const onInteractionComplete = vi.fn();
    render(<PolarCurve visual={pointVisual} onInteractionComplete={onInteractionComplete} />);
    const svg = mockPlotBounds();

    fireEvent.pointerDown(screen.getByRole('button', { name: /draggable angle handle/i }));
    // Pointer straight up from the pole → θ = π/2 (snapped).
    fireEvent.pointerMove(svg, { clientX: 180, clientY: 40 });
    fireEvent.pointerUp(svg);

    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('(3, π/2)')).toBeInTheDocument();
  });

  it('demonstrates by sweeping the tracer and counts the demo as the interaction', () => {
    const onInteractionComplete = vi.fn();
    const { rerender } = render(
      <PolarCurve visual={pointVisual} onInteractionComplete={onInteractionComplete} />,
    );
    expect(screen.getByText('(3, π/6)')).toBeInTheDocument();
    expect(onInteractionComplete).not.toHaveBeenCalled();

    /* jsdom has no matchMedia → reduced motion → the sweep lands on θ = 2π synchronously. */
    rerender(
      <PolarCurve
        visual={pointVisual}
        onInteractionComplete={onInteractionComplete}
        demonstrate={1}
      />,
    );

    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText('(3, 2π)')).toBeInTheDocument();
  });

  it('keeps the area-sweep mode intact (shaded sector + area readout) on the polar grid', () => {
    const visual: PolarCurveVisual = {
      type: 'polar-curve',
      label: 'Sweeping a cardioid sector',
      curve: 'cardioid',
      a: 2,
      mode: 'area-sweep',
      thetaMin: 0,
      thetaMax: Math.PI * 2,
    };

    const { container } = render(<PolarCurve visual={visual} />);

    expect(container.querySelector('path.widget-area-fill')).not.toBeNull();
    expect(container.querySelector('path.graph-curve')).not.toBeNull();
    expect(screen.getByText(/Swept area/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /draggable angle handle/i })).toBeInTheDocument();

    // Still a polar grid, still no cartesian axes.
    expect(container.querySelectorAll('line.widget-grid-line').length).toBe(12);
    expect(container.querySelector('.axis-tick')).toBeNull();
  });

  it('keeps the rings and angle labels inside the 360x220 viewBox (no overflow)', () => {
    const { container } = render(<PolarCurve visual={pointVisual} />);

    /* Every ring is centred at the pole and stays fully on-canvas, so the figure scales cleanly. */
    const rings = container.querySelectorAll<SVGCircleElement>('circle.widget-grid-line');
    expect(rings.length).toBeGreaterThanOrEqual(3);
    rings.forEach((ring) => {
      const cx = Number(ring.getAttribute('cx'));
      const cy = Number(ring.getAttribute('cy'));
      const r = Number(ring.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(PLOT_WIDTH);
      expect(cy - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(PLOT_HEIGHT);
    });

    // Angle labels sit just beyond the outer ring but never spill off the surface.
    const angleLabels = container.querySelectorAll<SVGTextElement>('.polar-angle-label');
    expect(angleLabels).toHaveLength(12);
    angleLabels.forEach((label) => {
      const x = Number(label.getAttribute('x'));
      const y = Number(label.getAttribute('y'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(PLOT_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(PLOT_HEIGHT);
    });
  });
});
