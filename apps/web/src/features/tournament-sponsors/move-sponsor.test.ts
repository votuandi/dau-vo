import { describe, expect, it } from 'vitest';
import type { TournamentSponsor } from '@/services/api/admin-management';
import { moveSponsor } from './move-sponsor';

const list = (...positions: [string, number][]) =>
  positions.map(([id, displayIndex]) => ({ id, name: id, displayIndex }) as TournamentSponsor);
const order = (items: readonly TournamentSponsor[]) =>
  items.map((item) => `${String(item.displayIndex)}:${item.id}`);

describe('moveSponsor', () => {
  const items = list(['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 5]);

  it('moves up and shifts the sponsors in between down', () => {
    expect(order(moveSponsor(items, 'E', 2))).toEqual(['1:A', '2:E', '3:B', '4:C', '5:D']);
  });

  it('moves down and closes the gap it leaves', () => {
    expect(order(moveSponsor(items, 'A', 4))).toEqual(['1:B', '2:C', '3:D', '4:A', '5:E']);
  });

  it('takes a free position without moving anyone', () => {
    expect(order(moveSponsor(list(['A', 1], ['B', 3]), 'A', 2))).toEqual(['2:A', '3:B']);
  });
});
