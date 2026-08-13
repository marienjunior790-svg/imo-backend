import { UserRole } from '@prisma/client';
import {
  AiToolsService,
  formatToolResultForLocalReply,
  resolveTeamMembersLocalIntent,
} from '../../src/modules/ai/ai.tools.js';
import { TeamMembersService } from '../../src/modules/admin/team-members.service.js';
import { ForbiddenError } from '../../src/shared/errors/app.error.js';

describe('resolveTeamMembersLocalIntent / NL agents', () => {
  const agentQuestions = [
    'Donne-moi la liste de mes agents.',
    'Quels sont mes agents ?',
    'Qui sont mes agents ?',
    'Affiche mes agents.',
    "Combien d'agents ai-je ?",
    'Quels agents travaillent pour moi ?',
    "Montre-moi mon équipe d'agents.",
    'Quels agents travaillent dans mon agence ?',
    "Montre-moi l'équipe des agents.",
  ];

  it.each(agentQuestions)('route « %s » → getTeamMembers({ role: AGENT })', (q) => {
    const tools = Object.create(AiToolsService.prototype) as AiToolsService;
    const intents = tools.resolveLocalToolIntents(q);
    const team = intents.find((i) => i.name === 'getTeamMembers');
    expect(team).toBeDefined();
    expect(team?.args).toEqual({ role: UserRole.AGENT });
  });

  it('ne route pas la création d’agent vers getTeamMembers', () => {
    const tools = Object.create(AiToolsService.prototype) as AiToolsService;
    const intents = tools.resolveLocalToolIntents('Comment créer un agent ?');
    expect(intents.some((i) => i.name === 'getTeamMembers')).toBe(false);
  });

  it('ne route pas l’assignation maintenance vers getTeamMembers', () => {
    const intent = resolveTeamMembersLocalIntent(
      'quels agents de maintenance sont disponibles pour affectation',
    );
    expect(intent).toBeNull();
  });

  it('route « mon équipe » sans filtre AGENT', () => {
    const intent = resolveTeamMembersLocalIntent('montre-moi mon equipe');
    expect(intent).toEqual({ name: 'getTeamMembers', args: {} });
  });
});

describe('formatToolResultForLocalReply — getTeamMembers', () => {
  it('liste les agents sans inventer', () => {
    const text = formatToolResultForLocalReply('getTeamMembers', {
      count: 2,
      filter: { role: 'AGENT' },
      items: [
        {
          id: 'id_a',
          fullName: 'Jean Dupont',
          roleLabel: 'Agent terrain (maintenance)',
          role: 'AGENT',
          isActive: true,
        },
        {
          id: 'id_b',
          fullName: 'Patrick X',
          roleLabel: 'Agent terrain (maintenance)',
          role: 'AGENT',
          isActive: true,
        },
      ],
    });
    expect(text).toContain('Jean Dupont');
    expect(text).toContain('Patrick X');
    expect(text).toContain('2 agents');
    expect(text).toMatch(/^Vous avez actuellement 2 agents/m);
    expect(text).not.toContain('(×');
  });

  it('cas vide agents', () => {
    const text = formatToolResultForLocalReply('getTeamMembers', {
      count: 0,
      filter: { role: 'AGENT' },
      items: [],
    });
    expect(text.toLowerCase()).toContain('aucun agent');
  });

  it('explique une erreur 403', () => {
    const text = formatToolResultForLocalReply('getTeamMembers', {
      error: 'Forbidden',
      code: 403,
    });
    expect(text.toLowerCase()).toContain('permission');
  });

  it('ne fusionne pas les homonymes et ajoute une réf. stable', () => {
    const text = formatToolResultForLocalReply('getTeamMembers', {
      count: 3,
      filter: { role: 'AGENT' },
      items: [
        {
          id: 'cmsaaaaaa0001thomas1',
          fullName: 'Thomas Shelby',
          roleLabel: 'Agent terrain (maintenance)',
          role: 'AGENT',
          isActive: true,
        },
        {
          id: 'cmsbbbbbb0002thomas2',
          fullName: 'Thomas Shelby',
          roleLabel: 'Agent terrain (maintenance)',
          role: 'AGENT',
          isActive: true,
          email: 't2@example.com',
        },
        {
          id: 'cmscccccc0003unique3',
          fullName: 'Ada Agent',
          roleLabel: 'Agent terrain (maintenance)',
          role: 'AGENT',
          isActive: true,
        },
      ],
    });
    expect(text).toContain('3 agents');
    expect(text.match(/Thomas Shelby/g)?.length).toBe(2);
    expect(text).toContain('t2@example.com');
    expect(text).toContain('réf. homas1');
    expect(text).not.toContain('(×');
    // Unique name: no disambiguator required
    expect(text).toMatch(/Ada Agent — Agent terrain \(maintenance\) — Actif$/m);
  });
});

describe('TeamMembersService scoping', () => {
  it('refuse un organizationId vide', async () => {
    const service = new TeamMembersService({} as never);
    await expect(service.listOrganizationMembers('')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('OWNER liste agents org A uniquement (filtre role + org)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'u1',
        email: 'a@x.com',
        firstName: 'Ada',
        lastName: 'Agent',
        phone: null,
        role: UserRole.AGENT,
        isActive: true,
        proAccessEnabled: true,
        organizationId: 'orgA',
        lastLoginAt: null,
        createdAt: new Date(),
        organization: { id: 'orgA', name: 'Org A' },
      },
    ]);
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany },
      maintenanceTicket: { groupBy },
    };
    const service = new TeamMembersService(prisma as never);
    const rows = await service.listOrganizationMembers('orgA', { role: 'AGENT' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'orgA',
          role: { in: [UserRole.AGENT, UserRole.TECHNICIAN] },
        }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe('Ada Agent');
    expect(rows[0].organizationId).toBe('orgA');
  });

  it('filtre search par nom', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany },
      maintenanceTicket: { groupBy: jest.fn() },
    };
    const service = new TeamMembersService(prisma as never);
    await service.listOrganizationMembers('orgA', { search: 'Jean' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'orgA',
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('filtre status=active', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany },
      maintenanceTicket: { groupBy: jest.fn() },
    };
    const service = new TeamMembersService(prisma as never);
    await service.listOrganizationMembers('orgA', { status: 'active' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'orgA',
          isActive: true,
        }),
      }),
    );
  });

  it('ignore un organizationId passé dans les filtres (pas de champ)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany },
      maintenanceTicket: { groupBy: jest.fn() },
    };
    const service = new TeamMembersService(prisma as never);
    // @ts-expect-error — prouve qu’un org malveillant dans filters n’est pas lu
    await service.listOrganizationMembers('orgA', { organizationId: 'orgB', role: 'AGENT' });
    expect(findMany.mock.calls[0][0].where.organizationId).toBe('orgA');
  });
});

describe('AiToolsService.execute getTeamMembers', () => {
  it('strip organizationId des args LLM et utilise celui du contexte', async () => {
    const listOrganizationMembers = jest.fn().mockResolvedValue([
      {
        id: 'u1',
        fullName: 'A B',
        firstName: 'A',
        lastName: 'B',
        email: null,
        phone: null,
        role: UserRole.AGENT,
        roleLabel: 'Agent terrain (maintenance)',
        isActive: true,
        openAssignedTickets: 0,
      },
    ]);
    const tools = new AiToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { listOrganizationMembers } as unknown as TeamMembersService,
      {} as never,
      {} as never,
    );

    const result = (await tools.execute('org-jwt', 'getTeamMembers', {
      role: 'AGENT',
      organizationId: 'org-evil',
      orgId: 'org-evil-2',
    })) as { organizationId: string; count: number };

    expect(listOrganizationMembers).toHaveBeenCalledWith('org-jwt', {
      role: 'AGENT',
      status: undefined,
      search: undefined,
    });
    expect(result.organizationId).toBe('org-jwt');
    expect(result.count).toBe(1);
  });

  it('mappe ForbiddenError en code 403', async () => {
    const tools = new AiToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        listOrganizationMembers: jest.fn().mockRejectedValue(new ForbiddenError('Organisation requise')),
      } as unknown as TeamMembersService,
      {} as never,
      {} as never,
    );
    const result = (await tools.execute('', 'getTeamMembers', { role: 'AGENT' })) as {
      error: string;
      code: number;
    };
    expect(result.code).toBe(403);
  });
});

describe('AiToolsService.resolveLocalToolIntents — régression tools existants', () => {
  const tools = Object.create(AiToolsService.prototype) as AiToolsService;

  it('détecte toujours les impayés', () => {
    expect(tools.resolveLocalToolIntents('Quels locataires n’ont pas encore payé ?').map((i) => i.name)).toContain(
      'getOutstandingPayments',
    );
  });

  it('détecte toujours le patrimoine', () => {
    expect(tools.resolveLocalToolIntents('Résumer mon patrimoine').map((i) => i.name)).toContain(
      'analyzePortfolio',
    );
  });

  it('détecte toujours les locataires', () => {
    expect(tools.resolveLocalToolIntents('Donne-moi la liste de mes locataires.').map((i) => i.name)).toContain(
      'getTenants',
    );
  });
});
