/**
 * Isolation multi-tenant — org A ne lit/modifie jamais les ressources de org B.
 * Exécution : npm run test:integration
 * (nécessite PostgreSQL + migrations ; Docker Desktop ou Postgres local)
 */
import request from 'supertest';
import { createApp } from '../../src/app.js';

const describeDb = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

type OrgCtx = {
  token: string;
  orgId: string;
  buildingId: string;
  apartmentId: string;
  tenantId: string;
  leaseId: string;
  paymentId: string;
};

async function registerOrg(
  app: ReturnType<typeof createApp>,
  stamp: number,
  label: string,
): Promise<{ token: string; orgId: string }> {
  const email = `iso.${label}.${stamp}@itc-test.cg`;
  const password = 'IsoTest1!';

  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      firstName: 'Admin',
      lastName: label.toUpperCase(),
      organizationName: `ITC Iso ${label} ${stamp}`,
      organizationType: 'AGENCY',
      phone: '0600000099',
    });

  expect(reg.status).toBe(201);
  expect(reg.body.data.accessToken).toBeDefined();
  expect(reg.body.data.organization?.id).toBeDefined();

  return {
    token: reg.body.data.accessToken as string,
    orgId: reg.body.data.organization.id as string,
  };
}

async function seedOrgResources(
  app: ReturnType<typeof createApp>,
  token: string,
  label: string,
): Promise<Omit<OrgCtx, 'token' | 'orgId'>> {
  const auth = { Authorization: `Bearer ${token}` };

  const building = await request(app)
    .post('/api/v1/buildings')
    .set(auth)
    .send({
      name: `Immeuble ${label}`,
      address: `Rue ${label} 1`,
      city: 'Brazzaville',
      district: 'Poto-Poto',
    });
  expect(building.status).toBe(201);
  const buildingId = building.body.data.id as string;

  const apartment = await request(app)
    .post('/api/v1/apartments')
    .set(auth)
    .send({
      buildingId,
      label: `A-${label}`,
      rentAmount: 150_000,
      rooms: 2,
    });
  expect(apartment.status).toBe(201);
  const apartmentId = apartment.body.data.id as string;

  const tenant = await request(app)
    .post('/api/v1/tenants')
    .set(auth)
    .send({
      firstName: 'Loc',
      lastName: label,
      phone: '0612345678',
      email: `loc.${label}.${Date.now()}@itc-test.cg`,
    });
  expect(tenant.status).toBe(201);
  const tenantId = tenant.body.data.id as string;

  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);

  const lease = await request(app)
    .post('/api/v1/leases')
    .set(auth)
    .send({
      apartmentId,
      tenantId,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      monthlyRent: 150_000,
      depositAmount: 150_000,
    });
  expect(lease.status).toBe(201);
  const leaseId = lease.body.data.id as string;

  const payment = await request(app)
    .post('/api/v1/payments')
    .set(auth)
    .send({
      leaseId,
      periodMonth: start.getMonth() + 1,
      periodYear: start.getFullYear(),
      amount: 150_000,
    });
  expect(payment.status).toBe(201);
  const paymentId = payment.body.data.id as string;

  return { buildingId, apartmentId, tenantId, leaseId, paymentId };
}

function expectForbidden(res: request.Response) {
  expect([403, 404]).toContain(res.status);
  expect(res.body.success).toBe(false);
}

describeDb('Isolation multi-tenant — org A ≠ org B (TECH-002)', () => {
  const app = createApp();
  const stamp = Date.now();
  let a: OrgCtx;
  let b: OrgCtx;

  beforeAll(async () => {
    const orgA = await registerOrg(app, stamp, 'a');
    const orgB = await registerOrg(app, stamp, 'b');
    expect(orgA.orgId).not.toBe(orgB.orgId);

    const resA = await seedOrgResources(app, orgA.token, 'a');
    const resB = await seedOrgResources(app, orgB.token, 'b');

    a = { ...orgA, ...resA };
    b = { ...orgB, ...resB };
  }, 120_000);

  it('listes A n’incluent pas les IDs de B', async () => {
    const authA = { Authorization: `Bearer ${a.token}` };

    const buildings = await request(app).get('/api/v1/buildings').set(authA);
    expect(buildings.status).toBe(200);
    const buildingIds = (buildings.body.data as { id: string }[]).map((x) => x.id);
    expect(buildingIds).toContain(a.buildingId);
    expect(buildingIds).not.toContain(b.buildingId);

    const tenants = await request(app).get('/api/v1/tenants').set(authA);
    expect(tenants.status).toBe(200);
    const tenantIds = (tenants.body.data as { id: string }[]).map((x) => x.id);
    expect(tenantIds).toContain(a.tenantId);
    expect(tenantIds).not.toContain(b.tenantId);

    const leases = await request(app).get('/api/v1/leases').set(authA);
    expect(leases.status).toBe(200);
    const leaseIds = (leases.body.data as { id: string }[]).map((x) => x.id);
    expect(leaseIds).toContain(a.leaseId);
    expect(leaseIds).not.toContain(b.leaseId);

    const payments = await request(app).get('/api/v1/payments').set(authA);
    expect(payments.status).toBe(200);
    const paymentIds = (payments.body.data as { id: string }[]).map((x) => x.id);
    expect(paymentIds).toContain(a.paymentId);
    expect(paymentIds).not.toContain(b.paymentId);
  });

  it('A ne peut pas GET les ressources :id de B', async () => {
    const authA = { Authorization: `Bearer ${a.token}` };

    expectForbidden(await request(app).get(`/api/v1/buildings/${b.buildingId}`).set(authA));
    expectForbidden(await request(app).get(`/api/v1/apartments/${b.apartmentId}`).set(authA));
    expectForbidden(await request(app).get(`/api/v1/tenants/${b.tenantId}`).set(authA));
    expectForbidden(await request(app).get(`/api/v1/leases/${b.leaseId}`).set(authA));
    expectForbidden(await request(app).get(`/api/v1/payments/${b.paymentId}`).set(authA));
  });

  it('A ne peut pas modifier / supprimer les ressources de B', async () => {
    const authA = { Authorization: `Bearer ${a.token}` };

    expectForbidden(
      await request(app)
        .put(`/api/v1/buildings/${b.buildingId}`)
        .set(authA)
        .send({ name: 'Hijack B' }),
    );
    expectForbidden(
      await request(app)
        .put(`/api/v1/tenants/${b.tenantId}`)
        .set(authA)
        .send({ firstName: 'Hijack' }),
    );
    expectForbidden(await request(app).delete(`/api/v1/buildings/${b.buildingId}`).set(authA));
    expectForbidden(await request(app).delete(`/api/v1/tenants/${b.tenantId}`).set(authA));
  });

  it('A lit toujours ses propres ressources', async () => {
    const authA = { Authorization: `Bearer ${a.token}` };

    const building = await request(app).get(`/api/v1/buildings/${a.buildingId}`).set(authA);
    expect(building.status).toBe(200);
    expect(building.body.data.id).toBe(a.buildingId);

    const tenant = await request(app).get(`/api/v1/tenants/${a.tenantId}`).set(authA);
    expect(tenant.status).toBe(200);
    expect(tenant.body.data.id).toBe(a.tenantId);
  });
});
