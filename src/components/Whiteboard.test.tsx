import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Whiteboard } from './Whiteboard';

/*
 * jsdom has no 2D canvas, so stub getContext/toDataURL and drive drawing via
 * Pointer Events — verifying tool wiring and that a stroke exports an image, not pixels.
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

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 55 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 40, clientY: 55 });
}

describe('Whiteboard', () => {
  it('renders the drawing surface and pen/eraser/undo/clear tools', () => {
    render(<Whiteboard />);

    expect(screen.getByLabelText('Scratch paper drawing area')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eraser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('exports an image after a stroke and reports null after clearing', () => {
    const onChange = vi.fn();
    render(<Whiteboard onChange={onChange} />);
    const canvas = screen.getByLabelText('Scratch paper drawing area');

    drawStroke(canvas);
    expect(onChange).toHaveBeenLastCalledWith(STUB_JPEG);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('enables undo and clear only after something is drawn', () => {
    render(<Whiteboard />);
    const undo = screen.getByRole('button', { name: 'Undo' });
    const clear = screen.getByRole('button', { name: 'Clear' });

    expect(undo).toBeDisabled();
    expect(clear).toBeDisabled();

    drawStroke(screen.getByLabelText('Scratch paper drawing area'));

    expect(undo).toBeEnabled();
    expect(clear).toBeEnabled();
  });

  it('undoes the last stroke back to blank', () => {
    const onChange = vi.fn();
    render(<Whiteboard onChange={onChange} />);
    const canvas = screen.getByLabelText('Scratch paper drawing area');

    drawStroke(canvas);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('switches to the eraser tool', () => {
    render(<Whiteboard />);
    const eraser = screen.getByRole('button', { name: 'Eraser' });

    expect(eraser).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(eraser);
    expect(eraser).toHaveAttribute('aria-pressed', 'true');
  });
});
