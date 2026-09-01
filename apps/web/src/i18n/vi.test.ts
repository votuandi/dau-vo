import { describe, expect, it } from 'vitest';
import { errorMessages } from './vi';

describe('Vietnamese server error mapping', () => {
  it('does not expose backend English messages for critical scoring errors', () => {
    expect(errorMessages.ALREADY_VOTED_IN_WINDOW).toContain('đã chấm điểm');
    expect(errorMessages.SCORING_WINDOW_CLOSED).toContain('không được ghi nhận');
    expect(errorMessages.SESSION_REVOKED).toContain('chuyển sang thiết bị khác');
  });
});
