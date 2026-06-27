import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParametricCurve } from './ParametricCurve';
import type { ParametricCurveVisual } from './ParametricCurve';

const circle: ParametricCurveVisual = {
  type: 'parametric-curve',
  label: 'The unit circle $(\\cos t,\\ \\sin t)$.',
  curve: 'circle',
  tMin: 0,
  tMax: Math.PI * 2,
};

/** Largest distance between any two vertices of an SVG polygon `points` string. */
function maxVertexSpan(points: string): number {
  const coords = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number) as [number, number]);
  let span = 0;
  for (let i = 0; i < coords.length; i += 1) {
    for (let j = i + 1; j < coords.length; j += 1) {
      span = Math.max(span, Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]));
    }
  }
  return span;
}

describe('ParametricCurve widget', () => {
  it('renders the curve and a keyboard-accessible tracer inside the shared figure', () => {
    const { container } = render(<ParametricCurve visual={circle} />);

    const svg = container.querySelector('svg.interactive-graph-svg');
    expect(svg).not.toBeNull();
    // Drawing stays inside the standard 360x220 surface so it fits the height cap.
    expect(svg?.getAttribute('viewBox')).toBe('0 0 360 220');

    const curve = container.querySelector('path.graph-curve');
    expect(curve).not.toBeNull();
    expect((curve?.getAttribute('d') ?? '').length).toBeGreaterThan(10);

    expect(screen.getByRole('button', { name: /draggable parameter tracer/i })).toBeInTheDocument();
  });

  it('draws one bold, clearly visible velocity arrowhead and no path clutter when showTangent', () => {
    const { container } = render(<ParametricCurve visual={{ ...circle, showTangent: true }} />);

    // Exactly one prominent arrow at the tracer; no faint path arrows competing.
    const tracerHeads = container.querySelectorAll('[data-arrow="tracer"]');
    const pathHeads = container.querySelectorAll('[data-arrow="path"]');
    expect(tracerHeads).toHaveLength(1);
    expect(pathHeads).toHaveLength(0);

    const head = tracerHeads[0];
    // Solid, high-contrast fill (info blue), not a hairline outline.
    expect(head.getAttribute('style') ?? '').toContain('--info');
    // A genuinely large arrowhead, not a tiny sliver.
    expect(maxVertexSpan(head.getAttribute('points') ?? '')).toBeGreaterThan(12);

    // The velocity readout (x', y') is present alongside it.
    expect(container.textContent ?? '').toContain("x'");
  });

  it('declutters direction mode: a few faint path ticks plus one bold heading arrow', () => {
    const { container } = render(<ParametricCurve visual={{ ...circle, showDirection: true }} />);

    // Thinned out: at most a few spaced ticks, not a dense run of arrows.
    const pathHeads = container.querySelectorAll('[data-arrow="path"]');
    expect(pathHeads.length).toBeGreaterThan(0);
    expect(pathHeads.length).toBeLessThanOrEqual(3);

    // Exactly one bold heading arrow at the tracer, and it is clearly visible.
    const tracerHeads = container.querySelectorAll('[data-arrow="tracer"]');
    expect(tracerHeads).toHaveLength(1);
    expect(maxVertexSpan(tracerHeads[0].getAttribute('points') ?? '')).toBeGreaterThan(12);

    // The faint ticks are subdued (reduced opacity) so the tracer arrow leads.
    expect(pathHeads[0].getAttribute('style') ?? '').toMatch(/opacity/);
  });

  it('drops every arrow when both direction and tangent are disabled', () => {
    const { container } = render(
      <ParametricCurve visual={{ ...circle, showDirection: false, showTangent: false }} />,
    );
    expect(container.querySelectorAll('polygon')).toHaveLength(0);
    expect(container.querySelector('path.graph-curve')).not.toBeNull();
  });

  it('styles the range slider with the shared .widget-slider class', () => {
    render(<ParametricCurve visual={circle} />);

    const slider = screen.getByLabelText('parameter t') as HTMLInputElement;
    expect(slider).toHaveAttribute('type', 'range');
    // Same fancy track/thumb/fill look as RiemannSum, via the shared stylesheet.
    expect(slider).toHaveClass('widget-slider');
    // The WebKit track-fill fraction is wired through as a CSS custom property.
    expect(slider.getAttribute('style') ?? '').toContain('--widget-slider-progress');
  });

  it('scrubbing the slider moves t and fires the gated interaction exactly once', () => {
    const onInteractionComplete = vi.fn();
    render(
      <ParametricCurve
        visual={{ ...circle, showDirection: true }}
        onInteractionComplete={onInteractionComplete}
      />,
    );

    const slider = screen.getByLabelText('parameter t') as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(0);

    fireEvent.change(slider, { target: { value: '1' } });
    expect(Number(slider.value)).toBeGreaterThan(0);
    expect(onInteractionComplete).toHaveBeenCalledTimes(1);

    // Gating fires once: a second scrub does not re-fire the completion callback.
    fireEvent.change(slider, { target: { value: '2' } });
    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });

  it('"Show me" animates the tracer across the whole parameter range', () => {
    const onInteractionComplete = vi.fn();
    const { rerender } = render(
      <ParametricCurve visual={circle} onInteractionComplete={onInteractionComplete} />,
    );
    expect(Number((screen.getByLabelText('parameter t') as HTMLInputElement).value)).toBeCloseTo(0);

    // jsdom reports reduced motion, so the demo lands on its target synchronously.
    rerender(<ParametricCurve visual={circle} demonstrate={1} onInteractionComplete={onInteractionComplete} />);

    expect(Number((screen.getByLabelText('parameter t') as HTMLInputElement).value)).toBeGreaterThan(6);
    expect(onInteractionComplete).toHaveBeenCalled();
  });
});
