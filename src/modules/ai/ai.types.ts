export interface AiChatInput {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  normalizeText?: boolean;
}

export type AiAnalyzeDto = {
  analysisType: 'overview' | 'revenue' | 'occupancy' | 'delinquency';
};

export type AiContractInput = {
  leaseId?: string;
};
