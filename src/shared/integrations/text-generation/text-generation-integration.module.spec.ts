import { Test } from '@nestjs/testing';

import type { TextGenerationAdapter } from './adapters';

/** Que adaptador queda detras de `TEXT_GENERATION_ADAPTER` con cada `LLM_PROVIDER`. */
async function resolve(provider: string | undefined): Promise<TextGenerationAdapter> {
  jest.resetModules();
  if (provider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = provider;

  const { TextGenerationIntegrationModule } = await import('./text-generation-integration.module');
  const { TEXT_GENERATION_ADAPTER } = await import('./adapters');
  const moduleRef = await Test.createTestingModule({ imports: [TextGenerationIntegrationModule] }).compile();
  return moduleRef.get<TextGenerationAdapter>(TEXT_GENERATION_ADAPTER);
}

describe('TextGenerationIntegrationModule', () => {
  afterAll(() => {
    delete process.env.LLM_PROVIDER;
    jest.resetModules();
  });

  it('por defecto usa Groq', async () => {
    expect((await resolve(undefined)).provider).toBe('groq');
  });

  it('cambiar de proveedor es cambiar LLM_PROVIDER', async () => {
    expect((await resolve('anthropic')).provider).toBe('anthropic');
    expect((await resolve('GROQ')).provider).toBe('groq');
  });

  it('un proveedor desconocido cae en Groq en vez de dejar la app sin arrancar', async () => {
    expect((await resolve('otro')).provider).toBe('groq');
  });
});
