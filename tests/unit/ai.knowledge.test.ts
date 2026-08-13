import {
  ITC_KNOWLEDGE_PROMPT,
  resolveKnowledgeClarification,
} from '../../src/modules/ai/ai.knowledge.js';
import { resolveCapabilityRoute } from '../../src/modules/ai/ai.capability-router.js';

describe('ai.knowledge (Phase J2)', () => {
  it('expose un pack knowledge avec rôles et graphe', () => {
    expect(ITC_KNOWLEDGE_PROMPT).toMatch(/OWNER/);
    expect(ITC_KNOWLEDGE_PROMPT).toMatch(/MANAGER/);
    expect(ITC_KNOWLEDGE_PROMPT).toMatch(/Lease/);
    expect(ITC_KNOWLEDGE_PROMPT).toMatch(/Payment/);
    expect(ITC_KNOWLEDGE_PROMPT).toMatch(/ACTIVE ≠|bail ACTIVE/i);
  });

  it('clarifie OCR / clause PDF comme NOT_SUPPORTED', () => {
    const reply = resolveKnowledgeClarification(
      'Trouve la clause concernant le préavis dans ce contrat PDF',
    );
    expect(reply).toBeTruthy();
    expect(reply!).toMatch(/NOT_SUPPORTED|OCR|pas encore/i);
    expect(reply!).not.toMatch(/Voici ce que confirment/);
  });

  it('clarifie WhatsApp audio/image comme NOT_SUPPORTED', () => {
    const reply = resolveKnowledgeClarification('envoie un audio WhatsApp au locataire');
    expect(reply).toBeTruthy();
    expect(reply!).toMatch(/NOT_SUPPORTED|audio|texte/i);
  });

  it('explique bail actif vs impayé', () => {
    const reply = resolveKnowledgeClarification(
      'Pourquoi ce locataire est considéré comme en retard alors que son contrat est encore actif ?',
    );
    expect(reply).toBeTruthy();
    expect(reply!.toLowerCase()).toMatch(/actif|paiement|late|impay/);
    expect(reply!).not.toMatch(/Voici ce que confirment/);
  });

  it('refuse génération état des lieux PDF non supportée', () => {
    const reply = resolveKnowledgeClarification('génère le rapport d’inspection PDF');
    expect(reply).toBeTruthy();
    expect(reply!).toMatch(/pas encore|contrat PDF|reçu/i);
  });

  it('ne capture pas une question patrimoine normale', () => {
    expect(resolveKnowledgeClarification('mes impayés')).toBeNull();
    expect(resolveKnowledgeClarification('génère le contrat PDF de fortune')).toBeNull();
  });

  it('routeur bloque le dump pour une demande OCR', () => {
    const r = resolveCapabilityRoute('lis le PDF OCR de mon contrat');
    expect(r.blockPortfolioFallback).toBe(true);
    expect(r.clarification).toMatch(/NOT_SUPPORTED|OCR|photo/i);
  });
});
