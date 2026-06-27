import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RaceTrack, type RaceTrackOpponent } from './RaceTrack';

// RaceTrack is purely presentational (no context/audio), so it renders standalone.
// These tests lock in the N-opponent HUD: a ranked standings list, one minimap
// marker per racer, distinct per-opponent colours and per-racer finish flags.

function opponent(overrides: Partial<RaceTrackOpponent> & { id: string }): RaceTrackOpponent {
  return {
    name: overrides.id,
    color: '#ff5a4d',
    position: 0,
    velocity: 0,
    finished: false,
    ...overrides,
  };
}

function renderTrack(opponents: RaceTrackOpponent[], playerPosition = 50) {
  return render(
    <RaceTrack
      seed={7}
      raceDistance={2500}
      player={{ position: playerPosition, velocity: 0, fuel: 0 }}
      playerName="You"
      playerColor="#11815a"
      opponents={opponents}
    />,
  );
}

describe('RaceTrack with N opponents', () => {
  it('renders a standings row per racer, ranked by distance covered', () => {
    const { container } = renderTrack([
      opponent({ id: 'Alpha', name: 'Alpha', position: 100, color: '#ff5a4d' }),
      opponent({ id: 'Bravo', name: 'Bravo', position: 300, color: '#0ea5e9' }),
      opponent({ id: 'Charlie', name: 'Charlie', position: 200, color: '#8b5cf6' }),
    ]);

    const rows = container.querySelectorAll('.race-standing');
    // One row per racer (3 opponents + the player).
    expect(rows).toHaveLength(4);
    // Ranked leader-first by position: Bravo(300) > Charlie(200) > Alpha(100) > You(50).
    expect(rows[0].textContent).toContain('Bravo');
    expect(rows[1].textContent).toContain('Charlie');
    expect(rows[2].textContent).toContain('Alpha');
    expect(rows[3].textContent).toContain('You');
    // The trailing row is the player's own row.
    expect(rows[3]).toHaveClass('race-standing-player');
    expect(container.querySelectorAll('.race-standing-opponent')).toHaveLength(3);
  });

  it('gives each opponent a distinct colour on its standings dot', () => {
    const { container } = renderTrack([
      opponent({ id: 'a', position: 100, color: '#ff5a4d' }),
      opponent({ id: 'b', position: 200, color: '#0ea5e9' }),
      opponent({ id: 'c', position: 300, color: '#8b5cf6' }),
    ]);

    const dots = Array.from(
      container.querySelectorAll<HTMLElement>('.race-standing-opponent .race-standing-dot'),
    );
    expect(dots).toHaveLength(3);
    const colors = new Set(dots.map((dot) => dot.style.background));
    expect(colors.size).toBe(3);
  });

  it('renders one minimap marker per opponent plus the player', () => {
    const { container } = renderTrack([
      opponent({ id: 'a', position: 100 }),
      opponent({ id: 'b', position: 200 }),
      opponent({ id: 'c', position: 300 }),
    ]);

    expect(container.querySelectorAll('.race-minimap-opponent')).toHaveLength(3);
    expect(container.querySelectorAll('.race-minimap-player')).toHaveLength(1);
  });

  it('flags a finished opponent in the standings', () => {
    const { container } = renderTrack([
      opponent({ id: 'Winner', name: 'Winner', position: 2500, finished: true }),
      opponent({ id: 'Slow', name: 'Slow', position: 400, finished: false }),
    ]);

    const winnerRow = Array.from(container.querySelectorAll('.race-standing')).find((row) =>
      row.textContent?.includes('Winner'),
    );
    expect(winnerRow?.textContent).toContain('Finished');
  });
});
