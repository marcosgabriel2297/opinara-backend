import { AxiosError, AxiosHeaders } from 'axios';

import { HttpClientService } from '@shared/common/client';

import type { GroqTextGenerationService } from './groq-text-generation.service';

const REQUEST = { system: 'Sos un asistente.', prompt: '<reseña>Muy rico</reseña>', maxTokens: 500 };

/** La configuración se lee al importar: cada caso arma su entorno y carga el módulo de nuevo. */
async function build(env: Record<string, string | undefined>) {
  jest.resetModules();
  for (const key of ['GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_BASE_URL', 'GROQ_REASONING_EFFORT']) delete process.env[key];
  for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;

  const { GroqTextGenerationService: Service } = await import('./groq-text-generation.service');
  const http = { post: jest.fn() };
  const service: GroqTextGenerationService = new Service(http as unknown as HttpClientService);
  return { service, http };
}

const reply = (message: Record<string, unknown>, finishReason = 'stop') => ({
  choices: [{ message, finish_reason: finishReason }],
});

describe('GroqTextGenerationService', () => {
  afterAll(() => {
    jest.resetModules();
  });

  it('sin clave no esta disponible y no llama a la red', async () => {
    const { service, http } = await build({});

    expect(service.available).toBe(false);
    await expect(service.generate(REQUEST)).resolves.toEqual({ status: 'empty', reason: 'sin GROQ_API_KEY' });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('arma el pedido de chat/completions compatible con OpenAI, sin loguear la reseña', async () => {
    const { service, http } = await build({ GROQ_API_KEY: 'gsk_test' });
    http.post.mockResolvedValue(reply({ content: 'Gracias, Ana.' }));

    await service.generate(REQUEST);

    expect(http.post).toHaveBeenCalledWith({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { Authorization: 'Bearer gsk_test' },
      body: {
        model: 'openai/gpt-oss-120b',
        max_completion_tokens: 500,
        messages: [
          { role: 'system', content: 'Sos un asistente.' },
          { role: 'user', content: '<reseña>Muy rico</reseña>' },
        ],
        // gpt-oss razona (por defecto, medio) y no devuelve el razonamiento.
        reasoning_effort: 'medium',
        include_reasoning: false,
      },
      sensitive: true,
    });
  });

  it('el razonamiento se configura, y un valor invalido vuelve al predeterminado', async () => {
    const low = await build({ GROQ_API_KEY: 'gsk_test', GROQ_REASONING_EFFORT: 'LOW' });
    low.http.post.mockResolvedValue(reply({ content: 'Gracias.' }));
    await low.service.generate(REQUEST);
    expect(low.http.post.mock.calls[0][0].body.reasoning_effort).toBe('low');

    const invalid = await build({ GROQ_API_KEY: 'gsk_test', GROQ_REASONING_EFFORT: 'maximo' });
    invalid.http.post.mockResolvedValue(reply({ content: 'Gracias.' }));
    await invalid.service.generate(REQUEST);
    expect(invalid.http.post.mock.calls[0][0].body.reasoning_effort).toBe('medium');
  });

  it('con otro modelo no manda los parametros de razonamiento, que solo acepta gpt-oss', async () => {
    const { service, http } = await build({
      GROQ_API_KEY: 'gsk_test',
      GROQ_MODEL: 'llama-3.3-70b-versatile',
      GROQ_BASE_URL: 'http://localhost:11434/v1/',
    });
    http.post.mockResolvedValue(reply({ content: 'Gracias.' }));

    await service.generate(REQUEST);

    const sent = http.post.mock.calls[0][0];
    expect(sent.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(sent.body).toEqual(expect.not.objectContaining({ reasoning_effort: expect.anything() }));
    expect(sent.body.model).toBe('llama-3.3-70b-versatile');
  });

  it('devuelve el texto final, sin espacios de mas', async () => {
    const { service, http } = await build({ GROQ_API_KEY: 'gsk_test' });
    http.post.mockResolvedValue(reply({ content: '  Gracias, Ana. ¡Te esperamos!\n' }));

    await expect(service.generate(REQUEST)).resolves.toEqual({ status: 'ok', text: 'Gracias, Ana. ¡Te esperamos!' });
  });

  it('si el modelo declina o no devuelve texto, no hay sugerencia', async () => {
    const { service, http } = await build({ GROQ_API_KEY: 'gsk_test' });

    http.post.mockResolvedValueOnce(reply({ content: null, refusal: 'No puedo ayudar con eso.' }));
    await expect(service.generate(REQUEST)).resolves.toMatchObject({ status: 'empty' });

    // Se le acabaron los tokens razonando: no hay respuesta final.
    http.post.mockResolvedValueOnce(reply({ content: '' }, 'length'));
    await expect(service.generate(REQUEST)).resolves.toEqual({ status: 'empty', reason: 'sin texto (length)' });

    http.post.mockResolvedValueOnce({ choices: [] });
    await expect(service.generate(REQUEST)).resolves.toMatchObject({ status: 'empty' });
  });

  it('un error de Groq (cuota, caida) se propaga: lo traduce quien llama', async () => {
    const { service, http } = await build({ GROQ_API_KEY: 'gsk_test' });
    const tooMany = new AxiosError('Too Many Requests', '429', undefined, undefined, {
      status: 429,
      statusText: 'Too Many Requests',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    http.post.mockRejectedValue(tooMany);

    await expect(service.generate(REQUEST)).rejects.toBe(tooMany);
  });
});
