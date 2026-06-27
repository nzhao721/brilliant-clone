import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetRenderer } from './index';
import { FunctionExplorer, type FunctionExplorerVisual } from './FunctionExplorer';

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

/**
 * The TeX source of every KaTeX formula rendered in the tree. KaTeX embeds the
 * original source in a MathML <annotation>, so a readout's math can be asserted
 * exactly even though KaTeX shatters the visual output into many positioned
 * spans (which defeats getByText on the rendered glyphs).
 */
function texSources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
    (node) => node.textContent ?? '',
  );
}

describe('FunctionExplorer widget', () => {
  it('renders a preset curve with a keyboard-accessible cursor through the registry dispatch', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Explore $f$',
      preset: 'quadratic',
    };

    const { container } = render(<WidgetRenderer visual={visual} />);

    // The shared plot frame + the brand curve are drawn.
    const svg = container.querySelector('svg.interactive-graph-svg');
    expect(svg).not.toBeNull();
    expect(container.querySelector('path.graph-curve')).not.toBeNull();

    // The cursor is a focusable drag handle, and its readout renders as KaTeX.
    expect(screen.getByRole('button', { name: /draggable point on the curve/i })).toBeInTheDocument();
    expect(texSources(container)).toContain('f(0) = 0');

    // KaTeX renders the function label cleanly (no error nodes).
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('moves the cursor with the arrow keys', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Explore',
      preset: 'quadratic',
      initialX: 0,
    };

    render(<WidgetRenderer visual={visual} />);
    const handle = screen.getByRole('button', { name: /draggable point on the curve/i });

    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    // Arrow-key nudges step the cursor by exactly 0.1 on the snapped grid.
    expect(screen.getByRole('button', { name: /at x = 0\.1/ })).toBeInTheDocument();
  });

  it('drags the cursor along the curve and updates the readout', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Explore',
      preset: 'quadratic',
      initialX: 0,
    };

    const { container } = render(<WidgetRenderer visual={visual} />);
    const svg = mockPlotBounds();

    fireEvent.pointerDown(screen.getByRole('button', { name: /draggable point on the curve/i }));
    // clientX 254 maps to x = 2.5 in the [-5, 5] window.
    fireEvent.pointerMove(svg, { clientX: 254, clientY: 110 });
    fireEvent.pointerUp(svg);

    expect(screen.getByRole('button', { name: /at x = 2\.5/ })).toBeInTheDocument();
    expect(texSources(container)).toContain('f(2.5) = 6.25');
  });

  it('marks an inline function input and reports the exact f(markedX) value', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Marked input',
      fn: (x) => x * x,
      markedX: 2,
      showCursor: false,
    };

    const { container } = render(<WidgetRenderer visual={visual} />);

    // The exact marked value renders as KaTeX in the caption.
    expect(texSources(container)).toContain('f(2) = 4');
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('shows a draggable tangent with a slope readout and a Newton x-intercept', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Tangent',
      preset: 'cubic',
      showCursor: false,
      showTangent: true,
      tangentAtX: 1,
      extendTangentToAxis: true,
    };

    const { container } = render(<FunctionExplorer visual={visual} />);

    // f(x) = x^3 has slope 3 at x = 1; the readout renders "slope" + KaTeX f'(1) = 3.
    expect(container).toHaveTextContent('slope');
    expect(texSources(container)).toContain("f'(1) = 3");
    // Tangent through (1, 1) with slope 3 hits the x-axis at 1 - 1/3 ≈ 0.67.
    expect(texSources(container)).toContain('x\\text{-intercept} = 0.67');
    expect(screen.getByRole('button', { name: /draggable tangent point/i })).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('keeps a y-axis marked-point label clear of the axis and inside the plot', () => {
    // Reproduces the limits lesson graph from the bug report: sin(x)/x with a
    // marked limit at (0, 1) that sits exactly on the centred y-axis (SVG x=180).
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'limit demo',
      fn: (x) => Math.sin(x) / x,
      xMin: -7,
      xMax: 7,
      initialX: 2,
      markedPoints: [{ x: 0, y: 1, label: 'limit 1' }],
    };

    const { container } = render(<FunctionExplorer visual={visual} />);

    // The label renders with the legibility halo behind it.
    expect(screen.getByText('limit 1')).toBeInTheDocument();
    const halo = container.querySelector('.graph-point-label-bg');
    expect(halo).not.toBeNull();

    // It is pushed to the right of the y-axis (x>180) and never clipped at the
    // right wall, so it no longer overlaps the axis line or the "1" tick.
    const labelX = Number(halo?.getAttribute('x'));
    const labelWidth = Number(halo?.getAttribute('width'));
    expect(labelX).toBeGreaterThan(180);
    expect(labelX + labelWidth).toBeLessThanOrEqual(PLOT_WIDTH - 32);
  });

  // --- "Show me" self-demonstration -----------------------------------------

  /** Drive the captured rAF callbacks forward to an absolute timestamp (ms). */
  function flushFrame(frames: FrameRequestCallback[], timestampMs: number) {
    const callback = frames[frames.length - 1];
    if (callback) {
      act(() => callback(timestampMs));
    }
  }

  const demoVisual: FunctionExplorerVisual = {
    type: 'function-explorer',
    label: 'Demo',
    fn: (x) => x * x,
    xMin: -5,
    xMax: 5,
    yMin: 0,
    yMax: 10,
    initialX: 0,
    // The cursor self-demo glides onto the marked input.
    markedX: 3,
  };

  it('jumps the cursor straight to the demonstration target when motion is reduced', () => {
    // jsdom has no matchMedia, so prefersReducedMotion() is true: the demo lands
    // on the target synchronously, with no timers.
    const { rerender } = render(<WidgetRenderer visual={demoVisual} />);
    expect(screen.getByRole('button', { name: /at x = 0/ })).toBeInTheDocument();

    rerender(<WidgetRenderer visual={demoVisual} demonstrate={1} />);

    expect(screen.getByRole('button', { name: /at x = 3/ })).toBeInTheDocument();
  });

  it('fires onInteractionComplete when a demonstration runs', () => {
    const onInteractionComplete = vi.fn();
    const { rerender } = render(
      <WidgetRenderer visual={demoVisual} onInteractionComplete={onInteractionComplete} />,
    );
    expect(onInteractionComplete).not.toHaveBeenCalled();

    rerender(
      <WidgetRenderer
        visual={demoVisual}
        onInteractionComplete={onInteractionComplete}
        demonstrate={1}
      />,
    );

    expect(onInteractionComplete).toHaveBeenCalledTimes(1);
  });

  // In a Show-me context (demonstrate defined, i.e. a concept slide) the animated
  // handle must START clear of the demo target, otherwise the glide is invisible.
  // Questions/previews (no demonstrate) keep the authored start untouched, which
  // the earlier marked-input / tangent tests above already exercise.
  it('seeds the cursor away from a coinciding marked input so Show me visibly moves', () => {
    // markedX 3 sits exactly on the window centre (the cursor's default seed), so
    // without the guard the cursor would start on the demo target and not move.
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Marked seed',
      fn: (x) => x * x,
      xMin: 0,
      xMax: 6,
      yMin: 0,
      yMax: 36,
      markedX: 3,
    };

    const { rerender } = render(<WidgetRenderer visual={visual} demonstrate={0} />);

    // The cursor does NOT begin on the marked input x = 3.
    const startAria = screen
      .getByRole('button', { name: /draggable point on the curve/i })
      .getAttribute('aria-label');
    expect(startAria).not.toContain('at x = 3.');

    // Show me (reduced-motion jump) lands the cursor exactly on the marked input.
    rerender(<WidgetRenderer visual={visual} demonstrate={1} />);
    expect(
      screen
        .getByRole('button', { name: /draggable point on the curve/i })
        .getAttribute('aria-label'),
    ).toContain('at x = 3.');
  });

  it('seeds the tangent away from tangentAtX so Show me visibly glides onto it', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Tangent seed',
      preset: 'cubic',
      xMin: -3,
      xMax: 3,
      yMin: -27,
      yMax: 27,
      showCursor: false,
      showTangent: true,
      tangentAtX: 1,
    };

    const { container, rerender } = render(<WidgetRenderer visual={visual} demonstrate={0} />);

    // The tangent point does NOT begin at the demonstration target x = 1.
    const startAria = screen
      .getByRole('button', { name: /draggable tangent point/i })
      .getAttribute('aria-label');
    expect(startAria).not.toContain('at x = 1,');

    // Show me lands the tangent on x = 1, where f(x) = x^3 has slope 3.
    rerender(<WidgetRenderer visual={visual} demonstrate={1} />);
    expect(texSources(container)).toContain("f'(1) = 3");
  });

  it('keeps the authored tangent start when there is no Show me (question/preview)', () => {
    // Same config, but with no `demonstrate`: the tangent must begin exactly at
    // tangentAtX = 1 (slope 3) so question alignment is preserved.
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Tangent (no demo)',
      preset: 'cubic',
      xMin: -3,
      xMax: 3,
      yMin: -27,
      yMax: 27,
      showCursor: false,
      showTangent: true,
      tangentAtX: 1,
    };

    const { container } = render(<WidgetRenderer visual={visual} />);
    expect(texSources(container)).toContain("f'(1) = 3");
  });

  describe('with animation enabled', () => {
    let frames: FrameRequestCallback[];

    afterEach(() => {
      vi.unstubAllGlobals();
    });

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

    it('eases the cursor toward the target over rAF frames, reaching it at the end', () => {
      enableAnimation();
      const { rerender } = render(<WidgetRenderer visual={demoVisual} />);
      rerender(<WidgetRenderer visual={demoVisual} demonstrate={1} />);

      // First frame establishes the start; the cursor is still at the origin.
      flushFrame(frames, 0);
      expect(screen.getByRole('button', { name: /at x = 0/ })).toBeInTheDocument();

      // Halfway through the ~1.15s tween it has moved partway (0 -> 3, eased).
      flushFrame(frames, 575);
      expect(screen.getByRole('button', { name: /at x = 1\.5/ })).toBeInTheDocument();

      // At the end it lands exactly on the marked input.
      flushFrame(frames, 1150);
      expect(screen.getByRole('button', { name: /at x = 3/ })).toBeInTheDocument();
    });

    it('cancels the demonstration when the learner grabs the handle mid-glide', () => {
      enableAnimation();
      const { rerender } = render(<WidgetRenderer visual={demoVisual} />);
      rerender(<WidgetRenderer visual={demoVisual} demonstrate={1} />);

      flushFrame(frames, 0);
      flushFrame(frames, 575);
      const handle = screen.getByRole('button', { name: /at x = 1\.5/ });

      // Grabbing the handle interrupts the demo...
      act(() => {
        fireEvent.pointerDown(handle);
      });

      // ...so any further frames are inert: the cursor never reaches the target.
      flushFrame(frames, 1150);
      expect(screen.getByRole('button', { name: /at x = 1\.5/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /at x = 3/ })).not.toBeInTheDocument();
    });
  });

  it('overlays a secondary curve, the identity line, and reflected points for an inverse', () => {
    const visual: FunctionExplorerVisual = {
      type: 'function-explorer',
      label: 'Inverse pair',
      preset: 'quadratic',
      xMin: 0,
      xMax: 9,
      yMin: 0,
      yMax: 9,
      secondaryFn: (x) => Math.sqrt(x),
      showIdentityLine: true,
      markedPoints: [
        { x: 3, y: 9, label: '(3, 9)' },
        { x: 9, y: 3, label: '(9, 3)' },
      ],
      showCursor: false,
    };

    const { container } = render(<WidgetRenderer visual={visual} />);

    expect(container.querySelector('[aria-label="secondary function"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="identity line y = x"]')).not.toBeNull();
    expect(screen.getByText('(3, 9)')).toBeInTheDocument();
    expect(screen.getByText('(9, 3)')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).toBeNull();
  });
});
