import { staffProvisionSchema } from '../../src/modules/admin/staff-provision.schema.js';
import { generateLoginId, generateTemporaryPassword } from '../../src/shared/auth/credential-crypto.js';

describe('staffProvisionSchema', () => {
  it('accepte un agent avec e-mail', () => {
    const parsed = staffProvisionSchema.parse({
      firstName: 'Jean',
      lastName: 'Agent',
      email: 'agent@example.com',
      role: 'AGENT',
    });
    expect(parsed.role).toBe('AGENT');
    expect(parsed.email).toBe('agent@example.com');
  });

  it('accepte un agent sans e-mail', () => {
    const parsed = staffProvisionSchema.parse({
      firstName: 'Paul',
      lastName: 'Terrain',
      role: 'AGENT',
    });
    expect(parsed.email).toBeUndefined();
    expect(parsed.role).toBe('AGENT');
  });

  it('refuse un prénom trop court', () => {
    expect(() =>
      staffProvisionSchema.parse({ firstName: 'A', lastName: 'Ok', role: 'AGENT' }),
    ).toThrow();
  });
});

describe('credential crypto (provision)', () => {
  it('génère un loginId ITC-…', () => {
    const id = generateLoginId();
    expect(id).toMatch(/^ITC-[A-Z0-9]{8}$/);
  });

  it('génère un mot de passe temporaire robuste', () => {
    const pwd = generateTemporaryPassword(20);
    expect(pwd.length).toBeGreaterThanOrEqual(16);
    expect(pwd).not.toBe('password');
  });
});
