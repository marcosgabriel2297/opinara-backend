import { Module } from '@nestjs/common';

import { HttpClientModule } from '@shared/common/client';

import { TEXT_GENERATION_ADAPTER, TextGenerationAdapter } from './adapters';
import config, { TextGenerationProvider } from './config';
import { AnthropicTextGenerationService, GroqTextGenerationService } from './services';

/**
 * Elige el adaptador del modelo de lenguaje según `LLM_PROVIDER`. El dominio inyecta
 * `TEXT_GENERATION_ADAPTER`, nunca estas clases: cambiar de proveedor es configuración, y los
 * tests reemplazan el token por un doble que no toca la red.
 */
@Module({
  imports: [HttpClientModule],
  providers: [
    GroqTextGenerationService,
    AnthropicTextGenerationService,
    {
      provide: TEXT_GENERATION_ADAPTER,
      inject: [GroqTextGenerationService, AnthropicTextGenerationService],
      useFactory: (groq: GroqTextGenerationService, anthropic: AnthropicTextGenerationService) => {
        const adapters: Record<TextGenerationProvider, TextGenerationAdapter> = { groq, anthropic };
        return adapters[config.Provider];
      },
    },
  ],
  exports: [TEXT_GENERATION_ADAPTER],
})
export class TextGenerationIntegrationModule {}
