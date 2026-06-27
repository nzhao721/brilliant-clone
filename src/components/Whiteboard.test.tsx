import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Whiteboard } from './Whiteboard';

/*
 * jsdom has no real 2D canvas, so (like the repo's workImage/game tests) we stub
 * getContext/toDataURL and drive interaction through Pointer/Wheel events. We verify
 * the full-screen overlay, the mode/pan/zoom/reset controls, that drawing records
 * strokes in WORLD coordinates (they survive panning), and the all-content export —
 * never real pixels. getBoundingClientRect is 0,0 in jsdom, so screen == clientX/Y.
 */

const STUB_JPEG = 'data:image/jpeg;base64,QUFB';

function stubContext() {
  return new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(stubContext());
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(STUB_JPEG);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getCanvas() {
  return screen.getByLabelText('Scratch paper drawing area');
}

function drawStroke(from: [number, number], to: [number, number], pointerId = 1) {
  const canvas = getCanvas();
  fireEvent.pointerDown(canvas, { pointerId, clientX: from[0], clientY: from[1], button: 0 });
  fireEvent.pointerMove(canvas, { pointerId, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { pointerId, clientX: to[0], clientY: to[1] });
}

function panWithTool(from: [number, number], to: [number, number], pointerId = 9) {
  fireEvent.click(screen.getByRole('button', { name: 'Pan' }));
  const canvas = getCanvas();
  fireEvent.pointerDown(canvas, { pointerId, clientX: from[0], clientY: from[1], button: 0 });
  fireEvent.pointerMove(canvas, { pointerId, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { pointerId, clientX: to[0], clientY: to[1] });
}

describe('Whiteboard overlay', () => {
  it('renders a full-screen dialog with the full tool/pan/zoom set when open', () => {
    render(<Whiteboard open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Scratch paper' })).toBeInTheDocument();
    expect(getCanvas()).toBeInTheDocument();
    for (const name of [
      'Pen',
      'Eraser',
      'Pan',
      'Undo',
      'Clear',
      'Zoom in',
      'Zoom out',
      'Reset view',
      'Done',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('renders nothing when closed', () => {
    render(<Whiteboard open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when Done is clicked', () => {
    const onClose = vi.fn();
    render(<Whiteboard open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles between Draw and Pan mode', () => {
    render(<Whiteboard open onClose={vi.fn()} />);
    const pan = screen.getByRole('button', { name: 'Pan' });

    expect(pan).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pan);
    expect(pan).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Whiteboard drawing + export', () => {
  it('exports the all-content image after a stroke and null after clearing', () => {
    const onChange = vi.fn();
    render(<Whiteboard open onClose={vi.fn()} onChange={onChange} />);

    drawStroke([10, 10], [110, 60]);
    expect(onChange).toHaveBeenLastCalledWith(STUB_JPEG);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('submits the current full-content image via onSubmit ("Check my work")', () => {
    const onSubmit = vi.fn();
    render(<Whiteboard open onClose={vi.fn()} onSubmit={onSubmit} />);

    drawStroke([10, 10], [110, 60]);
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }));

    expect(onSubmit).toHaveBeenLastCalledWith(STUB_JPEG);
  });

  it('enables undo/clear only after drawing and undoes back to blank', () => {
    const onChange = vi.fn();
    render(<Whiteboard open onClose={vi.fn()} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();

    drawStroke([20, 20], [60, 60]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('switches to the eraser tool', () => {
    render(<Whiteboard open onClose={vi.fn()} />);
    const eraser = screen.getByRole('button', { name: 'Eraser' });

    expect(eraser).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(eraser);
    expect(eraser).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Whiteboard infinite canvas pan/zoom', () => {
  it('pans the viewport with the pan tool', () => {
    render(<Whiteboard open onClose={vi.fn()} />);

    panWithTool([300, 300], [350, 360]);

    const canvas = getCanvas();
    expect(canvas.getAttribute('data-pan-x')).toBe('50');
    expect(canvas.getAttribute('data-pan-y')).toBe('60');
  });

  it('pans via wheel / trackpad scroll', () => {
    render(<Whiteboard open onClose={vi.fn()} />);

    fireEvent.wheel(getCanvas(), { deltaX: 30, deltaY: 40 });

    const canvas = getCanvas();
    expect(canvas.getAttribute('data-pan-x')).toBe('-30');
    expect(canvas.getAttribute('data-pan-y')).toBe('-40');
  });

  it('zooms in with Ctrl/Cmd + wheel', () => {
    render(<Whiteboard open onClose={vi.fn()} />);
    const canvas = getCanvas();
    const before = Number(canvas.getAttribute('data-zoom'));

    fireEvent.wheel(canvas, { deltaY: -120, ctrlKey: true });

    expect(Number(canvas.getAttribute('data-zoom'))).toBeGreaterThan(before);
  });

  it('resets the view back to the origin', () => {
    render(<Whiteboard open onClose={vi.fn()} />);
    panWithTool([300, 300], [350, 360]);
    expect(getCanvas().getAttribute('data-pan-x')).toBe('50');

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    const canvas = getCanvas();
    expect(canvas.getAttribute('data-pan-x')).toBe('0');
    expect(canvas.getAttribute('data-pan-y')).toBe('0');
  });

  it('records strokes in WORLD coordinates after panning (not screen coords)', () => {
    render(<Whiteboard open onClose={vi.fn()} />);

    // Pan the viewport by (50, 60).
    panWithTool([300, 300], [350, 360]);

    // Draw at the same screen point; world = screen - pan.
    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));
    drawStroke([100, 100], [140, 140], 2);

    // World bbox: (100-50,100-60)=(50,40) .. (140-50,140-60)=(90,80).
    expect(getCanvas().getAttribute('data-content-bounds')).toBe('50,40,90,80');
  });

  it('keeps stored content fixed in world space regardless of pan (export covers all)', () => {
    render(<Whiteboard open onClose={vi.fn()} />);

    drawStroke([10, 10], [110, 60]);
    expect(getCanvas().getAttribute('data-content-bounds')).toBe('10,10,110,60');

    // Panning the viewport must NOT move the stored strokes.
    panWithTool([0, 0], [200, 150]);
    expect(getCanvas().getAttribute('data-content-bounds')).toBe('10,10,110,60');
  });
});
