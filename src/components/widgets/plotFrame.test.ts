import { describe, expect, it } from 'vitest';
import {
  estimateLabelWidth,
  placePointLabel,
  PLOT_HEIGHT,
  PLOT_PADDING,
  PLOT_WIDTH,
  type LabelBox,
} from './plotFrame';

const INNER_LEFT = PLOT_PADDING;
const INNER_RIGHT = PLOT_WIDTH - PLOT_PADDING;
const INNER_TOP = PLOT_PADDING;
const INNER_BOTTOM = PLOT_HEIGHT - PLOT_PADDING;

function isInsidePlot(box: LabelBox): boolean {
  return (
    box.x >= INNER_LEFT - 1e-6 &&
    box.y >= INNER_TOP - 1e-6 &&
    box.x + box.width <= INNER_RIGHT + 1e-6 &&
    box.y + box.height <= INNER_BOTTOM + 1e-6
  );
}

describe('placePointLabel', () => {
  /* Screenshot bug: a mark at (0, 1) lands on the centred y-axis (SVG x=180). */
  it('pushes a label off the y-axis to the open right side, clear of the axis and "1" tick', () => {
    const box = placePointLabel({
      px: 180,
      py: 40,
      width: estimateLabelWidth('limit 1'),
      height: 18,
      axisXPx: 180,
      axisYPx: 150,
      pointRadius: 4.5,
    });

    // Right of the y-axis line AND clear of its keep-out band (line + left ticks).
    expect(box.x).toBeGreaterThan(180);
    expect(box.x).toBeGreaterThanOrEqual(183);
    // Never clipped at the right wall and fully inside the plot.
    expect(box.x + box.width).toBeLessThanOrEqual(INNER_RIGHT);
    expect(isInsidePlot(box)).toBe(true);
  });

  it('flips a near-right-edge label to the left so it is not clipped', () => {
    const box = placePointLabel({
      px: 322,
      py: 110,
      width: 60,
      height: 18,
      axisXPx: 180,
      axisYPx: 150,
      pointRadius: 5,
    });

    // Placed to the left of the point and inside the right wall.
    expect(box.x + box.width).toBeLessThanOrEqual(322);
    expect(box.x + box.width).toBeLessThanOrEqual(INNER_RIGHT);
    expect(isInsidePlot(box)).toBe(true);
  });

  it('lifts a label above the x-axis when the point sits on it', () => {
    const box = placePointLabel({
      px: 250,
      py: 150,
      width: 44,
      height: 18,
      axisXPx: 180,
      axisYPx: 150,
      pointRadius: 5,
    });

    // The whole box sits above the x-axis line + its tick numbers underneath.
    expect(box.y + box.height).toBeLessThanOrEqual(150);
    expect(isInsidePlot(box)).toBe(true);
  });

  it('flips a label sitting on the y-axis to the right at any height', () => {
    const box = placePointLabel({
      px: 180,
      py: 110,
      width: 50,
      height: 18,
      axisXPx: 180,
      axisYPx: 150,
      pointRadius: 4.5,
    });

    expect(box.x).toBeGreaterThanOrEqual(183);
    expect(isInsidePlot(box)).toBe(true);
  });

  it('keeps every label inside the plot bounds across the whole canvas', () => {
    const xs = [INNER_LEFT, 80, 180, 280, INNER_RIGHT];
    const ys = [INNER_TOP, 60, 110, 160, INNER_BOTTOM];
    for (const px of xs) {
      for (const py of ys) {
        const box = placePointLabel({
          px,
          py,
          width: 70,
          height: 18,
          axisXPx: 180,
          axisYPx: 150,
          pointRadius: 8,
        });
        expect(isInsidePlot(box)).toBe(true);
      }
    }
  });

  it('still returns an in-bounds box when no axes are supplied', () => {
    const box = placePointLabel({ px: 180, py: 110, width: 50, height: 18 });
    // With no axis furniture to avoid it takes the preferred right placement.
    expect(box.x).toBeGreaterThan(180);
    expect(isInsidePlot(box)).toBe(true);
  });
});

describe('estimateLabelWidth', () => {
  it('grows with the label length and has a sensible floor', () => {
    expect(estimateLabelWidth('')).toBe(16);
    expect(estimateLabelWidth('limit 1')).toBeGreaterThan(estimateLabelWidth('a'));
  });
});
