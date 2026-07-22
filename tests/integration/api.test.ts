import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Integration — Health', () => {
  const app = createApp();

  it('GET /api/v1/health retourne le contrat RC', async () => {
    const res = await request(app).get('/api/v1/health');
    // Liveness HTTP 200 (Railway). status/database portent l'état réel.
    expect(res.status).toBe(200);
    expect(res.body.version).toBeDefined();
    expect(res.body.database).toMatch(/connected|disconnected/);
    expect(res.body.status).toMatch(/ok|degraded/);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.environment).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('Integration — Auth validation', () => {
  const app = createApp();

  it('POST /auth/login rejette email invalide (400)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'test1234' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /auth/register rejette données incomplètes (400, plus de 403)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@test.cg' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Integration — Automation API key', () => {
  const app = createApp();

  it('GET /automation/payments/late sans clé → 401', async () => {
    const res = await request(app).get('/api/v1/automation/payments/late');
    expect(res.status).toBe(401);
  });

  it('GET /automation/payments/late avec mauvaise clé → 401', async () => {
    const res = await request(app)
      .get('/api/v1/automation/payments/late')
      .set('X-Automation-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });
});

describe('Integration — Routes protégées', () => {
  const app = createApp();

  it('GET /apartments sans token → 401', async () => {
    const res = await request(app).get('/api/v1/apartments');
    expect(res.status).toBe(401);
  });

  it('GET /ai/suggestions sans token → 401', async () => {
    const res = await request(app).get('/api/v1/ai/suggestions');
    expect(res.status).toBe(401);
  });
});
