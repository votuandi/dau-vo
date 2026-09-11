import { describe, expect, it } from 'vitest';
import { passwordValidationMessage, passwordUtf8ByteLength } from './password-policy';

describe('password policy', () => {
  it('measures UTF-8 bytes and enforces bcrypt’s 72-byte limit', () => {
    expect(passwordUtf8ByteLength('a'.repeat(72))).toBe(72);
    expect(passwordValidationMessage('a'.repeat(72))).toBeNull();
    expect(passwordValidationMessage('a'.repeat(73))).toContain('72 byte');
    expect(passwordValidationMessage('😀'.repeat(19))).toContain('72 byte');
    expect(passwordValidationMessage('mật-khẩu-an-toàn-123')).toBeNull();
  });
});
