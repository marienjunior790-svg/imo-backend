import OpenAI from 'openai';
import { toFile } from 'openai';
import { injectable } from 'tsyringe';
import { env, isOpenAiConfigured } from '../../config/env.js';
import { ValidationError } from '../../shared/errors/app.error.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@injectable()
export class OpenAiClient {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!isOpenAiConfigured) {
      throw new ValidationError('Assistant IA non configuré (OPENAI_API_KEY manquante)');
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    return this.client;
  }

  async chat(messages: ChatMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new ValidationError('Réponse IA vide');
    return content.trim();
  }

  /** Transcription audio (Whisper) — français prioritaire. */
  async transcribe(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const client = this.getClient();
    const file = await toFile(buffer, fileName || 'audio.m4a', { type: mimeType || 'audio/m4a' });
    const result = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'fr',
      response_format: 'text',
    });
    const text = typeof result === 'string' ? result : String(result);
    if (!text.trim()) throw new ValidationError('Transcription audio vide');
    return text.trim();
  }

  /**
   * Lecture d’image (vision) : OCR + compréhension (texte manuscrit, typos, documents, photos).
   */
  async readImage(params: {
    imageBase64: string;
    mimeType: string;
    prompt: string;
    system?: string;
  }): Promise<string> {
    const client = this.getClient();
    const mime = params.mimeType || 'image/jpeg';
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content:
            params.system ??
            'Tu es Intelligence ITC, copilote immobilier. Tu lis les images (documents, photos, manuscrits, SMS flous). ' +
              'Tu corriges les fautes et les « faux mots » sans inventer de chiffres absents. Réponds en français, clair et pro.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: params.prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${params.imageBase64}` },
            },
          ],
        },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new ValidationError('Lecture d’image vide');
    return content.trim();
  }

  /** Corrige fautes, abréviations SMS et « faux mots » en français immobilier. */
  async normalizeImperfectText(text: string): Promise<string> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.1,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'Tu corriges le français approximatif (fautes, abréviations, dictée vocale, OCR). ' +
            'Conserve le sens exact. Ne rajoute aucune information. Réponds UNIQUEMENT par le texte corrigé, sans guillemets ni commentaire.',
        },
        { role: 'user', content: text },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return text.trim();
    return content.trim();
  }

  isAvailable(): boolean {
    return isOpenAiConfigured;
  }
}
