import { hashInviteToken, generateInviteToken } from '../../src/modules/invitations/invitation.mail.js';

describe('Invitation tokens (P2)', () => {
  it('hash de façon déterministe', () => {
    const raw = 'abc123token';
    expect(hashInviteToken(raw)).toBe(hashInviteToken(raw));
    expect(hashInviteToken(raw)).not.toBe(raw);
    expect(hashInviteToken(raw)).toHaveLength(64);
  });

  it('génère un token opaque unique', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});
