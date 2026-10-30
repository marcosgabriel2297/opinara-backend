import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';

import { HttpClientService } from '@shared/common/client';

import { TextGenerationAdapter, TextGenerationRequest, TextGenerationResult } from '../adapters';
import config from '../config';

/** Lo que se usa de la respuesta de `chat/completions` (formato de OpenAI, que Groq replica). */
interface ChatCompletionResponse {
  choices?: {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }[];
}

/**
 * Adaptador de Groq: traduce el pedido del dominio a `POST /chat/completions`.
 *
 * Los modelos `gpt-oss` razonan antes de responder: cuánto, lo dice `GROQ_REASONING_EFFORT`
 * (`medium` por defecto). El razonamiento no se pide de vuelta (`include_reasoning: false`): solo
 * interesa la respuesta final. Otros modelos de Groq no aceptan esos parámetros.
 */
@Injectable()
export class GroqTextGenerationService implements TextGenerationAdapter {
  readonly provider = 'groq';
  private readonly logger = new Logger(GroqTextGenerationService.name);

  constructor(private readonly http: HttpClientService) {}

  get available(): boolean {
    return config.Groq.ApiKey !== undefined;
  }

  async generate(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (config.Groq.ApiKey === undefined) return { status: 'empty', reason: 'sin GROQ_API_KEY' };

    const reasoning = config.Groq.Model.startsWith('openai/gpt-oss')
      ? { reasoning_effort: config.Groq.ReasoningEffort, include_reasoning: false }
      : {};

    let response: ChatCompletionResponse;
    try {
      response = await this.http.post<ChatCompletionResponse>({
        url: `${config.Groq.BaseUrl}/chat/completions`,
        headers: { Authorization: `Bearer ${config.Groq.ApiKey}` },
        body: {
          model: config.Groq.Model,
          max_completion_tokens: request.maxTokens,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          ...reasoning,
        },
        // El pedido lleva el texto de la reseña: no va al log.
        sensitive: true,
      });
    } catch (error) {
      // Solo el estado: el cuerpo del error puede repetir el pedido.
      const status = isAxiosError(error) ? (error.response?.status ?? 'sin respuesta') : 'error';
      this.logger.warn(`Groq respondio ${String(status)} (${config.Groq.Model})`);
      throw error;
    }

    const choice = response.choices?.[0];
    if (choice?.message?.refusal) return { status: 'empty', reason: 'el modelo declino el pedido' };

    const text = choice?.message?.content?.trim() ?? '';
    if (text === '') return { status: 'empty', reason: `sin texto (${choice?.finish_reason ?? 'sin motivo'})` };

    return { status: 'ok', text };
  }
}
