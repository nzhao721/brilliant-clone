import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SequencePlot } from './SequencePlot';
import type { SequencePlotVisual } from './SequencePlot';

const visual: SequencePlotVisual = {
  type: 'sequence-plot',
  label: 'The sequence $a_n = 1/n$.',
  sequence: 'one-over-n',
};

describe('SequencePlot widget', () => {
  it('styles the "terms shown" range slider with the shared .widget-slider class', () => {
    render(<SequencePlot visual={visual} />);

    const slider = screen.getByLabelText('Number of terms shown') as HTMLInputElement;
    expect(slider).toHaveAttribute('type', 'range');
    // Same fancy track/thumb/fill look as RiemannSum, via the shared stylesheet.
    expect(slider).toHaveClass('widget-slider');
    // The WebKit track-fill fraction is wired through as a CSS custom property.
    expect(slider.getAttribute('style') ?? '').toContain('--widget-slider-progress');
  });
});
