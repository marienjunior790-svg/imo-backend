/**
 * P3 — Memberships : dual-write à l'inscription + exposition /auth/me.
 * Exécution : RUN_DB_TESTS=true npm run test:integration
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { container } from 'tsyringe';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

const describeDb = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDb('Memberships Identity (P3)', () => {
  const app = createApp();
  const stamp = Date.now();

  it('register org crée membership primaire et /me l’expose', async () => {
    const email = `mem.org.${stamp}@itc-test.cg`;
    const password = 'MemTest1!';

    const reg = await request(app).post('/api/v1/auth/register').send({
      email,
      password,
      firstName: 'Admin',
      lastName: 'Membership',
      organizationName: `ITC Mem ${stamp}`,
      organizationType: 'AGENCY',
    });

    expect(reg.status).toBe(201);
    expect(reg.body.data.membership?.id).toBeDefined();
    expect(reg.body.data.membership?.role).toBe('ORG_ADMIN');
    expect(reg.body.data.membership?.productRole).toBe('ORG_OWNER');
    expect(Array.isArray(reg.body.data.capabilities)).toBe(true);
    expect(reg.body.data.capabilities).toContain('BUILDING_CREATE');
    expect(Array.isArray(reg.body.data.modules)).toBe(true);

    const token = reg.body.data.accessToken as string;
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.membership?.id).toBe(reg.body.data.membership.id);
    expect(me.body.data.capabilities.length).toBeGreaterThan(0);

    const caps = await request(app)
      .get('/api/v1/auth/me/capabilities')
      .set('Authorization', `Bearer ${token}`);
    expect(caps.status).toBe(200);
    expect(caps.body.data.capabilities).toContain('USER_CREATE');

    const mods = await request(app)
      .get('/api/v1/auth/me/modules')
      .set('Authorization', `Bearer ${token}`);
    expect(mods.status).toBe(200);
    expect(mods.body.data.modules.some((m: { key: string; enabled: boolean }) => m.key === 'core' && m.enabled)).toBe(
      true,
    );

    const prisma = container.resolve(PrismaService);
    const rows = await prisma.membership.findMany({
      where: { userId: reg.body.data.user.id as string },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].isPrimary).toBe(true);
    expect(rows[0].organizationId).toBe(reg.body.data.organization.id);
  });

  it('register tenant crée membership TENANT sans organisation', async () => {
    const email = `mem.tenant.${stamp}@itc-test.cg`;
    const reg = await request(app).post('/api/v1/auth/register-tenant').send({
      email,
      password: 'MemTest1!',
      firstName: 'Loc',
      lastName: 'Test',
      phone: '0600112233',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.data.membership?.role).toBe('TENANT');
    expect(reg.body.data.membership?.organizationId).toBeNull();
    expect(reg.body.data.homePath).toBe('/tenant');
  });
});
