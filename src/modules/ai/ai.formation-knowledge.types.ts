/**
 * Schéma KnowledgeCard v1 — aligné AI_KB_PHASE1_1_CORPUS_READINESS.md
 */

export type FormationVerificationStatus =
  | 'unverified'
  | 'reviewed'
  | 'verified'
  | 'rejected'
  | 'retired';

export type FormationCorpusRole = 'draft_example_only' | 'candidate' | 'production_ready';

export type FormationFormula = {
  id: string;
  name: string;
  expression: string;
  expressionLatex: string | null;
  variables: Array<{ name: string; unit: string; definition: string }>;
  conditions: string[];
};

export type FormationExample = {
  label: string;
  text: string;
  inputs: Record<string, unknown> | null;
  expectedOutput: Record<string, unknown> | null;
  verifiable: boolean;
  note: string | null;
};

export type FormationCardSource = {
  type: string;
  url: string | null;
  videoId: string | null;
  chapter: string | null;
  timestampStart: string | null;
  timestampEnd: string | null;
  originDocuments: string[];
};

export type FormationKnowledgeCard = {
  id: string;
  schemaVersion: string;
  title: string;
  category: string;
  keywords: string[];
  content: string;
  method: { summary: string; steps: string[] };
  formulas: FormationFormula[];
  examples: FormationExample[];
  source: FormationCardSource;
  verificationStatus: FormationVerificationStatus;
  warnings: string[];
  limitations: string[];
  relatedCardIds: string[];
  corpusRole: FormationCorpusRole;
  retired: boolean;
};

export type FormationCorpusManifest = {
  corpusVersion: string;
  schemaVersion: string;
  generatedAt: string;
  sourceVideoUrl?: string;
  sourceVideoDurationClaimed?: string;
  auditRef?: string;
  note?: string;
  counts: {
    total: number;
    unverified: number;
    verified: number;
    retired: number;
  };
  cardIds: string[];
};

export type FormationCorpusFile = {
  manifest: FormationCorpusManifest;
  cards: FormationKnowledgeCard[];
};

export type FormationSearchHit = {
  cardId: string;
  title: string;
  category: string;
  score: number;
  verificationStatus: FormationVerificationStatus;
  timestampStart: string | null;
  timestampEnd: string | null;
  excerpt: string;
  formulas: string[];
  warnings: string[];
  sourceUrl: string | null;
};
