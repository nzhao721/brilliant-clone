import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InteractiveGraph } from '../InteractiveGraph';
import type { SolidOfRevolutionVisual } from './SolidOfRevolution';

const PLOT_WIDTH = 360;
const PLOT_HEIGHT = 220;

/** Mock the plot SVG's layout box so pointer math is deterministic in jsdom. */
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

/** The TeX source of every KaTeX formula rendered in the tree. */
function texSources(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]'))
    .map((node) => node.textContent ?? '')
    .join('\n');
}

/** Numeric values of the plot's axis tick labels (x and y), used to read the framing. */
function axisTickValues(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('.axis-tick text'))
    .map((node) => Number(node.textContent))
    .filter((value) => Number.isFinite(value));
}

const shellVisual = (overrides: Partial<SolidOfRevolutionVisual> = {}): SolidOfRevolutionVisual => ({
  type: 'solid-of-revolution',
  label: 'Revolving the region about the $y$-axis sweeps out nested shells.',
  method: 'shell',
  outerCurve: 'parabola',
  axis: 'y',
  a: 0,
  b: 2,
  initialSlice: 1,
  ...overrides,
});

describe('SolidOfRevolution — shell method (faux-3D nested shells)', () => {
  it('renders a 3D nest of cylindrical shells with a draggable representative shell', () => {
    const { container } = render(<InteractiveGraph visual={shellVisual()} />);

    const svg = container.querySelector('svg.interactive-graph-svg');
    expect(svg).not.toBeNull();
    // Keeps the standard figure surface so it stays inside the lesson height cap.
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`);
    expect(svg?.getAttribute('aria-label')).toContain('nested shells');

    /* The nest is concentric ellipses plus the shell's hollow rings (evenodd annulus paths). */
    expect(container.querySelectorAll('svg.interactive-graph-svg ellipse').length).toBeGreaterThan(4);
    expect(container.querySelectorAll('path[fill-rule="evenodd"]').length).toBeGreaterThanOrEqual(2);

    // Readout: radius x, height f(x), the shell volume element, and total V.
    const tex = texSources(container);
    expect(tex).toContain('\\text{radius}=1');
    expect(tex).toContain('\\Delta V = 2\\pi x\\,f(x)\\,\\Delta x');
    expect(tex).toContain('V \\approx 25.13');
    expect(container).toHaveTextContent('Total');
    expect(container).toHaveTextContent('Drag the representative shell');

    // A keyboard/pointer accessible drag handle on the shell.
    expect(
      screen.getByRole('button', { name: /draggable representative shell at x = 1/i }),
    ).toBeInTheDocument();
    // The 2D disk handle name is not used by the shell view.
    expect(
      screen.queryByRole('button', { name: /draggable representative element/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the whole faux-3D scene inside the 360x220 figure surface', () => {
    /* At the outer edge shells are widest/tallest; verify nothing overflows the viewBox. */
    const { container } = render(<InteractiveGraph visual={shellVisual({ initialSlice: 2 })} />);
    const ellipses = Array.from(container.querySelectorAll('svg.interactive-graph-svg ellipse'));
    expect(ellipses.length).toBeGreaterThan(0);

    for (const el of ellipses) {
      const cx = Number(el.getAttribute('cx'));
      const cy = Number(el.getAttribute('cy'));
      const rx = Number(el.getAttribute('rx'));
      const ry = Number(el.getAttribute('ry'));
      expect(cx - rx).toBeGreaterThanOrEqual(-0.5);
      expect(cx + rx).toBeLessThanOrEqual(PLOT_WIDTH + 0.5);
      expect(cy - ry).toBeGreaterThanOrEqual(-0.5);
      expect(cy + ry).toBeLessThanOrEqual(PLOT_HEIGHT + 0.5);
    }
  });

  it('nudges the shell with the arrow keys and fires interaction gating once', () => {
    const onInteractionComplete = vi.fn();
    render(<InteractiveGraph visual={shellVisual()} onInteractionComplete={onInteractionComplete} />);

    const handle = screen.getByRole('button', { name: /draggable representative shell at x = 1/i });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    expect(
      screen.getByRole('button', { name: /draggable representative shell at x = 1\.1/i }),
    ).toBeInTheDocument();
    expect(onInteractionComplete).toHaveBeenCalledTimes(1);

    // Further nudges keep moving the shell but never re-fire the one-shot gate.
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });

  it('drags the representative shell to a new radius and updates the volume readout', () => {
    const onInteractionComplete = vi.fn();
    const { container } = render(
      <InteractiveGraph visual={shellVisual()} onInteractionComplete={onInteractionComplete} />,
    );
    const svg = mockPlotBounds();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /draggable representative shell at x = 1/i }),
    );
    /* clientX 292.5 = 112.5px right of cx=180; at sx=75 px/unit, radius 1.5 on [0, 2]. */
    fireEvent.pointerMove(svg, { clientX: 292.5, clientY: 120 });
    fireEvent.pointerUp(svg);

    expect(
      screen.getByRole('button', { name: /draggable representative shell at x = 1\.5/i }),
    ).toBeInTheDocument();
    const tex = texSources(container);
    expect(tex).toContain('\\text{radius}=1.5,\\ \\text{height}=2.25');
    expect(tex).toContain('\\Delta V = 2\\pi x\\,f(x)\\,\\Delta x \\approx 4.24');
    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });

  it('sweeps the shell to the outer edge on "Show me" (reduced-motion jump)', () => {
    const onInteractionComplete = vi.fn();
    const { rerender } = render(
      <InteractiveGraph visual={shellVisual()} onInteractionComplete={onInteractionComplete} />,
    );
    expect(
      screen.getByRole('button', { name: /draggable representative shell at x = 1/i }),
    ).toBeInTheDocument();

    /* jsdom has no matchMedia -> reduced motion -> the shell lands on b = 2 synchronously. */
    rerender(
      <InteractiveGraph
        visual={shellVisual()}
        onInteractionComplete={onInteractionComplete}
        demonstrate={1}
      />,
    );

    expect(
      screen.getByRole('button', { name: /draggable representative shell at x = 2/i }),
    ).toBeInTheDocument();
    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });
});

describe('SolidOfRevolution — disk / washer (2D cross-section preserved)', () => {
  it('renders the disk method as a 2D cross-section with its edge-on disk', () => {
    const visual: SolidOfRevolutionVisual = {
      type: 'solid-of-revolution',
      label: 'Disks from revolving $y = \\sqrt{x}$.',
      method: 'disk',
      outerCurve: 'sqrt',
      a: 0,
      b: 4,
    };
    const { container } = render(<InteractiveGraph visual={visual} />);

    expect(container.querySelector('svg.interactive-graph-svg')).not.toBeNull();
    expect(container.querySelector('path.graph-curve')).not.toBeNull();
    // The disk method keeps the original handle name and an edge-on disk ellipse.
    expect(
      screen.getByRole('button', { name: /draggable representative element/i }),
    ).toBeInTheDocument();
    expect(container.querySelector('ellipse')).not.toBeNull();
    expect(texSources(container)).toContain('\\Delta V = \\pi R^2\\,\\Delta x');
  });

  it('renders the washer method with an inner hole and the washer volume term', () => {
    const visual: SolidOfRevolutionVisual = {
      type: 'solid-of-revolution',
      label: 'Washers between $y = x$ and $y = x^2$.',
      method: 'washer',
      outerCurve: 'line',
      innerCurve: 'parabola',
      a: 0,
      b: 1,
    };
    const { container } = render(<InteractiveGraph visual={visual} />);

    expect(container.querySelector('svg.interactive-graph-svg')).not.toBeNull();
    expect(texSources(container)).toContain('\\Delta V = \\pi\\,(R^2 - r^2)\\,\\Delta x');
    expect(
      screen.getByRole('button', { name: /draggable representative element/i }),
    ).toBeInTheDocument();
  });

  it('frames the washer view to the bounded region instead of a wide sliver', () => {
    const visual: SolidOfRevolutionVisual = {
      type: 'solid-of-revolution',
      label: 'Washers between $y = x$ and $y = x^2$ on $[0, 1]$.',
      method: 'washer',
      outerCurve: 'line',
      innerCurve: 'parabola',
      a: 0,
      b: 1,
    };
    const { container } = render(<InteractiveGraph visual={visual} />);

    const ticks = axisTickValues(container);
    /* The region only reaches x = 1, so the framing keeps the largest tick just
       past it rather than running the x-axis out to 6. */
    expect(Math.max(...ticks)).toBeLessThanOrEqual(1.5);
    expect(ticks).toContain(1);
  });

  it('frames the disk view to fit the region (no leftover empty axis out to 6)', () => {
    const visual: SolidOfRevolutionVisual = {
      type: 'solid-of-revolution',
      label: 'Disks from revolving $y = \\sqrt{x}$ on $[0, 4]$.',
      method: 'disk',
      outerCurve: 'sqrt',
      a: 0,
      b: 4,
    };
    const { container } = render(<InteractiveGraph visual={visual} />);

    const ticks = axisTickValues(container);
    // b = 4, so the framing should stop just past 4 rather than a fixed run-out to 6.
    expect(ticks).not.toContain(6);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(4.6);
    expect(ticks).toContain(4);
  });

  it('draws the representative disk slice as a slab with visible nonzero thickness', () => {
    const visual: SolidOfRevolutionVisual = {
      type: 'solid-of-revolution',
      label: 'Disks from revolving $y = \\sqrt{x}$ on $[0, 4]$.',
      method: 'disk',
      outerCurve: 'sqrt',
      a: 0,
      b: 4,
    };
    const { container } = render(<InteractiveGraph visual={visual} />);

    const slab = container.querySelector('rect.widget-slice-slab');
    expect(slab).not.toBeNull();
    const width = Number(slab?.getAttribute('width'));
    const height = Number(slab?.getAttribute('height'));
    // A band of real width (Δx), not an infinitely-thin line, spanning the diameter.
    expect(width).toBeGreaterThan(8);
    expect(height).toBeGreaterThan(0);
  });

  it('keeps the washer slab hollow with the inner radius still visible', () => {
    const visual: SolidOfRevolutionVisual = {
      type: 'solid-of-revolution',
      label: 'Washers between $y = x$ and $y = x^2$ on $[0, 1]$.',
      method: 'washer',
      outerCurve: 'line',
      innerCurve: 'parabola',
      a: 0,
      b: 1,
    };
    const { container } = render(<InteractiveGraph visual={visual} />);

    // The washer slab is the solid material only: a top band and a bottom band,
    // leaving the central hole empty so the thickness reads as a tube wall.
    const bands = container.querySelectorAll('rect.widget-slice-slab');
    expect(bands.length).toBe(2);
    for (const band of Array.from(bands)) {
      expect(Number(band.getAttribute('width'))).toBeGreaterThan(8);
    }

    // The inner hole rim (dashed) keeps the inner radius r visible in washer mode.
    const innerRim = container.querySelector('ellipse[stroke-dasharray]');
    expect(innerRim).not.toBeNull();
    expect(Number(innerRim?.getAttribute('ry'))).toBeGreaterThan(0);
  });
});
