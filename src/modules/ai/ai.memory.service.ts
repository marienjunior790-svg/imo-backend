import { createHash } from 'crypto';
import { inject, injectable } from 'tsyringe';
import {
  AiMemoryKind,
  AiMemoryScope,
  AiMemorySource,
  type UserRole,
  type Prisma,
} from '@prisma/client';
import { env, isAiMemoryEnabled } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { ForbiddenError, ValidationError } from '../../shared/errors/app.error.js';
import { isOwner } from '../../shared/auth/roles.js';

const CONTENT_MAX = 2000;

export type AiSessionEntities = {
  lastTenantId?: string;
  lastTenantName?: string;
  lastBuildingId?: string;
  lastApartmentId?: string;
  lastLeaseId?: string;
  lastPaymentId?: string;
  lastIntent?: string;
  /** Derniers outils exécutés (pour « pourquoi » / « fais pareil »). */
  lastToolsUsed?: string[];
  lastUserMessage?: string;
  /** Digest court de la dernière réponse (contexte conversationnel). */
  lastReplyDigest?: string;
  /** Derniers tours user/assistant (continuité si le client envoie peu d’historique). */
  recentTurns?: Array<{ role: 'user' | 'assistant'; content: string }>;
  notes?: string;
};

export type RememberInput = {
  organizationId: string;
  userId: string;
  role: UserRole | string;
  scope: AiMemoryScope | 'USER' | 'ORGANIZATION';
  kind?: AiMemoryKind | string;
  key?: string;
  content: string;
};

export type RecallInput = {
  organizationId: string;
  userId: string;
  role: UserRole | string;
  query?: string;
  scope?: AiMemoryScope | 'USER' | 'ORGANIZATION';
  limit?: number;
};

export type ForgetInput = {
  organizationId: string;
  userId: string;
  role: UserRole | string;
  memoryId?: string;
  key?: string;
};

@injectable()
export class AiMemoryService {
  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return isAiMemoryEnabled;
  }

  defaultSessionKey(userId: string): string {
    return createHash('sha256').update(userId).digest('hex').slice(0, 32);
  }

  private sessionTtlMs(): number {
    const hours = Number(env.AI_SESSION_TTL_HOURS) || 24;
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  private assertEnabled(): void {
    if (!isAiMemoryEnabled) {
      throw new ValidationError('Mémoire IA désactivée');
    }
  }

  private parseScope(scope: string): AiMemoryScope {
    const s = String(scope).trim().toUpperCase();
    if (s === 'ORGANIZATION') return AiMemoryScope.ORGANIZATION;
    if (s === 'USER') return AiMemoryScope.USER;
    throw new ValidationError('scope invalide (USER | ORGANIZATION)');
  }

  private parseKind(kind?: string): AiMemoryKind {
    if (!kind) return AiMemoryKind.FACT;
    const k = String(kind).trim().toUpperCase();
    if ((Object.values(AiMemoryKind) as string[]).includes(k)) {
      return k as AiMemoryKind;
    }
    throw new ValidationError('kind mémoire invalide');
  }

  /** Normalise le contenu pour anti-doublon (casse / espaces). */
  private normalizeMemoryContent(content: string): string {
    return content
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private dedupeByContent<T extends { content: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
      const n = this.normalizeMemoryContent(item.content);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(item);
    }
    return out;
  }

  private canWriteOrgMemory(role: UserRole | string): boolean {
    // ORG_ADMIN → OWNER via normalizeRole / isOwner
    return isOwner(role);
  }

  async remember(input: RememberInput) {
    this.assertEnabled();
    const scope = this.parseScope(String(input.scope));
    const kind = this.parseKind(input.kind ? String(input.kind) : undefined);
    const content = String(input.content ?? '').trim();
    if (!content) throw new ValidationError('Contenu mémoire vide');
    if (content.length > CONTENT_MAX) {
      throw new ValidationError(`Contenu mémoire trop long (max ${CONTENT_MAX} caractères)`);
    }

    if (scope === AiMemoryScope.USER) {
      if (!input.userId) throw new ValidationError('userId requis pour une mémoire USER');
    } else if (!this.canWriteOrgMemory(input.role)) {
      throw new ForbiddenError('Seuls OWNER / ORG_ADMIN peuvent écrire une mémoire organisation');
    }

    const ownerUserId = scope === AiMemoryScope.USER ? input.userId : null;
    const key =
      typeof input.key === 'string' && input.key.trim() ? input.key.trim().slice(0, 120) : null;

    if (key) {
      const existing = await this.prisma.aiMemoryEntry.findFirst({
        where: {
          organizationId: input.organizationId,
          scope,
          userId: ownerUserId,
          key,
        },
      });
      if (existing) {
        return this.prisma.aiMemoryEntry.update({
          where: { id: existing.id },
          data: {
            content,
            kind,
            source: AiMemorySource.EXPLICIT,
            updatedById: input.userId,
          },
        });
      }
    } else {
      // Sans clé : ne pas stocker 5× le même fait (GATE-BLUE-42, couleur…).
      const recent = await this.prisma.aiMemoryEntry.findMany({
        where: {
          organizationId: input.organizationId,
          scope,
          userId: ownerUserId,
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      const norm = this.normalizeMemoryContent(content);
      const duplicate = recent.find((r) => this.normalizeMemoryContent(r.content) === norm);
      if (duplicate) {
        return this.prisma.aiMemoryEntry.update({
          where: { id: duplicate.id },
          data: {
            content,
            kind,
            source: AiMemorySource.EXPLICIT,
            updatedById: input.userId,
          },
        });
      }
    }

    return this.prisma.aiMemoryEntry.create({
      data: {
        organizationId: input.organizationId,
        userId: ownerUserId,
        scope,
        kind,
        key,
        content,
        source: AiMemorySource.EXPLICIT,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });
  }

  async recall(input: RecallInput) {
    this.assertEnabled();
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
    const now = new Date();
    const scopeFilter = input.scope ? this.parseScope(String(input.scope)) : undefined;

    const orClauses: Prisma.AiMemoryEntryWhereInput[] = [];
    if (!scopeFilter || scopeFilter === AiMemoryScope.USER) {
      orClauses.push({
        scope: AiMemoryScope.USER,
        userId: input.userId,
      });
    }
    if (!scopeFilter || scopeFilter === AiMemoryScope.ORGANIZATION) {
      orClauses.push({
        scope: AiMemoryScope.ORGANIZATION,
        userId: null,
      });
    }

    const rows = await this.prisma.aiMemoryEntry.findMany({
      where: {
        organizationId: input.organizationId,
        AND: [
          { OR: orClauses },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });

    // Jamais les mémoires USER d’un autre utilisateur (garanti par le filtre userId).
    const q = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
    const filtered = q
      ? rows.filter(
          (r) =>
            r.content.toLowerCase().includes(q) ||
            (r.key ? r.key.toLowerCase().includes(q) : false),
        )
      : rows;

    const mapped = filtered.map((r) => ({
      id: r.id,
      scope: r.scope,
      kind: r.kind,
      key: r.key,
      content: r.content,
      source: r.source,
      expiresAt: r.expiresAt,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));
    return this.dedupeByContent(mapped).slice(0, limit);
  }

  async forget(input: ForgetInput) {
    this.assertEnabled();
    if (!input.memoryId && !input.key) {
      throw new ValidationError('memoryId ou key requis pour oublier');
    }

    const now = new Date();
    let entry = null as Awaited<ReturnType<typeof this.prisma.aiMemoryEntry.findFirst>>;

    if (input.memoryId) {
      entry = await this.prisma.aiMemoryEntry.findFirst({
        where: { id: input.memoryId, organizationId: input.organizationId },
      });
    } else if (input.key) {
      // Préférer la mémoire USER de l’appelant, sinon ORG si autorisé
      entry = await this.prisma.aiMemoryEntry.findFirst({
        where: {
          organizationId: input.organizationId,
          key: input.key.trim(),
          OR: [
            { scope: AiMemoryScope.USER, userId: input.userId },
            { scope: AiMemoryScope.ORGANIZATION, userId: null },
          ],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!entry) {
      return { deleted: false, reason: 'not_found' as const };
    }

    if (entry.scope === AiMemoryScope.USER) {
      if (entry.userId !== input.userId) {
        throw new ForbiddenError('Vous ne pouvez pas supprimer la mémoire d’un autre utilisateur');
      }
    } else if (!this.canWriteOrgMemory(input.role)) {
      throw new ForbiddenError('Seuls OWNER / ORG_ADMIN peuvent supprimer une mémoire organisation');
    }

    await this.prisma.aiMemoryEntry.delete({ where: { id: entry.id } });
    return { deleted: true, id: entry.id, key: entry.key, scope: entry.scope };
  }

  async listForUser(organizationId: string, userId: string, role: UserRole | string) {
    if (!isAiMemoryEnabled) {
      return { enabled: false as const, items: [] as Awaited<ReturnType<AiMemoryService['recall']>> };
    }
    const items = await this.recall({ organizationId, userId, role, limit: 50 });
    return { enabled: true as const, items };
  }

  async touchSession(params: {
    organizationId: string;
    userId: string;
    sessionKey?: string;
    entities?: AiSessionEntities;
  }) {
    this.assertEnabled();
    const sessionKey = params.sessionKey?.trim() || this.defaultSessionKey(params.userId);
    const expiresAt = new Date(Date.now() + this.sessionTtlMs());
    const entitiesJson = (params.entities ?? undefined) as Prisma.InputJsonValue | undefined;

    return this.prisma.aiSessionContext.upsert({
      where: {
        organizationId_userId_sessionKey: {
          organizationId: params.organizationId,
          userId: params.userId,
          sessionKey,
        },
      },
      create: {
        organizationId: params.organizationId,
        userId: params.userId,
        sessionKey,
        entitiesJson: entitiesJson ?? undefined,
        expiresAt,
      },
      update: {
        expiresAt,
        ...(entitiesJson !== undefined ? { entitiesJson } : {}),
      },
    });
  }

  async getSession(params: {
    organizationId: string;
    userId: string;
    sessionKey?: string;
  }) {
    this.assertEnabled();
    const sessionKey = params.sessionKey?.trim() || this.defaultSessionKey(params.userId);
    const row = await this.prisma.aiSessionContext.findUnique({
      where: {
        organizationId_userId_sessionKey: {
          organizationId: params.organizationId,
          userId: params.userId,
          sessionKey,
        },
      },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return row;
  }

  async mergeEntities(params: {
    organizationId: string;
    userId: string;
    sessionKey?: string;
    entities: AiSessionEntities;
  }) {
    if (!isAiMemoryEnabled) return null;
    try {
      const sessionKey = params.sessionKey?.trim() || this.defaultSessionKey(params.userId);
      const existing = await this.getSession({
        organizationId: params.organizationId,
        userId: params.userId,
        sessionKey,
      });
      const prev = (existing?.entitiesJson as AiSessionEntities | null) ?? {};
      const merged: AiSessionEntities = { ...prev };
      for (const [k, v] of Object.entries(params.entities)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          (merged as Record<string, unknown>)[k] = v;
        }
      }
      return this.touchSession({
        organizationId: params.organizationId,
        userId: params.userId,
        sessionKey,
        entities: merged,
      });
    } catch {
      return null;
    }
  }

  /** Formate un rappel court pour injection système (sans secrets). Jamais afficher tel quel à l’utilisateur. */
  formatMemoriesForPrompt(
    memories: Array<{ scope: string; kind: string; key: string | null; content: string }>,
  ): string {
    const unique = this.dedupeByContent(memories);
    if (!unique.length) return '';
    const lines = unique.slice(0, 8).map((m) => {
      const tag = m.key ? `${m.scope}/${m.kind}:${m.key}` : `${m.scope}/${m.kind}`;
      return `- [${tag}] ${m.content.slice(0, 200)}`;
    });
    return (
      'Mémoire utilisateur — ne pas confondre avec données métier Prisma. ' +
      'Les faits métier (loyers, locataires, montants) viennent exclusivement des outils / DB.\n' +
      lines.join('\n')
    );
  }
}
