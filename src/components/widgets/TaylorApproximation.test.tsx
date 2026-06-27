import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaylorApproximation } from './TaylorApproximation';
import type { TaylorApproximationVisual } from './TaylorApproximation';

const visual: TaylorApproximationVisual = {
  type: 'taylor-approximation',
  label: 'Taylor series of $e^x$.',
  func: 'exp',
};

describe('TaylorApproximation widget', () => {
  it('styles the degree range slider with the shared .widget-slider class', () => {
    render(<TaylorApproximation visual={visual} />);

    const slider = screen.getByLabelText('Taylor polynomial degree') as HTMLInputElement;
    expect(slider).toHaveAttribute('type', 'range');
    // Same fancy track/thumb/fill look as RiemannSum, via the shared stylesheet.
    expect(slider).toHaveClass('widget-slider');
    // The WebKit track-fill fraction is wired through as a CSS custom property.
    expect(slider.getAttribute('style') ?? '').toContain('--widget-slider-progress');
  });
});
