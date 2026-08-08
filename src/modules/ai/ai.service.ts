import { inject, injectable } from 'tsyringe';
import { LeaseStatus, UserRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { OpenAiClient, ChatMessage } from '../../infrastructure/openai/openai.client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AiContextService, type AiOrganizationContext } from './ai.context.service.js';
import {
  buildContextualSuggestions,
  buildLocalFallbackReply,
  resolveChatActions,
  type AiActionHint,
} from './ai.fallback.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { LeaseService } from '../leases/lease.service.js';
import { PlanLimitError } from '../../shared/errors/subscription.error.js';
import { ValidationError } from '../../shared/errors/app.error.js';
import type { AiAnalyzeDto, AiChatInput, AiContractInput } from './ai.types.js';

export interface AiChatResponse {
  reply: string;
  suggestions: string[];
  actions: AiActionHint[];
  poweredBy: 'openai' | 'local';
  contextUsed: boolean;
  /** Transcription ou texte normalisé le cas échéant */
  transcript?: string;
  documentUrl?: string;
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

const ASSISTANT_PROMPT = `Tu es le copilote immobilier ITC (ITC IMMO • TEC • CONSEIL).
Tu réponds en français, de façon courte, claire et premium (3 à 8 phrases max).
Tu t'appuies UNIQUEMENT sur le contexte JSON fourni — n'invente jamais de chiffres.
Monnaie : XAF. Si une info manque, dis-le franchement.
Tu peux aider à générer un vrai contrat PDF de location (bailleur, locataire, agent) via l'action dédiée — si l'utilisateur demande un contrat, oriente-le clairement.
Tu comprends aussi le français approximatif (fautes, dictée, abréviations).
Termine parfois par une suggestion d'action concrète (voir impayés, générer un contrat, etc.).`;

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
    @inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  getSuggestions(): string[] {
    return [
      'Résumer mon patrimoine',
      'Voir mes impayés',
      'Quels logements sont vacants ?',
      'Générer un contrat de location',
      'Quels sont les risques actuels ?',
      'Comment ajouter un locataire ?',
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

    // Intent contrat PDF
    if (this.isContractIntent(message)) {
      const contract = await this.generateContract(organizationId, userId, role, {
        leaseId: this.extractLeaseId(message),
      });
      return contract;
    }

    const ctx = await this.contextService.buildContext(organizationId);
    const contextJson = this.contextService.toPromptContext(ctx);
    const suggestions = buildContextualSuggestions(ctx);
    const actions = resolveChatActions(message);

    if (!this.openai.isAvailable()) {
      return {
        reply: buildLocalFallbackReply(message, ctx),
        suggestions,
        actions,
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    const history = (input.history ?? []).slice(-env.AI_MAX_HISTORY);
    const messages: ChatMessage[] = [
      { role: 'system', content: ASSISTANT_PROMPT },
      { role: 'system', content: `Contexte organisation (JSON):\n${contextJson}` },
      ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
      { role: 'user', content: message },
    ];

    try {
      const reply = await this.openai.chat(messages);
      return {
        reply,
        suggestions,
        actions,
        poweredBy: 'openai',
        contextUsed: true,
      };
    } catch {
      return {
        reply: buildLocalFallbackReply(message, ctx),
        suggestions,
        actions,
        poweredBy: 'local',
        contextUsed: true,
      };
    }
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
    if (!this.openai.isAvailable()) {
      throw new ValidationError('Transcription audio indisponible : OPENAI_API_KEY manquante');
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
      throw new ValidationError('Lecture d’image indisponible : OPENAI_API_KEY manquante');
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

  /** Génère un PDF de contrat pro (signatures bailleur / locataire / agent). */
  async generateContract(
    organizationId: string,
    userId: string,
    role: UserRole,
    input: AiContractInput,
  ): Promise<AiChatResponse> {
    await this.assertAiAccess(organizationId, userId, role);

    const agent = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, role: true },
    });
    const agentName = agent ? `${agent.firstName} ${agent.lastName}`.trim() : null;

    if (!input.leaseId) {
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
            'Aucun bail trouvé pour générer un contrat. Créez d’abord un contrat (locataire + logement), puis redemandez-moi de générer le PDF.',
          suggestions: ['Comment ajouter un locataire ?', 'Voir les contrats'],
          actions: [{ label: 'Créer / voir les contrats', route: '/leases' }],
          poweredBy: 'local',
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
          `Je peux générer un contrat PDF professionnel (bailleur, locataire${agentName ? ', agent' : ''}).\n` +
          `Indiquez le bail, par ex. « génère le contrat ${leases[0]!.id} », ou choisissez dans Contrats.\n\n${list}`,
        suggestions: leases.slice(0, 3).map((l) => `Génère le contrat ${l.id}`),
        actions: [
          { label: 'Ouvrir les contrats', route: '/leases' },
          ...leases.slice(0, 2).map((l) => ({
            label: `PDF · ${l.tenant.lastName}`,
            route: `/leases?generate=${l.id}`,
          })),
        ],
        poweredBy: 'local',
        contextUsed: true,
      };
    }

    try {
      const pdf = await this.leaseService.generateContractPdf(organizationId, input.leaseId, {
        agentName,
        agentRole: role === UserRole.OWNER ? 'Propriétaire / Bailleur' : 'Agent immobilier / Gestionnaire',
      });

      return {
        reply:
          `Contrat de location généré pour ${pdf.tenantName} (${pdf.apartmentLabel}).\n` +
          `Le PDF inclut les blocs de signature Bailleur, Locataire et Agent. Vérifiez les clauses avant signature.`,
        suggestions: ['Voir les impayés', 'Quels contrats arrivent à échéance ?'],
        actions: [
          { label: 'Ouvrir le PDF', url: pdf.url },
          { label: 'Voir les contrats', route: '/leases' },
        ],
        poweredBy: 'local',
        contextUsed: true,
        documentUrl: pdf.url,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Génération impossible';
      return {
        reply: `Impossible de générer le contrat : ${msg}`,
        suggestions: ['Voir les contrats', 'Générer un contrat de location'],
        actions: [{ label: 'Voir les contrats', route: '/leases' }],
        poweredBy: 'local',
        contextUsed: true,
      };
    }
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

  private isContractIntent(message: string): boolean {
    const q = message.toLowerCase();
    const wants =
      q.includes('contrat') ||
      q.includes('bail') ||
      q.includes('génér') ||
      q.includes('gener') ||
      q.includes('pdf');
    const verb =
      q.includes('génér') ||
      q.includes('gener') ||
      q.includes('crée') ||
      q.includes('cree') ||
      q.includes('établ') ||
      q.includes('etabl') ||
      q.includes('fais') ||
      q.includes('fait') ||
      q.includes('pdf');
    // "génère un contrat" / "contrat de location pdf" / "générer le contrat clxxxx"
    if ((q.includes('contrat') || q.includes('bail')) && verb) return true;
    if (q.includes('contrat de location') && (q.includes('génér') || q.includes('gener') || q.includes('pdf'))) {
      return true;
    }
    // Message qui n'est qu'une demande générique de génération de contrat
    if (wants && (q.includes('contrat de location') || /^g[ée]n[eè]re?\b/.test(q))) {
      return (q.includes('contrat') || q.includes('bail')) && verb;
    }
    return false;
  }

  private extractLeaseId(message: string): string | undefined {
    // cuid-like token
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

    await this.subscriptionService.assertUserProAccess(userId, organizationId, role);
  }

  private async assertLiaAccess(organizationId: string, userId: string, role: UserRole): Promise<void> {
    await this.subscriptionService.assertUserProAccess(userId, organizationId, role);
  }
}
