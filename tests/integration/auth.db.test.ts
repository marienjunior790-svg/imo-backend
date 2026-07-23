/**
 * Tests d'intégration Auth + DB (sans compte seed hardcodé).
 * Exécution : npm run test:integration  (RUN_DB_TESTS=true)
 *
 * Prérequis : PostgreSQL + prisma migrate deploy + prisma db seed (catalogue RBAC).
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';

const describeIntegration = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeIntegration('Integration — Auth + DB', () => {
  const app = createApp();
  const stamp = Date.now();
  const email = `auth.db.${stamp}@itc-test.cg`;
  const password = 'AuthDbTest1!';
  let accessToken: string;

  it('register org → tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Auth',
        lastName: 'Db',
        organizationName: `ITC AuthDB ${stamp}`,
        organizationType: 'AGENCY',
        phone: '0600000010',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.subscription).toBeDefined();
    accessToken = res.body.data.accessToken as string;
  });

  it('login avec le compte créé', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
    accessToken = res.body.data.accessToken as string;
  });

  it('GET /dashboard/stats avec token', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.apartments).toBeDefined();
  });
});
