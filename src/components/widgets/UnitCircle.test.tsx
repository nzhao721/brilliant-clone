import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InteractiveGraph } from '../InteractiveGraph';
import type { UnitCircleVisual } from './UnitCircle';

const visual: UnitCircleVisual = {
  type: 'unit-circle',
  label: 'Drag the point',
  initialStepIndex: 1, // pi/6
};

describe('UnitCircle widget', () => {
  it('renders through InteractiveGraph dispatch with exact-value (fraction) readouts', () => {
    const { container } = render(<InteractiveGraph visual={visual} />);

    const svg = container.querySelector('svg.interactive-graph-svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toContain('pi/6');

    // Exact special-angle values render as real KaTeX fractions, not decimals.
    expect(container.querySelector('.mfrac')).not.toBeNull();

    // The point is a keyboard-accessible drag handle.
    expect(screen.getByRole('button', { name: /draggable point/i })).toBeInTheDocument();
  });

  it('snaps the angle forward by pi/6 with the arrow keys', () => {
    const { container } = render(<InteractiveGraph visual={visual} />);
    const handle = screen.getByRole('button', { name: /draggable point/i });

    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    const svg = container.querySelector('svg.interactive-graph-svg');
    expect(svg?.getAttribute('aria-label')).toContain('pi/3');
  });

  it('rotates to a key angle on demonstrate (discrete pi/6 stepping)', () => {
    /* jsdom has no matchMedia → reduced motion → the rotation lands on pi/2 synchronously (integer-rounded demo path). */
    const { container, rerender } = render(<InteractiveGraph visual={visual} />);
    expect(container.querySelector('svg.interactive-graph-svg')?.getAttribute('aria-label')).toContain(
      'pi/6',
    );

    rerender(<InteractiveGraph visual={visual} demonstrate={1} />);

    expect(container.querySelector('svg.interactive-graph-svg')?.getAttribute('aria-label')).toContain(
      'pi/2',
    );
  });
});
