import { inject, injectable } from 'tsyringe';
import { UserRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { OpenAiClient, ChatMessage } from '../../infrastructure/openai/openai.client.js';
import { AiContextService, type AiOrganizationContext } from './ai.context.service.js';
import {
  buildContextualSuggestions,
  buildLocalFallbackReply,
  resolveChatActions,
  type AiActionHint,
} from './ai.fallback.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { PlanLimitError } from '../../shared/errors/subscription.error.js';
import type { AiAnalyzeDto, AiChatInput } from './ai.types.js';

export interface AiChatResponse {
  reply: string;
  suggestions: string[];
  actions: AiActionHint[];
  poweredBy: 'openai' | 'local';
  contextUsed: boolean;
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
Pour les analyses chiffrées lourdes, oriente vers l'onglet Analyses LIA.
Termine parfois par une suggestion d'action concrète (voir impayés, relancer, etc.).`;

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
  ) {}

  getSuggestions(): string[] {
    return [
      'Résumer mon patrimoine',
      'Voir mes impayés',
      'Quels logements sont vacants ?',
      'Contrats à échéance',
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

    const ctx = await this.contextService.buildContext(organizationId);
    const contextJson = this.contextService.toPromptContext(ctx);
    const suggestions = buildContextualSuggestions(ctx);
    const actions = resolveChatActions(input.message);

    if (!this.openai.isAvailable()) {
      return {
        reply: buildLocalFallbackReply(input.message, ctx),
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
      { role: 'user', content: input.message },
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
        reply: buildLocalFallbackReply(input.message, ctx),
        suggestions,
        actions,
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

  /** Prévisions = estimations déterministes à partir des données org (pas de ML). */
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
