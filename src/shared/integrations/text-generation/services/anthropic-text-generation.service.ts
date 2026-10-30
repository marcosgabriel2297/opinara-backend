import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';

import { TextGenerationAdapter, TextGenerationRequest, TextGenerationResult } from '../adapters';
import config from '../config';

/** Adaptador de Claude (Anthropic): traduce el pedido del dominio a la API de Messages. */
@Injectable()
export class AnthropicTextGenerationService implements TextGenerationAdapter {
  readonly provider = 'anthropic';
  private readonly client: Anthropic | null;

  constructor() {
    this.client = config.Anthropic.ApiKey ? new Anthropic({ apiKey: config.Anthropic.ApiKey }) : null;
  }

  get available(): boolean {
    return this.client !== null;
  }

  async generate(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (!this.client) return { status: 'empty', reason: 'sin ANTHROPIC_API_KEY' };

    const response = await this.client.beta.messages.create({
      model: config.Anthropic.Model,
      max_tokens: request.maxTokens,
      // Un texto corto no necesita pensar mucho: esfuerzo bajo, menos espera y menos costo.
      output_config: { effort: 'low' },
      // Si el modelo declina el pedido por seguridad, la API lo reintenta con el modelo que corresponda.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
    });

    if (response.stop_reason === 'refusal') {
      return { status: 'empty', reason: `declinado (${response.stop_details?.category ?? 'sin categoria'})` };
    }

    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();

    return text === '' ? { status: 'empty', reason: 'sin texto' } : { status: 'ok', text };
  }
}
