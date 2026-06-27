import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RiemannSum } from './RiemannSum';
import type { RiemannSumVisual } from './RiemannSum';

const visual: RiemannSumVisual = {
  type: 'riemann-sum',
  label: 'Riemann sum of $x^2$ on $[0, 2]$.',
  curve: 'parabola',
  a: 0,
  b: 2,
};

describe('RiemannSum widget', () => {
  it('drives the subinterval slider from the shared .widget-slider styling', () => {
    render(<RiemannSum visual={visual} />);

    const slider = screen.getByLabelText('Number of subintervals') as HTMLInputElement;
    expect(slider).toHaveAttribute('type', 'range');
    // The fancy look now comes from the shared stylesheet...
    expect(slider).toHaveClass('widget-slider');
    // ...while the widget keeps its own hook for the floating value bubble, so it
    // still renders identically to before the extraction.
    expect(slider).toHaveClass('riemann-slider-input');

    // The WebKit track-fill fraction is provided on the slider's track wrapper.
    const track = slider.closest('.riemann-slider-track');
    expect(track).not.toBeNull();
    expect(track?.getAttribute('style') ?? '').toContain('--widget-slider-progress');
  });
});
