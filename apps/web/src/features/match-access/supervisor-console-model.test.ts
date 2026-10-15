import { describe, expect, it } from 'vitest';
import { MatchExitMode } from '@martial-arts-scoring/shared-types';
import { appealNumber, completionHelp, exitOption } from './supervisor-console-model';

describe('appealNumber', () => {
  it.each([
    ['0', 0],
    ['7', 7],
    ['99', 99],
    ['100', null],
    ['-1', null],
    ['1.5', null],
    ['', null],
    [' 3', null],
  ])('parses %j as %j', (input, expected) => {
    expect(appealNumber(input)).toBe(expected);
  });
});

describe('completionHelp', () => {
  it('reports syncing until the server sends blocked reasons', () => {
    expect(completionHelp(undefined)).toBe('Đang đồng bộ điều kiện lưu kết quả từ máy chủ.');
  });

  it('is empty when nothing blocks completion', () => {
    expect(completionHelp([])).toBe('');
  });

  it('joins every blocking reason', () => {
    expect(completionHelp(['ROUND_1_NOT_ENDED', 'MATCH_SUSPENDED'])).toBe(
      'Hiệp 1 chưa kết thúc. Trận đang tạm hoãn.',
    );
  });
});

describe('exitOption', () => {
  it('marks only result cancellation as destructive', () => {
    for (const mode of Object.values(MatchExitMode)) {
      expect(exitOption(mode).destructive).toBe(mode === MatchExitMode.CANCEL_RESULTS);
    }
  });
});
