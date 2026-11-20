import { describe, expect, it } from 'vitest';
import { AthleteColor, MatchLifecycle } from '@/types/shared';
import type { WatchMatch } from '@/services/api/watch';
import {
  EMPTY_WATCH_FILTER,
  NO_WEIGHT_CLASS,
  filterWatchMatches,
  foldSearchText,
  watchWeightClassOptions,
} from './match-filter';

function match(
  publicId: string,
  lifecycle: MatchLifecycle,
  weightClass: WatchMatch['weightClass'],
  red: [string, string | null],
  blue: [string, string | null],
): WatchMatch {
  return {
    publicId,
    lifecycle,
    weightClass,
    athletes: [
      { color: AthleteColor.RED, name: red[0], organization: red[1], imageUrl: null },
      { color: AthleteColor.BLUE, name: blue[0], organization: blue[1], imageUrl: null },
    ],
  } as unknown as WatchMatch;
}

const w60 = { id: 'w60', name: 'Dưới 60kg' };
const w70 = { id: 'w70', name: 'Dưới 70kg' };
const matches = [
  match(
    'CD34DR',
    MatchLifecycle.COMPLETED,
    w70,
    ['Nguyễn Hữu Nghĩa', 'CLB Đông Á'],
    ['Trịnh Minh Châu', 'Bình Dương'],
  ),
  match('XZLP7V', MatchLifecycle.READY, w70, ['Hà Huy Mạnh', null], ['Hồ Bảo Quốc', 'TP.HCM']),
  match(
    '4A26V6',
    MatchLifecycle.IN_PROGRESS,
    w60,
    ['Đỗ Vĩnh Tường', 'Hà Nội'],
    ['Lê Văn Chí', null],
  ),
  match('FREE01', MatchLifecycle.READY, null, ['Trần An', null], ['Lý Bình', null]),
];
const ids = (list: readonly WatchMatch[]) => list.map((m) => m.publicId);

describe('foldSearchText', () => {
  it('drops Vietnamese diacritics and case', () => {
    expect(foldSearchText('  Đỗ   Vĩnh TƯỜNG ')).toBe('do vinh tuong');
  });
});

describe('filterWatchMatches', () => {
  it('keeps everything without a filter', () => {
    expect(ids(filterWatchMatches(matches, EMPTY_WATCH_FILTER))).toHaveLength(4);
  });

  it('filters by weight class, including matches without one', () => {
    expect(
      ids(filterWatchMatches(matches, { ...EMPTY_WATCH_FILTER, weightClassId: 'w70' })),
    ).toEqual(['CD34DR', 'XZLP7V']);
    expect(
      ids(filterWatchMatches(matches, { ...EMPTY_WATCH_FILTER, weightClassId: NO_WEIGHT_CLASS })),
    ).toEqual(['FREE01']);
  });

  it('filters by status group', () => {
    expect(ids(filterWatchMatches(matches, { ...EMPTY_WATCH_FILTER, group: 'live' }))).toEqual([
      '4A26V6',
    ]);
    expect(ids(filterWatchMatches(matches, { ...EMPTY_WATCH_FILTER, group: 'upcoming' }))).toEqual([
      'XZLP7V',
      'FREE01',
    ]);
  });

  it.each([
    ['nguyen', ['CD34DR']],
    ['Đông Á', ['CD34DR']],
    ['ha noi', ['4A26V6']],
    ['xzlp', ['XZLP7V']],
    ['chi', ['4A26V6']],
  ])('searches name, organization and match code: %s', (search, expected) => {
    expect(ids(filterWatchMatches(matches, { ...EMPTY_WATCH_FILTER, search }))).toEqual(expected);
  });

  it('combines filters', () => {
    expect(
      ids(filterWatchMatches(matches, { weightClassId: 'w70', group: 'finished', search: 'chau' })),
    ).toEqual(['CD34DR']);
  });
});

describe('watchWeightClassOptions', () => {
  it('lists the weight classes that have matches, then the unassigned option', () => {
    expect(watchWeightClassOptions(matches)).toEqual([
      w70,
      w60,
      { id: NO_WEIGHT_CLASS, name: 'Chưa xác định hạng cân' },
    ]);
  });
});
