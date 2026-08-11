import { inject, injectable } from 'tsyringe';
import { LeaseStatus, UserRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { OpenAiClient, ChatMessage } from '../../infrastructure/openai/openai.client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AiContextService, type AiOrganizationContext } from './ai.context.service.js';
import {
  actionsFromTools,
  buildContextualSuggestions,
  buildLocalFallbackReply,
  isDailyPrioritiesMessage,
  resolveChatActions,
  type AiActionHint,
} from './ai.fallback.js';
import { APP_GUIDE_PROMPT, isAppHowtoIntent, resolveAppHowtoReply } from './ai.app-guide.js';
import {
  AiToolsService,
  OPENAI_TOOL_DEFINITIONS,
  formatToolResultForLocalReply,
} from './ai.tools.js';
import {
  cancelPendingAction,
  consumePendingAction,
  createPendingAction,
  type PendingActionPayload,
} from './ai.pending-actions.js';
import { listDocumentCapabilities } from './ai.documents.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { LeaseService } from '../leases/lease.service.js';
import { PaymentService } from '../payments/payment.service.js';
import { NotificationCenterService } from '../notification-center/notification-center.service.js';
import { PlanLimitError } from '../../shared/errors/subscription.error.js';
import { ValidationError } from '../../shared/errors/app.error.js';
import { decimalToNumber } from '../../shared/utils/response.util.js';
import type { AiAnalyzeDto, AiChatInput, AiContractInput } from './ai.types.js';

export interface AiPendingActionHint {
  id: string;
  type: string;
  title: string;
  summary: string;
  payload: PendingActionPayload;
}

export interface AiChatResponse {
  reply: string;
  suggestions: string[];
  actions: AiActionHint[];
  poweredBy: 'openai' | 'local';
  contextUsed: boolean;
  /** Transcription ou texte normalisé le cas échéant */
  transcript?: string;
  documentUrl?: string;
  pendingAction?: AiPendingActionHint;
  toolsUsed?: string[];
}

export interface AiStatusResponse {
  mode: 'openai' | 'local';
  provider: string;
  model: string | null;
  multimodal: { vision: boolean; stt: boolean; tts: boolean };
  documents: ReturnType<typeof listDocumentCapabilities>;
  message: string;
}

export interface AiAnalysisMetric {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface AiAnalysisResponse {
  title: string;
  summary: string;
  metrics: AiAnalysisMetric[];
  insights: string[];
  recommendations: string[];
  poweredBy: 'openai' | 'local';
}

export interface AiForecastResponse {
  kind: 'estimation';
  title: string;
  disclaimer: string;
  metrics: AiAnalysisMetric[];
  insights: string[];
  actions: AiActionHint[];
}

const ASSISTANT_PROMPT = `Tu es Intelligence ITC, copilote immobilier professionnel intégré à l’application ITC.

Tu es une couche intelligente AU-DESSUS de toute l’app : immeubles, logements, locataires, agents, contrats, loyers, paiements, impayés, occupation, maintenance, paramètres.

Règles ABSOLUES :
- Français clair et pro. Monnaie : XAF.
- N’invente JAMAIS de locataire, logement, montant, statut, fonctionnalité ou action.
- Pour toute donnée métier : appelle les outils (getUnits, getOutstandingPayments, getBuildings, getDashboardSummary, etc.).
- Si l’outil ne renvoie rien / pas d’accès : dis « Je n’ai pas accès à cette information dans vos données actuelles. »
- Ne réponds JAMAIS « je n’ai pas compris » / « demande non reconnue » si la question concerne le patrimoine : utilise un outil ou le contexte JSON.
- « mes logements », « combien de biens », « montre mon patrimoine » → getUnits (ou getDashboardSummary pour un résumé).
- Impayés / qui n’a pas payé / à relancer → getOutstandingPayments (PENDING+PARTIAL+LATE).
- Propose 2–4 actions concrètes (modules ITC) après une réponse data.
- Questions « comment faire » → guide UI réel (menus / boutons), jamais une procédure inventée.
- PDF contrat / reçu / avis : outils propose* puis confirmation utilisateur obligatoire.
- Création de bail (enregistrement) et envoi de message locataire : proposeCreateLease / proposeSendTenantMessage puis confirmation — ne jamais inventer d’IDs, montants ou destinataires ; ne jamais prétendre succès sans outil / confirmation.
- Agents : getTeamMembers(role=AGENT). N’invente jamais de noms.
- Respecte le périmètre organisation du JWT ; tu n’as pas d’autre org.

${APP_GUIDE_PROMPT}`;

const LIA_ANALYSIS_PROMPT = `Tu es LIA (Logiciel d'Intelligence Analytique) pour ITC.
Tu produis des analyses immobilières structurées en français.
Réponds UNIQUEMENT en JSON valide :
{
  "title": "Titre",
  "summary": "Résumé 2-3 phrases",
  "metrics": [{"label": "...", "value": "...", "trend": "up|down|neutral"}],
  "insights": ["..."],
  "recommendations": ["..."]
}
Base-toi STRICTEMENT sur le contexte JSON. N'invente aucune statistique. Monnaie : XAF.
Si les données sont insuffisantes, indique-le dans summary et insights.`;

@injectable()
export class AiService {
  constructor(
    @inject(OpenAiClient) private readonly openai: OpenAiClient,
    @inject(AiContextService) private readonly contextService: AiContextService,
    @inject(SubscriptionService) private readonly subscriptionService: SubscriptionService,
    @inject(LeaseService) private readonly leaseService: LeaseService,
    @inject(PaymentService) private readonly paymentService: PaymentService,
    @inject(NotificationCenterService) private readonly notificationCenter: NotificationCenterService,
    @inject(PrismaService) private readonly prisma: PrismaService,
    @inject(AiToolsService) private readonly tools: AiToolsService,
  ) {}

  getSuggestions(): string[] {
    return [
      'Comment marche l’application ?',
      'Comment ajouter un locataire ?',
      'Comment créer un agent ?',
      'Quels sont mes agents ?',
      'Résumer mon patrimoine',
      'Voir mes impayés',
      'Quels logements sont vacants ?',
      'Générer un contrat de location',
      'Comment utiliser Intelligence ITC ?',
    ];
  }

  getAnalysisTypes(): Array<{ key: string; label: string; description: string }> {
    return [
      { key: 'overview', label: 'Vue d\'ensemble', description: 'Situation globale du parc' },
      { key: 'revenue', label: 'Revenus', description: 'Encaissements et performance' },
      { key: 'occupancy', label: 'Occupation', description: 'Taux d\'occupation et vacance' },
      { key: 'delinquency', label: 'Impayés', description: 'Retards et risques' },
    ];
  }

  getStatus(): AiStatusResponse {
    const online = this.openai.isAvailable();
    return {
      mode: online ? 'openai' : 'local',
      provider: env.AI_PROVIDER,
      model: online ? env.AI_MODEL || env.OPENAI_MODEL : null,
      multimodal: {
        vision: online,
        stt: this.openai.isSttAvailable(),
        tts: this.openai.isTtsAvailable(),
      },
      documents: listDocumentCapabilities(),
      message: online
        ? 'Modèle multimodal via backend.'
        : 'Données ITC réelles via outils métier. Ajoutez OPENAI_API_KEY sur Railway pour GPT / voix / images / TTS.',
    };
  }

  async chat(
    organizationId: string,
    userId: string,
    role: UserRole,
    input: AiChatInput,
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);

    let message = input.message.trim();
    if (input.normalizeText && this.openai.isAvailable()) {
      try {
        message = await this.openai.normalizeImperfectText(message);
      } catch {
        /* garde le texte brut */
      }
    }

    // Documents PDF : proposition + confirmation obligatoire (jamais de PDF auto).
    if (this.isNoticeIntent(message)) {
      return this.proposePaymentNotice(organizationId, userId, role, this.extractCuid(message));
    }
    if (this.isReceiptIntent(message)) {
      return this.proposePaymentReceipt(organizationId, userId, role, this.extractCuid(message));
    }
    // PDF contrat uniquement — création de bail métier passe par les outils proposeCreateLease.
    if (this.isContractPdfIntent(message)) {
      return this.proposeLeasePdf(organizationId, userId, role, this.extractCuid(message));
    }

    // Mode d’emploi app — avant les outils données (sinon « comment locataire » part en liste CRM).
    if (isAppHowtoIntent(message)) {
      const howto = resolveAppHowtoReply(message);
      if (howto) {
        const ctxGuide = await this.contextService.buildContext(organizationId);
        return {
          reply: howto,
          suggestions: buildContextualSuggestions(ctxGuide),
          actions: resolveChatActions(message),
          poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
          contextUsed: true,
        };
      }
    }

    const ctx = await this.contextService.buildContext(organizationId);
    const suggestions = buildContextualSuggestions(ctx);
    const actions = resolveChatActions(message);

    // Priorités du jour → analyse locale sur données org (pas de dump générique OpenAI).
    if (isDailyPrioritiesMessage(message)) {
      return {
        reply: buildLocalFallbackReply(message, ctx),
        suggestions,
        actions: this.dedupeActions(actions),
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    // Intentions métier claires → outils locaux (données réelles, zéro hallucination).
    const hasLocalDataIntent = this.tools.resolveLocalToolIntents(message).length > 0;
    if (!this.openai.isAvailable() || hasLocalDataIntent) {
      return this.chatLocalWithTools(organizationId, userId, message, ctx, suggestions, actions);
    }

    try {
      return await this.chatWithOpenAiTools(organizationId, userId, message, input.history, ctx, suggestions, actions);
    } catch (err) {
      console.error('[ai.chat] OpenAI failed, falling back to local:', err instanceof Error ? err.message : err);
      return this.chatLocalWithTools(organizationId, userId, message, ctx, suggestions, actions);
    }
  }

  private async chatLocalWithTools(
    organizationId: string,
    userId: string,
    message: string,
    ctx: AiOrganizationContext,
    suggestions: string[],
    actions: AiActionHint[],
  ): Promise<AiChatResponse> {
    const intents = this.tools.resolveLocalToolIntents(message);
    // Si « comment / où » → guide app, pas dump d’outils
    if (isAppHowtoIntent(message)) {
      const howto = resolveAppHowtoReply(message);
      if (howto) {
        return {
          reply: howto,
          suggestions,
          actions: this.dedupeActions([...actions, ...resolveChatActions(message)]),
          poweredBy: 'local',
          contextUsed: true,
        };
      }
    }
    if (intents.length === 0) {
      return {
        reply: buildLocalFallbackReply(message, ctx),
        suggestions,
        actions,
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    const toolsUsed: string[] = [];
    const parts: string[] = [];
    let pendingAction: AiPendingActionHint | undefined;

    for (const intent of intents) {
      const name = intent.name;
      const result = await this.tools.execute(organizationId, name, intent.args ?? {});
      toolsUsed.push(name);
      parts.push(formatToolResultForLocalReply(name, result));

      if (name === 'proposeGenerateLeasePdf') {
        const leaseId = this.extractCuid(message);
        const proposed = await this.proposeLeasePdf(organizationId, userId, UserRole.OWNER, leaseId);
        if (proposed.pendingAction) pendingAction = proposed.pendingAction;
        if (proposed.actions.length) actions = [...actions, ...proposed.actions];
        parts[parts.length - 1] = proposed.reply;
      }
      if (name === 'proposeGeneratePaymentReceipt') {
        const paymentId = this.extractCuid(message);
        const proposed = await this.proposePaymentReceipt(organizationId, userId, UserRole.OWNER, paymentId);
        if (proposed.pendingAction) pendingAction = proposed.pendingAction;
        if (proposed.actions.length) actions = [...actions, ...proposed.actions];
        parts[parts.length - 1] = proposed.reply;
      }
      if (name === 'proposeGeneratePaymentNotice') {
        const paymentId = this.extractCuid(message);
        const proposed = await this.proposePaymentNotice(organizationId, userId, UserRole.OWNER, paymentId);
        if (proposed.pendingAction) pendingAction = proposed.pendingAction;
        if (proposed.actions.length) actions = [...actions, ...proposed.actions];
        parts[parts.length - 1] = proposed.reply;
      }
      if (name === 'proposeCreateLease') {
        const proposed = this.attachPendingCreateLease(organizationId, userId, result);
        if (proposed.pendingAction) pendingAction = proposed.pendingAction;
        if (proposed.reply) parts[parts.length - 1] = proposed.reply;
      }
      if (name === 'proposeSendTenantMessage') {
        const proposed = this.attachPendingSendTenantMessage(organizationId, userId, result);
        if (proposed.pendingAction) pendingAction = proposed.pendingAction;
        if (proposed.reply) parts[parts.length - 1] = proposed.reply;
      }
    }

    return {
      reply: parts.join('\n\n'),
      suggestions,
      actions: this.dedupeActions([...actions, ...resolveChatActions(message), ...actionsFromTools(toolsUsed)]),
      poweredBy: 'local',
      contextUsed: true,
      pendingAction,
      toolsUsed,
    };
  }

  private async chatWithOpenAiTools(
    organizationId: string,
    userId: string,
    message: string,
    history: AiChatInput['history'],
    ctx: AiOrganizationContext,
    suggestions: string[],
    actions: AiActionHint[],
  ): Promise<AiChatResponse> {
    const contextJson = this.contextService.toPromptContext(ctx);
    const messages: ChatMessage[] = [
      { role: 'system', content: ASSISTANT_PROMPT },
      { role: 'system', content: `Contexte organisation (JSON):\n${contextJson}` },
      ...(history ?? []).slice(-env.AI_MAX_HISTORY).map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
      { role: 'user', content: message },
    ];

    const toolsUsed: string[] = [];
    let pendingAction: AiPendingActionHint | undefined;
    const maxRounds = 4;

    for (let round = 0; round < maxRounds; round++) {
      const msg = await this.openai.chatWithTools(messages, OPENAI_TOOL_DEFINITIONS);
      const toolCalls = msg.tool_calls ?? [];

      if (!toolCalls.length) {
        return {
          reply: (msg.content ?? '').trim() || buildLocalFallbackReply(message, ctx),
          suggestions,
          actions: this.dedupeActions([
            ...actions,
            ...resolveChatActions(message),
            ...actionsFromTools(toolsUsed),
          ]),
          poweredBy: 'openai',
          contextUsed: true,
          pendingAction,
          toolsUsed,
        };
      }

      messages.push({
        role: 'assistant',
        content: msg.content,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        if (call.type !== 'function') continue;
        const name = call.function.name;
        const args = call.function.arguments;
        toolsUsed.push(name);
        const result = await this.tools.execute(organizationId, name, args);

        if (name === 'proposeGenerateLeasePdf') {
          let leaseId: string | undefined;
          try {
            const parsed = JSON.parse(args || '{}') as { leaseId?: string };
            leaseId = parsed.leaseId || this.extractCuid(message);
          } catch {
            leaseId = this.extractCuid(message);
          }
          const proposed = await this.proposeLeasePdf(organizationId, userId, UserRole.OWNER, leaseId);
          pendingAction = proposed.pendingAction;
          actions = [...actions, ...proposed.actions];
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({
              ...((typeof result === 'object' && result) || {}),
              pendingActionId: proposed.pendingAction?.id,
              note: 'PDF non généré — confirmation utilisateur obligatoire.',
            }),
          });
        } else if (name === 'proposeGeneratePaymentReceipt' || name === 'proposeGeneratePaymentNotice') {
          let paymentId: string | undefined;
          try {
            const parsed = JSON.parse(args || '{}') as { paymentId?: string };
            paymentId = parsed.paymentId || this.extractCuid(message);
          } catch {
            paymentId = this.extractCuid(message);
          }
          const proposed =
            name === 'proposeGeneratePaymentReceipt'
              ? await this.proposePaymentReceipt(organizationId, userId, UserRole.OWNER, paymentId)
              : await this.proposePaymentNotice(organizationId, userId, UserRole.OWNER, paymentId);
          pendingAction = proposed.pendingAction;
          actions = [...actions, ...proposed.actions];
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({
              ...((typeof result === 'object' && result) || {}),
              pendingActionId: proposed.pendingAction?.id,
              note: 'PDF non généré — confirmation utilisateur obligatoire.',
            }),
          });
        } else if (name === 'proposeCreateLease') {
          const proposed = this.attachPendingCreateLease(organizationId, userId, result);
          if (proposed.pendingAction) pendingAction = proposed.pendingAction;
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({
              ...((typeof result === 'object' && result) || {}),
              pendingActionId: proposed.pendingAction?.id,
              note: 'Bail non créé — confirmation utilisateur obligatoire.',
            }),
          });
        } else if (name === 'proposeSendTenantMessage') {
          const proposed = this.attachPendingSendTenantMessage(organizationId, userId, result);
          if (proposed.pendingAction) pendingAction = proposed.pendingAction;
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({
              ...((typeof result === 'object' && result) || {}),
              pendingActionId: proposed.pendingAction?.id,
              note: 'Message non envoyé — confirmation utilisateur obligatoire.',
            }),
          });
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
      }
    }

    return {
      reply: buildLocalFallbackReply(message, ctx),
      suggestions,
      actions: this.dedupeActions([
        ...actions,
        ...resolveChatActions(message),
        ...actionsFromTools(toolsUsed),
      ]),
      poweredBy: 'openai',
      contextUsed: true,
      pendingAction,
      toolsUsed,
    };
  }

  private dedupeActions(actions: AiActionHint[]): AiActionHint[] {
    const seen = new Set<string>();
    return actions.filter((a) => {
      const key = a.url ?? a.route ?? a.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }

  /** Audio → transcription → chat immobilier */
  async chatFromAudio(
    organizationId: string,
    userId: string,
    role: UserRole,
    file: Express.Multer.File,
    history?: AiChatInput['history'],
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);
    if (!this.openai.isSttAvailable()) {
      throw new ValidationError(
        'Transcription serveur indisponible. Sur l’app, le micro utilise la dictée appareil pour envoyer votre message vocal à l’IA.',
      );
    }

    const transcript = await this.openai.transcribe(
      file.buffer,
      file.originalname || 'audio.m4a',
      file.mimetype || 'audio/m4a',
    );

    const result = await this.chat(organizationId, userId, role, {
      message: transcript,
      history,
      normalizeText: true,
    });

    return { ...result, transcript };
  }

  /** Image → lecture (OCR / manuscrit / faux mots) → réponse copilote */
  async chatFromImage(
    organizationId: string,
    userId: string,
    role: UserRole,
    file: Express.Multer.File,
    userPrompt?: string,
    history?: AiChatInput['history'],
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);
    if (!this.openai.isAvailable()) {
      const ctxLocal = await this.contextService.buildContext(organizationId);
      return {
        reply:
          'Vision GPT indisponible sans OPENAI_API_KEY. ' +
          'Sur l’app mobile, le texte des documents est lu via OCR appareil puis analysé avec vos données ITC. ' +
          'Renvoyez l’image depuis l’app à jour, ou posez une question texte.',
        suggestions: buildContextualSuggestions(ctxLocal),
        actions: resolveChatActions(userPrompt || 'image'),
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    const ctx = await this.contextService.buildContext(organizationId);
    const contextJson = this.contextService.toPromptContext(ctx);
    const base64 = file.buffer.toString('base64');
    const prompt =
      (userPrompt?.trim() ||
        'Lis cette image (document, photo, manuscrit, SMS). Extrais le texte même approximatif, corrige les fautes, ' +
          'puis explique en 3–6 phrases ce qui est utile pour la gestion immobilière. Si c’est un contrat ou une pièce d’identité, résume les infos clés.') +
      `\n\nContexte org (JSON):\n${contextJson}`;

    const reading = await this.openai.readImage({
      imageBase64: base64,
      mimeType: file.mimetype || 'image/jpeg',
      prompt,
    });

    const suggestions = buildContextualSuggestions(ctx);
    const actions = resolveChatActions(userPrompt || reading);

    return {
      reply: reading,
      suggestions,
      actions,
      poweredBy: 'openai',
      contextUsed: true,
      transcript: reading.slice(0, 500),
    };
  }

  async normalizeText(
    organizationId: string,
    userId: string,
    role: UserRole,
    text: string,
  ): Promise<{ original: string; corrected: string; poweredBy: 'openai' | 'local' }> {
    await this.assertAiAccess(organizationId, userId, role);
    if (!this.openai.isAvailable()) {
      return { original: text, corrected: text.trim(), poweredBy: 'local' };
    }
    const corrected = await this.openai.normalizeImperfectText(text);
    return { original: text, corrected, poweredBy: 'openai' };
  }

  /**
   * Propose un contrat PDF — ne génère rien tant que l’utilisateur n’a pas confirmé.
   * @deprecated prefer proposeLeasePdf + confirmAction
   */
  async generateContract(
    organizationId: string,
    userId: string,
    role: UserRole,
    input: AiContractInput,
  ): Promise<AiChatResponse> {
    return this.proposeLeasePdf(organizationId, userId, role, input.leaseId);
  }

  async proposeLeasePdf(
    organizationId: string,
    userId: string,
    _role: UserRole,
    leaseId?: string,
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, _role);

    if (!leaseId) {
      const leases = await this.prisma.lease.findMany({
        where: {
          organizationId,
          status: { in: [LeaseStatus.DRAFT, LeaseStatus.ACTIVE, LeaseStatus.EXPIRED] },
        },
        take: 8,
        orderBy: { updatedAt: 'desc' },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          apartment: { select: { label: true } },
        },
      });

      if (leases.length === 0) {
        return {
          reply:
            'Aucun bail trouvé. Créez d’abord un contrat (locataire + logement), puis redemandez la génération PDF.',
          suggestions: ['Comment ajouter un locataire ?', 'Voir les contrats'],
          actions: [{ label: 'Créer / voir les contrats', route: '/leases' }],
          poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
          contextUsed: true,
        };
      }

      const list = leases
        .map(
          (l, i) =>
            `${i + 1}. ${l.tenant.firstName} ${l.tenant.lastName} — ${l.apartment.label} (${l.status}) · id \`${l.id}\``,
        )
        .join('\n');

      return {
        reply:
          `Voici les baux disponibles pour un contrat PDF professionnel.\n` +
          `Demandez « génère le contrat <id> » ou ouvrez Contrats.\n\n${list}\n\n` +
          `La génération PDF exigera votre confirmation explicite.`,
        suggestions: leases.slice(0, 3).map((l) => `Génère le contrat ${l.id}`),
        actions: [{ label: 'Ouvrir les contrats', route: '/leases' }],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
      };
    }

    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, organizationId },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        apartment: { select: { label: true } },
      },
    });

    if (!lease) {
      return {
        reply: 'Bail introuvable dans votre organisation.',
        suggestions: ['Voir les contrats'],
        actions: [{ label: 'Voir les contrats', route: '/leases' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`;
    const apartmentLabel = lease.apartment.label;
    const pending = createPendingAction({
      organizationId,
      userId,
      type: 'GENERATE_LEASE_PDF',
      payload: {
        leaseId: lease.id,
        tenantName,
        apartmentLabel,
        summary: `Contrat PDF pour ${tenantName} — ${apartmentLabel}`,
      },
    });

    return {
      reply:
        `Voici les informations du contrat proposé :\n` +
        `• Locataire : ${tenantName}\n` +
        `• Logement : ${apartmentLabel}\n` +
        `• Bail : ${lease.id}\n` +
        `• Statut : ${lease.status}\n\n` +
        `Confirmez pour générer le PDF professionnel (signatures bailleur / locataire / agent), ou annulez.`,
      suggestions: ['Voir les contrats', 'Résumer mon patrimoine'],
      actions: [{ label: 'Voir les contrats', route: '/leases' }],
      poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
      contextUsed: true,
      pendingAction: {
        id: pending.id,
        type: pending.type,
        title: 'Créer le contrat PDF',
        summary: pending.payload.summary ?? '',
        payload: pending.payload,
      },
    };
  }

  async proposePaymentReceipt(
    organizationId: string,
    userId: string,
    role: UserRole,
    paymentId?: string,
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);

    if (!paymentId) {
      const listed = await this.tools.execute(organizationId, 'proposeGeneratePaymentReceipt', {});
      const data = listed as { count?: number; items?: Array<{ id: string; tenantName: string; apartmentLabel: string; period: string }> };
      const items = data.items ?? [];
      if (!items.length) {
        return {
          reply:
            'Aucun paiement encaissé trouvé. Enregistrez d’abord un loyer payé, puis redemandez le reçu PDF.',
          suggestions: ['Voir les paiements', 'Voir mes impayés'],
          actions: [{ label: 'Ouvrir les paiements', route: '/payments' }],
          poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
          contextUsed: true,
        };
      }
      const list = items
        .slice(0, 8)
        .map((p, i) => `${i + 1}. ${p.tenantName} — ${p.apartmentLabel} (${p.period}) · id \`${p.id}\``)
        .join('\n');
      return {
        reply:
          `Voici les paiements éligibles à un reçu PDF.\n` +
          `Demandez « génère le reçu <id> ».\n\n${list}\n\n` +
          `La génération exigera votre confirmation.`,
        suggestions: items.slice(0, 3).map((p) => `Génère le reçu ${p.id}`),
        actions: [{ label: 'Ouvrir les paiements', route: '/payments' }],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
      };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: {
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            apartment: { select: { label: true } },
          },
        },
      },
    });

    if (!payment) {
      return {
        reply: 'Paiement introuvable dans votre organisation.',
        suggestions: ['Voir les paiements'],
        actions: [{ label: 'Voir les paiements', route: '/payments' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    if (payment.status !== 'PAID' && payment.status !== 'PARTIAL') {
      return {
        reply:
          `Ce paiement (${payment.status}) n’est pas encore encaissé. Enregistrez le paiement, ou générez plutôt un avis de paiement.`,
        suggestions: [`Génère un avis de paiement ${payment.id}`, 'Voir les paiements'],
        actions: [{ label: 'Voir les paiements', route: '/payments' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    const tenantName = `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`;
    const apartmentLabel = payment.lease.apartment.label;
    const periodLabel = `${payment.periodMonth}/${payment.periodYear}`;
    const pending = createPendingAction({
      organizationId,
      userId,
      type: 'GENERATE_PAYMENT_RECEIPT',
      payload: {
        paymentId: payment.id,
        tenantName,
        apartmentLabel,
        periodLabel,
        summary: `Reçu PDF — ${tenantName} · ${apartmentLabel} · ${periodLabel}`,
      },
    });

    return {
      reply:
        `Reçu proposé :\n` +
        `• Locataire : ${tenantName}\n` +
        `• Logement : ${apartmentLabel}\n` +
        `• Période : ${periodLabel}\n` +
        `• Statut : ${payment.status}\n\n` +
        `Confirmez pour générer la quittance PDF, ou annulez.`,
      suggestions: ['Voir les paiements', 'Générer un avis de paiement'],
      actions: [{ label: 'Voir les paiements', route: '/payments' }],
      poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
      contextUsed: true,
      pendingAction: {
        id: pending.id,
        type: pending.type,
        title: 'Créer le reçu PDF',
        summary: pending.payload.summary ?? '',
        payload: pending.payload,
      },
    };
  }

  async proposePaymentNotice(
    organizationId: string,
    userId: string,
    role: UserRole,
    paymentId?: string,
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);

    if (!paymentId) {
      const listed = await this.tools.execute(organizationId, 'proposeGeneratePaymentNotice', {});
      const data = listed as {
        count?: number;
        items?: Array<{ id: string; tenantName: string; apartmentLabel: string; period: string; amountDueXaf: number }>;
      };
      const items = data.items ?? [];
      if (!items.length) {
        return {
          reply: 'Aucun loyer en attente ou en retard pour un avis de paiement.',
          suggestions: ['Voir les paiements', 'Résumer mon patrimoine'],
          actions: [{ label: 'Ouvrir les paiements', route: '/payments' }],
          poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
          contextUsed: true,
        };
      }
      const list = items
        .slice(0, 8)
        .map(
          (p, i) =>
            `${i + 1}. ${p.tenantName} — ${p.apartmentLabel} (${p.period}) · ${Number(p.amountDueXaf).toLocaleString('fr-FR')} XAF · id \`${p.id}\``,
        )
        .join('\n');
      return {
        reply:
          `Voici les loyers pour lesquels un avis PDF est possible.\n` +
          `Demandez « génère l’avis <id> ».\n\n${list}\n\n` +
          `La génération exigera votre confirmation.`,
        suggestions: items.slice(0, 3).map((p) => `Génère l’avis ${p.id}`),
        actions: [{ label: 'Ouvrir les paiements', route: '/payments' }],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
      };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: {
        lease: {
          include: {
            tenant: { select: { firstName: true, lastName: true } },
            apartment: { select: { label: true } },
          },
        },
      },
    });

    if (!payment) {
      return {
        reply: 'Paiement introuvable dans votre organisation.',
        suggestions: ['Voir les paiements'],
        actions: [{ label: 'Voir les paiements', route: '/payments' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    if (payment.status === 'PAID') {
      return {
        reply: 'Ce loyer est déjà soldé. Demandez plutôt un reçu de paiement.',
        suggestions: [`Génère le reçu ${payment.id}`, 'Voir les paiements'],
        actions: [{ label: 'Voir les paiements', route: '/payments' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    const tenantName = `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`;
    const apartmentLabel = payment.lease.apartment.label;
    const periodLabel = `${payment.periodMonth}/${payment.periodYear}`;
    const pending = createPendingAction({
      organizationId,
      userId,
      type: 'GENERATE_PAYMENT_NOTICE',
      payload: {
        paymentId: payment.id,
        tenantName,
        apartmentLabel,
        periodLabel,
        summary: `Avis PDF — ${tenantName} · ${apartmentLabel} · ${periodLabel}`,
      },
    });

    return {
      reply:
        `Avis de paiement proposé :\n` +
        `• Locataire : ${tenantName}\n` +
        `• Logement : ${apartmentLabel}\n` +
        `• Période : ${periodLabel}\n` +
        `• Statut : ${payment.status}\n\n` +
        `Confirmez pour générer l’avis PDF, ou annulez.`,
      suggestions: ['Voir les impayés', 'Générer un reçu de paiement'],
      actions: [{ label: 'Voir les paiements', route: '/payments' }],
      poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
      contextUsed: true,
      pendingAction: {
        id: pending.id,
        type: pending.type,
        title: 'Créer l’avis PDF',
        summary: pending.payload.summary ?? '',
        payload: pending.payload,
      },
    };
  }

  async confirmAction(
    organizationId: string,
    userId: string,
    role: UserRole,
    actionId: string,
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);
    const action = consumePendingAction(actionId, organizationId, userId);

    if (action.type === 'GENERATE_LEASE_PDF') {
      if (!action.payload.leaseId) throw new ValidationError('leaseId manquant pour le contrat');
      return this.executeLeasePdf(organizationId, userId, role, action.payload.leaseId);
    }

    if (action.type === 'GENERATE_PAYMENT_RECEIPT') {
      if (!action.payload.paymentId) throw new ValidationError('paymentId manquant pour le reçu');
      return this.executePaymentReceipt(organizationId, action.payload.paymentId);
    }

    if (action.type === 'GENERATE_PAYMENT_NOTICE') {
      if (!action.payload.paymentId) throw new ValidationError('paymentId manquant pour l’avis');
      return this.executePaymentNotice(organizationId, action.payload.paymentId);
    }

    if (action.type === 'CREATE_LEASE') {
      return this.executeCreateLease(organizationId, userId, action.payload);
    }

    if (action.type === 'SEND_TENANT_MESSAGE') {
      return this.executeSendTenantMessage(organizationId, userId, action.payload);
    }

    throw new ValidationError('Type d’action non supporté');
  }

  private attachPendingCreateLease(
    organizationId: string,
    userId: string,
    result: unknown,
  ): { pendingAction?: AiPendingActionHint; reply?: string } {
    const data = result as {
      ready?: boolean;
      preview?: PendingActionPayload & {
        tenantName?: string;
        apartmentLabel?: string;
        monthlyRent?: number;
        activate?: boolean;
      };
      summary?: string;
    };
    if (!data?.ready || !data.preview?.tenantId || !data.preview?.apartmentId) {
      return { reply: formatToolResultForLocalReply('proposeCreateLease', result) };
    }
    const preview = data.preview;
    const pending = createPendingAction({
      organizationId,
      userId,
      type: 'CREATE_LEASE',
      payload: {
        tenantId: preview.tenantId,
        apartmentId: preview.apartmentId,
        startDate: preview.startDate,
        endDate: preview.endDate,
        monthlyRent: preview.monthlyRent,
        depositAmount: preview.depositAmount,
        terms: preview.terms,
        activate: preview.activate === true,
        tenantName: preview.tenantName,
        apartmentLabel: preview.apartmentLabel,
        summary:
          data.summary ??
          `Créer bail ${preview.tenantName ?? ''} — ${preview.apartmentLabel ?? ''}`.trim(),
      },
    });
    return {
      reply: formatToolResultForLocalReply('proposeCreateLease', result),
      pendingAction: {
        id: pending.id,
        type: pending.type,
        title: 'Créer le contrat',
        summary: pending.payload.summary ?? '',
        payload: pending.payload,
      },
    };
  }

  private attachPendingSendTenantMessage(
    organizationId: string,
    userId: string,
    result: unknown,
  ): { pendingAction?: AiPendingActionHint; reply?: string } {
    const data = result as {
      ready?: boolean;
      preview?: {
        recipientUserId?: string;
        tenantId?: string;
        tenantName?: string;
        subject?: string;
        body?: string;
      };
      summary?: string;
    };
    if (!data?.ready || !data.preview?.recipientUserId || !data.preview?.body) {
      return { reply: formatToolResultForLocalReply('proposeSendTenantMessage', result) };
    }
    const preview = data.preview;
    const pending = createPendingAction({
      organizationId,
      userId,
      type: 'SEND_TENANT_MESSAGE',
      payload: {
        recipientUserId: preview.recipientUserId,
        tenantId: preview.tenantId,
        tenantName: preview.tenantName,
        subject: preview.subject,
        body: preview.body,
        summary: data.summary ?? `Message à ${preview.tenantName ?? 'locataire'}`,
      },
    });
    return {
      reply: formatToolResultForLocalReply('proposeSendTenantMessage', result),
      pendingAction: {
        id: pending.id,
        type: pending.type,
        title: 'Envoyer le message',
        summary: pending.payload.summary ?? '',
        payload: pending.payload,
      },
    };
  }

  private async executeCreateLease(
    organizationId: string,
    userId: string,
    payload: PendingActionPayload,
  ): Promise<AiChatResponse> {
    if (!payload.tenantId || !payload.apartmentId || !payload.startDate || !payload.endDate) {
      throw new ValidationError('Données bail incomplètes (tenantId, apartmentId, dates)');
    }
    try {
      const lease = await this.leaseService.create(organizationId, {
        tenantId: payload.tenantId,
        apartmentId: payload.apartmentId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        monthlyRent: payload.monthlyRent,
        depositAmount: payload.depositAmount,
        terms: payload.terms,
      });

      let statusNote = `Statut : ${lease.status}`;
      if (payload.activate === true) {
        const activated = await this.leaseService.activate(organizationId, lease.id, userId);
        statusNote = `Statut : ${activated.status} (activé)`;
      }

      const tenantName =
        payload.tenantName ??
        `${lease.tenant.firstName} ${lease.tenant.lastName}`;
      const apartmentLabel = payload.apartmentLabel ?? lease.apartment.label;
      const rent = decimalToNumber(lease.monthlyRent);

      return {
        reply:
          `Contrat créé avec succès.\n` +
          `• ID : ${lease.id}\n` +
          `• Locataire : ${tenantName}\n` +
          `• Logement : ${apartmentLabel}\n` +
          `• Période : ${payload.startDate} → ${payload.endDate}\n` +
          `• Loyer : ${rent.toLocaleString('fr-FR')} XAF/mois\n` +
          `• ${statusNote}`,
        suggestions: ['Générer le contrat PDF', 'Voir les contrats'],
        actions: [
          { label: 'Voir le contrat', route: `/leases/${lease.id}` },
          { label: 'Voir les contrats', route: '/leases' },
        ],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Création impossible';
      return {
        reply: `Impossible de créer le contrat : ${msg}`,
        suggestions: ['Voir les contrats', 'Voir les logements'],
        actions: [{ label: 'Voir les contrats', route: '/leases' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }
  }

  private async executeSendTenantMessage(
    organizationId: string,
    userId: string,
    payload: PendingActionPayload,
  ): Promise<AiChatResponse> {
    if (!payload.recipientUserId || !payload.body) {
      throw new ValidationError('Destinataire ou corps du message manquant');
    }
    try {
      const message = await this.notificationCenter.sendMessage(organizationId, userId, {
        recipientId: payload.recipientUserId,
        subject: payload.subject,
        body: payload.body,
      });
      return {
        reply:
          `Message envoyé à ${payload.tenantName ?? 'le locataire'}.\n` +
          `• ID message : ${message.id}\n` +
          `• Objet : ${payload.subject ?? '(sans objet)'}`,
        suggestions: ['Voir les locataires', 'Voir les impayés'],
        actions: [
          { label: 'Messagerie', route: '/notifications' },
          { label: 'Voir les locataires', route: '/tenants' },
        ],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Envoi impossible';
      return {
        reply: `Impossible d’envoyer le message : ${msg}`,
        suggestions: ['Voir les locataires'],
        actions: [{ label: 'Voir les locataires', route: '/tenants' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }
  }

  private async executeLeasePdf(
    organizationId: string,
    userId: string,
    role: UserRole,
    leaseId: string,
  ): Promise<AiChatResponse> {
    const agent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const agentName = agent ? `${agent.firstName} ${agent.lastName}`.trim() : null;

    try {
      const pdf = await this.leaseService.generateContractPdf(organizationId, leaseId, {
        agentName,
        agentRole: role === UserRole.OWNER ? 'Propriétaire / Bailleur' : 'Agent immobilier / Gestionnaire',
      });

      return {
        reply:
          `Contrat de location généré pour ${pdf.tenantName} (${pdf.apartmentLabel}).\n` +
          `Le PDF inclut les blocs de signature. Vérifiez les clauses avant signature.`,
        suggestions: ['Voir les impayés', 'Générer un reçu de paiement'],
        actions: [
          { label: 'Ouvrir le PDF', url: pdf.url },
          { label: 'Voir les contrats', route: '/leases' },
        ],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
        documentUrl: pdf.url,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Génération impossible';
      return {
        reply: `Impossible de générer le contrat : ${msg}`,
        suggestions: ['Voir les contrats'],
        actions: [{ label: 'Voir les contrats', route: '/leases' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }
  }

  private async executePaymentReceipt(organizationId: string, paymentId: string): Promise<AiChatResponse> {
    try {
      const pdf = await this.paymentService.generateReceiptPdf(organizationId, paymentId);
      return {
        reply:
          `Reçu généré pour ${pdf.tenantName} (${pdf.apartmentLabel}) — période ${pdf.periodMonth}/${pdf.periodYear}.`,
        suggestions: ['Générer un avis de paiement', 'Voir les paiements'],
        actions: [
          { label: 'Ouvrir le reçu', url: pdf.url },
          { label: 'Voir les paiements', route: '/payments' },
        ],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
        documentUrl: pdf.url,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Génération impossible';
      return {
        reply: `Impossible de générer le reçu : ${msg}`,
        suggestions: ['Voir les paiements'],
        actions: [{ label: 'Voir les paiements', route: '/payments' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }
  }

  private async executePaymentNotice(organizationId: string, paymentId: string): Promise<AiChatResponse> {
    try {
      const pdf = await this.paymentService.generateNoticePdf(organizationId, paymentId);
      return {
        reply:
          `Avis de paiement généré pour ${pdf.tenantName} (${pdf.apartmentLabel}) — période ${pdf.periodMonth}/${pdf.periodYear}.`,
        suggestions: ['Voir les impayés', 'Générer un reçu de paiement'],
        actions: [
          { label: 'Ouvrir l’avis', url: pdf.url },
          { label: 'Voir les paiements', route: '/payments' },
        ],
        poweredBy: this.openai.isAvailable() ? 'openai' : 'local',
        contextUsed: true,
        documentUrl: pdf.url,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Génération impossible';
      return {
        reply: `Impossible de générer l’avis : ${msg}`,
        suggestions: ['Voir les paiements'],
        actions: [{ label: 'Voir les paiements', route: '/payments' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }
  }

  async cancelAction(organizationId: string, userId: string, role: UserRole, actionId: string) {
    await this.assertAiAccess(organizationId, userId, role);
    cancelPendingAction(actionId, organizationId, userId);
    return { cancelled: true, actionId };
  }

  async speak(
    organizationId: string,
    userId: string,
    role: UserRole,
    text: string,
  ): Promise<Buffer> {
    await this.assertAiAccess(organizationId, userId, role);
    if (!this.openai.isTtsAvailable()) {
      throw new ValidationError(
        'Lecture vocale indisponible en mode local. Ajoutez OPENAI_API_KEY (TTS) sur Railway.',
      );
    }
    return this.openai.speak(text);
  }

  async analyze(
    organizationId: string,
    userId: string,
    role: UserRole,
    input: AiAnalyzeDto,
  ): Promise<AiAnalysisResponse> {
    await this.assertLiaAccess(organizationId, userId, role);

    const ctx = await this.contextService.buildContext(organizationId);
    const contextJson = this.contextService.toPromptContext(ctx);
    const typeLabel = this.getAnalysisTypes().find((t) => t.key === input.analysisType)?.label ?? input.analysisType;

    if (!this.openai.isAvailable()) {
      return this.buildLocalAnalysis(ctx, input.analysisType, typeLabel);
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: LIA_ANALYSIS_PROMPT },
      { role: 'system', content: `Contexte organisation (JSON):\n${contextJson}` },
      {
        role: 'user',
        content: `Produis une analyse de type "${typeLabel}" (${input.analysisType}) pour cette organisation.`,
      },
    ];

    try {
      const raw = await this.openai.chat(messages);
      try {
        const parsed = JSON.parse(raw) as AiAnalysisResponse;
        return { ...parsed, poweredBy: 'openai' };
      } catch {
        return {
          title: typeLabel,
          summary: raw.slice(0, 500),
          metrics: [],
          insights: [raw],
          recommendations: [],
          poweredBy: 'openai',
        };
      }
    } catch {
      return this.buildLocalAnalysis(ctx, input.analysisType, typeLabel);
    }
  }

  async forecast(organizationId: string, userId: string, role: UserRole): Promise<AiForecastResponse> {
    await this.assertLiaAccess(organizationId, userId, role);
    const ctx = await this.contextService.buildContext(organizationId);
    const s = ctx.summary;

    const estimatedNextMonth =
      s.collectedThisMonthXaf > 0
        ? s.collectedThisMonthXaf
        : Math.round(s.potentialMonthlyRentXaf * (s.occupancyRate / 100));

    const insights: string[] = [
      `Loyers potentiels du parc : ${s.potentialMonthlyRentXaf.toLocaleString('fr-FR')} XAF / mois.`,
      `Encaissé ce mois : ${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF.`,
      `Estimation encaissement mois suivant (basée sur le mois courant ou l'occupation) : ${estimatedNextMonth.toLocaleString('fr-FR')} XAF.`,
    ];
    if (s.latePayments > 0) {
      insights.push(`${s.latePayments} impayé(s) peuvent réduire l'encaissement réel.`);
    }
    if (ctx.expiringLeases.length > 0) {
      insights.push(`${ctx.expiringLeases.length} contrat(s) arrivent à échéance sous 30 jours.`);
    }
    if (s.totalApartments === 0) {
      insights.length = 0;
      insights.push('Données insuffisantes : aucun bien enregistré. Ajoutez des immeubles et logements pour des estimations utiles.');
    }

    const actions: AiActionHint[] = [
      { label: 'Voir les paiements', route: '/payments' },
      { label: 'Voir les contrats', route: '/leases' },
    ];
    if (s.latePayments > 0) actions.unshift({ label: 'Voir les impayés', route: '/payments?tab=unpaid' });

    return {
      kind: 'estimation',
      title: 'Prévisions (estimations)',
      disclaimer:
        'Ces projections sont des estimations déterministes calculées à partir de vos données ITC actuelles. Ce n’est pas un modèle prédictif ML.',
      metrics: [
        { label: 'Occupation', value: `${s.occupancyRate} %`, trend: s.occupancyRate >= 80 ? 'up' : 'down' },
        { label: 'Potentiel mensuel', value: `${s.potentialMonthlyRentXaf.toLocaleString('fr-FR')} XAF`, trend: 'neutral' },
        { label: 'Encaissé (mois)', value: `${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF`, trend: 'neutral' },
        { label: 'Estim. mois+1', value: `${estimatedNextMonth.toLocaleString('fr-FR')} XAF`, trend: 'neutral' },
        { label: 'Impayés', value: `${s.latePayments}`, trend: s.latePayments > 0 ? 'down' : 'up' },
        { label: 'Échéances ≤30j', value: `${ctx.expiringLeases.length}`, trend: 'neutral' },
      ],
      insights,
      actions: actions.slice(0, 3),
    };
  }

  async contextualSuggestions(organizationId: string): Promise<string[]> {
    try {
      const ctx = await this.contextService.buildContext(organizationId);
      return buildContextualSuggestions(ctx);
    } catch {
      return this.getSuggestions();
    }
  }

  private isNoticeIntent(message: string): boolean {
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    const verb =
      q.includes('gener') ||
      q.includes('cree') ||
      q.includes('prepar') ||
      q.includes('fais') ||
      q.includes('pdf') ||
      q.includes('envoie');
    if (q.includes('avis de paiement') && verb) return true;
    if (q.includes('rappel de loyer') && verb) return true;
    if (q.includes('avis') && q.includes('loyer') && verb) return true;
    return false;
  }

  private isReceiptIntent(message: string): boolean {
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (this.isNoticeIntent(message)) return false;
    const verb =
      q.includes('gener') ||
      q.includes('cree') ||
      q.includes('prepar') ||
      q.includes('fais') ||
      q.includes('pdf');
    return (q.includes('recu') || q.includes('quittance')) && verb;
  }

  private isContractPdfIntent(message: string): boolean {
    if (this.isReceiptIntent(message) || this.isNoticeIntent(message)) return false;
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (!(q.includes('contrat') || q.includes('bail'))) return false;
    // Création métier (sans PDF) → outils proposeCreateLease, pas short-circuit PDF.
    const wantsCreateRecord =
      (q.includes('cree') || q.includes('creer') || q.includes('nouveau') || q.includes('ouvrir')) &&
      !q.includes('gener') &&
      (!q.includes('pdf') || q.includes('sans pdf') || q.includes('pas de pdf') || q.includes('sans le pdf'));
    if (wantsCreateRecord) return false;
    const verb =
      q.includes('gener') ||
      (q.includes('pdf') && !q.includes('sans pdf') && !q.includes('pas de pdf')) ||
      q.includes('prepar') ||
      q.includes('fais') ||
      q.includes('fait') ||
      q.includes('etabl');
    return verb;
  }

  private extractCuid(message: string): string | undefined {
    const m = message.match(/\b(c[a-z0-9]{20,})\b/i);
    return m?.[1];
  }

  private buildLocalAnalysis(
    ctx: AiOrganizationContext,
    analysisType: string,
    typeLabel: string,
  ): AiAnalysisResponse {
    const s = ctx.summary;
    const occupancyRate = s.occupancyRate;

    if (s.totalApartments === 0) {
      return {
        title: `Analyse LIA — ${typeLabel}`,
        summary: 'Données insuffisantes : aucun bien dans le parc. Ajoutez des immeubles et logements.',
        metrics: [],
        insights: ['Aucune statistique fiable ne peut être produite sans patrimoine renseigné.'],
        recommendations: ['Créer un immeuble', 'Ajouter des logements', 'Lier locataires et contrats'],
        poweredBy: 'local',
      };
    }

    const metrics: AiAnalysisMetric[] = [
      { label: 'Immeubles', value: `${s.totalBuildings}`, trend: 'neutral' },
      { label: 'Biens', value: `${s.totalApartments}`, trend: 'neutral' },
      { label: 'Occupation', value: `${occupancyRate}%`, trend: occupancyRate >= 80 ? 'up' : 'down' },
      { label: 'Encaissé ce mois', value: `${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF`, trend: 'up' },
      { label: 'Impayés', value: `${s.latePayments}`, trend: s.latePayments > 0 ? 'down' : 'up' },
      { label: 'Vacants', value: `${s.availableApartments}`, trend: 'neutral' },
    ];

    const insights: string[] = [];
    const recommendations: string[] = [];

    if (analysisType === 'revenue' || analysisType === 'overview') {
      insights.push(`Encaissements du mois : ${s.collectedThisMonthXaf.toLocaleString('fr-FR')} XAF`);
      insights.push(`Potentiel loyer mensuel : ${s.potentialMonthlyRentXaf.toLocaleString('fr-FR')} XAF`);
      if (s.latePayments > 0) recommendations.push('Relancer les locataires en retard');
    }
    if (analysisType === 'occupancy' || analysisType === 'overview') {
      insights.push(`Occupation : ${occupancyRate}% (${s.occupiedApartments}/${s.totalApartments})`);
      if (s.availableApartments > 0) {
        recommendations.push(`${s.availableApartments} bien(s) vacant(s) à commercialiser`);
      }
    }
    if (analysisType === 'delinquency' || analysisType === 'overview') {
      insights.push(`${s.latePayments} paiement(s) en retard, ${s.pendingPayments} en attente`);
      if (s.latePayments > 0) recommendations.push('Ouvrir le module Paiements → Impayés');
    }
    if (ctx.buildings.length > 0 && (analysisType === 'revenue' || analysisType === 'overview')) {
      const top = [...ctx.buildings].sort((a, b) => b.potentialRentXaf - a.potentialRentXaf)[0];
      if (top) insights.push(`Immeuble au plus fort potentiel : ${top.name} (${top.potentialRentXaf.toLocaleString('fr-FR')} XAF/mois)`);
    }

    return {
      title: `Analyse LIA — ${typeLabel}`,
      summary: `Situation de ${ctx.organization.name} : ${s.totalApartments} portes, ${occupancyRate}% d'occupation, ${s.latePayments} impayé(s).`,
      metrics,
      insights: insights.length ? insights : ['Données insuffisantes pour une analyse approfondie'],
      recommendations: recommendations.length
        ? recommendations
        : ['Complétez biens et locataires pour des analyses plus précises'],
      poweredBy: 'local',
    };
  }

  private async assertAiAccess(organizationId: string, userId: string, role: UserRole): Promise<void> {
    const subCtx = await this.subscriptionService.resolveAccessContext(organizationId);
    const { getPlanLimits } = await import('../../shared/constants/plan-limits.js');
    const limits = getPlanLimits(subCtx.plan);

    if (!limits.aiAssistant) {
      throw new PlanLimitError('Assistant ITC disponible à partir du plan Pro', 'aiAssistant');
    }

    // OWNER / ORG_ADMIN : OK. Les autres rôles staff : accès AI si le plan l’inclut
    // (ne bloque plus sur proAccessEnabled pour permettre les tests Starter).
    void userId;
    void role;
  }

  private async assertLiaAccess(organizationId: string, userId: string, role: UserRole): Promise<void> {
    // Même accessibilité que le chat IA (analyses locales disponibles sans plan Enterprise).
    await this.assertAiAccess(organizationId, userId, role);
  }
}
