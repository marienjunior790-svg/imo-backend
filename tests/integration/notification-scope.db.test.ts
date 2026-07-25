/**
 * Isolation notifications TENANT / AGENT — scope org + user.
 * Exécution : cross-env RUN_DB_TESTS=true npx jest tests/integration/notification-scope.db.test.ts
 */
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { container } from 'tsyringe';
import bcrypt from 'bcrypt';

const describeDb = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDb('Integration — notifications scoped TENANT/AGENT', () => {
  const app = createApp();
  const prisma = container.resolve(PrismaService);
  const stamp = Date.now();

  let ownerToken: string;
  let orgId: string;
  let tenantToken: string;
  let tenantUserId: string;
  let agentToken: string;
  let agentUserId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    const password = 'ScopeTest1!';
    const hash = await bcrypt.hash(password, 10);

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `notif.owner.${stamp}@itc-test.cg`,
        password,
        firstName: 'Owner',
        lastName: 'Scope',
        organizationName: `ITC Notif ${stamp}`,
        organizationType: 'AGENCY',
        phone: '0600000020',
      });
    expect(reg.status).toBe(201);
    ownerToken = reg.body.data.accessToken;
    orgId = reg.body.data.organization.id;

    const other = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `notif.other.${stamp}@itc-test.cg`,
        password,
        firstName: 'Other',
        lastName: 'Org',
        organizationName: `ITC Other ${stamp}`,
        organizationType: 'AGENCY',
        phone: '0600000021',
      });
    expect(other.status).toBe(201);
    otherOrgId = other.body.data.organization.id;

    const tenant = await prisma.user.create({
      data: {
        email: `notif.tenant.${stamp}@itc-test.cg`,
        passwordHash: hash,
        firstName: 'Loc',
        lastName: 'Scope',
        role: UserRole.TENANT,
        organizationId: orgId,
        isActive: true,
        mustChangePassword: false,
      },
    });
    tenantUserId = tenant.id;
    await prisma.membership.create({
      data: { userId: tenant.id, organizationId: orgId, role: UserRole.TENANT, isActive: true },
    });

    const agent = await prisma.user.create({
      data: {
        email: `notif.agent.${stamp}@itc-test.cg`,
        passwordHash: hash,
        firstName: 'Agent',
        lastName: 'Scope',
        role: UserRole.AGENT,
        organizationId: orgId,
        isActive: true,
        mustChangePassword: false,
      },
    });
    agentUserId = agent.id;
    await prisma.membership.create({
      data: { userId: agent.id, organizationId: orgId, role: UserRole.AGENT, isActive: true },
    });

    await prisma.notification.createMany({
      data: [
        {
          organizationId: orgId,
          userId: tenantUserId,
          type: 'SYSTEM',
          title: 'Perso tenant',
          message: 'hello tenant',
        },
        {
          organizationId: orgId,
          userId: agentUserId,
          type: 'MAINTENANCE_ASSIGNED',
          title: 'Perso agent',
          message: 'hello agent',
        },
        {
          organizationId: orgId,
          userId: null,
          type: 'SYSTEM',
          title: 'Broadcast org',
          message: 'staff only',
        },
        {
          organizationId: otherOrgId,
          userId: tenantUserId,
          type: 'SYSTEM',
          title: 'Leak other org',
          message: 'should not see',
        },
      ],
    });

    const tenantLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `notif.tenant.${stamp}@itc-test.cg`, password });
    expect(tenantLogin.status).toBe(200);
    tenantToken = tenantLogin.body.data.accessToken;

    const agentLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `notif.agent.${stamp}@itc-test.cg`, password });
    expect(agentLogin.status).toBe(200);
    agentToken = agentLogin.body.data.accessToken;
  });

  it('TENANT ne voit que ses notifs personnelles de son org (pas broadcast, pas autre org)', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set({ Authorization: `Bearer ${tenantToken}` });
    expect(res.status).toBe(200);
    const titles = (res.body.data as { title: string }[]).map((n) => n.title);
    expect(titles).toContain('Perso tenant');
    expect(titles).not.toContain('Broadcast org');
    expect(titles).not.toContain('Perso agent');
    expect(titles).not.toContain('Leak other org');
  });

  it('AGENT ne voit que ses notifs personnelles de son org', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set({ Authorization: `Bearer ${agentToken}` });
    expect(res.status).toBe(200);
    const titles = (res.body.data as { title: string }[]).map((n) => n.title);
    expect(titles).toContain('Perso agent');
    expect(titles).not.toContain('Broadcast org');
    expect(titles).not.toContain('Perso tenant');
  });

  it('TENANT ne peut pas marquer une broadcast comme lue', async () => {
    const broadcast = await prisma.notification.findFirst({
      where: { organizationId: orgId, userId: null, title: 'Broadcast org' },
    });
    expect(broadcast).toBeTruthy();
    const res = await request(app)
      .patch(`/api/v1/notifications/${broadcast!.id}/read`)
      .set({ Authorization: `Bearer ${tenantToken}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    const still = await prisma.notification.findUnique({ where: { id: broadcast!.id } });
    expect(still?.readAt).toBeNull();
  });

  it('owner token smoke — staff pipeline still works', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set({ Authorization: `Bearer ${ownerToken}` });
    expect(res.status).toBe(200);
  });
});
