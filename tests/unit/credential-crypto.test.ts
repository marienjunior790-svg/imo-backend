import { generateLoginId, generateTemporaryPassword } from '../../src/shared/auth/credential-crypto.js';

describe('credential-crypto (D1/D2)', () => {
  it('loginId matches ITC-{8 alnum}', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateLoginId();
      expect(id).toMatch(/^ITC-[A-Z2-9]{8}$/);
    }
  });

  it('temporary password ≥16 with complexity', () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateTemporaryPassword(20);
      expect(pwd.length).toBeGreaterThanOrEqual(16);
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[!@#$%&*+\-=?]/);
    }
  });
});
