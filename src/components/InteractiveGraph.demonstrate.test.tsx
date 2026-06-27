import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InteractiveVisual } from '../data/lessons';
import { InteractiveGraph } from './InteractiveGraph';

/*
 * Covers "Show me" on the original-7 graphs rendered directly in InteractiveGraph
 * (widgets are covered elsewhere). The function-cursor glides to the curve feature
 * (valley vertex at x = 2, f = 2).
 */

const cursorVisual: InteractiveVisual = {
  type: 'function-cursor',
  label: 'Glide along $f$',
  initialX: 1,
};

/** Drive the captured rAF callbacks forward to an absolute timestamp (ms). */
function flushFrame(frames: FrameRequestCallback[], timestampMs: number) {
  const callback = frames[frames.length - 1];
  if (callback) {
    act(() => callback(timestampMs));
  }
}

describe('InteractiveGraph self-demonstration (original-7 graphs)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('jumps the cursor to the curve feature on demonstrate when motion is reduced', () => {
    // jsdom has no matchMedia → reduced motion → the demo lands synchronously.
    const { rerender } = render(<InteractiveGraph visual={cursorVisual} />);
    expect(screen.getByText('(1, 2.5)')).toBeInTheDocument();

    rerender(<InteractiveGraph visual={cursorVisual} demonstrate={1} />);

    // Vertex of 0.5(x - 2)^2 + 2 sits at (2, 2).
    expect(screen.getByText('(2, 2)')).toBeInTheDocument();
  });

  it('fires onInteractionComplete when the demonstration runs', () => {
    const onInteractionComplete = vi.fn();
    const { rerender } = render(
      <InteractiveGraph visual={cursorVisual} onInteractionComplete={onInteractionComplete} />,
    );
    expect(onInteractionComplete).not.toHaveBeenCalled();

    rerender(
      <InteractiveGraph
        visual={cursorVisual}
        onInteractionComplete={onInteractionComplete}
        demonstrate={1}
      />,
    );

    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });

  it('leaps the nonsmooth dot from its start onto the feature on demonstrate', () => {
    /* The corner is at x = 3; the dot starts at x = 1.6 so the demo move is visible. */
    const visual: InteractiveVisual = { type: 'nonsmooth-example', label: 'Corner', shape: 'corner' };
    const { rerender } = render(<InteractiveGraph visual={visual} />);
    expect(screen.getByText('(1.6, 5.5)')).toBeInTheDocument();

    rerender(<InteractiveGraph visual={visual} demonstrate={1} />);

    expect(screen.getByText('(3, 3)')).toBeInTheDocument();
  });

  describe('with animation enabled', () => {
    let frames: FrameRequestCallback[];

    function enableAnimation() {
      frames = [];
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }),
      );
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
    }

    it('eases the cursor from its current x to the feature x over rAF frames', () => {
      enableAnimation();
      const { rerender } = render(<InteractiveGraph visual={cursorVisual} />);
      rerender(<InteractiveGraph visual={cursorVisual} demonstrate={1} />);

      // Start frame: still at the initial x = 1.
      flushFrame(frames, 0);
      expect(screen.getByText('(1, 2.5)')).toBeInTheDocument();

      // Halfway: x has eased from 1 toward 2 (1.5), f(1.5) = 2.125 -> "2.1".
      flushFrame(frames, 575);
      expect(screen.getByText('(1.5, 2.1)')).toBeInTheDocument();

      // End: exactly on the vertex.
      flushFrame(frames, 1150);
      expect(screen.getByText('(2, 2)')).toBeInTheDocument();
    });

    it('cancels mid-glide when the learner grabs the cursor', () => {
      enableAnimation();
      const { rerender } = render(<InteractiveGraph visual={cursorVisual} />);
      rerender(<InteractiveGraph visual={cursorVisual} demonstrate={1} />);

      flushFrame(frames, 0);
      flushFrame(frames, 575);
      expect(screen.getByText('(1.5, 2.1)')).toBeInTheDocument();

      act(() => {
        fireEvent.pointerDown(
          screen.getByRole('button', { name: /draggable x-coordinate cursor/i }),
        );
      });

      // Further frames are inert after the interrupt: it never reaches the vertex.
      flushFrame(frames, 1150);
      expect(screen.getByText('(1.5, 2.1)')).toBeInTheDocument();
      expect(screen.queryByText('(2, 2)')).not.toBeInTheDocument();
    });
  });
});
