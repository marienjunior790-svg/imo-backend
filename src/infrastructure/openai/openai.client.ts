import OpenAI from 'openai';
import { toFile } from 'openai';
import { injectable } from 'tsyringe';
import { env, isOpenAiConfigured } from '../../config/env.js';
import { ValidationError } from '../../shared/errors/app.error.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}

function resolveModel(): string {
  return env.AI_MODEL || env.OPENAI_MODEL;
}

@injectable()
export class OpenAiClient {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!isOpenAiConfigured || env.AI_PROVIDER === 'none') {
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
      model: resolveModel(),
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.4,
      max_tokens: options?.maxTokens ?? 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new ValidationError('Réponse IA vide');
    return content.trim();
  }

  /**
   * Une itération chat + tools. Le service boucle jusqu’à réponse texte.
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: resolveModel(),
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools,
      tool_choice: 'auto',
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1000,
    });
    const msg = response.choices[0]?.message;
    if (!msg) throw new ValidationError('Réponse IA vide');
    return msg;
  }

  /** Transcription audio (Whisper) — français prioritaire. */
  async transcribe(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    if (env.STT_PROVIDER === 'none') {
      throw new ValidationError('STT désactivé (STT_PROVIDER=none)');
    }
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

  /** TTS OpenAI → buffer mp3. */
  async speak(text: string, voice: 'alloy' | 'nova' | 'onyx' = 'nova'): Promise<Buffer> {
    if (env.TTS_PROVIDER === 'none') {
      throw new ValidationError('TTS désactivé (TTS_PROVIDER=none)');
    }
    const clipped = text.trim().slice(0, 3500);
    if (!clipped) throw new ValidationError('Texte TTS vide');
    try {
      const client = this.getClient();
      const response = await client.audio.speech.create({
        model: 'tts-1',
        voice,
        input: clipped,
        response_format: 'mp3',
      });
      const ab = await response.arrayBuffer();
      return Buffer.from(ab);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      const msg = err instanceof Error ? err.message : 'Erreur TTS OpenAI';
      throw new ValidationError(`Synthèse vocale impossible : ${msg}`);
    }
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
      model: resolveModel(),
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
      model: resolveModel(),
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
    return isOpenAiConfigured && env.AI_PROVIDER !== 'none';
  }

  isSttAvailable(): boolean {
    return this.isAvailable() && env.STT_PROVIDER !== 'none';
  }

  isTtsAvailable(): boolean {
    return this.isAvailable() && env.TTS_PROVIDER !== 'none';
  }
}
