import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  PLOT_HEIGHT,
  PLOT_WIDTH,
  capturePointer,
  clientToSvg,
  createPlotScale,
  pointerToData,
} from './plotFrame';

/** A minimal SVG stub: clientToSvg only reads getBoundingClientRect + the viewBox attribute. */
function fakeSvg(rect: Partial<DOMRect>, viewBox = `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`): SVGSVGElement {
  const fullRect = {
    left: 0,
    top: 0,
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    right: (rect.left ?? 0) + (rect.width ?? PLOT_WIDTH),
    bottom: (rect.top ?? 0) + (rect.height ?? PLOT_HEIGHT),
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    ...rect,
    toJSON: () => ({}),
  } as DOMRect;
  return {
    getBoundingClientRect: () => fullRect,
    getAttribute: (name: string) => (name === 'viewBox' ? viewBox : null),
  } as unknown as SVGSVGElement;
}

/**
 * The screen point where viewBox coordinate (sx, sy) actually lands under the SVG
 * default `preserveAspectRatio="xMidYMid meet"` (uniform scale + centring). This is
 * the ground truth that a correct client→SVG mapping must invert exactly.
 */
function meetScreenPoint(
  rect: { left: number; top: number; width: number; height: number },
  sx: number,
  sy: number,
  vbWidth = PLOT_WIDTH,
  vbHeight = PLOT_HEIGHT,
): { clientX: number; clientY: number } {
  const scale = Math.min(rect.width / vbWidth, rect.height / vbHeight);
  const left = rect.left + (rect.width - vbWidth * scale) / 2;
  const top = rect.top + (rect.height - vbHeight * scale) / 2;
  return { clientX: left + sx * scale, clientY: top + sy * scale };
}

describe('clientToSvg — pointer maps 1:1 to viewBox coordinates', () => {
  it('is the identity when the rendered box equals the viewBox', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: PLOT_WIDTH, height: PLOT_HEIGHT });
    expect(clientToSvg(svg, 254, 110)).toMatchObject({ x: expect.closeTo(254, 6), y: expect.closeTo(110, 6) });
  });

  it('inverts the meet transform exactly when rendered WIDER than the viewBox (horizontal letterbox)', () => {
    /* The reported bug: a wide, viewport-filling graph. aspect 720:220 != 360:220. */
    const rect = { left: 0, top: 0, width: 720, height: 220 };
    const svg = fakeSvg(rect);

    /* Sample off-centre points (the centre maps identically under either formula). */
    for (const [sx, sy] of [
      [32, 110],
      [100, 32],
      [254, 188],
      [328, 110],
    ]) {
      const { clientX, clientY } = meetScreenPoint(rect, sx, sy);
      const got = clientToSvg(svg, clientX, clientY);
      expect(got.x).toBeCloseTo(sx, 6);
      expect(got.y).toBeCloseTo(sy, 6);

      // A naive stretch-to-fill formula (no aspect handling) is demonstrably wrong here.
      const buggyX = ((clientX - rect.left) / rect.width) * PLOT_WIDTH;
      expect(buggyX).not.toBeCloseTo(sx, 1);
    }
  });

  it('inverts the meet transform exactly when rendered TALLER than the viewBox (vertical letterbox)', () => {
    const rect = { left: 0, top: 0, width: 360, height: 440 };
    const svg = fakeSvg(rect);

    const { clientX, clientY } = meetScreenPoint(rect, 254, 88);
    const got = clientToSvg(svg, clientX, clientY);
    expect(got.x).toBeCloseTo(254, 6);
    expect(got.y).toBeCloseTo(88, 6);

    const buggyY = ((clientY - rect.top) / rect.height) * PLOT_HEIGHT;
    expect(buggyY).not.toBeCloseTo(88, 1);
  });

  it('moves the SVG coordinate 1:1 with the pointer (constant px-per-unit, no drift)', () => {
    const rect = { left: 17, top: 9, width: 900, height: 300 };
    const svg = fakeSvg(rect);
    const scale = Math.min(rect.width / PLOT_WIDTH, rect.height / PLOT_HEIGHT);

    const a = clientToSvg(svg, 400, 150);
    const b = clientToSvg(svg, 500, 150);
    // A 100px screen move is exactly 100/scale viewBox units, everywhere on the canvas.
    expect(b.x - a.x).toBeCloseTo(100 / scale, 6);
  });

  it('accounts for a non-zero rendered offset (rect.left / rect.top)', () => {
    const rect = { left: 50, top: 20, width: PLOT_WIDTH, height: PLOT_HEIGHT };
    const svg = fakeSvg(rect);
    expect(clientToSvg(svg, 50 + 254, 20 + 110)).toMatchObject({
      x: expect.closeTo(254, 6),
      y: expect.closeTo(110, 6),
    });
  });

  it('reads the element viewBox so non-default canvases (e.g. 300x300) map correctly', () => {
    const rect = { left: 0, top: 0, width: 600, height: 600 };
    const svg = fakeSvg(rect, '0 0 300 300');
    // 600px box around a 300 viewBox -> uniform 2x; client 510 -> svg 255.
    expect(clientToSvg(svg, 510, 240)).toMatchObject({
      x: expect.closeTo(255, 6),
      y: expect.closeTo(120, 6),
    });
  });

  it('falls back to the viewBox centre for an unmeasured (zero-size) box instead of NaN', () => {
    const svg = fakeSvg({ left: 0, top: 0, width: 0, height: 0 });
    expect(clientToSvg(svg, 123, 45)).toMatchObject({ x: PLOT_WIDTH / 2, y: PLOT_HEIGHT / 2 });
  });
});

describe('pointerToData — data coordinates track the pointer under letterboxing', () => {
  it('maps a letterboxed pointer to the correct data point (1:1)', () => {
    const scale = createPlotScale({ xMin: -5, xMax: 5, yMin: 0, yMax: 10 });
    const rect = { left: 0, top: 0, width: 720, height: 220 };
    const svg = fakeSvg(rect);

    // Aim for data x = 2.5 (viewBox svgX 254), y = 5 (viewBox svgY 110).
    const { clientX, clientY } = meetScreenPoint(rect, 254, 110);
    const event = { clientX, clientY, currentTarget: svg } as unknown as PointerEvent<SVGSVGElement>;

    const data = pointerToData(event, scale);
    expect(data.x).toBeCloseTo(2.5, 6);
    expect(data.y).toBeCloseTo(5, 6);
  });
});

describe('capturePointer — handles claim the pointer for continuous (touch) dragging', () => {
  it('routes every later pointer event to the handle via setPointerCapture', () => {
    /* The fix for "drags one click at a time" on touch: capturing the pointer keeps
       pointermove flowing to the handle even when the finger slides off the tiny dot,
       so the drag tracks continuously instead of ending after the first move. */
    const setPointerCapture = vi.fn();
    const event = {
      pointerId: 7,
      currentTarget: { setPointerCapture },
    } as unknown as PointerEvent<SVGElement>;

    capturePointer(event);

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('no-ops where setPointerCapture is unavailable (jsdom/SSR) instead of throwing', () => {
    const event = { pointerId: 1, currentTarget: {} } as unknown as PointerEvent<SVGElement>;
    expect(() => capturePointer(event)).not.toThrow();
  });
});
