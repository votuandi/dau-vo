import type { WatchMatch } from '@/services/api/watch';
import { watchMatchCode, watchMatchGroup, type WatchMatchGroup } from './match-order';

/** Weight class filter value for matches that have no weight class. */
export const NO_WEIGHT_CLASS = '__none';

export interface WatchMatchFilter {
  /** Weight class id, `NO_WEIGHT_CLASS`, or empty for every weight class. */
  readonly weightClassId: string;
  /** Empty for every status. */
  readonly group: WatchMatchGroup | '';
  readonly search: string;
}

export const EMPTY_WATCH_FILTER: WatchMatchFilter = { weightClassId: '', group: '', search: '' };

/** Lower-case and drop Vietnamese diacritics so "nguyen" finds "Nguyễn" and "dong" finds "Đông". */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function searchableText(match: WatchMatch): string {
  return foldSearchText(
    [
      watchMatchCode(match),
      match.bracketRound?.displayReference ?? '',
      ...match.athletes.flatMap((athlete) => [athlete.name, athlete.organization ?? '']),
    ].join(' '),
  );
}

export function filterWatchMatches(
  matches: readonly WatchMatch[],
  filter: WatchMatchFilter,
): readonly WatchMatch[] {
  const search = foldSearchText(filter.search);
  return matches.filter((match) => {
    if (filter.weightClassId) {
      const id = match.weightClass?.id ?? NO_WEIGHT_CLASS;
      if (id !== filter.weightClassId) return false;
    }
    if (filter.group && watchMatchGroup(match) !== filter.group) return false;
    return !search || searchableText(match).includes(search);
  });
}

/** Weight classes that actually have matches, in first-seen order, plus "no weight class" if needed. */
export function watchWeightClassOptions(
  matches: readonly WatchMatch[],
): readonly { readonly id: string; readonly name: string }[] {
  const options = new Map<string, string>();
  let hasUnassigned = false;
  for (const match of matches) {
    if (match.weightClass) options.set(match.weightClass.id, match.weightClass.name);
    else hasUnassigned = true;
  }
  return [
    ...[...options].map(([id, name]) => ({ id, name })),
    ...(hasUnassigned ? [{ id: NO_WEIGHT_CLASS, name: 'Chưa xác định hạng cân' }] : []),
  ];
}
