import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getStatVisibility, HeaderStats, STAT_HIDE_PRIORITY } from './HeaderStats';
import type { HeaderStatKey } from './HeaderStats';

describe('getStatVisibility', () => {
  it('shows every chip when all three fit', () => {
    expect(getStatVisibility(3)).toEqual({ coins: true, streak: true, xp: true });
  });

  it('hides coins first when one chip must go', () => {
    expect(getStatVisibility(2)).toEqual({ coins: false, streak: true, xp: true });
  });

  it('hides coins then the streak, keeping XP, when only one fits', () => {
    expect(getStatVisibility(1)).toEqual({ coins: false, streak: false, xp: true });
  });

  it('hides everything when nothing fits', () => {
    expect(getStatVisibility(0)).toEqual({ coins: false, streak: false, xp: false });
  });

  it('clamps out-of-range counts', () => {
    expect(getStatVisibility(99)).toEqual({ coins: true, streak: true, xp: true });
    expect(getStatVisibility(-5)).toEqual({ coins: false, streak: false, xp: false });
  });

  it('drops chips strictly in coins → streak → XP order as space shrinks', () => {
    const dropOrder: HeaderStatKey[] = [];
    let previous = getStatVisibility(STAT_HIDE_PRIORITY.length);

    for (let count = STAT_HIDE_PRIORITY.length - 1; count >= 0; count -= 1) {
      const next = getStatVisibility(count);
      const justHidden = (Object.keys(next) as HeaderStatKey[]).find(
        (key) => previous[key] && !next[key],
      );
      if (justHidden) {
        dropOrder.push(justHidden);
      }
      previous = next;
    }

    expect(dropOrder).toEqual(['coins', 'streak', 'xp']);
  });
});

describe('HeaderStats', () => {
  /* jsdom performs no real layout, so scrollWidth/clientWidth are both 0 and the
     overflow check never trips — every chip renders. That's exactly why the
     priority/order logic is verified through the pure getStatVisibility helper
     above rather than by asserting on pixel measurements here. */
  it('renders all three stats when there is room to fit them', () => {
    render(<HeaderStats coins={1234} xp={5678} streak={3} />);

    expect(screen.getByLabelText('1,234 coin balance')).toBeInTheDocument();
    expect(screen.getByLabelText('5,678 XP earned')).toBeInTheDocument();
    expect(screen.getByLabelText('3 day streak')).toBeInTheDocument();
  });
});
