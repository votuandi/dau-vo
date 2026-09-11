import {
  MAX_BCRYPT_PASSWORD_BYTES,
  passwordValidationCode,
} from './password-policy';

describe('bcrypt password policy', () => {
  it('accepts ASCII passwords at exactly 72 bytes and valid Unicode passwords below the byte limit', () => {
    expect(
      passwordValidationCode('a'.repeat(MAX_BCRYPT_PASSWORD_BYTES)),
    ).toBeNull();
    expect(passwordValidationCode('mật-khẩu-an-toàn-123')).toBeNull();
  });

  it('rejects passwords longer than 72 UTF-8 bytes', () => {
    expect(
      passwordValidationCode('a'.repeat(MAX_BCRYPT_PASSWORD_BYTES + 1)),
    ).toBe('PASSWORD_TOO_LONG');
    expect(passwordValidationCode('😀'.repeat(19))).toBe('PASSWORD_TOO_LONG');
  });
});
